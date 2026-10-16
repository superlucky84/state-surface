import type { WireFrame } from './protocol.js';

export type NdjsonParseError = {
  stage: 'decode' | 'stream' | 'flush' | 'limit';
  line: string;
  error: Error;
};

export type NdjsonParseErrorHandler = (event: NdjsonParseError) => void;

// ── Encode ──

export function encodeFrame(frame: WireFrame): string {
  return JSON.stringify(frame) + '\n';
}

export function encodeFrames(frames: WireFrame[]): string {
  return frames.map(encodeFrame).join('');
}

// ── Decode ──

function parseLine(
  line: string,
  stage: NdjsonParseError['stage'],
  onParseError?: NdjsonParseErrorHandler
): unknown {
  try {
    return JSON.parse(line);
  } catch (err) {
    onParseError?.({
      stage,
      line,
      error: err instanceof Error ? err : new Error(String(err)),
    });
    return undefined;
  }
}

/** Parse a complete NDJSON string; each non-empty line is one JSON frame. */
export function decodeFrames<T = WireFrame>(
  ndjson: string,
  onParseError?: NdjsonParseErrorHandler
): T[] {
  const frames: T[] = [];
  for (const line of ndjson.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const frame = parseLine(trimmed, 'decode', onParseError);
    if (frame !== undefined) frames.push(frame as T);
  }
  return frames;
}

/**
 * Incremental NDJSON parser for streaming chunks (lines may span chunks). With `maxLine`
 * (characters), an over-long line stops parsing: `onParseError` gets stage `limit` and
 * later chunks are ignored (DC-14 frame size limit).
 */
export function createNdjsonParser(
  onFrame: (frame: unknown) => void,
  onParseError?: NdjsonParseErrorHandler,
  options: { maxLine?: number } = {}
) {
  let buffer = '';
  let stopped = false;
  const limit = (line: string) => {
    stopped = true;
    buffer = '';
    onParseError?.({
      stage: 'limit',
      line: line.slice(0, 200),
      error: new Error(`NDJSON line exceeds ${options.maxLine} characters`),
    });
  };
  const emit = (line: string, stage: NdjsonParseError['stage']) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (options.maxLine !== undefined && trimmed.length > options.maxLine) return limit(trimmed);
    const frame = parseLine(trimmed, stage, onParseError);
    if (frame !== undefined) onFrame(frame);
  };

  return {
    push(chunk: string) {
      if (stopped) return;
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        emit(line, 'stream');
        if (stopped) return;
      }
      if (options.maxLine !== undefined && buffer.length > options.maxLine) limit(buffer);
    },
    flush() {
      if (!stopped) emit(buffer, 'flush');
      buffer = '';
    },
    get stopped() {
      return stopped;
    },
  };
}
