import type { Commands } from './commands';
import { accessLabel, h, placePopup, svg } from './dom';
import { icon, type IconName } from './icons';

export type MenuEntry =
  | { type: 'item'; cmd: string; label?: string; icon?: IconName | null; check?: boolean }
  | { type: 'separator' }
  | { type: 'header'; label: string }
  | { type: 'submenu'; label: string; icon?: IconName; items: MenuEntry[]; enabled?: () => boolean };

/** Stack of open popups (menus, galleries, File menu). */
const stack: Popup[] = [];

export class Popup {
  readonly el: HTMLElement;
  private closed = false;
  onClose: (() => void) | null = null;

  constructor(
    className: string,
    readonly owner: HTMLElement | null = null,
  ) {
    this.el = h('div', { class: `popup ${className}`, role: 'presentation' });
  }

  open(): void {
    document.body.append(this.el);
    stack.push(this);
    this.owner?.classList.add('is-open');
    this.owner?.setAttribute('aria-expanded', 'true');
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    // Also closes submenus open on top of it.
    const i = stack.indexOf(this);
    if (i >= 0) for (const p of stack.splice(i).toReversed()) if (p !== this) p.close();
    this.el.remove();
    this.owner?.classList.remove('is-open');
    this.owner?.setAttribute('aria-expanded', 'false');
    this.onClose?.();
  }

  get isOpen(): boolean {
    return !this.closed;
  }
}

export function closeAllPopups(): void {
  for (const p of stack.toReversed()) p.close();
}

export function topPopup(): Popup | undefined {
  return stack[stack.length - 1];
}

export function anyPopupOpen(): boolean {
  return stack.length > 0;
}

// Click outside any popup: close them all.
document.addEventListener(
  'pointerdown',
  (e) => {
    if (!stack.length) return;
    const t = e.target as Node;
    if (stack.some((p) => p.el.contains(t) || p.owner?.contains(t))) return;
    closeAllPopups();
  },
  true,
);
window.addEventListener('blur', () => closeAllPopups());
window.addEventListener('resize', () => closeAllPopups());

export interface MenuOptions {
  owner?: HTMLElement | null;
  className?: string;
  /** When a command runs (to close the File menu, etc.). */
  onRun?: () => void;
  /** Alternative coordinates if it does not fit (e.g. open upward). */
  alt?: { x: number; y: number };
  focusFirst?: boolean;
}

/** Drop-down menu with icons, check marks, headers, separators and submenus. */
export class Menu extends Popup {
  private items: { el: HTMLElement; entry: MenuEntry; key: string | null; enabled: boolean }[] = [];
  private index = -1;
  private sub: Menu | null = null;

  constructor(
    private readonly commands: Commands,
    entries: MenuEntry[],
    private readonly opts: MenuOptions = {},
  ) {
    super(`menu ${opts.className ?? ''}`, opts.owner ?? null);
    this.el.setAttribute('role', 'menu');
    this.el.tabIndex = -1;
    for (const entry of entries) this.add(entry);
    this.el.addEventListener('keydown', (e) => this.onKey(e));
  }

  show(x: number, y: number): this {
    this.open();
    placePopup(this.el, x, y, this.opts.alt);
    if (this.opts.focusFirst) this.move(1);
    this.el.focus({ preventScroll: true });
    return this;
  }

  private add(entry: MenuEntry): void {
    if (entry.type === 'separator') {
      this.el.append(h('div.menu-sep', { role: 'separator' }));
      return;
    }
    if (entry.type === 'header') {
      this.el.append(h('div.menu-header', { role: 'presentation' }, entry.label));
      return;
    }
    const cmd = entry.type === 'item' ? this.commands[entry.cmd] : null;
    const label = entry.type === 'item' ? (entry.label ?? cmd?.label ?? entry.cmd) : entry.label;
    const iconName = entry.type === 'item' ? (entry.icon === undefined ? cmd?.icon : entry.icon) : entry.icon;
    const enabled = entry.type === 'item' ? (cmd?.enabled?.() ?? true) : (entry.enabled?.() ?? true);
    const checked = entry.type === 'item' && entry.check && (cmd?.checked?.() ?? false);
    const { node, key } = accessLabel(label);
    const gutter = h('span.menu-gutter', {});
    if (checked) gutter.append(svg(icon('check', 16), 'menu-check'));
    else if (iconName) gutter.append(svg(icon(iconName, 16)));
    const el = h(
      'div.menu-item',
      {
        role: entry.type === 'item' && entry.check ? 'menuitemcheckbox' : 'menuitem',
        'aria-disabled': enabled ? null : 'true',
        'aria-checked': entry.type === 'item' && entry.check ? String(Boolean(checked)) : null,
        'aria-haspopup': entry.type === 'submenu' ? 'true' : null,
      },
      gutter,
      h('span.menu-label', {}, node),
      entry.type === 'submenu' ? svg(icon('submenu', 16), 'menu-arrow') : null,
    );
    if (!enabled) el.classList.add('is-disabled');
    const record = { el, entry, key, enabled };
    const idx = this.items.length;
    this.items.push(record);
    el.addEventListener('pointerenter', () => {
      this.highlight(idx);
      if (entry.type === 'submenu' && enabled) this.openSub(idx);
      else this.closeSub();
    });
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.activate(idx);
    });
    this.el.append(el);
  }

  private highlight(i: number): void {
    this.items[this.index]?.el.classList.remove('is-active');
    this.index = i;
    this.items[i]?.el.classList.add('is-active');
  }

  private move(dir: 1 | -1): void {
    const n = this.items.length;
    if (!n) return;
    let i = this.index;
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (this.items[i].enabled) break;
    }
    this.highlight(i);
  }

  private openSub(i: number): void {
    const item = this.items[i];
    if (item.entry.type !== 'submenu') return;
    if (this.sub?.isOpen && this.sub.owner === item.el) return;
    this.closeSub();
    const r = item.el.getBoundingClientRect();
    this.sub = new Menu(this.commands, item.entry.items, {
      owner: item.el,
      onRun: this.opts.onRun ?? (() => this.close()),
      alt: { x: r.left, y: r.bottom },
    });
    this.sub.show(r.right - 2, r.top - 3);
  }

  private closeSub(): void {
    this.sub?.close();
    this.sub = null;
  }

  private activate(i: number): void {
    const item = this.items[i];
    if (!item?.enabled) return;
    if (item.entry.type === 'submenu') {
      this.openSub(i);
      this.sub?.move(1);
      return;
    }
    if (item.entry.type !== 'item') return;
    const cmd = this.commands[item.entry.cmd];
    closeAllPopups();
    this.opts.onRun?.();
    void cmd?.run();
  }

  private onKey(e: KeyboardEvent): void {
    if (this.sub?.isOpen) return;
    e.stopPropagation();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        return this.move(1);
      case 'ArrowUp':
        e.preventDefault();
        return this.move(-1);
      case 'ArrowRight':
        e.preventDefault();
        if (this.items[this.index]?.entry.type === 'submenu') this.activate(this.index);
        return;
      case 'ArrowLeft':
      case 'Escape':
        e.preventDefault();
        this.close();
        (this.owner as HTMLElement | null)?.closest<HTMLElement>('.popup')?.focus();
        return;
      case 'Enter':
      case ' ':
        e.preventDefault();
        return this.activate(this.index);
      default: {
        const k = e.key.toLowerCase();
        const matches = this.items.map((it, i) => ({ it, i })).filter(({ it }) => it.enabled && it.key === k);
        if (matches.length === 1) {
          e.preventDefault();
          this.activate(matches[0].i);
        } else if (matches.length > 1) {
          e.preventDefault();
          const next = matches.find(({ i }) => i > this.index) ?? matches[0];
          this.highlight(next.i);
        }
      }
    }
  }
}

/** Opens a menu below a ribbon button. */
export function dropMenu(commands: Commands, owner: HTMLElement, entries: MenuEntry[], className = ''): Menu {
  closeAllPopups();
  const r = owner.getBoundingClientRect();
  return new Menu(commands, entries, { owner, className, alt: { x: r.right, y: r.top } }).show(r.left, r.bottom);
}
