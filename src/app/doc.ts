import type { RGB, Rect } from '../paint/types';
import { rgbToCss } from './color';
import { clip, intRect } from './geometry';

/** Undo levels, same as Windows 10 Paint (verified). */
export const UNDO_LIMIT = 50;

type Entry =
  | { kind: 'patch'; x: number; y: number; before: ImageData; after: ImageData }
  | { kind: 'full'; before: HTMLCanvasElement; after: HTMLCanvasElement };

export function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function ctx2d(c: HTMLCanvasElement, willReadFrequently = false): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', { willReadFrequently });
  if (!ctx) throw new Error('Canvas 2D not available');
  return ctx;
}

export function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = createCanvas(src.width, src.height);
  ctx2d(c).drawImage(src, 0, 0);
  return c;
}

/**
 * Image being edited. `canvas` is the current content; `backup` keeps the last committed state
 * to build undo patches without copying the whole image on every stroke.
 */
export class PaintDoc {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  private backup: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private undoStack: Entry[] = [];
  private redoStack: Entry[] = [];
  /** Called after any pixel or size change. */
  onChange: (sizeChanged: boolean) => void = () => {};

  constructor(w: number, h: number, background: RGB) {
    this.canvas = createCanvas(w, h);
    this.ctx = ctx2d(this.canvas, true);
    this.ctx.fillStyle = rgbToCss(background);
    this.ctx.fillRect(0, 0, w, h);
    this.backup = cloneCanvas(this.canvas);
    this.bctx = ctx2d(this.backup, true);
  }

  get width(): number {
    return this.canvas.width;
  }

  get height(): number {
    return this.canvas.height;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Commits the changes made to `canvas` within `rect` as one undo step. */
  commit(rect: Rect | null): void {
    const r = rect ? clip(intRect(rect), this.width, this.height) : null;
    if (!r) return;
    const before = this.bctx.getImageData(r.x, r.y, r.w, r.h);
    const after = this.ctx.getImageData(r.x, r.y, r.w, r.h);
    this.bctx.putImageData(after, r.x, r.y);
    this.push({ kind: 'patch', x: r.x, y: r.y, before, after });
    this.onChange(false);
  }

  /** Replaces the whole image (possibly resizing it) as one undo step. */
  replace(next: HTMLCanvasElement): void {
    const before = cloneCanvas(this.backup);
    const after = cloneCanvas(next);
    const sizeChanged = next.width !== this.width || next.height !== this.height;
    this.load(after);
    this.push({ kind: 'full', before, after });
    this.onChange(sizeChanged);
  }

  /** Loads a new image without history (New / Open). */
  reset(next: HTMLCanvasElement): void {
    this.load(next);
    this.undoStack = [];
    this.redoStack = [];
    this.onChange(true);
  }

  undo(): boolean {
    const e = this.undoStack.pop();
    if (!e) return false;
    const sizeChanged = this.apply(e, 'before');
    this.redoStack.push(e);
    this.onChange(sizeChanged);
    return true;
  }

  redo(): boolean {
    const e = this.redoStack.pop();
    if (!e) return false;
    const sizeChanged = this.apply(e, 'after');
    this.undoStack.push(e);
    this.onChange(sizeChanged);
    return true;
  }

  /** Copy of the committed content (without in-progress changes). */
  snapshot(): HTMLCanvasElement {
    return cloneCanvas(this.backup);
  }

  /** Reverts uncommitted changes to `canvas` (e.g. when canceling a stroke). */
  revert(rect?: Rect): void {
    const r = rect ? clip(intRect(rect), this.width, this.height) : { x: 0, y: 0, w: this.width, h: this.height };
    if (!r) return;
    this.ctx.clearRect(r.x, r.y, r.w, r.h);
    this.ctx.drawImage(this.backup, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
  }

  private push(e: Entry): void {
    this.undoStack.push(e);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  private apply(e: Entry, side: 'before' | 'after'): boolean {
    if (e.kind === 'patch') {
      const data = e[side];
      this.ctx.putImageData(data, e.x, e.y);
      this.bctx.putImageData(data, e.x, e.y);
      return false;
    }
    const src = e[side];
    const sizeChanged = src.width !== this.width || src.height !== this.height;
    this.load(cloneCanvas(src));
    return sizeChanged;
  }

  private load(src: HTMLCanvasElement): void {
    this.canvas.width = src.width;
    this.canvas.height = src.height;
    this.ctx.clearRect(0, 0, src.width, src.height);
    this.ctx.drawImage(src, 0, 0);
    this.backup.width = src.width;
    this.backup.height = src.height;
    this.bctx.clearRect(0, 0, src.width, src.height);
    this.bctx.drawImage(src, 0, 0);
  }
}
