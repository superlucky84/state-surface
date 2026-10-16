/**
 * Declarative action invocation read from a DOM event. Shared by the loader (which captures
 * the first click/submit before the action runtime has loaded) and the runtime delegation,
 * so both snapshot the same params at event time (DC-04 ⑦).
 */
export interface ActionInvocation {
  action: string;
  params: Record<string, unknown>;
  pendingTargets?: string[];
}

export type ActionError = (message: string) => void;

/** The element whose `data-action` this event triggers, if any. */
export function actionTarget(event: Event): HTMLElement | undefined {
  const target = event.target;
  if (event.type === 'submit')
    return target instanceof HTMLFormElement && target.matches('[data-action]')
      ? target
      : undefined;
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
  const action = element.getAttribute('data-action')?.trim();
  if (!action) return undefined;
  const formParams =
    element instanceof HTMLFormElement ? serializeForm(element, event as SubmitEvent) : {};
  const invocation: ActionInvocation = {
    action,
    params: { ...parseDataParams(element, action, onError), ...formParams },
  };
  const pendingTargets = parsePendingTargets(element);
  if (pendingTargets) invocation.pendingTargets = pendingTargets;
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

function serializeForm(form: HTMLFormElement, submitEvent?: SubmitEvent) {
  const params: Record<string, unknown> = {};
  const submitter = submitEvent?.submitter;
  const formData = submitter ? new FormData(form, submitter as HTMLElement) : new FormData(form);
  for (const [key, value] of formData.entries()) {
    const normalized = typeof value === 'string' ? value : value.name;
    const current = params[key];
    if (current === undefined) params[key] = normalized;
    else if (Array.isArray(current)) current.push(normalized);
    else params[key] = [current, normalized];
  }
  return params;
}
