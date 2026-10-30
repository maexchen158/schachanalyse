// Kurze Erklärung zu jedem Zug, erzeugt aus Klassifizierung und Engine-Daten.

import { Chess } from 'chess.js';
import { formatScore, hangingPieces } from './classify.js';
import { formatSan } from './notation.js';

const PIECE_ACC = { p: 'den Bauern', n: 'den Springer', b: 'den Läufer', r: 'den Turm', q: 'die Dame', k: 'den König' };
const PIECE_IT = { p: 'ihn', n: 'ihn', b: 'ihn', r: 'ihn', q: 'sie', k: 'ihn' };
const COLOR = { w: 'Weiß', b: 'Schwarz' };

function moveOf(fen, uci) {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return null;
  }
}

// Zugfolge als Text mit Zugnummern, z. B. "10. hxg4 Lxg4"
function line(fen, pv, style, plies) {
  const chess = new Chess(fen);
  const out = [];
  for (const uci of pv.slice(0, plies)) {
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

// Matt in n für color (>0), gegen color (<0), sonst 0
function mateFor(score, color) {
  if (!score || score.mate === undefined || score.mate === 0) return 0;
  return color === 'w' ? score.mate : -score.mate;
}

const sq = (s) => s;

export function explainMove(node, { style = 'figurine' } = {}) {
  const r = node.review;
  if (!node.parent) return 'Ausgangsstellung.';
  if (!r) return '';
  const mover = node.color;
  const opp = mover === 'w' ? 'b' : 'w';
  const parentFen = node.parent.fen;
  const bestMove = moveOf(parentFen, r.bestUci);
  const bestSan = bestMove ? formatSan(bestMove.san, style) : r.bestUci;
  const reply = node.analysis?.lines?.[0]?.pv?.[0];
  const replyMove = reply ? moveOf(node.fen, reply) : null;
  const replySan = replyMove ? formatSan(replyMove.san, style) : null;
  const evalText = (score) => formatScore(score);

  // Was der Zug selbst tut
  const deeds = [];
  if (node.san?.endsWith('#')) deeds.push('Setzt matt');
  else {
    if (node.captured) deeds.push(`Schlägt ${PIECE_ACC[node.captured]}`);
    if (node.san?.includes('+')) deeds.push(node.captured ? 'mit Schach' : 'Gibt Schach');
    if (node.uci?.length === 5) deeds.push(`Wandelt in ${PIECE_ACC[node.uci[4]].replace(/^den |^die /, 'eine ').replace('eine Bauern', 'einen Bauern')} um`);
    if (node.san?.startsWith('O-O')) deeds.push(node.san === 'O-O-O' ? 'Lange Rochade' : 'Kurze Rochade');
  }
  const deedText = deeds.length ? `${deeds.join(' ')}. ` : '';

  switch (r.key) {
    case 'book': {
      const name = node.opening?.name;
      return name ? `Eröffnungstheorie: ${name}.` : 'Bekannter Eröffnungszug aus der Theorie.';
    }
    case 'brilliant': {
      const s = r.sacrifices[0];
      const what = s.indirect
        ? `Lässt ${PIECE_ACC[s.type]} auf ${sq(s.square)} bewusst angegriffen stehen`
        : `Opfert ${PIECE_ACC[s.type]} auf ${sq(s.square)}`;
      const mate = mateFor(node.analysis?.score, mover);
      const follow = mate > 0
        ? `Danach erzwingt ${COLOR[mover]} Matt in ${mate}.`
        : node.analysis?.lines?.[0] ? `Mögliche Fortsetzung: ${line(node.fen, node.analysis.lines[0].pv, style, 3)}.` : '';
      return `${deedText}${what} – ein Opfer, das trotzdem zu den stärksten Zügen gehört. ${follow}`.trim();
    }
    case 'great': {
      const secondUci = node.parent.analysis?.lines?.[1]?.pv?.[0];
      const secondMove = secondUci ? moveOf(parentFen, secondUci) : null;
      const prev = node.parent.review;
      let why;
      if (prev && ['mistake', 'blunder', 'miss'].includes(prev.key)) why = 'Bestraft den Fehler des Gegners – der einzige Zug, der den Vorteil sichert.';
      else if (r.winBefore >= 60) why = 'Der einzige Zug, der den Vorteil hält.';
      else if (r.winBefore >= 40) why = 'Der einzige Zug, der die Stellung im Gleichgewicht hält.';
      else why = 'Der einzige Zug, der die Partie noch hält.';
      const alt = secondMove ? ` Der nächstbeste Zug ${formatSan(secondMove.san, style)} wäre deutlich schwächer gewesen (${evalText(r.secondScore)}).` : '';
      return `${deedText}${why}${alt}`;
    }
    case 'best': {
      if (r.forced) return `${deedText}Der einzige legale Zug.`;
      if (node.san?.endsWith('#')) return 'Schachmatt – der stärkste Zug.';
      const mate = mateFor(r.bestScore, mover);
      if (mate > 0) return `${deedText}Der stärkste Zug: ${COLOR[mover]} setzt in ${mate} ${mate === 1 ? 'Zug' : 'Zügen'} matt.`;
      return `${deedText}Der stärkste Zug laut Engine.`;
    }
    case 'excellent':
      return `${deedText}Fast so stark wie der beste Zug ${bestSan}.`;
    case 'good':
      return `${deedText}Ein solider Zug, ${bestSan} wäre aber etwas genauer gewesen (${evalText(r.bestScore)}).`;
    default:
      break;
  }

  // Ungenauigkeit, Fehler, Blunder, Verpasster Gewinn: Ursache suchen
  const parts = [];
  if (r.key === 'miss') parts.push('Der Gegner hatte gerade einen Fehler gemacht, der hier nicht genutzt wird.');

  const allowsMate = mateFor(r.playedScore, opp);
  const missedMate = mateFor(r.bestScore, mover);
  if (allowsMate > 0) {
    parts.push(`Erlaubt Matt in ${allowsMate}${replySan ? `, beginnend mit ${replySan}` : ''}.`);
  } else if (missedMate > 0) {
    parts.push(`Verpasst Matt in ${missedMate} mit ${bestSan}.`);
  } else {
    // Hängt nach dem Zug eine Figur? Am deutlichsten, wenn die beste Antwort sie schlägt
    // (auch wenn sie schon vorher angegriffen war und einfach stehen gelassen wurde).
    const before = new Set(hangingPieces(parentFen, mover, { minValue: 1 }).map((p) => p.square + p.type));
    const hanging = hangingPieces(node.fen, mover, { minValue: 1 })
      .sort((a, b) => 'pnbrq'.indexOf(b.type) - 'pnbrq'.indexOf(a.type));
    const taken = replyMove && hanging.find((p) => replyMove.to === p.square);
    const lost = taken ?? hanging.find((p) => p.type !== 'p' && !before.has(p.square + p.type));
    if (lost) {
      const wasAttacked = before.has(lost.square + lost.type);
      const verb = wasAttacked ? 'stehen, obwohl er angegriffen war' : 'ungeschützt';
      const verbFem = wasAttacked ? 'stehen, obwohl sie angegriffen war' : 'ungeschützt';
      const wins = taken ? ` – ${replySan} gewinnt ${PIECE_IT[lost.type]}` : '';
      parts.push(`Lässt ${PIECE_ACC[lost.type]} auf ${sq(lost.square)} ${lost.type === 'q' ? verbFem : verb}${wins}.`);
    } else if (bestMove?.captured && 'nbrq'.includes(bestMove.captured)) {
      parts.push(`Verpasst ${bestSan}, das ${PIECE_ACC[bestMove.captured]} schlägt.`);
    } else if (replySan) {
      parts.push(`Danach hat ${COLOR[opp]} mit ${replySan} die bessere Fortsetzung.`);
    }
  }
  parts.push(`Besser war ${bestSan} (${evalText(r.bestScore)} statt ${evalText(r.playedScore)}).`);
  return `${deedText}${parts.join(' ')}`;
}
