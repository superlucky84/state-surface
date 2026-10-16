import type { ActionResult, StateSurface, TransitionOptions } from './stateSurface.js';
import { actionTarget, readAction, type ActionInvocation } from './actionEvents.js';

/**
 * Declarative action binding: delegated `click`/`submit` listeners on the document (bubble
 * phase, so a component's `preventDefault()` wins). `data-action` elements and forms posting
 * to `actionUrl(name)` run through the same action runtime as `useAction`.
 */
export function bindDeclarativeActions(
  surface: StateSurface,
  root: Document = document
): () => void {
  const onEvent = (event: Event) => {
    const element = actionTarget(event);
    if (!element) return;
    event.preventDefault();
    const invocation = readAction(element, event, message =>
      surface.trace?.({ kind: 'error', detail: message })
    );
    if (invocation) void runAction(surface, invocation);
  };

  root.addEventListener('click', onEvent);
  root.addEventListener('submit', onEvent);

  return () => {
    root.removeEventListener('click', onEvent);
    root.removeEventListener('submit', onEvent);
  };
}

export function runAction(
  surface: StateSurface,
  invocation: ActionInvocation
): Promise<ActionResult> {
  const options: TransitionOptions = {};
  if (invocation.pendingTargets) options.pendingTargets = invocation.pendingTargets;
  if (invocation.viewTransition) options.viewTransition = true;
  if (invocation.form) options.form = invocation.form;
  return surface.transition(invocation.action, invocation.params, options);
}
