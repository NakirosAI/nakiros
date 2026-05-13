/**
 * Parse + validate markdown recommendation cards produced by the
 * `recommendation-analyze` runner. Cards have a YAML frontmatter block and
 * a body composed of `## Why`, `## Brief`, and `## Acceptance criteria`
 * sections.
 */
import { parse as parseYaml } from 'yaml';

import type {
  RecoCard,
  RecommendationArtifactType,
  RecommendationZoneRef,
} from '@nakiros/shared';
import type { ProjectInventory } from './recommendation-inventory.js';

const VALID_ARTIFACT_TYPES: ReadonlySet<RecommendationArtifactType> = new Set<RecommendationArtifactType>([
  'rules', 'skill', 'claudemd', 'subagent',
  'hook', 'permission', 'mcp', 'output-style',
]);

interface ParseError {
  ok: false;
  reason: string;
}

interface ParseOk {
  ok: true;
  card: RecoCard;
  /** True when the parser had to downgrade `action: fix` → `action: create` (target unknown). */
  downgraded?: boolean;
}

/** Result type returned by {@link parseRecoCardFromMarkdown}. */
export type ParseResult = ParseOk | ParseError;

interface ParsedFrontmatter {
  recId?: unknown;
  patternId?: unknown;
  action?: unknown;
  artifactType?: unknown;
  target?: unknown;
  title?: unknown;
  evidence?: { zoneRefs?: unknown; files?: unknown };
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

/**
 * Parse a markdown card file. Validates frontmatter against the spec
 * schema. Optionally cross-checks `target` against a `ProjectInventory`
 * to downgrade `fix` → `create` when the target doesn't exist.
 *
 * The downgrade behaviour is critical: when the agent claims `action: fix`
 * but the target doesn't exist in inventory, a usable card is still returned
 * (downgraded to `create` with `target: 'new'`) rather than skipping.
 * Callers can detect this via `result.downgraded === true`.
 *
 * @param rawMarkdown Full markdown content including YAML frontmatter.
 * @param patternId   Expected `patternId` value — validated against the frontmatter field.
 * @param inventory   Optional inventory for cross-checking `action: fix` targets.
 * @returns A {@link ParseResult} discriminated union — `ok: true` on success.
 */
export function parseRecoCardFromMarkdown(
  rawMarkdown: string,
  patternId: string,
  inventory?: ProjectInventory,
): ParseResult {
  const match = FRONTMATTER_RE.exec(rawMarkdown);
  if (!match) return { ok: false, reason: 'missing frontmatter' };
  const [, fmText, body] = match;
  let fm: ParsedFrontmatter;
  try {
    fm = parseYaml(fmText) as ParsedFrontmatter;
  } catch (err) {
    return { ok: false, reason: `invalid yaml: ${(err as Error).message}` };
  }

  const recId = strOrNull(fm.recId);
  if (!recId) return { ok: false, reason: 'missing recId' };
  if (strOrNull(fm.patternId) !== patternId) return { ok: false, reason: 'patternId mismatch' };

  const action = fm.action === 'fix' || fm.action === 'create' ? fm.action : null;
  if (!action) return { ok: false, reason: 'invalid action' };

  const artifactType = strOrNull(fm.artifactType);
  if (!artifactType || !VALID_ARTIFACT_TYPES.has(artifactType as RecommendationArtifactType)) {
    return { ok: false, reason: 'invalid artifactType' };
  }

  let target = strOrNull(fm.target);
  if (!target) return { ok: false, reason: 'missing target' };

  let downgraded = false;
  let finalAction: 'fix' | 'create' = action;
  if (action === 'fix' && inventory) {
    const exists = inventory.items.some(
      (it) => it.type === artifactType && it.id === target,
    );
    if (!exists) {
      finalAction = 'create';
      target = 'new';
      downgraded = true;
    }
  }

  const title = strOrNull(fm.title) ?? `${artifactType} ${finalAction}`;

  const brief = extractSection(body, 'Brief');
  if (!brief || brief.trim().length < 20) {
    return { ok: false, reason: 'missing or empty Brief section' };
  }

  const zoneRefs = parseZoneRefs(fm.evidence?.zoneRefs);
  const files = parseStringArray(fm.evidence?.files);

  const card: RecoCard = {
    recId,
    patternId,
    action: finalAction,
    artifactType: artifactType as RecommendationArtifactType,
    target,
    title,
    body: rawMarkdown,
    brief: brief.trim(),
    evidence: { zoneRefs, files },
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  return { ok: true, card, downgraded: downgraded || undefined };
}

/**
 * Re-hydrate a card from disk by combining a stored markdown body and its
 * sidecar JSON. Skips the inventory cross-check (the card was already
 * validated when first persisted). Used by `recommendation-store.ts` to
 * reconstruct cards on read.
 *
 * @param rawMarkdown Markdown content read from `<recId>.md`.
 * @param sidecar     Sidecar metadata read from `<recId>.json`.
 * @returns A fully hydrated {@link RecoCard}, or `null` when the markdown
 *          cannot be re-parsed (e.g. file was manually corrupted).
 */
export function parseRecoCardFromDisk(
  rawMarkdown: string,
  sidecar: {
    recId: string;
    patternId: string;
    status: RecoCard['status'];
    appliedRunId?: string;
    createdAt: string;
    editedAt?: string;
  },
): RecoCard | null {
  const result = parseRecoCardFromMarkdown(rawMarkdown, sidecar.patternId);
  if (!result.ok) return null;
  return {
    ...result.card,
    recId: sidecar.recId,
    status: sidecar.status,
    appliedRunId: sidecar.appliedRunId,
    createdAt: sidecar.createdAt,
    editedAt: sidecar.editedAt,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function parseStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function parseZoneRefs(v: unknown): RecommendationZoneRef[] {
  if (!Array.isArray(v)) return [];
  const out: RecommendationZoneRef[] = [];
  for (const raw of v) {
    if (raw && typeof raw === 'object') {
      const obj = raw as { convoId?: unknown; zoneId?: unknown };
      const convoId = strOrNull(obj.convoId);
      const zoneId = strOrNull(obj.zoneId);
      if (convoId && zoneId) out.push({ convoId, zoneId });
    }
  }
  return out;
}

/** Extract `## <name>` section content from a markdown body. */
function extractSection(body: string, name: string): string | null {
  const re = new RegExp(`(^|\\n)##\\s+${name}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i');
  const m = re.exec(body);
  if (!m) return null;
  return m[2].trim();
}
