import type { App } from '../app/app';
import { rgbToCss } from '../app/color';
import { bresenham, union } from '../app/geometry';
import { floodFill } from '../app/imageops';
import { nextZoom } from '../app/viewport';
import { beginBrushStroke, type BrushStroke } from '../paint/brushes';
import type { RGB, Rect } from '../paint/types';
import { cursorCss } from '../ui/cursors';
import type { OverlayContext, PointerInfo, Tool } from './tool';

/** Pencil: aliased freehand line, 1–4 px. */
export class PencilTool implements Tool {
  readonly id = 'pencil' as const;
  private last: { x: number; y: number } | null = null;
  private area: Rect | null = null;
  private color: RGB = [0, 0, 0];

  constructor(private readonly app: App) {}

  cursor(): string {
    return cursorCss('pencil');
  }

  down(p: PointerInfo): void {
    this.color = this.app.colorFor(p.button);
    this.last = { x: p.px, y: p.py };
    this.area = null;
    this.plot(p.px, p.py, p.px, p.py);
  }

  move(p: PointerInfo): void {
    if (!this.last) return;
    this.plot(this.last.x, this.last.y, p.px, p.py);
    this.last = { x: p.px, y: p.py };
  }

  up(): void {
    if (!this.last) return;
    this.last = null;
    this.app.doc.commit(this.area);
    this.app.markDirty();
  }

  private plot(x0: number, y0: number, x1: number, y1: number): void {
    const size = this.app.store.state.pencilSize;
    const off = Math.floor((size - 1) / 2);
    const ctx = this.app.doc.ctx;
    ctx.fillStyle = rgbToCss(this.color);
    bresenham(x0, y0, x1, y1, (x, y) => ctx.fillRect(x - off, y - off, size, size));
    const seg = {
      x: Math.min(x0, x1) - off,
      y: Math.min(y0, y1) - off,
      w: Math.abs(x1 - x0) + size,
      h: Math.abs(y1 - y0) + size,
    };
    this.area = union(this.area, seg);
    this.app.invalidate();
  }
}

/** Brushes (the 9 types are drawn by the `paint/brushes` engine). */
export class BrushTool implements Tool {
  readonly id = 'brush' as const;
  private stroke: BrushStroke | null = null;
  private area: Rect | null = null;

  constructor(private readonly app: App) {}

  cursor(): string {
    return cursorCss(this.app.store.state.brush === 'airbrush' ? 'airbrush' : 'brushCross');
  }

  down(p: PointerInfo): void {
    const st = this.app.store.state;
    const layer = this.app.beginStroke(1);
    this.stroke = beginBrushStroke(st.brush, layer, p.x, p.y, st.brushSizes[st.brush], this.app.colorFor(p.button));
    this.app.strokeAlpha = this.stroke.layerAlpha;
    const size = st.brushSizes[st.brush];
    this.area = { x: Math.floor(p.x - size), y: Math.floor(p.y - size), w: size * 2 + 2, h: size * 2 + 2 };
    this.app.invalidate();
  }

  move(p: PointerInfo): void {
    if (!this.stroke) return;
    this.area = union(this.area, this.stroke.lineTo(p.x, p.y));
    this.app.invalidate();
  }

  hold(): void {
    if (!this.stroke) return;
    const r = this.stroke.hold();
    if (r) {
      this.area = union(this.area, r);
      this.app.invalidate();
    }
  }

  up(): void {
    if (!this.stroke) return;
    this.stroke = null;
    this.app.endStroke(this.area);
  }
}

/**
 * Eraser: paints with Color 2. With the secondary button it replaces only the Color 1 pixels
 * with Color 2 (verified in the original Paint).
 */
export class EraserTool implements Tool {
  readonly id = 'eraser' as const;
  private last: { x: number; y: number } | null = null;
  private hoverAt: { x: number; y: number } | null = null;
  private area: Rect | null = null;
  private replace = false;

  constructor(private readonly app: App) {}

  cursor(p: PointerInfo | null): string {
    return p ? 'none' : 'default';
  }

  hover(p: PointerInfo | null): void {
    this.hoverAt = p ? { x: p.px, y: p.py } : null;
    this.app.invalidate();
  }

  down(p: PointerInfo): void {
    this.replace = p.button === 2;
    this.last = { x: p.px, y: p.py };
    this.hoverAt = this.last;
    this.area = null;
    this.erase(p.px, p.py, p.px, p.py);
  }

  move(p: PointerInfo): void {
    this.hoverAt = { x: p.px, y: p.py };
    if (!this.last) return this.app.invalidate();
    this.erase(this.last.x, this.last.y, p.px, p.py);
    this.last = { x: p.px, y: p.py };
  }

  up(): void {
    if (!this.last) return;
    this.last = null;
    this.app.doc.commit(this.area);
    this.app.markDirty();
  }

  overlay(o: OverlayContext): void {
    if (!this.hoverAt) return;
    const size = this.app.store.state.eraserSize;
    const off = Math.floor(size / 2);
    const a = o.toView(this.hoverAt.x - off, this.hoverAt.y - off);
    const s = Math.max(2, size * o.zoom);
    const { ctx } = o;
    ctx.save();
    ctx.fillStyle = rgbToCss(this.app.store.state.color2);
    ctx.fillRect(Math.round(a.x), Math.round(a.y), Math.round(s), Math.round(s));
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(s) - 1, Math.round(s) - 1);
    ctx.restore();
  }

  private erase(x0: number, y0: number, x1: number, y1: number): void {
    const { doc, store } = this.app;
    const size = store.state.eraserSize;
    const off = Math.floor(size / 2);
    const seg = {
      x: Math.min(x0, x1) - off,
      y: Math.min(y0, y1) - off,
      w: Math.abs(x1 - x0) + size,
      h: Math.abs(y1 - y0) + size,
    };
    this.area = union(this.area, seg);
    const ctx = doc.ctx;
    const c2 = store.state.color2;
    if (!this.replace) {
      ctx.fillStyle = rgbToCss(c2);
      bresenham(x0, y0, x1, y1, (x, y) => ctx.fillRect(x - off, y - off, size, size));
    } else {
      // Color replace: only pixels equal to Color 1 become Color 2.
      const sx = Math.max(0, seg.x);
      const sy = Math.max(0, seg.y);
      const ex = Math.min(doc.width, seg.x + seg.w);
      const ey = Math.min(doc.height, seg.y + seg.h);
      if (ex <= sx || ey <= sy) return;
      const w = ex - sx;
      const h = ey - sy;
      const mask = new Uint8Array(w * h);
      bresenham(x0, y0, x1, y1, (x, y) => {
        for (let yy = Math.max(sy, y - off); yy < Math.min(ey, y - off + size); yy++)
          for (let xx = Math.max(sx, x - off); xx < Math.min(ex, x - off + size); xx++)
            mask[(yy - sy) * w + (xx - sx)] = 1;
      });
      const img = ctx.getImageData(sx, sy, w, h);
      const d = img.data;
      const [r1, g1, b1] = store.state.color1;
      for (let i = 0; i < mask.length; i++) {
        if (!mask[i]) continue;
        const k = i * 4;
        if (d[k] === r1 && d[k + 1] === g1 && d[k + 2] === b1) {
          d[k] = c2[0];
          d[k + 1] = c2[1];
          d[k + 2] = c2[2];
          d[k + 3] = 255;
        }
      }
      ctx.putImageData(img, sx, sy);
    }
    this.app.invalidate();
  }
}

/** Fill with color: exact flood fill, Color 1 or Color 2 depending on the button. */
export class FillTool implements Tool {
  readonly id = 'fill' as const;
  constructor(private readonly app: App) {}

  cursor(): string {
    return cursorCss('fill');
  }

  down(p: PointerInfo): void {
    const { doc } = this.app;
    const r = floodFill(doc.ctx, doc.width, doc.height, p.px, p.py, this.app.colorFor(p.button));
    if (!r) return;
    doc.commit(r);
    this.app.markDirty();
  }
}

/** Color picker: takes the pixel's color and returns to the previous tool. */
export class PickerTool implements Tool {
  readonly id = 'picker' as const;
  constructor(private readonly app: App) {}

  cursor(): string {
    return cursorCss('picker');
  }

  down(p: PointerInfo): void {
    if (!p.inside) return;
    const d = this.app.doc.ctx.getImageData(p.px, p.py, 1, 1).data;
    const rgb: RGB = [d[0], d[1], d[2]];
    this.app.store.set(p.button === 2 ? { color2: rgb } : { color1: rgb });
  }

  up(p: PointerInfo): void {
    if (!p.inside) return;
    const prev = this.app.store.state.previousTool;
    this.app.setTool(prev === 'picker' ? 'pencil' : prev);
  }
}

/** Magnifier: click to zoom in at that point, right-click to zoom out. */
export class MagnifierTool implements Tool {
  readonly id = 'magnifier' as const;
  private hoverAt: { x: number; y: number } | null = null;
  constructor(private readonly app: App) {}

  cursor(): string {
    return cursorCss('magnifier');
  }

  hover(p: PointerInfo | null): void {
    this.hoverAt = p && p.inside ? { x: p.x, y: p.y } : null;
    this.app.invalidate();
  }

  down(p: PointerInfo): void {
    const view = this.app.view;
    const z = nextZoom(view.zoom, p.button === 2 ? -1 : 1);
    view.setZoom(z);
    view.centerOn({ x: p.x, y: p.y });
    this.hoverAt = null;
  }

  overlay(o: OverlayContext): void {
    if (!this.hoverAt) return;
    const view = this.app.view;
    const z = nextZoom(view.zoom, 1);
    if (z === view.zoom) return;
    const { w, h } = view.size;
    const rw = Math.min(w / z, this.app.doc.width);
    const rh = Math.min(h / z, this.app.doc.height);
    const x = Math.min(Math.max(0, this.hoverAt.x - rw / 2), this.app.doc.width - rw);
    const y = Math.min(Math.max(0, this.hoverAt.y - rh / 2), this.app.doc.height - rh);
    const a = o.toView(x, y);
    const { ctx } = o;
    ctx.save();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(rw * o.zoom), Math.round(rh * o.zoom));
    ctx.restore();
  }
}
