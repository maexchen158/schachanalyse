// Bewertung, Gewinnwahrscheinlichkeit, Zugklassifizierung und Genauigkeit.
//
// Bewertungen ("score") werden immer aus Sicht von Weiß gespeichert:
//   { cp: 35 }           35 Hundertstel Bauern Vorteil Weiß
//   { mate: 3 }          Weiß setzt in 3 Zügen matt (negativ: Schwarz setzt matt)
//   { mate: 0, mated: 'w' }  Weiß ist matt (Endstellung)

import { Chess } from 'chess.js';
import { WIN_PCT, THRESHOLDS, GREAT, BRILLIANT, MISS, PIECE_VALUES } from './config.js';

// ---------- Bewertung ----------

// Engine-Zeile (Sicht des Ziehenden) in Weiß-Sicht umrechnen
export function toWhiteScore(info, turn) {
  const sign = turn === 'w' ? 1 : -1;
  if (info.mate !== null && info.mate !== undefined) return { mate: info.mate * sign };
  return { cp: info.cp * sign };
}

// Gewinnwahrscheinlichkeit für Weiß in Prozent (Lichess-Formel)
export function winPercent(score) {
  if (!score) return 50;
  if (score.mate !== undefined) {
    if (score.mate === 0) return score.mated === 'w' ? 0 : score.mated === 'b' ? 100 : 50;
    return score.mate > 0 ? 100 : 0;
  }
  const cp = Math.max(-WIN_PCT.cpCeiling, Math.min(WIN_PCT.cpCeiling, score.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-WIN_PCT.k * cp)) - 1);
}

// Gewinnwahrscheinlichkeit aus Sicht einer Farbe
export function winFor(score, color) {
  const w = winPercent(score);
  return color === 'w' ? w : 100 - w;
}

// Anzeige: "+1.25", "−0.40", "M3", "−M2", "1-0"
export function formatScore(score) {
  if (!score) return '';
  if (score.mate !== undefined) {
    if (score.mate === 0) return score.mated === 'w' ? '0-1' : score.mated === 'b' ? '1-0' : '½-½';
    return `${score.mate > 0 ? '' : '−'}M${Math.abs(score.mate)}`;
  }
  const v = score.cp / 100;
  if (Math.abs(v) < 0.005) return '0.00';
  return `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`;
}

// Kurzform für den Bewertungsbalken
export function formatScoreShort(score) {
  if (!score) return '';
  if (score.mate !== undefined) return score.mate === 0 ? formatScore(score) : `M${Math.abs(score.mate)}`;
  const v = Math.abs(score.cp / 100);
  return v >= 10 ? v.toFixed(0) : v.toFixed(1);
}

// Engine-Ergebnis für eine Stellung aufbereiten (oder Endstellung erkennen)
export function terminalAnalysis(fen) {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) {
    return { depth: 0, terminal: 'checkmate', score: { mate: 0, mated: chess.turn() }, lines: [] };
  }
  if (chess.isStalemate() || chess.isInsufficientMaterial() || chess.isDrawByFiftyMoves()) {
    return { depth: 0, terminal: 'draw', score: { cp: 0 }, lines: [] };
  }
  return null;
}

export function buildAnalysis(fen, raw) {
  const turn = fen.split(' ')[1];
  const lines = raw.lines
    .filter((l) => l.pv.length)
    .map((l) => ({ pv: l.pv, score: toWhiteScore(l, turn) }));
  return { depth: raw.depth, terminal: null, score: lines[0]?.score ?? { cp: 0 }, lines };
}

// ---------- Opfererkennung ----------

const value = (type) => PIECE_VALUES[type] ?? 0;

// Statischer Abtausch auf square für die Seite am Zug (nur legale Schlagzüge,
// dadurch zählen Fesselungen automatisch mit). Ergebnis: Materialgewinn >= 0.
function see(chess, square) {
  const target = chess.get(square);
  if (!target) return 0;
  const captures = chess.moves({ verbose: true }).filter((m) => m.to === square && (!m.promotion || m.promotion === 'q'));
  if (!captures.length) return 0;
  captures.sort((a, b) => value(a.piece) - value(b.piece));
  chess.move(captures[0]);
  const gain = value(target.type) - see(chess, square);
  chess.undo();
  return Math.max(0, gain);
}

// Größter Materialgewinn, den die Seite am Zug durch Schlagen erzielen kann
function maxThreat(chess, victimColor) {
  let best = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (sq && sq.color === victimColor && sq.type !== 'k') best = Math.max(best, see(chess, sq.square));
    }
  }
  return best;
}

// Wie viel Material gibt der Zug (parentFen -> fenAfter) netto her?
export function sacrificeValue(parentFen, fenAfter, moverColor, capturedType) {
  const after = new Chess(fenAfter);
  const threatAfter = maxThreat(after, moverColor);
  if (threatAfter === 0) return 0;
  // Was hing schon vor dem Zug? (gleiche Stellung, aber Gegner am Zug)
  let threatBefore = 0;
  const before = new Chess(parentFen);
  if (!before.inCheck()) {
    const parts = parentFen.split(' ');
    parts[1] = parts[1] === 'w' ? 'b' : 'w';
    parts[3] = '-';
    try {
      threatBefore = maxThreat(new Chess(parts.join(' ')), moverColor);
    } catch {
      threatBefore = 0;
    }
  }
  if (threatAfter <= threatBefore) return 0;
  return threatAfter - (capturedType ? value(capturedType) : 0);
}

// ---------- Klassifizierung ----------

function isRecapture(node) {
  const prev = node.parent;
  return Boolean(prev?.captured && node.captured && prev.to === node.to);
}

export function moveAccuracy(winBefore, winAfter) {
  if (winAfter >= winBefore) return 100;
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * (winBefore - winAfter)) - 3.166924740191411;
  return Math.max(0, Math.min(100, raw + 1)); // +1: Unschärfe der Analyse (wie Lichess)
}

// Ist der Zug, der zu node führte, Eröffnungstheorie? (alle Stellungen bis hier im Buch)
export function isBookMove(node, lookup) {
  for (let n = node; n.parent; n = n.parent) {
    if (!lookup(n.fen)) return false;
  }
  return Boolean(node.parent);
}

// Klassifiziert den Zug, der zu node führte. Voraussetzung: node.parent.analysis
// und node.analysis sind vorhanden. book: Ergebnis von isBookMove.
export function reviewMove(node, { book = false } = {}) {
  const parent = node.parent;
  const pa = parent.analysis;
  const na = node.analysis;
  const mover = node.color;
  const bestLine = pa.lines[0];
  if (!bestLine) return null;

  const bestUci = bestLine.pv[0];
  const isBest = bestUci === node.uci;
  const winBefore = winFor(bestLine.score, mover);
  // Gespielter Zug: Wert aus der MultiPV-Zeile der Vorstellung, sonst aus der Folgestellung
  const playedLine = pa.lines.find((l) => l.pv[0] === node.uci);
  const winAfter = isBest ? winBefore : winFor(playedLine ? playedLine.score : na.score, mover);
  const loss = Math.max(0, winBefore - winAfter);

  const legalMoves = new Chess(parent.fen).moves().length;
  const forced = legalMoves <= 1;
  const result = {
    key: null,
    loss,
    winBefore,
    winAfter,
    accuracy: moveAccuracy(winBefore, winAfter),
    bestUci,
    bestScore: bestLine.score,
    playedScore: isBest ? bestLine.score : playedLine ? playedLine.score : na.score,
    forced,
  };

  if (book) return { ...result, key: 'book' };
  if (forced) return { ...result, key: 'best' };

  // Brillant: (nahezu) bester Zug mit echtem Figurenopfer
  const forcesMate = (s) => s?.mate !== undefined && (mover === 'w' ? s.mate > 0 : s.mate < 0);
  const onlyMatingMove = BRILLIANT.allowMatingSacrifice && isBest
    && forcesMate(bestLine.score) && !forcesMate(pa.lines[1]?.score);
  if (loss <= BRILLIANT.maxLoss
    && (winBefore <= BRILLIANT.maxWinBefore || onlyMatingMove)
    && winAfter >= BRILLIANT.minWinAfter
    && !(BRILLIANT.excludeRecaptures && isRecapture(node))) {
    const sac = sacrificeValue(parent.fen, node.fen, mover, node.captured);
    if (sac >= BRILLIANT.minSacrifice) return { ...result, key: 'brilliant', sacrifice: sac };
  }

  // Großartig: der einzige Zug, der die Stellung hält
  if (isBest && pa.lines.length >= 2) {
    const winSecond = winFor(pa.lines[1].score, mover);
    if (winBefore - winSecond >= GREAT.minGap
      && winAfter >= GREAT.minWinAfter
      && winSecond <= GREAT.maxWinSecond
      && !(GREAT.excludeRecaptures && isRecapture(node))
      && !(GREAT.excludeMateInOne && node.san?.endsWith('#'))) {
      return { ...result, key: 'great', gap: winBefore - winSecond };
    }
  }

  if (isBest) return { ...result, key: 'best' };

  // Verpasster Gewinn: der Gegner hat gerade gepatzt und es wird nicht genutzt
  const prev = parent.review;
  if (prev && prev.loss >= MISS.minOpponentLoss && loss >= MISS.minLoss && winBefore >= MISS.minBestWin) {
    const moverBeforeError = 100 - prev.winBefore;
    if (winAfter >= moverBeforeError - MISS.tolerance) return { ...result, key: 'miss' };
  }

  let key;
  if (loss < THRESHOLDS.excellent) key = 'excellent';
  else if (loss < THRESHOLDS.good) key = 'good';
  else if (loss < THRESHOLDS.inaccuracy) key = 'inaccuracy';
  else if (loss < THRESHOLDS.mistake) key = 'mistake';
  else key = 'blunder';
  return { ...result, key };
}

// ---------- Genauigkeit der Partie (Verfahren von Lichess) ----------

function cpForAccuracy(score) {
  if (score.mate !== undefined) {
    if (score.mate === 0) return score.mated === 'w' ? -WIN_PCT.cpCeiling : score.mated === 'b' ? WIN_PCT.cpCeiling : 0;
    return score.mate > 0 ? WIN_PCT.cpCeiling : -WIN_PCT.cpCeiling;
  }
  return score.cp;
}

function stdDev(xs) {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
}

// scores: Bewertungen (Weiß-Sicht) der Stellungen der Hauptpartie ab Startstellung.
// firstMover: wer den ersten Zug macht. Ergebnis: { w, b } in Prozent oder null.
export function gameAccuracy(scores, firstMover = 'w') {
  if (scores.length < 2) return null;
  const wins = scores.map((s) => winPercent({ cp: cpForAccuracy(s) }));
  const moves = wins.length - 1;
  const windowSize = Math.max(2, Math.min(8, Math.floor(moves / 10)));
  const windows = [];
  for (let i = 0; i < Math.min(windowSize, wins.length) - 2; i++) windows.push(wins.slice(0, windowSize));
  for (let i = 0; i + windowSize <= wins.length; i++) windows.push(wins.slice(i, i + windowSize));
  const weights = windows.map((xs) => Math.max(0.5, Math.min(12, stdDev(xs))));

  const per = { w: [], b: [] };
  for (let i = 0; i < moves; i++) {
    const color = (i % 2 === 0) === (firstMover === 'w') ? 'w' : 'b';
    const before = color === 'w' ? wins[i] : 100 - wins[i];
    const after = color === 'w' ? wins[i + 1] : 100 - wins[i + 1];
    per[color].push({ acc: moveAccuracy(before, after), weight: weights[i] ?? 1 });
  }

  const result = {};
  for (const c of ['w', 'b']) {
    const xs = per[c];
    if (!xs.length) {
      result[c] = null;
      continue;
    }
    const wsum = xs.reduce((a, x) => a + x.weight, 0);
    const weighted = xs.reduce((a, x) => a + x.acc * x.weight, 0) / wsum;
    const harmonic = xs.length / xs.reduce((a, x) => a + 1 / Math.max(x.acc, 0.01), 0);
    result[c] = (weighted + harmonic) / 2;
  }
  return result;
}
