import { describe, it, expect, vi } from 'vitest';
import { createHandler } from './core/handler.js';
describe('SSR error responses', () => {
  it('hides internals in production and reports error with request context', async () => {
    const onError = vi.fn();
    const handler = createHandler({
      manifest: {
        routes: [
          {
            pattern: '/broken',
            module: {
              layout() {
                throw new Error('secret-internal-message');
              },
            },
          },
        ],
        templates: {},
        transitions: {},
      },
      onError,
    });
    const response = await handler.fetch(new Request('https://surface.test/broken'));
    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toBe('Internal Server Error');
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ url: new URL('https://surface.test/broken') })
    );
  });
  it('routes template rendering failures through onError without leaking comments', async () => {
    const onError = vi.fn();
    const handler = createHandler({
      manifest: {
        routes: [
          {
            pattern: '/',
            module: {
              layout: () => '<h-state name="broken"></h-state>',
              initial: () => ({ broken: {} }),
            },
          },
        ],
        transitions: {},
        templates: {
          broken() {
            throw new Error('secret-template-detail');
          },
        },
      },
      onError,
    });
    const response = await handler.fetch(new Request('https://surface.test/'));
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('Internal Server Error');
    expect(onError).toHaveBeenCalledOnce();
  });
});
