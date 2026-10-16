import { getBasePath } from '../shared/basePath.js';

/**
 * Declarative action invocation read from a DOM event. Shared by the loader (which captures
 * the first click/submit before the action runtime has loaded) and the runtime delegation,
 * so both snapshot the same params at event time (DC-04 ⑦, V-13).
 */
export interface ActionInvocation {
  action: string;
  params: Record<string, unknown>;
  pendingTargets?: string[];
  /** `data-view-transition` on the action element (DC-06). */
  viewTransition?: boolean;
  /** A form with files is sent as multipart, like the JS-less submission. */
  form?: FormData;
}

export type ActionError = (message: string) => void;

/** Events that already ran an action (loader capture and runtime delegation share them). */
const handled = new WeakSet<Event>();

/**
 * The transition a form posts to without `data-action`: `<form method="post"
 * action={actionUrl(name)}>` (or the submitter's `formaction`). JavaScript turns the PRG
 * submission into a streamed transition (DC-22 ③).
 */
function formActionName(form: HTMLFormElement, submitter?: HTMLElement | null) {
  const method = (submitter?.getAttribute('formmethod') ?? form.getAttribute('method') ?? 'get')
    .trim()
    .toLowerCase();
  if (method !== 'post') return undefined;
  const raw = submitter?.getAttribute('formaction') ?? form.getAttribute('action');
  if (!raw) return undefined;
  let url: URL;
  try {
    url = new URL(raw, location.href);
  } catch {
    return undefined;
  }
  const prefix = `${getBasePath()}/_surface/action/`;
  if (url.origin !== location.origin || !url.pathname.startsWith(prefix)) return undefined;
  try {
    const name = url.pathname.slice(prefix.length).split('/').map(decodeURIComponent).join('/');
    return name || undefined;
  } catch {
    return undefined;
  }
}

/**
 * The element whose action this event triggers, if any. Events a component already
 * handled (`preventDefault()`) and events that already ran an action are skipped, so one
 * event runs at most one action (DESIGN 7장 event priority).
 */
export function actionTarget(event: Event): HTMLElement | undefined {
  if (event.defaultPrevented || handled.has(event)) return undefined;
  const target = event.target;
  if (event.type === 'submit') {
    if (!(target instanceof HTMLFormElement)) return undefined;
    if (target.hasAttribute('data-action')) return target;
    return formActionName(target, (event as SubmitEvent).submitter) ? target : undefined;
  }
  if (!(target instanceof Element)) return undefined;
  const element = target.closest<HTMLElement>('[data-action]');
  // Forms are handled by the submit event to avoid duplicate triggers.
  return element && !(element instanceof HTMLFormElement) ? element : undefined;
}

export function readAction(
  element: HTMLElement,
  event: Event,
  onError: ActionError = () => {}
): ActionInvocation | undefined {
  const submitter = (event as SubmitEvent).submitter;
  const action =
    element.getAttribute('data-action')?.trim() ||
    (element instanceof HTMLFormElement ? formActionName(element, submitter) : undefined);
  if (!action) return undefined;
  handled.add(event);
  const dataParams = parseDataParams(element, action, onError);
  const invocation: ActionInvocation = { action, params: dataParams };
  if (element instanceof HTMLFormElement) {
    const data = submitter ? new FormData(element, submitter) : new FormData(element);
    const files = [...data.values()].some(
      value => typeof value !== 'string' && (value.size > 0 || value.name !== '')
    );
    if (files) {
      for (const [key, value] of Object.entries(dataParams))
        if (!data.has(key))
          data.append(key, typeof value === 'string' ? value : JSON.stringify(value));
      invocation.form = data;
    } else invocation.params = { ...dataParams, ...formToParams(data) };
  }
  const pendingTargets = parsePendingTargets(element);
  if (pendingTargets) invocation.pendingTargets = pendingTargets;
  if (element.hasAttribute('data-view-transition')) invocation.viewTransition = true;
  return invocation;
}

function parseDataParams(element: HTMLElement, action: string, onError: ActionError) {
  const raw = element.getAttribute('data-params');
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      return parsed as Record<string, unknown>;
    onError(`data-params for "${action}" must be a JSON object`);
  } catch {
    onError(`Invalid data-params JSON for "${action}"`);
  }
  return {};
}

function parsePendingTargets(element: HTMLElement): string[] | undefined {
  const raw = element.getAttribute('data-pending-targets');
  if (!raw) return undefined;
  const parsed = raw
    .split(',')
    .map(name => name.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : undefined;
}

/** Same name more than once → array, like the server's form parsing (DESIGN 10.5). */
function formToParams(data: FormData) {
  const params: Record<string, unknown> = {};
  for (const [key, value] of data.entries()) {
    const normalized = typeof value === 'string' ? value : value.name;
    const current = params[key];
    if (current === undefined) params[key] = normalized;
    else if (Array.isArray(current)) current.push(normalized);
    else params[key] = [current, normalized];
  }
  return params;
}
