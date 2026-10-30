// Bewertung, Gewinnwahrscheinlichkeit, Zugklassifizierung und Genauigkeit.
//
// Bewertungen ("score") werden immer aus Sicht von Weiß gespeichert:
//   { cp: 35 }           35 Hundertstel Bauern Vorteil Weiß
//   { mate: 3 }          Weiß setzt in 3 Zügen matt (negativ: Schwarz setzt matt)
//   { mate: 0, mated: 'w' }  Weiß ist matt (Endstellung)

import { Chess } from 'chess.js';
import { WIN_PCT, THRESHOLDS, GREAT, BRILLIANT, MISS, PIECE_VALUES, BEGINNER_RATING, ratingFactor } from './config.js';

// ---------- Bewertung ----------

// Engine-Zeile (Sicht des Ziehenden) in Weiß-Sicht umrechnen
export function toWhiteScore(info, turn) {
  const sign = turn === 'w' ? 1 : -1;
  if (info.mate !== null && info.mate !== undefined) return { mate: info.mate * sign };
  return { cp: info.cp * sign };
}

// Gewinnwahrscheinlichkeit für Weiß in Prozent (Lichess-Formel).
// factor > 1 macht die Kurve steiler (stärkere Spieler), < 1 flacher.
export function winPercent(score, factor = 1) {
  if (!score) return 50;
  if (score.mate !== undefined) {
    if (score.mate === 0) return score.mated === 'w' ? 0 : score.mated === 'b' ? 100 : 50;
    return score.mate > 0 ? 100 : 0;
  }
  const cp = Math.max(-WIN_PCT.cpCeiling, Math.min(WIN_PCT.cpCeiling, score.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-WIN_PCT.k * factor * cp)) - 1);
}

// Gewinnwahrscheinlichkeit aus Sicht einer Farbe, optional abhängig von deren Wertung
export function winFor(score, color, rating = null) {
  const w = winPercent(score, ratingFactor(rating));
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
const other = (color) => (color === 'w' ? 'b' : 'w');

// Legale Schlagzüge der Seite am Zug auf ein Feld (Fesselungen zählen dadurch mit)
function capturesOn(chess, square) {
  return chess.moves({ verbose: true }).filter((m) => m.to === square && (!m.promotion || m.promotion === 'q'));
}

// Statischer Abtausch auf square für die Seite am Zug. Ergebnis: Materialgewinn >= 0.
function see(chess, square) {
  const target = chess.get(square);
  if (!target) return 0;
  const captures = capturesOn(chess, square);
  if (!captures.length) return 0;
  captures.sort((a, b) => value(a.piece) - value(b.piece));
  chess.move(captures[0]);
  const gain = value(target.type) - see(chess, square);
  chess.undo();
  return Math.max(0, gain);
}

// Hängt die Figur auf square? Die Seite am Zug wäre der Schläger.
// Hängend heißt: von einer billigeren Figur angegriffen oder per Abtausch zu gewinnen.
export function isHanging(chess, square) {
  const piece = chess.get(square);
  if (!piece) return false;
  const captures = capturesOn(chess, square);
  if (!captures.length) return false;
  if (captures.some((c) => value(c.piece) < value(piece.type))) return true;
  return see(chess, square) > 0;
}

// Gleiche Stellung, aber color am Zug (null, wenn das keine gültige Stellung ergibt)
function withTurn(fen, color) {
  const parts = fen.split(' ');
  if (parts[1] === color) return new Chess(fen);
  parts[1] = color;
  parts[3] = '-';
  try {
    return new Chess(parts.join(' '));
  } catch {
    return null;
  }
}

// Figuren von color, die in fen hängen würden, wenn der Gegner am Zug wäre
export function hangingPieces(fen, color, { minValue = 1 } = {}) {
  const chess = withTurn(fen, other(color));
  if (!chess) return [];
  const out = [];
  for (const row of chess.board()) {
    for (const sq of row) {
      if (sq && sq.color === color && sq.type !== 'k' && value(sq.type) >= minValue && isHanging(chess, sq.square)) {
        out.push({ square: sq.square, type: sq.type });
      }
    }
  }
  return out;
}

// Gibt es mindestens ein Schlagen des Opfers, nach dem nicht sofort Matt in 1 folgt?
// (Sonst ist es kein echtes Angebot, sondern eine offensichtliche Falle.)
function isViable(fenAfter, sac) {
  if (value(sac.type) >= 5) return true;
  const chess = new Chess(fenAfter);
  for (const cap of capturesOn(chess, sac.square)) {
    chess.move(cap);
    const mateInOne = chess.moves({ verbose: true }).some((m) => {
      chess.move(m);
      const mate = chess.isCheckmate();
      chess.undo();
      return mate;
    });
    chess.undo();
    if (!mateInOne) return true;
  }
  return false;
}

// Welche Figuren opfert der Zug parentFen -> fenAfter? Nach dem Vorbild von Chess.com:
// Eine Figur (Springer oder mehr) hängt nach dem Zug. Ausgenommen sind Figuren, die
// nicht mehr wert sind als das gerade Geschlagene (das ist ein Tausch).
// Hing die Figur schon vorher und wird stehen gelassen, ist es ein indirektes Opfer.
export function findSacrifices(parentFen, fenAfter, mover, { movedTo = null, capturedType = null } = {}) {
  const after = new Chess(fenAfter);
  const before = withTurn(parentFen, other(mover));
  const capturedValue = capturedType ? value(capturedType) : 0;
  const out = [];
  for (const row of after.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== mover || sq.type === 'k' || sq.type === 'p') continue;
      if (value(sq.type) <= capturedValue) continue;
      if (!isHanging(after, sq.square)) continue;
      let indirect = false;
      if (sq.square !== movedTo && before) {
        const prev = before.get(sq.square);
        indirect = Boolean(prev && prev.type === sq.type && prev.color === mover && isHanging(before, sq.square));
        if (indirect && !BRILLIANT.countIgnoredThreats) continue;
      }
      const sac = { square: sq.square, type: sq.type, indirect };
      if (isViable(fenAfter, sac)) out.push(sac);
    }
  }
  return out;
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
// und node.analysis sind vorhanden. book: Ergebnis von isBookMove,
// rating: Wertung des ziehenden Spielers (falls bekannt).
export function reviewMove(node, { book = false, rating = null } = {}) {
  const parent = node.parent;
  const pa = parent.analysis;
  const na = node.analysis;
  const mover = node.color;
  const bestLine = pa.lines[0];
  if (!bestLine) return null;
  const win = (score) => winFor(score, mover, rating);
  const beginner = Boolean(rating && rating < BEGINNER_RATING);

  const bestUci = bestLine.pv[0];
  const isBest = bestUci === node.uci;
  const winBefore = win(bestLine.score);
  // Gespielter Zug: Wert aus der MultiPV-Zeile der Vorstellung, sonst aus der Folgestellung
  const playedLine = pa.lines.find((l) => l.pv[0] === node.uci);
  const playedScore = isBest ? bestLine.score : playedLine ? playedLine.score : na.score;
  const winAfter = isBest ? winBefore : win(playedScore);
  const loss = Math.max(0, winBefore - winAfter);
  const second = pa.lines[1] ?? null;
  const winSecond = second ? win(second.score) : null;

  const parentChess = new Chess(parent.fen);
  const forced = parentChess.moves().length <= 1;
  const result = {
    key: null,
    loss,
    winBefore,
    winAfter,
    winSecond,
    accuracy: moveAccuracy(winBefore, winAfter),
    bestUci,
    bestScore: bestLine.score,
    secondScore: second?.score ?? null,
    playedScore,
    forced,
    rating,
  };

  if (book) return { ...result, key: 'book' };
  if (forced) return { ...result, key: 'best' };

  // Brillant: (fast) bester Zug mit einem echten Figurenopfer; nicht, wenn man
  // ohnehin völlig gewonnen hat (auch der zweitbeste Zug gewinnt klar)
  const forcesMate = (sc) => sc?.mate !== undefined && sc.mate !== 0 && (mover === 'w' ? sc.mate > 0 : sc.mate < 0);
  const alreadyWinning = winSecond !== null
    && (winSecond >= BRILLIANT.maxWinSecond || (forcesMate(bestLine.score) && forcesMate(second.score)));
  const maxLoss = beginner ? BRILLIANT.maxLossBeginner : BRILLIANT.maxLoss;
  if (loss <= maxLoss
    && !alreadyWinning
    && winAfter >= BRILLIANT.minWinAfter
    && node.uci.length === 4 // keine Umwandlung
    && !parentChess.inCheck()) {
    const sacrifices = findSacrifices(parent.fen, node.fen, mover, { movedTo: node.to, capturedType: node.captured });
    if (sacrifices.length) return { ...result, key: 'brilliant', sacrifices };
  }

  // Großartig: der einzige gute Zug. Abstand mit der neutralen Kurve gemessen, damit
  // die steilere Kurve starker Spieler nicht künstlich viele "einzige Züge" erzeugt.
  if (isBest && second) {
    const minGap = beginner ? GREAT.minGapBeginner : GREAT.minGap;
    const neutralBest = winFor(bestLine.score, mover);
    const neutralSecond = winFor(second.score, mover);
    if (neutralBest - neutralSecond >= minGap
      && winAfter >= GREAT.minWinAfter
      && neutralSecond <= GREAT.maxWinSecond
      && !(GREAT.excludeRecaptures && isRecapture(node))
      && !(GREAT.excludeMateInOne && node.san?.endsWith('#'))
      && !(parentChess.inCheck() && parentChess.moves().length <= GREAT.maxLegalInCheck)
      && !isHanging(new Chess(node.fen), node.to)) {
      return { ...result, key: 'great', gap: neutralBest - neutralSecond };
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
