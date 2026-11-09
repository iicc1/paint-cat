import { t } from '../i18n';
import type { Point, Rect } from '../paint/types';
import type { OverlayContext, PointerInfo } from '../tools/tool';
import { closedPopup } from '../ui/menu';
import type { App } from './app';
import { clamp } from './geometry';

/** Gap between the edge of the work area and the canvas (as in Paint). */
export const MARGIN = 5;
const HANDLE = 5;
const HANDLE_HIT = 6;
/** A finger is less precise than the mouse: the canvas resize handles grab from further away. */
const HANDLE_HIT_TOUCH = 14;
/**
 * A finger on the canvas waits this long (ms) before drawing: if a second one lands meanwhile, it was
 * a two-finger gesture (zoom and scroll) and nothing is drawn. Then the held-back movement is replayed.
 */
const TOUCH_HOLD = 90;
/** Pinch-zoom only starts when the fingers spread or close this much (a two-finger scroll keeps the zoom). */
const PINCH_THRESHOLD = 0.06;

/** Paint zoom levels: Zoom out 100→50→25→12.5 %; Zoom in 100→200→…→800 %. */
export const ZOOM_LEVELS = [0.125, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 7, 8] as const;

export function nextZoom(z: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_LEVELS.find((l) => l > z + 1e-9) ?? ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
  return ZOOM_LEVELS.toReversed().find((l) => l < z - 1e-9) ?? ZOOM_LEVELS[0];
}

/** Index of the zoom level closest to `z` (pinch-zoom gives any value in between). */
export function nearestZoomLevel(z: number): number {
  let best = 0;
  for (let i = 1; i < ZOOM_LEVELS.length; i++) {
    if (Math.abs(Math.log(ZOOM_LEVELS[i] / z)) < Math.abs(Math.log(ZOOM_LEVELS[best] / z))) best = i;
  }
  return best;
}

type ResizeHandle = 'e' | 's' | 'se';

interface Pinch {
  /** Distance between the fingers and zoom when the gesture (re)started. */
  dist: number;
  zoom: number;
  /** Image point under the midpoint of the fingers: it stays under them. */
  at: Point;
  zooming: boolean;
}

function coalesced(e: PointerEvent): PointerEvent[] {
  const list = e.getCoalescedEvents?.() ?? [];
  return list.length ? list : [e];
}

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
  private downButton = 0;
  /** Pointer drawing the stroke in progress, its last event and the image history when it began. */
  private stroke: { id: number; type: string; last: PointerEvent; revision: number } | null = null;
  private holdTimer = 0;
  private resizing: { handle: ResizeHandle; w: number; h: number } | null = null;
  private lastPointer: PointerInfo | null = null;
  /** Fingers on the canvas (touch screens): one draws, two zoom and scroll. */
  private readonly touches = new Map<number, { x: number; y: number }>();
  /** The first finger's events, held back while it could still become a two-finger gesture. */
  private held: { events: PointerEvent[]; timer: number } | null = null;
  private pinch: Pinch | null = null;
  private pinchFrame = 0;
  /** After a pinch, the finger left on the screen does nothing until it is lifted. */
  private pinchTail = false;
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
    sizeCanvas(this.view, this.viewW, this.viewH, this.dpr);
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
    const z = clamp(next, ZOOM_LEVELS[0], ZOOM_LEVELS[ZOOM_LEVELS.length - 1]);
    if (z === this.zoom) return;
    const r = this.scroller.getBoundingClientRect();
    const x = anchor ? anchor.clientX : r.left + this.viewW / 2;
    const y = anchor ? anchor.clientY : r.top + this.viewH / 2;
    this.zoomAt(z, this.fromClient(x, y), { x, y });
  }

  /** Sets the zoom and scrolls so that image point `at` ends up under client point `client`. */
  private zoomAt(z: number, at: Point, client: { x: number; y: number }): void {
    if (z !== this.zoom) {
      this.app.store.set({ zoom: z });
      this.app.store.flush();
      this.layout();
    }
    const r = this.scroller.getBoundingClientRect();
    this.scroller.scrollLeft = Math.max(0, at.x * z + MARGIN - (client.x - r.left));
    this.scroller.scrollTop = Math.max(0, at.y * z + MARGIN - (client.y - r.top));
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
    const handle = p ? this.hitResizeHandle(p.clientX, p.clientY, p.touch) : null;
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

  private hitResizeHandle(clientX: number, clientY: number, touch = false): ResizeHandle | null {
    if (this.app.store.state.printPreview || this.app.store.state.textEditing) return null;
    const r = this.scroller.getBoundingClientRect();
    const vx = clientX - r.left;
    const vy = clientY - r.top;
    const z = this.zoom;
    const ox = MARGIN - this.scroller.scrollLeft;
    const oy = MARGIN - this.scroller.scrollTop;
    const rects = this.handleRects(ox, oy, this.app.doc.width * z, this.app.doc.height * z);
    const hit = touch ? HANDLE_HIT_TOUCH : HANDLE_HIT;
    for (const key of ['se', 'e', 's'] as const) {
      const h = rects[key];
      const cx = h.x + h.w / 2;
      const cy = h.y + h.h / 2;
      if (Math.abs(vx - cx) <= hit && Math.abs(vy - cy) <= hit) return key;
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
      touch: 'pointerType' in e && e.pointerType === 'touch',
      inside: p.x >= 0 && p.y >= 0 && p.x < width && p.y < height,
      clientX: e.clientX,
      clientY: e.clientY,
    };
  }

  private bindPointer(): void {
    const s = this.scroller;

    s.addEventListener('contextmenu', (e) => e.preventDefault());

    s.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this.touchDown(e);
      else this.down(e);
    });
    s.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch' || !this.touchMove(e)) this.move(e);
    });
    s.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'touch' || !this.touchUp(e, false)) this.finish(e, false);
    });
    s.addEventListener('pointercancel', (e) => {
      if (e.pointerType !== 'touch' || !this.touchUp(e, true)) this.finish(e, true);
    });

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
        // Small steps come from pinching a trackpad: smooth zoom. A mouse wheel notch goes to the next level.
        if (e.deltaMode === 0 && Math.abs(e.deltaY) < 40) this.setZoom(this.zoom * Math.exp(-e.deltaY / 100), e);
        else this.setZoom(nextZoom(this.zoom, e.deltaY < 0 ? 1 : -1), e);
      },
      { passive: false },
    );
  }

  /** On the canvas itself, not on the text box or the scrollbars. */
  private onCanvas(e: PointerEvent): boolean {
    const s = this.scroller;
    if (e.target !== s && e.target !== this.content) return false;
    const r = s.getBoundingClientRect();
    return e.clientX - r.left < s.clientWidth && e.clientY - r.top < s.clientHeight;
  }

  private down(e: PointerEvent): void {
    const s = this.scroller;
    if (e.button !== 0 && e.button !== 2) return;
    if (this.pressed || !this.onCanvas(e)) return;
    // The press that closes a menu (or the expanded minimized ribbon) does nothing else, as in Windows.
    const st = this.app.store.state;
    if (closedPopup(e) || (st.ribbonMinimized && st.ribbonPopup)) return;
    this.app.closePopups();
    if (st.printPreview) return;
    e.preventDefault();
    const touch = e.pointerType === 'touch';
    const handle = e.button === 0 ? this.hitResizeHandle(e.clientX, e.clientY, touch) : null;
    try {
      s.setPointerCapture(e.pointerId);
    } catch {
      // The finger was already lifted (a quick tap replayed on release).
    }
    this.pressed = true;
    this.downButton = e.button;
    this.stroke = { id: e.pointerId, type: e.pointerType, last: e, revision: this.app.doc.revision };
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
  }

  private move(e: PointerEvent, events = coalesced(e)): void {
    if (this.pressed && e.pointerId !== this.stroke?.id) return;
    const p = this.info(e, this.pressed ? this.downButton : 0);
    this.lastPointer = p;
    if (this.stroke) this.stroke.last = e;
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
      for (const ev of events) this.app.tool.move?.(this.info(ev, this.downButton));
    } else {
      this.app.tool.hover?.(p);
      this.refreshCursor();
    }
    this.updateStatus(p);
  }

  private finish(e: PointerEvent, cancelled: boolean): void {
    if (!this.pressed || e.pointerId !== this.stroke?.id) return;
    const s = this.scroller;
    this.pressed = false;
    this.stroke = null;
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
    const p = this.info(e, this.downButton);
    this.app.tool.up?.(p);
    this.refreshCursor();
  }

  // ---------------------------------------------------------------- touch

  private touchDown(e: PointerEvent): void {
    // While the pen (or the mouse) draws, a finger is the hand resting on the screen.
    if (this.stroke && this.stroke.type !== 'touch') return;
    const st = this.app.store.state;
    if (!this.onCanvas(e) || closedPopup(e) || (st.ribbonMinimized && st.ribbonPopup)) return;
    e.preventDefault();
    try {
      this.scroller.setPointerCapture(e.pointerId);
    } catch {
      // Not capturable: the finger is already gone.
    }
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.touches.size === 1) {
      this.held = { events: [e], timer: window.setTimeout(() => this.release(), TOUCH_HOLD) };
    } else if (this.touches.size === 2) {
      this.startPinch();
    }
  }

  /** Returns true if the event belongs to a touch gesture (it must not reach the tool). */
  private touchMove(e: PointerEvent): boolean {
    if (!this.touches.has(e.pointerId)) return false;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch) {
      // Each finger reports its own movement: update once per frame, with both fingers moved.
      this.pinchFrame ||= requestAnimationFrame(() => {
        this.pinchFrame = 0;
        this.updatePinch();
      });
      return true;
    }
    if (this.held) {
      this.held.events.push(...coalesced(e));
      return true;
    }
    return this.pinchTail;
  }

  private touchUp(e: PointerEvent, cancelled: boolean): boolean {
    if (!this.touches.delete(e.pointerId)) return false;
    if (this.held) {
      // A quick tap or stroke: draw it now, then finish it as usual.
      if (cancelled) this.dropHeld();
      else this.release();
      return cancelled;
    }
    if (this.pinch) {
      if (this.touches.size >= 2) this.startPinch();
      else {
        this.pinch = null;
        this.pinchTail = this.touches.size > 0;
      }
      return true;
    }
    if (this.pinchTail) {
      this.pinchTail = this.touches.size > 0;
      return true;
    }
    return false;
  }

  /** The first finger was not the start of a gesture: it starts drawing, with the movement held back. */
  private release(): void {
    const held = this.held;
    if (!held) return;
    this.dropHeld();
    const [first, ...moves] = held.events;
    this.down(first);
    if (moves.length) this.move(moves[moves.length - 1], moves);
  }

  private dropHeld(): void {
    if (this.held) window.clearTimeout(this.held.timer);
    this.held = null;
  }

  private startPinch(): void {
    if (this.held) this.dropHeld();
    else if (this.stroke?.type === 'touch') this.abortStroke();
    const [a, b] = [...this.touches.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this.pinch = {
      dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      zoom: this.zoom,
      at: this.fromClient(mid.x, mid.y),
      zooming: this.pinch?.zooming ?? false,
    };
  }

  private updatePinch(): void {
    const pinch = this.pinch;
    if (!pinch) return;
    const [a, b] = [...this.touches.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    if (!pinch.zooming && Math.abs(dist / pinch.dist - 1) > PINCH_THRESHOLD) {
      pinch.zooming = true;
      pinch.dist = dist;
    }
    let z = pinch.zooming ? pinch.zoom * (dist / pinch.dist) : pinch.zoom;
    z = clamp(z, ZOOM_LEVELS[0], ZOOM_LEVELS[ZOOM_LEVELS.length - 1]);
    // Close to 100 %, it snaps to it.
    if (Math.abs(z - 1) < 0.04) z = 1;
    this.zoomAt(z, pinch.at, mid);
  }

  /**
   * A second finger arrived after the first one started drawing: the stroke ends there and, if it was
   * a pencil, brush or eraser stroke, it is undone (it was the start of a gesture, not a drawing).
   */
  private abortStroke(): void {
    const stroke = this.stroke;
    if (!stroke) return;
    const undo = ['pencil', 'brush', 'eraser'].includes(this.app.tool.id) && !this.resizing;
    this.finish(stroke.last, Boolean(this.resizing));
    if (undo && this.app.doc.revision !== stroke.revision) this.app.doc.discardLast();
    // Keep receiving this finger's movement for the gesture.
    try {
      this.scroller.setPointerCapture(stroke.id);
    } catch {
      // Already lifted.
    }
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
  const pw = Math.max(1, Math.round(w * dpr));
  const ph = Math.max(1, Math.round(h * dpr));
  // Assigning the size clears the canvas even if it is the same: avoided while pinch-zooming.
  if (c.width !== pw) c.width = pw;
  if (c.height !== ph) c.height = ph;
}
