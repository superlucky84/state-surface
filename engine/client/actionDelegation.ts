import type { StateSurface, TransitionOptions } from './stateSurface.js';
import { actionTarget, readAction, type ActionInvocation } from './actionEvents.js';

export function bindDeclarativeActions(surface: StateSurface): () => void {
  const onEvent = (event: Event) => {
    const element = actionTarget(event);
    if (!element) return;
    event.preventDefault();
    const invocation = readAction(element, event, message =>
      surface.trace?.({ kind: 'error', detail: message })
    );
    if (invocation) runAction(surface, invocation);
  };

  document.addEventListener('click', onEvent);
  document.addEventListener('submit', onEvent);

  return () => {
    document.removeEventListener('click', onEvent);
    document.removeEventListener('submit', onEvent);
  };
}

export function runAction(surface: StateSurface, invocation: ActionInvocation) {
  const options: TransitionOptions = {};
  if (invocation.pendingTargets) options.pendingTargets = invocation.pendingTargets;
  if (invocation.viewTransition) options.viewTransition = true;
  return surface.transition(invocation.action, invocation.params, options);
}
