import type { App } from '../app/app';
import { DEFAULT_PALETTE, rgbToCss, rgbToHex } from '../app/color';
import type { AppState, TabId } from '../app/state';
import { LANGS, lang, langName, t } from '../i18n';
import { contoursToSvgPath, shapeContours } from '../paint/shapes';
import { BRUSH_ORDER, SHAPE_ORDER, SHAPE_STYLE_ORDER, type ShapeKind } from '../paint/types';
import type { TextTool } from '../tools/text';
import { BRUSH_ICONS, applyColor, currentSize, setSize, sizeOptions, type Commands } from './commands';
import { h, placePopup, plainLabel, svg } from './dom';
import { availableFonts, loadMoreFonts } from './fonts';
import { icon, type IconName } from './icons';
import { closeAllPopups, dropMenu, Menu, Popup } from './menu';
import type { Tooltips } from './tooltip';

type BindMode = 'button' | 'toggle' | 'checkbox';
interface Binding {
  el: HTMLElement;
  cmd: string;
  mode: BindMode;
  input?: HTMLInputElement;
  /** Element that carries aria-pressed for a toggle (defaults to `el`, which must then be a button). */
  pressed?: HTMLElement;
}

/** A group that, when the ribbon is too narrow, collapses into a button that opens it (lowest `order` first). */
interface Collapse {
  order: number;
  icon: IconName;
  kt: string;
}

export const TAB_KEYTIPS: Record<TabId, string> = { home: 'H', view: 'V', text: 'T', preview: 'P' };

/** Ribbon buttons must not steal focus from the text box being edited. */
function keepFocus(e: PointerEvent): void {
  if (!(e.target as HTMLElement).closest('input, select')) e.preventDefault();
}

/** Shape icons generated from the engine's own geometry (blue stroke, as in Paint). */
export function shapeIcon(kind: ShapeKind): string {
  let d: string;
  if (kind === 'line') d = 'M2.5 13.5 L13.5 2.5';
  else if (kind === 'curve') d = 'M2 13 C 4 2, 9 2, 9 8 S 13 14, 14 3';
  else if (kind === 'polygon') d = 'M3 13 L2.5 6 L8 2.5 L13.5 5 L11 9 L13.5 13.5 Z';
  else d = contoursToSvgPath(shapeContours(kind, { x: 2.5, y: 2.5, w: 11, h: 11 }), 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="${d}" fill="none" stroke="#2f6eb5" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

export class Ribbon {
  readonly tabsRow: HTMLElement;
  readonly body: HTMLElement;
  readonly fileButton: HTMLButtonElement;
  readonly minimizeButton: HTMLButtonElement;
  readonly languageButton: HTMLButtonElement;
  private readonly bindings: Binding[] = [];
  private readonly tabButtons = new Map<TabId, HTMLButtonElement>();
  private readonly panels = new Map<TabId, HTMLElement>();
  private readonly contextual: HTMLElement;
  private paletteEl!: HTMLElement;
  private color1El!: HTMLElement;
  private color2El!: HTMLElement;
  private brushMain!: HTMLElement;
  private selectMain!: HTMLElement;
  private shapeGrid!: HTMLElement;
  private sizeButton!: HTMLElement;
  private fontInput!: HTMLInputElement;
  private sizeInput!: HTMLInputElement;
  private shapeScroll = 0;
  private groupPopup: Popup | null = null;
  private readonly resizeObserver = new ResizeObserver(() => this.fit());
  private readonly unsubscribe: (() => void)[] = [];

  constructor(
    private readonly app: App,
    private readonly commands: Commands,
    private readonly tips: Tooltips,
    onFileMenu: (owner: HTMLButtonElement) => void,
  ) {
    this.fileButton = h(
      'button.rb-file',
      { type: 'button', 'data-kt': 'F', 'aria-haspopup': 'menu', onclick: () => onFileMenu(this.fileButton) },
      t.ribbon.file,
    );
    tips.attach(this.fileButton, () => ({ title: t.ribbon.fileTip, desc: t.ribbon.fileDesc }));
    const tablist = h('div.rb-tablist', { role: 'tablist' });
    for (const id of ['home', 'view', 'preview'] as TabId[]) {
      const b = h(
        'button.rb-tab',
        { type: 'button', role: 'tab', 'data-kt': TAB_KEYTIPS[id], 'data-tab': id, onclick: () => this.selectTab(id) },
        t.ribbon.tabs[id],
      );
      this.tabButtons.set(id, b);
      tablist.append(b);
    }
    const textTab = h(
      'button.rb-tab.is-contextual',
      { type: 'button', role: 'tab', 'data-kt': 'T', 'data-tab': 'text', onclick: () => this.selectTab('text') },
      t.ribbon.tabs.text,
    );
    this.tabButtons.set('text', textTab);
    this.contextual = h('div.rb-contextual', {}, h('div.rb-contextual-title', {}, t.ribbon.textTools), textTab);
    tablist.append(this.contextual);
    this.minimizeButton = h('button.rb-minimize', {
      type: 'button',
      'data-kt': 'Y',
      onclick: () => void commands['ribbon.minimize'].run(),
    });
    this.bindTip(this.minimizeButton, 'ribbon.minimize');
    this.languageButton = h(
      'button.rb-language',
      {
        type: 'button',
        'data-kt': 'L',
        'aria-haspopup': 'menu',
        'aria-label': `${plainLabel(commands.language.label)}: ${langName(lang)}`,
        onclick: () => this.openLanguageMenu(),
      },
      svg(icon('language', 16)),
      h('span.rb-language-name', {}, langName(lang)),
      svg(icon('dropdown', 16), 'rb-caret'),
    );
    this.bindTip(this.languageButton, 'language');
    const help = h(
      'button.rb-help',
      { type: 'button', 'aria-label': plainLabel(commands.help.label), onclick: () => void commands.help.run() },
      svg(icon('help', 16)),
    );
    this.bindTip(help, 'help');
    this.tabsRow = h(
      'div.rb-tabsrow',
      {},
      this.fileButton,
      tablist,
      h('div.rb-tabsrow-spacer'),
      this.languageButton,
      this.minimizeButton,
      help,
    );

    this.body = h('div.rb-body', { role: 'toolbar' });
    this.panels.set('home', this.buildHome());
    this.panels.set('view', this.buildView());
    this.panels.set('text', this.buildText());
    this.panels.set('preview', this.buildPreview());
    for (const [id, p] of this.panels) {
      p.dataset.tab = id;
      this.body.append(p);
      // If the groups still don't fit, the panel scrolls sideways (finger, or the mouse wheel).
      p.addEventListener('scroll', () => this.updateScrollHint(p), { passive: true });
      p.addEventListener(
        'wheel',
        (e) => {
          if (e.ctrlKey || e.deltaX || p.scrollWidth <= p.clientWidth) return;
          e.preventDefault();
          p.scrollLeft += e.deltaY;
        },
        { passive: false },
      );
    }
    this.body.addEventListener('pointerdown', keepFocus);
    this.resizeObserver.observe(this.body);
    void document.fonts?.ready.then(() => this.fit());
  }

  /** Releases state subscriptions (a new ribbon is created when the language changes). */
  destroy(): void {
    for (const off of this.unsubscribe) off();
    this.resizeObserver.disconnect();
  }

  private openLanguageMenu(): void {
    closeAllPopups();
    const r = this.languageButton.getBoundingClientRect();
    new Menu(
      this.commands,
      LANGS.map((l) => ({ type: 'item' as const, cmd: `lang.${l}`, check: true, icon: null })),
      { owner: this.languageButton, className: 'menu-language' },
    ).show(r.left, r.bottom);
  }

  // ---------------------------------------------------------------- state

  update(changed: ReadonlySet<keyof AppState>, st: Readonly<AppState>): void {
    if (
      changed.has('tab') ||
      changed.has('textEditing') ||
      changed.has('printPreview') ||
      changed.has('ribbonMinimized') ||
      changed.has('ribbonPopup')
    ) {
      this.syncTabs(st);
    }
    if (changed.has('color1') || changed.has('color2') || changed.has('customColors')) this.syncColors(st);
    if (changed.has('brush')) this.brushMain.querySelector('.icon')!.innerHTML = icon(BRUSH_ICONS[st.brush], 32);
    if (changed.has('selectMode'))
      this.selectMain.querySelector('.icon')!.innerHTML = icon(
        st.selectMode === 'free' ? 'selectFree' : 'selectRect',
        32,
      );
    if (changed.has('font')) {
      if (document.activeElement !== this.fontInput) this.fontInput.value = st.font.family;
      if (document.activeElement !== this.sizeInput) this.sizeInput.value = String(st.font.size);
    }
    if (changed.has('tool') || changed.has('shape')) this.syncShapeGrid();
    this.refresh();
  }

  /** Recomputes the enabled/checked state of every control. */
  refresh(): void {
    for (const b of this.bindings) {
      const cmd = this.commands[b.cmd];
      if (!cmd) continue;
      const enabled = cmd.enabled?.() ?? true;
      const checked = cmd.checked?.() ?? false;
      if (b.el instanceof HTMLButtonElement) b.el.disabled = !enabled;
      b.el.classList.toggle('is-disabled', !enabled);
      if (b.input) {
        b.input.disabled = !enabled;
        b.input.checked = checked;
      }
      if (b.mode === 'toggle') {
        b.el.classList.toggle('is-checked', checked);
        // Only commands with an on/off state are toggle buttons (Paste in a split button is not).
        if (cmd.checked) (b.pressed ?? b.el).setAttribute('aria-pressed', String(checked));
      }
    }
  }

  selectTab(id: TabId): void {
    const st = this.app.store.state;
    if (st.ribbonMinimized) {
      const same = st.tab === id && st.ribbonPopup;
      this.app.store.set({ tab: id, ribbonPopup: !same });
    } else {
      this.app.store.set({ tab: id });
    }
  }

  private syncTabs(st: Readonly<AppState>): void {
    const preview = st.printPreview;
    this.contextual.hidden = !st.textEditing || preview;
    this.tabButtons.get('home')!.hidden = preview;
    this.tabButtons.get('view')!.hidden = preview;
    this.tabButtons.get('preview')!.hidden = !preview;
    let tab = st.tab;
    if (preview) tab = 'preview';
    else if (tab === 'preview' || (tab === 'text' && !st.textEditing)) tab = 'home';
    for (const [id, b] of this.tabButtons) {
      const active = id === tab;
      b.classList.toggle('is-active', active && (!st.ribbonMinimized || st.ribbonPopup));
      b.setAttribute('aria-selected', String(active));
    }
    for (const [id, p] of this.panels) p.hidden = id !== tab;
    this.body.classList.toggle('is-minimized', st.ribbonMinimized);
    this.body.classList.toggle('is-popup', st.ribbonMinimized && st.ribbonPopup);
    this.minimizeButton.innerHTML = icon(st.ribbonMinimized ? 'chevronDown' : 'chevronUp', 16);
    this.minimizeButton.setAttribute('aria-label', st.ribbonMinimized ? t.ribbon.expand : t.ribbon.minimize);
    this.fit();
  }

  /**
   * Collapses groups into a button that opens them in a popup until the visible tab fits, as Paint's
   * ribbon does when the window is narrow (on a phone, nearly all of them).
   */
  private fit(): void {
    if (this.groupPopup?.isOpen) return;
    const panel = [...this.panels.values()].find((p) => !p.hidden);
    if (!panel?.clientWidth) return;
    const groups = [...panel.querySelectorAll<HTMLElement>(':scope > .rb-group[data-collapse]')].toSorted(
      (a, b) => Number(a.dataset.collapse) - Number(b.dataset.collapse),
    );
    const fits = (): boolean => panel.scrollWidth <= panel.clientWidth;
    panel.classList.remove('is-compact');
    for (const g of groups) g.classList.remove('is-collapsed');
    for (const g of groups) {
      if (fits()) break;
      g.classList.add('is-collapsed');
    }
    // Still too wide (a phone): collapsed groups and the big buttons on their own show only their icon.
    if (!fits()) panel.classList.add('is-compact');
    // Expand again, most used first, the groups that now fit.
    for (const g of groups.toReversed()) {
      if (!g.classList.contains('is-collapsed')) continue;
      g.classList.remove('is-collapsed');
      if (!fits()) g.classList.add('is-collapsed');
    }
    this.updateScrollHint(panel);
  }

  /** Fades the edge where there is more ribbon to scroll to. */
  private updateScrollHint(panel: HTMLElement): void {
    const max = panel.scrollWidth - panel.clientWidth;
    panel.classList.toggle('has-more-left', max > 1 && panel.scrollLeft > 1);
    panel.classList.toggle('has-more-right', max > 1 && panel.scrollLeft < max - 1);
  }

  private openGroup(group: HTMLElement, owner: HTMLButtonElement, body: HTMLElement, caption: HTMLElement): void {
    closeAllPopups();
    const p = new Popup('rb-grouppop', owner);
    p.el.append(h('div.rb-group', {}, body, caption));
    p.el.addEventListener('pointerdown', keepFocus);
    // Picking a color closes it, as picking a tool or running a command does.
    p.el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.rb-swatch')) p.close();
    });
    p.onClose = () => {
      group.append(body, caption);
      this.groupPopup = null;
    };
    this.groupPopup = p;
    p.open();
    const r = owner.getBoundingClientRect();
    placePopup(p.el, r.left, r.bottom, { x: r.right, y: r.top });
  }

  private syncColors(st: Readonly<AppState>): void {
    (this.color1El.querySelector('.rb-swatch-big') as HTMLElement).style.background = rgbToCss(st.color1);
    (this.color2El.querySelector('.rb-swatch-big') as HTMLElement).style.background = rgbToCss(st.color2);
    const custom = this.paletteEl.querySelectorAll<HTMLButtonElement>('.rb-swatch.is-custom');
    custom.forEach((b, i) => {
      const c = st.customColors[i];
      b.style.background = c ? rgbToCss(c) : '';
      b.classList.toggle('is-empty', !c);
      b.title = c ? rgbToHex(c) : '';
    });
  }

  // ---------------------------------------------------------------- control builders

  private bind(el: HTMLElement, cmd: string, mode: BindMode = 'button', input?: HTMLInputElement): void {
    this.bindings.push({ el, cmd, mode, input });
    this.bindTip(el, cmd);
  }

  private bindTip(el: HTMLElement, cmdId: string): void {
    this.tips.attach(el, () => {
      const c = this.commands[cmdId];
      if (!c) return null;
      const title = c.tip ?? (c.shortcut ? `${plainLabel(c.label)} (${c.shortcut})` : plainLabel(c.label));
      return { title, desc: c.desc };
    });
  }

  /** Runs a command from the ribbon and closes its popups, except the one holding `keep`. */
  private run(cmd: string, keep?: HTMLElement): void {
    closeAllPopups(keep);
    void this.commands[cmd]?.run();
    if (!keep && this.app.store.state.ribbonPopup) this.app.store.set({ ribbonPopup: false });
  }

  private large(
    cmd: string,
    kt: string,
    opts: { label?: string; icon?: IconName; toggle?: boolean } = {},
  ): HTMLButtonElement {
    const c = this.commands[cmd];
    const b = h(
      'button.rb-large',
      { type: 'button', 'data-kt': kt, onclick: () => this.run(cmd) },
      svg(icon(opts.icon ?? c.icon ?? 'app', 32)),
      h('span.rb-label', {}, opts.label ?? plainLabel(c.label)),
    );
    this.bind(b, cmd, opts.toggle ? 'toggle' : 'button');
    return b;
  }

  private splitLarge(
    cmd: string,
    kt: string,
    onDrop: (owner: HTMLElement) => void,
    iconName: IconName,
    label?: string,
  ): HTMLElement {
    const c = this.commands[cmd];
    const main = h(
      'button.rb-split-main',
      { type: 'button', onclick: () => this.run(cmd), 'aria-label': plainLabel(c.label) },
      svg(icon(iconName, 32)),
    );
    const drop = h(
      'button.rb-split-drop',
      {
        type: 'button',
        'data-kt': kt,
        'aria-label': label ?? plainLabel(c.label),
        'aria-haspopup': 'true',
        onclick: () => onDrop(wrap),
      },
      h('span.rb-label', {}, label ?? plainLabel(c.label)),
      svg(icon('dropdown', 16), 'rb-caret'),
    );
    const wrap = h('div.rb-split-large', { role: 'group', 'aria-label': plainLabel(c.label) }, main, drop);
    // The wrapper shows the checked state; aria-pressed goes on the main button, since a group can't have it.
    this.bindings.push({ el: wrap, cmd, mode: 'toggle', pressed: main });
    this.bindTip(wrap, cmd);
    this.bindings.push({ el: main, cmd, mode: 'button' }, { el: drop, cmd, mode: 'button' });
    return wrap;
  }

  private largeDrop(cmd: string, kt: string, onDrop: (owner: HTMLElement) => void): HTMLButtonElement {
    const c = this.commands[cmd];
    const b = h(
      'button.rb-large.rb-largedrop',
      {
        type: 'button',
        'data-kt': kt,
        'aria-label': plainLabel(c.label),
        'aria-haspopup': 'true',
        onclick: () => onDrop(b),
      },
      svg(icon(c.icon ?? 'app', 32)),
      h('span.rb-label', {}, plainLabel(c.label)),
      svg(icon('dropdown', 16), 'rb-caret'),
    );
    this.bind(b, cmd);
    return b;
  }

  private small(
    cmd: string,
    kt: string,
    opts: { label?: string; toggle?: boolean; noLabel?: boolean } = {},
  ): HTMLButtonElement {
    const c = this.commands[cmd];
    const b = h(
      'button.rb-small',
      {
        type: 'button',
        'data-kt': kt,
        'aria-label': opts.noLabel ? plainLabel(c.label) : null,
        onclick: () => this.run(cmd),
      },
      c.icon ? svg(icon(c.icon, 16)) : null,
      opts.noLabel ? null : h('span.rb-label', {}, opts.label ?? plainLabel(c.label)),
    );
    if (opts.noLabel) b.classList.add('rb-iconbtn');
    this.bind(b, cmd, opts.toggle ? 'toggle' : 'button');
    return b;
  }

  private smallDrop(cmd: string, kt: string, onDrop: (owner: HTMLElement) => void): HTMLButtonElement {
    const c = this.commands[cmd];
    const b = h(
      'button.rb-small.rb-smalldrop',
      { type: 'button', 'data-kt': kt, 'aria-haspopup': 'true', onclick: () => onDrop(b) },
      c.icon ? svg(icon(c.icon, 16)) : null,
      h('span.rb-label', {}, plainLabel(c.label)),
      svg(icon('dropdown', 16), 'rb-caret'),
    );
    this.bind(b, cmd);
    return b;
  }

  private check(cmd: string, kt: string): HTMLLabelElement {
    const c = this.commands[cmd];
    const input = h('input', { type: 'checkbox', tabIndex: -1, onchange: () => this.run(cmd) });
    const l = h(
      'label.rb-check',
      { 'data-kt': kt },
      input,
      h('span.rb-checkbox', { 'aria-hidden': 'true' }),
      h('span.rb-label', {}, plainLabel(c.label)),
    );
    this.bind(l, cmd, 'checkbox', input);
    return l;
  }

  private group(label: string, collapse: Collapse | null, ...children: HTMLElement[]): HTMLElement {
    const body = h('div.rb-group-body', {}, ...children);
    const caption = h('div.rb-group-label', {}, label);
    const group = h('div.rb-group', { role: 'group', 'aria-label': label || null }, body, caption);
    if (collapse) {
      group.dataset.collapse = String(collapse.order);
      const b = h(
        'button.rb-large.rb-groupbtn',
        {
          type: 'button',
          'data-kt': collapse.kt,
          'aria-label': label,
          'aria-haspopup': 'true',
          'aria-expanded': 'false',
          onclick: () => this.openGroup(group, b, body, caption),
        },
        svg(icon(collapse.icon, 32)),
        h('span.rb-label', {}, label),
        svg(icon('dropdown', 16), 'rb-caret'),
      );
      this.tips.attach(b, () => ({ title: label }));
      group.prepend(b);
    }
    return group;
  }

  private col(...children: HTMLElement[]): HTMLElement {
    return h('div.rb-col', {}, ...children);
  }

  // ---------------------------------------------------------------- Home

  private buildHome(): HTMLElement {
    const c = this.commands;
    const clipboard = this.group(
      t.ribbon.groups.clipboard,
      { order: 3, icon: 'paste', kt: 'ZC' },
      this.splitLarge(
        'edit.paste',
        'V',
        (o) =>
          dropMenu(
            c,
            o,
            [
              { type: 'item', cmd: 'edit.paste' },
              { type: 'item', cmd: 'edit.pasteFrom' },
            ],
            'menu-compact',
          ),
        'paste',
      ),
      this.col(this.small('edit.cut', 'X'), this.small('edit.copy', 'C')),
    );

    this.selectMain = this.splitLarge(
      'select.main',
      'SE',
      (o) =>
        dropMenu(c, o, [
          { type: 'header', label: t.ribbon.selectionShapes },
          { type: 'item', cmd: 'select.rect', check: false },
          { type: 'item', cmd: 'select.free', check: false },
          { type: 'header', label: t.ribbon.selectionOptions },
          { type: 'item', cmd: 'edit.selectAll' },
          { type: 'item', cmd: 'edit.invertSelection' },
          { type: 'item', cmd: 'edit.delete' },
          { type: 'item', cmd: 'select.transparent', check: true, icon: null },
        ]),
      'selectRect',
    );
    const image = this.group(
      t.ribbon.groups.image,
      { order: 2, icon: 'selectRect', kt: 'ZI' },
      this.selectMain,
      this.col(
        this.small('edit.crop', 'RP'),
        this.small('edit.resize', 'RE'),
        this.smallDrop('edit.rotate', 'RO', (o) =>
          dropMenu(c, o, [
            { type: 'item', cmd: 'edit.rotateRight' },
            { type: 'item', cmd: 'edit.rotateLeft' },
            { type: 'item', cmd: 'edit.rotate180' },
            { type: 'item', cmd: 'edit.flipV' },
            { type: 'item', cmd: 'edit.flipH' },
          ]),
        ),
      ),
    );

    const tools = this.group(
      t.ribbon.groups.tools,
      { order: 5, icon: 'pencil', kt: 'ZT' },
      h(
        'div.rb-toolgrid',
        {},
        this.small('tool.pencil', 'P1', { toggle: true, noLabel: true }),
        this.small('tool.fill', 'K', { toggle: true, noLabel: true }),
        this.small('tool.text', 'T', { toggle: true, noLabel: true }),
        this.small('tool.eraser', 'ER', { toggle: true, noLabel: true }),
        this.small('tool.picker', 'D', { toggle: true, noLabel: true }),
        this.small('tool.magnifier', 'M', { toggle: true, noLabel: true }),
      ),
    );

    this.brushMain = this.splitLarge('tool.brush', 'B', (o) => this.openBrushGallery(o), 'brushBrush');
    const brushes = this.group('', null, this.brushMain);

    this.shapeGrid = h('div.rb-shapes-grid', { role: 'listbox', 'aria-label': t.ribbon.shapes });
    for (const kind of SHAPE_ORDER) {
      const b = h('button.rb-shape', {
        type: 'button',
        role: 'option',
        'aria-label': t.shapes[kind],
        'data-shape': kind,
        onclick: () => this.run(`shape.${kind}`),
      });
      b.innerHTML = shapeIcon(kind);
      this.tips.attach(b, () => ({ title: t.shapes[kind] }));
      this.shapeGrid.append(b);
    }
    const up = h(
      'button.rb-gal-btn',
      { type: 'button', 'aria-label': t.ribbon.rowUp, onclick: () => this.scrollShapes(-1) },
      svg(icon('chevronUp', 16)),
    );
    const down = h(
      'button.rb-gal-btn',
      { type: 'button', 'aria-label': t.ribbon.rowDown, onclick: () => this.scrollShapes(1) },
      svg(icon('chevronDown', 16)),
    );
    const more = h(
      'button.rb-gal-btn.rb-gal-more',
      {
        type: 'button',
        'data-kt': 'SH',
        'aria-label': t.ribbon.moreShapes,
        onclick: () => this.openShapeGallery(gallery),
      },
      svg(icon('dropdown', 16)),
    );
    const gallery = h(
      'div.rb-shapes',
      {},
      h('div.rb-shapes-viewport', {}, this.shapeGrid),
      h('div.rb-gal-buttons', {}, up, down, more),
    );
    this.tips.attach(gallery, () => ({ title: t.ribbon.shapes, desc: t.ribbon.shapesDesc }));
    const outline = this.smallDrop('shape.outline', 'O', (o) =>
      dropMenu(
        c,
        o,
        SHAPE_STYLE_ORDER.map((s) => ({ type: 'item' as const, cmd: `outline.${s}`, check: false })),
        'menu-styles',
      ),
    );
    const fill = this.smallDrop('shape.fill', 'I', (o) =>
      dropMenu(
        c,
        o,
        SHAPE_STYLE_ORDER.map((s) => ({ type: 'item' as const, cmd: `fill.${s}`, check: false })),
        'menu-styles',
      ),
    );
    const shapes = this.group(
      t.ribbon.groups.shapes,
      { order: 1, icon: 'shapes', kt: 'ZS' },
      gallery,
      this.col(outline, fill),
    );

    this.sizeButton = this.largeDrop('size', 'SZ', (o) => this.openSizeList(o));
    const size = this.group('', null, this.sizeButton);

    this.color1El = this.colorButton(1, '1');
    this.color2El = this.colorButton(2, '2');
    this.paletteEl = h('div.rb-palette', { role: 'listbox', 'aria-label': t.ribbon.palette, 'data-kt': 'Y' });
    DEFAULT_PALETTE.forEach((rgb, i) => {
      const name = t.palette[i];
      const b = h('button.rb-swatch', {
        type: 'button',
        role: 'option',
        'aria-label': name,
        onclick: () => applyColor(this.app, rgb),
      });
      b.style.background = rgbToCss(rgb);
      b.style.gridRow = String(i < 10 ? 1 : 2);
      this.tips.attach(b, () => ({ title: name }));
      this.paletteEl.append(b);
    });
    for (let i = 0; i < 10; i++) {
      const b = h('button.rb-swatch.is-custom.is-empty', {
        type: 'button',
        role: 'option',
        'aria-label': t.ribbon.customColor(i + 1),
        onclick: () => {
          const color = this.app.store.state.customColors[i];
          if (color) applyColor(this.app, color);
        },
      });
      b.style.gridRow = '3';
      this.paletteEl.append(b);
    }
    const colors = this.group(
      t.ribbon.groups.colors,
      { order: 4, icon: 'editColors', kt: 'ZL' },
      this.color1El,
      this.color2El,
      this.paletteEl,
      this.large('color.edit', 'EC', { label: t.ribbon.editColors }),
    );

    const panel = h(
      'div.rb-panel',
      { role: 'tabpanel', 'aria-label': t.ribbon.tabs.home },
      clipboard,
      image,
      tools,
      brushes,
      shapes,
      size,
      colors,
    );
    this.syncColors(this.app.store.state);
    return panel;
  }

  private colorButton(which: 1 | 2, kt: string): HTMLElement {
    const cmd = `color.${which}`;
    const b = h(
      'button.rb-large.rb-color',
      // Keeps a collapsed Colors group open: the next tap is usually on the palette.
      { type: 'button', 'data-kt': kt, onclick: () => this.run(cmd, b) },
      h('span.rb-swatch-frame', {}, h('span.rb-swatch-big')),
      h('span.rb-label', {}, t.ribbon.color(which)),
    );
    b.setAttribute('aria-label', plainLabel(this.commands[cmd].label));
    this.bind(b, cmd, 'toggle');
    return b;
  }

  private scrollShapes(dir: 1 | -1): void {
    const rows = Math.ceil(SHAPE_ORDER.length / 7);
    this.shapeScroll = Math.min(Math.max(0, this.shapeScroll + dir), rows - 3);
    // A row is 21 px, or more on touch screens.
    const row = (this.shapeGrid.firstElementChild as HTMLElement | null)?.offsetHeight || 21;
    this.shapeGrid.style.transform = `translateY(${-this.shapeScroll * row}px)`;
  }

  private syncShapeGrid(): void {
    const st = this.app.store.state;
    for (const b of this.shapeGrid.querySelectorAll<HTMLElement>('.rb-shape')) {
      b.classList.toggle('is-checked', st.tool === 'shape' && b.dataset.shape === st.shape);
    }
  }

  private openShapeGallery(owner: HTMLElement): void {
    closeAllPopups(owner);
    const p = new Popup('gallery gallery-shapes', owner);
    const st = this.app.store.state;
    for (const kind of SHAPE_ORDER) {
      const b = h('button.rb-shape', {
        type: 'button',
        'aria-label': t.shapes[kind],
        onclick: () => this.run(`shape.${kind}`),
      });
      b.innerHTML = shapeIcon(kind);
      b.classList.toggle('is-checked', st.tool === 'shape' && st.shape === kind);
      this.tips.attach(b, () => ({ title: t.shapes[kind] }));
      p.el.append(b);
    }
    p.open();
    const r = owner.getBoundingClientRect();
    placePopup(p.el, r.left, r.top);
  }

  private openBrushGallery(owner: HTMLElement): void {
    closeAllPopups(owner);
    const p = new Popup('gallery gallery-brushes', owner);
    const st = this.app.store.state;
    for (const kind of BRUSH_ORDER) {
      const b = h(
        'button.rb-brush',
        { type: 'button', 'aria-label': t.brushes[kind], onclick: () => this.run(`brush.${kind}`) },
        svg(icon(BRUSH_ICONS[kind], 32)),
      );
      b.classList.toggle('is-checked', st.brush === kind);
      this.tips.attach(b, () => ({ title: t.brushes[kind] }));
      p.el.append(b);
    }
    p.open();
    const r = owner.getBoundingClientRect();
    placePopup(p.el, r.left, r.bottom, { x: r.right, y: r.top });
  }

  private openSizeList(owner: HTMLElement): void {
    closeAllPopups(owner);
    const opts = sizeOptions(this.app);
    if (!opts.length) return;
    const p = new Popup('gallery gallery-sizes', owner);
    const cur = currentSize(this.app);
    for (const size of opts) {
      const line = h('span.size-line');
      line.style.height = `${size}px`;
      const b = h(
        'button.rb-size',
        { type: 'button', 'aria-label': `${size}px`, onclick: () => (closeAllPopups(), setSize(this.app, size)) },
        line,
      );
      b.classList.toggle('is-checked', size === cur);
      this.tips.attach(b, () => ({ title: `${size}px` }));
      p.el.append(b);
    }
    p.open();
    const r = owner.getBoundingClientRect();
    placePopup(p.el, r.left, r.bottom, { x: r.right, y: r.top });
  }

  // ---------------------------------------------------------------- View

  private buildView(): HTMLElement {
    const zoom = this.group(
      t.ribbon.groups.zoom,
      { order: 3, icon: 'zoomIn', kt: 'ZZ' },
      this.large('view.zoomIn', 'I'),
      this.large('view.zoomOut', 'O'),
      this.large('view.zoom100', 'M', { label: t.ribbon.zoom100 }),
    );
    const show = this.group(
      t.ribbon.groups.showHide,
      { order: 2, icon: 'thumbnail', kt: 'ZH' },
      this.col(this.check('view.rulers', 'R'), this.check('view.grid', 'G'), this.check('view.statusBar', 'S')),
    );
    const display = this.group(
      t.ribbon.groups.display,
      { order: 1, icon: 'fullscreen', kt: 'ZD' },
      this.large('view.fullscreen', 'F', { label: t.ribbon.fullscreen }),
      this.large('view.thumbnail', 'T', { toggle: true }),
    );
    return h('div.rb-panel', { role: 'tabpanel', 'aria-label': t.ribbon.tabs.view }, zoom, show, display);
  }

  // ---------------------------------------------------------------- Text (contextual)

  private buildText(): HTMLElement {
    const text = (): TextTool => this.app.tools.text as TextTool;
    const clipboard = this.group(
      t.ribbon.groups.clipboard,
      { order: 2, icon: 'paste', kt: 'ZC' },
      this.large('edit.paste', 'P1'),
      this.col(this.small('edit.cut', 'X'), this.small('edit.copy', 'C')),
    );

    this.fontInput = h('input.rb-combo-input', {
      type: 'text',
      value: this.app.store.state.font.family,
      'aria-label': t.cmd['text.family'].label,
      spellcheck: false,
    });
    const fontCombo = this.combo(
      this.fontInput,
      'FF',
      'rb-combo-font',
      (owner) => this.openFontList(owner),
      (v) => text().applyFont({ family: v }),
    );
    this.bindTip(fontCombo, 'text.family');
    this.sizeInput = h('input.rb-combo-input', {
      type: 'text',
      value: String(this.app.store.state.font.size),
      'aria-label': t.cmd['text.size'].label,
      inputMode: 'decimal',
    });
    const sizeCombo = this.combo(
      this.sizeInput,
      'FS',
      'rb-combo-size',
      (owner) => this.openFontSizeList(owner),
      (v) => {
        const n = Number.parseFloat(v.replace(',', '.'));
        if (Number.isFinite(n) && n >= 1 && n <= 1638) text().applyFont({ size: n });
      },
    );
    this.bindTip(sizeCombo, 'text.size');
    const font = this.group(
      t.ribbon.groups.font,
      { order: 4, icon: 'text', kt: 'ZF' },
      h(
        'div.rb-fontgrid',
        {},
        fontCombo,
        h(
          'div.rb-fontrow',
          {},
          sizeCombo,
          this.small('text.bold', 'FB', { toggle: true, noLabel: true }),
          this.small('text.italic', 'FI', { toggle: true, noLabel: true }),
          this.small('text.underline', 'FU', { toggle: true, noLabel: true }),
          this.small('text.strike', 'FX', { toggle: true, noLabel: true }),
        ),
      ),
    );
    const background = this.group(
      t.ribbon.groups.background,
      { order: 3, icon: 'opaque', kt: 'ZB' },
      this.col(this.small('text.opaque', 'O', { toggle: true }), this.small('text.transparent', 'T', { toggle: true })),
    );

    // The Text tab repeats the Colors group with the same controls.
    const c1 = this.colorButton(1, '1');
    const c2 = this.colorButton(2, '2');
    const palette = this.paletteEl.cloneNode(true) as HTMLElement;
    palette.querySelectorAll<HTMLButtonElement>('.rb-swatch').forEach((b, i) => {
      b.addEventListener('click', () => {
        if (i < 20) applyColor(this.app, DEFAULT_PALETTE[i]);
        else {
          const color = this.app.store.state.customColors[i - 20];
          if (color) applyColor(this.app, color);
        }
      });
    });
    const colors = this.group(
      t.ribbon.groups.colors,
      { order: 1, icon: 'editColors', kt: 'ZL' },
      c1,
      c2,
      palette,
      this.large('color.edit', 'EC', { label: t.ribbon.editColors }),
    );
    // Keep the duplicates in sync.
    const off = this.app.store.subscribe((changed, st) => {
      if (changed.has('color1'))
        (c1.querySelector('.rb-swatch-big') as HTMLElement).style.background = rgbToCss(st.color1);
      if (changed.has('color2'))
        (c2.querySelector('.rb-swatch-big') as HTMLElement).style.background = rgbToCss(st.color2);
      if (changed.has('customColors'))
        palette.querySelectorAll<HTMLButtonElement>('.rb-swatch.is-custom').forEach((b, i) => {
          const color = st.customColors[i];
          b.style.background = color ? rgbToCss(color) : '';
          b.classList.toggle('is-empty', !color);
        });
    });
    this.unsubscribe.push(off);
    (c1.querySelector('.rb-swatch-big') as HTMLElement).style.background = rgbToCss(this.app.store.state.color1);
    (c2.querySelector('.rb-swatch-big') as HTMLElement).style.background = rgbToCss(this.app.store.state.color2);
    return h(
      'div.rb-panel',
      { role: 'tabpanel', 'aria-label': t.ribbon.tabs.text },
      clipboard,
      font,
      background,
      colors,
    );
  }

  private combo(
    input: HTMLInputElement,
    kt: string,
    className: string,
    onDrop: (owner: HTMLElement) => void,
    onCommit: (value: string) => void,
  ): HTMLElement {
    const drop = h(
      'button.rb-combo-drop',
      { type: 'button', tabIndex: -1, 'aria-label': t.ribbon.open, onclick: () => onDrop(wrap) },
      svg(icon('dropdown', 16)),
    );
    const wrap = h('div.rb-combo', { class: className, 'data-kt': kt }, input, drop);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        onCommit(input.value.trim());
      } else if (e.key === 'Escape') {
        input.blur();
      } else if (e.key === 'ArrowDown' && e.altKey) {
        onDrop(wrap);
      }
    });
    input.addEventListener('change', () => onCommit(input.value.trim()));
    return wrap;
  }

  private openFontList(owner: HTMLElement): void {
    closeAllPopups(owner);
    const p = new Popup('gallery gallery-fonts', owner);
    const list = h('div.font-list', { role: 'listbox' });
    const current = this.app.store.state.font.family;
    const render = (fonts: string[]): void => {
      list.replaceChildren(
        ...fonts.map((f) => {
          const b = h(
            'button.font-item',
            {
              type: 'button',
              role: 'option',
              onclick: () => (closeAllPopups(), (this.app.tools.text as TextTool).applyFont({ family: f })),
            },
            f,
          );
          b.style.fontFamily = `"${f}", system-ui`;
          b.classList.toggle('is-checked', f === current);
          return b;
        }),
      );
    };
    render(availableFonts());
    const more = h(
      'button.font-more',
      {
        type: 'button',
        onclick: async () => {
          const fonts = await loadMoreFonts();
          render(fonts);
        },
      },
      svg(icon('text', 16)),
      t.ribbon.moreFonts,
    );
    p.el.append(list, more);
    p.open();
    const r = owner.getBoundingClientRect();
    placePopup(p.el, r.left, r.bottom, { x: r.right, y: r.top });
    list.querySelector<HTMLElement>('.is-checked')?.scrollIntoView({ block: 'center' });
  }

  private openFontSizeList(owner: HTMLElement): void {
    closeAllPopups(owner);
    const p = new Popup('gallery gallery-fontsizes', owner);
    const cur = this.app.store.state.font.size;
    for (const s of [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72]) {
      const b = h(
        'button.font-item',
        { type: 'button', onclick: () => (closeAllPopups(), (this.app.tools.text as TextTool).applyFont({ size: s })) },
        String(s),
      );
      b.classList.toggle('is-checked', s === cur);
      p.el.append(b);
    }
    p.open();
    const r = owner.getBoundingClientRect();
    placePopup(p.el, r.left, r.bottom, { x: r.right, y: r.top });
  }

  // ---------------------------------------------------------------- Print preview

  private buildPreview(): HTMLElement {
    const print = this.group(
      t.ribbon.groups.print,
      { order: 3, icon: 'print', kt: 'ZP' },
      this.large('preview.print', 'P'),
      this.large('preview.pageSetup', 'S', { label: t.ribbon.pageSetup }),
    );
    const zoom = this.group(
      t.ribbon.groups.zoom,
      { order: 2, icon: 'zoomIn', kt: 'ZZ' },
      this.large('preview.zoomIn', 'I'),
      this.large('preview.zoomOut', 'O'),
      this.col(
        this.small('preview.onePage', '1', { toggle: true }),
        this.small('preview.twoPages', '2', { toggle: true }),
      ),
    );
    const nav = this.group(
      t.ribbon.groups.preview,
      { order: 1, icon: 'nextPage', kt: 'ZV' },
      this.large('preview.prev', 'V', { label: t.ribbon.prevPage }),
      this.large('preview.next', 'N', { label: t.ribbon.nextPage }),
    );
    const close = this.group('', null, this.large('preview.close', 'C', { label: t.ribbon.closePreview }));
    return h('div.rb-panel', { role: 'tabpanel', 'aria-label': t.ribbon.tabs.preview }, print, zoom, nav, close);
  }
}
