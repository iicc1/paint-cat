import { APP_NAME, detectLang, setLang } from '../i18n';
import type { RGB, Rect } from '../paint/types';
import { createTools } from '../tools';
import type { Tool } from '../tools/tool';
import { buildUI, type UI } from '../ui/layout';
import { rgbToCss } from './color';
import { createCanvas, ctx2d, PaintDoc } from './doc';
import { clip } from './geometry';
import { Selection } from './selection';
import { docTitle, initialState, isPersisted, loadSettings, saveSettings, type AppState, type ToolId } from './state';
import { Store } from './store';
import { Viewport } from './viewport';

export class App {
  readonly store: Store<AppState>;
  readonly doc: PaintDoc;
  /** Transparent layer the size of the image for the stroke in progress (translucent brushes). */
  readonly strokeLayer: HTMLCanvasElement;
  readonly strokeCtx: CanvasRenderingContext2D;
  strokeActive = false;
  strokeAlpha = 1;
  /** Layer for live objects: shape being edited, floating selection. */
  readonly previewLayer: HTMLCanvasElement;
  readonly previewCtx: CanvasRenderingContext2D;
  previewActive = false;
  readonly selection: Selection;
  readonly view: Viewport;
  readonly tools: Record<ToolId, Tool>;
  ui!: UI;

  constructor(root: HTMLElement) {
    this.store = new Store(loadSettings(initialState()));
    const st = this.store.state;
    setLang(st.lang ?? detectLang());
    this.doc = new PaintDoc(st.docWidth, st.docHeight, st.color2);
    this.strokeLayer = createCanvas(st.docWidth, st.docHeight);
    this.strokeCtx = ctx2d(this.strokeLayer);
    this.previewLayer = createCanvas(st.docWidth, st.docHeight);
    this.previewCtx = ctx2d(this.previewLayer);
    this.selection = new Selection(this);
    this.view = new Viewport(this);
    this.tools = createTools(this);

    this.doc.onChange = (sizeChanged) => {
      if (sizeChanged) this.syncLayerSize();
      this.store.set({ canUndo: this.doc.canUndo, canRedo: this.doc.canRedo });
      this.invalidate();
    };

    this.ui = buildUI(this, root);
    this.store.subscribe((changed, state) => this.onStateChange(changed, state));
    this.syncTitle();
    this.view.layout();
    this.tool.activate?.();
    this.view.refreshCursor();

    window.addEventListener('beforeunload', (e) => {
      if (this.store.state.dirty) e.preventDefault();
    });
  }

  get tool(): Tool {
    return this.tools[this.store.state.tool];
  }

  invalidate(): void {
    this.view.invalidate();
  }

  markDirty(): void {
    if (!this.store.state.dirty) this.store.set({ dirty: true });
  }

  // ---------------------------------------------------------------- tools

  setTool(id: ToolId): void {
    const st = this.store.state;
    if (st.tool === id) return;
    this.tool.deactivate?.();
    if (st.tool === 'select' || id !== 'select') this.selection.commit();
    this.store.set({ tool: id, previousTool: st.tool });
    this.store.flush();
    this.tool.activate?.();
    this.view.refreshCursor();
    this.invalidate();
  }

  /** Commits any live object: shape, text or floating selection. */
  commitLive(): void {
    if (this.tool.hasLive?.()) this.tool.commitLive?.();
    if (this.selection.isFloating) this.selection.commit();
  }

  /** Esc: cancels the live object or removes the selection. */
  cancelLive(): boolean {
    if (this.tool.hasLive?.()) {
      this.tool.cancelLive?.();
      return true;
    }
    if (this.selection.active) {
      this.selection.commit();
      return true;
    }
    return false;
  }

  /** Color for the pointer button: primary = Color 1, secondary = Color 2. */
  colorFor(button: 0 | 2): RGB {
    const st = this.store.state;
    return button === 2 ? st.color2 : st.color1;
  }

  // ---------------------------------------------------------------- layers

  beginStroke(alpha: number): CanvasRenderingContext2D {
    this.strokeCtx.clearRect(0, 0, this.strokeLayer.width, this.strokeLayer.height);
    this.strokeAlpha = alpha;
    this.strokeActive = true;
    return this.strokeCtx;
  }

  /** Flushes the stroke layer into the image and creates the undo step. */
  endStroke(area: Rect | null): void {
    if (!this.strokeActive) return;
    this.strokeActive = false;
    const r = area ? clip(area, this.doc.width, this.doc.height) : null;
    if (r) {
      const ctx = this.doc.ctx;
      ctx.save();
      ctx.globalAlpha = this.strokeAlpha;
      ctx.drawImage(this.strokeLayer, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
      ctx.restore();
      this.doc.commit(r);
      this.markDirty();
    }
    this.strokeCtx.clearRect(0, 0, this.strokeLayer.width, this.strokeLayer.height);
    this.invalidate();
  }

  clearPreview(): void {
    this.previewCtx.clearRect(0, 0, this.previewLayer.width, this.previewLayer.height);
    this.previewActive = false;
    this.invalidate();
  }

  private syncLayerSize(): void {
    const { width: w, height: h } = this.doc;
    for (const c of [this.strokeLayer, this.previewLayer]) {
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
    }
    this.store.set({ docWidth: w, docHeight: h });
    this.view.layout();
  }

  // ---------------------------------------------------------------- image operations

  /** Replaces the whole image with `next` (one undo step). */
  replaceImage(next: HTMLCanvasElement): void {
    this.doc.replace(next);
    this.markDirty();
  }

  /** Changes the canvas size without scaling: crops, or enlarges filling with Color 2. */
  resizeCanvas(w: number, h: number): void {
    this.commitLive();
    this.selection.commit();
    const next = createCanvas(w, h);
    const ctx = ctx2d(next);
    ctx.fillStyle = rgbToCss(this.store.state.color2);
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(this.doc.canvas, 0, 0);
    this.replaceImage(next);
  }

  undo(): void {
    if (this.tool.hasLive?.()) return this.tool.cancelLive?.();
    if (this.selection.isFloating) return this.selection.cancel();
    this.selection.commit();
    if (this.doc.undo()) this.markDirty();
  }

  redo(): void {
    this.commitLive();
    this.selection.commit();
    if (this.doc.redo()) this.markDirty();
  }

  closePopups(): void {
    this.ui?.closePopups();
  }

  // ---------------------------------------------------------------- state

  private onStateChange(changed: ReadonlySet<keyof AppState>, state: Readonly<AppState>): void {
    if ([...changed].some(isPersisted)) saveSettings(state);
    if (changed.has('lang')) {
      setLang(state.lang ?? detectLang());
      this.ui?.relabel();
    }
    if (changed.has('fileName') || changed.has('lang')) this.syncTitle();
    if (changed.has('showRulers') || changed.has('showThumbnail') || changed.has('showStatusBar')) {
      // The layout depends on the final window size: wait for the DOM to reflow.
      requestAnimationFrame(() => this.view.layout());
    }
    if (changed.has('showGrid') || changed.has('zoom')) this.invalidate();
    if (changed.has('color2') || changed.has('transparentSelection')) this.selection.refresh();
    this.ui?.update(changed, state);
  }

  private syncTitle(): void {
    document.title = `${docTitle(this.store.state)} - ${APP_NAME}`;
  }
}
