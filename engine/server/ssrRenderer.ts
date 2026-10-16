import { Fragment, h } from 'lithent';
import { renderToString } from 'lithent/ssr';
import type { WDom } from 'lithent';
import type { SurfaceContext } from './core/context.js';
import type { PageModule } from '../shared/routeModule.js';
import {
  SurfaceError,
  assertJsonValue,
  readMarker,
  type Activation,
  type BootMarker,
  type Capability,
  type IslandMarker,
  type SlotMarker,
} from '../shared/surfaceTree.js';
import type { IslandMeta, PluginMeta, SlotMeta } from '../shared/protocol.js';
import { RICH, URL_ATTRIBUTES, neutralizeScripts, safeUrl } from '../shared/capability.js';
import { readServerComponent } from './serverComponent.js';
import { buildSurfaceScript } from './ssr.js';

/** A client plugin declared by the page or a module it imports (build-time analysis). */
export type PagePlugin = PluginMeta;

/** What the rendered page needs in the browser; drives entry selection (DESIGN 5.1). */
export interface PageUsage {
  /** Client components actually rendered, in document order, deduplicated. */
  components: Array<{ componentId: string; preload: boolean }>;
  /** `data-action` elements, `<Boot>` or deferred slots: the action runtime starts with the page. */
  actions: boolean;
  plugins: PagePlugin[];
  /** A `swap="morph"` slot was rendered: preload the morph chunk. */
  morph: boolean;
  /** False for static pages: no engine script and no bootstrap JSON. */
  engine: boolean;
}

/** Resolved URLs of the engine-managed head tags for one page. */
export interface DocumentTags {
  styles: string[];
  preload: string[];
  appEntry?: string;
  engineEntry?: string;
}

/** Sealed into the deferred slot token (DC-21): what the island endpoint renders. */
export interface DeferredPayload {
  /** componentId */
  c: string;
  /** slot name */
  s: string;
  /** buildId */
  b: string;
  /** props */
  p: Record<string, unknown>;
  /** capability, sandbox */
  k: Capability;
  i?: 'iframe';
  /** Cache-Control for the deferred GET response */
  x?: string;
}

export interface PageRenderOptions {
  plugins?: PagePlugin[];
  tags?: (usage: PageUsage) => DocumentTags;
  buildId?: string;
  pageId?: string;
  /** Encrypts a deferred slot payload into a URL-safe token (DC-21, IC-09). */
  seal?: (payload: DeferredPayload) => Promise<string>;
}

/**
 * Where a node is rendered. Page markup and SSR-only slot trees may contain islands and
 * `<Boot>`; client-rendered trees and static fragments (fallback, island children) belong
 * to Lithent or are plain HTML, so engine markers are invalid there. Inside a slot the
 * slot's capability applies (DESIGN 8.1); page and layout markup is trusted app code.
 */
interface Scope {
  kind: 'page' | 'ssr-slot' | 'client' | 'static';
  slot?: string;
  capability?: Capability;
}

interface RenderState {
  ctx: SurfaceContext;
  loaded: Map<SlotMarker, unknown>;
  tokens: Map<SlotMarker, string>;
  /** Bootstrap entries (named slots and islands) in document order. */
  entries: SlotMeta[];
  components: Map<string, boolean>;
  actions: boolean;
  /** `<Boot>` is recorded during page SSR only; slot re-renders ignore it. */
  boot?: Array<{ transition: string; params: Record<string, unknown> }>;
  counters: Map<string, number>;
  structure: Record<'html' | 'head' | 'body', number>;
  marks?: Record<'headStart' | 'headEnd' | 'bodyStart' | 'bodyEnd', WDom>;
  morph: boolean;
  defer: boolean;
}

/** Nodes the engine creates itself (island children wrapper, transport template). */
const ENGINE_NODE = Symbol('state-surface.engineNode');
function engineNode(node: WDom): WDom {
  (node as WDom & { [ENGINE_NODE]?: true })[ENGINE_NODE] = true;
  return node;
}

function isNode(value: unknown): value is WDom {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function scopeName(scope: Scope) {
  return scope.kind === 'ssr-slot'
    ? 'inside another <Slot>'
    : scope.kind === 'client'
      ? 'inside a client component (Lithent owns that DOM)'
      : 'inside fallback or island children (static HTML)';
}

/** Depth-first page-level walk. Marker descriptors are not entered. */
function eachMarker(node: WDom, visit: (marker: ReturnType<typeof readMarker>) => void) {
  const marker = readMarker(node);
  if (marker) return visit(marker);
  for (const child of node.children ?? []) if (isNode(child)) eachMarker(child, visit);
}

function newState(ctx: SurfaceContext): RenderState {
  return {
    ctx,
    loaded: new Map(),
    tokens: new Map(),
    entries: [],
    components: new Map(),
    actions: false,
    counters: new Map(),
    structure: { html: 0, head: 0, body: 0 },
    morph: false,
    defer: false,
  };
}

/**
 * Render a page module to a complete HTML document.
 *
 * 1. Await the page function and walk the returned tree to find slots.
 * 2. Start every server-slot `load` and deferred-slot seal at once and wait for all of them.
 * 3. Replace markers with rendered hosts while recording bootstrap entries and `<Boot>` in
 *    document order. The tree is never mutated: shared module-level JSX stays intact.
 * 4. Assemble the document with random placeholders for the engine-managed regions.
 */
export async function renderPage(
  page: PageModule,
  ctx: SurfaceContext,
  options: PageRenderOptions = {}
): Promise<string> {
  const tree = await page.default(ctx);
  if (!isNode(tree))
    throw new SurfaceError(`Page ${ctx.route.pattern ?? ''} must return JSX with <html>.`);
  const buildId = options.buildId ?? 'dev';

  const names = new Set<string>();
  const loads: Array<[SlotMarker, Promise<unknown>]> = [];
  const seals: Array<[SlotMarker, Promise<string>]> = [];
  eachMarker(tree, marker => {
    if (marker?.kind === 'island') assertNotServerComponent(marker);
    if (marker?.kind !== 'slot') return;
    if (names.has(marker.name))
      throw new SurfaceError(`Slot name "${marker.name}" is used more than once on this page.`);
    names.add(marker.name);
    const server = readServerComponent(marker.child.component);
    if (server && marker.mode !== 'server')
      throw new SurfaceError(
        `<Slot name="${marker.name}">: defineServerComponent children need mode="server".`
      );
    if (marker.defer) {
      const where = `<Slot name="${marker.name}">`;
      const props = marker.child.props ?? {};
      assertJsonValue(props, where);
      if (!options.seal)
        throw new SurfaceError(`${where}: server:defer needs a configured secret.`);
      seals.push([
        marker,
        options.seal({
          c: marker.child.componentId,
          s: marker.name,
          b: buildId,
          p: props,
          k: marker.capability,
          ...(marker.sandbox ? { i: marker.sandbox } : {}),
          ...(marker.cache ? { x: marker.cache } : {}),
        }),
      ]);
    } else if (server && !marker.empty)
      loads.push([marker, new Promise(resolve => resolve(server.load(marker.child.props, ctx)))]);
  });
  const [results, tokens] = await Promise.all([
    Promise.all(loads.map(([, promise]) => promise)),
    Promise.all(seals.map(([, promise]) => promise)),
  ]);

  const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), n =>
    n.toString(16).padStart(2, '0')
  ).join('');
  const mark = (kind: string) => h('surface-mark', { 'data-t': `${token}:${kind}` });
  const state = newState(ctx);
  state.loaded = new Map(loads.map(([marker], i) => [marker, results[i]]));
  state.tokens = new Map(seals.map(([marker], i) => [marker, tokens[i]]));
  state.boot = [];
  state.marks = {
    headStart: mark('head-start'),
    headEnd: mark('head-end'),
    bodyStart: mark('body-start'),
    bodyEnd: mark('body-end'),
  };
  const root = project(tree, { kind: 'page' }, state);
  const { html, head, body } = state.structure;
  if (html !== 1 || head !== 1 || body !== 1)
    throw new SurfaceError(
      `The page layout must render exactly one <html>, <head> and <body> ` +
        `(found ${html}, ${head}, ${body}).`
    );

  const plugins = options.plugins ?? [];
  const boot = state.boot;
  const usage: PageUsage = {
    components: [...state.components].map(([componentId, preload]) => ({ componentId, preload })),
    actions: state.actions || boot.length > 0 || state.defer,
    plugins,
    morph: state.morph,
    engine: false,
  };
  usage.engine = usage.components.length > 0 || usage.actions || plugins.length > 0;
  const tags = options.tags?.(usage) ?? { styles: [], preload: [] };
  const script = (src: string) =>
    `<script type="module" src="${escapeAttr(src)}" nonce="${ctx.nonce}"></script>`;
  // An app entry on an engine-less page still learns the build, page and base path.
  const bootstrap =
    usage.engine || tags.appEntry
      ? buildSurfaceScript({
          buildId,
          pageId: options.pageId ?? '',
          basePath: ctx.basePath,
          ...(usage.engine && state.entries.length ? { slots: state.entries } : {}),
          ...(usage.engine && boot.length ? { boot } : {}),
          ...(usage.engine && plugins.length ? { plugins } : {}),
        })
      : '';
  // Order (DESIGN 4.4): CSS → modulepreload → __SURFACE__ → app entry → engine entry.
  const managed =
    tags.styles.map(href => `<link rel="stylesheet" href="${escapeAttr(href)}">`).join('') +
    tags.preload.map(href => `<link rel="modulepreload" href="${escapeAttr(href)}">`).join('') +
    bootstrap +
    (tags.appEntry ? script(tags.appEntry) : '') +
    (usage.engine && tags.engineEntry ? script(tags.engineEntry) : '');
  let output = renderToString(root);
  const replacements: Array<[WDom, string]> = [
    [state.marks.headStart, '<!--ss:head-->'],
    [state.marks.headEnd, managed + '<!--/ss:head-->'],
    [state.marks.bodyStart, '<!--ss:body-->'],
    [state.marks.bodyEnd, '<!--/ss:body-->'],
  ];
  for (const [node, value] of replacements) {
    const placeholder = renderToString(node);
    const at = output.indexOf(placeholder);
    if (at < 0 || output.indexOf(placeholder, at + 1) >= 0)
      throw new SurfaceError('Document placeholder was not rendered exactly once.');
    output = output.slice(0, at) + value + output.slice(at + placeholder.length);
  }
  return '<!doctype html>' + output;
}

export interface SlotRender {
  html: string;
  islands: IslandMeta[];
  /** Client components rendered as islands inside the slot. */
  components: string[];
}

/**
 * Render a server slot's content for an `html` op or a deferred response: run the server
 * component's `load` again, render with the slot's capability and collect its islands
 * (DESIGN 6.1/6.2, DC-29 ③).
 */
export async function renderSlotHtml(input: {
  slot: string;
  component: unknown;
  props: Record<string, unknown>;
  ctx: SurfaceContext;
  capability?: Capability;
  sandbox?: 'iframe';
}): Promise<SlotRender> {
  const server = readServerComponent(input.component);
  if (typeof input.component !== 'function')
    throw new SurfaceError(`Slot "${input.slot}" has no server component to render.`);
  const data = server ? await server.load(input.props, input.ctx) : input.props;
  const state = newState(input.ctx);
  const node = server
    ? h(server.render as never, (data ?? {}) as never)
    : h(input.component as never, input.props as never);
  const scope: Scope = {
    kind: 'ssr-slot',
    slot: input.slot,
    capability: input.capability ?? 'strict',
  };
  const content = sandboxed(project(node, scope, state), input.sandbox, state, input.slot);
  return {
    html: renderToString(content),
    islands: state.entries.map(({ mode: _mode, ...island }) => island as IslandMeta),
    components: [...state.components.keys()],
  };
}

/** `capability="unsafe" sandbox="iframe"`: the HTML lives in an isolated document. */
function sandboxed(content: WDom, sandbox: 'iframe' | undefined, state: RenderState, slot: string) {
  if (!sandbox) return content;
  if (state.entries.length)
    throw new SurfaceError(
      `<Slot name="${slot}">: islands cannot run inside a sandbox="iframe" slot.`
    );
  return engineNode(
    h('iframe', {
      sandbox: '',
      srcdoc: renderToString(content),
      'data-surface-sandbox': '',
      style: 'border:0;width:100%',
    })
  );
}

function project(node: WDom, scope: Scope, state: RenderState): WDom {
  const marker = readMarker(node);
  if (marker) {
    if (marker.kind === 'slot') return projectSlot(marker, scope, state);
    if (marker.kind === 'island') return projectIsland(marker, scope, state);
    return projectBoot(marker, scope, state);
  }
  if ((node as { [RICH]?: true })[RICH] && scope.capability === 'strict')
    throw new SurfaceError(
      `<Slot name="${scope.slot}">: Markdown content needs capability="rich" (DESIGN 8.1).`
    );
  const tag = node.type === 'e' ? node.tag : undefined;
  if (tag === 'html' || tag === 'head' || tag === 'body') state.structure[tag]++;
  let current = node;
  if (tag && node.props) {
    if (node.props['data-action'] !== undefined) state.actions = true;
    if (scope.capability && !(node as { [ENGINE_NODE]?: true })[ENGINE_NODE])
      current = applyCapability(node, scope);
  }
  const children = current.children ?? [];
  for (const child of children)
    if (typeof (child as { then?: unknown } | undefined)?.then === 'function') {
      (child as unknown as Promise<unknown>).then(undefined, () => {});
      const name = (node.ctor as { name?: string } | undefined)?.name || 'A component';
      throw new SurfaceError(
        `<${name}> returned a Promise. Components render synchronously; await data in the ` +
          'page function or in the load step of a server Slot (defineServerComponent).'
      );
    }
  let changed = current !== node;
  const next = children.map(child => {
    const result = isNode(child) ? project(child, scope, state) : child;
    if (result !== child) changed = true;
    return result;
  });
  if (tag === 'head' && state.marks)
    return { ...current, children: [state.marks.headStart, ...next, state.marks.headEnd] };
  if (tag === 'body' && state.marks)
    return { ...current, children: [state.marks.bodyStart, ...next, state.marks.bodyEnd] };
  return changed ? { ...current, children: next } : current;
}

/**
 * strict/rich: no raw HTML and URL attributes limited to http, https, mailto and relative
 * references. unsafe: raw HTML allowed, scripts made inert (DC-13).
 */
function applyCapability(node: WDom, scope: Scope): WDom {
  const props = node.props as Record<string, unknown>;
  let next: Record<string, unknown> | undefined;
  if (props.innerHTML !== undefined && props.innerHTML !== null) {
    if (scope.capability !== 'unsafe')
      throw new SurfaceError(
        `<Slot name="${scope.slot}">: raw HTML (innerHTML) needs capability="unsafe".`
      );
    const html = String(props.innerHTML);
    const inert = neutralizeScripts(html);
    if (inert !== html) next = { ...props, innerHTML: inert };
  }
  if (scope.capability !== 'unsafe')
    for (const key of Object.keys(props)) {
      if (!URL_ATTRIBUTES.has(key.toLowerCase())) continue;
      const value = props[key];
      if (typeof value === 'string' && !safeUrl(value)) {
        next ??= { ...props };
        delete next[key];
      }
    }
  return next ? { ...node, props: next as never } : node;
}

function assertNotServerComponent(marker: IslandMarker) {
  if (readServerComponent(marker.component))
    throw new SurfaceError(
      `<${marker.componentId}>: defineServerComponent cannot be a client island; ` +
        'use it as the child of <Slot mode="server">.'
    );
}

function useComponent(state: RenderState, componentId: string, activation: Activation) {
  const preload = activation.timing === 'load';
  state.components.set(componentId, (state.components.get(componentId) ?? false) || preload);
}

function activationMeta(activation: Activation): Partial<SlotMeta> {
  return {
    ...(activation.timing !== 'load' ? { activation: activation.timing } : {}),
    ...(activation.media ? { media: activation.media } : {}),
    ...(activation.only ? { only: true as const } : {}),
  };
}

function projectSlot(marker: SlotMarker, scope: Scope, state: RenderState): WDom {
  const where = `<Slot name="${marker.name}">`;
  if (scope.kind !== 'page') throw new SurfaceError(`${where} cannot be used ${scopeName(scope)}.`);
  const { child } = marker;
  const meta: SlotMeta = { id: marker.name, mode: marker.mode };
  if (marker.viewTransition) meta.viewTransition = true;
  state.entries.push(meta);
  const inner: Scope = { kind: 'ssr-slot', slot: marker.name, capability: marker.capability };
  let content: WDom | undefined;
  if (marker.mode !== 'client') {
    if (marker.swap === 'morph') {
      meta.swap = 'morph';
      state.morph = true;
    }
    if (marker.defer) {
      // DC-21: the fallback now, the content from the island endpoint after load.
      meta.component = child.componentId;
      meta.defer = state.tokens.get(marker);
      state.defer = true;
      if (isNode(marker.fallback)) content = project(marker.fallback, { kind: 'static' }, state);
    } else if (!marker.empty) {
      const server = readServerComponent(child.component);
      const rendered = server
        ? h(server.render as never, (state.loaded.get(marker) ?? {}) as never)
        : h(child.component as never, child.props as never);
      const before = state.entries.length;
      content = project(rendered, inner, state);
      if (marker.sandbox && state.entries.length > before)
        throw new SurfaceError(`${where}: islands cannot run inside a sandbox="iframe" slot.`);
      if (marker.sandbox) content = sandboxed(content, marker.sandbox, newState(state.ctx), '');
    }
  } else {
    const activation = marker.activation!;
    meta.component = child.componentId;
    Object.assign(meta, activationMeta(activation));
    useComponent(state, child.componentId, activation);
    if (!marker.empty) {
      assertJsonValue(child.props, where);
      meta.props = child.props;
      content = activation.only
        ? isNode(marker.fallback)
          ? project(marker.fallback, { kind: 'static' }, state)
          : undefined
        : project(
            h(child.component as never, child.props as never),
            { ...inner, kind: 'client' },
            state
          );
    }
  }
  const attributes: Record<string, unknown> = { name: marker.name, ...marker.host };
  return content ? h('h-state', attributes, content) : h('h-state', attributes);
}

function projectIsland(marker: IslandMarker, scope: Scope, state: RenderState): WDom {
  const where = `<${marker.componentId}>`;
  if (scope.kind === 'client' || scope.kind === 'static')
    throw new SurfaceError(`${where} island cannot be used ${scopeName(scope)}.`);
  if (!Object.keys(marker.directives).length)
    throw new SurfaceError(`${where}: a Slot child descriptor was rendered outside its <Slot>.`);
  assertNotServerComponent(marker);
  assertJsonValue(marker.props, where);
  const counter = scope.slot ?? '';
  const index = state.counters.get(counter) ?? 0;
  state.counters.set(counter, index + 1);
  const id = `${counter}$${index}`;
  const only = marker.activation.only;
  useComponent(state, marker.componentId, marker.activation);
  state.entries.push({
    id,
    mode: 'client',
    component: marker.componentId,
    props: (marker.props ?? {}) as Record<string, unknown>,
    ...activationMeta(marker.activation),
  });

  // IC-03: island children are server-rendered once and passed as a static fragment.
  const childScope: Scope = { ...scope, kind: 'static' };
  let childrenHtml: string | undefined;
  let wrapper: WDom | undefined;
  if (marker.children.length) {
    childrenHtml = renderToString(project(Fragment({}, ...marker.children), childScope, state));
    wrapper = engineNode(h('h-children', { style: 'display:contents', innerHTML: childrenHtml }));
  }
  let content: WDom | undefined;
  if (only) {
    if (isNode(marker.fallback)) content = project(marker.fallback, childScope, state);
  } else {
    const rendered = h(
      marker.component as never,
      marker.props as never,
      ...(wrapper ? [wrapper] : [])
    );
    content = project(rendered, { ...scope, kind: 'client' }, state);
  }
  const transport =
    childrenHtml !== undefined && (only || !content || !contains(content, wrapper!))
      ? [engineNode(h('template', { 'data-surface-children': '', innerHTML: childrenHtml }))]
      : [];
  return h(
    'h-island',
    { 'data-island': id, style: 'display:contents' },
    ...transport,
    ...(content ? [content] : [])
  );
}

function projectBoot(marker: BootMarker, scope: Scope, state: RenderState): WDom {
  const where = `<Boot transition="${marker.transition}">`;
  if (scope.kind === 'client' || scope.kind === 'static')
    throw new SurfaceError(`${where} cannot be used ${scopeName(scope)}.`);
  assertJsonValue(marker.params, where, 'params');
  state.boot?.push({ transition: marker.transition, params: marker.params });
  return Fragment({});
}

function contains(node: WDom, target: WDom): boolean {
  if (node === target) return true;
  return (node.children ?? []).some(child => isNode(child) && contains(child, target));
}

function escapeAttr(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
