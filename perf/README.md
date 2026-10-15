# Stage 0 browser baseline

Run from the repository root with Node 24 and pnpm 10.13.1:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
pnpm build
pnpm test:e2e
pnpm perf perf/baseline.json
pnpm perf perf/repeat.json
pnpm perf:compare perf/baseline.json perf/repeat.json
```

Cloud shells use `export COREPACK_HOME=/workspace/.cache/corepack`,
`export PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright`, and
`corepack pnpm` in place of a global pnpm. If the default pnpm data directory is
unavailable, also set `XDG_DATA_HOME=/workspace/.cache/data` and install with
`--store-dir /workspace/.cache/pnpm/store`.

Do not run measurements alongside builds or other tests. The harness starts and
stops its own production server on port 3200 (override `PERF_PORT`), rejects a port
already in use, and never reuses a dev server. Each of four pages gets five fresh
browser contexts: Chromium pinned by Playwright, 1280×720 viewport, CPU 4x,
4 Mbps down / 3 Mbps up / 20 ms latency, disabled cache, identity HTTP encoding.
The exact browser version, environment, source commit, individual samples and
medians are saved. Initial JS gzip is computed at level 9 from actually loaded
response bodies. The legacy build has a single shared chunk: engine, Lithent,
app entry, and plugins cannot yet be measured separately. HTML/CSS/boot JSON byte
counts are identity response body sizes; JSON is not included in the JS total.

`ssrRoundTripMs` is a direct unthrottled loopback request through complete HTML
consumption, including request overhead; it is not isolated server render time.
TTFB and document-load timing come from browser Navigation Timing. First action
measures the actual click through the first child/text mutation in the action's
output slot and the next animation frame; pending attribute changes are excluded.
Lab INP reports the maximum Event Timing duration with an interaction ID; values
below the browser's 16 ms reporting threshold produce `null`, not a false zero.
CLS uses the maximum session window (1 s gap / 5 s duration), excludes recent
input, and is collected through action completion. None is a field p75 claim.
Document navigation uses the actual Home link under the same throttling.

The performance CI job is report-only. A failed measurement still exits nonzero
and reports a job failure; job-level `continue-on-error` keeps it from blocking
stage 0. Browser parity is a required job for both `/` and `BASE_PATH=/demo`, built
with the matching prefix. Browser traces and HTML reports are uploaded on failure.
Performance on different runners is observational; compare baseline and repeat
on the same idle machine before attributing changes to the runtime.

`e2e/spikes.spec.ts` contains reproducible architecture probes (namespaced JSX,
hydration edits, connected `moveBefore`, idiomorph island exclusion). Their outcomes
and any required follow-up are recorded in the stage 0 execution log. Chromium
capability checks do not establish Firefox/Safari support or manual release approval.
