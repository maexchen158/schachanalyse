// Baut die statische Website nach dist/: App aus public/ plus die benötigten
// Dateien aus node_modules unter vendor/ (dieselben Pfade, die server.js liefert).
// Ergebnis läuft auf jedem statischen Webhoster, z. B. GitHub Pages.
//
// Aufruf: npm run build

import { rm, mkdir, cp, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(ROOT, 'dist');
const NM = path.join(ROOT, 'node_modules');

await rm(DIST, { recursive: true, force: true });
await cp(path.join(ROOT, 'public'), DIST, { recursive: true });

const copy = async (from, to) => {
  await mkdir(path.dirname(path.join(DIST, to)), { recursive: true });
  await cp(path.join(NM, from), path.join(DIST, to), { recursive: true });
};

// chess.js (ES-Modul)
await copy('chess.js/dist/esm/chess.js', 'vendor/chess.js/chess.js');

// chessground: alle Module und die Stylesheets
for (const f of await readdir(path.join(NM, 'chessground/dist'))) {
  if (f.endsWith('.js')) await copy(`chessground/dist/${f}`, `vendor/chessground/dist/${f}`);
}
for (const f of ['chessground.base.css', 'chessground.cburnett.css']) {
  await copy(`chessground/assets/${f}`, `vendor/chessground/assets/${f}`);
}

// Stockfish: volle Engine (~95 MB) und Lite-Engine, beide Single-Thread.
// Sie landen nicht im Git-Repository, sondern werden beim Bauen aus node_modules kopiert.
for (const f of [
  'stockfish-19-single.js', 'stockfish-19-single.wasm',
  'stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm',
]) {
  await copy(`stockfish/bin/${f}`, `vendor/stockfish/${f}`);
}

// GitHub Pages soll die Dateien unverändert ausliefern (kein Jekyll)
await writeFile(path.join(DIST, '.nojekyll'), '');

console.log('Website gebaut: dist/');
