import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';
import type { AgentProvider, AgentRunRequest, StreamEvent, RunStartInfo } from './types.js';
import { buildEnv, resolveShell } from './env.js';
import { buildRunnerCommand, formatProviderName, installHint } from './command.js';
import { handleClaudeLikeEvent, handleCodexEvent } from './stream.js';
import { buildWorkspaceContext, resolveAgentCwd } from './context.js';
import {
  createConversation,
  loadConversation,
  updateConversationMeta,
  createRunner,
  loadRunner,
  updateRunnerMeta,
  appendRunnerEvent,
  appendConversationEvent,
  readConversationDelta,
  findConversationByAgentSessionId,
  isNakirosConversationId,
} from './conversation.js';
import type { ConversationMeta, RunnerMeta } from './conversation.js';

const env = buildEnv();
const userShell = resolveShell();

interface RunEntry { kill: () => void }
const runs = new Map<string, RunEntry>();

export { resolveAgentCwd };

// ─── Context delta formatting ─────────────────────────────────────────────────

function buildContextPrefix(
  events: ReturnType<typeof readConversationDelta>['events'],
  currentAgentId: string,
): string {
  // Only include text messages from OTHER agents (not the current one re-reading its own output)
  const relevant = events.filter(
    (e): e is { type: 'text'; agentId: string; text: string } =>
      e.type === 'text' && (e as { agentId?: string }).agentId !== currentAgentId,
  );
  if (relevant.length === 0) return '';

  const lines = relevant.map((e) => `[${e.agentId}]: ${e.text}`);
  return `<conversation_context>\n${lines.join('\n\n')}\n</conversation_context>`;
}

// ─── Main runner ──────────────────────────────────────────────────────────────

export function runAgentCommand(
  provider: AgentProvider,
  request: AgentRunRequest,
  onStart: (info: RunStartInfo) => void,
  onEvent: (event: StreamEvent) => void,
  onDone: (exitCode: number, error?: string, rawLines?: unknown[]) => void,
  onRawLine?: (raw: unknown) => void,
): string {
  const workspaceSlug = request.workspaceSlug;
  const message = request.message;
  const agentId = request.agentId ?? 'default';
  const additionalDirs = request.additionalDirs ?? request.activeRepoPaths;

  // ── Conversation resolution ──────────────────────────────────────────────────
  // Priority: conversationId (conv_xxx) → agentSessionId reverse lookup → create new

  const incomingConversationId = request.conversationId ?? null;
  const incomingSessionId = request.providerSessionId ?? request.sessionId ?? null;
  let conversation: ConversationMeta | null = null;

  if (incomingConversationId && isNakirosConversationId(incomingConversationId)) {
    conversation = loadConversation(workspaceSlug, incomingConversationId);
  } else if (incomingSessionId) {
    // Backward compat: renderer passes claude UUID → find conversation via runner lookup
    conversation = findConversationByAgentSessionId(workspaceSlug, agentId, incomingSessionId);
  }

  if (!conversation) {
    conversation = createConversation({
      workspaceSlug,
      message,
      anchorRepoPath: request.anchorRepoPath,
      additionalDirs: Array.from(additionalDirs ?? []),
    });
  }

  const conversationId = conversation.id;

  // ── Runner resolution ────────────────────────────────────────────────────────

  let runner: RunnerMeta | null = loadRunner(workspaceSlug, conversationId, agentId);
  const isResume = runner !== null;

  if (!runner) {
    runner = createRunner(workspaceSlug, conversationId, agentId, provider);
    // Emit runner_started to conversation stream
    appendConversationEvent(workspaceSlug, conversationId, {
      type: 'runner_started',
      agentId,
      provider,
    });
  }

  const agentSessionId = runner.agentSessionId ?? null;

  // Store user message in conversation stream (raw message, before context injection)
  appendConversationEvent(workspaceSlug, conversationId, { type: 'user_message', text: message });

  // ── Conversation context delta ───────────────────────────────────────────────
  // Read conversation events since last run to inject as context for this agent

  const { events: deltaEvents, newCursor } = readConversationDelta(
    workspaceSlug,
    conversationId,
    runner.conversationCursor,
  );
  const contextPrefix = buildContextPrefix(deltaEvents, agentId);
  // Slash commands must appear first so the provider CLI recognises them.
  // When a nak slash command is present, append context after rather than prepending it.
  const isNakirosSlashCommand = /^\/nak-/.test(message.trimStart());
  const messageWithContext = contextPrefix
    ? (isNakirosSlashCommand ? `${message}\n\n${contextPrefix}` : `${contextPrefix}\n\n${message}`)
    : message;

  // ── CWD & dirs ──────────────────────────────────────────────────────────────
  // Prefer ~/.nakiros/workspaces/{slug}/ as CWD: symlinks to all repos are there.
  const nakirosWorkspaceDir = resolve(homedir(), '.nakiros', 'workspaces', workspaceSlug);
  const repoPath = request.anchorRepoPath;
  const cwd = resolveAgentCwd(repoPath, additionalDirs, nakirosWorkspaceDir);
  const usingWorkspaceSymlinkDir = cwd === nakirosWorkspaceDir;
  // When CWD is the workspace symlink dir, skip --add-dir: symlinks already expose all repos.
  const mergedAdditionalDirs = usingWorkspaceSymlinkDir
    ? []
    : Array.from(new Set([
        ...(repoPath ? [resolve(repoPath)] : []),
        ...((additionalDirs ?? []).filter((d) => d.trim().length > 0).map((d) => resolve(d))),
      ])).filter((d) => d !== cwd && existsSync(d));

  // ── Command ─────────────────────────────────────────────────────────────────
  const workspaceContextText = buildWorkspaceContext(workspaceSlug);
  const sessionContext = `[NAKIROS_SESSION]\nconversation_id: ${conversationId}\nworkspace_slug: ${workspaceSlug}\n[END NAKIROS_SESSION]`;
  const systemPromptParts = [workspaceContextText, sessionContext].filter(Boolean);
  const systemPrompt = provider === 'claude' ? systemPromptParts.join('\n\n') : null;
  const { shellCommand, displayCommand, addDirCount } = buildRunnerCommand({
    provider,
    message: messageWithContext,
    sessionId: agentSessionId,   // provider session ID pour --resume
    additionalDirs: mergedAdditionalDirs,
    cwd,
    systemPrompt,
  });

  process.stderr.write(`[orchestrator] Conversation: ${conversationId} (${isResume ? 'resume' : 'new'})\n`);
  process.stderr.write(`[orchestrator] Runner: ${agentId} @ ${formatProviderName(provider)} (agent session: ${agentSessionId ?? 'new'})\n`);
  process.stderr.write(`[orchestrator] Shell: ${userShell}\n`);
  process.stderr.write(`[orchestrator] CWD: ${cwd}\n`);
  process.stderr.write(`[orchestrator] Add-dirs: ${addDirCount > 0 ? addDirCount : '(none)'}\n`);
  process.stderr.write(`[orchestrator] Context delta: ${deltaEvents.length} event(s) injected\n`);
  process.stderr.write(`[orchestrator] Command: ${displayCommand}\n`);

  // The runId exposed = conversationId (top-level entity)
  const runId = conversationId;
  onStart({ runId, conversationId, agentId, command: displayCommand, cwd });

  // Append start event to runner stream
  appendRunnerEvent(workspaceSlug, conversationId, agentId, {
    type: 'start',
    runId,
    conversationId,
    agentId,
    command: displayCommand,
    cwd,
  });

  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(userShell, ['-l', '-c', shellCommand], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    process.stderr.write(`[orchestrator] Spawn error: ${msg}\n`);
    updateRunnerMeta(workspaceSlug, conversationId, agentId, { status: 'error' });
    updateConversationMeta(workspaceSlug, conversationId, { status: 'error' });
    onDone(1, msg);
    return runId;
  }

  let ndjsonBuffer = '';
  const streamState = { hasEmittedText: false };
  let stderrBuffer = '';
  const collectedRawLines: unknown[] = [];

  child.stdout?.on('data', (chunk: Buffer) => {
    ndjsonBuffer += chunk.toString('utf8');
    const lines = ndjsonBuffer.split('\n');
    ndjsonBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      process.stderr.write(`[orchestrator][${conversationId}/${agentId}] ${trimmed}\n`);
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        collectedRawLines.push(parsed);
        onRawLine?.(parsed);

        const streamEvents: StreamEvent[] = [];
        const collectEvent = (e: StreamEvent) => streamEvents.push(e);

        if (provider === 'codex') {
          handleCodexEvent(parsed as never, collectEvent, streamState);
        } else {
          handleClaudeLikeEvent(parsed as never, collectEvent, streamState);
        }

        for (const evt of streamEvents) {
          // Always persist to runner stream (raw, full)
          appendRunnerEvent(workspaceSlug, conversationId, agentId, evt);

          // Signal-only: text events go to conversation stream
          if (evt.type === 'text') {
            appendConversationEvent(workspaceSlug, conversationId, {
              type: 'text',
              agentId,
              text: evt.text,
            });
          }

          // Capture agent session ID for --resume on next run
          if (evt.type === 'session') {
            updateRunnerMeta(workspaceSlug, conversationId, agentId, { agentSessionId: evt.id });
          }

          onEvent(evt);
        }
      } catch {
        // Not JSON — ignore
      }
    }
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    if (text.trim()) {
      stderrBuffer = `${stderrBuffer}\n${text}`.trim().slice(-4000);
      process.stderr.write(`[orchestrator][${conversationId}/${agentId}][stderr] ${text}`);
    }
  });

  child.on('close', (code) => {
    if (ndjsonBuffer.trim()) {
      try {
        const parsed = JSON.parse(ndjsonBuffer.trim()) as Record<string, unknown>;
        collectedRawLines.push(parsed);
        onRawLine?.(parsed);
        const streamEvents: StreamEvent[] = [];
        const collectEvent = (e: StreamEvent) => streamEvents.push(e);
        if (provider === 'codex') {
          handleCodexEvent(parsed as never, collectEvent, streamState);
        } else {
          handleClaudeLikeEvent(parsed as never, collectEvent, streamState);
        }
        for (const evt of streamEvents) {
          appendRunnerEvent(workspaceSlug, conversationId, agentId, evt);
          if (evt.type === 'text') {
            appendConversationEvent(workspaceSlug, conversationId, { type: 'text', agentId, text: evt.text });
          }
          if (evt.type === 'session') {
            updateRunnerMeta(workspaceSlug, conversationId, agentId, { agentSessionId: evt.id });
          }
          onEvent(evt);
        }
      } catch {
        // Ignore non-JSON tail
      }
    }

    const exitCode = code ?? 0;
    process.stderr.write(`[orchestrator] Conversation ${conversationId}/${agentId} exited with code ${exitCode}\n`);

    // Append done to runner stream + conversation stream
    appendRunnerEvent(workspaceSlug, conversationId, agentId, { type: 'done', runId, exitCode });
    appendConversationEvent(workspaceSlug, conversationId, { type: 'runner_done', agentId, exitCode });

    // Update runner status + cursor
    updateRunnerMeta(workspaceSlug, conversationId, agentId, {
      status: exitCode === 0 ? 'completed' : 'error',
      conversationCursor: newCursor,
    });

    // Update conversation status (active unless all runners errored — keep simple for now)
    updateConversationMeta(workspaceSlug, conversationId, {
      status: exitCode === 0 ? 'active' : 'active', // conversation stays active between runs
    });

    runs.delete(runId);
    const error = exitCode !== 0 && stderrBuffer ? stderrBuffer : undefined;
    onDone(exitCode, error, collectedRawLines);
  });

  child.on('error', (err) => {
    process.stderr.write(`[orchestrator] Process error: ${err.message}\n`);
    updateRunnerMeta(workspaceSlug, conversationId, agentId, { status: 'error' });
    runs.delete(runId);
    if (err.message.includes('ENOENT') || err.message.includes('not found')) {
      onDone(1, installHint(provider));
    } else {
      onDone(1, err.message);
    }
  });

  runs.set(runId, { kill: () => child.kill('SIGTERM') });
  return runId;
}

export function cancelAgentRun(runId: string): void {
  process.stderr.write(`[orchestrator] Cancelling conversation ${runId}\n`);
  runs.get(runId)?.kill();
  runs.delete(runId);
}
