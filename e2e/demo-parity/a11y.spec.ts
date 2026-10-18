import { expect, test, type Page } from '@playwright/test';

/**
 * MT-14 automated part (NFR-04): every demo page fits narrow screens and 200% zoom without
 * horizontal scrolling, and keyboard focus is always visible. Screen readers and real
 * devices stay manual (MANUAL_TEST_CHECKLIST MT-14).
 */
const pages = [
  '',
  '/guide/quickstart',
  '/guide/action',
  '/examples',
  '/examples/streaming',
  '/examples/actions',
  '/examples/view-transition',
  '/examples/search',
  '/examples/chat',
  '/examples/ui-patch',
];

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

// 320 px: the narrowest phones; 640 px: a 1280 px window at 200% zoom.
for (const width of [320, 640])
  test(`MT-14: no horizontal scrolling at ${width} px (en, ko)`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 800 } });
    try {
      const page = await context.newPage();
      const wide: string[] = [];
      for (const lang of ['en', 'ko'])
        for (const path of pages) {
          await page.goto(`${lang}${path}`);
          await page.waitForLoadState('networkidle');
          const extra = await overflow(page);
          if (extra > 0) wide.push(`${lang}${path}: ${extra}px`);
        }
      expect(wide).toEqual([]);
    } finally {
      await context.close();
    }
  });

test('MT-14: every keyboard stop shows a focus indicator', async ({ page }) => {
  const hidden: string[] = [];
  for (const path of ['en', 'en/examples/actions', 'en/examples/search', 'en/guide/quickstart']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    for (let stop = 0; stop < 40; stop++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        return {
          name: `${el.tagName} ${(el.textContent ?? '').trim().slice(0, 30)}`,
          visible: style.outlineStyle !== 'none' || style.boxShadow !== 'none',
        };
      });
      if (!focused) break;
      if (!focused.visible) hidden.push(`${path}: ${focused.name}`);
    }
  }
  expect(hidden).toEqual([]);
});
