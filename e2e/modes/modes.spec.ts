import { expect, test, type Browser, type Page } from '@playwright/test';

// V-01/V-05/V-06: entry selection and lazy chunks observed as real browser requests.
function scripts(page: Page) {
  const urls: string[] = [];
  page.on('request', request => {
    if (request.resourceType() === 'script' || request.url().endsWith('.js'))
      urls.push(new URL(request.url()).pathname);
  });
  return urls;
}
const named = (urls: string[], name: string) => urls.filter(url => url.includes(`/${name}-`));

test('static page loads no engine JavaScript, only the app entry', async ({ page }) => {
  const urls = scripts(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('h1')).toHaveText('Static page');
  await expect(page.locator('.secret')).toContainText('secret 1:');
  expect(await page.evaluate(() => document.documentElement.dataset.appEntry)).toBe('ran');
  expect(urls).toHaveLength(1);
  expect(named(urls, 'app-entry')).toHaveLength(1);
  // The app entry gets build, page and base path; no slots, boot or plugins (no engine).
  expect(
    await page.evaluate(() => JSON.parse(document.getElementById('__SURFACE__')!.textContent!))
  ).toEqual({ buildId: expect.any(String), pageId: 'index', basePath: '' });
});

test('actions without client components load the runtime but not Lithent; server HTML applies', async ({
  page,
}) => {
  const urls = scripts(page);
  await page.goto('/actions');
  await page.waitForLoadState('networkidle');
  expect(named(urls, 'surface-loader')).toHaveLength(1);
  expect(named(urls, 'runtime')).toHaveLength(1);
  expect(urls.filter(url => url.includes('lithent'))).toEqual([]);
  await page.getByRole('button', { name: 'Ping' }).click();
  await expect(page.locator('h-state[name="note"]')).toHaveClass(/pinged/);
  await expect(page.locator('.note')).toHaveText('static note');
  expect(urls.filter(url => url.includes('lithent'))).toEqual([]);
});

test('DESIGN 8.1: a strict client slot drops javascript: URLs and event attributes from frame props', async ({
  page,
}) => {
  await page.goto('/guard');
  await expect(page.locator('h-state[name="link"] a')).toHaveAttribute('href', '/guard');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Inject' }).click();
  const link = page.locator('h-state[name="link"] a');
  await expect(link).toHaveText('evil');
  expect(await link.getAttribute('href')).toBeNull();
  expect(await link.getAttribute('onclick')).toBeNull();
  expect(await page.locator('h-state[name="link"] iframe').getAttribute('src')).toBeNull();
  await link.click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();
});

test('stage 9: morphing a slot with media does not keep parsed documents alive', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/morph-media');
  await page.waitForLoadState('networkidle');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const audio = await page.locator('h-state[name="player"] audio').elementHandle();
  const morph = async (times: number) => {
    for (let i = 0; i < times; i++) {
      const before = await page.locator('.turn').textContent();
      await page.getByRole('button', { name: 'Morph' }).click();
      await expect(page.locator('.turn')).not.toHaveText(before!);
    }
  };
  // Blink frees documents some time after a V8 GC: sample until two reads agree.
  const documents = async () => {
    let previous = -1;
    for (let attempt = 0; attempt < 20; attempt++) {
      for (let i = 0; i < 3; i++) await cdp.send('HeapProfiler.collectGarbage');
      await page.waitForTimeout(250);
      const { metrics } = await cdp.send('Performance.getMetrics');
      const current = metrics.find(metric => metric.name === 'Documents')!.value;
      if (current === previous) return current;
      previous = current;
    }
    return previous;
  };
  await morph(3);
  const before = await documents();
  await morph(30);
  const after = await documents();
  console.log('morph documents', { before, after });
  expect(after).toBeLessThanOrEqual(before + 1);
  // The morph kept the media node itself.
  expect(await audio!.evaluate(node => node.isConnected)).toBe(true);
});

test('client:load hydrates at start; client:visible chunk waits until visible', async ({
  page,
}) => {
  const urls = scripts(page);
  await page.goto('/islands');
  await page.waitForLoadState('networkidle');
  expect(named(urls, 'lithent').length + named(urls, 'lithentBridge').length).toBe(2);
  expect(named(urls, 'Counter')).toHaveLength(1);
  expect(named(urls, 'Lazy')).toHaveLength(0);
  expect(named(urls, 'runtime')).toHaveLength(0);
  const eager = page.locator('button.eager');
  await eager.click();
  await expect(eager).toHaveText('eager:2');

  await page.locator('button.lazy').scrollIntoViewIfNeeded();
  await expect.poll(() => named(urls, 'Lazy').length).toBe(1);
  const lazy = page.locator('button.lazy');
  await expect(async () => {
    await lazy.click();
    await expect(lazy).not.toHaveText('lazy:10', { timeout: 200 });
  }).toPass();
});

test('DC-24/DC-32: prerendered pages pass the middleware and answer with the built HTML', async ({
  request,
}) => {
  const one = await request.get('/pre/one');
  expect(one.status()).toBe(200);
  expect(one.headers()).toMatchObject({
    'x-prerendered': 'true',
    'cache-control': 'public, max-age=0, must-revalidate',
    'content-security-policy': expect.stringContaining("script-src 'self'"),
  });
  const html = await one.text();
  expect(html).toContain('<h1 id="slug">one</h1>');
  expect(html).not.toMatch(/nonce=/);
  const etag = one.headers().etag;
  expect(etag).toMatch(/^"[0-9a-f]+"$/);
  expect((await request.get('/pre/one', { headers: { 'if-none-match': etag } })).status()).toBe(
    304
  );
  // An early middleware response replaces the built HTML; unlisted params are 404.
  expect((await request.get('/pre/two')).status()).toBe(401);
  expect((await request.get('/pre/two', { headers: { cookie: 'pass=1' } })).status()).toBe(200);
  expect((await request.get('/pre/other')).status()).toBe(404);
  const live = await request.get('/actions');
  expect(live.headers()['x-prerendered']).toBe('false');
});

test('DC-25: Markdown and MDX entries render on the server; an MDX island hydrates', async ({
  page,
}) => {
  const urls = scripts(page);
  const violations: string[] = [];
  page.on('console', message => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  await page.goto('/content/intro');
  await expect(page.locator('#toc a')).toHaveText(['Getting started', 'Next steps']);
  await expect(page.locator('#doc section#start h2')).toHaveText('Getting started');
  await expect(page.locator('#doc figcaption')).toHaveText('hello.ts');
  // Highlighted on the server: token spans without a highlighter script.
  await expect(page.locator('#doc code.language-ts .token.keyword')).toHaveText('const');
  await expect(page.locator('#doc aside.callout-tip')).toContainText('Markdown callout.');
  await expect(page.locator('#doc a[href="/pre/one"]')).toHaveCount(1);
  expect(urls.filter(url => /prism/i.test(url))).toEqual([]);

  await page.goto('/content/live');
  await expect(page.locator('#toc a')).toHaveText(['Live document', 'Counter island']);
  expect(
    await page.locator('#toc a').evaluateAll(links => links.map(a => a.getAttribute('href')))
  ).toEqual(['#live-document', '#counter-island']);
  await expect(page.locator('#doc h2#counter-island')).toHaveCount(1);
  await expect(page.locator('#doc aside.callout-tip')).toHaveText('MDX callout');
  await expect(page.locator('#doc .token.number')).toHaveText('42');
  const counter = page.locator('#doc h-island button.mdx');
  await expect(counter).toHaveText('mdx:5');
  await expect.poll(() => named(urls, 'Counter').length).toBeGreaterThan(0);
  await counter.click();
  await expect(counter).toHaveText('mdx:6');
  expect(violations).toEqual([]);
});

test('V-04: typing into a dormant island activates it and hydration keeps the edit', async ({
  page,
}) => {
  const urls = scripts(page);
  // Hold the component chunk so the edit happens between activation start and hydration.
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  await page.route('**/Editor-*.js', async route => {
    await gate;
    await route.continue();
  });
  await page.goto('/input');
  await page.waitForLoadState('domcontentloaded');
  expect(named(urls, 'Editor')).toHaveLength(0);
  const input = page.locator('#editor-input');
  await input.click();
  await expect.poll(() => named(urls, 'Editor').length).toBe(1);
  await input.fill('user edited');
  await input.evaluate((el: HTMLInputElement) => el.setSelectionRange(2, 5));
  release();
  // The component received the restored value through an input event.
  await expect(page.locator('#editor-count')).toHaveText('11');
  expect(await input.inputValue()).toBe('user edited');
  expect(
    await input.evaluate((el: HTMLInputElement) => [
      el.selectionStart,
      el.selectionEnd,
      document.activeElement === el,
    ])
  ).toEqual([2, 5, true]);
  // Typing replaces the restored selection, as it would have without the engine.
  await input.pressSequentially('!');
  expect(await input.inputValue()).toBe('us!edited');
  await expect(page.locator('#editor-count')).toHaveText('9');
});

test('plugins load only on pages that declare them and attach to their slots', async ({ page }) => {
  const islands = scripts(page);
  await page.goto('/islands');
  await page.waitForLoadState('networkidle');
  expect(named(islands, 'marker')).toHaveLength(0);

  const pluginPage = await page.context().newPage();
  const urls = scripts(pluginPage);
  await pluginPage.goto('/plugins');
  await expect(pluginPage.locator('h-state[name="box"]')).toHaveAttribute(
    'data-plugin',
    'attached'
  );
  expect(named(urls, 'marker')).toHaveLength(1);
  // No client component on this page: neither Lithent nor the action runtime nor debug UI.
  expect(urls.filter(url => /lithent|runtime|devOverlay/.test(url))).toEqual([]);
});

// ── Stage 6: client router, persist, prefetch, third-party coexistence ──

/** Main-frame document loads (a client navigation adds none). */
function documents(page: Page) {
  const urls: string[] = [];
  page.on('request', request => {
    if (request.resourceType() === 'document' && request.frame() === page.mainFrame())
      urls.push(new URL(request.url()).pathname + new URL(request.url()).search);
  });
  return urls;
}

/** Page errors fail the test at its end (router swaps must not throw). */
function errors(page: Page) {
  const list: string[] = [];
  page.on('pageerror', error => list.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') list.push(message.text());
  });
  return list;
}

async function heading(page: Page, text: string) {
  await expect(page.locator('h1')).toHaveText(text);
}

/** The engine-managed body region and head nodes, comparable across document and router loads. */
function snapshot(page: Page) {
  return page.evaluate(() => {
    const html = document.body.innerHTML;
    const body = html
      .slice(html.indexOf('<!--ss:body-->'), html.indexOf('<!--/ss:body-->'))
      // Router focus management makes <main> focusable (DESIGN 10.1 ⑤).
      .replace('<main tabindex="-1">', '<main>');
    const head = Array.from(document.head.querySelectorAll('[data-ss]'), el =>
      [el.tagName, el.getAttribute('src') ?? el.getAttribute('href') ?? el.textContent].join(' ')
    ).sort();
    return {
      body,
      head,
      title: document.title,
      lang: document.documentElement.lang,
      bootstrap: JSON.parse(document.getElementById('__SURFACE__')!.textContent!),
    };
  });
}

/** V-19: the same URL as a fresh document load, once `ready` holds. */
async function documentLoad(browser: Browser, path: string, ready: (page: Page) => Promise<void>) {
  const fresh = await browser.newPage();
  await fresh.goto(path);
  await expect(fresh.locator('h-state[name="box"]')).toHaveAttribute('data-plugin', 'attached');
  await ready(fresh);
  const result = await snapshot(fresh);
  await fresh.close();
  return result;
}

test('V-19: a client navigation renders what a document load renders; actions and boot run', async ({
  page,
  browser,
}) => {
  const failures = errors(page);
  const docs = documents(page);
  const prefetches: string[] = [];
  page.on('request', request => {
    if (request.headers()['purpose'] === 'prefetch')
      prefetches.push(new URL(request.url()).pathname);
  });
  await page.goto('/router/a');
  await expect(page.locator('h-state[name="box"]')).toHaveAttribute('data-plugin', 'attached');
  // V-22: hover prefetches once; the click uses the cached page.
  await page.locator('#to-b').hover();
  await expect.poll(() => prefetches).toEqual(['/router/b']);
  const transitions: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/transition/')) transitions.push(new URL(request.url()).pathname);
  });
  await page.locator('#to-b').click();
  await heading(page, 'Page B');
  await expect(page).toHaveURL(/\/router\/b$/);
  await expect(page.locator('h-state[name="note"]')).toHaveClass(/pinged/);
  await expect(page.locator('h-state[name="note"]')).not.toHaveAttribute('data-pending', '');
  expect(transitions).toEqual(['/transition/ping']);
  expect(prefetches).toEqual(['/router/b']);
  await expect(page.locator('h-state[name="box"]')).toHaveAttribute('data-plugin', 'attached');
  expect(await snapshot(page)).toEqual(
    await documentLoad(browser, '/router/b', async fresh => {
      await expect(fresh.locator('h-state[name="note"]')).toHaveClass(/pinged/);
      await expect(fresh.locator('h-state[name="note"]')).not.toHaveAttribute('data-pending', '');
      await expect(fresh.locator('button.kept')).toHaveText('kept:1');
    })
  );

  // Actions on the navigated page run through the same runtime.
  await page.getByRole('button', { name: 'Ping' }).click();
  await expect.poll(() => transitions).toEqual(['/transition/ping', '/transition/ping']);
  expect(await page.evaluate(() => document.title)).toBe('Router B');
  expect(docs).toEqual(['/router/a']);
  expect(failures).toEqual([]);
});

test('V-19/V-20: GET forms navigate with the query; back restores scroll, forward refetches', async ({
  page,
  browser,
}) => {
  const failures = errors(page);
  const docs = documents(page);
  await page.goto('/router/a');
  await page.locator('#bottom').scrollIntoViewIfNeeded();
  const scrolled = await page.evaluate(() => scrollY);
  expect(scrolled).toBeGreaterThan(1000);
  // A scripted click keeps the scroll position (Playwright's click scrolls the button into view).
  await page.evaluate(() => document.getElementById('search-go')!.click());
  await expect(page.locator('#results')).toHaveText('lithent:new');
  await expect(page).toHaveURL(/\/router\/search\?q=lithent&sort=new$/);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  // Focus moved to the new page's main content and the title was announced.
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('MAIN');
  await expect(page.locator('[aria-live="assertive"]')).toHaveText('Search');
  const search = '/router/search?q=lithent&sort=new';
  const searched = async (fresh: Page) => {
    await expect(fresh.locator('#results')).toHaveText('lithent:new');
  };
  expect(await snapshot(page)).toEqual(await documentLoad(browser, search, searched));

  await page.evaluate(() => history.back());
  await heading(page, 'Page A');
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(scrolled);
  expect(await snapshot(page)).toEqual(
    await documentLoad(browser, '/router/a', async fresh => {
      await expect(fresh.locator('button.kept')).toHaveText('kept:1');
    })
  );
  await page.evaluate(() => history.forward());
  await expect(page.locator('#results')).toHaveText('lithent:new');
  expect(await snapshot(page)).toEqual(await documentLoad(browser, search, searched));
  expect(docs).toEqual(['/router/a']);

  // Pages without the router load as documents (DC-18 ②).
  await page.locator('#to-plain').click();
  await heading(page, 'Plain page');
  expect(docs).toEqual(['/router/a', '/router/plain']);
  // Back to a client-navigated entry: the document loads again (headless Chromium has no
  // BFCache) and its router takes over the next link.
  await page.evaluate(() => history.back());
  await expect(page.locator('#results')).toHaveText('lithent:new');
  await page.locator('#to-a').click();
  await heading(page, 'Page A');
  expect(docs).toEqual(['/router/a', '/router/plain', search]);
  expect(failures).toEqual([]);
});

test('V-21: persisted iframe, media, island state and input focus/selection survive; unpaired ones are disposed', async ({
  page,
}) => {
  const failures = errors(page);
  await page.goto('/router/a');
  const kept = page.locator('button.kept');
  await expect(async () => {
    await kept.click();
    await expect(kept).toHaveText('kept:2', { timeout: 200 });
  }).toPass();
  await expect
    .poll(() => page.evaluate(() => (window as { frameLoads?: number }).frameLoads))
    .toBe(1);
  await page.locator('#field').fill('hello');
  // Muted playback is allowed without a user gesture; moveBefore keeps it playing.
  await page.evaluate(async () => {
    const audio = document.getElementById('player') as HTMLAudioElement;
    audio.muted = true;
    await audio.play();
  });
  await expect
    .poll(() =>
      page.evaluate(() => (document.getElementById('player') as HTMLAudioElement).currentTime)
    )
    .toBeGreaterThan(0.2);
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    w.oldFrame = document.getElementById('frame');
    w.oldPlayer = document.getElementById('player');
    w.oldField = document.getElementById('field');
    (document.getElementById('field') as HTMLInputElement).setSelectionRange(1, 3);
    // A scripted click keeps the focus in the input while the router navigates.
    document.getElementById('to-b')!.click();
  });
  await heading(page, 'Page B');
  expect(
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const field = document.getElementById('field') as HTMLInputElement;
      const audio = document.getElementById('player') as HTMLAudioElement;
      return {
        frame: document.getElementById('frame') === w.oldFrame,
        player: audio === w.oldPlayer && !audio.paused,
        moveBefore: 'moveBefore' in Element.prototype,
        loads: w.frameLoads,
        field: field === w.oldField,
        focused: document.activeElement === field,
        value: field.value,
        selection: [field.selectionStart, field.selectionEnd],
      };
    })
  ).toEqual({
    frame: true,
    player: true,
    moveBefore: true,
    loads: 1,
    field: true,
    focused: true,
    value: 'hello',
    selection: [1, 3],
  });
  // Local island state stays; new props would apply (same values here).
  await expect(kept).toHaveText('kept:2');
  await kept.click();
  await expect(kept).toHaveText('kept:3');

  // Page C has no counter: the island is disposed; back on A a new instance starts.
  await page.locator('#to-c').click();
  await heading(page, 'Page C');
  await expect(kept).toHaveCount(0);
  await page.locator('#to-a').click();
  await heading(page, 'Page A');
  await expect(kept).toHaveText('kept:1');
  await expect(async () => {
    await kept.click();
    await expect(kept).toHaveText('kept:2', { timeout: 200 });
  }).toPass();
  expect(await page.evaluate(() => (window as { frameLoads?: number }).frameLoads)).toBe(1);
  expect(failures).toEqual([]);
});

test('V-19: 200 navigations leave listeners, nodes, observers, plugins and heap unchanged', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const failures = errors(page);
  // Count live observers (created and observing, not disconnected).
  await page.addInitScript(() => {
    const live = new Set<object>();
    (window as unknown as { liveObservers: Set<object> }).liveObservers = live;
    for (const name of ['IntersectionObserver', 'MutationObserver', 'ResizeObserver'] as const) {
      const Base = window[name] as unknown as { new (...args: never[]): object };
      if (!Base) continue;
      const Wrapped = class extends (Base as { new (...args: never[]): any }) {
        observe(...args: never[]) {
          live.add(this);
          return super.observe(...args);
        }
        disconnect() {
          live.delete(this);
          return super.disconnect();
        }
      };
      (window as unknown as Record<string, unknown>)[name] = Wrapped;
    }
  });
  await page.goto('/router/a');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const order = ['b', 'c', 'a'] as const;
  const title = { a: 'Page A', b: 'Page B', c: 'Page C' };
  const visit = async (count: number) => {
    for (let i = 0; i < count; i++) {
      const next = order[i % 3];
      await page.locator(`#to-${next}`).click();
      await heading(page, title[next]);
      if (next === 'b') await expect(page.locator('h-state[name="note"]')).toHaveClass(/pinged/);
    }
  };
  const measure = async () => {
    // Same state for every sample: the pointer off the links (no hover prefetch) and an
    // empty prefetch cache (b's boot action clears it), then scripted clicks to a.
    await page.mouse.move(5, 700);
    for (const [next, done] of [
      ['b', 'h-state[name="note"].pinged'],
      ['a', 'h1:text("Page A")'],
    ] as const) {
      await page.evaluate(id => document.getElementById(id)!.click(), `to-${next}`);
      await page.locator(done).waitFor();
    }
    return sample();
  };
  // Blink frees nodes and documents some time after a V8 GC: sample until two reads agree.
  const sample = async () => {
    let previous: Awaited<ReturnType<typeof read>> | undefined;
    for (let attempt = 0; attempt < 20; attempt++) {
      await page.waitForTimeout(250);
      const current = await read();
      if (
        previous &&
        current.documents === previous.documents &&
        current.nodes === previous.nodes &&
        current.listeners === previous.listeners
      )
        return current;
      previous = current;
    }
    return previous!;
  };
  const read = async () => {
    for (let i = 0; i < 3; i++) await cdp.send('HeapProfiler.collectGarbage');
    const { metrics } = await cdp.send('Performance.getMetrics');
    const value = (name: string) => metrics.find(metric => metric.name === name)!.value;
    const counts = await page.evaluate(() => ({
      observers: (window as unknown as { liveObservers: Set<object> }).liveObservers.size,
      plugins: (window as { markerActive?: number }).markerActive,
      counters: document.querySelectorAll('button.kept').length,
      links: document.head.querySelectorAll('link').length,
    }));
    return {
      listeners: value('JSEventListeners'),
      nodes: value('Nodes'),
      documents: value('Documents'),
      heap: value('JSHeapUsedSize'),
      ...counts,
    };
  };
  // Warm up: every page, its chunks and prefetch hints once.
  await visit(6);
  const before = await measure();
  await visit(99);
  const middle = await measure();
  await visit(99);
  const after = await measure();
  console.log('router leak check', { before, middle, after });
  for (const result of [middle, after]) {
    expect(result.listeners).toBeLessThanOrEqual(before.listeners);
    expect(result.documents).toBeLessThanOrEqual(before.documents);
    expect(result.nodes).toBeLessThanOrEqual(before.nodes + 20);
    expect(result.observers).toBe(before.observers);
    expect(result.plugins).toBe(1);
    expect(result.counters).toBe(1);
    expect(result.links).toBe(before.links);
  }
  // The heap converges: the second hundred adds only the dataLayer entries and noise.
  expect(after.heap - middle.heap).toBeLessThan(250_000);
  expect(failures).toEqual([]);
});

test('V-30: tag manager nodes survive 20 navigations, page_view fires each time, no CSP violation', async ({
  page,
}) => {
  const failures = errors(page);
  const csp: string[] = [];
  page.on('console', message => {
    if (/Content Security Policy/i.test(message.text())) csp.push(message.text());
  });
  await page.goto('/router/a');
  await expect
    .poll(() => page.evaluate(() => (window as { gtmExternal?: number }).gtmExternal))
    .toBe(1);
  await expect(page.locator('#gtm-frame')).toHaveCount(1);
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).gtmNodes = Array.from(
      document.querySelectorAll('[data-gtm], #gtm-frame')
    );
  });
  for (let i = 0; i < 20; i++) {
    const next = i % 2 === 0 ? 'b' : 'a';
    await page.locator(`#to-${next}`).click();
    await heading(page, next === 'a' ? 'Page A' : 'Page B');
  }
  expect(
    await page.evaluate(() => {
      const w = window as unknown as Record<string, any>;
      const nodes = Array.from(document.querySelectorAll('[data-gtm], #gtm-frame'));
      return {
        same:
          nodes.length === w.gtmNodes.length &&
          nodes.every((node, index) => node === w.gtmNodes[index] && node.isConnected),
        count: nodes.length,
        inline: w.gtmInline,
        external: w.gtmExternal,
        views: w.dataLayer.filter(
          (entry: { event?: string }) => entry.event === 'surface.page_view'
        ).length,
        violations: w.cspViolations,
      };
    })
  ).toEqual({ same: true, count: 3, inline: 1, external: 1, views: 21, violations: 0 });
  expect(csp).toEqual([]);
  expect(failures).toEqual([]);
});

test('DC-23: CSS Modules match across SSR, server HTML and client renders; navigation adds only the CSS it needs', async ({
  page,
}) => {
  const failures = errors(page);
  const docs = documents(page);
  const css = new Set<string>();
  page.on('request', request => {
    const { pathname } = new URL(request.url());
    if (pathname.endsWith('.css')) css.add(pathname);
  });
  // The island chunk waits: its CSS must already style the server-rendered button.
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  await page.route(/\/assets\/Toggle-[\w-]+\.js$/, async route => {
    await gate;
    await route.continue();
  });
  const style = (selector: string, property: string) =>
    page
      .locator(selector)
      .evaluate((el, name) => getComputedStyle(el).getPropertyValue(name), property);
  /** Class names of the element that no loaded stylesheet defines. */
  const undefinedClasses = (selector: string) =>
    page.locator(selector).evaluate(el => {
      const selectors = Array.from(document.styleSheets).flatMap(sheet =>
        Array.from(sheet.cssRules, rule => (rule as CSSStyleRule).selectorText ?? '')
      );
      return el.classList.length
        ? Array.from(el.classList).filter(name => !selectors.includes('.' + name))
        : ['(no class)'];
    });
  const linked = () =>
    page.evaluate(() =>
      Array.from(document.head.querySelectorAll('link[rel=stylesheet]'), link =>
        link.getAttribute('href')
      )
    );

  await page.goto('/router/a');
  await page.waitForLoadState('networkidle');
  expect([...css]).toEqual([]);
  await page.locator('#to-styled').click();
  await expect(page.locator('#badge')).toHaveText('styled');
  expect([...css].sort()).toEqual([
    expect.stringMatching(/^\/assets\/Toggle-[\w-]+\.css$/),
    expect.stringMatching(/^\/assets\/page-router_styled-[\w-]+\.css$/),
  ]);
  const fresh = await page.context().newPage();
  await fresh.goto('/router/styled');
  expect(
    await fresh.evaluate(() =>
      Array.from(document.head.querySelectorAll('link[rel=stylesheet]'), link =>
        link.getAttribute('href')
      )
    )
  ).toEqual(await linked());
  await fresh.close();

  // Static slot (page CSS) and the dormant island (chunk CSS) are styled before any JS runs.
  expect(await style('#badge', 'color')).toBe('rgb(200, 0, 0)');
  expect(await style('#toggle', 'background-color')).toBe('rgb(0, 128, 0)');
  await expect(page.locator('#toggle')).toHaveText('toggle:off');
  expect(await undefinedClasses('#badge')).toEqual([]);
  expect(await undefinedClasses('#toggle')).toEqual([]);
  const ssrClass = await page.locator('#toggle').getAttribute('class');

  // Client render: the chunk's class names are the SSR ones.
  release();
  await expect(async () => {
    await page.locator('#toggle').click();
    await expect(page.locator('#toggle')).toHaveText('toggle:on', { timeout: 200 });
  }).toPass();
  expect(await page.locator('#toggle').getAttribute('class')).toBe(ssrClass);

  // Server HTML swap: the transition renders classes the page CSS defines.
  await page.getByRole('button', { name: 'Restyle' }).click();
  await expect(page.locator('#live')).toHaveText('restyled');
  expect(await undefinedClasses('#live')).toEqual([]);
  expect(await style('#live', 'outline-color')).toBe('rgb(0, 160, 0)');

  // Leaving the page drops its stylesheets and loads nothing new.
  const before = css.size;
  await page.locator('#to-a').click();
  await heading(page, 'Page A');
  expect(await linked()).toEqual([]);
  expect(css.size).toBe(before);
  expect(docs).toEqual(['/router/a']);
  expect(failures).toEqual([]);
});
