import type { AuditRun, Skill, SkillScope } from '@nakiros/shared';

/**
 * Minimal skill address shared across every IPC (list/read/save + start eval/audit/fix).
 * Mirrors the shape expected by `StartEvalRunRequest`, `StartAuditRequest`, `StartFixRequest`.
 */
export type SkillIdentity =
  | { scope: 'project'; projectId: string; skillName: string }
  | { scope: 'claude-global'; skillName: string }
  | { scope: 'nakiros-bundled'; skillName: string }
  | { scope: 'plugin'; marketplaceName: string; pluginName: string; skillName: string };

/**
 * Run records returned by `listEvalRuns / listActiveAuditRuns / listActiveFixRuns`.
 * We only need scope + identity fields for scope filtering + key derivation.
 */
export interface RunScopeRef {
  scope: SkillScope;
  skillName: string;
  projectId?: string;
  pluginName?: string;
  marketplaceName?: string;
}

/** Contract that every scope-specific view injects into the shared hook/base view. */
export interface SkillsViewConfig {
  scope: SkillScope;

  /** Stable key for a skill in the scope. Defaults to `skill.name` for non-plugin scopes. */
  keyOf(skill: Pick<Skill, 'name' | 'marketplaceName' | 'pluginName'>): string;
  /** Same derivation applied to a run record (must match `keyOf` for state maps to align). */
  keyOfRun(run: RunScopeRef): string;
  /** Build the IPC-ready identity for a skill. */
  identityOf(skill: Skill): SkillIdentity;
  /** True when a run belongs to this view's scope (e.g. right scope + right projectId). */
  matchesScope(run: RunScopeRef): boolean;

  // ── IPC delegates ────────────────────────────────────────────────────────
  listSkills(): Promise<Skill[]>;
  readFile(skill: Skill, relativePath: string): Promise<string | null>;
  saveFile(skill: Skill, relativePath: string, content: string): Promise<void>;

  /** Optional: project-only "draft in progress" polling. */
  pollActiveCreate?(): Promise<AuditRun | null>;
}
