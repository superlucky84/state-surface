/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { startLoader } from './start.js';
import { onTrace, type TraceEvent } from './trace.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 30));

function ndjson() {
  return new Response('{"type":"patch","reset":true,"ops":[]}\n{"type":"done"}\n', {
    headers: { 'content-type': 'application/x-ndjson' },
  });
}
const bootstrap = (value: Record<string, unknown>) =>
  `<script id="__SURFACE__" type="application/json">${JSON.stringify({
    buildId: 'b1',
    pageId: 'index',
    basePath: '',
    ...value,
  })}</script>`;

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
        expect(init.headers).toMatchObject({ 'X-Surface-Build': 'b1', 'X-Surface-Page': 'index' });
        return ndjson();
      })
    );
    document.head.innerHTML = bootstrap({ basePath: '/demo' });
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
    document.head.innerHTML = bootstrap({
      boot: [
        { transition: 'first', params: {} },
        { transition: 'second', params: {} },
      ],
    });
    await startLoader().runtime();
    expect(calls).toEqual(['/transition/first', '/transition/second']);
  });

  it('starts the runtime for deferred slots and requests them in parallel (DC-21)', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return Response.json({ html: `<p>${url.includes('a.tsx') ? 'A' : 'B'}</p>` });
      })
    );
    document.head.innerHTML = bootstrap({
      slots: [
        { id: 'a', mode: 'server', component: 'a.tsx#default', defer: 'tokA' },
        { id: 'b', mode: 'server', component: 'b.tsx#default', defer: 'tokB' },
      ],
    });
    document.body.innerHTML =
      '<h-state name="a"><p>loading</p></h-state><h-state name="b"><p>loading</p></h-state>';
    await startLoader().runtime();
    await flush();
    expect(calls).toEqual([
      '/_surface/island/a.tsx%23default?p=tokA',
      '/_surface/island/b.tsx%23default?p=tokB',
    ]);
    expect(document.querySelector('h-state[name="a"]')!.innerHTML).toBe('<p>A</p>');
    expect(document.querySelector('h-state[name="b"]')!.innerHTML).toBe('<p>B</p>');
  });

  it('does not load the action runtime without actions, boot or debug', async () => {
    document.body.innerHTML = '<h-state name="static"><p>static</p></h-state>';
    const loader = startLoader();
    await flush();
    expect(loader.runtime()).toBeUndefined();
  });

  it('reloads on the next interaction when a chunk fails because a new build is deployed', async () => {
    const requests: Array<[string, string | undefined]> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        requests.push([url, init.method]);
        return new Response(null, { headers: { 'x-surface-build': 'b2' } });
      })
    );
    const reload = vi.fn();
    vi.spyOn(location, 'reload').mockImplementation(reload);
    document.head.innerHTML = bootstrap({
      slots: [{ id: 'gone', mode: 'client', component: 'deleted.tsx#default', props: {} }],
    });
    document.body.innerHTML = '<h-state name="gone"><p>ssr</p></h-state>';
    const reportError = vi.fn();
    vi.stubGlobal('reportError', reportError);
    const traced: TraceEvent[] = [];
    const unsubscribe = onTrace(event => traced.push(event));
    startLoader();
    await new Promise(resolve => setTimeout(resolve, 1100));
    unsubscribe();
    expect(requests).toEqual([[location.href, 'HEAD']]);
    expect(document.querySelector('h-state')!.innerHTML).toBe('<p>ssr</p>');
    expect(reload).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledOnce();
    // The production trace hook sees the same error with its context.
    expect(traced).toEqual([
      { kind: 'error', detail: expect.objectContaining({ message: expect.any(String) }) },
    ]);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('starts the runtime for forms posting to actionUrl()', async () => {
    document.body.innerHTML =
      '<form method="post" action="/_surface/action/comment/add"><input name="body" /></form>';
    const loader = startLoader();
    expect(loader.runtime()).toBeInstanceOf(Promise);
    await loader.runtime();
  });
});
