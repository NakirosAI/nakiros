/** Raw project-scoped Codex configuration stored in `.codex/config.toml`. */
export interface CodexConfigFile {
  /** TOML source exactly as stored on disk. */
  content: string;
  /** ISO mtime used as the optimistic-lock token. Empty when the file is absent. */
  mtime: string;
  /** Whether `.codex/config.toml` exists on disk. */
  exists: boolean;
  /** Absolute path to `.codex/config.toml`. */
  path: string;
}

/** Result of `codexConfig:read`. */
export type CodexConfigReadResult =
  | { ok: true; file: CodexConfigFile }
  | {
      ok: false;
      code: 'project-not-found' | 'read-failed' | 'unsafe-path';
      message: string;
    };

/** Result of `codexConfig:save`. */
export type CodexConfigMutationResult =
  | { ok: true; file: CodexConfigFile }
  | {
      ok: false;
      code:
        | 'project-not-found'
        | 'invalid-toml'
        | 'conflict'
        | 'write-failed'
        | 'unsafe-path';
      message: string;
    };
