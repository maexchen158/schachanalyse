// Zugkategorien: Schlüssel, Beschriftung, Farbe und Symbol.
// Die Symbole sind eigene SVG-Zeichnungen im üblichen Stil von Analyse-Seiten
// (farbiger Kreis, weißes Zeichen); keine fremden Grafiken.

export const CATEGORIES = {
  brilliant:  { label: 'Brillant',          color: '#1fb3a8' },
  great:      { label: 'Großartig',         color: '#5b8bb4' },
  best:       { label: 'Bester Zug',        color: '#81b64c' },
  excellent:  { label: 'Ausgezeichnet',     color: '#95bb4a' },
  good:       { label: 'Gut',               color: '#93ad8a' },
  book:       { label: 'Theorie',           color: '#a8876a' },
  inaccuracy: { label: 'Ungenauigkeit',     color: '#f2be48' },
  mistake:    { label: 'Fehler',            color: '#e88e2c' },
  miss:       { label: 'Verpasster Gewinn', color: '#ec6650' },
  blunder:    { label: 'Blunder',           color: '#d0392f' },
};

// Reihenfolge in der Übersicht
export const CATEGORY_ORDER = [
  'brilliant', 'great', 'best', 'excellent', 'good', 'book',
  'inaccuracy', 'mistake', 'miss', 'blunder',
];

// ---------- Zeichen (viewBox 0 0 24 24, weiß) ----------

const exclaim = (cx) => `<rect x="${cx - 1.35}" y="5.2" width="2.7" height="8.6" rx="1.35"/><circle cx="${cx}" cy="17.4" r="1.55"/>`;
const question = (cx) => `<path d="M${cx - 2.6} 8.5a2.75 2.75 0 1 1 3.95 2.45c-.95.5-1.35 1.15-1.35 2.25v.55" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${cx}" cy="17.4" r="1.55"/>`;
// Zwei Zeichen nebeneinander etwas kleiner, damit sie in den Kreis passen
const pair = (inner) => `<g transform="translate(12 12) scale(.86) translate(-12 -12)">${inner}</g>`;

const GLYPHS = {
  brilliant: pair(exclaim(8.9) + exclaim(15.1)),
  great: exclaim(12),
  best: '<polygon points="12,5.2 13.82,10.09 19.04,10.31 14.95,13.56 16.35,18.59 12,15.7 7.65,18.59 9.05,13.56 4.96,10.31 10.18,10.09"/>',
  excellent: '<rect x="5" y="11" width="3" height="7.6" rx=".8"/><path d="M9.2 18.6h6.3c.9 0 1.65-.6 1.85-1.45l1.15-4.55c.3-1.1-.5-2.15-1.65-2.15h-3.35l.5-2.6c.2-1-.4-1.95-1.35-2.2l-.45-.1-3 4.65z"/>',
  good: '<polyline points="6.6,12.6 10.4,16.3 17.6,8.6" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>',
  book: '<path d="M4.9 7.1c2.35-.65 4.7-.3 6.4 1.05v9.7c-1.7-1.25-4.05-1.55-6.4-.95zM19.1 7.1c-2.35-.65-4.7-.3-6.4 1.05v9.7c1.7-1.25 4.05-1.55 6.4-.95z"/>',
  inaccuracy: pair(question(9.2) + exclaim(16.2)),
  mistake: question(12.6),
  miss: '<path d="M8 8l8 8M16 8l-8 8" stroke="#fff" stroke-width="2.9" stroke-linecap="round"/>',
  blunder: pair(question(9.4) + question(16.4)),
};

export function badgeHtml(key, extraClass = '') {
  const c = CATEGORIES[key];
  if (!c) return '';
  return `<svg class="badge badge-${key} ${extraClass}" viewBox="0 0 24 24" role="img" aria-label="${c.label}">`
    + `<title>${c.label}</title>`
    + '<circle cx="12" cy="12.9" r="11" fill="rgba(0,0,0,.3)"/>'
    + `<circle cx="12" cy="12" r="11" fill="${c.color}"/>`
    + `<g fill="#fff">${GLYPHS[key]}</g></svg>`;
}
