import assert from 'node:assert/strict';
import { newAchievements, starsFor } from '../src/core/achievements';
import { CHAPTERS, chapterOf, MODIFIERS } from '../src/core/chapters';
import { applyMove, CAPACITY, capacityOf, cloneState, isLocked, isSolved, isStuck, pourAmount, Rules, State, usefulMoves, WILD } from '../src/core/game';
import { buildBoard, Level, makePuzzle, puzzleRules, rng } from '../src/core/generator';
import { dailyPuzzle, dayKey, endlessPuzzle, previousDayKey, weekKey, weeklyPuzzle } from '../src/core/modes';
import { solve, verifySolution } from '../src/core/solver';
import levels from '../src/core/levels.json';

// ----- base rules -----------------------------------------------------------
const s: State = [[0, 1, 1], [1], [], [2, 2, 2, 2], [0, 0, 1, 1]];
assert.equal(pourAmount(s, 0, 1), 2, 'top run pours onto same colour');
assert.equal(pourAmount(s, 0, 2), 2, 'top run pours into empty bottle');
assert.equal(pourAmount(s, 1, 0), 1, 'fits into remaining space');
assert.equal(pourAmount(s, 4, 0), 1, 'only as much as fits is poured');
assert.equal(pourAmount(s, 0, 3), 0, 'full bottle refuses');
assert.equal(pourAmount(s, 3, 0), 0, 'different colour refuses');
assert.equal(pourAmount(s, 2, 0), 0, 'empty bottle has nothing to pour');
assert.equal(pourAmount(s, 0, 0), 0, 'cannot pour into itself');
const t = cloneState(s);
assert.equal(applyMove(t, { from: 0, to: 1 }), 2);
assert.deepEqual(t[0], [0]);
assert.deepEqual(t[1], [1, 1, 1]);
assert.deepEqual(s[0], [0, 1, 1], 'clone leaves the original alone');
assert.ok(isSolved([[0, 0, 0, 0], [], [1, 1, 1, 1]]));
assert.ok(!isSolved([[0, 0], [0, 0], [1, 1, 1, 1]]), 'split colour is not solved');
assert.ok(isStuck([[0, 1, 0, 1], [1, 0, 1, 0]]));
assert.equal(solve([[0, 1, 0, 1], [1, 0, 1, 0]]).status, 'unsolvable');

// ----- capacity -------------------------------------------------------------
const tall: Rules = { capacity: 5 };
assert.equal(pourAmount([[0, 0, 0, 0], [0]], 0, 1, tall), 4, 'tall bottle takes four more');
assert.ok(!isSolved([[0, 0, 0, 0], []], tall), 'four of five is not complete');
assert.ok(isSolved([[0, 0, 0, 0, 0], []], tall));
const mixed: Rules = { capacity: [3, 5, 5] };
assert.equal(pourAmount([[1, 1, 1], [0, 0], []], 0, 1, mixed), 0, 'different colour still refuses');
assert.equal(pourAmount([[0, 0, 0], [0, 0], []], 0, 1, mixed), 3, 'into the bigger bottle');
assert.ok(isSolved([[1, 1, 1], [0, 0, 0, 0, 0], []], mixed), 'each colour fills its own size');
assert.ok(usefulMoves([[1, 1, 1], [0, 0], []], { capacity: [3, 4, 5] }).some((m) => m.from === 1 && m.to === 2), 'uniform run may move into a bigger empty bottle');
assert.ok(!usefulMoves([[1, 1, 1], [0, 0], []], { capacity: [3, 5, 5] }).some((m) => m.from === 0 && m.to === 2), 'but not into a same-size one (bottle 0 is complete)');
assert.equal(capacityOf(mixed, 7), CAPACITY, 'unknown bottle falls back to default');

// ----- labels ---------------------------------------------------------------
const labelled: Rules = { capacity: 4, labels: { 2: 1 } };
assert.equal(pourAmount([[0, 0], [1, 1], []], 0, 2, labelled), 0, 'label refuses other colours');
assert.equal(pourAmount([[0, 0], [1, 1], []], 1, 2, labelled), 2, 'label accepts its colour');
assert.ok(usefulMoves([[0, 0, 0, 0], [1, 1], [], []], labelled).some((m) => m.from === 1 && m.to === 2), 'moving into the matching label frees a plain bottle');

// ----- locks ----------------------------------------------------------------
const locked: Rules = { capacity: 4, locks: { 2: 0 } };
const lockState: State = [[0, 0, 0, 1], [1, 1, 1, 0], []];
assert.ok(isLocked(lockState, locked, 2));
assert.equal(pourAmount(lockState, 0, 2, locked), 0, 'locked bottle refuses');
assert.ok(isStuck(lockState, locked), 'nothing else to do');
const opened: State = [[0, 0, 0, 0], [1, 1, 1], [1], []];
assert.ok(!isLocked(opened, { capacity: 4, locks: { 3: 0 } }, 3), 'finished colour opens the lock');
assert.equal(pourAmount(opened, 2, 3, { capacity: 4, locks: { 3: 0 } }), 1);

// ----- wild -----------------------------------------------------------------
assert.equal(pourAmount([[0, 0, WILD], [0]], 0, 1), 3, 'wild joins the run above it');
assert.equal(pourAmount([[1, WILD], [0]], 0, 1), 0, 'the run colour is the first real one from the top');
assert.equal(pourAmount([[WILD, WILD], [0]], 0, 1), 2, 'an all-wild run goes anywhere');
assert.equal(pourAmount([[2], [0, WILD]], 0, 1), 0, 'wild on top does not change the bottle colour');
assert.ok(isSolved([[0, 0, 0, WILD], [1, 1, 1, 1], []]), 'wild completes a colour');
assert.ok(!isSolved([[0, 0, 1, WILD], [1, 1, 1, 0], []]));

// ----- thick (whole run) ----------------------------------------------------
const thick: Rules = { capacity: 4, wholeRun: true };
assert.equal(pourAmount([[0, 1, 1, 1], [2, 2, 1]], 0, 1, thick), 0, 'run of three does not fit in one slot');
assert.equal(pourAmount([[0, 1, 1, 1], [2, 2, 1]], 0, 1), 1, 'without the rule a partial pour is fine');
assert.equal(pourAmount([[0, 1], [2, 2, 1]], 0, 1, thick), 1);

// ----- solver with rules ----------------------------------------------------
const puzzleWithLock: State = [[0, 0, 1, 1], [1, 1, 0, 0], [], []];
const lockRules: Rules = { capacity: 4, locks: { 3: 0 } };
const r = solve(puzzleWithLock, { rules: lockRules, weight: 1 });
assert.equal(r.status, 'solved');
assert.ok(verifySolution(puzzleWithLock, r.moves, lockRules));
assert.ok(!verifySolution(puzzleWithLock, [{ from: 0, to: 3 }], lockRules), 'replay respects the lock');

// ----- generator ------------------------------------------------------------
const rand = rng(7);
for (const mod of MODIFIERS) {
  const p = buildBoard({ colors: 5, spares: 2, mods: [mod] }, rand);
  const rules = puzzleRules(p);
  assert.equal(p.bottles.length, 7, `${mod}: bottle count`);
  if (mod === 'tall') assert.equal(rules.capacity, 5);
  if (mod === 'mixed') assert.ok(Array.isArray(rules.capacity) && new Set(rules.capacity).size > 1, 'mixed sizes differ');
  if (mod === 'labels') assert.ok(rules.labels && Object.keys(rules.labels).length === 1);
  if (mod === 'locks') assert.ok(rules.locks && Object.keys(rules.locks).length === 1);
  if (mod === 'wild') assert.equal(p.bottles.flat().filter((c) => c === WILD).length, 1);
  if (mod === 'thick') assert.ok(rules.wholeRun);
  if (mod === 'fog') assert.ok(p.hidden);
  if (mod !== 'fog' && mod !== 'limit' && mod !== 'wild') assert.ok(p.rules, `${mod}: rules are stored`);
}
const made = makePuzzle({ colors: 5, spares: 2, mods: ['labels'] }, rng(3), 8);
assert.ok(made.par >= 1 && verifySolution(made.bottles, solve(made.bottles, { rules: puzzleRules(made) }).moves, puzzleRules(made)), 'runtime puzzle is solvable');

// ----- modes ----------------------------------------------------------------
assert.equal(previousDayKey('2026-03-01'), '2026-02-28');
assert.equal(dayKey(new Date(2026, 9, 6)), '2026-10-06');
assert.equal(weekKey(new Date(2026, 9, 6)), '2026-W41');
assert.equal(weekKey(new Date(2027, 0, 1)), '2026-W53', 'ISO week year');
const d1 = dailyPuzzle('2026-10-06');
const d2 = dailyPuzzle('2026-10-06');
assert.deepEqual(d1, d2, 'daily board is the same every time');
assert.notDeepEqual(d1.bottles, dailyPuzzle('2026-10-07').bottles, 'and differs tomorrow');
const w = weeklyPuzzle('2026-W41');
assert.equal(w.mods.length, 1);
assert.ok(verifySolution(w.bottles, solve(w.bottles, { rules: puzzleRules(w) }).moves, puzzleRules(w)), 'weekly solvable');
for (const streak of [0, 5, 13]) {
  const e = endlessPuzzle(streak, 1);
  assert.ok(e.par > 0, `endless ${streak} has a solution`);
  assert.ok(verifySolution(e.bottles, solve(e.bottles, { rules: puzzleRules(e) }).moves, puzzleRules(e)));
}

// ----- achievements ---------------------------------------------------------
assert.equal(starsFor(10, 10), 3);
assert.equal(starsFor(13, 10), 2);
assert.equal(starsFor(14, 10), 1);
const base = { unlocked: [], stats: { solved: 1, noUndo: 0, noHint: 0, hardPar: 0, pours: 0 }, stars: {}, dailyStreak: 0, endlessBest: 0 };
assert.deepEqual(newAchievements(base), ['first']);
assert.deepEqual(newAchievements({ ...base, unlocked: ['first'] }), []);
const allStars: Record<string, number> = {};
for (let i = 1; i <= 10; i++) allStars[i] = 3;
assert.ok(newAchievements({ ...base, stars: allStars }).includes('chapter-stars'));

// ----- shipped levels -------------------------------------------------------
const LEVELS = levels as Level[];
assert.equal(LEVELS.length, 100);
let longest = 0;
for (const [i, lv] of LEVELS.entries()) {
  assert.equal(lv.id, i + 1, 'ids are consecutive');
  const rules = puzzleRules(lv);
  const ch = chapterOf(lv.id);
  if (ch.mods !== 'chaos') assert.deepEqual(lv.mods, lv.id === 1 ? [] : ch.mods, `level ${lv.id}: chapter twist`);
  else assert.equal(lv.mods.length, 2, `level ${lv.id}: two twists`);
  const counts = new Map<number, number>();
  let layers = 0;
  let fullCaps = 0;
  for (const [b, bottle] of lv.bottles.entries()) {
    assert.ok(bottle.length === 0 || bottle.length === capacityOf(rules, b), `level ${lv.id}: bottles start full or empty`);
    if (bottle.length) fullCaps += capacityOf(rules, b);
    for (const c of bottle) {
      layers++;
      if (c !== WILD) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }
  assert.equal(counts.size, lv.colors, `level ${lv.id}: colour count`);
  assert.equal(layers, fullCaps, `level ${lv.id}: every full bottle is full`);
  const spares = lv.bottles.filter((b) => b.length === 0).length;
  assert.ok(spares === 1 || spares === 2, `level ${lv.id}: spare bottles`);
  if (lv.hard && !lv.mods.includes('locks')) assert.equal(spares, 1, `level ${lv.id}: hard has one spare`);
  if (lv.moveLimit) assert.ok(lv.moveLimit >= lv.par, `level ${lv.id}: limit allows the solution`);
  assert.ok(!isSolved(lv.bottles, rules), `level ${lv.id}: starts unsolved`);
  const res = solve(lv.bottles, { weight: 1.3, maxExpanded: 150_000, rules });
  assert.equal(res.status, 'solved', `level ${lv.id}: solvable`);
  assert.ok(verifySolution(lv.bottles, res.moves, rules), `level ${lv.id}: solution replays`);
  assert.equal(res.moves.length, lv.par, `level ${lv.id}: par matches`);
  // The in-game hint uses a faster, looser search; it must also succeed.
  const h = solve(lv.bottles, { weight: 2, maxExpanded: 40_000, rules });
  assert.equal(h.status, 'solved', `level ${lv.id}: hint search finds a way`);
  longest = Math.max(longest, res.moves.length);
}
assert.equal(CHAPTERS.length, 10);
console.log('rules ok; 100 levels solved and replayed; longest solution', longest, 'moves');
