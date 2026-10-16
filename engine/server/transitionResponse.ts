import type { StateFrame, TransitionResult, WireFrame } from '../shared/protocol.js';
import { encodeFrame } from '../shared/ndjson.js';
import { LimitError, type RequestProjection, type TransitionLimits } from './projection.js';

const TIMER = Symbol('timer');

/** The handler stopped yielding for longer than the idle limit (DC-14 ③). */
export class IdleTimeoutError extends Error {
  constructor(ms: number) {
    super(`Transition idle for more than ${ms}ms`);
    this.name = 'IdleTimeoutError';
  }
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function'
  );
}

function race<T>(promise: Promise<T>, ms: number, signal: AbortSignal): Promise<T | typeof TIMER> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  return Promise.race([
    promise,
    new Promise<typeof TIMER>(resolve => {
      if (Number.isFinite(ms)) timer = setTimeout(() => resolve(TIMER), Math.max(0, ms));
    }),
    new Promise<never>((_, reject) => {
      onAbort = () => reject(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }),
  ]).finally(() => {
    clearTimeout(timer);
    if (onAbort) signal.removeEventListener('abort', onAbort);
  });
}

/**
 * Drive a transition handler result through the request projection and yield transport
 * frames. A generator streams; an async function result becomes one full frame. The engine
 * appends `done` when the handler returns (DESIGN 6.2/6.3). Throws on any failure.
 */
export async function* produceFrames(
  result: unknown,
  projection: RequestProjection,
  limits: TransitionLimits,
  signal: AbortSignal,
  now: () => number = () => performance.now()
): AsyncGenerator<WireFrame, void, unknown> {
  if (!isAsyncIterable(result)) {
    const value = (await race(Promise.resolve(result as TransitionResult), Infinity, signal)) as
      | Exclude<TransitionResult, void>
      | undefined;
    if (value && (value.states || value.ui)) {
      const frame: StateFrame = {
        type: 'state',
        states: value.states ?? {},
        ...(value.ui ? { ui: value.ui } : {}),
      };
      const patch = await projection.frame(frame);
      if (patch) yield patch;
    }
    const last = await projection.flush(true);
    if (last) yield last;
    yield { type: 'done' };
    return;
  }

  const iterator = result[Symbol.asyncIterator]();
  let finished = false;
  try {
    let pending: Promise<IteratorResult<unknown>> | undefined;
    let idleDeadline = now() + limits.idleTimeout;
    while (true) {
      if (signal.aborted) throw signal.reason;
      pending ??= iterator.next();
      const due = projection.nextDue();
      const wait = Math.min(idleDeadline, due ?? Infinity) - now();
      const winner = await race(pending, wait, signal);
      if (winner === TIMER) {
        if (now() >= idleDeadline) throw new IdleTimeoutError(limits.idleTimeout);
        const patch = await projection.flush();
        if (patch) yield patch;
        continue;
      }
      pending = undefined;
      idleDeadline = now() + limits.idleTimeout;
      if (winner.done) {
        finished = true;
        break;
      }
      const patch = await projection.frame(winner.value);
      if (patch) yield patch;
    }
    const last = await projection.flush(true);
    if (last) yield last;
    yield { type: 'done' };
  } finally {
    if (!finished) void Promise.resolve(iterator.return?.()).catch(() => {});
  }
}

/** Encode frames with the DC-14 line and response size limits (development warns at 80%). */
export function frameEncoder(
  limits: TransitionLimits,
  warnOnce: (key: string, text: string) => void
) {
  const encoder = new TextEncoder();
  let total = 0;
  return (frame: WireFrame): Uint8Array => {
    const bytes = encoder.encode(encodeFrame(frame));
    if (bytes.byteLength > limits.frameSize)
      throw new LimitError(`A transition frame exceeds ${limits.frameSize} bytes`);
    if (bytes.byteLength > limits.frameSize * 0.8)
      warnOnce('frame', '[transition] a frame is at 80% of the frame size limit');
    total += bytes.byteLength;
    if (total > limits.responseSize)
      throw new LimitError(`The transition response exceeds ${limits.responseSize} bytes`);
    if (total > limits.responseSize * 0.8)
      warnOnce('response', '[transition] the response is at 80% of the size limit');
    return bytes;
  };
}
