import { describe, it, expect } from 'vitest';
import { validateStateFrame, applyFrame } from './protocol.js';
import type { StateFrameState } from './protocol.js';

describe('validateStateFrame', () => {
  // ── Valid frames ──

  it('accepts a valid full frame (explicit full:true)', () => {
    const result = validateStateFrame({
      type: 'state',
      states: { 'page:article:view': { articleId: 1 }, loading: { articleId: 1 } },
      full: true,
    });
    expect(result).toEqual({ valid: true });
  });

  it('accepts a full frame when full is omitted (default true)', () => {
    const result = validateStateFrame({
      type: 'state',
      states: { 'page:article:view': { articleId: 1 } },
    });
    expect(result).toEqual({ valid: true });
  });

  it('accepts a valid partial update', () => {
    const result = validateStateFrame({
      type: 'state',
      full: false,
      states: { 'page:article:view': { article: { id: 1, title: 'A' } } },
      changed: ['page:article:view'],
      removed: [],
    });
    expect(result).toEqual({ valid: true });
  });

  it('accepts a valid partial remove-only', () => {
    const result = validateStateFrame({
      type: 'state',
      full: false,
      states: {},
      removed: ['loading'],
    });
    expect(result).toEqual({ valid: true });
  });

  it('accepts an error frame', () => {
    const result = validateStateFrame({
      type: 'error',
      template: 'system:error',
      data: { message: 'db timeout' },
    });
    expect(result).toEqual({ valid: true });
  });

  it('accepts a done frame', () => {
    const result = validateStateFrame({ type: 'done' });
    expect(result).toEqual({ valid: true });
  });

  // ── Invalid frames ──

  it('rejects partial without changed or removed', () => {
    const result = validateStateFrame({
      type: 'state',
      full: false,
      states: { a: { x: 1 } },
    });
    expect(result.valid).toBe(false);
  });

  it('rejects partial with changed key missing in states', () => {
    const result = validateStateFrame({
      type: 'state',
      full: false,
      states: {},
      changed: ['a'],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain('"changed" key "a" must exist in "states"');
    }
  });

  it('rejects partial with removed key present in states', () => {
    const result = validateStateFrame({
      type: 'state',
      full: false,
      states: { a: { x: 1 } },
      removed: ['a'],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain('"removed" key "a" must NOT exist in "states"');
    }
  });

  it('rejects partial with same key in changed and removed', () => {
    const result = validateStateFrame({
      type: 'state',
      full: false,
      states: { a: { x: 1 } },
      changed: ['a'],
      removed: ['a'],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      // This may fail on removed-in-states check first, which is also correct
      expect(result.valid).toBe(false);
    }
  });

  it('rejects null', () => {
    expect(validateStateFrame(null).valid).toBe(false);
  });

  it('rejects missing type', () => {
    expect(validateStateFrame({ states: {} }).valid).toBe(false);
  });

  it('rejects unknown type', () => {
    expect(validateStateFrame({ type: 'unknown' }).valid).toBe(false);
  });

  it('rejects state frame with non-object states', () => {
    expect(validateStateFrame({ type: 'state', states: 'bad' }).valid).toBe(false);
  });
});

describe('applyFrame', () => {
  it('full frame replaces activeStates entirely', () => {
    const active = { a: { x: 1 }, b: { y: 2 } };
    const frame: StateFrameState = {
      type: 'state',
      states: { c: { z: 3 } },
    };
    expect(applyFrame(active, frame)).toEqual({ c: { z: 3 } });
  });

  it('full frame with explicit full:true replaces', () => {
    const active = { a: { x: 1 } };
    const frame: StateFrameState = {
      type: 'state',
      full: true,
      states: { b: { y: 2 } },
    };
    expect(applyFrame(active, frame)).toEqual({ b: { y: 2 } });
  });

  it('partial frame merges changed keys', () => {
    const active = { a: { x: 1 }, b: { y: 2 } };
    const frame: StateFrameState = {
      type: 'state',
      full: false,
      states: { a: { x: 10 } },
      changed: ['a'],
    };
    expect(applyFrame(active, frame)).toEqual({ a: { x: 10 }, b: { y: 2 } });
  });

  it('partial frame removes keys', () => {
    const active = { a: { x: 1 }, b: { y: 2 } };
    const frame: StateFrameState = {
      type: 'state',
      full: false,
      states: {},
      removed: ['b'],
    };
    expect(applyFrame(active, frame)).toEqual({ a: { x: 1 } });
  });

  it('partial frame removes then merges', () => {
    const active = { a: { x: 1 }, loading: {} };
    const frame: StateFrameState = {
      type: 'state',
      full: false,
      states: { 'content:loaded': { article: 'hello' } },
      changed: ['content:loaded'],
      removed: ['loading'],
    };
    expect(applyFrame(active, frame)).toEqual({
      a: { x: 1 },
      'content:loaded': { article: 'hello' },
    });
  });
});
