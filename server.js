// Minimaler lokaler Server: liefert die App aus und leitet Anfragen an die
// öffentliche Chess.com-API weiter (Proxy, falls der Browser sie nicht direkt
// abrufen darf). Keine Abhängigkeiten außer Node.js selbst.
//
// Start: npm start   (Port per Umgebungsvariable PORT änderbar, Standard 8080)

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 8080;
const HOST = '127.0.0.1';

// Nur diese Pakete aus node_modules werden unter /vendor/ ausgeliefert.
const VENDOR = {
  'chess.js': path.join(ROOT, 'node_modules', 'chess.js', 'dist', 'esm'),
  'chessground': path.join(ROOT, 'node_modules', 'chessground'),
  'stockfish': path.join(ROOT, 'node_modules', 'stockfish', 'bin'),
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

// Chess.com bittet darum, dass Programme sich mit einer erkennbaren Kennung melden.
const CHESSCOM_UA = 'schachanalyse-local/1.0 (lokale Analyse-App)';
// Erlaubte Pfade der öffentlichen API: Archivliste und Monatsarchiv eines Spielers.
const CHESSCOM_PATH = /^player\/[A-Za-z0-9_-]{1,50}\/games\/(archives|\d{4}\/\d{2})$/;
const cache = new Map(); // url -> { time, status, body }
const CACHE_MS = 60_000;

async function proxyChessCom(apiPath, res) {
  if (!CHESSCOM_PATH.test(apiPath)) {
    return send(res, 400, JSON.stringify({ error: 'Pfad nicht erlaubt' }), MIME['.json']);
  }
  const url = `https://api.chess.com/pub/${apiPath.toLowerCase()}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.time < CACHE_MS) return send(res, hit.status, hit.body, MIME['.json']);
  try {
    const upstream = await fetch(url, { headers: { 'User-Agent': CHESSCOM_UA, Accept: 'application/json' } });
    const body = await upstream.text();
    const status = upstream.ok ? 200 : upstream.status;
    if (upstream.ok) cache.set(url, { time: Date.now(), status, body });
    send(res, status, upstream.ok ? body : JSON.stringify({ error: `Chess.com antwortet mit HTTP ${upstream.status}` }), MIME['.json']);
  } catch (err) {
    send(res, 502, JSON.stringify({ error: `Chess.com nicht erreichbar: ${err.message}` }), MIME['.json']);
  }
}

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(body);
}

// Löst einen URL-Pfad sicher in eine Datei unterhalb von baseDir auf.
function safeJoin(baseDir, rel) {
  const full = path.normalize(path.join(baseDir, rel));
  return full.startsWith(baseDir) ? full : null;
}

async function serveFile(file, res) {
  try {
    const info = await stat(file);
    if (info.isDirectory()) return serveFile(path.join(file, 'index.html'), res);
    const data = await readFile(file);
    send(res, 200, data, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  } catch {
    send(res, 404, 'Nicht gefunden', 'text/plain; charset=utf-8');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = decodeURIComponent(url.pathname);

  if (p.startsWith('/api/chesscom/')) return proxyChessCom(p.slice('/api/chesscom/'.length), res);

  if (p.startsWith('/vendor/')) {
    const [, , pkg, ...rest] = p.split('/');
    const base = VENDOR[pkg];
    const file = base && safeJoin(base, rest.join('/'));
    return file ? serveFile(file, res) : send(res, 404, 'Nicht gefunden', 'text/plain; charset=utf-8');
  }

  const file = safeJoin(PUBLIC_DIR, p === '/' ? 'index.html' : p);
  return file ? serveFile(file, res) : send(res, 403, 'Verboten', 'text/plain; charset=utf-8');
});

server.listen(PORT, HOST, () => {
  console.log(`Schachanalyse läuft auf http://localhost:${PORT}`);
});
