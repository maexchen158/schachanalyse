import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGameLink, ImportError } from '../public/js/importer.js';

test('Lichess-Links', () => {
  assert.deepEqual(parseGameLink('https://lichess.org/abcdEFGH'), { site: 'lichess', id: 'abcdEFGH' });
  assert.deepEqual(parseGameLink('lichess.org/abcdEFGHijkl'), { site: 'lichess', id: 'abcdEFGH' });
  assert.deepEqual(parseGameLink('https://lichess.org/abcdEFGH/black#12'), { site: 'lichess', id: 'abcdEFGH' });
  assert.deepEqual(parseGameLink('https://lichess.org/study/AbCdEfGh/IjKlMnOp'), { site: 'lichess-study', study: 'AbCdEfGh', chapter: 'IjKlMnOp' });
});

test('Chess.com-Links', () => {
  assert.deepEqual(parseGameLink('https://www.chess.com/game/live/186167189226'), { site: 'chesscom', id: '186167189226', type: 'live' });
  assert.deepEqual(parseGameLink('https://www.chess.com/game/daily/712345678'), { site: 'chesscom', id: '712345678', type: 'daily' });
  assert.deepEqual(parseGameLink('https://www.chess.com/analysis/game/live/186167189226?tab=review'), { site: 'chesscom', id: '186167189226', type: 'live' });
});

test('ungültige Links', () => {
  assert.throws(() => parseGameLink(''), ImportError);
  assert.throws(() => parseGameLink('https://example.com/game/1'), /Nur Links von lichess.org und chess.com/);
  assert.throws(() => parseGameLink('https://www.chess.com/home'), /keine Partie-ID/);
});
