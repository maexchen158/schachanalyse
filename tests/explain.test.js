import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGame } from '../public/js/notation.js';
import { reviewMove } from '../public/js/classify.js';
import { explainMove } from '../public/js/explain.js';

const lines = (...xs) => xs.map(([uci, score]) => ({ pv: [uci], score }));
const analysis = (ls) => ({ depth: 18, lines: ls, score: ls[0]?.score ?? { cp: 0 } });

test('Erklärung: Figur eingestellt', () => {
  // 2… Dg5?? stellt die Dame dem Springer f3 hin
  const { tree } = parseGame('1. e4 e5 2. Nf3 Qg5');
  const [, , e5, nf3, qg5] = tree.mainline();
  nf3.analysis = analysis(lines(['b8c6', { cp: 30 }], ['g8f6', { cp: 35 }]));
  qg5.analysis = analysis(lines(['f3g5', { cp: 900 }]));
  e5.analysis = analysis(lines(['g1f3', { cp: 30 }]));
  qg5.review = reviewMove(qg5);
  const text = explainMove(qg5, { style: 'de' });
  assert.equal(qg5.review.key, 'blunder');
  assert.match(text, /Lässt die Dame auf g5 ungeschützt – Sxg5 gewinnt sie\./);
  assert.match(text, /Besser war Sc6/);
});

test('Erklärung: Theorie mit Eröffnungsname', () => {
  const { tree } = parseGame('1. e4');
  const [root, e4] = tree.mainline();
  root.analysis = analysis(lines(['e2e4', { cp: 30 }]));
  e4.analysis = analysis(lines(['e7e5', { cp: 30 }]));
  e4.opening = { eco: 'B00', name: "King's Pawn Game" };
  e4.review = reviewMove(e4, { book: true });
  assert.equal(explainMove(e4), "Eröffnungstheorie: King's Pawn Game.");
});

test('Erklärung: Matt verpasst und Matt erlaubt', () => {
  const { tree } = parseGame('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. d3');
  const [, , , , , qh5, nf6, d3] = tree.mainline();
  nf6.analysis = analysis(lines(['h5f7', { mate: 1 }], ['h5e5', { cp: 150 }]));
  d3.analysis = analysis(lines(['f6h5', { cp: -600 }]));
  qh5.analysis = analysis(lines(['g7g6', { cp: 20 }]));
  d3.review = reviewMove(d3);
  assert.match(explainMove(d3, { style: 'de' }), /Verpasst Matt in 1 mit Dxf7#/);
});

test('Erklärung: brillantes Opfer', () => {
  const { tree } = parseGame('1. e4 e5 2. Nf3 Nf6 3. Bc4 Nc6 4. Ng5 Qe7 5. Nxf7 d5');
  const [, , , , , , , , , nxf7, d5] = tree.mainline();
  nxf7.analysis = analysis(lines(['d7d5', { cp: -45 }], ['h8g8', { cp: 211 }]));
  d5.analysis = analysis(lines(['c4d5', { cp: -45 }]));
  d5.review = reviewMove(d5);
  assert.equal(d5.review.key, 'brilliant');
  assert.match(explainMove(d5, { style: 'de' }), /Lässt den Turm auf h8 bewusst angegriffen stehen/);
});
