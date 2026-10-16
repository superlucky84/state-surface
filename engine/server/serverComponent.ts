import type { SurfaceContext } from './core/context.js';
import { SurfaceError } from '../shared/surfaceTree.js';

const SERVER_COMPONENT = Symbol.for('state-surface.serverComponent');

export interface ServerComponentDefinition<P, D> {
  /** Data step. Runs again for every render of the slot and is cancelled with ctx.signal. */
  load(props: P, ctx: SurfaceContext): D | Promise<D>;
  /** Synchronous render step receiving the loaded data. */
  render(data: D): unknown;
}

/** JSX props are the load input; calling it directly is a usage error. */
export type ServerComponent<P> = ((props: P) => never) & {
  readonly [SERVER_COMPONENT]: ServerComponentDefinition<P, any>;
};

/**
 * Split a server component into an async data step and a sync render step. It can only be
 * the child of a `mode="server"` Slot, where the engine awaits `load` before rendering.
 */
export function defineServerComponent<P extends object, D>(
  definition: ServerComponentDefinition<P, D>
): ServerComponent<P> {
  if (typeof definition?.load !== 'function' || typeof definition?.render !== 'function')
    throw new SurfaceError('defineServerComponent({ load, render }) needs both functions.');
  const component = () => {
    throw new SurfaceError(
      'A defineServerComponent component can only be the child of <Slot mode="server">.'
    );
  };
  Object.defineProperty(component, SERVER_COMPONENT, { value: definition });
  return component as unknown as ServerComponent<P>;
}

export function readServerComponent(
  component: unknown
): ServerComponentDefinition<any, any> | undefined {
  return typeof component === 'function'
    ? (component as Partial<ServerComponent<unknown>>)[SERVER_COMPONENT]
    : undefined;
}
