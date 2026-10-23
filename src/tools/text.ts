import type { App } from '../app/app';
import { rgbToCss, rgbToHex } from '../app/color';
import { intRect, normRect } from '../app/geometry';
import { cursorForHandle, drawHandles, handlePoint, resizeByHandle, type Handle } from '../app/selection';
import type { FontState } from '../app/state';
import { t } from '../i18n';
import type { Point, RGB, Rect } from '../paint/types';
import type { OverlayContext, PointerInfo, Tool } from './tool';

const PT_TO_PX = 96 / 72;
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

type Drag =
  | { mode: 'create'; start: Point; current: Point }
  | { mode: 'move'; start: Point; orig: Rect }
  | { mode: 'resize'; handle: Handle; orig: Rect };

export type TextStyleToggle = 'bold' | 'italic' | 'underline' | 'strike';

/** Text tool: an editable box with per-character formatting that is rasterized when committed. */
export class TextTool implements Tool {
  readonly id = 'text' as const;
  readonly acceptsOutside = true;
  private editor: HTMLDivElement | null = null;
  private box: Rect | null = null;
  private drag: Drag | null = null;
  private savedRange: Range | null = null;

  constructor(private readonly app: App) {
    app.view.onChange(() => this.layoutEditor());
    document.addEventListener('selectionchange', () => this.onSelectionChange());
  }

  hasLive(): boolean {
    return this.editor !== null;
  }

  deactivate(): void {
    this.commitLive();
  }

  cursor(p: PointerInfo | null): string {
    if (p && this.box) {
      const hit = this.hit(p);
      if (hit === 'border') return 'move';
      if (hit) return cursorForHandle(hit);
    }
    return 'text';
  }

  down(p: PointerInfo): void {
    const pt = { x: p.x, y: p.y };
    if (this.editor && this.box) {
      const hit = this.hit(p);
      if (hit === 'border') {
        this.drag = { mode: 'move', start: pt, orig: { ...this.box } };
        return;
      }
      if (hit) {
        this.drag = { mode: 'resize', handle: hit, orig: { ...this.box } };
        return;
      }
      this.commitLive();
      return;
    }
    if (!p.inside) return;
    this.drag = { mode: 'create', start: pt, current: pt };
  }

  move(p: PointerInfo): void {
    const d = this.drag;
    if (!d) return;
    const pt = { x: p.x, y: p.y };
    if (d.mode === 'create') d.current = pt;
    else if (d.mode === 'move' && this.box) {
      this.box = { ...d.orig, x: Math.round(d.orig.x + pt.x - d.start.x), y: Math.round(d.orig.y + pt.y - d.start.y) };
      this.layoutEditor();
    } else if (d.mode === 'resize' && this.box) {
      const r = resizeByHandle(d.orig, d.handle, { x: Math.round(pt.x), y: Math.round(pt.y) }, false);
      this.box = { x: r.x, y: r.y, w: Math.max(8, r.w), h: Math.max(8, r.h) };
      this.layoutEditor();
    }
    this.app.invalidate();
  }

  up(): void {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.mode === 'create') {
      let r = intRect(normRect(d.start, d.current));
      if (r.w < 8 || r.h < 8) {
        const lineH = Math.ceil(this.app.store.state.font.size * PT_TO_PX * 1.4);
        r = { x: Math.round(d.start.x), y: Math.round(d.start.y), w: Math.max(150, lineH * 8), h: lineH * 2 };
      }
      this.open(r);
    } else {
      this.editor?.focus();
    }
    this.app.invalidate();
  }

  key(e: KeyboardEvent): boolean {
    if (!this.editor) return false;
    if (e.key === 'Escape') {
      this.cancelLive();
      return true;
    }
    return false;
  }

  overlay(o: OverlayContext): void {
    const { ctx } = o;
    if (this.drag?.mode === 'create') {
      const r = normRect(this.drag.start, this.drag.current);
      const a = o.toView(r.x, r.y);
      const b = o.toView(r.x + r.w, r.y + r.h);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#000';
      ctx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(b.x - a.x), Math.round(b.y - a.y));
      ctx.restore();
      return;
    }
    const box = this.currentBox();
    if (!box) return;
    const a = o.toView(box.x, box.y);
    const b = o.toView(box.x + box.w, box.y + box.h);
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#0a6ad6';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(a.x) - 0.5, Math.round(a.y) - 0.5, Math.round(b.x - a.x) + 1, Math.round(b.y - a.y) + 1);
    ctx.restore();
    drawHandles(o, box);
  }

  // ---------------------------------------------------------------- formatting (from the ribbon)

  /** Applies a property to the selected part of the text, or to all of it if there is no selection. */
  applyFont(patch: Partial<FontState>): void {
    const ed = this.editor;
    const st = this.app.store;
    st.set({ font: { ...st.state.font, ...patch } });
    if (!ed) return;
    const hasRange = this.restoreRange();
    const whole = !hasRange;
    if (whole) selectAllIn(ed);
    document.execCommand('styleWithCSS', false, 'true');
    if (patch.family !== undefined) document.execCommand('fontName', false, patch.family);
    if (patch.size !== undefined) setSelectionSize(ed, patch.size);
    for (const key of ['bold', 'italic', 'underline', 'strike'] as const) {
      if (patch[key] === undefined) continue;
      const cmd = key === 'strike' ? 'strikeThrough' : key;
      if (document.queryCommandState(cmd) !== patch[key]) document.execCommand(cmd);
    }
    if (whole) {
      this.applyBaseStyle();
      window.getSelection()?.collapseToEnd();
    }
    this.layoutEditor();
  }

  toggle(style: TextStyleToggle): void {
    const f = this.app.store.state.font;
    this.applyFont({ [style]: !f[style] });
  }

  /** Text color (Color 1). */
  applyColor(rgb: RGB): void {
    const ed = this.editor;
    if (!ed) return;
    const hasRange = this.restoreRange();
    if (!hasRange) {
      selectAllIn(ed);
      document.execCommand('styleWithCSS', false, 'true');
      document.execCommand('foreColor', false, rgbToHex(rgb));
      ed.style.color = rgbToCss(rgb);
      window.getSelection()?.collapseToEnd();
    } else {
      document.execCommand('styleWithCSS', false, 'true');
      document.execCommand('foreColor', false, rgbToHex(rgb));
    }
  }

  refreshBackground(): void {
    if (!this.editor) return;
    const st = this.app.store.state;
    this.editor.style.background = st.textOpaque ? rgbToCss(st.color2) : 'transparent';
  }

  /** Clipboard commands inside the text box. */
  clipboard(cmd: 'cut' | 'copy' | 'paste'): boolean {
    if (!this.editor) return false;
    this.restoreRange();
    if (cmd === 'paste') {
      void navigator.clipboard
        ?.readText()
        .then((pasted) => {
          this.editor?.focus();
          this.restoreRange();
          document.execCommand('insertText', false, pasted);
        })
        .catch(() => {});
      return true;
    }
    document.execCommand(cmd);
    return true;
  }

  // ---------------------------------------------------------------- lifecycle

  private open(r: Rect): void {
    const app = this.app;
    const ed = document.createElement('div');
    ed.className = 'text-editor';
    ed.contentEditable = 'true';
    ed.spellcheck = false;
    ed.setAttribute('role', 'textbox');
    ed.setAttribute('aria-multiline', 'true');
    ed.setAttribute('aria-label', t.workspace.textBox);
    ed.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = e.clipboardData?.getData('text/plain') ?? '';
      document.execCommand('insertText', false, pasted);
    });
    ed.addEventListener('input', () => {
      this.layoutEditor();
      app.markDirty();
    });
    ed.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.cancelLive();
      }
    });
    this.editor = ed;
    this.box = r;
    this.applyBaseStyle();
    this.refreshBackground();
    app.view.content.append(ed);
    this.layoutEditor();
    app.store.set({ textEditing: true, tab: 'text' });
    ed.focus();
    app.invalidate();
  }

  commitLive(): void {
    const ed = this.editor;
    const box = this.currentBox();
    if (!ed || !box) return this.close();
    const hasText = (ed.textContent ?? '').trim().length > 0;
    const st = this.app.store.state;
    if (hasText || st.textOpaque) {
      const ctx = this.app.doc.ctx;
      if (st.textOpaque) {
        ctx.fillStyle = rgbToCss(st.color2);
        ctx.fillRect(box.x, box.y, box.w, box.h);
      }
      renderEditor(ed, ctx, box, this.app.view.zoom);
      this.app.doc.commit({ x: box.x, y: box.y, w: box.w + 4, h: box.h + 4 });
      this.app.markDirty();
    }
    this.close();
  }

  cancelLive(): void {
    this.close();
  }

  private close(): void {
    this.editor?.remove();
    this.editor = null;
    this.box = null;
    this.savedRange = null;
    const st = this.app.store.state;
    if (st.textEditing) this.app.store.set({ textEditing: false, tab: st.tab === 'text' ? 'home' : st.tab });
    this.app.invalidate();
  }

  /** Actual box (grows downward if the text does not fit). */
  private currentBox(): Rect | null {
    const box = this.box;
    const ed = this.editor;
    if (!box || !ed) return null;
    const h = Math.max(box.h, Math.ceil(ed.scrollHeight / this.app.view.zoom));
    return { ...box, h };
  }

  private layoutEditor(): void {
    const ed = this.editor;
    const box = this.box;
    if (!ed || !box) return;
    const z = this.app.view.zoom;
    const pos = this.app.view.toContent(box.x, box.y);
    ed.style.left = `${pos.x}px`;
    ed.style.top = `${pos.y}px`;
    ed.style.width = `${box.w * z}px`;
    ed.style.minHeight = `${box.h * z}px`;
    ed.style.setProperty('--tz', String(z));
    this.app.store.set({ selectionSize: { w: box.w, h: this.currentBox()?.h ?? box.h } });
  }

  private applyBaseStyle(): void {
    const ed = this.editor;
    if (!ed) return;
    const st = this.app.store.state;
    const f = st.font;
    ed.style.fontFamily = cssFamily(f.family);
    ed.style.fontSize = `calc(var(--tz, 1) * ${f.size * PT_TO_PX}px)`;
    ed.style.fontWeight = f.bold ? '700' : '400';
    ed.style.fontStyle = f.italic ? 'italic' : 'normal';
    ed.style.textDecorationLine =
      [f.underline ? 'underline' : '', f.strike ? 'line-through' : ''].join(' ').trim() || 'none';
    ed.style.color = rgbToCss(st.color1);
  }

  private hit(p: PointerInfo): Handle | 'border' | null {
    const box = this.currentBox();
    if (!box) return null;
    const tol = 5 / this.app.view.zoom;
    for (const h of HANDLES) {
      const c = handlePoint(box, h);
      if (Math.abs(p.x - c.x) <= tol && Math.abs(p.y - c.y) <= tol) return h;
    }
    const inOuter =
      p.x >= box.x - tol && p.y >= box.y - tol && p.x <= box.x + box.w + tol && p.y <= box.y + box.h + tol;
    const inInner = p.x > box.x && p.y > box.y && p.x < box.x + box.w && p.y < box.y + box.h;
    return inOuter && !inInner ? 'border' : null;
  }

  private onSelectionChange(): void {
    const ed = this.editor;
    const sel = window.getSelection();
    if (!ed || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!ed.contains(range.commonAncestorContainer)) return;
    this.savedRange = range.cloneRange();
    // Reflect the formatting of the text under the caret in the ribbon.
    const node =
      range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : (range.startContainer as Element);
    if (!node) return;
    const cs = getComputedStyle(node);
    const deco = decorations(node, ed);
    const px = Number.parseFloat(cs.fontSize) / this.app.view.zoom;
    const size = Math.round((px / PT_TO_PX) * 2) / 2;
    const family = cs.fontFamily.split(',')[0].replaceAll(/["']/g, '').trim();
    this.app.store.set({
      font: {
        family,
        size,
        bold: Number.parseInt(cs.fontWeight, 10) >= 600,
        italic: cs.fontStyle === 'italic',
        underline: deco.underline,
        strike: deco.strike,
      },
    });
  }

  /** Restores the last selection inside the box. Returns true if it is not collapsed. */
  private restoreRange(): boolean {
    const ed = this.editor;
    if (!ed) return false;
    ed.focus();
    const r = this.savedRange;
    const sel = window.getSelection();
    if (r && sel && ed.contains(r.commonAncestorContainer)) {
      sel.removeAllRanges();
      sel.addRange(r);
      return !r.collapsed;
    }
    return false;
  }
}

export function cssFamily(family: string): string {
  const quoted = /^[\w-]+$/.test(family) ? family : `"${family}"`;
  return `${quoted}, "Segoe UI", system-ui, sans-serif`;
}

function selectAllIn(ed: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  r.selectNodeContents(ed);
  sel.removeAllRanges();
  sel.addRange(r);
}

/** execCommand('fontSize') only accepts 1–7: 7 is used as a marker and replaced with the real size. */
function setSelectionSize(ed: HTMLElement, pt: number): void {
  document.execCommand('fontSize', false, '7');
  const px = pt * PT_TO_PX;
  for (const el of ed.querySelectorAll<HTMLElement>(
    'font[size="7"], span[style*="xxx-large"], span[style*="-webkit-xxx-large"]',
  )) {
    el.removeAttribute('size');
    el.style.fontSize = `calc(var(--tz, 1) * ${px}px)`;
  }
}

function decorations(node: Element, root: Element): { underline: boolean; strike: boolean } {
  let underline = false;
  let strike = false;
  for (let el: Element | null = node; el; el = el.parentElement) {
    const tag = el.tagName;
    const line = getComputedStyle(el).textDecorationLine;
    if (line.includes('underline') || tag === 'U') underline = true;
    if (line.includes('line-through') || tag === 'S' || tag === 'STRIKE') strike = true;
    if (el === root) break;
  }
  return { underline, strike };
}

/**
 * Draws the editor contents onto the image respecting the line wrapping done by the browser:
 * consecutive characters on the same line with the same style are grouped and drawn with fillText.
 */
function renderEditor(ed: HTMLElement, ctx: CanvasRenderingContext2D, box: Rect, zoom: number): void {
  const origin = ed.getBoundingClientRect();
  const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.textBaseline = 'alphabetic';
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const parent = node.parentElement;
    if (!parent) continue;
    const cs = getComputedStyle(parent);
    const sizePx = Number.parseFloat(cs.fontSize) / zoom;
    const font = `${cs.fontStyle} ${cs.fontWeight} ${sizePx}px ${cs.fontFamily}`;
    ctx.font = font;
    ctx.fillStyle = cs.color;
    const deco = decorations(parent, ed);
    const text = node.data;
    let runStart = -1;
    let runTop = 0;
    let runLeft = 0;
    const flush = (end: number): void => {
      if (runStart < 0) return;
      const chunk = text.slice(runStart, end);
      runStart = -1;
      if (!chunk.trim()) return;
      const metrics = ctx.measureText(chunk);
      const ascent = metrics.fontBoundingBoxAscent ?? sizePx * 0.8;
      const x = box.x + runLeft;
      const baseline = box.y + runTop + ascent;
      ctx.fillText(chunk, x, baseline);
      const thickness = Math.max(1, Math.round(sizePx / 14));
      if (deco.underline) ctx.fillRect(x, Math.round(baseline + sizePx * 0.1), metrics.width, thickness);
      if (deco.strike) ctx.fillRect(x, Math.round(baseline - sizePx * 0.28), metrics.width, thickness);
    };
    for (let i = 0; i < text.length; i++) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rect = range.getClientRects()[0];
      if (!rect) continue;
      const top = (rect.top - origin.top) / zoom;
      const left = (rect.left - origin.left) / zoom;
      if (runStart >= 0 && Math.abs(top - runTop) > 0.5) flush(i);
      if (runStart < 0) {
        runStart = i;
        runTop = top;
        runLeft = left;
      }
    }
    flush(text.length);
  }
  ctx.restore();
}
