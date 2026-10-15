# Stage 0 measurement results — 2026-10-15

Runtime source: `94e404684da0ee69bceb63d8f6c03fb72c34af54`. Measurements were taken before the production BASE_PATH static-mount fix added in this stage. Root-page rendering and the measured JS/CSS bundles are unchanged by that fix.

Chromium 141.0.7390.37, Node v24.19.0. Two sequential runs of five samples per page, CPU 4x / Fast 4G; see [conditions](README.md). Sizes and timings below are medians.

| Page                | Initial JS gzip (B) | HTML / CSS / boot JSON (B) | First action 1 / 2 (ms) | Median change | Lab INP 1 / 2 (ms) | CLS 1 / 2 |
| ------------------- | ------------------: | -------------------------- | ----------------------- | ------------: | ------------------ | --------- |
| `/`                 |               28147 | 9655 / 37415 / 0           | 155.8 / 143.9           |         -7.6% | 24 / 24            | 0 / 0     |
| `/guide/quickstart` |               28147 | 10326 / 37415 / 10584      | 303.9 / 314.7           |         +3.6% | 40 / 32            | 0 / 0     |
| `/examples/search`  |               28147 | 4408 / 37415 / 0           | 102.2 / 97.8            |         -4.3% | 24 / 24            | 0 / 0     |
| `/examples/chat`    |               28147 | 4916 / 37415 / 0           | 118.9 / 115.5           |         -2.9% | 16 / 24            | 0 / 0     |

All size medians are identical between runs. First-action median drift ranges from -7.6% to +3.6%; these are baseline noise observations, not a performance improvement. The 70% reduction target for the shared legacy initial chunk is ≤8,444 bytes gzip; component-category accounting becomes possible after splitting the bundle.

SSR loopback roundtrip medians (run 1 / run 2, ms):

- `/`: 4.60 / 4.39
- `/guide/quickstart`: 4.30 / 4.02
- `/examples/search`: 3.44 / 3.02
- `/examples/chat`: 2.77 / 3.05

These timings include loopback request overhead and are not isolated SSR render durations. The lab INP values are short interaction samples and must not be presented as field p75. Raw samples, asset-by-asset sizes, TTFB, document load and document navigation timings are retained in [baseline.json](baseline.json) and [repeat.json](repeat.json). No performance thresholds are enforced in stage 0.

Architecture probe limitations and mandatory later fixes are recorded in [spikes.md](spikes.md). Cross-browser/device/screen-reader manual release checks are unrun.
