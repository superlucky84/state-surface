declare const __SURFACE_DEV__: boolean;

/**
 * Development flag. The surface() plugin defines `__SURFACE_DEV__` (false in production
 * builds), so development-only checks and messages are dropped from the bundle.
 */
export const DEV: boolean = typeof __SURFACE_DEV__ === 'boolean' && __SURFACE_DEV__;
