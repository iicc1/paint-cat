import type { App } from '../app/app';
import { clip, intRect, normRect } from '../app/geometry';
import { cursorForHandle, resizeByHandle, type Handle } from '../app/selection';
import type { Point, Rect } from '../paint/types';
import { cursorCss } from '../ui/cursors';
import type { OverlayContext, PointerInfo, Tool } from './tool';

type Drag =
  | { mode: 'marquee'; start: Point; current: Point }
  | { mode: 'lasso'; points: Point[] }
  | { mode: 'move'; offset: Point; stampTrail: boolean }
  | { mode: 'resize'; handle: Handle; orig: Rect };

export class SelectTool implements Tool {
  readonly id = 'select' as const;
  readonly acceptsOutside = true;
  private drag: Drag | null = null;

  constructor(private readonly app: App) {}

  cursor(p: PointerInfo | null): string {
    if (p) {
      const hit = this.app.selection.hitHandle(p, this.app.view.zoom);
      if (hit === 'inside') return 'move';
      if (hit) return cursorForHandle(hit);
    }
    return cursorCss('selectCross');
  }

  deactivate(): void {
    this.app.selection.commit();
  }

  down(p: PointerInfo): void {
    const sel = this.app.selection;
    if (p.button === 2) {
      // The secondary button opens the context menu (on release).
      return;
    }
    const hit = sel.hitHandle(p, this.app.view.zoom);
    if (hit === 'inside' && sel.rect) {
      if (p.ctrl) {
        // Ctrl + drag: copy (leaves the original in place).
        if (sel.isFloating) sel.stamp();
        else {
          sel.lift();
          sel.stamp();
        }
      }
      this.drag = { mode: 'move', offset: { x: p.x - sel.rect.x, y: p.y - sel.rect.y }, stampTrail: p.shift };
      return;
    }
    if (hit && hit !== 'inside' && sel.rect) {
      this.drag = { mode: 'resize', handle: hit, orig: { ...sel.rect } };
      return;
    }
    sel.commit();
    const pt = { x: clampTo(p.x, this.app.doc.width), y: clampTo(p.y, this.app.doc.height) };
    this.drag =
      this.app.store.state.selectMode === 'free'
        ? { mode: 'lasso', points: [pt] }
        : { mode: 'marquee', start: pt, current: pt };
    this.app.invalidate();
  }

  move(p: PointerInfo): void {
    const d = this.drag;
    const sel = this.app.selection;
    if (!d) return;
    const pt = { x: clampTo(p.x, this.app.doc.width), y: clampTo(p.y, this.app.doc.height) };
    switch (d.mode) {
      case 'marquee': {
        d.current = p.shift ? squareFrom(d.start, pt) : pt;
        const r = normRect(d.start, d.current);
        this.app.store.set({ selectionSize: { w: Math.round(r.w), h: Math.round(r.h) } });
        break;
      }
      case 'lasso':
        d.points.push(pt);
        break;
      case 'move':
        sel.moveTo(p.x - d.offset.x, p.y - d.offset.y);
        if (d.stampTrail) sel.stamp();
        break;
      case 'resize':
        sel.resizeTo(resizeByHandle(d.orig, d.handle, { x: Math.round(p.x), y: Math.round(p.y) }, p.shift));
        break;
    }
    this.app.invalidate();
  }

  up(p: PointerInfo): void {
    const d = this.drag;
    this.drag = null;
    const sel = this.app.selection;
    if (p.button === 2 && !d) {
      this.app.ui.showContextMenu(p.clientX, p.clientY);
      return;
    }
    if (!d) return;
    if (d.mode === 'marquee') {
      const r = intRect(normRect(d.start, d.current));
      if (r.w >= 1 && r.h >= 1) sel.setRect(r);
      else sel.commit();
    } else if (d.mode === 'lasso') {
      if (d.points.length > 2) sel.setFreeform(d.points);
      else sel.commit();
    }
    this.app.invalidate();
  }

  key(e: KeyboardEvent): boolean {
    const sel = this.app.selection;
    if (!sel.rect || !e.key.startsWith('Arrow') || e.ctrlKey || e.metaKey || e.altKey) return false;
    const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    sel.moveTo(sel.rect.x + dx, sel.rect.y + dy);
    return true;
  }

  overlay(o: OverlayContext): void {
    const d = this.drag;
    if (!d) return;
    const { ctx } = o;
    ctx.save();
    ctx.lineWidth = 1;
    if (d.mode === 'marquee') {
      const r = clip(normRect(d.start, d.current), this.app.doc.width, this.app.doc.height);
      if (r) {
        const a = o.toView(r.x, r.y);
        const b = o.toView(r.x + r.w, r.y + r.h);
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(b.x - a.x), Math.round(b.y - a.y));
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#0a6ad6';
        ctx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(b.x - a.x), Math.round(b.y - a.y));
      }
    } else if (d.mode === 'lasso' && d.points.length > 1) {
      ctx.beginPath();
      d.points.forEach((pt, i) => {
        const v = o.toView(pt.x, pt.y);
        if (i) ctx.lineTo(v.x, v.y);
        else ctx.moveTo(v.x, v.y);
      });
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#000';
      ctx.stroke();
    }
    ctx.restore();
  }
}

function clampTo(v: number, max: number): number {
  return Math.min(Math.max(v, 0), max);
}

function squareFrom(start: Point, p: Point): Point {
  const s = Math.max(Math.abs(p.x - start.x), Math.abs(p.y - start.y));
  return { x: start.x + Math.sign(p.x - start.x || 1) * s, y: start.y + Math.sign(p.y - start.y || 1) * s };
}
