import { applyMove, cloneState, DEFAULT_RULES, isSolved, matches, Move, Rules, State, stateKey, usefulMoves, WILD } from './game';

export interface SolveResult {
  /** 'solved' — moves lead to a solved board; 'unsolvable' — proven dead; 'unknown' — search budget ran out. */
  status: 'solved' | 'unsolvable' | 'unknown';
  moves: Move[];
  expanded: number;
}

export interface SolveOptions {
  /** 1 gives shortest solutions; higher values trade solution length for speed. */
  weight?: number;
  maxExpanded?: number;
  rules?: Rules;
}

/**
 * Lower bound on remaining pours: every colour run above the bottom one has to
 * move at least once, and of all bottles resting on the same colour only one
 * can keep its bottom run in place.
 */
export function heuristic(s: State): number {
  let h = 0;
  const bottoms = new Map<number, number>();
  for (const b of s) {
    if (b.length === 0) continue;
    for (let i = 1; i < b.length; i++) if (!matches(b[i], b[i - 1])) h++;
    if (b[0] !== WILD) bottoms.set(b[0], (bottoms.get(b[0]) ?? 0) + 1);
  }
  for (const n of bottoms.values()) h += n - 1;
  return h;
}

interface Node {
  state: State;
  g: number;
  f: number;
  parent: Node | null;
  move: Move | null;
}

class Heap {
  private a: Node[] = [];
  get size() {
    return this.a.length;
  }
  push(n: Node) {
    const a = this.a;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): Node {
    const a = this.a;
    const top = a[0];
    const last = a.pop() as Node;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Weighted A* over the rules engine. Stops after maxExpanded nodes. */
export function solve(start: State, opts: SolveOptions = {}): SolveResult {
  const weight = opts.weight ?? 1.6;
  const maxExpanded = opts.maxExpanded ?? 200_000;
  const rules = opts.rules ?? DEFAULT_RULES;
  if (isSolved(start, rules)) return { status: 'solved', moves: [], expanded: 0 };

  const open = new Heap();
  const best = new Map<string, number>();
  open.push({ state: cloneState(start), g: 0, f: weight * heuristic(start), parent: null, move: null });
  best.set(stateKey(start, rules), 0);
  let expanded = 0;

  while (open.size) {
    const node = open.pop();
    if ((best.get(stateKey(node.state, rules)) ?? Infinity) < node.g) continue;
    if (isSolved(node.state, rules)) {
      const moves: Move[] = [];
      for (let n: Node | null = node; n && n.move; n = n.parent) moves.push(n.move);
      return { status: 'solved', moves: moves.reverse(), expanded };
    }
    if (++expanded > maxExpanded) return { status: 'unknown', moves: [], expanded };

    for (const m of usefulMoves(node.state, rules)) {
      const next = cloneState(node.state);
      applyMove(next, m, rules);
      const g = node.g + 1;
      const key = stateKey(next, rules);
      if ((best.get(key) ?? Infinity) <= g) continue;
      best.set(key, g);
      open.push({ state: next, g, f: g + weight * heuristic(next), parent: node, move: m });
    }
  }
  return { status: 'unsolvable', moves: [], expanded };
}

/** Replays moves through the rules engine; true only if every pour is legal and the board ends solved. */
export function verifySolution(start: State, moves: Move[], rules: Rules = DEFAULT_RULES): boolean {
  const s = cloneState(start);
  for (const m of moves) if (applyMove(s, m, rules) === 0) return false;
  return isSolved(s, rules);
}
