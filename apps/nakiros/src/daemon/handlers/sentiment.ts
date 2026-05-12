import type { SentimentTrace } from '@nakiros/shared';
import { IPC_CHANNELS } from '@nakiros/shared';

import { loadSentimentTrace } from '../../services/sentiment/sentiment-store.js';
import { createTypedHandler } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

/**
 * Request shape for {@link getSentimentTrace}.
 */
export interface GetSentimentTraceRequest {
  projectPath: string;
  sessionId: string;
}

/**
 * Response shape for {@link getSentimentTrace}.
 * Returns the persisted {@link SentimentTrace} or `null` when no trace has been
 * produced yet for the given session.
 */
export type GetSentimentTraceResult =
  | { ok: true; trace: SentimentTrace | null }
  | { ok: false; error: string };

/**
 * Read a persisted sentiment trace for a given ingest session.
 *
 * @param req - `projectPath` and `sessionId` that identify the session.
 * @returns `{ ok: true, trace }` where `trace` is the persisted
 *   {@link SentimentTrace} or `null` if no trace exists yet.
 *   Returns `{ ok: false, error }` on bad input or unexpected I/O failure.
 */
export async function getSentimentTrace(
  req: GetSentimentTraceRequest,
): Promise<GetSentimentTraceResult> {
  if (!req?.projectPath || !req?.sessionId) {
    return { ok: false, error: 'missing-args' };
  }
  try {
    const trace = loadSentimentTrace(req.projectPath, req.sessionId);
    return { ok: true, trace };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * IPC handler registry for the `sentiment:*` channel family.
 *
 * Channels registered:
 * - `sentiment:getTrace` — read a persisted {@link SentimentTrace} by
 *   `projectPath` + `sessionId`.
 */
export const sentimentHandlers: HandlerRegistry = {
  [IPC_CHANNELS['sentiment:getTrace']]: createTypedHandler(
    async (req: GetSentimentTraceRequest): Promise<GetSentimentTraceResult> =>
      getSentimentTrace(req),
  ),
};
