/**
 * StateSurface Public API
 *
 * Users import from 'state-surface' for common APIs shared by
 * both server and client code.
 */

// Page tree
export { Slot, Boot } from './shared/surfaceTree.js';
export type { SlotProps, BootProps, SlotMode, Capability } from './shared/surfaceTree.js';

// Base path
export { prefixPath, getBasePath } from './shared/basePath.js';

// Actions (typed transitions, JS-less forms)
export { actionUrl } from './shared/actions.js';
export type { ActionName, ActionParams } from './shared/actions.js';

// Protocol
export type { StateFrame, TransitionResult, UiPatch } from './shared/protocol.js';
