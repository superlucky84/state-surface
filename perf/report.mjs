import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { startServer } from './server.mjs';

/**
 * DC-17 report metrics (DESIGN 9.3) that perf/measure.mjs does not cover, on the
 * production build (`pnpm build`, and `pnpm build:adapter-app` for the Workers bundle):
 *
 * - loader, router and the other engine chunks (gzip -9),
 * - server bundles (Node `dist/server.js`, each adapter app's entry),
 * - router navigation: link click → `surface:page-load` of the next page, CPU 4x / Fast 4G,
 * - Workers startup proxy: evaluation of the Workers bundle and its first dynamic response in
 *   a fresh Node process (V8, like workerd). Cloudflare measures startup on upload; this is
 *   a local stand-in, not that number.
 *
 * Report-only (no thresholds). INP, first action and document navigation: `pnpm perf`.
 *
 *   node perf/report.mjs [results.json]
 */
const RUNS = 5;
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const gzip = file => gzipSync(readFileSync(file), { level: 9 }).length;

const manifest = JSON.parse(readFileSync('dist/client/.vite/manifest.json', 'utf8'));
const chunk = source => {
  const entry =
    manifest[source] ??
    Object.values(manifest).find(item => item.isDynamicEntry && item.name === source);
  return entry && `dist/client/${entry.file}`;
};
const chunks = Object.fromEntries(
  [
    ['loader', 'engine/client/loader.ts'],
    ['router', 'engine/client/router.ts'],
    ['runtime', 'engine/client/runtime.ts'],
    ['components', 'engine/client/components.ts'],
    ['plugins', 'pluginEntry'],
    ['actionEvents', 'engine/client/actionEvents.ts'],
    ['lithentBridge', 'engine/client/lithentBridge.ts'],
    ['morph', 'engine/client/morph.ts'],
  ].flatMap(([name, source]) => {
    const file = chunk(source);
    return file ? [[name, gzip(file)]] : [];
  })
);

const servers = Object.fromEntries(
  [
    ['node (dist/server.js)', 'dist/server.js'],
    ...['node', 'express', 'bun', 'deno', 'cloudflare'].map(name => [
      name,
      `dist/adapter-app/${name}/server.mjs`,
    ]),
  ].flatMap(([name, file]) =>
    existsSync(file) ? [[name, { bytes: readFileSync(file).length, gzip: gzip(file) }]] : []
  )
);

/** One fresh process per sample: import the Workers module, answer one dynamic page. */
const WORKER_PROBE = `
const start = performance.now();
const { default: worker } = await import(process.argv[1]);
const evaluated = performance.now();
const response = await worker.fetch(
  new Request('http://localhost/en/examples/search'),
  { ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } },
  { waitUntil() {}, passThroughOnException() {} }
);
await response.text();
console.log(JSON.stringify({
  status: response.status,
  evaluateMs: evaluated - start,
  firstResponseMs: performance.now() - start,
}));`;
let workers;
const workerBundle = 'dist/adapter-app/cloudflare/server.mjs';
if (existsSync(workerBundle)) {
  const samples = Array.from({ length: RUNS }, () =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          WORKER_PROBE,
          new URL(`../${workerBundle}`, import.meta.url).href,
        ],
        { encoding: 'utf8' }
      )
    )
  );
  if (samples.some(sample => sample.status !== 200))
    throw new Error(`Workers bundle answered ${samples.map(sample => sample.status)}`);
  workers = {
    evaluateMs: Number(median(samples.map(sample => sample.evaluateMs)).toFixed(1)),
    firstResponseMs: Number(median(samples.map(sample => sample.firstResponseMs)).toFixed(1)),
    note: 'fresh Node process per sample (V8 module evaluation + first SSR); not Cloudflare startup',
  };
}

const server = await startServer(Number(process.env.PERF_PORT ?? 3240));
const browser = await chromium.launch();
const navigations = [];
try {
  for (let run = 0; run < RUNS; run++) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    try {
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 20,
        downloadThroughput: 500_000,
        uploadThroughput: 375_000,
        connectionType: 'cellular4g',
      });
      await page.goto(server.origin + '/en', { waitUntil: 'load' });
      await page.waitForLoadState('networkidle');
      const forward = await page.evaluate(
        () =>
          new Promise(resolve => {
            const link = document.querySelector('header a[href="/en/examples"]');
            const start = performance.now();
            document.addEventListener(
              'surface:page-load',
              () => resolve(performance.now() - start),
              { once: true }
            );
            link.click();
          })
      );
      const back = await page.evaluate(
        () =>
          new Promise(resolve => {
            const start = performance.now();
            document.addEventListener(
              'surface:page-load',
              () => resolve(performance.now() - start),
              { once: true }
            );
            history.back();
          })
      );
      navigations.push({ forward, back });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server.stop();
}

const report = {
  measuredAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  node: process.version,
  engineChunksGzip: chunks,
  serverBundles: servers,
  workersStartupProxy: workers ?? null,
  routerNavigation: {
    conditions: 'CPU 4x, Fast 4G (20 ms, 500 KB/s down), cache disabled, /en → /en/examples → back',
    forwardMs: Number(median(navigations.map(item => item.forward)).toFixed(1)),
    backMs: Number(median(navigations.map(item => item.back)).toFixed(1)),
    samples: navigations,
  },
};
console.log(JSON.stringify(report, null, 2));
const output = process.argv[2];
if (output) {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
}
