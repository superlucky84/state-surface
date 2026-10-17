/**
 * Runtime trace (DESIGN 3.1 runtime diagnostics): frames, applies, errors and warnings.
 * `?debug=1` logs them and shows them in the dev overlay; `onTrace` (exported from
 * `state-surface/client`) receives them in production too, e.g. from `client/entry.ts`.
 */
export type TraceEvent = {
  kind: 'received' | 'applied' | 'merged' | 'dropped' | 'skipped' | 'error' | 'done' | 'warning';
  detail?: unknown;
};

type Listener = (event: TraceEvent) => void;
const listeners = new Set<Listener>();

/** Subscribe to runtime trace events; returns the unsubscribe function. */
export function onTrace(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitTrace(event: TraceEvent) {
  for (const listener of [...listeners])
    try {
      listener(event);
    } catch (error) {
      // A failing observer never breaks the page.
      globalThis.reportError?.(error);
    }
}

/** A runtime diagnostic: a console warning in development, a `warning` trace event always. */
export function warning(message: string, development: boolean, detail?: Record<string, unknown>) {
  if (development) console.warn(`[StateSurface] ${message}`);
  emitTrace({ kind: 'warning', detail: { message, ...detail } });
}
