import { useEffect, useState } from 'react';
import { FileText, Folder, GitBranch, LayoutDashboard, Link2, Plug, User } from 'lucide-react';
import type {
  AgentProfile,
  ResolvedLanguage,
  StoredWorkspace,
  WorkspaceDoc,
  WorkspaceMCP,
} from '@tiqora/shared';
import { MESSAGES } from '../i18n';
import { WORKFLOW_CAPABILITIES } from '../utils/workflow-capabilities';

type SettingsSection = 'general' | 'git' | 'pm' | 'mcps' | 'context';

interface Props {
  workspace: StoredWorkspace;
  language: ResolvedLanguage;
  onUpdate(workspace: StoredWorkspace): Promise<void>;
  onTicketsRefresh?(): void;
  onDelete?(): void;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function ProjectSettings({ workspace, language, onUpdate, onTicketsRefresh, onDelete }: Props) {
  const s = MESSAGES[language].settings;
  const [section, setSection] = useState<SettingsSection>('general');

  const NAV: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: s.navGeneral, icon: <User size={15} /> },
    { id: 'git',     label: s.navGit,     icon: <GitBranch size={15} /> },
    { id: 'pm',      label: s.navPM,      icon: <LayoutDashboard size={15} /> },
    { id: 'mcps',    label: s.navMCPs,    icon: <Plug size={15} /> },
    { id: 'context', label: s.navContext,  icon: <FileText size={15} /> },
  ];

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Left nav */}
      <nav
        style={{
          width: 160,
          background: 'var(--bg-soft)',
          borderRight: '1px solid var(--line)',
          display: 'flex',
          flexDirection: 'column',
          padding: '10px 8px',
          gap: 2,
          flexShrink: 0,
        }}
      >
        {NAV.map((item) => (
          <button
            key={item.id}
            onClick={() => setSection(item.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 10px',
              border: section === item.id ? '1px solid var(--primary)' : '1px solid transparent',
              borderRadius: 2,
              background: section === item.id ? 'var(--primary-soft)' : 'transparent',
              color: section === item.id ? 'var(--primary)' : 'var(--text)',
              fontWeight: section === item.id ? 700 : 500,
              fontSize: 13,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ opacity: section === item.id ? 1 : 0.6, flexShrink: 0 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div style={{ maxWidth: 640 }}>
          {section === 'general' && <GeneralSection workspace={workspace} language={language} onUpdate={onUpdate} onDelete={onDelete} />}
          {section === 'git'     && <GitSection workspace={workspace} language={language} onUpdate={onUpdate} />}
          {section === 'pm'      && <PMSection workspace={workspace} language={language} onUpdate={onUpdate} onTicketsRefresh={onTicketsRefresh} />}
          {section === 'mcps'    && <MCPSection workspace={workspace} onUpdate={onUpdate} msg={MESSAGES[language].settings} />}
          {section === 'context' && <DocsSection workspace={workspace} onUpdate={onUpdate} msg={MESSAGES[language].settings} />}
        </div>
      </div>
    </div>
  );
}

// ─── General ──────────────────────────────────────────────────────────────────

function GeneralSection({ workspace, language, onUpdate, onDelete }: Props) {
  const s = MESSAGES[language].settings;
  const isFr = language === 'fr';
  const [name, setName] = useState(workspace.name);

  useEffect(() => { setName(workspace.name); }, [workspace.id, workspace.name]);

  async function handleNameBlur() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === workspace.name) return;
    await onUpdate({ ...workspace, name: trimmed });
  }

  const DOC_LANGS = ['Système', 'Français', 'English'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={h2Style}>{s.navGeneral}</h2>
      </div>

      <section style={sectionStyle}>
        <label style={fieldLabel}>{s.projectNameLabel}</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void handleNameBlur()}
          style={inputStyle}
        />
      </section>

      <section style={sectionStyle}>
        <label style={fieldLabel}>{s.docLangLabel}</label>
        <p style={hintStyle}>{s.docLangHint}</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {DOC_LANGS.map((lang) => (
            <button
              key={lang}
              onClick={() => void onUpdate({ ...workspace, documentLanguage: lang })}
              style={chipStyle(workspace.documentLanguage === lang || (!workspace.documentLanguage && lang === 'Système'))}
            >
              {lang}
            </button>
          ))}
        </div>
      </section>

      <section style={sectionStyle}>
        <label style={fieldLabel}>{s.workflowAvailabilityTitle}</label>
        <p style={hintStyle}>{s.workflowAvailabilitySubtitle}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {WORKFLOW_CAPABILITIES.map((capability) => (
            <div
              key={capability.id}
              style={{
                border: '1px solid var(--line)',
                borderRadius: 2,
                background: 'var(--bg-card)',
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <strong style={{ fontSize: 13 }}>{capability.label}</strong>
                <span style={statusBadge(capability.status)}>{capability.status === 'stable' ? s.workflowStatusStable : s.workflowStatusBeta}</span>
              </div>
              <code style={{ fontSize: 11 }}>{capability.command}</code>
              {capability.status === 'beta' && (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                  {isFr ? `${s.workflowBetaHint} ${capability.fallbackMessage}` : `${s.workflowBetaHint} ${capability.fallbackMessage}`}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <DangerZone workspace={workspace} onDeleted={onDelete} />
    </div>
  );
}

// ─── Git ──────────────────────────────────────────────────────────────────────

function GitSection({ workspace, language, onUpdate }: Props) {
  const s = MESSAGES[language].settings;
  const [branch, setBranch] = useState(workspace.branchPattern ?? '');
  const [showCloneForm, setShowCloneForm] = useState(false);

  useEffect(() => { setBranch(workspace.branchPattern ?? ''); }, [workspace.id]);

  async function handleBranchBlur() {
    const trimmed = branch.trim();
    if (trimmed === (workspace.branchPattern ?? '')) return;
    await onUpdate({ ...workspace, branchPattern: trimmed || undefined });
  }

  async function handleOpenFolder() {
    const dir = await window.tiqora.selectDirectory();
    if (!dir) return;
    if (workspace.repos.some((r) => r.localPath === dir)) return;
    const name = dir.split('/').pop() ?? dir;
    const url = await window.tiqora.gitRemoteUrl(dir);
    await onUpdate({
      ...workspace,
      repos: [...workspace.repos, { name, localPath: dir, url: url ?? undefined, role: '', profile: 'generic' as AgentProfile, llmDocs: [] }],
    });
  }

  async function handleCloned(repoPath: string, repoName: string, remoteUrl: string) {
    if (workspace.repos.some((r) => r.localPath === repoPath)) return;
    await onUpdate({
      ...workspace,
      repos: [...workspace.repos, { name: repoName, localPath: repoPath, url: remoteUrl, role: '', profile: 'generic' as AgentProfile, llmDocs: [] }],
    });
    setShowCloneForm(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={h2Style}>{s.gitTitle}</h2>
        <p style={subtitleStyle}>{s.gitSubtitle}</p>
      </div>

      <section style={sectionStyle}>
        <label style={fieldLabel}>{s.branchPatternLabel}</label>
        <input
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          onBlur={() => void handleBranchBlur()}
          placeholder={s.branchPatternPlaceholder}
          style={inputStyle}
        />
      </section>

      <section style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 style={{ ...sectionTitle, margin: 0 }}>{s.reposTitle}</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => void handleOpenFolder()} style={addButtonStyle}>
              + {s.reposAdd}
            </button>
            <button
              onClick={() => setShowCloneForm((v) => !v)}
              style={{ ...addButtonStyle, ...(showCloneForm ? { borderColor: 'var(--primary)', color: 'var(--primary)' } : {}) }}
            >
              ↓ {s.reposClone}
            </button>
          </div>
        </div>

        {showCloneForm && (
          <CloneForm
            msg={s}
            onCloned={handleCloned}
            onCancel={() => setShowCloneForm(false)}
          />
        )}

        {workspace.repos.length === 0 && !showCloneForm ? (
          <p style={hintStyle}>{s.noRepoConfigured}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: showCloneForm ? 12 : 0 }}>
            {workspace.repos.map((repo) => (
              <div
                key={repo.localPath}
                style={{ border: '1px solid var(--line)', borderRadius: 2, padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: 10 }}
              >
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{repo.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Folder size={11} style={{ flexShrink: 0 }} />
                    {repo.localPath}
                  </div>
                  {repo.url && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <RemoteIcon url={repo.url} size={11} />
                      {repo.url}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => void onUpdate({ ...workspace, repos: workspace.repos.filter((r) => r.localPath !== repo.localPath) })}
                  style={{ ...iconBtn, color: 'var(--danger)', marginTop: 2 }}
                  title={s.repoRemove}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

type SMsg = ReturnType<typeof MESSAGES['fr']>['settings'];

function CloneForm({
  msg,
  onCloned,
  onCancel,
}: {
  msg: SMsg;
  onCloned(repoPath: string, repoName: string, remoteUrl: string): Promise<void>;
  onCancel(): void;
}) {
  const [url, setUrl] = useState('');
  const [destDir, setDestDir] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'cloning' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleClone() {
    if (!url.trim() || !destDir) return;
    setStatus('cloning');
    setErrorMsg('');
    const result = await window.tiqora.gitClone(url.trim(), destDir);
    if (result.success) {
      setStatus('success');
      await onCloned(result.repoPath, result.repoName, url.trim());
    } else {
      setStatus('error');
      setErrorMsg(result.error ?? msg.cloneError);
    }
  }

  return (
    <div style={{ border: '1px solid var(--primary)', borderRadius: 2, padding: 14, marginBottom: 12, background: 'var(--bg-muted)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <label style={fieldLabel}>URL</label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={msg.cloneUrlPlaceholder}
          style={inputStyle}
          autoFocus
          disabled={status === 'cloning'}
        />
      </div>
      <div>
        <label style={fieldLabel}>{msg.cloneDestLabel}</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ flex: 1, fontSize: 12, color: destDir ? 'var(--text)' : 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {destDir ?? msg.cloneDestNone}
          </span>
          <button
            onClick={async () => { const d = await window.tiqora.selectDirectory(); if (d) setDestDir(d); }}
            style={addButtonStyle}
            disabled={status === 'cloning'}
          >
            …
          </button>
        </div>
      </div>
      {status === 'error' && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--danger)', fontFamily: 'monospace' }}>{errorMsg}</p>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => void handleClone()}
          disabled={!url.trim() || !destDir || status === 'cloning'}
          style={primaryBtn(!url.trim() || !destDir || status === 'cloning')}
        >
          {status === 'cloning' ? msg.cloneInProgress : msg.cloneAction}
        </button>
        <button onClick={onCancel} style={secondaryBtn} disabled={status === 'cloning'}>{msg.mcpCancel}</button>
      </div>
    </div>
  );
}

function RemoteIcon({ url, size }: { url: string; size: number }) {
  const style: React.CSSProperties = { flexShrink: 0, display: 'block' };
  if (url.includes('github')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style}>
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
      </svg>
    );
  }
  if (url.includes('gitlab')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style}>
        <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51a.42.42 0 01.82 0l2.44 7.49h8.1l2.44-7.51a.42.42 0 01.82 0l2.44 7.51 1.17 3.64a.84.84 0 01-.35.9z" />
      </svg>
    );
  }
  return <Link2 size={size} style={style} />;
}

// ─── PM Tool ──────────────────────────────────────────────────────────────────

function PMSection({ workspace, language, onUpdate, onTicketsRefresh }: Props) {
  const s = MESSAGES[language].settings;
  const [jiraUrl, setJiraUrl] = useState(workspace.jiraUrl ?? '');

  const [jiraStatus, setJiraStatus] = useState<{ connected: boolean; cloudUrl?: string; displayName?: string } | null>(null);
  const [jiraStatusLoading, setJiraStatusLoading] = useState(false);
  const [jiraConnecting, setJiraConnecting] = useState(false);

  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  const [jiraSyncing, setJiraSyncing] = useState(false);
  const [jiraSyncResult, setJiraSyncResult] = useState<{ imported: number; updated: number } | null>(null);
  const [jiraError, setJiraError] = useState<string | null>(null);

  useEffect(() => {
    setJiraUrl(workspace.jiraUrl ?? '');
    setJiraError(null);
    setJiraSyncResult(null);
  }, [workspace.id]);

  // Load Jira connection status when Jira is selected
  useEffect(() => {
    if (workspace.pmTool !== 'jira') return;
    setJiraStatusLoading(true);
    void window.tiqora.jiraGetStatus(workspace.id)
      .then((status) => {
        setJiraStatus(status);
        if (status.connected) loadProjects();
      })
      .finally(() => setJiraStatusLoading(false));
  }, [workspace.id, workspace.pmTool]);

  // Listen for OAuth completion / error events
  useEffect(() => {
    if (workspace.pmTool !== 'jira') return;
    const unsubComplete = window.tiqora.onJiraAuthComplete((data) => {
      if (data.wsId !== workspace.id) return;
      setJiraConnecting(false);
      setJiraStatus({ connected: true, cloudUrl: data.cloudUrl, displayName: data.displayName });
      setJiraError(null);
      loadProjects();
      if (data.workspace) void onUpdate(data.workspace);
    });
    const unsubError = window.tiqora.onJiraAuthError((data) => {
      if (data.wsId !== workspace.id && data.wsId !== '') return;
      setJiraConnecting(false);
      setJiraError(data.error);
    });
    return () => {
      unsubComplete();
      unsubError();
    };
  }, [workspace.id, workspace.pmTool]);

  function loadProjects() {
    setProjectsLoading(true);
    void window.tiqora.jiraGetProjects(workspace.id)
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setProjectsLoading(false));
  }

  async function handleConnect() {
    setJiraConnecting(true);
    setJiraError(null);
    await window.tiqora.jiraStartAuth(workspace.id);
  }

  async function handleDisconnect() {
    const updated = await window.tiqora.jiraDisconnect(workspace.id);
    setJiraStatus({ connected: false });
    setProjects([]);
    setJiraSyncResult(null);
    if (updated) void onUpdate(updated);
  }

  async function handleProjectChange(key: string) {
    await onUpdate({ ...workspace, projectKey: key || undefined });
  }

  async function handleSync() {
    setJiraSyncing(true);
    setJiraError(null);
    setJiraSyncResult(null);
    const result = await window.tiqora.jiraSyncTickets(workspace.id, workspace);
    setJiraSyncing(false);
    if (result.error) {
      setJiraError(result.error);
    } else {
      setJiraSyncResult({ imported: result.imported, updated: result.updated });
      onTicketsRefresh?.();
    }
  }

  const PM_TOOLS: { id: 'jira' | 'github' | 'gitlab' | 'linear' | undefined; label: string }[] = [
    { id: undefined, label: s.pmNone },
    { id: 'jira',    label: 'Jira' },
    { id: 'github',  label: 'GitHub' },
    { id: 'gitlab',  label: 'GitLab' },
    { id: 'linear',  label: 'Linear' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={h2Style}>{s.pmTitle}</h2>
        <p style={subtitleStyle}>{s.pmSubtitle}</p>
      </div>

      <section style={sectionStyle}>
        <label style={fieldLabel}>Outil PM</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PM_TOOLS.map(({ id, label }) => (
            <button
              key={String(id)}
              onClick={() => void onUpdate({ ...workspace, pmTool: id })}
              style={chipStyle(workspace.pmTool === id)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {workspace.pmTool === 'jira' && (
        <>
          {/* Authentication section */}
          <section style={sectionStyle}>
            <h3 style={sectionTitle}>{s.jiraAuthSection}</h3>
            {jiraStatusLoading ? (
              <p style={hintStyle}>{s.jiraStatusChecking}</p>
            ) : jiraStatus?.connected ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success, #22c55e)', display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.jiraConnectedAs(jiraStatus.displayName ?? '', jiraStatus.cloudUrl ?? '')}
                  </span>
                </div>
                <div>
                  <button onClick={() => void handleDisconnect()} style={secondaryBtn}>
                    {s.jiraDisconnect}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={fieldLabel}>{s.jiraUrl}</label>
                  <input
                    value={jiraUrl}
                    onChange={(e) => setJiraUrl(e.target.value)}
                    onBlur={() => void onUpdate({ ...workspace, jiraUrl: jiraUrl.trim() || undefined })}
                    placeholder="https://my-team.atlassian.net"
                    style={inputStyle}
                  />
                  <p style={{ ...hintStyle, marginTop: 4 }}>
                    Si tu as plusieurs sites Atlassian, précise l'URL pour choisir le bon.
                  </p>
                </div>
                <div>
                  <button
                    onClick={() => void handleConnect()}
                    disabled={jiraConnecting}
                    style={primaryBtn(jiraConnecting)}
                  >
                    {jiraConnecting ? s.jiraConnecting : s.jiraConnectBtn}
                  </button>
                </div>
              </div>
            )}
            {jiraError && (
              <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--danger)', fontFamily: 'monospace' }}>{jiraError}</p>
            )}
          </section>

          {/* Project & Board pickers — only if connected */}
          {jiraStatus?.connected && (
            <section style={sectionStyle}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={fieldLabel}>{s.jiraProjectLabel}</label>
                  {projectsLoading ? (
                    <p style={hintStyle}>{s.jiraProjectLoading}</p>
                  ) : (
                    <select
                      value={workspace.projectKey ?? ''}
                      onChange={(e) => void handleProjectChange(e.target.value)}
                      style={selectStyle}
                    >
                      <option value="">{s.jiraProjectPlaceholder}</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.key}>
                          {p.name} ({p.key})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

              </div>
            </section>
          )}

          {/* Sync section — only if connected and project selected */}
          {jiraStatus?.connected && workspace.projectKey && (
            <section style={sectionStyle}>
              <h3 style={sectionTitle}>{s.jiraSyncSection}</h3>
              <p style={{ ...hintStyle, marginBottom: 12 }}>
                Importe les tickets Jira dans le board Kanban. Jira est la source de vérité — les tickets existants sont mis à jour.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => void handleSync()}
                  disabled={jiraSyncing}
                  style={primaryBtn(jiraSyncing)}
                >
                  {jiraSyncing ? s.jiraSyncing : s.jiraSyncBtn}
                </button>
                {jiraSyncResult && (
                  <span style={{ fontSize: 12, color: 'var(--success, #22c55e)' }}>
                    {s.jiraSyncSuccess(jiraSyncResult.imported, jiraSyncResult.updated)}
                  </span>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {workspace.pmTool && workspace.pmTool !== 'jira' && (
        <section style={sectionStyle}>
          <p style={hintStyle}>{s.pmComingSoon}</p>
        </section>
      )}
    </div>
  );
}

// ─── MCPs ─────────────────────────────────────────────────────────────────────

function MCPSection({
  workspace,
  onUpdate,
  msg,
}: {
  workspace: StoredWorkspace;
  onUpdate(ws: StoredWorkspace): Promise<void>;
  msg: SMsg;
}) {
  const mcps: WorkspaceMCP[] = workspace.mcps ?? [];
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleToggle(id: string) {
    await onUpdate({ ...workspace, mcps: mcps.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)) });
  }

  async function handleDelete(id: string) {
    await onUpdate({ ...workspace, mcps: mcps.filter((m) => m.id !== id) });
    if (editingId === id) setEditingId(null);
  }

  async function handleSave(mcp: WorkspaceMCP) {
    const exists = mcps.some((m) => m.id === mcp.id);
    await onUpdate({ ...workspace, mcps: exists ? mcps.map((m) => (m.id === mcp.id ? mcp : m)) : [...mcps, mcp] });
    setEditingId(null);
  }

  function handleAdd() {
    const newId = uid();
    const blank: WorkspaceMCP = { id: newId, name: '', command: '', args: [], env: {}, enabled: true };
    void onUpdate({ ...workspace, mcps: [...mcps, blank] });
    setEditingId(newId);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={h2Style}>{msg.mcpTitle}</h2>
        <p style={subtitleStyle}>{msg.mcpSubtitle}</p>
      </div>
      <section style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button onClick={handleAdd} style={addButtonStyle}>{msg.mcpAdd}</button>
        </div>
        {mcps.length === 0 && <p style={hintStyle}>Aucun MCP configuré.</p>}
        {mcps.map((mcp) =>
          editingId === mcp.id ? (
            <MCPForm
              key={mcp.id}
              mcp={mcp}
              msg={msg}
              onSave={handleSave}
              onCancel={() => {
                if (!mcp.name && !mcp.command) void onUpdate({ ...workspace, mcps: mcps.filter((m) => m.id !== mcp.id) });
                setEditingId(null);
              }}
            />
          ) : (
            <MCPRow
              key={mcp.id}
              mcp={mcp}
              msg={msg}
              onToggle={() => void handleToggle(mcp.id)}
              onEdit={() => setEditingId(mcp.id)}
              onDelete={() => void handleDelete(mcp.id)}
            />
          ),
        )}
      </section>
    </div>
  );
}

function MCPRow({ mcp, msg, onToggle, onEdit, onDelete }: { mcp: WorkspaceMCP; msg: SMsg; onToggle(): void; onEdit(): void; onDelete(): void }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 2, padding: '10px 12px', marginBottom: 8, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <button onClick={onToggle} style={{ marginTop: 3, width: 12, height: 12, borderRadius: 12, background: mcp.enabled ? 'var(--success, #22c55e)' : 'var(--line-strong)', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{mcp.name || <em style={{ color: 'var(--text-muted)' }}>Sans nom</em>}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 2 }}>{mcp.command}{mcp.args.length > 0 ? ' ' + mcp.args.join(' ') : ''}</div>
        {Object.keys(mcp.env).length > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{Object.keys(mcp.env).length} var(s) d'env.</div>}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={onEdit} style={iconBtn} title="Modifier">✏️</button>
        <button onClick={onDelete} style={{ ...iconBtn, color: 'var(--danger)' }} title={msg.mcpDelete}>✕</button>
      </div>
    </div>
  );
}

function MCPForm({ mcp: initial, msg, onSave, onCancel }: { mcp: WorkspaceMCP; msg: SMsg; onSave(m: WorkspaceMCP): Promise<void>; onCancel(): void }) {
  const [name, setName] = useState(initial.name);
  const [command, setCommand] = useState(initial.command);
  const [argsText, setArgsText] = useState(initial.args.join('\n'));
  const [envPairs, setEnvPairs] = useState<{ key: string; value: string }[]>(
    Object.entries(initial.env).map(([key, value]) => ({ key, value })),
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const env: Record<string, string> = {};
    for (const { key, value } of envPairs) { if (key.trim()) env[key.trim()] = value; }
    await onSave({ ...initial, name, command, args: argsText.split('\n').map((a) => a.trim()).filter(Boolean), env });
    setSaving(false);
  }

  return (
    <div style={{ border: '1px solid var(--primary)', borderRadius: 2, padding: 14, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg-muted)' }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>{msg.mcpName}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="github" style={inputStyle} />
        </div>
        <div style={{ flex: 2 }}>
          <label style={fieldLabel}>{msg.mcpCommand}</label>
          <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx" style={inputStyle} />
        </div>
      </div>
      <div>
        <label style={fieldLabel}>{msg.mcpArgs}</label>
        <textarea value={argsText} onChange={(e) => setArgsText(e.target.value)} placeholder={'-y\n@modelcontextprotocol/server-github'} rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }} />
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <label style={{ ...fieldLabel, margin: 0 }}>{msg.mcpEnvVars}</label>
          <button onClick={() => setEnvPairs((p) => [...p, { key: '', value: '' }])} style={addButtonStyle}>{msg.mcpAddEnvVar}</button>
        </div>
        {envPairs.map((pair, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input value={pair.key} onChange={(e) => setEnvPairs((p) => p.map((x, i) => i === idx ? { ...x, key: e.target.value } : x))} placeholder={msg.mcpEnvKey} style={{ ...inputStyle, flex: 1, fontFamily: 'monospace', fontSize: 12 }} />
            <input value={pair.value} onChange={(e) => setEnvPairs((p) => p.map((x, i) => i === idx ? { ...x, value: e.target.value } : x))} placeholder={msg.mcpEnvValue} style={{ ...inputStyle, flex: 2, fontFamily: 'monospace', fontSize: 12 }} />
            <button onClick={() => setEnvPairs((p) => p.filter((_, i) => i !== idx))} style={{ ...iconBtn, color: 'var(--danger)', alignSelf: 'center' }}>✕</button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => void handleSave()} disabled={saving || !name.trim() || !command.trim()} style={primaryBtn(saving || !name.trim() || !command.trim())}>{saving ? '…' : msg.mcpSave}</button>
        <button onClick={onCancel} style={secondaryBtn}>{msg.mcpCancel}</button>
      </div>
    </div>
  );
}

// ─── LLM Docs ─────────────────────────────────────────────────────────────────

function DocsSection({ workspace, onUpdate, msg }: { workspace: StoredWorkspace; onUpdate(ws: StoredWorkspace): Promise<void>; msg: SMsg }) {
  const docs: WorkspaceDoc[] = workspace.projectDocs ?? [];
  const [addingUrl, setAddingUrl] = useState(false);
  const [urlLabel, setUrlLabel] = useState('');
  const [urlPath, setUrlPath] = useState('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={h2Style}>{msg.docsTitle}</h2>
        <p style={subtitleStyle}>{msg.docsSubtitle}</p>
      </div>
      <section style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 12 }}>
          <button
            onClick={async () => {
              const p = await window.tiqora.openFilePicker();
              if (!p) return;
              await onUpdate({ ...workspace, projectDocs: [...docs, { id: uid(), label: p.split('/').pop() ?? p, path: p, type: 'file' }] });
            }}
            style={addButtonStyle}
          >
            {msg.docsAddFile}
          </button>
          <button onClick={() => setAddingUrl(true)} style={addButtonStyle}>{msg.docsAddUrl}</button>
        </div>

        {docs.length === 0 && !addingUrl && <p style={hintStyle}>Aucun document configuré.</p>}

        {docs.map((doc) => (
          <div key={doc.id} style={{ border: '1px solid var(--line)', borderRadius: 2, padding: '8px 12px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>{doc.type === 'url' ? '🌐' : '📄'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{doc.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.path}</div>
            </div>
            <button onClick={() => void onUpdate({ ...workspace, projectDocs: docs.filter((d) => d.id !== doc.id) })} style={{ ...iconBtn, color: 'var(--danger)' }} title={msg.docsDelete}>✕</button>
          </div>
        ))}

        {addingUrl && (
          <div style={{ border: '1px solid var(--primary)', borderRadius: 2, padding: 12, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-muted)' }}>
            <input value={urlLabel} onChange={(e) => setUrlLabel(e.target.value)} placeholder={msg.docsLabelPlaceholder} style={inputStyle} autoFocus />
            <input value={urlPath} onChange={(e) => setUrlPath(e.target.value)} placeholder={msg.docsUrlPlaceholder} style={inputStyle} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={async () => {
                  if (!urlPath.trim()) return;
                  await onUpdate({ ...workspace, projectDocs: [...docs, { id: uid(), label: urlLabel.trim() || urlPath.trim(), path: urlPath.trim(), type: 'url' }] });
                  setUrlLabel(''); setUrlPath(''); setAddingUrl(false);
                }}
                disabled={!urlPath.trim()}
                style={primaryBtn(!urlPath.trim())}
              >
                {msg.mcpSave}
              </button>
              <button onClick={() => setAddingUrl(false)} style={secondaryBtn}>{msg.mcpCancel}</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Danger Zone ──────────────────────────────────────────────────────────────

function DangerZone({ workspace, onDeleted }: { workspace: StoredWorkspace; onDeleted?(): void }) {
  const [confirm, setConfirm] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ deleted: number; errors: number } | null>(null);

  async function handleReset() {
    setRunning(true);
    setResult(null);
    const r = await window.tiqora.resetWorkspace(workspace);
    await window.tiqora.deleteWorkspace(workspace.id);
    setRunning(false);
    setConfirm(false);
    setResult({ deleted: r.deletedPaths.length, errors: r.errors.length });
    onDeleted?.();
  }

  return (
    <section style={{ ...sectionStyle, borderColor: 'var(--danger, #ef4444)' }}>
      <h3 style={{ ...sectionTitle, color: 'var(--danger, #ef4444)' }}>Zone de danger</h3>
      <p style={{ ...hintStyle, marginBottom: 12 }}>
        Supprime tous les fichiers Tiqora de chaque repo du workspace :
        {' '}<code style={{ fontSize: 11 }}>_tiqora/</code>,{' '}
        <code style={{ fontSize: 11 }}>.tiqora/</code>,{' '}
        <code style={{ fontSize: 11 }}>.tiqora.yaml</code>,{' '}
        <code style={{ fontSize: 11 }}>.tiqora.workspace.yaml</code>.
        <br />
        Les fichiers <code style={{ fontSize: 11 }}>CLAUDE.md</code>, <code style={{ fontSize: 11 }}>.cursorrules</code> et <code style={{ fontSize: 11 }}>llms.txt</code> ne sont pas touchés.
      </p>

      {!confirm ? (
        <button
          onClick={() => { setConfirm(true); setResult(null); }}
          style={{ padding: '7px 12px', borderRadius: 2, border: '1px solid var(--danger, #ef4444)', background: 'transparent', color: 'var(--danger, #ef4444)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >
          Réinitialiser les données Tiqora
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--danger, #ef4444)', fontWeight: 600 }}>
            ⚠ Cette action est irréversible. Confirmer la suppression sur {workspace.repos.length} repo(s) ?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => void handleReset()}
              disabled={running}
              style={{ padding: '7px 12px', borderRadius: 2, border: 'none', background: 'var(--danger, #ef4444)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: running ? 'not-allowed' : 'pointer', opacity: running ? 0.6 : 1 }}
            >
              {running ? 'Suppression…' : 'Oui, supprimer'}
            </button>
            <button onClick={() => setConfirm(false)} style={secondaryBtn} disabled={running}>Annuler</button>
          </div>
        </div>
      )}

      {result && (
        <p style={{ margin: '10px 0 0', fontSize: 12, color: result.errors > 0 ? 'var(--danger, #ef4444)' : 'var(--success, #22c55e)' }}>
          {result.errors > 0
            ? `Terminé avec ${String(result.errors)} erreur(s) — ${String(result.deleted)} élément(s) supprimé(s).`
            : `✓ ${String(result.deleted)} élément(s) supprimé(s).`}
        </p>
      )}
    </section>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const h2Style: React.CSSProperties = { margin: '0 0 4px', fontSize: 20, fontWeight: 700 };
const subtitleStyle: React.CSSProperties = { margin: 0, fontSize: 13, color: 'var(--text-muted)' };
const sectionStyle: React.CSSProperties = { border: '1px solid var(--line)', background: 'var(--bg-soft)', borderRadius: 2, padding: 16 };
const sectionTitle: React.CSSProperties = { margin: '0 0 10px', fontSize: 13, fontWeight: 700 };
const fieldLabel: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' };
const hintStyle: React.CSSProperties = { margin: 0, fontSize: 12, color: 'var(--text-muted)' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 2, background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' };
const selectStyle: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 2, background: 'var(--bg-soft)', color: 'var(--text)', fontSize: 13 };
const addButtonStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 2, background: 'var(--bg-card)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };
const iconBtn: React.CSSProperties = { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, padding: '2px 4px', borderRadius: 2, color: 'var(--text-muted)' };
const secondaryBtn: React.CSSProperties = { padding: '7px 12px', borderRadius: 2, border: '1px solid var(--line)', background: 'var(--bg-soft)', color: 'var(--text)', fontWeight: 600, fontSize: 13, cursor: 'pointer' };

function primaryBtn(disabled: boolean): React.CSSProperties {
  return { padding: '7px 12px', borderRadius: 2, border: 'none', background: disabled ? 'var(--line-strong)' : 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer' };
}

function chipStyle(active: boolean): React.CSSProperties {
  return { padding: '7px 11px', borderRadius: 2, border: `1px solid ${active ? 'var(--primary)' : 'var(--line)'}`, background: active ? 'var(--primary-soft)' : 'var(--bg-soft)', color: active ? 'var(--primary)' : 'var(--text)', fontWeight: 700, fontSize: 12, cursor: 'pointer' };
}

function statusBadge(status: 'stable' | 'beta'): React.CSSProperties {
  if (status === 'stable') {
    return {
      fontSize: 10,
      fontWeight: 700,
      color: '#065f46',
      background: '#d1fae5',
      border: '1px solid #10b981',
      borderRadius: 2,
      padding: '1px 6px',
    };
  }
  return {
    fontSize: 10,
    fontWeight: 700,
    color: '#92400e',
    background: '#fef3c7',
    border: '1px solid #f59e0b',
    borderRadius: 2,
    padding: '1px 6px',
  };
}
