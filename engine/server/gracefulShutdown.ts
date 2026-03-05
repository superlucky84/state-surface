import type { Server } from 'node:http';

type ProcessLike = Pick<NodeJS.Process, 'on' | 'removeListener' | 'exit'>;

export interface GracefulShutdownOptions {
  signals?: NodeJS.Signals[];
  forceExitTimeoutMs?: number;
  processLike?: ProcessLike;
}

/**
 * Install graceful shutdown handlers for SIGTERM/SIGINT.
 * Returns a cleanup function that unregisters signal listeners.
 */
export function installGracefulShutdown(
  server: Pick<Server, 'close'>,
  options: GracefulShutdownOptions = {}
): () => void {
  const proc = options.processLike ?? process;
  const signals = options.signals ?? ['SIGTERM', 'SIGINT'];
  const forceExitTimeoutMs = options.forceExitTimeoutMs ?? 10_000;
  let shuttingDown = false;

  const handlers = new Map<NodeJS.Signals, () => void>();

  for (const signal of signals) {
    const handler = () => {
      if (shuttingDown) return;
      shuttingDown = true;

      const timeoutId = setTimeout(() => {
        proc.exit(1);
      }, forceExitTimeoutMs);

      server.close(() => {
        clearTimeout(timeoutId);
        proc.exit(0);
      });
    };

    handlers.set(signal, handler);
    proc.on(signal, handler);
  }

  return () => {
    for (const [signal, handler] of handlers) {
      proc.removeListener(signal, handler);
    }
  };
}
