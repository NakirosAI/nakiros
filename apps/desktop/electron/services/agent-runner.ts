import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { homedir, platform } from 'os';

// ─── Env / shell resolution ───────────────────────────────────────────────────

const extraPaths = [
  `${homedir()}/.bun/bin`,
  `${homedir()}/.local/bin`,
  `${homedir()}/.npm-global/bin`,
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
].join(':');

function buildEnv(): Record<string, string> {
  const base = process.env as Record<string, string>;
  const current = base['PATH'] ?? '';
  return {
    ...base,
    PATH: current ? `${current}:${extraPaths}` : extraPaths,
  };
}

function resolveShell(): string {
  if (platform() === 'win32') return 'powershell.exe';
  const candidates = [process.env['SHELL'], '/bin/zsh', '/bin/bash', '/bin/sh'];
  return candidates.find((s) => s && existsSync(s)) ?? '/bin/sh';
}

const env = buildEnv();
const userShell = resolveShell();

// ─── Claude stream-json event types ──────────────────────────────────────────

interface ClaudeSystemEvent {
  type: 'system';
  subtype: 'init';
  session_id: string;
  cwd?: string;
  tools?: string[];
  model?: string;
}

interface ClaudeContentText   { type: 'text'; text: string }
interface ClaudeContentTool   { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
type ClaudeContent = ClaudeContentText | ClaudeContentTool;

interface ClaudeAssistantEvent {
  type: 'assistant';
  message: { content: ClaudeContent[] };
  session_id?: string;
}

interface ClaudeResultEvent {
  type: 'result';
  subtype: 'success' | 'error_during_execution';
  result?: string;
  session_id?: string;
  is_error?: boolean;
}

type ClaudeStreamEvent =
  | ClaudeSystemEvent
  | ClaudeAssistantEvent
  | ClaudeResultEvent
  | { type: string };

// ─── Public stream event types (sent to renderer) ────────────────────────────

export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; display: string }
  | { type: 'session'; id: string };

// ─── Tool display formatting ──────────────────────────────────────────────────

function formatTool(name: string, input: Record<string, unknown>): string {
  const s = (v: unknown) => String(v ?? '');
  const truncate = (str: string, max = 72) => str.length > max ? str.slice(0, max) + '…' : str;

  switch (name) {
    case 'Read':       return `Reading ${s(input['file_path'])}`;
    case 'Write':      return `Writing ${s(input['file_path'])}`;
    case 'Edit':
    case 'MultiEdit':  return `Editing ${s(input['file_path'])}`;
    case 'Bash':       return `$ ${truncate(s(input['command']))}`;
    case 'Glob':       return `Glob: ${s(input['pattern'])}`;
    case 'Grep':       return `Grep: ${s(input['pattern'])} in ${s(input['path'] ?? '.')}`;
    case 'TodoWrite':  return 'Updating tasks';
    case 'WebFetch':   return `Fetch: ${truncate(s(input['url']), 60)}`;
    case 'WebSearch':  return `Search: ${s(input['query'])}`;
    case 'Task':       return `Sub-agent: ${truncate(s(input['description']), 60)}`;
    default:           return name;
  }
}

// ─── Runner ───────────────────────────────────────────────────────────────────

interface RunEntry { kill: () => void }

const runs = new Map<string, RunEntry>();
let runCounter = 0;

export interface RunStartInfo {
  runId: string;
  command: string;
  cwd: string;
}

export function runAgentCommand(
  repoPath: string,
  message: string,
  sessionId: string | null,
  onStart: (info: RunStartInfo) => void,
  onEvent: (event: StreamEvent) => void,
  onDone: (exitCode: number, error?: string) => void,
): string {
  const runId = `run-${++runCounter}`;
  const cwd = repoPath && existsSync(repoPath) ? repoPath : homedir();
  const escapedMessage = message.replace(/'/g, "'\\''");

  // Build the claude command
  const resumeFlag = sessionId ? `--resume '${sessionId}' ` : '';
  const shellCommand = `claude --output-format stream-json --verbose ${resumeFlag}--print '${escapedMessage}'`;
  const displayCommand = `claude ${resumeFlag}--print '${message.slice(0, 80)}${message.length > 80 ? '…' : ''}'`;

  console.log(`[agent-runner] Starting run ${runId} (session: ${sessionId ?? 'new'})`);
  console.log(`[agent-runner] Shell: ${userShell}`);
  console.log(`[agent-runner] CWD: ${cwd}`);
  console.log(`[agent-runner] Command: ${displayCommand}`);

  onStart({ runId, command: displayCommand, cwd });

  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(userShell, ['-l', '-c', shellCommand], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    console.error(`[agent-runner] Spawn error: ${msg}`);
    onDone(1, msg);
    return runId;
  }

  // ── NDJSON stream parser ────────────────────────────────────────────────────
  let ndjsonBuffer = '';
  let hasEmittedText = false; // track if any text came via assistant events

  function handleClaudeEvent(event: ClaudeStreamEvent) {
    switch (event.type) {
      case 'system': {
        const sys = event as ClaudeSystemEvent;
        if (sys.session_id) {
          console.log(`[agent-runner] Session: ${sys.session_id}`);
          onEvent({ type: 'session', id: sys.session_id });
        }
        break;
      }

      case 'assistant': {
        const ast = event as ClaudeAssistantEvent;
        if (ast.session_id) onEvent({ type: 'session', id: ast.session_id });

        for (const block of ast.message.content ?? []) {
          if (block.type === 'text' && block.text) {
            hasEmittedText = true;
            onEvent({ type: 'text', text: block.text });
          } else if (block.type === 'tool_use') {
            const display = formatTool(block.name, block.input ?? {});
            console.log(`[agent-runner] Tool: ${block.name} → ${display}`);
            onEvent({ type: 'tool', name: block.name, display });
          }
        }
        break;
      }

      case 'result': {
        const res = event as ClaudeResultEvent;
        if (res.session_id) onEvent({ type: 'session', id: res.session_id });
        // Fallback: if no text came via assistant events (e.g. "Unknown skill",
        // immediate exits), emit result.result directly to avoid blank messages.
        if (!hasEmittedText && res.result) {
          onEvent({ type: 'text', text: res.result });
        }
        break;
      }

      default:
        break;
    }
  }

  child.stdout?.on('data', (chunk: Buffer) => {
    ndjsonBuffer += chunk.toString('utf8');
    const lines = ndjsonBuffer.split('\n');
    ndjsonBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      process.stdout.write(`[agent-runner][${runId}] ${trimmed}\n`);
      try {
        handleClaudeEvent(JSON.parse(trimmed) as ClaudeStreamEvent);
      } catch {
        // Not JSON (startup messages, etc.) — ignore
      }
    }
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    if (text.trim()) {
      process.stderr.write(`[agent-runner][${runId}][stderr] ${text}`);
    }
  });

  child.on('close', (code) => {
    // Flush remaining NDJSON buffer
    if (ndjsonBuffer.trim()) {
      try { handleClaudeEvent(JSON.parse(ndjsonBuffer.trim()) as ClaudeStreamEvent); } catch {}
    }
    console.log(`[agent-runner] Run ${runId} exited with code ${String(code)}`);
    runs.delete(runId);
    onDone(code ?? 0);
  });

  child.on('error', (err) => {
    console.error(`[agent-runner] Process error: ${err.message}`);
    runs.delete(runId);
    if (err.message.includes('ENOENT') || err.message.includes('not found')) {
      onDone(1, '`claude` CLI not found.\nMake sure Claude Code is installed: https://claude.ai/code');
    } else {
      onDone(1, err.message);
    }
  });

  runs.set(runId, { kill: () => child.kill('SIGTERM') });
  return runId;
}

export function cancelAgentRun(runId: string): void {
  console.log(`[agent-runner] Cancelling run ${runId}`);
  runs.get(runId)?.kill();
  runs.delete(runId);
}
