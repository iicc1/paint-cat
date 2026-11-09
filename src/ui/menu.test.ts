import { afterEach, describe, expect, it } from 'vitest';
import { anyPopupOpen, closeAllPopups, closedPopup, Popup } from './menu';

/** A popup with a button inside that opens another popup (a collapsed ribbon group and its Rotate menu). */
function nested(): { group: Popup; inner: HTMLButtonElement; menu: Popup } {
  const group = new Popup('group');
  group.open();
  const inner = document.createElement('button');
  group.el.append(inner);
  const menu = new Popup('menu', inner);
  menu.open();
  return { group, inner, menu };
}

describe('popups', () => {
  afterEach(() => closeAllPopups());

  it('opening a popup from inside another one keeps the outer one open', () => {
    const { group, inner, menu } = nested();
    closeAllPopups(inner);
    expect(group.isOpen).toBe(true);
    expect(menu.isOpen).toBe(false);
    closeAllPopups();
    expect(anyPopupOpen()).toBe(false);
  });

  it('a press closes the popups above the one pressed', () => {
    const { group, menu } = nested();
    const spot = document.createElement('div');
    group.el.append(spot);
    spot.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(menu.isOpen).toBe(false);
    expect(group.isOpen).toBe(true);
  });

  it('a press outside closes them all and does nothing else', () => {
    const { group, menu } = nested();
    const outside = document.body.appendChild(document.createElement('div'));
    const e = new PointerEvent('pointerdown', { bubbles: true });
    outside.dispatchEvent(e);
    expect(group.isOpen).toBe(false);
    expect(menu.isOpen).toBe(false);
    expect(closedPopup(e)).toBe(true);
    const next = new PointerEvent('pointerdown', { bubbles: true });
    outside.dispatchEvent(next);
    expect(closedPopup(next)).toBe(false);
    outside.remove();
  });
});
