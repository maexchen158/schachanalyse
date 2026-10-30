// Steuert die Analyse eines Partiebaums: verteilt Stellungen an die Engines,
// speichert Ergebnisse an den Knoten und klassifiziert die Züge.

import { EnginePool } from './engine.js';
import { ENGINE } from './config.js';
import { terminalAnalysis, buildAnalysis, reviewMove, isBookMove } from './classify.js';
import { lookupOpening } from './openings.js';

export class Analyzer {
  constructor({ depth, workers, onUpdate, onProgress }) {
    this.depth = depth;
    this.onUpdate = onUpdate;
    this.onProgress = onProgress;
    this.pool = new EnginePool({ url: ENGINE.file, size: workers, hashMb: ENGINE.hashMb });
    this.total = 0;
    this.done = 0;
    this.pendingNodes = new Set();
  }

  setWorkers(n) {
    this.pool.resize(n);
  }

  // Ganze Partie analysieren: zuerst die Hauptpartie, dann Varianten.
  // force: vorhandene Ergebnisse verwerfen (z. B. nach Änderung der Tiefe).
  analyseTree(tree, { force = false } = {}) {
    this.pool.cancelAll();
    this.pendingNodes.clear();
    this.total = 0;
    this.done = 0;
    const main = tree.mainline();
    const rest = tree.all().filter((n) => !n.main);
    for (const node of [...main, ...rest]) {
      node.opening = lookupOpening(node.fen);
      if (force) {
        node.analysis = null;
        node.review = null;
      }
      if (!node.analysis) this.enqueue(node, 0);
    }
    for (const node of main) this.refresh(node);
    this.report();
  }

  // Neuer Knoten (eigener Zug): sofort und vorrangig analysieren
  analyseNode(node) {
    node.opening = lookupOpening(node.fen);
    if (!node.analysis && !this.pendingNodes.has(node)) this.enqueue(node, 10);
    this.report();
  }

  enqueue(node, priority) {
    this.total++;
    this.pendingNodes.add(node);
    const term = terminalAnalysis(node.fen);
    if (term) {
      // Matt oder Remis: keine Engine nötig
      queueMicrotask(() => this.finish(node, term));
      return;
    }
    const generation = this.pool.generation;
    this.pool.analyse(node.fen, { depth: this.depth, multiPv: ENGINE.multiPv, priority }).then((res) => {
      if (res.cancelled || generation !== this.pool.generation) return;
      if (res.error) {
        console.error('Engine-Fehler', res.error);
        this.finish(node, null);
        return;
      }
      this.finish(node, buildAnalysis(node.fen, res));
    });
  }

  finish(node, analysis) {
    if (!this.pendingNodes.delete(node)) return;
    this.done++;
    if (analysis) {
      node.analysis = analysis;
      this.refresh(node);
    }
    this.report();
    this.onUpdate?.(node);
  }

  // Klassifizierung für node und die davon abhängigen Folgezüge neu berechnen:
  // node braucht die Vorstellung, Kinder brauchen node, "Verpasster Gewinn"
  // der Enkel braucht die Klassifizierung der Kinder.
  refresh(node) {
    this.review(node);
    for (const c of node.children) {
      this.review(c);
      for (const g of c.children) this.review(g);
    }
  }

  review(node) {
    if (!node.parent || !node.analysis || !node.parent.analysis) return;
    node.review = reviewMove(node, { book: isBookMove(node, lookupOpening) });
  }

  report() {
    this.onProgress?.({ done: this.done, total: this.total, running: this.done < this.total });
  }

  cancel() {
    this.pool.cancelAll();
    this.pendingNodes.clear();
    this.total = this.done = 0;
    this.report();
  }
}
