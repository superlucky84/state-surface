import { expect, test, type Page } from '@playwright/test';

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
