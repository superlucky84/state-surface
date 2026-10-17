import { DEV } from './dev.js';
import { warning } from './trace.js';
import type { IslandMeta, UiPatch } from '../shared/protocol.js';
import { hasScript } from '../shared/capability.js';
import type { ComponentHost } from './componentHost.js';
import type { PluginEvents } from './pluginHost.js';

type Morph = typeof import('./morph.js');

interface Saved {
  focus?: { id: string; start?: number | null; end?: number | null; direction?: string | null };
  scroll: Array<{ id: string; top: number; left: number }>;
}

/** Focus, selection and scroll inside the slot, by `id` (DESIGN 4.3 best-effort restore). */
function save(el: HTMLElement): Saved {
  const saved: Saved = { scroll: [] };
  const active = document.activeElement as HTMLInputElement | null;
  if (active && active !== el && el.contains(active) && active.id) {
    let start: number | null = null;
    let end: number | null = null;
    let direction: string | null = null;
    try {
      start = active.selectionStart;
      end = active.selectionEnd;
      direction = active.selectionDirection;
    } catch {
      /* elements without a text selection */
    }
    saved.focus = { id: active.id, start, end, direction };
  }
  for (const node of Array.from(el.querySelectorAll<HTMLElement>('[id]')))
    if (node.scrollTop || node.scrollLeft)
      saved.scroll.push({ id: node.id, top: node.scrollTop, left: node.scrollLeft });
  return saved;
}

function byId(el: HTMLElement, id: string) {
  return el.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
}

function restore(el: HTMLElement, saved: Saved) {
  for (const position of saved.scroll) {
    const node = byId(el, position.id);
    if (node) {
      node.scrollTop = position.top;
      node.scrollLeft = position.left;
    }
  }
  if (!saved.focus) return;
  const node = byId(el, saved.focus.id) as HTMLInputElement | null;
  if (!node) return;
  node.focus({ preventScroll: true });
  if (saved.focus.start !== null && saved.focus.start !== undefined)
    try {
      node.setSelectionRange(
        saved.focus.start,
        saved.focus.end ?? saved.focus.start,
        (saved.focus.direction as 'forward' | 'backward' | 'none' | null) ?? undefined
      );
    } catch {
      /* not a text control */
    }
}

/**
 * DOM side of server slots and UI patches. Server HTML is applied with `swap="replace"`
 * (plugin cleanup → dispose islands → innerHTML → restore focus/scroll → attach → activate
 * islands) or `swap="morph"` (idiomorph chunk, plugin `update`). Scripts in applied HTML do
 * not run (browsers do not execute scripts inserted as HTML); development warns.
 */
export class SlotDom {
  private ui = new Map<string, UiPatch>();
  /** How to undo the applied patch: classes it added or removed, variables it replaced. */
  private undo = new Map<
    string,
    { added: string[]; removed: string[]; vars: [string, string][] }
  >();
  private morph?: Promise<Morph>;

  constructor(
    private host: ComponentHost,
    private plugins: PluginEvents | undefined,
    private options: { development?: boolean; loadMorph?: () => Promise<Morph> } = {}
  ) {}

  /** Start loading the morph chunk early on pages with a morph slot. */
  preloadMorph() {
    return (this.morph ??= (this.options.loadMorph ?? (() => import('./morph.js')))());
  }

  async html(
    el: HTMLElement,
    slot: string,
    html: string,
    islands?: readonly IslandMeta[],
    swap: 'replace' | 'morph' = 'replace',
    isCurrent: () => boolean = () => true
  ) {
    if (DEV && this.options.development && hasScript(html))
      warning(`<script> in the HTML of slot "${slot}" does not run.`, true, { slot });
    if (swap === 'morph') {
      const { morphSlot } = await this.preloadMorph();
      if (!isCurrent()) return;
      morphSlot(el, html, islands ?? [], this.host);
      this.plugins?.updatedSlot(slot);
    } else {
      const saved = save(el);
      this.plugins?.removedSlot(slot);
      this.host.disposeWithin(el);
      el.innerHTML = html;
      restore(el, saved);
      this.plugins?.displayedSlot(slot, el, 'server');
    }
    this.host.adopt(el, islands);
  }

  /** `remove` op: plugin cleanup, island/instance disposal, content and UI cleared. */
  remove(el: HTMLElement, slot: string, mode: 'server' | 'client' | 'static') {
    if (mode === 'client') this.host.remove(slot);
    else {
      this.plugins?.removedSlot(slot);
      this.host.disposeWithin(el);
    }
    this.setUi(el, slot, null);
    el.innerHTML = '';
  }

  /**
   * `ui` op: the slot's whole UI patch (null clears it). Content is applied first. A new
   * patch first undoes the previous one, so the host shows its SSR classes and style plus the
   * current patch only, whatever patches came before (DESIGN 8.1 UI reset).
   */
  setUi(el: HTMLElement, slot: string, patch: UiPatch | null) {
    const undo = this.undo.get(slot);
    if (undo) {
      el.classList.remove(...undo.added);
      el.classList.add(...undo.removed);
      for (const [key, value] of undo.vars)
        if (value) el.style.setProperty(key, value);
        else el.style.removeProperty(key);
      this.undo.delete(slot);
    }
    if (!patch) {
      this.ui.delete(slot);
      return;
    }
    const removed = (patch.classRemove ?? []).filter(name => el.classList.contains(name));
    el.classList.remove(...removed);
    const added = (patch.classAdd ?? []).filter(name => !el.classList.contains(name));
    el.classList.add(...added);
    const vars: [string, string][] = [];
    for (const [key, value] of Object.entries(patch.cssVars ?? {})) {
      vars.push([key, el.style.getPropertyValue(key)]);
      el.style.setProperty(key, value);
    }
    this.undo.set(slot, { added, removed, vars: vars.reverse() });
    this.ui.set(slot, patch);
  }

  uiOf(slot: string) {
    return this.ui.get(slot);
  }

  /** Client navigation: UI patches of replaced slots are gone with their DOM. */
  leavePage(persisted: ReadonlySet<string> = new Set()) {
    for (const slot of [...this.ui.keys()])
      if (!persisted.has(slot)) {
        this.ui.delete(slot);
        this.undo.delete(slot);
      }
  }
}
