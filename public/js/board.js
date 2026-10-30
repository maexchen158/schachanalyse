// Brett-Darstellung mit chessground: Stellung, Zugeingabe (Ziehen oder Klicken),
// Umwandlungsauswahl, Pfeil für den besten Zug und Kategorie-Symbol am Zielfeld.

import { Chessground } from 'chessground';
import { Chess } from 'chess.js';
import { badgeHtml } from './categories.js';
import { ArrowLayer, ARROW_COLORS } from './arrows.js';

const PROMO_PIECES = [['q', 'queen'], ['n', 'knight'], ['r', 'rook'], ['b', 'bishop']];

export class Board {
  constructor({ boardEl, badgeEl, promoEl, onMove }) {
    this.badgeEl = badgeEl;
    this.promoEl = promoEl;
    this.onMove = onMove;
    this.orientation = 'white';
    this.fen = null;
    this.engineArrow = null;
    this.cg = Chessground(boardEl, {
      coordinates: true,
      animation: { enabled: true, duration: 180 },
      highlight: { lastMove: true, check: true },
      movable: { free: false, showDests: true, events: { after: (orig, dest) => this.handleMove(orig, dest) } },
      premovable: { enabled: false },
      draggable: { showGhost: true },
      // chessground merkt sich die Rechtsklick-Pfeile, gezeichnet werden sie von ArrowLayer
      drawable: { enabled: true, visible: true, onChange: () => this.renderArrows() },
    });
    // Eigene Pfeil-Ebene neben dem Brett (nicht in chessgrounds DOM, das neu aufgebaut werden kann)
    this.arrows = new ArrowLayer(boardEl.parentElement, (sq) => this.squareXY(sq));
    // Während mit der rechten Maustaste gezogen wird, die Vorschau mitzeichnen
    boardEl.addEventListener('mousedown', (ev) => {
      if (ev.button === 2) this.followDrawing();
    });
    boardEl.addEventListener('touchstart', () => this.followDrawing(), { passive: true });
  }

  followDrawing() {
    const tick = () => {
      this.renderArrows();
      if (this.cg.state.drawable.current) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  renderArrows() {
    const shapes = [];
    if (this.engineArrow) shapes.push({ ...this.engineArrow, color: ARROW_COLORS.engine });
    const d = this.cg.state.drawable;
    for (const s of d.shapes) shapes.push({ orig: s.orig, dest: s.dest, color: ARROW_COLORS[s.brush] ?? ARROW_COLORS.green });
    const cur = d.current;
    if (cur?.mouseSq) shapes.push({ orig: cur.orig, dest: cur.dest, color: ARROW_COLORS[cur.brush] ?? ARROW_COLORS.green });
    this.arrows.render(shapes);
  }

  // Stellung anzeigen. opts: { lastMove: [from, to], arrow: uci|null, badge: {square, key}|null }
  show(fen, { lastMove = null, arrow = null, badge = null } = {}) {
    // Eigene Pfeile gelten nur für die Stellung, in der sie gezeichnet wurden
    if (fen !== this.fen) this.cg.setShapes([]);
    this.fen = fen;
    this.hidePromotion();
    const chess = new Chess(fen);
    const turn = chess.turn() === 'w' ? 'white' : 'black';
    const dests = new Map();
    for (const m of chess.moves({ verbose: true })) {
      if (!dests.has(m.from)) dests.set(m.from, []);
      if (!dests.get(m.from).includes(m.to)) dests.get(m.from).push(m.to);
    }
    this.cg.set({
      fen,
      orientation: this.orientation,
      turnColor: turn,
      lastMove: lastMove ?? undefined,
      check: chess.inCheck() ? turn : false,
      movable: { color: turn, dests },
    });
    if (!lastMove) this.cg.set({ lastMove: undefined });
    this.setArrow(arrow);
    this.setBadge(badge);
  }

  setArrow(uci) {
    this.engineArrow = uci && uci.length >= 4 ? { orig: uci.slice(0, 2), dest: uci.slice(2, 4) } : null;
    this.renderArrows();
  }

  setBadge(badge) {
    this.badge = badge;
    this.badgeEl.innerHTML = '';
    if (!badge?.square || !badge.key) return;
    const { x, y } = this.squareXY(badge.square);
    const el = document.createElement('div');
    el.className = 'board-badge';
    el.style.left = `${(x + 1) * 12.5}%`;
    el.style.top = `${y * 12.5}%`;
    el.innerHTML = badgeHtml(badge.key);
    this.badgeEl.appendChild(el);
  }

  // Bildschirmposition (0–7) eines Feldes je nach Brettausrichtung
  squareXY(square) {
    const file = square.charCodeAt(0) - 97;
    const rank = Number(square[1]) - 1;
    return this.orientation === 'white' ? { x: file, y: 7 - rank } : { x: 7 - file, y: rank };
  }

  flip() {
    this.orientation = this.orientation === 'white' ? 'black' : 'white';
    this.cg.set({ orientation: this.orientation });
    this.setBadge(this.badge);
    this.renderArrows();
    if (!this.promoEl.classList.contains('hidden')) this.hidePromotion();
  }

  handleMove(orig, dest) {
    const chess = new Chess(this.fen);
    const piece = chess.get(orig);
    const isPromotion = piece?.type === 'p' && (dest[1] === '8' || dest[1] === '1');
    if (isPromotion) this.askPromotion(orig, dest, piece.color);
    else this.onMove({ from: orig, to: dest });
  }

  askPromotion(from, to, color) {
    const { x, y } = this.squareXY(to);
    const colorName = color === 'w' ? 'white' : 'black';
    const down = y === 0; // Auswahl wächst vom Zielfeld ins Brett hinein
    this.promoEl.innerHTML = '';
    this.promoEl.style.left = `${x * 12.5}%`;
    this.promoEl.style.top = down ? '0' : 'auto';
    this.promoEl.style.bottom = down ? 'auto' : '0';
    this.promoEl.style.flexDirection = down ? 'column' : 'column-reverse';
    for (const [letter, role] of PROMO_PIECES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'promo-choice cg-wrap';
      btn.innerHTML = `<piece class="${role} ${colorName}"></piece>`;
      btn.addEventListener('click', () => {
        this.hidePromotion();
        this.onMove({ from, to, promotion: letter });
      });
      this.promoEl.appendChild(btn);
    }
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'promo-cancel';
    cancel.textContent = '✕';
    cancel.title = 'Abbrechen';
    cancel.addEventListener('click', () => {
      this.hidePromotion();
      this.onMove(null); // Ansicht neu aufbauen, Figur springt zurück
    });
    this.promoEl.appendChild(cancel);
    this.promoEl.classList.remove('hidden');
  }

  hidePromotion() {
    this.promoEl.classList.add('hidden');
    this.promoEl.innerHTML = '';
  }
}
