import { t } from '../i18n';
import type { Point, Rect } from '../paint/types';
import type { OverlayContext, PointerInfo } from '../tools/tool';
import type { App } from './app';
import { clamp } from './geometry';

/** Gap between the edge of the work area and the canvas (as in Paint). */
export const MARGIN = 5;
const HANDLE = 5;
const HANDLE_HIT = 6;

/** Paint zoom levels: Zoom out 100→50→25→12.5 %; Zoom in 100→200→…→800 %. */
export const ZOOM_LEVELS = [0.125, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 7, 8] as const;

export function nextZoom(z: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_LEVELS.find((l) => l > z + 1e-9) ?? ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
  return ZOOM_LEVELS.toReversed().find((l) => l < z - 1e-9) ?? ZOOM_LEVELS[0];
}

type ResizeHandle = 'e' | 's' | 'se';

/**
 * Work area: a fixed `<canvas>` that paints the visible portion of the image and, on top,
 * a container with native scrollbars that only provides the content size.
 */
export class Viewport {
  readonly root: HTMLElement;
  readonly scroller: HTMLElement;
  /** Layer in content coordinates (scrolls with the image): text editor, etc. */
  readonly content: HTMLElement;
  private readonly view: HTMLCanvasElement;
  private readonly vctx: CanvasRenderingContext2D;
  private readonly rulerTop: HTMLCanvasElement;
  private readonly rulerLeft: HTMLCanvasElement;
  private readonly thumb: HTMLElement;
  private readonly thumbCanvas: HTMLCanvasElement;
  private readonly thumbLabel: HTMLElement;
  private readonly thumbClose: HTMLButtonElement;
  private frame = 0;
  private dpr = 1;
  private viewW = 0;
  private viewH = 0;
  private pressed = false;
  private holdTimer = 0;
  private resizing: { handle: ResizeHandle; w: number; h: number } | null = null;
  private lastPointer: PointerInfo | null = null;
  private readonly listeners: (() => void)[] = [];

  constructor(private readonly app: App) {
    this.root = el('div', 'ws-wrap');
    const corner = el('div', 'ruler-corner');
    this.rulerTop = el('canvas', 'ruler ruler-top');
    this.rulerLeft = el('canvas', 'ruler ruler-left');
    const workspace = el('div', 'workspace');
    this.view = el('canvas', 'ws-view');
    this.scroller = el('div', 'ws-scroller');
    this.content = el('div', 'ws-content');
    this.scroller.append(this.content);
    this.thumb = el('div', 'thumbnail');
    this.thumb.hidden = true;
    const thumbTitle = el('div', 'thumbnail-title');
    this.thumbLabel = el('span', 'thumbnail-label');
    const thumbClose = el('button', 'thumbnail-close');
    thumbClose.type = 'button';
    thumbClose.textContent = '✕';
    thumbClose.addEventListener('click', () => this.app.store.set({ showThumbnail: false }));
    this.thumbClose = thumbClose;
    thumbTitle.append(this.thumbLabel, thumbClose);
    this.relabel();
    this.thumbCanvas = el('canvas', 'thumbnail-canvas');
    this.thumb.append(thumbTitle, this.thumbCanvas);
    workspace.append(this.view, this.scroller, this.thumb);
    this.root.append(corner, this.rulerTop, this.rulerLeft, workspace);
    const ctx = this.view.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not available');
    this.vctx = ctx;

    this.scroller.addEventListener('scroll', () => this.invalidate(), { passive: true });
    new ResizeObserver(() => this.layout()).observe(this.scroller);
    this.bindPointer();
  }

  get zoom(): number {
    return this.app.store.state.zoom;
  }

  /** Thumbnail window labels in the active language. */
  relabel(): void {
    this.thumbLabel.textContent = t.workspace.thumbnail;
    this.thumbClose.title = t.dialog.close;
  }

  /** Notifies when zoom, scroll position or size change (to reposition the text editor). */
  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  invalidate(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  /** Recomputes sizes after the image, zoom or window changes. */
  layout(): void {
    const z = this.zoom;
    const { width: w, height: h } = this.app.doc;
    this.content.style.width = `${Math.ceil(MARGIN * 2 + w * z + HANDLE * 2)}px`;
    this.content.style.height = `${Math.ceil(MARGIN * 2 + h * z + HANDLE * 2)}px`;
    this.dpr = window.devicePixelRatio || 1;
    this.viewW = this.scroller.clientWidth;
    this.viewH = this.scroller.clientHeight;
    this.view.style.width = `${this.viewW}px`;
    this.view.style.height = `${this.viewH}px`;
    this.view.width = Math.max(1, Math.round(this.viewW * this.dpr));
    this.view.height = Math.max(1, Math.round(this.viewH * this.dpr));
    const st = this.app.store.state;
    this.root.classList.toggle('has-rulers', st.showRulers);
    if (st.showRulers) {
      sizeCanvas(this.rulerTop, this.viewW, 17, this.dpr);
      sizeCanvas(this.rulerLeft, 17, this.viewH, this.dpr);
    }
    this.thumb.hidden = !st.showThumbnail;
    if (st.showThumbnail) sizeCanvas(this.thumbCanvas, 120, 100, this.dpr);
    this.render();
  }

  /** Changes the zoom keeping the `anchor` point (client coordinates) or the view center fixed. */
  setZoom(next: number, anchor?: { clientX: number; clientY: number }): void {
    const z0 = this.zoom;
    const z1 = clamp(next, ZOOM_LEVELS[0], ZOOM_LEVELS[ZOOM_LEVELS.length - 1]);
    if (z1 === z0) return;
    const r = this.scroller.getBoundingClientRect();
    const ax = anchor ? anchor.clientX - r.left : this.viewW / 2;
    const ay = anchor ? anchor.clientY - r.top : this.viewH / 2;
    const docX = (this.scroller.scrollLeft + ax - MARGIN) / z0;
    const docY = (this.scroller.scrollTop + ay - MARGIN) / z0;
    this.app.store.set({ zoom: z1 });
    this.app.store.flush();
    this.layout();
    this.scroller.scrollLeft = Math.max(0, docX * z1 + MARGIN - ax);
    this.scroller.scrollTop = Math.max(0, docY * z1 + MARGIN - ay);
    this.render();
  }

  /** Centers the view on an image point. */
  centerOn(p: Point): void {
    const z = this.zoom;
    this.scroller.scrollLeft = Math.max(0, p.x * z + MARGIN - this.viewW / 2);
    this.scroller.scrollTop = Math.max(0, p.y * z + MARGIN - this.viewH / 2);
  }

  toView(x: number, y: number): { x: number; y: number } {
    const z = this.zoom;
    return { x: MARGIN + x * z - this.scroller.scrollLeft, y: MARGIN + y * z - this.scroller.scrollTop };
  }

  /** Position of an image point within `content` (for DOM elements that scroll with the image). */
  toContent(x: number, y: number): { x: number; y: number } {
    const z = this.zoom;
    return { x: MARGIN + x * z, y: MARGIN + y * z };
  }

  fromClient(clientX: number, clientY: number): Point {
    const r = this.scroller.getBoundingClientRect();
    const z = this.zoom;
    return {
      x: (clientX - r.left + this.scroller.scrollLeft - MARGIN) / z,
      y: (clientY - r.top + this.scroller.scrollTop - MARGIN) / z,
    };
  }

  /** Visible part of the image (image coordinates). */
  visibleRect(): Rect {
    const z = this.zoom;
    const x = (this.scroller.scrollLeft - MARGIN) / z;
    const y = (this.scroller.scrollTop - MARGIN) / z;
    return { x, y, w: this.viewW / z, h: this.viewH / z };
  }

  /** View size in CSS pixels. */
  get size(): { w: number; h: number } {
    return { w: this.viewW, h: this.viewH };
  }

  setCursor(css: string): void {
    if (this.scroller.style.cursor !== css) this.scroller.style.cursor = css;
  }

  refreshCursor(): void {
    const p = this.lastPointer;
    if (this.resizing) return;
    const handle = p ? this.hitResizeHandle(p.clientX, p.clientY) : null;
    if (handle) this.setCursor(handle === 'e' ? 'ew-resize' : handle === 's' ? 'ns-resize' : 'nwse-resize');
    else this.setCursor(this.app.tool.cursor(p && p.inside ? p : p));
  }

  // ---------------------------------------------------------------- render

  render(): void {
    const ctx = this.vctx;
    const z = this.zoom;
    const { doc } = this.app;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.viewW, this.viewH);

    const ox = MARGIN - this.scroller.scrollLeft;
    const oy = MARGIN - this.scroller.scrollTop;
    const dw = doc.width * z;
    const dh = doc.height * z;

    // Canvas shadow (Paint draws a bluish blur on the right and bottom).
    ctx.fillStyle = 'rgb(182 194 211 / 70%)';
    ctx.fillRect(ox + 3, oy + 3, dw + 2, dh + 2);
    ctx.fillStyle = 'rgb(182 194 211 / 45%)';
    ctx.fillRect(ox + 2, oy + 2, dw + 4, dh + 4);

    // Image, stroke-in-progress layer and live-objects layer.
    const vis = this.visibleRect();
    const sx = Math.max(0, Math.floor(vis.x));
    const sy = Math.max(0, Math.floor(vis.y));
    const ex = Math.min(doc.width, Math.ceil(vis.x + vis.w) + 1);
    const ey = Math.min(doc.height, Math.ceil(vis.y + vis.h) + 1);
    if (ex > sx && ey > sy) {
      ctx.imageSmoothingEnabled = z < 1;
      ctx.imageSmoothingQuality = 'high';
      const draw = (src: CanvasImageSource): void =>
        ctx.drawImage(src, sx, sy, ex - sx, ey - sy, ox + sx * z, oy + sy * z, (ex - sx) * z, (ey - sy) * z);
      ctx.save();
      ctx.beginPath();
      ctx.rect(ox, oy, dw, dh);
      ctx.clip();
      draw(doc.canvas);
      if (this.app.strokeActive) {
        ctx.globalAlpha = this.app.strokeAlpha;
        draw(this.app.strokeLayer);
        ctx.globalAlpha = 1;
      }
      if (this.app.previewActive) draw(this.app.previewLayer);
      ctx.restore();
    }

    if (this.app.store.state.showGrid) this.drawGrid(ctx, ox, oy, dw, dh, z);

    const overlay: OverlayContext = { ctx, zoom: z, toView: (x, y) => this.toView(x, y) };
    ctx.imageSmoothingEnabled = true;
    this.app.selection.drawOverlay(overlay);
    this.app.tool.overlay?.(overlay);
    this.drawResizeHandles(ctx, ox, oy, dw, dh);

    if (this.app.store.state.showRulers) this.drawRulers();
    if (this.app.store.state.showThumbnail) this.drawThumbnail();
    for (const fn of this.listeners) fn();
  }

  private drawGrid(ctx: CanvasRenderingContext2D, ox: number, oy: number, dw: number, dh: number, z: number): void {
    const step = z >= 4 ? 1 : z >= 2 ? 5 : z >= 1 ? 10 : z >= 0.5 ? 20 : z >= 0.25 ? 50 : 100;
    const vx0 = Math.max(ox, 0);
    const vy0 = Math.max(oy, 0);
    const vx1 = Math.min(ox + dw, this.viewW);
    const vy1 = Math.min(oy + dh, this.viewH);
    if (vx1 <= vx0 || vy1 <= vy0) return;
    ctx.save();
    ctx.lineWidth = 1;
    if (step === 1) {
      ctx.strokeStyle = 'rgb(128 128 128 / 45%)';
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = 'rgb(64 64 64 / 70%)';
      ctx.setLineDash([1, 1]);
    }
    ctx.beginPath();
    const s = step * z;
    const firstX = Math.ceil((vx0 - ox) / s) * s + ox;
    for (let x = firstX; x <= vx1; x += s) {
      const xx = Math.round(x) + 0.5;
      ctx.moveTo(xx, vy0);
      ctx.lineTo(xx, vy1);
    }
    const firstY = Math.ceil((vy0 - oy) / s) * s + oy;
    for (let y = firstY; y <= vy1; y += s) {
      const yy = Math.round(y) + 0.5;
      ctx.moveTo(vx0, yy);
      ctx.lineTo(vx1, yy);
    }
    ctx.stroke();
    ctx.restore();
  }

  private handleRects(ox: number, oy: number, dw: number, dh: number): Record<ResizeHandle, Rect> {
    const half = Math.floor(HANDLE / 2);
    return {
      e: { x: Math.round(ox + dw), y: Math.round(oy + dh / 2 - half), w: HANDLE, h: HANDLE },
      s: { x: Math.round(ox + dw / 2 - half), y: Math.round(oy + dh), w: HANDLE, h: HANDLE },
      se: { x: Math.round(ox + dw), y: Math.round(oy + dh), w: HANDLE, h: HANDLE },
    };
  }

  private drawResizeHandles(ctx: CanvasRenderingContext2D, ox: number, oy: number, dw: number, dh: number): void {
    if (this.app.store.state.printPreview) return;
    if (this.resizing) {
      const z = this.zoom;
      ctx.save();
      ctx.strokeStyle = '#000';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.strokeRect(
        Math.round(ox) + 0.5,
        Math.round(oy) + 0.5,
        Math.round(this.resizing.w * z),
        Math.round(this.resizing.h * z),
      );
      ctx.restore();
    }
    const rects = this.handleRects(ox, oy, dw, dh);
    ctx.save();
    for (const r of Object.values(rects)) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#555c66';
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    }
    ctx.restore();
  }

  private hitResizeHandle(clientX: number, clientY: number): ResizeHandle | null {
    if (this.app.store.state.printPreview || this.app.store.state.textEditing) return null;
    const r = this.scroller.getBoundingClientRect();
    const vx = clientX - r.left;
    const vy = clientY - r.top;
    const z = this.zoom;
    const ox = MARGIN - this.scroller.scrollLeft;
    const oy = MARGIN - this.scroller.scrollTop;
    const rects = this.handleRects(ox, oy, this.app.doc.width * z, this.app.doc.height * z);
    for (const key of ['se', 'e', 's'] as const) {
      const h = rects[key];
      const cx = h.x + h.w / 2;
      const cy = h.y + h.h / 2;
      if (Math.abs(vx - cx) <= HANDLE_HIT && Math.abs(vy - cy) <= HANDLE_HIT) return key;
    }
    return null;
  }

  private drawRulers(): void {
    const z = this.zoom;
    const dpr = this.dpr;
    const stepCandidates = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    const labelStep = stepCandidates.find((s) => s * z >= 60) ?? 5000;
    const minor = labelStep / 10 >= 1 ? labelStep / 10 : labelStep / 2;
    const cursor = this.app.store.state.cursor;
    const draw = (canvas: HTMLCanvasElement, horizontal: boolean): void => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const len = horizontal ? this.viewW : this.viewH;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, horizontal ? len : 17, horizontal ? 17 : len);
      ctx.fillStyle = '#f5f6f7';
      ctx.strokeStyle = '#8d8d8d';
      ctx.font = '9px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#4a4a4a';
      const offset = MARGIN - (horizontal ? this.scroller.scrollLeft : this.scroller.scrollTop);
      const startDoc = Math.floor(-offset / z / minor) * minor;
      const endDoc = (len - offset) / z;
      ctx.beginPath();
      for (let d = Math.max(startDoc, -minor * 2); d <= endDoc; d += minor) {
        const pos = Math.round(offset + d * z) + 0.5;
        const isLabel = Math.abs(d / labelStep - Math.round(d / labelStep)) < 1e-6;
        const isHalf = !isLabel && Math.abs((d * 2) / labelStep - Math.round((d * 2) / labelStep)) < 1e-6;
        const tick = isLabel ? 17 : isHalf ? 6 : 3;
        if (horizontal) {
          ctx.moveTo(pos, 17);
          ctx.lineTo(pos, 17 - tick);
          if (isLabel && d >= 0) ctx.fillText(String(Math.round(d)), pos + 2, 9);
        } else {
          ctx.moveTo(17, pos);
          ctx.lineTo(17 - tick, pos);
          if (isLabel && d >= 0) {
            ctx.save();
            ctx.translate(9, pos + 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(String(Math.round(d)), -ctx.measureText(String(Math.round(d))).width, 0);
            ctx.restore();
          }
        }
      }
      ctx.stroke();
      if (cursor) {
        const pos = Math.round(offset + (horizontal ? cursor.x : cursor.y) * z) + 0.5;
        ctx.strokeStyle = '#e81123';
        ctx.beginPath();
        if (horizontal) {
          ctx.moveTo(pos, 0);
          ctx.lineTo(pos, 17);
        } else {
          ctx.moveTo(0, pos);
          ctx.lineTo(17, pos);
        }
        ctx.stroke();
      }
    };
    draw(this.rulerTop, true);
    draw(this.rulerLeft, false);
  }

  private drawThumbnail(): void {
    const ctx = this.thumbCanvas.getContext('2d');
    if (!ctx) return;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#c5cfdf';
    ctx.fillRect(0, 0, 120, 100);
    // The thumbnail shows the visible area at 100 %.
    const vis = this.visibleRect();
    const sx = Math.max(0, Math.floor(vis.x + vis.w / 2 - 60));
    const sy = Math.max(0, Math.floor(vis.y + vis.h / 2 - 50));
    const sw = Math.min(120, this.app.doc.width - sx);
    const sh = Math.min(100, this.app.doc.height - sy);
    if (sw > 0 && sh > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.app.doc.canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    }
  }

  // ---------------------------------------------------------------- input

  private info(e: PointerEvent | MouseEvent, button?: number): PointerInfo {
    const p = this.fromClient(e.clientX, e.clientY);
    const { width, height } = this.app.doc;
    const b = button ?? e.button;
    return {
      x: p.x,
      y: p.y,
      px: Math.floor(p.x),
      py: Math.floor(p.y),
      button: b === 2 ? 2 : 0,
      shift: e.shiftKey,
      ctrl: e.ctrlKey || e.metaKey,
      alt: e.altKey,
      inside: p.x >= 0 && p.y >= 0 && p.x < width && p.y < height,
      clientX: e.clientX,
      clientY: e.clientY,
    };
  }

  private bindPointer(): void {
    const s = this.scroller;
    let downButton = 0;

    s.addEventListener('contextmenu', (e) => e.preventDefault());

    s.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      if (e.target !== s && e.target !== this.content) return; // click inside the text editor
      if (this.pressed) return;
      if (e.clientX - s.getBoundingClientRect().left >= s.clientWidth) return; // scrollbar
      if (e.clientY - s.getBoundingClientRect().top >= s.clientHeight) return;
      this.app.closePopups();
      if (this.app.store.state.printPreview) return;
      e.preventDefault();
      const handle = e.button === 0 ? this.hitResizeHandle(e.clientX, e.clientY) : null;
      s.setPointerCapture(e.pointerId);
      this.pressed = true;
      downButton = e.button;
      if (handle) {
        this.app.commitLive();
        this.resizing = { handle, w: this.app.doc.width, h: this.app.doc.height };
        this.app.store.set({ selectionSize: { w: this.resizing.w, h: this.resizing.h } });
        this.invalidate();
        return;
      }
      const p = this.info(e);
      this.lastPointer = p;
      this.app.tool.down?.(p);
      if (this.app.tool.hold) {
        this.holdTimer = window.setInterval(() => this.app.tool.hold?.(), 30);
      }
      this.updateStatus(p);
    });

    s.addEventListener('pointermove', (e) => {
      const p = this.info(e, this.pressed ? downButton : 0);
      this.lastPointer = p;
      if (this.resizing) {
        const handle = this.resizing.handle;
        const w = handle === 's' ? this.app.doc.width : Math.max(1, Math.round(p.x));
        const h = handle === 'e' ? this.app.doc.height : Math.max(1, Math.round(p.y));
        this.resizing = { handle, w, h };
        this.app.store.set({ selectionSize: { w, h } });
        this.invalidate();
        return;
      }
      if (this.pressed) {
        for (const ev of e.getCoalescedEvents?.() ?? [e]) this.app.tool.move?.(this.info(ev, downButton));
      } else {
        this.app.tool.hover?.(p);
        this.refreshCursor();
      }
      this.updateStatus(p);
    });

    const finish = (e: PointerEvent, cancelled: boolean): void => {
      if (!this.pressed) return;
      this.pressed = false;
      window.clearInterval(this.holdTimer);
      if (s.hasPointerCapture(e.pointerId)) s.releasePointerCapture(e.pointerId);
      if (this.resizing) {
        const { w, h } = this.resizing;
        this.resizing = null;
        this.app.store.set({ selectionSize: null });
        if (!cancelled && (w !== this.app.doc.width || h !== this.app.doc.height)) this.app.resizeCanvas(w, h);
        this.invalidate();
        return;
      }
      const p = this.info(e, downButton);
      this.app.tool.up?.(p);
      this.refreshCursor();
    };
    s.addEventListener('pointerup', (e) => finish(e, false));
    s.addEventListener('pointercancel', (e) => finish(e, true));

    s.addEventListener('pointerleave', () => {
      if (this.pressed) return;
      this.lastPointer = null;
      this.app.tool.hover?.(null);
      this.app.store.set({ cursor: null });
      this.invalidate();
    });

    s.addEventListener('dblclick', (e) => {
      if (e.target !== s && e.target !== this.content) return;
      this.app.tool.dblclick?.(this.info(e, 0));
    });

    s.addEventListener(
      'wheel',
      (e) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        this.setZoom(nextZoom(this.zoom, e.deltaY < 0 ? 1 : -1), e);
      },
      { passive: false },
    );
  }

  private updateStatus(p: PointerInfo): void {
    this.app.store.set({ cursor: p.inside ? { x: p.px, y: p.py } : null });
    if (this.app.store.state.showRulers) this.invalidate();
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}

function sizeCanvas(c: HTMLCanvasElement, w: number, h: number, dpr: number): void {
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
}
