/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { startLoader } from './start.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 30));

function ndjson() {
  return new Response('{"type":"state","states":{}}\n{"type":"done"}\n', {
    headers: { 'content-type': 'application/x-ndjson' },
  });
}

describe('startLoader', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('captures a data-action click before the runtime loads and runs it once', async () => {
    const calls: Array<[string, unknown]> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push([url, JSON.parse(String(init.body))]);
        return ndjson();
      })
    );
    document.head.innerHTML = '<script id="__BASE_PATH__" type="application/json">"/demo"</script>';
    document.body.innerHTML = '<button data-action="like" data-params=\'{"id":7}\'>Like</button>';
    const loader = startLoader();
    document.querySelector('button')!.click();
    await loader.runtime();
    await flush();
    expect(calls).toEqual([['/demo/transition/like', { id: 7 }]]);
    // After the runtime is ready its own delegation handles clicks.
    document.querySelector('button')!.click();
    await flush();
    expect(calls).toHaveLength(2);
  });

  it('starts <Boot> entries in document order', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return ndjson();
      })
    );
    document.head.innerHTML =
      '<script id="__BOOT__" type="application/json">[{"transition":"first","params":{}},{"transition":"second","params":{}}]</script>';
    await startLoader().runtime();
    expect(calls).toEqual(['/transition/first', '/transition/second']);
  });

  it('does not load the action runtime without actions, boot or debug', async () => {
    document.body.innerHTML = '<h-state name="static"><p>static</p></h-state>';
    const loader = startLoader();
    await flush();
    expect(loader.runtime()).toBeUndefined();
  });
});
