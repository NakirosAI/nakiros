import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { eventBus } from '../daemon/event-bus.js';

const NAKIROS_VERSION = '1.0.0';

/** Identifier for an editor/agent environment the onboarding can install into. */
export type EditorId = 'claude' | 'cursor' | 'codex';

/** Result of {@link detectEditors}: presence + label + target commands dir for one editor. */
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

/** Scan well-known install paths for Claude Code / Cursor / Codex and report presence. */
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

/** True when `~/.nakiros/config.yaml` exists — used by the UI to skip onboarding. */
export function nakirosConfigExists(): boolean {
  return existsSync(join(GLOBAL_DIR, 'config.yaml'));
}

interface OnboardingProgressEvent {
  label: string;
  done: boolean;
  error?: string;
}

function emitProgress(event: OnboardingProgressEvent): void {
  eventBus.broadcast('onboarding:progress', event);
}

/**
 * One-shot installer: create `~/.nakiros/` layout, seed `config.yaml` and
 * `version.json` if missing, and mark each detected editor as ready.
 *
 * Broadcasts step-by-step progress on the `onboarding:progress` channel so the
 * UI can render a live install log. Errors are collected and returned instead
 * of thrown — the caller displays them next to the step that failed.
 */
export async function installNakiros(
  editors: DetectedEditor[],
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];

  try {
    mkdirSync(join(GLOBAL_DIR, 'agents'), { recursive: true });
    mkdirSync(join(GLOBAL_DIR, 'workflows'), { recursive: true });
    mkdirSync(join(GLOBAL_DIR, 'commands'), { recursive: true });
    mkdirSync(join(GLOBAL_DIR, 'core'), { recursive: true });
    mkdirSync(join(GLOBAL_DIR, 'workspaces'), { recursive: true });
    emitProgress({ label: '~/.nakiros/ créé', done: true });
  } catch (err) {
    const msg = `Création ~/.nakiros/ : ${(err as Error).message}`;
    errors.push(msg);
    emitProgress({ label: msg, done: false, error: msg });
  }

  try {
    const configPath = join(GLOBAL_DIR, 'config.yaml');
    if (!existsSync(configPath)) {
      writeFileSync(
        configPath,
        [
          '# Nakiros global config',
          `nakiros_version: '${NAKIROS_VERSION}'`,
          'communication_language: fr',
          'document_language: en',
        ].join('\n') + '\n',
        'utf-8',
      );
    }
    emitProgress({ label: 'config.yaml créé', done: true });
  } catch (err) {
    const msg = `config.yaml : ${(err as Error).message}`;
    errors.push(msg);
    emitProgress({ label: msg, done: false, error: msg });
  }

  try {
    const versionPath = join(GLOBAL_DIR, 'version.json');
    if (!existsSync(versionPath)) {
      writeFileSync(
        versionPath,
        JSON.stringify(
          {
            bundle_version: NAKIROS_VERSION,
            channel: 'local',
            app_version: NAKIROS_VERSION,
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
    emitProgress({ label: 'version.json créé', done: true });
  } catch (err) {
    const msg = `version.json : ${(err as Error).message}`;
    errors.push(msg);
    emitProgress({ label: msg, done: false, error: msg });
  }

  for (const editor of editors.filter((e) => e.detected)) {
    emitProgress({ label: `${editor.label} : détecté`, done: true });
  }

  return { success: errors.length === 0, errors };
}
