import { AudioEngine } from './core/audio';
import { Input } from './core/input';
import { TAU } from './core/math';
import type { Vec } from './core/math';
import { randomSeedLabel, todaySeedUTC } from './core/rng';
import type { BeastRecord } from './core/storage';
import { loadSave, patchSave } from './core/storage';
import { Arena } from './game/arena';
import type { ArenaResult, View } from './game/arena';
import type { Anatomy } from './game/anatomy';
import { INK_BUDGET, buildAnatomy, outlineRadius, statBars } from './game/anatomy';
import { ARENAS, arenaById } from './game/arenas';
import type { ArenaSkin } from './game/arenas';
import { WAVE_COUNT } from './game/waves';
import { StrokeSampler, finaliseStroke, renderStroke } from './game/draw';
import { drawCard, downloadCard, drawPortrait } from './game/sharecard';
import { heroOutline, starterOutlines } from './game/starters';

type Scene = 'title' | 'levels' | 'how' | 'draw' | 'beast' | 'arena' | 'result' | 'beasts';

const qs = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

const stage = qs<HTMLCanvasElement>('stage');
const stageCtx = stage.getContext('2d');
if (!stageCtx) throw new Error('Canvas 2D unavailable');
const ctx = stageCtx;

// ------------------------------------------------------------------ dom

const hud = qs('hud');
const hpFill = qs('hp-fill');
const hpText = qs('hp-text');
const waveChip = qs('wave-chip');
const timerChip = qs('timer-chip');
const scoreEl = qs('score');
const multEl = qs('mult');

const screenTitle = qs('screen-title');
const screenLevels = qs('screen-levels');
const screenHow = qs('screen-how');
const screenDraw = qs('screen-draw');
const screenBeast = qs('screen-beast');
const screenResult = qs('screen-result');
const screenBeasts = qs('screen-beasts');

const titleBeast = qs<HTMLCanvasElement>('title-beast');
const titleMeta = qs('title-meta');
const seedChip = qs('seed-chip');
const btnMute = qs<HTMLButtonElement>('btn-mute');

const btnPlay = qs<HTMLButtonElement>('btn-play');
const btnFree = qs<HTMLButtonElement>('btn-free');
const btnLevels = qs<HTMLButtonElement>('btn-levels');
const btnMyBeasts = qs<HTMLButtonElement>('btn-mybeasts');
const btnHow = qs<HTMLButtonElement>('btn-how');
const btnLevelsBack = qs<HTMLButtonElement>('btn-levels-back');
const levelsList = qs('levels-list');
const beastsList = qs('beasts-list');
const btnBeastsBack = qs<HTMLButtonElement>('btn-beasts-back');

const howSteps = Array.from(document.querySelectorAll<HTMLElement>('.how-step'));
const btnHowNext = qs<HTMLButtonElement>('btn-how-next');
const btnHowSkip = qs<HTMLButtonElement>('btn-how-skip');

const drawCanvas = qs<HTMLCanvasElement>('draw-canvas');
const draw2d = drawCanvas.getContext('2d');
if (!draw2d) throw new Error('Canvas 2D unavailable');
const drawCtx: CanvasRenderingContext2D = draw2d;
const inkFill = qs('ink-fill');
const inkText = qs('ink-text');
const drawHint = qs('draw-hint');
const btnDone = qs<HTMLButtonElement>('btn-done');
const btnRedraw = qs<HTMLButtonElement>('btn-redraw');
const starterButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.starter'));

const beastCanvas = qs<HTMLCanvasElement>('beast-canvas');
const statList = qs('stat-list');
const derivedEl = qs('derived');
const traitTag = qs('trait-tag');
const btnEnter = qs<HTMLButtonElement>('btn-enter');
const btnBackDraw = qs<HTMLButtonElement>('btn-back-draw');

const resultTitle = qs('result-title');
const resTime = qs('res-time');
const resKills = qs('res-kills');
const resScore = qs('res-score');
const resBest = qs('res-best');
const resGrade = qs('res-grade');
const resultBeast = qs<HTMLCanvasElement>('result-beast');
const shareCard = qs<HTMLCanvasElement>('share-card');
const btnAgain = qs<HTMLButtonElement>('btn-again');
const btnShare = qs<HTMLButtonElement>('btn-share');
const btnSaveCard = qs<HTMLButtonElement>('btn-save-card');
const btnHome = qs<HTMLButtonElement>('btn-home');
const btnNewBeast = qs<HTMLButtonElement>('btn-newbeast');

const toastEl = qs('toast');

// ------------------------------------------------------------------ state

const view: View = { w: window.innerWidth, h: window.innerHeight };
const audio = new AudioEngine();
const input = new Input(stage);
const save = loadSave();

audio.muted = save.muted;

let scene: Scene = 'title';
let arena: Arena | null = null;
let anatomy: Anatomy | null = null;
let sampler = new StrokeSampler();
let pendingPoints: Vec[] = [];
let drawSize = { w: 320, h: 300 };
let drawLocked = false;
let lastResult: ArenaResult | null = null;
let lastBestRun = false;
let pendingStart: 'draw' | null = null;
let howIndex = 0;
let toastTimer = 0;
let currentArenaId = save.arenaId || 'meadow';
let acc = 0;
/** Seed for the next run: the UTC date for Daily Challenge, random for Free Play. */
let runSeed = todaySeedUTC();
let runMode: 'daily' | 'free' = 'daily';

const seedLabel = (): string => runSeed;
const maxRadius = (): number => Math.min(72, Math.min(view.w, view.h) * 0.14);
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

// ------------------------------------------------------------------ stage

function resize(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  view.w = Math.max(1, window.innerWidth);
  view.h = Math.max(1, window.innerHeight);
  stage.width = Math.round(view.w * dpr);
  stage.height = Math.round(view.h * dpr);
  stage.style.width = `${view.w}px`;
  stage.style.height = `${view.h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (scene !== 'arena') paintBackdrop();
  sizeDrawCanvas();
}

function paintBackdrop(): void {
  const g = ctx.createRadialGradient(view.w / 2, view.h * 0.24, 30, view.w / 2, view.h * 0.3, Math.max(view.w, view.h) * 0.95);
  g.addColorStop(0, '#3a2260');
  g.addColorStop(0.5, '#1b1030');
  g.addColorStop(1, '#0c0715');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, view.w, view.h);

  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#b06bff';
  const cx = view.w / 2;
  const cy = view.h * 0.14;
  const glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(view.w, view.h) * 0.55);
  glow.addColorStop(0, 'rgba(160, 90, 255, 0.5)');
  glow.addColorStop(1, 'rgba(160, 90, 255, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(view.w, view.h) * 0.55, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => window.setTimeout(resize, 140));

// ------------------------------------------------------------------ scenes

const allScreens = [screenTitle, screenLevels, screenHow, screenDraw, screenBeast, screenResult, screenBeasts];

function setScene(next: Scene): void {
  scene = next;
  for (const el of allScreens) el.classList.add('is-hidden');

  switch (next) {
    case 'title':
      screenTitle.classList.remove('is-hidden');
      break;
    case 'levels':
      screenLevels.classList.remove('is-hidden');
      break;
    case 'how':
      screenHow.classList.remove('is-hidden');
      break;
    case 'draw':
      screenDraw.classList.remove('is-hidden');
      break;
    case 'beast':
      screenBeast.classList.remove('is-hidden');
      break;
    case 'result':
      screenResult.classList.remove('is-hidden');
      break;
    case 'beasts':
      screenBeasts.classList.remove('is-hidden');
      break;
    case 'arena':
      break;
  }

  hud.classList.toggle('is-hidden', next !== 'arena');
  if (next !== 'arena') paintBackdrop();
  if (next === 'draw') {
    window.setTimeout(sizeDrawCanvas, 30);
  }
}

function toast(msg: string): void {
  toastEl.textContent = msg;
  toastEl.classList.remove('is-hidden');
  toastTimer = 1.6;
}

// ------------------------------------------------------------------ title

function drawBeastSilhouette(canvas: HTMLCanvasElement, outline: Vec[], radius: number): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  g.clearRect(0, 0, canvas.width, canvas.height);
  const r = radius / (outlineRadius(outline) || 1);
  drawPortrait(g, outline.map((p) => ({ x: p.x * r, y: p.y * r })), canvas.width / 2, canvas.height / 2, radius);
}

function refreshTitle(): void {
  titleMeta.textContent = `best ${save.best.toLocaleString('en-US')} \u00B7 ${save.beasts.length} beasts drawn`;
  seedChip.textContent = `${runMode === 'daily' ? 'DAILY' : 'FREE'} \u00B7 ${runSeed}`;
  btnMute.textContent = audio.muted ? 'SOUND OFF' : 'SOUND ON';

  const hero = heroOutline(108);
  drawBeastSilhouette(titleBeast, hero, 108);
}

// ------------------------------------------------------------------ levels

function totalStars(): number {
  return Object.values(save.arenaStars).reduce((a, b) => a + b, 0);
}

function renderLevels(): void {
  const stars = totalStars();
  levelsList.innerHTML = '';
  for (const skin of ARENAS) {
    const unlocked = stars >= skin.unlockStars;
    const owned = save.arenaStars[skin.id] ?? 0;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `level${unlocked ? '' : ' locked'}`;

    const dot = document.createElement('span');
    dot.className = 'level-dot';
    dot.style.background = `radial-gradient(circle at 40% 35%, ${skin.enemyGlow}, ${skin.bg2})`;
    dot.style.borderColor = skin.rim;

    const info = document.createElement('div');
    info.className = 'level-info';
    const name = document.createElement('div');
    name.className = 'level-name';
    name.textContent = `${skin.index + 1}. ${skin.name}`;
    const blurb = document.createElement('div');
    blurb.className = 'level-blurb';
    blurb.textContent = unlocked ? skin.blurb : `Survive ${skin.unlockStars} stars to unlock`;
    info.append(name, blurb);

    const starEl = document.createElement('div');
    starEl.className = 'level-stars';
    starEl.textContent = unlocked ? '\u2605'.repeat(owned) + '\u2606'.repeat(3 - owned) : '\u{1F512}';

    btn.append(dot, info, starEl);
    btn.addEventListener('click', () => {
      if (!unlocked) {
        toast(`Need ${skin.unlockStars} stars`);
        return;
      }
      currentArenaId = skin.id;
      patchSave({ arenaId: skin.id });
      audio.play('ui');
      beginRun();
    });

    levelsList.appendChild(btn);
  }
}

// ------------------------------------------------------------------ beasts library

function renderBeastLibrary(): void {
  beastsList.innerHTML = '';
  if (save.beasts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No beasts saved yet. Draw one and survive a run.';
    beastsList.appendChild(empty);
    return;
  }

  for (const record of save.beasts) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'beast-card';

    const c = document.createElement('canvas');
    c.width = 150;
    c.height = 120;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = '#efe3c2';
      g.fillRect(0, 0, c.width, c.height);
      drawPortrait(g, record.outline, c.width / 2, c.height / 2, 42);
    }

    const label = document.createElement('span');
    label.textContent = `${record.grade} \u00B7 ${record.score}`;
    card.append(c, label);

    card.addEventListener('click', () => {
      const built = buildAnatomy(record.outline, maxRadius());
      if (!built) {
        toast('That beast is unreadable');
        return;
      }
      anatomy = built;
      audio.play('ui');
      showBeastScreen();
    });

    beastsList.appendChild(card);
  }
}

// ------------------------------------------------------------------ draw surface

function sizeDrawCanvas(): void {
  const rect = drawCanvas.getBoundingClientRect();
  if (rect.width < 20 || rect.height < 20) return;
  drawSize = { w: rect.width, h: rect.height };
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  drawCanvas.width = Math.round(rect.width * dpr);
  drawCanvas.height = Math.round(rect.height * dpr);
  drawCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderDrawSurface();
}

function renderDrawSurface(): void {
  const { w, h } = drawSize;
  drawCtx.clearRect(0, 0, w, h);
  drawCtx.fillStyle = '#fff8e4';
  drawCtx.fillRect(0, 0, w, h);

  drawCtx.save();
  drawCtx.setLineDash([6, 9]);
  drawCtx.strokeStyle = 'rgba(36,20,54,0.14)';
  drawCtx.lineWidth = 2;
  drawCtx.beginPath();
  drawCtx.arc(w / 2, h / 2, Math.min(w, h) * 0.3, 0, TAU);
  drawCtx.stroke();
  drawCtx.restore();

  if (sampler.points.length > 0) {
    renderStroke(drawCtx, sampler.points, '#241436');
  }

  if (pendingPoints.length > 2 && sampler.points.length === 0) {
    drawCtx.beginPath();
    drawCtx.moveTo(pendingPoints[0].x, pendingPoints[0].y);
    for (let i = 1; i < pendingPoints.length; i++) drawCtx.lineTo(pendingPoints[i].x, pendingPoints[i].y);
    drawCtx.closePath();
    drawCtx.fillStyle = 'rgba(122, 47, 192, 0.18)';
    drawCtx.fill();
    drawCtx.strokeStyle = '#4a1a7a';
    drawCtx.lineWidth = 6;
    drawCtx.lineJoin = 'round';
    drawCtx.stroke();
  }

  if (sampler.points.length > 2) {
    const first = sampler.points[0];
    const last = sampler.points[sampler.points.length - 1];
    drawCtx.save();
    drawCtx.setLineDash([4, 6]);
    drawCtx.strokeStyle = 'rgba(122,47,192,0.5)';
    drawCtx.lineWidth = 3;
    drawCtx.beginPath();
    drawCtx.moveTo(last.x, last.y);
    drawCtx.lineTo(first.x, first.y);
    drawCtx.stroke();
    drawCtx.restore();
  }
}

function updateInk(): void {
  const remaining = Math.max(0, Math.round(INK_BUDGET - sampler.length));
  inkText.textContent = `${remaining} / ${INK_BUDGET}`;
  inkFill.style.width = `${Math.max(0, (remaining / INK_BUDGET) * 100)}%`;
}

function localPoint(e: PointerEvent): { x: number; y: number } {
  const r = drawCanvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function onDrawDown(e: PointerEvent): void {
  if (scene !== 'draw' || drawLocked) return;
  e.preventDefault();
  try {
    drawCanvas.setPointerCapture(e.pointerId);
  } catch {
    /* best effort */
  }
  pendingPoints = [];
  sampler.begin(localPoint(e).x, localPoint(e).y);
  drawHint.classList.add('is-hidden');
  updateInk();
  renderDrawSurface();
}

function onDrawMove(e: PointerEvent): void {
  if (scene !== 'draw' || drawLocked) return;
  if (!sampler.isDrawing) return;
  const p = localPoint(e);
  sampler.push(p.x, p.y);
  updateInk();
  if (sampler.finished) {
    finishStroke();
    return;
  }
  renderDrawSurface();
}

function onDrawUp(e: PointerEvent): void {
  if (scene !== 'draw' || drawLocked) return;
  e.preventDefault();
  if (!sampler.isDrawing) return;
  finishStroke();
}

function finishStroke(): void {
  if (sampler.points.length < 4) {
    sampler.reset();
    pendingPoints = [];
    updateInk();
    renderDrawSurface();
    return;
  }
  pendingPoints = sampler.close();
  sampler.reset();
  btnDone.disabled = false;
  renderDrawSurface();
}

drawCanvas.addEventListener('pointerdown', onDrawDown);
drawCanvas.addEventListener('pointermove', onDrawMove);
drawCanvas.addEventListener('pointerup', onDrawUp);
drawCanvas.addEventListener('pointercancel', onDrawUp);
drawCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

btnRedraw.addEventListener('click', () => {
  audio.play('ui');
  sampler.reset();
  pendingPoints = [];
  drawHint.classList.remove('is-hidden');
  updateInk();
  btnDone.disabled = true;
  renderDrawSurface();
});

btnDone.addEventListener('click', () => {
  if (pendingPoints.length < 4) {
    toast('Draw a shape first');
    return;
  }
  const built = finaliseStroke(pendingPoints, maxRadius());
  if (!built) {
    toast('Too small — draw bigger');
    return;
  }
  audio.play('ui');
  anatomy = built;
  showBeastScreen();
});

// ------------------------------------------------------------------ beast screen

function showBeastScreen(): void {
  if (!anatomy) return;
  setScene('beast');

  traitTag.textContent = anatomy.stats.trait;

  statList.innerHTML = '';
  const icons: Record<string, string> = { hp: '\u2665', atk: '\u2694', spd: '\u27A4', def: '\u26E8' };
  const pending: Array<{ el: HTMLElement; pct: number }> = [];

  for (const bar of statBars(anatomy.stats)) {
    const row = document.createElement('div');
    row.className = 'stat-row';
    const ico = document.createElement('span');
    ico.className = `ico${bar.accent ? ' accent' : ''}`;
    ico.textContent = icons[bar.key] ?? '\u25CF';
    const label = document.createElement('span');
    label.textContent = bar.label;
    const val = document.createElement('span');
    val.className = 'val';
    val.textContent = bar.display;
    const track = document.createElement('i');
    track.className = 'bar';
    const fill = document.createElement('b');
    track.appendChild(fill);
    row.append(ico, label, val, track);
    statList.appendChild(row);
    pending.push({ el: fill, pct: Math.round(clamp01(bar.value) * 100) });
  }

  const dashRow = document.createElement('div');
  dashRow.className = 'stat-row';
  const dIco = document.createElement('span');
  dIco.className = 'ico';
  dIco.textContent = '\u26A1';
  const dLabel = document.createElement('span');
  dLabel.textContent = 'DASH';
  const dVal = document.createElement('span');
  dVal.className = 'val';
  dVal.textContent = `${anatomy.stats.dashCooldown.toFixed(1)}s`;
  dashRow.append(dIco, dLabel, dVal);
  statList.appendChild(dashRow);

  // Two frames so the browser paints width:0 first and the bars animate in.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      for (const p of pending) p.el.style.width = `${p.pct}%`;
    });
  });

  const s = anatomy.stats;
  derivedEl.textContent = `Area: ${s.area.toLocaleString('en-US')} px\u00B2   Perimeter: ${s.perimeter.toLocaleString('en-US')} px   Vertices: ${s.vertices}   Thickness: ${s.thickness} px`;

  const g = beastCanvas.getContext('2d');
  if (g) {
    g.clearRect(0, 0, beastCanvas.width, beastCanvas.height);
    drawPortrait(g, anatomy.outline, beastCanvas.width / 2, beastCanvas.height / 2, 74);
  }
}

btnEnter.addEventListener('click', () => {
  audio.play('ui');
  startArena();
});

btnBackDraw.addEventListener('click', () => {
  audio.play('ui');
  startDraw();
});

// ------------------------------------------------------------------ arena

function startDraw(): void {
  sampler = new StrokeSampler();
  pendingPoints = [];
  drawLocked = false;
  btnDone.disabled = true;
  drawHint.classList.remove('is-hidden');
  setScene('draw');
  updateInk();
  window.setTimeout(() => {
    sizeDrawCanvas();
    renderDrawSurface();
  }, 40);
}

function startArena(): void {
  if (!anatomy) {
    startDraw();
    return;
  }
  audio.init();
  const skin: ArenaSkin = arenaById(currentArenaId);
  arena = new Arena(view, anatomy, seedLabel(), skin, audio, onArenaEnd);
  setScene('arena');
  input.handler = arena;
  input.cancel();
  resetHud();
  acc = 0;
  // Paint and sync the HUD immediately: a stalled/throttled frame loop must
  // never leave the arena blank or the HUD showing placeholder zeroes.
  arena.render(ctx);
  updateHud();
}

function onArenaEnd(result: ArenaResult): void {
  lastResult = result;
  input.handler = null;

  const previousBest = save.best;
  lastBestRun = result.score > previousBest;

  const arenaBest = { ...save.arenaBest, [result.arenaId]: Math.max(save.arenaBest[result.arenaId] ?? 0, result.score) };
  const arenaStars = {
    ...save.arenaStars,
    [result.arenaId]: Math.max(save.arenaStars[result.arenaId] ?? 0, result.stars),
  };

  let beasts = save.beasts;
  if (anatomy) {
    const record: BeastRecord = {
      id: `${Date.now()}`,
      created: Date.now(),
      outline: anatomy.outline.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })),
      score: result.score,
      arenaId: result.arenaId,
      grade: result.grade,
    };
    beasts = [record, ...save.beasts].slice(0, 8);
  }

  patchSave({
    best: Math.max(previousBest, result.score),
    runs: save.runs + 1,
    arenaBest,
    arenaStars,
    beasts,
    dailyBest: {
      ...save.dailyBest,
      [result.seed]: Math.max(save.dailyBest[result.seed] ?? 0, result.score),
    },
  });

  const survivedSeconds = 60 - result.timeLeft;
  resultTitle.textContent = result.survived ? 'RUN COMPLETE!' : 'INKED OUT';
  resTime.textContent = `${survivedSeconds.toFixed(1)} s`;
  resKills.textContent = String(result.kills);
  resScore.textContent = result.score.toLocaleString('en-US');
  resGrade.textContent = result.grade;
  resBest.classList.toggle('is-hidden', !lastBestRun);

  const g = resultBeast.getContext('2d');
  if (g && anatomy) {
    g.clearRect(0, 0, resultBeast.width, resultBeast.height);
    drawPortrait(g, anatomy.outline, resultBeast.width / 2, resultBeast.height / 2, 56);
  }

  shareCard.classList.add('is-hidden');
  setScene('result');
  refreshTitle();
}

// ------------------------------------------------------------------ result buttons

btnAgain.addEventListener('click', () => {
  audio.play('ui');
  startArena();
});

btnShare.addEventListener('click', () => {
  if (!lastResult || !anatomy) return;
  audio.play('ui');
  const g = shareCard.getContext('2d');
  if (!g) return;
  drawCard(g, {
    outline: anatomy.outline,
    score: lastResult.score,
    kills: lastResult.kills,
    survivedSeconds: 60 - lastResult.timeLeft,
    grade: lastResult.grade,
    seed: lastResult.seed,
    arenaName: arenaById(lastResult.arenaId).name,
    best: lastBestRun,
  });
  shareCard.classList.remove('is-hidden');
  shareCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

btnSaveCard.addEventListener('click', () => {
  if (!lastResult) return;
  audio.play('ui');
  drawCard(shareCard.getContext('2d') as CanvasRenderingContext2D, {
    outline: anatomy ? anatomy.outline : [],
    score: lastResult.score,
    kills: lastResult.kills,
    survivedSeconds: 60 - lastResult.timeLeft,
    grade: lastResult.grade,
    seed: lastResult.seed,
    arenaName: arenaById(lastResult.arenaId).name,
    best: lastBestRun,
  });
  downloadCard(shareCard, lastResult.seed);
  toast('Share card saved');
});

btnHome.addEventListener('click', () => {
  audio.play('ui');
  arena = null;
  setScene('title');
  refreshTitle();
});

btnNewBeast.addEventListener('click', () => {
  audio.play('ui');
  arena = null;
  startDraw();
});

// ------------------------------------------------------------------ menu

function beginRun(): void {
  if (save.tutorialSeen) {
    startDraw();
    return;
  }
  howIndex = 0;
  pendingStart = 'draw';
  renderHow();
  setScene('how');
}

btnPlay.addEventListener('click', () => {
  audio.init();
  audio.setMuted(save.muted);
  audio.play('ui');
  runMode = 'daily';
  runSeed = todaySeedUTC();
  refreshTitle();
  beginRun();
});

btnFree.addEventListener('click', () => {
  audio.init();
  audio.setMuted(save.muted);
  audio.play('ui');
  runMode = 'free';
  runSeed = randomSeedLabel();
  refreshTitle();
  beginRun();
});

btnLevels.addEventListener('click', () => {
  audio.play('ui');
  renderLevels();
  setScene('levels');
});

btnLevelsBack.addEventListener('click', () => {
  audio.play('ui');
  setScene('title');
});

btnMyBeasts.addEventListener('click', () => {
  audio.play('ui');
  renderBeastLibrary();
  setScene('beasts');
});

btnBeastsBack.addEventListener('click', () => {
  audio.play('ui');
  setScene('title');
});

btnHow.addEventListener('click', () => {
  howIndex = 0;
  pendingStart = null;
  renderHow();
  setScene('how');
});

function renderHow(): void {
  howSteps.forEach((el, i) => el.classList.toggle('is-hidden', i !== howIndex));
  btnHowNext.textContent = howIndex >= howSteps.length - 1 ? "LET'S DRAW" : 'NEXT';
}

btnHowNext.addEventListener('click', () => {
  audio.init();
  audio.play('ui');
  if (howIndex < howSteps.length - 1) {
    howIndex++;
    renderHow();
    return;
  }
  patchSave({ tutorialSeen: true });
  if (pendingStart === 'draw') {
    pendingStart = null;
    startDraw();
  } else {
    setScene('title');
  }
});

btnHowSkip.addEventListener('click', () => {
  patchSave({ tutorialSeen: true });
  if (pendingStart === 'draw') {
    pendingStart = null;
    startDraw();
  } else {
    setScene('title');
  }
});

btnMute.addEventListener('click', () => {
  audio.init();
  const next = !audio.muted;
  audio.setMuted(next);
  audio.muted = next;
  patchSave({ muted: next });
  btnMute.textContent = next ? 'SOUND OFF' : 'SOUND ON';
});

// ------------------------------------------------------------------ starters

function renderStarters(): void {
  // 54x54 canvas: keep the shape inside it with a little breathing room.
  const outs = starterOutlines(21);
  starterButtons.forEach((btn, i) => {
    const c = btn.querySelector('canvas');
    const g = c ? c.getContext('2d') : null;
    const starter = outs[i];
    if (!g || !starter) return;
    g.clearRect(0, 0, 54, 54);
    g.fillStyle = '#241436';
    g.beginPath();
    g.moveTo(27 + starter.points[0].x, 27 + starter.points[0].y);
    for (let k = 1; k < starter.points.length; k++) g.lineTo(27 + starter.points[k].x, 27 + starter.points[k].y);
    g.closePath();
    g.fill();

    btn.addEventListener('click', () => {
      if (scene !== 'draw') return;
      const built = buildAnatomy(starter.points, maxRadius());
      if (!built) return;
      audio.play('ui');
      anatomy = built;
      showBeastScreen();
    });
  });
}

// ------------------------------------------------------------------ hud

let hudCache = { hp: -1, max: -1, score: -1, mult: -1, time: -1, wave: -1 };

function resetHud(): void {
  hudCache = { hp: -1, max: -1, score: -1, mult: -1, time: -1, wave: -1 };
}

function updateHud(): void {
  if (!arena) return;
  const s = arena.getHud();

  if (s.hp !== hudCache.hp || s.maxHp !== hudCache.max) {
    hudCache.hp = s.hp;
    hudCache.max = s.maxHp;
    hpFill.style.width = `${Math.round((s.hp / s.maxHp) * 100)}%`;
    hpText.textContent = `${Math.round(s.hp)}/${s.maxHp}`;
  }
  if (s.score !== hudCache.score) {
    hudCache.score = s.score;
    scoreEl.textContent = s.score.toLocaleString('en-US');
  }
  if (s.mult !== hudCache.mult) {
    hudCache.mult = s.mult;
    multEl.textContent = `x${s.mult.toFixed(1)}`;
  }
  if (s.wave !== hudCache.wave) {
    hudCache.wave = s.wave;
    waveChip.textContent = `WAVE ${s.wave}/${WAVE_COUNT}`;
  }
  const t = Math.ceil(s.timeLeft);
  if (t !== hudCache.time) {
    hudCache.time = t;
    const mm = String(Math.floor(t / 60)).padStart(2, '0');
    const ss = String(t % 60).padStart(2, '0');
    timerChip.textContent = `${mm}:${ss}`;
  }
}

// ------------------------------------------------------------------ loop

const FIXED = 1 / 60;
let last = performance.now();

function frame(now: number): void {
  requestAnimationFrame(frame);
  const raw = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (toastTimer > 0) {
    toastTimer -= raw;
    if (toastTimer <= 0) toastEl.classList.add('is-hidden');
  }

  if (document.hidden) {
    // Tab is throttled/hidden: pause the simulation but still paint, so the
    // arena never shows a stale frame when the tab comes back.
    acc = 0;
  }

  if (scene === 'arena' && arena) {
    if (!document.hidden) {
      acc += raw;
      let steps = 0;
      while (acc >= FIXED && steps < 5) {
        arena.update(FIXED);
        acc -= FIXED;
        steps++;
      }
      if (steps >= 5) acc = 0;
    }
    arena.render(ctx);
    updateHud();
  }
}

// ------------------------------------------------------------------ boot

resize();
renderStarters();
refreshTitle();
setScene('title');

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) last = performance.now();
});

requestAnimationFrame(frame);

