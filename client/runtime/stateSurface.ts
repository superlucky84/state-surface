import type { StateFrame, StateFrameState } from '../../shared/protocol.js';
import { applyFrame } from '../../shared/protocol.js';
import { createNdjsonParser } from '../../shared/ndjson.js';

// ── Types ──

export type TemplateRenderer = (name: string, data: any, el: HTMLElement) => void;
export type TemplateHydrator = (name: string, data: any, el: HTMLElement) => () => void;
export type TemplateUpdater = (name: string, data: any, el: HTMLElement) => void;

export type TraceEvent = {
  kind: 'received' | 'applied' | 'merged' | 'dropped' | 'error' | 'done';
  detail?: unknown;
};

export interface StateSurfaceOptions {
  renderTemplate: TemplateRenderer;
  hydrateTemplate: TemplateHydrator;
  updateTemplate: TemplateUpdater;
  unmountTemplate: (name: string, el: HTMLElement) => void;
  maxQueue?: number;
  frameBudgetMs?: number;
  trace?: (event: TraceEvent) => void;
  basePath?: string;
}

export interface TransitionOptions {
  pendingTargets?: string[];
}

// ── StateSurface ──

export class StateSurface {
  activeStates: Record<string, any> = {};
  private frameQueue: StateFrameState[] = [];
  private anchors = new Map<string, HTMLElement>();
  private mounted = new Set<string>();
  private pendingAnchors = new Set<string>();
  private flushScheduled = false;
  private abortController: AbortController | null = null;
  private maxQueue: number;
  private frameBudgetMs: number;

  private renderTemplate: TemplateRenderer;
  private hydrateTemplate: TemplateHydrator;
  private updateTemplate: TemplateUpdater;
  private unmountTemplate: (name: string, el: HTMLElement) => void;
  private basePath: string;

  trace?: (event: TraceEvent) => void;

  constructor(options: StateSurfaceOptions) {
    this.renderTemplate = options.renderTemplate;
    this.hydrateTemplate = options.hydrateTemplate;
    this.updateTemplate = options.updateTemplate;
    this.unmountTemplate = options.unmountTemplate;
    this.maxQueue = options.maxQueue ?? 20;
    this.frameBudgetMs = options.frameBudgetMs ?? 33;
    this.trace = options.trace;
    this.basePath = options.basePath ?? '';
  }

  // ── Anchor Discovery ──

  discoverAnchors() {
    this.clearPending();
    this.anchors.clear();
    const elements = document.querySelectorAll<HTMLElement>('h-state[name]');
    for (const el of elements) {
      const name = el.getAttribute('name')!;
      this.anchors.set(name, el);
    }
  }

  // ── Bootstrap + Hydration ──

  bootstrap() {
    const stateEl = document.getElementById('__STATE__');
    if (!stateEl?.textContent) return;

    const initialStates = JSON.parse(stateEl.textContent) as Record<string, any>;
    this.hydrate(initialStates);
  }

  hydrate(initialStates: Record<string, any>) {
    this.activeStates = { ...initialStates };

    for (const [name, data] of Object.entries(initialStates)) {
      const el = this.anchors.get(name);
      if (!el) continue;

      this.hydrateTemplate(name, data, el);
      this.mounted.add(name);
    }
  }

  // ── Transitions ──

  async transition(
    name: string,
    params: Record<string, unknown> = {},
    options: TransitionOptions = {}
  ) {
    // Abort previous transition
    if (this.abortController) {
      this.abortController.abort();
      this.clearPending();
    }
    this.abortController = new AbortController();
    const transitionController = this.abortController;
    const { signal } = transitionController;
    this.markPending(options.pendingTargets);
    let firstFrameHandled = false;

    try {
      const res = await fetch(`${this.basePath}/transition/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal,
      });

      if (!res.ok || !res.body) {
        this.trace?.({ kind: 'error', detail: `HTTP ${res.status}` });
        if (this.abortController === transitionController) {
          this.clearPending();
        }
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const parser = createNdjsonParser(frame => {
        if (!firstFrameHandled) {
          firstFrameHandled = true;
          if (this.abortController === transitionController) {
            this.clearPending();
          }
        }
        this.onFrame(frame, signal);
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (signal.aborted) break;
        parser.push(decoder.decode(value, { stream: true }));
      }

      parser.flush();
      if (!firstFrameHandled && this.abortController === transitionController) {
        this.clearPending();
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        this.trace?.({ kind: 'error', detail: err });
        if (this.abortController === transitionController) {
          this.clearPending();
        }
      } else if (this.abortController === transitionController) {
        this.clearPending();
      }
    }
  }

  private onFrame(frame: StateFrame, signal: AbortSignal) {
    if (signal.aborted) return;

    if (frame.type === 'done') {
      this.trace?.({ kind: 'done' });
      this.flushAll();
      return;
    }

    if (frame.type === 'error') {
      this.handleError(frame);
      return;
    }

    // state frame
    this.frameQueue.push(frame);
    this.trace?.({ kind: 'received', detail: { queueSize: this.frameQueue.length } });
    this.scheduleFlush();
  }

  // ── Error Handling ──

  private handleError(frame: StateFrame & { type: 'error' }) {
    const template = frame.template;
    const anchor = template ? this.anchors.get(template) : undefined;

    if (template && anchor) {
      // Render error template as full state
      const errorState: StateFrameState = {
        type: 'state',
        states: { [template]: frame.data ?? { message: frame.message } },
        full: true,
      };
      this.frameQueue.push(errorState);
      this.flushAll();
    } else {
      // No matching anchor — surface error
      this.trace?.({ kind: 'error', detail: frame });
    }
  }

  // ── Frame Queue ──

  private scheduleFlush() {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    requestAnimationFrame(() => {
      this.flushScheduled = false;
      this.flushQueue();
    });
  }

  private flushAll() {
    this.flushScheduled = false;
    this.flushQueue(true);
  }

  private flushQueue(drainAll = false) {
    const start = performance.now();

    while (this.frameQueue.length > 0) {
      if (!drainAll && performance.now() - start > this.frameBudgetMs) {
        this.scheduleFlush();
        break;
      }

      // Backpressure: drop to next full frame if queue too large
      if (this.frameQueue.length > this.maxQueue) {
        this.dropToNextFull();
      }

      let frame = this.frameQueue.shift()!;

      // Coalesce consecutive partial frames
      if (frame.full === false) {
        frame = this.coalescePartials(frame);
      }

      this.applyStateFrame(frame);
    }
  }

  private dropToNextFull() {
    const idx = this.frameQueue.findIndex(f => f.full !== false);
    if (idx > 0) {
      const dropped = this.frameQueue.splice(0, idx);
      this.trace?.({ kind: 'dropped', detail: { count: dropped.length } });
    }
  }

  private coalescePartials(first: StateFrameState): StateFrameState {
    let merged = { ...first };
    let mergeCount = 0;

    while (this.frameQueue.length > 0 && this.frameQueue[0].full === false) {
      const next = this.frameQueue.shift()!;
      merged = {
        type: 'state',
        full: false,
        states: { ...merged.states, ...next.states },
        removed: [...new Set([...(merged.removed ?? []), ...(next.removed ?? [])])],
        changed: [...new Set([...(merged.changed ?? []), ...(next.changed ?? [])])],
      };
      mergeCount++;
    }

    if (mergeCount > 0) {
      this.trace?.({ kind: 'merged', detail: { count: mergeCount + 1 } });
    }

    return merged;
  }

  // ── Apply ──

  private applyStateFrame(frame: StateFrameState) {
    const prevStates = this.activeStates;
    const nextStates = applyFrame(prevStates, frame);

    if (frame.full !== false) {
      // Full frame: find removed keys
      const removedKeys = Object.keys(prevStates).filter(k => !(k in nextStates));
      const changedKeys = Object.keys(nextStates);
      this.sync(nextStates, changedKeys, removedKeys);
    } else {
      this.sync(nextStates, frame.changed ?? Object.keys(frame.states), frame.removed ?? []);
    }

    this.trace?.({
      kind: 'applied',
      detail: { full: frame.full !== false, stateCount: Object.keys(nextStates).length },
    });
  }

  private sync(nextStates: Record<string, any>, changedKeys: string[], removedKeys: string[]) {
    // Remove inactive templates
    for (const key of removedKeys) {
      if (this.mounted.has(key)) {
        const el = this.anchors.get(key);
        this.unmountTemplate(key, el!);
        this.mounted.delete(key);
        // Clear anchor content
        if (el) el.innerHTML = '';
      }
    }

    // Update changed templates
    for (const key of changedKeys) {
      if (!(key in nextStates)) continue;

      const el = this.anchors.get(key);
      if (!el) continue;

      if (!this.mounted.has(key)) {
        // First render for this anchor
        this.renderTemplate(key, nextStates[key], el);
        this.mounted.add(key);
      } else {
        // Update existing
        this.updateTemplate(key, nextStates[key], el);
      }
    }

    this.activeStates = nextStates;
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
    if (this.pendingAnchors.size === 0) return;

    for (const name of this.pendingAnchors) {
      const el = this.anchors.get(name);
      if (!el) continue;
      el.removeAttribute('data-pending');
    }

    this.pendingAnchors.clear();
  }
}
