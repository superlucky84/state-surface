/**
 * Language paths (DC-24 ⑤, DESIGN 10.7): `routes/[lang]/…` serve `/en/…`, `/ko/…`. A path
 * without a language redirects to one (cookie → Accept-Language → default); `?lang=xx`
 * switches and remembers the choice. Pages get `ctx.i18n` and hreflang alternates.
 */

export interface I18nConfig {
  locales: readonly string[];
  defaultLocale: string;
}

/** `ctx.i18n` on pages under `routes/[lang]/`. */
export interface I18nContext {
  /** The page's language (the `[lang]` param). */
  lang: string;
  locales: readonly string[];
  defaultLocale: string;
  /** This page's path without BASE_PATH and language: `/guide/intro` (`/` for the index). */
  path: string;
  /** This page in `lang`: `{BASE_PATH}/ko/guide/intro`. */
  href(lang: string): string;
  /** The language-less URL `{BASE_PATH}/guide/intro`: redirects to the visitor's language. */
  neutralHref: string;
  /** A link that switches to `lang` and remembers it (`?lang=ko`, then a redirect). */
  switchHref(lang: string): string;
}

export const LANG_COOKIE = 'lang';
const LOCALE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

export function checkI18n(config: I18nConfig) {
  if (!Array.isArray(config.locales) || !config.locales.length)
    throw new Error('i18n.locales must list at least one locale');
  for (const locale of config.locales)
    if (typeof locale !== 'string' || !LOCALE.test(locale))
      throw new Error(`i18n locale "${String(locale)}" must look like "en" or "pt-BR"`);
  if (!config.locales.includes(config.defaultLocale))
    throw new Error(`i18n.defaultLocale "${config.defaultLocale}" is not in i18n.locales`);
}

/** Routes whose first segment is `[lang]`. */
export const isLangPattern = (pattern: string) =>
  pattern === '/:lang' || pattern.startsWith('/:lang/');

/** Best locale for an `Accept-Language` header (exact tag, then primary subtag). */
export function negotiate(header: string | null, locales: readonly string[]) {
  if (!header) return undefined;
  const ranked = header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map(p => p.trim()).find(p => p.startsWith('q='));
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q.slice(2)) : 1, index };
    })
    .filter(item => item.tag && item.tag !== '*' && Number.isFinite(item.q) && item.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  const lower = locales.map(locale => locale.toLowerCase());
  for (const { tag } of ranked) {
    const exact = lower.indexOf(tag);
    if (exact >= 0) return locales[exact];
    const primary = tag.split('-')[0];
    const near = lower.findIndex(locale => locale.split('-')[0] === primary);
    if (near >= 0) return locales[near];
  }
  return undefined;
}

/** Whether a request only prefetches (no side effects such as remembering a language). */
export const isPrefetch = (request: Request) =>
  /prefetch|prerender/i.test(
    `${request.headers.get('purpose') ?? ''} ${request.headers.get('sec-purpose') ?? ''}`
  );

export function i18nContext(
  config: I18nConfig,
  lang: string,
  rest: readonly string[],
  basePath: string
): I18nContext {
  const path = '/' + rest.map(encodeURIComponent).join('/');
  const href = (locale: string) => `${basePath}/${locale}${path === '/' ? '' : path}`;
  return {
    lang,
    locales: config.locales,
    defaultLocale: config.defaultLocale,
    path,
    href,
    neutralHref: `${basePath}${path}`,
    switchHref: locale => `${href(locale)}?${LANG_COOKIE}=${encodeURIComponent(locale)}`,
  };
}

/** `<link rel="alternate" hreflang>` for every locale plus `x-default` (language-less). */
export function alternates(i18n: I18nContext, origin: string) {
  return [
    ...i18n.locales.map(locale => ({ hreflang: locale, href: origin + i18n.href(locale) })),
    { hreflang: 'x-default', href: origin + i18n.neutralHref },
  ];
}
