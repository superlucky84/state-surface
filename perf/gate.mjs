import { chromium } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { startServer } from './server.mjs';

/**
 * Performance gate (DC-17, DESIGN 9.3, V-17), on the production build (`pnpm build`):
 *
 * 1. Home and guide: engine JS requested before the page's `load` event, gzip level 9, at
 *    most 30% of the stage 0 baseline (a 70% reduction). Work the engine defers on purpose
 *    (`idle`/`visible` components and plugins) loads later and is reported separately.
 * 2. Every representative page: CLS ≤ 0.1 (session window, as perf/measure.mjs).
 *
 * The other DESIGN 9.3 gates run as e2e tests: a static page without router, actions, boot or
 * plugins loads no engine JS, and 200 router navigations leave listeners, nodes, observers
 * and plugins unchanged (`pnpm test:modes`). Engine and app chunks are told apart through the
 * Vite manifest: modules under `engine/` and Lithent are engine; app components, plugins and
 * the app entry are not.
 *
 *   node perf/gate.mjs [results.json]
 */
const BASELINE_GZIP = 28_147; // perf/baseline-summary.md, stage 0
const LIMIT = Math.floor(BASELINE_GZIP * 0.3);
const MAX_CLS = 0.1;
const RUNS = 3;
const pages = [
  { path: '/en', size: true },
  { path: '/en/guide/quickstart', size: true },
  { path: '/en/examples/search' },
  { path: '/en/examples/chat' },
];

const manifest = JSON.parse(readFileSync('dist/client/.vite/manifest.json', 'utf8'));
const engineNames = new Set([
  ...readdirSync('engine/client').map(file => file.replace(/\.[^.]+$/, '')),
  'lithent',
  'jsxRuntime',
]);
const byFile = new Map(
  Object.entries(manifest).map(([key, entry]) => [entry.file, { key, ...entry }])
);
/** Engine chunk: an engine module, or a shared chunk named after one (Vite keys those `_name`). */
const isEngine = file => {
  const entry = byFile.get(file);
  if (!entry) return false;
  if (entry.src) return entry.src.startsWith('engine/') || entry.src.includes('node_modules/');
  return engineNames.has(entry.name);
};

const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const server = await startServer(Number(process.env.PERF_PORT ?? 3220));
const browser = await chromium.launch();
const results = [];
try {
  for (const scenario of pages) {
    const samples = [];
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
        await page.addInitScript(() => {
          const m = (window.__gate = { cls: 0, session: 0, first: 0, last: 0 });
          new PerformanceObserver(list => {
            for (const e of list.getEntries()) {
              if (e.hadRecentInput) continue;
              if (e.startTime - m.last > 1000 || e.startTime - m.first > 5000) {
                m.session = 0;
                m.first = e.startTime;
              }
              m.session += e.value;
              m.last = e.startTime;
              m.cls = Math.max(m.cls, m.session);
            }
          }).observe({ type: 'layout-shift', buffered: true });
        });
        const bodies = new Map();
        const pending = [];
        page.on('response', response => {
          if (response.request().resourceType() !== 'script') return;
          pending.push(
            response.body().then(
              body =>
                bodies.set(new URL(response.url()).pathname, gzipSync(body, { level: 9 }).length),
              () => {}
            )
          );
        });
        await page.goto(server.origin + scenario.path, { waitUntil: 'load' });
        await page.waitForLoadState('networkidle');
        await Promise.all(pending);
        const timing = await page.evaluate(() => ({
          load: performance.getEntriesByType('navigation')[0].loadEventStart,
          scripts: performance
            .getEntriesByType('resource')
            .filter(entry => entry.initiatorType === 'script' || entry.name.endsWith('.js'))
            .map(entry => ({ path: new URL(entry.name).pathname, start: entry.startTime })),
          cls: window.__gate.cls,
        }));
        const scripts = timing.scripts
          .filter(script => bodies.has(script.path))
          .map(script => ({
            ...script,
            gzip: bodies.get(script.path),
            engine: isEngine(script.path.slice(1)),
            initial: script.start < timing.load,
          }));
        const sum = list => list.reduce((total, script) => total + script.gzip, 0);
        samples.push({
          engineInitial: sum(scripts.filter(script => script.engine && script.initial)),
          engineTotal: sum(scripts.filter(script => script.engine)),
          appTotal: sum(scripts.filter(script => !script.engine)),
          cls: timing.cls,
          scripts,
        });
      } finally {
        await context.close();
      }
    }
    const result = {
      path: scenario.path,
      engineInitialGzip: median(samples.map(sample => sample.engineInitial)),
      engineTotalGzip: median(samples.map(sample => sample.engineTotal)),
      appTotalGzip: median(samples.map(sample => sample.appTotal)),
      cls: Math.max(...samples.map(sample => sample.cls)),
      chunks: samples[0].scripts.map(
        ({ path, gzip, engine, initial }) =>
          `${path.replace(/^\/assets\//, '').replace(/-[\w-]{8}\.js$/, '')}:${gzip}${engine ? '' : ' (app)'}${initial ? '' : ' (after load)'}`
      ),
    };
    results.push(result);
    console.log(
      `${scenario.path}: engine ${result.engineInitialGzip} B before load (${result.engineTotalGzip} B at network idle), app ${result.appTotalGzip} B, CLS ${result.cls.toFixed(3)}\n  ${result.chunks.join(', ')}`
    );
  }
} finally {
  await browser.close();
  await server.stop();
}

const failures = [];
for (const [index, result] of results.entries()) {
  if (pages[index].size && result.engineInitialGzip > LIMIT)
    failures.push(
      `${result.path}: engine JS ${result.engineInitialGzip} B > ${LIMIT} B (70% below ${BASELINE_GZIP} B)`
    );
  if (result.cls > MAX_CLS) failures.push(`${result.path}: CLS ${result.cls} > ${MAX_CLS}`);
}
const output = process.argv[2];
if (output) {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(
    output,
    JSON.stringify(
      { baseline: BASELINE_GZIP, limit: LIMIT, maxCls: MAX_CLS, results, failures },
      null,
      2
    ) + '\n'
  );
}
if (failures.length) {
  console.error(`Performance gate failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(
  `Performance gate passed (engine JS ≤ ${LIMIT} B on home and guide, CLS ≤ ${MAX_CLS}).`
);
