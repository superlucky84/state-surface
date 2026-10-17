import { describe, expect, it } from 'vitest';
import manifest from 'virtual:state-surface/manifest';
import { createHandler } from 'state-surface/server';

const handler = createHandler({ manifest, development: true });
const get = (path: string, init?: RequestInit) =>
  handler.fetch(new Request('http://localhost' + path, init));

describe('showcase site', () => {
  it('redirects a path without a language and renders the home page', async () => {
    const redirect = await get('/', { headers: { 'accept-language': 'ko' } });
    expect([redirect.status, redirect.headers.get('location')]).toEqual([302, '/ko']);
    const home = await get('/en');
    expect(home.status).toBe(200);
    const html = await home.text();
    expect(html).toContain('<h-state name="page:hero"');
    expect(html).toContain('<link rel="alternate" hreflang="ko" href="/ko" data-ss>');
  });

  it('renders a guide from the content collection with highlighted code', async () => {
    const html = await (await get('/en/guide/surface')).text();
    expect(html).toContain('<span class="token keyword">');
  });

  it('streams search results into the server slot', async () => {
    const response = await get('/transition/search', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-surface-build': manifest.buildId ?? 'dev',
        'x-surface-page': '[lang]/examples/search',
      },
      body: JSON.stringify({ query: 'stream', lang: 'en' }),
    });
    const frames = (await response.text())
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    const slots = frames.flatMap(frame => frame.ops ?? []).map(op => op.slot);
    expect(slots).toContain('search:results');
    expect(frames.at(-1)).toEqual({ type: 'done' });
  });
});
