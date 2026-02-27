import { useEffect, useMemo, useState } from 'react';
import type { StoredWorkspace, AgentProfile } from '@tiqora/shared';
import { PROFILE_LABELS } from '../utils/profiles';

interface Props {
  initialDirectory?: string;
  onCreated(workspace: StoredWorkspace): void;
  onCancel(): void;
}

type Topology = 'mono' | 'multi';
type Step = 0 | 1 | 2 | 3 | 4;
type MonoSource = 'local' | 'remote' | 'new';
type TicketPrefixMode = 'auto-pm' | 'custom';

interface JiraStatus {
  connected: boolean;
  cloudUrl?: string;
  displayName?: string;
}

interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
}

type MultiRepoCandidate =
  | {
      id: string;
      kind: 'local';
      sourcePath: string;
      name: string;
      role: string;
      profile: AgentProfile;
    }
  | {
      id: string;
      kind: 'remote';
      remoteUrl: string;
      name: string;
      role: string;
    };

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function derivePrefix(name: string): string {
  return name.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() || 'PROJ';
}

function normalizeTicketPrefix(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

function basenameFromPath(path: string): string {
  return path.split(/[\\/]+/).filter(Boolean).pop() ?? path;
}

function deriveRepoNameFromUrl(url: string): string {
  const cleaned = url.trim().replace(/\/$/, '');
  const last = cleaned.split('/').pop() ?? 'repo';
  return last.replace(/\.git$/i, '') || 'repo';
}

function toWorkspaceFolderName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'workspace';
}

function toRepo(path: string, profile: AgentProfile): StoredWorkspace['repos'][number] {
  return {
    name: basenameFromPath(path),
    localPath: path,
    role: '',
    profile,
    llmDocs: ['CLAUDE.md'],
  };
}

export default function WorkspaceSetup({ initialDirectory, onCreated, onCancel }: Props) {
  const [step, setStep] = useState<Step>(0);
  const [topology, setTopology] = useState<Topology>('mono');
  const [workspaceDraftId] = useState(() => Date.now().toString());

  const [name, setName] = useState('');
  const [ticketPrefix, setTicketPrefix] = useState('PROJ');
  const [ticketPrefixTouched, setTicketPrefixTouched] = useState(false);
  const [ticketPrefixMode, setTicketPrefixMode] = useState<TicketPrefixMode>('custom');
  const [ticketPrefixModeTouched, setTicketPrefixModeTouched] = useState(false);
  const [pmTool, setPmTool] = useState<StoredWorkspace['pmTool'] | ''>('');
  const [projectKey, setProjectKey] = useState('');

  const [monoSource, setMonoSource] = useState<MonoSource>('local');
  const [monoRepo, setMonoRepo] = useState<StoredWorkspace['repos'][number] | null>(null);
  const [monoRemoteUrl, setMonoRemoteUrl] = useState('');
  const [monoParentDir, setMonoParentDir] = useState('');

  const [multiParentDir, setMultiParentDir] = useState('');
  const [multiRepos, setMultiRepos] = useState<MultiRepoCandidate[]>([]);
  const [pendingRemoteUrl, setPendingRemoteUrl] = useState('');

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [jiraStatus, setJiraStatus] = useState<JiraStatus | null>(null);
  const [jiraStatusLoading, setJiraStatusLoading] = useState(false);
  const [jiraConnecting, setJiraConnecting] = useState(false);
  const [jiraProjects, setJiraProjects] = useState<JiraProject[]>([]);
  const [jiraProjectsLoading, setJiraProjectsLoading] = useState(false);
  const [jiraAuthError, setJiraAuthError] = useState<string | null>(null);

  const totalSteps = 4;

  useEffect(() => {
    if (!initialDirectory) return;
    let cancelled = false;

    void (async () => {
      try {
        const profile = await window.tiqora.detectProfile(initialDirectory);
        if (cancelled) return;
        setTopology('mono');
        setMonoSource('local');
        setMonoRepo(toRepo(initialDirectory, profile));
        setStatus(`Dossier importé: ${basenameFromPath(initialDirectory)}`);
      } catch {
        if (!cancelled) {
          setError('Impossible de préparer automatiquement le dossier sélectionné.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialDirectory]);

  function handleNameChange(value: string) {
    setName(value);
    if (!ticketPrefixTouched) {
      setTicketPrefix(derivePrefix(value));
    }
  }

  function nextStep() {
    if (step < 4) setStep((step + 1) as Step);
  }

  function prevStep() {
    if (step > 0) setStep((step - 1) as Step);
  }

  async function pickMonoLocalRepo() {
    setError(null);
    const dir = await window.tiqora.selectDirectory();
    if (!dir) return;
    const profile = await window.tiqora.detectProfile(dir);
    setMonoRepo(toRepo(dir, profile));
    setStatus(`Repo local sélectionné: ${basenameFromPath(dir)}`);
  }

  async function pickMonoParentDir() {
    setError(null);
    const dir = await window.tiqora.selectDirectory();
    if (!dir) return;
    setMonoParentDir(dir);
  }

  async function pickMultiParentDir() {
    setError(null);
    const dir = await window.tiqora.selectDirectory();
    if (!dir) return;
    setMultiParentDir(dir);
  }

  async function addMultiLocalRepo() {
    setError(null);
    const dir = await window.tiqora.selectDirectory();
    if (!dir) return;
    if (multiRepos.some((r) => r.kind === 'local' && r.sourcePath === dir)) return;

    const profile = await window.tiqora.detectProfile(dir);
    const repoName = basenameFromPath(dir);
    setMultiRepos((prev) => [
      ...prev,
      {
        id: uid(),
        kind: 'local',
        sourcePath: dir,
        name: repoName,
        role: '',
        profile,
      },
    ]);
    setStatus(`Repo local ajouté: ${repoName}`);
  }

  function addMultiRemoteRepo() {
    setError(null);
    const url = pendingRemoteUrl.trim();
    if (!url) return;

    setMultiRepos((prev) => [
      ...prev,
      {
        id: uid(),
        kind: 'remote',
        remoteUrl: url,
        name: deriveRepoNameFromUrl(url),
        role: '',
      },
    ]);
    setPendingRemoteUrl('');
    setStatus(`Repo distant ajouté: ${url}`);
  }

  function updateMultiRepo(
    id: string,
    patch: Partial<Pick<MultiRepoCandidate, 'name' | 'role' | 'remoteUrl'>>,
  ) {
    setMultiRepos((prev) =>
      prev.map((repo) => {
        if (repo.id !== id) return repo;
        if (repo.kind === 'local') {
          return {
            ...repo,
            name: patch.name ?? repo.name,
            role: patch.role ?? repo.role,
          };
        }
        return {
          ...repo,
          name: patch.name ?? repo.name,
          role: patch.role ?? repo.role,
          remoteUrl: patch.remoteUrl ?? repo.remoteUrl,
        };
      }),
    );
  }

  function removeMultiRepo(id: string) {
    setMultiRepos((prev) => prev.filter((repo) => repo.id !== id));
  }

  const canGoNextFromStep1 = name.trim().length > 0;

  const canGoNextFromStep2 = useMemo(() => {
    if (topology === 'mono') {
      if (monoSource === 'local') return monoRepo != null;
      if (monoSource === 'remote') return monoRemoteUrl.trim().length > 0 && monoParentDir.trim().length > 0;
      return monoParentDir.trim().length > 0;
    }
    return multiParentDir.trim().length > 0 && multiRepos.length > 0;
  }, [topology, monoSource, monoRepo, monoRemoteUrl, monoParentDir, multiParentDir, multiRepos.length]);

  const workspaceRootPreview =
    topology === 'multi' && multiParentDir
      ? `${multiParentDir.replace(/[\\/]+$/, '')}/${toWorkspaceFolderName(name)}`
      : null;

  const normalizedProjectKey = normalizeTicketPrefix(projectKey);
  const normalizedCustomPrefix = normalizeTicketPrefix(ticketPrefix);
  const effectiveTicketPrefix =
    ticketPrefixMode === 'auto-pm' && pmTool && normalizedProjectKey
      ? normalizedProjectKey
      : (normalizedCustomPrefix || derivePrefix(name));

  useEffect(() => {
    if (pmTool && normalizedProjectKey) {
      if (!ticketPrefixModeTouched) {
        setTicketPrefixMode('auto-pm');
      }
      return;
    }
    if (ticketPrefixMode !== 'custom') {
      setTicketPrefixMode('custom');
    }
  }, [pmTool, normalizedProjectKey, ticketPrefixModeTouched, ticketPrefixMode]);

  useEffect(() => {
    if (pmTool !== 'jira') return;
    let cancelled = false;
    setJiraStatusLoading(true);
    void window.tiqora
      .jiraGetStatus(workspaceDraftId)
      .then((nextStatus) => {
        if (cancelled) return;
        setJiraStatus(nextStatus);
        if (nextStatus.connected) {
          void loadJiraProjects();
        } else {
          setJiraProjects([]);
        }
      })
      .finally(() => {
        if (!cancelled) setJiraStatusLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pmTool, workspaceDraftId]);

  useEffect(() => {
    if (pmTool !== 'jira') return;
    const unsubComplete = window.tiqora.onJiraAuthComplete((data) => {
      if (data.wsId !== workspaceDraftId) return;
      setJiraConnecting(false);
      setJiraAuthError(null);
      setJiraStatus({ connected: true, cloudUrl: data.cloudUrl, displayName: data.displayName });
      void loadJiraProjects();
    });
    const unsubError = window.tiqora.onJiraAuthError((data) => {
      if (data.wsId !== workspaceDraftId) return;
      setJiraConnecting(false);
      setJiraAuthError(data.error);
    });

    return () => {
      unsubComplete();
      unsubError();
    };
  }, [pmTool, workspaceDraftId]);

  function loadJiraProjects() {
    setJiraProjectsLoading(true);
    setJiraAuthError(null);
    void window.tiqora
      .jiraGetProjects(workspaceDraftId)
      .then(setJiraProjects)
      .catch((err) => {
        setJiraProjects([]);
        setJiraAuthError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setJiraProjectsLoading(false));
  }

  async function handleJiraConnect() {
    setJiraConnecting(true);
    setJiraAuthError(null);
    await window.tiqora.jiraStartAuth(workspaceDraftId);
  }

  async function handleJiraDisconnect() {
    await window.tiqora.jiraDisconnect(workspaceDraftId);
    setJiraStatus({ connected: false });
    setJiraProjects([]);
    setJiraAuthError(null);
  }

  async function prepareMonoRepo(): Promise<{ workspacePath: string; repos: StoredWorkspace['repos'] }> {
    if (monoSource === 'local') {
      if (!monoRepo) throw new Error('Sélectionne un repo local.');
      const remoteUrl = await window.tiqora.gitRemoteUrl(monoRepo.localPath);
      return {
        workspacePath: monoRepo.localPath,
        repos: [{ ...monoRepo, url: remoteUrl ?? monoRepo.url }],
      };
    }

    if (monoSource === 'remote') {
      if (!monoRemoteUrl.trim()) throw new Error('Renseigne l’URL du repo distant.');
      if (!monoParentDir.trim()) throw new Error('Choisis un dossier de destination.');

      const clone = await window.tiqora.gitClone(monoRemoteUrl.trim(), monoParentDir);
      if (!clone.success) throw new Error(clone.error ?? 'Échec du clonage.');

      const profile = await window.tiqora.detectProfile(clone.repoPath);
      const remoteUrl = await window.tiqora.gitRemoteUrl(clone.repoPath);
      return {
        workspacePath: clone.repoPath,
        repos: [
          {
            name: clone.repoName || deriveRepoNameFromUrl(monoRemoteUrl),
            localPath: clone.repoPath,
            url: remoteUrl ?? monoRemoteUrl.trim(),
            role: '',
            profile,
            llmDocs: ['CLAUDE.md'],
          },
        ],
      };
    }

    if (!monoParentDir.trim()) throw new Error('Choisis un dossier de création.');
    const repoPath = await window.tiqora.createWorkspaceRoot(monoParentDir, name);
    const init = await window.tiqora.gitInit(repoPath);
    if (!init.success) throw new Error(init.error ?? 'Échec de git init.');

    const profile = await window.tiqora.detectProfile(repoPath);
    return {
      workspacePath: repoPath,
      repos: [
        {
          name: basenameFromPath(repoPath),
          localPath: repoPath,
          role: '',
          profile,
          llmDocs: ['CLAUDE.md'],
        },
      ],
    };
  }

  async function prepareMultiRepos(): Promise<{ workspacePath: string; repos: StoredWorkspace['repos'] }> {
    if (!multiParentDir.trim()) throw new Error('Choisis un dossier parent.');
    if (multiRepos.length === 0) throw new Error('Ajoute au moins un repo.');

    const workspacePath = await window.tiqora.createWorkspaceRoot(multiParentDir, name);
    const repos: StoredWorkspace['repos'] = [];

    for (const candidate of multiRepos) {
      if (candidate.kind === 'local') {
        const copied = await window.tiqora.copyLocalRepo(candidate.sourcePath, workspacePath);
        const profile = await window.tiqora.detectProfile(copied.repoPath);
        const remoteUrl = await window.tiqora.gitRemoteUrl(copied.repoPath);

        repos.push({
          name: candidate.name || copied.repoName,
          localPath: copied.repoPath,
          url: remoteUrl ?? undefined,
          role: candidate.role,
          profile,
          llmDocs: ['CLAUDE.md'],
        });
        continue;
      }

      const clone = await window.tiqora.gitClone(candidate.remoteUrl, workspacePath);
      if (!clone.success) {
        throw new Error(`Échec du clonage ${candidate.remoteUrl}: ${clone.error ?? 'erreur inconnue'}`);
      }
      const profile = await window.tiqora.detectProfile(clone.repoPath);
      const remoteUrl = await window.tiqora.gitRemoteUrl(clone.repoPath);

      repos.push({
        name: candidate.name || clone.repoName,
        localPath: clone.repoPath,
        url: remoteUrl ?? candidate.remoteUrl,
        role: candidate.role,
        profile,
        llmDocs: ['CLAUDE.md'],
      });
    }

    return { workspacePath, repos };
  }

  async function handleCreate() {
    setSaving(true);
    setError(null);
    setStatus(null);

    try {
      const prepared =
        topology === 'mono'
          ? await prepareMonoRepo()
          : await prepareMultiRepos();

      const workspace: StoredWorkspace = {
        id: workspaceDraftId,
        name,
        workspacePath: prepared.workspacePath,
        repos: prepared.repos,
        topology,
        ticketPrefix: effectiveTicketPrefix,
        ticketCounter: 0,
        pmTool: pmTool || undefined,
        projectKey: projectKey || undefined,
        createdAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
      };

      await window.tiqora.saveWorkspace(workspace);
      await window.tiqora.syncWorkspace(workspace);
      onCreated(workspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: '42px auto', padding: '0 24px' }}>
      <div
        style={{
          background: 'var(--bg-soft)',
          border: '1px solid var(--line)',
          borderRadius: 2,
          padding: '24px 22px',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>
            {step === 0 ? 'Nouveau workspace' : `Nouveau workspace — Étape ${step}/${totalSteps}`}
          </h1>
          <button
            onClick={onCancel}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14 }}
          >
            ✕ Annuler
          </button>
        </div>

        {initialDirectory && (
          <p style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontSize: 12 }}>
            Import assisté depuis: <code>{initialDirectory}</code>
          </p>
        )}
        {status && (
          <p style={{ margin: '0 0 12px', color: 'var(--success)', fontSize: 12 }}>{status}</p>
        )}
        {error && (
          <p style={{ margin: '0 0 12px', color: 'var(--danger)', fontSize: 12 }}>{error}</p>
        )}

        {step > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ height: 8, borderRadius: 2, background: 'var(--bg-muted)', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${(step / totalSteps) * 100}%`,
                  height: '100%',
                  background: 'var(--primary)',
                  borderRadius: 2,
                }}
              />
            </div>
          </div>
        )}

        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>
              Structure du workspace
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              {(['mono', 'multi'] as Topology[]).map((kind) => (
                <button
                  key={kind}
                  onClick={() => setTopology(kind)}
                  style={{
                    flex: 1,
                    padding: '20px 16px',
                    background: topology === kind ? 'var(--primary-soft)' : 'var(--bg-soft)',
                    border: `2px solid ${topology === kind ? 'var(--primary)' : 'var(--line)'}`,
                    borderRadius: 2,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <strong style={{ fontSize: 15, display: 'block', marginBottom: 6 }}>
                    {kind === 'mono' ? 'Mono-repo' : 'Multi-repo'}
                  </strong>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {kind === 'mono'
                      ? 'Un seul dépôt Git. Le fichier .tiqora.workspace.yaml sera dans ce repo.'
                      : 'Plusieurs dépôts. Les repos seront regroupés dans un dossier workspace dédié.'}
                  </span>
                </button>
              ))}
            </div>
            <button onClick={nextStep} style={btnPrimary(false)}>
              Suivant →
            </button>
          </div>
        )}

        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span>Nom du workspace</span>
              <input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="ex: Plateforme Produit"
                style={inputStyle}
                autoFocus
              />
            </label>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={prevStep} style={btnSecondary}>← Retour</button>
              <button onClick={nextStep} disabled={!canGoNextFromStep1} style={btnPrimary(!canGoNextFromStep1)}>
                Suivant →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {topology === 'mono' && (
              <>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>
                  Source du repo unique
                </p>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => setMonoSource('local')} style={chipStyle(monoSource === 'local')}>Repo local</button>
                  <button onClick={() => setMonoSource('remote')} style={chipStyle(monoSource === 'remote')}>Cloner repo distant</button>
                  <button onClick={() => setMonoSource('new')} style={chipStyle(monoSource === 'new')}>Créer repo local</button>
                </div>

                {monoSource === 'local' && (
                  <>
                    <button onClick={() => void pickMonoLocalRepo()} style={btnSecondary}>Choisir un dossier repo</button>
                    {monoRepo && (
                      <div style={cardStyle}>
                        <div><strong>{monoRepo.name}</strong></div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{monoRepo.localPath}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{PROFILE_LABELS[monoRepo.profile]}</div>
                      </div>
                    )}
                  </>
                )}

                {monoSource === 'remote' && (
                  <>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span>URL Git du repo</span>
                      <input
                        value={monoRemoteUrl}
                        onChange={(e) => setMonoRemoteUrl(e.target.value)}
                        placeholder="git@github.com:org/repo.git"
                        style={inputStyle}
                      />
                    </label>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button onClick={() => void pickMonoParentDir()} style={btnSecondary}>Choisir dossier de destination</button>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {monoParentDir || 'Aucun dossier choisi'}
                      </span>
                    </div>
                  </>
                )}

                {monoSource === 'new' && (
                  <>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button onClick={() => void pickMonoParentDir()} style={btnSecondary}>Choisir dossier parent</button>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {monoParentDir || 'Aucun dossier choisi'}
                      </span>
                    </div>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 12 }}>
                      Un dossier repo sera créé puis <code>git init</code> sera exécuté.
                    </p>
                  </>
                )}
              </>
            )}

            {topology === 'multi' && (
              <>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>
                  Dossier workspace parent
                </p>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={() => void pickMultiParentDir()} style={btnSecondary}>Choisir dossier parent</button>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {multiParentDir || 'Aucun dossier choisi'}
                  </span>
                </div>

                {workspaceRootPreview && (
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 12 }}>
                    Dossier workspace créé: <code>{workspaceRootPreview}</code>
                  </p>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => void addMultiLocalRepo()} style={btnSecondary}>+ Ajouter repo local</button>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    value={pendingRemoteUrl}
                    onChange={(e) => setPendingRemoteUrl(e.target.value)}
                    placeholder="git@github.com:org/repo.git"
                    style={{ ...inputStyle, flex: 1, minWidth: 280 }}
                  />
                  <button onClick={addMultiRemoteRepo} style={btnSecondary}>+ Ajouter repo distant</button>
                </div>

                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 12 }}>
                  Les repos locaux seront copiés dans le dossier workspace pour centraliser tout le projet.
                </p>

                {multiRepos.length === 0 ? (
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 12 }}>Aucun repo ajouté.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {multiRepos.map((repo) => (
                      <div key={repo.id} style={cardStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                          <strong>{repo.kind === 'local' ? 'Repo local (copie)' : 'Repo distant (clone)'}</strong>
                          <button onClick={() => removeMultiRepo(repo.id)} style={dangerButton}>Retirer</button>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                          {repo.kind === 'local' ? repo.sourcePath : repo.remoteUrl}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                          <input
                            value={repo.name}
                            onChange={(e) => updateMultiRepo(repo.id, { name: e.target.value })}
                            placeholder="Nom du repo"
                            style={inputStyle}
                          />
                          <input
                            value={repo.role}
                            onChange={(e) => updateMultiRepo(repo.id, { role: e.target.value })}
                            placeholder="Rôle"
                            style={inputStyle}
                          />
                        </div>
                        {repo.kind === 'local' && (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                            Profil détecté: {PROFILE_LABELS[repo.profile]}
                          </div>
                        )}
                        {repo.kind === 'remote' && (
                          <input
                            value={repo.remoteUrl}
                            onChange={(e) => updateMultiRepo(repo.id, { remoteUrl: e.target.value })}
                            placeholder="URL Git"
                            style={{ ...inputStyle, marginTop: 8 }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={prevStep} style={btnSecondary}>← Retour</button>
              <button onClick={nextStep} disabled={!canGoNextFromStep2} style={btnPrimary(!canGoNextFromStep2)}>
                Suivant →
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span>Outil PM</span>
              <select
                value={pmTool}
                onChange={(e) => setPmTool(e.target.value as StoredWorkspace['pmTool'] | '')}
                style={inputStyle}
              >
                <option value="">— aucun —</option>
                <option value="jira">Jira</option>
                <option value="github">GitHub Projects</option>
                <option value="gitlab">GitLab Issues</option>
                <option value="linear">Linear</option>
              </select>
            </label>

            {pmTool && pmTool !== 'jira' && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span>Clé de projet (ex: PROJ)</span>
                <input
                  value={projectKey}
                  onChange={(e) => setProjectKey(e.target.value.toUpperCase())}
                  placeholder="PROJ"
                  style={inputStyle}
                />
              </label>
            )}

            {pmTool === 'jira' && (
              <div style={cardStyle}>
                <p style={{ margin: '0 0 8px', fontWeight: 700 }}>Connexion Jira</p>
                {jiraStatusLoading ? (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Vérification de la connexion…</p>
                ) : jiraStatus?.connected ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                      Connecté en tant que {jiraStatus.displayName ?? 'utilisateur'} ({jiraStatus.cloudUrl ?? 'site Jira'}).
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button onClick={() => void handleJiraDisconnect()} style={btnSecondary}>Déconnecter</button>
                      <button onClick={loadJiraProjects} style={btnSecondary}>Rafraîchir les projets</button>
                    </div>
                    {jiraProjectsLoading ? (
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Chargement des projets…</p>
                    ) : (
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span>Projet Jira</span>
                        <select
                          value={projectKey}
                          onChange={(e) => setProjectKey(e.target.value)}
                          style={inputStyle}
                        >
                          <option value="">Sélectionner un projet</option>
                          {jiraProjects.map((project) => (
                            <option key={project.id} value={project.key}>
                              {project.name} ({project.key})
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                      Connecte Jira pour sélectionner directement le projet et récupérer sa clé.
                    </p>
                    <div>
                      <button
                        onClick={() => void handleJiraConnect()}
                        disabled={jiraConnecting}
                        style={btnPrimary(jiraConnecting)}
                      >
                        {jiraConnecting ? 'Connexion…' : 'Se connecter à Jira'}
                      </button>
                    </div>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                      Ou renseigne la clé projet manuellement:
                    </p>
                    <input
                      value={projectKey}
                      onChange={(e) => setProjectKey(e.target.value.toUpperCase())}
                      placeholder="PROJ"
                      style={inputStyle}
                    />
                  </div>
                )}
                {jiraAuthError && (
                  <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--danger)' }}>{jiraAuthError}</p>
                )}
              </div>
            )}

            <div style={cardStyle}>
              <p style={{ margin: '0 0 8px', fontWeight: 700 }}>Format des tickets locaux</p>
              <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-muted)' }}>
                Cette configuration s'applique aux tickets créés dans le board local Tiqora.
              </p>

              {pmTool && normalizedProjectKey ? (
                <>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    <button
                      onClick={() => {
                        setTicketPrefixModeTouched(true);
                        setTicketPrefixMode('auto-pm');
                      }}
                      style={chipStyle(ticketPrefixMode === 'auto-pm')}
                    >
                      Utiliser la clé projet PM ({normalizedProjectKey})
                    </button>
                    <button
                      onClick={() => {
                        setTicketPrefixModeTouched(true);
                        setTicketPrefixMode('custom');
                      }}
                      style={chipStyle(ticketPrefixMode === 'custom')}
                    >
                      Préfixe personnalisé
                    </button>
                  </div>
                  {ticketPrefixMode === 'auto-pm' && (
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                      Format final: <code>{normalizedProjectKey}-001</code>
                    </p>
                  )}
                </>
              ) : (
                <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-muted)' }}>
                  Renseigne une clé projet PM pour activer le mode automatique, sinon utilise un préfixe personnalisé.
                </p>
              )}

              {(ticketPrefixMode === 'custom' || !pmTool || !normalizedProjectKey) && (
                <>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span>Préfixe des tickets</span>
                    <input
                      value={ticketPrefix}
                      onChange={(e) => {
                        setTicketPrefixTouched(true);
                        setTicketPrefix(e.target.value);
                      }}
                      placeholder="PROJ"
                      style={{ ...inputStyle, fontFamily: 'monospace' }}
                    />
                  </label>
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    Format final: <code>{effectiveTicketPrefix}-001</code>
                  </p>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={prevStep} style={btnSecondary}>← Retour</button>
              <button onClick={nextStep} style={btnPrimary(false)}>Suivant →</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={cardStyle}>
              <p><strong>Workspace:</strong> {name}</p>
              <p><strong>Structure:</strong> {topology === 'mono' ? 'Mono-repo' : 'Multi-repo'}</p>
              <p><strong>Préfixe tickets:</strong> <code>{effectiveTicketPrefix}</code></p>
              <p>
                <strong>Source format ticket:</strong>{' '}
                {ticketPrefixMode === 'auto-pm' && pmTool && normalizedProjectKey
                  ? `clé projet PM (${normalizedProjectKey})`
                  : 'personnalisé'}
              </p>
              <p><strong>Fichier central:</strong> <code>.tiqora.workspace.yaml</code></p>
              {pmTool && <p><strong>PM:</strong> {pmTool}{projectKey ? ` — ${projectKey}` : ''}</p>}

              {topology === 'mono' ? (
                <>
                  <p><strong>Source:</strong> {monoSource === 'local' ? 'Repo local' : monoSource === 'remote' ? 'Clone distant' : 'Création locale + git init'}</p>
                  {monoSource === 'local' && monoRepo && <p><strong>Repo:</strong> {monoRepo.localPath}</p>}
                  {(monoSource === 'remote' || monoSource === 'new') && monoParentDir && (
                    <p><strong>Dossier parent:</strong> {monoParentDir}</p>
                  )}
                </>
              ) : (
                <>
                  <p><strong>Dossier parent:</strong> {multiParentDir || '—'}</p>
                  <p><strong>Repos à intégrer:</strong> {multiRepos.length}</p>
                  {multiRepos.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {multiRepos.map((repo) => (
                        <li key={repo.id}>
                          {repo.name} — {repo.kind === 'local' ? 'local (copie)' : 'distant (clone)'}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={prevStep} style={btnSecondary}>← Retour</button>
              <button onClick={() => void handleCreate()} disabled={saving} style={btnPrimary(saving)}>
                {saving ? 'Création…' : 'Créer le workspace'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid var(--line)',
  borderRadius: 2,
  fontSize: 14,
  color: 'var(--text)',
  background: 'var(--bg-soft)',
  width: '100%',
  boxSizing: 'border-box',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-muted)',
  border: '1px solid var(--line)',
  borderRadius: 2,
  padding: 14,
};

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '7px 12px',
    border: `1px solid ${active ? 'var(--primary)' : 'var(--line)'}`,
    borderRadius: 2,
    background: active ? 'var(--primary-soft)' : 'var(--bg-soft)',
    color: 'var(--text)',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
  };
}

function btnPrimary(disabled: boolean): React.CSSProperties {
  return {
    padding: '10px 20px',
    background: disabled ? 'var(--line-strong)' : 'var(--primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 2,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 14,
    fontWeight: 700,
  };
}

const btnSecondary: React.CSSProperties = {
  padding: '10px 20px',
  background: 'var(--bg-muted)',
  color: 'var(--text)',
  border: '1px solid var(--line)',
  borderRadius: 2,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
};

const dangerButton: React.CSSProperties = {
  border: 'none',
  background: 'none',
  color: 'var(--danger)',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 700,
  padding: 0,
};
