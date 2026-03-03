import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './index.js';
import { transitionHooks } from '../../routes/_shared/hooks.js';

let app: any;

function readStateScript(html: string): Record<string, any> {
  const match = html.match(/<script id="__STATE__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error('__STATE__ script not found in SSR response');
  }
  return JSON.parse(match[1]);
}

beforeAll(async () => {
  ({ app } = await createApp({ hooks: transitionHooks }));
});

describe('phase 2-13 smoke coverage', () => {
  it('search/actions/chat pages expose declarative data-action bindings', async () => {
    const search = await request(app).get('/search');
    expect(search.status).toBe(200);
    expect(search.text).toContain('data-action="search"');
    expect(search.text).toContain('data-pending-targets="search:results"');

    const actions = await request(app).get('/features/actions');
    expect(actions.status).toBe(200);
    expect(actions.text).toContain('data-action="action-demo"');
    expect(actions.text).toContain('data-pending-targets="actions:log"');

    const chat = await request(app).get('/chat');
    expect(chat.status).toBe(200);
    expect(chat.text).toContain('data-action="chat"');
    expect(chat.text).toContain('data-pending-targets="chat:messages,chat:current,chat:typing"');
  });

  it('major pages switch between en/ko via lang cookie', async () => {
    const routes = [
      '/',
      '/guide/surface',
      '/features/streaming',
      '/features/actions',
      '/search',
      '/chat',
    ];

    for (const route of routes) {
      const en = await request(app).get(route);
      expect(en.status).toBe(200);
      const enState = readStateScript(en.text);
      expect(enState['page:header']?.lang).toBe('en');

      const ko = await request(app).get(route).set('Cookie', 'lang=ko');
      expect(ko.status).toBe(200);
      const koState = readStateScript(ko.text);
      expect(koState['page:header']?.lang).toBe('ko');
    }
  });

  it('lang cookie from switch-lang transition is preserved across MPA navigation', async () => {
    const switched = await request(app)
      .post('/transition/switch-lang')
      .send({ lang: 'ko', page: 'home' })
      .set('Content-Type', 'application/json');

    expect(switched.status).toBe(200);
    const setCookieHeader = switched.headers['set-cookie']?.[0];
    expect(setCookieHeader).toBeDefined();
    const cookiePair = (setCookieHeader ?? '').split(';')[0];
    expect(cookiePair).toBe('lang=ko');

    const routes = ['/search', '/features/actions', '/chat'];
    for (const route of routes) {
      const res = await request(app).get(route).set('Cookie', cookiePair);
      expect(res.status).toBe(200);
      const state = readStateScript(res.text);
      expect(state['page:header']?.lang).toBe('ko');
    }
  });
});
