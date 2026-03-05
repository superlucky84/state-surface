export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

type LogSink = Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;

export interface Logger {
  level: LogLevel;
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

interface LoggerOptions {
  level?: LogLevel;
  nodeEnv?: string;
  sink?: LogSink;
}

function resolveDefaultLevel(nodeEnv: string | undefined): LogLevel {
  if (nodeEnv === 'production') return 'info';
  if (nodeEnv === 'test') return 'warn';
  return 'debug';
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? resolveDefaultLevel(options.nodeEnv ?? process.env.NODE_ENV);
  const sink = options.sink ?? console;

  const shouldLog = (next: LogLevel) => LEVEL_RANK[next] >= LEVEL_RANK[level];

  return {
    level,
    debug(...args: unknown[]) {
      if (!shouldLog('debug')) return;
      sink.debug(...args);
    },
    info(...args: unknown[]) {
      if (!shouldLog('info')) return;
      sink.info(...args);
    },
    warn(...args: unknown[]) {
      if (!shouldLog('warn')) return;
      sink.warn(...args);
    },
    error(...args: unknown[]) {
      if (!shouldLog('error')) return;
      sink.error(...args);
    },
  };
}
