import { createHash } from 'crypto';
import { existsSync, readFileSync, readdirSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

import type {
  ConversationAnalyzedEvent,
  EnrichedFriction,
  FrictionCluster,
  Proposal,
  ProposalsNewEvent,
  RawFriction,
} from '@nakiros/shared';
import { IPC_CHANNELS } from '@nakiros/shared';

import { eventBus } from '../../daemon/event-bus.js';
import { getProject } from '../project-scanner.js';

import { detectSkills } from './classifier.js';
import { centroid, clusterFrictions, embed } from './clustering.js';
import {
  appendFrictions,
  archiveOldFrictions,
  listProjectsWithActiveFrictions,
  readActiveFrictionsForProject,
} from './friction-store.js';
import { generateProposal } from './generator.js';
import { scanProjectContext, type ProjectContext } from './project-context.js';
import {
  hasActiveProposalForCluster,
  isClusterRejected,
  saveProposal,
} from './proposal-store.js';
import {
  ACTIVE_WINDOW_DAYS,
  activeWindowCutoff,
  MIN_OCCURRENCES,
  scoreAndFilter,
} from './scoring.js';

// ---------------------------------------------------------------------------
// Proposal engine — serialises the friction → cluster → score → generate
// pipeline so concurrent analyzer events don't race each other into
// double-generated proposals. The daemon calls `initProposalEngine()` once at
// boot; after that the engine listens to the event bus and drains any raw
// frictions left behind by earlier crashes.
// ---------------------------------------------------------------------------

const FRICTIONS_RAW_DIR = join(homedir(), '.nakiros', 'frictions', 'raw');

let initialized = false;
let processingTail: Promise<void> = Promise.resolve();

export function initProposalEngine(): void {
  if (initialized) return;
  initialized = true;
  console.log(
    `[proposal-engine] initialized — listening for conversation:analyzed events ` +
      `(MIN_OCCURRENCES=${MIN_OCCURRENCES}, window=${ACTIVE_WINDOW_DAYS}d)`,
  );

  eventBus.onBroadcast((msg) => {
    if (msg.channel !== IPC_CHANNELS['conversation:analyzed']) return;
    const event = msg.payload as ConversationAnalyzedEvent | undefined;
    if (!event || !Array.isArray(event.frictions)) return;
    console.log(
      `[proposal-engine] received conversation:analyzed session=${event.sessionId} frictions=${event.frictions.length}`,
    );
    void enqueue(() => processAnalyzerEvent(event));
  });

  // Drain any raw frictions persisted by the analyzer but not yet processed
  // (e.g. the daemon crashed mid-pipeline).
  void enqueue(drainRawQueue);

  // Also run one clustering pass over whatever is already in the DB (across
  // every project). Matters when clustering params change and the user
  // restarts the daemon to re-evaluate existing frictions.
  void enqueue(runClusteringAndGenerationAcrossProjects);
}

// ---------------------------------------------------------------------------
// Serial queue — no third-party dep, just chain onto the existing promise.
// ---------------------------------------------------------------------------

function enqueue(task: () => Promise<void>): Promise<void> {
  const next = processingTail.then(task).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[proposal-engine] task failed:', err);
  });
  processingTail = next;
  return next;
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function processAnalyzerEvent(event: ConversationAnalyzedEvent): Promise<void> {
  const enriched = await enrichFrictions(event);
  console.log(
    `[proposal-engine] enriched ${enriched.length}/${event.frictions.length} frictions for session ${event.sessionId} (project ${event.projectId})`,
  );
  if (enriched.length > 0) appendFrictions(enriched);

  // Once persisted, the raw file is redundant — remove it so retries stay
  // idempotent.
  const rawFile = join(FRICTIONS_RAW_DIR, `${event.sessionId}.json`);
  if (existsSync(rawFile)) {
    try {
      unlinkSync(rawFile);
    } catch {
      /* best-effort */
    }
  }

  // Re-cluster only the affected project — not every project on every event.
  await runClusteringAndGenerationForProject(event.projectId);
}

async function drainRawQueue(): Promise<void> {
  if (!existsSync(FRICTIONS_RAW_DIR)) return;
  const files = readdirSync(FRICTIONS_RAW_DIR).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    const path = join(FRICTIONS_RAW_DIR, file);
    let event: ConversationAnalyzedEvent;
    try {
      event = JSON.parse(readFileSync(path, 'utf8')) as ConversationAnalyzedEvent;
    } catch {
      continue;
    }
    if (
      !event.providerProjectDir ||
      !event.projectId ||
      !Array.isArray(event.frictions)
    ) {
      try {
        unlinkSync(path);
      } catch {
        /* best-effort */
      }
      continue;
    }
    await processAnalyzerEvent(event);
  }
}

// ---------------------------------------------------------------------------
// Enrichment
// ---------------------------------------------------------------------------

async function enrichFrictions(
  event: ConversationAnalyzedEvent,
): Promise<EnrichedFriction[]> {
  const out: EnrichedFriction[] = [];
  for (const raw of event.frictions) {
    const skills = detectSkills(event.providerProjectDir, event.sessionId, {
      nearTurn: raw.approximateTurn,
    });
    const embedding = await embed(raw.description);
    if (!embedding) {
      // Model unavailable — skip this friction for now. It will get picked
      // up next time the analyzer event fires (raw file has been removed,
      // but the clustering pass below still runs with whatever is already
      // persisted, so no work is lost).
      continue;
    }
    out.push({
      id: makeFrictionId(event.sessionId, raw),
      projectId: event.projectId,
      conversationId: event.sessionId,
      timestamp: parseTimestamp(raw.timestampIso),
      description: raw.description,
      category: raw.category,
      rawExcerpt: raw.rawExcerpt,
      skillsDetected: skills.all,
      embedding,
    });
  }
  return out;
}

function makeFrictionId(sessionId: string, raw: RawFriction): string {
  const hash = createHash('sha1')
    .update(sessionId)
    .update('::')
    .update(String(raw.approximateTurn))
    .update('::')
    .update(raw.description)
    .digest('hex')
    .slice(0, 16);
  return `f_${hash}`;
}

function parseTimestamp(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Date.now();
}

// ---------------------------------------------------------------------------
// Clustering + proposal generation
// ---------------------------------------------------------------------------

/**
 * Run the cluster + generate pipeline for every project that has active
 * frictions. Called at boot so existing data re-evaluates with current
 * params, and exported via runEngineTick for manual kicks.
 */
async function runClusteringAndGenerationAcrossProjects(): Promise<void> {
  const now = Date.now();
  archiveOldFrictions(activeWindowCutoff(now));

  const projectIds = listProjectsWithActiveFrictions();
  if (projectIds.length === 0) {
    console.log('[proposal-engine] no projects with active frictions yet');
    return;
  }
  for (const projectId of projectIds) {
    await runClusteringAndGenerationForProject(projectId, now);
  }
}

async function runClusteringAndGenerationForProject(
  projectId: string,
  nowMs?: number,
): Promise<void> {
  const now = nowMs ?? Date.now();

  // Archive is global (pure timestamp cut) but only runs when unspecified
  // so per-event calls don't re-scan everything.
  if (nowMs === undefined) archiveOldFrictions(activeWindowCutoff(now));

  const active = readActiveFrictionsForProject(projectId).filter(
    (f) => f.timestamp >= activeWindowCutoff(now),
  );
  if (active.length === 0) return;

  const clusters = clusterFrictions(active);
  const scored = scoreAndFilter(clusters, active, now);

  const sizeCounts = new Map<number, number>();
  for (const c of clusters) {
    sizeCounts.set(c.frictionIds.length, (sizeCounts.get(c.frictionIds.length) ?? 0) + 1);
  }
  const distribution = [...sizeCounts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([size, count]) => `${count}×size${size}`)
    .join(' ');
  console.log(
    `[proposal-engine] project ${projectId}: ${active.length} frictions → ${clusters.length} clusters → ${scored.length} eligible [${distribution}]`,
  );

  if (scored.length === 0) return;

  const byId = new Map<string, EnrichedFriction>();
  for (const f of active) byId.set(f.id, f);

  for (const cluster of scored) {
    const clusterCentroid = computeClusterCentroid(cluster, byId);
    if (isClusterRejected(cluster.id, clusterCentroid)) {
      console.log(
        `[proposal-engine] skip cluster ${cluster.id} — previously rejected`,
      );
      continue;
    }
    if (hasActiveProposalForCluster(cluster.id)) {
      console.log(
        `[proposal-engine] skip cluster ${cluster.id} — proposal already exists`,
      );
      continue;
    }

    console.log(
      `[proposal-engine] generating proposal for cluster ${cluster.id} (size=${cluster.frictionIds.length}, score=${cluster.score.toFixed(2)}) — Haiku call may take 10-30s…`,
    );
    try {
      await buildAndSaveProposal(cluster, active, projectId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[proposal-engine] generation failed for cluster ${cluster.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

function computeClusterCentroid(
  cluster: FrictionCluster,
  byId: Map<string, EnrichedFriction>,
): number[] {
  const vectors: number[][] = [];
  for (const id of cluster.frictionIds) {
    const f = byId.get(id);
    if (f?.embedding && f.embedding.length > 0) vectors.push(f.embedding);
  }
  return centroid(vectors);
}

async function buildAndSaveProposal(
  cluster: FrictionCluster,
  allActive: EnrichedFriction[],
  projectId: string,
): Promise<void> {
  const existing = cluster.dominantSkill ? readExistingSkill(cluster.dominantSkill) : null;
  const projectContext = resolveProjectContext(projectId);

  const output = await generateProposal({
    cluster,
    frictions: allActive,
    existingSkillContent: existing?.content,
    existingSkillName: existing?.name,
    projectContext,
  });

  const now = Date.now();
  const proposal: Proposal = {
    id: `p_${createHash('sha1').update(cluster.id).update(String(now)).digest('hex').slice(0, 16)}`,
    projectId,
    type: existing ? 'patch' : 'new',
    targetSkill: existing?.name,
    clusterId: cluster.id,
    frictionIds: cluster.frictionIds,
    score: cluster.score,
    draft: {
      content: output.content,
      originalContent: existing?.content,
      evalCases: output.evalCases,
    },
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };

  saveProposal(proposal);
  console.log(
    `[proposal-engine] proposal ${proposal.id} saved (type=${proposal.type}${proposal.targetSkill ? ` target=${proposal.targetSkill}` : ''} score=${proposal.score.toFixed(2)})`,
  );

  const event: ProposalsNewEvent = { proposal };
  eventBus.broadcast(IPC_CHANNELS['proposals:new'], event);
}

// ---------------------------------------------------------------------------
// Skill resolution — look up an existing SKILL.md across the known locations
// nakiros supports. Returns null when the skill can't be found anywhere.
// ---------------------------------------------------------------------------

function readExistingSkill(skillName: string): { name: string; content: string } | null {
  const candidates = [
    join(homedir(), '.nakiros', 'skills', skillName, 'SKILL.md'),
    join(homedir(), '.claude', 'skills', skillName, 'SKILL.md'),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      return { name: skillName, content: readFileSync(path, 'utf8') };
    } catch {
      continue;
    }
  }
  return null;
}

// Exported for tests / manual kicks — runs the cluster + generate pass on
// demand (across all projects) without waiting for an analyzer event.
export async function runEngineTick(): Promise<void> {
  await enqueue(runClusteringAndGenerationAcrossProjects);
}

// ---------------------------------------------------------------------------
// Project context — cached per run pass to avoid re-scanning when a single
// project produces multiple eligible clusters. Cache clears naturally when
// the module is re-imported (daemon restart).
// ---------------------------------------------------------------------------

const contextCache = new Map<string, ProjectContext>();

function resolveProjectContext(projectId: string): ProjectContext | undefined {
  const cached = contextCache.get(projectId);
  if (cached) return cached;

  const project = getProject(projectId);
  if (!project?.projectPath) {
    console.warn(
      `[proposal-engine] no projectPath for project ${projectId} — generator will fall back to unguided mode`,
    );
    return undefined;
  }

  try {
    const ctx = scanProjectContext(project.projectPath);
    contextCache.set(projectId, ctx);
    return ctx;
  } catch (err) {
    console.warn(
      `[proposal-engine] failed to scan project context for ${projectId}:`,
      err instanceof Error ? err.message : err,
    );
    return undefined;
  }
}

// Exported so the daemon can surface the active-window constant in UI copy.
export { ACTIVE_WINDOW_DAYS };
