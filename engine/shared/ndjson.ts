import type { StateFrame } from './protocol.js';

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
export function decodeFrames(ndjson: string): StateFrame[] {
  return ndjson
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => JSON.parse(line) as StateFrame);
}

/**
 * Incremental NDJSON parser for streaming chunks.
 * Handles chunks that split across line boundaries.
 */
export function createNdjsonParser(onFrame: (frame: StateFrame) => void) {
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
          onFrame(JSON.parse(trimmed) as StateFrame);
        }
      }
    },

    flush() {
      const trimmed = buffer.trim();
      if (trimmed.length > 0) {
        onFrame(JSON.parse(trimmed) as StateFrame);
      }
      buffer = '';
    },
  };
}
