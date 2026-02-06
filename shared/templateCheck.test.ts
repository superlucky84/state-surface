import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerTemplate, clearRegistry } from './templateRegistry.js';
import { verifyTemplates } from './templateCheck.js';

const stub = (() => () => ({})) as any;

describe('verifyTemplates', () => {
  beforeEach(() => {
    clearRegistry();
  });

  it('returns empty array when all templates are registered', () => {
    registerTemplate('a', stub);
    registerTemplate('b', stub);
    expect(verifyTemplates(['a', 'b'])).toEqual([]);
  });

  it('throws in strict mode (default) when templates are missing', () => {
    registerTemplate('a', stub);
    expect(() => verifyTemplates(['a', 'b', 'c'])).toThrow('Missing templates: b, c');
  });

  it('warns and returns missing list in non-strict mode', () => {
    registerTemplate('a', stub);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const missing = verifyTemplates(['a', 'b'], { strict: false });

    expect(missing).toEqual(['b']);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Missing templates: b'));
    warnSpy.mockRestore();
  });

  it('handles empty required list', () => {
    expect(verifyTemplates([])).toEqual([]);
  });
});
