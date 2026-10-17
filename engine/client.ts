export { definePlugin } from './client/pluginHost.js';
export type {
  PluginDefinition,
  PluginSlotInfo,
  ActionEvent,
  SlotKind,
} from './client/pluginHost.js';
export { useAction } from './client/useAction.js';
export type { ActionHandle, UseActionOptions } from './client/useAction.js';
export { ActionError } from './client/actionError.js';
export type { ActionErrorKind, ActionResult } from './client/actionError.js';
export { navigate } from './client/runtimeAccess.js';
export type { NavigationDetail, NavigationDirection, NavigationTrigger } from './client/router.js';
