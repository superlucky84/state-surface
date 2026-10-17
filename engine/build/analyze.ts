import { parseSync } from 'oxc-parser';
import { CLIENT_DIRECTIVES, SLOT_NAME } from '../shared/surfaceTree.js';
import { SurfaceBuildError } from './diagnostics.js';

/**
 * Static analysis of one module, shared by the call-site transform, diagnostics and the
 * app graph scan (DESIGN 3장). It reads the original TSX before JSX is compiled.
 */

export interface ImportBinding {
  source: string;
  /** `default`, a named export, or `*` for a namespace import. */
  imported: string;
}

/** Statically declared Slot options (literals), read for the page manifest (DESIGN 6.2). */
export interface SlotFacts {
  name: string;
  /** Normalized (DC-01): explicit `mode`, else `client` with a client directive, else `static`. */
  mode: 'static' | 'server' | 'client';
  swap?: 'replace' | 'morph';
  capability?: 'strict' | 'rich' | 'unsafe';
  sandbox?: 'iframe';
  viewTransition?: true;
  /** `server:defer` (DC-21). */
  defer?: true;
  cache?: string;
  external?: true;
  /** `schema={identifier}` of an external slot: imported or exported from this module. */
  schema?: { local: string; offset: number };
}

export interface IslandUse {
  /** Direct directive island, the single child of a Slot, or Slot `component={…}`. */
  kind: 'island' | 'slot-child' | 'slot-component';
  local: string;
  binding: ImportBinding;
  slot?: SlotFacts;
  /** Opening tag name range (island/slot-child) or Slot tag name range (slot-component). */
  nameStart: number;
  nameEnd: number;
  closeStart?: number;
  closeEnd?: number;
  offset: number;
}

export interface ElementUse {
  local: string;
  binding: ImportBinding;
  offset: number;
}

export interface ModuleAnalysis {
  imports: Map<string, ImportBinding>;
  /** Value import/re-export sources, used to follow the module graph. */
  sources: string[];
  islands: IslandUse[];
  /** Other component elements of imported identifiers (checked for server components). */
  elements: ElementUse[];
  slots: Array<SlotFacts & { offset: number }>;
  /** Top-level local name → exported name (`export const x`, `export { x as y }`). */
  exports: Map<string, string>;
  usesSlot: boolean;
  usesBoot: boolean;
  hasDefaultExport: boolean;
  /** Export names whose value is `defineServerComponent(...)`. */
  serverExports: Set<string>;
  /** `definePlugin({...})` exports with their statically declared options (DC-12). */
  pluginDefinitions: Map<string, { load: 'load' | 'idle' | 'visible'; slots?: string[] }>;
  /** `export const plugins = [a, b]`: imported plugin identifiers applied to the page. */
  plugins: Array<{ local: string; binding: ImportBinding; offset: number }>;
}

const PACKAGE = 'state-surface';
const TIMINGS = new Set(['load', 'idle', 'visible', 'media']);
const SKIP_KEYS = new Set(['type', 'start', 'end', 'range', 'loc']);

export function analyzeModule(code: string, file: string): ModuleAnalysis {
  const result: ModuleAnalysis = {
    imports: new Map(),
    sources: [],
    islands: [],
    elements: [],
    slots: [],
    exports: new Map(),
    usesSlot: false,
    usesBoot: false,
    hasDefaultExport: false,
    serverExports: new Set(),
    pluginDefinitions: new Map(),
    plugins: [],
  };
  // `.mdx` arrives compiled to JSX (engine/build/mdx.ts).
  const parsed = parseSync(file, code, file.endsWith('.mdx') ? { lang: 'jsx' } : undefined);
  // Syntax errors are reported by the TypeScript/esbuild transform with better context.
  if (parsed.errors.length) return result;
  const fail = (message: string, offset: number, hint: string): never => {
    throw new SurfaceBuildError(message, { file, code, offset, hint });
  };

  const program = parsed.program as any;
  const serverLocals = new Set<string>();
  let defineServerLocal: string | undefined;
  let definePluginLocal: string | undefined;
  for (const node of program.body) {
    if (node.type === 'ImportDeclaration') {
      if (node.importKind === 'type') continue;
      result.sources.push(node.source.value);
      for (const spec of node.specifiers) {
        if (spec.importKind === 'type') continue;
        const imported =
          spec.type === 'ImportDefaultSpecifier'
            ? 'default'
            : spec.type === 'ImportNamespaceSpecifier'
              ? '*'
              : (spec.imported.name ?? spec.imported.value);
        result.imports.set(spec.local.name, { source: node.source.value, imported });
        if (node.source.value === `${PACKAGE}/server` && imported === 'defineServerComponent')
          defineServerLocal = spec.local.name;
        if (node.source.value === `${PACKAGE}/client` && imported === 'definePlugin')
          definePluginLocal = spec.local.name;
      }
    } else if (
      (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') &&
      node.source &&
      node.exportKind !== 'type'
    ) {
      result.sources.push(node.source.value);
    }
  }
  const isServerCall = (node: any) =>
    node?.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === defineServerLocal;
  const declare = (declaration: any, exported: boolean) => {
    if (declaration?.type !== 'VariableDeclaration') return;
    for (const item of declaration.declarations)
      if (item.id.type === 'Identifier' && isServerCall(item.init)) {
        serverLocals.add(item.id.name);
        if (exported) result.serverExports.add(item.id.name);
      }
  };
  // Plugin options must be literals: the server decides which chunk to load and when
  // without importing client code into the decision.
  const pluginOptions = (call: any) => {
    const options = call.arguments[0];
    if (options?.type !== 'ObjectExpression')
      fail(
        'definePlugin() needs an object literal.',
        call.start,
        'Write the options inline: definePlugin({ name, slots, load, attach }); the build reads them without running client code.'
      );
    let load: 'load' | 'idle' | 'visible' = 'idle';
    let slots: string[] | undefined;
    for (const property of options.properties) {
      const key =
        property.type === 'Property' ? (property.key.name ?? property.key.value) : undefined;
      if (key === 'load') {
        const value = property.value;
        if (value.type !== 'Literal' || !['load', 'idle', 'visible'].includes(value.value))
          fail(
            'definePlugin `load` must be "load", "idle" or "visible" as a literal.',
            property.start,
            "Write load: 'idle' (default), 'load' or 'visible' directly in the definePlugin() call."
          );
        load = value.value;
      } else if (key === 'slots') {
        const value = property.value;
        if (
          value.type !== 'ArrayExpression' ||
          value.elements.some(
            (item: any) => item?.type !== 'Literal' || typeof item.value !== 'string'
          )
        )
          fail(
            'definePlugin `slots` must be an array of string literals.',
            property.start,
            "List slot names inline, e.g. slots: ['chat:messages'], or omit slots to attach to every slot of the page."
          );
        slots = value.elements.map((item: any) => item.value);
      }
    }
    return { load, slots };
  };
  const isPluginCall = (node: any) =>
    node?.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === definePluginLocal;
  const pluginLocals = new Map<string, { load: 'load' | 'idle' | 'visible'; slots?: string[] }>();
  for (const node of program.body) {
    const declaration =
      node.type === 'ExportNamedDeclaration'
        ? node.declaration
        : node.type === 'VariableDeclaration'
          ? node
          : undefined;
    if (declaration?.type !== 'VariableDeclaration') continue;
    for (const item of declaration.declarations) {
      if (item.id.type !== 'Identifier') continue;
      if (isPluginCall(item.init)) {
        pluginLocals.set(item.id.name, pluginOptions(item.init));
        if (node.type === 'ExportNamedDeclaration')
          result.pluginDefinitions.set(item.id.name, pluginLocals.get(item.id.name)!);
      }
      if (node.type === 'ExportNamedDeclaration' && item.id.name === 'plugins') {
        const list = item.init;
        if (list?.type !== 'ArrayExpression')
          fail(
            '`export const plugins` must be an array literal of imported plugins.',
            item.start,
            'Write export const plugins = [chatScroll] with each plugin imported by name.'
          );
        for (const element of list.elements) {
          const binding =
            element?.type === 'Identifier' ? result.imports.get(element.name) : undefined;
          if (!binding || binding.imported === '*')
            fail(
              '`plugins` entries must be statically imported definePlugin() exports.',
              element?.start ?? list.start,
              "Import each plugin by name (import { chatScroll } from '../client/plugins/chatScroll.js') and list that binding."
            );
          result.plugins.push({ local: element.name, binding: binding!, offset: element.start });
        }
      }
    }
  }
  for (const node of program.body) {
    if (node.type === 'VariableDeclaration') declare(node, false);
    if (node.type === 'ExportNamedDeclaration') {
      declare(node.declaration, true);
      const declaration = node.declaration;
      if (declaration?.type === 'VariableDeclaration')
        for (const item of declaration.declarations)
          if (item.id.type === 'Identifier') result.exports.set(item.id.name, item.id.name);
      if (declaration?.id?.type === 'Identifier')
        result.exports.set(declaration.id.name, declaration.id.name);
      for (const spec of node.specifiers ?? []) {
        const exported = spec.exported.name ?? spec.exported.value;
        if (!node.source && spec.local?.name) result.exports.set(spec.local.name, exported);
        if (exported === 'default') result.hasDefaultExport = true;
        if (!node.source && serverLocals.has(spec.local.name)) result.serverExports.add(exported);
        if (!node.source && pluginLocals.has(spec.local.name))
          result.pluginDefinitions.set(exported, pluginLocals.get(spec.local.name)!);
      }
    }
    if (node.type === 'ExportDefaultDeclaration') {
      result.hasDefaultExport = true;
      const value = node.declaration;
      if (isServerCall(value) || (value.type === 'Identifier' && serverLocals.has(value.name)))
        result.serverExports.add('default');
      if (isPluginCall(value)) result.pluginDefinitions.set('default', pluginOptions(value));
      if (value.type === 'Identifier' && pluginLocals.has(value.name))
        result.pluginDefinitions.set('default', pluginLocals.get(value.name)!);
    }
  }

  const engineLocal = (name: string) => {
    const binding = result.imports.get(name);
    return binding?.source === PACKAGE ? binding.imported : undefined;
  };
  const attrName = (attr: any): string | undefined =>
    attr.type !== 'JSXAttribute'
      ? undefined
      : attr.name.type === 'JSXNamespacedName'
        ? `${attr.name.namespace.name}:${attr.name.name.name}`
        : attr.name.name;
  const literal = (attr: any): string | undefined => {
    const value = attr.value;
    if (value?.type === 'Literal' && typeof value.value === 'string') return value.value;
    const expression = value?.type === 'JSXExpressionContainer' ? value.expression : undefined;
    if (expression?.type === 'Literal' && typeof expression.value === 'string')
      return expression.value;
    if (expression?.type === 'TemplateLiteral' && !expression.expressions.length)
      return expression.quasis[0].value.cooked;
    return undefined;
  };
  const tagOf = (element: any) => element.openingElement.name;
  const isComponentTag = (name: any) => name.type === 'JSXIdentifier' && /^[A-Z_$]/.test(name.name);
  const directivesOf = (element: any, where: string) => {
    const found: string[] = [];
    for (const attr of element.openingElement.attributes) {
      const name = attrName(attr);
      if (!name?.includes(':')) continue;
      const [namespace, directive] = name.split(':');
      if (namespace !== 'client' && namespace !== 'server' && namespace !== 'transition') continue;
      if (namespace === 'server' && (directive !== 'defer' || attr.value !== null))
        fail(
          `${where}: unknown directive "${name}".`,
          attr.start,
          'The server directive is server:defer.'
        );
      if (namespace === 'transition') {
        if (directive !== 'persist' && directive !== 'persist-props')
          fail(
            `${where}: unknown directive "${name}".`,
            attr.start,
            'Use transition:persist="name" or transition:persist-props.'
          );
        if (directive === 'persist' && attr.value !== null) {
          const id = literal(attr);
          if (id === undefined || !SLOT_NAME.test(id))
            fail(
              `${where}: transition:persist needs a string literal name matching [a-z0-9-]+(:[a-z0-9-]+)*.`,
              attr.start,
              'Name it like a slot, e.g. transition:persist="player".'
            );
          persistNames(id!, attr.start);
        }
        if (directive === 'persist-props' && attr.value !== null)
          fail(
            `${where}: ${name} does not take a value.`,
            attr.start,
            `Write ${name} as a bare attribute.`
          );
      }
      if (namespace === 'client') {
        if (!(CLIENT_DIRECTIVES as readonly string[]).includes(directive))
          fail(
            `${where}: unknown directive "${name}".`,
            attr.start,
            'Use client:load, client:idle, client:visible, client:media or client:only.'
          );
        if (directive === 'media' && literal(attr) === undefined)
          fail(
            `${where}: client:media needs a media query string literal.`,
            attr.start,
            'Pass the query inline: client:media="(min-width: 768px)".'
          );
        if (directive !== 'media' && attr.value !== null)
          fail(
            `${where}: ${name} does not take a value.`,
            attr.start,
            `Write ${name} as a bare attribute.`
          );
      }
      found.push(name);
    }
    const timings = found.filter(name => name.startsWith('client:') && TIMINGS.has(name.slice(7)));
    if (timings.length > 1)
      fail(
        `${where}: use only one activation timing (${timings.join(', ')}).`,
        element.start,
        'Keep one of client:load, client:idle, client:visible or client:media; client:only may be added to it.'
      );
    return found;
  };
  const componentBinding = (name: any, offset: number, what: string) => {
    if (name.type !== 'JSXIdentifier' || !isComponentTag(name))
      fail(
        `${what} must be a statically imported component.`,
        offset,
        'Computed components (member access, variables, conditions) cannot become islands; write one element per branch.'
      );
    const binding = result.imports.get(name.name);
    if (!binding || binding.imported === '*')
      fail(
        `${what} <${name.name}> must be a statically imported component.`,
        offset,
        'Import it with `import X from` or `import { X } from`.'
      );
    return binding!;
  };
  const meaningfulChildren = (element: any) =>
    element.children.filter(
      (child: any) =>
        !(child.type === 'JSXText' && !child.value.trim()) &&
        !(child.type === 'JSXExpressionContainer' && child.expression.type === 'JSXEmptyExpression')
    );
  const recordIsland = (
    element: any,
    kind: IslandUse['kind'],
    binding: ImportBinding,
    slot?: IslandUse['slot']
  ) => {
    const name = tagOf(element);
    result.islands.push({
      kind,
      local: name.name,
      binding,
      slot,
      nameStart: name.start,
      nameEnd: name.end,
      closeStart: element.closingElement?.name.start,
      closeEnd: element.closingElement?.name.end,
      offset: element.start,
    });
  };

  // DC-19 ①: persist IDs are unique per page; literal duplicates in one module fail here.
  const persistSeen = new Set<string>();
  const persistNames = (id: string, offset: number) => {
    if (persistSeen.has(id))
      fail(
        `persist ID "${id}" is used more than once.`,
        offset,
        'One name pairs one element across pages; give the other elements their own names.'
      );
    persistSeen.add(id);
  };
  const persistOf = (element: any) =>
    element.openingElement.attributes.find((attr: any) => attrName(attr) === 'transition:persist');
  const booleanAttr = (attr: any, where: string): boolean => {
    if (attr.value === null) return true;
    const expression =
      attr.value?.type === 'JSXExpressionContainer' ? attr.value.expression : undefined;
    if (expression?.type === 'Literal' && typeof expression.value === 'boolean')
      return expression.value;
    return fail(
      `${where}: \`${attrName(attr)}\` must be a boolean literal.`,
      attr.start,
      'Write it bare (true) or as ={false}; the build reads Slot options without running the page.'
    );
  };
  const handleSlot = (element: any, depth: { slot: number; island: number }) => {
    result.usesSlot = true;
    if (depth.slot)
      fail(
        '<Slot> cannot be nested inside another <Slot>.',
        element.start,
        'A Slot holds one component; declare the inner <Slot> next to the outer one in the page or layout.'
      );
    if (depth.island)
      fail(
        '<Slot> cannot be used inside island children.',
        element.start,
        'Island children are a static fragment; declare Slots in the page or layout markup.'
      );
    let name: string | undefined;
    let mode: string | undefined;
    let componentAttr: any;
    const options: Omit<SlotFacts, 'name' | 'mode'> = {};
    const choice = <T extends string>(attr: any, allowed: readonly T[], what: string): T => {
      const value = literal(attr);
      if (value === undefined || !(allowed as readonly string[]).includes(value))
        fail(
          `<Slot> \`${what}\` must be ${allowed.map(item => `"${item}"`).join(' or ')} as a literal.`,
          attr.start,
          'Write the value as a string literal; the build reads Slot options without running the page.'
        );
      return value as T;
    };
    for (const attr of element.openingElement.attributes) {
      const key = attrName(attr);
      if (key === 'name') {
        name = literal(attr);
        if (name === undefined)
          fail(
            '<Slot> `name` must be a string literal.',
            attr.start,
            'Write name="ns:name" as a string literal; transitions address the slot by it.'
          );
      } else if (key === 'mode') {
        mode = literal(attr);
        if (!mode || !['static', 'server', 'client'].includes(mode))
          fail(
            '<Slot> `mode` must be "static", "server" or "client" as a literal.',
            attr.start,
            'Omit mode for a static slot, add a client:* directive for a client slot, or write mode="server".'
          );
      } else if (key === 'component') componentAttr = attr;
      else if (key === 'swap') options.swap = choice(attr, ['replace', 'morph'] as const, 'swap');
      else if (key === 'capability')
        options.capability = choice(attr, ['strict', 'rich', 'unsafe'] as const, 'capability');
      else if (key === 'sandbox') options.sandbox = choice(attr, ['iframe'] as const, 'sandbox');
      else if (key === 'cache') {
        options.cache = literal(attr);
        if (!options.cache)
          fail(
            '<Slot> `cache` must be a string literal.',
            attr.start,
            'Write the Cache-Control value as a string literal, e.g. cache="public, max-age=60".'
          );
      } else if (key === 'viewTransition') {
        if (booleanAttr(attr, '<Slot>')) options.viewTransition = true;
      } else if (key === 'external') {
        if (booleanAttr(attr, '<Slot>')) options.external = true;
      } else if (key === 'server:defer') options.defer = true;
      else if (key === 'schema') {
        const expression =
          attr.value?.type === 'JSXExpressionContainer' ? attr.value.expression : undefined;
        if (expression?.type !== 'Identifier')
          fail(
            '<Slot> `schema` must be an identifier of an imported or exported Standard Schema.',
            attr.start,
            "Pass an identifier: schema={schema}, imported (import { schema } from './schema.js') or exported from this module."
          );
        options.schema = { local: expression.name, offset: attr.start };
      }
    }
    if (name === undefined)
      fail(
        '<Slot> requires a `name`.',
        element.start,
        'Add name="ns:name": lowercase letters, digits and dashes with optional ":" namespaces.'
      );
    if (name!.includes('#'))
      fail(
        `Slot name "${name}": "#" is reserved for keyed repeated slots.`,
        element.start,
        'Pick another name; "#" separates the key of keyed repeated slots.'
      );
    if (!SLOT_NAME.test(name!))
      fail(
        `Slot name "${name}" must match [a-z0-9-]+(:[a-z0-9-]+)*.`,
        element.start,
        'Use lowercase letters, digits and dashes with optional ":" namespaces, e.g. "chat:messages".'
      );
    const where = `<Slot name="${name}">`;
    const persist = persistOf(element);
    if (persist && persist.value !== null)
      fail(
        `${where}: a client Slot persists under its name; write transition:persist without a value.`,
        persist.start,
        'Write <Slot name="…" client:load transition:persist>; the slot name pairs it across pages.'
      );
    const directives = directivesOf(element, where);
    const client = directives.some(d => d.startsWith('client:'));
    if (mode && mode !== 'client' && client)
      fail(
        `${where}: mode="${mode}" cannot be combined with client directives.`,
        element.start,
        'A client directive already makes it a client slot: remove mode, or remove the directives for a static or server slot.'
      );
    const normalized = (mode ?? (client ? 'client' : 'static')) as SlotFacts['mode'];
    if (persist) {
      if (normalized !== 'client')
        fail(
          `${where}: transition:persist needs a client slot.`,
          persist.start,
          'Server and static slots are rendered again for every page, so they cannot persist (DC-19).'
        );
      persistNames(name!, persist.start);
    }
    if (directives.includes('transition:persist-props') && !persist)
      fail(
        `${where}: transition:persist-props needs transition:persist.`,
        element.start,
        "Add transition:persist, or remove transition:persist-props (it keeps the previous page's props)."
      );
    if (options.swap && normalized !== 'server')
      fail(
        `${where}: \`swap\` applies to mode="server" slots.`,
        element.start,
        'Add mode="server", or remove swap: client slots update through props.'
      );
    if (options.defer && normalized !== 'server')
      fail(
        `${where}: server:defer needs mode="server".`,
        element.start,
        'Add mode="server": deferred content is rendered by the server after the page.'
      );
    if (options.cache && !options.defer)
      fail(
        `${where}: \`cache\` applies to server:defer slots.`,
        element.start,
        'Add server:defer, or remove cache.'
      );
    if (options.sandbox && options.capability !== 'unsafe')
      fail(
        `${where}: sandbox="iframe" needs capability="unsafe".`,
        element.start,
        'Add capability="unsafe": strict and rich slots never contain scripts.'
      );
    if (options.external && !options.schema)
      fail(
        `${where}: an external slot needs a Standard Schema \`schema\`.`,
        element.start,
        'Frames from ctx.external() are validated against it (DESIGN 8.1).'
      );
    if (options.schema && !options.external)
      fail(
        `${where}: \`schema\` is only used by external slots.`,
        element.start,
        'Add external to validate ctx.external() frames against it, or remove schema.'
      );
    if (options.schema) {
      const local = options.schema.local;
      const binding = result.imports.get(local);
      if ((!binding || binding.imported === '*') && !result.exports.has(local))
        fail(
          `${where}: schema \`${local}\` must be imported or exported from this module.`,
          options.schema.offset,
          `Import ${local} or declare it with export const in this module.`
        );
    }
    const facts: SlotFacts = { name: name!, mode: normalized, ...options };
    result.slots.push({ ...facts, offset: element.start });
    const children = meaningfulChildren(element);
    if (componentAttr) {
      if (children.length)
        fail(
          `${where}: use either a child element or \`component\`, not both.`,
          element.start,
          'Keep the child element (its props are the first state) or component={X} for an initially empty slot.'
        );
      const expression =
        componentAttr.value?.type === 'JSXExpressionContainer'
          ? componentAttr.value.expression
          : undefined;
      if (expression?.type !== 'Identifier')
        fail(
          `${where}: \`component\` must be a statically imported component.`,
          componentAttr.start,
          'Pass an imported component identifier, e.g. component={SearchResults}.'
        );
      const binding = result.imports.get(expression.name);
      if (!binding || binding.imported === '*')
        fail(
          `${where}: \`component={${expression.name}}\` must be statically imported.`,
          componentAttr.start,
          `Import it: import ${expression.name} from './…'.`
        );
      const tag = tagOf(element);
      result.islands.push({
        kind: 'slot-component',
        local: expression.name,
        binding: binding!,
        slot: facts,
        nameStart: tag.start,
        nameEnd: tag.end,
        offset: componentAttr.start,
      });
      return;
    }
    if (children.length !== 1 || children[0].type !== 'JSXElement')
      fail(
        `${where} needs exactly one component element as its child.`,
        children[0]?.start ?? element.start,
        'Text, fragments, conditions and several elements are not allowed; the child props are the slot state. Use `component={X}` for an empty slot.'
      );
    const child = children[0];
    const childTag = tagOf(child);
    if (childTag.type === 'JSXIdentifier' && engineLocal(childTag.name) === 'Slot')
      fail(
        '<Slot> cannot be nested inside another <Slot>.',
        child.start,
        'A Slot holds one component; declare the inner <Slot> next to the outer one in the page or layout.'
      );
    const binding = componentBinding(childTag, child.start, `${where} child`);
    if (directivesOf(child, `${where} child`).length)
      fail(
        `${where}: put directives on the <Slot>, not on its child element.`,
        child.start,
        'Move client:* and server:* directives to the <Slot>; the child element is its component.'
      );
    if (meaningfulChildren(child).length)
      fail(
        `${where}: the child element cannot have JSX children.`,
        child.start,
        'Pass fixed content as props.'
      );
    recordIsland(child, 'slot-child', binding, facts);
  };

  const visit = (node: any, depth: { slot: number; island: number }): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth);
      return;
    }
    if (node.type === 'JSXElement') {
      const name = tagOf(node);
      const engine = name.type === 'JSXIdentifier' ? engineLocal(name.name) : undefined;
      if (engine === 'Slot') {
        handleSlot(node, depth);
        const inner = { ...depth, slot: depth.slot + 1 };
        visit(node.openingElement.attributes, inner);
        const children = meaningfulChildren(node);
        if (children.length === 1 && children[0].type === 'JSXElement')
          visit(children[0].openingElement.attributes, inner);
        return;
      }
      if (engine === 'Boot') result.usesBoot = true;
      const hasDirective = node.openingElement.attributes.some((attr: any) =>
        attrName(attr)?.startsWith('client:')
      );
      const persist = persistOf(node);
      const transitions = node.openingElement.attributes.some((attr: any) =>
        attrName(attr)?.startsWith('transition:')
      );
      if (transitions && !hasDirective) {
        if (name.type === 'JSXIdentifier' && isComponentTag(name))
          fail(
            `<${name.name}>: transition:persist applies to client islands, client Slots and HTML elements.`,
            persist.start,
            'Add a client directive to make the component an island.'
          );
        directivesOf(node, `<${name.name ?? 'element'}>`);
        if (!persist)
          fail(
            `<${name.name}>: transition:persist-props needs transition:persist.`,
            node.start,
            "Add transition:persist, or remove transition:persist-props (it keeps the previous page's props)."
          );
        if (persist.value === null)
          fail(
            `<${name.name}>: transition:persist on an element needs a name (transition:persist="intro").`,
            persist.start,
            'Elements pair across pages by that name.'
          );
      }
      if (hasDirective) {
        if (name.type === 'JSXIdentifier' && !isComponentTag(name))
          fail(
            `<${name.name}> is an HTML element; client directives only apply to components.`,
            node.start,
            'Move the markup into an imported component, or remove the directive.'
          );
        const binding = componentBinding(name, node.start, 'A client island');
        directivesOf(node, `<${name.name}>`);
        if (persist?.value === null)
          fail(
            `<${name.name}>: transition:persist on an island needs a name (transition:persist="player").`,
            persist.start,
            'Automatic island ids differ per page, so the pair would silently not match (DC-19).'
          );
        if (
          node.openingElement.attributes.some(
            (attr: any) => attrName(attr) === 'transition:persist-props'
          ) &&
          !persist
        )
          fail(
            `<${name.name}>: transition:persist-props needs transition:persist.`,
            node.start,
            "Add transition:persist, or remove transition:persist-props (it keeps the previous page's props)."
          );
        if (depth.island)
          fail(
            `<${name.name}>: islands cannot be nested inside island children.`,
            node.start,
            "Island children are a static fragment; place the inner island outside the outer island's children."
          );
        recordIsland(node, 'island', binding);
        const inner = { ...depth, island: depth.island + 1 };
        visit(node.openingElement.attributes, inner);
        visit(node.children, inner);
        return;
      }
      if (name.type === 'JSXIdentifier' && isComponentTag(name) && !engine) {
        const binding = result.imports.get(name.name);
        if (binding && binding.imported !== '*')
          result.elements.push({ local: name.name, binding, offset: node.start });
      }
    }
    for (const key of Object.keys(node)) {
      if (SKIP_KEYS.has(key)) continue;
      const value = node[key];
      if (value && typeof value === 'object') visit(value, depth);
    }
  };
  visit(program.body, { slot: 0, island: 0 });
  return result;
}
