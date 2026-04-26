import type { BundledSkillConflictResolution } from '@nakiros/shared';
import {
  listBundledSkills,
  readBundledSkill,
  readBundledSkillFile,
  saveBundledSkillFile,
} from '../../services/bundled-skills-reader.js';
import {
  listBundledSkillConflicts,
  promoteBundledSkill,
  readBundledSkillConflictDiff,
  resolveBundledSkillConflict,
} from '../../services/bundled-skills-sync.js';
import { createTypedHandler } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

/**
 * Registers the `nakiros:*` IPC channels for Nakiros bundled skills (the ROM)
 * stored under `~/.nakiros/skills/` and conflict resolution with user edits.
 *
 * Channels:
 * - `nakiros:listBundledSkills` — every bundled skill available on disk
 * - `nakiros:getBundledSkill` — one bundled skill's SKILL.md + tree
 * - `nakiros:readBundledSkillFile` / `nakiros:saveBundledSkillFile` — file-level CRUD
 * - `nakiros:promoteBundledSkill` — convert a user-edited bundled skill into a user-owned skill
 * - `nakiros:listBundledSkillConflicts` — conflicts between ROM updates and user edits
 * - `nakiros:resolveBundledSkillConflict` — apply one of `apply-rom` | `keep-mine` | `promote-mine`
 * - `nakiros:readBundledSkillConflictDiff` — per-file diff used by the conflict UI
 */
export const bundledSkillsHandlers: HandlerRegistry = {
  'nakiros:listBundledSkills': createTypedHandler(listBundledSkills),
  'nakiros:getBundledSkill': createTypedHandler(readBundledSkill),
  'nakiros:readBundledSkillFile': createTypedHandler(readBundledSkillFile),
  'nakiros:saveBundledSkillFile': createTypedHandler(saveBundledSkillFile),
  'nakiros:promoteBundledSkill': createTypedHandler(promoteBundledSkill),
  'nakiros:listBundledSkillConflicts': createTypedHandler(listBundledSkillConflicts),
  'nakiros:resolveBundledSkillConflict': createTypedHandler(
    (skillName: string, resolution: BundledSkillConflictResolution) =>
      resolveBundledSkillConflict(skillName, resolution),
  ),
  'nakiros:readBundledSkillConflictDiff': createTypedHandler(readBundledSkillConflictDiff),
};
