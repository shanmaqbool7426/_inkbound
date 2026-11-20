import { TAU, clamp } from '../core/math';

export type EnemyKind = 'seeker' | 'splitter' | 'lancer' | 'bloomer';

export interface Enemy {
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  r: number;
  dmg: number;
  speed: number;
  hitCd: number;
  emitCd: number;
  wobble: number;
  flash: number;
  dead: boolean;
  /** Lancer only: 0 = roam, 1 = wind-up, 2 = charge. */
  phase: number;
  phaseT: number;
  aimX: number;
  aimY: number;
}

export interface EnemyEvents {
  spawn(kind: EnemyKind, x: number, y: number): void;
  shoot(x: number, y: number, vx: number, vy: number): void;
}

const BASE: Record<EnemyKind, { r: number; hp: number; dmg: number; speed: number }> = {
  seeker: { r: 10, hp: 10, dmg: 10, speed: 96 },
  splitter: { r: 16, hp: 26, dmg: 14, speed: 74 },
  lancer: { r: 14, hp: 34, dmg: 20, speed: 62 },
  bloomer: { r: 22, hp: 62, dmg: 16, speed: 34 },
};

const LANCER_WINDUP = 0.6;
const LANCER_CHARGE = 0.42;
const LANCER_RECOVER = 1.15;
const BLOOMER_RATE = 2.6;
const BLOOMER_PETALS = 8;

export function createEnemy(kind: EnemyKind, x: number, y: number, hpMul = 1, dmgMul = 1, speedMul = 1): Enemy {
  const b = BASE[kind];
  return {
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    hp: Math.round(b.hp * hpMul),
    maxHp: Math.round(b.hp * hpMul),
    r: b.r,
    dmg: b.dmg * dmgMul,
    speed: b.speed * speedMul,
    hitCd: 0,
    emitCd: kind === 'bloomer' ? 1.4 : 0,
    wobble: Math.random() * TAU,
    flash: 0,
    dead: false,
    phase: 0,
    phaseT: kind === 'lancer' ? 0.6 + Math.random() * 0.8 : 0,
    aimX: 0,
    aimY: 1,
  };
}

export function updateEnemy(e: Enemy, dt: number, bx: number, by: number, ev: EnemyEvents): void {
  if (e.dead) return;
  e.hitCd = Math.max(0, e.hitCd - dt);
  e.flash = Math.max(0, e.flash - dt);
  e.wobble += dt * 5;

  const dx = bx - e.x;
  const dy = by - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;

  switch (e.kind) {
    case 'seeker': {
      const wob = Math.sin(e.wobble) * 0.35;
      e.vx = (nx - ny * wob) * e.speed;
      e.vy = (ny + nx * wob) * e.speed;
      break;
    }
    case 'splitter': {
      const wob = Math.sin(e.wobble * 1.4) * 0.18;
      e.vx = (nx - ny * wob) * e.speed;
      e.vy = (ny + nx * wob) * e.speed;
      break;
    }
    case 'lancer': {
      if (e.phase === 0) {
        // Slow stalk, then lock on and telegraph.
        e.vx = nx * e.speed * 0.55;
        e.vy = ny * e.speed * 0.55;
        e.phaseT -= dt;
        if (dist < 360 && e.phaseT <= 0) {
          e.phase = 1;
          e.phaseT = LANCER_WINDUP;
        }
      } else if (e.phase === 1) {
        // Wind-up: holds position and keeps aiming so the player can dodge.
        e.vx *= 0.86;
        e.vy *= 0.86;
        e.aimX = nx;
        e.aimY = ny;
        e.phaseT -= dt;
        if (e.phaseT <= 0) {
          e.phase = 2;
          e.phaseT = LANCER_CHARGE;
        }
      } else {
        // Charge: locked direction, cannot steer.
        e.vx = e.aimX * e.speed * 4.6;
        e.vy = e.aimY * e.speed * 4.6;
        e.phaseT -= dt;
        if (e.phaseT <= 0) {
          e.phase = 0;
          e.phaseT = LANCER_RECOVER;
        }
      }
      break;
    }
    case 'bloomer': {
      // Barely moves; acts as a radial hazard turret.
      const want = 150;
      const push = dist > want + 50 ? 0.7 : dist < want - 50 ? -0.6 : 0;
      e.vx = nx * e.speed * push;
      e.vy = ny * e.speed * push;

      e.emitCd -= dt;
      if (e.emitCd <= 0 && dist < 520) {
        e.emitCd = BLOOMER_RATE;
        const spin = e.wobble * 0.12;
        for (let i = 0; i < BLOOMER_PETALS; i++) {
          const a = (i / BLOOMER_PETALS) * TAU + spin;
          ev.shoot(e.x, e.y, Math.cos(a) * 150, Math.sin(a) * 150);
        }
      }
      break;
    }
  }

  e.x += e.vx * dt;
  e.y += e.vy * dt;
}

export function killEnemy(e: Enemy, ev: EnemyEvents): void {
  if (e.dead) return;
  e.dead = true;
  if (e.kind === 'splitter') {
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * TAU;
      ev.spawn('seeker', e.x + Math.cos(a) * 16, e.y + Math.sin(a) * 16);
    }
  }
}

export interface EnemyColors {
  body: string;
  glow: string;
  rim: string;
}

function polygon(ctx: CanvasRenderingContext2D, n: number, inner: number, outer: number, phase: number): void {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * TAU + phase;
    const rr = i % 2 === 0 ? outer : inner;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, colors: EnemyColors): void {
  ctx.save();
  ctx.translate(e.x, e.y);

  // Glow
  const g = ctx.createRadialGradient(0, 0, 1, 0, 0, e.r * 2.6);
  g.addColorStop(0, e.flash > 0 ? 'rgba(255,255,255,0.85)' : colors.glow);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, e.r * 2.6, 0, TAU);
  ctx.fill();

  ctx.fillStyle = e.flash > 0 ? '#ffffff' : colors.body;
  ctx.strokeStyle = colors.rim;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';

  switch (e.kind) {
    case 'seeker': {
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'splitter': {
      polygon(ctx, 8, e.r * 0.7, e.r * 1.35, e.wobble * 0.15);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'lancer': {
      const angle = Math.atan2(e.phase === 0 ? e.vy : e.aimY, e.phase === 0 ? e.vx : e.aimX) || -Math.PI / 2;
      ctx.rotate(angle + Math.PI / 2);

      // Telegraph line during wind-up.
      if (e.phase === 1) {
        const a = 1 - e.phaseT / LANCER_WINDUP;
        ctx.save();
        ctx.setLineDash([7, 7]);
        ctx.strokeStyle = `rgba(255, 90, 110, ${0.25 + 0.55 * a})`;
        ctx.lineWidth = 2 + 3 * a;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -420);
        ctx.stroke();
        ctx.restore();
      }

      const stretch = e.phase === 2 ? 1.45 : 1;
      ctx.beginPath();
      ctx.moveTo(0, -e.r * 1.7 * stretch);
      ctx.lineTo(e.r * 0.95, e.r * 0.9);
      ctx.lineTo(0, e.r * 0.35);
      ctx.lineTo(-e.r * 0.95, e.r * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.rotate(-(angle + Math.PI / 2));
      break;
    }
    case 'bloomer': {
      polygon(ctx, BLOOMER_PETALS, e.r * 0.62, e.r * 1.3, e.wobble * 0.25);
      ctx.fill();
      ctx.stroke();
      ctx.save();
      ctx.globalAlpha = 0.6;
      polygon(ctx, BLOOMER_PETALS, e.r * 0.4, e.r * 0.78, -e.wobble * 0.3);
      ctx.fillStyle = colors.rim;
      ctx.fill();
      ctx.restore();
      break;
    }
  }

  // Eyes
  const eyeGap = e.kind === 'seeker' ? 4 : 5.5;
  const eyeR = e.kind === 'seeker' ? 2.2 : 2.8;
  ctx.fillStyle = '#fff2f4';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * eyeGap, -eyeGap * 0.35, eyeR, 0, TAU);
    ctx.fill();
  }

  if (e.maxHp > 24 && e.hp < e.maxHp) {
    const w = e.r * 1.9;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(-w / 2, -e.r - 9, w, 3);
    ctx.fillStyle = colors.rim;
    ctx.fillRect(-w / 2, -e.r - 9, w * clamp(e.hp / e.maxHp, 0, 1), 3);
  }

  ctx.restore();
}
