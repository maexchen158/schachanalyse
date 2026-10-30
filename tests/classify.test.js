import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGame } from '../public/js/notation.js';
import {
  winPercent, formatScore, findSacrifices, reviewMove, gameAccuracy, terminalAnalysis, moveAccuracy,
} from '../public/js/classify.js';

const OPERA = `1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7
8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7
14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8#`;

const bySan = (tree, san, color) => tree.mainline().find((n) => n.san === san && (!color || n.color === color));

test('Gewinnwahrscheinlichkeit', () => {
  assert.equal(winPercent({ cp: 0 }), 50);
  assert.ok(Math.abs(winPercent({ cp: 100 }) - 59.1) < 0.1);
  assert.equal(winPercent({ mate: 3 }), 100);
  assert.equal(winPercent({ mate: -1 }), 0);
  assert.equal(winPercent({ mate: 0, mated: 'b' }), 100);
  assert.ok(winPercent({ cp: 5000 }) < 100); // auf 10 Bauern begrenzt
});

test('Anzeige der Bewertung', () => {
  assert.equal(formatScore({ cp: 125 }), '+1.25');
  assert.equal(formatScore({ cp: -40 }), '−0.40');
  assert.equal(formatScore({ mate: -2 }), '−M2');
  assert.equal(formatScore({ mate: 0, mated: 'b' }), '1-0');
});

const sacs = (n) => findSacrifices(n.parent.fen, n.fen, n.color, { movedTo: n.to, capturedType: n.captured })
  .map((s) => s.type + s.square + (s.indirect ? '*' : ''));

test('Opfer werden erkannt (Opernpartie)', () => {
  const { tree } = parseGame(OPERA);
  assert.deepEqual(sacs(bySan(tree, 'Nxb5')), ['nb5']);      // Springer gegen Bauer
  assert.deepEqual(sacs(bySan(tree, 'Rxd7', 'w')), ['rd7']); // Turm gegen Springer
  assert.deepEqual(sacs(bySan(tree, 'Qb8+')), ['qb8']);      // Damenopfer
  assert.deepEqual(sacs(bySan(tree, 'e4')), []);
  assert.deepEqual(sacs(bySan(tree, 'Qxf3')), []);   // Zurückschlagen ist kein Opfer
  assert.deepEqual(sacs(bySan(tree, 'Bxf3')), []);   // Läufer gegen Springer ist ein Tausch
  assert.deepEqual(sacs(bySan(tree, 'Bxd7+')), []);  // Läufer schlägt Turm: kein Opfer
});

test('Indirektes Opfer: angegriffene Figur bleibt stehen', () => {
  // 9. h3 greift den Springer g4 an, Schwarz spielt 9…Lc5 und lässt ihn stehen
  const { tree } = parseGame(`1. e4 e5 2. Nf3 Nf6 3. Bc4 Nc6 4. Ng5 Qe7 5. Nxf7 d5 6. Nxh8 dxc4
    7. Nc3 Ng4 8. O-O Qh4 9. h3 Bc5 10. hxg4`);
  assert.deepEqual(sacs(bySan(tree, 'Bc5')), ['ng4*']);
  assert.deepEqual(sacs(bySan(tree, 'Qh4')), []);
});

test('Matt wird als Endstellung erkannt', () => {
  const { tree } = parseGame(OPERA);
  const last = tree.mainline().at(-1);
  const a = terminalAnalysis(last.fen);
  assert.equal(a.terminal, 'checkmate');
  assert.equal(winPercent(a.score), 100);
});

// Hilfsfunktion: Analyse künstlich setzen
const lines = (...xs) => xs.map(([uci, cp]) => ({ pv: [uci], score: { cp } }));
const analysis = (ls) => ({ depth: 18, lines: ls, score: ls[0]?.score ?? { cp: 0 } });

test('Kategorien nach Verlust', () => {
  const { tree } = parseGame('1. e4 e5 2. Nf3');
  const [, e4, e5, nf3] = tree.mainline();
  e4.analysis = analysis(lines(['e7e5', 30], ['c7c5', 35]));
  e5.analysis = analysis(lines(['g1f3', 40], ['f1c4', 30], ['b1c3', 20]));
  nf3.analysis = analysis(lines(['b8c6', 40]));

  // Bester Zug
  assert.equal(reviewMove(nf3).key, 'best');

  // Gleicher Zug, aber Engine wollte etwas anderes: Verlust bestimmt die Kategorie
  // Bester Wert +0.40 ≈ 53,7 %
  const cases = [[30, 'excellent'], [-10, 'good'], [-40, 'inaccuracy'], [-140, 'mistake'], [-900, 'blunder']];
  for (const [cp, key] of cases) {
    e5.analysis = analysis(lines(['f1c4', 40]));
    nf3.analysis = analysis(lines(['b8c6', cp]));
    assert.equal(reviewMove(nf3).key, key, `cp ${cp}`);
  }
});

test('Großartig: einziger Zug', () => {
  const { tree } = parseGame('1. e4 e5 2. Nf3');
  const [, , e5, nf3] = tree.mainline();
  e5.analysis = analysis(lines(['g1f3', 0], ['f1c4', -400]));
  nf3.analysis = analysis(lines(['b8c6', 0]));
  assert.equal(reviewMove(nf3).key, 'great');
});

test('Brillant: Damenopfer mit Mattzwang (Opernpartie 16. Db8+)', () => {
  const { tree } = parseGame(OPERA);
  const qb8 = bySan(tree, 'Qb8+');
  const mateLine = (uci, mate) => ({ pv: [uci], score: { mate } });
  qb8.parent.analysis = { depth: 18, lines: [mateLine('b3b8', 2), { pv: ['d7c6'], score: { cp: 405 } }], score: { mate: 2 } };
  qb8.analysis = { depth: 18, lines: [mateLine('d7b8', 1)], score: { mate: 1 } };
  assert.equal(reviewMove(qb8).key, 'brilliant');
});

test('Theorie hat Vorrang', () => {
  const { tree } = parseGame('1. e4');
  const [root, e4] = tree.mainline();
  root.analysis = analysis(lines(['d2d4', 30]));
  e4.analysis = analysis(lines(['e7e5', 30]));
  assert.equal(reviewMove(e4, { book: true }).key, 'book');
});

test('Verpasster Gewinn', () => {
  const { tree } = parseGame('1. e4 e5 2. Nf3 Qh4');
  const [, , e5, nf3, qh4] = tree.mainline();
  e5.analysis = analysis(lines(['g1f3', 30]));
  nf3.analysis = analysis(lines(['b8c6', 30]));
  qh4.analysis = analysis(lines(['f3h4', 900]));
  // Schwarz' Qh4 verliert die Dame (Blunder)
  qh4.review = reviewMove(qh4);
  assert.equal(qh4.review.key, 'blunder');
  // Weiß nimmt die Dame nicht und steht wieder ausgeglichen
  const { node: miss } = tree.addMove(qh4, { from: 'b1', to: 'c3', san: 'Nc3', color: 'w' }, 'rnb1kbnr/pppp1ppp/8/4p3/4P2q/2N2N2/PPPP1PPP/R1BQKB1R b KQkq - 3 3');
  miss.analysis = analysis(lines(['h4e7', 20]));
  assert.equal(reviewMove(miss).key, 'miss');
});

test('Zuggenauigkeit und Partiegenauigkeit', () => {
  assert.equal(moveAccuracy(60, 60), 100);
  assert.ok(moveAccuracy(60, 40) < 50);
  const perfect = gameAccuracy([{ cp: 20 }, { cp: 20 }, { cp: 20 }, { cp: 20 }]);
  assert.ok(perfect.w > 99 && perfect.b > 99);
  // Weiß verliert mit dem ersten Zug alles, danach spielen beide fehlerfrei
  const blunder = gameAccuracy([{ cp: 20 }, { cp: -800 }, { cp: -800 }, { cp: -800 }]);
  assert.ok(blunder.b > 99 && blunder.w < 50);
});
