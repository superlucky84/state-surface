/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { h } from 'lithent';
import type { TagFunction } from 'lithent';
import { StateSurface, coalesceOps, type TraceEvent } from './stateSurface.js';
import { ComponentHost } from './componentHost.js';
import { SlotDom } from './slotDom.js';
import type { Op, SlotMeta, WireFrame } from '../shared/protocol.js';

const Text = ((props: { text?: string }) =>
  h('p', { class: 'text' }, props.text ?? '')) as unknown as TagFunction;
const flush = () => new Promise(resolve => setTimeout(resolve, 30));

const SLOTS: SlotMeta[] = [
  { id: 'list', mode: 'server' },
  { id: 'card', mode: 'server', viewTransition: true },
  { id: 'chat', mode: 'client', component: 'text#default' },
  { id: 'system:error', mode: 'server' },
];

function ndjson(frames: unknown[], status = 200) {
  return new Response(frames.map(frame => JSON.stringify(frame)).join('\n') + '\n', {
    status,
    headers: { 'content-type': 'application/x-ndjson' },
  });
}

/** A stream the test feeds frame by frame. */
function controlledStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: c => void (controller = c) });
  const encoder = new TextEncoder();
  return {
    response: new Response(body, { headers: { 'content-type': 'application/x-ndjson' } }),
    // A superseded request's reader may already be cancelled; late sends are then no-ops.
    send: (frame: unknown) => {
      try {
        controller.enqueue(encoder.encode(JSON.stringify(frame) + '\n'));
      } catch {
        /* cancelled */
      }
    },
    close: () => {
      try {
        controller.close();
      } catch {
        /* cancelled */
      }
    },
  };
}

function setup(options: { slots?: SlotMeta[]; html?: string; development?: boolean } = {}) {
  document.body.innerHTML =
    options.html ??
    '<h-state name="list"><ul><li>ssr</li></ul></h-state><h-state name="card"></h-state>' +
      '<h-state name="chat"></h-state><h-state name="system:error"></h-state>';
  const traces: TraceEvent[] = [];
  const report = vi.fn();
  const reload = vi.fn();
  const actions: Array<{ name: string; phase: string; error?: Error }> = [];
  const host = new ComponentHost({ loaders: { 'text#default': async () => Text } });
  const surface = new StateSurface({
    bootstrap: { buildId: 'b1', pageId: 'page', basePath: '/base' },
    slots: options.slots ?? SLOTS,
    host,
    dom: new SlotDom(host, undefined, { development: options.development }),
    trace: event => traces.push(event),
    report,
    reload,
    development: options.development,
    onAction: event => actions.push(event),
  });
  surface.discoverAnchors();
  const slot = (name: string) => document.querySelector<HTMLElement>(`h-state[name="${name}"]`)!;
  return { surface, traces, report, reload, actions, slot };
}

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('request state table (DESIGN 6.3)', () => {
  it('applies a reset patch and later patches, then completes on done', async () => {
    const calls: Array<[string, RequestInit]> = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return ndjson([
        { type: 'patch', reset: true, ops: [{ slot: 'list', html: '<ul><li>a</li></ul>' }] },
        { type: 'patch', ops: [{ slot: 'list', html: '<ul><li>b</li></ul>' }] },
        { type: 'done' },
        { type: 'patch', ops: [{ slot: 'list', html: '<ul><li>after done</li></ul>' }] },
      ]);
    });
    const { surface, slot, actions } = setup();
    expect(await surface.transition('go', { q: 1 })).toBe('completed');
    expect(slot('list').innerHTML).toBe('<ul><li>b</li></ul>');
    expect(calls[0][0]).toBe('/base/transition/go');
    expect(calls[0][1].headers).toMatchObject({
      'X-Surface-Build': 'b1',
      'X-Surface-Page': 'page',
    });
    expect(actions).toEqual([
      { name: 'go', phase: 'start' },
      { name: 'go', phase: 'end' },
    ]);
  });

  it('treats done without a patch as an empty success', async () => {
    vi.stubGlobal('fetch', async () => ndjson([{ type: 'done' }]));
    const { surface, slot } = setup();
    expect(await surface.transition('noop')).toBe('completed');
    expect(slot('list').innerHTML).toBe('<ul><li>ssr</li></ul>');
  });

  it.each([
    [
      'a patch without reset first',
      [{ type: 'patch', ops: [] }, { type: 'done' }],
      'must be a reset',
    ],
    ['EOF without done', [{ type: 'patch', reset: true, ops: [] }], 'without "done"'],
    [
      'an unknown op',
      [{ type: 'patch', reset: true, ops: [{ slot: 'list', append: 'x' }] }],
      'version mismatch',
    ],
    [
      'html for a client slot',
      [{ type: 'patch', reset: true, ops: [{ slot: 'chat', html: 'x' }] }],
      'does not match the mode',
    ],
    [
      'props for a server slot',
      [{ type: 'patch', reset: true, ops: [{ slot: 'list', props: {} }] }],
      'does not match the mode',
    ],
  ])('fails on %s and applies nothing of it', async (_case, frames, reason) => {
    vi.stubGlobal('fetch', async () => ndjson(frames));
    const { surface, slot, report, actions } = setup();
    expect(await surface.transition('bad')).toBe('failed');
    expect(slot('list').innerHTML).toBe('<ul><li>ssr</li></ul>');
    expect(report.mock.calls[0][0].message).toContain(reason);
    expect(actions.at(-1)!.error!.message).toContain(reason);
  });

  it('skips an invalid ui op and still applies content (DC-14 ②)', async () => {
    vi.stubGlobal('fetch', async () =>
      ndjson([
        {
          type: 'patch',
          reset: true,
          ops: [
            { slot: 'list', html: '<p>ok</p>' },
            { slot: 'list', ui: { classAdd: ['bad token'] } },
            { slot: 'card', ui: { cssVars: { '--x': 'url(evil)' } } },
          ],
        },
        { type: 'done' },
      ])
    );
    const { surface, slot, traces } = setup();
    expect(await surface.transition('ui')).toBe('completed');
    expect(slot('list').innerHTML).toBe('<p>ok</p>');
    expect(slot('list').className).toBe('');
    expect(traces.filter(event => event.kind === 'skipped')).toHaveLength(2);
  });

  it('stops reading an NDJSON line above the frame size limit', async () => {
    vi.stubGlobal('fetch', async () =>
      ndjson([{ type: 'patch', reset: true, ops: [{ slot: 'list', html: 'x'.repeat(300) }] }])
    );
    const { surface } = setup();
    (surface as unknown as { options: { frameSize: number } }).options.frameSize = 100;
    expect(await surface.transition('big')).toBe('failed');
  });

  it('reads a single JSON response with the same pipeline', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({
        frames: [
          { type: 'patch', reset: true, ops: [{ slot: 'list', html: '<p>json</p>' }] },
          { type: 'done' },
        ],
      })
    );
    const { surface, slot } = setup();
    expect(await surface.transition('json')).toBe('completed');
    expect(slot('list').innerHTML).toBe('<p>json</p>');
  });

  it('reloads the document on a build mismatch (409)', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 409 }));
    const { surface, reload } = setup();
    expect(await surface.transition('old')).toBe('aborted');
    expect(reload).toHaveBeenCalledOnce();
  });

  it('looks up the global fetch on every call (instrumentation wraps it later, 8.3-3)', async () => {
    const { surface } = setup();
    const wrapped = vi.fn(async () => ndjson([{ type: 'done' }]));
    vi.stubGlobal('fetch', wrapped);
    await surface.transition('a');
    expect(wrapped).toHaveBeenCalledOnce();
  });

  it('reports HTTP failures without frames', async () => {
    vi.stubGlobal('fetch', async () => new Response('Forbidden', { status: 403 }));
    const { surface, report } = setup();
    expect(await surface.transition('denied')).toBe('failed');
    expect(report.mock.calls[0][0]).toMatchObject({ kind: 'http', message: 'HTTP 403' });
  });
});

describe('error frames', () => {
  it('shows the error slot content, reports it, and clears it with the next baseline', async () => {
    vi.stubGlobal('fetch', async () =>
      ndjson([
        { type: 'patch', reset: true, ops: [{ slot: 'list', html: '<p>partial</p>' }] },
        { type: 'error', message: 'boom', slot: 'system:error', html: '<strong>boom</strong>' },
      ])
    );
    const { surface, slot, report } = setup();
    expect(await surface.transition('fail')).toBe('failed');
    expect(slot('list').innerHTML).toBe('<p>partial</p>');
    expect(slot('system:error').innerHTML).toBe('<strong>boom</strong>');
    expect(report.mock.calls[0][0]).toMatchObject({ kind: 'server', message: 'boom' });

    vi.stubGlobal('fetch', async () =>
      ndjson([
        { type: 'patch', reset: true, ops: [{ slot: 'list', html: '<p>ok</p>' }] },
        { type: 'done' },
      ])
    );
    expect(await surface.transition('ok')).toBe('completed');
    expect(slot('system:error').innerHTML).toBe('');
  });

  it('warns in development when the page has no error slot', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', async () => ndjson([{ type: 'error', message: 'no slot' }]));
    const { surface, report } = setup({ development: true });
    expect(await surface.transition('fail')).toBe('failed');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('failed without an error slot'));
    expect(report).toHaveBeenCalledOnce();
  });
});

describe('generation invalidation (abort previous)', () => {
  it('ignores frames of a superseded request and keeps the latest result', async () => {
    const first = controlledStream();
    const second = controlledStream();
    const responses = [first.response, second.response];
    vi.stubGlobal('fetch', async () => responses.shift()!);
    const { surface, slot, report } = setup();
    const running = surface.transition('a');
    await flush();
    first.send({ type: 'patch', reset: true, ops: [{ slot: 'list', html: '<p>A1</p>' }] });
    await flush();
    expect(slot('list').innerHTML).toBe('<p>A1</p>');
    const latest = surface.transition('b');
    first.send({ type: 'patch', ops: [{ slot: 'list', html: '<p>A2 stale</p>' }] });
    await flush();
    second.send({ type: 'patch', reset: true, ops: [{ slot: 'list', html: '<p>B</p>' }] });
    second.send({ type: 'done' });
    second.close();
    expect(await latest).toBe('completed');
    expect(await running).toBe('aborted');
    expect(slot('list').innerHTML).toBe('<p>B</p>');
    expect(report).not.toHaveBeenCalled();
  });

  it('marks pending targets and clears them with the first patch (until stage 5)', async () => {
    const stream = controlledStream();
    vi.stubGlobal('fetch', async () => stream.response);
    const { surface, slot } = setup();
    const running = surface.transition('p', {}, { pendingTargets: ['list'] });
    expect(slot('list').hasAttribute('data-pending')).toBe(true);
    expect(slot('card').hasAttribute('data-pending')).toBe(false);
    await flush();
    stream.send({ type: 'patch', reset: true, ops: [] });
    await flush();
    expect(slot('list').hasAttribute('data-pending')).toBe(false);
    stream.send({ type: 'done' });
    stream.close();
    await running;
  });
});

describe('ops', () => {
  it('renders, merges and removes a client slot (props / merge / remove)', async () => {
    vi.stubGlobal('fetch', async () =>
      ndjson([
        { type: 'patch', reset: true, ops: [{ slot: 'chat', props: { text: 'He' } }] },
        { type: 'patch', ops: [{ slot: 'chat', merge: { text: 'll' } }] },
        { type: 'patch', ops: [{ slot: 'chat', merge: { text: 'o' } }] },
        { type: 'done' },
      ])
    );
    const { surface, slot } = setup();
    await surface.transition('chat');
    await flush();
    expect(slot('chat').textContent).toBe('Hello');
    expect(surface.activeStates.chat).toEqual({ text: 'Hello' });
    vi.stubGlobal('fetch', async () =>
      ndjson([
        { type: 'patch', reset: true, ops: [{ slot: 'chat', remove: true }] },
        { type: 'done' },
      ])
    );
    await surface.transition('clear');
    expect(slot('chat').innerHTML).toBe('');
    expect(surface.activeStates.chat).toBeUndefined();
  });

  it('applies and clears a slot UI patch after its content', async () => {
    const { surface, slot } = setup();
    vi.stubGlobal('fetch', async () =>
      ndjson([
        {
          type: 'patch',
          reset: true,
          ops: [
            {
              slot: 'card',
              ui: { classAdd: ['tone-warning'], cssVars: { '--accent': '#f59e0b' } },
            },
          ],
        },
        { type: 'done' },
      ])
    );
    await surface.transition('theme');
    expect(slot('card').classList.contains('tone-warning')).toBe(true);
    expect(slot('card').style.getPropertyValue('--accent')).toBe('#f59e0b');
    expect(surface.activeUi).toEqual({
      card: { classAdd: ['tone-warning'], cssVars: { '--accent': '#f59e0b' } },
    });
    vi.stubGlobal('fetch', async () =>
      ndjson([{ type: 'patch', reset: true, ops: [{ slot: 'card', ui: null }] }, { type: 'done' }])
    );
    await surface.transition('reset');
    expect(slot('card').getAttribute('class')).toBe('');
    expect(slot('card').style.getPropertyValue('--accent')).toBe('');
  });

  it('drops ops for slots that are not on the page', async () => {
    vi.stubGlobal('fetch', async () =>
      ndjson([
        { type: 'patch', reset: true, ops: [{ slot: 'elsewhere', html: '<p>x</p>' }] },
        { type: 'done' },
      ])
    );
    const { surface, traces } = setup();
    expect(await surface.transition('x')).toBe('completed');
    expect(traces.some(event => event.kind === 'dropped')).toBe(true);
  });
});

describe('coalesceOps (DESIGN 6.2)', () => {
  const ops = (...list: Op[]) => list;
  it('keeps the last html/props per slot and folds merges', () => {
    expect(
      coalesceOps(
        ops(
          { slot: 'a', html: '1' },
          { slot: 'b', props: { items: [1], text: 'a' } },
          { slot: 'a', html: '2' },
          { slot: 'b', merge: { items: [2], text: 'b' } },
          { slot: 'c', merge: { items: [1] } },
          { slot: 'c', merge: { items: [2] } },
          { slot: 'a', ui: { classAdd: ['x'] } },
          { slot: 'a', ui: null }
        )
      )
    ).toEqual([
      { slot: 'a', html: '2' },
      { slot: 'a', ui: null },
      { slot: 'b', props: { items: [1, 2], text: 'ab' } },
      { slot: 'c', merge: { items: [1, 2] } },
    ]);
  });

  it('treats ops after remove as a new appearance and keeps type-changing merges apart', () => {
    expect(
      coalesceOps(
        ops(
          { slot: 'a', html: 'old' },
          { slot: 'a', ui: { classAdd: ['x'] } },
          { slot: 'a', remove: true },
          { slot: 'a', html: 'new' },
          { slot: 'm', merge: { v: 'text' } },
          { slot: 'm', merge: { v: [1] } }
        )
      )
    ).toEqual([
      { slot: 'a', remove: true },
      { slot: 'a', html: 'new' },
      { slot: 'm', merge: { v: 'text' } },
      { slot: 'm', merge: { v: [1] } },
    ]);
  });
});

describe('in-page View Transitions (DC-06)', () => {
  function stubViewTransitions() {
    const started: number[] = [];
    let count = 0;
    (document as unknown as { startViewTransition: unknown }).startViewTransition = (
      update: () => Promise<void> | void
    ) => {
      started.push(++count);
      const done = Promise.resolve().then(update);
      return { updateCallbackDone: done, finished: done, ready: done };
    };
    return started;
  }
  afterEach(() => {
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
  });

  const frames: WireFrame[] = [
    { type: 'patch', reset: true, ops: [{ slot: 'list', html: '<p>1</p>' }] },
    { type: 'patch', ops: [{ slot: 'list', html: '<p>2</p>' }] },
    { type: 'done' },
  ];

  it('applies immediately by default', async () => {
    const started = stubViewTransitions();
    vi.stubGlobal('fetch', async () => ndjson(frames));
    const { surface, slot } = setup();
    await surface.transition('plain');
    expect(started).toEqual([]);
    expect(slot('list').innerHTML).toBe('<p>2</p>');
  });

  it('wraps only the first patch of an opted-in action (header or data-view-transition)', async () => {
    const started = stubViewTransitions();
    vi.stubGlobal('fetch', async () => {
      const response = ndjson(frames);
      response.headers.set('x-surface-view-transition', '1');
      return response;
    });
    const { surface, slot } = setup();
    await surface.transition('vt');
    expect(started).toHaveLength(1);
    expect(slot('list').innerHTML).toBe('<p>2</p>');
    vi.stubGlobal('fetch', async () => ndjson(frames));
    await surface.transition('attr', {}, { viewTransition: true });
    expect(started).toHaveLength(2);
  });

  it('wraps a patch that changes a slot declared with viewTransition, first appearance included', async () => {
    const started = stubViewTransitions();
    vi.stubGlobal('fetch', async () =>
      ndjson([
        { type: 'patch', reset: true, ops: [{ slot: 'card', html: '<img>' }] },
        { type: 'done' },
      ])
    );
    const { surface } = setup();
    await surface.transition('open');
    expect(started).toHaveLength(1);
  });

  it('skips the transition with prefers-reduced-motion', async () => {
    const started = stubViewTransitions();
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    vi.stubGlobal('fetch', async () => ndjson(frames));
    const { surface } = setup();
    await surface.transition('vt', {}, { viewTransition: true });
    expect(started).toEqual([]);
  });
});

describe('deferred server slots (DC-21)', () => {
  const deferred: SlotMeta[] = [
    { id: 'list', mode: 'server', component: 'list.tsx#default', defer: 'tok' },
  ];

  it('drops a response when a transition changed the slot first', async () => {
    let answer!: (response: Response) => void;
    vi.stubGlobal('fetch', async (url: string) =>
      url.includes('/_surface/island/')
        ? new Promise<Response>(resolve => (answer = resolve))
        : ndjson([
            { type: 'patch', reset: true, ops: [{ slot: 'list', html: '<p>fresh</p>' }] },
            { type: 'done' },
          ])
    );
    const { surface, slot, traces } = setup({ slots: deferred });
    const loading = surface.loadDeferred();
    await surface.transition('update');
    answer(Response.json({ html: '<p>stale</p>' }));
    await loading;
    await flush();
    expect(slot('list').innerHTML).toBe('<p>fresh</p>');
    expect(traces.some(event => event.kind === 'dropped')).toBe(true);
  });

  it('retries once after a second, then keeps the fallback and reports', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => new Response('down', { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    const { surface, slot, report } = setup({ slots: deferred });
    const loading = surface.loadDeferred();
    await vi.advanceTimersByTimeAsync(1000);
    await loading;
    vi.useRealTimers();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(slot('list').innerHTML).toBe('<ul><li>ssr</li></ul>');
    expect(report).toHaveBeenCalledWith(expect.any(Error), { slot: 'list', kind: 'deferred' });
  });

  it('switches to POST for tokens longer than 2KB', async () => {
    const calls: Array<[string, RequestInit]> = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return Response.json({ html: '<p>ok</p>' });
    });
    const { surface } = setup({
      slots: [{ ...deferred[0], defer: 't'.repeat(3000) }],
    });
    await surface.loadDeferred();
    expect(calls[0][0]).toBe('/base/_surface/island/list.tsx%23default');
    expect(calls[0][1]).toMatchObject({ method: 'POST', body: 't'.repeat(3000) });
  });
});
