/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { h } from 'lithent';
import type { TagFunction } from 'lithent';
import { ComponentHost } from '../client/componentHost.js';
import { PluginHost, definePlugin } from '../client/pluginHost.js';
import { StateSurface } from '../client/stateSurface.js';
import { SlotDom } from '../client/slotDom.js';
import { createHandler } from '../server/core/handler.js';
import { defineManifest } from '../server/core/manifest.js';
import type { SlotMeta, StateFrame } from '../shared/protocol.js';

/**
 * Stage 9 resources: page lifetimes (observers, listeners, plugin cleanups) over 100 client
 * navigations, and long streams that must not keep per-frame state. Router navigations in a
 * real browser: e2e/modes (200 navigations without growing DOM or instances).
 */
const Text = ((props: { text?: string }) => h('p', {}, props.text ?? '')) as unknown as TagFunction;
const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

afterEach(() => vi.unstubAllGlobals());

/** Live observer counts: created and observing minus disconnected. */
function countObservers() {
  const live = { intersection: 0, mutation: 0 };
  class Intersection {
    observing = false;
    constructor(public callback: IntersectionObserverCallback) {}
    observe() {
      if (!this.observing) live.intersection++;
      this.observing = true;
    }
    unobserve() {}
    disconnect() {
      if (this.observing) live.intersection--;
      this.observing = false;
    }
    takeRecords() {
      return [];
    }
  }
  const Native = globalThis.MutationObserver;
  class Mutation extends Native {
    observing = false;
    observe(target: Node, options?: MutationObserverInit) {
      if (!this.observing) live.mutation++;
      this.observing = true;
      super.observe(target, options);
    }
    disconnect() {
      if (this.observing) live.mutation--;
      this.observing = false;
      super.disconnect();
    }
  }
  vi.stubGlobal('IntersectionObserver', Intersection);
  vi.stubGlobal('MutationObserver', Mutation);
  return live;
}

describe('page lifetime cleanup (100 client navigations)', () => {
  it('disconnects observers, cancels schedules and runs every plugin cleanup', async () => {
    const live = countObservers();
    const counts = { attached: 0, cleaned: 0, pages: 0, aborted: 0 };
    const plugin = definePlugin({
      name: 'probe',
      attach: () => {
        counts.attached++;
        return () => counts.cleaned++;
      },
      onPage: ({ signal }) => {
        counts.pages++;
        signal.addEventListener('abort', () => counts.aborted++);
      },
    });
    const entries = [{ id: 'probe', load: 'load' as const }];
    const plugins = new PluginHost(entries, { probe: async () => plugin });
    const host = new ComponentHost({ loaders: { 'text#default': async () => Text }, plugins });
    const metas: SlotMeta[] = [
      { id: 'now', mode: 'client', component: 'text#default', props: { text: 'a' } },
      {
        id: 'later',
        mode: 'client',
        component: 'text#default',
        props: { text: 'b' },
        activation: 'visible',
      },
      {
        id: 'wide',
        mode: 'client',
        component: 'text#default',
        props: { text: 'c' },
        activation: 'media',
        media: '(min-width: 99999px)',
      },
      { id: 'list', mode: 'server' },
    ];
    for (let page = 0; page < 100; page++) {
      document.body.innerHTML = metas
        .map(
          meta => `<h-state name="${meta.id}"><p>${String(meta.props?.text ?? 'ssr')}</p></h-state>`
        )
        .join('');
      if (page === 0) plugins.start();
      else plugins.mountPage(entries);
      host.scan(document, metas);
      plugins.displayedSlot('list', document.querySelector('h-state[name="list"]')!, 'server');
      for (let waited = 0; waited < 1000 && host.stats.active < 1; waited += 5) await tick(5);
      // One active guarded component, one dormant visible boundary on this page.
      expect(live.mutation).toBe(1);
      expect(live.intersection).toBe(1);
      host.leavePage();
      plugins.leavePage();
      expect(live).toEqual({ intersection: 0, mutation: 0 });
    }
    expect(host.stats.instances).toBe(0);
    expect(counts.attached).toBeGreaterThanOrEqual(200);
    expect(counts.cleaned).toBe(counts.attached);
    expect(counts.pages).toBe(100);
    expect(counts.aborted).toBe(100);
  });
});

describe('long streams', () => {
  it('the browser keeps no per-frame state over 20,000 merge patches', async () => {
    document.body.innerHTML = '<h-state name="chat"></h-state>';
    const host = new ComponentHost({ loaders: { 'text#default': async () => Text } });
    const surface = new StateSurface({
      bootstrap: { buildId: 'b1', pageId: 'p', basePath: '' },
      slots: [{ id: 'chat', mode: 'client', component: 'text#default' }],
      host,
      dom: new SlotDom(host, undefined),
    });
    surface.discoverAnchors();
    const COUNT = 20_000;
    const lines = [
      JSON.stringify({ type: 'patch', reset: true, ops: [{ slot: 'chat', props: { text: '' } }] }),
    ];
    for (let i = 1; i < COUNT; i++)
      lines.push(JSON.stringify({ type: 'patch', ops: [{ slot: 'chat', merge: { text: 'x' } }] }));
    lines.push(JSON.stringify({ type: 'done' }));
    const text = lines.join('\n') + '\n';
    // Delivered in 200 chunks with animation frames in between.
    const size = Math.ceil(text.length / 200);
    let offset = 0;
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            async pull(controller) {
              if (offset >= text.length) return controller.close();
              await tick();
              controller.enqueue(new TextEncoder().encode(text.slice(offset, (offset += size))));
            },
          }),
          { headers: { 'content-type': 'application/x-ndjson' } }
        )
    );
    expect(await surface.transition('stream')).toEqual({ ok: true });
    await tick(20);
    expect(document.querySelector('h-state[name="chat"]')!.textContent).toBe('x'.repeat(COUNT - 1));
    expect(surface.running).toEqual([]);
    const internals = surface as unknown as { dirty: Set<unknown>; requests: Set<unknown> };
    expect(internals.dirty.size).toBe(0);
    expect(internals.requests.size).toBe(0);
  });

  it('the server streams 20,000 accumulate frames in linear time with one state per slot', async () => {
    const COUNT = 20_000;
    const handler = createHandler({
      development: false,
      limits: { ops: COUNT + 10 },
      manifest: defineManifest({
        buildId: 'b1',
        routes: [
          {
            pattern: '/',
            module: { default: () => null },
            page: { id: 'p', slots: { chat: { mode: 'client', componentId: 'chat#default' } } },
          },
        ],
        transitions: {
          stream: async function* () {
            yield { type: 'state', states: { chat: { text: '' } } } as StateFrame;
            for (let i = 1; i < COUNT; i++)
              yield {
                type: 'state',
                accumulate: true,
                states: { chat: { text: 'x' } },
              } as StateFrame;
          },
        },
      }),
    });
    const run = async (frames: number) => {
      const started = performance.now();
      const response = await handler.fetch(
        new Request('https://surface.test/transition/stream', {
          method: 'POST',
          headers: { 'x-surface-build': 'b1', 'x-surface-page': 'p' },
          body: '{}',
        })
      );
      const reader = response.body!.getReader();
      let bytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
      }
      return { ms: performance.now() - started, bytes, frames };
    };
    const result = await run(COUNT);
    // Each frame is one short merge op line; nothing grows with the stream except the slot.
    expect(result.bytes).toBeLessThan(COUNT * 80);
    expect(result.ms).toBeLessThan(10_000);
  }, 20_000);
});
