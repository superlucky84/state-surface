/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { h } from 'lithent';
import type { TagFunction } from 'lithent';
import { StateSurface } from '../client/stateSurface.js';
import { ComponentHost } from '../client/componentHost.js';
import { SlotDom } from '../client/slotDom.js';
import {
  checkWireFrame,
  mergeAccumulate,
  type Op,
  type SlotMeta,
  type UiPatch,
} from '../shared/protocol.js';
import { fuzzTimeout, random, seeds, type Random } from './fuzz.js';

/**
 * Stage 9 frame fuzz, browser half (V-08): random NDJSON responses (reset first or not,
 * duplicates, ops after done, broken JSON, EOF, unknown and mismatched ops, invalid UI)
 * split into random byte chunks, fed to the action runtime. The result and the DOM must
 * follow the request state table: `ok` exactly for a valid response; the DOM shows every
 * accepted op in order for a completed (or server-failed) request and a frame prefix of them
 * for a protocol failure; nothing after the terminal frame.
 */
const Text = ((props: { text?: string }) =>
  h('p', { class: 'text' }, props.text ?? '')) as unknown as TagFunction;
const SLOTS: SlotMeta[] = [
  { id: 's1', mode: 'server' },
  { id: 's2', mode: 'server' },
  { id: 'c1', mode: 'client', component: 'text#default' },
  { id: 'fixed', mode: 'static' },
  { id: 'system:error', mode: 'server' },
];
const MODES = Object.fromEntries(SLOTS.map(slot => [slot.id, slot.mode]));
/** SSR host attributes a UI patch may change and must give back. */
const BASE: Record<string, { classes: string[]; vars: string }> = {
  s2: { classes: ['base', 'on'], vars: '0' },
};
const SSR: Record<string, string> = {
  s1: '<p>ssr1</p>',
  s2: '<p>ssr2</p>',
  c1: '',
  fixed: '<p>fixed</p>',
};

const uiPatch = (r: Random) =>
  r.pick([
    { classAdd: ['on'] },
    { classAdd: ['off'], classRemove: ['on'] },
    { classRemove: ['base'], classAdd: ['on'] },
    { cssVars: { '--x': String(r.int(9)) } },
    null,
    { classAdd: ['bad token'] },
    { cssVars: { '--x': 'url(x)' } },
  ]);
const op = (r: Random): unknown =>
  r.pick([
    () => ({ slot: r.pick(['s1', 's2']), html: r.pick(['<p>a</p>', '<p>b</p>', '<p>é ✓</p>']) }),
    () => ({ slot: 'c1', props: { text: r.pick(['', 'x', 'ü']) } }),
    () => ({ slot: 'c1', props: { text: 'r' }, reset: true }),
    () => ({ slot: 'c1', merge: { text: r.pick(['y', 'z']) } }),
    () => ({ slot: r.pick(['s1', 'c1']), remove: true }),
    () => ({ slot: r.pick(['s1', 's2', 's2', 'c1']), ui: uiPatch(r) }),
    () => ({ slot: 'ghost', html: '<p>ghost</p>' }), // not on this page: ignored
    () => ({ slot: 'c1', html: '<p>wrong mode</p>' }),
    () => ({ slot: 's1', props: {} }),
    () => ({ slot: 'fixed', r: 1, ...r.pick([{ remove: true }, { ui: { classAdd: ['x'] } }]) }),
    () => ({ slot: 's1', append: '<p>new op</p>' }),
    () => ({ slot: 's1', remove: false }),
    () => ({ html: '<p>no slot</p>' }),
  ])();
const DONE = JSON.stringify({ type: 'done' });
const ERROR = JSON.stringify({
  type: 'error',
  message: 'boom',
  slot: 'system:error',
  html: '<b>boom</b>',
});
const frame = (r: Random, previous: string[]): string => {
  const roll = r.int(100);
  if (roll < 6 && previous.length) return r.pick(previous); // duplicate line
  if (roll < 85)
    return JSON.stringify({
      type: 'patch',
      ...(r.chance(previous.length ? 0.15 : 0.9) ? { reset: true } : {}),
      // Mostly valid ops: invalid ones stay rare enough for responses to reach `done`.
      ops: Array.from({ length: r.int(4) }, () => (r.chance(0.92) ? validOp(r) : op(r))),
    });
  return r.pick([
    () => DONE,
    () => ERROR,
    () => JSON.stringify({ type: 'error', message: 'no slot' }),
    () => '{"type":"patch","ops":[', // broken JSON
    () => '',
    () => JSON.stringify({ type: 'state', states: {} }),
    () => JSON.stringify([]),
    () => JSON.stringify({ type: 'patch', ops: 'x' }),
  ])();
};
function validOp(r: Random): unknown {
  return r.pick([
    () => ({ slot: r.pick(['s1', 's2']), html: r.pick(['<p>a</p>', '<p>b</p>', '<p>é ✓</p>']) }),
    () => ({ slot: 'c1', props: { text: r.pick(['', 'x', 'ü']) } }),
    () => ({ slot: 'c1', merge: { text: r.pick(['y', 'z']) } }),
    () => ({ slot: r.pick(['s1', 'c1']), remove: true }),
    () => ({ slot: r.pick(['s1', 's2', 'c1']), ui: uiPatch(r) }),
    // s2 has SSR classes and a variable: patches replacing patches must give them back.
    () => ({ slot: 's2', ui: uiPatch(r) }),
    () => ({ slot: 's2', ui: uiPatch(r) }),
  ])();
}

/** The request state table of PROTOCOL.md, written out for the oracle. */
function expected(lines: string[]) {
  type State = 'awaiting' | 'active' | 'completed' | 'failed' | 'protocol';
  let state = 'awaiting' as State;
  const accepted: Op[][] = [];
  let error: string | undefined;
  for (const line of lines) {
    if (state === 'completed' || state === 'failed' || state === 'protocol') break;
    if (!line.trim()) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      state = 'protocol';
      break;
    }
    const checked = checkWireFrame(raw);
    if (!checked.ok) {
      state = 'protocol';
      break;
    }
    const wire = checked.frame;
    if (wire.type === 'done') state = 'completed';
    else if (wire.type === 'error') {
      state = 'failed';
      if (wire.slot === 'system:error' && wire.html !== undefined) error = wire.html;
    } else {
      if (state === 'awaiting' && !wire.reset) {
        state = 'protocol';
        break;
      }
      state = 'active';
      const ops = wire.ops.filter(item => item.slot in MODES);
      const mismatch = ops.some(
        item =>
          MODES[item.slot] === 'static' ||
          ('html' in item && MODES[item.slot] !== 'server') ||
          (('props' in item || 'merge' in item) && MODES[item.slot] !== 'client')
      );
      if (mismatch) {
        state = 'protocol';
        break;
      }
      accepted.push(ops);
    }
  }
  if (state === 'awaiting' || state === 'active') state = 'protocol'; // EOF without done
  return { state, accepted, error };
}

type View = Record<string, { html: string; classes: string[]; vars: string }>;

/** DOM after applying ops one by one (no coalescing): what coalescing must reproduce. */
function sequential(frames: Op[][]): View {
  const html = { ...SSR };
  let props: Record<string, unknown> | undefined;
  const ui: Record<string, UiPatch | undefined> = {};
  for (const ops of frames)
    for (const item of ops) {
      if ('html' in item) html[item.slot] = item.html;
      else if ('props' in item) props = item.props;
      else if ('merge' in item) props = mergeAccumulate(props, item.merge);
      else if ('remove' in item) {
        if (item.slot === 'c1') props = undefined;
        else html[item.slot] = '';
        ui[item.slot] = undefined;
      } else ui[item.slot] = item.ui ?? undefined;
    }
  html.c1 = props ? `<p class="text">${String(props.text ?? '')}</p>` : '';
  return Object.fromEntries(
    ['s1', 's2', 'c1', 'fixed'].map(slot => [
      slot,
      {
        html: html[slot],
        // The SSR host classes and variable plus the current patch only (slotDom.setUi).
        classes: [
          ...new Set([
            ...(BASE[slot]?.classes ?? []).filter(name => !ui[slot]?.classRemove?.includes(name)),
            ...(ui[slot]?.classAdd ?? []),
          ]),
        ].sort(),
        vars: ui[slot]?.cssVars?.['--x'] ?? BASE[slot]?.vars ?? '',
      },
    ])
  );
}

function setup() {
  document.body.innerHTML = SLOTS.map(slot => {
    const base = BASE[slot.id];
    const attributes = base ? ` class="${base.classes.join(' ')}" style="--x: ${base.vars}"` : '';
    return `<h-state name="${slot.id}"${attributes}>${SSR[slot.id] ?? ''}</h-state>`;
  }).join('');
  const host = new ComponentHost({ loaders: { 'text#default': async () => Text } });
  const surface = new StateSurface({
    bootstrap: { buildId: 'b1', pageId: 'page', basePath: '' },
    slots: SLOTS,
    host,
    dom: new SlotDom(host, undefined),
  });
  surface.discoverAnchors();
  return surface;
}

function view(): View {
  return Object.fromEntries(
    ['s1', 's2', 'c1', 'fixed'].map(slot => {
      const el = document.querySelector<HTMLElement>(`h-state[name="${slot}"]`)!;
      return [
        slot,
        {
          html: el.innerHTML,
          classes: [...el.classList].sort(),
          vars: el.style.getPropertyValue('--x'),
        },
      ];
    })
  );
}

/** The body as random byte chunks: lines and UTF-8 characters split anywhere. */
function body(r: Random, text: string) {
  const pause = () => r.chance(0.4);
  const bytes = new TextEncoder().encode(text);
  const cuts = [...new Set(Array.from({ length: r.int(6) }, () => r.int(bytes.length + 1)))].sort(
    (a, b) => a - b
  );
  const chunks: Uint8Array[] = [];
  let start = 0;
  for (const cut of [...cuts, bytes.length]) {
    chunks.push(bytes.slice(start, cut));
    start = cut;
  }
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = chunks.shift();
      if (!next) return controller.close();
      // Sometimes let an animation frame pass: ops then apply in several flushes.
      if (pause()) await new Promise(resolve => setTimeout(resolve, 2));
      else await Promise.resolve();
      controller.enqueue(next);
    },
  });
}

/** Client components render after their chunk loads: wait until `check` holds (≤ 300 ms). */
const eventually = async (check: () => boolean) => {
  for (let waited = 0; waited < 300 && !check(); waited += 5)
    await new Promise(resolve => setTimeout(resolve, 5));
};

afterEach(() => vi.unstubAllGlobals());

describe('browser frame fuzz (V-08)', () => {
  it(
    'follows the request state table for 400 random responses',
    async () => {
      const outcomes = { completed: 0, failed: 0, protocol: 0 };
      for (const seed of seeds(400, 31000)) {
        const r = random(seed);
        // A body of mostly patches, then (usually) a terminal frame and sometimes more lines.
        const lines: string[] = [];
        for (let i = r.int(8); i > 0; i--) lines.push(frame(r, lines));
        if (r.chance(0.85)) lines.push(r.chance(0.8) ? DONE : ERROR);
        if (r.chance(0.2)) lines.push(frame(r, lines));
        const text = lines.join('\n') + (r.chance(0.9) ? '\n' : '');
        const model = expected(lines);
        outcomes[model.state as keyof typeof outcomes]++;
        // Animation frames on the next timer tick, so a pause between chunks flushes.
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
          setTimeout(() => callback(performance.now()), 0)
        );
        const surface = setup();
        vi.stubGlobal(
          'fetch',
          async () =>
            new Response(body(r, text), { headers: { 'content-type': 'application/x-ndjson' } })
        );
        const context = `seed ${seed}\n${text}`;
        const result = await surface.transition('fuzz');
        expect(result.ok, context).toBe(model.state === 'completed');
        // Protocol failure: ops applied in an earlier animation frame stay, the rest is dropped.
        const allowed =
          model.state === 'protocol'
            ? Array.from({ length: model.accepted.length + 1 }, (_, j) =>
                JSON.stringify(sequential(model.accepted.slice(0, j)))
              )
            : [JSON.stringify(sequential(model.accepted))];
        await eventually(() => allowed.includes(JSON.stringify(view())));
        expect(allowed, `${context}\nshown ${JSON.stringify(view())}`).toContain(
          JSON.stringify(view())
        );
        const error = document.querySelector('h-state[name="system:error"]')!.innerHTML;
        expect(error, context).toBe(model.state === 'failed' ? (model.error ?? '') : '');
      }
      if (!process.env.FUZZ_SEED)
        for (const count of Object.values(outcomes)) expect(count).toBeGreaterThan(30);
    },
    fuzzTimeout(60_000)
  );
});
