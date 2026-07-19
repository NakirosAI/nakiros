/** Project-native Codex resources managed by Hestia. */
export type CodexResourceKind =
  | 'instructions'
  | 'rules'
  | 'subagents'
  | 'skills'
  | 'hooks'
  | 'permissions'
  | 'mcp'
  | 'native-config';

export interface CodexResourceSummary {
  /** Stable project-relative identifier. */
  id: string;
  name: string;
  /** Project-relative path, using forward slashes on every platform. */
  path: string;
  kind: CodexResourceKind;
}

export interface CodexResourceFile extends CodexResourceSummary {
  content: string;
  exists: boolean;
  /** ISO mtime used as an optimistic-lock token; empty for absent files. */
  mtime: string;
}

export type CodexResourceErrorCode =
  | 'invalid-id'
  | 'invalid-json'
  | 'invalid-toml'
  | 'invalid-configuration'
  | 'not-found'
  | 'conflict'
  | 'unsafe-path'
  | 'project-not-found'
  | 'read-failed'
  | 'write-failed';

export type CodexResourceReadResult =
  | { ok: true; file: CodexResourceFile }
  | { ok: false; code: CodexResourceErrorCode; message: string; currentMtime?: string };

export type CodexResourceMutationResult = CodexResourceReadResult;
