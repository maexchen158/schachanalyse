// Pfeile und Kreise auf dem Brett als eigene SVG-Ebene. Sie liegt über den
// Feldern, aber unter den Figuren. Springerzüge werden als L gezeichnet
// (erst zwei Felder geradeaus, dann eines zur Seite).

const NS = 'http://www.w3.org/2000/svg';

// Maße in Feldern (ein Feld = 1)
const SHAFT = 0.2;       // Breite des Schafts
const HEAD_LEN = 0.42;   // Länge der Spitze
const HEAD_WIDTH = 0.52; // Breite der Spitze
const RING = 0.075;      // Strichstärke der Kreise

// Farben: Engine-Pfeil und die vier Pinsel von chessground (Rechtsklick ziehen;
// mit Umschalt/Strg = rot, Alt = blau, beides = gelb)
export const ARROW_COLORS = {
  engine: '#5c9e31',
  green: '#f0a12c',
  red: '#d9452f',
  blue: '#3f86d6',
  yellow: '#e2c23a',
};
const OPACITY = 0.82;

const fmt = (n) => Number(n.toFixed(3));

// Punkte des Pfeils von a nach b (Feldmitten in Bildschirmkoordinaten)
export function arrowPoints(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const knight = (Math.abs(dx) === 1 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 1);
  if (!knight) return [a, b];
  // Das lange Bein zuerst
  const corner = Math.abs(dy) === 2 ? { x: a.x, y: b.y } : { x: b.x, y: a.y };
  return [a, corner, b];
}

function arrowSvg(points, color) {
  const tip = points[points.length - 1];
  const prev = points[points.length - 2];
  const len = Math.hypot(tip.x - prev.x, tip.y - prev.y);
  const ux = (tip.x - prev.x) / len;
  const uy = (tip.y - prev.y) / len;
  // Schaft endet am Anfang der Spitze
  const base = { x: tip.x - ux * HEAD_LEN, y: tip.y - uy * HEAD_LEN };
  const shaft = [...points.slice(0, -1), base].map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ');
  const px = -uy * (HEAD_WIDTH / 2);
  const py = ux * (HEAD_WIDTH / 2);
  const head = [tip, { x: base.x + px, y: base.y + py }, { x: base.x - px, y: base.y - py }]
    .map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ');
  // Gruppen-Deckkraft statt Einzel-Deckkraft: Überlappungen werden nicht dunkler
  return `<g opacity="${OPACITY}"><polyline points="${shaft}" fill="none" stroke="${color}" stroke-width="${SHAFT}" stroke-linejoin="miter" stroke-miterlimit="4"/>`
    + `<polygon points="${head}" fill="${color}"/></g>`;
}

function circleSvg(c, color) {
  return `<circle cx="${c.x}" cy="${c.y}" r="${0.5 - RING / 2 - 0.02}" fill="none" stroke="${color}" stroke-width="${RING}" opacity="${OPACITY}"/>`;
}

export class ArrowLayer {
  // squareXY: Funktion Feld -> {x, y} (0–7, abhängig von der Brettausrichtung)
  constructor(parent, squareXY) {
    this.squareXY = squareXY;
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('class', 'arrow-layer');
    this.svg.setAttribute('viewBox', '0 0 8 8');
    this.svg.setAttribute('preserveAspectRatio', 'none');
    this.svg.setAttribute('aria-hidden', 'true');
    parent.appendChild(this.svg);
  }

  center(square) {
    const { x, y } = this.squareXY(square);
    return { x: x + 0.5, y: y + 0.5 };
  }

  // shapes: [{ orig, dest?, color }]
  render(shapes) {
    this.svg.innerHTML = shapes.map((s) => {
      if (!s.orig) return '';
      if (!s.dest || s.dest === s.orig) return circleSvg(this.center(s.orig), s.color);
      return arrowSvg(arrowPoints(this.center(s.orig), this.center(s.dest)), s.color);
    }).join('');
  }
}
