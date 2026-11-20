import type { AudioEngine } from '../core/audio';
import { vibrate } from '../core/haptics';
import type { InputHandler } from '../core/input';
import { TAU, clamp } from '../core/math';
import type { Anatomy } from './anatomy';
import { gradeFor } from './anatomy';
import type { ArenaSkin } from './arenas';
import { Beast } from './beast';
import type { Enemy, EnemyEvents } from './enemy';
import { createEnemy, drawEnemy, killEnemy, updateEnemy } from './enemy';
import { Particles } from './particles';
import { RUN_SECONDS, buildSchedule, spawnPoint, waveIndexAt } from './waves';
import type { ScheduledSpawn } from './waves';

export interface View {
  w: number;
  h: number;
}

export interface ArenaResult {
  survived: boolean;
  score: number;
  kills: number;
  hp: number;
  maxHp: number;
  timeLeft: number;
  seed: string;
  arenaId: string;
  wave: number;
  grade: string;
  stars: number;
}

export interface HudSnapshot {
  hp: number;
  maxHp: number;
  score: number;
  mult: number;
  timeLeft: number;
  wave: number;
  dashRatio: number;
}

interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
}

const MAX_ENEMIES = 56;
const MAX_PROJECTILES = 200;
const INSET = 10;
const JOY_RADIUS = 58;
const JOY_THROW = 46;
const DASH_RADIUS = 44;

export class Arena implements InputHandler {
  readonly seedLabel: string;
  readonly beast: Beast;

  elapsed = 0;
  score = 0;
  kills = 0;
  mult = 1;
  trauma = 0;
  finished = false;
  best = 0;

  private readonly skin: ArenaSkin;
  private readonly view: View;
  private readonly audio: AudioEngine;
  private readonly onEnd: (r: ArenaResult) => void;
  private readonly particles = new Particles(420);
  private readonly schedule: ScheduledSpawn[];
  private readonly enemies: Enemy[] = [];
  private readonly projectiles: Projectile[] = [];
  private readonly stars: Array<{ x: number; y: number; r: number; p: number }> = [];

  private cursor = 0;
  private chainT = 0;
  private hitstop = 0;
  private over = false;
  private overTimer = 0;
  private dashQueued = false;
  private dashPress = 0;
  private wave = 1;

  private dragActive = false;
  private baseX = 0;
  private baseY = 0;
  private knobX = 0;
  private knobY = 0;

  private beat = 0;

  private readonly ev: EnemyEvents = {
    spawn: (kind, x, y) => {
      if (this.enemies.length >= MAX_ENEMIES) return;
      this.enemies.push(createEnemy(kind, x, y, this.skin.hpMul, this.skin.dmgMul, this.skin.speedMul));
    },
    shoot: (x, y, vx, vy) => {
      if (this.projectiles.length >= MAX_PROJECTILES) return;
      this.projectiles.push({ x, y, vx, vy, r: 6, life: 4 });
    },
  };

  constructor(
    view: View,
    anatomy: Anatomy,
    seedLabel: string,
    skin: ArenaSkin,
    audio: AudioEngine,
    onEnd: (r: ArenaResult) => void,
  ) {
    this.view = view;
    this.audio = audio;
    this.skin = skin;
    this.seedLabel = seedLabel;
    this.onEnd = onEnd;
    this.beast = new Beast(anatomy, view.w / 2, view.h / 2);
    this.schedule = buildSchedule(seedLabel);
    for (let i = 0; i < 70; i++) {
      this.stars.push({
        x: Math.random() * view.w,
        y: Math.random() * view.h,
        r: 0.5 + Math.random() * 1.6,
        p: Math.random() * TAU,
      });
    }
    this.audio.setIntensity(0);
    this.audio.startMusic();
    this.audio.play('start');
  }

  // ------------------------------------------------------------ input

  private joyPos(): { x: number; y: number } {
    return { x: 92, y: this.view.h - 108 };
  }

  private dashPos(): { x: number; y: number } {
    return { x: this.view.w - 86, y: this.view.h - 108 };
  }

  onDown(x: number, y: number): void {
    const d = this.dashPos();
    if (Math.hypot(x - d.x, y - d.y) < DASH_RADIUS * 1.4) {
      this.dashQueued = true;
      this.dashPress = 0.18;
      return;
    }
    this.dragActive = true;
    this.baseX = x;
    this.baseY = y;
    this.knobX = x;
    this.knobY = y;
  }

  onMove(x: number, y: number): void {
    if (!this.dragActive) return;
    const dx = x - this.baseX;
    const dy = y - this.baseY;
    const len = Math.hypot(dx, dy);
    if (len > JOY_RADIUS * 0.8) {
      const k = (JOY_RADIUS * 0.8) / len;
      this.knobX = this.baseX + dx * k;
      this.knobY = this.baseY + dy * k;
    } else {
      this.knobX = x;
      this.knobY = y;
    }
  }

  onUp(): void {
    this.dragActive = false;
  }

  onDash(): void {
    this.dashQueued = true;
    this.dashPress = 0.18;
  }

  cancelInput(): void {
    this.dragActive = false;
    this.dashQueued = false;
  }

  getHud(): HudSnapshot {
    return {
      hp: this.beast.hp,
      maxHp: this.beast.maxHp,
      score: Math.round(this.score),
      mult: this.mult,
      timeLeft: Math.max(0, RUN_SECONDS - this.elapsed),
      wave: this.wave,
      dashRatio: this.beast.dashCdMax > 0 ? 1 - this.beast.dashCd / this.beast.dashCdMax : 1,
    };
  }

  /**
   * Distance from the beast's centre to its drawn outline in direction (nx,ny).
   * The collision shape is the artwork itself (convex hull), not a circle, so a
   * spiky beast really does have a bigger, spikier hitbox.
   */
  private hullReach(nx: number, ny: number): number {
    const hull = this.beast.anatomy.hull;
    const fallback = this.beast.radius * 0.75;
    let best = 0;
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i];
      const b = hull[(i + 1) % hull.length];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const den = nx * ey - ny * ex;
      if (Math.abs(den) < 1e-6) continue;
      const t = (a.x * ey - a.y * ex) / den;
      const u = (a.x * ny - a.y * nx) / den;
      if (t > 0 && u >= 0 && u <= 1 && (best === 0 || t < best)) best = t;
    }
    return best > 0 ? best : fallback;
  }

  private bounds(): { x0: number; y0: number; x1: number; y1: number } {
    return {
      x0: INSET,
      y0: INSET,
      x1: Math.max(INSET + 1, this.view.w - INSET),
      y1: Math.max(INSET + 1, this.view.h - INSET),
    };
  }

  private control(): { x: number; y: number } {
    if (!this.dragActive) return { x: 0, y: 0 };
    const dx = this.knobX - this.baseX;
    const dy = this.knobY - this.baseY;
    const len = Math.hypot(dx, dy);
    if (len < 5) return { x: 0, y: 0 };
    const mag = Math.min(1, len / JOY_THROW);
    return { x: (dx / len) * mag, y: (dy / len) * mag };
  }

  // ------------------------------------------------------------ simulation

  update(dtRaw: number): void {
    if (this.finished) return;

    if (this.hitstop > 0) {
      this.hitstop = Math.max(0, this.hitstop - dtRaw);
      this.particles.update(dtRaw);
      return;
    }

    const dt = this.over ? dtRaw * 0.25 : dtRaw;
    this.elapsed += dt;
    this.beat += dt;
    this.wave = waveIndexAt(this.elapsed);
    this.trauma = Math.max(0, this.trauma - dtRaw * 2.4);
    this.dashPress = Math.max(0, this.dashPress - dtRaw);
    this.chainT = Math.max(0, this.chainT - dt);
    if (this.chainT === 0 && this.mult > 1) this.mult = 1;

    const c = this.over ? { x: 0, y: 0 } : this.control();
    const dashed = this.beast.update(dt, c.x, c.y, this.dashQueued, this.bounds());
    this.dashQueued = false;
    if (dashed) {
      this.audio.play('dash');
      this.particles.spawn(this.beast.x, this.beast.y, {
        count: 8,
        speed: 160,
        r: 4,
        color: '#b06bff',
        life: 0.45,
      });
    }

    if (!this.over) {
      this.spawnDue();
      this.updateEnemies(dt);
      this.updateProjectiles(dt);
    }

    this.particles.update(dt);
    this.audio.setIntensity(this.elapsed > RUN_SECONDS - 15 ? 2 : this.mult >= 2 ? 1 : 0);

    if (!this.over && this.beast.dead) {
      this.over = true;
      this.overTimer = 1;
      this.trauma = 1;
      this.audio.stopMusic();
      this.audio.play('lose');
      this.particles.spawn(this.beast.x, this.beast.y, {
        count: 32,
        speed: 280,
        r: 6,
        color: '#b06bff',
        life: 0.9,
      });
    }

    if (this.over) {
      this.overTimer -= dtRaw;
      if (this.overTimer <= 0) this.finish(false);
    } else if (this.elapsed >= RUN_SECONDS) {
      this.finish(true);
    }
  }

  private spawnDue(): void {
    while (this.cursor < this.schedule.length && this.schedule[this.cursor].t <= this.elapsed) {
      const s = this.schedule[this.cursor];
      this.cursor++;
      if (this.enemies.length >= MAX_ENEMIES) continue;
      const p = spawnPoint(s.edge, s.pos, this.view.w, this.view.h);
      this.enemies.push(createEnemy(s.kind, p.x, p.y, this.skin.hpMul, this.skin.dmgMul, this.skin.speedMul));
    }
  }

  private updateEnemies(dt: number): void {
    const b = this.bounds();
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      updateEnemy(e, dt, this.beast.x, this.beast.y, this.ev);

      e.x = clamp(e.x, b.x0 + e.r * 0.5, b.x1 - e.r * 0.5);
      e.y = clamp(e.y, b.y0 + e.r * 0.5, b.y1 - e.r * 0.5);

      const dx = e.x - this.beast.x;
      const dy = e.y - this.beast.y;
      const d = Math.hypot(dx, dy) || 1;
      const minD = this.hullReach(dx / d, dy / d) + e.r * 0.9;

      if (d < minD) {
        const overlap = minD - d;
        e.x += (dx / d) * overlap;
        e.y += (dy / d) * overlap;
        if (e.hitCd <= 0) {
          e.hitCd = 0.45;
          if (this.beast.dashing) {
            this.damageEnemy(e, this.beast.damage * 1.6);
          } else {
            this.damageEnemy(e, this.beast.damage * 0.55);
            if (this.beast.takeDamage(e.dmg)) this.onPlayerHit();
          }
        }
      }

      if (e.dead) this.enemies.splice(i, 1);
    }
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;

      const off = p.x < -40 || p.y < -40 || p.x > this.view.w + 40 || p.y > this.view.h + 40;
      if (p.life <= 0 || off) {
        this.projectiles.splice(i, 1);
        continue;
      }

      const d = Math.hypot(p.x - this.beast.x, p.y - this.beast.y);
      const reach = this.hullReach((p.x - this.beast.x) / (d || 1), (p.y - this.beast.y) / (d || 1));
      if (d < reach + p.r) {
        if (this.beast.takeDamage(9)) this.onPlayerHit();
        this.projectiles.splice(i, 1);
      }
    }
  }

  private damageEnemy(e: Enemy, amount: number): void {
    if (e.dead) return;
    e.hp -= amount;
    e.flash = 0.09;
    if (e.hp > 0) return;

    killEnemy(e, this.ev);
    this.kills++;
    this.chainT = 2;
    this.mult = Math.min(5, this.mult + 0.5);
    this.score += 100 * this.mult * this.skin.scoreMul;
    this.trauma = Math.min(1, this.trauma + 0.3);
    this.hitstop = 0.045;
    this.audio.play('kill');
    this.particles.spawn(e.x, e.y, {
      count: 10,
      speed: 220,
      r: 4.5,
      color: this.skin.enemy,
      life: 0.6,
    });
  }

  private onPlayerHit(): void {
    this.mult = 1;
    this.chainT = 0;
    this.trauma = Math.min(1, this.trauma + 0.55);
    this.hitstop = 0.055;
    this.audio.play('hit');
    vibrate(12);
    this.particles.spawn(this.beast.x, this.beast.y, {
      count: 12,
      speed: 200,
      r: 5,
      color: '#ffffff',
      life: 0.5,
    });
  }

  private finish(survived: boolean): void {
    if (this.finished) return;
    this.finished = true;
    this.audio.stopMusic();
    if (survived) {
      // Reward leftovers, but cap it so a huge tank cannot dwarf kill score.
      this.score += Math.min(4000, 8 * this.beast.hp);
      this.audio.play('win');
    }
    const score = Math.round(this.score);
    const grade = gradeFor(survived, score);
    this.onEnd({
      survived,
      score,
      kills: this.kills,
      hp: Math.round(this.beast.hp),
      maxHp: this.beast.maxHp,
      timeLeft: Math.max(0, RUN_SECONDS - this.elapsed),
      seed: this.seedLabel,
      arenaId: this.skin.id,
      wave: this.wave,
      grade: grade.grade,
      stars: grade.stars,
    });
  }

  // ------------------------------------------------------------ render

  render(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this.view;

    const bg = ctx.createRadialGradient(w / 2, h * 0.42, 40, w / 2, h * 0.42, Math.max(w, h) * 0.9);
    bg.addColorStop(0, this.skin.bg1);
    bg.addColorStop(1, this.skin.bg2);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    for (const s of this.stars) {
      ctx.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(this.beat * 1.6 + s.p));
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Arena floor
    ctx.strokeStyle = this.skin.rim;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, Math.min(w, h) * 0.46, Math.min(w, h) * 0.46, 0, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (this.elapsed > RUN_SECONDS - 10 && !this.over) {
      const p = 0.5 + 0.5 * Math.sin(this.beat * 6);
      ctx.strokeStyle = this.skin.enemyGlow.replace(/[\d.]+\)$/, `${0.2 + 0.4 * p})`);
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, Math.min(w, h) * 0.47, Math.min(w, h) * 0.47, 0, 0, TAU);
      ctx.stroke();
    }

    const shake = this.trauma * this.trauma;
    const ox = (Math.random() - 0.5) * 20 * shake;
    const oy = (Math.random() - 0.5) * 20 * shake;

    ctx.save();
    ctx.translate(ox, oy);

    this.particles.draw(ctx);

    const colors = { body: '#2a0a14', glow: this.skin.enemyGlow, rim: this.skin.enemy };
    for (const e of this.enemies) drawEnemy(ctx, e, colors);

    ctx.fillStyle = this.skin.enemy;
    ctx.shadowColor = this.skin.enemyGlow;
    ctx.shadowBlur = 14;
    for (const p of this.projectiles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    this.beast.render(ctx);
    ctx.restore();

    this.renderControls(ctx);
  }

  private renderControls(ctx: CanvasRenderingContext2D): void {
    const joy = this.joyPos();
    const dash = this.dashPos();

    // Joystick
    const bx = this.dragActive ? this.baseX : joy.x;
    const by = this.dragActive ? this.baseY : joy.y;
    const kx = this.dragActive ? this.knobX : joy.x;
    const ky = this.dragActive ? this.knobY : joy.y;
    const alpha = this.dragActive ? 1 : 0.3;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bx, by, JOY_RADIUS, 0, TAU);
    ctx.fill();
    ctx.stroke();

    const knob = ctx.createRadialGradient(kx, ky - 6, 2, kx, ky, 26);
    knob.addColorStop(0, '#c9a4ff');
    knob.addColorStop(1, '#5c2a8f');
    ctx.fillStyle = knob;
    ctx.beginPath();
    ctx.arc(kx, ky, 26, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Dash button
    const pressed = this.dashPress > 0 ? 0.92 : 1;
    const ratio = this.beast.dashCdMax > 0 ? 1 - this.beast.dashCd / this.beast.dashCdMax : 1;
    ctx.save();
    ctx.translate(dash.x, dash.y);
    ctx.scale(pressed, pressed);
    ctx.beginPath();
    ctx.arc(0, 0, DASH_RADIUS, 0, TAU);
    ctx.fillStyle = ratio >= 1 ? 'rgba(245,196,69,0.22)' : 'rgba(255,255,255,0.08)';
    ctx.fill();
    ctx.strokeStyle = ratio >= 1 ? '#f5c445' : 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 3;
    ctx.stroke();

    if (ratio < 1) {
      ctx.beginPath();
      ctx.arc(0, 0, DASH_RADIUS - 5, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.02, ratio));
      ctx.strokeStyle = '#f5c445';
      ctx.lineWidth = 5;
      ctx.stroke();
    }

    ctx.fillStyle = ratio >= 1 ? '#f5c445' : 'rgba(255,255,255,0.45)';
    ctx.font = '900 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\u00BB\u00BB', 0, 1);
    ctx.restore();
  }
}
