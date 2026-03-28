import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, Link2 } from 'lucide-react';
import clsx from 'clsx';
import type { AgentProfile } from '@nakiros/shared';
import { Button, Card, Input } from '../ui';
import type { SettingsBaseProps } from './types';

export function SettingsGit({ workspace, onUpdate }: SettingsBaseProps) {
  const { t } = useTranslation('settings');
  const [branch, setBranch] = useState(workspace.branchPattern ?? '');
  const [showCloneForm, setShowCloneForm] = useState(false);

  useEffect(() => {
    setBranch(workspace.branchPattern ?? '');
  }, [workspace.id]);

  async function handleBranchBlur() {
    const trimmed = branch.trim();
    if (trimmed === (workspace.branchPattern ?? '')) return;
    await onUpdate({ ...workspace, branchPattern: trimmed || undefined });
  }

  async function handleOpenFolder() {
    const dir = await window.nakiros.selectDirectory();
    if (!dir) return;
    if (workspace.repos.some((repo) => repo.localPath === dir)) return;
    const name = dir.split('/').pop() ?? dir;
    const url = await window.nakiros.gitRemoteUrl(dir);
    await onUpdate({
      ...workspace,
      repos: [
        ...workspace.repos,
        { name, localPath: dir, url: url ?? undefined, role: '', profile: 'generic' as AgentProfile, llmDocs: [] },
      ],
    });
  }

  async function handleCloned(repoPath: string, repoName: string, remoteUrl: string) {
    if (workspace.repos.some((repo) => repo.localPath === repoPath)) return;
    await onUpdate({
      ...workspace,
      repos: [
        ...workspace.repos,
        { name: repoName, localPath: repoPath, url: remoteUrl, role: '', profile: 'generic' as AgentProfile, llmDocs: [] },
      ],
    });
    setShowCloneForm(false);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="mb-1 mt-0 text-xl font-bold">{t('gitTitle')}</h2>
        <p className="m-0 text-[13px] text-[var(--text-muted)]">{t('gitSubtitle')}</p>
      </div>

      <Card className="rounded-[16px] border-[var(--line)] bg-[var(--bg-soft)] p-5 shadow-none">
        <Input
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          onBlur={() => void handleBranchBlur()}
          label={t('branchPatternLabel')}
          placeholder={t('branchPatternPlaceholder')}
          className="rounded-[12px] border-[var(--line)] bg-[var(--bg-card)] px-3 py-2.5 text-[13px]"
        />
      </Card>

      <Card className="rounded-[16px] border-[var(--line)] bg-[var(--bg-soft)] p-5 shadow-none">
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="m-0 text-[13px] font-bold">{t('reposTitle')}</h3>
          <div className="flex gap-1.5">
            <Button type="button" variant="secondary" size="sm" onClick={() => void handleOpenFolder()}>
              + {t('reposAdd')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowCloneForm((value) => !value)}
              className={showCloneForm ? 'border-[var(--line-strong)] bg-[var(--bg-card)] text-[var(--text)]' : undefined}
            >
              ↓ {t('reposClone')}
            </Button>
          </div>
        </div>

        {showCloneForm && (
          <CloneForm
            onCloned={handleCloned}
            onCancel={() => setShowCloneForm(false)}
          />
        )}

        {workspace.repos.length === 0 && !showCloneForm ? (
          <p className="m-0 text-xs text-[var(--text-muted)]">{t('noRepoConfigured')}</p>
        ) : (
          <div className={clsx('flex flex-col gap-2', showCloneForm && 'mt-3')}>
            {workspace.repos.map((repo) => (
              <div
                key={repo.localPath}
                className="flex items-start gap-3 rounded-[14px] border border-[var(--line)] bg-[var(--bg-card)] p-4"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <div className="text-[13px] font-bold">{repo.name}</div>
                  <div className="flex items-center gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-[var(--text-muted)]">
                    <span className="shrink-0"><Folder size={11} /></span>
                    {repo.localPath}
                  </div>
                  {repo.url && (
                    <div className="flex items-center gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-[var(--text-muted)]">
                      <RemoteIcon url={repo.url} size={11} />
                      {repo.url}
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void onUpdate({ ...workspace, repos: workspace.repos.filter((repoItem) => repoItem.localPath !== repo.localPath) })}
                  className="mt-0.5 h-6 px-1.5 text-[var(--danger)]"
                  title={t('repoRemove')}
                >
                  ✕
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function CloneForm({
  onCloned,
  onCancel,
}: {
  onCloned(repoPath: string, repoName: string, remoteUrl: string): Promise<void>;
  onCancel(): void;
}) {
  const { t } = useTranslation('settings');
  const [url, setUrl] = useState('');
  const [destDir, setDestDir] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'cloning' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleClone() {
    if (!url.trim() || !destDir) return;
    setStatus('cloning');
    setErrorMsg('');
    const result = await window.nakiros.gitClone(url.trim(), destDir);
    if (result.success) {
      setStatus('success');
      await onCloned(result.repoPath, result.repoName, url.trim());
    } else {
      setStatus('error');
      setErrorMsg(result.error ?? t('cloneError'));
    }
  }

  return (
    <Card className="mb-3 flex flex-col gap-3 rounded-[16px] border-[var(--line)] bg-[var(--bg-card)] p-5 shadow-none">
      <div>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          label="URL"
          placeholder={t('cloneUrlPlaceholder')}
          className="rounded-[12px] border-[var(--line)] bg-[var(--bg-soft)] px-3 py-2.5 text-[13px]"
          autoFocus
          disabled={status === 'cloning'}
        />
      </div>
      <div>
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
          {t('cloneDestLabel')}
        </span>
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              'flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs',
              destDir ? 'text-[var(--text)]' : 'text-[var(--text-muted)]',
            )}
          >
            {destDir ?? t('cloneDestNone')}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={async () => {
              const dir = await window.nakiros.selectDirectory();
              if (dir) setDestDir(dir);
            }}
            disabled={status === 'cloning'}
          >
            …
          </Button>
        </div>
      </div>
      {status === 'error' && (
        <p className="m-0 font-mono text-xs text-[var(--danger)]">{errorMsg}</p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          onClick={() => void handleClone()}
          disabled={!url.trim() || !destDir || status === 'cloning'}
          loading={status === 'cloning'}
        >
          {status === 'cloning' ? t('cloneInProgress') : t('cloneAction')}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={status === 'cloning'}>
          {t('mcpCancel')}
        </Button>
      </div>
    </Card>
  );
}

function RemoteIcon({ url, size }: { url: string; size: number }) {
  if (url.includes('github')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="block shrink-0">
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
      </svg>
    );
  }
  if (url.includes('gitlab')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="block shrink-0">
        <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51a.42.42 0 01.82 0l2.44 7.49h8.1l2.44-7.51a.42.42 0 01.82 0l2.44 7.51 1.17 3.64a.84.84 0 01-.35.9z" />
      </svg>
    );
  }
  return <Link2 size={size} className="block shrink-0" />;
}
