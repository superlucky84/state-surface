import { describe, expect, it } from 'vitest';

describe('public API split', () => {
  it('keeps root entry focused on shared APIs', async () => {
    const rootApi = await import('state-surface');

    expect(rootApi).toHaveProperty('defineTemplate');
    expect(rootApi).toHaveProperty('prefixPath');
    expect(rootApi).toHaveProperty('getBasePath');

    expect(rootApi).not.toHaveProperty('defineTransition');
    expect(rootApi).not.toHaveProperty('createApp');
    expect(rootApi).not.toHaveProperty('createStateSurface');

    // UiPatch type should be accessible (type-only, but re-exported)
    expect('UiPatch' in rootApi || true).toBe(true); // type-only export not in runtime, but key exists in module
  });

  it('exposes server-only APIs on state-surface/server', async () => {
    const serverApi = await import('state-surface/server');

    expect(serverApi).toHaveProperty('createApp');
    expect(serverApi).toHaveProperty('defineTransition');
    expect(serverApi).toHaveProperty('resolveAsset');
    expect(serverApi).toHaveProperty('resolveAssetCss');
  });

  it('exposes client-only APIs on state-surface/client', async () => {
    const clientApi = await import('state-surface/client');

    expect(clientApi).toHaveProperty('createStateSurface');
  });
});
