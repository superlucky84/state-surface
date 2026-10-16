import {
  applyFrame,
  applyUi,
  frameSlots,
  validateStateFrame,
  type ErrorFrame,
  type Op,
  type PatchFrame,
  type StateFrame,
  type UiPatch,
} from '../shared/protocol.js';
import { assertJsonValue, SurfaceError } from '../shared/surfaceTree.js';
import type { SurfaceContext } from './core/context.js';
import type { PageDefinition, PageSlotDefinition } from './core/manifest.js';
import type { TransitionDefinition } from './transition.js';
import { renderSlotHtml } from './ssrRenderer.js';

/** DC-14 defaults; every value can be changed with `createHandler({ limits })`. */
export interface TransitionLimits {
  /** Longest wait for the next frame (ms). */
  idleTimeout: number;
  /** Whole request (ms). */
  timeout: number;
  /** One NDJSON line (bytes). */
  frameSize: number;
  /** One response in total (bytes). */
  responseSize: number;
  /** Ops in one request. */
  ops: number;
  /** One `html` op (bytes). */
  htmlSize: number;
  /** Server slot renders after which development warns (DC-10 ⑤). */
  serverRenders: number;
  /** Server slot render coalescing window (ms, DC-10 ④). */
  renderInterval: number;
}

export const DEFAULT_LIMITS: TransitionLimits = {
  idleTimeout: 30_000,
  timeout: 300_000,
  frameSize: 1024 * 1024,
  responseSize: 32 * 1024 * 1024,
  ops: 10_000,
  htmlSize: 512 * 1024,
  serverRenders: 200,
  renderInterval: 33,
};

/** A frame the transition yielded that breaks the authoring rules (DESIGN 6.2). */
export class FrameError extends SurfaceError {
  constructor(transition: string, index: number, reason: string) {
    super(`Transition "${transition}" frame #${index + 1}: ${reason}`);
    this.name = 'FrameError';
  }
}

/** A DC-14 size or count limit was exceeded. */
export class LimitError extends SurfaceError {
  constructor(message: string) {
    super(message);
    this.name = 'LimitError';
  }
}

const byteLength = (text: string) => new TextEncoder().encode(text).byteLength;

export interface ProjectionOptions {
  name: string;
  definition: TransitionDefinition;
  page: PageDefinition;
  ctx: SurfaceContext;
  limits: TransitionLimits;
  development: boolean;
  /** Page error slot for `error` frames (default `system:error`). */
  errorSlot: string;
  warn: (message: string) => void;
  now?: () => number;
}

/**
 * Request reducer and projection (DESIGN 6.1/6.2, DC-10). The slot state lives for this
 * request only and starts empty. Each authoring frame is validated, reduced with the
 * `applyFrame` rules and projected per slot mode: server slots render to `html` (coalesced
 * per slot: first update now, then at most once per interval, everything before done/error),
 * client slots get `props` or `merge`. One logical frame becomes one patch.
 */
export class RequestProjection {
  private state: Record<string, any> = {};
  private ui: Record<string, UiPatch | null> = {};
  private targets?: Set<string>;
  private index = 0;
  private lastRender = new Map<string, number>();
  private dirty = new Map<string, number>();
  private opCount = 0;
  private renders = 0;
  private warned = new Set<string>();
  /** Frames that came through `ctx.external()`: violations drop the frame (DC-14 ①). */
  readonly external = new WeakSet<object>();
  private readonly now: () => number;

  constructor(private readonly options: ProjectionOptions) {
    this.now = options.now ?? (() => performance.now());
  }

  get started() {
    return this.targets !== undefined;
  }

  warnOnce(key: string, message: string) {
    if (!this.options.development || this.warned.has(key)) return;
    this.warned.add(key);
    this.options.warn(message);
  }

  private slot(name: string): PageSlotDefinition | undefined {
    return Object.hasOwn(this.options.page.slots, name) ? this.options.page.slots[name] : undefined;
  }

  /** Validate and project one yielded frame. Returns undefined when nothing is sent. */
  async frame(input: unknown): Promise<PatchFrame | undefined> {
    const index = this.index++;
    const fail = (reason: string): never => {
      throw new FrameError(this.options.name, index, reason);
    };
    const external = typeof input === 'object' && input !== null && this.external.has(input);
    try {
      return await this.project(input, fail);
    } catch (error) {
      if (external && error instanceof FrameError) {
        this.options.warn(`[external] dropped frame: ${error.message}`);
        return undefined;
      }
      throw error;
    }
  }

  private async project(input: unknown, fail: (reason: string) => never) {
    const validation = validateStateFrame(input);
    if (!validation.valid) fail(validation.reason);
    const frame = input as StateFrame;
    const full = frame.full !== false && frame.accumulate !== true;
    if (!this.targets) {
      if (!full) fail('the first state frame must be a full frame');
      this.targets = new Set(this.options.definition.targets ?? frameSlots(frame));
    }
    const targets = this.targets;
    for (const name of frameSlots(frame)) {
      if (!targets.has(name)) fail(`slot "${name}" is outside the transition targets`);
      const slot = this.slot(name);
      if (!slot) fail(`slot "${name}" is not on page "${this.options.page.id}"`);
      if (slot!.mode === 'static') fail(`slot "${name}" is static and cannot be updated`);
    }

    const next = applyFrame(this.state, frame);
    const nextUi = applyUi(this.ui, frame);
    const removed: string[] = [];
    const content: string[] = [];
    if (full) {
      for (const name of targets) {
        const slot = this.slot(name);
        if (!slot || slot.mode === 'static') continue;
        if (name in next) content.push(name);
        else removed.push(name);
      }
    } else if (frame.accumulate) content.push(...Object.keys(frame.states));
    else {
      content.push(...(frame.changed ?? Object.keys(frame.states)));
      removed.push(...(frame.removed ?? []));
    }
    this.state = next;

    const ops: Op[] = [];
    for (const name of removed) {
      this.dirty.delete(name);
      ops.push({ slot: name, remove: true });
    }
    const now = this.now();
    for (const name of content) {
      const slot = this.slot(name)!;
      if (slot.mode === 'client') {
        if (frame.accumulate) {
          assertJsonValue(frame.states[name], `slot "${name}"`, 'merge');
          ops.push({ slot: name, merge: frame.states[name] });
        } else {
          assertJsonValue(next[name], `slot "${name}"`);
          ops.push({ slot: name, props: next[name] });
        }
        continue;
      }
      const last = this.lastRender.get(name);
      if (last === undefined || now - last >= this.options.limits.renderInterval) {
        this.dirty.delete(name);
        ops.push(await this.render(name));
      } else if (!this.dirty.has(name))
        this.dirty.set(name, last + this.options.limits.renderInterval);
    }
    // UI after content (DESIGN 6.2). A full frame resets the UI of every target slot.
    const uiSlots = full
      ? [...targets].filter(name => this.slot(name) && !removed.includes(name))
      : (frame.uiChanged ?? []).filter(name => !removed.includes(name));
    for (const name of uiSlots)
      if (full || nextUi[name] !== this.ui[name])
        ops.push({ slot: name, ui: nextUi[name] ?? null });
    this.ui = nextUi;
    return this.patch(ops, full);
  }

  private patch(ops: Op[], reset: boolean): PatchFrame | undefined {
    if (!ops.length && !reset) return undefined;
    this.opCount += ops.length;
    if (this.opCount > this.options.limits.ops)
      throw new LimitError(`Transition exceeded ${this.options.limits.ops} ops`);
    if (this.opCount > this.options.limits.ops * 0.8)
      this.warnOnce('ops', `[transition] "${this.options.name}" is at 80% of the op limit`);
    return { type: 'patch', ...(reset ? { reset: true as const } : {}), ops };
  }

  private async render(name: string): Promise<Op> {
    const slot = this.slot(name)!;
    const props = this.state[name];
    this.lastRender.set(name, this.now());
    if (++this.renders > this.options.limits.serverRenders)
      this.warnOnce(
        'renders',
        `[transition] "${this.options.name}" rendered server slots ${this.renders} times; ` +
          'stream long accumulating content to a client slot (merge) instead (DC-10).'
      );
    const result = await renderSlotHtml({
      slot: name,
      component: slot.component,
      props: (props ?? {}) as Record<string, unknown>,
      ctx: this.options.ctx,
      capability: slot.capability,
      sandbox: slot.sandbox,
    });
    const size = byteLength(result.html);
    if (size > this.options.limits.htmlSize)
      throw new LimitError(`html for slot "${name}" exceeds ${this.options.limits.htmlSize} bytes`);
    if (size > this.options.limits.htmlSize * 0.8)
      this.warnOnce(`html:${name}`, `[transition] html for slot "${name}" is at 80% of its limit`);
    return {
      slot: name,
      html: result.html,
      ...(result.islands.length ? { islands: result.islands } : {}),
    };
  }

  /** Earliest time a coalesced server render is due. */
  nextDue(): number | undefined {
    let due: number | undefined;
    for (const time of this.dirty.values()) if (due === undefined || time < due) due = time;
    return due;
  }

  /** Render coalesced server slots whose window has passed (or all of them). */
  async flush(all = false): Promise<PatchFrame | undefined> {
    const now = this.now();
    const ops: Op[] = [];
    for (const [name, due] of [...this.dirty])
      if (all || due <= now) {
        this.dirty.delete(name);
        ops.push(await this.render(name));
      }
    return this.patch(ops, false);
  }

  /** `error` frame with the page's error slot content when the page has one. */
  async error(message: string): Promise<ErrorFrame> {
    const name = this.options.errorSlot;
    const slot = this.slot(name);
    if (!slot || slot.mode === 'static') return { type: 'error', message };
    const props = { message };
    if (slot.mode === 'client') return { type: 'error', message, slot: name, props };
    try {
      const result = await renderSlotHtml({
        slot: name,
        component: slot.component,
        props,
        ctx: this.options.ctx,
        capability: slot.capability,
        sandbox: slot.sandbox,
      });
      return {
        type: 'error',
        message,
        slot: name,
        html: result.html,
        ...(result.islands.length ? { islands: result.islands } : {}),
      };
    } catch {
      return { type: 'error', message };
    }
  }

  /** Development check of the external slots of this page (DESIGN 8.1). */
  externalSlot(name: string) {
    const slot = this.slot(name);
    if (slot?.external && slot.capability === 'unsafe')
      this.warnOnce(
        `unsafe:${name}`,
        `[external] slot "${name}" accepts external frames as unsafe HTML`
      );
    return slot?.external ? slot : undefined;
  }
}

/**
 * `ctx.external(source)` (DC-14 ⑥): frames from an outside source (an agent, a queue) may
 * only touch `external` slots and must pass each slot's Standard Schema. Violating frames
 * are dropped and traced; the transition continues.
 */
export function externalFrames(projection: RequestProjection, warn: (message: string) => void) {
  return async function* external(
    source: AsyncIterable<unknown> | Iterable<unknown>
  ): AsyncGenerator<StateFrame, void, unknown> {
    for await (const input of source as AsyncIterable<unknown>) {
      const validation = validateStateFrame(input);
      if (!validation.valid) {
        warn(`[external] dropped frame: ${validation.reason}`);
        continue;
      }
      const frame = input as StateFrame;
      let problem: string | undefined;
      const states: Record<string, unknown> = {};
      for (const name of frameSlots(frame)) {
        if (!projection.externalSlot(name)) {
          problem = `slot "${name}" does not accept external frames`;
          break;
        }
      }
      if (!problem)
        for (const [name, value] of Object.entries(frame.states)) {
          const schema = projection.externalSlot(name)!.schema!;
          const result = await schema['~standard'].validate(value);
          if (result.issues) {
            problem = `slot "${name}": ${result.issues.map(issue => issue.message).join('; ')}`;
            break;
          }
          states[name] = result.value;
        }
      if (problem) {
        warn(`[external] dropped frame: ${problem}`);
        continue;
      }
      const accepted: StateFrame = { ...frame, states };
      projection.external.add(accepted);
      yield accepted;
    }
  };
}
