export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  r: number;
  drag: number;
  color: string;
  gravity: number;
}

const blank = (): Particle => ({
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  life: 0,
  maxLife: 1,
  r: 2,
  drag: 2,
  color: '#111014',
  gravity: 0,
});

export class Particles {
  private readonly live: Particle[] = [];
  private readonly free: Particle[] = [];

  constructor(capacity = 400) {
    for (let i = 0; i < capacity; i++) this.free.push(blank());
  }

  get count(): number {
    return this.live.length;
  }

  spawn(
    x: number,
    y: number,
    opts: { count: number; speed: number; r: number; color: string; life: number; spread?: number; angle?: number },
  ): void {
    for (let i = 0; i < opts.count; i++) {
      const p = this.free.pop();
      if (!p) return;
      const base = opts.angle ?? Math.random() * Math.PI * 2;
      const spread = opts.spread ?? Math.PI * 2;
      const a = base + (Math.random() - 0.5) * spread;
      const s = opts.speed * (0.35 + Math.random() * 0.9);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.life = opts.life * (0.6 + Math.random() * 0.6);
      p.maxLife = p.life;
      p.r = opts.r * (0.5 + Math.random());
      p.drag = 2.4;
      p.gravity = 0;
      p.color = opts.color;
      this.live.push(p);
    }
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.live.splice(i, 1);
        this.free.push(p);
        continue;
      }
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.live) {
      const a = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, p.r * a), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    while (this.live.length > 0) {
      const p = this.live.pop();
      if (p) this.free.push(p);
    }
  }
}
