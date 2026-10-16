import type { FieldErrors } from '../shared/schema.js';

/**
 * `error.kind` of an action (DESIGN 7장): the server's error frame (`server`), its input
 * schema (`validation`, with field errors) or timeout (`timeout`), an HTTP status without
 * frames (`http`), a wire violation (`protocol`), a failed fetch (`network`) or a component
 * chunk that could not load for a slot of the result (`chunk`).
 */
export type ActionErrorKind =
  | 'timeout'
  | 'http'
  | 'protocol'
  | 'chunk'
  | 'server'
  | 'validation'
  | 'network';

export class ActionError extends Error {
  fieldErrors?: FieldErrors;
  status?: number;
  constructor(
    public kind: ActionErrorKind,
    message: string,
    extra: { fieldErrors?: FieldErrors; status?: number } = {}
  ) {
    super(message);
    this.name = 'ActionError';
    if (extra.fieldErrors) this.fieldErrors = extra.fieldErrors;
    if (extra.status !== undefined) this.status = extra.status;
  }
}

/** What `run()` and `transition()` resolve to; they never throw (DESIGN 7장). */
export type ActionResult =
  | { ok: true; aborted?: undefined; error?: undefined }
  | { ok: false; aborted: true; error?: undefined }
  | { ok: false; aborted?: undefined; error: ActionError };
