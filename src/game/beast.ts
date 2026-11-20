import { clamp, TAU } from '../core/math';
import type { Anatomy } from './anatomy';

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface TrailPoint {
  x: number;
  y: number;
  life: number;
}

const DASH_TIME = 0.18;

export class Beast {
  x: number;
  y: number;
  vx = 0;
  vy = 0;

  readonly anatomy: Anatomy;
  readonly maxHp: number;
  readonly speed: number;
  readonly damage: number;
  readonly defense: number;
  readonly dashCdMax: number;
  readonly radius: number;
  readonly mass: number;

  hp: number;
  facing = { x: 0, y: -1 };
  dashT = 0;
  dashCd = 0;
  invuln = 0;
  hurt = 0;
  squash = 0;
  breathe = Math.random() * 10;
  dead = false;

  private readonly trail: TrailPoint[] = [];

  constructor(anatomy: Anatomy, x: number, y: number) {
    this.anatomy = anatomy;
    this.x = x;
    this.y = y;
    this.maxHp = anatomy.stats.health;
    this.hp = anatomy.stats.health;
    this.speed = anatomy.stats.speedPx;
    this.damage = anatomy.stats.attack;
    this.defense = anatomy.stats.defense;
    this.dashCdMax = anatomy.stats.dashCooldown;
    this.radius = anatomy.stats.radius;
    this.mass = anatomy.stats.mass;
  }

  get dashing(): boolean {
    return this.dashT > 0;
  }

  get hpRatio(): number {
    return clamp(this.hp / this.maxHp, 0, 1);
  }

  /** Returns true on the frame a dash starts. */
  update(dt: number, ctrlX: number, ctrlY: number, dashPressed: boolean, b: Bounds): boolean {
    let started = false;
    this.breathe += dt;
    this.dashT = Math.max(0, this.dashT - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurt = Math.max(0, this.hurt - dt);
    this.squash = Math.max(0, this.squash - dt * 3.2);

    const mag = Math.hypot(ctrlX, ctrlY);

    if (dashPressed && this.dashCd <= 0 && !this.dead) {
      const dx = mag > 0.18 ? ctrlX / mag : this.facing.x;
      const dy = mag > 0.18 ? ctrlY / mag : this.facing.y;
      const len = Math.hypot(dx, dy) || 1;
      this.facing = { x: dx / len, y: dy / len };
      this.vx = this.facing.x * this.speed * 2.8;
      this.vy = this.facing.y * this.speed * 2.8;
      this.dashT = DASH_TIME;
      this.dashCd = this.dashCdMax;
      this.invuln = 0.3;
      this.squash = 1;
      started = true;
    }

    if (!this.dashing) {
      const tvx = ctrlX * this.speed;
      const tvy = ctrlY * this.speed;
      const k = 1 - Math.exp(-16 * dt);
      this.vx += (tvx - this.vx) * k;
      this.vy += (tvy - this.vy) * k;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const r = this.radius;
    if (this.x - r < b.x0) {
      this.x = b.x0 + r;
      this.vx = Math.abs(this.vx) * 0.3;
    } else if (this.x + r > b.x1) {
      this.x = b.x1 - r;
      this.vx = -Math.abs(this.vx) * 0.3;
    }
    if (this.y - r < b.y0) {
      this.y = b.y0 + r;
      this.vy = Math.abs(this.vy) * 0.3;
    } else if (this.y + r > b.y1) {
      this.y = b.y1 - r;
      this.vy = -Math.abs(this.vy) * 0.3;
    }

    if (!this.dashing) {
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > 24) this.facing = { x: this.vx / sp, y: this.vy / sp };
    }

    if (this.dashing) {
      const last = this.trail[this.trail.length - 1];
      if (!last || Math.hypot(this.x - last.x, this.y - last.y) > 7) {
        this.trail.push({ x: this.x, y: this.y, life: 0.45 });
      }
    }
    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].life -= dt;
      if (this.trail[i].life <= 0) this.trail.splice(i, 1);
    }

    return started;
  }

  takeDamage(amount: number): boolean {
    if (this.dead || this.invuln > 0) return false;
    const mitigated = amount * (1 - clamp(this.defense / 60, 0, 0.55));
    this.hp = Math.max(0, this.hp - mitigated);
    this.hurt = 0.28;
    this.invuln = 0.38;
    this.squash = 0.8;
    if (this.hp <= 0) this.dead = true;
    return true;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { outline } = this.anatomy;
    const r = this.radius;

    // Dash trail
    for (const t of this.trail) {
      const a = clamp(t.life / 0.45, 0, 1) * 0.4;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#8b3fd0';
      ctx.beginPath();
      ctx.arc(t.x, t.y, r * 0.6 * a, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Aura
    const aura = ctx.createRadialGradient(this.x, this.y, r * 0.4, this.x, this.y, r * 2.2);
    aura.addColorStop(0, 'rgba(150, 70, 240, 0.32)');
    aura.addColorStop(1, 'rgba(150, 70, 240, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r * 2.2, 0, TAU);
    ctx.fill();

    // Dash cooldown ring
    if (this.dashCd > 0.02) {
      const p = 1 - this.dashCd / this.dashCdMax;
      ctx.strokeStyle = 'rgba(245, 196, 69, 0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r + 11, -Math.PI / 2, -Math.PI / 2 + TAU * p);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(this.x, this.y);

    const breathe = 1 + Math.sin(this.breathe * 2.1) * 0.018;
    ctx.scale(breathe * (1 + this.squash * 0.1), breathe * (1 - this.squash * 0.1));

    ctx.beginPath();
    ctx.moveTo(outline[0].x, outline[0].y);
    for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i].x, outline[i].y);
    ctx.closePath();

    const flash = this.hurt > 0 && Math.floor(this.hurt * 30) % 2 === 0;
    if (flash) {
      ctx.fillStyle = '#ffffff';
    } else {
      const g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, '#b06bff');
      g.addColorStop(0.55, '#7a2fc0');
      g.addColorStop(1, '#4a1a7a');
      ctx.fillStyle = g;
    }
    ctx.shadowColor = 'rgba(160, 80, 255, 0.85)';
    ctx.shadowBlur = 22;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1d0f2e';
    ctx.stroke();

    // Angry eyes
    const f = this.facing;
    const px = -f.y;
    const py = f.x;
    const eyeR = Math.max(3, r * 0.19);
    const sep = r * 0.34;
    const fwd = r * 0.1;
    for (const s of [-1, 1]) {
      const ex = px * sep * s + f.x * fwd;
      const ey = py * sep * s + f.y * fwd;

      ctx.beginPath();
      ctx.ellipse(ex, ey, eyeR, eyeR * 0.8, Math.atan2(f.y, f.x), 0, TAU);
      ctx.fillStyle = '#f6efff';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(ex + f.x * eyeR * 0.4, ey + f.y * eyeR * 0.4, eyeR * 0.42, 0, TAU);
      ctx.fillStyle = '#1d0f2e';
      ctx.fill();

      // brow
      ctx.beginPath();
      ctx.moveTo(ex - eyeR * 0.9 * s - f.y * eyeR * 0.9, ey - eyeR * 0.75 + f.x * eyeR * 0.9);
      ctx.lineTo(ex + eyeR * 0.9 * s - f.y * eyeR * 0.9, ey - eyeR * 0.35 + f.x * eyeR * 0.9);
      ctx.strokeStyle = '#1d0f2e';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    ctx.restore();

    if (this.invuln > 0.1) {
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = '#f5c445';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r + 5, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}
