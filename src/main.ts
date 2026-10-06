import 'pixi.js/unsafe-eval'; // keeps Pixi working under strict Content-Security-Policy
import { ACHIEVEMENTS, newAchievements, starsFor } from './core/achievements';
import { Chapter, CHAPTERS, chapterOf, MODIFIER_NAME, MODIFIER_TIP } from './core/chapters';
import { applyMove, capacityOf, cloneState, isComplete, isLocked, isSolved, isStuck, matches, pourAmount, Rules, State, topColor, topRun } from './core/game';
import type { Level, Puzzle } from './core/generator';
import { puzzleRules } from './core/generator';
import { dailyPuzzle, dayKey, dayLabel, endlessPuzzle, hashSeed, Mode, previousDayKey, weekKey, weeklyModifier, weeklyPuzzle } from './core/modes';
import { solve } from './core/solver';
import rawLevels from './core/levels.json';
import { sfx } from './audio';
import { HINTS_MAX, HINTS_PER_DAY, loadSave, Progress, Save, writeSave } from './storage';
import { Board } from './view/board';

const LEVELS = rawLevels as Level[];
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** What is on the table right now: a campaign level or a generated board. */
interface Play {
  mode: Mode;
  /** Campaign level id; the streak index for endless; 0 otherwise. */
  levelId: number;
  puzzle: Puzzle;
  /** Day key, week key or endless seed. */
  key: string;
  /** Source of the look: colours, vessel and liquid. */
  chapter: Chapter;
  title: string;
}

const STAR = '★';

async function start(restored: Partial<Save> = {}) {
  const save: Save = { ...loadSave(), ...restored };
  const board = new Board();
  await board.init($('stage'));
  const app = $('app');

  let play: Play = campaignPlay(1);
  let rules: Rules = puzzleRules(play.puzzle);
  let state: State = [];
  let history: State[] = [];
  /** Per bottle: how many layers from the bottom are still unknown (fog). */
  let hidden: number[] = [];
  let hiddenHistory: number[][] = [];
  let moves = 0;
  let selected = -1;
  let won = false;
  let failed = false;
  let usedUndo = false;
  let usedHint = false;
  let lastHint: { from: number; to: number } | null = null;
  /** Bumped by every new board, so a win celebration from a previous board cannot finish on this one. */
  let generation = 0;

  const level = (): Level | null => (play.mode === 'campaign' ? LEVELS[play.levelId - 1] : null);
  const maxOpen = () => (save.allOpen ? LEVELS.length : save.unlocked);
  const today = () => dayKey();

  // ----- persistence --------------------------------------------------------
  const snapshot = (): Save => {
    const progress: Progress | null = won ? null : { bottles: state, history: history.slice(-200), hidden, hiddenHistory: hiddenHistory.slice(-200), moves, usedUndo, usedHint };
    const current = won && play.mode !== 'campaign' ? null : { mode: play.mode, levelId: play.levelId, puzzle: play.mode === 'campaign' ? null : play.puzzle, key: play.key, progress };
    const lvl = play.mode === 'campaign' ? (won ? Math.min(play.levelId + 1, LEVELS.length) : play.levelId) : save.level;
    return { ...save, level: lvl, current };
  };
  const persist = () => writeSave(snapshot());

  function hintsLeft(): number {
    if (save.hints.date !== today()) save.hints = { date: today(), left: Math.max(save.hints.left, HINTS_PER_DAY) };
    return save.hints.left;
  }

  // ----- HUD ---------------------------------------------------------------
  let toastTimer = 0;
  function toast(text: string, ms = 3200) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (el.hidden = true), ms);
  }

  function applyTheme(ch: Chapter) {
    app.dataset.chapter = String(ch.id);
    app.style.setProperty('--night', ch.theme.night);
    app.style.setProperty('--dusk', ch.theme.dusk);
    app.style.setProperty('--violet', ch.theme.violet);
    app.style.setProperty('--violet-deep', ch.theme.deep);
    sfx.setLiquid(ch.theme.liquid);
  }

  function badges(host: HTMLElement, mods: string[]) {
    host.textContent = '';
    for (const m of mods) {
      const b = document.createElement('span');
      b.className = 'badge mod';
      b.textContent = MODIFIER_NAME[m as keyof typeof MODIFIER_NAME] ?? m;
      host.appendChild(b);
    }
  }

  function coachText(): string | null {
    if (moves > 0 || won) return null;
    const lv = level();
    if (lv) return lv.id === play.chapter.from ? play.chapter.tip : null;
    const mod = play.puzzle.mods[0];
    return mod ? MODIFIER_TIP[mod] : null;
  }

  function refreshHud() {
    const lv = level();
    $('lvl-title').textContent = play.title;
    $('lvl-chapter').textContent =
      play.mode === 'campaign' ? play.chapter.name : play.mode === 'daily' ? 'Daily board' : play.mode === 'weekly' ? 'Weekly challenge' : `Best ${save.endless.best}`;
    $('lvl-hard').hidden = !lv?.hard;
    badges($('lvl-mods'), play.puzzle.mods);
    const limit = play.puzzle.moveLimit;
    $('lvl-moves').textContent = limit ? `${moves}/${limit} pours` : moves === 1 ? '1 pour' : `${moves} pours`;
    $('lvl-moves').classList.toggle('warn', !!limit && moves >= limit - 2);
    $<HTMLButtonElement>('btn-undo').disabled = history.length === 0 || won;
    $<HTMLButtonElement>('btn-hint').disabled = won;
    $('hint-count').textContent = String(hintsLeft());
    const tip = coachText();
    $('coach').hidden = !tip;
    if (tip) $('coach').textContent = tip;
    $('btn-sound').setAttribute('aria-pressed', String(save.sound));
  }

  // ----- boards ------------------------------------------------------------
  function campaignPlay(id: number): Play {
    const lv = LEVELS[Math.min(Math.max(id, 1), LEVELS.length) - 1];
    return { mode: 'campaign', levelId: lv.id, puzzle: lv, key: String(lv.id), chapter: chapterOf(lv.id), title: `Level ${lv.id}` };
  }
  function dailyPlay(key = today(), puzzle = dailyPuzzle(key)): Play {
    return { mode: 'daily', levelId: 0, puzzle, key, chapter: CHAPTERS[hashSeed(key) % CHAPTERS.length], title: `Daily · ${dayLabel(key)}` };
  }
  function weeklyPlay(key = weekKey(), puzzle = weeklyPuzzle(key)): Play {
    const mod = weeklyModifier(key);
    const chapter = CHAPTERS.find((c) => c.mods !== 'chaos' && c.mods.includes(mod)) ?? CHAPTERS[CHAPTERS.length - 1];
    return { mode: 'weekly', levelId: 0, puzzle, key, chapter, title: `Week ${Number(key.slice(6))} · ${MODIFIER_NAME[mod]}` };
  }
  function endlessPlay(streak: number, puzzle = endlessPuzzle(streak, save.endless.seed)): Play {
    return { mode: 'endless', levelId: streak, puzzle, key: String(save.endless.seed), chapter: CHAPTERS[streak % CHAPTERS.length], title: `Endless · ${streak + 1}` };
  }

  function startPlay(p: Play, progress?: Progress | null) {
    generation++;
    play = p;
    rules = puzzleRules(p.puzzle);
    state = cloneState(progress?.bottles ?? p.puzzle.bottles);
    history = progress?.history.map(cloneState) ?? [];
    hidden = progress?.hidden ?? (p.puzzle.hidden ? state.map((b) => Math.max(0, b.length - 1)) : state.map(() => 0));
    hiddenHistory = progress?.hiddenHistory ?? [];
    moves = progress?.moves ?? 0;
    usedUndo = progress?.usedUndo ?? false;
    usedHint = progress?.usedHint ?? false;
    selected = -1;
    won = false;
    failed = !!p.puzzle.moveLimit && moves >= p.puzzle.moveLimit && !isSolved(state, rules);
    lastHint = null;
    $('win').hidden = true;
    $('toast').hidden = true;
    applyTheme(p.chapter);
    const offset = p.mode === 'campaign' ? (p.levelId * 5) % 12 : hashSeed(p.key) % 12;
    board.setLevel(state, rules, hidden, { offset, vessel: p.chapter.theme.vessel, liquid: p.chapter.theme.liquid });
    refreshHud();
    persist();
  }

  function loadLevel(id: number, progress?: Progress | null) {
    startPlay(campaignPlay(id), progress);
  }

  /** Generating a board takes a moment; let the toast paint first. */
  async function generate<T>(make: () => T): Promise<T> {
    toast('Mixing a board…', 60_000);
    await new Promise((r) => setTimeout(r, 30));
    const out = make();
    $('toast').hidden = true;
    return out;
  }

  async function startDaily() {
    closeLevels();
    startPlay(await generate(() => dailyPlay()));
  }
  async function startWeekly() {
    closeLevels();
    startPlay(await generate(() => weeklyPlay()));
  }
  async function startEndless(streak = save.endless.streak) {
    closeLevels();
    startPlay(await generate(() => endlessPlay(streak)));
  }

  // ----- play --------------------------------------------------------------
  async function pour(from: number, to: number) {
    const count = pourAmount(state, from, to, rules);
    const lockedBefore = state.map((_, i) => isLocked(state, rules, i));
    history.push(cloneState(state));
    hiddenHistory.push(hidden.slice());
    applyMove(state, { from, to }, rules);
    moves++;
    save.stats.pours++;
    selected = -1;
    hidden[from] = Math.max(0, Math.min(hidden[from], state[from].length - 1));
    persist();
    refreshHud();
    const after = cloneState(state);
    const hiddenAfter = hidden.slice();
    await board.pour(from, to, count, after, hiddenAfter);
    if (isComplete(after[to], capacityOf(rules, to))) {
      sfx.sealed();
      void board.seal(to);
    }
    const opened = lockedBefore.map((was, i) => was && !isLocked(after, rules, i));
    if (opened.some(Boolean)) {
      sfx.unlocked();
      opened.forEach((o, i) => o && void board.unlock(i));
    }
    if (isSolved(after, rules)) return win();
    if (play.puzzle.moveLimit && moves >= play.puzzle.moveLimit) {
      failed = true;
      sfx.fail();
      toast('Out of pours. Undo or restart.');
    } else if (isStuck(after, rules)) toast('No pours left. Undo or restart.');
  }

  /** Why a pour from the selected bottle into `i` is refused, for the player. */
  function refusal(i: number): string | null {
    const a = state[selected];
    const b = state[i];
    if (isLocked(state, rules, i)) return 'Locked: finish the colour on the padlock first.';
    const label = rules.labels?.[i];
    if (label !== undefined && !matches(label, topColor(a))) return 'This bottle takes its own colour only.';
    if (rules.wholeRun && b.length > 0 && matches(topColor(a), topColor(b)) && topRun(a) > capacityOf(rules, i) - b.length) return 'Thick: the whole run has to fit.';
    return null;
  }

  function tap(i: number) {
    if (won || board.animating) return;
    sfx.unlock();
    board.clearHint();
    if (failed) {
      toast('Out of pours. Undo or restart.');
      board.shake(i);
      sfx.deny();
      return;
    }
    const b = state[i];
    const locked = isLocked(state, rules, i);
    if (selected < 0) {
      if (locked) {
        board.shake(i);
        sfx.deny();
        toast('Locked: finish the colour on the padlock first.');
        return;
      }
      if (b.length === 0 || isComplete(b, capacityOf(rules, i))) return;
      selected = i;
      board.select(i);
      sfx.select();
    } else if (selected === i) {
      selected = -1;
      board.deselect();
      sfx.drop();
    } else if (pourAmount(state, selected, i, rules) > 0) {
      void pour(selected, i);
    } else if (!locked && b.length > 0 && !isComplete(b, capacityOf(rules, i))) {
      const why = refusal(i);
      if (why && rules.wholeRun) toast(why);
      selected = i;
      board.select(i);
      sfx.select();
    } else {
      const why = refusal(i);
      if (why) toast(why);
      board.shake(i);
      sfx.deny();
    }
  }

  function undo() {
    if (won || board.animating || !history.length) return;
    state = history.pop() as State;
    hidden = hiddenHistory.pop() ?? hidden;
    moves = Math.max(0, moves - 1);
    selected = -1;
    failed = false;
    usedUndo = true;
    board.clearHint();
    board.setState(state, hidden);
    sfx.undo();
    refreshHud();
    persist();
  }

  function restart() {
    if (board.animating) return;
    startPlay(play);
    sfx.undo();
  }

  function hint() {
    if (won || board.animating) return;
    if (hintsLeft() <= 0) {
      toast('No hints left today. Three more tomorrow, or earn one with three stars.');
      sfx.deny();
      return;
    }
    const res = solve(state, { weight: 2, maxExpanded: 40_000, rules });
    if (res.status === 'solved' && res.moves.length) {
      const m = (lastHint = res.moves[0]);
      save.hints.left--;
      usedHint = true;
      selected = m.from;
      board.select(m.from);
      board.showHint(m.to);
      sfx.select();
      refreshHud();
      persist();
    } else if (res.status === 'unsolvable') {
      toast("This position can't be solved. Undo a few pours or restart.");
    } else {
      toast('No hint from here. Try undoing a few pours.');
    }
  }

  async function win() {
    won = true;
    selected = -1;
    const lv = level();
    const par = play.puzzle.par;
    const stats = save.stats;
    stats.solved++;
    if (!usedUndo) stats.noUndo++;
    if (!usedHint) stats.noHint++;
    let stars = 0;
    let line = `${moves} pours · par ${par}`;
    let next = 'Next level';
    let title = 'Sorted!';
    if (lv) {
      stars = starsFor(moves, par);
      if (lv.hard && moves <= par) stats.hardPar++;
      save.unlocked = Math.max(save.unlocked, Math.min(lv.id + 1, LEVELS.length));
      const prev = save.best[lv.id];
      if (stars === 3 && (prev === undefined || starsFor(prev, par) < 3) && save.hints.left < HINTS_MAX) {
        save.hints.left++;
        line += ' · +1 hint';
      }
      save.best[lv.id] = prev === undefined ? moves : Math.min(prev, moves);
      if (lv.id === LEVELS.length) {
        title = 'All 100 sorted!';
        next = 'Choose a level';
      }
    } else if (play.mode === 'daily') {
      const d = save.daily;
      const prev = d.results[play.key];
      d.results[play.key] = prev === undefined ? moves : Math.min(prev, moves);
      if (d.last !== play.key) {
        d.streak = d.last === previousDayKey(play.key) ? d.streak + 1 : 1;
        d.last = play.key;
      }
      title = 'Daily done!';
      line += ` · streak ${d.streak}`;
      next = 'Back to menu';
    } else if (play.mode === 'weekly') {
      const prev = save.weekly[play.key];
      save.weekly[play.key] = prev === undefined ? moves : Math.min(prev, moves);
      title = 'Challenge done!';
      next = 'Back to menu';
    } else {
      save.endless.streak = play.levelId + 1;
      save.endless.best = Math.max(save.endless.best, save.endless.streak);
      title = `Streak ${save.endless.streak}!`;
      line += ` · best ${save.endless.best}`;
      next = 'Next board';
    }
    const starsByLevel: Record<string, number> = {};
    for (const [id, best] of Object.entries(save.best)) starsByLevel[id] = starsFor(best, LEVELS[Number(id) - 1]?.par ?? best);
    const earned = newAchievements({ unlocked: save.achievements, stats, stars: starsByLevel, dailyStreak: save.daily.streak, endlessBest: save.endless.best });
    save.achievements.push(...earned);
    persist();
    refreshHud();
    sfx.win();
    const gen = generation;
    await board.celebrate();
    if (gen !== generation) return;
    $('win-level').textContent = play.title;
    $('win-title').textContent = title;
    const starsEl = $('win-stars');
    starsEl.hidden = !lv;
    starsEl.textContent = '';
    for (let i = 0; i < 3; i++) {
      const s = document.createElement('span');
      s.textContent = STAR;
      s.className = i < stars ? 'on' : '';
      starsEl.appendChild(s);
    }
    $('win-stats').textContent = line;
    $('btn-next').textContent = next;
    $('win').hidden = false;
    $('btn-next').focus({ preventScroll: true });
    if (earned.length) {
      sfx.achievement();
      const names = earned.map((id) => ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id);
      toast(`Achievement: ${names.join(', ')}`, 4500);
    }
  }

  function onNext() {
    if (play.mode === 'campaign') {
      if (play.levelId === LEVELS.length) openLevels();
      else loadLevel(play.levelId + 1);
    } else if (play.mode === 'endless') void startEndless(save.endless.streak);
    else openLevels();
  }

  // ----- menu ----------------------------------------------------------------
  function starsOf(id: number): number {
    const best = save.best[id];
    return best === undefined ? 0 : starsFor(best, LEVELS[id - 1].par);
  }

  function openLevels() {
    const todayDone = save.daily.results[today()];
    $('daily-sub').textContent = todayDone !== undefined ? `Solved in ${todayDone} · streak ${save.daily.streak}` : save.daily.streak ? `Streak ${save.daily.streak} · play today` : "Today's board";
    const wk = weekKey();
    const weekDone = save.weekly[wk];
    $('weekly-sub').textContent = `${MODIFIER_NAME[weeklyModifier(wk)]} · ${weekDone !== undefined ? `solved in ${weekDone}` : 'not yet'}`;
    $('endless-sub').textContent = save.endless.streak ? `Streak ${save.endless.streak} · best ${save.endless.best}` : save.endless.best ? `Best ${save.endless.best}` : 'How far can you go?';

    const grid = $('level-grid');
    grid.textContent = '';
    for (const ch of CHAPTERS) {
      const block = document.createElement('section');
      block.className = 'chapter' + (ch.from > maxOpen() ? ' locked' : '');
      const head = document.createElement('header');
      const h = document.createElement('h4');
      h.textContent = `${ch.id}. ${ch.name}`;
      const mods = document.createElement('span');
      badges(mods, ch.mods === 'chaos' ? ['Mix'] : ch.mods);
      const total = document.createElement('span');
      total.className = 'muted';
      let got = 0;
      for (let id = ch.from; id <= ch.to; id++) got += starsOf(id);
      total.textContent = `${got}/${(ch.to - ch.from + 1) * 3} ${STAR}`;
      head.append(h, mods, total);
      const cells = document.createElement('div');
      cells.className = 'chapter-grid';
      for (let id = ch.from; id <= ch.to; id++) {
        const lv = LEVELS[id - 1];
        const b = document.createElement('button');
        const open = id <= maxOpen();
        const stars = starsOf(id);
        b.className = 'lv' + (stars ? ' done' : '') + (play.mode === 'campaign' && id === play.levelId ? ' current' : '') + (lv.hard ? ' hard' : '');
        b.dataset.id = String(id);
        b.disabled = !open;
        b.setAttribute('aria-label', `Level ${id}${lv.hard ? ', hard' : ''}${open ? `, ${stars} stars` : ', locked'}`);
        const num = document.createElement('span');
        num.textContent = String(id);
        const st = document.createElement('span');
        st.className = 'lv-stars';
        st.textContent = stars ? STAR.repeat(stars) : '';
        b.append(num, st);
        b.addEventListener('click', () => {
          closeLevels();
          loadLevel(id);
        });
        cells.appendChild(b);
      }
      block.append(head, cells);
      grid.appendChild(block);
    }

    const list = $('achievements');
    list.textContent = '';
    for (const a of ACHIEVEMENTS) {
      const li = document.createElement('li');
      const done = save.achievements.includes(a.id);
      li.className = done ? 'done' : '';
      const name = document.createElement('b');
      name.textContent = a.name;
      const text = document.createElement('span');
      text.textContent = a.text;
      li.append(name, text);
      list.appendChild(li);
    }
    $('ach-count').textContent = `${save.achievements.length}/${ACHIEVEMENTS.length}`;

    $<HTMLInputElement>('chk-unlock').checked = save.allOpen;
    $('levels').hidden = false;
    grid.querySelector<HTMLElement>('.current')?.scrollIntoView({ block: 'center' });
  }
  const closeLevels = () => ($('levels').hidden = true);

  // ----- wiring ------------------------------------------------------------
  board.onTap = tap;
  board.onPourStart = (n) => sfx.pour(n);
  $('btn-undo').addEventListener('click', undo);
  $('btn-restart').addEventListener('click', restart);
  $('btn-hint').addEventListener('click', hint);
  $('btn-levels').addEventListener('click', openLevels);
  $('btn-close-levels').addEventListener('click', closeLevels);
  $('btn-next').addEventListener('click', onNext);
  $('btn-menu').addEventListener('click', openLevels);
  $('btn-daily').addEventListener('click', () => void startDaily());
  $('btn-weekly').addEventListener('click', () => void startWeekly());
  $('btn-endless').addEventListener('click', () => void startEndless());
  $('btn-sound').addEventListener('click', () => {
    save.sound = !save.sound;
    sfx.setEnabled(save.sound);
    if (save.sound) sfx.select();
    refreshHud();
    persist();
  });
  $('chk-unlock').addEventListener('change', (e) => {
    save.allOpen = (e.target as HTMLInputElement).checked;
    persist();
    openLevels();
  });
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') closeLevels();
    else if (!$('levels').hidden) return;
    else if (e.key === 'u' || e.key === 'z') undo();
    else if (e.key === 'r') restart();
    else if (e.key === 'h') hint();
  });

  const fit = () => {
    const rect = app.getBoundingClientRect();
    board.resize({ top: $('hud').getBoundingClientRect().bottom - rect.top + 8, bottom: rect.bottom - $('dock').getBoundingClientRect().top + 8 });
  };
  new ResizeObserver(fit).observe(app);

  sfx.setEnabled(save.sound);
  fit();

  // ----- resume --------------------------------------------------------------
  function resume() {
    const cur = save.current;
    const fits = (p: Puzzle, progress: Progress | null) => !progress || progress.bottles.length === p.bottles.length;
    try {
      if (cur?.mode === 'daily' && cur.puzzle && cur.key === today() && fits(cur.puzzle, cur.progress)) return startPlay(dailyPlay(cur.key, cur.puzzle), cur.progress);
      if (cur?.mode === 'weekly' && cur.puzzle && cur.key === weekKey() && fits(cur.puzzle, cur.progress)) return startPlay(weeklyPlay(cur.key, cur.puzzle), cur.progress);
      if (cur?.mode === 'endless' && cur.puzzle && fits(cur.puzzle, cur.progress)) return startPlay(endlessPlay(cur.levelId, cur.puzzle), cur.progress);
      if (cur?.mode === 'campaign' && cur.levelId === save.level && cur.progress && fits(LEVELS[save.level - 1], cur.progress)) return loadLevel(save.level, cur.progress);
    } catch {
      /* a stale save: start the level fresh */
    }
    loadLevel(save.level);
  }
  resume();

  (window as any).claude?.hot?.snapshot?.(snapshot);
  // Handle for end-to-end tests.
  (window as any).__waterSort = {
    state: () => state,
    level: () => play.levelId,
    mode: () => play.mode,
    won: () => won,
    busy: () => board.animating,
    positions: () => board.positions(),
    load: (id: number) => loadLevel(id),
    lastHint: () => lastHint,
    hints: (n: number) => {
      save.hints = { date: today(), left: n };
      refreshHud();
    },
    daily: () => startDaily(),
    weekly: () => startWeekly(),
    endless: () => startEndless(),
  };
}

// In the Claude viewer `hot` hands back the running game across page updates.
const hot = (window as any).claude?.hot;
if (hot?.ready) hot.ready(start);
else void start(hot?.data ?? {});
