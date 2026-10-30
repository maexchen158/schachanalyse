// Eröffnungsdatenbank (lokal, aus lichess-org/chess-openings erzeugt).

let db = null;

// Stellungsschlüssel: Figurenstellung, Zugrecht, Rochaderechte.
// Das En-passant-Feld wird ignoriert, damit Zugumstellungen sicher erkannt werden.
export function positionKey(fen) {
  return fen.split(' ').slice(0, 3).join(' ');
}

export async function loadOpenings(url = 'data/openings.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Eröffnungsdatenbank nicht ladbar');
  db = await res.json();
  return db;
}

// Für Tests: Datenbank direkt setzen.
export function setOpenings(data) {
  db = data;
}

// null = keine Theorie; sonst { eco, name } (name kann null sein bei Zwischenstellungen)
export function lookupOpening(fen) {
  if (!db) return null;
  const idx = db.positions[positionKey(fen)];
  if (idx === undefined) return null;
  if (idx < 0) return { eco: null, name: null };
  const [eco, name] = db.names[idx];
  return { eco, name };
}
