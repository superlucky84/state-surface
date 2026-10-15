import type { SurfaceContext } from 'state-surface/server';
export type Lang = 'ko' | 'en';
export function getLang(ctx: SurfaceContext): Lang {
  const value = ctx.cookies.get('lang');
  return isValidLang(value) ? value : 'en';
}
export function isValidLang(value: unknown): value is Lang {
  return value === 'en' || value === 'ko';
}
