import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { startServer } from './server.mjs';

const output = process.argv[2] ?? 'perf/results/latest.json';
// Stage 7: languages are paths and the home page and guides are prerendered without an in-page
// action (the KO switch is a link), so they are measured on load only.
const scenarios = [
  { path: '/en' },
  { path: '/en/guide/quickstart' },
  {
    path: '/en/examples/search',
    target: 'search:results',
    button: 'Search',
    input: 'query',
    value: 'streaming',
  },
  {
    path: '/en/examples/chat',
    target: 'chat:messages',
    button: 'Send',
    input: 'message',
    value: 'surface',
  },
];
const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const server = await startServer(Number(process.env.PERF_PORT ?? 3200));
let browser;
try {
  browser = await chromium.launch();
  const report = {
    schemaVersion: 1,
    measuredAt: new Date().toISOString(),
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    browser: browser.version(),
    node: process.version,
    conditions: {
      cpuSlowdown: 4,
      downloadBytesPerSecond: 4_000_000 / 8,
      uploadBytesPerSecond: 3_000_000 / 8,
      latencyMs: 20,
      cache: 'disabled; fresh context per sample',
      compression: 'identity HTTP; gzip sizes computed from response bodies at level 9',
      samples: 5,
      viewport: { width: 1280, height: 720 },
      server:
        'localhost production; direct SSR roundtrip is a proxy, not isolated server render time',
      labInp:
        'maximum Event Timing duration with nonzero interactionId; short lab sample, not field INP',
      cls: 'maximum session window (1s gap / 5s duration), excluding recent input',
    },
    pages: [],
  };
  for (const scenario of scenarios) {
    const samples = [];
    for (let run = 0; run < 5; run++) {
      const context = await browser.newContext({ viewport: report.conditions.viewport });
      try {
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
        await cdp.send('Network.setExtraHTTPHeaders', {
          headers: { 'Accept-Encoding': 'identity' },
        });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await cdp.send('Network.emulateNetworkConditions', {
          offline: false,
          latency: 20,
          downloadThroughput: 500_000,
          uploadThroughput: 375_000,
          connectionType: 'cellular4g',
        });
        await page.addInitScript(() => {
          window.__measurement = {
            cls: 0,
            session: 0,
            firstShift: 0,
            lastShift: 0,
            interactions: [],
          };
          new PerformanceObserver(list => {
            const m = window.__measurement;
            for (const e of list.getEntries()) {
              if (e.hadRecentInput) continue;
              if (e.startTime - m.lastShift > 1000 || e.startTime - m.firstShift > 5000) {
                m.session = 0;
                m.firstShift = e.startTime;
              }
              m.session += e.value;
              m.lastShift = e.startTime;
              m.cls = Math.max(m.cls, m.session);
            }
          }).observe({ type: 'layout-shift', buffered: true });
          new PerformanceObserver(list => {
            for (const e of list.getEntries())
              if (e.interactionId) window.__measurement.interactions.push(e.duration);
          }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
        });
        const assets = [];
        const pending = [];
        const collect = response => {
          const kind = response.request().resourceType();
          if (!['script', 'stylesheet', 'document', 'fetch'].includes(kind)) return;
          pending.push(
            (async () => {
              if (!response.ok()) throw new Error(`${response.status()} ${response.url()}`);
              const body = await response.body();
              assets.push({
                path: new URL(response.url()).pathname,
                kind,
                bytes: body.length,
                gzipBytes: gzipSync(body, { level: 9 }).length,
              });
            })()
          );
        };
        page.on('response', collect);
        await page.goto(server.origin + scenario.path);
        await page.waitForLoadState('networkidle');
        await Promise.all(pending);
        page.off('response', collect);
        // This legacy build has one inseparable shared JS chunk (runtime + Lithent + app + plugins).
        const initialAssets = assets.sort((a, b) => a.path.localeCompare(b.path));
        const directStart = performance.now();
        const direct = await fetch(server.origin + scenario.path);
        if (!direct.ok) throw new Error(`SSR failed: ${direct.status}`);
        await direct.text();
        const ssrRoundTripMs = performance.now() - directStart;
        let firstActionMs = null;
        if (scenario.button) {
          if (scenario.input)
            await page.locator(`input[name="${scenario.input}"]`).fill(scenario.value);
          const target = page.locator(`h-state[name="${scenario.target}"]`);
          if ((await target.count()) !== 1)
            throw new Error(`Missing action target: ${scenario.target}`);
          await page.evaluate(name => {
            const target = document.querySelector(`h-state[name="${name}"]`);
            let clickedAt;
            window.__firstPatch = new Promise((resolve, reject) => {
              const timer = setTimeout(() => {
                observer.disconnect();
                reject(new Error('No DOM patch within 10s'));
              }, 10000);
              const observer = new MutationObserver(() => {
                if (clickedAt === undefined) return;
                observer.disconnect();
                clearTimeout(timer);
                requestAnimationFrame(() => resolve(performance.now() - clickedAt));
              });
              observer.observe(target, { childList: true, subtree: true, characterData: true });
              document.addEventListener(
                'click',
                () => {
                  clickedAt = performance.now();
                },
                { once: true, capture: true }
              );
            });
          }, scenario.target);
          await page.getByRole('button', { name: scenario.button, exact: true }).click();
          firstActionMs = await page.evaluate(() => window.__firstPatch);
          await page.waitForLoadState('networkidle');
        }
        const metrics = await page.evaluate(() => {
          const nav = performance.getEntriesByType('navigation')[0];
          return {
            cls: window.__measurement.cls,
            labInpMs: window.__measurement.interactions.length
              ? Math.max(...window.__measurement.interactions)
              : null,
            documentLoadMs: nav.loadEventEnd - nav.startTime,
            ttfbMs: nav.responseStart - nav.requestStart,
          };
        });
        // Genuine document navigation, measured in the same throttled cold-cache session.
        await page.getByRole('link', { name: 'Home', exact: true }).click();
        await page.waitForLoadState('load');
        const navigationMs = await page.evaluate(
          () => performance.getEntriesByType('navigation')[0].loadEventEnd
        );
        const total = kind =>
          initialAssets.filter(a => a.kind === kind).reduce((n, a) => n + a.bytes, 0);
        samples.push({
          run: run + 1,
          initialAssets,
          initialJsGzipBytes: initialAssets
            .filter(a => a.kind === 'script')
            .reduce((n, a) => n + a.gzipBytes, 0),
          htmlBytes: total('document'),
          cssBytes: total('stylesheet'),
          bootJsonBytes: total('fetch'),
          ssrRoundTripMs,
          firstActionMs,
          ...metrics,
          documentNavigationMs: navigationMs,
        });
        console.log(
          `${scenario.path} ${run + 1}/5: JS gzip=${samples.at(-1).initialJsGzipBytes} first action=${firstActionMs === null ? '-' : `${firstActionMs.toFixed(1)}ms`}`
        );
      } finally {
        await context.close();
      }
    }
    const keys = [
      'initialJsGzipBytes',
      'htmlBytes',
      'cssBytes',
      'bootJsonBytes',
      'ssrRoundTripMs',
      'firstActionMs',
      'cls',
      'labInpMs',
      'documentLoadMs',
      'ttfbMs',
      'documentNavigationMs',
    ];
    report.pages.push({
      path: scenario.path,
      samples,
      median: Object.fromEntries(
        keys.map(key => [
          key,
          samples.every(s => s[key] !== null) ? median(samples.map(s => s[key])) : null,
        ])
      ),
    });
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`Saved ${output}`);
} finally {
  await browser?.close();
  await server.stop();
}
