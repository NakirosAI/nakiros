import { useEffect, useMemo, useState } from 'react';
import type { StoredWorkspace, AgentProfile } from '@nakiros/shared';
import { PROFILE_LABELS } from '../utils/profiles';

interface Props {
  initialDirectory?: string;
  onCreated(workspace: StoredWorkspace): void;
  onCancel(): void;
}

type Topology = 'mono' | 'multi';
type Step = 1 | 2 | 3 | 4;
type MonoSource = 'local' | 'remote' | 'new';
type TicketPrefixMode = 'auto-pm' | 'custom';
type SyncFilter = 'sprint_active' | 'last_3_months' | 'all';
type BoardType = 'scrum' | 'kanban' | 'unknown';

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

type MultiRepoCandidate = {
  id: string;
  sourcePath: string;
  name: string;
  role: string;
  profile: AgentProfile;
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
  const [step, setStep] = useState<Step>(1);
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
  const [syncFilter, setSyncFilter] = useState<SyncFilter>('sprint_active');
  const [boardType, setBoardType] = useState<BoardType | null>(null);
  const [jiraBoardId, setJiraBoardId] = useState<string | null>(null);
  const [boardDetecting, setBoardDetecting] = useState(false);
  const [ticketCount, setTicketCount] = useState<{ count: number; hasMore: boolean } | null>(null);
  const [ticketCountLoading, setTicketCountLoading] = useState(false);

  const totalSteps = 4;

  useEffect(() => {
    if (!initialDirectory) return;
    let cancelled = false;

    void (async () => {
      try {
        const profile = await window.nakiros.detectProfile(initialDirectory);
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
    if (step > 1) setStep((step - 1) as Step);
  }

  async function pickMonoLocalRepo() {
    setError(null);
    const dir = await window.nakiros.selectDirectory();
    if (!dir) return;
    const profile = await window.nakiros.detectProfile(dir);
    setMonoRepo(toRepo(dir, profile));
    setStatus(`Repo local sélectionné: ${basenameFromPath(dir)}`);
  }

  async function pickMonoParentDir() {
    setError(null);
    const dir = await window.nakiros.selectDirectory();
    if (!dir) return;
    setMonoParentDir(dir);
  }

  async function addMultiLocalRepo() {
    setError(null);
    const dir = await window.nakiros.selectDirectory();
    if (!dir) return;
    if (multiRepos.some((r) => r.sourcePath === dir)) return;

    const profile = await window.nakiros.detectProfile(dir);
    const repoName = basenameFromPath(dir);
    setMultiRepos((prev) => [
      ...prev,
      { id: uid(), sourcePath: dir, name: repoName, role: '', profile },
    ]);
    setStatus(`Repo local ajouté: ${repoName}`);
  }

  async function addMultiRemoteRepo() {
    setError(null);
    const url = pendingRemoteUrl.trim();
    if (!url) return;

    const destDir = await window.nakiros.selectDirectory();
    if (!destDir) return;

    setStatus('Clonage en cours…');
    const clone = await window.nakiros.gitClone(url, destDir);
    if (!clone.success) {
      setError(`Échec du clonage: ${clone.error ?? 'erreur inconnue'}`);
      setStatus(null);
      return;
    }

    const profile = await window.nakiros.detectProfile(clone.repoPath);
    const repoName = clone.repoName || deriveRepoNameFromUrl(url);
    setMultiRepos((prev) => [
      ...prev,
      { id: uid(), sourcePath: clone.repoPath, name: repoName, role: '', profile },
    ]);
    setPendingRemoteUrl('');
    setStatus(`Repo cloné et ajouté: ${repoName}`);
  }

  function updateMultiRepo(id: string, patch: Partial<Pick<MultiRepoCandidate, 'name' | 'role'>>) {
    setMultiRepos((prev) =>
      prev.map((repo) =>
        repo.id !== id
          ? repo
          : { ...repo, name: patch.name ?? repo.name, role: patch.role ?? repo.role },
      ),
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
    return multiRepos.length > 0;
  }, [topology, monoSource, monoRepo, monoRemoteUrl, monoParentDir, multiRepos.length]);

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
    void window.nakiros
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
    const unsubComplete = window.nakiros.onJiraAuthComplete((data) => {
      if (data.wsId !== workspaceDraftId) return;
      setJiraConnecting(false);
      setJiraAuthError(null);
      setJiraStatus({ connected: true, cloudUrl: data.cloudUrl, displayName: data.displayName });
      void loadJiraProjects();
    });
    const unsubError = window.nakiros.onJiraAuthError((data) => {
      if (data.wsId !== workspaceDraftId) return;
      setJiraConnecting(false);
      setJiraAuthError(data.error);
    });

    return () => {
      unsubComplete();
      unsubError();
    };
  }, [pmTool, workspaceDraftId]);

  useEffect(() => {
    if (pmTool !== 'jira' || !jiraStatus?.connected || !normalizedProjectKey || boardDetecting) {
      setTicketCount(null);
      return;
    }
    let cancelled = false;
    setTicketCountLoading(true);
    void window.nakiros
      .jiraCountTickets(workspaceDraftId, normalizedProjectKey, syncFilter, boardType ?? 'unknown')
      .then((count) => { if (!cancelled) setTicketCount(count); })
      .catch(() => { if (!cancelled) setTicketCount(null); })
      .finally(() => { if (!cancelled) setTicketCountLoading(false); });
    return () => { cancelled = true; };
  }, [pmTool, jiraStatus?.connected, normalizedProjectKey, syncFilter, boardType, boardDetecting, workspaceDraftId]);

  useEffect(() => {
    if (pmTool !== 'jira' || !jiraStatus?.connected || !normalizedProjectKey) {
      setBoardType(null);
      setJiraBoardId(null);
      return;
    }
    let cancelled = false;
    setBoardDetecting(true);
    void window.nakiros
      .jiraGetBoardType(workspaceDraftId, normalizedProjectKey)
      .then(({ boardType: bt, boardId }: { boardType: BoardType; boardId: string | null }) => {
        if (cancelled) return;
        setBoardType(bt);
        setJiraBoardId(boardId);
      })
      .finally(() => {
        if (!cancelled) setBoardDetecting(false);
      });
    return () => { cancelled = true; };
  }, [pmTool, jiraStatus?.connected, normalizedProjectKey, workspaceDraftId]);

  function loadJiraProjects() {
    setJiraProjectsLoading(true);
    setJiraAuthError(null);
    void window.nakiros
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
    await window.nakiros.jiraStartAuth(workspaceDraftId);
  }

  async function handleJiraDisconnect() {
    await window.nakiros.jiraDisconnect(workspaceDraftId);
    setJiraStatus({ connected: false });
    setJiraProjects([]);
    setJiraAuthError(null);
  }

  async function prepareMonoRepo(): Promise<{ workspacePath: string; repos: StoredWorkspace['repos'] }> {
    if (monoSource === 'local') {
      if (!monoRepo) throw new Error('Sélectionne un repo local.');
      const remoteUrl = await window.nakiros.gitRemoteUrl(monoRepo.localPath);
      return {
        workspacePath: monoRepo.localPath,
        repos: [{ ...monoRepo, url: remoteUrl ?? monoRepo.url }],
      };
    }

    if (monoSource === 'remote') {
      if (!monoRemoteUrl.trim()) throw new Error('Renseigne l’URL du repo distant.');
      if (!monoParentDir.trim()) throw new Error('Choisis un dossier de destination.');

      const clone = await window.nakiros.gitClone(monoRemoteUrl.trim(), monoParentDir);
      if (!clone.success) throw new Error(clone.error ?? 'Échec du clonage.');

      const profile = await window.nakiros.detectProfile(clone.repoPath);
      const remoteUrl = await window.nakiros.gitRemoteUrl(clone.repoPath);
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
    const repoPath = await window.nakiros.createWorkspaceRoot(monoParentDir, name);
    const init = await window.nakiros.gitInit(repoPath);
    if (!init.success) throw new Error(init.error ?? 'Échec de git init.');

    const profile = await window.nakiros.detectProfile(repoPath);
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
    if (multiRepos.length === 0) throw new Error('Ajoute au moins un repo.');

    const repos: StoredWorkspace['repos'] = [];

    for (const candidate of multiRepos) {
      const remoteUrl = await window.nakiros.gitRemoteUrl(candidate.sourcePath);
      repos.push({
        name: candidate.name || basenameFromPath(candidate.sourcePath),
        localPath: candidate.sourcePath,
        url: remoteUrl ?? undefined,
        role: candidate.role,
        profile: candidate.profile,
        llmDocs: ['CLAUDE.md'],
      });
    }

    return { workspacePath: repos[0].localPath, repos };
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
        pmBoardId: jiraBoardId ?? undefined,
        boardType: boardType ?? undefined,
        syncFilter,
        createdAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
      };

      await window.nakiros.saveWorkspace(workspace);
      await window.nakiros.syncWorkspaceYaml(workspace);
      await window.nakiros.syncWorkspace(workspace);

      if (workspace.pmTool === 'jira' && workspace.projectKey && jiraStatus?.connected) {
        setStatus('Synchronisation Jira en cours…');
        const result = await window.nakiros.jiraSyncTickets(workspace.id, workspace);
        if (result.error) {
          setError(`Sync Jira échouée: ${result.error}`);
        }
      }

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
          borderRadius: 10,
          padding: '24px 22px',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>
            {`Nouveau workspace — Étape ${step}/${totalSteps}`}
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

        <div style={{ marginBottom: 20 }}>
          <div style={{ height: 8, borderRadius: 10, background: 'var(--bg-muted)', overflow: 'hidden' }}>
            <div
              style={{
                width: `${(step / totalSteps) * 100}%`,
                height: '100%',
                background: 'var(--primary)',
                borderRadius: 10,
              }}
            />
          </div>
        </div>

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

            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>Structure du workspace</p>
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
                    borderRadius: 10,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <strong style={{ fontSize: 15, display: 'block', marginBottom: 6 }}>
                    {kind === 'mono' ? 'Mono-repo' : 'Multi-repo'}
                  </strong>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {kind === 'mono' ? 'Un seul dépôt Git.' : 'Plusieurs dépôts regroupés dans un workspace.'}
                  </span>
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
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
                  Repos du workspace
                </p>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => void addMultiLocalRepo()} style={btnSecondary}>+ Ajouter un repo local</button>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    value={pendingRemoteUrl}
                    onChange={(e) => setPendingRemoteUrl(e.target.value)}
                    placeholder="git@github.com:org/repo.git"
                    style={{ ...inputStyle, flex: 1, minWidth: 280 }}
                  />
                  <button onClick={() => void addMultiRemoteRepo()} style={btnSecondary}>+ Ajouter repo distant</button>
                </div>

                {multiRepos.length === 0 ? (
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 12 }}>Aucun repo ajouté.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {multiRepos.map((repo) => (
                      <div key={repo.id} style={cardStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                          <input
                            value={repo.name}
                            onChange={(e) => updateMultiRepo(repo.id, { name: e.target.value })}
                            placeholder="Nom du repo"
                            style={{ ...inputStyle, fontWeight: 700, flex: 1 }}
                          />
                          <button onClick={() => removeMultiRepo(repo.id)} style={dangerButton}>Retirer</button>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                          {repo.sourcePath}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                          Profil détecté: {PROFILE_LABELS[repo.profile]}
                        </div>
                        <input
                          value={repo.role}
                          onChange={(e) => updateMultiRepo(repo.id, { role: e.target.value })}
                          placeholder="Rôle (optionnel)"
                          style={{ ...inputStyle, marginTop: 8 }}
                        />
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
                      <>
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
                        {normalizedProjectKey && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            {boardDetecting && (
                              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Détection du board…</span>
                            )}
                            {!boardDetecting && boardType && boardType !== 'unknown' && (
                              <span style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: 6,
                                background: 'var(--primary-soft)',
                                color: 'var(--primary)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                              }}>
                                {boardType}
                              </span>
                            )}
                          </div>
                        )}
                      </>
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
                  <div style={{ margin: '10px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--danger)' }}>
                      Connexion Jira échouée — {jiraAuthError}
                    </p>
                    <button
                      onClick={() => void handleJiraConnect()}
                      style={{ ...btnSecondary, fontSize: 12, padding: '6px 12px', alignSelf: 'flex-start' }}
                    >
                      Réessayer
                    </button>
                  </div>
                )}
              </div>
            )}

            {pmTool === 'jira' && jiraStatus?.connected && normalizedProjectKey && (
              <div style={cardStyle}>
                <p style={{ margin: '0 0 10px', fontWeight: 700 }}>Synchroniser les tickets</p>
                {([
                  { value: 'sprint_active', label: 'Sprint actif uniquement', desc: boardType === 'scrum' ? 'Tickets du sprint en cours. (Recommandé)' : 'Tickets non terminés. (Recommandé)' },
                  { value: 'last_3_months', label: '3 derniers mois', desc: 'Tickets créés ou modifiés dans les 3 derniers mois.' },
                  { value: 'all', label: 'Tout le projet', desc: 'Tous les tickets. Peut être très volumineux.' },
                ] as { value: SyncFilter; label: string; desc: string }[]).map((opt) => (
                  <label
                    key={opt.value}
                    style={{ display: 'flex', gap: 10, cursor: 'pointer', marginBottom: 10, alignItems: 'flex-start' }}
                  >
                    <input
                      type="radio"
                      name="syncFilter"
                      value={opt.value}
                      checked={syncFilter === opt.value}
                      onChange={() => setSyncFilter(opt.value)}
                      style={{ marginTop: 2, accentColor: 'var(--primary)', flexShrink: 0 }}
                    />
                    <span style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span>
                        <strong style={{ fontSize: 13 }}>{opt.label}</strong>
                        <br />
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{opt.desc}</span>
                      </span>
                      {syncFilter === opt.value && (
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: ticketCountLoading ? 'var(--bg-muted)' : 'var(--primary-soft)',
                          color: ticketCountLoading ? 'var(--text-muted)' : 'var(--primary)',
                          flexShrink: 0,
                          marginLeft: 8,
                          marginTop: 2,
                        }}>
                          {ticketCountLoading ? '…' : ticketCount !== null ? `${ticketCount.count}${ticketCount.hasMore ? '+' : ''} tickets` : ''}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}

            <div style={cardStyle}>
              <p style={{ margin: '0 0 8px', fontWeight: 700 }}>Format des tickets locaux</p>
              <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-muted)' }}>
                Cette configuration s'applique aux tickets créés dans le board local Nakiros.
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
              <p style={{ margin: '0 0 4px' }}><strong>Workspace:</strong> {name}</p>
              <p style={{ margin: '0 0 12px' }}><strong>Structure:</strong> {topology === 'mono' ? 'Mono-repo' : 'Multi-repo'}</p>

              {topology === 'mono' && monoRepo && (
                <>
                  <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600 }}>Repo :</p>
                  <p style={{ margin: '0 0 12px', fontSize: 13 }}>
                    {monoRepo.name} — <span style={{ color: 'var(--text-muted)' }}>{monoRepo.localPath}</span>
                    {' '}— {PROFILE_LABELS[monoRepo.profile]}
                  </p>
                </>
              )}

              {topology === 'multi' && multiRepos.length > 0 && (
                <>
                  <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600 }}>Repos ({multiRepos.length}) :</p>
                  <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 13 }}>
                    {multiRepos.map((repo) => (
                      <li key={repo.id}>
                        {repo.name} — <span style={{ color: 'var(--text-muted)' }}>{repo.sourcePath}</span>
                        {' '}— {PROFILE_LABELS[repo.profile]}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {pmTool && (
                <p style={{ margin: '0 0 4px' }}>
                  <strong>PM Tool:</strong>{' '}
                  {pmTool}
                  {projectKey ? ` — ${jiraProjects.find(p => p.key === projectKey)?.name ?? projectKey} (${projectKey})` : ''}
                  {boardType && boardType !== 'unknown' ? ` — ${boardType.charAt(0).toUpperCase() + boardType.slice(1)}` : ''}
                </p>
              )}

              {pmTool === 'jira' && jiraStatus?.connected && normalizedProjectKey && (
                <p style={{ margin: '0 0 4px' }}>
                  <strong>Synchronisation:</strong>{' '}
                  {syncFilter === 'sprint_active' ? 'Sprint actif uniquement' : syncFilter === 'last_3_months' ? '3 derniers mois' : 'Tout le projet'}
                  {ticketCount !== null && !ticketCountLoading && (
                    <span style={{
                      marginLeft: 8,
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: 6,
                      background: 'var(--primary-soft)',
                      color: 'var(--primary)',
                    }}>
                      {ticketCount.count}{ticketCount.hasMore ? '+' : ''} tickets
                    </span>
                  )}
                </p>
              )}

              <p style={{ margin: '0' }}><strong>Préfixe tickets:</strong> <code>{effectiveTicketPrefix}</code></p>
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
  borderRadius: 10,
  fontSize: 14,
  color: 'var(--text)',
  background: 'var(--bg-soft)',
  width: '100%',
  boxSizing: 'border-box',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-muted)',
  border: '1px solid var(--line)',
  borderRadius: 10,
  padding: 14,
};

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '7px 12px',
    border: `1px solid ${active ? 'var(--primary)' : 'var(--line)'}`,
    borderRadius: 10,
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
    borderRadius: 10,
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
  borderRadius: 10,
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
