const cache = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();

function build(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const size = 96;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (!g) return null;
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 228 + Math.random() * 22;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v - 3;
    img.data[i * 4 + 2] = v - 10;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return ctx.createPattern(c, 'repeat');
}

export function paperPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const hit = cache.get(ctx);
  if (hit) return hit;
  const made = build(ctx);
  if (made) cache.set(ctx, made);
  return made;
}

export function paintPaper(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#f5f1e8';
  ctx.fillRect(0, 0, w, h);
  const p = paperPattern(ctx);
  if (!p) return;
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = p;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
}
