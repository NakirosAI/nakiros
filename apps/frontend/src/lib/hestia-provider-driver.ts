import type {
  AgentEntry,
  ClaudeMdFileContent,
  ClaudeMdMutationResult,
  CodexResourceFile,
  CodexResourceKind,
  CodexResourceMutationResult,
  ConfigurationProvider,
  RuleEntry,
  RulesMutationResult,
  SubagentsMutationResult,
  SubagentsReadResult,
} from '@nakiros/shared';

export interface ProviderResourceDriver {
  list(projectId: string, kind: CodexResourceKind): ReturnType<typeof window.nakiros.listCodexResources>;
  read(projectId: string, kind: CodexResourceKind, id: string): ReturnType<typeof window.nakiros.readCodexResource>;
  save(
    projectId: string,
    kind: CodexResourceKind,
    id: string,
    content: string,
    mtime: string,
  ): ReturnType<typeof window.nakiros.saveCodexResource>;
  remove(
    projectId: string,
    kind: CodexResourceKind,
    id: string,
    mtime?: string,
  ): ReturnType<typeof window.nakiros.deleteCodexResource>;
}

/** Codex storage driver consumed by the existing Hestia screens. */
export const codexResourceDriver: ProviderResourceDriver = {
  list: (projectId, kind) => window.nakiros.listCodexResources(projectId, kind),
  read: (projectId, kind, id) => window.nakiros.readCodexResource(projectId, kind, id),
  save: (projectId, kind, id, content, mtime) =>
    window.nakiros.saveCodexResource(projectId, kind, id, content, mtime),
  remove: (projectId, kind, id, mtime) =>
    window.nakiros.deleteCodexResource(projectId, kind, id, mtime),
};

export function absoluteProjectPath(projectPath: string, relativePath: string): string {
  return `${projectPath.replace(/\/$/, '')}/${relativePath}`;
}

export function codexInstructionFile(
  projectPath: string,
  file: CodexResourceFile,
): ClaudeMdFileContent {
  const body = file.content;
  const headings = [...body.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => match[1]?.trim() ?? '');
  const imports = [...body.matchAll(/(?:^|\s)@([^\s]+)/gm)].map((match) => match[1] ?? '');
  return {
    path: absoluteProjectPath(projectPath, file.path),
    exists: file.exists,
    lastModified: file.mtime || null,
    lines: body.length === 0 ? 0 : body.split(/\r?\n/).length,
    chars: body.length,
    tokens: Math.round(body.length / 4),
    headings,
    imports,
    hasHtmlComments: /<!--[\s\S]*?-->/.test(body),
    body,
    mtime: file.mtime,
  };
}

export function codexInstructionMutation(
  result: CodexResourceMutationResult,
  projectPath: string,
): ClaudeMdMutationResult {
  if (result.ok) return { ok: true, file: codexInstructionFile(projectPath, result.file) };
  const code = result.code === 'conflict' || result.code === 'not-found'
    || result.code === 'project-not-found'
    ? result.code
    : 'write-failed';
  return { ok: false, code, message: result.message, currentMtime: result.currentMtime };
}

function firstQuoted(content: string, key: string): string | null {
  const match = new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']*)["']`, 'm').exec(content);
  return match?.[1]?.trim() || null;
}

function stringArray(content: string, key: string): string[] {
  const match = new RegExp(`^\\s*${key}\\s*=\\s*\\[([^\\]]*)\\]`, 'm').exec(content);
  if (!match?.[1]) return [];
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map((item) => item[1] ?? '');
}

export function codexRuleEntry(file: CodexResourceFile): RuleEntry {
  const summary = file.content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith('#')) ?? '';
  return {
    name: file.name,
    relativePath: file.path,
    paths: [],
    tokens: Math.round(file.content.length / 4),
    summary: summary.slice(0, 140),
    lastModified: file.mtime || null,
  };
}

export function codexAgentEntry(file: CodexResourceFile): AgentEntry {
  return {
    name: file.name,
    relativePath: file.path,
    description: firstQuoted(file.content, 'description'),
    tools: stringArray(file.content, 'tools'),
    model: firstQuoted(file.content, 'model'),
    tokens: Math.round(file.content.length / 4),
    lastModified: file.mtime || null,
  };
}

export function codexReadResult(
  result: Awaited<ReturnType<ProviderResourceDriver['read']>>,
  projectPath: string,
): SubagentsReadResult | null {
  if (!result.ok) throw new Error(result.message);
  return {
    content: result.file.content,
    mtime: result.file.mtime,
    exists: result.file.exists,
    path: absoluteProjectPath(projectPath, result.file.path),
  };
}

export function codexMutationResult(
  result: CodexResourceMutationResult,
): RulesMutationResult | SubagentsMutationResult {
  if (result.ok) return { ok: true };
  const code = result.code === 'conflict' || result.code === 'not-found'
    || result.code === 'project-not-found'
    ? result.code
    : result.code === 'invalid-id' || result.code === 'unsafe-path'
      ? 'invalid-path'
      : 'write-failed';
  return { ok: false, code, message: result.message };
}

export function isCodex(provider: ConfigurationProvider): provider is 'codex' {
  return provider === 'codex';
}
