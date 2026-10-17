/// <reference path="./virtual.d.ts" />
import components from 'virtual:state-surface/islands';
import { ComponentHost } from './componentHost.js';

/**
 * Component host chunk: ComponentHost and the componentId → chunk map of the app. The loader
 * imports it only on pages with client slots or islands and for the action runtime (server
 * HTML can carry islands); the server modulepreloads it there, so it adds no round trip.
 */
export function createComponentHost(
  options: Omit<ConstructorParameters<typeof ComponentHost>[0], 'loaders'>
): ComponentHost {
  return new ComponentHost({ ...options, loaders: components });
}
