/**
 * Two-layer contract (DESIGN 6.2, DC-09).
 *
 * ① Authoring layer: what a transition yields (or returns). Logical state frames with the
 *   full · partial · accumulate · removed · ui model. There is no `done` (the engine sends it
 *   when the handler returns) and no `error` (throw instead).
 * ② Transport layer: what the server streams to the browser. Per-slot op lists that the
 *   browser executes in order without interpreting merge rules. Engine-internal.
 */

import type { RouterOptions } from './surfaceTree.js';

// ── Authoring layer ──

export type UiPatch = {
  classAdd?: string[];
  classRemove?: string[];
  cssVars?: Record<string, string>;
};

export type StateFrame = {
  type: 'state';
  states: Record<string, any>;
  ui?: Record<string, UiPatch | null>;
  /** Defaults to true: replaces the request targets. The first frame must be full. */
  full?: boolean;
  accumulate?: boolean;
  changed?: string[];
  removed?: string[];
  uiChanged?: string[];
  /** Client slots in `states` whose component instance is re-created (local state reset, DC-05). */
  reset?: string[];
};

/** Return value of a non-streaming (async function) transition: one full frame. */
export type TransitionResult = {
  states?: Record<string, any>;
  ui?: Record<string, UiPatch | null>;
} | void;

// ── Transport layer ──

/** Client island inside server HTML (or the bootstrap): what the loader needs to activate it. */
export interface IslandMeta {
  id: string;
  component: string;
  props: Record<string, unknown>;
  /** Omitted for `load`. */
  activation?: 'idle' | 'visible' | 'media';
  media?: string;
  only?: true;
  /** DC-05: prop names whose values identify the instance across morph. */
  resetKey?: string[];
  /** DC-19: persist ID kept across client navigation; `persistProps` keeps the old props. */
  persist?: string;
  persistProps?: true;
}

export type HtmlOp = { slot: string; html: string; islands?: IslandMeta[] };
export type PropsOp = { slot: string; props: Record<string, unknown>; reset?: true };
export type MergeOp = { slot: string; merge: Record<string, unknown> };
export type RemoveOp = { slot: string; remove: true };
export type UiOp = { slot: string; ui: UiPatch | null };
export type Op = HtmlOp | PropsOp | MergeOp | RemoveOp | UiOp;

export interface PatchFrame {
  type: 'patch';
  /** The frame was a full authoring frame (request baseline). */
  reset?: true;
  ops: Op[];
}
export interface DoneFrame {
  type: 'done';
}
/** Ends the request. `slot` names the page's error slot with its rendered content. */
export interface ErrorFrame {
  type: 'error';
  message: string;
  /**
   * `validation`: the input schema rejected the params (the handler did not run).
   * `timeout`: the transition exceeded its total or idle timeout (DC-14).
   */
  kind?: 'validation' | 'timeout';
  fieldErrors?: Record<string, string[]>;
  slot?: string;
  html?: string;
  islands?: IslandMeta[];
  props?: Record<string, unknown>;
}
export type WireFrame = PatchFrame | DoneFrame | ErrorFrame;

// ── Bootstrap (`<script id="__SURFACE__">`) ──

/**
 * A rendered slot or island. Named slots use their name as `id`; islands use `$N` at page
 * level and `<slot>$N` inside a slot. Server slots carry no props (their input stays on the
 * server); client entries carry the SSR snapshot props.
 */
export interface SlotMeta {
  id: string;
  mode: 'static' | 'server' | 'client';
  component?: string;
  props?: Record<string, unknown>;
  activation?: 'idle' | 'visible' | 'media';
  media?: string;
  only?: true;
  /** Client slots and islands (DC-05): prop names whose values identify the instance. */
  resetKey?: string[];
  /** Client slots and islands (DC-19): persist ID across client navigation. */
  persist?: string;
  persistProps?: true;
  /** Server slots: `morph` (default `replace`). */
  swap?: 'morph';
  viewTransition?: true;
  /** Deferred server slot (DC-21): sealed props token. */
  defer?: string;
}

export interface PluginMeta {
  id: string;
  load: 'load' | 'idle' | 'visible';
  slots?: string[];
}

/** Client concurrency metadata of transitions that declare targets or `mode: 'queue'` (DC-11). */
export interface ActionMeta {
  targets?: string[];
  queue?: true;
}

export interface SurfaceBootstrap {
  buildId: string;
  pageId: string;
  basePath: string;
  slots?: SlotMeta[];
  boot?: Array<{ transition: string; params: Record<string, unknown> }>;
  plugins?: PluginMeta[];
  /** Transitions without an entry overlap every slot (DC-30). */
  actions?: Record<string, ActionMeta>;
  /** `<ClientRouter>` options (DC-18); absent on pages without the router. */
  router?: RouterOptions;
}

// ── Validation ──

export type ValidationResult = { valid: true } | { valid: false; reason: string };

const invalid = (reason: string): ValidationResult => ({ valid: false, reason });

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** DESIGN 8.1: class tokens and custom property names/values a UI patch may carry. */
export const CLASS_TOKEN = /^[A-Za-z0-9_:/[\].-]+$/;
const CSS_VAR = /^--[A-Za-z0-9_-]+$/;
const CSS_VALUE_FORBIDDEN = /[;{}\\]|url\s*\(|expression\s*\(/i;

/** Returns why a UI patch is rejected, or undefined when it is valid. */
export function uiPatchProblem(patch: unknown): string | undefined {
  if (!isPlainObject(patch)) return 'a UI patch must be an object or null';
  for (const key of Object.keys(patch))
    if (key !== 'classAdd' && key !== 'classRemove' && key !== 'cssVars')
      return `unknown UI patch field "${key}"`;
  for (const key of ['classAdd', 'classRemove'] as const) {
    const list = patch[key];
    if (list === undefined) continue;
    if (!Array.isArray(list)) return `"${key}" must be an array of class names`;
    for (const token of list)
      if (typeof token !== 'string' || !CLASS_TOKEN.test(token))
        return `"${key}" contains an invalid class token ${JSON.stringify(token)}`;
  }
  if (patch.cssVars !== undefined) {
    if (!isPlainObject(patch.cssVars)) return '"cssVars" must be an object';
    for (const [name, value] of Object.entries(patch.cssVars)) {
      if (!CSS_VAR.test(name)) return `cssVars key "${name}" must be a custom property (--name)`;
      if (typeof value !== 'string' || CSS_VALUE_FORBIDDEN.test(value))
        return `cssVars value for "${name}" is not allowed`;
    }
  }
  return undefined;
}

/** Authoring-layer validation of one yielded frame (structure only; targets are checked later). */
export function validateStateFrame(frame: unknown): ValidationResult {
  if (!isPlainObject(frame)) return invalid('Frame must be a non-null object');
  if (frame.type === 'done')
    return invalid('Transitions do not yield "done"; the engine sends it when the handler returns');
  if (frame.type === 'error')
    return invalid('Transitions do not yield "error"; throw an Error instead');
  if (frame.type !== 'state') return invalid(`Unknown frame type: "${String(frame.type)}"`);
  if (!isPlainObject(frame.states)) return invalid('"states" must be a non-null object');
  const states = frame.states;

  if (frame.reset !== undefined) {
    if (!Array.isArray(frame.reset) || frame.reset.some(key => typeof key !== 'string'))
      return invalid('"reset" must be an array of slot names');
    if (frame.accumulate === true) return invalid('Accumulate frame must not include "reset"');
    for (const key of frame.reset)
      if (!(key in states)) return invalid(`"reset" key "${key}" must exist in "states"`);
  }

  if (frame.accumulate === true) {
    if (frame.removed !== undefined) return invalid('Accumulate frame must not include "removed"');
    if (frame.ui !== undefined) return invalid('Accumulate frame must not include "ui"');
    if (frame.full === true) return invalid('Accumulate frame cannot be a full frame');
    return { valid: true };
  }

  if (frame.ui !== undefined) {
    if (!isPlainObject(frame.ui)) return invalid('"ui" must be an object');
    for (const [key, patch] of Object.entries(frame.ui)) {
      if (patch === null) continue;
      const problem = uiPatchProblem(patch);
      if (problem) return invalid(`ui["${key}"]: ${problem}`);
    }
  }

  // Full frame (the default): the complete state of the request targets.
  if (frame.full !== false) return { valid: true };

  const { changed, removed, uiChanged } = frame;
  for (const [name, list] of [
    ['changed', changed],
    ['removed', removed],
    ['uiChanged', uiChanged],
  ] as const)
    if (list !== undefined && (!Array.isArray(list) || list.some(key => typeof key !== 'string')))
      return invalid(`"${name}" must be an array of slot names when present`);

  const changedKeys = (changed as string[] | undefined) ?? [];
  const removedKeys = (removed as string[] | undefined) ?? [];
  const uiKeys = (uiChanged as string[] | undefined) ?? [];
  if (!changedKeys.length && !removedKeys.length && !uiKeys.length)
    return invalid(
      'Partial frame (full:false) requires at least one of "changed", "removed", or "uiChanged"'
    );
  for (const key of changedKeys)
    if (!(key in states)) return invalid(`"changed" key "${key}" must exist in "states"`);
  for (const key of removedKeys)
    if (key in states) return invalid(`"removed" key "${key}" must NOT exist in "states"`);
  const changedSet = new Set(changedKeys);
  for (const key of removedKeys)
    if (changedSet.has(key))
      return invalid(`Key "${key}" cannot appear in both "changed" and "removed"`);
  const removedSet = new Set(removedKeys);
  const ui = frame.ui as Record<string, unknown> | undefined;
  for (const key of uiKeys) {
    if (removedSet.has(key)) continue; // removed slots ignore uiChanged silently
    if (!ui || !(key in ui)) return invalid(`"uiChanged" key "${key}" must exist in "ui"`);
  }
  return { valid: true };
}

/** Slot names an authoring frame touches (content and UI). */
export function frameSlots(frame: StateFrame): string[] {
  const names = new Set(Object.keys(frame.states));
  if (frame.full !== false || frame.accumulate) return [...names, ...Object.keys(frame.ui ?? {})];
  for (const key of frame.removed ?? []) names.add(key);
  for (const key of frame.uiChanged ?? []) names.add(key);
  return [...names];
}

/**
 * Light structural check of a transport frame in the browser (DC-14 ②). The server is the
 * canonical validator; a content op violation stops the request, an invalid `ui` op is
 * skipped. Returns the ops to apply (invalid ui ops removed) or the reason to stop.
 */
export function checkWireFrame(
  frame: unknown
):
  | { ok: true; frame: WireFrame; skipped: Array<{ slot: string; reason: string }> }
  | { ok: false; reason: string } {
  if (!isPlainObject(frame)) return { ok: false, reason: 'frame must be an object' };
  if (frame.type === 'done') return { ok: true, frame: { type: 'done' }, skipped: [] };
  if (frame.type === 'error') {
    if (typeof frame.message !== 'string')
      return { ok: false, reason: 'error frame needs a message' };
    if (frame.slot !== undefined && typeof frame.slot !== 'string')
      return { ok: false, reason: 'error frame slot must be a string' };
    if (frame.html !== undefined && typeof frame.html !== 'string')
      return { ok: false, reason: 'error frame html must be a string' };
    if (frame.props !== undefined && !isPlainObject(frame.props))
      return { ok: false, reason: 'error frame props must be an object' };
    if (frame.islands !== undefined && islandsProblem(frame.islands))
      return { ok: false, reason: islandsProblem(frame.islands)! };
    if (frame.kind !== undefined && frame.kind !== 'validation' && frame.kind !== 'timeout')
      return { ok: false, reason: 'unknown error frame kind' };
    if (
      frame.fieldErrors !== undefined &&
      (!isPlainObject(frame.fieldErrors) ||
        Object.values(frame.fieldErrors).some(
          messages =>
            !Array.isArray(messages) || messages.some(message => typeof message !== 'string')
        ))
    )
      return { ok: false, reason: 'error frame fieldErrors must map fields to messages' };
    return { ok: true, frame: frame as unknown as ErrorFrame, skipped: [] };
  }
  if (frame.type !== 'patch') return { ok: false, reason: `unknown frame type "${frame.type}"` };
  if (!Array.isArray(frame.ops)) return { ok: false, reason: 'patch ops must be an array' };
  const ops: Op[] = [];
  const skipped: Array<{ slot: string; reason: string }> = [];
  for (const op of frame.ops) {
    if (!isPlainObject(op) || typeof op.slot !== 'string' || !op.slot)
      return { ok: false, reason: 'op needs a slot name' };
    const kinds = ['html', 'props', 'merge', 'remove', 'ui'].filter(kind => kind in op);
    const extra = Object.keys(op).filter(
      key =>
        key !== 'slot' &&
        !kinds.includes(key) &&
        !(key === 'islands' && 'html' in op) &&
        !(key === 'reset' && 'props' in op && op.reset === true)
    );
    if (kinds.length !== 1 || extra.length)
      return { ok: false, reason: `unknown op for slot "${op.slot}" (version mismatch)` };
    const kind = kinds[0];
    if (kind === 'html') {
      if (typeof op.html !== 'string')
        return { ok: false, reason: `html op for "${op.slot}" must carry a string` };
      if (op.islands !== undefined && islandsProblem(op.islands))
        return { ok: false, reason: islandsProblem(op.islands)! };
    } else if (kind === 'props' || kind === 'merge') {
      if (!isPlainObject(op[kind]))
        return { ok: false, reason: `${kind} op for "${op.slot}" must carry an object` };
    } else if (kind === 'remove') {
      if (op.remove !== true)
        return { ok: false, reason: `remove op for "${op.slot}" must be true` };
    } else if (op.ui !== null) {
      const problem = uiPatchProblem(op.ui);
      if (problem) {
        skipped.push({ slot: op.slot, reason: problem });
        continue;
      }
    }
    ops.push(op as unknown as Op);
  }
  return {
    ok: true,
    frame: { type: 'patch', ...(frame.reset === true ? { reset: true } : {}), ops },
    skipped,
  };
}

function islandsProblem(islands: unknown): string | undefined {
  if (!Array.isArray(islands)) return 'islands must be an array';
  for (const island of islands)
    if (
      !isPlainObject(island) ||
      typeof island.id !== 'string' ||
      typeof island.component !== 'string' ||
      !isPlainObject(island.props)
    )
      return 'island metadata needs id, component and props';
    else if (
      island.resetKey !== undefined &&
      (!Array.isArray(island.resetKey) || island.resetKey.some(key => typeof key !== 'string'))
    )
      return 'island resetKey must be an array of prop names';
  return undefined;
}

// ── Accumulate merge ──

/** DC-10 accumulate rule: arrays concat, strings concat, other values replace (shallow). */
export function mergeAccumulate(existing: any, incoming: any): any {
  if (existing === undefined || existing === null) return incoming;
  if (typeof existing !== 'object' || typeof incoming !== 'object' || incoming === null)
    return incoming;
  const result: Record<string, any> = { ...existing };
  for (const [k, v] of Object.entries(incoming as Record<string, any>)) {
    const e = existing[k];
    if (Array.isArray(e) && Array.isArray(v)) result[k] = [...e, ...v];
    else if (typeof e === 'string' && typeof v === 'string') result[k] = e + v;
    else result[k] = v;
  }
  return result;
}

// ── Request reducer (server, DC-10) ──

export function applyUi(
  activeUi: Record<string, UiPatch | null>,
  frame: StateFrame
): Record<string, UiPatch | null> {
  if (frame.accumulate === true) return activeUi;
  if (frame.full !== false) return frame.ui ? { ...frame.ui } : {};
  const hasRemoved = !!frame.removed?.length;
  if (!frame.ui && !hasRemoved) return activeUi;
  const next = { ...activeUi };
  for (const key of frame.removed ?? []) delete next[key];
  if (frame.ui && frame.uiChanged) {
    const removed = new Set(frame.removed ?? []);
    for (const key of frame.uiChanged) {
      if (removed.has(key)) continue;
      const patch = frame.ui[key];
      if (patch === null) delete next[key];
      else next[key] = patch;
    }
  }
  return next;
}

export function applyFrame(
  activeStates: Record<string, any>,
  frame: StateFrame
): Record<string, any> {
  if (frame.accumulate === true) {
    const next = { ...activeStates };
    for (const [key, incoming] of Object.entries(frame.states))
      next[key] = mergeAccumulate(next[key], incoming);
    return next;
  }
  if (frame.full !== false) return { ...frame.states };
  const next = { ...activeStates, ...frame.states };
  for (const key of frame.removed ?? []) delete next[key];
  return next;
}
