// Zugliste: Hauptpartie zweispaltig (Weiß/Schwarz), Varianten eingerückt darunter.

import { moveNumber } from './tree.js';
import { formatSan } from './notation.js';
import { badgeHtml } from './categories.js';

export class MoveList {
  constructor(el, { onSelect, onDelete }) {
    this.el = el;
    this.style = 'figurine';
    el.addEventListener('click', (ev) => {
      const del = ev.target.closest('[data-delete]');
      if (del) {
        ev.stopPropagation();
        onDelete(Number(del.dataset.delete));
        return;
      }
      const mv = ev.target.closest('[data-id]');
      if (mv) onSelect(Number(mv.dataset.id));
    });
  }

  render(tree, current) {
    if (!tree) {
      this.el.innerHTML = '<p class="empty">Noch keine Partie geladen.</p>';
      return;
    }
    this.current = current;
    const out = [];
    let row = null; // { num, white, black }

    const flush = () => {
      if (!row) return;
      out.push(`<div class="ml-row"><span class="ml-num">${row.num}.</span>${row.white ?? '<span class="ml-cell empty">…</span>'}${row.black ?? '<span class="ml-cell empty"></span>'}</div>`);
      row = null;
    };

    for (const p of tree.mainline()) {
      const main = tree.mainChild(p);
      const vars = p.children.filter((c) => !c.main);
      if (main) {
        const cell = this.cell(main);
        if (main.color === 'w') {
          flush();
          row = { num: moveNumber(main), white: cell };
        } else {
          if (!row) row = { num: moveNumber(main) };
          row.black = cell;
          flush();
        }
      }
      if (vars.length) {
        flush();
        for (const v of vars) out.push(this.variation(v));
      }
    }
    flush();
    this.el.innerHTML = out.join('') || '<p class="empty">Keine Züge.</p>';
    this.scrollToCurrent();
  }

  cell(node) {
    const cls = ['ml-cell', 'mv'];
    if (node === this.current) cls.push('current');
    return `<span class="${cls.join(' ')}" data-id="${node.id}">${this.label(node)}</span>`;
  }

  label(node) {
    const badge = node.review ? badgeHtml(node.review.key, 'small') : '';
    return `<span class="san">${formatSan(node.san, this.style)}</span>${badge}`;
  }

  // Eine Variante (ab start) als eingerückter Block, Untervarianten verschachtelt
  variation(start) {
    const parts = [];
    let needNumber = true;
    for (let n = start; n; n = n.children[0] ?? null) {
      parts.push(this.inlineMove(n, needNumber || n.color === 'w'));
      needNumber = false;
      // Alternativen zu n stehen direkt nach n (die zu start setzt der Aufrufer)
      if (n !== start) {
        for (const alt of n.parent.children.slice(1)) {
          parts.push(this.variation(alt));
          needNumber = true;
        }
      }
    }
    return `<div class="ml-var"><button type="button" class="ml-del" data-delete="${start.id}" title="Variante löschen">✕</button>${parts.join(' ')}</div>`;
  }

  inlineMove(node, withNumber) {
    const num = withNumber ? `${moveNumber(node)}${node.color === 'w' ? '.' : '…'} ` : '';
    const cls = node === this.current ? 'mv current' : 'mv';
    return `<span class="${cls}" data-id="${node.id}"><span class="ml-vnum">${num}</span>${this.label(node)}</span>`;
  }

  scrollToCurrent() {
    const el = this.el.querySelector('.current');
    if (!el) {
      if (this.current && !this.current.parent) this.el.scrollTop = 0;
      return;
    }
    const box = this.el.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.top < box.top || r.bottom > box.bottom) {
      this.el.scrollTop += r.top - box.top - box.height / 2 + r.height / 2;
    }
  }
}
