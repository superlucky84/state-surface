import type { StateFrame } from '../shared/protocol.js';

// A transition is an async generator that yields StateFrames
export type TransitionHandler = (
  params: Record<string, unknown>,
  options?: { signal?: AbortSignal }
) => AsyncGenerator<StateFrame, void, unknown>;

export type TransitionModule = {
  name: string;
  handler: TransitionHandler;
};

export function defineTransition(name: string, handler: TransitionHandler): TransitionModule {
  return { name, handler };
}

export type TransitionRegistry = {
  registerTransition: (name: string, handler: TransitionHandler) => void;
  getTransition: (name: string) => TransitionHandler | undefined;
  clearRegistry: () => void;
};

export function createTransitionRegistry(): TransitionRegistry {
  const registry = new Map<string, TransitionHandler>();
  return {
    registerTransition(name: string, handler: TransitionHandler) {
      registry.set(name, handler);
    },
    getTransition(name: string) {
      return registry.get(name);
    },
    clearRegistry() {
      registry.clear();
    },
  };
}

const defaultRegistry = createTransitionRegistry();

export function registerTransition(name: string, handler: TransitionHandler) {
  defaultRegistry.registerTransition(name, handler);
}

export function getTransition(name: string): TransitionHandler | undefined {
  return defaultRegistry.getTransition(name);
}

export function clearRegistry() {
  defaultRegistry.clearRegistry();
}
