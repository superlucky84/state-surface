import {
  checkWireFrame,
  mergeAccumulate,
  type ErrorFrame,
  type Op,
  type SlotMeta,
  type SurfaceBootstrap,
  type UiPatch,
} from '../shared/protocol.js';
import { createNdjsonParser } from '../shared/ndjson.js';
import type { ComponentHost } from './componentHost.js';
import type { SlotDom } from './slotDom.js';

export type TraceEvent = {
  kind: 'received' | 'applied' | 'merged' | 'dropped' | 'skipped' | 'error' | 'done';
  detail?: unknown;
};

/** Request state table (DESIGN 6.3). */
export type RequestState = 'awaiting-baseline' | 'active' | 'completed' | 'failed' | 'aborted';

export interface StateSurfaceOptions {
  bootstrap: Pick<SurfaceBootstrap, 'buildId' | 'pageId' | 'basePath'>;
  slots: readonly SlotMeta[];
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
  pendingTargets?: string[];
  /** `data-view-transition`: wrap this action's first change in a View Transition. */
  viewTransition?: boolean;
}

interface Request {
  id: number;
  name: string;
  controller: AbortController;
  state: RequestState;
  viewTransition: boolean;
  transitioned: boolean;
  error?: Error;
}

/** Wire or HTTP failure kinds (DESIGN 7장 `error.kind`, completed in stage 5). */
export class RequestError extends Error {
  constructor(
    public kind: 'http' | 'protocol' | 'server' | 'network',
    message: string
  ) {
    super(message);
    this.name = 'RequestError';
  }
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

/**
 * Browser apply pipeline for transitions (DESIGN 6.2/6.3). The server already reduced and
 * projected every frame; the browser checks op structure, follows the request state table,
 * coalesces queued ops once per animation frame and executes them in order: server slots
 * get HTML, client slots get props, UI patches go on the slot host. Requests are invalidated
 * by generation (abort previous until stage 5). View Transitions are opt-in (DC-06).
 */
export class StateSurface {
  private metas: Map<string, SlotMeta>;
  private anchors = new Map<string, HTMLElement>();
  private props = new Map<string, unknown>();
  private revisions = new Map<string, number>();
  private queue: Op[] = [];
  private queued?: Request;
  private flushScheduled = false;
  private applying: Promise<void> = Promise.resolve();
  private current?: Request;
  private pendingAnchors = new Set<string>();
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

  discoverAnchors(root: ParentNode = document) {
    this.clearPending();
    this.anchors.clear();
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('h-state[name]')))
      this.anchors.set(el.getAttribute('name')!, el);
  }

  /** Resolves after the request finished and its DOM changes were applied. */
  async transition(
    name: string,
    params: Record<string, unknown> = {},
    options: TransitionOptions = {}
  ): Promise<RequestState> {
    if (this.current && !terminal(this.current.state)) this.abort(this.current);
    const request: Request = {
      id: ++this.nextId,
      name,
      controller: new AbortController(),
      state: 'awaiting-baseline',
      viewTransition: options.viewTransition === true,
      transitioned: false,
    };
    this.current = request;
    this.queue = [];
    this.notifyAction({ name, phase: 'start' });
    this.markPending(options.pendingTargets);
    const { bootstrap } = this.options;
    try {
      // Looked up per call so later instrumentation (Sentry, Datadog) is not bypassed (8.3-3).
      const response = await globalThis.fetch(
        `${bootstrap.basePath}/transition/${encodeURIComponent(name)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/x-ndjson, application/json',
            'X-Surface-Build': bootstrap.buildId,
            'X-Surface-Page': bootstrap.pageId,
          },
          body: JSON.stringify(params),
          signal: request.controller.signal,
        }
      );
      if (response.status === 409) {
        request.state = 'aborted';
        (this.options.reload ?? (() => location.reload()))();
        return request.state;
      }
      if (response.headers.get('x-surface-view-transition') === '1') request.viewTransition = true;
      const type = response.headers.get('content-type') ?? '';
      if (type.includes('application/x-ndjson') && response.body)
        await this.read(request, response.body);
      else if (type.includes('application/json') && (response.ok || response.status === 500)) {
        const body = (await response.json()) as { frames?: unknown };
        if (!Array.isArray(body.frames))
          this.fail(request, new RequestError('protocol', 'JSON response without frames'));
        else for (const frame of body.frames) this.receive(request, frame);
      }
      if (!terminal(request.state))
        this.fail(
          request,
          response.ok
            ? new RequestError('protocol', 'The response ended without "done"')
            : new RequestError('http', `HTTP ${response.status}`)
        );
    } catch (error) {
      if (request.controller.signal.aborted && request.state === 'aborted') {
        /* abort previous: not an error */
      } else if (!terminal(request.state))
        this.fail(
          request,
          error instanceof Error
            ? new RequestError('network', error.message)
            : new RequestError('network', String(error))
        );
    } finally {
      if (this.current === request) this.clearPending();
      this.notifyAction({ name, phase: 'end', ...(request.error ? { error: request.error } : {}) });
    }
    await this.applying;
    return request.state;
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
          this.fail(request, new RequestError('protocol', event.error.message));
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
          this.fail(request, new RequestError('protocol', 'The response exceeds the size limit'));
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
    if (request !== this.current || terminal(request.state)) return;
    const checked = checkWireFrame(raw);
    if (!checked.ok) return this.fail(request, new RequestError('protocol', checked.reason));
    for (const skipped of checked.skipped) this.trace?.({ kind: 'skipped', detail: skipped });
    const frame = checked.frame;
    this.trace?.({ kind: 'received', detail: frame });
    if (frame.type === 'patch') {
      if (request.state === 'awaiting-baseline') {
        if (!frame.reset)
          return this.fail(
            request,
            new RequestError('protocol', 'The first patch must be a reset')
          );
        request.state = 'active';
        // Pending ends with the first result until stage 5 (DC-11 ④).
        this.clearPending();
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
            new RequestError('protocol', `op does not match the mode of slot "${op.slot}"`)
          );
      }
      this.queue.push(...frame.ops);
      this.queued = request;
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
    request.error = new RequestError('server', frame.message);
    this.flush();
    this.showError(request, frame);
  }

  private fail(request: Request, error: Error) {
    if (terminal(request.state)) return;
    request.state = 'failed';
    request.error = error;
    request.controller.abort();
    // A content op violation stops applying this request (DC-14 ②).
    if (this.queued === request) this.queue = [];
    this.trace?.({ kind: 'error', detail: error.message });
    this.options.report?.(error, { transition: request.name });
  }

  private abort(request: Request) {
    request.state = 'aborted';
    request.controller.abort();
    this.queue = [];
    this.clearPending();
  }

  private isCurrent(request: Request) {
    return request === this.current && request.state !== 'aborted';
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
    if (!this.queue.length || !this.queued) return;
    const request = this.queued;
    const ops = coalesceOps(this.queue);
    if (ops.length < this.queue.length)
      this.trace?.({ kind: 'merged', detail: { from: this.queue.length, to: ops.length } });
    this.queue = [];
    this.enqueue(() => this.apply(request, ops));
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
    if (!this.isCurrent(request)) return;
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
    this.trace?.({ kind: 'applied', detail: { ops: ops.length } });
  }

  private async applyOp(request: Request, op: Op) {
    if (!this.isCurrent(request)) return;
    const el = this.anchors.get(op.slot);
    const meta = this.metas.get(op.slot);
    if (!el || !meta) {
      this.trace?.({ kind: 'dropped', detail: { slot: op.slot, reason: 'slot not on page' } });
      return;
    }
    this.revisions.set(op.slot, (this.revisions.get(op.slot) ?? 0) + 1);
    const { dom, host } = this.options;
    if ('html' in op)
      await dom.html(el, op.slot, op.html, op.islands, meta.swap ?? 'replace', () =>
        this.isCurrent(request)
      );
    else if ('props' in op) {
      this.props.set(op.slot, op.props);
      host.setProps(op.slot, el, op.props, meta);
    } else if ('merge' in op) {
      const next = mergeAccumulate(this.props.get(op.slot), op.merge);
      this.props.set(op.slot, next);
      host.setProps(op.slot, el, next, meta);
    } else if ('remove' in op) {
      this.props.delete(op.slot);
      dom.remove(el, op.slot, meta.mode);
    } else dom.setUi(el, op.slot, op.ui);
    if (isContent(op) && !('remove' in op)) reveal(el);
  }

  private showError(request: Request, frame: ErrorFrame) {
    const el = frame.slot ? this.anchors.get(frame.slot) : undefined;
    const meta = frame.slot ? this.metas.get(frame.slot) : undefined;
    if (el && meta && frame.slot) {
      const slot = frame.slot;
      this.errorShown = slot;
      this.enqueue(async () => {
        if (request !== this.current) return;
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
    this.options.report?.(request.error, { transition: request.name, kind: 'server' });
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

  private markPending(targets?: string[]) {
    this.clearPending();
    const names = targets && targets.length > 0 ? targets : Array.from(this.anchors.keys());
    for (const name of names) {
      const el = this.anchors.get(name);
      if (!el) continue;
      el.setAttribute('data-pending', '');
      this.pendingAnchors.add(name);
    }
  }

  private clearPending() {
    for (const name of this.pendingAnchors) this.anchors.get(name)?.removeAttribute('data-pending');
    this.pendingAnchors.clear();
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
