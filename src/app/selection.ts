import type { Point, RGB, Rect } from '../paint/types';
import type { OverlayContext } from '../tools/tool';
import type { App } from './app';
import { rgbToCss } from './color';
import { createCanvas, ctx2d } from './doc';
import { clip, intRect, rectOfPoints, union } from './geometry';

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/**
 * Paint selection. While it is not moved, it is just a frame over the image. Moving, scaling
 * or transforming it "lifts" it (floating): its pixels go to `floating` and the hole is filled with
 * Color 2. When the selection is removed, the floating part is committed to the image as one undo step.
 */
export class Selection {
  /** Current position and size (integers, image coordinates). */
  rect: Rect | null = null;
  /** Mask (opaque white = selected) the size of `source`; null = the whole rectangle. */
  private mask: HTMLCanvasElement | null = null;
  /** Lifted pixels (original size, before scaling). */
  private floating: HTMLCanvasElement | null = null;
  /** Image area affected since it was lifted (for the undo patch). */
  private dirty: Rect | null = null;
  private transparentCache: { key: string; canvas: HTMLCanvasElement } | null = null;

  constructor(private readonly app: App) {}

  get active(): boolean {
    return this.rect !== null;
  }

  get isFloating(): boolean {
    return this.floating !== null;
  }

  // ------------------------------------------------------------ creation

  setRect(r: Rect): void {
    this.drop();
    const c = clip(intRect(r), this.app.doc.width, this.app.doc.height);
    if (!c || c.w < 1 || c.h < 1) return this.changed();
    this.rect = c;
    this.changed();
  }

  setFreeform(points: Point[]): void {
    this.drop();
    if (points.length < 3) return this.changed();
    const bounds = clip(intRect(rectOfPoints(points)), this.app.doc.width, this.app.doc.height);
    if (!bounds || bounds.w < 1 || bounds.h < 1) return this.changed();
    const mask = createCanvas(bounds.w, bounds.h);
    const mctx = ctx2d(mask, true);
    mctx.fillStyle = '#fff';
    mctx.beginPath();
    points.forEach((p, i) =>
      i ? mctx.lineTo(p.x - bounds.x, p.y - bounds.y) : mctx.moveTo(p.x - bounds.x, p.y - bounds.y),
    );
    mctx.closePath();
    mctx.fill();
    binarize(mctx, bounds.w, bounds.h);
    this.rect = bounds;
    this.mask = mask;
    this.changed();
  }

  selectAll(): void {
    this.setRect({ x: 0, y: 0, w: this.app.doc.width, h: this.app.doc.height });
  }

  invert(): void {
    const { width: w, height: h } = this.app.doc;
    if (!this.rect) return this.selectAll();
    this.commit();
    const prevRect = this.rect;
    const prevMask = this.mask;
    const mask = createCanvas(w, h);
    const mctx = ctx2d(mask, true);
    mctx.fillStyle = '#fff';
    mctx.fillRect(0, 0, w, h);
    mctx.globalCompositeOperation = 'destination-out';
    if (prevRect && prevMask) mctx.drawImage(prevMask, prevRect.x, prevRect.y);
    else if (prevRect) mctx.fillRect(prevRect.x, prevRect.y, prevRect.w, prevRect.h);
    this.drop();
    this.rect = { x: 0, y: 0, w, h };
    this.mask = mask;
    this.changed();
  }

  /** Creates a floating selection from an external image (Paste / Paste from). */
  pasteImage(img: HTMLCanvasElement, at: Point): void {
    this.commit();
    this.floating = img;
    this.mask = null;
    this.rect = { x: Math.round(at.x), y: Math.round(at.y), w: img.width, h: img.height };
    this.dirty = null;
    this.renderFloating();
    this.changed();
  }

  // ------------------------------------------------------------ editing

  /** Lifts the selected pixels and fills the hole with Color 2 (not committed yet). */
  lift(): void {
    if (!this.rect || this.floating) return;
    const r = this.rect;
    const { doc } = this.app;
    const img = createCanvas(r.w, r.h);
    const ictx = ctx2d(img, true);
    ictx.drawImage(doc.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    if (this.mask) {
      ictx.globalCompositeOperation = 'destination-in';
      ictx.drawImage(this.mask, 0, 0);
    }
    // Fill the hole with Color 2
    const hole = createCanvas(r.w, r.h);
    const hctx = ctx2d(hole);
    hctx.fillStyle = rgbToCss(this.app.store.state.color2);
    hctx.fillRect(0, 0, r.w, r.h);
    if (this.mask) {
      hctx.globalCompositeOperation = 'destination-in';
      hctx.drawImage(this.mask, 0, 0);
    }
    doc.ctx.drawImage(hole, r.x, r.y);
    this.floating = img;
    this.dirty = { ...r };
    this.renderFloating();
  }

  moveTo(x: number, y: number): void {
    if (!this.rect) return;
    this.lift();
    this.rect = { ...this.rect, x: Math.round(x), y: Math.round(y) };
    this.renderFloating();
    this.changed();
  }

  /** Leaves a copy of the floating part on the image (Shift + drag / Ctrl + drag). */
  stamp(): void {
    if (!this.floating || !this.rect) return;
    this.drawFloatingInto(this.app.doc.ctx);
    this.dirty = union(this.dirty, this.rect);
  }

  resizeTo(r: Rect): void {
    if (!this.rect) return;
    this.lift();
    this.rect = {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.max(1, Math.round(r.w)),
      h: Math.max(1, Math.round(r.h)),
    };
    this.renderFloating();
    this.changed();
  }

  /** Replaces the floating image with the result of a transform (rotate, flip, invert…). */
  transform(fn: (src: HTMLCanvasElement) => HTMLCanvasElement, keepCenter = true): void {
    if (!this.rect) return;
    this.lift();
    if (!this.floating) return;
    const current = this.scaledFloating();
    const next = fn(current);
    const r = this.rect;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    this.floating = next;
    this.mask = null;
    this.rect = keepCenter
      ? { x: Math.round(cx - next.width / 2), y: Math.round(cy - next.height / 2), w: next.width, h: next.height }
      : { x: r.x, y: r.y, w: next.width, h: next.height };
    this.renderFloating();
    this.changed();
  }

  /** Commits the floating part to the image (one undo step) and removes the selection. */
  commit(): void {
    if (this.floating && this.rect) {
      this.drawFloatingInto(this.app.doc.ctx);
      const area = union(this.dirty, this.rect);
      this.app.doc.commit(area);
      this.app.markDirty();
    }
    this.drop();
    this.changed();
  }

  /** Deletes the selected content (fills it with Color 2) and removes the selection. */
  deleteContent(): void {
    if (!this.rect) return;
    if (!this.floating) this.lift();
    const area = this.dirty;
    this.drop();
    if (area) {
      this.app.doc.commit(area);
      this.app.markDirty();
    }
    this.changed();
  }

  /** Forgets the selection without touching the image (after cropping, the image has already been replaced). */
  forget(): void {
    this.drop();
    this.changed();
  }

  /** Removes the selection without committing anything (discards the floating part). */
  cancel(): void {
    if (this.floating && this.dirty) this.app.doc.revert(this.dirty);
    this.drop();
    this.changed();
  }

  /** Image with the selected content (transparent outside the mask). */
  getImage(): HTMLCanvasElement | null {
    if (!this.rect) return null;
    if (this.floating) return this.scaledFloating(true);
    const r = this.rect;
    const img = createCanvas(r.w, r.h);
    const ictx = ctx2d(img, true);
    ictx.drawImage(this.app.doc.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    if (this.mask) {
      ictx.globalCompositeOperation = 'destination-in';
      ictx.drawImage(this.mask, 0, 0);
    }
    return img;
  }

  // ------------------------------------------------------------ drawing

  /** Color 2 or "Transparent selection" changed: the floating part must be repainted. */
  refresh(): void {
    if (this.floating) this.renderFloating();
  }

  hitHandle(p: Point, zoom: number): Handle | 'inside' | null {
    const r = this.rect;
    if (!r) return null;
    const tol = 5 / zoom;
    for (const h of HANDLES) {
      const c = handlePoint(r, h);
      if (Math.abs(p.x - c.x) <= tol && Math.abs(p.y - c.y) <= tol) return h;
    }
    if (p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h) return 'inside';
    return null;
  }

  drawOverlay(o: OverlayContext): void {
    const r = this.rect;
    if (!r) return;
    const { ctx } = o;
    const a = o.toView(r.x, r.y);
    const b = o.toView(r.x + r.w, r.y + r.h);
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(Math.round(a.x) - 0.5, Math.round(a.y) - 0.5, Math.round(b.x - a.x) + 1, Math.round(b.y - a.y) + 1);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#0a6ad6';
    ctx.strokeRect(Math.round(a.x) - 0.5, Math.round(a.y) - 0.5, Math.round(b.x - a.x) + 1, Math.round(b.y - a.y) + 1);
    ctx.restore();
    drawHandles(o, r);
  }

  private scaledFloating(applyTransparency = false): HTMLCanvasElement {
    const f = applyTransparency ? this.processedFloating() : this.floating;
    const r = this.rect;
    if (!f || !r) throw new Error('No floating selection');
    if (f.width === r.w && f.height === r.h) return f;
    const c = createCanvas(r.w, r.h);
    const cctx = ctx2d(c, true);
    cctx.imageSmoothingQuality = 'high';
    cctx.drawImage(f, 0, 0, r.w, r.h);
    return c;
  }

  /** The floating part with Color 2 made transparent if "Transparent selection" is on. */
  private processedFloating(): HTMLCanvasElement | null {
    const f = this.floating;
    if (!f) return null;
    const st = this.app.store.state;
    if (!st.transparentSelection) return f;
    const key = `${st.color2.join(',')}|${f.width}x${f.height}`;
    if (this.transparentCache?.key === key) return this.transparentCache.canvas;
    const c = createCanvas(f.width, f.height);
    const cctx = ctx2d(c, true);
    cctx.drawImage(f, 0, 0);
    makeColorTransparent(cctx, f.width, f.height, st.color2);
    this.transparentCache = { key, canvas: c };
    return c;
  }

  private drawFloatingInto(ctx: CanvasRenderingContext2D): void {
    const f = this.processedFloating();
    const r = this.rect;
    if (!f || !r) return;
    ctx.save();
    ctx.imageSmoothingEnabled = f.width !== r.w || f.height !== r.h;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(f, r.x, r.y, r.w, r.h);
    ctx.restore();
  }

  private renderFloating(): void {
    const app = this.app;
    app.clearPreview();
    if (!this.floating || !this.rect) return;
    this.drawFloatingInto(app.previewLayer.getContext('2d') as CanvasRenderingContext2D);
    app.previewActive = true;
    app.invalidate();
  }

  private drop(): void {
    if (this.floating) this.app.clearPreview();
    this.rect = null;
    this.mask = null;
    this.floating = null;
    this.dirty = null;
    this.transparentCache = null;
  }

  private changed(): void {
    const r = this.rect;
    this.app.store.set({ hasSelection: r !== null, selectionSize: r ? { w: r.w, h: r.h } : null });
    this.app.invalidate();
  }
}

export function handlePoint(r: Rect, h: Handle): Point {
  const x = h.includes('w') ? r.x : h.includes('e') ? r.x + r.w : r.x + r.w / 2;
  const y = h.includes('n') ? r.y : h.includes('s') ? r.y + r.h : r.y + r.h / 2;
  return { x, y };
}

/** Rectangle that results from dragging a handle to p (Shift keeps the aspect ratio). */
export function resizeByHandle(r: Rect, h: Handle, p: Point, keepAspect: boolean): Rect {
  let x1 = r.x;
  let y1 = r.y;
  let x2 = r.x + r.w;
  let y2 = r.y + r.h;
  if (h.includes('w')) x1 = Math.min(p.x, x2 - 1);
  if (h.includes('e')) x2 = Math.max(p.x, x1 + 1);
  if (h.includes('n')) y1 = Math.min(p.y, y2 - 1);
  if (h.includes('s')) y2 = Math.max(p.y, y1 + 1);
  if (keepAspect && h.length === 2 && r.w > 0 && r.h > 0) {
    const ratio = r.w / r.h;
    const w = x2 - x1;
    const hh = y2 - y1;
    if (w / hh > ratio) {
      const nw = hh * ratio;
      if (h.includes('w')) x1 = x2 - nw;
      else x2 = x1 + nw;
    } else {
      const nh = w / ratio;
      if (h.includes('n')) y1 = y2 - nh;
      else y2 = y1 + nh;
    }
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function drawHandles(o: OverlayContext, r: Rect): void {
  const { ctx } = o;
  ctx.save();
  for (const h of HANDLES) {
    const p = handlePoint(r, h);
    const v = o.toView(p.x, p.y);
    const x = Math.round(v.x) - 3;
    const y = Math.round(v.y) - 3;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, 6, 6);
    ctx.strokeStyle = '#555c66';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, 5, 5);
  }
  ctx.restore();
}

export function cursorForHandle(h: Handle): string {
  return h === 'n' || h === 's'
    ? 'ns-resize'
    : h === 'e' || h === 'w'
      ? 'ew-resize'
      : h === 'nw' || h === 'se'
        ? 'nwse-resize'
        : 'nesw-resize';
}

function binarize(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const on = d[i + 3] >= 128;
    d[i] = d[i + 1] = d[i + 2] = 255;
    d[i + 3] = on ? 255 : 0;
  }
  ctx.putImageData(img, 0, 0);
}

function makeColorTransparent(ctx: CanvasRenderingContext2D, w: number, h: number, [r, g, b]: RGB): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] === r && d[i + 1] === g && d[i + 2] === b) d[i + 3] = 0;
  }
  ctx.putImageData(img, 0, 0);
}
