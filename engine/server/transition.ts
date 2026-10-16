import type { SurfaceContext } from './core/context.js';
import type { StateFrame, TransitionResult } from '../shared/protocol.js';

/**
 * A transition yields authoring frames (async generator → NDJSON stream) or returns one
 * result (async function → single JSON response). The engine sends `done` when it returns;
 * failures are thrown (DESIGN 6.2/6.3).
 */
export type TransitionHandler = (
  params: Record<string, unknown>,
  ctx: SurfaceContext
) => AsyncIterable<StateFrame> | Promise<TransitionResult> | TransitionResult;

/**
 * Throw to end a transition with a message for the user. Its message is sent to the error
 * slot in production too; other errors become "Transition failed" outside development.
 */
export class TransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransitionError';
  }
}

export interface TransitionOptions {
  /**
   * Slots this transition may change. Omitted: the slots of the first full frame (server)
   * and every slot of the page for client concurrency (DC-30, stage 5).
   */
  targets?: readonly string[];
  /** Wrap this action's first visible change in a View Transition (DC-06). */
  viewTransition?: boolean;
}

export interface TransitionDefinition extends TransitionOptions {
  handler: TransitionHandler;
}

export type TransitionModule = {
  name: string;
  definition: TransitionDefinition;
};

/**
 * Register a transition. Stage 5 (DC-22) drops the name argument (file path) and adds input
 * schemas; until then options sit next to the handler.
 */
export function defineTransition(
  name: string,
  handler: TransitionHandler | (TransitionOptions & { handler: TransitionHandler })
): TransitionModule {
  const definition = typeof handler === 'function' ? { handler } : handler;
  if (typeof definition.handler !== 'function')
    throw new Error(`defineTransition("${name}") needs a handler function`);
  if (
    definition.targets !== undefined &&
    (!Array.isArray(definition.targets) ||
      definition.targets.some(target => typeof target !== 'string'))
  )
    throw new Error(`defineTransition("${name}"): targets must be an array of slot names`);
  return { name, definition };
}
