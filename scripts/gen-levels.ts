// Builds src/core/levels.json. Every level is solved by the solver and the
// solution is replayed through the rules engine before the level is kept.
import { writeFileSync } from 'node:fs';
import { BASE_CHAPTERS, CHAPTERS, chapterOf, compatible, LEVELS_PER_CHAPTER, MAX_COLORS, Modifier, MODIFIERS, TOTAL_LEVELS } from '../src/core/chapters';
import { capacityOf, isComplete } from '../src/core/game';
import { BoardSpec, buildBoard, Level, LIMIT_SLACK, Puzzle, puzzleRules, rateBoard, rng } from '../src/core/generator';

const HARD_EVERY = 5;
const HARD_FROM = 15;

// The base chapters keep the stream they were first generated with, so adding rounds
// after them never changes levels 1–100. The derived chapters draw from their own stream.
const randBase = rng(20261006);
const randMore = rng(20261029);
const randFor = (chapterId: number) => (chapterId <= BASE_CHAPTERS ? randBase : randMore);

/** Two different twists that can live on one board. */
function chaosMods(rand: () => number): Modifier[] {
  const a = MODIFIERS[Math.floor(rand() * MODIFIERS.length)];
  for (;;) {
    const b = MODIFIERS[Math.floor(rand() * MODIFIERS.length)];
    if (compatible(a, b)) return [a, b].sort();
  }
}

function specFor(id: number): BoardSpec & { hard: boolean } {
  const ch = chapterOf(id);
  const hard = id >= HARD_FROM && id % HARD_EVERY === 0;
  const pos = (id - ch.from) / (LEVELS_PER_CHAPTER - 1);
  let colors = Math.round(ch.colors[0] + (ch.colors[1] - ch.colors[0]) * pos);
  const mods = ch.mods === 'chaos' ? chaosMods(randFor(ch.id)) : ch.mods.slice();
  // A locked spare already acts as a missing bottle, and so does a labelled one once a second
  // twist is on the board; hard levels there get a colour instead, up to the cap.
  let spares = hard ? 1 : 2;
  if (mods.includes('locks') || (mods.includes('labels') && mods.length > 1)) {
    spares = 2;
    if (hard) colors = Math.min(colors + 1, MAX_COLORS);
  }
  return { colors, spares, mods, hard };
}

type Rated = { puzzle: Puzzle; difficulty: number };

function candidates(spec: BoardSpec, want: number, rand: () => number): Rated[] {
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

// One pool per spec and chapter: levels ascend in difficulty inside a chapter, and a twist
// that comes back in a later chapter starts over instead of continuing the climb.
const groups = new Map<string, { chapter: number; spec: BoardSpec; hard: boolean; ids: number[] }>();
for (let id = 2; id <= TOTAL_LEVELS; id++) {
  const { hard, ...spec } = specFor(id);
  const chapter = chapterOf(id).id;
  const key = JSON.stringify([chapter, spec.colors, spec.spares, spec.mods, hard]);
  const g = groups.get(key) ?? { chapter, spec, hard, ids: [] };
  g.ids.push(id);
  groups.set(key, g);
}

const t0 = Date.now();
for (const { chapter, spec, hard, ids } of groups.values()) {
  const pool = candidates(spec, Math.max(12, ids.length * 5), randFor(chapter));
  spread(pool, ids.length, hard ? 0.5 : 0.25).forEach((c, i) => levels.push({ id: ids[i], ...c.puzzle, difficulty: c.difficulty, hard }));
  console.log(`ch ${chapter}: ${spec.colors} colours, ${spec.spares} spare, [${spec.mods}]${hard ? ' hard' : ''}: ${ids.length} levels, difficulty ${pool[0].difficulty} … ${pool[pool.length - 1].difficulty}`);
}

levels.sort((a, b) => a.id - b.id);
for (const ch of CHAPTERS) {
  const own = levels.filter((l) => l.id >= ch.from && l.id <= ch.to);
  console.log(`chapter ${ch.id} ${ch.name}: par ${Math.min(...own.map((l) => l.par))}–${Math.max(...own.map((l) => l.par))}`);
}
writeFileSync(new URL('../src/core/levels.json', import.meta.url), '[\n' + levels.map((l) => JSON.stringify(l)).join(',\n') + '\n]\n');
console.log('wrote', levels.length, 'levels in', Math.round((Date.now() - t0) / 1000), 's');
