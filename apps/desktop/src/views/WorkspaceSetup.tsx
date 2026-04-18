import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoredWorkspace, AgentProfile } from '@nakiros/shared';
import { Button } from '../components/ui';
import { PROFILE_LABELS } from '../utils/profiles';
import { syncWorkspaceArtifacts } from '../utils/workspace-sync';

interface Props {
  initialDirectory?: string;
  onCreated(workspace: StoredWorkspace): Promise<void>;
  onCancel(): void;
}

type Topology = 'mono' | 'multi';
type Step = 1 | 2 | 3 | 4;
type MonoSource = 'local' | 'remote' | 'new';
type TicketPrefixMode = 'auto-pm' | 'custom';

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
  const { t } = useTranslation('settings');
  const [step, setStep] = useState<Step>(1);
  const [topology, setTopology] = useState<Topology>('mono');
  const [workspaceDraftId] = useState(() => Date.now().toString());
  const createdWorkspaceRef = useRef(false);

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
        createdAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
      };

      await window.nakiros.saveWorkspace(workspace);
      await syncWorkspaceArtifacts(workspace);

      createdWorkspaceRef.current = true;
      await onCreated(workspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto my-[42px] w-full max-w-[760px] px-6">
      <div className="rounded-[10px] border border-[var(--line)] bg-[var(--bg-soft)] px-[22px] py-6 shadow-sm">
        <div className="mb-[18px] flex items-center justify-between gap-3">
          <h1 className="m-0 text-[22px] font-bold text-[var(--text)]">
            {`Nouveau workspace — Étape ${step}/${totalSteps}`}
          </h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="h-8 px-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            ✕ Annuler
          </Button>
        </div>

        {initialDirectory && (
          <p className="mb-3 mt-0 text-xs text-[var(--text-muted)]">
            Import assisté depuis:{' '}
            <code className="rounded-md border border-[var(--line)] bg-[var(--bg-muted)] px-1.5 py-0.5">
              {initialDirectory}
            </code>
          </p>
        )}
        {status && (
          <p className="mb-3 mt-0 text-xs text-[var(--success)]">{status}</p>
        )}
        {error && (
          <p className="mb-3 mt-0 text-xs text-[var(--danger)]">{error}</p>
        )}

        <div className="mb-5">
          <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-muted)]">
            <div
              className="h-full rounded-full bg-[var(--primary)] transition-all"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-[var(--text)]">Nom du workspace</span>
              <input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="ex: Plateforme Produit"
                className={INPUT_CLASS}
                autoFocus
              />
            </label>


            <p className="m-0 text-sm text-[var(--text-muted)]">Structure du workspace</p>
            <div className="flex gap-3">
              {(['mono', 'multi'] as Topology[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setTopology(kind)}
                  className={clsx(
                    'flex-1 rounded-[10px] border-2 px-4 py-5 text-left transition',
                    topology === kind
                      ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
                      : 'border-[var(--line)] bg-[var(--bg-soft)] hover:border-[var(--line-strong)]',
                  )}
                >
                  <strong className="mb-1.5 block text-[15px]">
                    {kind === 'mono' ? 'Mono-repo' : 'Multi-repo'}
                  </strong>
                  <span className={MUTED_TEXT_CLASS}>
                    {kind === 'mono' ? 'Un seul dépôt Git.' : 'Plusieurs dépôts regroupés dans un workspace.'}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <Button onClick={nextStep} disabled={!canGoNextFromStep1}>
                Suivant →
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            {topology === 'mono' && (
              <>
                <p className="m-0 text-sm text-[var(--text-muted)]">
                  Source du repo unique
                </p>

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setMonoSource('local')} className={chipClass(monoSource === 'local')}>Repo local</button>
                  <button type="button" onClick={() => setMonoSource('remote')} className={chipClass(monoSource === 'remote')}>Cloner repo distant</button>
                  <button type="button" onClick={() => setMonoSource('new')} className={chipClass(monoSource === 'new')}>Créer repo local</button>
                </div>

                {monoSource === 'local' && (
                  <>
                    <Button variant="secondary" onClick={() => void pickMonoLocalRepo()}>
                      Choisir un dossier repo
                    </Button>
                    {monoRepo && (
                      <div className={CARD_CLASS}>
                        <div><strong>{monoRepo.name}</strong></div>
                        <div className={MUTED_TEXT_CLASS}>{monoRepo.localPath}</div>
                        <div className={MUTED_TEXT_CLASS}>{PROFILE_LABELS[monoRepo.profile]}</div>
                      </div>
                    )}
                  </>
                )}

                {monoSource === 'remote' && (
                  <>
                    <label className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-[var(--text)]">URL Git du repo</span>
                      <input
                        value={monoRemoteUrl}
                        onChange={(e) => setMonoRemoteUrl(e.target.value)}
                        placeholder="git@github.com:org/repo.git"
                        className={INPUT_CLASS}
                      />
                    </label>

                    <div className="flex items-center gap-2">
                      <Button variant="secondary" onClick={() => void pickMonoParentDir()}>
                        Choisir dossier de destination
                      </Button>
                      <span className={MUTED_TEXT_CLASS}>
                        {monoParentDir || 'Aucun dossier choisi'}
                      </span>
                    </div>
                  </>
                )}

                {monoSource === 'new' && (
                  <>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" onClick={() => void pickMonoParentDir()}>
                        Choisir dossier parent
                      </Button>
                      <span className={MUTED_TEXT_CLASS}>
                        {monoParentDir || 'Aucun dossier choisi'}
                      </span>
                    </div>
                    <p className={MUTED_TEXT_CLASS}>
                      Un dossier repo sera créé puis{' '}
                      <code className="rounded-md border border-[var(--line)] bg-[var(--bg-soft)] px-1.5 py-0.5">
                        git init
                      </code>{' '}
                      sera exécuté.
                    </p>
                  </>
                )}
              </>
            )}

            {topology === 'multi' && (
              <>
                <p className="m-0 text-sm text-[var(--text-muted)]">
                  Repos du workspace
                </p>

                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => void addMultiLocalRepo()}>+ Ajouter un repo local</Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={pendingRemoteUrl}
                    onChange={(e) => setPendingRemoteUrl(e.target.value)}
                    placeholder="git@github.com:org/repo.git"
                    className={clsx(INPUT_CLASS, 'min-w-[280px] flex-1')}
                  />
                  <Button variant="secondary" onClick={() => void addMultiRemoteRepo()}>+ Ajouter repo distant</Button>
                </div>

                {multiRepos.length === 0 ? (
                  <p className={MUTED_TEXT_CLASS}>Aucun repo ajouté.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {multiRepos.map((repo) => (
                      <div key={repo.id} className={CARD_CLASS}>
                        <div className="flex items-center justify-between gap-2">
                          <input
                            value={repo.name}
                            onChange={(e) => updateMultiRepo(repo.id, { name: e.target.value })}
                            placeholder="Nom du repo"
                            className={clsx(INPUT_CLASS, 'flex-1 font-bold')}
                          />
                          <button
                            type="button"
                            onClick={() => removeMultiRepo(repo.id)}
                            className="border-0 bg-transparent p-0 text-xs font-bold text-[var(--danger)]"
                          >
                            Retirer
                          </button>
                        </div>
                        <div className="mt-1.5 text-xs text-[var(--text-muted)]">
                          {repo.sourcePath}
                        </div>
                        <div className="mt-1 text-xs text-[var(--text-muted)]">
                          Profil détecté: {PROFILE_LABELS[repo.profile]}
                        </div>
                        <input
                          value={repo.role}
                          onChange={(e) => updateMultiRepo(repo.id, { role: e.target.value })}
                          placeholder="Rôle (optionnel)"
                          className={clsx(INPUT_CLASS, 'mt-2')}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <div className="flex gap-2">
              <Button variant="secondary" onClick={prevStep}>← Retour</Button>
              <Button onClick={nextStep} disabled={!canGoNextFromStep2}>
                Suivant →
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-[var(--text)]">Outil PM</span>
              <select
                value={pmTool}
                onChange={(e) => setPmTool(e.target.value as StoredWorkspace['pmTool'] | '')}
                className={INPUT_CLASS}
              >
                <option value="">— aucun —</option>
              </select>
            </label>

            {pmTool && (
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-[var(--text)]">Clé de projet (ex: PROJ)</span>
                <input
                  value={projectKey}
                  onChange={(e) => setProjectKey(e.target.value.toUpperCase())}
                  placeholder="PROJ"
                  className={INPUT_CLASS}
                />
              </label>
            )}

            <div className={CARD_CLASS}>
              <p className="mb-2 mt-0 text-sm font-bold">Format des tickets locaux</p>
              <p className="mb-2.5 mt-0 text-xs text-[var(--text-muted)]">
                Cette configuration s'applique aux tickets créés dans le board local Nakiros.
              </p>

              {pmTool && normalizedProjectKey ? (
                <>
                  <div className="mb-2.5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTicketPrefixModeTouched(true);
                        setTicketPrefixMode('auto-pm');
                      }}
                      className={chipClass(ticketPrefixMode === 'auto-pm')}
                    >
                      Utiliser la clé projet PM ({normalizedProjectKey})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTicketPrefixModeTouched(true);
                        setTicketPrefixMode('custom');
                      }}
                      className={chipClass(ticketPrefixMode === 'custom')}
                    >
                      Préfixe personnalisé
                    </button>
                  </div>
                  {ticketPrefixMode === 'auto-pm' && (
                    <p className="m-0 text-xs text-[var(--text-muted)]">
                      Format final:{' '}
                      <code className="rounded-md border border-[var(--line)] bg-[var(--bg-soft)] px-1.5 py-0.5">
                        {normalizedProjectKey}-001
                      </code>
                    </p>
                  )}
                </>
              ) : (
                <p className="mb-2.5 mt-0 text-xs text-[var(--text-muted)]">
                  Renseigne une clé projet PM pour activer le mode automatique, sinon utilise un préfixe personnalisé.
                </p>
              )}

              {(ticketPrefixMode === 'custom' || !pmTool || !normalizedProjectKey) && (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-[var(--text)]">Préfixe des tickets</span>
                    <input
                      value={ticketPrefix}
                      onChange={(e) => {
                        setTicketPrefixTouched(true);
                        setTicketPrefix(e.target.value);
                      }}
                      placeholder="PROJ"
                      className={clsx(INPUT_CLASS, 'font-mono')}
                    />
                  </label>
                  <p className="mb-0 mt-2 text-xs text-[var(--text-muted)]">
                    Format final:{' '}
                    <code className="rounded-md border border-[var(--line)] bg-[var(--bg-soft)] px-1.5 py-0.5">
                      {effectiveTicketPrefix}-001
                    </code>
                  </p>
                </>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" onClick={prevStep}>← Retour</Button>
              <Button onClick={nextStep}>Suivant →</Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <div className={CARD_CLASS}>
              <p className="mb-1 mt-0"><strong>Workspace:</strong> {name}</p>
              <p className="mb-3 mt-0"><strong>Structure:</strong> {topology === 'mono' ? 'Mono-repo' : 'Multi-repo'}</p>

              {topology === 'mono' && monoRepo && (
                <>
                  <p className="mb-1 mt-0 text-[13px] font-semibold">Repo :</p>
                  <p className="mb-3 mt-0 text-[13px]">
                    {monoRepo.name} — <span className="text-[var(--text-muted)]">{monoRepo.localPath}</span>
                    {' '}— {PROFILE_LABELS[monoRepo.profile]}
                  </p>
                </>
              )}

              {topology === 'multi' && multiRepos.length > 0 && (
                <>
                  <p className="mb-1 mt-0 text-[13px] font-semibold">Repos ({multiRepos.length}) :</p>
                  <ul className="mb-3 mt-0 list-disc pl-[18px] text-[13px]">
                    {multiRepos.map((repo) => (
                      <li key={repo.id}>
                        {repo.name} — <span className="text-[var(--text-muted)]">{repo.sourcePath}</span>
                        {' '}— {PROFILE_LABELS[repo.profile]}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {pmTool && (
                <p className="mb-1 mt-0">
                  <strong>PM Tool:</strong>{' '}
                  {pmTool}
                  {projectKey ? ` — ${projectKey}` : ''}
                </p>
              )}

              <p className="m-0">
                <strong>Préfixe tickets:</strong>{' '}
                <code className="rounded-md border border-[var(--line)] bg-[var(--bg-soft)] px-1.5 py-0.5">
                  {effectiveTicketPrefix}
                </code>
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" onClick={prevStep}>← Retour</Button>
              <Button onClick={() => void handleCreate()} loading={saving}>
                Créer le workspace
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const INPUT_CLASS =
  'ui-form-control w-full rounded-[10px] border border-[var(--line)] bg-[var(--bg-soft)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none';
const CARD_CLASS = 'rounded-[10px] border border-[var(--line)] bg-[var(--bg-muted)] p-3.5';
const MUTED_TEXT_CLASS = 'm-0 text-xs text-[var(--text-muted)]';

function chipClass(active: boolean): string {
  return clsx(
    'rounded-[10px] border px-3 py-1.5 text-[13px] font-semibold transition',
    active
      ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--text)]'
      : 'border-[var(--line)] bg-[var(--bg-soft)] text-[var(--text)] hover:border-[var(--line-strong)]',
  );
}
