// Einlesen von PGN und einfachen Zugfolgen in englischer oder deutscher Notation.
//
// Unterstützt: PGN-Kopfzeilen, Kommentare { } und ;, NAGs ($1), Varianten ( ),
// Zugnummern "12." / "12...", Ergebnisse, Rochade mit 0 oder O,
// deutsche Figurenbuchstaben (S, L, T, D), ":" als Schlagzeichen,
// Langschreibweise (e2-e4, Sg1-f3) und UCI (e2e4).

import { Chess } from 'chess.js';
import { GameTree } from './tree.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export class ParseError extends Error {}

const GERMAN = { S: 'N', L: 'B', T: 'R', D: 'Q' };
const RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '½-½', '*']);

// Wandelt einen Zug-Token in englische SAN um (soweit möglich).
export function normalizeSan(token) {
  let s = token.trim();
  s = s.replace(/[!?]+$/g, '').replace(/[⁉‼⁈⁇]/g, '');
  s = s.replace(/e\.?p\.?$/i, '');
  s = s.replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O');
  s = s.replace(/^o-o-o/, 'O-O-O').replace(/^o-o/, 'O-O');
  s = s.replace(/:/g, 'x');
  if (GERMAN[s[0]]) s = GERMAN[s[0]] + s.slice(1);
  // Umwandlung: e8D, e8=D, exd8(D), e8/D
  s = s.replace(/^([a-h](?:x[a-h])?[18])[=/(]?([SLTDNBRQ])\)?/, (_, sq, p) => `${sq}=${GERMAN[p] ?? p}`);
  // Langschreibweise: e2-e4, Ng1-f3, e7xd8=Q
  s = s.replace(/^([NBRQK]?)([a-h][1-8])-([a-h][1-8])/, '$1$2$3');
  return s;
}

// Anzeige eines SAN-Zuges: 'figurine' (♘f3), 'de' (Sf3) oder 'en' (Nf3)
const FIGURINES = { N: '♘', B: '♗', R: '♖', Q: '♕', K: '♔' };
const TO_GERMAN = { N: 'S', B: 'L', R: 'T', Q: 'D', K: 'K' };

export function formatSan(san, style = 'figurine') {
  if (!san || style === 'en') return san ?? '';
  const map = style === 'de' ? TO_GERMAN : FIGURINES;
  return san.replace(/[NBRQK](?=[a-h1-8x])/g, (p) => map[p]).replace(/=([NBRQ])/, (_, p) => '=' + map[p]);
}

// Versucht einen Zug auf dem Brett auszuführen; liefert das chess.js-Zugobjekt oder null.
export function tryMove(chess, token) {
  const san = normalizeSan(token);
  try {
    return chess.move(san, { strict: false });
  } catch {
    // weiter unten: Feld-zu-Feld-Schreibweise
  }
  const m = san.match(/^[NBRQK]?([a-h][1-8])x?([a-h][1-8])=?([nbrqNBRQ])?[+#]?$/);
  if (m) {
    try {
      return chess.move({ from: m[1], to: m[2], promotion: m[3]?.toLowerCase() ?? 'q' });
    } catch {
      return null;
    }
  }
  return null;
}

function parseHeaders(text) {
  const headers = {};
  const re = /^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/gm;
  let m;
  while ((m = re.exec(text))) headers[m[1]] = m[2].replace(/\\(.)/g, '$1');
  const body = text.replace(re, '');
  return { headers, body };
}

// Zerlegt den Zugtext in Tokens: '(' ')' oder Zug-Strings.
function tokenize(body) {
  const tokens = [];
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '{') {
      const end = body.indexOf('}', i);
      i = end < 0 ? body.length : end + 1;
      continue;
    }
    if (c === ';') {
      const end = body.indexOf('\n', i);
      i = end < 0 ? body.length : end + 1;
      continue;
    }
    if (c === '(' || c === ')') { tokens.push(c); i++; continue; }
    let j = i;
    while (j < body.length && !/[\s(){};]/.test(body[j])) j++;
    let word = body.slice(i, j);
    i = j;
    if (/^\$\d+$/.test(word)) continue;           // NAG
    if (RESULTS.has(word)) continue;
    // Zugnummer abtrennen ("12.", "12...", "12.e4", "12…")
    word = word.replace(/^\d+\s*(\.{1,3}|…)/, '');
    if (!word || /^\.+$/.test(word) || /^\d+$/.test(word)) continue;
    tokens.push(word);
  }
  return tokens;
}

// Setzt PGN-Kopfzeilen im Text (vorhandene werden ersetzt, fehlende vorangestellt).
// Leere Werte werden ignoriert. Beispiel: setHeaders(text, { White: 'Anna', WhiteElo: '1500' })
export function setHeaders(text, values) {
  let out = text.trim();
  const added = [];
  for (const [key, raw] of Object.entries(values)) {
    const value = String(raw ?? '').replace(/[\r\n]+/g, ' ').trim();
    if (!value) continue;
    const line = `[${key} "${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
    const re = new RegExp(`^\\s*\\[${key}\\s+"(?:[^"\\\\]|\\\\.)*"\\s*\\]\\s*$`, 'm');
    if (re.test(out)) out = out.replace(re, () => line);
    else added.push(line);
  }
  if (!added.length) return out;
  // Neue Kopfzeilen vor die Züge; ohne bisherigen Kopf mit Leerzeile trennen
  const hasHeader = /^\s*\[\w+\s+"/.test(out);
  return added.join('\n') + (hasHeader ? '\n' : '\n\n') + out;
}

function describeMove(fen) {
  const [, turn, , , , num] = fen.split(' ');
  return turn === 'w' ? `${num}.` : `${num}...`;
}

// Liest PGN oder Zugfolge. Ergebnis: { headers, tree }.
export function parseGame(text) {
  if (!text || !text.trim()) throw new ParseError('Bitte eine Partie (PGN oder Zugfolge) eingeben.');
  const { headers, body } = parseHeaders(text);

  let startFen = START_FEN;
  if (headers.FEN) {
    try {
      new Chess(headers.FEN);
      startFen = headers.FEN;
    } catch {
      throw new ParseError(`Ungültige Startstellung (FEN): ${headers.FEN}`);
    }
  }

  const tree = new GameTree(startFen);
  const tokens = tokenize(body);
  // Stapel für Varianten: aktueller Knoten und der Knoten vor dem letzten Zug
  let current = tree.root;
  let prev = null;
  const stack = [];
  let depth = 0;      // Variantentiefe; 0 = Hauptpartie
  let moves = 0;

  for (const tok of tokens) {
    if (tok === '(') {
      if (!prev) throw new ParseError('Variante "(" ohne vorhergehenden Zug.');
      stack.push({ current, prev });
      current = prev;
      prev = null;
      depth++;
      continue;
    }
    if (tok === ')') {
      if (!stack.length) throw new ParseError('Überzählige Klammer ")".');
      ({ current, prev } = stack.pop());
      depth--;
      continue;
    }
    const chess = new Chess(current.fen);
    const move = tryMove(chess, tok);
    if (!move) {
      const where = describeMove(current.fen);
      const side = current.fen.split(' ')[1] === 'w' ? 'Weiß' : 'Schwarz';
      const hint = depth > 0 ? ', in einer Variante' : '';
      throw new ParseError(`Ungültiger Zug „${tok}“ bei Zug ${where} (${side} am Zug${hint}).`);
    }
    const { node } = tree.addMove(current, move, chess.fen(), { main: depth === 0 });
    prev = current;
    current = node;
    if (depth === 0) moves++;
  }
  if (stack.length) throw new ParseError('Variante nicht geschlossen: ")" fehlt.');
  if (moves === 0) throw new ParseError('Keine Züge gefunden.');

  return { headers, tree };
}
