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
  // Headers the browser runtime sends (DESIGN 6.2): build id and page manifest id.
  const surface = { 'x-surface-build': 'conformance-build', 'x-surface-page': 'index' };
  const post = (name, body = {}, headers = {}) =>
    fetch(url('/transition/' + name), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...surface, ...headers },
      body: JSON.stringify(body),
    });
  const bootstrapOf = html => JSON.parse(html.match(/id="__SURFACE__"[^>]*>(.*?)<\/script>/s)[1]);
  await check('SSR, context env, cookies, nonce and middleware', async () => {
    const response = await fetch(url('/'), {
      headers: { cookie: 'lang=ko', 'x-trace-id': 'accepted' },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-middleware'), 'after');
    const html = await response.text();
    assert.ok(
      html.startsWith('<!doctype html><html><head><!--ss:head--><title data-ss="">Fixture</title>')
    );
    assert.ok(html.includes('<!--/ss:head--></head><body><!--ss:body-->'));
    assert.ok(html.endsWith('<!--/ss:body--></body></html>'));
    assert.ok(html.includes('<p>Hello</p>'));
    assert.ok(!html.includes('data-ssr-hash'));
    const bootstrap = bootstrapOf(html);
    assert.equal(bootstrap.buildId, 'conformance-build');
    assert.equal(bootstrap.pageId, 'index');
    assert.equal(bootstrap.basePath, '/demo');
    const props = bootstrap.slots.find(slot => slot.id === 'fixture:state').props;
    assert.equal(props.runtime, runtime);
    assert.equal(props.cookie, 'ko');
    assert.match(props.nonce, /^[a-f0-9]{36}$/);
    const entry = html.match(
      /<script type="module" src="([^"]+)" nonce="([^"]+)" data-ss><\/script><!--\/ss:head-->/
    );
    assert.ok(entry && entry[1].endsWith('/assets/probe-12345678.js'));
    assert.equal(entry[2], props.nonce);
  });
  await check('static page without engine script', async () => {
    const html = await (await fetch(url('/static'))).text();
    assert.ok(html.includes('<h-state name="fixture:state"><p>static</p></h-state>'));
    assert.ok(!html.includes('<script'));
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
    assert.deepEqual(
      frames.map(frame => [frame.type, frame.reset === true]),
      [
        ['patch', true],
        ['patch', false],
        ['done', false],
      ]
    );
    assert.deepEqual(frames[1].ops, [{ slot: 'value', props: { n: 2 } }]);
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
    // async function transition: one JSON response, server slot rendered to HTML.
    const { frames } = await response.json();
    assert.equal(frames[0].ops[0].slot, 'fixture:html');
    assert.match(frames[0].ops[0].html, /("|&quot;)q("|&quot;):("|&quot;)test/);
    assert.ok(frames[0].ops[0].html.includes(runtime));
    assert.deepEqual(frames[1], { type: 'done' });
    assert.equal((await post('echo', { q: 'x'.repeat(2000) })).status, 413);
    assert.equal(
      (await fetch(url('/transition/echo'), { method: 'POST', headers: surface, body: '{' }))
        .status,
      400
    );
    assert.equal((await post('missing')).status, 404);
  });
  await check('build mismatch 409, page header 400, production error frame', async () => {
    const stale = await post('echo', {}, { 'x-surface-build': 'old-build' });
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).buildId, 'conformance-build');
    assert.equal((await post('echo', {}, { 'x-surface-page': 'unknown' })).status, 400);
    const failed = await post('fail');
    const lines = (await failed.text()).trim().split('\n').map(JSON.parse);
    assert.deepEqual(lines.at(-1), {
      type: 'error',
      message: 'Transition failed',
      slot: 'system:error',
      html: '<p class="error">Transition failed</p>',
    });
  });
  await check('deferred server slot token and island endpoint', async () => {
    const html = await (await fetch(url('/deferred'))).text();
    assert.ok(html.includes('<h-state name="fixture:defer"><p>Loading</p></h-state>'));
    assert.ok(!html.includes('secret-label'), 'props stay inside the encrypted token');
    const [slot] = bootstrapOf(html).slots;
    assert.equal(slot.component, 'conformance/Deferred.tsx#default');
    const island = url(`/_surface/island/${encodeURIComponent(slot.component)}?p=${slot.defer}`);
    const response = await fetch(island, {
      headers: { cookie: 'lang=ko', 'x-surface-build': 'conformance-build' },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'public, max-age=60');
    assert.equal(response.headers.get('x-route-kind'), 'island');
    assert.deepEqual(await response.json(), {
      html: `<p class="deferred">secret-label@${runtime}:ko</p>`,
    });
    const post = await fetch(url(`/_surface/island/${encodeURIComponent(slot.component)}`), {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: slot.defer,
    });
    assert.equal(post.headers.get('cache-control'), 'private, no-store');
    assert.equal((await fetch(island.replace(/p=.{4}/, 'p=AAAA'))).status, 400);
    assert.equal((await fetch(island, { headers: { 'x-surface-build': 'old' } })).status, 409);
  });
  await check(
    'typed transition: form bodies, 422 validation, PRG 303 and one-time flash',
    async () => {
      const form = new URLSearchParams([
        ['name', 'Ada'],
        ['tag', 'a'],
        ['tag', 'b'],
      ]);
      const ok = await fetch(url('/transition/form/submit'), {
        method: 'POST',
        headers: { ...surface, 'content-type': 'application/x-www-form-urlencoded' },
        body: form,
      });
      assert.equal(ok.status, 200);
      const [patch] = (await ok.json()).frames;
      assert.equal(patch.ops[0].html, '<p class="html">{"name":"Ada","tags":["a","b"]}</p>');
      const invalid = await fetch(url('/transition/form/submit'), {
        method: 'POST',
        headers: { ...surface, 'content-type': 'application/json' },
        body: '{"name":""}',
      });
      assert.equal(invalid.status, 422);
      const [frame] = (await invalid.json()).frames;
      assert.equal(frame.kind, 'validation');
      assert.deepEqual(frame.fieldErrors, { name: ['Required'] });

      const multipart = new FormData();
      multipart.append('name', 'Grace');
      multipart.append('upload', new Blob(['data'], { type: 'text/plain' }), 'a.txt');
      multipart.append('_redirect', '/demo/flash');
      const redirect = await fetch(url('/_surface/action/form/submit'), {
        method: 'POST',
        headers: { origin },
        body: multipart,
        redirect: 'manual',
      });
      assert.equal(redirect.status, 303);
      assert.equal(redirect.headers.get('location'), '/demo/flash');
      const cookie = redirect.headers
        .getSetCookie()
        .find(value => value.startsWith('surface_flash='));
      assert.match(cookie, /HttpOnly/);
      const page = await fetch(url('/flash'), { headers: { cookie: cookie.split(';')[0] } });
      const html = await page.text();
      // Files never reach the flash; only the opted-in text field comes back.
      assert.ok(
        html.includes('<pre class="flash">{"ok":true,"input":{"name":"Grace"}}</pre>'),
        html
      );
      assert.ok(
        page.headers.getSetCookie().some(value => /^surface_flash=;.*Max-Age=0/.test(value))
      );
      const external = await fetch(url('/_surface/action/form/submit'), {
        method: 'POST',
        headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
        body: 'name=x&_redirect=//evil.test/',
        redirect: 'manual',
      });
      assert.equal(external.headers.get('location'), '/demo/');
    }
  );
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
        { method: 'POST', agent: false, headers: surface },
        response => {
          response.once('data', chunk => {
            try {
              assert.equal(response.statusCode, 200);
              assert.ok(chunk.toString().includes('\"type\":\"patch\"'));
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
