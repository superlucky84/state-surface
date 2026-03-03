import express from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createRouteHandler } from './routeHandler.js';
import type { RouteModule } from '../shared/routeModule.js';

function makeFailingRoute(): RouteModule {
  return {
    layout() {
      throw new Error('secret-internal-message');
    },
  } as RouteModule;
}

describe('createRouteHandler error responses', () => {
  it('hides SSR internals in production mode', async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const app = express();
      app.get('/broken', createRouteHandler(makeFailingRoute()));

      const res = await request(app).get('/broken');

      expect(res.status).toBe(500);
      expect(res.headers['content-type']).toContain('text/html; charset=utf-8');
      expect(res.text).toBe('Internal Server Error');
      expect(res.text).not.toContain('secret-internal-message');
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
  });
});
