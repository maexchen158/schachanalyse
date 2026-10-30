// Anzeigen neben dem Brett: Bewertungsbalken, Zuginformation, Genauigkeit.

import { Chess } from 'chess.js';
import { winPercent, formatScore, formatScoreShort, gameAccuracy } from './classify.js';
import { CATEGORIES, CATEGORY_ORDER, badgeHtml } from './categories.js';
import { formatSan } from './notation.js';
import { moveNumber } from './tree.js';
import { playerInfo } from './gameinfo.js';

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Bewertungsbalken ----------

export function renderEvalBar({ bar, fill, text }, score, orientation) {
  bar.classList.toggle('flipped', orientation === 'black');
  if (!score) {
    fill.style.height = '50%';
    text.textContent = '';
    return;
  }
  const w = winPercent(score);
  fill.style.height = `${w}%`;
  text.textContent = formatScoreShort(score);
  // Zahl steht auf der Seite des Vorteils, in passender Farbe
  const whiteAhead = w >= 50;
  const atBottom = whiteAhead === (orientation === 'white');
  text.classList.toggle('top', !atBottom);
  text.style.color = whiteAhead ? '#333' : '#eee';
}

// ---------- Zuginformation ----------

// Hauptvariante (UCI) als SAN-Text mit Zugnummern
export function pvToSan(fen, pv, style, maxPlies = 10) {
  const chess = new Chess(fen);
  const out = [];
  for (const uci of pv.slice(0, maxPlies)) {
    const [num, turn] = [chess.moveNumber(), chess.turn()];
    let mv;
    try {
      mv = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      break;
    }
    if (turn === 'w') out.push(`${num}.`);
    else if (!out.length) out.push(`${num}…`);
    out.push(formatSan(mv.san, style));
  }
  return out.join(' ');
}

export function uciToSan(fen, uci) {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    return uci;
  }
}

export function renderMoveInfo(el, node, { style, analysing }) {
  if (!node) {
    el.innerHTML = '';
    return;
  }
  const parts = [];
  const a = node.analysis;
  const r = node.review;

  if (!node.parent) {
    parts.push('<div class="mi-head">Ausgangsstellung</div>');
  } else {
    const num = `${moveNumber(node)}${node.color === 'w' ? '.' : '…'}`;
    const cat = r ? CATEGORIES[r.key] : null;
    parts.push(`<div class="mi-head">${r ? badgeHtml(r.key) : ''}<span>${num} ${escapeHtml(formatSan(node.san, style))}</span>${cat ? `<span style="color:${cat.color}">${cat.label}</span>` : ''}</div>`);
  }

  if (a) {
    const evalText = formatScore(a.score);
    const row = [`Bewertung <b>${evalText}</b>`];
    if (a.depth) row.push(`Tiefe ${a.depth}`);
    parts.push(`<div class="mi-row">${row.join(' · ')}</div>`);
  } else if (analysing) {
    parts.push('<div class="mi-row">Wird analysiert …</div>');
  }

  if (r && node.parent) {
    const bestSan = formatSan(uciToSan(node.parent.fen, r.bestUci), style);
    const row = [];
    if (r.key === 'book') {
      row.push('Eröffnungstheorie');
    } else if (r.bestUci !== node.uci) {
      row.push(`Bester Zug <b>${escapeHtml(bestSan)}</b> (${formatScore(r.bestScore)})`);
      row.push(`Verlust ${r.loss.toFixed(1)} %`);
    } else {
      row.push('Engine-Zug');
    }
    if (r.forced) row.push('einziger legaler Zug');
    if (r.key === 'brilliant' && r.sacrifice) row.push(`Opfer: ${r.sacrifice} Bauerneinheiten`);
    parts.push(`<div class="mi-row">${row.join(' · ')}</div>`);
  }

  if (a?.lines?.length) {
    const ls = a.lines.map((l) => `<div class="line"><span class="ev">${formatScore(l.score)}</span>${escapeHtml(pvToSan(node.fen, l.pv, style))}</div>`);
    parts.push(`<div class="lines">${ls.join('')}</div>`);
  } else if (a?.terminal === 'checkmate') {
    parts.push('<div class="mi-row">Schachmatt</div>');
  } else if (a?.terminal === 'draw') {
    parts.push('<div class="mi-row">Remis</div>');
  }

  el.innerHTML = parts.join('');
}

// ---------- Genauigkeit und Kategorien ----------

export function renderSummary(el, tree, headers) {
  const main = tree.mainline();
  if (!main.some((n) => n.review)) {
    el.innerHTML = '';
    return;
  }
  // Genauigkeit erst, wenn alle Stellungen der Hauptpartie bewertet sind
  const complete = main.every((n) => n.analysis);
  const acc = complete ? gameAccuracy(main.map((n) => n.analysis.score), main[1]?.color ?? 'w') : null;
  const fmt = (v) => (v === null || v === undefined ? '…' : v.toFixed(1));
  const name = (c) => {
    const p = playerInfo(headers, c);
    const rating = p.rating ? ` <span class="rating" title="${escapeHtml(p.ratingLabel)}">${escapeHtml(p.rating)}</span>` : '';
    return `${escapeHtml(p.name)}${rating}`;
  };

  const counts = { w: {}, b: {} };
  for (const n of main) {
    if (n.review) counts[n.color][n.review.key] = (counts[n.color][n.review.key] ?? 0) + 1;
  }
  const rows = CATEGORY_ORDER.map((k) => {
    const cw = counts.w[k] ?? 0;
    const cb = counts.b[k] ?? 0;
    const c = CATEGORIES[k];
    return `<tr class="${cw + cb ? '' : 'zero'}"><td class="n" style="color:${c.color}">${cw}</td><td class="lbl">${badgeHtml(k)}${c.label}</td><td class="n" style="color:${c.color}">${cb}</td></tr>`;
  });

  el.innerHTML = `
    <div class="acc">
      <div class="acc-box white"><div class="who">${name('White')}</div><div class="val">${fmt(acc?.w)}</div><div class="who">Genauigkeit</div></div>
      <div class="acc-box black"><div class="who">${name('Black')}</div><div class="val">${fmt(acc?.b)}</div><div class="who">Genauigkeit</div></div>
    </div>
    <table class="counts">${rows.join('')}</table>`;
}

// ---------- Eröffnungsname ----------

export function openingFor(tree, node) {
  const find = (path) => {
    for (let i = path.length - 1; i >= 0; i--) if (path[i].opening?.name) return path[i].opening;
    return null;
  };
  return find(tree.path(node)) ?? find(tree.mainline());
}
