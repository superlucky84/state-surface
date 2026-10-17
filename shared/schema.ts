import type { StandardSchema } from 'state-surface/server';

/**
 * A tiny Standard Schema builder for the demo. Real apps would use zod, valibot or arktype,
 * which implement the same interface; the engine depends on none of them (DESIGN 10.5).
 */
type Check<Input, Output> = {
  /** Type-only: what the browser may send. */
  readonly input?: Input;
  parse(value: unknown): { value: Output } | { message: string };
};
type InputOf<C> = C extends Check<infer I, unknown> ? I : never;
type OutputOf<C> = C extends Check<unknown, infer O> ? O : never;

/** A trimmed string (form fields are strings). */
export function text(options: { min?: number; max?: number } = {}): Check<string, string> {
  return {
    parse(value) {
      if (typeof value !== 'string') return { message: 'Expected text' };
      const trimmed = value.trim();
      if (options.min !== undefined && trimmed.length < options.min)
        return { message: options.min === 1 ? 'Required' : `At least ${options.min} characters` };
      if (options.max !== undefined && trimmed.length > options.max)
        return { message: `At most ${options.max} characters` };
      return { value: trimmed };
    },
  };
}

/** An integer; form fields arrive as strings and are converted. */
export function integer(
  options: { min?: number; max?: number } = {}
): Check<number | string, number> {
  return {
    parse(value) {
      const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
      if (typeof number !== 'number' || !Number.isInteger(number))
        return { message: 'Expected a whole number' };
      if (options.min !== undefined && number < options.min)
        return { message: `Must be at least ${options.min}` };
      if (options.max !== undefined && number > options.max)
        return { message: `Must be at most ${options.max}` };
      return { value: number };
    },
  };
}

/** A check that also accepts a missing value. */
export function optional<Input, Output>(
  check: Check<Input, Output>
): Check<Input | undefined, Output | undefined> {
  return {
    parse: value =>
      value === undefined || value === null ? { value: undefined } : check.parse(value),
  };
}

/** An object of checks: every field is validated and all issues are reported by path. */
export function object<Shape extends Record<string, Check<any, any>>>(
  shape: Shape
): StandardSchema<
  { [K in keyof Shape]: InputOf<Shape[K]> },
  { [K in keyof Shape]: OutputOf<Shape[K]> }
> {
  return {
    '~standard': {
      version: 1,
      vendor: 'state-surface-demo',
      validate(value) {
        const input = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
        const output: Record<string, unknown> = {};
        const issues: Array<{ message: string; path: string[] }> = [];
        for (const [key, check] of Object.entries(shape)) {
          const result = check.parse(input[key]);
          if ('message' in result) issues.push({ message: result.message, path: [key] });
          else output[key] = result.value;
        }
        return issues.length
          ? { issues }
          : { value: output as { [K in keyof Shape]: OutputOf<Shape[K]> } };
      },
    },
  };
}
