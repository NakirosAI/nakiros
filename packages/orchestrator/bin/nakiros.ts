import { runAgentCommand } from '../src/runner.js';
import { listConversations, deleteConversation } from '../src/conversation.js';
import { workspaceGet, resolveWorkspaceFromCwd } from '../src/workspace.js';
import { startSyncWatcher, stopSyncWatcher, getSyncStatus, pushAllArtifacts } from '../src/sync-watcher.js';
import type { AgentProvider, CliEvent, StreamEvent, RunStartInfo } from '../src/types.js';

function emit(event: CliEvent): void {
  process.stdout.write(JSON.stringify(event) + '\n');
}

function printHelp(): void {
  process.stderr.write(`
nakiros — Orchestrateur d'agents IA

Commandes :
  run           Lancer un agent
  conversations Gérer les conversations
  workspace     Gérer le contexte du workspace
  sync          Synchroniser les artefacts avec le cloud

Usage — run :
  nakiros run [options]
  --agent <claude|codex|cursor>   Provider (défaut: claude)
  --agent-id <id>                 Identifiant de l'agent (défaut: default)
  --workspace <slug>              Workspace
  --message <text>                Instruction pour l'agent
  --conversation <conv_xxx>       Rejoindre une conversation existante
  --session <provider-session>    Alias legacy pour reprendre via un ancien ID provider
  --add-dir <path>                Répertoire additionnel (répétable)

Usage — workspace :
  nakiros workspace get            Télécharge le contexte du workspace (détecté via cwd)
  nakiros workspace get --workspace <slug>   Override manuel
  nakiros workspace list           Liste les workspaces accessibles

Usage — sync :
  nakiros sync start               Démarre le watcher de sync (détecté via cwd)
  nakiros sync stop                Arrête le watcher
  nakiros sync status              État du watcher
  nakiros sync push                Push one-shot de tous les artefacts locaux
  nakiros sync push --file <path>  Push un artefact précis

Exemples :
  nakiros run --agent claude --agent-id nakiros --workspace myapp --message "implémente AUTH-42"
  nakiros workspace get
  nakiros sync start
  nakiros conversations --workspace myapp
`);
}

// ─── run ─────────────────────────────────────────────────────────────────────

function parseRunArgs(argv: string[]): {
  provider: AgentProvider;
  agentId: string;
  workspaceSlug: string;
  message: string;
  conversationId?: string;
  providerSessionId?: string;
  additionalDirs: string[];
} | null {
  let provider: AgentProvider = 'claude';
  let agentId = 'default';
  let workspaceSlug = '';
  let message = '';
  let conversationId: string | undefined;
  let providerSessionId: string | undefined;
  const additionalDirs: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--agent':
        if (!next) { process.stderr.write('--agent requires a value\n'); return null; }
        provider = next as AgentProvider; i++; break;
      case '--agent-id':
        if (!next) { process.stderr.write('--agent-id requires a value\n'); return null; }
        agentId = next; i++; break;
      case '--workspace':
        if (!next) { process.stderr.write('--workspace requires a value\n'); return null; }
        workspaceSlug = next; i++; break;
      case '--message':
        if (!next) { process.stderr.write('--message requires a value\n'); return null; }
        message = next; i++; break;
      case '--conversation':
        if (!next) { process.stderr.write(`${arg} requires a value\n`); return null; }
        conversationId = next; i++; break;
      case '--session':  // backward compat: provider session ID from pre-orchestrator Desktop state
        if (!next) { process.stderr.write(`${arg} requires a value\n`); return null; }
        providerSessionId = next; i++; break;
      case '--add-dir':
        if (!next) { process.stderr.write('--add-dir requires a value\n'); return null; }
        additionalDirs.push(next); i++; break;
    }
  }

  if (!message) { process.stderr.write('--message is required\n'); return null; }
  return { provider, agentId, workspaceSlug, message, conversationId, providerSessionId, additionalDirs };
}

function handleRun(argv: string[]): void {
  const opts = parseRunArgs(argv);
  if (!opts) { printHelp(); process.exit(1); }

  let currentRunId = 'conv_pending';

  runAgentCommand(
    opts.provider,
    {
      workspaceId: opts.workspaceSlug,
      workspaceSlug: opts.workspaceSlug,
      workspaceName: opts.workspaceSlug,
      mode: 'global',
      anchorRepoPath: opts.additionalDirs[0] ?? '',
      activeRepoPaths: opts.additionalDirs,
      lastResolvedRepoMentions: [],
      message: opts.message,
      providerSessionId: opts.providerSessionId,
      conversationId: opts.conversationId,
      agentId: opts.agentId,
      additionalDirs: opts.additionalDirs,
    },
    (info: RunStartInfo) => {
      currentRunId = info.runId;
      emit({ type: 'start', runId: info.runId, conversationId: info.conversationId, agentId: info.agentId, command: info.command, cwd: info.cwd });
    },
    (event: StreamEvent) => {
      emit(event);
    },
    (exitCode: number, error?: string) => {
      if (error) {
        emit({ type: 'error', runId: currentRunId, message: error, exitCode });
      } else {
        emit({ type: 'done', runId: currentRunId, exitCode });
      }
      process.exit(exitCode);
    },
  );

  process.on('SIGTERM', () => process.exit(130));
  process.on('SIGINT', () => process.exit(130));
}

// ─── conversations ────────────────────────────────────────────────────────────

function handleConversations(argv: string[]): void {
  let workspaceSlug = '';
  let subcommand = '';
  let targetId = '';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--workspace' && next) { workspaceSlug = next; i++; }
    else if (arg === 'delete' && next) { subcommand = 'delete'; targetId = next; i++; }
  }

  if (!workspaceSlug) {
    process.stderr.write('--workspace is required\n');
    process.exit(1);
  }

  if (subcommand === 'delete') {
    deleteConversation(workspaceSlug, targetId);
    process.stderr.write(`Conversation ${targetId} deleted\n`);
    return;
  }

  // List
  const conversations = listConversations(workspaceSlug);
  if (conversations.length === 0) {
    process.stdout.write(`No conversations found for workspace "${workspaceSlug}"\n`);
    return;
  }

  for (const c of conversations) {
    const date = new Date(c.updatedAt).toLocaleString();
    const status = c.status === 'error' ? '✗' : c.status === 'active' ? '●' : '✓';
    process.stdout.write(`${status} ${c.id}  ${date}  ${c.title}\n`);
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const command = argv[0];

if (!command || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

switch (command) {
  case 'run':
    handleRun(argv.slice(1));
    break;
  case 'conversations':
  case 'sessions': // backward compat alias
    handleConversations(argv.slice(1));
    break;
  case 'workspace':
    handleWorkspace(argv.slice(1)).catch((err: unknown) => {
      process.stderr.write(`[nakiros] ${String(err)}\n`);
      process.exit(1);
    });
    break;
  case 'sync':
    handleSync(argv.slice(1)).catch((err: unknown) => {
      process.stderr.write(`[nakiros] ${String(err)}\n`);
      process.exit(1);
    });
    break;
  default:
    process.stderr.write(`Unknown command: ${command}\n`);
    printHelp();
    process.exit(1);
}

// ─── workspace ────────────────────────────────────────────────────────────────

async function handleWorkspace(argv: string[]): Promise<void> {
  const sub = argv[0];

  if (sub === 'list') {
    const { getAccessToken } = await import('../src/credentials.js');
    const auth = await getAccessToken();
    if (!auth) { process.exit(1); }
    const res = await fetch(`${auth.apiUrl}/ws`, { headers: { Authorization: `Bearer ${auth.token}` } });
    if (!res.ok) { process.stderr.write(`Failed to list workspaces (${res.status})\n`); process.exit(1); }
    const workspaces = await res.json() as { id: string; name: string }[];
    for (const ws of workspaces) {
      process.stdout.write(`${ws.name}\n`);
    }
    return;
  }

  if (sub === 'get' || !sub) {
    let workspaceOverride: string | undefined;
    for (let i = 1; i < argv.length; i++) {
      if (argv[i] === '--workspace' && argv[i + 1]) { workspaceOverride = argv[i + 1]; i++; }
    }
    const result = await workspaceGet({ cwd: process.cwd(), workspaceOverride });
    if (!result) { process.exit(1); }
    process.stdout.write(JSON.stringify(result) + '\n');
    return;
  }

  process.stderr.write(`Unknown workspace subcommand: ${sub}\n`);
  process.exit(1);
}

// ─── sync ─────────────────────────────────────────────────────────────────────

async function handleSync(argv: string[]): Promise<void> {
  const sub = argv[0];
  let workspaceOverride: string | undefined;
  let filePath: string | undefined;
  // Direct-mode flags (Desktop passes these to bypass API resolution)
  let workspaceIdDirect: string | undefined;
  let workspaceNameDirect: string | undefined;

  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--workspace' && argv[i + 1]) { workspaceOverride = argv[i + 1]; i++; }
    if (argv[i] === '--file' && argv[i + 1]) { filePath = argv[i + 1]; i++; }
    if (argv[i] === '--workspace-id' && argv[i + 1]) { workspaceIdDirect = argv[i + 1]; i++; }
    if (argv[i] === '--workspace-name' && argv[i + 1]) { workspaceNameDirect = argv[i + 1]; i++; }
  }

  const cwd = process.cwd();

  if (sub === 'start') {
    // Direct mode: Desktop already knows the workspace — skip API call
    if (workspaceIdDirect && workspaceNameDirect) {
      const slug = workspaceNameDirect.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      await startSyncWatcher({ id: workspaceIdDirect, name: workspaceNameDirect } as import('@nakiros/shared').StoredWorkspace, slug);
      return;
    }
    const resolved = await resolveWorkspaceFromCwd(cwd, workspaceOverride);
    if (!resolved) { process.exit(1); }
    await startSyncWatcher(resolved.workspace, resolved.slug);
    return;
  }

  if (sub === 'stop') {
    const resolved = await resolveWorkspaceFromCwd(cwd, workspaceOverride);
    if (!resolved) { process.exit(1); }
    stopSyncWatcher(resolved.slug);
    return;
  }

  if (sub === 'status') {
    const resolved = await resolveWorkspaceFromCwd(cwd, workspaceOverride);
    if (!resolved) { process.exit(1); }
    const status = getSyncStatus(resolved.slug);
    process.stdout.write(JSON.stringify(status) + '\n');
    return;
  }

  if (sub === 'push') {
    const resolved = await resolveWorkspaceFromCwd(cwd, workspaceOverride);
    if (!resolved) { process.exit(1); }
    await pushAllArtifacts(resolved.workspace, resolved.slug, filePath);
    return;
  }

  process.stderr.write(`Unknown sync subcommand: ${sub}\n`);
  process.exit(1);
}
