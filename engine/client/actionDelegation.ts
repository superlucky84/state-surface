import type { StateSurface, TransitionOptions } from './stateSurface.js';

type ActionParams = Record<string, unknown>;

export function bindDeclarativeActions(surface: StateSurface): () => void {
  const onClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const actionEl = target.closest<HTMLElement>('[data-action]');
    if (!actionEl) return;

    // Forms are handled in submit listener to avoid duplicate triggers.
    if (actionEl instanceof HTMLFormElement) return;

    event.preventDefault();
    runAction(surface, actionEl);
  };

  const onSubmit = (event: SubmitEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLFormElement)) return;
    if (!target.matches('[data-action]')) return;

    event.preventDefault();
    runAction(surface, target, event);
  };

  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);

  return () => {
    document.removeEventListener('click', onClick);
    document.removeEventListener('submit', onSubmit);
  };
}

function runAction(surface: StateSurface, actionEl: HTMLElement, submitEvent?: SubmitEvent) {
  const action = actionEl.getAttribute('data-action')?.trim();
  if (!action) return;

  const baseParams = parseDataParams(actionEl, action, surface);
  const formParams =
    actionEl instanceof HTMLFormElement ? serializeForm(actionEl, submitEvent) : {};
  const params: ActionParams = { ...baseParams, ...formParams };

  const transitionOptions: TransitionOptions = {};
  const pendingTargets = parsePendingTargets(actionEl);
  if (pendingTargets) {
    transitionOptions.pendingTargets = pendingTargets;
  }

  surface.transition(action, params, transitionOptions);
}

function parseDataParams(
  actionEl: HTMLElement,
  action: string,
  surface: StateSurface
): ActionParams {
  const raw = actionEl.getAttribute('data-params');
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ActionParams;
    }
    surface.trace?.({
      kind: 'error',
      detail: `data-params for "${action}" must be a JSON object`,
    });
    return {};
  } catch {
    surface.trace?.({
      kind: 'error',
      detail: `Invalid data-params JSON for "${action}"`,
    });
    return {};
  }
}

function parsePendingTargets(actionEl: HTMLElement): string[] | undefined {
  const raw = actionEl.getAttribute('data-pending-targets');
  if (!raw) return undefined;

  const parsed = raw
    .split(',')
    .map(name => name.trim())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : undefined;
}

function serializeForm(form: HTMLFormElement, submitEvent?: SubmitEvent): ActionParams {
  const params: ActionParams = {};
  const submitter = submitEvent?.submitter;
  const formData = submitter ? new FormData(form, submitter as HTMLElement) : new FormData(form);

  for (const [key, value] of formData.entries()) {
    const normalized = typeof value === 'string' ? value : value.name;
    const current = params[key];

    if (current === undefined) {
      params[key] = normalized;
      continue;
    }

    if (Array.isArray(current)) {
      current.push(normalized);
      continue;
    }

    params[key] = [current, normalized];
  }

  return params;
}
