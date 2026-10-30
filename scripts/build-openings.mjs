// Lädt die Eröffnungsdatenbank lichess-org/chess-openings (CC0) und erzeugt
// public/data/openings.json.
//
// Format der Ausgabe:
//   names:     Liste [eco, name]
//   positions: Stellungsschlüssel -> Index in names (benannte Stellung)
//                                    oder -1 (Zwischenstellung einer Theorielinie)
//
// Aufruf: npm run openings

import { writeFile, mkdir } from 'node:fs/promises';
import { Chess } from 'chess.js';
import { positionKey } from '../public/js/openings.js';

const BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master/';
const FILES = ['a.tsv', 'b.tsv', 'c.tsv', 'd.tsv', 'e.tsv'];

const names = [];
const positions = {};

for (const file of FILES) {
  const res = await fetch(BASE + file);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  const lines = (await res.text()).trim().split('\n').slice(1);
  for (const line of lines) {
    const [eco, name, pgn] = line.split('\t');
    const chess = new Chess();
    chess.loadPgn(pgn);
    const moves = chess.history();
    const replay = new Chess();
    for (const san of moves) {
      replay.move(san);
      const key = positionKey(replay.fen());
      if (!(key in positions)) positions[key] = -1;
    }
    names.push([eco, name]);
    // Endet eine Linie in einer schon benannten Stellung (Zugumstellung),
    // behält die Stellung den ersten Namen.
    const endKey = positionKey(replay.fen());
    if (positions[endKey] === -1) positions[endKey] = names.length - 1;
  }
  console.log(`${file}: ${lines.length} Linien`);
}

await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
await writeFile(new URL('../public/data/openings.json', import.meta.url), JSON.stringify({ names, positions }));
console.log(`${names.length} Eröffnungen, ${Object.keys(positions).length} Stellungen`);
