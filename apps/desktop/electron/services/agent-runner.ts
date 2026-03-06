import { spawn } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { homedir, platform } from 'os';
import { resolve } from 'path';
import type { AgentProvider, AgentRunRequest } from '@nakiros/shared';

// ─── Env / shell resolution ───────────────────────────────────────────────────

function collectManagerPaths(): string[] {
  const home = homedir();
  const paths: string[] = [
    resolve(home, '.volta/bin'),
    resolve(home, '.asdf/shims'),
    resolve(home, '.nvm/current/bin'),
    resolve(home, '.fnm'),
  ];

  const nvmVersionsDir = resolve(home, '.nvm/versions/node');
  if (existsSync(nvmVersionsDir)) {
    for (const entry of readdirSync(nvmVersionsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      paths.push(resolve(nvmVersionsDir, entry.name, 'bin'));
    }
  }

  const fnmVersionsDir = resolve(home, '.local/share/fnm/node-versions');
  if (existsSync(fnmVersionsDir)) {
    for (const entry of readdirSync(fnmVersionsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      paths.push(resolve(fnmVersionsDir, entry.name, 'installation/bin'));
    }
  }

  return paths.filter((p, i, arr) => existsSync(p) && arr.indexOf(p) === i);
}

const extraPaths = [
  `${homedir()}/.bun/bin`,
  `${homedir()}/.local/bin`,
  `${homedir()}/.npm-global/bin`,
  ...collectManagerPaths(),
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

// ─── Stream event types ──────────────────────────────────────────────────────

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

interface CodexItem {
  id?: string;
  type?: string;
  text?: string;
  command?: string;
}

interface CodexStreamEvent {
  type?: string;
  thread_id?: string;
  item?: CodexItem;
}

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

function shellEscape(value: string): string {
  return value.replace(/'/g, "'\\''");
}

function formatProviderName(provider: AgentProvider): string {
  if (provider === 'claude') return 'Claude';
  if (provider === 'codex') return 'Codex';
  return 'Cursor';
}

function normalizeCodexSlashCommand(message: string, cwd: string): string {
  const leadingWhitespaceLength = message.length - message.trimStart().length;
  const leadingWhitespace = message.slice(0, leadingWhitespaceLength);
  const trimmed = message.trimStart();
  const commandMatch = trimmed.match(/^\/(nak-(?:agent|workflow)-[^\s]+)/);
  if (!commandMatch) return message;

  const commandName = commandMatch[1];
  if (!commandName) return message;

  const promptPath = resolve(cwd, '.codex', 'prompts', `${commandName}.md`);
  if (!existsSync(promptPath)) return message;

  return `${leadingWhitespace}/prompts:${commandName}${trimmed.slice(commandMatch[0].length)}`;
}

function expandCodexPromptCommand(message: string, cwd: string): string {
  const leadingWhitespaceLength = message.length - message.trimStart().length;
  const leadingWhitespace = message.slice(0, leadingWhitespaceLength);
  const trimmed = message.trimStart();
  const commandMatch = trimmed.match(/^\/(nak-(?:agent|workflow)-[^\s]+)/);
  if (!commandMatch) return normalizeCodexSlashCommand(message, cwd);

  const commandName = commandMatch[1];
  if (!commandName) return normalizeCodexSlashCommand(message, cwd);

  const promptPath = resolve(cwd, '.codex', 'prompts', `${commandName}.md`);
  if (!existsSync(promptPath)) return normalizeCodexSlashCommand(message, cwd);

  let promptContent = '';
  try {
    promptContent = readFileSync(promptPath, 'utf8').trim();
  } catch {
    return normalizeCodexSlashCommand(message, cwd);
  }

  const trailingInput = trimmed.slice(commandMatch[0].length).trim();
  const sections = [
    `Command Trigger: \`/${commandName}\``,
    `Prompt Source: ${promptPath}`,
    'The full prompt content is provided below. Apply it directly without scanning the filesystem to locate prompt files.',
    promptContent,
  ];
  if (trailingInput) {
    sections.push(`User Input:\n${trailingInput}`);
  }

  return `${leadingWhitespace}${sections.join('\n\n')}`;
}

function buildRunnerCommand(args: {
  provider: AgentProvider;
  message: string;
  sessionId: string | null;
  additionalDirs: string[];
  cwd: string;
}): { shellCommand: string; displayCommand: string; addDirCount: number } {
  const addDirFlags = args.additionalDirs
    .filter((d) => d && d !== args.cwd && existsSync(d))
    .map((d) => `--add-dir '${shellEscape(d)}'`);
  const addDirCount = addDirFlags.length;
  const addDirPart = addDirCount > 0 ? `${addDirFlags.join(' ')} ` : '';

  if (args.provider === 'codex') {
    const effectiveMessage = expandCodexPromptCommand(args.message, args.cwd);
    const escapedMessage = shellEscape(effectiveMessage);
    // --dangerously-bypass-approvals-and-sandbox is a top-level flag (not a --sandbox mode value).
    // --add-dir is also a top-level option and must appear before the exec subcommand.
    // --dangerously-bypass-approvals-and-sandbox implies never asking for approval; -a must not be set.
    const topLevelFlags = `--dangerously-bypass-approvals-and-sandbox${addDirCount > 0 ? ` ${addDirFlags.join(' ')}` : ''}`;
    const resumePart = args.sessionId
      ? `exec resume --json --skip-git-repo-check '${shellEscape(args.sessionId)}' '${escapedMessage}'`
      : `exec --json --skip-git-repo-check '${escapedMessage}'`;
    const shellCommand = `codex ${topLevelFlags} ${resumePart}`;
    const displayCommand = `codex ${args.sessionId ? 'resume ' : ''}${addDirCount > 0 ? `(+${addDirCount} dirs) ` : ''}'${args.message.slice(0, 80)}${args.message.length > 80 ? '…' : ''}'`;
    return { shellCommand, displayCommand, addDirCount };
  }

  if (args.provider === 'cursor') {
    const escapedMessage = shellEscape(args.message);
    const resumePart = args.sessionId ? `--resume '${shellEscape(args.sessionId)}' ` : '';
    const workspacePart = `--workspace '${shellEscape(args.cwd)}' `;
    // Cursor Agent does not support --add-dir; workspace is constrained to --workspace.
    // --trust avoids workspace trust prompt in headless/print mode.
    const shellCommand = `cursor-agent --print --output-format stream-json --stream-partial-output --force --trust ${workspacePart}${resumePart}'${escapedMessage}'`;
    const displayCommand = `cursor-agent ${args.sessionId ? 'resume ' : ''}--print '${args.message.slice(0, 80)}${args.message.length > 80 ? '…' : ''}'`;
    return { shellCommand, displayCommand, addDirCount };
  }

  const escapedMessage = shellEscape(args.message);
  const resumeFlag = args.sessionId ? `--resume '${shellEscape(args.sessionId)}' ` : '';
  // --dangerously-skip-permissions: required in --print mode for unattended writes.
  const shellCommand = `claude --output-format stream-json --verbose --dangerously-skip-permissions ${addDirPart}${resumeFlag}--print '${escapedMessage}'`;
  const displayCommand = `claude ${addDirCount > 0 ? `(+${addDirCount} repos) ` : ''}${resumeFlag}--print '${args.message.slice(0, 80)}${args.message.length > 80 ? '…' : ''}'`;
  return { shellCommand, displayCommand, addDirCount };
}

function installHint(provider: AgentProvider): string {
  if (provider === 'codex') {
    return '`codex` CLI not found.\nInstall Codex CLI and ensure it is on PATH.';
  }
  if (provider === 'cursor') {
    return '`cursor-agent` CLI not found.\nInstall Cursor Agent CLI and ensure it is on PATH.';
  }
  return '`claude` CLI not found.\nMake sure Claude Code is installed: https://claude.ai/code';
}

function handleClaudeLikeEvent(event: ClaudeStreamEvent, onEvent: (event: StreamEvent) => void, state: { hasEmittedText: boolean }): void {
  switch (event.type) {
    case 'system': {
      const sys = event as ClaudeSystemEvent;
      if (sys.session_id) {
        onEvent({ type: 'session', id: sys.session_id });
      }
      return;
    }

    case 'assistant': {
      const ast = event as ClaudeAssistantEvent;
      if (ast.session_id) onEvent({ type: 'session', id: ast.session_id });

      for (const block of ast.message.content ?? []) {
        if (block.type === 'text' && block.text) {
          state.hasEmittedText = true;
          onEvent({ type: 'text', text: block.text });
        } else if (block.type === 'tool_use') {
          const display = formatTool(block.name, block.input ?? {});
          onEvent({ type: 'tool', name: block.name, display });
        }
      }
      return;
    }

    case 'result': {
      const res = event as ClaudeResultEvent;
      if (res.session_id) onEvent({ type: 'session', id: res.session_id });
      if (!state.hasEmittedText && res.result) {
        onEvent({ type: 'text', text: res.result });
      }
      return;
    }

    default:
      return;
  }
}

function handleCodexEvent(event: CodexStreamEvent, onEvent: (event: StreamEvent) => void, state: { hasEmittedText: boolean }): void {
  if (event.type === 'thread.started' && typeof event.thread_id === 'string') {
    onEvent({ type: 'session', id: event.thread_id });
    return;
  }

  if (!event.item) return;

  if (event.type === 'item.started' && event.item.type === 'command_execution' && event.item.command) {
    onEvent({ type: 'tool', name: 'Bash', display: `$ ${event.item.command}` });
    return;
  }

  if (event.type === 'item.completed') {
    if (event.item.type === 'agent_message' && event.item.text) {
      state.hasEmittedText = true;
      onEvent({ type: 'text', text: event.item.text });
      return;
    }

    if (event.item.type === 'command_execution' && event.item.command) {
      onEvent({ type: 'tool', name: 'Bash', display: `$ ${event.item.command}` });
    }
  }
}

// ─── Runner ───────────────────────────────────────────────────────────────────

interface RunEntry { kill: () => void }

const runs = new Map<string, RunEntry>();
let runCounter = 0;

function hasProjectMarkers(candidate: string): boolean {
  return (
    existsSync(resolve(candidate, '.nakiros.yaml'))
    || existsSync(resolve(candidate, '_nakiros', 'workspace.yaml'))
  );
}

export function resolveAgentCwd(repoPath?: string, additionalDirs?: string[]): string {
  const normalizedCandidates = Array.from(new Set([
    ...(repoPath ? [resolve(repoPath)] : []),
    ...((additionalDirs ?? []).filter((d) => d.trim().length > 0).map((d) => resolve(d))),
  ])).filter((candidate) => existsSync(candidate));

  const projectScopedCwd = normalizedCandidates.find((candidate) => hasProjectMarkers(candidate));
  if (projectScopedCwd) return projectScopedCwd;

  if (normalizedCandidates.length > 0) return normalizedCandidates[0]!;

  const fallbackCwd = resolve(homedir(), '.nakiros');
  mkdirSync(fallbackCwd, { recursive: true });
  return fallbackCwd;
}

export interface RunStartInfo {
  runId: string;
  command: string;
  cwd: string;
}

export function runAgentCommand(
  provider: AgentProvider,
  request: AgentRunRequest,
  onStart: (info: RunStartInfo) => void,
  onEvent: (event: StreamEvent) => void,
  onDone: (exitCode: number, error?: string, rawLines?: unknown[]) => void,
  onRawLine?: (raw: unknown) => void,
): string {
  const runId = `run-${++runCounter}`;
  const repoPath = request.anchorRepoPath;
  const message = request.message;
  const sessionId = request.sessionId ?? null;
  const additionalDirs = request.additionalDirs ?? request.activeRepoPaths;
  const cwd = resolveAgentCwd(repoPath, additionalDirs);
  const mergedAdditionalDirs = Array.from(new Set([
    ...(repoPath ? [resolve(repoPath)] : []),
    ...((additionalDirs ?? []).filter((d) => d.trim().length > 0).map((d) => resolve(d))),
  ]))
    .filter((d) => d !== cwd && existsSync(d));

  const { shellCommand, displayCommand, addDirCount } = buildRunnerCommand({
    provider,
    message,
    sessionId,
    additionalDirs: mergedAdditionalDirs,
    cwd,
  });

  console.log(`[agent-runner] Starting run ${runId} (${formatProviderName(provider)}) (session: ${sessionId ?? 'new'})`);
  console.log(`[agent-runner] Shell: ${userShell}`);
  console.log(`[agent-runner] CWD: ${cwd}`);
  console.log(`[agent-runner] Add-dirs: ${addDirCount > 0 ? addDirCount : '(none)'}`);
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
      process.stdout.write(`[agent-runner][${runId}] ${trimmed}\n`);
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        collectedRawLines.push(parsed);
        onRawLine?.(parsed);
        if (provider === 'codex') {
          handleCodexEvent(parsed as CodexStreamEvent, onEvent, streamState);
        } else {
          handleClaudeLikeEvent(parsed as ClaudeStreamEvent, onEvent, streamState);
        }
      } catch {
        // Not JSON (startup messages, etc.) — ignore
      }
    }
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    if (text.trim()) {
      stderrBuffer = `${stderrBuffer}\n${text}`.trim().slice(-4000);
      process.stderr.write(`[agent-runner][${runId}][stderr] ${text}`);
    }
  });

  child.on('close', (code) => {
    // Flush remaining NDJSON buffer
    if (ndjsonBuffer.trim()) {
      try {
        const parsed = JSON.parse(ndjsonBuffer.trim()) as Record<string, unknown>;
        collectedRawLines.push(parsed);
        onRawLine?.(parsed);
        if (provider === 'codex') {
          handleCodexEvent(parsed as CodexStreamEvent, onEvent, streamState);
        } else {
          handleClaudeLikeEvent(parsed as ClaudeStreamEvent, onEvent, streamState);
        }
      } catch {
        // Ignore non-JSON tail.
      }
    }
    console.log(`[agent-runner] Run ${runId} exited with code ${String(code)}`);
    runs.delete(runId);
    const exitCode = code ?? 0;
    const error = exitCode !== 0 && stderrBuffer ? stderrBuffer : undefined;
    onDone(exitCode, error, collectedRawLines);
  });

  child.on('error', (err) => {
    console.error(`[agent-runner] Process error: ${err.message}`);
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
  console.log(`[agent-runner] Cancelling run ${runId}`);
  runs.get(runId)?.kill();
  runs.delete(runId);
}
