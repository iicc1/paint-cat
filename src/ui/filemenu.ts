import type { App } from '../app/app';
import { t } from '../i18n';
import type { FileManager } from '../io/files';
import type { Commands } from './commands';
import { accessLabel, h, plainLabel, svg } from './dom';
import { icon } from './icons';
import { closeAllPopups, Popup } from './menu';

interface Sub {
  title: () => string;
  items: string[];
}

const SUBMENUS: Record<string, Sub> = {
  'file.saveAs': {
    title: () => t.fileMenu.saveAs,
    items: ['file.saveAsPng', 'file.saveAsJpg', 'file.saveAsBmp', 'file.saveAsGif', 'file.saveAsOther'],
  },
  'file.print': { title: () => t.fileMenu.print, items: ['file.print', 'file.pageSetup', 'file.printPreview'] },
  'file.wallpaper': {
    title: () => t.fileMenu.wallpaper,
    items: ['file.wallpaperFill', 'file.wallpaperTile', 'file.wallpaperCenter'],
  },
};

const LAYOUT: (string | '-')[] = [
  'file.new',
  'file.open',
  'file.save',
  'file.saveAs',
  '-',
  'file.print',
  'file.scanner',
  'file.email',
  '-',
  'file.wallpaper',
  '-',
  'file.properties',
  '-',
  'file.about',
  '-',
  'file.exit',
];

/** Paint's File menu: commands on the left and, on the right, recent pictures or the submenu. */
export function openFileMenu(app: App, commands: Commands, files: FileManager, owner: HTMLElement): void {
  closeAllPopups();
  const popup = new Popup('filemenu', owner);
  popup.el.setAttribute('role', 'menu');
  popup.el.tabIndex = -1;
  const head = h('button.filemenu-head', { type: 'button', onclick: () => popup.close() }, t.ribbon.file);
  const left = h('div.filemenu-left');
  const right = h('div.filemenu-right');
  const keys: { key: string | null; el: HTMLElement; run: () => void; sub?: string }[] = [];
  let openSub: string | null = null;
  let hoverTimer = 0;

  const run = (id: string): void => {
    const c = commands[id];
    if (!c || (c.enabled && !c.enabled())) return;
    popup.close();
    void c.run();
  };

  const showRecent = (): void => {
    openSub = null;
    left.querySelectorAll('.is-sub-open').forEach((e) => e.classList.remove('is-sub-open'));
    right.replaceChildren(h('div.filemenu-right-title', {}, t.fileMenu.recent));
    app.store.state.recent.forEach((r, i) => {
      const key = String(i + 1);
      const el = h(
        'button.filemenu-recent',
        { type: 'button', role: 'menuitem', title: r.name, onclick: () => (popup.close(), void files.openRecent(r)) },
        h('span.filemenu-recent-num', {}, h('u', {}, key)),
        h('span.filemenu-recent-name', {}, r.name),
      );
      right.append(el);
    });
  };

  const showSub = (id: string): void => {
    if (openSub === id) return;
    openSub = id;
    const sub = SUBMENUS[id];
    left.querySelectorAll('.is-sub-open').forEach((e) => e.classList.remove('is-sub-open'));
    left.querySelector(`[data-cmd="${id}"]`)?.classList.add('is-sub-open');
    right.replaceChildren(h('div.filemenu-right-title', {}, sub.title()));
    for (const sid of sub.items) {
      const c = commands[sid];
      const enabled = c.enabled?.() ?? true;
      const { node } = accessLabel(c.label);
      const el = h(
        'button.filemenu-subitem',
        { type: 'button', role: 'menuitem', disabled: !enabled, onclick: () => run(sid) },
        c.icon ? svg(icon(c.icon, 32)) : h('span.icon'),
        h(
          'span.filemenu-subtext',
          {},
          h('span.filemenu-subtitle', {}, node),
          c.desc ? h('span.filemenu-subdesc', {}, c.desc) : null,
        ),
      );
      right.append(el);
    }
  };

  for (const id of LAYOUT) {
    if (id === '-') {
      left.append(h('div.filemenu-sep'));
      continue;
    }
    const c = commands[id];
    const enabled = c.enabled?.() ?? true;
    const { node, key } = accessLabel(c.label);
    const hasSub = id in SUBMENUS;
    const main = h(
      'button.filemenu-item',
      {
        type: 'button',
        role: 'menuitem',
        disabled: !enabled,
        'data-cmd': id,
        title: c.desc ?? '',
        onclick: () => run(id),
      },
      svg(icon(c.icon ?? 'app', 32)),
      h('span.filemenu-label', {}, node),
    );
    main.addEventListener('pointerenter', () => {
      window.clearTimeout(hoverTimer);
      if (hasSub && enabled) hoverTimer = window.setTimeout(() => showSub(id), 400);
      else hoverTimer = window.setTimeout(showRecent, 400);
    });
    if (hasSub) {
      const arrow = h(
        'button.filemenu-arrow',
        {
          type: 'button',
          disabled: !enabled,
          'aria-label': t.fileMenu.moreOptions(plainLabel(c.label)),
          onclick: () => showSub(id),
        },
        svg(icon('submenu', 16)),
      );
      arrow.addEventListener('pointerenter', () => {
        window.clearTimeout(hoverTimer);
        if (enabled) showSub(id);
      });
      left.append(h('div.filemenu-split', { 'data-cmd': id }, main, arrow));
    } else {
      left.append(main);
    }
    keys.push({ key, el: main, run: () => (hasSub ? showSub(id) : run(id)), sub: hasSub ? id : undefined });
  }

  popup.el.append(head, h('div.filemenu-body', {}, left, right));
  popup.el.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      if (openSub) showRecent();
      else popup.close();
      return;
    }
    const k = e.key.toLowerCase();
    if (openSub) {
      const sub = SUBMENUS[openSub];
      const match = sub.items.find((sid) => accessLabel(commands[sid].label).key === k);
      if (match) {
        e.preventDefault();
        run(match);
      }
      return;
    }
    if (/^[1-9]$/.test(k)) {
      const r = app.store.state.recent[Number(k) - 1];
      if (r) {
        e.preventDefault();
        popup.close();
        void files.openRecent(r);
      }
      return;
    }
    const m = keys.find((x) => x.key === k && !(x.el as HTMLButtonElement).disabled);
    if (m) {
      e.preventDefault();
      m.run();
    }
  });
  showRecent();
  popup.open();
  const r = owner.getBoundingClientRect();
  popup.el.style.left = `${r.left}px`;
  popup.el.style.top = `${r.top}px`;
  popup.el.focus();
}
