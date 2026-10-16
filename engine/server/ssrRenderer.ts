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
  type IslandMarker,
  type SlotMarker,
} from '../shared/surfaceTree.js';
import { readServerComponent } from './serverComponent.js';
import {
  buildBasePathScript,
  buildBootScript,
  buildPluginsScript,
  buildStateScript,
} from './ssr.js';

/** A client plugin declared by the page or a module it imports (build-time analysis). */
export interface PagePlugin {
  id: string;
  load: 'load' | 'idle' | 'visible';
  slots?: string[];
}

/** What the rendered page needs in the browser; drives entry selection (DESIGN 5.1). */
export interface PageUsage {
  /** Client components actually rendered, in document order, deduplicated. */
  components: Array<{ componentId: string; preload: boolean }>;
  /** `data-action` elements or `<Boot>`: the action runtime starts with the page. */
  actions: boolean;
  plugins: PagePlugin[];
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

export interface PageRenderOptions {
  plugins?: PagePlugin[];
  tags?: (usage: PageUsage) => DocumentTags;
}

/**
 * Where a marker was found. Page and SSR-only slot trees may contain islands and `<Boot>`;
 * client-rendered trees and static fragments (fallback, island children) belong to Lithent
 * or are plain HTML, so engine markers are invalid there.
 */
type Scope = 'page' | 'ssr-slot' | 'client' | 'static';

interface RenderState {
  ctx: SurfaceContext;
  loaded: Map<SlotMarker, unknown>;
  states: Record<string, unknown>;
  components: Map<string, boolean>;
  actions: boolean;
  boot: Array<{ transition: string; params: Record<string, unknown> }>;
  islands: number;
  structure: Record<'html' | 'head' | 'body', number>;
  marks: Record<'headStart' | 'headEnd' | 'bodyStart' | 'bodyEnd', WDom>;
}

function isNode(value: unknown): value is WDom {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function scopeName(scope: Scope) {
  return scope === 'ssr-slot'
    ? 'inside another <Slot>'
    : scope === 'client'
      ? 'inside a client component (Lithent owns that DOM)'
      : 'inside fallback or island children (static HTML)';
}

/** Depth-first page-level walk. Marker descriptors are not entered. */
function eachMarker(node: WDom, visit: (marker: ReturnType<typeof readMarker>) => void) {
  const marker = readMarker(node);
  if (marker) return visit(marker);
  for (const child of node.children ?? []) if (isNode(child)) eachMarker(child, visit);
}

/**
 * Render a page module to a complete HTML document.
 *
 * 1. Await the page function and walk the returned tree to find slots.
 * 2. Start every server-slot `load` at once and wait for all of them.
 * 3. Replace markers with rendered hosts while recording client state and `<Boot>` in
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

  const names = new Set<string>();
  const loads: Array<[SlotMarker, Promise<unknown>]> = [];
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
    if (server && !marker.empty)
      loads.push([marker, new Promise(resolve => resolve(server.load(marker.child.props, ctx)))]);
  });
  const results = await Promise.all(loads.map(([, promise]) => promise));

  const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), n =>
    n.toString(16).padStart(2, '0')
  ).join('');
  const mark = (kind: string) => h('surface-mark', { 'data-t': `${token}:${kind}` });
  const state: RenderState = {
    ctx,
    loaded: new Map(loads.map(([marker], i) => [marker, results[i]])),
    states: {},
    components: new Map(),
    actions: false,
    boot: [],
    islands: 0,
    structure: { html: 0, head: 0, body: 0 },
    marks: {
      headStart: mark('head-start'),
      headEnd: mark('head-end'),
      bodyStart: mark('body-start'),
      bodyEnd: mark('body-end'),
    },
  };
  const root = project(tree, 'page', state);
  const { html, head, body } = state.structure;
  if (html !== 1 || head !== 1 || body !== 1)
    throw new SurfaceError(
      `The page layout must render exactly one <html>, <head> and <body> ` +
        `(found ${html}, ${head}, ${body}).`
    );

  const plugins = options.plugins ?? [];
  const usage: PageUsage = {
    components: [...state.components].map(([componentId, preload]) => ({ componentId, preload })),
    actions: state.actions || state.boot.length > 0,
    plugins,
    engine: false,
  };
  usage.engine = usage.components.length > 0 || usage.actions || plugins.length > 0;
  const tags = options.tags?.(usage) ?? { styles: [], preload: [] };
  const script = (src: string) =>
    `<script type="module" src="${escapeAttr(src)}" nonce="${ctx.nonce}"></script>`;
  // Order (DESIGN 4.4): CSS → modulepreload → bootstrap JSON → app entry → engine entry.
  const managed =
    tags.styles.map(href => `<link rel="stylesheet" href="${escapeAttr(href)}">`).join('') +
    tags.preload.map(href => `<link rel="modulepreload" href="${escapeAttr(href)}">`).join('') +
    (usage.engine && Object.keys(state.states).length ? buildStateScript(state.states) : '') +
    (usage.engine && state.boot.length ? buildBootScript(state.boot) : '') +
    (usage.engine && plugins.length ? buildPluginsScript(plugins) : '') +
    (usage.engine || tags.appEntry ? buildBasePathScript(ctx.basePath) : '') +
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

function project(node: WDom, scope: Scope, state: RenderState): WDom {
  const marker = readMarker(node);
  if (marker) {
    if (marker.kind === 'slot') return projectSlot(marker, scope, state);
    if (marker.kind === 'island') return projectIsland(marker, scope, state);
    return projectBoot(marker, scope, state);
  }
  const tag = node.type === 'e' ? node.tag : undefined;
  if (tag === 'html' || tag === 'head' || tag === 'body') state.structure[tag]++;
  if (tag && node.props && node.props['data-action'] !== undefined) state.actions = true;
  const children = node.children ?? [];
  for (const child of children)
    if (typeof (child as { then?: unknown } | undefined)?.then === 'function') {
      (child as unknown as Promise<unknown>).then(undefined, () => {});
      const name = (node.ctor as { name?: string } | undefined)?.name || 'A component';
      throw new SurfaceError(
        `<${name}> returned a Promise. Components render synchronously; await data in the ` +
          'page function or in the load step of a server Slot (defineServerComponent).'
      );
    }
  let changed = false;
  const next = children.map(child => {
    const result = isNode(child) ? project(child, scope, state) : child;
    if (result !== child) changed = true;
    return result;
  });
  if (tag === 'head')
    return { ...node, children: [state.marks.headStart, ...next, state.marks.headEnd] };
  if (tag === 'body')
    return { ...node, children: [state.marks.bodyStart, ...next, state.marks.bodyEnd] };
  return changed ? { ...node, children: next } : node;
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

/** Host attributes the loader reads (stage 4 moves them into `__SURFACE__.slots`). */
function activationAttributes(activation: Activation) {
  const attributes: Record<string, unknown> = {};
  if (activation.timing !== 'load') attributes['data-activation'] = activation.timing;
  if (activation.media) attributes['data-media'] = activation.media;
  if (activation.only) attributes['data-only'] = '';
  return attributes;
}

function projectSlot(marker: SlotMarker, scope: Scope, state: RenderState): WDom {
  const where = `<Slot name="${marker.name}">`;
  if (scope !== 'page') throw new SurfaceError(`${where} cannot be used ${scopeName(scope)}.`);
  const { child } = marker;
  const attributes: Record<string, unknown> = { name: marker.name, ...marker.host };
  let content: WDom | undefined;
  if (marker.mode !== 'client') {
    // static and server slots render on the server only; no client state or code is sent.
    // Server HTML updates arrive with the stage 4 projection.
    if (!marker.empty) {
      const server = readServerComponent(child.component);
      const rendered = server
        ? h(server.render as never, (state.loaded.get(marker) ?? {}) as never)
        : h(child.component as never, child.props as never);
      content = project(rendered, 'ssr-slot', state);
    }
  } else {
    const activation = marker.activation!;
    attributes['data-component'] = child.componentId;
    Object.assign(attributes, activationAttributes(activation));
    useComponent(state, child.componentId, activation);
    if (!marker.empty) {
      assertJsonValue(child.props, where);
      state.states[marker.name] = child.props;
      content = activation.only
        ? isNode(marker.fallback)
          ? project(marker.fallback, 'static', state)
          : undefined
        : project(h(child.component as never, child.props as never), 'client', state);
    }
  }
  return content ? h('h-state', attributes, content) : h('h-state', attributes);
}

function projectIsland(marker: IslandMarker, scope: Scope, state: RenderState): WDom {
  const where = `<${marker.componentId}>`;
  if (scope === 'client' || scope === 'static')
    throw new SurfaceError(`${where} island cannot be used ${scopeName(scope)}.`);
  if (!Object.keys(marker.directives).length)
    throw new SurfaceError(`${where}: a Slot child descriptor was rendered outside its <Slot>.`);
  assertNotServerComponent(marker);
  assertJsonValue(marker.props, where);
  const id = `$${state.islands++}`;
  const only = marker.activation.only;
  useComponent(state, marker.componentId, marker.activation);

  // IC-03: island children are server-rendered once and passed as a static fragment.
  let childrenHtml: string | undefined;
  let wrapper: WDom | undefined;
  if (marker.children.length) {
    childrenHtml = renderToString(project(Fragment({}, ...marker.children), 'static', state));
    wrapper = h('h-children', { style: 'display:contents', innerHTML: childrenHtml });
  }
  let content: WDom | undefined;
  if (only) {
    if (isNode(marker.fallback)) content = project(marker.fallback, 'static', state);
  } else {
    const rendered = h(
      marker.component as never,
      marker.props as never,
      ...(wrapper ? [wrapper] : [])
    );
    content = project(rendered, 'client', state);
  }
  const transport =
    childrenHtml !== undefined && (only || !content || !contains(content, wrapper!))
      ? [h('template', { 'data-surface-children': '', innerHTML: childrenHtml })]
      : [];
  const attributes: Record<string, unknown> = {
    'data-island': id,
    'data-component': marker.componentId,
    'data-props': JSON.stringify(marker.props ?? {}),
    ...activationAttributes(marker.activation),
    style: 'display:contents',
  };
  return h('h-island', attributes, ...transport, ...(content ? [content] : []));
}

function projectBoot(marker: BootMarker, scope: Scope, state: RenderState): WDom {
  const where = `<Boot transition="${marker.transition}">`;
  if (scope === 'client' || scope === 'static')
    throw new SurfaceError(`${where} cannot be used ${scopeName(scope)}.`);
  assertJsonValue(marker.params, where, 'params');
  state.boot.push({ transition: marker.transition, params: marker.params });
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
