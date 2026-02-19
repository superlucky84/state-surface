import { describe, it, expect, afterEach } from 'vitest';
import { setBasePath, getBasePath, prefixPath } from '../../shared/basePath.js';

afterEach(() => {
  // Reset singleton after each test
  setBasePath('');
});

describe('setBasePath / getBasePath', () => {
  it('defaults to empty string', () => {
    expect(getBasePath()).toBe('');
  });

  it('stores normalized path', () => {
    setBasePath('/state-surface');
    expect(getBasePath()).toBe('/state-surface');
  });

  it('adds leading slash if missing', () => {
    setBasePath('state-surface');
    expect(getBasePath()).toBe('/state-surface');
  });

  it('removes trailing slash', () => {
    setBasePath('/state-surface/');
    expect(getBasePath()).toBe('/state-surface');
  });

  it('handles deeply nested path', () => {
    setBasePath('/a/b/c/');
    expect(getBasePath()).toBe('/a/b/c');
  });

  it('resets on empty string', () => {
    setBasePath('/demo');
    setBasePath('');
    expect(getBasePath()).toBe('');
  });

  it('resets on "/"', () => {
    setBasePath('/demo');
    setBasePath('/');
    expect(getBasePath()).toBe('');
  });
});

describe('prefixPath — zero-cost default (basePath empty)', () => {
  it('returns url unchanged when basePath is empty', () => {
    expect(prefixPath('/')).toBe('/');
    expect(prefixPath('/guide/surface')).toBe('/guide/surface');
    expect(prefixPath('/features/streaming')).toBe('/features/streaming');
    expect(prefixPath('/transition/search')).toBe('/transition/search');
  });
});

describe('prefixPath — with basePath set', () => {
  it('prefixes / correctly', () => {
    setBasePath('/demo');
    expect(prefixPath('/')).toBe('/demo/');
  });

  it('prefixes absolute paths', () => {
    setBasePath('/demo');
    expect(prefixPath('/guide/surface')).toBe('/demo/guide/surface');
    expect(prefixPath('/transition/search')).toBe('/demo/transition/search');
    expect(prefixPath('/client/main.ts')).toBe('/demo/client/main.ts');
  });

  it('adds leading slash to relative paths', () => {
    setBasePath('/demo');
    expect(prefixPath('guide/surface')).toBe('/demo/guide/surface');
  });

  it('works with multi-segment basePath', () => {
    setBasePath('/a/b');
    expect(prefixPath('/c')).toBe('/a/b/c');
  });
});
