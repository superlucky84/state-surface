import { prefixPath } from './basePath.js';

declare global {
  namespace StateSurface {
    /**
     * Transition name → params the browser may send. The build writes the entries into
     * `.state-surface/actions.d.ts` from `transitions/**` (DC-22 ⑤); without that file any
     * name and JSON object is accepted.
     */
    interface Actions {}
  }
}

type Registered = keyof StateSurface.Actions & string;

/** A transition name: the generated names, or any string before the first build. */
export type ActionName = [Registered] extends [never] ? string : Registered;

/** Params of `name`: its `input` schema input type, else any JSON object. */
export type ActionParams<Name extends string> = Name extends Registered
  ? StateSurface.Actions[Name]
  : Record<string, unknown>;

/** `/_surface/action/<name>` under BASE_PATH, with each path segment encoded. */
export function actionPath(name: string, basePath: string): string {
  return `${basePath}/_surface/action/${name.split('/').map(encodeURIComponent).join('/')}`;
}

/** `/transition/<name>` under BASE_PATH, with each path segment encoded. */
export function transitionPath(name: string, basePath: string): string {
  return `${basePath}/transition/${name.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Form `action` URL of a transition (DC-22 ③). The form works without JavaScript (PRG:
 * 303 back to the page, result in `ctx.flash(name)`); with JavaScript the engine runs the
 * transition as a stream instead.
 *
 * ```tsx
 * <form method="post" action={actionUrl('comment/add')}>…</form>
 * ```
 */
export function actionUrl(name: ActionName): string {
  return prefixPath(actionPath(name, ''));
}
