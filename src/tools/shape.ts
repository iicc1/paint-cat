import type { App } from '../app/app';
import type { AppState } from '../app/state';
import { dist, inflate, intRect, normRect, rectOfPoints } from '../app/geometry';
import { cursorForHandle, drawHandles, handlePoint, resizeByHandle, type Handle } from '../app/selection';
import { fillContours, strokeContours } from '../paint/brushes';
import {
  constrainAngle45,
  constrainSquare,
  curveContour,
  lineContour,
  polygonContour,
  shapeContours,
} from '../paint/shapes';
import type { Contour, Point, Rect, ShapeKind } from '../paint/types';
import { cursorCss } from '../ui/cursors';
import type { OverlayContext, PointerInfo, Tool } from './tool';

type BoxKind = Exclude<ShapeKind, 'line' | 'curve' | 'polygon'>;

type Live =
  | { type: 'box'; kind: BoxKind; rect: Rect; button: 0 | 2 }
  | { type: 'line'; a: Point; b: Point; button: 0 | 2 }
  | { type: 'curve'; a: Point; b: Point; c1: Point; c2: Point; stage: 0 | 1 | 2 | 3; button: 0 | 2 }
  | { type: 'polygon'; points: Point[]; closed: boolean; button: 0 | 2 };

type Drag =
  | { mode: 'create'; start: Point }
  | { mode: 'move'; start: Point; orig: Live }
  | { mode: 'handle'; handle: Handle; orig: Live; bbox: Rect }
  | { mode: 'endpoint'; which: 'a' | 'b' }
  | { mode: 'bend'; stage: 1 | 2 }
  | { mode: 'vertex' };

export class ShapeTool implements Tool {
  readonly id = 'shape' as const;
  readonly acceptsOutside = true;
  private live: Live | null = null;
  private drag: Drag | null = null;
  private hoverPoint: Point | null = null;
  private lastArea: Rect | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly app: App) {}

  activate(): void {
    this.unsubscribe = this.app.store.subscribe((changed) => this.onState(changed));
  }

  deactivate(): void {
    this.commitLive();
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  hasLive(): boolean {
    return this.live !== null;
  }

  cursor(p: PointerInfo | null): string {
    if (p && this.live && this.isEditable()) {
      const hit = this.hitTest(p);
      if (hit === 'move') return 'move';
      if (hit === 'a' || hit === 'b') return 'crosshair';
      if (hit) return cursorForHandle(hit);
    }
    return cursorCss('shapeCross');
  }

  // ---------------------------------------------------------------- pointer

  down(p: PointerInfo): void {
    const pt = { x: p.x, y: p.y };
    const live = this.live;
    if (live?.type === 'curve' && live.stage < 3) {
      const stage = live.stage <= 1 ? 1 : 2;
      this.drag = { mode: 'bend', stage };
      this.bend(live, stage, pt);
      return;
    }
    if (live?.type === 'polygon' && !live.closed) {
      if (live.points.length > 2 && dist(pt, live.points[0]) * this.app.view.zoom <= 6) {
        live.closed = true;
        this.drag = null;
        this.render();
        return;
      }
      live.points.push(pt);
      this.drag = { mode: 'vertex' };
      this.render();
      return;
    }
    if (live && this.isEditable()) {
      const hit = this.hitTest(p);
      if (hit === 'move') {
        this.drag = { mode: 'move', start: pt, orig: structuredClone(live) };
        return;
      }
      if (hit === 'a' || hit === 'b') {
        this.drag = { mode: 'endpoint', which: hit };
        return;
      }
      if (hit) {
        this.drag = { mode: 'handle', handle: hit, orig: structuredClone(live), bbox: this.bbox(live) };
        return;
      }
      this.commitLive();
    }
    const kind = this.app.store.state.shape;
    const button = p.button;
    if (kind === 'line') this.live = { type: 'line', a: pt, b: pt, button };
    else if (kind === 'curve') this.live = { type: 'curve', a: pt, b: pt, c1: pt, c2: pt, stage: 0, button };
    else if (kind === 'polygon') this.live = { type: 'polygon', points: [pt, pt], closed: false, button };
    else this.live = { type: 'box', kind, rect: { x: pt.x, y: pt.y, w: 0, h: 0 }, button };
    this.drag = { mode: 'create', start: pt };
    this.render();
  }

  move(p: PointerInfo): void {
    const live = this.live;
    const drag = this.drag;
    if (!live || !drag) return;
    const pt = { x: p.x, y: p.y };
    switch (drag.mode) {
      case 'create':
        if (live.type === 'box') {
          const end = p.shift ? constrainSquare(drag.start, pt) : pt;
          live.rect = normRect(drag.start, end);
        } else if (live.type === 'line' || live.type === 'curve') {
          live.b = p.shift ? constrainAngle45(live.a, pt) : pt;
          if (live.type === 'curve') {
            live.c1 = live.a;
            live.c2 = live.b;
          }
        } else if (live.type === 'polygon') {
          live.points[1] = p.shift ? constrainAngle45(live.points[0], pt) : pt;
        }
        break;
      case 'vertex':
        if (live.type === 'polygon') {
          const prev = live.points[live.points.length - 2];
          live.points[live.points.length - 1] = p.shift ? constrainAngle45(prev, pt) : pt;
        }
        break;
      case 'bend':
        if (live.type === 'curve') this.bend(live, drag.stage, pt);
        break;
      case 'endpoint':
        if (live.type === 'line') {
          const other = drag.which === 'a' ? live.b : live.a;
          live[drag.which] = p.shift ? constrainAngle45(other, pt) : pt;
        }
        break;
      case 'move': {
        const dx = Math.round(pt.x - drag.start.x);
        const dy = Math.round(pt.y - drag.start.y);
        this.live = translate(drag.orig, dx, dy);
        break;
      }
      case 'handle': {
        const next = resizeByHandle(drag.bbox, drag.handle, pt, p.shift);
        this.live = mapToRect(drag.orig, drag.bbox, next);
        break;
      }
    }
    this.render();
  }

  up(): void {
    const live = this.live;
    const drag = this.drag;
    this.drag = null;
    if (!live || !drag) return;
    if (drag.mode === 'create') {
      const b = this.bbox(live);
      if (live.type === 'curve') {
        if (b.w < 1 && b.h < 1) return this.cancelLive();
        live.stage = 1;
      } else if (live.type === 'polygon') {
        if (b.w < 1 && b.h < 1) return this.cancelLive();
      } else if (b.w < 1 && b.h < 1) {
        return this.cancelLive();
      }
    } else if (drag.mode === 'bend' && live.type === 'curve') {
      live.stage = drag.stage === 1 ? 2 : 3;
    }
    this.render();
  }

  hover(p: PointerInfo | null): void {
    this.hoverPoint = p ? { x: p.x, y: p.y } : null;
    if (this.live?.type === 'polygon' && !this.live.closed) this.app.invalidate();
  }

  dblclick(): void {
    const live = this.live;
    if (live?.type === 'polygon' && !live.closed) {
      // Double-click adds a duplicate vertex: remove it and close the polygon.
      while (
        live.points.length > 2 &&
        dist(live.points[live.points.length - 1], live.points[live.points.length - 2]) < 1
      )
        live.points.pop();
      live.closed = true;
      this.render();
    }
  }

  key(e: KeyboardEvent): boolean {
    const live = this.live;
    if (e.key === 'Enter' && live) {
      if (live.type === 'polygon' && !live.closed) live.closed = true;
      this.commitLive();
      return true;
    }
    if (live && this.isEditable() && e.key.startsWith('Arrow')) {
      const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      this.live = translate(live, dx, dy);
      this.render();
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- object lifecycle

  commitLive(): void {
    const live = this.live;
    if (!live) return;
    this.live = null;
    this.drag = null;
    this.app.clearPreview();
    const area = this.area(live);
    const ctx = this.app.doc.ctx;
    this.paint(ctx, live);
    this.app.doc.commit(area);
    this.app.markDirty();
    this.lastArea = null;
    this.publish();
  }

  cancelLive(): void {
    this.live = null;
    this.drag = null;
    this.lastArea = null;
    this.app.clearPreview();
    this.publish();
  }

  overlay(o: OverlayContext): void {
    const live = this.live;
    if (!live) return;
    const { ctx } = o;
    if (live.type === 'polygon' && !live.closed && this.hoverPoint && !this.drag) {
      const a = o.toView(live.points[live.points.length - 1].x, live.points[live.points.length - 1].y);
      const b = o.toView(this.hoverPoint.x, this.hoverPoint.y);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#555';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }
    if (!this.isEditable() || (this.drag && this.drag.mode === 'create')) return;
    const b = this.bbox(live);
    const tl = o.toView(b.x, b.y);
    const br = o.toView(b.x + b.w, b.y + b.h);
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#0a6ad6';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      Math.round(tl.x) - 0.5,
      Math.round(tl.y) - 0.5,
      Math.round(br.x - tl.x) + 1,
      Math.round(br.y - tl.y) + 1,
    );
    ctx.restore();
    if (live.type === 'line') {
      for (const pt of [live.a, live.b]) {
        const v = o.toView(pt.x, pt.y);
        ctx.fillStyle = '#fff';
        ctx.fillRect(Math.round(v.x) - 3, Math.round(v.y) - 3, 6, 6);
        ctx.strokeStyle = '#555c66';
        ctx.strokeRect(Math.round(v.x) - 2.5, Math.round(v.y) - 2.5, 5, 5);
      }
    } else {
      drawHandles(o, b);
    }
  }

  // ---------------------------------------------------------------- internals

  private onState(changed: ReadonlySet<keyof AppState>): void {
    if (!this.live) return;
    if (changed.has('shape')) return this.commitLive();
    if (['color1', 'color2', 'outline', 'fill', 'shapeSize'].some((k) => changed.has(k as keyof AppState)))
      this.render();
  }

  private isEditable(): boolean {
    const live = this.live;
    if (!live) return false;
    if (live.type === 'curve') return live.stage === 3;
    if (live.type === 'polygon') return live.closed;
    return true;
  }

  private bend(live: Extract<Live, { type: 'curve' }>, stage: 1 | 2, pt: Point): void {
    if (stage === 1) {
      live.c1 = pt;
      live.c2 = pt;
    } else {
      live.c2 = pt;
    }
    this.render();
  }

  private hitTest(p: PointerInfo): Handle | 'move' | 'a' | 'b' | null {
    const live = this.live;
    if (!live) return null;
    const tol = 5 / this.app.view.zoom;
    if (live.type === 'line') {
      if (dist(p, live.a) <= tol) return 'a';
      if (dist(p, live.b) <= tol) return 'b';
    }
    const b = this.bbox(live);
    if (live.type !== 'line') {
      for (const h of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as Handle[]) {
        const c = handlePoint(b, h);
        if (Math.abs(p.x - c.x) <= tol && Math.abs(p.y - c.y) <= tol) return h;
      }
    }
    const pad = live.type === 'line' ? tol : 0;
    if (p.x >= b.x - pad && p.y >= b.y - pad && p.x <= b.x + b.w + pad && p.y <= b.y + b.h + pad) return 'move';
    return null;
  }

  private bbox(live: Live): Rect {
    switch (live.type) {
      case 'box':
        return live.rect;
      case 'line':
        return normRect(live.a, live.b);
      case 'curve':
        return rectOfPoints(this.contours(live, 0)[0].points);
      case 'polygon':
        return rectOfPoints(live.points);
    }
  }

  private area(live: Live): Rect {
    const size = this.app.store.state.shapeSize;
    return intRect(inflate(this.bbox(live), size + 2));
  }

  private contours(live: Live, inset: number): Contour[] {
    switch (live.type) {
      case 'line':
        return [lineContour(live.a, live.b)];
      case 'curve':
        return [curveContour(live.a, live.b, live.c1, live.c2)];
      case 'polygon':
        return [polygonContour(live.points, live.closed)];
      case 'box': {
        const r = live.rect;
        const i = Math.min(inset, r.w / 2, r.h / 2);
        return shapeContours(live.kind, {
          x: r.x + i,
          y: r.y + i,
          w: Math.max(0, r.w - 2 * i),
          h: Math.max(0, r.h - 2 * i),
        });
      }
    }
  }

  private paint(ctx: CanvasRenderingContext2D, live: Live): void {
    const st = this.app.store.state;
    const size = st.shapeSize;
    const strokeColor = live.button === 2 ? st.color2 : st.color1;
    const fillColor = live.button === 2 ? st.color1 : st.color2;
    const open = live.type === 'line' || live.type === 'curve' || (live.type === 'polygon' && !live.closed);
    const outline = open && st.outline === 'none' ? 'solid' : st.outline;
    const fill = open ? 'none' : st.fill;
    const contours = this.contours(live, outline !== 'none' ? size / 2 : 0);
    if (!contours.length) return;
    if (fill !== 'none') fillContours(fill, ctx, contours, fillColor);
    if (outline !== 'none') strokeContours(outline, ctx, contours, size, strokeColor);
  }

  private render(): void {
    const live = this.live;
    const pctx = this.app.previewCtx;
    if (this.lastArea) pctx.clearRect(this.lastArea.x, this.lastArea.y, this.lastArea.w, this.lastArea.h);
    if (!live) return this.app.clearPreview();
    const area = this.area(live);
    this.paint(pctx, live);
    this.lastArea = area;
    this.app.previewActive = true;
    this.publish();
    this.app.invalidate();
  }

  private publish(): void {
    const live = this.live;
    const b = live ? this.bbox(live) : null;
    this.app.store.set({
      hasLiveShape: live !== null,
      selectionSize: b ? { w: Math.round(b.w), h: Math.round(b.h) } : null,
    });
  }
}

function translate(live: Live, dx: number, dy: number): Live {
  const t = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });
  switch (live.type) {
    case 'box':
      return { ...live, rect: { ...live.rect, x: live.rect.x + dx, y: live.rect.y + dy } };
    case 'line':
      return { ...live, a: t(live.a), b: t(live.b) };
    case 'curve':
      return { ...live, a: t(live.a), b: t(live.b), c1: t(live.c1), c2: t(live.c2) };
    case 'polygon':
      return { ...live, points: live.points.map(t) };
  }
}

/** Scales the shape from rectangle `from` to rectangle `to`. */
function mapToRect(live: Live, from: Rect, to: Rect): Live {
  const sx = from.w ? to.w / from.w : 1;
  const sy = from.h ? to.h / from.h : 1;
  const m = (p: Point): Point => ({ x: to.x + (p.x - from.x) * sx, y: to.y + (p.y - from.y) * sy });
  switch (live.type) {
    case 'box':
      return { ...live, rect: { x: to.x, y: to.y, w: to.w, h: to.h } };
    case 'line':
      return { ...live, a: m(live.a), b: m(live.b) };
    case 'curve':
      return { ...live, a: m(live.a), b: m(live.b), c1: m(live.c1), c2: m(live.c2) };
    case 'polygon':
      return { ...live, points: live.points.map(m) };
  }
}
