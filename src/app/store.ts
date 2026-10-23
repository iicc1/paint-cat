/** Minimal state store: `set` batches changes and notifies once per microtask. */
export type Listener<T> = (changed: ReadonlySet<keyof T>, state: Readonly<T>) => void;

export class Store<T extends object> {
  private current: T;
  private readonly listeners = new Set<Listener<T>>();
  private pending = new Set<keyof T>();
  private scheduled = false;

  constructor(initial: T) {
    this.current = initial;
  }

  get state(): Readonly<T> {
    return this.current;
  }

  set(patch: Partial<T>): void {
    let changed = false;
    for (const key of Object.keys(patch) as (keyof T)[]) {
      const value = patch[key] as T[keyof T];
      if (!Object.is(this.current[key], value)) {
        this.current = { ...this.current, [key]: value };
        this.pending.add(key);
        changed = true;
      }
    }
    if (changed && !this.scheduled) {
      this.scheduled = true;
      queueMicrotask(() => this.flush());
    }
  }

  /** Flushes pending changes right away (useful before measuring the DOM). */
  flush(): void {
    this.scheduled = false;
    if (this.pending.size === 0) return;
    const changed = this.pending;
    this.pending = new Set();
    for (const listener of this.listeners) listener(changed, this.current);
  }

  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
