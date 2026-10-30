// Einstiegspunkt: verbindet Parser, Partiebaum, Brett, Zugliste, Analyse und Import.

import { Chess } from 'chess.js';
import { parseGame, ParseError, setHeaders } from './notation.js';
import { Board } from './board.js';
import { MoveList } from './movelist.js';
import { EvalGraph } from './graph.js';
import { Analyzer } from './analysis.js';
import { loadOpenings } from './openings.js';
import { renderEvalBar, renderMoveInfo, renderSummary, openingFor } from './panels.js';
import { fetchGameFromLink } from './importer.js';
import { ENGINE, SOUNDS } from './config.js';
import { playSound, soundForNode, unlockAudio } from './sounds.js';
import { playerInfo, gameLine } from './gameinfo.js';

const $ = (id) => document.getElementById(id);

const EXAMPLE = `[Event "Paris, Oper"]
[Date "1858.??.??"]
[White "Paul Morphy"]
[Black "Herzog Karl / Graf Isouard"]
[Result "1-0"]

1. e4 e5 2. Sf3 d6 3. d4 Lg4 4. dxe5 Lxf3 5. Dxf3 dxe5 6. Lc4 Sf6 7. Db3 De7
8. Sc3 c6 9. Lg5 b5 10. Sxb5 cxb5 11. Lxb5+ Sbd7 12. 0-0-0 Td8 13. Txd7 Txd7
14. Td1 De6 15. Lxd7+ Sxd7 16. Db8+ Sxb8 17. Td8# 1-0`;

// Einstellungen im Browser merken (nur Bequemlichkeit, App läuft auch ohne)
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('schachanalyse.' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('schachanalyse.' + key, JSON.stringify(value));
    } catch {
      // ohne Speicher geht es auch
    }
  },
};

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

class App {
  constructor() {
    this.tree = null;
    this.headers = {};
    this.current = null;
    this.showArrow = store.get('arrow', true);
    this.volume = store.get('volume', SOUNDS.defaultVolume);
    this.muted = store.get('muted', false);
    this.depth = store.get('depth', ENGINE.defaultDepth);
    this.workers = store.get('workers', ENGINE.workers);
    this.engine = store.get('engine', ENGINE.defaultVariant);
    if (!ENGINE.variants[this.engine]) this.engine = ENGINE.defaultVariant;
    this.progress = { done: 0, total: 0, running: false };

    this.board = new Board({
      boardEl: $('board'),
      badgeEl: $('badge-layer'),
      promoEl: $('promo'),
      onMove: (mv) => this.playMove(mv),
    });
    if (store.get('orientation', 'white') === 'black') this.board.flip();

    this.moveList = new MoveList($('movelist'), {
      onSelect: (id) => this.goto(this.tree.get(id)),
      onDelete: (id) => this.deleteVariation(this.tree.get(id)),
    });
    this.moveList.style = store.get('notation', 'figurine');

    this.graph = new EvalGraph($('graph'), { onSelect: (node) => this.goto(node) });

    this.analyzer = new Analyzer({
      depth: this.depth,
      workers: this.workers,
      engineUrl: ENGINE.variants[this.engine].file,
      onUpdate: () => this.scheduleRender(),
      onProgress: (p) => this.showProgress(p),
    });

    this.bindControls();
    this.bindImport();
    this.bindSettings();
    this.updateArrowButton();
    this.updateSoundButton();
    this.render();
  }

  // ---------- Laden ----------

  loadText(text) {
    const { headers, tree } = parseGame(text);
    this.headers = headers;
    this.tree = tree;
    this.current = tree.root;
    const elo = (v) => (/^\d{2,4}$/.test(v ?? '') ? Number(v) : null);
    this.analyzer.setRatings({ w: elo(headers.WhiteElo), b: elo(headers.BlackElo) });
    this.analyzer.analyseTree(tree);
    this.render();
  }

  reanalyse() {
    if (!this.tree) return;
    this.analyzer.depth = this.depth;
    this.analyzer.analyseTree(this.tree, { force: true });
    this.render();
  }

  // ---------- Navigation ----------

  goto(node) {
    if (!node || node === this.current) return;
    this.current = node;
    this.playMoveSound(node);
    this.render();
  }

  prev() {
    if (this.current?.parent) this.goto(this.current.parent);
  }

  next() {
    if (this.current) this.goto(this.tree.next(this.current));
  }

  start() {
    if (this.tree) this.goto(this.tree.root);
  }

  end() {
    if (this.current) this.goto(this.tree.lineEnd(this.current));
  }

  // Aus einer Variante zurück an die Stelle der Hauptpartie, an der sie abzweigt
  backToMain() {
    let n = this.current;
    while (n && !n.main) n = n.parent;
    if (n) this.goto(n);
  }

  // ---------- Eigene Züge / Varianten ----------

  playMove(mv) {
    if (!mv || !this.current) return this.render();
    const chess = new Chess(this.current.fen);
    let move;
    try {
      move = chess.move(mv);
    } catch {
      return this.render();
    }
    // Eigene Züge sind immer Varianten; die Hauptpartie bleibt unverändert.
    const { node, created } = this.tree.addMove(this.current, move, chess.fen(), { main: false });
    this.current = node;
    this.playMoveSound(node);
    if (created) this.analyzer.analyseNode(node);
    this.render();
  }

  deleteVariation(node) {
    if (!node || node.main) return;
    // Liegt die aktuelle Stellung in der gelöschten Variante, springen wir davor.
    for (let n = this.current; n; n = n.parent) {
      if (n === node) {
        this.current = node.parent;
        break;
      }
    }
    this.tree.remove(node);
    this.render();
  }

  // ---------- Darstellung ----------

  // Engine-Ergebnisse kommen schnell hintereinander: höchstens einmal pro Frame zeichnen.
  // (setTimeout statt requestAnimationFrame, damit es auch im Hintergrund weiterläuft)
  scheduleRender() {
    if (this.renderTimer) return;
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null;
      this.render();
    }, 50);
  }

  render() {
    const node = this.current;
    if (!node) {
      this.moveList.render(null);
      return;
    }
    const best = node.analysis?.lines?.[0]?.pv?.[0] ?? null;
    this.board.show(node.fen, {
      lastMove: node.from ? [node.from, node.to] : null,
      arrow: this.showArrow ? best : null,
      badge: node.review ? { square: node.to, key: node.review.key } : null,
    });
    this.moveList.render(this.tree, node);
    renderEvalBar({ bar: $('evalbar'), fill: $('evalbar-fill'), text: $('evalbar-text') }, node.analysis?.score, this.board.orientation);
    renderMoveInfo($('move-info'), node, { style: this.moveList.style, analysing: this.progress.running });
    renderSummary($('summary'), this.tree, this.headers);
    this.graph.render(this.tree.mainline(), node);
    this.renderOpening(node);
    this.renderPlayers();
    $('nav-main').disabled = node.main;
  }

  renderOpening(node) {
    const op = openingFor(this.tree, node);
    $('opening').innerHTML = op
      ? `<span class="eco">${escapeHtml(op.eco)}</span>${escapeHtml(op.name)}`
      : escapeHtml(this.headers.Opening || 'Eröffnung unbekannt');
    $('game-line').textContent = gameLine(this.headers);
  }

  renderPlayers() {
    const name = (c) => {
      const p = playerInfo(this.headers, c);
      const title = p.title ? `<span class="ptitle">${escapeHtml(p.title)}</span>` : '';
      const rating = p.rating ? `<span class="rating" title="${escapeHtml(p.ratingLabel)}">${escapeHtml(p.rating)}</span>` : '';
      return `<span class="dot ${c === 'White' ? 'w' : 'b'}"></span>${title}<span class="pname">${escapeHtml(p.name)}</span>${rating}`;
    };
    const whiteBottom = this.board.orientation === 'white';
    $('player-bottom').innerHTML = name(whiteBottom ? 'White' : 'Black');
    $('player-top').innerHTML = name(whiteBottom ? 'Black' : 'White');
  }

  showProgress({ done, total, running, loading }) {
    this.progress = { done, total, running };
    $('progress').classList.toggle('hidden', !running);
    if (!running) return;
    $('progress-fill').style.width = `${total ? (done / total) * 100 : 0}%`;
    $('progress-text').textContent = loading
      ? (this.engine === 'full' ? 'Stockfish wird geladen (beim ersten Mal ca. 95 MB) …' : 'Stockfish wird geladen …')
      : `Analyse ${done}/${total} · Tiefe ${this.analyzer.depth}`;
  }

  updateArrowButton() {
    $('nav-arrow').classList.toggle('on', this.showArrow);
  }

  playMoveSound(node) {
    if (!this.muted) playSound(soundForNode(node), this.volume);
  }

  toggleSound() {
    this.muted = !this.muted;
    store.set('muted', this.muted);
    this.updateSoundButton();
  }

  updateSoundButton() {
    const btn = $('nav-sound');
    btn.classList.toggle('on', !this.muted);
    btn.innerHTML = this.muted ? '&#x1F507;' : '&#x1F50A;';
    btn.title = this.muted ? 'Ton einschalten (M)' : 'Ton ausschalten (M)';
  }

  // ---------- Bedienelemente ----------

  bindControls() {
    $('nav-start').onclick = () => this.start();
    $('nav-prev').onclick = () => this.prev();
    $('nav-next').onclick = () => this.next();
    $('nav-end').onclick = () => this.end();
    $('nav-main').onclick = () => this.backToMain();
    $('nav-flip').onclick = () => this.flip();
    $('nav-arrow').onclick = () => this.toggleArrow();
    $('nav-sound').onclick = () => this.toggleSound();
    // Ton darf der Browser erst nach einer Nutzeraktion abspielen
    for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, unlockAudio, { capture: true });

    document.addEventListener('keydown', (ev) => {
      if (ev.target.closest('input, textarea, select, dialog[open]')) return;
      const keys = {
        ArrowLeft: () => this.prev(),
        ArrowRight: () => this.next(),
        Home: () => this.start(),
        End: () => this.end(),
        ArrowUp: () => this.start(),
        ArrowDown: () => this.end(),
        f: () => this.flip(),
        b: () => this.toggleArrow(),
        m: () => this.toggleSound(),
      };
      const fn = keys[ev.key];
      if (fn && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        ev.preventDefault();
        fn();
      }
    });

    // Mausrad über dem Brett blättert durch die Züge
    $('board').addEventListener('wheel', (ev) => {
      if (!this.tree) return;
      ev.preventDefault();
      if (ev.deltaY > 0) this.next();
      else if (ev.deltaY < 0) this.prev();
    }, { passive: false });
  }

  flip() {
    this.board.flip();
    store.set('orientation', this.board.orientation);
    this.render();
  }

  toggleArrow() {
    this.showArrow = !this.showArrow;
    store.set('arrow', this.showArrow);
    this.updateArrowButton();
    this.render();
  }

  bindImport() {
    const dlg = $('dlg-import');
    const err = $('import-error');
    let tab = 'text';

    for (const btn of dlg.querySelectorAll('.tab')) {
      btn.onclick = () => {
        tab = btn.dataset.tab;
        for (const b of dlg.querySelectorAll('.tab')) b.classList.toggle('active', b === btn);
        for (const p of dlg.querySelectorAll('.tab-page')) p.classList.toggle('hidden', p.dataset.page !== tab);
        err.classList.add('hidden');
      };
    }

    $('btn-import').onclick = () => {
      err.classList.add('hidden');
      dlg.showModal();
    };
    $('import-cancel').onclick = () => dlg.close();
    $('btn-example').onclick = () => {
      $('pgn-input').value = EXAMPLE;
    };
    $('user-input').value = store.get('chesscomUser', '');

    $('import-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      err.classList.add('hidden');
      const okBtn = $('import-ok');
      okBtn.disabled = true;
      try {
        if (tab === 'text') {
          // Namen und Elo aus den Feldern landen als Kopfzeilen im Partietext,
          // damit sie auch beim nächsten Öffnen der App wieder da sind.
          const fields = { White: 'white-name', WhiteElo: 'white-elo', Black: 'black-name', BlackElo: 'black-elo' };
          const values = Object.fromEntries(Object.entries(fields).map(([k, id]) => [k, $(id).value.trim()]));
          for (const key of ['WhiteElo', 'BlackElo']) {
            if (values[key] && !/^\d{1,4}$/.test(values[key])) {
              throw new ParseError(`Elo für ${key === 'WhiteElo' ? 'Weiß' : 'Schwarz'} bitte als Zahl angeben (z. B. 1500).`);
            }
          }
          const text = setHeaders($('pgn-input').value, values);
          this.loadText(text);
          $('pgn-input').value = text;
          for (const id of Object.values(fields)) $(id).value = '';
        } else {
          okBtn.textContent = 'Lade …';
          const user = $('user-input').value.trim();
          const pgn = await fetchGameFromLink($('link-input').value, {
            user,
            onStatus: (msg) => { okBtn.textContent = msg; },
          });
          if (user) store.set('chesscomUser', user);
          $('pgn-input').value = pgn;
          this.loadText(pgn);
        }
        store.set('lastGame', $('pgn-input').value);
        dlg.close();
      } catch (e) {
        err.textContent = e instanceof ParseError || e.userFacing ? e.message : `Fehler: ${e.message}`;
        err.classList.remove('hidden');
      } finally {
        okBtn.disabled = false;
        okBtn.textContent = 'Laden und analysieren';
      }
    });
  }

  bindSettings() {
    const dlg = $('dlg-settings');
    const depth = $('set-depth');
    const workers = $('set-workers');
    const notation = $('set-notation');
    const volume = $('set-volume');
    const engine = $('set-engine');
    engine.innerHTML = Object.entries(ENGINE.variants)
      .map(([key, v]) => `<option value="${key}">${escapeHtml(v.label)}</option>`).join('');
    depth.min = ENGINE.minDepth;
    depth.max = ENGINE.maxDepth;
    workers.max = Math.max(1, navigator.hardwareConcurrency || 2);

    const sync = () => {
      $('set-depth-value').textContent = depth.value;
      $('set-workers-value').textContent = workers.value;
    };
    $('btn-settings').onclick = () => {
      depth.value = this.depth;
      workers.value = this.workers;
      notation.value = this.moveList.style;
      engine.value = this.engine;
      volume.value = Math.round(this.volume * 100);
      $('set-volume-value').textContent = `${volume.value} %`;
      sync();
      dlg.showModal();
    };
    depth.oninput = () => {
      sync();
      this.depth = Number(depth.value);
      store.set('depth', this.depth);
    };
    workers.oninput = () => {
      sync();
      this.workers = Number(workers.value);
      store.set('workers', this.workers);
      this.analyzer.setWorkers(this.workers);
    };
    volume.oninput = () => {
      this.volume = Number(volume.value) / 100;
      $('set-volume-value').textContent = `${volume.value} %`;
      store.set('volume', this.volume);
      if (this.muted && this.volume > 0) this.toggleSound();
      playSound('move', this.volume);
    };
    engine.onchange = () => {
      this.engine = engine.value;
      store.set('engine', this.engine);
      this.analyzer.setEngine(ENGINE.variants[this.engine].file);
      this.reanalyse();
    };
    notation.onchange = () => {
      this.moveList.style = notation.value;
      store.set('notation', notation.value);
      this.render();
    };
    $('btn-reanalyse').onclick = () => {
      dlg.close();
      this.reanalyse();
    };
  }
}

async function init() {
  try {
    await loadOpenings();
  } catch (e) {
    console.warn('Eröffnungsdatenbank fehlt – Theoriezüge werden nicht erkannt.', e);
  }
  const app = new App();
  window.app = app; // zum Ausprobieren in der Browser-Konsole

  // Zuletzt geladene Partie wiederherstellen, sonst Import-Dialog öffnen
  const last = store.get('lastGame', null);
  if (last) {
    $('pgn-input').value = last;
    try {
      app.loadText(last);
      return;
    } catch {
      // gespeicherte Partie unbrauchbar: Dialog zeigen
    }
  }
  $('dlg-import').showModal();
}

// Service Worker: macht die App installierbar (Taskleiste/Startmenü) und offline startbar
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service Worker nicht registriert', e));
  });
}

init();
