import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGame, normalizeSan, ParseError, setHeaders } from '../public/js/notation.js';

const sans = (tree) => tree.mainline().slice(1).map((n) => n.san);

test('englische Zugfolge', () => {
  const { tree } = parseGame('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6');
  assert.deepEqual(sans(tree), ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
});

test('deutsche Zugfolge', () => {
  const { tree } = parseGame('1. e4 e5 2. Sf3 Sc6 3. Lb5 Sf6 4. 0-0 Le7 5. Te1 d6 6. De2');
  assert.equal(sans(tree).join(' '), 'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Be7 Re1 d6 Qe2');
});

test('deutsche Umwandlung und Schlagzeichen', () => {
  assert.equal(normalizeSan('exd8D+'), 'exd8=Q+');
  assert.equal(normalizeSan('b1=S'), 'b1=N');
  assert.equal(normalizeSan('Lb5:c6'), 'Bb5xc6');
  assert.equal(normalizeSan('Sg1-f3'), 'Ng1f3');
});

test('PGN mit Kopf, Kommentaren, Uhrzeiten und Varianten', () => {
  const pgn = `[Event "Test"]
[White "A"]
[Black "B"]

1. e4 {[%clk 0:03:00]} 1... e5 {[%clk 0:03:00]} 2. Nf3 (2. f4 exf4 (2... d5) 3. Nf3) 2... Nc6 $1 3. Bc4!? 1-0`;
  const { headers, tree } = parseGame(pgn);
  assert.equal(headers.White, 'A');
  assert.deepEqual(sans(tree), ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
  const afterE5 = tree.mainline()[2];
  assert.equal(afterE5.children.length, 2);
  const f4 = afterE5.children.find((c) => !c.main);
  assert.equal(f4.san, 'f4');
  assert.equal(f4.children.map((c) => c.san).join(','), 'exf4,d5');
  assert.equal(f4.children[0].children[0].san, 'Nf3');
});

test('Langschreibweise und UCI', () => {
  const { tree } = parseGame('e2-e4 e7e5 Sg1-f3');
  assert.deepEqual(sans(tree), ['e4', 'e5', 'Nf3']);
});

test('ungültiger Zug gibt verständliche Meldung', () => {
  assert.throws(() => parseGame('1. e4 e5 2. Sf6'), (err) => {
    assert.ok(err instanceof ParseError);
    assert.match(err.message, /„Sf6“ bei Zug 2\. \(Weiß am Zug\)/);
    return true;
  });
});

test('Spielernamen und Elo zu einer reinen Zugfolge hinzufügen', () => {
  const text = setHeaders('1. e4 e5 2. Sf3', { White: 'Anna', WhiteElo: '1500', Black: '', BlackElo: '1720' });
  const { headers, tree } = parseGame(text);
  assert.equal(headers.White, 'Anna');
  assert.equal(headers.WhiteElo, '1500');
  assert.equal(headers.Black, undefined); // leeres Feld wird ignoriert
  assert.equal(headers.BlackElo, '1720');
  assert.equal(tree.mainline().length, 4);
});

test('Felder ersetzen vorhandene Kopfzeilen, Sonderzeichen bleiben erhalten', () => {
  const pgn = '[Event "X"]\n[White "Alt"]\n\n1. d4 d5';
  const text = setHeaders(pgn, { White: 'Max "der Große"', Black: 'Eva\\B' });
  const { headers } = parseGame(text);
  assert.equal(headers.White, 'Max "der Große"');
  assert.equal(headers.Black, 'Eva\\B');
  assert.equal(headers.Event, 'X');
  assert.equal((text.match(/\[White /g) ?? []).length, 1);
});

test('eigene Startstellung per FEN', () => {
  const { tree } = parseGame('[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 Kd7');
  assert.equal(tree.root.ply, 0);
  assert.deepEqual(sans(tree), ['e4', 'Kd7']);
});
