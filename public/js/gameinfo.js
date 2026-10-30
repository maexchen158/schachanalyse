// Angaben aus dem PGN-Kopf: Plattform, Zeitklasse, Wertungen, Titel.

export function platformOf(headers) {
  const where = `${headers.Site ?? ''} ${headers.Link ?? ''}`.toLowerCase();
  if (where.includes('chess.com')) return 'Chess.com';
  if (where.includes('lichess')) return 'Lichess';
  return null;
}

// "180" -> 3+0, "180+2" -> 3+2, "1/86400" -> 1 Tag/Zug
export function formatTimeControl(tc) {
  if (!tc || tc === '-' || tc === '?') return null;
  const daily = tc.match(/^1\/(\d+)$/);
  if (daily) return `${Math.round(Number(daily[1]) / 86400)} Tag/Zug`;
  const m = tc.match(/^(\d+)(?:\+(\d+))?$/);
  if (!m) return null;
  const base = Number(m[1]);
  const min = base % 60 === 0 ? String(base / 60) : (base / 60).toFixed(1).replace('.', ',');
  return `${min}+${m[2] ?? 0}`;
}

// Zeitklasse wie auf der jeweiligen Plattform (geschätzte Dauer = Grundzeit + 40 × Inkrement)
export function timeClass(headers) {
  const tc = headers.TimeControl;
  const platform = platformOf(headers);
  if (!tc || tc === '?') return null;
  if (/^1\//.test(tc) || tc === '-') return platform === 'Lichess' ? 'Fernschach' : 'Täglich';
  const m = tc.match(/^(\d+)(?:\+(\d+))?$/);
  if (!m) return null;
  const est = Number(m[1]) + 40 * Number(m[2] ?? 0);
  if (platform === 'Lichess') {
    if (est < 30) return 'UltraBullet';
    if (est < 180) return 'Bullet';
    if (est < 480) return 'Blitz';
    if (est < 1500) return 'Schnellschach';
    return 'Klassisch';
  }
  if (est < 180) return 'Bullet';
  if (est < 600) return 'Blitz';
  return 'Schnellschach';
}

const clean = (v) => (v && v !== '?' && v !== '-' ? v : null);

// Name, Titel und Wertung eines Spielers. color: 'White' oder 'Black'
export function playerInfo(headers, color) {
  const platform = platformOf(headers);
  const cls = timeClass(headers);
  const rating = clean(headers[`${color}Elo`]);
  let ratingLabel = 'Elo';
  if (platform) ratingLabel = `${platform}-Wertung${cls ? ` (${cls})` : ''} zum Zeitpunkt der Partie`;
  return {
    name: clean(headers[color]) ?? (color === 'White' ? 'Weiß' : 'Schwarz'),
    title: clean(headers[`${color}Title`]),
    rating,
    ratingLabel,
  };
}

// Kurzzeile unter dem Eröffnungsnamen, z. B. "Chess.com · Blitz 3+0 · 29.10.2026 · 0-1"
export function gameLine(headers) {
  const parts = [];
  const platform = platformOf(headers);
  if (platform) parts.push(platform);
  const cls = timeClass(headers);
  const tc = formatTimeControl(headers.TimeControl);
  if (cls || tc) parts.push([cls, tc].filter(Boolean).join(' '));
  const date = clean(headers.UTCDate ?? headers.Date);
  const dm = date?.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (dm) parts.push(`${dm[3]}.${dm[2]}.${dm[1]}`);
  else if (date && /^\d{4}/.test(date)) parts.push(date.slice(0, 4));
  const result = clean(headers.Result === '*' ? null : headers.Result);
  if (result) parts.push(result.replace('1/2-1/2', '½-½'));
  return parts.join(' · ');
}
