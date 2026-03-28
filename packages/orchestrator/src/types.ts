import type { AgentProvider, AgentRunRequest } from '@nakiros/shared';

export type { AgentProvider, AgentRunRequest };

// ─── Events émis par le runner (renderer + CLI consumers) ────────────────────

export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; display: string }
  | { type: 'session'; id: string };

// ─── Protocole NDJSON CLI → consommateur (bridge, scripts) ───────────────────

export type CliEvent =
  | StreamEvent
  | { type: 'start'; runId: string; conversationId: string; agentId: string; command: string; cwd: string }
  | { type: 'done'; runId: string; exitCode: number }
  | { type: 'error'; runId: string; message: string; exitCode: number };

// ─── Run lifecycle ────────────────────────────────────────────────────────────

export interface RunStartInfo {
  runId: string;           // bridgeRunId (for event routing in renderer)
  conversationId: string;  // conv_xxx (the nakiros conversation ID)
  agentId: string;         // 'nakiros', 'architect', 'pm', etc.
  command: string;
  cwd: string;
}
