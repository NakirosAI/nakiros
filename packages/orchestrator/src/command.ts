import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import type { AgentProvider } from './types.js';

export function shellEscape(value: string): string {
  return value.replace(/'/g, "'\\''");
}

export function formatProviderName(provider: AgentProvider): string {
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

export function expandCodexPromptCommand(message: string, cwd: string): string {
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
  if (trailingInput) sections.push(`User Input:\n${trailingInput}`);

  return `${leadingWhitespace}${sections.join('\n\n')}`;
}

export function buildRunnerCommand(args: {
  provider: AgentProvider;
  message: string;
  sessionId: string | null;
  additionalDirs: string[];
  cwd: string;
  systemPrompt?: string | null;
}): { shellCommand: string; displayCommand: string; addDirCount: number } {
  const addDirFlags = args.additionalDirs
    .filter((d) => d && d !== args.cwd && existsSync(d))
    .map((d) => `--add-dir '${shellEscape(d)}'`);
  const addDirCount = addDirFlags.length;
  const addDirPart = addDirCount > 0 ? `${addDirFlags.join(' ')} ` : '';

  if (args.provider === 'codex') {
    const effectiveMessage = expandCodexPromptCommand(args.message, args.cwd);
    const escapedMessage = shellEscape(effectiveMessage);
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
    const shellCommand = `cursor-agent --print --output-format stream-json --stream-partial-output --force --trust ${workspacePart}${resumePart}'${escapedMessage}'`;
    const displayCommand = `cursor-agent ${args.sessionId ? 'resume ' : ''}--print '${args.message.slice(0, 80)}${args.message.length > 80 ? '…' : ''}'`;
    return { shellCommand, displayCommand, addDirCount };
  }

  const escapedMessage = shellEscape(args.message);
  const resumeFlag = args.sessionId ? `--resume '${shellEscape(args.sessionId)}' ` : '';
  const systemPromptPart = (!args.sessionId && args.systemPrompt)
    ? `--system-prompt '${shellEscape(args.systemPrompt)}' `
    : '';
  const shellCommand = `claude --output-format stream-json --verbose --dangerously-skip-permissions ${addDirPart}${resumeFlag}${systemPromptPart}--print '${escapedMessage}'`;
  const displayCommand = `claude ${addDirCount > 0 ? `(+${addDirCount} repos) ` : ''}${resumeFlag}--print '${args.message.slice(0, 80)}${args.message.length > 80 ? '…' : ''}'`;
  return { shellCommand, displayCommand, addDirCount };
}

export function installHint(provider: AgentProvider): string {
  if (provider === 'codex') return '`codex` CLI not found.\nInstall Codex CLI and ensure it is on PATH.';
  if (provider === 'cursor') return '`cursor-agent` CLI not found.\nInstall Cursor Agent CLI and ensure it is on PATH.';
  return '`claude` CLI not found.\nMake sure Claude Code is installed: https://claude.ai/code';
}
