# claude-config.ts

**Path:** `packages/shared/src/types/claude-config.ts`

Shared types for the entire `.claude/` configuration surface: the read-only V1 config scan snapshot (`claudeConfig:scan`), the seven V2 structured editors (rules / subagents / output-styles / permissions / MCP / hooks / CLAUDE.md), and the six expert-runner CRUD + audit-history types (rules / subagents / hooks / permissions / mcp / output-styles experts). This is the largest type file in the shared package — it is split by functional module with inline comment markers.

## Exports

### `ClaudeConfigSnapshot`

Snapshot of a project's `.claude/` configuration produced by `claudeConfig:scan`. Read-only V1 surface covering 9 categories.

```ts
export interface ClaudeConfigSnapshot {
  summary: ClaudeConfigSummary;
  claudeMd: ClaudeMdInfo;
  settings: SettingsInfo;
  rules: RulesInfo;
  skills: SkillsGatewayInfo;
  commands: CommandsInfo;
  outputStyles: OutputStylesInfo;
  agents: AgentsInfo;
  mcp: McpInfo;
  hooks: HooksInfo;
}
```

### `ClaudeConfigSummary`

Aggregate counts and path info derived from a full `.claude/` scan.

```ts
export interface ClaudeConfigSummary {
  /** Number of categories with at least one entry (0..9). */
  completeness: number;
  totalCategories: number;
  /** Approx tokens injected at every session start. */
  totalTokensInjected: number;
  path: string;
  scannedAt: string;
}
```

### `ClaudeMdInfo`

Metadata for the project-root `CLAUDE.md` file as reported by a config scan.

```ts
export interface ClaudeMdInfo {
  present: boolean;
  path: string;
  lines: number;
  chars: number;
  tokens: number;
  headings: string[];
  lastModified: string | null;
}
```

### `SettingsInfo`

Aggregate view of a project's `settings.json` + `settings.local.json`.

```ts
export interface SettingsInfo {
  present: boolean;
  project: SettingsFile;
  local: SettingsFile;
  effective: EffectiveSettings;
}
```

### `SettingsFile`

Metadata and parsed content of a single settings file on disk.

```ts
export interface SettingsFile {
  present: boolean;
  path: string;
  lastModified: string | null;
  data: SettingsData | null;
  parseError?: string;
}
```

### `SettingsData`

Raw shape of `settings.json` — kept loose; only the keys Nakiros surfaces in V1 are typed.

```ts
export interface SettingsData {
  model?: string;
  permissions?: { allow?: string[]; deny?: string[]; ask?: string[] };
  env?: Record<string, string>;
  hooks?: SettingsHooks;
  outputStyle?: string;
  [key: string]: unknown;
}
```

### `SettingsHooks`

```ts
export type SettingsHooks = Partial<Record<HookEventName, SettingsHookEntry[]>>;
```

`hooks` block of `settings.json`, keyed by lifecycle event.

### `SettingsHookEntry`

One matcher-group entry inside a hook event's array.

```ts
export interface SettingsHookEntry {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string }>;
  command?: string;
}
```

### `HookEventName`

Lifecycle event name accepted by Claude Code's hook system.

```ts
export type HookEventName =
  | 'PreToolUse' | 'PostToolUse' | 'UserPromptSubmit'
  | 'Notification' | 'Stop' | 'SubagentStop'
  | 'SessionStart' | 'SessionEnd';
```

### `EffectiveSettings`

Resolved (effective) view of project + local settings, indicating which source wins each field.

```ts
export interface EffectiveSettings {
  model: ResolvedField<string | null>;
  permissions: {
    allowCount: ResolvedField<number>;
    denyCount: ResolvedField<number>;
    askCount: ResolvedField<number>;
  };
  envCount: ResolvedField<number>;
  hookCount: ResolvedField<number>;
  outputStyle: ResolvedField<string | null>;
  localOverrides: string[];
}
```

### `ResolvedField<T>`

A settings field resolved to its effective value and the settings file it came from.

```ts
export interface ResolvedField<T> {
  value: T;
  source: 'project' | 'local' | 'none';
}
```

### `RulesInfo`

Aggregate view of all rule files under `.claude/rules/`.

```ts
export interface RulesInfo {
  present: boolean;
  count: number;
  totalTokens: number;
  items: RuleEntry[];
}
```

### `RuleEntry`

Summary metadata for a single rule file shown in the config scan view.

```ts
export interface RuleEntry {
  name: string;
  relativePath: string;
  paths: string[];
  tokens: number;
  summary: string;
  lastModified: string | null;
}
```

### `RuleFileContent`

Full content of a rule file read for structured editing (Module 1 V2).

```ts
export interface RuleFileContent {
  name: string;
  relativePath: string;
  /** ISO mtime used as optimistic-lock token for `claudeRules:save`. */
  mtime: string;
  paths: string[];
  body: string;
}
```

### `SaveRuleRequest`

Request payload for `claudeRules:save` (Module 1 V2).

```ts
export interface SaveRuleRequest {
  name: string;
  paths: string[];
  body: string;
  mtimeAtRead: string;
}
```

### `CreateRuleRequest`

Request payload for `claudeRules:create` (Module 1 V2).

```ts
export interface CreateRuleRequest {
  name: string;
  paths?: string[];
}
```

### `RuleMutationResult`

Discriminated result for rule mutations.

```ts
export type RuleMutationResult =
  | { ok: true; file: RuleFileContent }
  | { ok: false; code: RuleMutationErrorCode; message: string; currentMtime?: string };
```

### `RuleMutationErrorCode`

Error codes returned in a failed `RuleMutationResult`.

```ts
export type RuleMutationErrorCode =
  | 'invalid-name' | 'already-exists' | 'not-found'
  | 'conflict' | 'project-not-found' | 'write-failed';
```

### `AgentFileContent`

Full content of a subagent file read for structured editing.

```ts
export interface AgentFileContent {
  name: string;
  relativePath: string;
  mtime: string;
  frontmatterRaw: string;
  body: string;
  parsed: AgentParsedEssentials;
}
```

### `AgentParsedEssentials`

Best-effort parse of a subagent file's frontmatter essentials for display/fallback.

```ts
export interface AgentParsedEssentials {
  description: string | null;
  model: string | null;
  tools: string[];
  color: string | null;
}
```

### `SaveAgentRequest`

Request payload for `claudeAgents:save`.

```ts
export interface SaveAgentRequest {
  name: string;
  frontmatterRaw: string;
  body: string;
  mtimeAtRead: string;
}
```

### `CreateAgentRequest`

Request payload for `claudeAgents:create`.

```ts
export interface CreateAgentRequest {
  name: string;
  description?: string;
}
```

### `AgentMutationResult`

Discriminated result for subagent mutations.

```ts
export type AgentMutationResult =
  | { ok: true; file: AgentFileContent }
  | { ok: false; code: AgentMutationErrorCode; message: string; currentMtime?: string };
```

### `AgentMutationErrorCode`

Error codes returned in a failed `AgentMutationResult`.

```ts
export type AgentMutationErrorCode =
  | 'invalid-name' | 'invalid-yaml' | 'already-exists'
  | 'not-found' | 'conflict' | 'project-not-found' | 'write-failed';
```

### `BuiltInOutputStyle`

Built-in output styles shipped with Claude Code (not editable).

```ts
export type BuiltInOutputStyle = 'Default' | 'Explanatory' | 'Learning';
```

### `OutputStylesListResult`

Result of `claudeOutputStyles:list` (Module 3 V2 form editor). Not to be confused with `OutputStylesExpertListResult`.

```ts
export interface OutputStylesListResult {
  items: OutputStyleEntry[];
  activeName: string | null;
  activeSource: 'project' | 'local' | 'none';
}
```

### `OutputStyleFileContent`

Full content of an output-style file read for structured editing.

```ts
export interface OutputStyleFileContent {
  name: string;
  relativePath: string;
  mtime: string;
  frontmatterName: string | null;
  description: string | null;
  keepCodingInstructions: boolean;
  body: string;
}
```

### `SaveOutputStyleRequest`

Request payload for `claudeOutputStyles:save`.

```ts
export interface SaveOutputStyleRequest {
  name: string;
  description: string;
  keepCodingInstructions: boolean;
  body: string;
  mtimeAtRead: string;
}
```

### `CreateOutputStyleRequest`

Request payload for `claudeOutputStyles:create`.

```ts
export interface CreateOutputStyleRequest {
  name: string;
  description?: string;
}
```

### `OutputStyleMutationResult`

Discriminated result for output-style mutations (Module 3 V2 form editor).

```ts
export type OutputStyleMutationResult =
  | { ok: true; file: OutputStyleFileContent }
  | { ok: false; code: OutputStyleMutationErrorCode; message: string; currentMtime?: string };
```

### `OutputStyleMutationErrorCode`

```ts
export type OutputStyleMutationErrorCode =
  | 'invalid-name' | 'already-exists' | 'not-found'
  | 'conflict' | 'project-not-found' | 'write-failed';
```

### `PermissionsScope`

```ts
export type PermissionsScope = 'project' | 'local';
```

Which settings file the permissions editor targets.

### `PermissionsDefaultMode`

Claude Code `defaultMode` accepted in `settings.json`. Controls how permission prompts are handled.

```ts
export type PermissionsDefaultMode =
  | 'default' | 'acceptEdits' | 'auto' | 'dontAsk' | 'bypassPermissions' | 'plan';
```

### `PermissionsFileContent`

Full permissions block read by `claudePermissions:read` (Module 4 V2 form editor).

```ts
export interface PermissionsFileContent {
  scope: PermissionsScope;
  path: string;
  exists: boolean;
  mtime: string;
  allow: string[];
  deny: string[];
  ask: string[];
  defaultMode: PermissionsDefaultMode | null;
  /** Top-level keys editable as raw JSON (model, env, apiKeyHelper, …). */
  rest: string;
  /** Opaque JSON of fields managed in other tabs — round-tripped at save. */
  preservedJson: string;
  parseError?: string;
}
```

### `SavePermissionsRequest`

Request payload for `claudePermissions:save` (Module 4 V2 form editor).

```ts
export interface SavePermissionsRequest {
  scope: PermissionsScope;
  allow: string[];
  deny: string[];
  ask: string[];
  defaultMode: PermissionsDefaultMode | null;
  rest: string;
  preservedJson: string;
  mtimeAtRead: string;
}
```

### `PermissionsMutationResult`

```ts
export type PermissionsMutationResult =
  | { ok: true; file: PermissionsFileContent }
  | { ok: false; code: PermissionsMutationErrorCode; message: string; currentMtime?: string };
```

### `PermissionsMutationErrorCode`

```ts
export type PermissionsMutationErrorCode =
  | 'invalid-rest-json' | 'conflict' | 'project-not-found' | 'write-failed';
```

### `McpTransport`

Transport protocol for an MCP server entry in the structured editor.

```ts
export type McpTransport = 'stdio' | 'http' | 'sse';
```

### `McpServerForEditor`

Structured view of a single MCP server entry, read by the Module 5 V2 form editor.

```ts
export interface McpServerForEditor {
  name: string;
  exists: boolean;
  mtimeAtRead: string;
  transport: McpTransport;
  command: string;
  args: string[];
  env: Array<{ key: string; value: string }>;
  url: string;
  headersJson: string;
  restJson: string;
}
```

### `CreateMcpServerRequest`

Request payload for `claudeMcp:create`.

```ts
export interface CreateMcpServerRequest {
  name: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  env?: Array<{ key: string; value: string }>;
  url?: string;
}
```

### `SaveMcpServerRequest`

Request payload for `claudeMcp:save`.

```ts
export interface SaveMcpServerRequest {
  name: string;
  newName?: string;
  transport: McpTransport;
  command: string;
  args: string[];
  env: Array<{ key: string; value: string }>;
  url: string;
  headersJson: string;
  restJson: string;
  mtimeAtRead: string;
}
```

### `McpMutationResult`

Discriminated result for MCP server mutations (Module 5 V2 form editor).

```ts
export type McpMutationResult =
  | { ok: true; mtime: string }
  | { ok: false; code: McpMutationErrorCode; message: string; currentMtime?: string };
```

### `McpMutationErrorCode`

```ts
export type McpMutationErrorCode =
  | 'invalid-name' | 'invalid-json' | 'already-exists'
  | 'not-found' | 'conflict' | 'project-not-found' | 'write-failed';
```

### `HookEditEntry`

Editor view of a single hook entry (Module 6 V2). Matcher is empty for "always-match" rules. Stores `_handlerRaw` and `_entryRaw` to preserve advanced fields the form editor doesn't render.

```ts
export interface HookEditEntry {
  matcher: string;
  command: string;
  timeout: number | null;
  _handlerRaw?: Record<string, unknown>;
  _entryRaw?: Record<string, unknown>;
}
```

### `HookEditEvent`

All hook entries for one lifecycle event, as structured by the Module 6 V2 editor.

```ts
export interface HookEditEvent {
  event: HookEventName;
  entries: HookEditEntry[];
}
```

### `HooksFileContent`

Full hook configuration read from `settings.json` or `settings.local.json` for the Module 6 V2 editor.

```ts
export interface HooksFileContent {
  scope: PermissionsScope;
  path: string;
  exists: boolean;
  mtime: string;
  events: HookEditEvent[];
  /** Opaque JSON of non-hooks keys — round-tripped at save. */
  preservedJson: string;
  parseError?: string;
}
```

### `SaveHooksRequest`

Request payload for `claudeHooks:save` (Module 6 V2 editor).

```ts
export interface SaveHooksRequest {
  scope: PermissionsScope;
  events: HookEditEvent[];
  preservedJson: string;
  mtimeAtRead: string;
}
```

### `HooksMutationResult`

Discriminated result for hooks mutations (Module 6 V2 form editor).

```ts
export type HooksMutationResult =
  | { ok: true; file: HooksFileContent }
  | { ok: false; code: HooksMutationErrorCode; message: string; currentMtime?: string };
```

### `HooksMutationErrorCode`

```ts
export type HooksMutationErrorCode = 'conflict' | 'project-not-found' | 'write-failed';
```

### `ClaudeMdSummary`

Metadata summary for the project-root `CLAUDE.md` file. Multi-scope variants removed — only the root file is supported.

```ts
export interface ClaudeMdSummary {
  path: string;
  exists: boolean;
  lastModified: string | null;
  lines: number;
  chars: number;
  tokens: number;
  headings: string[];
  imports: string[];
  hasHtmlComments: boolean;
}
```

### `ClaudeMdListResult`

Result of `claudeMd:list` — summary + context info for the project-root CLAUDE.md.

```ts
export interface ClaudeMdListResult {
  file: ClaudeMdSummary;
  agentsMdAtRoot: boolean;
  projectPath: string;
}
```

### `ClaudeMdFileContent`

Full CLAUDE.md content read for editing. Extends `ClaudeMdSummary` with the body and mtime lock.

```ts
export interface ClaudeMdFileContent extends ClaudeMdSummary {
  body: string;
  mtime: string;
}
```

### `SaveClaudeMdRequest`

Request payload for `claudeMd:save`.

```ts
export interface SaveClaudeMdRequest {
  body: string;
  mtimeAtRead: string;
}
```

### `ClaudeMdMutationResult`

Discriminated result for CLAUDE.md mutations.

```ts
export type ClaudeMdMutationResult =
  | { ok: true; file: ClaudeMdFileContent }
  | { ok: false; code: ClaudeMdMutationErrorCode; message: string; currentMtime?: string };
```

### `ClaudeMdMutationErrorCode`

```ts
export type ClaudeMdMutationErrorCode =
  | 'not-found' | 'conflict' | 'project-not-found' | 'write-failed';
```

### `ClaudeMdAuditHistoryEntry`

One archived CLAUDE.md audit. Stored under `~/.nakiros/<projectId>/claudemd/audit/audit-<ISO>.md`. Returned sorted newest-first.

```ts
export interface ClaudeMdAuditHistoryEntry {
  path: string;
  timestamp: string;
  score: string | null;
}
```

### `SkillsGatewayInfo`

Aggregate count of skills under `.claude/skills/` — read-only, no item detail.

```ts
export interface SkillsGatewayInfo {
  present: boolean;
  count: number;
}
```

### `CommandsInfo`

Aggregate view of all slash-command files under `.claude/commands/`.

```ts
export interface CommandsInfo {
  present: boolean;
  count: number;
  items: CommandEntry[];
}
```

### `CommandEntry`

Metadata for a single slash-command file shown in the config scan view.

```ts
export interface CommandEntry {
  name: string;
  relativePath: string;
  description: string | null;
  argumentHint: string | null;
  tokens: number;
  lastModified: string | null;
}
```

### `OutputStylesInfo`

Aggregate view of all output-style files under `.claude/output-styles/`.

```ts
export interface OutputStylesInfo {
  present: boolean;
  count: number;
  items: OutputStyleEntry[];
}
```

### `OutputStyleEntry`

Metadata for a single output-style file shown in the config scan view.

```ts
export interface OutputStyleEntry {
  name: string;
  relativePath: string;
  description: string | null;
  keepCodingInstructions: boolean;
  tokens: number;
  lastModified: string | null;
}
```

### `AgentsInfo`

Aggregate view of all subagent files under `.claude/agents/`.

```ts
export interface AgentsInfo {
  present: boolean;
  count: number;
  items: AgentEntry[];
}
```

### `AgentEntry`

Metadata for a single subagent file shown in the config scan view.

```ts
export interface AgentEntry {
  name: string;
  relativePath: string;
  description: string | null;
  tools: string[];
  model: string | null;
  tokens: number;
  lastModified: string | null;
}
```

### `McpInfo`

Aggregate view of all MCP server entries in `.mcp.json`.

```ts
export interface McpInfo {
  present: boolean;
  count: number;
  path: string;
  lastModified: string | null;
  items: McpServerEntry[];
  parseError?: string;
}
```

### `McpServerEntry`

Metadata for a single MCP server entry as shown in the config scan view.

```ts
export interface McpServerEntry {
  name: string;
  transport: 'stdio' | 'sse' | 'http' | null;
  command: string | null;
  args: string[];
  envKeys: string[];
  url: string | null;
}
```

### `HooksInfo`

Aggregate view of hook entries across all events, derived from `settings.json`.

```ts
export interface HooksInfo {
  present: boolean;
  count: number;
  events: HookEventGroup[];
}
```

### `HookEventGroup`

All hook entries registered for a single lifecycle event.

```ts
export interface HookEventGroup {
  event: HookEventName;
  active: boolean;
  items: HookEntry[];
}
```

### `HookEntry`

A single hook command entry with its matcher and originating settings file.

```ts
export interface HookEntry {
  matcher: string | null;
  command: string;
  source: 'project' | 'local';
}
```

### `RuleSummary`

Summary of a single rule file under `.claude/rules/`. Returned by `rules:list`.

```ts
export interface RuleSummary {
  name: string;
  path: string;
  pathsGlob: string | null;
  description: string | null;
  mtime: string;
  sizeBytes: number;
  linesCount: number;
}
```

### `RulesListResult`

Result of `rules:list`.

```ts
export interface RulesListResult {
  rules: RuleSummary[];
}
```

### `RulesReadResult`

Full rule content read for editing — returned by `rules:read`.

```ts
export interface RulesReadResult {
  content: string;
  mtime: string;
  exists: boolean;
  path: string;
}
```

### `RulesMutationResult`

Result of `rules:save` and `rules:delete`.

```ts
export type RulesMutationResult =
  | { ok: true }
  | { ok: false; code: 'conflict' | 'project-not-found' | 'write-failed' | 'invalid-path' | 'not-found'; message: string };
```

### `RulesAuditHistoryEntry`

One archived rules audit. Stored under `~/.nakiros/<projectId>/rules-audits/<ruleName>/audit-<ISO>.md`. Returned sorted newest-first.

```ts
export interface RulesAuditHistoryEntry {
  path: string;
  timestamp: string;
  score: string | null;
}
```

### `SubagentSummary`

Summary of a single subagent file under `.claude/agents/`. Returned by `subagents:list`.

```ts
export interface SubagentSummary {
  name: string;
  path: string;
  description: string | null;
  model: string | null;
  tools: string[];
  mtime: string;
  sizeBytes: number;
  linesCount: number;
}
```

### `SubagentsListResult`

Result of `subagents:list`.

```ts
export interface SubagentsListResult {
  subagents: SubagentSummary[];
}
```

### `SubagentsReadResult`

Full subagent content read for editing — returned by `subagents:read`.

```ts
export interface SubagentsReadResult {
  content: string;
  mtime: string;
  exists: boolean;
  path: string;
}
```

### `SubagentsMutationResult`

Result of `subagents:save` and `subagents:delete`.

```ts
export type SubagentsMutationResult =
  | { ok: true }
  | { ok: false; code: 'conflict' | 'project-not-found' | 'write-failed' | 'invalid-path' | 'not-found'; message: string };
```

### `SubagentsAuditHistoryEntry`

One archived subagents audit. Stored under `~/.nakiros/<projectId>/subagents-audits/<subagentName>/audit-<ISO>.md`. Returned sorted newest-first.

```ts
export interface SubagentsAuditHistoryEntry {
  path: string;
  timestamp: string;
  score: string | null;
}
```

### `HooksReadResult`

Result of `hooks:read`. Returns the `hooks` block of `.claude/settings.json` as pretty-printed JSON. Other settings keys are not included.

```ts
export interface HooksReadResult {
  content: string;
  mtime: string;
  exists: boolean;
  path: string;
}
```

### `HooksExpertMutationResult`

Result of `hooks:save`. Writes the hooks block back into settings.json while preserving all other keys.

```ts
export interface HooksExpertMutationResult {
  ok: boolean;
  code?: 'conflict' | 'invalid-json' | 'project-not-found' | 'fs-error' | string;
  message?: string;
}
```

### `HooksAuditHistoryEntry`

One archived hooks audit. Stored under `~/.nakiros/<projectId>/hooks-audits/audit-<ISO>.md`. Singleton — no sub-folder. Returned sorted newest-first.

```ts
export interface HooksAuditHistoryEntry {
  path: string;
  timestamp: string;
  sizeBytes: number;
}
```

### `PermissionsReadResult`

Result of `permissions:read`. Returns the `permissions` block of `.claude/settings.json` as pretty-printed JSON.

```ts
export interface PermissionsReadResult {
  content: string;
  mtime: string;
  exists: boolean;
  path: string;
}
```

### `PermissionsExpertMutationResult`

Result of `permissions:save` (expert channel). Distinct from `PermissionsMutationResult` (Module 4 V2 form editor).

```ts
export interface PermissionsExpertMutationResult {
  ok: boolean;
  code?: 'conflict' | 'invalid-json' | 'project-not-found' | 'fs-error' | string;
  message?: string;
}
```

### `PermissionsAuditHistoryEntry`

One archived permissions audit. Stored under `~/.nakiros/<projectId>/permissions-audits/audit-<ISO>.md`. Singleton. Returned sorted newest-first.

```ts
export interface PermissionsAuditHistoryEntry {
  path: string;
  timestamp: string;
  sizeBytes: number;
}
```

### `McpReadResult`

Result of `mcp:read`. Returns the full content of `.mcp.json` as pretty-printed JSON. Unlike hooks/permissions experts, reads the entire file (not a sub-block).

```ts
export interface McpReadResult {
  content: string;
  mtime: string;
  exists: boolean;
  path: string;
}
```

### `McpExpertMutationResult`

Result of `mcp:save`. Writes the entire `.mcp.json` (no merge). Named `McpExpertMutationResult` to avoid collision with the Module 5 V2 editor's `McpMutationResult`.

```ts
export interface McpExpertMutationResult {
  ok: boolean;
  code?: 'conflict' | 'invalid-json' | 'project-not-found' | 'fs-error' | string;
  message?: string;
}
```

### `McpAuditHistoryEntry`

One archived MCP audit. Stored under `~/.nakiros/<projectId>/mcp-audits/audit-<ISO>.md`. Singleton. Returned sorted newest-first.

```ts
export interface McpAuditHistoryEntry {
  path: string;
  timestamp: string;
  sizeBytes: number;
}
```

### `OutputStyleSummary`

Summary of a single output-style file under `.claude/output-styles/`. Returned by `outputStyles:list`.

```ts
export interface OutputStyleSummary {
  name: string;
  path: string;
  description: string | null;
  displayName: string | null;
  mtime: string;
  sizeBytes: number;
  linesCount: number;
}
```

### `OutputStylesExpertListResult`

Result of `outputStyles:list` (expert channel). Distinct from `OutputStylesListResult` (Module 3 V2 form editor).

```ts
export interface OutputStylesExpertListResult {
  styles: OutputStyleSummary[];
}
```

### `OutputStylesReadResult`

Full output-style content read for editing — returned by `outputStyles:read`.

```ts
export interface OutputStylesReadResult {
  content: string;
  mtime: string;
  exists: boolean;
  path: string;
}
```

### `OutputStylesExpertMutationResult`

Result of `outputStyles:save` and `outputStyles:delete` (expert channel).

```ts
export interface OutputStylesExpertMutationResult {
  ok: boolean;
  code?: 'conflict' | 'invalid-name' | 'not-found' | 'project-not-found' | 'fs-error' | string;
  message?: string;
}
```

### `OutputStylesAuditHistoryEntry`

One archived output-styles audit. Stored under `~/.nakiros/<projectId>/output-styles-audits/<styleName>/audit-<ISO>.md`. Returned sorted newest-first.

```ts
export interface OutputStylesAuditHistoryEntry {
  path: string;
  timestamp: string;
  sizeBytes: number;
}
```
