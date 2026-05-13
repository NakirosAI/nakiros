/**
 * Build a digest of the existing `.claude/` artefacts in a project — used as
 * input to the recommendation analyser so it can target an existing artefact
 * for `action=fix` instead of inventing names.
 *
 * Delegates entirely to `buildDotClaudeSnapshot` which already handles every
 * artefact type and is internally defensive (missing files → empty arrays).
 * The only try/catch here is the outer snapshot call itself.
 */

import { buildDotClaudeSnapshot } from './dot-claude-snapshot-builder.js';

// ── Public types ────────────────────────────────────────────────────────────

export interface InventoryItem {
  /** Stable identifier for this artefact — typically `name` for collections,
   *  or a constant like `'CLAUDE.md'` / `'permissions'` for singletons. */
  id: string;
  type:
    | 'rules'
    | 'skill'
    | 'claudemd'
    | 'subagent'
    | 'hook'
    | 'permission'
    | 'mcp'
    | 'output-style';
  /** Short human-readable label (file basename or artefact name). */
  label: string;
  /** Short description if known (e.g. SKILL.md `description:`, rule body excerpt). */
  description?: string;
  /**
   * Optional extra context — glob patterns for rules, transport details for
   * MCP servers, scope hint for permissions, etc.
   */
  hint?: string;
}

export interface ProjectInventory {
  /** Stable project identifier (encoded path or registry id). */
  projectId: string;
  /** Absolute path to the project root. */
  projectPath: string;
  /** ISO 8601 timestamp when the inventory was generated. */
  generatedAt: string;
  /** All discovered artefacts, sorted by type then label. */
  items: InventoryItem[];
}

// ── Builder ─────────────────────────────────────────────────────────────────

/**
 * Build a `ProjectInventory` by reading the project's `.claude/` ecosystem
 * via `buildDotClaudeSnapshot`. Each artefact type is mapped to one or more
 * `InventoryItem` entries.
 *
 * Resilient by design: if the underlying snapshot call errors (e.g. permission
 * denied on the project path), a warning is logged and an empty inventory is
 * returned — the analyser can still run and produce create-only suggestions.
 *
 * For skills, only project-scoped entries are included (scope === `'project'`).
 * Nakiros-bundled and user-global skills are infrastructure, not project config.
 *
 * For hooks and output styles, only project-scoped entries are included.
 * User-global artefacts belong to the developer's environment, not to the
 * project being analysed.
 *
 * @param projectId   Stable project identifier (used in the returned inventory).
 * @param projectPath Absolute path to the project root.
 */
export function buildProjectInventorySync(
  projectId: string,
  projectPath: string,
): ProjectInventory {
  const items: InventoryItem[] = [];

  let snapshot: ReturnType<typeof buildDotClaudeSnapshot>;
  try {
    snapshot = buildDotClaudeSnapshot({ projectId, projectPath });
  } catch (err) {
    console.warn(
      `[inventory] snapshot build failed for ${projectPath}: ${(err as Error).message}`,
    );
    return {
      projectId,
      projectPath,
      generatedAt: new Date().toISOString(),
      items: [],
    };
  }

  // ── CLAUDE.md (singleton) ──────────────────────────────────────────────────
  if (snapshot.claudemd.exists) {
    items.push({
      id: 'CLAUDE.md',
      type: 'claudemd',
      label: 'CLAUDE.md',
      hint: `${snapshot.claudemd.totalLines} lines`,
    });
  }

  // ── Rules (collection) ────────────────────────────────────────────────────
  for (const rule of snapshot.rules) {
    const item: InventoryItem = {
      id: rule.name,
      type: 'rules',
      label: rule.name,
    };
    if (rule.description) item.description = rule.description;
    if (rule.pathsGlob.length > 0) item.hint = rule.pathsGlob.join(', ');
    items.push(item);
  }

  // ── Subagents (collection) ────────────────────────────────────────────────
  for (const agent of snapshot.subagents) {
    const item: InventoryItem = {
      id: agent.name,
      type: 'subagent',
      label: agent.name,
    };
    if (agent.description) item.description = agent.description;
    items.push(item);
  }

  // ── Skills — project-scoped only (collection) ──────────────────────────────
  for (const skill of snapshot.skills) {
    if (skill.scope !== 'project') continue;
    const item: InventoryItem = {
      id: skill.name,
      type: 'skill',
      label: skill.name,
    };
    if (skill.description) item.description = skill.description;
    items.push(item);
  }

  // ── Output styles — project-scoped only (collection) ──────────────────────
  for (const style of snapshot.outputStyles) {
    if (style.scope !== 'project') continue;
    items.push({
      id: style.name,
      type: 'output-style',
      label: style.name,
    });
  }

  // ── MCP servers (collection) ───────────────────────────────────────────────
  for (const server of snapshot.mcpServers) {
    const hint = server.command ?? server.url ?? undefined;
    const item: InventoryItem = {
      id: server.name,
      type: 'mcp',
      label: server.name,
      hint,
    };
    items.push(item);
  }

  // ── Hooks — project-scoped only (collection) ───────────────────────────────
  // Hooks are identified by `event:command` to keep them individually
  // addressable when a single event has multiple handlers.
  for (const hook of snapshot.hooks) {
    if (hook.scope !== 'project') continue;
    const id = `${hook.event}:${hook.command}`;
    items.push({
      id,
      type: 'hook',
      label: hook.event,
      hint: hook.command,
    });
  }

  // ── Permissions (singleton) ────────────────────────────────────────────────
  // Only surface permissions when at least something is configured — a project
  // with scope 'none' has nothing to target for a fix.
  if (snapshot.permissions.scope !== 'none') {
    items.push({
      id: 'permissions',
      type: 'permission',
      label: 'permissions',
      hint: snapshot.permissions.scope,
    });
  }

  return {
    projectId,
    projectPath,
    generatedAt: new Date().toISOString(),
    items,
  };
}

/**
 * Async alias of {@link buildProjectInventorySync} — preserved for callers
 * that already `await` this function. Delegates synchronously; the returned
 * promise resolves on the same tick.
 *
 * @param projectId   Stable project identifier.
 * @param projectPath Absolute path to the project root.
 */
export async function buildProjectInventory(
  projectId: string,
  projectPath: string,
): Promise<ProjectInventory> {
  return buildProjectInventorySync(projectId, projectPath);
}
