import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { useIpcListener } from '../../hooks/useIpcListener';
import { Button, Card, Input, Select } from '../ui';
import type { SettingsPMProps } from './types';

export function SettingsPM({ workspace, onUpdate, onTicketsRefresh }: SettingsPMProps) {
  const { t } = useTranslation('settings');
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

  useEffect(() => {
    if (workspace.pmTool !== 'jira') return;
    setJiraStatusLoading(true);
    void window.nakiros.jiraGetStatus(workspace.id)
      .then((status) => {
        setJiraStatus(status);
        if (status.connected) loadProjects();
      })
      .finally(() => setJiraStatusLoading(false));
  }, [workspace.id, workspace.pmTool]);

  useIpcListener(
    window.nakiros.onJiraAuthComplete,
    (data) => {
      if (data.wsId !== workspace.id) return;
      setJiraConnecting(false);
      setJiraStatus({ connected: true, cloudUrl: data.cloudUrl, displayName: data.displayName });
      setJiraError(null);
      loadProjects();
      if (data.workspace) void onUpdate(data.workspace);
    },
    [workspace.id],
    workspace.pmTool === 'jira',
  );

  useIpcListener(
    window.nakiros.onJiraAuthError,
    (data) => {
      if (data.wsId !== workspace.id && data.wsId !== '') return;
      setJiraConnecting(false);
      setJiraError(data.error);
    },
    [workspace.id],
    workspace.pmTool === 'jira',
  );

  function loadProjects() {
    setProjectsLoading(true);
    void window.nakiros.jiraGetProjects(workspace.id)
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setProjectsLoading(false));
  }

  async function handleConnect() {
    setJiraConnecting(true);
    setJiraError(null);
    await window.nakiros.jiraStartAuth(workspace.id);
  }

  async function handleDisconnect() {
    const updated = await window.nakiros.jiraDisconnect(workspace.id);
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
    const result = await window.nakiros.jiraSyncTickets(workspace.id, workspace);
    setJiraSyncing(false);
    if (result.error) {
      setJiraError(result.error);
    } else {
      setJiraSyncResult({ imported: result.imported, updated: result.updated });
      onTicketsRefresh?.();
    }
  }

  const pmTools: { id: 'jira' | 'github' | 'gitlab' | 'linear' | undefined; label: string }[] = [
    { id: undefined, label: t('pmNone') },
    { id: 'jira', label: 'Jira' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="mb-1 mt-0 text-xl font-bold">{t('pmTitle')}</h2>
        <p className="m-0 text-[13px] text-[var(--text-muted)]">{t('pmSubtitle')}</p>
      </div>

      <Card padding="md" className="rounded-[10px] bg-[var(--bg-soft)]">
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
          {t('pmToolLabel')}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {pmTools.map(({ id, label }) => (
            <Button
              key={String(id)}
              type="button"
              variant="secondary"
              onClick={() => void onUpdate({ ...workspace, pmTool: id })}
              className={clsx(
                'h-8 rounded-[10px] px-2.5 text-xs font-bold',
                workspace.pmTool === id
                  ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                  : 'border-[var(--line)] bg-[var(--bg-soft)] text-[var(--text)]',
              )}
            >
              {label}
            </Button>
          ))}
        </div>
      </Card>

      {workspace.pmTool === 'jira' && (
        <>
          <Card padding="md" className="rounded-[10px] bg-[var(--bg-soft)]">
            <h3 className="mb-2.5 mt-0 text-[13px] font-bold">{t('jiraAuthSection')}</h3>
            {jiraStatusLoading ? (
              <p className="m-0 text-xs text-[var(--text-muted)]">{t('jiraStatusChecking')}</p>
            ) : jiraStatus?.connected ? (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--success)]" />
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-[var(--text)]">
                    {t('jiraConnectedAs', { name: jiraStatus.displayName ?? '', url: jiraStatus.cloudUrl ?? '' })}
                  </span>
                </div>
                <div>
                  <Button type="button" variant="secondary" size="sm" onClick={() => void handleDisconnect()}>
                    {t('jiraDisconnect')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                <div>
                  <Input
                    value={jiraUrl}
                    onChange={(e) => setJiraUrl(e.target.value)}
                    onBlur={() => void onUpdate({ ...workspace, jiraUrl: jiraUrl.trim() || undefined })}
                    label={t('jiraUrl')}
                    placeholder="https://my-team.atlassian.net"
                    className="rounded-[10px] border-[var(--line)] bg-[var(--bg-card)] px-2.5 py-2 text-[13px]"
                  />
                  <p className="mb-0 mt-1 text-xs text-[var(--text-muted)]">
                    {t('jiraUrlHint')}
                  </p>
                </div>
                <div>
                  <Button
                    type="button"
                    onClick={() => void handleConnect()}
                    disabled={jiraConnecting}
                    loading={jiraConnecting}
                  >
                    {jiraConnecting ? t('jiraConnecting') : t('jiraConnectBtn')}
                  </Button>
                </div>
              </div>
            )}
            {jiraError && (
              <p className="mb-0 mt-2.5 font-mono text-xs text-[var(--danger)]">{jiraError}</p>
            )}
          </Card>

          {jiraStatus?.connected && (
            <Card padding="md" className="rounded-[10px] bg-[var(--bg-soft)]">
              <div className="flex flex-col gap-3">
                <div>
                  {projectsLoading ? (
                    <p className="m-0 text-xs text-[var(--text-muted)]">{t('jiraProjectLoading')}</p>
                  ) : (
                    <Select
                      value={workspace.projectKey ?? ''}
                      onChange={(e) => void handleProjectChange(e.target.value)}
                      label={t('jiraProjectLabel')}
                      options={[
                        { value: '', label: t('jiraProjectPlaceholder') },
                        ...projects.map((project) => ({ value: project.key, label: `${project.name} (${project.key})` })),
                      ]}
                      className="rounded-[10px] px-2.5 py-2 text-[13px]"
                    />
                  )}
                </div>
              </div>
            </Card>
          )}

          {jiraStatus?.connected && workspace.projectKey && (
            <Card padding="md" className="rounded-[10px] bg-[var(--bg-soft)]">
              <h3 className="mb-2.5 mt-0 text-[13px] font-bold">{t('jiraSyncSection')}</h3>
              <p className="mb-3 mt-0 text-xs text-[var(--text-muted)]">
                {t('jiraSyncHint')}
              </p>
              <div className="flex flex-wrap items-center gap-2.5">
                <Button
                  type="button"
                  onClick={() => void handleSync()}
                  disabled={jiraSyncing}
                  loading={jiraSyncing}
                >
                  {jiraSyncing ? t('jiraSyncing') : t('jiraSyncBtn')}
                </Button>
                {jiraSyncResult && (
                  <span className="text-xs text-[var(--success)]">
                    {t('jiraSyncSuccess', { imported: jiraSyncResult.imported, updated: jiraSyncResult.updated })}
                  </span>
                )}
              </div>
            </Card>
          )}
        </>
      )}

      {workspace.pmTool && workspace.pmTool !== 'jira' && (
        <Card padding="md" className="rounded-[10px] bg-[var(--bg-soft)]">
          <p className="m-0 text-xs text-[var(--text-muted)]">{t('pmComingSoon')}</p>
        </Card>
      )}
    </div>
  );
}

