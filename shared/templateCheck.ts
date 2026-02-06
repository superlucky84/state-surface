import { checkTemplates } from './templateRegistry.js';

/**
 * Verify all required template names are registered.
 * Call at application startup after all registerTemplate() calls.
 *
 * Throws if any names are missing (fail-fast in development).
 * In production, logs a warning and returns the missing list.
 */
export function verifyTemplates(
  requiredNames: string[],
  options?: { strict?: boolean }
): string[] {
  const missing = checkTemplates(requiredNames);
  if (missing.length === 0) return [];

  const msg = `Missing templates: ${missing.join(', ')}`;

  if (options?.strict !== false) {
    throw new Error(msg);
  }

  console.warn(`[StateSurface] ${msg}`);
  return missing;
}
