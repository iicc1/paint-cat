import { APP_NAME, t } from '../i18n';
import { h } from './dom';

export interface DialogButton<T> {
  label: string;
  value: T;
  default?: boolean;
  cancel?: boolean;
}

export interface DialogOptions<T> {
  title: string;
  body: HTMLElement;
  buttons: DialogButton<T>[];
  className?: string;
  /** Validation before closing with a non-cancel button. Return false to prevent it. */
  validate?: (value: T) => boolean;
  /** Element that receives focus on open. */
  focus?: HTMLElement;
}

let openCount = 0;

export function isDialogOpen(): boolean {
  return openCount > 0;
}

/**
 * Windows 10 style modal dialog: white title bar with a Close button, gray body and buttons at the
 * bottom right. Enter = default button, Esc = cancel. It can be dragged.
 */
export function showDialog<T>(opts: DialogOptions<T>): Promise<T | null> {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const cancelValue = opts.buttons.find((b) => b.cancel)?.value ?? null;
    const titleId = `dlg-title-${Math.random().toString(36).slice(2)}`;
    const close = (value: T | null, validate: boolean): void => {
      if (validate && value !== null && opts.validate && !opts.validate(value)) return;
      overlay.remove();
      openCount--;
      document.removeEventListener('keydown', onKey, true);
      previousFocus?.focus?.();
      resolve(value);
    };
    const buttons = opts.buttons.map((b) =>
      h(
        'button.dlg-button',
        {
          type: 'button',
          class: b.default ? 'is-default' : '',
          onclick: () => close(b.cancel ? cancelValue : b.value, !b.cancel),
        },
        b.label,
      ),
    );
    const closeBtn = h(
      'button.dlg-close',
      { type: 'button', 'aria-label': t.dialog.close, title: t.dialog.close, onclick: () => close(cancelValue, false) },
      '✕',
    );
    const titleBar = h('div.dlg-titlebar', {}, h('span.dlg-title', { id: titleId }, opts.title), closeBtn);
    const dialog = h(
      'div.dialog',
      { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, class: opts.className ?? '' },
      titleBar,
      h('div.dlg-body', {}, opts.body),
      h('div.dlg-buttons', {}, ...buttons),
    );
    const overlay = h('div.dlg-overlay', {}, dialog);

    const onKey = (e: KeyboardEvent): void => {
      if (!overlay.isConnected) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(cancelValue, false);
      } else if (
        e.key === 'Enter' &&
        !(e.target instanceof HTMLButtonElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        const def = opts.buttons.find((b) => b.default);
        if (def) {
          e.preventDefault();
          e.stopPropagation();
          close(def.value, true);
        }
      } else if (e.key === 'Tab') {
        // Keeps focus inside the dialog.
        const focusables = [
          ...dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex="0"]'),
        ].filter((el) => !(el as HTMLInputElement).disabled && el.offsetParent !== null);
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      } else {
        e.stopPropagation();
      }
    };
    document.addEventListener('keydown', onKey, true);

    // Drag by the title bar.
    titleBar.addEventListener('pointerdown', (e) => {
      if (e.target === closeBtn) return;
      const r = dialog.getBoundingClientRect();
      const dx = e.clientX - r.left;
      const dy = e.clientY - r.top;
      titleBar.setPointerCapture(e.pointerId);
      const moveTo = (ev: PointerEvent): void => {
        dialog.style.position = 'fixed';
        dialog.style.margin = '0';
        dialog.style.left = `${Math.min(Math.max(0, ev.clientX - dx), window.innerWidth - 40)}px`;
        dialog.style.top = `${Math.min(Math.max(0, ev.clientY - dy), window.innerHeight - 30)}px`;
      };
      const stop = (): void => {
        titleBar.removeEventListener('pointermove', moveTo);
        titleBar.removeEventListener('pointerup', stop);
      };
      titleBar.addEventListener('pointermove', moveTo);
      titleBar.addEventListener('pointerup', stop);
    });

    openCount++;
    document.body.append(overlay);
    const focusTarget = opts.focus ?? buttons[opts.buttons.findIndex((b) => b.default)] ?? buttons[0];
    requestAnimationFrame(() => {
      focusTarget?.focus();
      if (focusTarget instanceof HTMLInputElement) focusTarget.select();
    });
  });
}

/** Simple message with an OK button. */
export async function alertDialog(
  title: string,
  message: string,
  icon: 'info' | 'warning' | 'error' = 'info',
): Promise<void> {
  const body = h(
    'div.dlg-message',
    {},
    h('span.dlg-msg-icon', { class: `is-${icon}`, 'aria-hidden': 'true' }),
    h('p', {}, message),
  );
  await showDialog({ title, body, buttons: [{ label: t.dialog.ok, value: true, default: true, cancel: true }] });
}

/** "Do you want to save changes to X?" → 'save' | 'discard' | null (Cancel). */
export function confirmSaveDialog(name: string): Promise<'save' | 'discard' | null> {
  const body = h('div.dlg-message.is-instruction', {}, h('p', {}, t.dialog.saveChanges(name)));
  return showDialog<'save' | 'discard' | 'cancel'>({
    title: APP_NAME,
    body,
    className: 'dlg-taskdialog',
    buttons: [
      { label: t.dialog.save, value: 'save', default: true },
      { label: t.dialog.dontSave, value: 'discard' },
      { label: t.dialog.cancel, value: 'cancel', cancel: true },
    ],
  }).then((v) => (v === 'cancel' || v === null ? null : v));
}

/** Numeric dialog field with a label and access key. */
export function numberField(
  label: string,
  value: number,
  opts: { min?: number; max?: number; step?: number; width?: number } = {},
): {
  row: HTMLElement;
  input: HTMLInputElement;
} {
  const input = h('input.dlg-input', {
    type: 'number',
    value: String(value),
    min: opts.min !== undefined ? String(opts.min) : undefined,
    max: opts.max !== undefined ? String(opts.max) : undefined,
    step: String(opts.step ?? 1),
    inputMode: 'decimal',
  });
  if (opts.width) input.style.width = `${opts.width}px`;
  const id = `f-${Math.random().toString(36).slice(2)}`;
  input.id = id;
  const row = h('div.dlg-field', {}, h('label', { htmlFor: id }, label), input);
  return { row, input };
}
