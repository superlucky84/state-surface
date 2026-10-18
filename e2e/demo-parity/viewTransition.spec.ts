import { expect, test, type Page } from '@playwright/test';

/**
 * V-14 (DC-06, DESIGN 9.1): View Transitions on the production demo — document loads
 * (`@view-transition` in client/styles.css), router navigations (one root transition) and
 * in-page actions (one transition per action), without the API, with reduced motion, on
 * back/forward and on a BFCache restore.
 */
// Playwright turns the back/forward cache off, and the headless shell has none: these run in
// the full Chromium with it on (one switch per worker, so for the whole file).
test.use({
  channel: 'chromium',
  launchOptions: { ignoreDefaultArgs: ['--disable-back-forward-cache'] },
});

const base = process.env.BASE_PATH ?? '';
const slot = (page: Page, name: string) => page.locator(`h-state[name="${name}"]`);

/** Counts startViewTransition calls; records whether the page was revealed by one. */
async function watch(page: Page, options: { api?: boolean } = {}) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(withApi => {
    const w = window as unknown as Record<string, unknown>;
    w.__vt = 0;
    w.__shows = [];
    const proto = Document.prototype as unknown as Record<string, unknown>;
    if (!withApi) delete proto.startViewTransition;
    const original = proto.startViewTransition as ((...args: unknown[]) => unknown) | undefined;
    if (original)
      proto.startViewTransition = function (this: Document, ...args: unknown[]) {
        (w.__vt as number)++;
        return original.apply(this, args);
      };
    addEventListener('pagereveal', event => {
      w.__revealed = !!(event as Event & { viewTransition?: unknown }).viewTransition;
    });
    addEventListener('pageshow', event => (w.__shows as boolean[]).push(event.persisted));
  }, options.api !== false);
  return errors;
}
const transitions = (page: Page) =>
  page.evaluate(() => (window as unknown as { __vt: number }).__vt);
const revealed = (page: Page) =>
  page.evaluate(() => (window as unknown as { __revealed?: boolean }).__revealed ?? false);
/** A marker on the current document: it survives client navigations, not document loads. */
const mark = (page: Page) =>
  page.evaluate(() => ((window as unknown as { __marker: boolean }).__marker = true));
const marked = (page: Page) =>
  page.evaluate(() => (window as unknown as { __marker?: boolean }).__marker === true);

/** Counts how often the engine marked a slot for its reveal animation (`data-just-updated`). */
const countReveals = (page: Page, name: string) =>
  page.evaluate(slotName => {
    const w = window as unknown as { __reveals: number };
    w.__reveals = 0;
    new MutationObserver(records => {
      for (const record of records)
        if ((record.target as Element).hasAttribute('data-just-updated')) w.__reveals++;
    }).observe(document.querySelector(`h-state[name="${slotName}"]`)!, {
      attributes: true,
      attributeFilter: ['data-just-updated'],
    });
  }, name);
const reveals = (page: Page) =>
  page.evaluate(() => (window as unknown as { __reveals: number }).__reveals);

/** A link the router leaves to the browser (`data-surface-reload`): a document load. */
async function documentLoad(page: Page, path: string) {
  await page.evaluate(href => {
    const link = document.createElement('a');
    link.href = href;
    link.id = 'document-load';
    link.textContent = 'document load';
    link.setAttribute('data-surface-reload', '');
    document.body.prepend(link);
  }, base + path);
  await page.click('#document-load');
  await page.waitForURL(`**${base}${path}`);
}

async function ready(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

async function openCard(page: Page) {
  await slot(page, 'vt:gallery').getByRole('button').first().click();
  await expect(page.getByRole('button', { name: 'Back to Gallery' })).toBeVisible();
}

const routerLink = (page: Page, path: string) =>
  page.locator(`header a[href="${base}${path}"]`).last();

test('V-14: a document load cross-fades through @view-transition, without the router', async ({
  page,
}) => {
  const errors = await watch(page);
  await ready(page, 'en');
  await mark(page);
  await documentLoad(page, '/en/examples');
  await expect(slot(page, 'examples:list')).toBeVisible();
  expect(await marked(page)).toBe(false);
  expect(await revealed(page)).toBe(true);
  expect(await transitions(page)).toBe(0);
  expect(errors).toEqual([]);
});

test('V-14: a router navigation runs one root View Transition, back and forward too', async ({
  page,
}) => {
  const errors = await watch(page);
  await ready(page, 'en');
  await mark(page);
  await routerLink(page, '/en/examples').click();
  await expect(page).toHaveURL(new RegExp(`${base}/en/examples$`));
  await expect(slot(page, 'examples:list')).toBeVisible();
  expect(await transitions(page)).toBe(1);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${base}/en$`));
  await expect(slot(page, 'page:hero')).toBeVisible();
  await expect.poll(() => transitions(page)).toBe(2);
  await page.goForward();
  await expect(slot(page, 'examples:list')).toBeVisible();
  await expect.poll(() => transitions(page)).toBe(3);
  // Same document throughout: the router swapped the pages.
  expect(await marked(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('V-14: in-page state is not restored by back/forward; the server renders the page again', async ({
  page,
}) => {
  await watch(page);
  await ready(page, 'en/examples/view-transition');
  await openCard(page);
  await routerLink(page, '/en/examples').click();
  await expect(slot(page, 'examples:list')).toBeVisible();
  await page.goBack();
  await expect(slot(page, 'vt:gallery').getByRole('button')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Back to Gallery' })).toHaveCount(0);
});

test('V-14: an in-page action runs one View Transition for its whole stream, in stream order', async ({
  page,
}) => {
  const errors = await watch(page);
  await ready(page, 'en/examples/view-transition');
  await openCard(page);
  expect(await transitions(page)).toBe(1);
  await page.getByRole('button', { name: 'Back to Gallery' }).click();
  await expect(slot(page, 'vt:gallery').getByRole('button')).toHaveCount(3);
  expect(await transitions(page)).toBe(2);

  // The streaming demo applies immediately by default; with data-view-transition its stream
  // of patches gets one transition and ends in the same DOM.
  const run = async (viewTransition: boolean) => {
    await ready(page, 'en/examples/streaming');
    const button = page.getByRole('button', { name: 'Run Full Sequence', exact: true });
    if (viewTransition) await button.evaluate(el => el.setAttribute('data-view-transition', ''));
    await countReveals(page, 'demo:timeline');
    await button.click();
    await expect(slot(page, 'demo:controls')).toContainText('Sequence complete!');
    await expect(slot(page, 'demo:output')).toContainText('restored');
    await expect(page.locator('h-state[data-pending]')).toHaveCount(0);
    // data-animate="slide-up": every update of the slot plays its reveal animation.
    expect(await reveals(page)).toBeGreaterThan(0);
    return {
      transitions: await transitions(page),
      dom: await page.evaluate(() =>
        ['demo:controls', 'demo:timeline', 'demo:output'].map(
          name => document.querySelector(`h-state[name="${name}"]`)!.innerHTML
        )
      ),
    };
  };
  const plain = await run(false);
  const animated = await run(true);
  expect(plain.transitions).toBe(0);
  expect(animated.transitions).toBe(1);
  expect(animated.dom).toEqual(plain.dom);
  expect(errors).toEqual([]);
});

test.describe('reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('V-14: navigations and actions apply at once, without reveal animations', async ({
    page,
  }) => {
    const errors = await watch(page);
    await ready(page, 'en');
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true
    );
    await mark(page);
    await routerLink(page, '/en/examples').click();
    await expect(slot(page, 'examples:list')).toBeVisible();
    expect(await marked(page)).toBe(true);
    await page.goto('en/examples/view-transition');
    await openCard(page);
    await documentLoad(page, '/en/examples/search');
    expect(await revealed(page)).toBe(false);
    const input = slot(page, 'search:input').locator('input:not([type=hidden])');
    await countReveals(page, 'search:results');
    await input.fill('slot');
    await input.press('Enter');
    await expect(slot(page, 'search:results')).toContainText('Surface');
    expect(await reveals(page)).toBe(0);
    expect(await transitions(page)).toBe(0);
    // The presets' pending hint keeps the dimming, without movement.
    await page.goto('en/examples/streaming');
    const pending = await slot(page, 'demo:timeline').evaluate(el => {
      el.setAttribute('data-pending', '');
      const style = getComputedStyle(el);
      return {
        transform: style.transform,
        opacity: style.opacity,
        transition: style.transitionDuration,
      };
    });
    expect(pending).toEqual({ transform: 'none', opacity: '0.45', transition: '0s' });
    expect(errors).toEqual([]);
  });
});

test('V-14: without the View Transition API every update applies at once', async ({ page }) => {
  const errors = await watch(page, { api: false });
  await ready(page, 'en');
  expect(await page.evaluate(() => 'startViewTransition' in document)).toBe(false);
  await mark(page);
  await routerLink(page, '/en/examples').click();
  await expect(slot(page, 'examples:list')).toBeVisible();
  expect(await marked(page)).toBe(true);
  await page.goBack();
  await expect(slot(page, 'page:hero')).toBeVisible();
  await page.goto('en/examples/view-transition');
  await openCard(page);
  await page.getByRole('button', { name: 'Back to Gallery' }).click();
  await expect(slot(page, 'vt:gallery').getByRole('button')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('V-14: a page restored from the BFCache is as it was left and keeps working', async ({
  page,
}) => {
  const errors = await watch(page);
  await ready(page, 'en/examples/search');
  const input = slot(page, 'search:input').locator('input:not([type=hidden])');
  await input.fill('slot');
  await input.press('Enter');
  await expect(slot(page, 'search:results')).toContainText('Surface');
  const results = await slot(page, 'search:results').innerHTML();
  await documentLoad(page, '/en');
  await page.waitForLoadState('networkidle');
  // A BFCache restore fires no load event.
  await page.goBack({ waitUntil: 'commit' });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __shows: boolean[] }).__shows))
    .toEqual([false, true]);
  expect(await slot(page, 'search:results').innerHTML()).toBe(results);
  await expect(input).toHaveValue('slot');
  // The restored document's engine still runs actions.
  await input.fill('transition');
  await input.press('Enter');
  await expect(slot(page, 'search:results')).toContainText('Transition');
  expect(errors).toEqual([]);
});
