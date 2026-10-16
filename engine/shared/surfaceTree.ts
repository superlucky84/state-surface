import { Fragment } from 'lithent';
import type { WDom } from 'lithent';

/**
 * Page tree markers.
 *
 * Lithent runs components while JSX is evaluated, so `<Slot>`, `<Boot>` and the build
 * plugin's island descriptors cannot render anything themselves. They return marker nodes
 * that the server renderer finds by walking the tree returned from the page function.
 * Markers carry request data only inside that tree; nothing is registered globally.
 */

const NODE = Symbol.for('state-surface.node');

export type SlotMode = 'static' | 'server' | 'client';
export type Capability = 'strict' | 'rich' | 'unsafe';
/** Namespaced engine attributes such as `client:idle` or `client:media="(…)"`. */
export type Directives = Record<string, string | true>;

export interface ComponentDescriptor {
  /** Module path relative to the project root plus export name (`components/A.tsx#default`). */
  componentId: string;
  component: (props: any, children?: any) => unknown;
  /** Undefined for an empty Slot declared with `component={…}`. */
  props: Record<string, unknown> | undefined;
  directives: Directives;
  fallback?: unknown;
  resetKey?: string | string[];
  children: WDom[];
}

/** When a client component starts; `only` skips SSR and shows the fallback until then. */
export interface Activation {
  timing: 'load' | 'idle' | 'visible' | 'media';
  media?: string;
  only: boolean;
}

export interface SlotMarker {
  kind: 'slot';
  name: string;
  /** Normalized: explicit `mode`, else `client` with a client directive, else `static`. */
  mode: SlotMode;
  /** Present for client slots. */
  activation?: Activation;
  directives: Directives;
  /** class/style/id/data-* attributes written on the `<h-state>` host. */
  host: Record<string, unknown>;
  child: ComponentDescriptor;
  empty: boolean;
  fallback?: unknown;
  /** Defaults to `strict` (DC-13). */
  capability: Capability;
  /** `capability="unsafe" sandbox="iframe"`: render into a sandboxed iframe `srcdoc`. */
  sandbox?: 'iframe';
  resetKey?: string | string[];
  swap?: 'replace' | 'morph';
  viewTransition?: boolean;
  /** `server:defer` (DC-21): SSR writes the fallback and the browser fetches the content. */
  defer: boolean;
  cache?: string;
  /** Accepts frames from `ctx.external()`, validated by `schema` (DESIGN 8.1). */
  external?: boolean;
  schema?: unknown;
}

export interface IslandMarker extends ComponentDescriptor {
  kind: 'island';
  activation: Activation;
}

export interface BootMarker {
  kind: 'boot';
  transition: string;
  params: Record<string, unknown>;
}

export type SurfaceMarker = SlotMarker | IslandMarker | BootMarker;

export class SurfaceError extends Error {
  constructor(message: string) {
    super(`[state-surface] ${message}`);
    this.name = 'SurfaceError';
  }
}

export function readMarker(node: unknown): SurfaceMarker | undefined {
  return node && typeof node === 'object' ? (node as { [NODE]?: SurfaceMarker })[NODE] : undefined;
}

/** Lithent wraps every component result in a Fragment that carries `ctor`; look through it. */
function componentMarker(node: WDom | undefined): SurfaceMarker | undefined {
  let current = node;
  while (
    current &&
    !readMarker(current) &&
    current.type === 'f' &&
    current.ctor &&
    current.children?.length === 1
  )
    current = current.children[0];
  return readMarker(current);
}

function marker(meta: SurfaceMarker): WDom {
  const node = Fragment({}) as WDom & { [NODE]?: SurfaceMarker };
  node[NODE] = meta;
  return node;
}

export const SLOT_NAME = /^[a-z0-9-]+(:[a-z0-9-]+)*$/;
const DIRECTIVE_NAMESPACES = new Set(['client', 'server', 'transition']);
export const CLIENT_DIRECTIVES = ['load', 'idle', 'visible', 'media', 'only'] as const;
const TIMINGS = new Set(['load', 'idle', 'visible', 'media']);

export function assertSlotName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || !name)
    throw new SurfaceError('<Slot> requires a string literal `name`.');
  if (name.includes('#'))
    throw new SurfaceError(`Slot name "${name}": "#" is reserved for keyed repeated slots.`);
  if (!SLOT_NAME.test(name))
    throw new SurfaceError(
      `Slot name "${name}" must match [a-z0-9-]+(:[a-z0-9-]+)* (for example "article:body").`
    );
}

function isDirective(key: string) {
  const colon = key.indexOf(':');
  return colon > 0 && DIRECTIVE_NAMESPACES.has(key.slice(0, colon));
}

function splitDirectives(props: Record<string, unknown>, where: string) {
  const directives: Directives = {};
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!isDirective(key)) {
      rest[key] = value;
      continue;
    }
    if (value === false || value === undefined) continue;
    const [namespace, directive] = key.split(':');
    if (namespace === 'client' && !(CLIENT_DIRECTIVES as readonly string[]).includes(directive))
      throw new SurfaceError(`${where}: unknown directive "${key}".`);
    if (namespace === 'server' && directive !== 'defer')
      throw new SurfaceError(`${where}: unknown directive "${key}".`);
    if (key === 'client:media' ? typeof value !== 'string' || !value : value !== true)
      throw new SurfaceError(
        key === 'client:media'
          ? `${where}: client:media needs a media query string.`
          : `${where}: ${key} does not take a value.`
      );
    directives[key] = value as string | true;
  }
  const timings = Object.keys(directives).filter(
    key => key.startsWith('client:') && TIMINGS.has(key.slice(7))
  );
  if (timings.length > 1)
    throw new SurfaceError(`${where}: use only one activation timing (${timings.join(', ')}).`);
  return { directives, rest };
}

function hasClientDirective(directives: Directives) {
  return Object.keys(directives).some(key => key.startsWith('client:'));
}

/** Normalize client directives (DC-04): no timing means `load`; `only` may combine with one. */
export function activationOf(directives: Directives): Activation {
  const media = directives['client:media'];
  return {
    timing: directives['client:idle']
      ? 'idle'
      : directives['client:visible']
        ? 'visible'
        : typeof media === 'string'
          ? 'media'
          : 'load',
    ...(typeof media === 'string' ? { media } : {}),
    only: directives['client:only'] === true,
  };
}

function meaningful(children: WDom[]) {
  return children.filter(
    child =>
      child && child.type !== null && !(child.type === 't' && !String(child.text ?? '').trim())
  );
}

const HOST_ATTRIBUTE = /^(class|style|id|data-[a-z0-9-]+|aria-[a-z-]+)$/;
const SLOT_KEYS = new Set([
  'name',
  'mode',
  'component',
  'fallback',
  'capability',
  'resetKey',
  'swap',
  'viewTransition',
  'sandbox',
  'cache',
  'external',
  'schema',
  'key',
  '__ssComponentId',
]);
const MODES = new Set(['static', 'server', 'client']);
const CAPABILITIES = new Set(['strict', 'rich', 'unsafe']);

export interface SlotProps {
  /** Stable transition target, unique within the page. */
  name: string;
  mode?: SlotMode;
  /** Declares the component of an initially empty slot instead of a child element. */
  component?: (props: any, children?: any) => unknown;
  fallback?: unknown;
  capability?: Capability;
  /** With `capability="unsafe"`: isolate the HTML in a sandboxed iframe. */
  sandbox?: 'iframe';
  resetKey?: string | string[];
  /** Server slots: how `html` updates are applied (DC-03). */
  swap?: 'replace' | 'morph';
  /** Wrap this slot's changes (first appearance included) in a View Transition (DC-06). */
  viewTransition?: boolean;
  /** Server slot rendered after the page (DC-21); SSR writes `fallback`. */
  'server:defer'?: boolean;
  /** Deferred response `Cache-Control` (default `private, no-store`). */
  cache?: string;
  /** Accepts frames from `ctx.external()`; requires `schema`. */
  external?: boolean;
  /** Standard Schema validating external frames for this slot. */
  schema?: unknown;
  /** The single child component element; its props are the slot state. */
  children?: unknown;
  class?: string;
  style?: string;
  id?: string;
  [attribute: `data-${string}`]: string | number | boolean | undefined;
  [attribute: `aria-${string}`]: string | number | boolean | undefined;
}

/**
 * Named update boundary. Its single child component element (or `component` for an empty
 * slot) is replaced by the build plugin with a descriptor so the engine decides when and
 * where the component runs. The child's props are the slot state.
 */
export function Slot(props: SlotProps, children: WDom[] = []): WDom {
  const input = { ...(props as unknown as Record<string, unknown>) };
  assertSlotName(input.name);
  const name = input.name;
  const where = `<Slot name="${name}">`;
  const { directives, rest } = splitDirectives(input, where);
  const host: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (SLOT_KEYS.has(key)) continue;
    if (!HOST_ATTRIBUTE.test(key))
      throw new SurfaceError(
        `${where}: unknown attribute "${key}". Pass component data as props of the child element.`
      );
    if (value !== undefined && value !== false) host[key] = value;
  }
  const explicit = rest.mode as SlotMode | undefined;
  if (explicit !== undefined && !MODES.has(explicit))
    throw new SurfaceError(`${where}: mode must be "static", "server" or "client".`);
  if (explicit && explicit !== 'client' && hasClientDirective(directives))
    throw new SurfaceError(
      `${where}: mode="${explicit}" cannot be combined with client directives.`
    );
  // DC-01/DC-04 normalization: no mode and no directive → static.
  const mode: SlotMode = explicit ?? (hasClientDirective(directives) ? 'client' : 'static');
  const capability = (rest.capability as Capability | undefined) ?? 'strict';
  if (!CAPABILITIES.has(capability))
    throw new SurfaceError(`${where}: unknown capability "${capability}".`);
  const defer = directives['server:defer'] === true;
  if (defer && mode !== 'server')
    throw new SurfaceError(`${where}: server:defer needs mode="server".`);
  if (
    rest.swap !== undefined &&
    (mode !== 'server' || !['replace', 'morph'].includes(rest.swap as string))
  )
    throw new SurfaceError(`${where}: swap="replace" | "morph" applies to mode="server" slots.`);
  if (rest.sandbox !== undefined && (rest.sandbox !== 'iframe' || capability !== 'unsafe'))
    throw new SurfaceError(`${where}: sandbox="iframe" needs capability="unsafe".`);
  if (rest.external && rest.schema === undefined)
    throw new SurfaceError(`${where}: an external slot needs a Standard Schema \`schema\`.`);

  const content = meaningful(children);
  let child: ComponentDescriptor;
  if (rest.component !== undefined) {
    if (content.length)
      throw new SurfaceError(`${where}: use either a child element or \`component\`, not both.`);
    if (typeof rest.component !== 'function' || typeof rest.__ssComponentId !== 'string')
      throw new SurfaceError(
        `${where}: \`component\` must be a statically imported component (build plugin required).`
      );
    child = {
      componentId: rest.__ssComponentId,
      component: rest.component as ComponentDescriptor['component'],
      props: undefined,
      directives: {},
      children: [],
    };
  } else {
    const descriptor = content.length === 1 ? componentMarker(content[0]) : undefined;
    if (!descriptor || descriptor.kind !== 'island')
      throw new SurfaceError(
        `${where} needs exactly one statically imported component element as its child ` +
          '(no text, fragments, conditions or several elements).'
      );
    if (Object.keys(descriptor.directives).length)
      throw new SurfaceError(`${where}: put directives on the <Slot>, not on its child element.`);
    if (descriptor.children.length)
      throw new SurfaceError(
        `${where}: the child element cannot have JSX children; pass fixed content as props.`
      );
    const { kind: _kind, activation: _activation, ...rest } = descriptor;
    child = rest;
  }
  return marker({
    kind: 'slot',
    name,
    mode,
    ...(mode === 'client' ? { activation: activationOf(directives) } : {}),
    directives,
    host,
    child,
    empty: child.props === undefined,
    fallback: rest.fallback,
    capability,
    ...(rest.sandbox ? { sandbox: 'iframe' as const } : {}),
    resetKey: rest.resetKey as string | string[] | undefined,
    swap: rest.swap as 'replace' | 'morph' | undefined,
    viewTransition: rest.viewTransition === true,
    defer,
    ...(typeof rest.cache === 'string' ? { cache: rest.cache } : {}),
    ...(rest.external ? { external: true, schema: rest.schema } : {}),
  });
}

/**
 * Internal descriptor emitted by the build plugin for directive islands and Slot children.
 * The original component is passed as `__ssComponent`, so Lithent does not run it here.
 */
export function Island(props: Record<string, unknown>, children: WDom[] = []): WDom {
  const { __ssComponent, __ssId, key: _key, ...input } = props;
  if (typeof __ssComponent !== 'function' || typeof __ssId !== 'string')
    throw new SurfaceError('Invalid island descriptor; it must be generated by the build plugin.');
  const { directives, rest } = splitDirectives(input, `<${__ssId}>`);
  const direct = Object.keys(directives).length > 0;
  const { fallback, resetKey, ...componentProps } = rest;
  const descriptor: IslandMarker = {
    kind: 'island',
    componentId: __ssId,
    component: __ssComponent as ComponentDescriptor['component'],
    props: direct ? componentProps : rest,
    directives,
    activation: activationOf(directives),
    children: meaningful(children),
  };
  if (direct) {
    if (!hasClientDirective(directives))
      throw new SurfaceError(`<${__ssId}>: islands need a client directive.`);
    descriptor.fallback = fallback;
    descriptor.resetKey = resetKey as string | string[] | undefined;
  }
  return marker(descriptor);
}

export interface BootProps {
  /** Registered transition name started after the page loads. */
  transition: string;
  params?: Record<string, unknown>;
}

/** Auto-run transition. Renders nothing; the engine records it in document order. */
export function Boot(props: BootProps): WDom {
  if (typeof props?.transition !== 'string' || !props.transition)
    throw new SurfaceError('<Boot> requires a `transition` name.');
  const params = props.params ?? {};
  if (typeof params !== 'object' || Array.isArray(params))
    throw new SurfaceError(`<Boot transition="${props.transition}">: params must be an object.`);
  return marker({ kind: 'boot', transition: props.transition, params });
}

function describe(value: unknown) {
  if (typeof value === 'bigint') return 'a BigInt';
  if (typeof value === 'function') return 'a function';
  if (typeof value === 'symbol') return 'a symbol';
  if (typeof value === 'number') return String(value);
  if (value === undefined) return 'undefined';
  const name = (value as object).constructor?.name;
  return name ? `a ${name}` : 'an object without plain prototype';
}

/**
 * Public props, slot state and boot params are embedded as JSON. Values that JSON would
 * drop or change silently are rejected instead (undefined object properties are omitted
 * on both sides and therefore allowed).
 */
export function assertJsonValue(value: unknown, where: string, path = 'props'): void {
  const seen = new Set<object>();
  const visit = (current: unknown, at: string) => {
    if (current === null || typeof current === 'string' || typeof current === 'boolean') return;
    if (typeof current === 'number' && Number.isFinite(current)) return;
    if (typeof current === 'object') {
      if (seen.has(current))
        throw new SurfaceError(`${where}: ${at} contains a circular reference.`);
      const proto = Object.getPrototypeOf(current);
      if (Array.isArray(current)) {
        seen.add(current);
        current.forEach((item, index) => visit(item, `${at}[${index}]`));
        seen.delete(current);
        return;
      }
      if (proto === Object.prototype || proto === null) {
        seen.add(current);
        for (const [key, item] of Object.entries(current))
          if (item !== undefined) visit(item, `${at}.${key}`);
        seen.delete(current);
        return;
      }
    }
    throw new SurfaceError(
      `${where}: ${at} is ${describe(current)} and cannot be sent to the browser as JSON. ` +
        'Convert it to a string, number, plain object or array first.'
    );
  };
  visit(value, path);
}

type Renderable =
  | WDom
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | ((...args: any[]) => unknown)
  | readonly Renderable[];

declare global {
  namespace JSX {
    /** Accepted on every component element; the build plugin turns them into islands. */
    interface IntrinsicAttributes {
      key?: string | number;
      'client:load'?: boolean;
      'client:idle'?: boolean;
      'client:visible'?: boolean;
      'client:media'?: string;
      'client:only'?: boolean;
    }
    /** Components run synchronously; a Promise-returning component would render nothing. */
    type ElementType = string | ((props: any, children?: any) => Renderable);
  }
}
