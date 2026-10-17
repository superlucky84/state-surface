import type { StateSurface } from './stateSurface.js';

/**
 * How component code reaches the action runtime without a global (DESIGN 7장: no
 * `window.__surface`). The loader registers the lazy runtime start; `useAction` asks for it
 * on the first `run()`.
 */
let provider: (() => Promise<StateSurface>) | undefined;

export function provideRuntime(start: (() => Promise<StateSurface>) | undefined) {
  provider = start;
}

export function getRuntime(): Promise<StateSurface> {
  return provider
    ? provider()
    : Promise.reject(new Error('The StateSurface engine is not running on this page'));
}

type Navigate = (url: string | URL, init?: { replace?: boolean }) => Promise<void> | void;
let router: Navigate | undefined;

export function provideRouter(navigate: Navigate | undefined) {
  router = navigate;
}

/**
 * Navigate like a link (DC-18 ④): through `<ClientRouter>` when the page has it, else as a
 * document load.
 */
export function navigate(url: string | URL, init: { replace?: boolean } = {}) {
  if (router) return router(url, init);
  const href = new URL(String(url), location.href).href;
  if (init.replace) globalThis.location.replace(href);
  else globalThis.location.assign(href);
}
