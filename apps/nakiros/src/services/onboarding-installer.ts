import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

import type {
  DetectedEditor,
  EditorId,
  OnboardingInstallResult,
  OnboardingProgressEvent,
} from '@nakiros/shared';
import { EDITOR_DEFINITION_LIST } from '@nakiros/shared';

import { eventBus } from '../daemon/event-bus.js';

const NAKIROS_VERSION = '1.0.0';

const GLOBAL_DIR = join(homedir(), '.nakiros');

/**
 * OS-specific binary/app paths that, when present, also indicate the editor
 * is installed. Used in addition to the home marker (`~/.claude`, `~/.cursor`,
 * `~/.codex`) coming from `EDITOR_DEFINITION_LIST`.
 */
const EXTRA_DETECTION_PATHS: Record<EditorId, string[]> = {
  claude: ['/usr/local/bin/claude'],
  cursor: ['/Applications/Cursor.app'],
  codex: ['/usr/local/bin/codex'],
};

/** Scan well-known install paths for Claude Code / Cursor / Codex and report presence. */
export function detectEditors(): DetectedEditor[] {
  return EDITOR_DEFINITION_LIST.map((def) => {
    const homeMarker = join(homedir(), def.homeMarkerRelative);
    const markerPaths = [homeMarker, ...EXTRA_DETECTION_PATHS[def.id]];
    return {
      id: def.id,
      label: def.label,
      detected: markerPaths.some((p) => existsSync(p)),
      targetDir: join(homedir(), def.homeMarkerRelative, def.commandsSubdir),
    };
  });
}

/** True when `~/.nakiros/config.yaml` exists — used by the UI to skip onboarding. */
export function nakirosConfigExists(): boolean {
  return existsSync(join(GLOBAL_DIR, 'config.yaml'));
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
): Promise<OnboardingInstallResult> {
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
