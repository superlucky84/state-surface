export type Lang = 'ko' | 'en';

const VALID_LANGS: readonly Lang[] = ['ko', 'en'];

/**
 * Extract language from Express request cookie.
 * Falls back to 'en' if no cookie or invalid value.
 */
export function getLang(req: { headers?: Record<string, string | string[] | undefined> }): Lang {
  const cookie = req.headers?.cookie;
  if (!cookie || typeof cookie !== 'string') return 'en';

  const match = cookie.match(/(?:^|;\s*)lang=(ko|en)(?:;|$)/);
  return match ? (match[1] as Lang) : 'en';
}

export function isValidLang(value: unknown): value is Lang {
  return typeof value === 'string' && VALID_LANGS.includes(value as Lang);
}

export function langCookie(lang: Lang): string {
  return `lang=${lang}; Path=/; SameSite=Lax; Max-Age=31536000`;
}
