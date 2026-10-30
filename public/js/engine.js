// Stockfish (WASM) in Web Workern. Mehrere Instanzen arbeiten parallel eine
// Warteschlange von Stellungen ab, damit die Oberfläche nie blockiert.

// Eine UCI-Zeile "info ..." auswerten. Liefert null für unbrauchbare Zeilen.
export function parseInfo(line) {
  if (!line.startsWith('info ') || !line.includes(' pv ') || !line.includes(' score ')) return null;
  if (/ (lowerbound|upperbound) /.test(line)) return null;
  const tok = line.split(' ');
  const info = { depth: 0, multipv: 1, cp: null, mate: null, pv: [] };
  for (let i = 1; i < tok.length; i++) {
    switch (tok[i]) {
      case 'depth': info.depth = Number(tok[++i]); break;
      case 'multipv': info.multipv = Number(tok[++i]); break;
      case 'score': {
        const kind = tok[++i];
        const val = Number(tok[++i]);
        if (kind === 'cp') info.cp = val;
        else if (kind === 'mate') info.mate = val;
        break;
      }
      case 'pv': info.pv = tok.slice(i + 1); i = tok.length; break;
      default: break;
    }
  }
  return info;
}

class EngineWorker {
  constructor(url, hashMb, onReady) {
    this.worker = new Worker(url);
    this.isReady = false;
    this.listeners = new Set();
    this.worker.onmessage = (ev) => {
      const line = typeof ev.data === 'string' ? ev.data : String(ev.data);
      for (const fn of this.listeners) fn(line);
    };
    this.busy = false;
    this.ready = (async () => {
      this.send('uci');
      await this.waitFor((l) => l === 'uciok');
      this.send(`setoption name Hash value ${hashMb}`);
      this.send('isready');
      await this.waitFor((l) => l === 'readyok');
      this.isReady = true;
      onReady?.();
    })();
  }

  send(cmd) {
    this.worker.postMessage(cmd);
  }

  waitFor(test, onLine) {
    return new Promise((resolve) => {
      const fn = (line) => {
        onLine?.(line);
        if (test(line)) {
          this.listeners.delete(fn);
          resolve(line);
        }
      };
      this.listeners.add(fn);
    });
  }

  // Analysiert eine Stellung bis zur Tiefe depth mit multiPv Varianten.
  async analyse(fen, depth, multiPv) {
    await this.ready;
    const lines = new Map(); // multipv -> info (jeweils tiefste Zeile)
    let stopped = false;
    this.send(`setoption name MultiPV value ${multiPv}`);
    this.send(`position fen ${fen}`);
    this.send(`go depth ${depth}`);
    const last = await this.waitFor(
      (l) => l.startsWith('bestmove'),
      (l) => {
        const info = parseInfo(l);
        if (!info) return;
        const prev = lines.get(info.multipv);
        if (!prev || info.depth >= prev.depth) lines.set(info.multipv, info);
        // Kurzes erzwungenes Matt sicher gefunden: weiterrechnen bringt nichts mehr
        const top = lines.get(1);
        if (!stopped && top?.mate && Math.abs(top.mate) <= 3 && info.depth >= Math.min(depth, 10)
          && [...lines.values()].every((x) => x.depth >= top.depth)) {
          stopped = true;
          this.send('stop');
        }
      },
    );
    // Nur Varianten der höchsten erreichten Tiefe gelten gemeinsam
    const all = [...lines.values()];
    const maxDepth = Math.max(0, ...all.map((l) => l.depth));
    const result = all
      .filter((l) => l.depth >= maxDepth - 1)
      .sort((a, b) => a.multipv - b.multipv);
    return { depth: maxDepth, lines: result, bestmove: last.split(' ')[1] };
  }

  stop() {
    this.send('stop');
  }

  terminate() {
    this.worker.terminate();
  }
}

export class EnginePool {
  constructor({ url, size, hashMb, onReady }) {
    this.url = url;
    this.hashMb = hashMb;
    this.onReady = onReady;
    this.workers = [];
    this.queue = [];
    this.generation = 0;
    this.resize(size);
  }

  // Anzahl paralleler Engines ändern; beschäftigte Engines enden nach ihrem Auftrag.
  resize(size) {
    this.size = size;
    while (this.workers.length < size) this.workers.push(new EngineWorker(this.url, this.hashMb, this.onReady));
    while (this.workers.length > size) {
      const idx = this.workers.findIndex((w) => !w.busy);
      if (idx < 0) break;
      this.workers.splice(idx, 1)[0].terminate();
    }
    this.pump();
  }

  // Liefert ein Promise mit dem Analyseergebnis. Bei cancel() wird es mit
  // { cancelled: true } aufgelöst.
  analyse(fen, { depth, multiPv, priority = 0 }) {
    return new Promise((resolve) => {
      const job = { fen, depth, multiPv, priority, resolve, generation: this.generation };
      // Höhere Priorität kommt früher dran, sonst Reihenfolge des Eingangs
      const idx = this.queue.findIndex((j) => j.priority < priority);
      if (idx < 0) this.queue.push(job);
      else this.queue.splice(idx, 0, job);
      this.pump();
    });
  }

  pump() {
    for (const w of this.workers) {
      if (w.busy || !this.queue.length) continue;
      const job = this.queue.shift();
      w.busy = true;
      w.analyse(job.fen, job.depth, job.multiPv)
        .then((res) => {
          job.resolve(job.generation === this.generation ? res : { cancelled: true });
        })
        .catch((err) => job.resolve({ error: err }))
        .finally(() => {
          w.busy = false;
          if (this.workers.length > this.size) {
            this.workers.splice(this.workers.indexOf(w), 1);
            w.terminate();
          }
          this.pump();
        });
    }
  }

  // Bricht alle laufenden und wartenden Aufträge ab.
  cancelAll() {
    this.generation++;
    for (const job of this.queue) job.resolve({ cancelled: true });
    this.queue = [];
    for (const w of this.workers) if (w.busy) w.stop();
  }

  get pending() {
    return this.queue.length + this.workers.filter((w) => w.busy).length;
  }

  get readyCount() {
    return this.workers.filter((w) => w.isReady).length;
  }

  terminate() {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.queue = [];
  }
}
