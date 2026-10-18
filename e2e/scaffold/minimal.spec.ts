import { expect, test, type Page } from '@playwright/test';

/**
 * Stage 10: the page an app generated from `create-state-surface --template minimal` serves
 * from its production build, on every adapter (scripts/scaffold-test.mjs starts it).
 */
function watch(page: Page) {
  const problems: string[] = [];
  page.on('response', response => {
    const type = response.request().resourceType();
    if (['script', 'stylesheet', 'image', 'fetch'].includes(type) && response.status() >= 400)
      problems.push(`${response.status()} ${response.url()}`);
  });
  page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  return problems;
}

const greeting = (page: Page) => page.locator('h-state[name="home:greeting"] p');
const counter = (page: Page) => page.getByRole('button', { name: /^Clicked \d+ times$/ });

test('the page renders static markup, the server slot and its CSS Module', async ({ page }) => {
  const problems = watch(page);
  await page.goto('./');
  await expect(page.locator('h1')).toHaveText('Hello, StateSurface');
  await expect(greeting(page)).toHaveText('Hello, world!');
  // Greeting.module.css is linked with the page: the hashed class is styled before scripts run.
  expect(await greeting(page).getAttribute('class')).toMatch(/greeting/);
  expect(await greeting(page).evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('1px');
  await page.waitForLoadState('networkidle');
  expect(problems).toEqual([]);
});

test('the greet form streams new server HTML into its slot', async ({ page }) => {
  const problems = watch(page);
  await page.goto('./');
  await page.getByPlaceholder('Your name').fill('<b>Scaffold</b>');
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/transition/greet');
  await page.getByRole('button', { name: 'Greet' }).click();
  expect((await response).headers()['content-type']).toContain('application/x-ndjson');
  // Text, not markup: the slot HTML is rendered on the server from the props.
  await expect(greeting(page)).toHaveText('Hello, <b>Scaffold</b>!');
  await expect(page.locator('h-state[name="home:greeting"] b')).toHaveCount(0);
  // The engine took the submit: no document navigation with the field in the URL.
  expect(new URL(page.url()).search).toBe('');
  await expect(page.locator('h-state[name="system:error"]')).toBeEmpty();
  expect(problems).toEqual([]);
});

test('the client:visible island hydrates and keeps its state', async ({ page }) => {
  const problems = watch(page);
  const chunk = page.waitForResponse(r => /\/assets\/Counter-[\w-]+\.js$/.test(r.url()));
  await page.goto('./');
  await expect(counter(page)).toHaveText('Clicked 0 times');
  await counter(page).scrollIntoViewIfNeeded();
  await chunk;
  await page.waitForLoadState('networkidle');
  await counter(page).click();
  await expect(counter(page)).toHaveText('Clicked 1 times');
  await counter(page).click();
  await expect(counter(page)).toHaveText('Clicked 2 times');
  // A server slot update elsewhere on the page leaves the island alone.
  await page.getByPlaceholder('Your name').fill('Ada');
  await page.getByRole('button', { name: 'Greet' }).click();
  await expect(greeting(page)).toHaveText('Hello, Ada!');
  await expect(counter(page)).toHaveText('Clicked 2 times');
  expect(problems).toEqual([]);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the server-rendered page is complete', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('h1')).toHaveText('Hello, StateSurface');
    await expect(greeting(page)).toHaveText('Hello, world!');
    await expect(counter(page)).toHaveText('Clicked 0 times');
  });
});
