/**
 * Standard Schema v1 (https://standardschema.dev): the part the engine calls. zod, valibot,
 * arktype and others implement it; the engine depends on none of them (DESIGN 10.5).
 */

export interface StandardIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>;
}

export type StandardResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardIssue> };

export interface StandardSchema<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor?: string;
    readonly validate: (value: unknown) => StandardResult<Output> | Promise<StandardResult<Output>>;
    readonly types?: { readonly input: Input; readonly output: Output } | undefined;
  };
}

export type InferInput<S> = S extends { readonly '~standard': { readonly types?: infer T } }
  ? T extends { readonly input: infer I }
    ? I
    : unknown
  : unknown;
export type InferOutput<S> = S extends { readonly '~standard': { readonly types?: infer T } }
  ? T extends { readonly output: infer O }
    ? O
    : unknown
  : unknown;

/** Field path → messages (`body`, `items.0.name`; `` for the value itself). */
export type FieldErrors = Record<string, string[]>;

export function isStandardSchema(value: unknown): value is StandardSchema {
  const standard = (value as { '~standard'?: { version?: unknown; validate?: unknown } } | null)?.[
    '~standard'
  ];
  return !!standard && standard.version === 1 && typeof standard.validate === 'function';
}

function pathKey(path: StandardIssue['path']) {
  return (path ?? [])
    .map(segment => String(typeof segment === 'object' && segment !== null ? segment.key : segment))
    .join('.');
}

/** Validate and collect field errors; the output may be transformed by the schema. */
export async function validateSchema(
  schema: StandardSchema,
  value: unknown
): Promise<
  { ok: true; value: unknown } | { ok: false; fieldErrors: FieldErrors; message: string }
> {
  const result = await schema['~standard'].validate(value);
  if (!result.issues) return { ok: true, value: result.value };
  const fieldErrors: FieldErrors = {};
  for (const issue of result.issues) (fieldErrors[pathKey(issue.path)] ??= []).push(issue.message);
  const summary = Object.entries(fieldErrors)
    .map(([field, messages]) => (field ? `${field}: ${messages.join(', ')}` : messages.join(', ')))
    .join('; ');
  return { ok: false, fieldErrors, message: `Invalid input${summary ? ` (${summary})` : ''}` };
}
