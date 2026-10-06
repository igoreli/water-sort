import { Container, Graphics } from 'pixi.js';
import { reducedMotion } from './tween';

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  vr: number;
  gravity: number;
  life: number;
  max: number;
}

/** Sparkles, confetti and the star field behind the bottles. */
export class Fx {
  readonly back = new Container();
  readonly front = new Container();
  private particles: Particle[] = [];
  private stars: { g: Graphics; nx: number; ny: number; base: number; speed: number; phase: number }[] = [];
  private time = 0;

  constructor() {
    this.back.eventMode = 'none';
    this.front.eventMode = 'none';
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 34; i++) {
      const r = 1.5 + rnd() * 3.5;
      const g = new Graphics().star(0, 0, 4, r, r * 0.38).fill({ color: i % 5 === 0 ? 0xb58cff : 0x8f7ae6 });
      this.stars.push({ g, nx: rnd(), ny: rnd(), base: 0.18 + rnd() * 0.3, speed: 0.4 + rnd() * 1.2, phase: rnd() * 6.28 });
      this.back.addChild(g);
    }
  }

  layout(w: number, h: number) {
    for (const s of this.stars) s.g.position.set(s.nx * w, s.ny * h);
  }

  /** Small burst of stars, used when a bottle is finished. */
  burst(x: number, y: number, color: number, scale: number) {
    if (reducedMotion) return;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
      const speed = (90 + Math.random() * 120) * scale;
      const r = (3 + Math.random() * 4) * scale;
      const g = new Graphics().star(0, 0, 4, r, r * 0.4).fill(i % 3 === 0 ? 0xffffff : color);
      g.position.set(x, y);
      this.front.addChild(g);
      this.particles.push({ g, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 60 * scale, vr: 3, gravity: 260 * scale, life: 0, max: 0.55 + Math.random() * 0.3 });
    }
  }

  confetti(w: number, h: number, colors: number[]) {
    if (reducedMotion) return;
    for (let i = 0; i < 110; i++) {
      const g = new Graphics().roundRect(-5, -3, 10, 6, 1.5).fill(colors[i % colors.length]);
      g.position.set(Math.random() * w, -20 - Math.random() * h * 0.35);
      g.rotation = Math.random() * 6.28;
      this.front.addChild(g);
      this.particles.push({ g, vx: (Math.random() - 0.5) * 120, vy: 140 + Math.random() * 220, vr: (Math.random() - 0.5) * 12, gravity: 180, life: 0, max: 2.4 + Math.random() * 1.4 });
    }
  }

  clear() {
    for (const p of this.particles) p.g.destroy();
    this.particles = [];
  }

  update(dt: number) {
    this.time += dt;
    for (const s of this.stars) s.g.alpha = s.base + Math.sin(this.time * s.speed + s.phase) * 0.14;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      p.vy += p.gravity * dt;
      p.g.x += p.vx * dt;
      p.g.y += p.vy * dt;
      p.g.rotation += p.vr * dt;
      p.g.alpha = Math.min(1, (p.max - p.life) / 0.35);
      if (p.life >= p.max) {
        p.g.destroy();
        this.particles.splice(i, 1);
      }
    }
  }
}
