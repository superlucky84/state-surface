import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

export async function scenarios(origin, runtime) {
  let count = 0;
  const check = async (name, run) => {
    await run();
    count++;
    console.log(`PASS ${runtime}: ${name}`);
  };
  const url = path => origin + '/demo' + path;
  const post = (name, body = {}, headers = {}) =>
    fetch(url('/transition/' + name), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  await check('SSR, context env, cookies, nonce and middleware', async () => {
    const response = await fetch(url('/'), {
      headers: { cookie: 'lang=ko', 'x-trace-id': 'accepted' },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-middleware'), 'after');
    const html = await response.text();
    assert.ok(html.startsWith('<!doctype html><html><head><!--ss:head--><title>Fixture</title>'));
    assert.ok(html.includes('<!--/ss:head--></head><body><!--ss:body-->'));
    assert.ok(html.endsWith('<!--/ss:body--></body></html>'));
    assert.ok(html.includes('<p>Hello</p>'));
    assert.ok(!html.includes('data-ssr-hash'));
    const states = JSON.parse(html.match(/id="__STATE__"[^>]*>(.*?)<\/script>/s)[1]);
    assert.equal(states['fixture:state'].runtime, runtime);
    assert.equal(states['fixture:state'].cookie, 'ko');
    assert.match(states['fixture:state'].nonce, /^[a-f0-9]{36}$/);
    const entry = html.match(
      /<script type="module" src="([^"]+)" nonce="([^"]+)"><\/script><!--\/ss:head-->/
    );
    assert.ok(entry && entry[1].endsWith('/assets/probe-12345678.js'));
    assert.equal(entry[2], states['fixture:state'].nonce);
  });
  await check('dynamic decoded params, HEAD, 404 and mount boundary', async () => {
    assert.ok((await (await fetch(url('/dynamic/hello%20world'))).text()).includes('hello world'));
    const head = await fetch(url('/'), { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal((await fetch(url('/missing'))).status, 404);
    assert.equal((await fetch(origin + '/demolition/')).status, 404);
  });
  await check('early middleware', async () => {
    const response = await fetch(url('/early'));
    assert.equal(response.status, 202);
    assert.equal(response.headers.get('x-early'), 'yes');
    assert.equal(await response.text(), 'early');
  });
  await check('progressive NDJSON and first-frame cookies', async () => {
    const response = await post('stream');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /ndjson/);
    const cookies = response.headers.getSetCookie();
    assert.equal(cookies.length, 2);
    assert.ok(cookies.every(value => value.includes('Path=/demo')));
    assert.ok(!cookies.some(value => value.includes('late=')));
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let firstAt;
    const start = performance.now();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (firstAt === undefined && text.includes('\n')) {
        firstAt = performance.now();
        assert.ok(!text.includes('"n":2'), 'first frame must arrive separately');
      }
    }
    const frames = text.trim().split('\n').map(JSON.parse);
    assert.equal(frames.length, 3);
    assert.equal(frames[2].type, 'done');
    assert.ok(performance.now() - firstAt >= 70, 'stream must not buffer until completion');
  });
  await check('CSRF, JSON, headers and body limit', async () => {
    assert.equal((await post('echo', {}, { origin: 'https://evil.test' })).status, 403);
    assert.equal((await post('echo', {}, { 'sec-fetch-site': 'cross-site' })).status, 403);
    const response = await post(
      'echo',
      { q: 'test' },
      { origin: new URL(origin).origin, 'x-trace-extra': 'permitted' }
    );
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes('test'));
    assert.equal((await post('echo', { q: 'x'.repeat(2000) })).status, 413);
    assert.equal((await fetch(url('/transition/echo'), { method: 'POST', body: '{' })).status, 400);
    assert.equal((await post('missing')).status, 404);
  });
  await check('SSR error hook and production masking', async () => {
    const response = await fetch(url('/failure'));
    assert.equal(response.status, 500);
    assert.equal(await response.text(), 'Internal Server Error');
    const report = await (await fetch(url('/errors'))).json();
    assert.ok(report.errors >= 1);
  });
  await check('abort closes generator', async () => {
    const before = await (await fetch(url('/aborts'))).json();
    await new Promise((resolve, reject) => {
      const request = httpRequest(
        url('/transition/abort'),
        { method: 'POST', agent: false },
        response => {
          response.once('data', chunk => {
            try {
              assert.equal(response.statusCode, 200);
              assert.ok(chunk.toString().includes('\"type\":\"state\"'));
            } catch (error) {
              reject(error);
            }
            request.destroy();
            resolve();
          });
          response.on('error', () => {});
        }
      );
      request.on('error', reject);
      request.end('{}');
    });
    let after;
    for (let i = 0; i < 30; i++) {
      after = await (await fetch(url('/aborts'))).json();
      if (after.aborted > before.aborted) break;
      await delay(25);
    }
    assert.equal(after.aborted, before.aborted + 1);
  });
  await check('static asset MIME, cache, HEAD and traversal boundary', async () => {
    const response = await fetch(url('/assets/probe-12345678.js'));
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /javascript/);
    assert.match(response.headers.get('cache-control'), /immutable/);
    assert.ok((await response.text()).includes('fixture asset'));
    const head = await fetch(url('/assets/probe-12345678.js'), { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal((await fetch(url('/assets/%2e%2e%2fprivate.txt'))).status, 404);
  });
  return count;
}
