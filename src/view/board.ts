import { Application, Container, Graphics } from 'pixi.js';
import type { Liquid, Vessel } from '../core/chapters';
import { capacityOf, DEFAULT_RULES, isComplete, isLocked, Rules, State } from '../core/game';
import { BottleView, makeGeom, PALETTE, spillAngle, UNIT, WALL } from './bottle';
import { Fx } from './fx';
import { easeOut, easeOutBack, linear, tickTweens, tween, wait } from './tween';

const LIFT = 24;
/** Space kept above the top row for a bottle that is pouring. */
const HEADROOM = 0.5;

/** How much slower than water each liquid pours. */
const LIQUID_SPEED: Record<Liquid, number> = { water: 1, potion: 1, lava: 1.25, sand: 0.9, honey: 1.7 };

export interface Insets {
  top: number;
  bottom: number;
}

export interface BoardLook {
  /** Rotates the palette so levels differ in colour. */
  offset: number;
  vessel: Vessel;
  liquid: Liquid;
}

/** Everything drawn on the canvas: bottles, pours, hints and effects. */
export class Board {
  readonly app = new Application();
  onTap: (index: number) => void = () => {};
  onPourStart: (layers: number) => void = () => {};
  private layer = new Container();
  private stream = new Graphics();
  private arrow = new Graphics();
  private fx = new Fx();
  private bottles: BottleView[] = [];
  private rules: Rules = DEFAULT_RULES;
  private palette: number[] = PALETTE;
  private speed = 1;
  private scale = 1;
  private cellW = 85;
  private rowH = 240;
  private tallest = 185;
  private insets: Insets = { top: 0, bottom: 0 };
  private selected = -1;
  private hint = -1;
  private time = 0;
  private busy = 0;

  async init(host: HTMLElement) {
    await this.app.init({
      resizeTo: host,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 3),
      preference: 'webgl',
    });
    host.appendChild(this.app.canvas);
    this.layer.sortableChildren = true;
    this.stream.eventMode = 'none';
    this.arrow.eventMode = 'none';
    this.arrow.poly([-11, -14, 11, -14, 0, 2], true).fill(0xffc21a).stroke({ width: 2.5, color: 0x3a1a00, alpha: 0.5, join: 'round' });
    this.arrow.visible = false;
    this.app.stage.addChild(this.fx.back, this.layer, this.stream, this.arrow, this.fx.front);
    this.app.ticker.add((t) => this.update(t.deltaMS));
  }

  /** Screen positions of bottle centres, for automated tests. */
  positions() {
    return this.bottles.map((v) => ({ x: v.home.x, y: v.home.y - (v.geom.totalH / 2) * this.scale }));
  }

  get animating() {
    return this.busy > 0;
  }

  /** Builds bottle views for a board. */
  setLevel(state: State, rules: Rules, hidden: number[], look: BoardLook) {
    this.fx.clear();
    this.clearHint();
    this.selected = -1;
    this.rules = rules;
    this.speed = LIQUID_SPEED[look.liquid];
    this.palette = PALETTE.map((_, i) => PALETTE[(i + look.offset) % PALETTE.length]);
    for (const b of this.bottles) b.destroy({ children: true });
    this.bottles = state.map((_, i) => {
      const v = new BottleView(makeGeom(capacityOf(rules, i), look.vessel));
      v.index = i;
      v.setPalette(this.palette);
      v.setLabel(rules.labels?.[i] ?? null);
      v.setLock(rules.locks?.[i] ?? null);
      v.on('pointertap', () => this.onTap(i));
      this.layer.addChild(v);
      return v;
    });
    this.tallest = Math.max(...this.bottles.map((v) => v.geom.totalH));
    const widest = Math.max(...this.bottles.map((v) => v.geom.bodyW));
    this.cellW = widest * 1.52;
    this.rowH = this.tallest * 1.3;
    this.setState(state, hidden);
    this.layout();
  }

  /** Snaps every bottle to the given state (used for undo, restart and restore). */
  setState(state: State, hidden: number[]) {
    this.selected = -1;
    this.stream.clear();
    state.forEach((b, i) => {
      const v = this.bottles[i];
      v.rotation = 0;
      v.zIndex = 0;
      v.position.set(v.home.x, v.home.y);
      v.setLayers(b, hidden[i] ?? 0);
      v.setCork(isComplete(b, capacityOf(this.rules, i)));
      v.setLocked(isLocked(state, this.rules, i));
    });
  }

  resize(insets: Insets) {
    this.insets = insets;
    this.app.resize();
    this.layout();
  }

  private layout() {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    this.fx.layout(w, h);
    const n = this.bottles.length;
    if (!n) return;
    const availW = w - 24;
    const availH = h - this.insets.top - this.insets.bottom;
    const { cellW, rowH, tallest } = this;
    let best = { rows: 1, s: 0 };
    for (let rows = 1; rows <= 3; rows++) {
      const cols = Math.ceil(n / rows);
      const s = Math.min(availW / (cols * cellW), availH / (rows * rowH + tallest * HEADROOM), 1.45);
      if (s > best.s + 0.01) best = { rows, s };
    }
    const { rows, s } = best;
    this.scale = s;
    const perRow = Math.ceil(n / rows);
    const blockH = (rows * rowH - (rowH - tallest)) * s;
    const top = this.insets.top + tallest * HEADROOM * s + Math.max(0, (availH - tallest * HEADROOM * s - blockH) / 2);
    let i = 0;
    for (let r = 0; r < rows; r++) {
      const count = Math.min(perRow, n - i);
      const rowW = count * cellW * s;
      for (let c = 0; c < count; c++, i++) {
        const v = this.bottles[i];
        v.scale.set(s);
        v.home = { x: (w - rowW) / 2 + (c + 0.5) * cellW * s, y: top + (r * rowH + tallest) * s };
        if (!this.animating) v.position.set(v.home.x, v.home.y - (i === this.selected ? LIFT * s : 0));
      }
    }
  }

  select(i: number) {
    if (this.selected === i) return;
    this.deselect();
    this.selected = i;
    const v = this.bottles[i];
    const y0 = v.y;
    tween(110, (k) => this.selected === i && (v.y = y0 + (v.home.y - LIFT * this.scale - y0) * k), easeOut);
  }

  deselect() {
    const i = this.selected;
    if (i < 0) return;
    this.selected = -1;
    const v = this.bottles[i];
    const y0 = v.y;
    tween(110, (k) => this.selected !== i && v.zIndex === 0 && (v.y = y0 + (v.home.y - y0) * k), easeOut);
  }

  shake(i: number) {
    const v = this.bottles[i];
    tween(260, (k) => (v.x = v.home.x + Math.sin(k * Math.PI * 4) * 5 * this.scale * (1 - k)), linear);
  }

  /** Animates pouring `count` layers from one bottle to another, then snaps both to `after`. */
  async pour(from: number, to: number, count: number, after: State, hiddenAfter: number[]) {
    this.busy++;
    this.selected = -1;
    const a = this.bottles[from];
    const b = this.bottles[to];
    const ga = a.geom;
    const gb = b.geom;
    const s = this.scale;
    const w = this.app.screen.width;
    // The bottle leans toward the target; in the same column it leans toward the middle.
    const dir = a.home.x < b.home.x - 1 ? 1 : a.home.x > b.home.x + 1 ? -1 : b.home.x > w / 2 ? 1 : -1;
    const topA = a.runs[a.runs.length - 1];
    const color = topA.c;
    let topB = b.runs[b.runs.length - 1];
    if (!topB || topB.c !== color) b.runs.push((topB = { c: color, a: 0 }));
    const unitsA = a.units;
    const unitsB = b.units;
    const runA = topA.a;
    const runB = topB.a;

    const a0 = spillAngle(ga, unitsA);
    // How far below its mouth the tilted bottle hangs: lift it enough to clear the bottles underneath.
    const hang = (ga.totalH * Math.cos(a0) - ga.mouth * Math.sin(a0) + (ga.bodyW / 2) * Math.sin(a0)) * s;
    const hover = Math.min(Math.max(hang + 6 * s, this.tallest * 0.2 * s), this.tallest * 0.56 * s);
    const mouth = { x: b.home.x, y: b.home.y - gb.totalH * s - hover };
    const place = (angle: number) => {
      const r = dir * angle;
      const qx = dir * ga.mouth;
      const qy = -ga.totalH;
      a.rotation = r;
      a.position.set(mouth.x - (qx * Math.cos(r) - qy * Math.sin(r)) * s, mouth.y - (qx * Math.sin(r) + qy * Math.cos(r)) * s);
    };

    // A new board may replace the bottles while this runs; then there is nothing left to animate.
    const gone = () => {
      if (!a.destroyed && !b.destroyed) return false;
      this.stream.clear();
      this.busy--;
      return true;
    };
    a.zIndex = 100;
    const start = { x: a.x, y: a.y };
    await tween(230, (k) => {
      place(a0 * k);
      const px = a.x;
      const py = a.y;
      a.position.set(start.x + (px - start.x) * k, start.y + (py - start.y) * k);
      a.draw();
    });

    if (gone()) return;
    this.onPourStart(count);
    const streamW = Math.max(3, 5.5 * s);
    const surface = (units: number) => b.home.y - (WALL + units * UNIT) * s;
    const drawStream = (y0: number, y1: number) => {
      this.stream.clear();
      if (y1 - y0 > 1) this.stream.roundRect(mouth.x - streamW / 2, y0, streamW, y1 - y0, streamW / 2).fill(a.colorOf(color));
    };
    const duration = (170 + 150 * count) * this.speed;
    await tween(
      duration,
      (k) => {
        topA.a = runA - count * k;
        topB.a = runB + count * k;
        place(spillAngle(ga, Math.max(unitsA - count * k, 0.12)));
        a.draw();
        b.draw();
        const fall = Math.min(1, (k * duration) / 70);
        drawStream(mouth.y, mouth.y + (surface(unitsB + count * k) + 2 - mouth.y) * fall);
      },
      linear,
    );
    if (gone()) return;
    a.setLayers(after[from], hiddenAfter[from] ?? 0);
    b.setLayers(after[to], hiddenAfter[to] ?? 0);
    const end = surface(unitsB + count) + 2;
    const back = { x: a.x, y: a.y, r: a.rotation };
    await Promise.all([
      tween(90, (k) => drawStream(mouth.y + (end - mouth.y) * k, end), linear),
      tween(230, (k) => {
        a.rotation = back.r * (1 - k);
        a.position.set(back.x + (a.home.x - back.x) * k, back.y + (a.home.y - back.y) * k);
        a.draw();
      }),
    ]);
    if (gone()) return;
    this.stream.clear();
    a.zIndex = 0;
    a.rotation = 0;
    a.draw();
    this.busy--;
  }

  /** Drops a cork into a finished bottle. */
  async seal(i: number) {
    const v = this.bottles[i];
    if (v.isCorked) return;
    this.fx.burst(v.home.x, v.home.y - v.geom.totalH * this.scale, v.colorOf(v.runs[0].c), this.scale);
    await tween(260, (k) => v.setCork(true, 30 * (1 - k)), easeOutBack);
    if (!v.destroyed) v.setCork(true);
  }

  /** Fades the padlock off a bottle whose colour just got finished. */
  async unlock(i: number) {
    const v = this.bottles[i];
    if (!v.isLocked) return;
    this.fx.burst(v.home.x, v.home.y - v.geom.bodyH * 0.5 * this.scale, 0xffc21a, this.scale);
    await tween(360, (k) => v.setLockAlpha(1 - k), easeOut);
    if (!v.destroyed) v.setLocked(false);
  }

  async celebrate() {
    this.fx.confetti(this.app.screen.width, this.app.screen.height, this.palette);
    this.bottles.forEach((v, i) => {
      wait(i * 45).then(() => tween(420, (k) => !v.destroyed && (v.y = v.home.y - Math.sin(k * Math.PI) * 18 * this.scale), linear));
    });
    await wait(700);
  }

  /** Marks the bottle the selected one should be poured into. */
  showHint(to: number) {
    this.clearHint();
    this.hint = to;
    this.arrow.visible = true;
  }

  clearHint() {
    if (this.hint < 0) return;
    this.bottles[this.hint]?.setGlow(0);
    this.hint = -1;
    this.arrow.visible = false;
  }

  private update(dtMs: number) {
    tickTweens(dtMs);
    this.time += dtMs / 1000;
    this.fx.update(dtMs / 1000);
    if (this.hint >= 0) {
      const b = this.bottles[this.hint];
      b.setGlow(0.55 + 0.45 * Math.sin(this.time * 5));
      this.arrow.scale.set(this.scale);
      this.arrow.position.set(b.home.x, b.home.y - (b.geom.totalH + 14 + 5 * Math.sin(this.time * 5)) * this.scale);
    }
  }
}
