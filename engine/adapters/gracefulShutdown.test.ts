import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installGracefulShutdown } from './gracefulShutdown.js';

class MockProcess extends EventEmitter {
  exit = vi.fn();
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('installGracefulShutdown', () => {
  it('exits with code 0 when server closes after signal', () => {
    const mockProcess = new MockProcess();
    const close = vi.fn((cb: () => void) => cb());
    const cleanup = installGracefulShutdown({ close } as any, {
      processLike: mockProcess as any,
      forceExitTimeoutMs: 100,
    });

    mockProcess.emit('SIGTERM');

    expect(close).toHaveBeenCalledTimes(1);
    expect(mockProcess.exit).toHaveBeenCalledWith(0);

    cleanup();
  });

  it('forces exit with code 1 when close callback never runs', () => {
    vi.useFakeTimers();
    const mockProcess = new MockProcess();
    const close = vi.fn();
    const cleanup = installGracefulShutdown({ close } as any, {
      processLike: mockProcess as any,
      forceExitTimeoutMs: 25,
    });

    mockProcess.emit('SIGINT');
    vi.advanceTimersByTime(25);

    expect(close).toHaveBeenCalledTimes(1);
    expect(mockProcess.exit).toHaveBeenCalledWith(1);

    cleanup();
  });

  it('handles repeated signals idempotently', () => {
    const mockProcess = new MockProcess();
    const close = vi.fn((cb: () => void) => cb());
    const cleanup = installGracefulShutdown({ close } as any, {
      processLike: mockProcess as any,
      forceExitTimeoutMs: 100,
    });

    mockProcess.emit('SIGTERM');
    mockProcess.emit('SIGINT');
    mockProcess.emit('SIGTERM');

    expect(close).toHaveBeenCalledTimes(1);
    expect(mockProcess.exit).toHaveBeenCalledTimes(1);
    expect(mockProcess.exit).toHaveBeenCalledWith(0);

    cleanup();
  });
});
