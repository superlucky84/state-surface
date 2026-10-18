/**
 * In-memory intake for the V-31 e2e: Sentry envelopes (the DSN points at this server),
 * Datadog RUM batches (`proxy` option), the trace headers of engine requests and the
 * server error hook. The test reads it with GET /intake/records.
 */
export interface IntakeRecord {
  kind: 'sentry' | 'datadog' | 'request' | 'server-error';
  path: string;
  /** Sentry: envelope items; Datadog: RUM events. */
  items?: Array<Record<string, unknown>>;
  headers?: Record<string, string | null>;
  message?: string;
}

export const records: IntakeRecord[] = [];

export const TRACE_HEADERS = [
  'sentry-trace',
  'baggage',
  'traceparent',
  'x-datadog-trace-id',
  'x-datadog-parent-id',
  'x-datadog-origin',
];

export const traceHeaders = (request: Request) =>
  Object.fromEntries(TRACE_HEADERS.map(name => [name, request.headers.get(name)]));

const json = (line: string) => {
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return { raw: line };
  }
};

/** Sentry envelope: a header line, then item header and payload lines. */
export function sentryItems(body: string) {
  const lines = body.split('\n').filter(Boolean);
  const items: Array<Record<string, unknown>> = [];
  for (let i = 1; i + 1 < lines.length; i += 2)
    items.push({ ...json(lines[i]), payload: json(lines[i + 1]) });
  return items;
}

/** Datadog RUM batch: one JSON event per line. */
export const datadogItems = (body: string) => body.split('\n').filter(Boolean).map(json);
