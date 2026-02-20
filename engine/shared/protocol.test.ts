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

  it('rejects state frame with array states', () => {
    expect(validateStateFrame({ type: 'state', states: [1, 2] }).valid).toBe(false);
  });

  it('rejects partial with non-array changed', () => {
    const result = validateStateFrame({
      type: 'state',
      full: false,
      states: { a: {} },
      changed: 'a' as any,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects partial with non-array removed', () => {
    const result = validateStateFrame({
      type: 'state',
      full: false,
      states: {},
      removed: 'a' as any,
    });
    expect(result.valid).toBe(false);
  });

  it('accepts partial with empty changed but non-empty removed', () => {
    const result = validateStateFrame({
      type: 'state',
      full: false,
      states: {},
      changed: [],
      removed: ['a'],
    });
    expect(result).toEqual({ valid: true });
  });

  it('accepts error frame without template', () => {
    expect(validateStateFrame({ type: 'error', message: 'fail' })).toEqual({ valid: true });
  });

  // ── Accumulate frames ──

  it('accepts a valid accumulate frame', () => {
    const result = validateStateFrame({
      type: 'state',
      accumulate: true,
      states: { 'chat:current': { text: 'He' } },
    });
    expect(result).toEqual({ valid: true });
  });

  it('accepts accumulate frame with empty states', () => {
    const result = validateStateFrame({
      type: 'state',
      accumulate: true,
      states: {},
    });
    expect(result).toEqual({ valid: true });
  });

  it('rejects accumulate frame with removed', () => {
    const result = validateStateFrame({
      type: 'state',
      accumulate: true,
      states: { 'chat:current': { text: 'x' } },
      removed: ['chat:typing'],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain('"removed"');
    }
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

  it('full frame with empty states clears all active', () => {
    const active = { a: { x: 1 }, b: { y: 2 } };
    const frame: StateFrameState = { type: 'state', states: {} };
    expect(applyFrame(active, frame)).toEqual({});
  });

  it('partial frame preserves untouched keys', () => {
    const active = { a: { x: 1 }, b: { y: 2 }, c: { z: 3 } };
    const frame: StateFrameState = {
      type: 'state',
      full: false,
      states: { b: { y: 20 } },
      changed: ['b'],
    };
    const result = applyFrame(active, frame);
    expect(result.a).toEqual({ x: 1 });
    expect(result.b).toEqual({ y: 20 });
    expect(result.c).toEqual({ z: 3 });
  });

  it('precedence: removed applied after merge does not resurrect key', () => {
    // Even if states has a key that's also in removed,
    // removed wins because delete happens after merge
    const active = { a: { x: 1 }, b: { y: 2 } };
    const frame: StateFrameState = {
      type: 'state',
      full: false,
      states: { a: { x: 999 } },
      changed: ['a'],
      removed: ['b'],
    };
    const result = applyFrame(active, frame);
    expect(result).toEqual({ a: { x: 999 } });
    expect(result).not.toHaveProperty('b');
  });

  // ── Accumulate ──

  it('accumulate: array fields are concatenated', () => {
    const active = { 'chat:messages': { messages: [{ id: 'u1', role: 'user', text: 'Hi' }] } };
    const frame: StateFrameState = {
      type: 'state',
      accumulate: true,
      states: { 'chat:messages': { messages: [{ id: 'b1', role: 'bot', text: 'Hello' }] } },
    };
    const result = applyFrame(active, frame);
    expect(result['chat:messages'].messages).toHaveLength(2);
    expect(result['chat:messages'].messages[1].id).toBe('b1');
  });

  it('accumulate: string fields are concatenated', () => {
    const active = { 'chat:current': { text: 'He' } };
    const frame: StateFrameState = {
      type: 'state',
      accumulate: true,
      states: { 'chat:current': { text: 'llo' } },
    };
    const result = applyFrame(active, frame);
    expect(result['chat:current'].text).toBe('Hello');
  });

  it('accumulate: scalar fields are replaced', () => {
    const active = { slot: { count: 1, label: 'old' } };
    const frame: StateFrameState = {
      type: 'state',
      accumulate: true,
      states: { slot: { count: 2 } },
    };
    const result = applyFrame(active, frame);
    expect(result.slot.count).toBe(2);
    expect(result.slot.label).toBe('old'); // untouched field preserved
  });

  it('accumulate: non-existent slot is initialized from incoming', () => {
    const active = {};
    const frame: StateFrameState = {
      type: 'state',
      accumulate: true,
      states: { 'chat:current': { text: 'Hi' } },
    };
    const result = applyFrame(active, frame);
    expect(result['chat:current'].text).toBe('Hi');
  });

  it('accumulate: does not touch slots absent from frame', () => {
    const active = { a: { x: 1 }, b: { y: 2 } };
    const frame: StateFrameState = {
      type: 'state',
      accumulate: true,
      states: { a: { x: 10 } },
    };
    const result = applyFrame(active, frame);
    expect(result.b).toEqual({ y: 2 });
  });

  it('full frame after accumulate resets the slot', () => {
    const active = { 'chat:current': { text: 'Hello world' } };
    const frame: StateFrameState = {
      type: 'state',
      states: { 'chat:current': { text: '' } },
    };
    const result = applyFrame(active, frame);
    expect(result['chat:current'].text).toBe('');
  });
});
