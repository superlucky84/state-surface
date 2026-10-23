import { expect, test, type Page } from '@playwright/test';

// Wait for the real client module, without reaching into engine internals.
async function ready(page: Page, path: string) {
  const assetFailures: string[] = [];
  const onResponse = (response: import('@playwright/test').Response) => {
    if (['script', 'stylesheet'].includes(response.request().resourceType()) && !response.ok()) {
      assetFailures.push(`${response.status()} ${response.url()}`);
    }
  };
  page.on('response', onResponse);
  try {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(assetFailures, 'All page JS and CSS assets must load').toEqual([]);
  } finally {
    page.off('response', onResponse);
  }
}

const slot = (page: Page, name: string) => page.locator(`h-state[name="${name}"]`);

test('language links open the same page in the other language and remember the choice', async ({
  page,
}) => {
  const base = process.env.BASE_PATH ?? '';
  // A path without a language redirects (cookie → Accept-Language → default, DC-24 ⑤).
  await ready(page, './');
  expect(new URL(page.url()).pathname).toBe(`${base}/en`);
  const hero = slot(page, 'page:hero');
  const english = await hero.textContent();
  await page.getByRole('link', { name: 'KO', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${base}/ko$`));
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(hero).not.toHaveText(english!);
  const korean = await hero.textContent();
  // The choice is a cookie: language-less paths now lead to Korean pages.
  await page.goto('examples/streaming');
  expect(new URL(page.url()).pathname).toBe(`${base}/ko/examples/streaming`);
  await page.goto('./');
  await expect(hero).toHaveText(korean!);
  // Transitions answer in the page language (`lang` param), not the cookie's.
  await page.goto('en/examples/streaming');
  await page.getByRole('button', { name: 'Run Full Sequence', exact: true }).click();
  await expect(slot(page, 'demo:controls')).toContainText('Sequence complete!');
});

test('the hero image loads as WebP from its srcset, preloaded and without layout shift', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver(list => {
      for (const entry of list.getEntries() as Array<
        PerformanceEntry & { value: number; hadRecentInput: boolean }
      >)
        if (!entry.hadRecentInput) w.__cls += entry.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  const images: string[] = [];
  page.on('response', response => {
    if (response.request().resourceType() === 'image')
      images.push(`${response.status()} ${response.headers()['content-type']}`);
  });
  await ready(page, 'en');
  const hero = slot(page, 'page:hero').locator('img');
  await expect(hero).toHaveAttribute('width', '960');
  await expect(hero).toHaveAttribute('height', '540');
  await expect
    .poll(() => hero.evaluate(img => (img as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  expect(await hero.evaluate(img => (img as HTMLImageElement).currentSrc)).toMatch(
    new RegExp(`^[^?]*${process.env.BASE_PATH ?? ''}/assets/hero-[0-9a-f]+-\\d+\\.webp$`)
  );
  await expect(page.locator('head link[rel="preload"][as="image"]')).toHaveCount(1);
  expect(images.length).toBeGreaterThan(0);
  expect(images.every(image => image === '200 image/webp')).toBe(true);
  expect(
    await page.evaluate(() => (window as unknown as { __cls: number }).__cls)
  ).toBeLessThanOrEqual(0.1);
});

test('guides are prerendered pages with server-highlighted code and section navigation', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', r => {
    if (r.url().includes('/transition/') || /prism/i.test(r.url())) requests.push(r.url());
  });
  await ready(page, 'en/guide/quickstart');
  await expect(page.locator('article pre code .token').first()).toBeVisible();
  await expect(page.locator('article pre code .code-ln').first()).toHaveText('1');
  await expect(page.locator('article :not(pre) > code').first()).toBeVisible();
  expect(requests).toEqual([]);
  const link = slot(page, 'guide:toc').locator('a[href^="#"]').first();
  const href = await link.getAttribute('href');
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  // The Korean guide has the same sections (parity is a build check).
  await ready(page, 'ko/guide/quickstart');
  await expect(slot(page, 'guide:toc').locator(`a[href="${href}"]`).first()).toHaveCount(1);
});

test('search form streams results and links respect BASE_PATH', async ({ page }) => {
  await ready(page, 'en/examples/search');
  await page.getByRole('textbox').fill('streaming');
  await page.getByRole('textbox').press('Enter');
  await expect(slot(page, 'search:results').getByRole('link').first()).toBeVisible();
  // search:input is swap="morph": the input node, its text and focus survive the update.
  await expect(page.getByRole('textbox')).toBeFocused();
  await expect(page.getByRole('textbox')).toHaveValue('streaming');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(slot(page, 'search:results').getByRole('link').first()).toBeVisible();
  await expect(slot(page, 'search:results')).not.toContainText('Searching for');
  await slot(page, 'search:results').getByRole('link').first().click();
  await expect(page.locator('main')).toBeVisible();
  expect(new URL(page.url()).pathname).toMatch(new RegExp(`^${process.env.BASE_PATH ?? ''}/en/`));
  // Korean page: the form sends its language, results come back in Korean.
  await ready(page, 'ko/examples/search');
  await page.getByRole('textbox').fill('스트리밍');
  await page.getByRole('textbox').press('Enter');
  await expect(slot(page, 'search:results').getByRole('link').first()).toContainText('스트리밍');
});

test('button, form and scoped pending actions complete', async ({ page }) => {
  await ready(page, 'en/examples/actions');
  await page.getByRole('button', { name: 'Primary Button', exact: true }).click();
  await expect(slot(page, 'actions:playground')).toContainText('processed');
  await page.getByPlaceholder('Type a message...').fill('browser parity');
  await page.getByRole('button', { name: 'Submit Form', exact: true }).click();
  await expect(slot(page, 'actions:playground')).toContainText('Form received: "browser parity"');
  // Hold the request so the pre-response pending state is observable, without timing races.
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/transition/action-demo', async route => {
    await gate;
    await route.continue();
  });
  await page.getByRole('button', { name: 'Scoped Pending Action', exact: true }).click();
  try {
    await expect(slot(page, 'actions:log')).toHaveAttribute('data-pending', '');
    await expect(slot(page, 'actions:playground')).not.toHaveAttribute('data-pending');
  } finally {
    release();
  }
  await expect(slot(page, 'actions:playground')).toContainText('Only the log was marked pending');
  await expect(slot(page, 'actions:log')).toContainText('DONE');
});

test.describe('JS-less form (PRG, DC-22 ③)', () => {
  test.use({ javaScriptEnabled: false, reducedMotion: 'reduce' });

  test('posts, answers 303 with a one-time flash and does not resubmit on reload', async ({
    page,
  }) => {
    await page.goto('en/examples/actions');
    // Submit with the keyboard and wait for the redirected document (no script runs here).
    const post = async () => {
      const redirected = page.waitForResponse(response =>
        response.url().includes('/_surface/action/comments/add')
      );
      await page.getByRole('button', { name: 'Post comment' }).press('Enter');
      expect((await redirected).status()).toBe(303);
      await page.waitForLoadState('load');
    };
    await post();
    await expect(slot(page, 'actions:comments')).toContainText('Required');
    await page.locator('#comment-body').fill('no script needed');
    await post();
    await expect(page.getByTestId('comments')).toContainText('no script needed');
    await expect(slot(page, 'actions:comments')).toContainText('Posted (flash)');
    expect(new URL(page.url()).pathname).toMatch(/\/en\/examples\/actions$/);
    await page.reload();
    await expect(slot(page, 'actions:comments')).not.toContainText('Posted (flash)');
    await expect(page.getByTestId('comments').locator('li')).toHaveCount(1);
  });
});

test('the same form streams with JavaScript; a like runs in parallel with a slow action', async ({
  page,
}) => {
  await ready(page, 'en/examples/actions');
  const navigations: string[] = [];
  page.on('framenavigated', frame => frame === page.mainFrame() && navigations.push(frame.url()));
  await page.locator('#comment-body').fill('with script');
  await page.getByRole('button', { name: 'Post comment' }).click();
  await expect(page.getByTestId('comments')).toContainText('with script');
  expect(navigations).toEqual([]);

  // Hold the slow playground action; the like (disjoint targets) still completes.
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  await page.route('**/transition/action-demo', async route => {
    await gate;
    await route.continue();
  });
  await page.getByRole('button', { name: 'Primary Button', exact: true }).click();
  await page.getByTestId('like').click();
  try {
    await expect(page.getByTestId('likes')).toContainText('1');
    await expect(page.getByTestId('like-status')).toHaveText('Saved');
    await expect(slot(page, 'actions:playground')).toHaveAttribute('data-pending', '');
    await expect(slot(page, 'actions:likes')).not.toHaveAttribute('data-pending');
  } finally {
    release();
  }
  await expect(slot(page, 'actions:playground')).toContainText('processed');
  await page.getByTestId('like-invalid').click();
  await expect(page.getByTestId('like-status')).toHaveText('validation: Must be at most 5');
});

test('streaming displays partial, accumulated, removed and restored output', async ({ page }) => {
  await ready(page, 'en/examples/streaming');
  await page.getByRole('button', { name: 'Run Full Sequence', exact: true }).click();
  await expect(slot(page, 'demo:timeline')).toContainText('changed timeline');
  await expect(slot(page, 'demo:timeline')).toContainText('Accumulate');
  await expect(slot(page, 'demo:output')).toBeEmpty();
  await expect(slot(page, 'demo:controls')).toContainText('Sequence complete!');
  await expect(slot(page, 'demo:output')).toContainText('restored');
  await page.getByRole('button', { name: 'Trigger Error Frame', exact: true }).click();
  await expect(slot(page, 'system:error')).toContainText('demonstration error');
});

test('UI patches apply theme, style-only changes, and reset', async ({ page }) => {
  await ready(page, 'en/examples/ui-patch');
  const preview = slot(page, 'uipatch:preview');
  const ssrClass = (await preview.getAttribute('class')) ?? '';
  await page.getByRole('button', { name: 'Warning', exact: true }).click();
  await expect(preview).toHaveClass(/tone-warning/);
  await page.getByRole('button', { name: 'Style-Only Apply', exact: true }).click();
  await expect(preview).toHaveClass(/tone-success/);
  await expect(preview).toHaveCSS('--card-accent', '#10b981');
  await page.getByRole('button', { name: 'Reset to Default', exact: true }).click();
  // The reset patch brings back the classes the page rendered on the slot host.
  await expect(preview).toHaveAttribute('class', ssrClass);
  await expect(preview).toHaveCSS('--card-accent', '');
  await expect(preview).not.toHaveClass(/tone-success/);
});

test('gallery view transitions show details and return to gallery', async ({ page }) => {
  await ready(page, 'en/examples/view-transition');
  await slot(page, 'vt:gallery').getByRole('button').first().click();
  await expect(page.getByRole('button', { name: 'Back to Gallery' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Gallery' }).click();
  await expect(slot(page, 'vt:gallery').getByRole('button')).toHaveCount(3);
});

test('chat streams, aborts superseded response, and scrolls to latest message', async ({
  page,
}) => {
  await ready(page, 'en/examples/chat');
  const requests: string[] = [];
  page.on('request', r => {
    if (r.url().endsWith('/transition/chat')) requests.push(r.postData()!);
  });
  await page.getByRole('textbox').fill('surface');
  await page.getByRole('textbox').press('Enter');
  await expect(slot(page, 'chat:current')).toContainText('Surface');
  await page.getByRole('textbox').fill('abort');
  await page.getByRole('textbox').press('Enter');
  await expect(slot(page, 'chat:messages')).toContainText('The abort-previous policy');
  await expect(slot(page, 'chat:current')).toBeEmpty();
  expect(requests).toHaveLength(2);
  await expect(slot(page, 'chat:messages')).not.toContainText('Surfaces define where');
  const scroll = page.locator('[data-chat-scroll]');
  await expect
    .poll(() => scroll.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop))
    .toBeLessThanOrEqual(2);
});

test('mobile guide plugin scrolls the active category into view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page, 'en/guide/ui-patch');
  const active = page.locator('[data-guide-nav-scroll] [data-guide-active="true"]');
  await expect(active).toBeVisible();
  await expect
    .poll(() =>
      active.evaluate(el => {
        const bounds = el.getBoundingClientRect();
        const row = el.closest('[data-guide-nav-scroll]')!.getBoundingClientRect();
        return bounds.left >= row.left - 1 && bounds.right <= row.right + 1;
      })
    )
    .toBe(true);
});
