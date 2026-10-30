import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playerInfo, timeClass, formatTimeControl, gameLine } from '../public/js/gameinfo.js';

const chesscom = {
  Site: 'Chess.com', White: 'Daniil_Kolbasenk0', Black: 'Hikaru', WhiteElo: '3124', BlackElo: '3450',
  TimeControl: '180', UTCDate: '2026.10.29', Result: '0-1', Link: 'https://www.chess.com/game/live/186167189226',
};
const lichess = {
  Site: 'https://lichess.org/game/HqjDTU4A', White: 'DrNykterstein', WhiteElo: '3177', WhiteTitle: 'GM',
  TimeControl: '180+0', Date: '2026.10.14', Result: '1-0',
};

test('Zeitklassen', () => {
  assert.equal(timeClass(chesscom), 'Blitz');
  assert.equal(timeClass({ ...chesscom, TimeControl: '60' }), 'Bullet');
  assert.equal(timeClass({ ...chesscom, TimeControl: '600' }), 'Schnellschach');
  assert.equal(timeClass({ ...chesscom, TimeControl: '1/86400' }), 'Täglich');
  assert.equal(timeClass(lichess), 'Blitz');
  assert.equal(timeClass({ ...lichess, TimeControl: '15+0' }), 'UltraBullet');
  assert.equal(timeClass({}), null);
});

test('Bedenkzeit lesbar', () => {
  assert.equal(formatTimeControl('180'), '3+0');
  assert.equal(formatTimeControl('180+2'), '3+2');
  assert.equal(formatTimeControl('90+1'), '1,5+1');
  assert.equal(formatTimeControl('1/172800'), '2 Tag/Zug');
});

test('Spielerangaben', () => {
  const b = playerInfo(chesscom, 'Black');
  assert.equal(b.name, 'Hikaru');
  assert.equal(b.rating, '3450');
  assert.equal(b.ratingLabel, 'Chess.com-Wertung (Blitz) zum Zeitpunkt der Partie');
  assert.equal(playerInfo(lichess, 'White').title, 'GM');
  // nur Zugfolge eingefügt: keine Namen, keine Wertung
  assert.deepEqual(playerInfo({}, 'White'), { name: 'Weiß', title: null, rating: null, ratingLabel: 'Elo' });
});

test('Partiezeile', () => {
  assert.equal(gameLine(chesscom), 'Chess.com · Blitz 3+0 · 29.10.2026 · 0-1');
  assert.equal(gameLine({}), '');
});
