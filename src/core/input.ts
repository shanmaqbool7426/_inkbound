export interface InputHandler {
  onDown?(x: number, y: number): void;
  onMove?(x: number, y: number): void;
  onUp?(x: number, y: number): void;
  onDash?(): void;
}

/**
 * Unified pointer input. Primary pointer drives drag/joystick, a second
 * simultaneous pointer (or Space / right-click) fires a dash.
 */
export class Input {
  handler: InputHandler | null = null;
  enabled = true;

  private readonly canvas: HTMLCanvasElement;
  private readonly active = new Set<number>();
  private primaryId: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('blur', this.onBlur);
  }

  private toLocal(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.enabled || !this.handler) return;
    e.preventDefault();
    if (e.pointerType === 'mouse' && e.button === 2) {
      this.handler.onDash?.();
      return;
    }
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    this.active.add(e.pointerId);
    if (this.primaryId === null) {
      this.primaryId = e.pointerId;
      const p = this.toLocal(e);
      this.handler.onDown?.(p.x, p.y);
    } else if (this.active.size === 2) {
      this.handler.onDash?.();
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.enabled || !this.handler) return;
    if (e.pointerId !== this.primaryId) return;
    const p = this.toLocal(e);
    this.handler.onMove?.(p.x, p.y);
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.active.delete(e.pointerId);
    if (e.pointerId !== this.primaryId) return;
    this.primaryId = null;
    if (!this.handler) return;
    const p = this.toLocal(e);
    this.handler.onUp?.(p.x, p.y);
  };

  private onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.enabled || !this.handler) return;
    if (e.code === 'Space' || e.code === 'ArrowRight') {
      e.preventDefault();
      if (!e.repeat) this.handler.onDash?.();
    }
  };

  /** Losing focus mid-drag must not leave a stuck joystick. */
  private onBlur = (): void => {
    const hadPrimary = this.primaryId !== null;
    this.primaryId = null;
    this.active.clear();
    if (hadPrimary && this.handler) this.handler.onUp?.(0, 0);
  };

  /** Abort any in-flight gesture (used when switching scenes). */
  cancel(): void {
    this.onBlur();
  }
}
