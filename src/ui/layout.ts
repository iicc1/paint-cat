import type { App } from '../app/app';
import { docTitle, type AppState, type QatItem } from '../app/state';
import { ZOOM_LEVELS } from '../app/viewport';
import { APP_NAME, t } from '../i18n';
import { ClipboardManager } from '../io/clipboard';
import { FileManager } from '../io/files';
import { buildPages, pageLayout } from '../io/print';
import { createCommands, type Commands } from './commands';
import { formatBytes } from './dialogs';
import { h, plainLabel, svg } from './dom';
import { openFileMenu } from './filemenu';
import { icon, type IconName } from './icons';
import { KeyTips, bindKeyboard } from './keys';
import { closeAllPopups, Menu, type MenuEntry } from './menu';
import { Ribbon } from './ribbon';
import { Tooltips } from './tooltip';

export interface UI {
  update(changed: ReadonlySet<keyof AppState>, state: Readonly<AppState>): void;
  /** Re-renders all text in the active language (the image and state are left untouched). */
  relabel(): void;
  closePopups(): void;
  showContextMenu(x: number, y: number): void;
  commands: Commands;
  files: FileManager;
  clipboard: ClipboardManager;
}

const QAT_ORDER: QatItem[] = ['new', 'open', 'save', 'print', 'printPreview', 'email', 'undo', 'redo'];
const QAT_CMD: Record<QatItem, string> = {
  new: 'file.new',
  open: 'file.open',
  save: 'file.save',
  print: 'file.print',
  printPreview: 'file.printPreview',
  email: 'file.email',
  undo: 'edit.undo',
  redo: 'edit.redo',
};
const QAT_ICON: Record<QatItem, IconName> = {
  new: 'new',
  open: 'open',
  save: 'save',
  print: 'print',
  printPreview: 'printPreview',
  email: 'email',
  undo: 'undo',
  redo: 'redo',
};

export function buildUI(app: App, root: HTMLElement): UI {
  const files = new FileManager(app);
  const clipboard = new ClipboardManager(app);
  let fullscreenEl: HTMLElement | null = null;
  const commands = createCommands(app, { files, clipboard, showFullscreen: () => showFullscreen() });

  // ------------------------------------------------------------------ ribbon and title
  const header = h('header.titlebar');
  const tips = new Tooltips(() => ribbon.body.getBoundingClientRect().bottom);
  const createRibbon = (): Ribbon =>
    new Ribbon(app, commands, tips, (owner) => openFileMenu(app, commands, files, owner));
  let ribbon = createRibbon();
  const qat = h('div.qat', { role: 'toolbar', 'aria-label': t.qat.toolbar });
  const qatBar = h('div.qat-below');
  const title = h('div.titlebar-title');
  header.append(svg(icon('app', 16), 'titlebar-icon'), qat, h('span.titlebar-sep', { 'aria-hidden': 'true' }), title);
  const ribbonEl = h('nav.ribbon', { 'aria-label': t.ribbon.label }, ribbon.tabsRow, ribbon.body);

  const qatButtons = new Map<QatItem, HTMLButtonElement>();
  const qatCustomize = h(
    'button.qat-customize',
    { type: 'button', 'aria-haspopup': 'menu', 'aria-label': t.qat.customize },
    svg(icon('dropdown', 16)),
  );
  tips.attach(qatCustomize, () => ({ title: t.qat.customize }));
  qatCustomize.addEventListener('click', () => {
    closeAllPopups();
    const st = app.store.state;
    const entries: MenuEntry[] = [
      { type: 'header', label: t.qat.customize },
      ...QAT_ORDER.map((item) => ({ type: 'item' as const, cmd: `qat.${item}`, check: true, icon: null })),
      { type: 'separator' },
      {
        type: 'item',
        cmd: 'qat.position',
        label: st.qatBelow ? t.qat.showAbove : t.qat.showBelow,
        icon: null,
      },
      { type: 'separator' },
      { type: 'item', cmd: 'ribbon.minimize', check: true, icon: null },
    ];
    const r = qatCustomize.getBoundingClientRect();
    new Menu(commands, entries, { owner: qatCustomize, className: 'menu-qat' }).show(r.left, r.bottom);
  });
  let qatIndex = 1;
  for (const item of QAT_ORDER) {
    const cmdId = QAT_CMD[item];
    const b = h(
      'button.qat-btn',
      { type: 'button', 'aria-label': t.qat.items[item], onclick: () => void commands[cmdId].run() },
      svg(icon(QAT_ICON[item], 16)),
    );
    tips.attach(b, () => {
      const c = commands[cmdId];
      const label = t.qat.items[item];
      return { title: c.shortcut ? `${label} (${c.shortcut})` : label, desc: c.desc };
    });
    qatButtons.set(item, b);
    qat.append(b);
  }
  qat.append(qatCustomize);

  const syncQat = (st: Readonly<AppState>): void => {
    qatIndex = 1;
    for (const item of QAT_ORDER) {
      const b = qatButtons.get(item)!;
      b.hidden = !st.qat[item];
      if (!b.hidden) b.dataset.kt = String(qatIndex++);
      const c = commands[QAT_CMD[item]];
      b.disabled = !(c.enabled?.() ?? true);
    }
    const parent = st.qatBelow ? qatBar : header;
    if (qat.parentElement !== parent) {
      if (st.qatBelow) qatBar.append(qat);
      else header.insertBefore(qat, header.children[1]);
    }
    qatBar.hidden = !st.qatBelow;
    header.classList.toggle('qat-is-below', st.qatBelow);
  };

  // ------------------------------------------------------------------ workspace and preview
  const main = h('main.workarea', {}, app.view.root);
  const preview = new PrintPreview(app, commands);
  main.append(preview.el);

  // ------------------------------------------------------------------ status bar
  const status = new StatusBar(app, commands);

  root.append(header, ribbonEl, qatBar, main, status.el);

  // ------------------------------------------------------------------ file drag and drop
  main.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  });
  main.addEventListener('drop', async (e) => {
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    e.preventDefault();
    if (await files.confirmDiscard()) await files.openFile(file);
  });

  // ------------------------------------------------------------------ full screen
  function showFullscreen(): void {
    if (fullscreenEl) return;
    app.commitLive();
    const canvas = h('canvas.fullscreen-canvas', { width: app.doc.width, height: app.doc.height });
    canvas.getContext('2d')?.drawImage(app.doc.canvas, 0, 0);
    const el = h('div.fullscreen', { tabIndex: 0, role: 'dialog', 'aria-label': t.workspace.fullscreen }, canvas);
    const exit = (): void => {
      if (!fullscreenEl) return;
      fullscreenEl = null;
      el.remove();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      app.store.set({ fullscreen: false });
    };
    el.addEventListener('pointerdown', exit);
    el.addEventListener('keydown', (e) => {
      e.preventDefault();
      exit();
    });
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) exit();
    });
    document.body.append(el);
    fullscreenEl = el;
    app.store.set({ fullscreen: true });
    el.focus();
    void el.requestFullscreen?.().catch(() => {});
  }

  // ------------------------------------------------------------------ keyboard
  const keytips = new KeyTips(app, {
    top: () =>
      [
        ribbon.fileButton,
        ...ribbonEl.querySelectorAll<HTMLElement>('.rb-tab'),
        ...qat.querySelectorAll<HTMLElement>('.qat-btn'),
        ribbon.languageButton,
        ribbon.minimizeButton,
      ].filter((el) => !el.hidden && el.offsetParent !== null),
    panel: () => ribbon.body.querySelector<HTMLElement>('.rb-panel:not([hidden])'),
  });
  bindKeyboard(app, commands, keytips);

  // Close the expanded (minimized) ribbon when clicking outside.
  document.addEventListener('pointerdown', (e) => {
    const st = app.store.state;
    if (
      st.ribbonMinimized &&
      st.ribbonPopup &&
      !ribbonEl.contains(e.target as Node) &&
      !(e.target as HTMLElement).closest?.('.popup')
    ) {
      app.store.set({ ribbonPopup: false });
    }
  });

  const ui: UI = {
    commands,
    files,
    clipboard,
    update(changed, st) {
      // Moving the mouse only changes the status bar: no need to refresh the ribbon.
      if (changed.size > 0 && [...changed].every((k) => k === 'cursor' || k === 'selectionSize')) {
        status.update(changed, st);
        return;
      }
      ribbon.update(changed, st);
      if (changed.has('fileName') || changed.has('lang')) title.textContent = `${docTitle(st)} - ${APP_NAME}`;
      syncQat(st);
      status.update(changed, st);
      preview.update(changed, st);
      if (changed.has('printPreview')) {
        app.view.root.hidden = st.printPreview;
        if (!st.printPreview) requestAnimationFrame(() => app.view.layout());
      }
      if (changed.has('showStatusBar')) status.el.hidden = !st.showStatusBar;
      root.classList.toggle('is-text-editing', st.textEditing);
    },
    relabel() {
      closeAllPopups();
      tips.hide();
      ribbon.destroy();
      ribbon = createRibbon();
      ribbonEl.replaceChildren(ribbon.tabsRow, ribbon.body);
      ribbonEl.setAttribute('aria-label', t.ribbon.label);
      qat.setAttribute('aria-label', t.qat.toolbar);
      for (const [item, b] of qatButtons) b.setAttribute('aria-label', t.qat.items[item]);
      qatCustomize.setAttribute('aria-label', t.qat.customize);
      status.relabel(commands);
      preview.el.setAttribute('aria-label', t.ribbon.tabs.preview);
      app.view.relabel();
      ui.update(new Set(Object.keys(app.store.state) as (keyof AppState)[]), app.store.state);
    },
    closePopups: () => closeAllPopups(),
    showContextMenu(x, y) {
      closeAllPopups();
      const entries: MenuEntry[] = [
        { type: 'item', cmd: 'edit.cut' },
        { type: 'item', cmd: 'edit.copy' },
        { type: 'item', cmd: 'edit.paste' },
        { type: 'separator' },
        { type: 'item', cmd: 'edit.crop' },
        { type: 'item', cmd: 'edit.selectAll', label: t.context.selectAll },
        { type: 'item', cmd: 'edit.invertSelection' },
        { type: 'item', cmd: 'edit.delete' },
        { type: 'separator' },
        {
          type: 'submenu',
          label: t.context.rotate,
          icon: 'rotate',
          items: [
            { type: 'item', cmd: 'edit.rotateRight' },
            { type: 'item', cmd: 'edit.rotateLeft' },
            { type: 'item', cmd: 'edit.rotate180' },
            { type: 'item', cmd: 'edit.flipV' },
            { type: 'item', cmd: 'edit.flipH' },
          ],
        },
        { type: 'item', cmd: 'edit.resize', label: t.context.resize },
        { type: 'item', cmd: 'edit.invertColor' },
      ];
      new Menu(commands, entries, { className: 'menu-context' }).show(x + 1, y + 1);
    },
  };
  // Initial render of the whole state.
  ui.update(new Set(Object.keys(app.store.state) as (keyof AppState)[]), app.store.state);
  return ui;
}

// ---------------------------------------------------------------------- status bar

class StatusBar {
  readonly el: HTMLElement;
  private readonly pos = h('span.sb-text');
  private readonly sel = h('span.sb-text');
  private readonly size = h('span.sb-text');
  private readonly file = h('span.sb-text');
  private readonly zoomText = h('span.sb-zoom-text');
  private readonly slider: HTMLInputElement;
  private readonly zoomOut: HTMLButtonElement;
  private readonly zoomIn: HTMLButtonElement;

  constructor(app: App, commands: Commands) {
    this.slider = h('input.sb-slider', {
      type: 'range',
      min: '0',
      max: String(ZOOM_LEVELS.length - 1),
      step: '1',
      oninput: () => app.view.setZoom(ZOOM_LEVELS[Number(this.slider.value)]),
    });
    this.zoomOut = h(
      'button.sb-zoom-btn',
      { type: 'button', onclick: () => void commands['view.zoomOut'].run() },
      svg(icon('zoomMinusCircle', 16)),
    );
    this.zoomIn = h(
      'button.sb-zoom-btn',
      { type: 'button', onclick: () => void commands['view.zoomIn'].run() },
      svg(icon('zoomPlusCircle', 16)),
    );
    this.el = h(
      'footer.statusbar',
      {},
      h('div.sb-pane.sb-pos', {}, svg(icon('statusCursor', 16)), this.pos),
      h('div.sb-pane.sb-sel', {}, svg(icon('statusSelection', 16)), this.sel),
      h('div.sb-pane.sb-size', {}, svg(icon('statusImage', 16)), this.size),
      h('div.sb-pane.sb-file', {}, this.file),
      h('div.sb-pane.sb-fill'),
      h('div.sb-pane.sb-zoom', {}, this.zoomText, this.zoomOut, this.slider, this.zoomIn),
    );
    this.relabel(commands);
  }

  relabel(commands: Commands): void {
    this.el.setAttribute('aria-label', t.status.label);
    this.slider.setAttribute('aria-label', t.status.zoomSlider);
    for (const [b, cmd] of [
      [this.zoomOut, 'view.zoomOut'],
      [this.zoomIn, 'view.zoomIn'],
    ] as const) {
      const label = plainLabel(commands[cmd].label);
      b.setAttribute('aria-label', label);
      b.title = label;
    }
  }

  update(changed: ReadonlySet<keyof AppState>, st: Readonly<AppState>): void {
    if (changed.has('cursor')) this.pos.textContent = st.cursor ? t.status.position(st.cursor.x, st.cursor.y) : '';
    if (changed.has('selectionSize'))
      this.sel.textContent = st.selectionSize ? t.status.size(st.selectionSize.w, st.selectionSize.h) : '';
    if (changed.has('docWidth') || changed.has('docHeight'))
      this.size.textContent = t.status.size(st.docWidth, st.docHeight);
    if (changed.has('fileSize'))
      this.file.textContent = st.fileSize !== null ? t.status.fileSize(formatBytes(st.fileSize)) : '';
    if (changed.has('zoom')) {
      const pct = st.zoom * 100;
      this.zoomText.textContent = `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
      const i = ZOOM_LEVELS.findIndex((z) => Math.abs(z - st.zoom) < 1e-9);
      if (i >= 0) this.slider.value = String(i);
      this.slider.style.setProperty('--pos', String(Number(this.slider.value) / (ZOOM_LEVELS.length - 1)));
    }
    if (changed.has('printPreview')) this.el.classList.toggle('is-preview', st.printPreview);
  }
}

// ---------------------------------------------------------------------- print preview

class PrintPreview {
  readonly el = h('div.print-preview', { hidden: true, 'aria-label': t.ribbon.tabs.preview });
  private zoom = 1;
  private twoPages = false;
  private page = 0;
  private src = '';

  constructor(
    private readonly app: App,
    commands: Commands,
  ) {
    commands['preview.zoomIn'].run = () => this.setZoom(this.zoom * 2);
    commands['preview.zoomIn'].enabled = () => this.zoom < 8;
    commands['preview.zoomOut'].run = () => this.setZoom(this.zoom / 2);
    commands['preview.zoomOut'].enabled = () => this.zoom > 1;
    commands['preview.onePage'].run = () => ((this.twoPages = false), this.setZoom(1));
    commands['preview.onePage'].checked = () => !this.twoPages && this.zoom === 1;
    commands['preview.onePage'].enabled = () => this.zoom !== 1 || this.twoPages;
    commands['preview.twoPages'].run = () => ((this.twoPages = true), this.setZoom(1));
    commands['preview.twoPages'].checked = () => this.twoPages && this.zoom === 1;
    commands['preview.twoPages'].enabled = () => this.pageCount() > 1;
    commands['preview.prev'].run = () => this.goto(this.page - 1);
    commands['preview.prev'].enabled = () => this.page > 0;
    commands['preview.next'].run = () => this.goto(this.page + (this.twoPages ? 2 : 1));
    commands['preview.next'].enabled = () => this.page + (this.twoPages ? 2 : 1) < this.pageCount();
    this.el.addEventListener('click', () => {
      if (this.zoom === 1) this.setZoom(2);
      else this.setZoom(1);
    });
    window.addEventListener('resize', () => {
      if (this.app.store.state.printPreview) this.render();
    });
  }

  update(changed: ReadonlySet<keyof AppState>, st: Readonly<AppState>): void {
    if (changed.has('printPreview')) {
      this.el.hidden = !st.printPreview;
      if (st.printPreview) {
        this.zoom = 1;
        this.page = 0;
        this.twoPages = false;
        this.src = this.app.doc.canvas.toDataURL('image/png');
        requestAnimationFrame(() => this.render());
      }
    } else if (st.printPreview && changed.has('pageSetup')) {
      this.page = 0;
      this.render();
    }
  }

  private pageCount(): number {
    const l = pageLayout(this.app.store.state.pageSetup, this.app.doc.width, this.app.doc.height);
    return l.cols * l.rows;
  }

  private setZoom(z: number): void {
    this.zoom = Math.min(8, Math.max(1, z));
    this.render();
  }

  private goto(p: number): void {
    this.page = Math.max(0, Math.min(this.pageCount() - 1, p));
    this.render();
  }

  private render(): void {
    const setup = this.app.store.state.pageSetup;
    const layout = pageLayout(setup, this.app.doc.width, this.app.doc.height);
    // 20 px margin per side + sheet borders and shadow.
    const avail = { w: this.el.clientWidth - 50, h: this.el.clientHeight - 50 };
    const count = this.twoPages ? 2 : 1;
    const fit = Math.min(avail.w / (layout.pageW * count + (count - 1) * 10), avail.h / layout.pageH);
    const k = Math.max(0.5, fit * this.zoom); // px per mm
    const pages = buildPages(layout, this.src, (mm) => `${mm * k}px`);
    const sheets = pages.slice(this.page, this.page + count).map((p) => {
      const sheet = h('div.preview-sheet');
      sheet.style.width = `${layout.pageW * k}px`;
      sheet.style.height = `${layout.pageH * k}px`;
      p.style.left = `${setup.margins.left * k}px`;
      p.style.top = `${setup.margins.top * k}px`;
      sheet.append(p);
      return sheet;
    });
    this.el.replaceChildren(h('div.preview-sheets', {}, ...sheets));
    this.el.classList.toggle('is-zoomed', this.zoom > 1);
    // Updates the state of the tab's buttons (previous/next page, zoom).
    this.app.ui?.update(new Set(), this.app.store.state);
  }
}
