import { describe, it, expect, vi } from 'vitest';
import { h } from 'lithent';
import { createHandler } from './core/handler.js';
import { Island, Slot } from '../shared/surfaceTree.js';
describe('SSR error responses', () => {
  it('hides internals in production and reports error with request context', async () => {
    const onError = vi.fn();
    const handler = createHandler({
      manifest: {
        routes: [
          {
            pattern: '/broken',
            module: {
              default() {
                throw new Error('secret-internal-message');
              },
            },
          },
        ],
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
  it('routes slot component failures through onError without leaking details', async () => {
    const onError = vi.fn();
    const Broken = () => {
      throw new Error('secret-template-detail');
    };
    const handler = createHandler({
      manifest: {
        routes: [
          {
            pattern: '/',
            module: {
              // Compiled form of <Slot name="broken"><Broken /></Slot>.
              default: () =>
                h(
                  'html',
                  {},
                  h('head', {}),
                  h(
                    'body',
                    {},
                    h(
                      Slot as never,
                      { name: 'broken' },
                      h(Island as never, { __ssComponent: Broken, __ssId: 'Broken.tsx#default' })
                    )
                  )
                ),
            },
          },
        ],
        transitions: {},
      },
      onError,
    });
    const response = await handler.fetch(new Request('https://surface.test/'));
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('Internal Server Error');
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].message).toBe('secret-template-detail');
  });
});
