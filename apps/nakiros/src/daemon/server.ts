import Fastify, { type FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHandlerRegistry } from './handlers/index.js';
import { eventBus } from './event-bus.js';
import {
  listAllCreateRuns,
  listAllEditRuns,
  listAllFixRuns,
  restoreOrCleanupTempWorkdirs,
  sweepFixTempArtifacts,
} from '../services/fix-runner.js';
import { listAllAuditRuns, restoreOrCleanupAuditWorkdirs } from '../services/audit-runner.js';
import {
  listAllAnalyzeConvoRuns,
  restoreOrCleanupAnalyzeConvoWorkdirs,
} from '../services/analyze-convo-runner.js';
import {
  listAllClassifyConvoRuns,
  restoreOrCleanupClassifyConvoWorkdirs,
} from '../services/classify-convo-runner.js';
import {
  getResumableBootstrapWorktreePaths,
  listAllBootstrapRuns,
  restoreOrCleanupBootstrapWorkdirs,
} from '../services/bootstrap-runner.js';
import {
  getResumableSandboxPaths,
  listRuns as listAllEvalRuns,
  restoreEvalRunsForSkillDirs,
} from '../services/eval-runner.js';
import { listProjects } from '../services/project-scanner.js';
import { listSkills as listProjectSkills } from '../services/skill-reader.js';
import { listBundledSkills } from '../services/bundled-skills-reader.js';
import { listClaudeGlobalSkills } from '../services/claude-global-skills-reader.js';
import { listPluginSkills } from '../services/plugin-skills-reader.js';
import { cleanupEvalArtifacts } from '../services/eval-artifact-cleanup.js';
import { syncBundledSkills } from '../services/bundled-skills-sync.js';
import {
  encodeProjectPath,
  findGitRoot,
  isActiveRunStatus,
  sweepOrphanNakirosProjectEntries,
  sweepOrphanSandboxes,
} from '../services/runner-core/index.js';
import {
  isHookInstalled as isConversationIngestHookInstalled,
  startWatcher as startConversationIngestWatcher,
} from '../services/conversation-ingest/index.js';
import { analyzeDrift, type DriftType } from '../services/drift-analyzer.js';
import {
  buildDriftHookDiff,
  getDriftHookStatus,
  installDriftHook,
  uninstallDriftHook,
} from '../services/drift/hook-installer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Options accepted by {@link createDaemonServer}. */
export interface DaemonServerOptions {
  host?: string;
  logLevel?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  /** Directory containing the built frontend (index.html + assets/). */
  frontendDir?: string;
}

const PLACEHOLDER_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Nakiros</title></head>
<body style="font-family: system-ui, sans-serif; padding: 2rem; background: #0e1116; color: #e2e8f0;">
  <h1>Nakiros daemon is running.</h1>
  <p>No frontend bundle found. Build it with:</p>
  <pre style="background: #1a1f26; padding: 1rem; border-radius: 8px;">pnpm -F @nakiros/desktop build</pre>
  <p>Then reload this page.</p>
</body>
</html>`;

/**
 * Build the set of `~/.claude/projects/<encoded>` entry names that any
 * **still-active** run references. Passed to
 * {@link sweepOrphanNakirosProjectEntries} so the sweep only deletes entries
 * with no live owner — the `Reprendre` flow needs the session file at the
 * encoded cwd path to still be there.
 *
 * Terminal runs (completed / failed / stopped) are excluded: the user can't
 * resume them, so their `~/.claude/projects/<>` entry is dead weight.
 * Without this filter, every past eval iteration kept its entry forever
 * because eval runs are persisted indefinitely under their skill workspace.
 */
function collectLiveProjectEntryNames(): Set<string> {
  const names = new Set<string>();
  const add = (cwd: string | null | undefined): void => {
    if (cwd) names.add(encodeProjectPath(cwd));
  };
  for (const run of listAllAuditRuns()) {
    if (isActiveRunStatus(run.status)) add(run.workdir);
  }
  for (const run of listAllFixRuns()) {
    if (isActiveRunStatus(run.status)) add(run.workdir);
  }
  for (const run of listAllCreateRuns()) {
    if (isActiveRunStatus(run.status)) add(run.workdir);
  }
  for (const run of listAllEditRuns()) {
    if (isActiveRunStatus(run.status)) add(run.workdir);
  }
  for (const run of listAllAnalyzeConvoRuns()) {
    if (isActiveRunStatus(run.status)) add(run.workdir);
  }
  for (const run of listAllClassifyConvoRuns()) {
    if (isActiveRunStatus(run.status)) add(run.workdir);
  }
  for (const run of listAllBootstrapRuns()) {
    if (!isActiveRunStatus(run.status)) continue;
    // Bootstrap can have a worktree `cwd` distinct from `workdir` (same as
    // audit) — protect both encoded entries so a resumable session file
    // survives the sweep regardless of which one it's actually keyed by.
    add(run.cwd);
    add(run.workdir);
  }
  for (const run of listAllEvalRuns()) {
    if (!isActiveRunStatus(run.status)) continue;
    add(run.workdir);
    add(run.executionDir);
  }
  return names;
}

/**
 * Collect unique git roots from all persisted fix/audit/create/edit runs that
 * have a `cwd` (worktree path). Used to drive `git worktree prune` during the
 * boot sweep so stale `.git/worktrees/` entries are cleaned up even when the
 * sandbox directories were removed without a proper `git worktree remove`.
 */
function collectGitRootsFromRuns(): Set<string> {
  const roots = new Set<string>();
  const addCwd = (cwd: string | null | undefined): void => {
    if (!cwd) return;
    try {
      const root = findGitRoot(cwd);
      if (root) roots.add(root);
    } catch {
      // Silently skip — the directory may not exist on boot
    }
  };
  for (const run of listAllAuditRuns()) addCwd(run.cwd);
  for (const run of listAllFixRuns()) addCwd(run.cwd);
  for (const run of listAllCreateRuns()) addCwd(run.cwd);
  for (const run of listAllEditRuns()) addCwd(run.cwd);
  for (const run of listAllBootstrapRuns()) addCwd(run.cwd);
  return roots;
}

/**
 * Walk every skill source the daemon knows about and return the absolute
 * `skillPath` of each. Used by the eval boot rehydrate to replay
 * `loadPersistedRuns` on every directory that may contain past iterations.
 */
function collectAllSkillDirs(): string[] {
  const dirs = new Set<string>();
  const safe = <T>(fn: () => T[], label: string): T[] => {
    try {
      return fn();
    } catch (err) {
      console.warn(`[nakiros] ${label} failed:`, err instanceof Error ? err.message : err);
      return [];
    }
  };

  for (const skill of safe(() => listBundledSkills(), 'listBundledSkills')) {
    dirs.add(skill.skillPath);
  }
  for (const skill of safe(() => listClaudeGlobalSkills(), 'listClaudeGlobalSkills')) {
    dirs.add(skill.skillPath);
  }
  for (const skill of safe(() => listPluginSkills(), 'listPluginSkills')) {
    dirs.add(skill.skillPath);
  }
  for (const project of safe(() => listProjects(), 'listProjects')) {
    for (const skill of safe(() => listProjectSkills(project.projectPath, project.id), `listProjectSkills(${project.id})`)) {
      dirs.add(skill.skillPath);
    }
  }
  return Array.from(dirs);
}

function findFrontendDir(override?: string): string | null {
  if (override && existsSync(override)) return override;
  const candidates = [
    // Prod (packaged npm install): dist/daemon/ → dist/ui
    resolve(__dirname, '../ui'),
    // Dev (tsx): apps/nakiros/src/daemon/ → apps/frontend/dist
    resolve(__dirname, '../../../frontend/dist'),
    // Monorepo root fallback
    resolve(process.cwd(), 'apps/frontend/dist'),
  ];
  for (const dir of candidates) {
    if (existsSync(resolve(dir, 'index.html'))) return dir;
  }
  return null;
}

/**
 * One-shot runtime initialization called at daemon boot.
 * - Syncs bundled skills from the ROM to ~/.nakiros/skills/ (+ symlinks them
 *   under ~/.claude/skills/) so runners can resolve them.
 * - Rehydrates in-flight fix/create runs from `~/.nakiros/tmp-skills/` or cleans
 *   up orphan temp workdirs.
 * - Sweeps stray `nakiros-eval-*` skills produced by previous eval sessions.
 * Safe to call multiple times.
 */
export function bootstrapDaemonRuntime(): void {
  try {
    syncBundledSkills();
  } catch (err) {
    // Non-fatal: the daemon still serves the UI; bundled-skills calls will fail
    // until the user re-runs onboarding. Surface the error for debugging.
    console.warn('[nakiros] syncBundledSkills failed:', err instanceof Error ? err.message : err);
  }
  restoreOrCleanupTempWorkdirs();
  restoreOrCleanupAuditWorkdirs();
  restoreOrCleanupAnalyzeConvoWorkdirs();
  restoreOrCleanupClassifyConvoWorkdirs();
  restoreOrCleanupBootstrapWorkdirs();
  // Eval runs persist per-skill (`{skillDir}/evals/workspace/iteration-N/…`),
  // not under a flat `~/.nakiros/runs/eval/`. To surface them in the
  // runs-center on first paint we walk every known skill source and replay
  // `loadPersistedRuns` once per directory. Bounded by the total number of
  // skills the user has across project / bundled / claude-global / plugin
  // scopes — fast in practice, and any failure is per-skill (logged).
  let skillDirsForSweeps: string[] = [];
  try {
    skillDirsForSweeps = collectAllSkillDirs();
    restoreEvalRunsForSkillDirs(skillDirsForSweeps);
  } catch (err) {
    console.warn('[nakiros] eval boot rehydrate failed:', err instanceof Error ? err.message : err);
  }
  // Wipe orphan fix-temp session dirs (no live fix run owning them) and any
  // legacy `kind: 'fix-temp'` iterations that older builds wrote into the
  // main workspace by mistake. Must run AFTER `restoreOrCleanupTempWorkdirs`
  // so the registry already knows about rehydrated waiting fix runs and we
  // don't wipe their session dirs.
  try {
    const swept = sweepFixTempArtifacts(skillDirsForSweeps);
    if (swept.orphansDeleted > 0 || swept.legacyDeleted > 0) {
      console.log(
        `[nakiros] Swept fix-temp: ${swept.orphansDeleted} orphan session(s), ${swept.legacyDeleted} legacy iter(s).`,
      );
    }
  } catch (err) {
    console.warn(
      '[nakiros] sweepFixTempArtifacts failed:',
      err instanceof Error ? err.message : err,
    );
  }
  cleanupEvalArtifacts();
  // Reclaim `~/.claude/projects/*` entries left behind by previous runs whose
  // workdir has since been deleted. We pass the encoded names of every cwd
  // referenced by a still-registered run (audit/fix/create workdirs + eval
  // executionDirs) so the sweep keeps the session files our user is about
  // to "Reprendre" against. Only targets Nakiros-named orphans, never
  // user-created projects.
  const keepProjectEntries = collectLiveProjectEntryNames();
  const sweep = sweepOrphanNakirosProjectEntries(keepProjectEntries);
  if (sweep.deleted > 0) {
    console.log(`[nakiros] Swept ${sweep.deleted} orphan Claude project entr${sweep.deleted === 1 ? 'y' : 'ies'} (scanned ${sweep.scanned}, kept ${keepProjectEntries.size}).`);
  }
  // Worktrees from a previous (crashed) session leave directories under
  // ~/.nakiros/sandboxes/ and stale entries in the source repo's worktree
  // list. Boot sweep drops all of them.
  // Preserve sandboxes still referenced by rehydrated `waiting_for_input`
  // eval runs — without this the user's "Reprendre" would `--resume` against
  // a directory the sweep just deleted ("No conversation found with session
  // ID …"). Also preserve worktrees of resumable bootstrap runs
  // (`awaiting_approval` / `waiting_for_input`) — without this union, a
  // bootstrap run's worktree would be swept at every reboot regardless of
  // whether anything still references it (rehydrate would then restore
  // `cwd` pointing at a directory that no longer exists).
  // Git roots are derived from persisted run.cwd values so `git worktree prune`
  // can clean up ghost `.git/worktrees/` entries even when the sandbox
  // directories were already deleted before the daemon restarted.
  const orphanGitRoots = collectGitRootsFromRuns();
  const keepSandboxPaths = new Set([...getResumableSandboxPaths(), ...getResumableBootstrapWorktreePaths()]);
  const sandboxes = sweepOrphanSandboxes(keepSandboxPaths, orphanGitRoots);
  if (sandboxes.deleted > 0) {
    console.log(`[nakiros] Swept ${sandboxes.deleted} orphan eval sandbox${sandboxes.deleted === 1 ? '' : 'es'}.`);
  }
  if (orphanGitRoots.size > 0) {
    console.log(`[nakiros] Pruned git worktree entries in ${orphanGitRoots.size} repo(s).`);
  }

  // Conversation ingest — only auto-start the watcher when the user has
  // already opted in (the Stop hook is present in their settings.json). For
  // first-time users the panel is dormant until they explicitly enable it.
  try {
    if (isConversationIngestHookInstalled()) {
      startConversationIngestWatcher();
    }
  } catch (err) {
    console.warn(
      '[nakiros] conversation-ingest watcher boot failed:',
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Build the Fastify daemon instance. Registers three surfaces:
 * - `POST /ipc/:channel` — dispatches to the handler registry built from `handlers/index.ts`
 * - `GET /ws` — WebSocket that mirrors every `eventBus.broadcast(...)` to connected clients
 * - `GET /*` — static frontend bundle (SPA fallback) or a placeholder page when no bundle is found
 *
 * Callers are responsible for `bootstrapDaemonRuntime()` and `app.listen(...)`.
 */
export async function createDaemonServer(opts: DaemonServerOptions = {}): Promise<FastifyInstance> {
  // Default to 'warn' so routine request logs stay out of the terminal; the
  // user can still opt in to verbose logs by passing `logLevel: 'info'` or
  // setting the CLI flag.
  const app = Fastify({ logger: { level: opts.logLevel ?? 'warn' } });

  await app.register(fastifyWebsocket);

  app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

  // ── Drift detection ─────────────────────────────────────────────────────────
  // GET /api/drift?session=<sessionId>[&force=loop|topic|context]
  // Returns { drift: DriftReport | null }. No auth required (daemon is localhost-only).
  app.get<{ Querystring: { session?: string; force?: string } }>(
    '/api/drift',
    async (request, reply) => {
      const { session, force } = request.query;
      if (!session) {
        reply.status(400);
        return { error: 'Missing required query param: session' };
      }
      try {
        const validForce: DriftType[] = ['loop', 'topic', 'context'];
        const opts =
          force && validForce.includes(force as DriftType)
            ? { force: force as DriftType }
            : undefined;
        const drift = await analyzeDrift(session, opts);
        return { drift };
      } catch (err) {
        app.log.warn({ err }, '[drift] analyzeDrift threw unexpectedly');
        reply.status(500);
        return { error: 'Internal error during drift analysis' };
      }
    },
  );

  // ── Drift hook management ───────────────────────────────────────────────────
  // REST convenience endpoints so `curl` test commands work without a running
  // frontend. The same operations are also available as IPC channels
  // `driftHook:status`, `driftHook:diff`, `driftHook:install`,
  // `driftHook:uninstall`.
  app.get('/api/drift-hook/status', async (_request, reply) => {
    try {
      return getDriftHookStatus();
    } catch (err) {
      reply.status(500);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.get('/api/drift-hook/diff', async (_request, reply) => {
    try {
      return buildDriftHookDiff();
    } catch (err) {
      reply.status(500);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.post('/api/drift-hook/install', async (_request, reply) => {
    try {
      return installDriftHook();
    } catch (err) {
      reply.status(500);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.post('/api/drift-hook/uninstall', async (_request, reply) => {
    try {
      return uninstallDriftHook();
    } catch (err) {
      reply.status(500);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── IPC dispatcher ──────────────────────────────────────────────────────────
  const handlers = buildHandlerRegistry();

  app.post<{ Params: { channel: string }; Body: { args?: unknown[] } }>(
    '/ipc/:channel',
    async (request, reply) => {
      const channel = request.params.channel;
      const handler = (handlers as Record<string, unknown>)[channel];
      if (typeof handler !== 'function') {
        reply.status(404);
        return { error: `Unknown IPC channel: ${channel}` };
      }
      try {
        const args = Array.isArray(request.body?.args) ? request.body.args : [];
        const result = await (handler as (args: unknown[]) => unknown)(args);
        return { ok: true, result };
      } catch (err) {
        reply.status(500);
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  // ── WebSocket ───────────────────────────────────────────────────────────────
  await app.register(async (scope) => {
    scope.get('/ws', { websocket: true }, (socket) => {
      const unsubscribe = eventBus.onBroadcast((msg) => {
        if (socket.readyState !== socket.OPEN) return;
        socket.send(JSON.stringify(msg));
      });

      socket.send(JSON.stringify({ type: 'hello', ts: Date.now() }));
      socket.on('message', (raw: Buffer) => {
        let msg: unknown;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (typeof msg !== 'object' || msg === null) return;
        const m = msg as { type?: unknown };
        if (m.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
      });
      socket.on('close', unsubscribe);
    });
  });

  // ── Static frontend or placeholder ──────────────────────────────────────────
  const frontendDir = findFrontendDir(opts.frontendDir);
  if (frontendDir) {
    await app.register(fastifyStatic, { root: frontendDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/ipc/') || req.url.startsWith('/health') || req.url.startsWith('/ws')) {
        reply.status(404).send({ error: 'Not Found' });
        return;
      }
      // SPA fallback: serve index.html for client-side routing
      reply.type('text/html').sendFile('index.html');
    });
  } else {
    app.get('/', async (_req, reply) => {
      reply.type('text/html').send(PLACEHOLDER_HTML);
    });
  }

  return app;
}
