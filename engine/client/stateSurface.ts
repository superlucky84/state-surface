import {
  checkWireFrame,
  mergeAccumulate,
  type ActionMeta,
  type ErrorFrame,
  type Op,
  type SlotMeta,
  type SurfaceBootstrap,
  type UiPatch,
} from '../shared/protocol.js';
import { createNdjsonParser } from '../shared/ndjson.js';
import { transitionPath } from '../shared/actions.js';
import { ActionError, type ActionResult } from './actionError.js';
import type { ComponentHost } from './componentHost.js';
import type { SlotDom } from './slotDom.js';

export { ActionError, type ActionErrorKind, type ActionResult } from './actionError.js';

export type TraceEvent = {
  kind: 'received' | 'applied' | 'merged' | 'dropped' | 'skipped' | 'error' | 'done';
  detail?: unknown;
};

/** Request state table (DESIGN 6.3); `queued` waits for an earlier `mode: 'queue'` request. */
export type RequestState =
  | 'queued'
  | 'awaiting-baseline'
  | 'active'
  | 'completed'
  | 'failed'
  | 'aborted';

export interface StateSurfaceOptions {
  bootstrap: Pick<SurfaceBootstrap, 'buildId' | 'pageId' | 'basePath'>;
  slots: readonly SlotMeta[];
  /** Targets and queue mode per transition (DC-11); missing entries overlap every slot. */
  actions?: Readonly<Record<string, ActionMeta>>;
  host: ComponentHost;
  dom: SlotDom;
  /** Action start/end notifications (client plugins' `onAction`). */
  onAction?: (event: { name: string; phase: 'start' | 'end'; error?: Error }) => void;
  trace?: (event: TraceEvent) => void;
  /** Unexpected errors (forwarded to `reportError`, DESIGN 8.3-2). */
  report?: (error: unknown, detail: Record<string, unknown>) => void;
  /** Build mismatch (409): open the current URL as a document load. */
  reload?: () => void;
  development?: boolean;
  /** Receive limits (DC-14): one NDJSON line and the whole response, in characters. */
  frameSize?: number;
  responseSize?: number;
}

export interface TransitionOptions {
  /** `data-pending-targets`: anchors marked pending (default: targets, else every slot). */
  pendingTargets?: string[];
  /** `data-view-transition`: wrap this action's first change in a View Transition. */
  viewTransition?: boolean;
  /** Aborts this request (`useAction().abort()`). */
  signal?: AbortSignal;
  /** Called once when the first result of this request is on the page. */
  onResult?: () => void;
  /** Multipart body of a form with files; sent instead of the JSON params. */
  form?: FormData;
}

interface Request {
  id: number;
  name: string;
  controller: AbortController;
  state: RequestState;
  /** Declared targets; undefined overlaps every slot (DC-30). */
  targets?: readonly string[];
  /** Anchors this request marks `data-pending` until it ends. */
  pending: string[];
  hasResult: boolean;
  released: boolean;
  onResult?: () => void;
  /** Ops received and not yet flushed. */
  ops: Op[];
  viewTransition: boolean;
  transitioned: boolean;
  error?: ActionError;
  /** Resolves once the request ended and its DOM changes were applied. */
  finished: Promise<void>;
  finish: () => void;
}

const terminal = (state: RequestState) =>
  state === 'completed' || state === 'failed' || state === 'aborted';
const isContent = (op: Op) => !('ui' in op);

function mergeable(a: Record<string, unknown>, b: Record<string, unknown>) {
  const kind = (value: unknown) =>
    Array.isArray(value) ? 'array' : typeof value === 'string' ? 'string' : 'other';
  return Object.keys(b).every(key => !(key in a) || kind(a[key]) === kind(b[key]));
}

/**
 * Browser coalescing (DESIGN 6.2): per slot keep the last `html`/`props`, fold `merge` into
 * the preceding props or merge, and treat ops after `remove` as a new appearance. Within a
 * slot the order is remove → content → ui.
 */
export function coalesceOps(ops: readonly Op[]): Op[] {
  const order: string[] = [];
  const slots = new Map<string, { remove: boolean; content: Op[]; ui?: Op }>();
  for (const op of ops) {
    let entry = slots.get(op.slot);
    if (!entry) {
      entry = { remove: false, content: [] };
      slots.set(op.slot, entry);
      order.push(op.slot);
    }
    if ('remove' in op) {
      entry.remove = true;
      entry.content = [];
      entry.ui = undefined;
    } else if ('ui' in op) entry.ui = op;
    else if ('merge' in op) {
      const last = entry.content[entry.content.length - 1];
      if (last && 'props' in last)
        entry.content[entry.content.length - 1] = {
          slot: op.slot,
          props: mergeAccumulate(last.props, op.merge),
        };
      else if (last && 'merge' in last && mergeable(last.merge, op.merge))
        entry.content[entry.content.length - 1] = {
          slot: op.slot,
          merge: mergeAccumulate(last.merge, op.merge),
        };
      else entry.content.push(op);
    } else entry.content = [op];
  }
  const result: Op[] = [];
  for (const slot of order) {
    const entry = slots.get(slot)!;
    if (entry.remove) result.push({ slot, remove: true });
    result.push(...entry.content);
    if (entry.ui) result.push(entry.ui);
  }
  return result;
}

/** Targets of two requests overlap; undeclared targets overlap everything (DC-30). */
function overlaps(a?: readonly string[], b?: readonly string[]) {
  if (!a || !b) return true;
  return a.some(slot => b.includes(slot));
}

/**
 * Browser action runtime and apply pipeline (DESIGN 6.2/6.3, 7장). The server already
 * reduced and projected every frame; the browser checks op structure, follows the request
 * state table, coalesces queued ops once per animation frame and executes them in order:
 * server slots get HTML, client slots get props, UI patches go on the slot host.
 *
 * Concurrency (DC-11/DC-30): a new request aborts requests of the same name and requests
 * whose targets overlap its own; transitions without declared targets overlap every slot.
 * `mode: 'queue'` runs requests of one name in order. Pending marks are per request and
 * stay until the request ends. View Transitions are opt-in (DC-06).
 */
export class StateSurface {
  private metas: Map<string, SlotMeta>;
  private anchors = new Map<string, HTMLElement>();
  private props = new Map<string, unknown>();
  private revisions = new Map<string, number>();
  /** Requests that have not ended, in start order. */
  private requests = new Set<Request>();
  /** Requests with received, unflushed ops, in arrival order. */
  private dirty = new Set<Request>();
  private flushScheduled = false;
  private applying: Promise<void> = Promise.resolve();
  private pendingCount = new Map<string, number>();
  private resultCount = new Map<string, number>();
  private warnedTargets = new Set<string>();
  private errorShown?: string;
  private nextId = 0;
  trace?: (event: TraceEvent) => void;

  constructor(private options: StateSurfaceOptions) {
    this.metas = new Map(options.slots.filter(meta => !meta.id.includes('$')).map(m => [m.id, m]));
    for (const meta of this.metas.values())
      if (meta.mode === 'client' && meta.props !== undefined) this.props.set(meta.id, meta.props);
    this.trace = options.trace;
  }

  /** Client slot props as last applied (dev overlay). */
  get activeStates(): Record<string, unknown> {
    return Object.fromEntries(this.props);
  }

  get activeUi(): Record<string, UiPatch> {
    const ui: Record<string, UiPatch> = {};
    for (const name of this.metas.keys()) {
      const patch = this.options.dom.uiOf(name);
      if (patch) ui[name] = patch;
    }
    return ui;
  }

  /** Names of the requests that have not ended (dev overlay, tests). */
  get running(): string[] {
    return [...this.requests].map(request => request.name);
  }

  discoverAnchors(root: ParentNode = document) {
    for (const name of new Set([...this.pendingCount.keys(), ...this.resultCount.keys()])) {
      this.anchors.get(name)?.removeAttribute('data-pending');
      this.anchors.get(name)?.removeAttribute('data-has-result');
    }
    this.pendingCount.clear();
    this.resultCount.clear();
    for (const request of this.requests) request.pending = [];
    this.anchors.clear();
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('h-state[name]')))
      this.anchors.set(el.getAttribute('name')!, el);
  }

  /**
   * Run a transition. Resolves after the request ended and its DOM changes were applied:
   * `{ ok: true }`, `{ ok: false, error }` or `{ ok: false, aborted: true }`. Never throws.
   */
  async transition(
    name: string,
    params: Record<string, unknown> = {},
    options: TransitionOptions = {}
  ): Promise<ActionResult> {
    const meta = Object.hasOwn(this.options.actions ?? {}, name)
      ? this.options.actions![name]
      : undefined;
    if (!meta?.targets && this.options.development && !this.warnedTargets.has(name)) {
      this.warnedTargets.add(name);
      console.warn(
        `[StateSurface] "${name}" declares no targets, so it aborts every running action. ` +
          'Declare targets to run it in parallel with actions on other slots.'
      );
    }
    let finish = () => {};
    const finished = new Promise<void>(resolve => (finish = resolve));
    const request: Request = {
      id: ++this.nextId,
      name,
      controller: new AbortController(),
      state: 'awaiting-baseline',
      targets: meta?.targets,
      pending: [],
      hasResult: false,
      released: false,
      onResult: options.onResult,
      ops: [],
      viewTransition: options.viewTransition === true,
      transitioned: false,
      finished,
      finish,
    };
    let previous: Request | undefined;
    for (const other of this.requests) {
      if (meta?.queue && other.name === name) previous = other;
      else if (other.name === name || overlaps(request.targets, other.targets)) this.abort(other);
    }
    this.requests.add(request);
    const onAbort = () => this.abort(request);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    this.notifyAction({ name, phase: 'start' });
    this.markPending(request, options.pendingTargets ?? request.targets);
    try {
      if (options.signal?.aborted) this.abort(request);
      if (previous) {
        request.state = 'queued';
        await previous.finished;
        if (request.state !== 'queued') return this.result(request);
        request.state = 'awaiting-baseline';
      }
      await this.send(request, params, options.form);
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
      this.requests.delete(request);
      this.notifyAction({ name, phase: 'end', ...(request.error ? { error: request.error } : {}) });
      await this.applying;
      this.release(request);
      request.finish();
    }
    return this.result(request);
  }

  private result(request: Request): ActionResult {
    if (request.state === 'aborted') return { ok: false, aborted: true };
    if (request.error) return { ok: false, error: request.error };
    return { ok: true };
  }

  private async send(request: Request, params: Record<string, unknown>, form?: FormData) {
    if (request.state === 'aborted') return;
    const { bootstrap } = this.options;
    try {
      // Looked up per call so later instrumentation (Sentry, Datadog) is not bypassed (8.3-3).
      const response = await globalThis.fetch(transitionPath(request.name, bootstrap.basePath), {
        method: 'POST',
        headers: {
          ...(form ? {} : { 'Content-Type': 'application/json' }),
          Accept: 'application/x-ndjson, application/json',
          'X-Surface-Build': bootstrap.buildId,
          'X-Surface-Page': bootstrap.pageId,
        },
        body: form ?? JSON.stringify(params),
        signal: request.controller.signal,
      });
      if (response.status === 409) {
        this.abort(request);
        (this.options.reload ?? (() => location.reload()))();
        return;
      }
      if (response.headers.get('x-surface-view-transition') === '1') request.viewTransition = true;
      const type = response.headers.get('content-type') ?? '';
      if (type.includes('application/x-ndjson') && response.body)
        await this.read(request, response.body);
      else if (
        type.includes('application/json') &&
        (response.ok || response.status === 422 || response.status === 500)
      ) {
        const body = (await response.json()) as { frames?: unknown };
        if (!Array.isArray(body.frames))
          this.fail(request, new ActionError('protocol', 'JSON response without frames'));
        else for (const frame of body.frames) this.receive(request, frame);
      }
      if (!terminal(request.state))
        this.fail(
          request,
          response.ok
            ? new ActionError('protocol', 'The response ended without "done"')
            : new ActionError('http', `HTTP ${response.status}`, { status: response.status })
        );
    } catch (error) {
      if (!terminal(request.state))
        this.fail(
          request,
          new ActionError('network', error instanceof Error ? error.message : String(error))
        );
    }
  }

  private async read(request: Request, body: ReadableStream<Uint8Array>) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let total = 0;
    const parser = createNdjsonParser(
      frame => this.receive(request, frame),
      event => {
        this.trace?.({
          kind: 'error',
          detail: { source: 'ndjson', stage: event.stage, message: event.error.message },
        });
        if (event.stage === 'limit')
          this.fail(request, new ActionError('protocol', event.error.message));
      },
      { maxLine: this.options.frameSize ?? 1024 * 1024 }
    );
    try {
      while (!terminal(request.state)) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        total += text.length;
        if (total > (this.options.responseSize ?? 32 * 1024 * 1024)) {
          this.fail(request, new ActionError('protocol', 'The response exceeds the size limit'));
          break;
        }
        parser.push(text);
      }
      if (!terminal(request.state)) parser.flush();
    } finally {
      if (terminal(request.state)) void reader.cancel().catch(() => {});
    }
  }

  private receive(request: Request, raw: unknown) {
    if (terminal(request.state)) return;
    const checked = checkWireFrame(raw);
    if (!checked.ok) return this.fail(request, new ActionError('protocol', checked.reason));
    for (const skipped of checked.skipped) this.trace?.({ kind: 'skipped', detail: skipped });
    const frame = checked.frame;
    this.trace?.({ kind: 'received', detail: frame });
    if (frame.type === 'patch') {
      if (request.state === 'awaiting-baseline') {
        if (!frame.reset)
          return this.fail(request, new ActionError('protocol', 'The first patch must be a reset'));
        request.state = 'active';
        if (this.errorShown && !frame.ops.some(op => op.slot === this.errorShown))
          frame.ops.unshift({ slot: this.errorShown, remove: true });
        this.errorShown = undefined;
      }
      for (const op of frame.ops) {
        const meta = this.metas.get(op.slot);
        if (!meta) continue;
        if (
          ('html' in op && meta.mode !== 'server') ||
          (('props' in op || 'merge' in op) && meta.mode !== 'client')
        )
          return this.fail(
            request,
            new ActionError('protocol', `op does not match the mode of slot "${op.slot}"`)
          );
      }
      request.ops.push(...frame.ops);
      this.dirty.add(request);
      this.scheduleFlush();
      return;
    }
    if (frame.type === 'done') {
      request.state = 'completed';
      this.flush();
      this.trace?.({ kind: 'done' });
      return;
    }
    request.state = 'failed';
    request.error = new ActionError(frame.kind ?? 'server', frame.message, {
      ...(frame.fieldErrors ? { fieldErrors: frame.fieldErrors } : {}),
    });
    this.flush();
    this.showError(request, frame);
  }

  private fail(request: Request, error: ActionError) {
    if (terminal(request.state)) return;
    request.state = 'failed';
    request.error = error;
    request.controller.abort();
    // A content op violation stops applying this request (DC-14 ②).
    request.ops = [];
    this.dirty.delete(request);
    this.trace?.({ kind: 'error', detail: error.message });
    this.options.report?.(error, { transition: request.name, kind: error.kind });
  }

  private abort(request: Request) {
    if (terminal(request.state)) return;
    request.state = 'aborted';
    request.controller.abort();
    request.ops = [];
    this.dirty.delete(request);
    this.release(request);
  }

  private live(request: Request) {
    return request.state !== 'aborted';
  }

  private scheduleFlush() {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    requestAnimationFrame(() => {
      this.flushScheduled = false;
      this.flush();
    });
  }

  private flush() {
    for (const request of this.dirty) {
      const ops = coalesceOps(request.ops);
      if (ops.length < request.ops.length)
        this.trace?.({ kind: 'merged', detail: { from: request.ops.length, to: ops.length } });
      request.ops = [];
      this.enqueue(() => this.apply(request, ops));
    }
    this.dirty.clear();
  }

  private enqueue(task: () => Promise<void> | void) {
    this.applying = this.applying.then(task).catch(error => {
      this.trace?.({ kind: 'error', detail: error });
      this.options.report?.(error, { phase: 'apply' });
    });
  }

  private viewTransitionFor(request: Request, ops: readonly Op[]) {
    if (request.transitioned || typeof document.startViewTransition !== 'function') return false;
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
    return (
      request.viewTransition ||
      ops.some(op => isContent(op) && this.metas.get(op.slot)?.viewTransition === true)
    );
  }

  private async apply(request: Request, ops: readonly Op[]) {
    if (!this.live(request)) return;
    const run = async () => {
      for (const op of ops) await this.applyOp(request, op);
    };
    if (this.viewTransitionFor(request, ops)) {
      // One transition per action, on its first visible patch (DC-06 ②③). Later patches of
      // the same request apply immediately once this DOM update ran.
      request.transitioned = true;
      const transition = document.startViewTransition(run);
      await transition.updateCallbackDone.catch(() => {});
    } else await run();
    if (this.live(request)) this.markResult(request);
    this.trace?.({ kind: 'applied', detail: { ops: ops.length } });
  }

  private async applyOp(request: Request, op: Op) {
    if (!this.live(request)) return;
    const el = this.anchors.get(op.slot);
    const meta = this.metas.get(op.slot);
    if (!el || !meta) {
      this.trace?.({ kind: 'dropped', detail: { slot: op.slot, reason: 'slot not on page' } });
      return;
    }
    this.revisions.set(op.slot, (this.revisions.get(op.slot) ?? 0) + 1);
    const { dom, host } = this.options;
    let status: 'applied' | 'deferred' | 'failed' = 'applied';
    if ('html' in op)
      await dom.html(el, op.slot, op.html, op.islands, meta.swap ?? 'replace', () =>
        this.live(request)
      );
    else if ('props' in op) {
      this.props.set(op.slot, op.props);
      status = host.setProps(op.slot, el, op.props, meta, { reset: op.reset === true });
    } else if ('merge' in op) {
      const next = mergeAccumulate(this.props.get(op.slot), op.merge);
      this.props.set(op.slot, next);
      status = host.setProps(op.slot, el, next, meta);
    } else if ('remove' in op) {
      this.props.delete(op.slot);
      dom.remove(el, op.slot, meta.mode);
    } else dom.setUi(el, op.slot, op.ui);
    if (status === 'failed' && !request.error)
      request.error = new ActionError(
        'chunk',
        `The component of slot "${op.slot}" could not be loaded`
      );
    if (isContent(op) && !('remove' in op)) reveal(el);
  }

  private showError(request: Request, frame: ErrorFrame) {
    const el = frame.slot ? this.anchors.get(frame.slot) : undefined;
    const meta = frame.slot ? this.metas.get(frame.slot) : undefined;
    if (el && meta && frame.slot) {
      const slot = frame.slot;
      this.errorShown = slot;
      this.enqueue(async () => {
        // A later request already cleared the error slot.
        if (this.errorShown !== slot) return;
        if (frame.html !== undefined && meta.mode === 'server')
          await this.options.dom.html(el, slot, frame.html, frame.islands);
        else if (frame.props && meta.mode === 'client') {
          this.props.set(slot, frame.props);
          this.options.host.setProps(slot, el, frame.props, meta);
        }
      });
    } else if (this.options.development)
      console.warn(
        `[StateSurface] "${request.name}" failed without an error slot: ${frame.message}`
      );
    this.trace?.({ kind: 'error', detail: frame });
    // Rejected input is an expected outcome, not an error to report.
    if (frame.kind !== 'validation')
      this.options.report?.(request.error, { transition: request.name, kind: request.error?.kind });
  }

  /**
   * Deferred server slots (DC-21): request every one in parallel, drop a response when a
   * transition changed the slot first, retry once after 1s, then keep the fallback.
   */
  loadDeferred() {
    return Promise.all(
      [...this.metas.values()].filter(meta => meta.defer).map(meta => this.deferred(meta, 0))
    );
  }

  private async deferred(meta: SlotMeta, attempt: number): Promise<void> {
    const el = this.anchors.get(meta.id);
    if (!el || !meta.defer || !meta.component) return;
    const revision = this.revisions.get(meta.id) ?? 0;
    const { bootstrap } = this.options;
    const post = meta.defer.length > 2048;
    const url =
      `${bootstrap.basePath}/_surface/island/${encodeURIComponent(meta.component)}` +
      (post ? '' : `?p=${meta.defer}`);
    try {
      const response = await globalThis.fetch(url, {
        method: post ? 'POST' : 'GET',
        headers: {
          'X-Surface-Build': bootstrap.buildId,
          'X-Surface-Page': bootstrap.pageId,
          ...(post ? { 'Content-Type': 'text/plain' } : {}),
        },
        ...(post ? { body: meta.defer } : {}),
      });
      if (response.status === 409) return (this.options.reload ?? (() => location.reload()))();
      if (!response.ok) throw new Error(`Deferred slot "${meta.id}": HTTP ${response.status}`);
      const body = (await response.json()) as { html?: unknown; islands?: unknown };
      const checked = checkWireFrame({
        type: 'patch',
        ops: [
          { slot: meta.id, html: body.html, ...(body.islands ? { islands: body.islands } : {}) },
        ],
      });
      if (!checked.ok || checked.frame.type !== 'patch')
        throw new Error(`Deferred slot "${meta.id}": invalid response`);
      const op = checked.frame.ops[0] as Extract<Op, { html: string }>;
      this.enqueue(async () => {
        if ((this.revisions.get(meta.id) ?? 0) !== revision) {
          this.trace?.({
            kind: 'dropped',
            detail: { slot: meta.id, reason: 'stale deferred response' },
          });
          return;
        }
        this.revisions.set(meta.id, revision + 1);
        const run = () =>
          this.options.dom.html(el, meta.id, op.html, op.islands, meta.swap ?? 'replace');
        if (
          meta.viewTransition &&
          typeof document.startViewTransition === 'function' &&
          !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        )
          await document.startViewTransition(run).updateCallbackDone.catch(() => {});
        else await run();
        reveal(el);
      });
    } catch (error) {
      if (attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.deferred(meta, 1);
      }
      this.options.report?.(error, { slot: meta.id, kind: 'deferred' });
    }
  }

  /** Per-request pending marks, counted per anchor (DESIGN 7장 pending). */
  private markPending(request: Request, targets?: readonly string[]) {
    const names = targets && targets.length > 0 ? targets : [...this.anchors.keys()];
    request.pending = names.filter(name => this.anchors.has(name));
    for (const name of request.pending) this.count(this.pendingCount, name, 'data-pending', 1);
  }

  private markResult(request: Request) {
    if (request.hasResult) return;
    request.hasResult = true;
    if (!request.released)
      for (const name of request.pending) this.count(this.resultCount, name, 'data-has-result', 1);
    try {
      request.onResult?.();
    } catch (error) {
      this.options.report?.(error, { transition: request.name, phase: 'onResult' });
    }
  }

  private release(request: Request) {
    if (request.released) return;
    request.released = true;
    for (const name of request.pending) {
      this.count(this.pendingCount, name, 'data-pending', -1);
      if (request.hasResult) this.count(this.resultCount, name, 'data-has-result', -1);
    }
  }

  private count(counts: Map<string, number>, name: string, attribute: string, delta: 1 | -1) {
    const next = (counts.get(name) ?? 0) + delta;
    const el = this.anchors.get(name);
    if (next > 0) {
      counts.set(name, next);
      el?.setAttribute(attribute, '');
    } else {
      counts.delete(name);
      el?.removeAttribute(attribute);
    }
  }

  private notifyAction(event: { name: string; phase: 'start' | 'end'; error?: Error }) {
    try {
      this.options.onAction?.(event);
    } catch (err) {
      this.trace?.({
        kind: 'error',
        detail: { hook: 'onAction', message: err instanceof Error ? err.message : err },
      });
    }
  }
}

/** Opt-in reveal animation (`data-animate` on `<h-state>`). */
function reveal(el: HTMLElement) {
  if (!el.hasAttribute('data-animate')) return;
  el.removeAttribute('data-just-updated');
  void el.offsetWidth; // force reflow to restart animation
  el.setAttribute('data-just-updated', '');
  el.addEventListener('animationend', () => el.removeAttribute('data-just-updated'), {
    once: true,
  });
}
