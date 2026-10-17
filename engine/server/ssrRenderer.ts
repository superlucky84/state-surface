import { Fragment, h } from 'lithent';
import { renderToString } from 'lithent/ssr';
import type { WDom } from 'lithent';
import type { SurfaceContext } from './core/context.js';
import type { PageModule } from '../shared/routeModule.js';
import {
  SLOT_NAME,
  SurfaceError,
  assertJsonValue,
  readMarker,
  type Activation,
  type BootMarker,
  type Capability,
  type IslandMarker,
  type RouterMarker,
  type RouterOptions,
  type SlotMarker,
} from '../shared/surfaceTree.js';
import type { ActionMeta, IslandMeta, PluginMeta, SlotMeta } from '../shared/protocol.js';
import { RICH, URL_ATTRIBUTES, neutralizeScripts, safeUrl } from '../shared/capability.js';
import { readServerComponent } from './serverComponent.js';
import { buildSurfaceScript } from './ssr.js';
import { nonceOf } from './prerenderContext.js';
import { readImagePreload, type ImagePreload } from '../shared/image.js';

/** A client plugin declared by the page or a module it imports (build-time analysis). */
export type PagePlugin = PluginMeta;

/** What the rendered page needs in the browser; drives entry selection (DESIGN 5.1). */
export interface PageUsage {
  /** Client components actually rendered, in document order, deduplicated. */
  components: Array<{ componentId: string; preload: boolean }>;
  /**
   * `data-action` elements, forms posting to `actionUrl()`, `<Boot>` or deferred slots: the
   * action runtime starts with the page.
   */
  actions: boolean;
  plugins: PagePlugin[];
  /** A `swap="morph"` slot was rendered: preload the morph chunk. */
  morph: boolean;
  /** `<ClientRouter>` was rendered: load the router chunk (DC-18). */
  router: boolean;
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
  /** Targets and queue mode of transitions, for browser concurrency (DC-11). */
  actions?: Record<string, ActionMeta>;
  /** `<link rel="alternate" hreflang>` (language paths, DC-24 ⑤). */
  alternates?: Array<{ hreflang: string; href: string }>;
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
  /** `<ClientRouter>` options (page SSR only). */
  router?: RouterOptions;
  /** Persist IDs rendered on this page (DC-19: unique per page). */
  persist: Set<string>;
  /** `data-prefetch` strategies of links (Speculation Rules on pages without the router). */
  prefetch: Set<string>;
  /** `<Image priority>` preloads by URL (DC-26, page SSR only). */
  images: Map<string, ImagePreload>;
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
    persist: new Set(),
    prefetch: new Set(),
    images: new Map(),
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
    router: !!state.router,
    engine: false,
  };
  usage.engine = usage.components.length > 0 || usage.actions || plugins.length > 0 || usage.router;
  const tags = options.tags?.(usage) ?? { styles: [], preload: [] };
  // A prerendered page has no per-request nonce (DESIGN 10.7: `script-src 'self'` CSPs).
  const nonce = nonceOf(ctx);
  const nonceAttr = nonce ? ` nonce="${nonce}"` : '';
  const script = (src: string) =>
    `<script type="module" src="${escapeAttr(src)}"${nonceAttr} data-ss></script>`;
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
          // useAction in a client component needs these as well as data-action does.
          ...(usage.engine && options.actions && Object.keys(options.actions).length
            ? { actions: options.actions }
            : {}),
          ...(state.router ? { router: state.router } : {}),
        })
      : '';
  // DC-20 ③: without the router, links opt into browser prefetch through Speculation Rules.
  const speculation =
    !state.router && state.prefetch.size
      ? `<script type="speculationrules"${nonceAttr} data-ss>${speculationRules(state.prefetch)}</script>`
      : '';
  // Order (DESIGN 4.4): CSS → modulepreload → __SURFACE__ → app entry → engine entry.
  const managed =
    (options.alternates ?? [])
      .map(
        link =>
          `<link rel="alternate" hreflang="${escapeAttr(link.hreflang)}" href="${escapeAttr(link.href)}" data-ss>`
      )
      .join('') +
    tags.styles.map(href => `<link rel="stylesheet" href="${escapeAttr(href)}" data-ss>`).join('') +
    // DC-26: `<Image priority>` (the LCP candidate) starts loading with the stylesheets.
    [...state.images.values()]
      .map(
        image =>
          `<link rel="preload" as="image" href="${escapeAttr(image.href)}"` +
          (image.srcset ? ` imagesrcset="${escapeAttr(image.srcset)}"` : '') +
          (image.sizes ? ` imagesizes="${escapeAttr(image.sizes)}"` : '') +
          (image.type ? ` type="${escapeAttr(image.type)}"` : '') +
          ' fetchpriority="high" data-ss>'
      )
      .join('') +
    // Preloads fetch scripts: a nonce-based CSP checks them like the scripts (DESIGN 8.2).
    tags.preload
      .map(href => `<link rel="modulepreload" href="${escapeAttr(href)}"${nonceAttr} data-ss>`)
      .join('') +
    speculation +
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
    if (marker.kind === 'router') return projectRouter(marker, scope, state);
    return projectBoot(marker, scope, state);
  }
  if ((node as { [RICH]?: true })[RICH] && scope.capability === 'strict')
    throw new SurfaceError(
      `<Slot name="${scope.slot}">: Markdown content needs capability="rich" (DESIGN 8.1).`
    );
  const tag = node.type === 'e' ? node.tag : undefined;
  if (tag === 'html' || tag === 'head' || tag === 'body') state.structure[tag]++;
  const preload = readImagePreload(node);
  if (preload && !state.images.has(preload.href)) state.images.set(preload.href, preload);
  let current = node;
  if (tag && node.props) {
    if (node.props['data-action'] !== undefined) state.actions = true;
    // `<form action={actionUrl(name)}>` works without JS; with the engine it streams (DC-22 ③).
    for (const key of ['action', 'formaction'])
      if (typeof node.props[key] === 'string' && node.props[key].includes('/_surface/action/'))
        state.actions = true;
    const prefetch = node.props['data-prefetch'];
    if (tag === 'a' && typeof prefetch === 'string' && PREFETCH_STRATEGIES.has(prefetch))
      state.prefetch.add(prefetch);
    if (scope.capability && !(node as { [ENGINE_NODE]?: true })[ENGINE_NODE])
      current = applyCapability(node, scope);
    if ('transition:persist' in node.props || 'transition:persist-props' in node.props)
      current = persistElement(current, scope, state);
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
    return {
      ...current,
      children: [state.marks.headStart, ...(next.map(owned) as WDom[]), state.marks.headEnd],
    };
  if (tag === 'body' && state.marks)
    return { ...current, children: [state.marks.bodyStart, ...next, state.marks.bodyEnd] };
  return changed ? { ...current, children: next } : current;
}

/**
 * DESIGN 8.2: head elements the server rendered carry `data-ss`. Scripts that run while the
 * head is parsed (tag managers) insert their nodes before the not yet parsed end marker, so
 * the router replaces only marked nodes and keeps everything else.
 */
function owned(node: unknown): unknown {
  if (!isNode(node)) return node;
  if (node.type === 'e' && node.props)
    return { ...node, props: { ...node.props, 'data-ss': '' } as never };
  if (node.children?.length) return { ...node, children: node.children.map(owned) as never };
  return node;
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

function resetKeyOf(value: unknown, where: string): string[] {
  const names = typeof value === 'string' ? [value] : value;
  if (
    !Array.isArray(names) ||
    !names.length ||
    names.some(name => typeof name !== 'string' || !name)
  )
    throw new SurfaceError(`${where}: resetKey must be a prop name or an array of prop names.`);
  return names;
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
  if (marker.persist) {
    claimPersist(state, marker.name, where);
    meta.persist = marker.name;
    if (marker.persistProps) meta.persistProps = true;
  }
  if (marker.resetKey !== undefined) {
    // DC-05: only a client instance has local state to reset.
    if (marker.mode !== 'client')
      throw new SurfaceError(`${where}: resetKey needs a client slot (it resets local state).`);
    meta.resetKey = resetKeyOf(marker.resetKey, where);
  }
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
  const attributes: Record<string, unknown> = {
    name: marker.name,
    ...marker.host,
    ...(marker.persist ? { 'data-surface-persist': marker.name } : {}),
  };
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
  if (marker.persist) {
    if (scope.kind !== 'page')
      throw new SurfaceError(
        `${where}: a persisted island must be in page or layout markup, not inside a <Slot>.`
      );
    claimPersist(state, marker.persist, where);
  }
  state.entries.push({
    id,
    mode: 'client',
    component: marker.componentId,
    props: (marker.props ?? {}) as Record<string, unknown>,
    ...activationMeta(marker.activation),
    ...(marker.resetKey !== undefined ? { resetKey: resetKeyOf(marker.resetKey, where) } : {}),
    ...(marker.persist ? { persist: marker.persist } : {}),
    ...(marker.persistProps ? { persistProps: true as const } : {}),
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
    {
      'data-island': id,
      ...(marker.persist ? { 'data-surface-persist': marker.persist } : {}),
      style: 'display:contents',
    },
    ...transport,
    ...(content ? [content] : [])
  );
}

function claimPersist(state: RenderState, id: string, where: string) {
  if (state.persist.has(id))
    throw new SurfaceError(`${where}: persist ID "${id}" is used more than once on this page.`);
  state.persist.add(id);
}

/** `<video transition:persist="intro">` (DC-19): an element kept across client navigation. */
function persistElement(node: WDom, scope: Scope, state: RenderState): WDom {
  const {
    'transition:persist': id,
    'transition:persist-props': props,
    ...rest
  } = node.props as Record<string, unknown>;
  const where = `<${node.tag} transition:persist>`;
  if (props !== undefined)
    throw new SurfaceError(
      `${where}: transition:persist-props applies to islands and client Slots.`
    );
  if (typeof id !== 'string' || !SLOT_NAME.test(id))
    throw new SurfaceError(
      `${where}: transition:persist on an element needs a name matching [a-z0-9-]+(:[a-z0-9-]+)*.`
    );
  if (scope.kind !== 'page')
    throw new SurfaceError(
      `${where}: persisted elements must be in page or layout markup, not inside a <Slot>.`
    );
  claimPersist(state, id, where);
  return { ...node, props: { ...rest, 'data-surface-persist': id } as never };
}

function projectRouter(marker: RouterMarker, scope: Scope, state: RenderState): WDom {
  if (scope.kind !== 'page' || !state.boot)
    throw new SurfaceError('<ClientRouter> belongs in the layout markup (its <head>).');
  if (state.router) throw new SurfaceError('<ClientRouter> is rendered more than once.');
  state.router = marker.options;
  return Fragment({});
}

const PREFETCH_STRATEGIES = new Set(['hover', 'tap', 'viewport', 'load']);
/** hover → moderate, tap → conservative, viewport → eager, load → immediate. */
const EAGERNESS: Record<string, string> = {
  hover: 'moderate',
  tap: 'conservative',
  viewport: 'eager',
  load: 'immediate',
};
function speculationRules(strategies: Set<string>) {
  const prefetch = [...strategies].map(strategy => ({
    source: 'document',
    where: {
      and: [
        { selector_matches: `a[data-prefetch="${strategy}"]` },
        { not: { selector_matches: '[data-surface-reload]' } },
      ],
    },
    eagerness: EAGERNESS[strategy],
  }));
  return JSON.stringify({ prefetch }).replace(/</g, '\\u003c');
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
