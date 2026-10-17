/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { StateSurface } from '../client/stateSurface.js';
import { ComponentHost } from '../client/componentHost.js';
import { SlotDom } from '../client/slotDom.js';
import type { ActionMeta, SlotMeta } from '../shared/protocol.js';
import type { ActionResult } from '../client/actionError.js';
import { fuzzTimeout, random, seeds } from './fuzz.js';

/**
 * Stage 9 races (V-13): cancel timing over the whole request lifetime, interaction during a
 * 409 reload, and random interleavings of concurrent actions (overlapping, disjoint, omitted
 * targets, queue). Deferred load vs frame, navigation during a stream and actions during
 * persist are covered in stateSurface.test.ts (deferred slots, page lifetime) and the router
 * e2e; this file adds what those tests do not reach.
 */
const SLOTS: SlotMeta[] = ['s1', 's2', 's3', 'system:error'].map(id => ({ id, mode: 'server' }));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

/** A response body the test writes line by line; writes after a cancel are no-ops. */
function controlledStream(signal?: AbortSignal | null) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: c => void (controller = c) });
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    try {
      controller.close();
    } catch {
      /* cancelled */
    }
  };
  signal?.addEventListener('abort', close);
  return {
    response: new Response(body, { headers: { 'content-type': 'application/x-ndjson' } }),
    get open() {
      return open && !signal?.aborted;
    },
    send(frame: unknown) {
      if (!open) return;
      try {
        controller.enqueue(new TextEncoder().encode(JSON.stringify(frame) + '\n'));
      } catch {
        open = false;
      }
    },
    close,
  };
}

function setup(actions: Record<string, ActionMeta> = {}) {
  document.body.innerHTML = SLOTS.map(
    slot => `<h-state name="${slot.id}"><p>ssr</p></h-state>`
  ).join('');
  // Animation frames on the next timer tick: flushes happen between the test's steps.
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0)
  );
  const host = new ComponentHost({ loaders: {} });
  const reload = vi.fn();
  const report = vi.fn();
  const surface = new StateSurface({
    bootstrap: { buildId: 'b1', pageId: 'page', basePath: '' },
    slots: SLOTS,
    actions,
    host,
    dom: new SlotDom(host, undefined),
    reload,
    report,
  });
  surface.discoverAnchors();
  const html = (slot: string) => document.querySelector(`h-state[name="${slot}"]`)!.innerHTML;
  return { surface, reload, report, html };
}

afterEach(() => vi.unstubAllGlobals());

describe('cancel timing', () => {
  const points = [
    'before the response',
    'after the headers',
    'after the first frame, before its flush',
    'after the first flush',
    'after done',
  ] as const;

  it.each(points)('aborting %s leaves only what was already applied', async point => {
    const { surface, html } = setup({ go: { targets: ['s1'] } });
    let respond!: () => void;
    let stream!: ReturnType<typeof controlledStream>;
    let signal!: AbortSignal;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      signal = init.signal!;
      stream = controlledStream(init.signal);
      await new Promise<void>(resolve => (respond = resolve));
      return stream.response;
    });
    const abort = new AbortController();
    const running = surface.transition('go', {}, { signal: abort.signal });
    await tick();
    if (point !== 'before the response') {
      respond();
      await tick();
    }
    if (point.startsWith('after the first')) {
      stream.send({ type: 'patch', reset: true, ops: [{ slot: 's1', html: '<p>1</p>' }] });
      await Promise.resolve();
      await Promise.resolve();
      if (point === 'after the first flush') for (let i = 0; i < 4; i++) await tick();
    }
    if (point === 'after done') {
      stream.send({ type: 'patch', reset: true, ops: [{ slot: 's1', html: '<p>1</p>' }] });
      stream.send({ type: 'done' });
      for (let i = 0; i < 4; i++) await tick();
    }
    abort.abort();
    if (point === 'before the response') respond();
    // Frames after the abort never apply.
    stream?.send({ type: 'patch', ops: [{ slot: 's1', html: '<p>late</p>' }] });
    stream?.send({ type: 'done' });
    const result = await running;
    for (let i = 0; i < 3; i++) await tick();

    if (point === 'after done') {
      expect(result).toEqual({ ok: true });
      expect(html('s1')).toBe('<p>1</p>');
    } else {
      expect(result).toEqual({ ok: false, aborted: true });
      expect(signal.aborted).toBe(true);
      expect(html('s1')).toBe(point === 'after the first flush' ? '<p>1</p>' : '<p>ssr</p>');
    }
    expect(document.querySelectorAll('[data-pending]')).toHaveLength(0);
  });
});

describe('interaction during a 409 reload', () => {
  it('regression: reloads once, aborts running requests and sends no new ones', async () => {
    const { surface, reload, html } = setup({ a: { targets: ['s1'] }, b: { targets: ['s2'] } });
    const fetched: string[] = [];
    let streamB!: ReturnType<typeof controlledStream>;
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      fetched.push(url);
      if (url.endsWith('/b')) {
        streamB = controlledStream(init.signal);
        return streamB.response;
      }
      return new Response('{"error":"Build mismatch"}', { status: 409 });
    });
    const b = surface.transition('b');
    await tick();
    streamB.send({ type: 'patch', reset: true, ops: [{ slot: 's2', html: '<p>b1</p>' }] });
    for (let i = 0; i < 3; i++) await tick();
    expect(html('s2')).toBe('<p>b1</p>');

    expect(await surface.transition('a')).toEqual({ ok: false, aborted: true });
    expect(reload).toHaveBeenCalledOnce();
    // The user keeps clicking while the new document loads.
    expect(await surface.transition('a')).toEqual({ ok: false, aborted: true });
    expect(await surface.transition('b')).toEqual({ ok: false, aborted: true });
    streamB.send({ type: 'patch', ops: [{ slot: 's2', html: '<p>b2 (old page)</p>' }] });
    streamB.send({ type: 'done' });
    expect(await b).toEqual({ ok: false, aborted: true });
    for (let i = 0; i < 3; i++) await tick();

    expect(reload).toHaveBeenCalledOnce();
    expect(fetched).toEqual(['/transition/b', '/transition/a']);
    expect(html('s2')).toBe('<p>b1</p>');
    expect(document.querySelectorAll('[data-pending]')).toHaveLength(0);
  });
});

describe('random concurrent actions (DC-11, DC-30)', () => {
  const ACTIONS: Record<string, ActionMeta> = {
    x: { targets: ['s1'] },
    y: { targets: ['s2', 's3'] },
    z: { targets: ['s1', 's2'] },
    q: { targets: ['s3'], queue: true },
  };
  const NAMES = ['x', 'y', 'z', 'q', 'u']; // u declares no targets: it overlaps everything
  const targetsOf = (name: string) => ACTIONS[name]?.targets ?? ['s1', 's2', 's3'];
  const overlap = (a: string, b: string) =>
    !ACTIONS[a] || !ACTIONS[b] || targetsOf(a).some(slot => targetsOf(b).includes(slot));

  it(
    'never applies a superseded request, keeps queue order and clears pending (100 runs)',
    async () => {
      for (const seed of seeds(100, 52000)) {
        const r = random(seed);
        const { surface } = setup(ACTIONS);
        type Started = { id: number; name: string; seq: number; result?: ActionResult };
        const started: Started[] = [];
        const streams = new Map<number, ReturnType<typeof controlledStream>>();
        const sentFrames = new Map<number, number>();
        /** When the test sent a request's done/error: it may complete before later starts. */
        const terminal = new Map<number, number>();
        vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
          const { id } = JSON.parse(String(init.body));
          const stream = controlledStream(init.signal);
          streams.set(id, stream);
          return stream.response;
        });
        // Applied markers in order: [seq, request id, frame index, slot].
        const applied: Array<[number, number, number, string]> = [];
        let seq = 0;
        const shown = new Map<string, string>();
        const record = () => {
          for (const slot of ['s1', 's2', 's3']) {
            const marker = document.querySelector(`h-state[name="${slot}"] p`)?.textContent ?? '';
            if (marker !== shown.get(slot) && marker.includes(':')) {
              const [id, k] = marker.split(':').map(Number);
              applied.push([++seq, id, k, slot]);
            }
            shown.set(slot, marker);
          }
        };
        const observer = new MutationObserver(record);
        observer.observe(document.body, { subtree: true, childList: true });
        const pending: Array<Promise<unknown>> = [];

        for (let step = 0; step < 40; step++) {
          observer.takeRecords();
          record();
          const roll = r.int(100);
          const open = [...streams.entries()].filter(([, stream]) => stream.open);
          if (roll < 25 || !open.length) {
            const name = r.pick(NAMES);
            const entry: Started = { id: started.length + 1, name, seq: ++seq };
            started.push(entry);
            pending.push(
              surface.transition(name, { id: entry.id }).then(result => (entry.result = result))
            );
          } else if (roll < 80) {
            const [id, stream] = r.pick(open);
            const k = (sentFrames.get(id) ?? 0) + 1;
            sentFrames.set(id, k);
            const name = started[id - 1].name;
            const slots = r.subset(targetsOf(name));
            stream.send({
              type: 'patch',
              ...(k === 1 ? { reset: true } : {}),
              ops: (slots.length ? slots : targetsOf(name).slice(0, 1)).map(slot => ({
                slot,
                html: `<p>${id}:${k}</p>`,
              })),
            });
          } else if (roll < 92) {
            const [id, stream] = r.pick(open);
            if (!terminal.has(id)) terminal.set(id, ++seq);
            stream.send({ type: 'done' });
          } else {
            const [id, stream] = r.pick(open);
            if (!terminal.has(id)) terminal.set(id, ++seq);
            stream.send({ type: 'error', message: 'boom' });
          }
          if (r.chance(0.5)) await tick();
          else await Promise.resolve();
        }
        // Finish what is still open, then let everything settle.
        // Queued requests fetch only after the one ahead ends: repeat until all ended.
        for (let round = 0; round < 50 && started.some(entry => !entry.result); round++) {
          for (const [id, stream] of streams) {
            if (!terminal.has(id)) terminal.set(id, ++seq);
            stream.send({ type: 'done' });
          }
          for (let i = 0; i < 3; i++) await tick();
        }
        // Every request ends: a hung one names its seed instead of timing out the suite.
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          Promise.all(pending),
          new Promise((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new Error(
                    `seed ${seed}: requests did not end\n${JSON.stringify(started)}\nrunning ${surface.running}\nstreams ${JSON.stringify([...streams].map(([id, stream]) => [id, stream.open]))}`
                  )
                ),
              3000
            );
          }),
        ]);
        clearTimeout(timer);
        observer.takeRecords();
        record();
        observer.disconnect();

        const context = `seed ${seed}\nstarted ${JSON.stringify(started)}\napplied ${JSON.stringify(applied)}`;
        for (const [at, id, k, slot] of applied) {
          const request = started[id - 1];
          // An overlapping request that started later aborts this one unless it had already
          // completed (its terminal frame was sent before): then its last ops still apply,
          // ahead of the later request's (queue: same name waits instead).
          const later = started.find(
            other =>
              other.seq > request.seq &&
              other.seq < at &&
              overlap(request.name, other.name) &&
              !(request.name === 'q' && other.name === 'q') &&
              !((terminal.get(id) ?? Infinity) < other.seq)
          );
          expect(
            later,
            `${context}\n${id}:${k} on ${slot} after ${later?.id} started`
          ).toBeUndefined();
          expect(targetsOf(request.name), context).toContain(slot);
        }
        // Frames of one request apply in order per slot; queue requests one after another.
        for (const request of started)
          for (const slot of ['s1', 's2', 's3']) {
            const own = applied
              .filter(([, id, , where]) => id === request.id && where === slot)
              .map(([, , k]) => k);
            expect(own, context).toEqual([...own].sort((a, b) => a - b));
          }
        const queue = started.filter(request => request.name === 'q');
        for (let i = 1; i < queue.length; i++) {
          const before = applied.filter(([, id]) => id === queue[i - 1].id).map(([at]) => at);
          const after = applied.filter(([, id]) => id === queue[i].id).map(([at]) => at);
          if (before.length && after.length)
            expect(Math.min(...after), context).toBeGreaterThan(Math.max(...before));
        }
        for (const request of started) expect(request.result, context).toBeDefined();
        expect(document.querySelectorAll('[data-pending]').length, context).toBe(0);
        vi.unstubAllGlobals();
      }
    },
    fuzzTimeout(60_000)
  );
});
