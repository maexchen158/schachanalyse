// Bewertungsgraph über die Hauptpartie (Gewinnwahrscheinlichkeit für Weiß).

import { winPercent } from './classify.js';
import { CATEGORIES } from './categories.js';

const H = 90;
const MARKED = new Set(['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder']);

export class EvalGraph {
  constructor(el, { onSelect }) {
    this.el = el;
    this.onSelect = onSelect;
    // Breite folgt dem Panel, damit Punkte rund bleiben
    new ResizeObserver(() => {
      if (this.nodes && el.clientWidth && el.clientWidth !== this.width) this.render(this.nodes, this.current);
    }).observe(el);
    el.addEventListener('click', (ev) => {
      const svg = el.querySelector('svg');
      if (!svg || !this.nodes?.length) return;
      const r = svg.getBoundingClientRect();
      const i = Math.round(((ev.clientX - r.left) / r.width) * (this.nodes.length - 1));
      const node = this.nodes[Math.max(0, Math.min(this.nodes.length - 1, i))];
      if (node) this.onSelect(node);
    });
  }

  render(mainline, current) {
    this.nodes = mainline;
    this.current = current;
    this.width = this.el.clientWidth;
    const W = Math.max(200, this.width - 12);
    const n = mainline.length;
    if (n < 2 || !mainline.some((m) => m.analysis)) {
      this.el.innerHTML = '';
      return;
    }
    const x = (i) => (i / (n - 1)) * W;
    const y = (w) => H - (w / 100) * H;

    // Fehlende Werte mit dem letzten bekannten Wert füllen, damit die Kurve geschlossen bleibt
    let last = 50;
    const pts = mainline.map((node, i) => {
      if (node.analysis) last = winPercent(node.analysis.score);
      return [x(i), y(last)];
    });
    const line = pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
    const area = `0,${H} ${line} ${W},${H}`;

    const dots = mainline.map((node, i) => {
      const key = node.review?.key;
      if (!MARKED.has(key)) return '';
      const [px, py] = pts[i];
      return `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.4" fill="${CATEGORIES[key].color}" stroke="#1c1d20" stroke-width="1"><title>${CATEGORIES[key].label}</title></circle>`;
    }).join('');

    const ci = mainline.indexOf(current);
    const cursor = ci >= 0
      ? `<line x1="${x(ci)}" x2="${x(ci)}" y1="0" y2="${H}" stroke="#7cb342" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`
      : '';

    this.el.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bewertungsverlauf">
        <rect width="${W}" height="${H}" fill="#3b3a37"/>
        <polygon points="${area}" fill="#ecebe6"/>
        <line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="#888" stroke-width="1" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" opacity=".6"/>
        ${cursor}
        ${dots}
      </svg>`;
  }
}
