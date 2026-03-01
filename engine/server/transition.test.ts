import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from './index.js';

let app: any;
beforeAll(async () => {
  ({ app } = await createApp());
});
import { registerTransition } from './transition.js';
import type { StateFrame } from '../shared/protocol.js';
import { decodeFrames } from '../shared/ndjson.js';

describe('POST /transition/:name', () => {
  beforeEach(() => {
    // Register a test transition
    registerTransition('test:article', async function* (params) {
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

  it('streams valid NDJSON for known transition', async () => {
    const res = await request(app)
      .post('/transition/test:article')
      .send({ articleId: 1 })
      .expect('Content-Type', /ndjson/);

    const frames = decodeFrames(res.text);
    expect(frames).toHaveLength(3);

    // First frame must be full
    expect(frames[0].type).toBe('state');
    if (frames[0].type === 'state') {
      expect(frames[0].full).not.toBe(false);
      expect(frames[0].states).toHaveProperty('page:article');
      expect(frames[0].states).toHaveProperty('loading');
    }

    // Second frame is partial
    expect(frames[1].type).toBe('state');
    if (frames[1].type === 'state') {
      expect(frames[1].full).toBe(false);
      expect(frames[1].changed).toContain('content:loaded');
      expect(frames[1].removed).toContain('loading');
    }

    // Last frame is done
    expect(frames[2].type).toBe('done');
  });

  it('sends error frame for invalid frames from handler', async () => {
    registerTransition('test:bad', async function* () {
      // This partial frame is invalid (no changed/removed)
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
});
