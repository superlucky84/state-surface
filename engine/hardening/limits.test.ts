import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { h } from 'lithent';
import { DEFAULT_LIMITS, LimitError, RequestProjection } from '../server/projection.js';
import { frameEncoder } from '../server/transitionResponse.js';
import { createContext } from '../server/core/context.js';
import { createHandler } from '../server/core/handler.js';
import { defineManifest } from '../server/core/manifest.js';
import { FLASH_COOKIE, sealFlash } from '../server/flash.js';
import { createNdjsonParser, decodeFrames } from '../shared/ndjson.js';
import type { PageDefinition } from '../server/core/manifest.js';
import type { StateFrame, WireFrame } from '../shared/protocol.js';

/**
 * Stage 9 limits and timeouts (DC-14): each limit exactly at its value passes, one byte more
 * fails; development warns above 80%; timeouts end the stream with a `timeout` error frame.
 * The documented defaults are the code's defaults.
 */
const Box = (props: { text?: string }) => h('p', {}, props.text ?? '');
const page: PageDefinition = {
  id: 'p',
  slots: {
    a: { mode: 'client', componentId: 'a#default' },
    box: { mode: 'server', componentId: 'box#default', component: Box },
  },
};
const projection = (limits: Partial<typeof DEFAULT_LIMITS>) => {
  const warn = vi.fn();
  const instance = new RequestProjection({
    name: 'limits',
    definition: { handler: async () => {} },
    page,
    ctx: createContext(new Request('http://x/'), {
      basePath: '',
      signal: new AbortController().signal,
    }).ctx,
    limits: { ...DEFAULT_LIMITS, ...limits },
    development: true,
    errorSlot: 'system:error',
    warn,
    now: () => 0,
  });
  return { instance, warn };
};

describe('server limits at their boundary', () => {
  it('html op: exactly htmlSize passes, one byte more fails, above 80% warns', async () => {
    // `<p>` + text + `</p>` is 7 bytes of markup.
    const html = (text: string) =>
      projection({ htmlSize: 100 }).instance.frame({
        type: 'state',
        states: { box: { text } },
      });
    await expect(html('x'.repeat(93))).resolves.toBeDefined();
    await expect(html('x'.repeat(94))).rejects.toThrow('exceeds 100 bytes');
    await expect(html('é'.repeat(47))).rejects.toThrow('exceeds 100 bytes'); // 94 + 7 bytes
    const quiet = projection({ htmlSize: 100 });
    await quiet.instance.frame({ type: 'state', states: { box: { text: 'x'.repeat(73) } } });
    expect(quiet.warn).not.toHaveBeenCalled();
    const loud = projection({ htmlSize: 100 });
    await loud.instance.frame({ type: 'state', states: { box: { text: 'x'.repeat(74) } } });
    expect(loud.warn).toHaveBeenCalledWith(expect.stringContaining('80%'));
  });

  it('ops: exactly the limit passes, one op more fails, above 80% warns', async () => {
    const { instance, warn } = projection({ ops: 10 });
    // A full frame of `a`: props + ui reset = 2 ops; partial frames: 1 op each.
    await instance.frame({ type: 'state', states: { a: {} } });
    for (let i = 0; i < 6; i++)
      await instance.frame({ type: 'state', full: false, states: { a: {} }, changed: ['a'] });
    expect(warn).not.toHaveBeenCalled();
    await instance.frame({ type: 'state', full: false, states: { a: {} }, changed: ['a'] }); // 9
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('80% of the op limit'));
    await instance.frame({ type: 'state', full: false, states: { a: {} }, changed: ['a'] }); // 10
    await expect(
      instance.frame({ type: 'state', full: false, states: { a: {} }, changed: ['a'] })
    ).rejects.toBeInstanceOf(LimitError);
  });

  it('NDJSON line and response: exact byte counts, newline included', () => {
    const frameOf = (size: number): WireFrame => {
      const base = JSON.stringify({ type: 'patch', ops: [{ slot: 'a', props: { t: '' } }] }) + '\n';
      return { type: 'patch', ops: [{ slot: 'a', props: { t: 'x'.repeat(size - base.length) } }] };
    };
    const warn = vi.fn();
    const encode = frameEncoder({ ...DEFAULT_LIMITS, frameSize: 200, responseSize: 1000 }, warn);
    expect(encode(frameOf(160)).byteLength).toBe(160);
    expect(warn).not.toHaveBeenCalled();
    expect(encode(frameOf(161)).byteLength).toBe(161);
    expect(warn).toHaveBeenCalledWith('frame', expect.stringContaining('80%'));
    expect(encode(frameOf(200)).byteLength).toBe(200);
    expect(() => encode(frameOf(201))).toThrow('exceeds 200 bytes');
    // 160 + 161 + 200 = 521 so far; the response limit counts every encoded byte.
    expect(encode(frameOf(200)).byteLength).toBe(200); // 721
    expect(warn).not.toHaveBeenCalledWith('response', expect.anything());
    expect(encode(frameOf(100)).byteLength).toBe(100); // 821 > 800
    expect(warn).toHaveBeenCalledWith('response', expect.stringContaining('80%'));
    expect(encode(frameOf(179)).byteLength).toBe(179); // 1000
    expect(() => encode(frameOf(60))).toThrow('response exceeds 1000 bytes');
  });

  it('request body: exactly bodyLimit passes, one byte more is 413', async () => {
    const handler = createHandler({
      bodyLimit: 64,
      manifest: defineManifest({
        buildId: 'b1',
        routes: [{ pattern: '/', module: { default: () => null }, page }],
        transitions: { echo: async () => ({ states: { a: {} } }) },
      }),
    });
    const post = (body: string) =>
      handler.fetch(
        new Request('https://surface.test/transition/echo', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-surface-build': 'b1',
            'x-surface-page': 'p',
          },
          body,
        })
      );
    const json = (size: number) => JSON.stringify({ q: 'x'.repeat(size - 8) });
    expect(json(64)).toHaveLength(64);
    expect((await post(json(64))).status).toBe(200);
    expect((await post(json(65))).status).toBe(413);
  });

  it('flash cookie: a value of exactly flashLimit keeps the input, one byte less trims it', async () => {
    const secrets = { current: 's'.repeat(32) };
    const flash = { ok: true, input: { body: 'x'.repeat(40) } };
    const full = await sealFlash(secrets, 'a', flash, 4096, 0);
    const limit = FLASH_COOKIE.length + 1 + full.value.length;
    expect((await sealFlash(secrets, 'a', flash, limit, 0)).trimmed).toEqual([]);
    expect((await sealFlash(secrets, 'a', flash, limit - 1, 0)).trimmed).toEqual(['input']);
  });
});

describe('timeouts', () => {
  const handler = (limits: Partial<typeof DEFAULT_LIMITS>, run: () => AsyncGenerator<StateFrame>) =>
    createHandler({
      development: false,
      limits,
      logger: { level: 'error', info() {}, warn() {}, error() {}, debug() {} },
      manifest: defineManifest({
        buildId: 'b1',
        routes: [{ pattern: '/', module: { default: () => null }, page }],
        transitions: { slow: run },
      }),
    });
  const frames = async (instance: ReturnType<typeof handler>) =>
    decodeFrames<WireFrame>(
      await (
        await instance.fetch(
          new Request('https://surface.test/transition/slow', {
            method: 'POST',
            headers: { 'x-surface-build': 'b1', 'x-surface-page': 'p' },
            body: '{}',
          })
        )
      ).text()
    );
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  it('idle: a gap below idleTimeout passes, a longer gap ends with a timeout error frame', async () => {
    const steady = await frames(
      handler({ idleTimeout: 150 }, async function* () {
        yield { type: 'state', states: { a: {} } };
        await wait(40);
        yield { type: 'state', full: false, states: { a: { n: 1 } }, changed: ['a'] };
      })
    );
    expect(steady.at(-1)).toEqual({ type: 'done' });
    const stalled = await frames(
      handler({ idleTimeout: 40 }, async function* () {
        yield { type: 'state', states: { a: {} } };
        await wait(150);
        yield { type: 'state', full: false, states: { a: { n: 1 } }, changed: ['a'] };
      })
    );
    expect(stalled).toHaveLength(2);
    expect(stalled[1]).toMatchObject({ type: 'error', kind: 'timeout' });
  });

  it('request: frames keep coming but the whole request stops at timeout', async () => {
    const started = performance.now();
    const result = await frames(
      handler({ timeout: 150, idleTimeout: 1000 }, async function* () {
        yield { type: 'state', states: { a: {} } };
        for (let i = 0; ; i++) {
          await wait(20);
          yield { type: 'state', full: false, states: { a: { i } }, changed: ['a'] };
        }
      })
    );
    expect(result.at(-1)).toMatchObject({ type: 'error', kind: 'timeout' });
    expect(result.length).toBeGreaterThan(2);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('browser receive limits', () => {
  it('an NDJSON line of exactly maxLine characters parses, one more stops the parser', () => {
    const frames: unknown[] = [];
    const errors: string[] = [];
    const line = (size: number) => JSON.stringify({ t: 'x'.repeat(size - 8) });
    expect(line(50)).toHaveLength(50);
    const parser = createNdjsonParser(
      frame => frames.push(frame),
      event => errors.push(event.stage),
      { maxLine: 50 }
    );
    parser.push(line(50) + '\n');
    expect(frames).toHaveLength(1);
    parser.push(line(51) + '\n' + line(10) + '\n');
    expect(errors).toEqual(['limit']);
    expect(frames).toHaveLength(1);
    expect(parser.stopped).toBe(true);
  });

  it('the server limit is the stricter one: bytes with the newline vs characters without', () => {
    // A frame at exactly the server frameSize always fits the browser's line limit.
    const frame: WireFrame = { type: 'patch', ops: [{ slot: 'a', props: { t: 'é'.repeat(40) } }] };
    const bytes = frameEncoder({ ...DEFAULT_LIMITS }, () => {})(frame).byteLength;
    const frames: unknown[] = [];
    const parser = createNdjsonParser(f => frames.push(f), undefined, { maxLine: bytes });
    parser.push(JSON.stringify(frame) + '\n');
    expect(frames).toEqual([frame]);
  });
});

describe('documented defaults', () => {
  it('PROTOCOL.md states the code defaults', () => {
    const text = readFileSync('PROTOCOL.md', 'utf8').replace(/\s+/g, ' ');
    expect(DEFAULT_LIMITS).toMatchObject({
      frameSize: 1024 * 1024,
      responseSize: 32 * 1024 * 1024,
      ops: 10_000,
      htmlSize: 512 * 1024,
      idleTimeout: 30_000,
      timeout: 300_000,
    });
    expect(text).toContain(
      'one NDJSON line 1 MB, one response 32 MB, 10,000 ops per request, one `html` op 512 KB, ' +
        '30 s idle between frames and 5 minutes per request. Development warns at 80%.'
    );
  });

  it('the adapter guide documents the Workers limits next to the engine timeouts', () => {
    const text = readFileSync('docs/server-adapters.md', 'utf8');
    const section = text.slice(text.indexOf('### Request time on Workers'));
    expect(section).toContain('limits.timeout');
    expect(section).toContain('cpu_ms');
    expect(section).toContain('idleTimeout');
  });
});
