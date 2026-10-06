// Plays levels in a real browser through real clicks, following the solver's hints.
import { chromium } from 'playwright-core';
const url = process.argv[2] ?? 'http://localhost:4173/local.html';
const shots = process.argv[3] ?? '.';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
async function open(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: false });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__waterSort, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  // Hints are rationed for players; the test solves by hints, so give it plenty.
  await page.evaluate(() => window.__waterSort.hints(999));
  return page;
}
const idle = (page) => page.waitForFunction(() => !window.__waterSort.busy(), null, { timeout: 8000 });
async function clickBottle(page, i) {
  const p = (await page.evaluate(() => window.__waterSort.positions()))[i];
  await page.mouse.click(p.x, p.y);
}
/** Solves the current level by pressing Hint and clicking the suggested target. Returns pours made. */
async function solveByHints(page, shot) {
  let n = 0;
  while (!(await page.evaluate(() => window.__waterSort.won()))) {
    const before = JSON.stringify(await page.evaluate(() => window.__waterSort.state()));
    await page.click('#btn-hint');
    await page.waitForTimeout(160);
    const hint = await page.evaluate(() => window.__waterSort.lastHint());
    if (shot && n === shot.at) await page.screenshot({ path: shot.path });
    await clickBottle(page, hint.to);
    if (shot && n === shot.pourAt) { await page.waitForTimeout(shot.delay ?? 400); await page.screenshot({ path: shot.pourPath }); }
    await page.waitForTimeout(60);
    await idle(page);
    if (JSON.stringify(await page.evaluate(() => window.__waterSort.state())) === before) throw new Error('hint did not lead to a pour');
    if (++n > 200) throw new Error('too many pours');
  }
  return n;
}

// Phone: level 1 → 2, screenshots along the way
let page = await open(390, 844);
await page.screenshot({ path: `${shots}/phone-level1.png` });
console.log('level 1 pours', await solveByHints(page));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${shots}/phone-win.png` });
await page.click('#btn-next');
await page.waitForTimeout(400);
console.log('now on level', await page.evaluate(() => window.__waterSort.level()));
// undo / restart
await clickBottle(page, 0); await page.waitForTimeout(200);
await page.screenshot({ path: `${shots}/phone-selected.png` });
await clickBottle(page, 0); await page.waitForTimeout(200);
// reload keeps progress
await page.click('#btn-hint'); await page.waitForTimeout(100);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__waterSort); await page.waitForTimeout(400);
await page.evaluate(() => window.__waterSort.hints(999));
console.log('after reload level', await page.evaluate(() => window.__waterSort.level()));
await page.click('#btn-levels'); await page.waitForTimeout(300);
await page.screenshot({ path: `${shots}/phone-levels.png` });
await page.click('#chk-unlock'); await page.waitForTimeout(200);
await page.click('#level-grid button[data-id="100"]'); await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}/phone-level100.png` });
console.log('level 100 pours', await solveByHints(page, { at: 3, path: `${shots}/phone-hint.png`, pourAt: 5, pourPath: `${shots}/phone-pour.png` }));
await page.waitForTimeout(1200);
await page.screenshot({ path: `${shots}/phone-win100.png` });
await page.evaluate(() => window.__waterSort.load(92)); await page.waitForTimeout(400);
console.log('level 92 pours', await solveByHints(page, { at: -1, pourAt: 2, pourPath: `${shots}/phone-pour92.png`, delay: 330 }));
await page.close();

// Desktop
page = await open(1280, 800);
await page.evaluate(() => window.__waterSort.load(60)); await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}/desktop-level60.png` });
console.log('level 60 pours', await solveByHints(page));
await page.evaluate(() => window.__waterSort.daily()); await page.waitForFunction(() => window.__waterSort.mode() === 'daily'); await page.waitForTimeout(400);
await page.screenshot({ path: `${shots}/desktop-daily.png` });
console.log('daily pours', await solveByHints(page));
await page.evaluate(() => window.__waterSort.endless()); await page.waitForFunction(() => window.__waterSort.mode() === 'endless'); await page.waitForTimeout(400);
console.log('endless pours', await solveByHints(page));
await page.close();

// Small phone, every 7th level solves
page = await open(360, 640);
for (const id of [5, 15, 33, 47, 75, 88]) {
  await page.evaluate((n) => window.__waterSort.load(n), id); await page.waitForTimeout(250);
  if (id === 88) await page.screenshot({ path: `${shots}/small-level88.png` });
  console.log('level', id, 'pours', await solveByHints(page));
}
await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
