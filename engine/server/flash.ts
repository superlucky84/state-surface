import { flashKey, type SecretSource } from './secrets.js';
import type { FieldErrors } from '../shared/schema.js';

/**
 * One-time result of a JS-less form submission (DC-22 ③, DESIGN 10.5). The action endpoint
 * signs it (HMAC, IC-09 flash key) into a short-lived cookie; the page reads it once with
 * `ctx.flash(name)` after the 303 redirect.
 */
export interface Flash {
  ok: boolean;
  error?: { message: string; kind: 'validation' | 'server'; fieldErrors?: FieldErrors };
  /** Only fields listed in the transition's `flash.input`; never file values. */
  input?: Record<string, unknown>;
}

export const FLASH_COOKIE = 'surface_flash';
const encoder = new TextEncoder();

function base64url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64url(text: string) {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('Invalid flash encoding');
  return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), char =>
    char.charCodeAt(0)
  );
}

async function sign(secret: string, data: string) {
  const signature = await crypto.subtle.sign('HMAC', await flashKey(secret), encoder.encode(data));
  return base64url(new Uint8Array(signature));
}

/**
 * Seal a flash for `name` within `limit` characters: drop the echoed input first, then the
 * field errors (keeping the error summary). Returns the cookie value and what was dropped.
 */
export async function sealFlash(
  secrets: SecretSource,
  name: string,
  flash: Flash,
  limit: number
): Promise<{ value: string; trimmed: Array<'input' | 'fieldErrors'> }> {
  const trimmed: Array<'input' | 'fieldErrors'> = [];
  let current: Flash = flash;
  while (true) {
    const data = base64url(encoder.encode(JSON.stringify({ n: name, ...current })));
    const value = `${data}.${await sign(secrets.current, data)}`;
    if (FLASH_COOKIE.length + 1 + value.length <= limit) return { value, trimmed };
    if (current.input) {
      const { input: _input, ...rest } = current;
      current = rest;
      trimmed.push('input');
    } else if (current.error?.fieldErrors) {
      const { fieldErrors: _fields, ...error } = current.error;
      current = { ...current, error };
      trimmed.push('fieldErrors');
    } else return { value, trimmed };
  }
}

/** Verify a flash cookie value with the current or previous secret. */
export async function openFlash(
  secrets: SecretSource,
  value: string
): Promise<(Flash & { n: string }) | undefined> {
  const dot = value.indexOf('.');
  if (dot < 1) return undefined;
  const data = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  for (const secret of [secrets.current, secrets.previous]) {
    if (!secret) continue;
    try {
      const valid = await crypto.subtle.verify(
        'HMAC',
        await flashKey(secret),
        fromBase64url(signature),
        encoder.encode(data)
      );
      if (valid) return JSON.parse(new TextDecoder().decode(fromBase64url(data)));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * `_redirect` must be a path inside BASE_PATH on this origin (no `//`, `/\`, scheme); else a
 * same-origin `Referer` inside BASE_PATH; else the BASE_PATH root (DESIGN 10.5, open redirect).
 */
export function redirectTarget(
  requested: unknown,
  referer: string | null,
  origin: string,
  basePath: string
): string {
  const inside = (path: string) =>
    !basePath ||
    path === basePath ||
    path.startsWith(basePath + '/') ||
    path.startsWith(basePath + '?');
  if (
    typeof requested === 'string' &&
    requested.startsWith('/') &&
    !requested.startsWith('//') &&
    !requested.startsWith('/\\') &&
    !/[\u0000-\u001f\\]/.test(requested) &&
    inside(requested)
  )
    return requested;
  if (referer)
    try {
      const url = new URL(referer);
      if (url.origin === origin && inside(url.pathname)) return url.pathname + url.search;
    } catch {
      /* not a URL */
    }
  return basePath ? `${basePath}/` : '/';
}
