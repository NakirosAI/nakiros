import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';

import type {
  CreateRuleRequest,
  RuleFileContent,
  RuleMutationErrorCode,
  RuleMutationResult,
  SaveRuleRequest,
} from '@nakiros/shared';

/**
 * Write side of the `.claude/rules/` editor (Module 1 V2). Reads, creates,
 * saves and deletes rule markdown files with optimistic-lock guard via
 * mtime to detect external modifications between read and write.
 *
 * The lightweight YAML frontmatter we emit only carries the `paths:` field —
 * the only standardized rule field per the Claude Code docs. If a richer
 * frontmatter shape is needed later, swap the serializer for the `yaml`
 * package; the rest of the API stays the same.
 */

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function rulesDir(projectPath: string): string {
  return join(projectPath, '.claude', 'rules');
}

function ruleFilePath(projectPath: string, name: string): string {
  return join(rulesDir(projectPath), `${name}.md`);
}

function err(code: RuleMutationErrorCode, message: string, currentMtime?: string): RuleMutationResult {
  return { ok: false, code, message, currentMtime };
}

/**
 * Read a single rule for the editor. Returns the decomposed content
 * (paths frontmatter + markdown body) plus the `mtime` to use as the save
 * lock token.
 */
export function readRuleForEditor(
  projectPath: string,
  name: string,
): RuleFileContent | null {
  if (!NAME_PATTERN.test(name)) return null;
  const filePath = ruleFilePath(projectPath, name);
  if (!existsSync(filePath)) return null;
  let content = '';
  let mtime: string;
  try {
    content = readFileSync(filePath, 'utf8');
    mtime = statSync(filePath).mtime.toISOString();
  } catch {
    return null;
  }
  const { paths, body } = decomposeRuleFile(content);
  return {
    name,
    relativePath: `.claude/rules/${name}.md`,
    mtime,
    paths,
    body,
  };
}

/**
 * Create a new rule file. Fails if the name is invalid or already exists.
 */
export function createRule(
  projectPath: string,
  request: CreateRuleRequest,
): RuleMutationResult {
  const name = request.name.trim();
  if (!NAME_PATTERN.test(name)) {
    return err(
      'invalid-name',
      'Rule name must use lowercase letters, digits, and dashes only.',
    );
  }
  const filePath = ruleFilePath(projectPath, name);
  if (existsSync(filePath)) {
    return err('already-exists', `A rule named "${name}" already exists.`);
  }
  const dir = dirname(filePath);
  try {
    mkdirSync(dir, { recursive: true });
    const body = `# ${name}\n\nDescribe when this rule applies and what conventions Claude must follow.\n`;
    const content = serializeRule(request.paths ?? [], body);
    writeFileAtomic(filePath, content);
  } catch (e) {
    return err('write-failed', e instanceof Error ? e.message : String(e));
  }
  const mtime = statSync(filePath).mtime.toISOString();
  return {
    ok: true,
    file: {
      name,
      relativePath: `.claude/rules/${name}.md`,
      mtime,
      paths: request.paths ?? [],
      body: `# ${name}\n\nDescribe when this rule applies and what conventions Claude must follow.\n`,
    },
  };
}

/**
 * Save an existing rule. Aborts with `code: 'conflict'` if the file's
 * on-disk mtime differs from `mtimeAtRead` — i.e. the file was modified
 * externally between the editor's read and this save.
 */
export function saveRule(
  projectPath: string,
  request: SaveRuleRequest,
): RuleMutationResult {
  const { name, mtimeAtRead, paths, body } = request;
  if (!NAME_PATTERN.test(name)) {
    return err('invalid-name', 'Rule name must use lowercase letters, digits, and dashes only.');
  }
  const filePath = ruleFilePath(projectPath, name);
  if (!existsSync(filePath)) {
    return err('not-found', `Rule "${name}" no longer exists on disk.`);
  }
  let currentMtime: string;
  try {
    currentMtime = statSync(filePath).mtime.toISOString();
  } catch (e) {
    return err('write-failed', e instanceof Error ? e.message : String(e));
  }
  if (currentMtime !== mtimeAtRead) {
    return err(
      'conflict',
      'This rule was modified outside Nakiros while you were editing. Reload to see the latest version.',
      currentMtime,
    );
  }

  const content = serializeRule(paths, body);
  try {
    writeFileAtomic(filePath, content);
  } catch (e) {
    return err('write-failed', e instanceof Error ? e.message : String(e));
  }
  const mtime = statSync(filePath).mtime.toISOString();
  return {
    ok: true,
    file: {
      name,
      relativePath: `.claude/rules/${name}.md`,
      mtime,
      paths,
      body,
    },
  };
}

/**
 * Delete a rule file by name. Idempotent: returns `not-found` if the file is
 * missing, otherwise removes it. No mtime check — the caller has already
 * confirmed via the UI.
 */
export function deleteRule(projectPath: string, name: string): RuleMutationResult {
  if (!NAME_PATTERN.test(name)) {
    return err('invalid-name', 'Rule name must use lowercase letters, digits, and dashes only.');
  }
  const filePath = ruleFilePath(projectPath, name);
  if (!existsSync(filePath)) {
    return err('not-found', `Rule "${name}" does not exist.`);
  }
  try {
    rmSync(filePath, { force: true });
  } catch (e) {
    return err('write-failed', e instanceof Error ? e.message : String(e));
  }
  return {
    ok: true,
    file: {
      name,
      relativePath: `.claude/rules/${name}.md`,
      mtime: '',
      paths: [],
      body: '',
    },
  };
}

// ── Frontmatter (de)serializer ─────────────────────────────────────────────-

interface DecomposedRule {
  paths: string[];
  body: string;
}

function decomposeRuleFile(raw: string): DecomposedRule {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) return { paths: [], body: raw };
  const fm = m[1];
  const body = m[2] ?? '';
  return { paths: extractPaths(fm), body };
}

function extractPaths(fm: string): string[] {
  const lines = fm.split(/\r?\n/);
  const out: string[] = [];
  let inPaths = false;
  for (const line of lines) {
    if (/^paths\s*:\s*\[(.*)\]\s*$/.test(line)) {
      const inner = line.match(/\[(.*)\]/)![1].trim();
      if (inner === '') return [];
      return inner.split(',').map((s) => unquote(s.trim())).filter(Boolean);
    }
    if (/^paths\s*:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    if (inPaths) {
      const item = /^\s+-\s+(.*)$/.exec(line);
      if (item) {
        out.push(unquote(item[1].trim()));
        continue;
      }
      // Out of the paths block.
      inPaths = false;
    }
  }
  return out;
}

function unquote(s: string): string {
  if (s.length >= 2) {
    const f = s[0];
    const l = s[s.length - 1];
    if ((f === '"' && l === '"') || (f === "'" && l === "'")) return s.slice(1, -1);
  }
  return s;
}

function serializeRule(paths: string[], body: string): string {
  // Always emit a frontmatter block so the file shape stays predictable.
  // When `paths` is empty we still emit `paths: []` to make the rule's "always
  // on" status explicit; readers tolerate both forms.
  const trimmedPaths = paths.map((p) => p.trim()).filter((p) => p.length > 0);
  const fm: string[] = ['---'];
  if (trimmedPaths.length === 0) {
    fm.push('paths: []');
  } else {
    fm.push('paths:');
    for (const p of trimmedPaths) {
      fm.push(`  - ${quoteIfNeeded(p)}`);
    }
  }
  fm.push('---');
  const normalizedBody = body.endsWith('\n') ? body : body + '\n';
  return fm.join('\n') + '\n' + normalizedBody;
}

function quoteIfNeeded(s: string): string {
  // Quote if the string would be ambiguous as a YAML scalar (contains `:`,
  // starts with special chars, etc.). Conservative — quote everything that
  // is not a plain alphanumeric/glob path.
  if (/^[A-Za-z0-9_./*?\-{}[\]!,()]+$/.test(s)) return `"${s}"`;
  return JSON.stringify(s);
}

// ── Atomic write ──────────────────────────────────────────────────────────-

function writeFileAtomic(filePath: string, content: string): void {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, filePath);
}
