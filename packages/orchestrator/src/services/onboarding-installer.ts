import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export type EditorId = 'claude' | 'cursor' | 'codex';

export interface DetectedEditor {
  id: EditorId;
  label: string;
  detected: boolean;
  targetDir: string;
}

const GLOBAL_DIR = join(homedir(), '.nakiros');

const EDITOR_DEFS: Record<EditorId, { label: string; markerPaths: string[]; targetDir: string }> = {
  claude: {
    label: 'Claude Code',
    markerPaths: ['/usr/local/bin/claude', join(homedir(), '.claude')],
    targetDir: join(homedir(), '.claude', 'commands'),
  },
  cursor: {
    label: 'Cursor',
    markerPaths: ['/Applications/Cursor.app', join(homedir(), '.cursor')],
    targetDir: join(homedir(), '.cursor', 'commands'),
  },
  codex: {
    label: 'Codex',
    markerPaths: ['/usr/local/bin/codex', join(homedir(), '.codex')],
    targetDir: join(homedir(), '.codex', 'commands'),
  },
};

export function detectEditors(): DetectedEditor[] {
  return (Object.entries(EDITOR_DEFS) as [EditorId, (typeof EDITOR_DEFS)[EditorId]][]).map(
    ([id, def]) => ({
      id,
      label: def.label,
      detected: def.markerPaths.some((p) => existsSync(p)),
      targetDir: def.targetDir,
    }),
  );
}

export function nakirosConfigExists(): boolean {
  return existsSync(join(GLOBAL_DIR, 'config.yaml'));
}
