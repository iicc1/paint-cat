import type { App } from '../app/app';
import { lang } from '../i18n';
import { isEditable } from '../io/clipboard';
import type { TextTool } from '../tools/text';
import { accel, accels, MAC_ACCEL, type Accel } from './accel';
import { stepSize, type Commands } from './commands';
import { isDialogOpen } from './dialog';
import { h } from './dom';
import { anyPopupOpen, closeAllPopups } from './menu';

interface Shortcut {
  key: string; // e.key in lowercase or a special code
  ctrl?: boolean; // Ctrl (Windows/Linux, and on Mac too)
  meta?: boolean; // ⌘ (Mac)
  shift?: boolean;
  alt?: boolean;
  cmd: string | (() => void);
}

/**
 * Shortcuts for the active language (in Spanish Ctrl+A opens, Ctrl+G saves, Ctrl+E selects all, F4 redoes…),
 * the ⌘ equivalents a Mac user expects, and the classic Windows alternatives.
 */
function shortcuts(app: App): Shortcut[] {
  const size = (d: 1 | -1) => () => stepSize(app, d);
  const toShortcut =
    (meta: boolean) =>
    ([cmd, a]: [string, Accel]): Shortcut => ({
      key: a.key,
      ctrl: !meta && a.ctrl,
      meta: meta && a.ctrl,
      shift: a.shift,
      cmd,
    });
  return [
    // Bold, italic and underline only act inside the text box (see below).
    ...accels()
      .filter(([cmd]) => !cmd.startsWith('text.'))
      .map(toShortcut(false)),
    ...Object.entries(MAC_ACCEL).map(toShortcut(true)),
    { key: 'o', ctrl: true, cmd: 'file.open' },
    { key: 's', ctrl: true, cmd: 'file.save' },
    { key: 's', ctrl: true, shift: true, cmd: 'file.saveAs' },
    { key: 'y', meta: true, cmd: 'edit.redo' },
    { key: 'backspace', alt: true, cmd: 'edit.undo' },
    { key: 'delete', shift: true, cmd: 'edit.cut' },
    { key: 'insert', ctrl: true, cmd: 'edit.copy' },
    { key: 'backspace', cmd: 'edit.delete' },
    { key: 'add', ctrl: true, cmd: size(1) },
    { key: 'subtract', ctrl: true, cmd: size(-1) },
    { key: '+', ctrl: true, cmd: size(1) },
    { key: '=', ctrl: true, cmd: size(1) },
    { key: '-', ctrl: true, cmd: size(-1) },
    { key: '+', meta: true, cmd: size(1) },
    { key: '=', meta: true, cmd: size(1) },
    { key: '-', meta: true, cmd: size(-1) },
  ];
}

function keyName(e: KeyboardEvent): string {
  if (e.code === 'NumpadAdd') return 'add';
  if (e.code === 'NumpadSubtract') return 'subtract';
  return e.key.toLowerCase();
}

export function bindKeyboard(app: App, commands: Commands, keytips: KeyTips): void {
  // Shortcuts change with the language: they are recomputed when it changes.
  let list = shortcuts(app);
  let listLang = lang;
  const runCmd = (cmd: string | (() => void)): void => {
    if (typeof cmd === 'function') return cmd();
    const c = commands[cmd];
    if (c && (c.enabled?.() ?? true)) void c.run();
  };

  document.addEventListener('keydown', (e) => {
    if (isDialogOpen() || e.defaultPrevented) return;
    if (keytips.active) return keytips.onKey(e);
    if (anyPopupOpen()) {
      if (e.key === 'Escape') closeAllPopups();
      return;
    }
    const st = app.store.state;
    const key = keyName(e);
    const editing = isEditable(e.target);

    if (editing) {
      // Inside the text box only formatting and "Select all" are intercepted.
      if (!st.textEditing) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.shiftKey && !e.altKey && ['b', 'i', 'u'].includes(key)) {
        e.preventDefault();
        (app.tools.text as TextTool).toggle(key === 'b' ? 'bold' : key === 'i' ? 'italic' : 'underline');
      } else if ((e.ctrlKey && !e.shiftKey && key === accel('edit.selectAll')?.key) || (e.metaKey && key === 'a')) {
        e.preventDefault();
        document.execCommand('selectAll');
      }
      return;
    }

    if (st.fullscreen) return;
    if (key === 'escape') {
      if (app.cancelLive()) e.preventDefault();
      return;
    }
    if (app.tool.key?.(e)) {
      e.preventDefault();
      return;
    }
    // Ctrl+V / ⌘V / Shift+Insert: let it through so the browser's "paste" event fires.
    if ((key === 'v' && (e.ctrlKey || e.metaKey)) || (key === 'insert' && e.shiftKey)) return;

    if (listLang !== lang) {
      list = shortcuts(app);
      listLang = lang;
    }
    const match = list.find(
      (s) =>
        s.key === key &&
        Boolean(s.ctrl) === e.ctrlKey &&
        Boolean(s.meta) === e.metaKey &&
        Boolean(s.shift) === e.shiftKey &&
        Boolean(s.alt) === e.altKey,
    );
    if (match) {
      e.preventDefault();
      runCmd(match.cmd);
    }
  });

  // Alt (or Option) pressed and released on its own: ribbon KeyTips. F10 too.
  let altAlone = false;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Alt') altAlone = !e.repeat;
    else altAlone = false;
    if (e.key === 'F10' && !isDialogOpen() && !keytips.active) {
      e.preventDefault();
      keytips.show();
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.key !== 'Alt' || !altAlone) return;
    altAlone = false;
    if (isDialogOpen() || isEditable(e.target) || anyPopupOpen()) return;
    e.preventDefault();
    if (keytips.active) keytips.hide();
    else keytips.show();
  });
  document.addEventListener('pointerdown', () => {
    altAlone = false;
    if (keytips.active) keytips.hide();
  });
}

/** Ribbon keyboard access labels (KeyTips), as when pressing Alt in Paint. */
export class KeyTips {
  active = false;
  private layer = h('div.keytips', { 'aria-hidden': 'true' });
  private scope: HTMLElement | null = null;
  private buffer = '';
  private targets: { kt: string; el: HTMLElement; badge: HTMLElement }[] = [];

  constructor(
    private readonly app: App,
    private readonly roots: { top: () => HTMLElement[]; panel: () => HTMLElement | null },
  ) {
    document.body.append(this.layer);
  }

  show(scope: HTMLElement | null = null): void {
    this.active = true;
    this.scope = scope;
    this.buffer = '';
    this.render();
  }

  hide(): void {
    this.active = false;
    this.scope = null;
    this.layer.replaceChildren();
  }

  onKey(e: KeyboardEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      if (this.scope) this.show(null);
      else this.hide();
      return;
    }
    if (e.key === 'Alt' || e.key.length !== 1) return;
    this.buffer += e.key.toUpperCase();
    const matches = this.targets.filter((t) => t.kt.startsWith(this.buffer));
    if (!matches.length) {
      this.buffer = '';
      return this.render();
    }
    const exact = matches.find((t) => t.kt === this.buffer);
    if (exact && matches.length === 1) return this.activate(exact.el);
    for (const t of this.targets) t.badge.classList.toggle('is-dim', !t.kt.startsWith(this.buffer));
  }

  private activate(el: HTMLElement): void {
    const tab = el.dataset.tab;
    if (tab) {
      el.click();
      this.app.store.flush();
      requestAnimationFrame(() => this.show(this.roots.panel()));
      return;
    }
    this.hide();
    if (el instanceof HTMLLabelElement) el.querySelector('input')?.click();
    else if (el.classList.contains('rb-combo')) el.querySelector('input')?.focus();
    else el.click();
  }

  private render(): void {
    this.layer.replaceChildren();
    const els = this.scope ? [...this.scope.querySelectorAll<HTMLElement>('[data-kt]')] : this.roots.top();
    this.targets = [];
    for (const el of els) {
      const kt = el.dataset.kt;
      if (!kt || el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      const badge = h('span.keytip', {}, kt);
      const disabled = (el as HTMLButtonElement).disabled || el.classList.contains('is-disabled');
      if (disabled) badge.classList.add('is-disabled');
      badge.style.left = `${Math.round(r.left + r.width / 2)}px`;
      badge.style.top = `${Math.round(this.scope ? r.bottom - 8 : r.bottom - 6)}px`;
      this.layer.append(badge);
      this.targets.push({ kt, el, badge });
    }
  }
}
