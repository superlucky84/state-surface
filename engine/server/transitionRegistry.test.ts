import { describe, it, expect } from 'vitest';
import { createTransitionRegistry, type TransitionHandler } from './transition.js';

const noop: TransitionHandler = async function* () {
  yield { type: 'done' };
};

describe('transitionRegistry factory', () => {
  it('creates isolated registries', () => {
    const a = createTransitionRegistry();
    const b = createTransitionRegistry();

    a.registerTransition('a', noop);
    b.registerTransition('b', noop);

    expect(a.getTransition('a')).toBe(noop);
    expect(a.getTransition('b')).toBeUndefined();
    expect(b.getTransition('b')).toBe(noop);
    expect(b.getTransition('a')).toBeUndefined();
  });

  it('clearRegistry removes all registered handlers', () => {
    const registry = createTransitionRegistry();
    registry.registerTransition('x', noop);

    expect(registry.getTransition('x')).toBe(noop);
    registry.clearRegistry();
    expect(registry.getTransition('x')).toBeUndefined();
  });
});
