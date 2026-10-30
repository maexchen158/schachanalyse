// Partiebaum: Hauptpartie plus beliebig verschachtelte Varianten.
//
// Jeder Knoten ist eine Stellung. Der Wurzelknoten ist die Ausgangsstellung,
// jeder weitere Knoten die Stellung nach seinem Zug (san/uci).
// Knoten der Hauptpartie tragen main = true.

let nextId = 1;

export function createNode({ fen, parent = null, move = null, main = false }) {
  const node = {
    id: nextId++,
    fen,
    parent,
    children: [],
    main,
    ply: parent ? parent.ply + 1 : plyFromFen(fen),
    san: move?.san ?? null,
    uci: move ? move.from + move.to + (move.promotion ?? '') : null,
    from: move?.from ?? null,
    to: move?.to ?? null,
    color: move?.color ?? null,       // 'w' oder 'b': wer den Zug gemacht hat
    captured: move?.captured ?? null,
    analysis: null,                   // Ergebnis der Engine für diese Stellung
    review: null,                     // Klassifizierung des Zuges, der hierher führte
    opening: null,                    // Eröffnungseintrag dieser Stellung (falls Theorie)
  };
  return node;
}

// Halbzugzählung aus der FEN, damit Partien mit eigener Startstellung stimmen.
function plyFromFen(fen) {
  const parts = fen.split(' ');
  const moveNo = Number(parts[5]) || 1;
  return (moveNo - 1) * 2 + (parts[1] === 'b' ? 1 : 0);
}

// Zugnummer des Zuges, der zu diesem Knoten führte
export function moveNumber(node) {
  return Math.floor((node.ply - 1) / 2) + 1;
}

export class GameTree {
  constructor(startFen) {
    this.root = createNode({ fen: startFen, main: true });
    this.byId = new Map([[this.root.id, this.root]]);
  }

  // Fügt einen Zug an; existiert er schon, wird der vorhandene Knoten geliefert.
  addMove(parent, move, fen, { main = false } = {}) {
    const uci = move.from + move.to + (move.promotion ?? '');
    const existing = parent.children.find((c) => c.uci === uci);
    if (existing) return { node: existing, created: false };
    const node = createNode({ fen, parent, move, main });
    if (main) parent.children.unshift(node);
    else parent.children.push(node);
    this.byId.set(node.id, node);
    return { node, created: true };
  }

  get(id) {
    return this.byId.get(id);
  }

  // Hauptpartie als Liste ab Wurzel (inklusive Wurzel)
  mainline() {
    const list = [this.root];
    let node = this.root;
    for (;;) {
      const next = node.children.find((c) => c.main);
      if (!next) break;
      list.push(next);
      node = next;
    }
    return list;
  }

  mainChild(node) {
    return node.children.find((c) => c.main) ?? null;
  }

  // Weg von der Wurzel zu einem Knoten (inklusive beider Enden)
  path(node) {
    const list = [];
    for (let n = node; n; n = n.parent) list.push(n);
    return list.reverse();
  }

  // Nächster Knoten "vorwärts": in der Hauptpartie der Hauptzug,
  // in einer Variante deren Fortsetzung.
  next(node) {
    return this.mainChild(node) ?? node.children[0] ?? null;
  }

  // Letzter Knoten der Linie, in der sich node befindet
  lineEnd(node) {
    let n = node;
    for (let c = this.next(n); c; c = this.next(n)) n = c;
    return n;
  }

  // Entfernt einen Knoten samt allen Folgezügen (nur Varianten).
  remove(node) {
    if (!node.parent || node.main) return false;
    const siblings = node.parent.children;
    siblings.splice(siblings.indexOf(node), 1);
    const stack = [node];
    while (stack.length) {
      const n = stack.pop();
      this.byId.delete(n.id);
      stack.push(...n.children);
    }
    return true;
  }

  // Erster Knoten der Variante, zu der node gehört (null in der Hauptpartie)
  variationStart(node) {
    if (node.main) return null;
    let n = node;
    while (n.parent && !n.parent.main && n.parent.children[0] === n) n = n.parent;
    return n;
  }

  // Alle Knoten (Tiefensuche, Hauptzug zuerst)
  all() {
    const out = [];
    const stack = [this.root];
    while (stack.length) {
      const n = stack.pop();
      out.push(n);
      for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
    }
    return out;
  }
}
