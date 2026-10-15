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

test('language action changes content and persists across a document load', async ({ page }) => {
  await ready(page, './');
  const hero = slot(page, 'page:hero');
  const english = await hero.textContent();
  const response = page.waitForResponse(r => r.url().endsWith('/transition/switch-lang'));
  await page.getByRole('button', { name: 'KO', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(hero).not.toHaveText(english!);
  const korean = await hero.textContent();
  await page.reload();
  await expect(hero).toHaveText(korean!);
});

test('guide boot streams sections, highlights code, and exposes section navigation', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', r => {
    if (r.url().includes('/transition/guide-load')) requests.push(r.url());
  });
  await ready(page, 'guide/quickstart');
  await expect(page.locator('pre code.prism-done').first()).toBeVisible();
  await expect(page.locator('pre code .token').first()).toBeVisible();
  expect(requests).toHaveLength(1);
  const link = slot(page, 'guide:toc').locator('a[href^="#"]').first();
  const href = await link.getAttribute('href');
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
});

test('search form streams results and links respect BASE_PATH', async ({ page }) => {
  await ready(page, 'examples/search');
  await page.getByRole('textbox').fill('streaming');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(slot(page, 'search:results').getByRole('link').first()).toBeVisible();
  await expect(slot(page, 'search:results')).not.toContainText('Searching for');
  await slot(page, 'search:results').getByRole('link').first().click();
  await expect(page.locator('main')).toBeVisible();
  expect(new URL(page.url()).pathname).toMatch(new RegExp(`^${process.env.BASE_PATH ?? ''}/`));
});

test('button, form and scoped pending actions complete', async ({ page }) => {
  await ready(page, 'examples/actions');
  await page.getByRole('button', { name: 'Primary Button', exact: true }).click();
  await expect(slot(page, 'actions:playground')).toContainText('processed');
  await page.getByRole('textbox').fill('browser parity');
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

test('streaming displays partial, accumulated, removed and restored output', async ({ page }) => {
  await ready(page, 'examples/streaming');
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
  await ready(page, 'examples/ui-patch');
  const preview = slot(page, 'uipatch:preview');
  await page.getByRole('button', { name: 'Warning', exact: true }).click();
  await expect(preview).toHaveClass(/tone-warning/);
  await page.getByRole('button', { name: 'Style-Only Apply', exact: true }).click();
  await expect(preview).toHaveClass(/tone-success/);
  await expect(preview).toHaveCSS('--card-accent', '#10b981');
  await page.getByRole('button', { name: 'Reset to Default', exact: true }).click();
  await expect(preview).toHaveAttribute('class', '');
  await expect(preview).toHaveCSS('--card-accent', '');
  await expect(preview).not.toHaveClass(/tone-success/);
});

test('gallery view transitions show details and return to gallery', async ({ page }) => {
  await ready(page, 'examples/view-transition');
  await slot(page, 'vt:gallery').getByRole('button').first().click();
  await expect(page.getByRole('button', { name: 'Back to Gallery' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Gallery' }).click();
  await expect(slot(page, 'vt:gallery').getByRole('button')).toHaveCount(3);
});

test('chat streams, aborts superseded response, and scrolls to latest message', async ({
  page,
}) => {
  await ready(page, 'examples/chat');
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
  await ready(page, 'guide/ui-patch');
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
