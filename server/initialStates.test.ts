import { describe, it, expect, beforeEach } from 'vitest';
import type { RouteModule } from '../shared/routeModule.js';
import { getInitialStates } from './initialStates.js';
import { registerTransition } from './transition.js';
import type { StateFrame } from '../shared/protocol.js';

// Minimal Express request mock
function mockReq(params: Record<string, string> = {}): any {
  return { params, query: {}, body: {} };
}

describe('getInitialStates', () => {
  beforeEach(() => {
    // Register a test transition that yields a full first frame
    registerTransition('test-full', async function* () {
      yield {
        type: 'state',
        states: {
          'page:header': { title: 'Test' },
          'page:content': { body: 'Hello' },
        },
      } satisfies StateFrame;
      yield { type: 'done' } satisfies StateFrame;
    });

    // Register a transition that yields a partial first frame
    registerTransition('test-partial', async function* () {
      yield {
        type: 'state',
        full: false,
        states: { 'page:content': { body: 'Partial' } },
        changed: ['page:content'],
      } satisfies StateFrame;
      yield { type: 'done' } satisfies StateFrame;
    });
  });

  it('uses initial when provided (sync)', async () => {
    const route: RouteModule = {
      layout: () => '',
      initial: () => ({ 'page:header': { title: 'Static' } }),
    };

    const states = await getInitialStates(route, mockReq());
    expect(states).toEqual({ 'page:header': { title: 'Static' } });
  });

  it('uses initial when provided (async)', async () => {
    const route: RouteModule = {
      layout: () => '',
      initial: async () => ({ 'page:header': { title: 'Async' } }),
    };

    const states = await getInitialStates(route, mockReq());
    expect(states).toEqual({ 'page:header': { title: 'Async' } });
  });

  it('falls back to transition first full frame when no initial', async () => {
    const route: RouteModule = {
      layout: () => '',
      transition: 'test-full',
    };

    const states = await getInitialStates(route, mockReq());
    expect(states).toEqual({
      'page:header': { title: 'Test' },
      'page:content': { body: 'Hello' },
    });
  });

  it('passes params to transition', async () => {
    registerTransition('test-params', async function* (params) {
      yield {
        type: 'state',
        states: { 'page:content': { id: params.id } },
      } satisfies StateFrame;
      yield { type: 'done' } satisfies StateFrame;
    });

    const route: RouteModule = {
      layout: () => '',
      transition: 'test-params',
      params: req => ({ id: Number(req.params.id) }),
    };

    const states = await getInitialStates(route, mockReq({ id: '42' }));
    expect(states['page:content'].id).toBe(42);
  });

  it('returns empty object when no initial and no transition', async () => {
    const route: RouteModule = {
      layout: () => '',
    };

    const states = await getInitialStates(route, mockReq());
    expect(states).toEqual({});
  });

  it('throws when transition not found in registry', async () => {
    const route: RouteModule = {
      layout: () => '',
      transition: 'nonexistent',
    };

    await expect(getInitialStates(route, mockReq())).rejects.toThrow(
      'transition "nonexistent" not found'
    );
  });

  it('throws when first frame is partial and no initial', async () => {
    const route: RouteModule = {
      layout: () => '',
      transition: 'test-partial',
    };

    await expect(getInitialStates(route, mockReq())).rejects.toThrow(
      'full first frame'
    );
  });
});
