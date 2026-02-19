import { describe, it, expect } from 'vitest';
import { encodeFrame, encodeFrames, decodeFrames, createNdjsonParser } from './ndjson.js';
import type { StateFrame } from './protocol.js';

describe('encodeFrame', () => {
  it('encodes a frame as JSON + newline', () => {
    const frame: StateFrame = { type: 'done' };
    expect(encodeFrame(frame)).toBe('{"type":"done"}\n');
  });
});

describe('encodeFrames', () => {
  it('encodes multiple frames as NDJSON', () => {
    const frames: StateFrame[] = [
      { type: 'state', states: { a: { x: 1 } } },
      { type: 'done' },
    ];
    const result = encodeFrames(frames);
    const lines = result.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual({ type: 'state', states: { a: { x: 1 } } });
    expect(JSON.parse(lines[1])).toEqual({ type: 'done' });
  });
});

describe('decodeFrames', () => {
  it('decodes NDJSON string to frames', () => {
    const ndjson =
      '{"type":"state","states":{"a":{"x":1}}}\n{"type":"done"}\n';
    const frames = decodeFrames(ndjson);
    expect(frames).toHaveLength(2);
    expect(frames[0].type).toBe('state');
    expect(frames[1].type).toBe('done');
  });

  it('handles trailing newline and empty lines', () => {
    const ndjson = '{"type":"done"}\n\n\n';
    expect(decodeFrames(ndjson)).toHaveLength(1);
  });
});

describe('createNdjsonParser (streaming)', () => {
  it('parses complete lines from chunks', () => {
    const received: StateFrame[] = [];
    const parser = createNdjsonParser(frame => received.push(frame));

    parser.push('{"type":"state","states":{"a":1}}\n');
    expect(received).toHaveLength(1);

    parser.push('{"type":"done"}\n');
    expect(received).toHaveLength(2);
    expect(received[1].type).toBe('done');
  });

  it('handles chunks split across line boundary', () => {
    const received: StateFrame[] = [];
    const parser = createNdjsonParser(frame => received.push(frame));

    parser.push('{"type":"sta');
    expect(received).toHaveLength(0);

    parser.push('te","states":{"a":1}}\n');
    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('state');
  });

  it('handles multiple frames in one chunk', () => {
    const received: StateFrame[] = [];
    const parser = createNdjsonParser(frame => received.push(frame));

    parser.push('{"type":"state","states":{"a":1}}\n{"type":"done"}\n');
    expect(received).toHaveLength(2);
  });

  it('flush processes remaining buffer', () => {
    const received: StateFrame[] = [];
    const parser = createNdjsonParser(frame => received.push(frame));

    parser.push('{"type":"done"}');
    expect(received).toHaveLength(0);

    parser.flush();
    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('done');
  });

  it('handles empty chunks', () => {
    const received: StateFrame[] = [];
    const parser = createNdjsonParser(frame => received.push(frame));

    parser.push('');
    parser.push('');
    parser.push('{"type":"done"}\n');
    expect(received).toHaveLength(1);
  });

  it('handles chunk split mid-JSON key', () => {
    const received: StateFrame[] = [];
    const parser = createNdjsonParser(frame => received.push(frame));

    parser.push('{"ty');
    parser.push('pe":"st');
    parser.push('ate","sta');
    parser.push('tes":{"a":{"v":1}}}\n');
    expect(received).toHaveLength(1);
    expect((received[0] as any).states.a.v).toBe(1);
  });

  it('handles multiple newlines between frames', () => {
    const received: StateFrame[] = [];
    const parser = createNdjsonParser(frame => received.push(frame));

    parser.push('{"type":"done"}\n\n\n{"type":"done"}\n');
    expect(received).toHaveLength(2);
  });

  it('handles chunk ending exactly at newline', () => {
    const received: StateFrame[] = [];
    const parser = createNdjsonParser(frame => received.push(frame));

    parser.push('{"type":"state","states":{"x":1}}\n');
    parser.push('{"type":"done"}\n');
    expect(received).toHaveLength(2);
  });

  it('handles Unicode in values across chunk boundary', () => {
    const received: StateFrame[] = [];
    const parser = createNdjsonParser(frame => received.push(frame));

    const fullJson = '{"type":"state","states":{"a":{"text":"한글테스트"}}}\n';
    const mid = Math.floor(fullJson.length / 2);
    parser.push(fullJson.slice(0, mid));
    parser.push(fullJson.slice(mid));
    expect(received).toHaveLength(1);
    expect((received[0] as any).states.a.text).toBe('한글테스트');
  });

  it('flush on empty buffer is safe', () => {
    const received: StateFrame[] = [];
    const parser = createNdjsonParser(frame => received.push(frame));
    parser.flush();
    expect(received).toHaveLength(0);
  });
});
