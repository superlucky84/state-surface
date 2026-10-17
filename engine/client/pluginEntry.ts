/// <reference path="./virtual.d.ts" />
import plugins from 'virtual:state-surface/plugins';
import { PluginHost, type PagePluginEntry, type PluginDefinition } from './pluginHost.js';

/** Plugin host chunk: PluginHost and the plugin id → chunk map (pages that declare plugins). */
export function createPluginHost(
  entries: PagePluginEntry[],
  report: (error: unknown, detail: Record<string, unknown>) => void
): PluginHost {
  return new PluginHost(
    entries,
    plugins as Record<string, (() => Promise<PluginDefinition>) | undefined>,
    report
  );
}
