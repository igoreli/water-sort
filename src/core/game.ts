// Pure game rules. No rendering, no DOM — safe to run in Node, tests and the solver.

/** A bottle is a stack of colour ids, bottom first. `WILD` layers match any colour. */
export type Bottle = number[];
export type State = Bottle[];
export interface Move {
  from: number;
  to: number;
}

/** Default layers per bottle. */
export const CAPACITY = 4;
/** A layer that counts as whatever colour it sits with. */
export const WILD = -1;

/** Per-level rule variations. Everything is optional except the capacity. */
export interface Rules {
  /** Layers per bottle: one number for every bottle, or one entry per bottle. */
  capacity: number | number[];
  /** Bottle index → the only colour that bottle accepts. */
  labels?: Record<number, number>;
  /** Bottle index → colour that has to be finished before the bottle can be touched. */
  locks?: Record<number, number>;
  /** The whole top run is poured or nothing is. */
  wholeRun?: boolean;
}
export const DEFAULT_RULES: Rules = { capacity: CAPACITY };

export function capacityOf(rules: Rules, i: number): number {
  return typeof rules.capacity === 'number' ? rules.capacity : (rules.capacity[i] ?? CAPACITY);
}

export function maxCapacity(rules: Rules): number {
  return typeof rules.capacity === 'number' ? rules.capacity : Math.max(...rules.capacity);
}

export function cloneState(s: State): State {
  return s.map((b) => b.slice());
}

export function matches(a: number, b: number): boolean {
  return a === WILD || b === WILD || a === b;
}

/** Colour of the top run: the first real colour from the top, or WILD when the bottle is all wild. */
export function topColor(b: Bottle): number {
  for (let i = b.length - 1; i >= 0; i--) if (b[i] !== WILD) return b[i];
  return WILD;
}

/** How many layers at the top of the bottle belong to one colour run (wild layers join the run). */
export function topRun(b: Bottle): number {
  const n = b.length;
  if (n === 0) return 0;
  const c = topColor(b);
  let run = 0;
  while (run < n && matches(b[n - 1 - run], c)) run++;
  return run;
}

export function isUniform(b: Bottle): boolean {
  return b.length > 0 && topRun(b) === b.length;
}

export function isComplete(b: Bottle, capacity = CAPACITY): boolean {
  return b.length === capacity && isUniform(b);
}

/** True when some bottle is finished with this colour. */
export function isColorDone(s: State, rules: Rules, color: number): boolean {
  return s.some((b, i) => isComplete(b, capacityOf(rules, i)) && topColor(b) === color);
}

export function isLocked(s: State, rules: Rules, i: number): boolean {
  const need = rules.locks?.[i];
  return need !== undefined && !isColorDone(s, rules, need);
}

/**
 * Number of layers a pour would move, or 0 when the pour is not allowed.
 * Water goes into an empty bottle or onto a matching colour; as much of the
 * top run as fits is poured (all of it under the whole-run rule).
 */
export function pourAmount(s: State, from: number, to: number, rules: Rules = DEFAULT_RULES): number {
  if (from === to) return 0;
  const a = s[from];
  const b = s[to];
  if (!a || !b || a.length === 0) return 0;
  if (rules.locks && (isLocked(s, rules, from) || isLocked(s, rules, to))) return 0;
  const space = capacityOf(rules, to) - b.length;
  if (space <= 0) return 0;
  const c = topColor(a);
  if (b.length > 0 && !matches(topColor(b), c)) return 0;
  const label = rules.labels?.[to];
  if (label !== undefined && !matches(label, c)) return 0;
  const run = topRun(a);
  if (rules.wholeRun && run > space) return 0;
  return Math.min(run, space);
}

/** Applies a pour in place and returns how many layers moved. */
export function applyMove(s: State, m: Move, rules: Rules = DEFAULT_RULES): number {
  const k = pourAmount(s, m.from, m.to, rules);
  for (let i = 0; i < k; i++) s[m.to].push(s[m.from].pop() as number);
  return k;
}

export function isSolved(s: State, rules: Rules = DEFAULT_RULES): boolean {
  return s.every((b, i) => b.length === 0 || isComplete(b, capacityOf(rules, i)));
}

export function legalMoves(s: State, rules: Rules = DEFAULT_RULES): Move[] {
  const out: Move[] = [];
  for (let from = 0; from < s.length; from++)
    for (let to = 0; to < s.length; to++) if (pourAmount(s, from, to, rules) > 0) out.push({ from, to });
  return out;
}

/** Everything that makes one bottle differ from another besides its contents. */
function attrKey(rules: Rules, i: number): string {
  const cap = capacityOf(rules, i);
  const label = rules.labels?.[i];
  const lock = rules.locks?.[i];
  if (typeof rules.capacity === 'number' && label === undefined && lock === undefined) return '';
  return `${cap}${label === undefined ? '' : 'L' + label}${lock === undefined ? '' : 'K' + lock}`;
}

const attrCache = new WeakMap<Rules, string[]>();
function attrs(rules: Rules, n: number): string[] {
  let a = attrCache.get(rules);
  if (!a || a.length < n) {
    a = Array.from({ length: n }, (_, i) => attrKey(rules, i));
    attrCache.set(rules, a);
  }
  return a;
}

/**
 * Legal moves minus the ones that can never help: pouring out of a finished
 * bottle, moving a single-colour bottle into an identical empty one, and trying
 * more than one identical empty bottle as the target.
 */
export function usefulMoves(s: State, rules: Rules = DEFAULT_RULES): Move[] {
  const out: Move[] = [];
  const at = attrs(rules, s.length);
  for (let from = 0; from < s.length; from++) {
    const a = s[from];
    if (a.length === 0 || isComplete(a, capacityOf(rules, from))) continue;
    if (rules.locks && isLocked(s, rules, from)) continue;
    const uniform = isUniform(a);
    const emptiesTried = new Set<string>();
    for (let to = 0; to < s.length; to++) {
      if (s[to].length === 0) {
        if (uniform && at[to] === at[from]) continue;
        if (emptiesTried.has(at[to])) continue;
        emptiesTried.add(at[to]);
      }
      if (pourAmount(s, from, to, rules) > 0) out.push({ from, to });
    }
  }
  return out;
}

export function isStuck(s: State, rules: Rules = DEFAULT_RULES): boolean {
  return !isSolved(s, rules) && usefulMoves(s, rules).length === 0;
}

/** Order-independent key: two states that differ only by the order of alike bottles match. */
export function stateKey(s: State, rules: Rules = DEFAULT_RULES): string {
  const at = attrs(rules, s.length);
  return s
    .map((b, i) => at[i] + ':' + String.fromCharCode(...b.map((c) => 97 + c)))
    .sort()
    .join('|');
}
