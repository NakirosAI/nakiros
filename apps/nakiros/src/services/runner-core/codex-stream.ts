import { spawn, type ChildProcess } from 'child_process';

import type {
  BuildArgsOptions,
  ClaudeStreamHandlers as AgentStreamHandlers,
  SpawnTurnOptions,
  SpawnTurnResult,
} from './claude-stream.js';

/** Build one non-interactive Codex turn with a machine-readable event stream. */
export function buildCodexArgs(opts: BuildArgsOptions): string[] {
  if (opts.resumeSessionId) {
    const resume = ['exec', 'resume', '--json', '--skip-git-repo-check'];
    if (opts.model) resume.push('--model', opts.model);
    return [...resume, opts.resumeSessionId, opts.prompt];
  }
  const common = ['--json', '--color', 'never', '--sandbox', 'workspace-write', '--skip-git-repo-check'];
  if (opts.model) common.push('--model', opts.model);
  return ['exec', ...common, opts.prompt];
}

/** Parse one `codex exec --json` event into the runner-neutral stream callbacks. */
export function handleCodexStreamEvent(
  event: Record<string, unknown>,
  handlers: AgentStreamHandlers,
): string | null {
  const type = typeof event['type'] === 'string' ? event['type'] : '';
  if (type === 'thread.started') {
    const threadId = event['thread_id'];
    if (typeof threadId === 'string') handlers.onSession(threadId);
    return null;
  }

  if (type === 'item.completed' || type === 'item.started') {
    const item = event['item'];
    if (!item || typeof item !== 'object') return null;
    const value = item as Record<string, unknown>;
    const itemType = typeof value['type'] === 'string' ? value['type'] : '';
    if (type === 'item.completed' && itemType === 'agent_message') {
      const text = value['text'];
      if (typeof text === 'string' && text) handlers.onText(text);
      return null;
    }
    if (type === 'item.started' && itemType === 'command_execution') {
      const command = typeof value['command'] === 'string' ? value['command'] : '';
      handlers.onTool('Shell', command || 'Command execution', { command });
      return null;
    }
    if (type === 'item.started' && itemType === 'mcp_tool_call') {
      const name = typeof value['tool'] === 'string'
        ? value['tool']
        : typeof value['name'] === 'string' ? value['name'] : 'MCP';
      handlers.onTool(name, name, {});
      return null;
    }
    if (type === 'item.started' && itemType === 'web_search') {
      handlers.onTool('WebSearch', 'Web search', {});
      return null;
    }
    if (type === 'item.started' && itemType === 'file_change') {
      handlers.onTool('FileChange', 'File change', {});
      return null;
    }
  }

  if (type === 'turn.completed') {
    const usage = event['usage'];
    if (usage && typeof usage === 'object') {
      const value = usage as Record<string, unknown>;
      const input = typeof value['input_tokens'] === 'number' ? value['input_tokens'] : 0;
      const output = typeof value['output_tokens'] === 'number' ? value['output_tokens'] : 0;
      handlers.onUsage(input + output);
    }
    return null;
  }

  if (type === 'turn.failed' || type === 'error') {
    const raw = event['error'] ?? event['message'];
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object') {
      const message = (raw as Record<string, unknown>)['message'];
      if (typeof message === 'string') return message;
    }
    return 'Codex analysis failed';
  }
  return null;
}

/** Spawn one `codex exec` turn and expose the same callbacks as Claude runs. */
export function spawnCodexTurn(opts: SpawnTurnOptions): Promise<SpawnTurnResult> {
  return new Promise((resolve) => {
    const child = spawn('codex', opts.cliArgs, {
      cwd: opts.workdir,
      env: opts.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    opts.onChildSpawned(child as ChildProcess);

    let buffer = '';
    let stderrBuffer = '';
    let streamError: string | null = null;
    child.stdout?.on('data', (chunk: Buffer) => {
      if (opts.isKilled()) return;
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const error = handleCodexStreamEvent(
            JSON.parse(trimmed) as Record<string, unknown>,
            opts,
          );
          if (error) streamError = error;
        } catch {
          // Ignore non-JSON progress lines; `--json` output is otherwise JSONL.
        }
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString('utf8');
    });
    child.on('close', (code) => {
      const exitCode = code ?? 0;
      const error = streamError ?? (
        exitCode !== 0 && stderrBuffer.trim()
          ? stderrBuffer.trim().slice(-500)
          : null
      );
      resolve({ exitCode: error && exitCode === 0 ? 1 : exitCode, error });
    });
    child.on('error', (error) => {
      resolve({
        exitCode: 1,
        error: error.message.includes('ENOENT')
          ? '`codex` CLI not found. Make sure Codex is installed and on PATH.'
          : error.message,
      });
    });
  });
}
