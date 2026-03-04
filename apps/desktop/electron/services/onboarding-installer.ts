import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { homedir, platform } from 'os';
import { dirname, join, resolve } from 'path';
import type { BrowserWindow } from 'electron';

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
  return (Object.entries(EDITOR_DEFS) as [EditorId, typeof EDITOR_DEFS[EditorId]][]).map(
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

function findRuntimeSourceDir(): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  let repoRoot = resolve(__dirname);
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(repoRoot, 'package.json'))) break;
    const parent = dirname(repoRoot);
    if (parent === repoRoot) break;
    repoRoot = parent;
  }
  const candidates = [
    ...(resourcesPath ? [join(resourcesPath, '_nakiros')] : []),
    join(repoRoot, '_nakiros'),
    join(repoRoot, 'apps', 'desktop', '_nakiros'),
  ];
  for (const p of candidates) {
    if (existsSync(join(p, 'core', 'tasks', 'workflow.xml'))) return p;
  }
  throw new Error('Runtime _nakiros introuvable.');
}

function copyDirRecursive(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const dstPath = join(dst, entry.name);
    if (entry.isDirectory()) copyDirRecursive(srcPath, dstPath);
    else if (entry.isFile()) copyFileSync(srcPath, dstPath);
  }
}

function emit(win: BrowserWindow, event: OnboardingProgressEvent): void {
  win.webContents.send('onboarding:progress', event);
}

export async function installNakiros(
  editors: DetectedEditor[],
  commandTemplates: Record<string, string>,
  win: BrowserWindow,
): Promise<OnboardingInstallResult> {
  const errors: string[] = [];

  // 1. Créer la structure ~/.nakiros/
  try {
    mkdirSync(join(GLOBAL_DIR, 'agents'), { recursive: true });
    mkdirSync(join(GLOBAL_DIR, 'workflows'), { recursive: true });
    mkdirSync(join(GLOBAL_DIR, 'core'), { recursive: true });
    mkdirSync(join(GLOBAL_DIR, 'workspaces'), { recursive: true });
    emit(win, { label: '~/.nakiros/ créé', done: true });
  } catch (err) {
    const msg = `Création ~/.nakiros/ : ${(err as Error).message}`;
    errors.push(msg);
    emit(win, { label: msg, done: false, error: msg });
  }

  // 2. Copier le runtime (agents/, workflows/, core/)
  try {
    const src = findRuntimeSourceDir();
    copyDirRecursive(join(src, 'agents'), join(GLOBAL_DIR, 'agents'));
    copyDirRecursive(join(src, 'workflows'), join(GLOBAL_DIR, 'workflows'));
    copyDirRecursive(join(src, 'core'), join(GLOBAL_DIR, 'core'));
    const agentCount = readdirSync(join(GLOBAL_DIR, 'agents')).length;
    emit(win, { label: `Agents installés (${agentCount})`, done: true });
    emit(win, { label: 'Workflows installés', done: true });
  } catch (err) {
    const msg = `Copie runtime : ${(err as Error).message}`;
    errors.push(msg);
    emit(win, { label: msg, done: false, error: msg });
  }

  // 3. Écrire config.yaml par défaut
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

  // 4. Déployer les commandes dans les éditeurs détectés
  for (const editor of editors.filter((e) => e.detected)) {
    try {
      mkdirSync(editor.targetDir, { recursive: true });
      for (const [fileName, content] of Object.entries(commandTemplates)) {
        writeFileSync(join(editor.targetDir, fileName), content, 'utf8');
      }
      emit(win, { label: `${editor.label} : commandes déployées`, done: true });
    } catch (err) {
      const msg = `${editor.label} : ${(err as Error).message}`;
      errors.push(msg);
      emit(win, { label: msg, done: false, error: msg });
    }
  }

  // 5. Écrire version.json
  try {
    writeFileSync(
      join(GLOBAL_DIR, 'version.json'),
      JSON.stringify(
        {
          nakiros_app: '1.0.0',
          agents_version: '1.0.0',
          workflows_version: '1.0.0',
          last_check: new Date().toISOString(),
          files: {},
        },
        null,
        2,
      ) + '\n',
      'utf-8',
    );
    emit(win, { label: 'version.json enregistré', done: true });
  } catch (err) {
    const msg = `version.json : ${(err as Error).message}`;
    errors.push(msg);
    emit(win, { label: msg, done: false, error: msg });
  }

  return { success: errors.length === 0, errors };
}
