import type { StateFrame } from '../shared/protocol.js';

// A transition is an async generator that yields StateFrames
export type TransitionHandler = (
  params: Record<string, unknown>
) => AsyncGenerator<StateFrame, void, unknown>;

// Static registry of transition name → handler
const registry = new Map<string, TransitionHandler>();

export function registerTransition(name: string, handler: TransitionHandler) {
  registry.set(name, handler);
}

export function getTransition(name: string): TransitionHandler | undefined {
  return registry.get(name);
}
