import { describe, expect, it } from 'vitest';
import manifest from 'virtual:state-surface/manifest';
import { createHandler } from 'state-surface/server';

const handler = createHandler({ manifest, development: true });
const origin = 'http://localhost';

describe('home page', () => {
  it('renders static markup, the server slot and the island', async () => {
    const response = await handler.fetch(new Request(origin + '/'));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('Hello, StateSurface');
    expect(html).toContain('<h-state name="home:greeting">');
    expect(html).toContain('Clicked 0 times');
  });

  it('greets through the transition', async () => {
    const response = await handler.fetch(
      new Request(origin + '/transition/greet', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-surface-build': manifest.buildId ?? 'dev',
          'x-surface-page': 'index',
        },
        body: JSON.stringify({ name: 'Ada' }),
      })
    );
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');
    const frames = (await response.text())
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    expect(frames[0].ops[0]).toMatchObject({ slot: 'home:greeting' });
    expect(frames[0].ops[0].html).toContain('<strong>Ada</strong>');
    expect(frames.at(-1)).toEqual({ type: 'done' });
  });
});
