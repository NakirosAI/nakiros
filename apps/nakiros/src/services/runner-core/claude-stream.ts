import { spawn, type ChildProcess } from 'child_process';

import { formatTool } from './tool-format.js';

export interface ClaudeStreamHandlers {
  onSession(id: string): void;
  onText(text: string): void;
  onTool(name: string, display: string): void;
  onUsage(totalTokens: number): void;
}

/**
 * Parse a single JSON event from the `claude --output-format stream-json` stream
 * and dispatch to the domain-agnostic handlers.
 */
export function handleClaudeStreamEvent(
  event: Record<string, unknown>,
  h: ClaudeStreamHandlers,
): void {
  const type = event['type'] as string;
  if (type === 'system') {
    const sid = event['session_id'] as string | undefined;
    if (sid) h.onSession(sid);
    return;
  }
  if (type === 'assistant') {
    const sid = event['session_id'] as string | undefined;
    if (sid) h.onSession(sid);
    const message = event['message'] as { content?: unknown[] } | undefined;
    if (!Array.isArray(message?.content)) return;
    for (const block of message!.content) {
      const b = block as { type?: string; text?: string; name?: string; input?: Record<string, unknown> };
      if (b.type === 'text' && b.text) h.onText(b.text);
      else if (b.type === 'tool_use' && b.name) h.onTool(b.name, formatTool(b.name, b.input ?? {}));
    }
    return;
  }
  if (type === 'result') {
    const sid = event['session_id'] as string | undefined;
    if (sid) h.onSession(sid);
    const usage = event['usage'] as { total_tokens?: number; input_tokens?: number; output_tokens?: number } | undefined;
    if (usage) {
      const total = usage.total_tokens ?? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
      h.onUsage(total);
    }
  }
}

export interface BuildArgsOptions {
  prompt: string;
  resumeSessionId?: string;
  addDirs?: string[];
  /**
   * Pass `--dangerously-skip-permissions`. Used by fix/create runs that operate on
   * an already-confirmed temp workdir. Audit + eval rely on workdir-scoped settings.
   */
  skipPermissions?: boolean;
}

export function buildClaudeArgs(opts: BuildArgsOptions): string[] {
  const args: string[] = ['--output-format', 'stream-json', '--verbose'];
  if (opts.skipPermissions) args.push('--dangerously-skip-permissions');
  if (opts.addDirs) {
    for (const d of opts.addDirs) {
      args.push('--add-dir', d);
    }
  }
  if (opts.resumeSessionId) args.push('--resume', opts.resumeSessionId);
  args.push('--print', opts.prompt);
  return args;
}

export interface SpawnTurnOptions extends ClaudeStreamHandlers {
  workdir: string;
  cliArgs: string[];
  /**
   * Called as soon as the child process is spawned — lets the runner stash
   * the ChildProcess reference so `stop()` can `SIGTERM` it.
   */
  onChildSpawned(child: ChildProcess): void;
  /**
   * Called when the runner should abort consuming the stream (e.g. run was stopped).
   * Returning true from `isKilled()` short-circuits handling.
   */
  isKilled(): boolean;
  /**
   * Environment variables to pass to the child process. Use this to override
   * `HOME` (isolated HOME that shadows `~/.claude/CLAUDE.md`, `~/.claude/skills/`,
   * and auto-memory) so a run can't be contaminated by user-level state.
   * Defaults to `process.env`.
   */
  env?: NodeJS.ProcessEnv;
}

export interface SpawnTurnResult {
  exitCode: number;
  /** Tail of stderr when the exit code is non-zero, trimmed to 500 chars. */
  error: string | null;
}

/**
 * Spawn a single claude CLI turn and drain its stdout/stderr. Dispatches parsed
 * events into the provided handlers. Returns once the child exits.
 */
export function spawnClaudeTurn(opts: SpawnTurnOptions): Promise<SpawnTurnResult> {
  return new Promise((resolve) => {
    const child = spawn('claude', opts.cliArgs, {
      cwd: opts.workdir,
      env: opts.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    opts.onChildSpawned(child);

    let buffer = '';
    let stderrBuffer = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      if (opts.isKilled()) return;
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed) as Record<string, unknown>;
          handleClaudeStreamEvent(event, opts);
        } catch {
          // ignore non-JSON lines
        }
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString('utf8');
    });

    child.on('close', (code) => {
      const exitCode = code ?? 0;
      const error = exitCode !== 0 && stderrBuffer.trim() ? stderrBuffer.trim().slice(-500) : null;
      resolve({ exitCode, error });
    });

    child.on('error', (err) => {
      const error = err.message.includes('ENOENT')
        ? '`claude` CLI not found. Make sure Claude Code is installed and on PATH.'
        : err.message;
      resolve({ exitCode: 1, error });
    });
  });
}
