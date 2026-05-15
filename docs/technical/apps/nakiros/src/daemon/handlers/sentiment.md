# sentiment

**Path:** `apps/nakiros/src/daemon/handlers/sentiment.ts`

IPC handler for the sentiment pre-pass trace reader. Exposes one channel to query the persisted `SentimentTrace` produced by the ingest runner's ONNX scoring pass.

## IPC channels

- `sentiment:getTrace` — read the persisted `SentimentTrace` for a given `projectPath` + `sessionId`; returns `{ ok: true, trace: SentimentTrace | null }` or `{ ok: false, error: string }`

## Exports

### `GetSentimentTraceRequest`

```ts
export interface GetSentimentTraceRequest {
  projectPath: string;
  sessionId: string;
}
```

Request shape for `getSentimentTrace`.

### `GetSentimentTraceResult`

```ts
export type GetSentimentTraceResult =
  | { ok: true; trace: SentimentTrace | null }
  | { ok: false; error: string }
```

Response shape for `getSentimentTrace`. Returns `trace: null` when no trace has been produced yet for the session.

### `getSentimentTrace`

```ts
export async function getSentimentTrace(
  req: GetSentimentTraceRequest,
): Promise<GetSentimentTraceResult>
```

Read a persisted sentiment trace for a given ingest session. Returns `{ ok: true, trace }` where `trace` is the persisted `SentimentTrace` or `null` if no trace exists yet. Returns `{ ok: false, error }` on bad input or unexpected I/O failure.

**Parameters:**
- `req` — `projectPath` and `sessionId` that identify the session

### `sentimentHandlers`

```ts
export const sentimentHandlers: HandlerRegistry
```

IPC handler registry for the `sentiment:*` channel family. Spread into `buildHandlerRegistry()` in `handlers/index.ts`.
