import { h } from './dom';
import { anyPopupOpen } from './menu';

export interface TipContent {
  title: string;
  desc?: string;
}

/**
 * Rich ribbon tooltips: bold title and description, below the ribbon and aligned with the
 * control, after ~1 s of hovering (as in Windows 10).
 */
export class Tooltips {
  private readonly el = h('div.tooltip', { role: 'tooltip' });
  private timer = 0;
  private current: HTMLElement | null = null;
  private readonly content = new WeakMap<HTMLElement, () => TipContent | null>();

  constructor(private readonly anchorBottom: () => number) {
    document.body.append(this.el);
    this.el.hidden = true;
    document.addEventListener('pointerdown', () => this.hide(), true);
    document.addEventListener('keydown', () => this.hide(), true);
  }

  attach(target: HTMLElement, content: () => TipContent | null): void {
    this.content.set(target, content);
    target.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') return;
      this.schedule(target);
    });
    target.addEventListener('pointerleave', () => {
      if (this.current === target) this.hide();
      window.clearTimeout(this.timer);
    });
  }

  private schedule(target: HTMLElement): void {
    window.clearTimeout(this.timer);
    const wasVisible = !this.el.hidden;
    this.timer = window.setTimeout(() => this.show(target), wasVisible ? 80 : 900);
  }

  private show(target: HTMLElement): void {
    if (anyPopupOpen() || !target.isConnected) return;
    const c = this.content.get(target)?.();
    if (!c) return;
    this.current = target;
    this.el.replaceChildren(h('div.tooltip-title', {}, c.title), c.desc ? h('div.tooltip-desc', {}, c.desc) : '');
    this.el.classList.toggle('has-desc', Boolean(c.desc));
    this.el.hidden = false;
    const r = target.getBoundingClientRect();
    const top = Math.max(this.anchorBottom(), r.bottom) + 1;
    const w = this.el.offsetWidth;
    const left = Math.min(r.left, window.innerWidth - w - 4);
    this.el.style.left = `${Math.max(2, left)}px`;
    this.el.style.top = `${top + this.el.offsetHeight > window.innerHeight ? r.top - this.el.offsetHeight - 2 : top}px`;
  }

  hide(): void {
    window.clearTimeout(this.timer);
    this.el.hidden = true;
    this.current = null;
  }
}
