/**
 * @vitest-environment happy-dom
 *
 * Integration tests: server NDJSON stream → client StateSurface apply path.
 * Uses supertest for server and StateSurface with mock callbacks for client.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from './index.js';
import { decodeFrames } from '../shared/ndjson.js';
import { StateSurface } from '../client/stateSurface.js';
import type { TraceEvent, StateSurfaceOptions } from '../client/stateSurface.js';
import type { StateFrame } from '../shared/protocol.js';

type RenderCall = { name: string; data: any };

function createTestSurface() {
  const rendered: RenderCall[] = [];
  const updated: RenderCall[] = [];
  const unmounted: string[] = [];
  const traces: TraceEvent[] = [];

  const opts: StateSurfaceOptions = {
    renderTemplate: (name, data, _el) => rendered.push({ name, data }),
    hydrateTemplate: (_name, _data, _el) => () => {},
    updateTemplate: (name, data, _el) => updated.push({ name, data }),
    unmountTemplate: (name, _el) => unmounted.push(name),
    trace: event => traces.push(event),
    frameBudgetMs: 1000,
  };
  const surface = new StateSurface(opts);
  return { surface, rendered, updated, unmounted, traces };
}

function setupAnchors(names: string[]) {
  document.body.innerHTML = names.map(name => `<h-state name="${name}"></h-state>`).join('');
}

/**
 * Feed server NDJSON response through StateSurface's frame pipeline.
 */
function feedFramesToSurface(surface: StateSurface, frames: StateFrame[]) {
  for (const frame of frames) {
    if (frame.type === 'state') {
      (surface as any).frameQueue.push(frame);
    } else if (frame.type === 'done') {
      (surface as any).flushAll();
    } else if (frame.type === 'error') {
      (surface as any).handleError(frame);
    }
  }
  (surface as any).flushQueue(true);
}

describe('server stream → client apply (guide-load)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('full pipeline: server frames produce correct client state', async () => {
    // 1. Get frames from server
    const res = await request(app).post('/transition/guide-load').send({ slug: 'surface' });

    const frames = decodeFrames(res.text);

    // 2. Set up client
    setupAnchors(['page:header', 'guide:toc', 'guide:content', 'system:error']);
    const { surface, rendered, updated } = createTestSurface();
    surface.discoverAnchors();

    // 3. Feed server frames to client
    feedFramesToSurface(surface, frames);

    // 4. Verify final state
    expect(surface.activeStates['page:header']).toHaveProperty('title');
    expect(surface.activeStates['guide:toc'].slug).toBe('surface');
    expect(surface.activeStates['guide:content'].loading).toBe(false);
    expect(surface.activeStates['guide:content'].sections.length).toBeGreaterThan(0);

    // toc rendered once, content rendered once then updated once
    expect(rendered.filter(r => r.name === 'guide:toc')).toHaveLength(1);
    expect(rendered.filter(r => r.name === 'guide:content')).toHaveLength(1);
    expect(updated.filter(u => u.name === 'guide:content')).toHaveLength(1);
  });
});

describe('home route surface independence', () => {
  it('GET / renders home slots only (no cross-page leakage)', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('name="page:hero"');
    expect(res.text).toContain('name="page:concepts"');
    expect(res.text).toContain('name="page:features"');
    expect(res.text).not.toContain('name="guide:content"');
    expect(res.text).not.toContain('name="demo:controls"');
    expect(res.text).not.toContain('name="search:input"');
    expect(res.text).not.toContain('name="search:results"');
  });
});

describe('server stream → client apply (search)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('full pipeline: search frames produce correct client state', async () => {
    const res = await request(app).post('/transition/search').send({ query: 'streaming' });

    const frames = decodeFrames(res.text);

    setupAnchors(['page:header', 'search:input', 'search:results', 'system:error']);
    const { surface, rendered, updated } = createTestSurface();
    surface.discoverAnchors();

    feedFramesToSurface(surface, frames);

    expect(surface.activeStates['search:input'].query).toBe('streaming');
    expect(surface.activeStates['search:results'].loading).toBe(false);
    expect(surface.activeStates['search:results'].items.length).toBeGreaterThan(0);

    // results rendered once then updated once
    expect(rendered.filter(r => r.name === 'search:results')).toHaveLength(1);
    expect(updated.filter(u => u.name === 'search:results')).toHaveLength(1);

    // header and input not updated (only partial changed search:results)
    expect(updated.filter(u => u.name === 'page:header')).toHaveLength(0);
    expect(updated.filter(u => u.name === 'search:input')).toHaveLength(0);
  });
});
