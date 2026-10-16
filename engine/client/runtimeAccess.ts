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
