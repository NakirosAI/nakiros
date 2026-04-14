import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { app } from 'electron';
import type { BrowserWindow } from 'electron';

export type EditorId = 'claude' | 'cursor' | 'codex';

export interface DetectedEditor {
  id: EditorId;
  label: string;
  detected: boolean;
  targetDir: string;
}

interface OnboardingProgressEvent {
  label: string;
  done: boolean;
  error?: string;
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

function emit(win: BrowserWindow, event: OnboardingProgressEvent): void {
  win.webContents.send('onboarding:progress', event);
}

export async function installNakiros(
  editors: DetectedEditor[],
  win: BrowserWindow,
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];

  // 1. Create ~/.nakiros/ structure
  try {
    mkdirSync(join(GLOBAL_DIR, 'agents'), { recursive: true });
    mkdirSync(join(GLOBAL_DIR, 'workflows'), { recursive: true });
    mkdirSync(join(GLOBAL_DIR, 'commands'), { recursive: true });
    mkdirSync(join(GLOBAL_DIR, 'core'), { recursive: true });
    mkdirSync(join(GLOBAL_DIR, 'workspaces'), { recursive: true });
    emit(win, { label: '~/.nakiros/ créé', done: true });
  } catch (err) {
    const msg = `Création ~/.nakiros/ : ${(err as Error).message}`;
    errors.push(msg);
    emit(win, { label: msg, done: false, error: msg });
  }

  // 2. Write config.yaml
  try {
    const configPath = join(GLOBAL_DIR, 'config.yaml');
    if (!existsSync(configPath)) {
      writeFileSync(
        configPath,
        [
          '# Nakiros global config',
          `nakiros_version: '1.0.0'`,
          `communication_language: fr`,
          `document_language: en`,
        ].join('\n') + '\n',
        'utf-8',
      );
    }
    emit(win, { label: 'config.yaml créé', done: true });
  } catch (err) {
    const msg = `config.yaml : ${(err as Error).message}`;
    errors.push(msg);
    emit(win, { label: msg, done: false, error: msg });
  }

  // 3. Write version.json
  try {
    const versionPath = join(GLOBAL_DIR, 'version.json');
    if (!existsSync(versionPath)) {
      writeFileSync(
        versionPath,
        JSON.stringify(
          {
            bundle_version: app.getVersion(),
            channel: 'local',
            app_version: app.getVersion(),
            last_check: new Date().toISOString(),
            installed_at: new Date().toISOString(),
            files: {},
          },
          null,
          2,
        ) + '\n',
        'utf-8',
      );
    }
    emit(win, { label: 'version.json créé', done: true });
  } catch (err) {
    const msg = `version.json : ${(err as Error).message}`;
    errors.push(msg);
    emit(win, { label: msg, done: false, error: msg });
  }

  // 4. Confirm detected editors
  for (const editor of editors.filter((e) => e.detected)) {
    emit(win, { label: `${editor.label} : détecté`, done: true });
  }

  return { success: errors.length === 0, errors };
}
