import type { SurfaceContext } from 'state-surface/server';
import { prefixPath } from 'state-surface';
import { DEFAULT_LOCALE, LOCALES } from './locales.js';

/**
 * Demo languages are URL paths (`/en/…`, `/ko/…`, DC-24 ⑤): pages read `ctx.i18n.lang`,
 * transitions get the page's language as a `lang` param.
 */
export type Lang = (typeof LOCALES)[number];

export function isValidLang(value: unknown): value is Lang {
  return (LOCALES as readonly unknown[]).includes(value);
}

/** The language of a page under `routes/[lang]/`. */
export function pageLang(ctx: SurfaceContext): Lang {
  const lang = ctx.i18n?.lang;
  return isValidLang(lang) ? lang : DEFAULT_LOCALE;
}

/** The language a transition was called with (the page's `lang` param). */
export function paramLang(params: { lang?: unknown }): Lang {
  return isValidLang(params.lang) ? params.lang : DEFAULT_LOCALE;
}

/** A page path in a language: `localPath('ko', '/guide/surface')` → `{BASE_PATH}/ko/guide/surface`. */
export function localPath(lang: string, path: string): string {
  return prefixPath(`/${lang}${path === '/' ? '' : path}`);
}
