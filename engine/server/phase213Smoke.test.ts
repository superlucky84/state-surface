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
  it('guide page renders a mobile-friendly toc layout', async () => {
    const guide = await request(app).get('/guide/quickstart');
    expect(guide.status).toBe(200);
    expect(guide.text).toContain('flex-col gap-4 pb-8 pt-4 md:flex-row md:gap-8 md:pt-6');
    expect(guide.text).toContain('w-full md:w-56 md:shrink-0');
    expect(guide.text).toContain('space-y-2 md:sticky md:top-6 md:space-y-1');
    expect(guide.text).toContain('data-guide-nav-scroll');
    expect(guide.text).toContain('data-guide-active="true"');
    expect(guide.text).toContain(
      '-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:block md:space-y-1 md:overflow-visible md:px-0 md:pb-0'
    );
    expect(guide.text).toContain(
      'inline-flex w-auto whitespace-nowrap rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white md:block md:w-full'
    );
  });

  it('search/actions/chat pages expose declarative data-action bindings', async () => {
    const search = await request(app).get('/examples/search');
    expect(search.status).toBe(200);
    expect(search.text).toContain('data-action="search"');
    expect(search.text).toContain('data-pending-targets="search:results"');

    const actions = await request(app).get('/examples/actions');
    expect(actions.status).toBe(200);
    expect(actions.text).toContain('data-action="action-demo"');
    expect(actions.text).toContain('data-pending-targets="actions:log"');

    const chat = await request(app).get('/examples/chat');
    expect(chat.status).toBe(200);
    expect(chat.text).toContain('data-action="chat"');
    expect(chat.text).toContain('data-pending-targets="chat:messages,chat:current,chat:typing"');
  });

  it('major pages switch between en/ko via lang cookie', async () => {
    const routes = [
      '/',
      '/guide/surface',
      '/examples/streaming',
      '/examples/actions',
      '/examples/search',
      '/examples/chat',
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

    const routes = ['/examples/search', '/examples/actions', '/examples/chat'];
    for (const route of routes) {
      const res = await request(app).get(route).set('Cookie', cookiePair);
      expect(res.status).toBe(200);
      const state = readStateScript(res.text);
      expect(state['page:header']?.lang).toBe('ko');
    }
  });
});
