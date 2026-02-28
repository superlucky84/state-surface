/**
 * StateSurface Public API
 *
 * Users import from 'state-surface' — this barrel re-exports
 * the framework APIs needed in routes/, layouts/, and shared/.
 */

// Template
export { defineTemplate } from './shared/templateRegistry.js';
export type { TemplateModule } from './shared/templateRegistry.js';

// Transition
export { defineTransition } from './server/transition.js';
export type { TransitionHandler } from './server/transition.js';

// Base path
export { prefixPath, getBasePath } from './shared/basePath.js';

// Route module
export type { RouteModule, BootConfig } from './shared/routeModule.js';

// Protocol
export type { StateFrame } from './shared/protocol.js';
