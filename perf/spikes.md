# Stage 0 architecture probes — 2026-10-15

Reproduce with `pnpm build && pnpm test:spikes`. These are observations of the
legacy dependencies, not claims that the StateSurface 2.0 contracts are implemented.

| Probe                            | Observation                                                                                                                      | Follow-up                                                                                                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `client:visible`, `server:defer` | oxc-parser 0.94.0 parses JSXNamespacedName; Vite 7.3.1/esbuild transforms to quoted props; Lithent 1.21.7 receives both booleans | IC-01 feasibility established; keep final decision at stage 2 Entry                                                                                                            |
| Hydration after editing          | Same input node and focus; `user edited` becomes `snapshot`, selection `[2,5]` becomes `[8,8]`                                   | V-04 fails without explicit input/selection preservation or an upstream hydration fix; implement in stage 5 and turn this characterization into a preservation regression test |
| Connected `moveBefore`           | Chromium 141 preserves iframe `contentDocument` identity and input focus, but selection `[1,3]` becomes `[0,0]`                  | Snapshot/restore selection in stage 6, keep nodes connected throughout; cross-browser manual validation still required                                                         |
| idiomorph 0.7.4                  | `beforeNodeMorphed` false at island root preserves input identity/value while sibling text changes                               | Guard callback nodes with `instanceof Element` (text nodes also reach callback); finalize IC-06 in stage 4                                                                     |

Browser range: [MDN BCD Element.moveBefore](https://github.com/mdn/browser-compat-data/blob/main/api/Element.json)
queried on 2026-10-15 reports Chrome 133+, Firefox 144+, Safari unsupported (including
mirrored iOS support). Use runtime feature detection and documented `insertBefore`
fallback; the fallback cannot promise iframe connection preservation. This is
compatibility data, not a Firefox/Safari test run.

The hydration and selection probes assert the observed limitation explicitly. They
must not be counted as V-04/V-21 compliance. Production parity tests separately
verify the existing demo's user behavior. No runtime behavior was changed to make
these probes pass. The pre-existing Lithent SSR attribute escaping prerequisite
for stage 2 remains outstanding.

## Stage 2 Entry update (2026-10-16)

Lithent 1.25.1 now escapes SSR attribute values. A Chromium regression checks JSON and markup payload round-trips without adding attributes or script elements. Namespaced directives still pass; IC-01 is resolved in IMPLEMENT.md. The edited input/selection reset still reproduces with 1.25.1, so V-04 remains a stage 5 requirement. The other baseline observations remain historical evidence.
