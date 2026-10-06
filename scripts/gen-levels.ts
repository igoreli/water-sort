// Builds src/core/levels.json. Every level is solved by the solver and the
// solution is replayed through the rules engine before the level is kept.
import { writeFileSync } from 'node:fs';
import { CHAPTERS, chapterOf, LEVELS_PER_CHAPTER, Modifier, MODIFIERS, TOTAL_LEVELS } from '../src/core/chapters';
import { capacityOf, isComplete } from '../src/core/game';
import { BoardSpec, buildBoard, Level, LIMIT_SLACK, Puzzle, puzzleRules, rateBoard, rng } from '../src/core/generator';

const HARD_EVERY = 5;
const HARD_FROM = 15;

const rand = rng(20261006);

/** Two different twists that can live on one board. */
function chaosMods(): Modifier[] {
  const a = MODIFIERS[Math.floor(rand() * MODIFIERS.length)];
  for (;;) {
    const b = MODIFIERS[Math.floor(rand() * MODIFIERS.length)];
    if (b === a) continue;
    if ((a === 'tall' && b === 'mixed') || (a === 'mixed' && b === 'tall')) continue;
    return [a, b].sort();
  }
}

function specFor(id: number): BoardSpec & { hard: boolean } {
  const ch = chapterOf(id);
  const hard = id >= HARD_FROM && id % HARD_EVERY === 0;
  const pos = (id - ch.from) / (LEVELS_PER_CHAPTER - 1);
  let colors = Math.round(ch.colors[0] + (ch.colors[1] - ch.colors[0]) * pos);
  const mods = ch.mods === 'chaos' ? chaosMods() : ch.mods.slice();
  // A locked spare already acts as a missing bottle; hard levels there get a colour instead.
  let spares = hard ? 1 : 2;
  if (mods.includes('locks')) {
    spares = 2;
    if (hard) colors++;
  }
  return { colors, spares, mods, hard };
}

type Rated = { puzzle: Puzzle; difficulty: number };

function candidates(spec: BoardSpec, want: number): Rated[] {
  const out: Rated[] = [];
  let tries = 0;
  while (out.length < want && tries < 20_000) {
    tries++;
    const p = buildBoard(spec, rand);
    const rules = puzzleRules(p);
    if (p.bottles.some((b, i) => isComplete(b, capacityOf(rules, i)))) continue;
    const r = rateBoard(p.bottles, rules, rand);
    if (!r) continue;
    p.par = r.par;
    if (p.mods.includes('limit')) p.moveLimit = r.par + LIMIT_SLACK;
    out.push({ puzzle: p, difficulty: r.difficulty });
  }
  if (out.length < want) throw new Error(`only ${out.length}/${want} boards for ${JSON.stringify(spec)} after ${tries} tries`);
  return out.sort((a, b) => a.difficulty - b.difficulty);
}

/** Picks n boards spread from the `from` quantile to the hardest, easiest first. */
function spread(pool: Rated[], n: number, from: number): Rated[] {
  const lo = Math.floor(pool.length * from);
  const hi = pool.length - 1;
  return Array.from({ length: n }, (_, i) => pool[n === 1 ? hi : Math.round(lo + ((hi - lo) * i) / (n - 1))]);
}

const levels: Level[] = [
  // Level 1 teaches the pour: two colours, three pours.
  { id: 1, colors: 2, bottles: [[0, 0, 1, 1], [1, 1, 0, 0], []], par: 3, difficulty: 3, hard: false, mods: [] },
];

const groups = new Map<string, { spec: BoardSpec; hard: boolean; ids: number[] }>();
for (let id = 2; id <= TOTAL_LEVELS; id++) {
  const { hard, ...spec } = specFor(id);
  const key = JSON.stringify([spec.colors, spec.spares, spec.mods, hard]);
  const g = groups.get(key) ?? { spec, hard, ids: [] };
  g.ids.push(id);
  groups.set(key, g);
}

const t0 = Date.now();
for (const { spec, hard, ids } of groups.values()) {
  const pool = candidates(spec, Math.max(12, ids.length * 5));
  spread(pool, ids.length, hard ? 0.5 : 0.25).forEach((c, i) => levels.push({ id: ids[i], ...c.puzzle, difficulty: c.difficulty, hard }));
  console.log(`${spec.colors} colours, ${spec.spares} spare, [${spec.mods}]${hard ? ' hard' : ''}: ${ids.length} levels, difficulty ${pool[0].difficulty} … ${pool[pool.length - 1].difficulty}`);
}

levels.sort((a, b) => a.id - b.id);
for (const ch of CHAPTERS) {
  const own = levels.filter((l) => l.id >= ch.from && l.id <= ch.to);
  console.log(`chapter ${ch.id} ${ch.name}: par ${Math.min(...own.map((l) => l.par))}–${Math.max(...own.map((l) => l.par))}`);
}
writeFileSync(new URL('../src/core/levels.json', import.meta.url), '[\n' + levels.map((l) => JSON.stringify(l)).join(',\n') + '\n]\n');
console.log('wrote', levels.length, 'levels in', Math.round((Date.now() - t0) / 1000), 's');
