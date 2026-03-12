import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { StoredWorkspace } from '@nakiros/shared';
import { Button, Card, Input } from '../ui';

interface SettingsDangerProps {
  workspace: StoredWorkspace;
  onDeleted?(): void;
}

export function SettingsDanger({ workspace, onDeleted }: SettingsDangerProps) {
  const { t } = useTranslation('settings');
  const [confirm, setConfirm] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ deleted: number; errors: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleReset() {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const r = await window.nakiros.resetWorkspace(workspace);
      await window.nakiros.deleteWorkspace(workspace.id);
      setConfirm(false);
      setInputValue('');
      setResult({ deleted: r.deletedPaths.length, errors: r.errors.length });
      onDeleted?.();
    } catch (err) {
      setError((err as Error)?.message ?? t('deleteWorkspaceError'));
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card padding="md" className="rounded-[10px] border-[var(--danger)] bg-[var(--bg-soft)]">
      <h3 className="mb-2.5 mt-0 text-[13px] font-bold text-[var(--danger)]">{t('deleteWorkspaceTitle')}</h3>
      <p className="mb-3 mt-0 text-xs text-[var(--text-muted)]">
        {t('deleteWorkspaceDesc')}
        {' '}<code className="text-[11px]">_nakiros/</code>.
        <br />
        {t('deleteWorkspaceSafeFiles')} <code className="text-[11px]">CLAUDE.md</code>, <code className="text-[11px]">.cursorrules</code> {t('deleteWorkspaceSafeFilesAnd')} <code className="text-[11px]">llms.txt</code> {t('deleteWorkspaceSafeFilesEnd')}
      </p>

      {!confirm ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => { setConfirm(true); setResult(null); }}
          className="h-8 rounded-[10px] border-[var(--danger)] bg-transparent px-3 text-[13px] font-bold text-[var(--danger)] hover:border-[var(--danger)] hover:bg-transparent hover:text-[var(--danger)]"
        >
          {t('deleteWorkspace')}
        </Button>
      ) : (
        <div className="flex flex-col gap-2.5">
          <p className="m-0 text-[13px] font-semibold text-[var(--danger)]">
            {t('deleteWorkspaceConfirm', { count: workspace.repos.length })}
          </p>
          <p className="m-0 text-xs text-[var(--text-muted)]">
            {t('deleteWorkspaceTypePrefix')} <strong>{workspace.name}</strong> {t('deleteWorkspaceTypeSuffix')}
          </p>
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={workspace.name}
            disabled={running}
            className="rounded-[10px] border-[var(--line)] bg-[var(--bg-card)] px-2.5 py-2 text-[13px]"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => void handleReset()}
              disabled={running || inputValue !== workspace.name}
              loading={running}
              className="h-8 rounded-[10px] border-[var(--danger)] bg-[var(--danger)] px-3 text-[13px] font-bold text-white hover:bg-[var(--danger)]"
            >
              {running ? t('deleteWorkspaceRunning') : t('mcpDelete')}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => { setConfirm(false); setInputValue(''); }} disabled={running}>
              {t('mcpCancel')}
            </Button>
          </div>
        </div>
      )}

      {result && (
        <p className={clsx('mb-0 mt-2.5 text-xs', result.errors > 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]')}>
          {result.errors > 0
            ? t('deleteWorkspaceResultErrors', { errors: result.errors, deleted: result.deleted })
            : t('deleteWorkspaceResultSuccess', { deleted: result.deleted })}
        </p>
      )}

      {error && (
        <p className="mb-0 mt-2.5 text-xs text-[var(--danger)]">
          {error}
        </p>
      )}
    </Card>
  );
}
