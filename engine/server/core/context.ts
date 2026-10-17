import type { Logger } from '../logger.js';
import type { StateFrame } from '../../shared/protocol.js';
import type { Flash } from '../flash.js';
import type { I18nContext } from '../i18n.js';

declare global {
  namespace App {
    interface Locals {}
  }
}

export interface CookieOptions {
  path?: string;
  domain?: string;
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Lax' | 'Strict' | 'None';
}
export interface SurfaceContext {
  request: Request;
  url: URL;
  params: Record<string, string>;
  cookies: {
    get(name: string): string | undefined;
    set(name: string, value: string, options?: CookieOptions): void;
    delete(name: string, options?: CookieOptions): void;
  };
  locals: App.Locals;
  env: Record<string, unknown>;
  signal: AbortSignal;
  platform: unknown;
  nonce: string;
  basePath: string;
  /** Pages under `routes/[lang]/` (DC-24 ⑤): the language and links to this page in others. */
  i18n?: I18nContext;
  route: {
    kind: 'page' | 'transition' | 'action' | 'island' | 'image' | 'redirect' | 'not-found';
    pattern?: string;
    name?: string;
    prerendered: boolean;
  };
  /**
   * Transitions only: re-yield frames from an outside source (`yield* ctx.external(src)`).
   * Frames may only touch `external` slots and must pass their schema; others are dropped.
   */
  external(source: AsyncIterable<unknown> | Iterable<unknown>): AsyncGenerator<StateFrame, void>;
  /**
   * The one-time result of the JS-less form submission of transition `name` (PRG, DC-22),
   * read after the 303 redirect. Reading it clears the cookie.
   */
  flash(name: string): Promise<Flash | undefined>;
}
export type Middleware = (
  ctx: SurfaceContext,
  next: () => Promise<Response>
) => Response | Promise<Response>;

export function sequence(...middleware: Middleware[]): Middleware {
  return (ctx, terminal) => {
    let index = -1;
    const dispatch = (i: number): Promise<Response> => {
      if (i <= index) return Promise.reject(new Error('next() called more than once'));
      index = i;
      return Promise.resolve(
        middleware[i] ? middleware[i](ctx, () => dispatch(i + 1)) : terminal()
      );
    };
    return dispatch(0);
  };
}

export function createContext(
  request: Request,
  options: {
    basePath: string;
    signal: AbortSignal;
    env?: Record<string, unknown>;
    platform?: unknown;
    development?: boolean;
    logger?: Logger;
  }
) {
  const incoming = new Map<string, string>();
  for (const pair of (request.headers.get('cookie') ?? '').split(';')) {
    const i = pair.indexOf('=');
    if (i < 1) continue;
    try {
      const name = pair.slice(0, i).trim();
      if (!incoming.has(name)) incoming.set(name, decodeURIComponent(pair.slice(i + 1).trim()));
    } catch {
      /* ignore malformed incoming cookies */
    }
  }
  const outgoing: string[] = [];
  let locked = false;
  const write = (name: string, value: string, opts: CookieOptions = {}) => {
    if (locked) {
      if (options.development) options.logger?.warn(`[Cookie] late write ignored: ${name}`);
      return;
    }
    if (!/^[!#$%&'*+.^_`|~\w-]+$/.test(name)) throw new Error('Invalid cookie name');
    const path = opts.path ?? (options.basePath || '/');
    for (const attr of [path, opts.domain])
      if (attr && /[;\r\n]/.test(attr)) throw new Error('Invalid cookie attribute');
    if (opts.sameSite && !['Lax', 'Strict', 'None'].includes(opts.sameSite))
      throw new Error('Invalid SameSite');
    const parts = [
      `${name}=${encodeURIComponent(value)}`,
      `Path=${path}`,
      `SameSite=${opts.sameSite ?? 'Lax'}`,
    ];
    if (opts.domain) parts.push(`Domain=${opts.domain}`);
    if (opts.maxAge !== undefined) {
      if (!Number.isFinite(opts.maxAge)) throw new Error('Invalid Max-Age');
      parts.push(`Max-Age=${Math.floor(opts.maxAge)}`);
    }
    if (opts.expires) parts.push(`Expires=${opts.expires.toUTCString()}`);
    if (opts.httpOnly) parts.push('HttpOnly');
    if (opts.secure) parts.push('Secure');
    outgoing.push(parts.join('; '));
    incoming.set(name, value);
  };
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const ctx: SurfaceContext = {
    request,
    url: new URL(request.url),
    params: {},
    locals: {},
    env: options.env ?? {},
    signal: options.signal,
    platform: options.platform,
    nonce: Array.from(bytes, n => n.toString(16).padStart(2, '0')).join(''),
    basePath: options.basePath,
    route: { kind: 'not-found', prerendered: false },
    external() {
      throw new Error('ctx.external() is only available inside a transition');
    },
    flash: async () => undefined,
    cookies: {
      get: name => incoming.get(name),
      set: write,
      delete: (name, opts) => {
        write(name, '', { ...opts, maxAge: 0, expires: new Date(0) });
        incoming.delete(name);
      },
    },
  };
  return {
    ctx,
    outgoing,
    lock: () => {
      locked = true;
    },
    discard: () => {
      outgoing.length = 0;
      locked = true;
    },
  };
}
