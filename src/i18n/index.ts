import { ca } from './ca';
import { en } from './en';
import { es, type Messages } from './es';

export type { CommandText, Messages } from './es';
export type Lang = 'ca' | 'en' | 'es';

export const APP_NAME = 'paint.cat';
export const REPO_URL = 'https://github.com/iicc1/paint-cat';

const CATALOGS: Record<Lang, Messages> = { ca, en, es };

/** Languages in selector order; each one is shown by its own name. */
export const LANGS: readonly Lang[] = ['ca', 'en', 'es'];

export function langName(l: Lang): string {
  return CATALOGS[l].langName;
}

/** Texts of the active language. A live binding: after `setLang` every module sees the new catalog. */
export let t: Messages = en;
export let lang: Lang = 'en';

/** Browser languages whose speakers are best served by one of the available ones. */
const NEAREST: Record<string, Lang> = {
  ca: 'ca',
  oc: 'ca',
  es: 'es',
  gl: 'es',
  eu: 'es',
  ast: 'es',
  an: 'es',
  en: 'en',
};

/** First preferred browser language that is available (or a close one); otherwise English. */
export function detectLang(preferred: readonly string[] = navigator.languages ?? [navigator.language]): Lang {
  for (const tag of preferred) {
    const match = NEAREST[tag.toLowerCase().split('-')[0]];
    if (match) return match;
  }
  return 'en';
}

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && value in CATALOGS;
}

export function setLang(l: Lang): void {
  lang = l;
  t = CATALOGS[l];
  document.documentElement.lang = l;
  document.querySelector('meta[name="description"]')?.setAttribute('content', t.meta.description);
}

/** Number with the language's decimal separator. */
export function decimal(n: number, digits: number): string {
  return n.toFixed(digits).replace('.', t.decimal);
}
