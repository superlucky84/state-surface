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
      full?: boolean;        // default true
      accumulate?: boolean;  // default false — stack delta into existing slot state
      changed?: string[];
      removed?: string[];
    }
  | { type: "error"; message?: string; template?: string; data?: any }
  | { type: "done" };
```

## State Frame Rules

- `type` and `states` are required for `state`
- `full` defaults to `true`
- `accumulate` defaults to `false`
- First frame in a stream MUST be full (not accumulate)
- If `full === false`, at least one of `changed` or `removed` is required
- If `full === false` and `changed` exists, all keys in `changed` must exist in `states`
- If `full === false`, keys in `removed` must NOT exist in `states`
- Delete-only partial is valid (`states: {}` with `removed`)
- If `accumulate === true`, `removed` is not allowed and `full` is ignored

## Precedence Rules

- If `accumulate === true`: merge delta into `activeStates` per slot (arrays concat, strings concat, objects shallow-merge, scalars replace); `full` and `removed` are ignored
- If `full !== false` (and not accumulate), treat as full and ignore `changed`/`removed`
- If `full === false` (and not accumulate), apply `removed` first, then apply `changed` via `states`
- A key cannot appear in both `changed` and `removed` in one frame (invalid)

## Accumulate Merge Semantics

Per slot, the incoming data is merged into the existing `activeStates[slot]`:

| Field type | Merge behavior |
|---|---|
| Array | `[...existing, ...incoming]` (concat) |
| String | `existing + incoming` (concat) |
| Object | `{ ...existing, ...incoming }` (shallow merge) |
| Scalar (number, boolean, null) | `incoming` (replace) |

If the slot does not yet exist in `activeStates`, the incoming data is used as-is.

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

### Accumulate — string delta (streaming text)

```json
{"type":"state","accumulate":true,"states":{"chat:current":{"text":" world"}}}
```

Runtime concatenates `activeStates['chat:current'].text += ' world'`.

### Accumulate — array append (chat history)

```json
{"type":"state","accumulate":true,"states":{"chat:messages":{"messages":[{"id":"b-1","role":"bot","text":"Hello"}]}}}
```

Runtime concatenates `activeStates['chat:messages'].messages = [...existing, newMsg]`.

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

### Invalid: accumulate with removed

```json
{"type":"state","accumulate":true,"states":{"chat:current":{"text":"x"}},"removed":["chat:typing"]}
```

### Invalid: accumulate as first frame in stream

Accumulate presupposes an existing baseline. The first frame must always be full.
Using accumulate as the first frame is a protocol violation — runtime behavior is undefined.

## Error/Done Handling Contract

- Error key convention: `system:error` (anchor is recommended, not required)
- If matching error anchor exists, render error template as full state
- If no matching anchor exists, stop stream and surface error
- `done` means flush queued frames, then end stream
