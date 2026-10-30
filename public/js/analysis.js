// Steuert die Analyse eines Partiebaums: verteilt Stellungen an die Engines,
// speichert Ergebnisse an den Knoten und klassifiziert die Züge.

import { EnginePool } from './engine.js';
import { ENGINE } from './config.js';
import { terminalAnalysis, buildAnalysis, reviewMove, isBookMove } from './classify.js';
import { lookupOpening } from './openings.js';

export class Analyzer {
  constructor({ depth, workers, engineUrl, onUpdate, onProgress }) {
    this.depth = depth;
    this.workers = workers;
    this.onUpdate = onUpdate;
    this.onProgress = onProgress;
    this.total = 0;
    this.done = 0;
    this.pendingNodes = new Set();
    this.createPool(engineUrl);
  }

  createPool(url) {
    this.pool = new EnginePool({ url, size: this.workers, hashMb: ENGINE.hashMb, onReady: () => this.report() });
  }

  setWorkers(n) {
    this.workers = n;
    this.pool.resize(n);
  }

  // Andere Engine-Datei: alte Engines beenden, neue laden (Analyse startet der Aufrufer neu)
  setEngine(url) {
    this.cancel();
    this.pool.terminate();
    this.createPool(url);
  }

  // Ganze Partie analysieren: zuerst die Hauptpartie, dann Varianten.
  // force: vorhandene Ergebnisse verwerfen (z. B. nach Änderung der Tiefe).
  analyseTree(tree, { force = false } = {}) {
    this.pool.cancelAll();
    this.pendingNodes.clear();
    this.total = 0;
    this.done = 0;
    const main = tree.mainline();
    const rest = tree.all().filter((n) => !n.main);
    for (const node of [...main, ...rest]) {
      node.opening = lookupOpening(node.fen);
      if (force) {
        node.analysis = null;
        node.review = null;
      }
      if (!node.analysis) this.enqueue(node, 0);
    }
    for (const node of main) this.refresh(node);
    this.report();
  }

  // Neuer Knoten (eigener Zug): sofort und vorrangig analysieren
  analyseNode(node) {
    node.opening = lookupOpening(node.fen);
    if (!node.analysis && !this.pendingNodes.has(node)) this.enqueue(node, 10);
    this.report();
  }

  enqueue(node, priority) {
    this.total++;
    this.pendingNodes.add(node);
    const term = terminalAnalysis(node.fen);
    if (term) {
      // Matt oder Remis: keine Engine nötig
      queueMicrotask(() => this.finish(node, term));
      return;
    }
    const generation = this.pool.generation;
    this.pool.analyse(node.fen, { depth: this.depth, multiPv: ENGINE.multiPv, priority }).then((res) => {
      if (res.cancelled || generation !== this.pool.generation) return;
      if (res.error) {
        console.error('Engine-Fehler', res.error);
        this.finish(node, null);
        return;
      }
      this.finish(node, buildAnalysis(node.fen, res));
    });
  }

  finish(node, analysis) {
    if (!this.pendingNodes.delete(node)) return;
    this.done++;
    if (analysis) {
      node.analysis = analysis;
      this.refresh(node);
    }
    this.report();
    this.onUpdate?.(node);
  }

  // Klassifizierung für node und die davon abhängigen Folgezüge neu berechnen:
  // node braucht die Vorstellung, Kinder brauchen node, "Verpasster Gewinn"
  // der Enkel braucht die Klassifizierung der Kinder.
  refresh(node) {
    this.review(node);
    for (const c of node.children) {
      this.review(c);
      for (const g of c.children) this.review(g);
    }
  }

  // Wertungen der Spieler (wie bei Chess.com hängt die Einordnung davon ab)
  setRatings(ratings) {
    this.ratings = ratings;
  }

  review(node) {
    if (!node.parent || !node.analysis || !node.parent.analysis) return;
    node.review = reviewMove(node, {
      book: isBookMove(node, lookupOpening),
      rating: this.ratings?.[node.color] ?? null,
    });
  }

  report() {
    const running = this.done < this.total;
    // Solange noch keine Engine geladen ist (die volle lädt beim ersten Mal ~95 MB)
    const loading = running && this.pool.readyCount === 0;
    this.onProgress?.({ done: this.done, total: this.total, running, loading });
  }

  cancel() {
    this.pool.cancelAll();
    this.pendingNodes.clear();
    this.total = this.done = 0;
    this.report();
  }
}
