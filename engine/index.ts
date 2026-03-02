/**
 * StateSurface Public API
 *
 * Users import from 'state-surface' for common APIs shared by
 * both server and client code.
 */

// Template
export { defineTemplate } from './shared/templateRegistry.js';
export type { TemplateModule } from './shared/templateRegistry.js';

// Base path
export { prefixPath, getBasePath } from './shared/basePath.js';

// Route module
export type { RouteModule, BootConfig } from './shared/routeModule.js';

// Protocol
export type { StateFrame } from './shared/protocol.js';
