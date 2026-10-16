/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createStateSurface } from './main.js';

describe('createStateSurface <Boot>', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('starts __BOOT__ entries in document order with their params', () => {
    const calls: Array<[string, unknown]> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push([url, JSON.parse(String(init.body))]);
        return new Response('{"type":"done"}\n', {
          headers: { 'content-type': 'application/x-ndjson' },
        });
      })
    );
    document.head.innerHTML =
      '<script id="__BOOT__" type="application/json">' +
      '[{"transition":"first","params":{"n":1}},{"transition":"second","params":{}}]</script>' +
      '<script id="__BASE_PATH__" type="application/json">"/demo"</script>';

    createStateSurface();

    expect(calls).toEqual([
      ['/demo/transition/first', { n: 1 }],
      ['/demo/transition/second', {}],
    ]);
  });

  it('starts nothing without __BOOT__', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    createStateSurface();
    expect(fetch).not.toHaveBeenCalled();
  });
});
