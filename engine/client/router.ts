import { warning } from './trace.js';
import { DEV } from './dev.js';
import { getBasePath } from '../shared/basePath.js';
import type { SurfaceBootstrap } from '../shared/protocol.js';
import type { PrefetchStrategy, RouterOptions } from '../shared/surfaceTree.js';
import { provideRouter } from './runtimeAccess.js';
import { readBootstrap } from './bootstrap.js';
import type { PageController, PersistPlan } from './start.js';

export type NavigationTrigger = 'link' | 'form' | 'popstate' | 'api' | 'load';
export type NavigationDirection = 'forward' | 'back' | 'replace';

/** `event.detail` of the `surface:*` navigation events (DC-18 ④). */
export interface NavigationDetail {
  from?: URL;
  to: URL;
  direction: NavigationDirection;
  trigger: NavigationTrigger;
  signal: AbortSignal;
  /** `surface:before-swap` only: replace to swap the DOM yourself. */
  swap?: () => void;
}

interface Fetched {
  url: string;
  doc: Document;
}
interface Entry {
  at: number;
  page: Promise<Fetched | undefined>;
}
type HistoryEntry = { index: number; scroll: [number, number] };

const STATE = '__surface';
const HOVER_DELAY = 65;
const isScript = (node: Node): node is HTMLScriptElement =>
  node instanceof Element && node.tagName === 'SCRIPT';
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');

/** Child nodes of `parent` between `<!--ss:x-->` and `<!--/ss:x-->` (DESIGN 8.2). */
function region(parent: Node, name: string): [Comment, Comment, Node[]] | undefined {
  let start: Comment | undefined;
  const nodes: Node[] = [];
  for (const node of Array.from(parent.childNodes)) {
    const data = node.nodeType === 8 ? (node as Comment).data : undefined;
    if (data === `ss:${name}`) start = node as Comment;
    else if (data === `/ss:${name}` && start) return [start, node as Comment, nodes];
    else if (start) nodes.push(node);
  }
  return undefined;
}

/** Stylesheets, module preloads and scripts are kept by URL across pages. */
function keyOf(node: Node): string | undefined {
  if (!(node instanceof Element)) return undefined;
  if (node.tagName === 'LINK') {
    const rel = node.getAttribute('rel');
    if (rel === 'stylesheet' || rel === 'modulepreload')
      return `${rel}:${(node as HTMLLinkElement).href}`;
  }
  if (isScript(node) && node.src) return `script:${node.src}`;
  return undefined;
}

type Attributes = Map<string, string>;
const attributesOf = (el: Element): Attributes =>
  new Map(Array.from(el.attributes, attr => [attr.name, attr.value]));

/**
 * `<html>`/`<body>` attributes come from the layout (lang, class): apply the next page's,
 * remove the previous page's, and keep attributes and class tokens added by others.
 */
function syncAttributes(el: Element, previous: Attributes, next: Attributes) {
  for (const name of previous.keys())
    if (!next.has(name) && name !== 'class') el.removeAttribute(name);
  for (const [name, value] of next)
    if (name !== 'class' && el.getAttribute(name) !== value) el.setAttribute(name, value);
  const tokens = (attributes: Attributes) =>
    (attributes.get('class') ?? '').split(/\s+/).filter(Boolean);
  const keep = tokens(next);
  el.classList.remove(...tokens(previous).filter(token => !keep.includes(token)));
  el.classList.add(...keep);
}

const persistedIn = (root: ParentNode) =>
  new Map(
    Array.from(root.querySelectorAll('[data-surface-persist]'), el => [
      el.getAttribute('data-surface-persist')!,
      el,
    ])
  );

/**
 * DC-19 ①: pair persist IDs of the current and the next document. Elements must have the
 * same tag and islands/slots the same component, else they are not kept (dev warns).
 */
export function persistPlan(
  current: SurfaceBootstrap,
  next: SurfaceBootstrap,
  currentRoot: ParentNode,
  nextRoot: ParentNode
): PersistPlan {
  const plan: PersistPlan = { elements: [], slots: new Set(), instances: new Map() };
  const metaOf = (page: SurfaceBootstrap) =>
    new Map((page.slots ?? []).flatMap(meta => (meta.persist ? [[meta.persist, meta]] : [])));
  const from = metaOf(current);
  const to = metaOf(next);
  const targets = persistedIn(nextRoot);
  for (const [id, el] of persistedIn(currentRoot)) {
    const target = targets.get(id);
    if (!target) continue;
    const a = from.get(id);
    const b = to.get(id);
    if (el.tagName !== target.tagName || a?.component !== b?.component) {
      warning(
        `persist ID "${id}" names different elements or components on the two pages; it is not kept.`,
        DEV,
        { persist: id }
      );
      continue;
    }
    plan.elements.push({ id, current: el, next: target });
    if (a && b) {
      plan.instances.set(a.id, { key: b.id, meta: b });
      if (!b.id.includes('$')) plan.slots.add(b.id);
    }
  }
  return plan;
}

const ownedHead = (node: Node): node is Element =>
  node instanceof Element && (node.hasAttribute('data-ss') || node.id === '__SURFACE__');

function slowConnection() {
  const connection = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } })
    .connection;
  return !!connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? '');
}

/**
 * Optional client router (DC-18, DESIGN 10.1). Same-origin links and GET forms inside
 * BASE_PATH fetch the next page's HTML, which replaces only the engine-managed regions
 * between the `ss:head` / `ss:body` markers: third-party nodes outside them stay (8.2).
 * Persisted elements move into the new content without leaving the document (DC-19), the
 * page lifetime is restarted through the loader's `PageController`, and links prefetch
 * by `hover` (default), `tap`, `viewport` or `load` into a small one-time cache (DC-20).
 * `history`, `fetch` and `location` are looked up on every call (8.3 ③).
 */
export function startRouter(page: PageController, doc: Document = document) {
  let options: RouterOptions = page.bootstrap.router ?? {};
  // Every listener lives for the document; `stop()` removes them all (tests, teardown).
  const lifetime = new AbortController();
  const on = (
    target: EventTarget,
    type: string,
    listener: (event: Event) => void,
    init: AddEventListenerOptions = {}
  ) => target.addEventListener(type, listener, { ...init, signal: lifetime.signal });
  let current: AbortController | undefined;
  let displayed = location.pathname + location.search;
  const executed = new Set(
    Array.from(doc.querySelectorAll<HTMLScriptElement>('script[src]'), script => script.src)
  );
  const cache = new Map<string, Entry>();
  // Layout attributes as the server rendered them (third-party changes are kept on swap).
  let layout = { html: attributesOf(doc.documentElement), body: attributesOf(doc.body) };
  const hinted = new Set<string>();
  // Browsers hide the nonce attribute once connected; the property keeps it.
  const nonced = doc.querySelector<HTMLScriptElement>('script[nonce]');
  const nonce = nonced?.nonce || nonced?.getAttribute('nonce') || '';
  const live = doc.createElement('div');
  live.setAttribute('aria-live', 'assertive');
  live.setAttribute('aria-atomic', 'true');
  live.style.cssText =
    'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap';
  doc.body.append(live);

  const historyEntry = (): HistoryEntry | undefined => globalThis.history.state?.[STATE];
  let index = historyEntry()?.index ?? 0;
  const writeState = (entry: HistoryEntry, url?: string, push = false) => {
    const state = { ...(push ? {} : globalThis.history.state), [STATE]: entry };
    const args: [unknown, string, string?] = url === undefined ? [state, ''] : [state, '', url];
    if (push) globalThis.history.pushState(...args);
    else globalThis.history.replaceState(...args);
  };
  const saveScroll = () => writeState({ index, scroll: [scrollX, scrollY] });
  globalThis.history.scrollRestoration = 'manual';
  saveScroll();
  // popstate fires after the entry changed, so the scroll position is saved as it settles.
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  on(
    globalThis,
    'scroll',
    () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(saveScroll, 200);
    },
    { passive: true }
  );

  const assign = (url: URL) => globalThis.location.assign(url.href);
  const dispatch = (type: string, detail: NavigationDetail, cancelable = false) =>
    doc.dispatchEvent(new CustomEvent(type, { detail, cancelable }));

  const inScope = (url: URL) => {
    const base = getBasePath();
    return (
      url.origin === location.origin &&
      (!base || url.pathname === base || url.pathname.startsWith(base + '/'))
    );
  };
  const hashOnly = (url: URL) =>
    url.hash !== '' && url.pathname + url.search === location.pathname + location.search;

  // ── Prefetch (DC-20) ──
  const strategyOf = (link: HTMLAnchorElement): PrefetchStrategy | false => {
    const own = link.dataset.prefetch;
    if (own === 'false') return false;
    if (own) return own as PrefetchStrategy;
    return options.prefetch ?? 'hover';
  };
  const fetchPage = (url: URL, signal?: AbortSignal, prefetch = false) =>
    globalThis
      .fetch(url.href, {
        headers: { Accept: 'text/html', ...(prefetch ? { Purpose: 'prefetch' } : {}) },
        credentials: 'same-origin',
        ...(signal ? { signal } : {}),
      })
      .then(async (response): Promise<Fetched | undefined> => {
        if (!/text\/html|application\/xhtml/.test(response.headers.get('content-type') ?? ''))
          return undefined;
        return { url: response.url || url.href, doc: parse(await response.text()) };
      });
  /**
   * Chromium keeps a parsed document alive while it owns an <audio>/<video>, even detached:
   * pages leave for this document once used or dropped.
   */
  const release = (root: ParentNode) => {
    for (const media of [root, ...root.querySelectorAll('audio,video')])
      if (media instanceof HTMLMediaElement) doc.adoptNode(media);
  };
  const drop = (key: string) => {
    void cache.get(key)?.page.then(page => page && release(page.doc));
    cache.delete(key);
  };
  const prefetch = (link: HTMLAnchorElement) => {
    const url = new URL(link.href);
    url.hash = '';
    if (!inScope(url) || link.closest('[data-surface-reload]')) return;
    const fresh = cache.get(url.href);
    if (fresh && Date.now() - fresh.at < (options.cacheTtl ?? 30_000)) return;
    const entry: Entry = {
      at: Date.now(),
      page: fetchPage(url, undefined, true).catch(() => undefined),
    };
    drop(url.href);
    cache.set(url.href, entry);
    while (cache.size > (options.cacheSize ?? 20)) drop(cache.keys().next().value!);
    // Warm the next page's module and style requests too.
    void entry.page.then(page => {
      if (!page) return;
      for (const link of page.doc.head.querySelectorAll<HTMLLinkElement>(
        'link[rel=modulepreload],link[rel=stylesheet]'
      )) {
        if (hinted.has(link.href) || doc.querySelector(`link[href="${CSS.escape(link.href)}"]`))
          continue;
        hinted.add(link.href);
        const hint = doc.createElement('link');
        hint.rel = link.rel === 'stylesheet' ? 'prefetch' : 'modulepreload';
        if (nonce) hint.setAttribute('nonce', nonce);
        hint.href = link.href;
        doc.head.append(hint);
      }
    });
  };
  const take = (url: URL) => {
    const key = new URL(url.href);
    key.hash = '';
    const entry = cache.get(key.href);
    if (entry && Date.now() - entry.at < (options.cacheTtl ?? 30_000)) {
      cache.delete(key.href);
      return entry.page;
    }
    drop(key.href);
    return undefined;
  };
  const clear = () => [...cache.keys()].forEach(drop);
  page.onActionEnd(clear);

  const linkOf = (target: EventTarget | null) =>
    target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null;
  let hover: { link: HTMLAnchorElement; timer: ReturnType<typeof setTimeout> } | undefined;
  const hoverStart = (event: Event) => {
    const link = linkOf(event.target);
    if (!link || hover?.link === link || (event as PointerEvent).pointerType === 'touch') return;
    if (strategyOf(link) !== 'hover' || slowConnection()) return;
    if (hover) clearTimeout(hover.timer);
    hover = { link, timer: setTimeout(() => prefetch(link), HOVER_DELAY) };
  };
  const hoverEnd = (event: Event) => {
    if (!hover || hover.link.contains((event as MouseEvent).relatedTarget as Node | null)) return;
    clearTimeout(hover.timer);
    hover = undefined;
  };
  on(doc, 'pointerover', hoverStart);
  on(doc, 'focusin', hoverStart);
  on(doc, 'pointerout', hoverEnd);
  on(doc, 'focusout', hoverEnd);
  // Tap (and the start of any click) prefetches at once, also with Save-Data.
  const tap = (event: Event) => {
    const link = linkOf(event.target);
    const strategy = link && strategyOf(link);
    if (link && (strategy === 'tap' || strategy === 'hover')) prefetch(link);
  };
  on(doc, 'pointerdown', tap, { passive: true });
  on(doc, 'touchstart', tap, { passive: true });

  // viewport and load links are collected when a page loads (the scheduler's timings). The
  // scheduler chunk loads only for pages that have such links (hover is the default).
  let watching: Array<() => void> = [];
  let generation = 0;
  const unwatch = () => {
    generation++;
    watching.splice(0).forEach(cancel => cancel());
  };
  const watchLinks = () => {
    unwatch();
    if (slowConnection()) return;
    const links = Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]')).flatMap(link => {
      const strategy = strategyOf(link);
      return strategy === 'viewport' || strategy === 'load' ? [{ link, strategy }] : [];
    });
    if (!links.length) return;
    const current = generation;
    void import('./scheduler.js').then(({ schedule }) => {
      if (current !== generation) return;
      for (const { link, strategy } of links)
        watching.push(
          schedule(strategy === 'load' ? 'idle' : 'visible', () => prefetch(link), {
            element: link,
          })
        );
    });
  };

  // ── Swap (DESIGN 10.1 ②) ──
  const runScript = (script: HTMLScriptElement) => {
    const fresh = doc.createElement('script');
    for (const attr of Array.from(script.attributes)) fresh.setAttribute(attr.name, attr.value);
    fresh.textContent = script.textContent;
    // Scripts started by the engine carry this document's nonce (CSP, DESIGN 8.2).
    if (nonce) fresh.setAttribute('nonce', nonce);
    if (fresh.src) executed.add(fresh.src);
    return fresh;
  };
  /** Module scripts run once per URL; inline scripts only with `data-surface-rerun`. */
  const runnable = (script: HTMLScriptElement) =>
    script.src ? !executed.has(script.src) : script.hasAttribute('data-surface-rerun');

  /**
   * Head elements the server rendered carry `data-ss` (and `#__SURFACE__`); a tag manager's
   * nodes inserted while the head was parsed sit between the markers too and are kept.
   */
  const owned = (head: HTMLHeadElement) => {
    const [, end, nodes] = region(head, 'head') ?? [];
    return [end, nodes?.filter(ownedHead) ?? []] as const;
  };
  const keyed = (nodes: readonly Element[]) =>
    new Map(nodes.flatMap(node => (keyOf(node) ? [[keyOf(node), node] as const] : [])));

  /** New stylesheets load before the swap so the next page never shows unstyled (FOUC). */
  const loadStyles = (next: Document) => {
    const [end, nodes] = owned(doc.head);
    const have = keyed(nodes);
    return Promise.all(
      owned(next.head)[1]
        .filter(node => end && node.matches('link[rel=stylesheet]') && !have.has(keyOf(node)))
        .map(
          link =>
            new Promise(resolve => {
              const fresh = doc.importNode(link, true);
              fresh.addEventListener('load', resolve);
              fresh.addEventListener('error', resolve);
              setTimeout(resolve, 3000);
              end!.before(fresh);
            })
        )
    );
  };

  /** Keyed nodes stay, the others are replaced; scripts follow the script policy. */
  const mergeHead = (next: Document) => {
    const [end, nodes] = owned(doc.head);
    const kept = keyed(nodes);
    const used = new Set<Node>();
    for (const node of owned(next.head)[1]) {
      const existing = kept.get(keyOf(node));
      if (existing) used.add(existing);
      else if (!isScript(node)) end?.before(doc.importNode(node, true));
      else if (!executed.has(node.src))
        end?.before(runnable(node) ? runScript(node) : doc.importNode(node, true));
    }
    for (const node of nodes) if (!used.has(node)) node.remove();
  };

  /** Selection and focus inside a moved node (moveBefore keeps focus, not selection). */
  const keepFocus = (el: Element) => {
    const active = doc.activeElement as HTMLInputElement | null;
    if (!active || !el.contains(active)) return () => {};
    const { selectionStart: from, selectionEnd: to, selectionDirection: direction } = active;
    return () => {
      try {
        if (doc.activeElement !== active) active.focus({ preventScroll: true });
        if (from != null) active.setSelectionRange(from, to ?? from, direction ?? undefined);
      } catch {
        /* not a text control */
      }
    };
  };

  const swapBody = (next: Document, plan: PersistPlan) => {
    // Placeholders become comment anchors before anything is adopted: an <iframe>, <audio> or
    // <img> placeholder would start loading once connected.
    const anchors = plan.elements.map(({ next: placeholder }) => {
      const anchor = next.createComment('');
      placeholder.replaceWith(anchor);
      release(placeholder);
      return anchor;
    });
    const mine = region(doc.body, 'body');
    const theirs = region(next.body, 'body');
    if (!mine || !theirs) throw new Error('Missing body markers');
    const [, end, previous] = mine;
    // 1. New content beside the old one.
    const incoming = doc.createDocumentFragment();
    for (const node of theirs[2]) incoming.append(doc.adoptNode(node));
    const scripts = [...incoming.querySelectorAll('script')];
    end.before(incoming);
    // 2. Persisted nodes move to their anchors while connected (DC-19 ⑤).
    const moved = new Set<Node>();
    plan.elements.forEach(({ current }, index) => {
      const anchor = anchors[index];
      const parent = anchor.parentNode as (ParentNode & { moveBefore: Function }) | null;
      if (!parent) return;
      const restore = keepFocus(current);
      // moveBefore keeps iframes, media and focus; older browsers re-insert.
      try {
        parent.moveBefore(current, anchor);
      } catch {
        parent.insertBefore(current, anchor);
      }
      anchor.remove();
      moved.add(current);
      restore();
    });
    // 3. The old content leaves; scripts of the new content follow the script policy
    //    (placeholder scripts never entered the document).
    for (const node of previous) if (!moved.has(node)) node.parentNode?.removeChild(node);
    for (const script of scripts)
      if (script.isConnected && runnable(script)) script.replaceWith(runScript(script));
  };

  const finish = (url: URL, plan: PersistPlan, scroll?: [number, number]) => {
    const target = url.hash && doc.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (scroll) scrollTo(scroll[0], scroll[1]);
    else if (target) target.scrollIntoView();
    else scrollTo(0, 0);
    // Focus inside a persisted element stays; otherwise the new page's main content gets it.
    const active = doc.activeElement;
    const kept = !!active && plan.elements.some(({ current }) => current.contains(active));
    const focus = kept
      ? undefined
      : (doc.querySelector<HTMLElement>('[autofocus]') ?? (target || doc.querySelector('main')));
    if (focus instanceof HTMLElement) {
      if (!focus.hasAttribute('tabindex') && !focus.matches('a,button,input,select,textarea'))
        focus.setAttribute('tabindex', '-1');
      focus.focus({ preventScroll: true });
    }
    live.textContent = doc.title;
  };

  const pageLoaded = (detail: NavigationDetail) => {
    dispatch('surface:page-load', detail);
    watchLinks();
    if (options.dataLayer) {
      const layer = ((globalThis as { dataLayer?: unknown[] }).dataLayer ??= []);
      layer.push({
        event: 'surface.page_view',
        page_path: location.pathname + location.search,
        page_title: doc.title,
      });
    }
  };

  async function navigate(
    to: URL,
    init: {
      trigger: NavigationTrigger;
      direction?: NavigationDirection;
      /** popstate: the history entry already moved. */
      entry?: HistoryEntry;
    }
  ) {
    const from = new URL(location.href);
    const direction = init.direction ?? (to.href === from.href ? 'replace' : 'forward');
    const controller = new AbortController();
    const detail: NavigationDetail = {
      from,
      to,
      direction,
      trigger: init.trigger,
      signal: controller.signal,
    };
    if (!dispatch('surface:before-preparation', detail, true)) return;
    current?.abort();
    current = controller;
    if (!init.entry) saveScroll();
    page.navigationStart();
    doc.documentElement.setAttribute('data-surface-navigating', '');
    let fetched: Fetched | undefined;
    try {
      // back/forward always asks the server again (DC-20 ⑤).
      const cached = init.trigger === 'popstate' ? undefined : take(to);
      fetched = (cached && (await cached)) || (await fetchPage(to, controller.signal));
      if (controller.signal.aborted) return;
      const url = fetched ? new URL(fetched.url) : to;
      if (to.hash && !url.hash) url.hash = to.hash;
      const next = fetched?.doc;
      const bootstrap = next && readBootstrap(next);
      // DC-18 ②: other origins, non-HTML, pages without the router or another build load as
      // documents; HTML error pages of a router layout are swapped like any page.
      if (
        !next ||
        url.origin !== location.origin ||
        !bootstrap?.router ||
        bootstrap.buildId !== page.bootstrap.buildId
      )
        return assign(url);
      detail.to = url;
      dispatch('surface:after-preparation', detail);
      const plan = persistPlan(page.bootstrap, bootstrap, doc.body, next.body);
      await loadStyles(next);
      if (controller.signal.aborted) return;
      detail.swap = () => {
        const upcoming = {
          html: attributesOf(next.documentElement),
          body: attributesOf(next.body),
        };
        syncAttributes(doc.documentElement, layout.html, upcoming.html);
        syncAttributes(doc.body, layout.body, upcoming.body);
        layout = upcoming;
        mergeHead(next);
        swapBody(next, plan);
      };
      dispatch('surface:before-swap', detail);
      let failed = false;
      const run = () => {
        if (controller.signal.aborted) return;
        try {
          page.leavePage(plan);
          if (!init.entry) {
            if (direction === 'replace') writeState({ index, scroll: [0, 0] }, url.href);
            else writeState({ index: ++index, scroll: [0, 0] }, url.href, true);
          } else index = init.entry.index;
          displayed = url.pathname + url.search;
          detail.swap!();
          finish(url, plan, init.entry?.scroll);
        } catch (error) {
          failed = true;
          reportError?.(error);
        }
      };
      const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (
        options.transition !== 'none' &&
        !reduced &&
        typeof doc.startViewTransition === 'function'
      )
        await doc.startViewTransition(run).updateCallbackDone.catch(() => {});
      else run();
      // A failed swap leaves a half-built page: load the document instead.
      if (failed) return assign(url);
      if (controller.signal.aborted) return;
      options = bootstrap.router;
      dispatch('surface:after-swap', detail);
      page.enterPage(bootstrap, plan);
      pageLoaded(detail);
    } catch (error) {
      if (!controller.signal.aborted) assign(to);
      else void error;
    } finally {
      if (fetched) release(fetched.doc);
      if (current === controller) {
        current = undefined;
        doc.documentElement.removeAttribute('data-surface-navigating');
      }
    }
  }

  // ── Interception (DC-18 ③) ──
  /** Actions, `data-surface-reload` areas and other browsing contexts stay with the browser. */
  const excluded = (el: Element, target: string | null | undefined) =>
    el.hasAttribute('data-action') ||
    !!el.closest('[data-surface-reload]') ||
    (!!target && target !== '_self');
  on(doc, 'click', input => {
    const event = input as MouseEvent;
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = linkOf(event.target);
    if (
      !(link instanceof HTMLAnchorElement) ||
      excluded(link, link.getAttribute('target')) ||
      link.hasAttribute('download')
    )
      return;
    const url = new URL(link.href);
    if (!/^https?:$/.test(url.protocol) || !inScope(url) || hashOnly(url)) return;
    event.preventDefault();
    void navigate(url, { trigger: 'link' });
  });
  on(doc, 'submit', event => {
    const form = event.target;
    if (event.defaultPrevented || !(form instanceof HTMLFormElement)) return;
    const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
    const method = (
      submitter?.getAttribute('formmethod') ??
      form.getAttribute('method') ??
      'get'
    ).toLowerCase();
    if (
      method !== 'get' ||
      excluded(form, submitter?.getAttribute('formtarget') ?? form.getAttribute('target'))
    )
      return;
    const url = new URL(
      submitter?.getAttribute('formaction') ?? form.getAttribute('action') ?? '',
      location.href
    );
    if (!inScope(url)) return;
    const data = new FormData(form, submitter);
    url.search = new URLSearchParams(
      Array.from(data, ([key, value]) => [key, typeof value === 'string' ? value : value.name])
    ).toString();
    event.preventDefault();
    void navigate(url, { trigger: 'form' });
  });
  on(globalThis, 'popstate', event => {
    const entry: HistoryEntry | undefined = (event as PopStateEvent).state?.[STATE];
    const url = new URL(location.href);
    // Only the hash changed: the browser already scrolled; this page stays.
    if (url.pathname + url.search === displayed) {
      if (entry) index = entry.index;
      return;
    }
    void navigate(url, {
      trigger: 'popstate',
      direction: entry && entry.index < index ? 'back' : 'forward',
      entry: entry ?? { index, scroll: [0, 0] },
    });
  });

  provideRouter((url, init = {}) => {
    const to = new URL(String(url), location.href);
    if (!inScope(to)) return assign(to);
    return navigate(to, { trigger: 'api', ...(init.replace ? { direction: 'replace' } : {}) });
  });
  pageLoaded({
    to: new URL(location.href),
    direction: 'forward',
    trigger: 'load',
    signal: new AbortController().signal,
  });
  return {
    navigate: (url: string | URL) =>
      navigate(new URL(String(url), location.href), { trigger: 'api' }),
    cache,
    stop() {
      lifetime.abort();
      current?.abort();
      clear();
      unwatch();
      live.remove();
      provideRouter(undefined);
    },
  };
}
