import type { Modifier } from './chapters';
import { applyMove, CAPACITY, capacityOf, cloneState, isComplete, isSolved, isUniform, Move, Rules, State, stateKey, topRun, usefulMoves, WILD } from './game';
import { solve, verifySolution } from './solver';

/** A playable board with its rules. Generated levels and daily/endless boards share this shape. */
export interface Puzzle {
  colors: number;
  /** Starting bottles, bottom layer first; empty arrays are the spare bottles. */
  bottles: State;
  /** Omitted when the default rules (four layers, nothing else) apply. */
  rules?: Rules;
  /** Only the top layer of each bottle is visible until it is poured. */
  hidden?: boolean;
  /** The level is lost when this many pours are made without solving it. */
  moveLimit?: number;
  /** Twists on this board, for badges and tips. */
  mods: Modifier[];
  /** Length of the verified solution found by the solver. */
  par: number;
}

export interface Level extends Puzzle {
  id: number;
  /** Planning score: solution length scaled by how often a move-by-move player gets stuck. */
  difficulty: number;
  hard: boolean;
}

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(arr: T[], rand: () => number) => arr[Math.floor(rand() * arr.length)];

/**
 * Shuffled board. `caps` is either one capacity for everything or one per
 * colour: colour c then has caps[c] layers and bottle c holds caps[c].
 * Spare bottles take the largest capacity.
 */
export function randomBoard(colors: number, empty: number, rand: () => number, caps: number | number[] = CAPACITY): { bottles: State; capacity: number | number[] } {
  const sizes = typeof caps === 'number' ? Array.from({ length: colors }, () => caps) : caps;
  const pool: number[] = [];
  for (let c = 0; c < colors; c++) for (let i = 0; i < sizes[c]; i++) pool.push(c);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const bottles: State = [];
  let at = 0;
  for (let b = 0; b < colors; b++) {
    bottles.push(pool.slice(at, at + sizes[b]));
    at += sizes[b];
  }
  const max = Math.max(...sizes);
  for (let e = 0; e < empty; e++) bottles.push([]);
  const capacity = typeof caps === 'number' ? caps : [...sizes, ...Array.from({ length: empty }, () => max)];
  return { bottles, capacity };
}

export interface BoardSpec {
  colors: number;
  spares: number;
  mods: Modifier[];
}

/** Builds a random board for the spec. Not yet checked for solvability. */
export function buildBoard(spec: BoardSpec, rand: () => number): Puzzle {
  const { colors, spares, mods } = spec;
  const has = (m: Modifier) => mods.includes(m);
  let caps: number | number[] = has('tall') ? 5 : CAPACITY;
  if (has('mixed')) {
    const sizes = Array.from({ length: colors }, () => pick([3, 4, 4, 5], rand));
    if (new Set(sizes).size === 1) sizes[0] = sizes[0] === 5 ? 3 : 5;
    caps = sizes;
  }
  const { bottles, capacity } = randomBoard(colors, spares, rand, caps);
  const rules: Rules = { capacity };
  const spareIds = bottles.map((b, i) => (b.length === 0 ? i : -1)).filter((i) => i >= 0);
  if (has('labels')) rules.labels = { [spareIds[0]]: Math.floor(rand() * colors) };
  if (has('locks')) rules.locks = { [spareIds[spareIds.length - 1]]: Math.floor(rand() * colors) };
  if (has('wild')) {
    const n = colors >= 7 ? 2 : 1;
    const used = new Set<number>();
    for (let k = 0; k < n; k++) {
      for (let tries = 0; tries < 50; tries++) {
        const b = Math.floor(rand() * colors);
        const i = Math.floor(rand() * bottles[b].length);
        const c = bottles[b][i];
        if (c === WILD || used.has(c)) continue;
        used.add(c);
        bottles[b][i] = WILD;
        break;
      }
    }
  }
  if (has('thick')) rules.wholeRun = true;
  const plain = typeof capacity === 'number' && capacity === CAPACITY && !rules.labels && !rules.locks && !rules.wholeRun;
  const puzzle: Puzzle = { colors, bottles, mods: mods.slice(), par: 0 };
  if (!plain) puzzle.rules = rules;
  if (has('fog')) puzzle.hidden = true;
  return puzzle;
}

export const puzzleRules = (p: Puzzle): Rules => p.rules ?? { capacity: CAPACITY };

/** Pours the limit chapter allows beyond the solver's solution. */
export const LIMIT_SLACK = 3;

/**
 * Plays the way someone who never looks ahead does: take the pour that looks
 * best right now. Returns true if that reaches a solved board.
 */
function greedyPlayout(start: State, rules: Rules, rand: () => number): boolean {
  const s = cloneState(start);
  const seen = new Set<string>([stateKey(s, rules)]);
  for (let step = 0; step < 400; step++) {
    if (isSolved(s, rules)) return true;
    let bestScore = -Infinity;
    let best: Move[] = [];
    for (const m of usefulMoves(s, rules)) {
      const next = cloneState(s);
      const k = applyMove(next, m, rules);
      if (seen.has(stateKey(next, rules))) continue;
      let score = rand() * 0.5;
      if (isComplete(next[m.to], capacityOf(rules, m.to))) score += 5;
      if (s[m.to].length > 0) score += 2 + k;
      if (next[m.from].length === 0) score += 2;
      else if (isUniform(next[m.from])) score += 1;
      if (k < topRun(s[m.from])) score -= 1;
      if (score > bestScore + 1e-9) {
        bestScore = score;
        best = [m];
      } else if (Math.abs(score - bestScore) < 1e-9) best.push(m);
    }
    if (!best.length) return false;
    applyMove(s, best[Math.floor(rand() * best.length)], rules);
    seen.add(stateKey(s, rules));
  }
  return false;
}

export interface Rating {
  par: number;
  failRate: number;
  difficulty: number;
}

/** Solves and rates a board; null when the solver cannot solve it within budget. */
export function rateBoard(board: State, rules: Rules, rand: () => number, playouts = 60): Rating | null {
  // A loose, cheap search first so hopeless boards are dropped quickly.
  const quick = solve(board, { weight: 2, maxExpanded: 25_000, rules });
  if (quick.status !== 'solved') return null;
  const res = solve(board, { weight: 1.3, maxExpanded: 150_000, rules });
  if (res.status !== 'solved' || !verifySolution(board, res.moves, rules)) return null;
  let failed = 0;
  for (let i = 0; i < playouts; i++) if (!greedyPlayout(board, rules, rand)) failed++;
  const failRate = failed / playouts;
  return { par: res.moves.length, failRate, difficulty: Math.round(res.moves.length * (1 + 2 * failRate) * 10) / 10 };
}

/**
 * Runtime generation for daily, weekly and endless boards: keeps drawing
 * boards until one is solvable with a solution of at least `minPar` pours.
 */
export function makePuzzle(spec: BoardSpec, rand: () => number, minPar = 8, budget = 60_000): Puzzle {
  let fallback: Puzzle | null = null;
  for (let tries = 0; tries < 400; tries++) {
    const p = buildBoard(spec, rand);
    if (p.bottles.some((b, i) => isComplete(b, capacityOf(puzzleRules(p), i)))) continue;
    const res = solve(p.bottles, { weight: 1.5, maxExpanded: budget, rules: puzzleRules(p) });
    if (res.status !== 'solved' || !res.moves.length) continue;
    p.par = res.moves.length;
    if (p.mods.includes('limit')) p.moveLimit = p.par + LIMIT_SLACK;
    if (p.par >= minPar) return p;
    fallback ??= p;
  }
  if (fallback) return fallback;
  // Nothing within budget: fall back to a plain board of the same size, which always exists.
  return makePuzzle({ ...spec, mods: [] }, rand, 0, budget);
}
