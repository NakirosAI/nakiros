import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

import type { SkillScope } from '@nakiros/shared';

import { resolveSkillDir } from './skill-dir.js';
import type { HandlerRegistry } from './index.js';

const DATA_URL_MIME_BY_EXT: Record<string, string> = {
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

interface ReadFileRequest {
  scope: SkillScope;
  projectId?: string;
  pluginName?: string;
  marketplaceName?: string;
  skillName: string;
  relativePath: string;
}

/**
 * Registers the cross-scope `skill:readFileAsDataUrl` channel used by the UI
 * to render binary/asset files (images, icons) inside any skill regardless of
 * its scope (project, nakiros-bundled, claude-global, plugin). Only whitelisted
 * image MIME types are returned; anything else yields `null`.
 */
export const skillsCommonHandlers: HandlerRegistry = {
  'skill:readFileAsDataUrl': (args) => {
    const request = args[0] as ReadFileRequest;
    const skillDir = resolveSkillDir(request);
    const abs = resolve(skillDir, request.relativePath);
    if (!abs.startsWith(skillDir + '/') && abs !== skillDir) return null;
    if (!existsSync(abs)) return null;
    const ext = request.relativePath.split('.').pop()?.toLowerCase() ?? '';
    const mime = DATA_URL_MIME_BY_EXT[ext];
    if (!mime) return null;
    try {
      const buf = readFileSync(abs);
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  },
};
