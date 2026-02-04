# StateSurface Protocol (v1)

This file is the implementation-facing contract for NDJSON frame exchange.
It mirrors decisions already locked in `DESIGN.md`.

## Transport

- Endpoint: `POST /transition/:name`
- Response type: `application/x-ndjson`
- One JSON frame per line
- Stream order is preserved

## Frame Types

```ts
type StateFrame =
  | {
      type: "state";
      states: Record<string, any>;
      full?: boolean; // default true
      changed?: string[];
      removed?: string[];
    }
  | { type: "error"; message?: string; template?: string; data?: any }
  | { type: "done" };
```

## State Frame Rules

- `type` and `states` are required for `state`
- `full` defaults to `true`
- First frame in a stream MUST be full
- If `full === false`, at least one of `changed` or `removed` is required
- If `full === false` and `changed` exists, all keys in `changed` must exist in `states`
- If `full === false`, keys in `removed` must NOT exist in `states`
- Delete-only partial is valid (`states: {}` with `removed`)

## Precedence Rules

- If `full !== false`, treat as full and ignore `changed`/`removed`
- If `full === false`, apply `removed` first, then apply `changed` via `states`
- A key cannot appear in both `changed` and `removed` in one frame (invalid)

## Valid NDJSON Examples

### Full (first frame)

```json
{"type":"state","states":{"page:article:view":{"articleId":1},"loading":{"articleId":1}}}
```

### Partial update

```json
{"type":"state","full":false,"states":{"page:article:view":{"article":{"id":1,"title":"A"}}},"changed":["page:article:view"],"removed":[]}
```

### Partial remove-only

```json
{"type":"state","full":false,"states":{},"removed":["loading"]}
```

### Error

```json
{"type":"error","template":"system:error","data":{"message":"db timeout"}}
```

### Done

```json
{"type":"done"}
```

## Invalid NDJSON Examples

### Invalid: partial without changed/removed

```json
{"type":"state","full":false,"states":{"a":{"x":1}}}
```

### Invalid: changed key missing in states

```json
{"type":"state","full":false,"states":{},"changed":["a"]}
```

### Invalid: removed key present in states

```json
{"type":"state","full":false,"states":{"a":{"x":1}},"removed":["a"]}
```

### Invalid: same key in changed and removed

```json
{"type":"state","full":false,"states":{"a":{"x":1}},"changed":["a"],"removed":["a"]}
```

## Error/Done Handling Contract

- Error key convention: `system:error` (anchor is recommended, not required)
- If matching error anchor exists, render error template as full state
- If no matching anchor exists, stop stream and surface error
- `done` means flush queued frames, then end stream
