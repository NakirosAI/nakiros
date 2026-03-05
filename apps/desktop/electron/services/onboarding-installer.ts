import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { app } from 'electron';
import type { BrowserWindow } from 'electron';
import { checkForUpdates, applyUpdate, getVersionInfo } from './update-checker.js';

export type EditorId = 'claude' | 'cursor' | 'codex';

export interface DetectedEditor {
  id: EditorId;
  label: string;
  detected: boolean;
  targetDir: string;
}

export interface OnboardingProgressEvent {
  label: string;
  done: boolean;
  error?: string;
}

export interface OnboardingInstallResult {
  success: boolean;
  errors: string[];
}

const GLOBAL_DIR = join(homedir(), '.nakiros');

const EDITOR_DEFS: Record<EditorId, { label: string; markerPaths: string[]; targetDir: string }> = {
  claude: {
    label: 'Claude Code',
    markerPaths: [join(homedir(), '.claude')],
    targetDir: join(homedir(), '.claude', 'commands'),
  },
  cursor: {
    label: 'Cursor',
    markerPaths: [
      '/Applications/Cursor.app',
      join(homedir(), '.cursor'),
      join(homedir(), 'AppData', 'Local', 'Programs', 'cursor'),
    ],
    targetDir: join(homedir(), '.cursor', 'commands'),
  },
  codex: {
    label: 'Codex',
    markerPaths: [join(homedir(), '.codex')],
    targetDir: join(homedir(), '.codex', 'prompts'),
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
  if (!existsSync(join(GLOBAL_DIR, 'config.yaml'))) return false;
  const info = getVersionInfo();
  // bundle_version '0.0.0' = R2 download failed during onboarding → show onboarding again
  return !!info && info.bundle_version !== '0.0.0';
}

function emit(win: BrowserWindow, event: OnboardingProgressEvent): void {
  win.webContents.send('onboarding:progress', event);
}

export async function installNakiros(
  editors: DetectedEditor[],
  win: BrowserWindow,
): Promise<OnboardingInstallResult> {
  const errors: string[] = [];

  // 1. Créer la structure ~/.nakiros/
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

  // 2. Télécharger agents/workflows/commands/core depuis R2
  let r2Success = false;
  emit(win, { label: 'Connexion aux serveurs Nakiros…', done: false });
  try {
    const result = await checkForUpdates(true, 'stable');
    if (result.networkError) {
      errors.push('network');
      emit(win, {
        label: 'Erreur réseau — impossible de joindre les serveurs Nakiros',
        done: false,
        error: 'network',
      });
    } else if (!result.compatible) {
      errors.push('incompatible');
      emit(win, {
        label: 'Version app incompatible — agents installables depuis les Settings',
        done: false,
        error: 'incompatible',
      });
    } else if (result.changedFiles.length > 0) {
      let downloaded = 0;
      let failed = 0;
      await applyUpdate(
        result.changedFiles,
        result.latestVersion,
        win,
        (filename, done, error) => {
          if (done) {
            downloaded += 1;
            emit(win, { label: `↓ ${filename}`, done: true });
          } else {
            failed += 1;
            emit(win, { label: `✗ ${filename} : ${error ?? 'erreur'}`, done: false, error });
          }
        },
      );
      if (failed > 0) {
        errors.push(`${failed} fichier(s) en erreur`);
      } else {
        r2Success = true;
      }
      emit(win, {
        label: `${downloaded} fichier(s) installé(s)${failed > 0 ? `, ${failed} en erreur` : ''}`,
        done: failed === 0,
        error: failed > 0 ? `${failed} fichier(s) en erreur` : undefined,
      });
    } else {
      // changedFiles vide sans erreur — ne devrait pas arriver en première installation
      emit(win, { label: 'Aucun fichier à télécharger depuis R2', done: false, error: 'empty' });
      errors.push('empty');
    }
  } catch (err) {
    const msg = (err as Error).message;
    errors.push(msg);
    emit(win, { label: `Erreur inattendue : ${msg}`, done: false, error: msg });
  }

  // 3. Écrire config.yaml (silencieux — ne pas afficher si R2 a échoué)
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
    if (r2Success) emit(win, { label: 'config.yaml créé', done: true });
  } catch (err) {
    const msg = `config.yaml : ${(err as Error).message}`;
    errors.push(msg);
    emit(win, { label: msg, done: false, error: msg });
  }

  // 4. Confirmer les éditeurs détectés — uniquement si R2 a réussi
  if (r2Success) {
    for (const editor of editors.filter((e) => e.detected)) {
      emit(win, { label: `${editor.label} : commandes déployées`, done: true });
    }
  }

  // 5. Écrire version.json fallback si R2 était inaccessible
  if (!getVersionInfo()) {
    try {
      writeFileSync(
        join(GLOBAL_DIR, 'version.json'),
        JSON.stringify(
          {
            bundle_version: '0.0.0',
            channel: 'stable',
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
      emit(win, { label: 'version.json créé', done: true });
    } catch (err) {
      const msg = `version.json : ${(err as Error).message}`;
      errors.push(msg);
      emit(win, { label: msg, done: false, error: msg });
    }
  }

  return { success: errors.length === 0, errors };
}
