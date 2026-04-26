import type { EditorId } from '../types/onboarding.js';

/**
 * Static metadata for one editor/agent environment Nakiros integrates with.
 * Two installers consume this:
 *
 * - **Onboarding** (`onboarding-installer.ts`): joins `homeMarkerRelative` with
 *   `~` to detect a global install and seed `~/.<editor>/commands/` once.
 * - **Per-repo** (`agent-installer.ts`): joins `homeMarkerRelative` with the
 *   repo path to write the project-scoped commands directory.
 *
 * Source of truth — neither installer should redefine label / marker /
 * commands subdirectory per editor.
 */
export interface EditorDefinition {
  id: EditorId;
  /** Human-readable label shown to the user. */
  label: string;
  /**
   * Marker directory relative to a base path (`~` for global, repo root for
   * per-repo). Same name on disk in both contexts (`.claude`, `.cursor`,
   * `.codex`).
   */
  homeMarkerRelative: string;
  /**
   * Subdirectory under `homeMarkerRelative` that holds the Nakiros
   * command/prompt files (`commands` for Claude/Cursor, `prompts` for Codex).
   */
  commandsSubdir: string;
}

/** Source-of-truth definitions for every supported editor environment. */
export const EDITOR_DEFINITIONS: Record<EditorId, EditorDefinition> = {
  claude: {
    id: 'claude',
    label: 'Claude Code',
    homeMarkerRelative: '.claude',
    commandsSubdir: 'commands',
  },
  cursor: {
    id: 'cursor',
    label: 'Cursor',
    homeMarkerRelative: '.cursor',
    commandsSubdir: 'commands',
  },
  codex: {
    id: 'codex',
    label: 'Codex',
    homeMarkerRelative: '.codex',
    commandsSubdir: 'prompts',
  },
};

/** Iterate `EDITOR_DEFINITIONS` in `EditorId` declaration order. */
export const EDITOR_DEFINITION_LIST: readonly EditorDefinition[] = (
  Object.keys(EDITOR_DEFINITIONS) as EditorId[]
).map((id) => EDITOR_DEFINITIONS[id]);
