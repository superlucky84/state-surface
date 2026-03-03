import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from './index.js';
import type { StateFrame } from '../shared/protocol.js';
import { decodeFrames } from '../shared/ndjson.js';
import type { TransitionHandler, TransitionRegistry } from './transition.js';

let app: any;
let appWithHooks: any;
let appWithShortTimeout: any;
let appWithSmallBodyLimit: any;
let transitionRegistries: TransitionRegistry[] = [];
const afterHook = vi.fn();

function registerOnAllApps(name: string, handler: TransitionHandler) {
  for (const registry of transitionRegistries) {
    registry.registerTransition(name, handler);
  }
}

beforeAll(async () => {
  ({ app } = await createApp());
  ({ app: appWithHooks } = await createApp({
    hooks: {
      onBeforeTransition({ body }) {
        return { ...body, fromHook: true };
      },
      onAfterTransition({ name }) {
        afterHook(name);
      },
    },
  }));
  ({ app: appWithShortTimeout } = await createApp({ transitionTimeout: 20 }));
  ({ app: appWithSmallBodyLimit } = await createApp({ bodyLimit: '16b' }));

  transitionRegistries = [
    app.locals.transitionRegistry,
    appWithHooks.locals.transitionRegistry,
    appWithShortTimeout.locals.transitionRegistry,
    appWithSmallBodyLimit.locals.transitionRegistry,
  ];
});

describe('POST /transition/:name', () => {
  beforeEach(() => {
    afterHook.mockClear();
    for (const registry of transitionRegistries) {
      registry.clearRegistry();
    }

    registerOnAllApps('test:article', async function* (params) {
      yield {
        type: 'state',
        states: {
          'page:article': { articleId: params.articleId },
          loading: { articleId: params.articleId },
        },
      } satisfies StateFrame;

      yield {
        type: 'state',
        full: false,
        states: { 'content:loaded': { title: 'Hello' } },
        changed: ['content:loaded'],
        removed: ['loading'],
      } satisfies StateFrame;

      yield { type: 'done' } satisfies StateFrame;
    });
  });

  it('returns 404 for unknown transition', async () => {
    const res = await request(app).post('/transition/unknown').send({});
    expect(res.status).toBe(404);
  });

  it('applies default security headers on transition responses', async () => {
    const res = await request(app).post('/transition/test:article').send({ articleId: 1 });

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('streams valid NDJSON for known transition', async () => {
    const res = await request(app)
      .post('/transition/test:article')
      .send({ articleId: 1 })
      .expect('Content-Type', /ndjson/);

    const frames = decodeFrames(res.text);
    expect(frames).toHaveLength(3);

    expect(frames[0].type).toBe('state');
    if (frames[0].type === 'state') {
      expect(frames[0].full).not.toBe(false);
      expect(frames[0].states).toHaveProperty('page:article');
      expect(frames[0].states).toHaveProperty('loading');
    }

    expect(frames[1].type).toBe('state');
    if (frames[1].type === 'state') {
      expect(frames[1].full).toBe(false);
      expect(frames[1].changed).toContain('content:loaded');
      expect(frames[1].removed).toContain('loading');
    }

    expect(frames[2].type).toBe('done');
  });

  it('sends error frame for invalid frames from handler', async () => {
    registerOnAllApps('test:bad', async function* () {
      yield {
        type: 'state',
        full: false,
        states: { a: { x: 1 } },
      } as any;
    });

    const res = await request(app).post('/transition/test:bad').send({});
    const frames = decodeFrames(res.text);

    expect(frames.some(f => f.type === 'error')).toBe(true);
  });

  it('sends error frame when transition generator throws', async () => {
    registerOnAllApps('test:throws', async function* () {
      yield {
        type: 'state',
        states: { a: { ok: true } },
      } satisfies StateFrame;

      throw new Error('transition exploded');
    });

    const res = await request(app).post('/transition/test:throws').send({});
    const frames = decodeFrames(res.text);

    expect(frames).toHaveLength(2);
    expect(frames[0].type).toBe('state');
    expect(frames[1].type).toBe('error');
    if (frames[1].type === 'error') {
      expect(frames[1].message).toContain('transition exploded');
    }
  });

  it('emits timeout error frame when transition exceeds configured timeout', async () => {
    registerOnAllApps('test:timeout', async function* () {
      await new Promise(resolve => setTimeout(resolve, 100));
      yield { type: 'done' } satisfies StateFrame;
    });

    const res = await request(appWithShortTimeout).post('/transition/test:timeout').send({});
    const frames = decodeFrames(res.text);

    expect(frames.some(frame => frame.type === 'error')).toBe(true);
    expect(frames.some(frame => frame.type === 'done')).toBe(false);
    const timeoutFrame = frames.find(frame => frame.type === 'error');
    if (timeoutFrame?.type === 'error') {
      expect(timeoutFrame.message).toContain('Transition timeout');
    }
  });

  it('respects bodyLimit option for transition requests', async () => {
    const res = await request(appWithSmallBodyLimit)
      .post('/transition/test:article')
      .send({ payload: 'x'.repeat(128) });

    expect(res.status).toBe(413);
  });

  it('keeps default body when hooks are not registered', async () => {
    registerOnAllApps('test:no-hooks', async function* (params) {
      yield {
        type: 'state',
        states: { payload: params },
      } satisfies StateFrame;
      yield { type: 'done' } satisfies StateFrame;
    });

    const res = await request(app).post('/transition/test:no-hooks').send({ q: 1 });
    const frames = decodeFrames(res.text);

    expect(frames[0].type).toBe('state');
    if (frames[0].type === 'state') {
      expect(frames[0].states.payload).toMatchObject({ q: 1 });
      expect(frames[0].states.payload).not.toHaveProperty('fromHook');
    }
  });

  it('applies onBeforeTransition body transform when hooks are registered', async () => {
    registerOnAllApps('test:with-hooks', async function* (params) {
      yield {
        type: 'state',
        states: { payload: params },
      } satisfies StateFrame;
      yield { type: 'done' } satisfies StateFrame;
    });

    const res = await request(appWithHooks).post('/transition/test:with-hooks').send({ q: 1 });
    const frames = decodeFrames(res.text);

    expect(frames[0].type).toBe('state');
    if (frames[0].type === 'state') {
      expect(frames[0].states.payload).toMatchObject({ q: 1, fromHook: true });
    }
  });

  it('calls onAfterTransition after stream completion', async () => {
    await request(appWithHooks).post('/transition/test:article').send({ articleId: 7 });

    expect(afterHook).toHaveBeenCalledWith('test:article');
    expect(afterHook).toHaveBeenCalledTimes(1);
  });

  it('isolates transition registries per app instance', async () => {
    transitionRegistries[0].registerTransition('test:isolated', async function* () {
      yield { type: 'done' } satisfies StateFrame;
    });

    const ok = await request(app).post('/transition/test:isolated').send({});
    expect(ok.status).toBe(200);

    const missing = await request(appWithHooks).post('/transition/test:isolated').send({});
    expect(missing.status).toBe(404);
  });
});
