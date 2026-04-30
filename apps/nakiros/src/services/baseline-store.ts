import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { isCurrentModelFullId } from '@nakiros/shared';

import { getNakirosDir } from '../utils/nakiros-dir.js';
import type { EvalConfigStats } from './eval-benchmark.js';

/**
 * Cache schema version. Bump when {@link BaselineRecord} shape changes —
 * existing files with a mismatched version are ignored and the baseline is
 * recomputed on next eval run. Same pattern as `conversation-analysis-cache.ts`.
 */
const BASELINE_VERSION = 1;

/**
 * On-disk shape of `baseline.json`. Each baseline lives in its own directory
 * under `~/.nakiros/baselines/<skill>/<eval>/<modelFullId>/<fingerprint>/`.
 * The directory also holds the artefacts (run.json, grading.json, timing.json,
 * outputs/) for drill-down — see `docs/refactoring/08-baseline-per-model.md`.
 */
export interface BaselineRecord {
  /** Schema version. {@link BASELINE_VERSION} at write time. */
  version: number;
  skillName: string;
  evalName: string;
  /** Resolved Claude model id, e.g. `claude-opus-4-7` (never an alias). */
  modelFullId: string;
  /** Output of `computeEvalFingerprint(skillDir, evalRecord)`. */
  evalFingerprint: string;
  /** Aggregated stats for the baseline run (without_skill config). */
  stats: EvalConfigStats;
  /** Epoch ms — when the baseline was computed and persisted. */
  computedAt: number;
}

/** Composite primary key for a baseline. */
export interface BaselineKey {
  skillName: string;
  evalName: string;
  modelFullId: string;
  evalFingerprint: string;
}

/**
 * A {@link BaselineRecord} enriched with derived fields — namely whether the
 * model id used to compute it is still considered current. Used by the UI
 * tooltip + the obsolescence toast.
 */
export interface BaselineRecordWithStatus extends BaselineRecord {
  /** True iff `modelFullId` is no longer in `CURRENT_MODEL_FULL_IDS`. */
  isObsolete: boolean;
  /** Absolute path to the baseline directory (artefacts + baseline.json). */
  artifactsPath: string;
}

/** Root: `~/.nakiros/baselines/`. Created on demand. */
function baselinesRoot(): string {
  const dir = join(getNakirosDir(), 'baselines');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Fingerprints embed a `:` separator (`sha256:abcd…`) which is fine on POSIX
 * but unsafe on some filesystems / archive tools. We coerce to a flat hex
 * string by replacing the separator with `_`.
 */
function safeSegment(value: string): string {
  return value.replace(/[:/\\]/g, '_');
}

/** Absolute directory for a baseline (does not create it). */
function baselineDir(key: BaselineKey): string {
  return join(
    baselinesRoot(),
    safeSegment(key.skillName),
    safeSegment(key.evalName),
    safeSegment(key.modelFullId),
    safeSegment(key.evalFingerprint),
  );
}

/** Absolute path to the metadata file inside a baseline directory. */
function baselineMetaPath(key: BaselineKey): string {
  return join(baselineDir(key), 'baseline.json');
}

function decorate(record: BaselineRecord): BaselineRecordWithStatus {
  return {
    ...record,
    isObsolete: !isCurrentModelFullId(record.modelFullId),
    artifactsPath: baselineDir(record),
  };
}

/**
 * Read a single baseline by composite key. Returns `null` on any miss
 * (file absent, parse failure, version mismatch). Does NOT recompute.
 */
export function getBaseline(key: BaselineKey): BaselineRecordWithStatus | null {
  const file = baselineMetaPath(key);
  if (!existsSync(file)) return null;

  let parsed: BaselineRecord;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8')) as BaselineRecord;
  } catch {
    return null;
  }
  if (parsed.version !== BASELINE_VERSION) return null;

  // Sanity: refuse to return a record whose key fields don't match the path.
  // Protects against renames / corrupted writes.
  if (
    parsed.skillName !== key.skillName ||
    parsed.evalName !== key.evalName ||
    parsed.modelFullId !== key.modelFullId ||
    parsed.evalFingerprint !== key.evalFingerprint
  ) {
    return null;
  }

  return decorate(parsed);
}

/**
 * Persist a baseline. Atomic via write-to-tmp + rename so a crash mid-write
 * leaves either the previous file intact or no file (never a truncated one).
 *
 * Caller is responsible for placing the run artefacts (run.json,
 * grading.json, timing.json, outputs/) inside the same directory — this
 * function only handles the metadata file.
 */
export function upsertBaseline(
  key: BaselineKey,
  stats: EvalConfigStats,
  computedAt: number = Date.now(),
): BaselineRecordWithStatus {
  const dir = baselineDir(key);
  mkdirSync(dir, { recursive: true });

  const record: BaselineRecord = {
    version: BASELINE_VERSION,
    skillName: key.skillName,
    evalName: key.evalName,
    modelFullId: key.modelFullId,
    evalFingerprint: key.evalFingerprint,
    stats,
    computedAt,
  };

  const finalPath = baselineMetaPath(key);
  const tmpPath = `${finalPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(record));
  renameSync(tmpPath, finalPath);

  return decorate(record);
}

/**
 * List all baselines for a skill. Walks
 * `~/.nakiros/baselines/<skill>/<eval>/<modelFullId>/<fingerprint>/baseline.json`.
 *
 * Volumes are tiny (a few dozen records per skill in practice) — the walk is
 * sub-millisecond. Returns an empty array when the skill has no baselines yet.
 */
export function listBaselines(skillName: string): BaselineRecordWithStatus[] {
  const skillDir = join(baselinesRoot(), safeSegment(skillName));
  if (!existsSync(skillDir)) return [];

  const out: BaselineRecordWithStatus[] = [];
  let evalDirs: string[];
  try {
    evalDirs = readdirSync(skillDir);
  } catch {
    return out;
  }

  for (const evalSeg of evalDirs) {
    const evalPath = join(skillDir, evalSeg);
    let modelDirs: string[];
    try {
      modelDirs = readdirSync(evalPath);
    } catch {
      continue;
    }
    for (const modelSeg of modelDirs) {
      const modelPath = join(evalPath, modelSeg);
      let fpDirs: string[];
      try {
        fpDirs = readdirSync(modelPath);
      } catch {
        continue;
      }
      for (const fpSeg of fpDirs) {
        const metaPath = join(modelPath, fpSeg, 'baseline.json');
        if (!existsSync(metaPath)) continue;
        let parsed: BaselineRecord;
        try {
          parsed = JSON.parse(readFileSync(metaPath, 'utf8')) as BaselineRecord;
        } catch {
          continue;
        }
        if (parsed.version !== BASELINE_VERSION) continue;
        if (parsed.skillName !== skillName) continue;
        out.push(decorate(parsed));
      }
    }
  }

  return out;
}

/**
 * Remove a baseline (metadata + artefacts directory). Returns `true` when
 * something was actually deleted, `false` when the directory didn't exist.
 *
 * Used by:
 * - `eval:refreshBaseline` (delete then recompute)
 * - the cleanup script (`baseline:cleanup`)
 */
export function deleteBaseline(key: BaselineKey): boolean {
  const dir = baselineDir(key);
  if (!existsSync(dir)) return false;
  rmSync(dir, { recursive: true, force: true });
  // Best-effort: prune empty parent dirs so `listBaselines` doesn't have to
  // walk through stale skeletons forever.
  for (let parent = dirname(dir); parent.startsWith(baselinesRoot()) && parent !== baselinesRoot(); parent = dirname(parent)) {
    try {
      const remaining = readdirSync(parent);
      if (remaining.length > 0) break;
      rmSync(parent, { recursive: false, force: true });
    } catch {
      break;
    }
  }
  return true;
}
