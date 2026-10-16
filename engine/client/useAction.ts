import { mountCallback } from 'lithent';
import type { ActionName, ActionParams } from '../shared/actions.js';
import { getRuntime } from './runtimeAccess.js';
import { ActionError, type ActionResult } from './actionError.js';

export interface UseActionOptions {
  /** Anchors marked `data-pending` (default: the transition's targets, else every slot). */
  pendingTargets?: string[];
  /** Wrap this action's first change in a View Transition (DC-06). */
  viewTransition?: boolean;
}

/** Stateful action handle (DESIGN 7장). Reading a field gives the latest run's state. */
export interface ActionHandle<Name extends string> {
  /** Start the transition. Resolves when it ended and active slots show the result. */
  run(params?: ActionParams<Name>): Promise<ActionResult>;
  /** Abort the latest run. */
  abort(): void;
  readonly pending: boolean;
  /** The latest run already put a first result on the page. */
  readonly hasResult: boolean;
  readonly error: ActionError | undefined;
  readonly aborted: boolean;
}

/**
 * Run a transition from a client component through the shared action runtime (request IDs,
 * DC-11 concurrency, pending marks). State changes call `renew()`; unmounting only stops
 * that, it does not abort the request. The name and params are typed from
 * `.state-surface/actions.d.ts` (DC-22).
 *
 * ```tsx
 * const Search = mount(renew => {
 *   const search = useAction(renew, 'search');
 *   return () => <button onClick={() => search.run({ query: 'x' })}>…</button>;
 * });
 * ```
 */
export function useAction<Name extends ActionName>(
  renew: () => unknown,
  name: Name,
  options: UseActionOptions = {}
): ActionHandle<Name> {
  let subscribed = true;
  let latest = 0;
  let controller: AbortController | undefined;
  const state: { pending: boolean; hasResult: boolean; error?: ActionError; aborted: boolean } = {
    pending: false,
    hasResult: false,
    aborted: false,
  };
  const notify = () => {
    if (subscribed) renew();
  };
  (mountCallback as (effect: () => () => void) => void)(() => () => {
    subscribed = false;
  });

  return {
    get pending() {
      return state.pending;
    },
    get hasResult() {
      return state.hasResult;
    },
    get error() {
      return state.error;
    },
    get aborted() {
      return state.aborted;
    },
    abort() {
      controller?.abort();
    },
    run(params) {
      const id = ++latest;
      const current = (controller = new AbortController());
      Object.assign(state, { pending: true, hasResult: false, error: undefined, aborted: false });
      notify();
      return getRuntime()
        .then(
          surface =>
            surface.transition(name, (params ?? {}) as Record<string, unknown>, {
              ...options,
              signal: current.signal,
              onResult: () => {
                if (id !== latest) return;
                state.hasResult = true;
                notify();
              },
            }),
          (error): ActionResult => ({
            ok: false,
            error: new ActionError('chunk', error instanceof Error ? error.message : String(error)),
          })
        )
        .then(result => {
          if (id === latest) {
            state.pending = false;
            state.error = result.error;
            state.aborted = result.aborted === true;
            notify();
          }
          return result;
        });
    },
  };
}
