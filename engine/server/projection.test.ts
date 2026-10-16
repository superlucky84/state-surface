import { describe, it, expect, vi } from 'vitest';
import { h } from 'lithent';
import {
  DEFAULT_LIMITS,
  FrameError,
  LimitError,
  RequestProjection,
  externalFrames,
  type ProjectionOptions,
} from './projection.js';
import { produceFrames, IdleTimeoutError } from './transitionResponse.js';
import { defineServerComponent } from './serverComponent.js';
import { createContext } from './core/context.js';
import type { PageDefinition, StandardSchema } from './core/manifest.js';
import type { StateFrame, WireFrame } from '../shared/protocol.js';
import { Island } from '../shared/surfaceTree.js';

const List = (props: { items?: string[] }) =>
  h('ul', {}, ...(props.items ?? []).map(item => h('li', {}, item)));
const Note = (props: { text?: string; href?: string }) =>
  h('p', {}, h('a', { href: props.href ?? '/' }, props.text ?? ''));
const Error = (props: { message: string }) => h('strong', {}, props.message);
const Counter = (props: { count: number }) => h('button', {}, String(props.count));
const Loaded = defineServerComponent({
  load: async (props: { id: string }) => ({ title: `loaded ${props.id}` }),
  render: (data: { title: string }) => h('h2', {}, data.title),
});
const WithIsland = (props: { n: number }) =>
  h(
    'section',
    {},
    h(
      Island as never,
      {
        __ssComponent: Counter,
        __ssId: 'c/Counter.tsx#default',
        'client:idle': true,
        count: props.n,
      } as never
    )
  );

const schema: StandardSchema = {
  '~standard': {
    version: 1,
    validate: value =>
      typeof (value as { text?: unknown })?.text === 'string'
        ? { value }
        : { issues: [{ message: 'text must be a string' }] },
  },
};

const page: PageDefinition = {
  id: 'test',
  slots: {
    list: { mode: 'server', componentId: 'list#default', component: List },
    note: { mode: 'server', componentId: 'note#default', component: Note },
    loaded: { mode: 'server', componentId: 'loaded#default', component: Loaded },
    island: { mode: 'server', componentId: 'island#default', component: WithIsland },
    chat: { mode: 'client', componentId: 'chat#default' },
    fixed: { mode: 'static', componentId: 'fixed#default' },
    agent: {
      mode: 'client',
      componentId: 'agent#default',
      external: true,
      schema,
    },
    'system:error': { mode: 'server', componentId: 'error#default', component: Error },
  },
};

function projection(options: Partial<ProjectionOptions> = {}) {
  let now = 0;
  const warn = vi.fn();
  const instance = new RequestProjection({
    name: 'test',
    definition: { handler: async () => {} },
    page,
    ctx: createContext(new Request('http://x/'), {
      basePath: '',
      signal: new AbortController().signal,
    }).ctx,
    limits: DEFAULT_LIMITS,
    development: true,
    errorSlot: 'system:error',
    warn,
    now: () => now,
    ...options,
  });
  return { instance, warn, advance: (ms: number) => (now += ms) };
}

describe('RequestProjection (DESIGN 6.1/6.2, DC-10)', () => {
  it('projects a full frame: server slots render html, client slots get props, ui after content', async () => {
    const { instance } = projection();
    const patch = await instance.frame({
      type: 'state',
      states: { list: { items: ['a'] }, chat: { text: '' } },
      ui: { list: { classAdd: ['is-new'] } },
    });
    expect(patch).toEqual({
      type: 'patch',
      reset: true,
      ops: [
        { slot: 'list', html: '<ul><li>a</li></ul>' },
        { slot: 'chat', props: { text: '' } },
        { slot: 'list', ui: { classAdd: ['is-new'] } },
        { slot: 'chat', ui: null },
      ],
    });
  });

  it('projects partial, accumulate and removed frames', async () => {
    const { instance, advance } = projection();
    await instance.frame({
      type: 'state',
      states: { list: { items: ['a'] }, chat: { text: 'H' } },
    });
    advance(100);
    expect(
      await instance.frame({
        type: 'state',
        accumulate: true,
        states: { chat: { text: 'i' }, list: { items: ['b'] } },
      })
    ).toEqual({
      type: 'patch',
      ops: [
        { slot: 'chat', merge: { text: 'i' } },
        { slot: 'list', html: '<ul><li>a</li><li>b</li></ul>' },
      ],
    });
    advance(100);
    expect(
      await instance.frame({
        type: 'state',
        full: false,
        states: { list: { items: ['c'] } },
        changed: ['list'],
        removed: ['chat'],
      })
    ).toEqual({
      type: 'patch',
      ops: [
        { slot: 'chat', remove: true },
        { slot: 'list', html: '<ul><li>c</li></ul>' },
      ],
    });
  });

  it('removes declared targets that a full frame leaves out', async () => {
    const { instance } = projection({
      definition: { handler: async () => {}, targets: ['list', 'note'] },
    });
    const patch = await instance.frame({ type: 'state', states: { list: { items: [] } } });
    expect(patch!.ops).toEqual([
      { slot: 'note', remove: true },
      { slot: 'list', html: '<ul></ul>' },
      { slot: 'list', ui: null },
    ]);
  });

  it.each([
    [
      { type: 'state', full: false, states: { list: {} }, changed: ['list'] },
      'must be a full frame',
    ],
    [{ type: 'state', accumulate: true, states: { chat: { text: 'x' } } }, 'must be a full frame'],
    [{ type: 'done' }, 'the engine sends it'],
    [{ type: 'error', message: 'x' }, 'throw an Error'],
    [{ type: 'state', states: { fixed: {} } }, 'static and cannot be updated'],
    [{ type: 'state', states: { ghost: {} } }, 'not on page'],
    [{ type: 'state', states: { list: {} }, ui: { list: { classAdd: ['a b'] } } }, 'invalid class'],
  ])('rejects authoring violations: %j', async (frame, reason) => {
    const { instance } = projection();
    await expect(instance.frame(frame)).rejects.toThrow(reason);
    await expect(projection().instance.frame(frame)).rejects.toBeInstanceOf(FrameError);
  });

  it('fixes targets on the first full frame and rejects ops outside them', async () => {
    const { instance } = projection();
    await instance.frame({ type: 'state', states: { list: { items: [] } } });
    await expect(
      instance.frame({ type: 'state', full: false, states: { note: {} }, changed: ['note'] })
    ).rejects.toThrow('outside the transition targets');
    await expect(
      projection({ definition: { handler: async () => {}, targets: ['list'] } }).instance.frame({
        type: 'state',
        states: { list: {}, note: {} },
      })
    ).rejects.toThrow('"note" is outside the transition targets');
  });

  it('coalesces server renders per slot: first now, then once per interval, flushed at the end', async () => {
    const { instance, advance } = projection();
    await instance.frame({ type: 'state', states: { list: { items: ['a'] } } });
    const quick = await instance.frame({
      type: 'state',
      accumulate: true,
      states: { list: { items: ['b'] } },
    });
    expect(quick).toBeUndefined();
    await instance.frame({ type: 'state', accumulate: true, states: { list: { items: ['c'] } } });
    expect(instance.nextDue()).toBe(33);
    advance(10);
    expect(await instance.flush()).toBeUndefined();
    advance(30);
    expect(await instance.flush()).toEqual({
      type: 'patch',
      ops: [{ slot: 'list', html: '<ul><li>a</li><li>b</li><li>c</li></ul>' }],
    });
    await instance.frame({ type: 'state', accumulate: true, states: { list: { items: ['d'] } } });
    expect((await instance.flush(true))!.ops[0]).toMatchObject({ slot: 'list' });
    expect(instance.nextDue()).toBeUndefined();
  });

  it('re-runs load for server components and lists islands in html ops', async () => {
    const { instance } = projection();
    const patch = await instance.frame({
      type: 'state',
      states: { loaded: { id: '7' }, island: { n: 3 } },
    });
    expect(patch!.ops[0]).toEqual({ slot: 'loaded', html: '<h2>loaded 7</h2>' });
    expect(patch!.ops[1]).toEqual({
      slot: 'island',
      html: '<section><h-island data-island="island$0" style="display:contents"><button>3</button></h-island></section>',
      islands: [
        {
          id: 'island$0',
          component: 'c/Counter.tsx#default',
          props: { count: 3 },
          activation: 'idle',
        },
      ],
    });
  });

  it('strips unsafe URLs from server slot HTML (strict capability)', async () => {
    const { instance } = projection();
    const patch = await instance.frame({
      type: 'state',
      states: { note: { text: 'x', href: ' JavaScript:alert(1)' } },
    });
    expect(patch!.ops[0]).toEqual({ slot: 'note', html: '<p><a>x</a></p>' });
  });

  it('enforces op and html size limits and warns at 80% in development', async () => {
    const { instance, advance } = projection({ limits: { ...DEFAULT_LIMITS, ops: 2 } });
    await instance.frame({ type: 'state', states: { list: { items: [] } } });
    advance(50);
    await expect(
      instance.frame({ type: 'state', full: false, states: { list: {} }, changed: ['list'] })
    ).rejects.toBeInstanceOf(LimitError);
    const big = projection({ limits: { ...DEFAULT_LIMITS, htmlSize: 100 } });
    await big.instance.frame({ type: 'state', states: { list: { items: ['x'.repeat(70)] } } });
    expect(big.warn).toHaveBeenCalledWith(expect.stringContaining('80%'));
    await expect(
      projection({ limits: { ...DEFAULT_LIMITS, htmlSize: 10 } }).instance.frame({
        type: 'state',
        states: { list: { items: ['too long'] } },
      })
    ).rejects.toThrow('exceeds 10 bytes');
  });

  it('warns once when server slots re-render too often (DC-10 ⑤)', async () => {
    const { instance, warn, advance } = projection({
      limits: { ...DEFAULT_LIMITS, serverRenders: 2 },
    });
    await instance.frame({ type: 'state', states: { list: { items: [] } } });
    for (let i = 0; i < 3; i++) {
      advance(50);
      await instance.frame({
        type: 'state',
        accumulate: true,
        states: { list: { items: [String(i)] } },
      });
    }
    expect(warn.mock.calls.filter(([text]) => String(text).includes('client slot'))).toHaveLength(
      1
    );
  });

  it('renders the error slot into error frames', async () => {
    expect(await projection().instance.error('boom')).toEqual({
      type: 'error',
      message: 'boom',
      slot: 'system:error',
      html: '<strong>boom</strong>',
    });
    expect(await projection({ errorSlot: 'missing' }).instance.error('boom')).toEqual({
      type: 'error',
      message: 'boom',
    });
  });

  it('accepts external frames only for external slots that pass their schema (DC-14 ⑥)', async () => {
    const { instance, warn } = projection({
      definition: { handler: async () => {}, targets: ['agent', 'list'] },
    });
    await instance.frame({ type: 'state', states: { agent: { text: '' }, list: { items: [] } } });
    const source = async function* () {
      yield { type: 'state', accumulate: true, states: { agent: { text: 'hi' } } };
      yield { type: 'state', accumulate: true, states: { agent: { text: 1 } } };
      yield { type: 'state', accumulate: true, states: { list: { items: ['x'] } } };
      yield { type: 'state', full: false, states: { agent: { text: 'x' } } };
    };
    const accepted: StateFrame[] = [];
    for await (const frame of externalFrames(instance, warn)(source())) accepted.push(frame);
    expect(accepted).toEqual([
      { type: 'state', accumulate: true, states: { agent: { text: 'hi' } } },
    ]);
    expect(warn.mock.calls.map(([text]) => text)).toEqual([
      expect.stringContaining('text must be a string'),
      expect.stringContaining('does not accept external frames'),
      expect.stringContaining('requires at least one'),
    ]);
    expect(await instance.frame(accepted[0])).toEqual({
      type: 'patch',
      ops: [{ slot: 'agent', merge: { text: 'hi' } }],
    });
  });

  it('drops an accepted external frame that breaks the targets instead of failing', async () => {
    const { instance, warn } = projection({
      definition: { handler: async () => {}, targets: ['list'] },
    });
    await instance.frame({ type: 'state', states: { list: { items: [] } } });
    const accepted: StateFrame[] = [];
    for await (const item of externalFrames(
      instance,
      warn
    )([{ type: 'state', accumulate: true, states: { agent: { text: 'x' } } }]))
      accepted.push(item);
    const [frame] = accepted;
    expect(await instance.frame(frame)).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('outside the transition targets'));
  });
});

describe('produceFrames', () => {
  const collect = async (generator: AsyncGenerator<WireFrame>) => {
    const frames: WireFrame[] = [];
    for await (const frame of generator) frames.push(frame);
    return frames;
  };

  it('appends done after the generator returns; an empty handler is an empty success', async () => {
    const { instance } = projection();
    const frames = await collect(
      produceFrames(
        (async function* () {
          yield { type: 'state', states: { list: { items: ['a'] } } } as StateFrame;
        })(),
        instance,
        DEFAULT_LIMITS,
        new AbortController().signal
      )
    );
    expect(frames.map(frame => frame.type)).toEqual(['patch', 'done']);
    expect(
      await collect(
        produceFrames(
          (async function* () {})(),
          projection().instance,
          DEFAULT_LIMITS,
          new AbortController().signal
        )
      )
    ).toEqual([{ type: 'done' }]);
  });

  it('normalizes an async function result to one full patch plus done', async () => {
    const frames = await collect(
      produceFrames(
        Promise.resolve({ states: { chat: { text: 'x' } } }),
        projection().instance,
        DEFAULT_LIMITS,
        new AbortController().signal
      )
    );
    expect(frames).toEqual([
      {
        type: 'patch',
        reset: true,
        ops: [
          { slot: 'chat', props: { text: 'x' } },
          { slot: 'chat', ui: null },
        ],
      },
      { type: 'done' },
    ]);
  });

  it('renders a coalesced server slot when its window ends while the handler waits', async () => {
    const { instance } = projection({ now: () => performance.now() });
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    const generator = produceFrames(
      (async function* () {
        yield { type: 'state', states: { list: { items: ['a'] } } } as StateFrame;
        yield { type: 'state', accumulate: true, states: { list: { items: ['b'] } } } as StateFrame;
        await gate;
      })(),
      instance,
      DEFAULT_LIMITS,
      new AbortController().signal
    );
    expect((await generator.next()).value).toMatchObject({ type: 'patch', reset: true });
    const second = (await generator.next()).value as WireFrame;
    expect(second).toEqual({
      type: 'patch',
      ops: [{ slot: 'list', html: '<ul><li>a</li><li>b</li></ul>' }],
    });
    release();
    expect((await generator.next()).value).toEqual({ type: 'done' });
  });

  it('fails with an idle timeout and returns the generator', async () => {
    const finished = vi.fn();
    const generator = produceFrames(
      (async function* () {
        try {
          yield { type: 'state', states: { list: { items: [] } } } as StateFrame;
          await new Promise(() => {});
        } finally {
          finished();
        }
      })(),
      projection().instance,
      { ...DEFAULT_LIMITS, idleTimeout: 20 },
      new AbortController().signal
    );
    await generator.next();
    await expect(generator.next()).rejects.toBeInstanceOf(IdleTimeoutError);
  });
});
