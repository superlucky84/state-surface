import type { SurfaceContext } from './core/context.js';
import type { StateFrame, TransitionResult } from '../shared/protocol.js';
import { isStandardSchema, type InferInput, type InferOutput } from '../shared/schema.js';
import type { StandardSchema } from '../shared/schema.js';

/**
 * A transition yields authoring frames (async generator → NDJSON stream) or returns one
 * result (async function → single JSON response). The engine sends `done` when it returns;
 * failures are thrown (DESIGN 6.2/6.3).
 */
export type TransitionHandler<Input = Record<string, unknown>> = (
  input: Input,
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

export interface TransitionOptions<Schema extends StandardSchema | undefined = undefined> {
  /** Standard Schema for the params (form fields or JSON). Invalid input never runs the handler. */
  input?: Schema;
  /**
   * Slots this transition may change. They fix the request targets (DC-09) and decide which
   * actions abort each other in the browser (DC-11). Omitted: the slots of the first full
   * frame on the server, and every slot of the page for client concurrency (DC-30).
   */
  targets?: readonly string[];
  /** `queue`: requests of this transition run one after another instead of aborting. */
  mode?: 'queue';
  /** JS-less form submissions (PRG): input fields echoed back through flash (opt-in). */
  flash?: { input?: readonly string[] };
  /** Wrap this action's first visible change in a View Transition (DC-06). */
  viewTransition?: boolean;
}

/**
 * A registered transition. The name is its path under `transitions/` (DC-16 ③), so the
 * definition itself carries none. `Params` is the browser-side params type (typed actions).
 */
export interface TransitionDefinition<Params = Record<string, unknown>> extends Omit<
  TransitionOptions<StandardSchema | undefined>,
  'input'
> {
  input?: StandardSchema;
  handler: TransitionHandler<any>;
  /** Type-only: what `useAction`/`<Boot>` accept for this transition. */
  readonly __params?: Params;
}

/** Params a transition accepts from the browser: its schema input, else any JSON object. */
export type ParamsOf<D> =
  D extends TransitionDefinition<infer P>
    ? P
    : D extends (...args: any[]) => unknown
      ? Record<string, unknown>
      : never;

type HandlerInput<S> = S extends StandardSchema ? InferOutput<S> : Record<string, unknown>;
type BrowserParams<S> = S extends StandardSchema ? InferInput<S> : Record<string, unknown>;

/**
 * Define a transition: `export default defineTransition({ input, targets, mode, handler })`
 * in `transitions/<name>.ts`. A plain generator or async function export works too (no input
 * validation, no options).
 */
export function defineTransition<Schema extends StandardSchema | undefined = undefined>(
  definition: TransitionOptions<Schema> & { handler: TransitionHandler<HandlerInput<Schema>> }
): TransitionDefinition<BrowserParams<Schema>>;
export function defineTransition(handler: TransitionHandler): TransitionDefinition;
export function defineTransition(
  input:
    | (TransitionOptions<StandardSchema | undefined> & { handler: TransitionHandler<any> })
    | TransitionHandler
): TransitionDefinition {
  return toDefinition(input, 'defineTransition()');
}

/** Normalize a module default export (definition or bare function) and check its options. */
export function toDefinition(value: unknown, where: string): TransitionDefinition {
  const definition = (typeof value === 'function' ? { handler: value } : value) as
    | TransitionDefinition
    | undefined;
  if (!definition || typeof definition.handler !== 'function')
    throw new Error(`${where}: a transition needs a handler function`);
  if (
    definition.targets !== undefined &&
    (!Array.isArray(definition.targets) ||
      definition.targets.some(target => typeof target !== 'string'))
  )
    throw new Error(`${where}: targets must be an array of slot names`);
  if (definition.input !== undefined && !isStandardSchema(definition.input))
    throw new Error(`${where}: input must be a Standard Schema (zod, valibot, …)`);
  if (definition.mode !== undefined && definition.mode !== 'queue')
    throw new Error(`${where}: mode must be "queue"`);
  if (
    definition.flash?.input !== undefined &&
    (!Array.isArray(definition.flash.input) ||
      definition.flash.input.some(field => typeof field !== 'string'))
  )
    throw new Error(`${where}: flash.input must be an array of field names`);
  return definition;
}

/** Transition names are their path under `transitions/`: kebab-case segments joined by `/`. */
export const TRANSITION_NAME = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/;
