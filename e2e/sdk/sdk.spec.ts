import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * V-31 (R-27, AG-09, DESIGN 8.3): the real Sentry and Datadog RUM browser SDKs with their
 * default installs, and the real GTM runtime, on a router app under a nonce CSP. Without
 * vendor accounts (IC-10) the SDKs send to this server: the Sentry DSN points at it and the
 * Datadog `proxy` option forwards RUM batches to it (e2e/sdk/app/surface.server.ts).
 *
 * After a document load and 20 client navigations: errors from app code and from the
 * engine (`reportError`) are collected, one Sentry pageload + 20 navigation transactions and
 * 21 Datadog views, trace headers on every engine fetch, the server error hook sees the
 * failing transition with its trace, SDK nodes are the same nodes, no CSP violation.
 */
const loader = existsSync(new URL('./app/dist/sentry-loader.min.js.tmpl', import.meta.url));
const variants = [
  { sdk: 'npm', label: '@sentry/browser and @datadog/browser-rum from npm' },
  { sdk: 'cdn', label: 'the Sentry Loader and the Datadog CDN snippet' },
] as const;

type Item = Record<string, any>;
interface IntakeRecord {
  kind: 'sentry' | 'datadog' | 'request' | 'server-error';
  path: string;
  items?: Item[];
  headers?: Record<string, string | null>;
  message?: string;
}

// An app listener, a plugin hook inside the engine, and the failed transition the engine
// forwards after showing its error slot (DESIGN 8.3-2; production masks the message).
const EXPECTED_ERRORS = ['Transition failed', 'app click failed', 'probe attach failed'];

const ready = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const rum = w.DD_RUM ?? w.__ddRum;
    return {
      sentry: typeof w.Sentry?.getClient === 'function' && !!w.Sentry.getClient(),
      datadog: !!rum?.getInternalContext?.()?.session_id,
      gtm: !!w.google_tag_manager?.['GTM-TEST'],
    };
  });

for (const variant of variants)
  test(`V-31: ${variant.label}, with GTM, over 20 client navigations`, async ({
    page,
    context,
    request,
    baseURL,
  }) => {
    test.skip(variant.sdk === 'cdn' && !loader, 'Sentry Loader template not downloaded');
    await request.post('intake/reset');
    await context.addCookies([{ name: 'sdk', value: variant.sdk, url: baseURL! }]);
    const failures: string[] = [];
    page.on('pageerror', error => {
      if (!EXPECTED_ERRORS.includes(error.message)) failures.push(error.message);
    });
    const csp: string[] = [];
    page.on('console', message => {
      if (/Content Security Policy/i.test(message.text())) csp.push(message.text());
    });

    await page.goto('a');
    await expect.poll(() => ready(page)).toEqual({ sentry: true, datadog: true, gtm: true });
    const scripts = await page.evaluate(() => {
      const w = window as unknown as Record<string, any>;
      w.__marker = true;
      w.__sdkNodes = Array.from(
        document.querySelectorAll(
          'script[src*="googletagmanager.com"], script[src*="sentry-cdn.com"], script[src*="datadoghq-browser-agent.com"]'
        )
      );
      return w.__sdkNodes.map((node: HTMLScriptElement) => new URL(node.src).hostname).sort();
    });
    expect(scripts).toEqual(
      variant.sdk === 'cdn'
        ? ['browser.sentry-cdn.com', 'www.datadoghq-browser-agent.com', 'www.googletagmanager.com']
        : ['www.googletagmanager.com']
    );

    for (let i = 0; i < 20; i++) {
      const next = i % 2 === 0 ? 'b' : 'a';
      await page.locator(`#to-${next}`).click();
      await expect(page.locator('h1')).toHaveText(next === 'a' ? 'Page A' : 'Page B');
    }

    // Actions and errors: an app listener throws, a plugin hook throws inside the engine
    // (reportError), a transition fails on the server.
    await page.locator('#ping').click();
    await expect(page.locator('h-state[name="box"]')).toHaveText('pinged');
    await page.locator('#app-error').click();
    await page.locator('#crash').click();
    await expect(page.locator('h-state[name="box"] [data-crash]')).toHaveCount(1);
    await page.locator('#boom').click();
    await expect(page.locator('[role="alert"]')).toBeVisible();

    const browser = await page.evaluate(() => {
      const w = window as unknown as Record<string, any>;
      const nodes = Array.from(
        document.querySelectorAll(
          'script[src*="googletagmanager.com"], script[src*="sentry-cdn.com"], script[src*="datadoghq-browser-agent.com"]'
        )
      );
      return {
        sameDocument: w.__marker === true,
        sameNodes:
          nodes.length === w.__sdkNodes.length &&
          nodes.every((node, index) => node === w.__sdkNodes[index] && node.isConnected),
        pageViews: w.dataLayer.filter((entry: Item) => entry.event === 'surface.page_view').length,
        gtmStarts: w.dataLayer.filter((entry: Item) => entry.event === 'gtm.js').length,
        // GTM's own data model processed the router's pushes.
        gtmEvent: w.google_tag_manager['GTM-TEST'].dataLayer.get('event'),
        gtmPath: w.google_tag_manager['GTM-TEST'].dataLayer.get('page_path'),
        violations: w.cspViolations,
      };
    });
    expect(browser).toEqual({
      sameDocument: true,
      sameNodes: true,
      pageViews: 21,
      gtmStarts: 1,
      gtmEvent: 'surface.page_view',
      gtmPath: '/a',
      violations: [],
    });

    // Flush: the last navigation span ends when idle; Datadog sends its batch on page exit.
    await page.waitForTimeout(1500);
    await page.evaluate(() => (window as unknown as { Sentry: any }).Sentry.flush(5000));
    await page.goto('about:blank');
    const records = async () =>
      (await (await request.get('intake/records')).json()) as IntakeRecord[];
    const views = (list: IntakeRecord[]) =>
      new Set(
        list
          .filter(record => record.kind === 'datadog')
          .flatMap(record => record.items ?? [])
          .filter(event => event.type === 'view')
          .map(event => event.view.id)
      ).size;
    await expect.poll(async () => views(await records()), { timeout: 20_000 }).toBe(21);
    const all = await records();

    const sentry = all.filter(record => record.kind === 'sentry').flatMap(r => r.items ?? []);
    expect(
      sentry
        .filter(item => item.type === 'event')
        .map(item => item.payload.exception?.values?.[0]?.value)
        .sort()
    ).toEqual(EXPECTED_ERRORS);
    // Pageload and navigation roots: transactions, or segment spans (span streaming, v2).
    const operations = [
      ...sentry
        .filter(item => item.type === 'transaction')
        .map(item => item.payload.contexts?.trace?.op),
      ...sentry
        .filter(item => item.type === 'span')
        .flatMap(item => item.payload.items ?? [])
        .filter(span => span.is_segment)
        .map(span => span.attributes?.['sentry.op']?.value),
    ];
    expect(operations.filter(op => op === 'pageload')).toHaveLength(1);
    expect(operations.filter(op => op === 'navigation')).toHaveLength(20);

    const rum = all.filter(record => record.kind === 'datadog').flatMap(r => r.items ?? []);
    const rumErrors = rum.filter(event => event.type === 'error').map(event => event.error.message);
    for (const message of EXPECTED_ERRORS)
      expect(rumErrors.some(text => text.includes(message))).toBe(true);

    // Trace headers on every engine request: transitions and the router's page fetches.
    const requests = all.filter(record => record.kind === 'request');
    const transitions = requests.filter(record => record.path.startsWith('/transition/'));
    const pages = requests.filter(record => !record.path.startsWith('/transition/'));
    expect(transitions.map(record => record.path)).toEqual([
      '/transition/ping',
      '/transition/ping',
      '/transition/boom',
    ]);
    expect(pages.length).toBeGreaterThanOrEqual(20);
    for (const record of [...transitions, ...pages]) {
      expect(record.headers!['sentry-trace']).toMatch(/^[0-9a-f]{32}-[0-9a-f]{16}/);
      expect(record.headers!.baggage).toContain('sentry-trace_id=');
      expect(record.headers!['x-datadog-trace-id']).toMatch(/^\d+$/);
      expect(record.headers!.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);
    }

    // The server error hook (onError) gets the failing transition with the browser's trace.
    const serverErrors = all.filter(record => record.kind === 'server-error');
    expect(serverErrors.map(({ path, message }) => ({ path, message }))).toEqual([
      { path: '/transition/boom', message: 'server boom' },
    ]);
    expect(serverErrors[0].headers!['sentry-trace']).toBe(transitions[2].headers!['sentry-trace']);

    expect(csp).toEqual([]);
    expect(failures).toEqual([]);
  });
