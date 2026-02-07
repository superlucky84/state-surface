# BOOTSTRAP (v1)

Build the first runnable skeleton quickly.
Read order: `DESIGN.md` -> `PROTOCOL.md` -> `IMPLEMENT.md` -> `BOOTSTRAP.md`.

## 1) Environment

- Node.js: latest stable
- pnpm: `10.13.1`

Check:

```bash
node -v
pnpm -v
```

## 2) Minimum Folder Layout

```txt
server/
client/
shared/
routes/
client/templates/
client/runtime/
```

Route-local templates/transitions live under `routes/**/templates` and `routes/**/transitions`.

## 3) Minimum File Creation Order

1. `shared/protocol.ts`
   - `StateFrame` types + runtime validator skeleton
2. `server/index.ts`
   - Express server
   - `POST /transition/:name` NDJSON stream route
3. `server/ssr.ts`
   - parser-based `fillHState`
   - `safeStateJSON`
4. `client/runtime/stateSurface.ts`
   - anchor discovery
   - bootstrap + hydration
   - frame queue apply (full/partial)
5. `client/templates/registry.ts`
   - static template registry + helpers
6. `client/templates/auto.ts`
   - auto-register templates from `routes/**/templates`
7. `client/main.ts`
   - initial hydrate + transition trigger wiring
8. `index.html`
   - `<h-state>` anchors
   - `__STATE__` injection point

## 4) Required Scripts

- `dev`
- `build`
- `test`

## 5) First NDJSON Smoke Frames

```json
{"type":"state","states":{"page:article:view":{"articleId":1},"loading":{"articleId":1}}}
{"type":"state","full":false,"states":{"page:article:view":{"article":{"id":1,"title":"Hello"}}},"changed":["page:article:view"],"removed":["loading"]}
{"type":"done"}
```

## 6) Immediate Verification

- `pnpm dev` starts server/client without immediate runtime crash
- `<h-state>` anchors are discovered on page load
- first user action triggers transition request
- NDJSON frames apply and DOM updates are visible
- error path works with `system:error` when anchor exists

## 7) First Failure Checklist

- NDJSON split/parse edge cases (line/chunk boundaries)
- `full:false` contract violations (`changed`/`removed`)
- missing template key in static registry
- unsafe `__STATE__` embed/parse
