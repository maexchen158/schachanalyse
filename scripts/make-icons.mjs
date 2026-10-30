// Erzeugt die App-Symbole (PNG) für Installation und Taskleiste.
// Motiv: weißer Springer aus dem cburnett-Satz (wie auf dem Brett) auf
// 2×2 Feldern in den Brettfarben. Gezeichnet wird mit Edge/Chrome im
// Hintergrund (Headless-Screenshot), damit kein Grafikpaket nötig ist.
//
// Aufruf: npm run icons   (nur nötig, wenn sich das Symbol ändern soll)

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'public', 'icons');
const LIGHT = '#e9e8cd';
const DARK = '#6f9150';

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
];
const browser = BROWSERS.find((b) => existsSync(b));
if (!browser) throw new Error('Kein Edge/Chrome gefunden.');

const css = await readFile(path.join(ROOT, 'node_modules/chessground/assets/chessground.cburnett.css'), 'utf8');
const knight = css.match(/piece\.knight\.white\s*\{\s*background-image:\s*url\('([^']+)'\)/)[1];

// maskable: Hintergrund bis zum Rand, Figur kleiner (Systeme schneiden Kreise/Formen aus)
function page(size, maskable) {
  const radius = maskable ? 0 : size * 0.2;
  const piece = maskable ? 0.62 : 0.84;
  return `<!doctype html><html><head><style>
    html, body { margin: 0; background: transparent; }
    .icon { width: ${size}px; height: ${size}px; border-radius: ${radius}px; overflow: hidden; position: relative;
      background: conic-gradient(${DARK} 0 25%, ${LIGHT} 0 50%, ${DARK} 0 75%, ${LIGHT} 0) 0 0 / 100% 100%; }
    .icon::after { content: ''; position: absolute; inset: 0;
      background: url('${knight}') center 52% / ${piece * 100}% no-repeat;
      filter: drop-shadow(0 ${size * 0.015}px ${size * 0.02}px rgba(0,0,0,.45)); }
  </style></head><body><div class="icon"></div></body></html>`;
}

const tmp = path.join(os.tmpdir(), `schachanalyse-icons-${process.pid}`);
await mkdir(tmp, { recursive: true });
await mkdir(OUT, { recursive: true });

const variants = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
];
for (const [name, size, maskable] of variants) {
  const html = path.join(tmp, `${name}.html`);
  await writeFile(html, page(size, maskable));
  execFileSync(browser, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    `--user-data-dir=${path.join(tmp, 'profil')}`,
    '--default-background-color=00000000',
    `--window-size=${size},${size}`,
    `--screenshot=${path.join(OUT, name)}`,
    pathToFileURL(html).href,
  ], { stdio: 'ignore' });
  console.log(`${name} (${size}×${size})`);
}
await rm(tmp, { recursive: true, force: true });
