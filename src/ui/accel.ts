import { lang, t, type Lang } from '../i18n';

/** Keyboard shortcut: `key` is `e.key` in lowercase (or 'pageup', 'f12'…). */
export interface Accel {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
}

const ctrl = (key: string, shift = false): Accel => ({ key, ctrl: true, shift });

/** Shortcuts that are the same in every Paint language. */
const COMMON: Record<string, Accel> = {
  'file.new': ctrl('n'),
  'file.saveAs': { key: 'f12' },
  'file.print': ctrl('p'),
  'edit.undo': ctrl('z'),
  'edit.cut': ctrl('x'),
  'edit.copy': ctrl('c'),
  'edit.paste': ctrl('v'),
  'edit.delete': { key: 'delete' },
  'edit.crop': ctrl('x', true),
  'edit.resize': ctrl('w'),
  'edit.invertColor': ctrl('i', true),
  'view.rulers': ctrl('r'),
  'view.zoomIn': ctrl('pageup'),
  'view.zoomOut': ctrl('pagedown'),
  'view.fullscreen': { key: 'f11' },
  'text.bold': ctrl('b'),
  'text.italic': ctrl('i'),
  'text.underline': ctrl('u'),
  help: { key: 'f1' },
};

/** Localized shortcuts (the RT_ACCELERATOR table of each mspaint.exe.mui). */
const LOCAL: Record<Lang, Record<string, Accel>> = {
  es: {
    'file.open': ctrl('a'),
    'file.save': ctrl('g'),
    'file.properties': ctrl('e', true),
    'edit.redo': { key: 'f4' },
    'edit.selectAll': ctrl('e'),
    'view.grid': ctrl('d'),
  },
  en: {
    'file.open': ctrl('o'),
    'file.save': ctrl('s'),
    'file.properties': ctrl('e'),
    'edit.redo': ctrl('y'),
    'edit.selectAll': ctrl('a'),
    'view.grid': ctrl('g'),
  },
  ca: {
    'file.open': ctrl('o'),
    'file.save': ctrl('s'),
    'file.properties': ctrl('e'),
    'edit.redo': ctrl('y'),
    'edit.selectAll': ctrl('a'),
    'view.grid': ctrl('g'),
  },
};

/** ⌘ equivalents a Mac user expects (`ctrl` means ⌘ here), the same in every language. */
export const MAC_ACCEL: Record<string, Accel> = {
  'file.new': ctrl('n'),
  'file.open': ctrl('o'),
  'file.save': ctrl('s'),
  'file.saveAs': ctrl('s', true),
  'file.print': ctrl('p'),
  'file.properties': ctrl('e', true),
  'edit.undo': ctrl('z'),
  'edit.redo': ctrl('z', true),
  'edit.cut': ctrl('x'),
  'edit.copy': ctrl('c'),
  'edit.paste': ctrl('v'),
  'edit.selectAll': ctrl('a'),
  'edit.crop': ctrl('x', true),
  'edit.invertColor': ctrl('i', true),
};

export function accel(cmd: string, l: Lang = lang): Accel | undefined {
  return LOCAL[l][cmd] ?? COMMON[cmd];
}

/** All command shortcuts for the language (localized ones first). */
export function accels(l: Lang = lang): [string, Accel][] {
  return [...Object.entries(LOCAL[l]), ...Object.entries(COMMON)];
}

const KEY_LABELS: Record<string, () => string> = {
  delete: () => t.keys.delete,
  pageup: () => t.keys.pageUp,
  pagedown: () => t.keys.pageDown,
};

/** Shortcut text as Paint displays it: "Ctrl+Shift+E", "Ctrl+Page Up", "F4". */
export function formatAccel(a: Accel): string {
  const key = KEY_LABELS[a.key]?.() ?? a.key.toUpperCase();
  return [a.ctrl ? t.keys.ctrl : '', a.shift ? t.keys.shift : '', key].filter(Boolean).join('+');
}

/** Mac shortcut with its symbols: "⌘⇧X". */
export function formatMacAccel(a: Accel): string {
  return `${a.ctrl ? '⌘' : ''}${a.shift ? '⇧' : ''}${a.key.toUpperCase()}`;
}

export function shortcutText(cmd: string): string | undefined {
  const a = accel(cmd);
  return a ? formatAccel(a) : undefined;
}
