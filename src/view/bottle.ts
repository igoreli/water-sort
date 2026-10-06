import { Container, Graphics, Rectangle } from 'pixi.js';
import type { Vessel } from '../core/chapters';
import { CAPACITY, WILD } from '../core/game';

/** View-only layer id for a layer the player has not seen yet (fog levels). */
export const HIDDEN = -2;

/** Bottle geometry in local units. Origin is the bottom centre; y grows downward. */
export const UNIT = 36;
export const WALL = 3;
const HEAD = 12;

interface Shape {
  bodyW: number;
  radius: number;
  shoulder: number;
  neckW: number;
  neckH: number;
  lipW: number;
  lipH: number;
}

const SHAPES: Record<Vessel, Shape> = {
  bottle: { bodyW: 56, radius: 18, shoulder: 14, neckW: 32, neckH: 12, lipW: 42, lipH: 7 },
  tube: { bodyW: 46, radius: 22, shoulder: 0, neckW: 46, neckH: 8, lipW: 54, lipH: 6 },
  flask: { bodyW: 62, radius: 12, shoulder: 22, neckW: 24, neckH: 14, lipW: 34, lipH: 7 },
  jar: { bodyW: 66, radius: 9, shoulder: 6, neckW: 54, neckH: 8, lipW: 62, lipH: 8 },
};

export interface Geom extends Shape {
  cap: number;
  bodyH: number;
  totalH: number;
  innerW: number;
  /** Inner half-width of the mouth: where the stream leaves the bottle. */
  mouth: number;
  rect: Pt[];
}

export function makeGeom(cap = CAPACITY, vessel: Vessel = 'bottle'): Geom {
  const sh = SHAPES[vessel];
  const bodyH = WALL + cap * UNIT + HEAD;
  const totalH = bodyH + sh.shoulder + sh.neckH + sh.lipH;
  const innerW = sh.bodyW - 2 * WALL;
  return {
    ...sh,
    cap,
    bodyH,
    totalH,
    innerW,
    mouth: sh.neckW / 2 - WALL,
    rect: [
      [-innerW / 2, -totalH],
      [innerW / 2, -totalH],
      [innerW / 2, -WALL],
      [-innerW / 2, -WALL],
    ],
  };
}

// Ordered so that neighbouring entries contrast: a level takes a run of them.
export const PALETTE = [
  0xe8382f, 0xf9ce1d, 0x2f6be8, 0x76c12a, 0xff86bc, 0x2fc4e8,
  0xf58a1f, 0x9b5cf0, 0x157a4a, 0xa3195b, 0xc9d3e0, 0x8b5a3a,
];
export const WILD_COLOR = 0xf2eefc;
const HIDDEN_COLOR = 0x3b3656;
const GLASS = 0xa9c4ff;
const GOLD = 0xffc21a;

function trace(g: Graphics, geom: Geom, inset: number) {
  const hw = geom.bodyW / 2 - inset;
  const r = Math.max(1, geom.radius - inset);
  const nb = geom.neckW / 2 - inset;
  const yb = -inset;
  const ys = -geom.bodyH;
  const yn = -(geom.bodyH + geom.shoulder);
  const yt = -geom.totalH;
  const k = geom.shoulder * 0.6;
  g.moveTo(-nb, yt)
    .lineTo(-nb, yn)
    .bezierCurveTo(-nb, yn + k, -hw, ys - k, -hw, ys)
    .lineTo(-hw, yb - r)
    .arcTo(-hw, yb, -hw + r, yb, r)
    .lineTo(hw - r, yb)
    .arcTo(hw, yb, hw, yb - r, r)
    .lineTo(hw, ys)
    .bezierCurveTo(hw, ys - k, nb, yn + k, nb, yn)
    .lineTo(nb, yt)
    .closePath();
  return g;
}

// --- liquid geometry -------------------------------------------------------
// The inside of the bottle is treated as a rectangle. For a tilt angle we look
// for the horizontal (world) line that leaves the right area below it, so the
// surface stays level while the bottle turns.

type Pt = [number, number];

/** Keeps the part of the polygon at depth >= level along the gravity vector g. */
function clip(poly: Pt[], gx: number, gy: number, level: number, keepDeeper = true): Pt[] {
  const out: Pt[] = [];
  const sign = keepDeeper ? 1 : -1;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = (a[0] * gx + a[1] * gy - level) * sign;
    const db = (b[0] * gx + b[1] * gy - level) * sign;
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** The slice of the polygon between two depths. */
const band = (poly: Pt[], gx: number, gy: number, d0: number, d1: number) => clip(clip(poly, gx, gy, d0), gx, gy, d1, false);

function area(poly: Pt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

/** Depth of the surface for `units` of water in a bottle rotated by `angle`. */
function surfaceLevel(geom: Geom, units: number, angle: number): number {
  const gx = Math.sin(angle);
  const gy = Math.cos(angle);
  if (Math.abs(angle) < 1e-4) return -WALL - units * UNIT;
  const want = units * UNIT * geom.innerW;
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of geom.rect) {
    const d = p[0] * gx + p[1] * gy;
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  }
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (area(clip(geom.rect, gx, gy, mid)) > want) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Tilt (radians, >= 0) at which `units` of water reach the mouth. */
export function spillAngle(geom: Geom, units: number): number {
  let lo = 0;
  let hi = (100 * Math.PI) / 180;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const lip = geom.mouth * Math.sin(mid) - geom.totalH * Math.cos(mid);
    if (surfaceLevel(geom, units, mid) > lip) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface Run {
  c: number;
  a: number;
}

export class BottleView extends Container {
  runs: Run[] = [];
  home = { x: 0, y: 0 };
  index = 0;
  readonly geom: Geom;
  private palette: number[] = PALETTE;
  private liquid = new Graphics();
  private glow = new Graphics();
  private cork = new Graphics();
  private tag = new Graphics();
  private shade: Graphics;
  private padlock = new Graphics();
  private corked = false;
  private lockColor: number | null = null;

  constructor(geom: Geom) {
    super();
    this.geom = geom;
    const back = trace(new Graphics(), geom, 0).fill({ color: 0xffffff, alpha: 0.07 });
    const mask = trace(new Graphics(), geom, WALL - 0.5).fill(0xffffff);
    this.liquid.mask = mask;

    const front = new Graphics();
    trace(front, geom, 0).stroke({ width: 3, color: GLASS, alpha: 0.9, join: 'round' });
    front
      .roundRect(-geom.lipW / 2, -geom.totalH - 1, geom.lipW, geom.lipH, 3.5)
      .fill({ color: 0x1b1250, alpha: 0.85 })
      .stroke({ width: 2.5, color: GLASS, alpha: 0.95 });
    front.roundRect(-geom.bodyW / 2 + 8, -geom.bodyH + 10, 6, geom.bodyH * 0.58, 3).fill({ color: 0xffffff, alpha: 0.3 });
    front.roundRect(-geom.bodyW / 2 + 8, -geom.bodyH * 0.3, 6, 12, 3).fill({ color: 0xffffff, alpha: 0.22 });
    front.roundRect(geom.bodyW / 2 - 11, -geom.bodyH + 14, 4, geom.bodyH * 0.72, 2).fill({ color: 0x000022, alpha: 0.12 });

    trace(this.glow, geom, -3).stroke({ width: 5, color: GOLD, alpha: 1, join: 'round' });
    this.glow.visible = false;

    const nw = geom.neckW;
    this.cork
      .roundRect(-nw / 2 - 2, -geom.totalH - 11, nw + 4, 15, 5)
      .fill(0xf2b632)
      .roundRect(-nw / 2 - 2, -geom.totalH - 11, nw + 4, 6, 4)
      .fill({ color: 0xffe07a, alpha: 0.9 })
      .roundRect(-nw / 2 + 1, -geom.totalH + 2, nw - 2, 4, 2)
      .fill({ color: 0x9a6a12, alpha: 0.55 });
    this.cork.visible = false;

    this.shade = trace(new Graphics(), geom, 0).fill({ color: 0x05020f, alpha: 0.55 });
    this.shade.visible = false;
    this.padlock.visible = false;
    this.tag.visible = false;

    this.addChild(this.glow, back, this.liquid, mask, front, this.tag, this.shade, this.padlock, this.cork);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(-geom.bodyW * 0.72, -geom.totalH - 16, geom.bodyW * 1.44, geom.totalH + 30);
  }

  setPalette(p: number[]) {
    this.palette = p;
  }

  colorOf(c: number): number {
    return c === WILD ? WILD_COLOR : c === HIDDEN ? HIDDEN_COLOR : this.palette[c % this.palette.length];
  }

  /** Replaces the contents from a rules-engine bottle (bottom first). The lowest `hiddenBelow` layers are drawn as unknown. */
  setLayers(b: number[], hiddenBelow = 0) {
    this.runs = [];
    b.forEach((raw, i) => {
      const c = i < hiddenBelow ? HIDDEN : raw;
      const top = this.runs[this.runs.length - 1];
      if (top && top.c === c) top.a++;
      else this.runs.push({ c, a: 1 });
    });
    this.draw();
  }

  get units(): number {
    return this.runs.reduce((s, r) => s + r.a, 0);
  }

  /** Local y of the water surface when the bottle stands upright. */
  get surfaceY(): number {
    return -WALL - this.units * UNIT;
  }

  draw() {
    const g = this.liquid.clear();
    const geom = this.geom;
    const angle = this.rotation;
    const gx = Math.sin(angle);
    const gy = Math.cos(angle);
    let total = this.units;
    for (let i = this.runs.length - 1; i >= 0; i--) {
      const run = this.runs[i];
      if (total > 0.001) {
        const level = surfaceLevel(geom, total, angle);
        const body = clip(geom.rect, gx, gy, level);
        if (body.length >= 3) {
          g.poly(body.flat(), true).fill(this.colorOf(run.c));
          const depth = run.a * UNIT;
          if (run.c === HIDDEN) {
            for (let d = 6; d < depth; d += 14) {
              const stripe = band(body, gx, gy, level + d, level + d + 5);
              if (stripe.length >= 3) g.poly(stripe.flat(), true).fill({ color: 0xffffff, alpha: 0.06 });
            }
          } else if (run.c === WILD) {
            const tints = [0xff86bc, 0xf9ce1d, 0x2fc4e8, 0x76c12a];
            const step = depth / 4;
            for (let k = 0; k < 4; k++) {
              const stripe = band(body, gx, gy, level + k * step + step * 0.3, level + k * step + step * 0.75);
              if (stripe.length >= 3) g.poly(stripe.flat(), true).fill({ color: tints[k], alpha: 0.45 });
            }
          } else {
            const sheen = clip(body, gx, gy, level + 3, false);
            if (sheen.length >= 3) g.poly(sheen.flat(), true).fill({ color: 0xffffff, alpha: 0.22 });
          }
        }
      }
      total -= run.a;
    }
  }

  setGlow(alpha: number) {
    this.glow.visible = alpha > 0.01;
    this.glow.alpha = alpha;
  }

  get isCorked() {
    return this.corked;
  }

  setCork(on: boolean, drop = 0) {
    this.corked = on;
    this.cork.visible = on;
    this.cork.y = -drop;
    this.cork.alpha = drop > 0 ? Math.max(0, 1 - drop / 30) : 1;
  }

  /** Coloured tag on the glass: the bottle takes this colour only. */
  setLabel(color: number | null) {
    const g = this.tag.clear();
    this.tag.visible = color !== null;
    if (color === null) return;
    const x = this.geom.bodyW / 2 - 3;
    const y = -this.geom.bodyH + 16;
    g.roundRect(x, y, 15, 26, 4).fill(this.colorOf(color)).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
    g.circle(x + 7.5, y + 8, 2.6).fill({ color: 0xffffff, alpha: 0.85 });
  }

  /** Padlock with the colour that opens it. `setLocked` shows or hides it. */
  setLock(color: number | null) {
    this.lockColor = color;
    const g = this.padlock.clear();
    if (color === null) {
      this.padlock.visible = false;
      this.shade.visible = false;
      return;
    }
    const cy = -this.geom.bodyH * 0.5;
    g.roundRect(-14, cy - 6, 28, 22, 5).fill(GOLD).stroke({ width: 2, color: 0x3a1a00, alpha: 0.6 });
    g.moveTo(-8, cy - 6).lineTo(-8, cy - 14).arc(0, cy - 14, 8, Math.PI, 0).lineTo(8, cy - 6).stroke({ width: 4, color: GOLD, cap: 'round' });
    g.circle(0, cy + 4, 2.8).fill({ color: 0x3a1a00, alpha: 0.7 });
    g.circle(0, cy + 30, 8).fill(this.colorOf(color)).stroke({ width: 2.5, color: 0xffffff, alpha: 0.9 });
  }

  setLocked(on: boolean) {
    const show = on && this.lockColor !== null;
    this.padlock.visible = show;
    this.shade.visible = show;
    this.padlock.alpha = 1;
    this.shade.alpha = 1;
  }

  get isLocked() {
    return this.shade.visible;
  }

  /** For the unlock animation: fades the padlock and the shade together. */
  setLockAlpha(a: number) {
    this.padlock.alpha = a;
    this.shade.alpha = a;
  }
}
