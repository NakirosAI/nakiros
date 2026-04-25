import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

import type {
  SkillAgentTempFileContent,
  SkillAgentTempFileEntry,
} from '@nakiros/shared';

import { getFixTempWorkdir } from '../../services/fix-runner.js';
import type { HandlerRegistry } from './index.js';

// Nakiros-internal runtime paths — never surfaced in the draft file view.
const TEMP_HIDDEN_PATHS = new Set(['.claude', 'run.json']);

function shouldHideTempEntry(rel: string): boolean {
  for (const hidden of TEMP_HIDDEN_PATHS) {
    if (rel === hidden || rel.startsWith(hidden + '/')) return true;
  }
  if (rel.startsWith('evals/workspace/')) return true;
  return false;
}

const TEMP_FILE_IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  avif: 'image/avif',
};

/** Max bytes we send as text — above that we treat as opaque binary. */
const MAX_TEMP_TEXT_BYTES = 1_000_000;

/**
 * Registers the `skillAgent:*` IPC channels — shared draft-file surface for
 * the fix + create runners. Reads files from the run's temp workdir, hiding
 * Nakiros-internal runtime paths (`.claude/`, `run.json`, `evals/workspace/`).
 *
 * Channels:
 * - `skillAgent:listTempFiles` — lists user-facing draft files inside the temp workdir
 * - `skillAgent:readTempFile` — returns text, image data URL, or binary-size placeholder (> 1 MB)
 */
export const skillAgentHandlers: HandlerRegistry = {
  'skillAgent:listTempFiles': (args): SkillAgentTempFileEntry[] => {
    const runId = args[0] as string;
    const tempDir = getFixTempWorkdir(runId);
    if (!tempDir || !existsSync(tempDir)) return [];

    const entries: SkillAgentTempFileEntry[] = [];
    const walk = (dir: string): void => {
      let items: import('fs').Dirent[];
      try {
        items = readdirSync(dir, { withFileTypes: true }) as import('fs').Dirent[];
      } catch {
        return;
      }
      for (const item of items) {
        const full = join(dir, item.name);
        const rel = full.slice(tempDir.length + 1);
        if (shouldHideTempEntry(rel)) continue;
        if (item.isDirectory()) {
          walk(full);
        } else if (item.isFile()) {
          try {
            const s = statSync(full);
            entries.push({
              relativePath: rel,
              sizeBytes: s.size,
              modifiedAt: s.mtime.toISOString(),
            });
          } catch {
            // ignore
          }
        }
      }
    };
    walk(tempDir);
    entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    return entries;
  },

  'skillAgent:readTempFile': (args): SkillAgentTempFileContent => {
    const runId = args[0] as string;
    const relativePath = args[1] as string;
    const tempDir = getFixTempWorkdir(runId);
    if (!tempDir) return { kind: 'missing' };
    const abs = resolve(tempDir, relativePath);
    if (!abs.startsWith(tempDir + '/') && abs !== tempDir) return { kind: 'missing' };
    if (shouldHideTempEntry(relativePath)) return { kind: 'missing' };
    if (!existsSync(abs)) return { kind: 'missing' };

    const ext = relativePath.split('.').pop()?.toLowerCase() ?? '';
    const imgMime = TEMP_FILE_IMAGE_MIME[ext];
    try {
      const stat = statSync(abs);
      if (imgMime) {
        const buf = readFileSync(abs);
        return {
          kind: 'image',
          dataUrl: `data:${imgMime};base64,${buf.toString('base64')}`,
        };
      }
      if (stat.size > MAX_TEMP_TEXT_BYTES) {
        return { kind: 'binary', sizeBytes: stat.size };
      }
      return { kind: 'text', content: readFileSync(abs, 'utf8') };
    } catch {
      return { kind: 'missing' };
    }
  },
};
