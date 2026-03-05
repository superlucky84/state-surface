import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createLogger } from './logger.js';
import { createApp } from './index.js';

function sinkSpy() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createLogger', () => {
  it('suppresses debug logs in production by default', () => {
    const sink = sinkSpy();
    const logger = createLogger({ nodeEnv: 'production', sink });

    logger.debug('debug');
    logger.info('info');

    expect(sink.debug).not.toHaveBeenCalled();
    expect(sink.info).toHaveBeenCalledWith('info');
  });

  it('emits debug logs in development by default', () => {
    const sink = sinkSpy();
    const logger = createLogger({ nodeEnv: 'development', sink });

    logger.debug('debug');

    expect(sink.debug).toHaveBeenCalledWith('debug');
  });

  it('respects explicit log level thresholds', () => {
    const sink = sinkSpy();
    const logger = createLogger({ nodeEnv: 'development', level: 'warn', sink });

    logger.info('info');
    logger.warn('warn');
    logger.error('error');

    expect(sink.info).not.toHaveBeenCalled();
    expect(sink.warn).toHaveBeenCalledWith('warn');
    expect(sink.error).toHaveBeenCalledWith('error');
  });
});

describe('request logging middleware', () => {
  it('logs method, url and status code', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { app } = await createApp({ logLevel: 'info' });

    await request(app).get('/search').expect(200);

    const lines = infoSpy.mock.calls.map(args => String(args[0]));
    expect(lines.some(line => line.includes('[HTTP] GET /search 200'))).toBe(true);
  });
});
