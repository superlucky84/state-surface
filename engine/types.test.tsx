import { describe, expect, it } from 'vitest';
import { Boot, Slot } from './index.js';
import { definePlugin } from './client.js';
import { defineServerComponent, type PageModule, type SurfaceContext } from './server.js';

/**
 * Type diagnostics (DESIGN 3.1 ①): what editors and `state-surface check` (tsc --noEmit)
 * accept and reject. Each `@ts-expect-error` fails tsc if the line stops being an error.
 * The elements are never rendered.
 */
const Title = ({ text }: { text: string }) => <h1>{text}</h1>;
const Async = async () => <p />;
const Stats = defineServerComponent({
  load: async (props: { id: string }) => ({ count: props.id.length }),
  render: data => <b>{data.count}</b>,
});

const accepted = () => [
  <Slot name="hero">
    <Title text="x" />
  </Slot>,
  <Slot
    name="cart"
    mode="server"
    swap="morph"
    server:defer
    fallback={<p />}
    cache="public, max-age=60"
    class="cart"
    data-kind="list"
  >
    <Stats id="a" />
  </Slot>,
  <Slot name="chat" client:idle resetKey="a" transition:persist>
    <Title text="x" />
  </Slot>,
  <Slot name="empty" mode="server" component={Title} />,
  <Title text="x" client:media="(min-width: 600px)" transition:persist="title" />,
  <Boot transition="search" params={{ query: 'a', lang: 'en' }} />,
  <Boot transition="like" params={{ delta: 2, lang: 'en' }} />,
];

const rejected = () => [
  // @ts-expect-error mode is "static", "server" or "client"
  <Slot name="a" mode="island">
    <Title text="x" />
  </Slot>,
  // @ts-expect-error swap is "replace" or "morph"
  <Slot name="a" swap="append">
    <Title text="x" />
  </Slot>,
  // @ts-expect-error capability is "strict", "rich" or "unsafe"
  <Slot name="a" capability="raw">
    <Title text="x" />
  </Slot>,
  // @ts-expect-error a Slot needs a name
  <Slot>
    <Title text="x" />
  </Slot>,
  // @ts-expect-error client:media takes a media query
  <Title text="x" client:media />,
  // @ts-expect-error client:load is a flag
  <Title text="x" client:load="yes" />,
  // @ts-expect-error components render synchronously (no async components)
  <Async />,
  // @ts-expect-error <Boot> names a registered transition
  <Boot transition="no-such-transition" />,
  // @ts-expect-error <Boot> params follow the transition's input schema
  <Boot transition="like" params={{ delta: true, lang: 'en' }} />,
];

const plugins = () => [
  definePlugin({
    name: 'scroll',
    load: 'idle',
    slots: ['chat:messages'],
    attach: el => el.focus(),
  }),
  // @ts-expect-error load is "load", "idle" or "visible"
  definePlugin({ name: 'late', load: 'later' }),
  // @ts-expect-error a plugin needs a name
  definePlugin({ attach: () => {} }),
];

const pages: PageModule[] = [
  { default: async (ctx: SurfaceContext) => ctx.params.slug, prerender: true },
  { default: () => null, getStaticPaths: () => [{ slug: 'intro' }] },
  // @ts-expect-error the page function receives the SurfaceContext
  { default: (props: { slug: number }) => props.slug },
  // @ts-expect-error prerender is a boolean
  { default: () => null, prerender: 'yes' },
  // @ts-expect-error getStaticPaths returns params objects of strings
  { default: () => null, getStaticPaths: () => [{ slug: 1 }] },
];

describe('type contract', () => {
  it('is checked by tsc (state-surface check)', () => {
    expect([accepted, rejected, plugins].every(fn => typeof fn === 'function')).toBe(true);
    expect(pages).toHaveLength(5);
  });
});
