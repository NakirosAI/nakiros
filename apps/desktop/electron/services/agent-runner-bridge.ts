import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import type { AgentProvider, AgentRunRequest } from '@nakiros/shared';
import { resolveAgentCwd, buildEnv } from '@nakiros/orchestrator';
import type { StreamEvent, RunStartInfo } from '@nakiros/orchestrator';

export { resolveAgentCwd };

// ─── Binary resolution ────────────────────────────────────────────────────────

function resolveNakirosBin(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'nakiros');
  }
  const workspaceRoot = join(__dirname, '../../../../..');
  const devBin = join(workspaceRoot, 'node_modules', '.bin', 'nakiros');
  if (existsSync(devBin)) return devBin;
  return 'nakiros';
}

// ─── Run lifecycle ────────────────────────────────────────────────────────────

interface RunEntry { kill: () => void }
const runs = new Map<string, RunEntry>();
let runCounter = 0;

// ─── Bridge ───────────────────────────────────────────────────────────────────

export function runAgentCommand(
  provider: AgentProvider,
  request: AgentRunRequest,
  onStart: (info: RunStartInfo) => void,
  onEvent: (event: StreamEvent) => void,
  onDone: (exitCode: number, error?: string, rawLines?: unknown[]) => void,
  _onRawLine?: (raw: unknown) => void,
): string {
  const bridgeRunId = `run-${++runCounter}`;
  const nakirosBin = resolveNakirosBin();
  const additionalDirs = request.additionalDirs ?? request.activeRepoPaths ?? [];
  const agentId = request.agentId ?? 'default';
  const legacyProviderSessionId = request.providerSessionId ?? request.sessionId;

  const args: string[] = [
    'run',
    '--agent', provider,
    '--agent-id', agentId,
    '--workspace', request.workspaceSlug ?? '',
    '--message', request.message,
    // Conversation ID is canonical. Legacy provider session IDs remain supported during migration.
    ...(request.conversationId ? ['--conversation', request.conversationId] : []),
    ...(!request.conversationId && legacyProviderSessionId ? ['--session', legacyProviderSessionId] : []),
    ...(request.anchorRepoPath ? ['--add-dir', request.anchorRepoPath] : []),
    ...additionalDirs.flatMap((d) => ['--add-dir', d]),
  ];

  console.log(`[bridge] Spawning nakiros (bridge run: ${bridgeRunId}, agent: ${agentId})`);
  console.log(`[bridge] Binary: ${nakirosBin}`);
  console.log(`[bridge] Args: ${args.join(' ')}`);

  const env = buildEnv();

  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(nakirosBin, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    console.error(`[bridge] Spawn error: ${msg}`);
    onDone(1, msg);
    return bridgeRunId;
  }

  let ndjsonBuffer = '';
  let stderrBuffer = '';
  let doneCalled = false;
  let startCalled = false;

  function callDoneOnce(exitCode: number, error?: string): void {
    if (doneCalled) return;
    doneCalled = true;
    onDone(exitCode, error);
  }

  child.stdout?.on('data', (chunk: Buffer) => {
    ndjsonBuffer += chunk.toString('utf8');
    const lines = ndjsonBuffer.split('\n');
    ndjsonBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed) as { type: string } & Record<string, unknown>;

        switch (event['type']) {
          case 'start':
            // Forward real conversationId and agentId to renderer via onStart
            if (!startCalled) {
              startCalled = true;
              onStart({
                runId: bridgeRunId,
                conversationId: String(event['conversationId'] ?? bridgeRunId),
                agentId: String(event['agentId'] ?? agentId),
                command: String(event['command'] ?? ''),
                cwd: String(event['cwd'] ?? ''),
              });
            }
            break;
          case 'text':
          case 'tool':
          case 'session':
            onEvent(event as unknown as StreamEvent);
            break;
          case 'done':
            // handled in 'close'
            break;
          case 'error':
            callDoneOnce(Number(event['exitCode'] ?? 1), String(event['message'] ?? 'Unknown error'));
            break;
          default:
            // ignore
        }
      } catch {
        process.stderr.write(`[orchestrator] ${trimmed}\n`);
      }
    }
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    if (text.trim()) {
      stderrBuffer = `${stderrBuffer}\n${text}`.trim().slice(-4000);
      process.stderr.write(`[bridge][stderr] ${text}`);
    }
  });

  child.on('close', (code) => {
    runs.delete(bridgeRunId);
    const exitCode = code ?? 0;
    console.log(`[bridge] Process closed with code ${exitCode} (run: ${bridgeRunId})`);
    // If start was never called (process crashed immediately), call onStart with fallback
    if (!startCalled) {
      onStart({ runId: bridgeRunId, conversationId: bridgeRunId, agentId, command: '', cwd: '' });
    }
    if (exitCode !== 0 && stderrBuffer) {
      callDoneOnce(exitCode, stderrBuffer);
    } else {
      callDoneOnce(exitCode);
    }
  });

  child.on('error', (err) => {
    console.error(`[bridge] Process error: ${err.message}`);
    runs.delete(bridgeRunId);
    if (!startCalled) {
      onStart({ runId: bridgeRunId, conversationId: bridgeRunId, agentId, command: '', cwd: '' });
    }
    const hint = err.message.includes('ENOENT') || err.message.includes('not found')
      ? 'nakiros CLI not found. Run `pnpm build` in the monorepo root.'
      : err.message;
    callDoneOnce(1, hint);
  });

  runs.set(bridgeRunId, { kill: () => child.kill('SIGTERM') });
  return bridgeRunId;
}

export function cancelAgentRun(runId: string): void {
  console.log(`[bridge] Cancelling run ${runId}`);
  runs.get(runId)?.kill();
  runs.delete(runId);
}
