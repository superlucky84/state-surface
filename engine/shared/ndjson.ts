import type { StateFrame } from './protocol.js';

export type NdjsonParseError = {
  stage: 'decode' | 'stream' | 'flush';
  line: string;
  error: Error;
};

export type NdjsonParseErrorHandler = (event: NdjsonParseError) => void;

// ── Encode ──

export function encodeFrame(frame: StateFrame): string {
  return JSON.stringify(frame) + '\n';
}

export function encodeFrames(frames: StateFrame[]): string {
  return frames.map(encodeFrame).join('');
}

// ── Decode ──

/**
 * Parse a complete NDJSON string into frames.
 * Each non-empty line is parsed as one JSON frame.
 */
function parseLine(
  line: string,
  stage: NdjsonParseError['stage'],
  onParseError?: NdjsonParseErrorHandler
): StateFrame | null {
  try {
    return JSON.parse(line) as StateFrame;
  } catch (err) {
    onParseError?.({
      stage,
      line,
      error: err instanceof Error ? err : new Error(String(err)),
    });
    return null;
  }
}

export function decodeFrames(ndjson: string, onParseError?: NdjsonParseErrorHandler): StateFrame[] {
  const frames: StateFrame[] = [];
  for (const line of ndjson.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const frame = parseLine(trimmed, 'decode', onParseError);
    if (frame) {
      frames.push(frame);
    }
  }
  return frames;
}

/**
 * Incremental NDJSON parser for streaming chunks.
 * Handles chunks that split across line boundaries.
 */
export function createNdjsonParser(
  onFrame: (frame: StateFrame) => void,
  onParseError?: NdjsonParseErrorHandler
) {
  let buffer = '';

  return {
    push(chunk: string) {
      buffer += chunk;

      const lines = buffer.split('\n');
      // Keep the last (possibly incomplete) line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 0) {
          const frame = parseLine(trimmed, 'stream', onParseError);
          if (frame) {
            onFrame(frame);
          }
        }
      }
    },

    flush() {
      const trimmed = buffer.trim();
      if (trimmed.length > 0) {
        const frame = parseLine(trimmed, 'flush', onParseError);
        if (frame) {
          onFrame(frame);
        }
      }
      buffer = '';
    },
  };
}
