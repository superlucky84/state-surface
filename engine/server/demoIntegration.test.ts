/**
 * @vitest-environment happy-dom
 *
 * Integration: the demo server's SSR HTML and transition streams applied by the browser
 * runtime (StateSurface + SlotDom + ComponentHost) in a DOM.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createDemo, surfaceHeaders } from '../../testing/server.js';
import { StateSurface } from '../client/stateSurface.js';
import { ComponentHost } from '../client/componentHost.js';
import { SlotDom } from '../client/slotDom.js';
import { readBootstrap } from '../client/bootstrap.js';

let app: any;
beforeAll(async () => {
  ({ server: app } = await createDemo());
});
afterEach(() => vi.unstubAllGlobals());

/** Load an SSR page into the document and start the runtime with a fetch bound to the server. */
async function open(path: string) {
  const page = await request(app).get(path);
  // Keep the bootstrap JSON; drop assets so the DOM does not try to fetch them.
  const html = page.text
    .replace('<!doctype html>', '')
    .replace(/<link [^>]*>/g, '')
    .replace(/<script type="module"[^>]*><\/script>/g, '');
  document.documentElement.innerHTML = html.replace(/^<html[^>]*>|<\/html>$/g, '');
  const bootstrap = readBootstrap(document);
  const requests: string[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    requests.push(url);
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Surface-Build']).toBe(surfaceHeaders(bootstrap.pageId)['x-surface-build']);
    expect(headers['X-Surface-Page']).toBe(bootstrap.pageId);
    const res = await request(app)
      .post(url)
      .set(headers)
      .send(JSON.parse(String(init.body)));
    return new Response(res.text, {
      status: res.status,
      headers: { 'content-type': String(res.headers['content-type']) },
    });
  });
  const host = new ComponentHost({ loaders: {} });
  const surface = new StateSurface({
    bootstrap,
    slots: bootstrap.slots ?? [],
    host,
    dom: new SlotDom(host, undefined),
  });
  surface.discoverAnchors();
  const text = (slot: string) =>
    document.querySelector(`h-state[name="${slot}"]`)?.textContent ?? '';
  return { surface, text, requests };
}

describe('server stream → browser apply', () => {
  it('guide page arrives with its sections and static toc, without a boot transition', async () => {
    const { text, requests } = await open('/en/guide/surface');
    expect(readBootstrap(document).boot).toBeUndefined();
    expect(document.querySelector('h-state[name="guide:content"]')).toBeNull();
    expect(document.querySelector('.animate-pulse')).toBeNull();
    expect(document.querySelectorAll('article section').length).toBeGreaterThan(1);
    expect(document.querySelector('article .token.keyword')).not.toBeNull();
    expect(text('guide:toc')).toContain('Surface');
    // Nothing runs on load: the HTML is the guide.
    expect(requests).toEqual([]);
  });

  it('search updates input and results; the static header markup stays', async () => {
    const { surface, text } = await open('/en/examples/search');
    const header = document.querySelector('h-state[name="page:header"]')!;
    const headerHtml = header.innerHTML;
    expect(text('search:results')).toBe('');
    expect(await surface.transition('search', { query: 'streaming', lang: 'en' })).toEqual({
      ok: true,
    });
    expect(text('search:results')).toContain('Streaming Demo');
    expect(document.querySelector('h-state[name="page:header"]')).toBe(header);
    expect(header.innerHTML).toBe(headerHtml);
    expect(
      (
        document.querySelector(
          'h-state[name="search:input"] input[name="query"]'
        ) as HTMLInputElement
      ).value
    ).toBe('streaming');
  });

  it('streaming demo removes and restores output and shows the error slot', async () => {
    const { surface, text } = await open('/en/examples/streaming');
    expect(await surface.transition('stream-demo', { mode: 'full-sequence', lang: 'en' })).toEqual({
      ok: true,
    });
    expect(text('demo:output')).toContain('restored');
    expect(text('demo:timeline')).toContain('Accumulate');
    expect(
      await surface.transition('stream-demo', { mode: 'error-demo', lang: 'en' })
    ).toMatchObject({
      ok: false,
      error: { kind: 'server' },
    });
    expect(text('system:error')).toContain('demonstration error');
    // The next request's baseline clears the error slot.
    expect(await surface.transition('stream-demo', { mode: 'full-sequence', lang: 'en' })).toEqual({
      ok: true,
    });
    expect(text('system:error')).toBe('');
  }, 15000);

  it('ui-patch demo applies and resets the slot UI patch', async () => {
    const { surface } = await open('/en/examples/ui-patch');
    const preview = () => document.querySelector('h-state[name="uipatch:preview"]') as HTMLElement;
    await surface.transition('ui-patch-demo', { action: 'theme', theme: 'warning' });
    expect(preview().classList.contains('tone-warning')).toBe(true);
    expect(preview().style.getPropertyValue('--card-accent')).toBe('#f59e0b');
    await surface.transition('ui-patch-demo', { action: 'clear' });
    expect(preview().getAttribute('class')).toBe('');
    expect(preview().style.getPropertyValue('--card-accent')).toBe('');
  });
});

describe('home route surface independence', () => {
  it('GET /en renders home slots only (no cross-page leakage)', async () => {
    const res = await request(app).get('/en');
    expect(res.status).toBe(200);
    expect(res.text).toContain('name="page:hero"');
    expect(res.text).not.toContain('name="guide:content"');
    expect(res.text).not.toContain('name="search:results"');
  });
});
