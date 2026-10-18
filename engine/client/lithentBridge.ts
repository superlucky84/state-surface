import { h, render, mount } from 'lithent';
import type { TagFunction, Props } from 'lithent';
import { hydration } from 'lithent/ssr';
import { guardDom } from './domGuard.js';

/**
 * Lithent glue, loaded as its own chunk only on pages that activate a client component.
 * Each instance is wrapped in a DataProxy so external props updates go through Lithent's
 * VDOM diff while local state survives.
 *
 * The proxy reads the latest props from a holder object and redraws through its own
 * `renew`. Lithent 1.25.2+ draws a component created outside a diff with a copy of its
 * props, so neither mutating the props object passed to `h` nor `componentUpdate(props)`
 * reaches the instance; the holder is shared by reference and `renew` is the instance's.
 */
export interface Mount {
  update(data: unknown): void;
  cleanup(): void;
}

export interface MountOptions {
  /** Reuse the SSR DOM (hydration) instead of rendering into an empty host. */
  hydrate: boolean;
  /** Island children: static server HTML passed as the component's children (IC-03). */
  childrenHtml?: string;
  /** strict/rich slot content: remove what the server would drop (DESIGN 8.1). */
  guard?: boolean;
}

export function mountComponent(
  component: TagFunction,
  data: unknown,
  el: HTMLElement,
  options: MountOptions
): Mount {
  const holder: Holder = {
    data,
    component,
    children:
      options.childrenHtml === undefined
        ? []
        : [h('h-children', { style: 'display:contents', innerHTML: options.childrenHtml })],
  };
  const wdom = h(DataProxy as TagFunction, { __holder: holder } as Props);
  let cleanup: () => void;
  if (options.hydrate) {
    const restore = keepUserInput(el);
    cleanup = hydration(wdom, el);
    restore();
  } else cleanup = render(wdom, el);
  const guard = options.guard ? guardDom(el) : undefined;
  return {
    update(next) {
      holder.data = next;
      holder.renew?.();
      guard?.flush();
    },
    cleanup() {
      guard?.dispose();
      cleanup();
    },
  };
}

interface Holder {
  data: unknown;
  component: TagFunction;
  children: unknown[];
  /** The proxy instance's own redraw, set when it mounts. */
  renew?: () => unknown;
}

const DataProxy = mount<{ __holder: Holder }>((renew, props) => {
  const holder = props.__holder;
  holder.renew = renew;
  return () => h(holder.component, (holder.data ?? {}) as Props, ...(holder.children as never[]));
});

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * V-04 (DESIGN 5.2): Lithent hydration writes the SSR `value`/`checked` back onto the reused
 * nodes and moves the selection, so what the user typed before activation would be lost.
 * Snapshot the controls the user changed (live state differs from the SSR markup), hydrate,
 * then put those values back with an `input`/`change` event so the component's handlers see
 * them, and restore the focus and selection.
 */
export function keepUserInput(root: HTMLElement): () => void {
  const active = document.activeElement;
  const edited: Array<{ control: Control; restore: () => void; event: 'input' | 'change' }> = [];
  for (const control of Array.from(root.querySelectorAll<Control>('input, textarea, select'))) {
    if (control instanceof HTMLSelectElement) {
      const selected = Array.from(control.options, option => option.selected);
      if (Array.from(control.options).some((option, i) => option.defaultSelected !== selected[i]))
        edited.push({
          control,
          event: 'change',
          restore: () =>
            Array.from(control.options).forEach(
              (option, i) => (option.selected = selected[i] ?? false)
            ),
        });
    } else if (
      control instanceof HTMLInputElement &&
      (control.type === 'checkbox' || control.type === 'radio')
    ) {
      const checked = control.checked;
      if (checked !== control.defaultChecked)
        edited.push({ control, event: 'change', restore: () => (control.checked = checked) });
    } else if (control.value !== control.defaultValue) {
      const value = control.value;
      edited.push({ control, event: 'input', restore: () => (control.value = value) });
    }
  }
  const focused =
    active instanceof HTMLElement && root.contains(active)
      ? {
          element: active,
          selection:
            active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
              ? readSelection(active)
              : undefined,
        }
      : undefined;
  return () => {
    for (const entry of edited) {
      if (!entry.control.isConnected) continue;
      entry.restore();
      entry.control.dispatchEvent(new Event(entry.event, { bubbles: true }));
    }
    if (!focused?.element.isConnected) return;
    if (document.activeElement !== focused.element) focused.element.focus({ preventScroll: true });
    if (focused.selection)
      try {
        (focused.element as HTMLInputElement).setSelectionRange(...focused.selection);
      } catch {
        /* not a text control */
      }
  };
}

function readSelection(
  control: HTMLInputElement | HTMLTextAreaElement
): [number, number, 'forward' | 'backward' | 'none'] | undefined {
  try {
    if (control.selectionStart === null || control.selectionEnd === null) return undefined;
    return [
      control.selectionStart,
      control.selectionEnd,
      (control.selectionDirection as 'forward' | 'backward' | 'none' | null) ?? 'none',
    ];
  } catch {
    return undefined;
  }
}
