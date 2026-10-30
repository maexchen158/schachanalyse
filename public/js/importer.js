// Partie über einen Link laden.
//
// Lichess:   offizielle API, PGN-Export per Game-ID (CORS erlaubt, direkter Abruf).
//            Auch Studienkapitel (lichess.org/study/<studie>/<kapitel>) gehen.
// Chess.com: Die öffentliche API (api.chess.com) kennt keinen Abruf einzelner
//            Partien per ID. Deshalb werden die Monatsarchive eines Spielers
//            durchsucht. Klappt der direkte Abruf im Browser nicht (CORS,
//            Bot-Schutz), läuft er über den lokalen Proxy in server.js.

export class ImportError extends Error {
  constructor(message) {
    super(message);
    this.userFacing = true;
  }
}

// Erkennt Plattform und ID aus einem Link
export function parseGameLink(input) {
  const text = (input || '').trim();
  if (!text) throw new ImportError('Bitte einen Partie-Link eingeben.');
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw new ImportError('Das sieht nicht wie ein Link aus.');
  }
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);

  if (host === 'lichess.org') {
    if (parts[0] === 'study' && parts[1] && parts[2]) {
      return { site: 'lichess-study', study: parts[1], chapter: parts[2].slice(0, 8) };
    }
    const id = parts.find((p) => /^[a-zA-Z0-9]{8}([a-zA-Z0-9]{4})?$/.test(p));
    if (!id) throw new ImportError('In diesem Lichess-Link steckt keine Partie-ID.');
    return { site: 'lichess', id: id.slice(0, 8) };
  }

  if (host === 'chess.com') {
    // /game/live/123, /game/daily/123, /live/game/123, /daily/game/123, /analysis/game/live/123
    const id = parts.find((p) => /^\d{5,}$/.test(p));
    if (!id) throw new ImportError('In diesem Chess.com-Link steckt keine Partie-ID.');
    const type = parts.includes('daily') ? 'daily' : 'live';
    // Links aus dem Chess.com-Archiv enthalten oft "?username=…" – dann ist kein Name nötig
    const user = url.searchParams.get('username');
    return user ? { site: 'chesscom', id, type, user } : { site: 'chesscom', id, type };
  }

  throw new ImportError('Nur Links von lichess.org und chess.com werden unterstützt.');
}

async function fetchText(url, accept) {
  let res;
  try {
    res = await fetch(url, { headers: accept ? { Accept: accept } : {} });
  } catch {
    throw new ImportError('Server nicht erreichbar. Besteht eine Internetverbindung?');
  }
  return res;
}

async function fetchLichess({ id }) {
  const res = await fetchText(`https://lichess.org/game/export/${id}?clocks=false&evals=false&literate=false`, 'application/x-chess-pgn');
  if (res.status === 404) throw new ImportError(`Lichess-Partie „${id}“ nicht gefunden.`);
  if (res.status === 429) throw new ImportError('Lichess meldet zu viele Anfragen. Bitte eine Minute warten.');
  if (!res.ok) throw new ImportError(`Lichess antwortet mit Fehler ${res.status}.`);
  return res.text();
}

async function fetchLichessStudy({ study, chapter }) {
  const res = await fetchText(`https://lichess.org/api/study/${study}/${chapter}.pgn?clocks=false&comments=false`, 'application/x-chess-pgn');
  if (res.status === 404) throw new ImportError('Studienkapitel nicht gefunden (oder die Studie ist privat).');
  if (!res.ok) throw new ImportError(`Lichess antwortet mit Fehler ${res.status}.`);
  return res.text();
}

// ---------- Chess.com ----------

let chesscomVia = null; // 'direct' oder 'proxy', sobald bekannt

// Ruft einen Pfad der öffentlichen Chess.com-API ab, direkt oder über den Proxy.
async function chesscomJson(path) {
  const order = chesscomVia ? [chesscomVia] : ['direct', 'proxy'];
  let lastError = null;
  for (const via of order) {
    const url = via === 'direct' ? `https://api.chess.com/pub/${path}` : `api/chesscom/${path}`;
    try {
      const res = await fetch(url);
      if (res.status === 404) return { notFound: true };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      chesscomVia = via;
      return data;
    } catch (err) {
      lastError = err;
    }
  }
  throw new ImportError(`Chess.com-API nicht erreichbar (${lastError?.message ?? 'unbekannt'}). Läuft die App über „npm start“? Der Proxy steckt in server.js.`);
}

async function fetchChessCom({ id, type }, { user, onStatus }) {
  if (!user) {
    throw new ImportError('Für Chess.com-Links bitte den Benutzernamen eines der beiden Spieler angeben. Die öffentliche API liefert Partien nur über die Archive eines Spielers.');
  }
  const name = user.trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,50}$/.test(name)) throw new ImportError('Ungültiger Chess.com-Benutzername.');

  onStatus?.('Archive werden geladen …');
  const archives = await chesscomJson(`player/${name}/games/archives`);
  if (archives.notFound) throw new ImportError(`Chess.com-Spieler „${user}“ nicht gefunden.`);
  const months = (archives.archives ?? []).slice().reverse();
  if (!months.length) throw new ImportError(`„${user}“ hat keine öffentlichen Partien.`);

  for (const monthUrl of months) {
    const m = monthUrl.match(/games\/(\d{4})\/(\d{2})$/);
    if (!m) continue;
    onStatus?.(`Suche in ${m[2]}/${m[1]} …`);
    const data = await chesscomJson(`player/${name}/games/${m[1]}/${m[2]}`);
    const game = (data.games ?? []).find((g) => g.url?.endsWith(`/${id}`));
    if (game?.pgn) return game.pgn;
    // Partie-IDs wachsen mit der Zeit: ist die älteste Partie des Monats schon
    // jünger als die gesuchte, muss weiter zurück gesucht werden – sonst kann
    // sie in älteren Monaten nicht mehr auftauchen.
    // (Nur für Live-Partien; Fernschachpartien haben eine eigene Nummernfolge.)
    const ids = (data.games ?? [])
      .filter((g) => g.url?.includes('/live/'))
      .map((g) => Number(g.url.split('/').pop()))
      .filter(Number.isFinite);
    if (type === 'live' && ids.length && Math.max(...ids) < Number(id)) break;
  }
  throw new ImportError(`Partie ${id} wurde in den Archiven von „${user}“ nicht gefunden. Ist der Name richtig und die Partie beendet?`);
}

export async function fetchGameFromLink(link, { user = '', onStatus } = {}) {
  const info = parseGameLink(link);
  if (info.site === 'lichess') return fetchLichess(info);
  if (info.site === 'lichess-study') return fetchLichessStudy(info);
  return fetchChessCom(info, { user: user || info.user || '', onStatus });
}
