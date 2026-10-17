import { describe, it, expect } from 'vitest';
import { h } from 'lithent';
import { renderToString } from 'lithent/ssr';
import { createHandler } from '../server/core/handler.js';
import { defineManifest } from '../server/core/manifest.js';
import { decodeFrames } from '../shared/ndjson.js';
import {
  applyFrame,
  checkWireFrame,
  frameSlots,
  mergeAccumulate,
  validateStateFrame,
  type StateFrame,
  type UiPatch,
  type WireFrame,
} from '../shared/protocol.js';
import { fuzzTimeout, random, seeds, type Random } from './fuzz.js';

/**
 * Stage 9 frame fuzz, server half (V-08): random authoring sequences (valid frames, missing
 * deltas, duplicates, wrong order, junk, limit-sized payloads) through the real handler.
 * The NDJSON answer, applied like the browser does, must match a prefix of the shared request
 * reducer: nothing after an invalid frame, nothing outside the targets, server HTML only of
 * states that existed, and the exact final state when the stream ends with `done`.
 */
const CLIENT = ['a', 'b'];
const SERVER = ['s1', 's2'];
const CONTENT = [...CLIENT, ...SERVER];
const Box = (props: Record<string, unknown>) => h('p', {}, JSON.stringify(props));
const ErrorBox = (props: { message: string }) => h('strong', {}, props.message);
const LIMITS = { frameSize: 8192, htmlSize: 2048, ops: 80 };

const value = (r: Random) =>
  r.pick([
    () => ({ text: r.pick(['', 'x', 'héllo', '<b>&"', ' ']) }),
    () => ({ items: Array.from({ length: r.int(4) }, () => r.int(9)) }),
    () => ({ n: r.int(100), text: 'n' }),
    () => ({}),
    () => ({ text: 'x'.repeat(r.pick([100, 3000, 9000])) }),
  ])();
const delta = (r: Random) =>
  r.pick([
    () => ({ text: r.pick(['y', 'zz']) }),
    () => ({ items: [r.int(9)] }),
    () => ({ n: 1 }),
  ])();
const uiPatch = (r: Random): UiPatch | null | Record<string, unknown> =>
  r.pick([
    { classAdd: ['on'] },
    { classRemove: ['on'], classAdd: ['off'] },
    { cssVars: { '--x': String(r.int(9)) } },
    null,
    { classAdd: ['bad token'] },
    { cssVars: { '--x': 'url(x)' } },
  ]);
const statesOf = (r: Random, names: string[], make: (r: Random) => unknown) =>
  Object.fromEntries(names.map(name => [name, make(r)]));

function frame(r: Random, previous: unknown[]): unknown {
  const roll = r.int(100);
  if (roll < 8 && previous.length) return structuredClone(r.pick(previous)); // duplicate
  if (roll < 35) {
    const names = r.subset(CONTENT);
    return {
      type: 'state',
      states: statesOf(r, names, value),
      ...(r.chance(0.4) ? { ui: statesOf(r, r.subset(CONTENT), uiPatch) } : {}),
      ...(r.chance(0.15) ? { reset: r.subset(names) } : {}),
      ...(r.chance(0.1) ? { full: true } : {}),
    };
  }
  if (roll < 60) {
    const changed = r.subset(CONTENT);
    const removed = r.chance(0.5) ? r.subset(CONTENT.filter(name => !changed.includes(name))) : [];
    if (r.chance(0.1)) removed.push(...changed.slice(0, 1)); // invalid overlap
    const uiChanged = r.chance(0.3) ? r.subset(CONTENT) : [];
    const ui = uiChanged.length ? statesOf(r, uiChanged, uiPatch) : undefined;
    const extra = r.chance(0.1) ? ['b'] : []; // missing delta: changed without state
    return {
      type: 'state',
      full: false,
      states: statesOf(r, changed, value),
      ...(changed.length || extra.length || r.chance(0.5)
        ? { changed: [...changed, ...extra] }
        : {}),
      ...(removed.length ? { removed } : {}),
      ...(uiChanged.length ? { uiChanged, ...(r.chance(0.9) ? { ui } : {}) } : {}),
      ...(r.chance(0.1) ? { reset: changed.slice(0, 1) } : {}),
    };
  }
  if (roll < 85)
    return {
      type: 'state',
      accumulate: true,
      states: statesOf(r, r.subset(CONTENT), delta),
      ...(r.chance(0.05) ? { removed: ['a'] } : {}),
      ...(r.chance(0.05) ? { ui: { a: null } } : {}),
    };
  return r.pick([
    () => ({ type: 'done' }),
    () => ({ type: 'error', message: 'x' }),
    () => null,
    () => 'state',
    () => 42,
    () => [],
    () => ({ type: 'state' }),
    () => ({ type: 'state', states: null }),
    () => ({ type: 'state', states: { fixed: {} } }),
    () => ({ type: 'state', states: { ghost: {} } }),
    () => ({ type: 'state', states: { a: 'not an object' } }),
    () => ({ type: 'state', full: false, states: {} }),
    () => ({ type: 'patch', ops: [{ slot: 'a', html: '<script>' }] }),
    () => JSON.parse('{"type":"state","states":{"__proto__":{"text":"p"},"a":{}}}'),
    () => ({ type: 'state', states: { a: {} }, ui: { a: { style: 'color:red' } } }),
  ])();
}

function handlerFor(frames: unknown[], targets: string[] | undefined) {
  const handler = async function* () {
    for (const item of frames) yield item as StateFrame;
  };
  return createHandler({
    development: true,
    limits: LIMITS,
    logger: { level: 'error', info() {}, warn() {}, error() {}, debug() {} },
    manifest: defineManifest({
      buildId: 'fuzz',
      routes: [
        {
          pattern: '/',
          module: { default: () => null },
          page: {
            id: 'fuzz',
            slots: {
              a: { mode: 'client', componentId: 'a#default' },
              b: { mode: 'client', componentId: 'b#default' },
              s1: { mode: 'server', componentId: 's1#default', component: Box },
              s2: { mode: 'server', componentId: 's2#default', component: Box },
              fixed: { mode: 'static', componentId: 'fixed#default' },
              'system:error': {
                mode: 'server',
                componentId: 'error#default',
                component: ErrorBox,
              },
            },
          },
        },
      ],
      transitions: { fuzz: targets ? { targets, handler } : handler },
    }),
  });
}

type Shown = { html?: string; props?: Record<string, unknown> };

/** Apply wire frames like the browser: last html/props per slot, merge folds, remove clears. */
function apply(frames: WireFrame[]) {
  const content: Record<string, Shown> = {};
  const ui: Record<string, UiPatch> = {};
  const slots = new Set<string>();
  for (const frame of frames) {
    if (frame.type !== 'patch') continue;
    for (const op of frame.ops) {
      slots.add(op.slot);
      if ('html' in op) content[op.slot] = { html: op.html };
      else if ('props' in op) content[op.slot] = { props: op.props };
      else if ('merge' in op)
        content[op.slot] = { props: mergeAccumulate(content[op.slot]?.props, op.merge) };
      else if ('remove' in op) {
        // slotDom.remove clears content and UI.
        delete content[op.slot];
        delete ui[op.slot];
      } else if (op.ui === null) delete ui[op.slot];
      else ui[op.slot] = op.ui;
    }
  }
  return { content, ui, slots };
}

const render = (state: unknown) => renderToString(h(Box, state as never));
const sorted = (record: Record<string, unknown>) =>
  JSON.stringify(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));

/**
 * The UI the browser should show (PROTOCOL, UI patches): a full frame sets every target slot
 * that keeps content (missing → cleared), a removed slot loses its UI, a partial frame sets
 * its `uiChanged` slots, accumulate frames keep the UI.
 */
function browserUi(
  current: Record<string, UiPatch>,
  frame: StateFrame,
  states: Record<string, unknown>,
  targets: Set<string>
): Record<string, UiPatch> {
  if (frame.accumulate) return current;
  const next = { ...current };
  const set = (slot: string, patch: UiPatch | null | undefined) => {
    if (patch) next[slot] = patch;
    else delete next[slot];
  };
  if (frame.full !== false) {
    for (const slot of targets) set(slot, slot in states ? frame.ui?.[slot] : null);
    return next;
  }
  for (const slot of frame.removed ?? []) delete next[slot];
  for (const slot of frame.uiChanged ?? [])
    if (!frame.removed?.includes(slot)) set(slot, frame.ui?.[slot]);
  return next;
}

const short = (text: string) => text.replace(/x{20,}/g, run => `x×${run.length}`);

async function run(seed: number) {
  const r = random(seed);
  const frames: unknown[] = [];
  for (let i = r.int(7); i > 0; i--) frames.push(frame(r, frames));
  const targets = r.pick([undefined, ['a', 's1'], CONTENT]);
  const response = await handlerFor(frames, targets).fetch(
    new Request('https://surface.test/transition/fuzz', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-surface-build': 'fuzz',
        'x-surface-page': 'fuzz',
      },
      body: '{}',
    })
  );
  const text = await response.text();
  const wire = decodeFrames<WireFrame>(text);
  const context = short(
    `seed ${seed}\ntargets ${JSON.stringify(targets)}\nframes ${JSON.stringify(frames)}\nwire ${text}`
  );

  // Well-formed stream: valid frames, one terminal frame at the end, a reset baseline first.
  // A failure before the first frame answers 500 with that error frame alone.
  if (response.status !== 200) {
    expect(response.status, context).toBe(500);
    expect(wire, context).toMatchObject([{ type: 'error' }]);
  }
  expect(text.endsWith('\n'), context).toBe(true);
  for (const item of wire) expect(checkWireFrame(item).ok, context).toBe(true);
  const terminal = wire.filter(item => item.type !== 'patch');
  expect(terminal, context).toHaveLength(1);
  expect(wire.at(-1), context).toBe(terminal[0]);
  const patches = wire.filter(item => item.type === 'patch');
  // Every full frame is a new baseline (`reset`); the first patch always is one.
  if (patches.length) expect(patches[0], context).toMatchObject({ reset: true });

  // Reducer prefix: states and UI after each structurally valid frame.
  const first = frames[0];
  const allowed = new Set(
    targets ?? (first && validateStateFrame(first).valid ? frameSlots(first as StateFrame) : [])
  );
  const states: Array<Record<string, any>> = [{}];
  const uis: Array<Record<string, UiPatch>> = [{}];
  for (const item of frames) {
    if (!validateStateFrame(item).valid) break;
    const next = applyFrame(states.at(-1)!, item as StateFrame);
    states.push(next);
    uis.push(browserUi(uis.at(-1)!, item as StateFrame, next, allowed));
  }

  const shown = apply(wire);
  for (const slot of shown.slots) {
    expect(allowed.has(slot), `${context}\nop outside targets: ${slot}`).toBe(true);
    expect(CONTENT.includes(slot), context).toBe(true);
  }
  for (const patch of patches)
    for (const op of patch.ops) {
      if ('html' in op) expect(SERVER, context).toContain(op.slot);
      if ('props' in op || 'merge' in op) expect(CLIENT, context).toContain(op.slot);
    }

  const matches = (k: number, exact: boolean) =>
    CONTENT.every(slot => {
      const actual = shown.content[slot];
      const at = (j: number) =>
        states[j][slot] === undefined ? actual === undefined : actual !== undefined;
      if (CLIENT.includes(slot))
        return at(k) && JSON.stringify(actual?.props) === JSON.stringify(states[k][slot]);
      // Server renders are coalesced: on an error the HTML may show an earlier state.
      const range = exact ? [k] : Array.from({ length: k + 1 }, (_, j) => j);
      return range.some(j =>
        states[j][slot] === undefined
          ? actual === undefined
          : actual?.html === render(states[j][slot])
      );
    }) &&
    (!exact || sorted(uis[k]) === sorted(shown.ui));

  if (terminal[0].type === 'done') {
    // Every frame was accepted, so every frame was valid and the final state is exact.
    expect(states.length - 1, `${context}\naccepted an invalid frame`).toBe(frames.length);
    expect(matches(frames.length, true), `${context}\nfinal state differs`).toBe(true);
  } else {
    expect(terminal[0], context).toMatchObject({ type: 'error', slot: 'system:error' });
    const k = states.findIndex((_, index) => matches(index, false));
    expect(k, `${context}\nshown state matches no reducer prefix`).toBeGreaterThanOrEqual(0);
  }
  return terminal[0].type;
}

describe('server frame fuzz (V-08)', () => {
  it(
    'never applies what the reducer would not, over 600 random sequences',
    async () => {
      const outcomes = { done: 0, error: 0 };
      for (const seed of seeds(600, 9000)) outcomes[(await run(seed)) as 'done' | 'error']++;
      // The generator must exercise both outcomes.
      if (!process.env.FUZZ_SEED) {
        expect(outcomes.done).toBeGreaterThan(60);
        expect(outcomes.error).toBeGreaterThan(60);
      }
    },
    fuzzTimeout()
  );

  const send = async (frames: unknown[], targets?: string[]) =>
    decodeFrames<WireFrame>(
      await (
        await handlerFor(frames, targets).fetch(
          new Request('https://surface.test/transition/fuzz', {
            method: 'POST',
            headers: { 'x-surface-build': 'fuzz', 'x-surface-page': 'fuzz' },
            body: '{}',
          })
        )
      ).text()
    );

  it('regression: a slot removed by a full frame forgets its UI, so the same patch is sent again', async () => {
    const highlight = { classAdd: ['on'] };
    const wire = await send(
      [
        { type: 'state', states: { a: {} }, ui: { s1: highlight } },
        {
          type: 'state',
          full: false,
          states: { s1: { text: 'back' } },
          changed: ['s1'],
          uiChanged: ['s1'],
          ui: { s1: highlight },
        },
      ],
      ['a', 's1']
    );
    expect(wire[1]).toEqual({
      type: 'patch',
      ops: [
        { slot: 's1', html: '<p>{"text":"back"}</p>' },
        { slot: 's1', ui: { classAdd: ['on'] } },
      ],
    });
  });

  it('regression: slot state must be an object (the browser stops on other props)', async () => {
    for (const state of ['text', 1, null, ['a']]) {
      const wire = await send([{ type: 'state', states: { a: state } }]);
      expect(wire).toMatchObject([
        { type: 'error', message: expect.stringContaining('states["a"] must be an object') },
      ]);
    }
  });
});
