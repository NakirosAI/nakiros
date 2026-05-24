import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DriftHookDiff, DriftHookStatus } from '@nakiros/shared';

/**
 * Settings panel for the opt-in drift-detection hook pair (Stop +
 * UserPromptSubmit). Before installation, the user can preview the exact
 * `~/.claude/settings.json` diff so there are no hidden mutations.
 *
 * Once enabled, the panel shows the materialised script paths for
 * transparency and a "Disable" button to remove the hooks.
 *
 * Conventions: native `<button>` + n-* tokens (no `components/ui/Button`),
 * Tailwind-first, i18n via the `drift-detection` namespace.
 */

const DIFF_INITIAL: DriftHookDiff = {
  settingsPath: '',
  exists: false,
  current: '',
  next: '',
  scriptPaths: { stop: '', userPromptSubmit: '' },
};

export default function DriftDetectionPanel() {
  const { t } = useTranslation('drift-detection');
  const [status, setStatus] = useState<DriftHookStatus | null>(null);
  const [diff, setDiff] = useState<DriftHookDiff>(DIFF_INITIAL);
  const [diffOpen, setDiffOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const next = await window.nakiros.getDriftHookStatus();
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const openDiff = async () => {
    setError(null);
    try {
      const next = await window.nakiros.getDriftHookDiff();
      setDiff(next);
      setDiffOpen(true);
    } catch (err) {
      setError(t('errorLoadDiffFailed', { message: err instanceof Error ? err.message : String(err) }));
    }
  };

  const confirmInstall = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.nakiros.installDriftHook();
      setStatus(result);
      setDiffOpen(false);
    } catch (err) {
      setError(t('errorInstallFailed', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  };

  const handleUninstall = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.nakiros.uninstallDriftHook();
      setStatus(result);
    } catch (err) {
      setError(t('errorUninstallFailed', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  };

  const installed = status?.installed === true;
  const stateDot = installed ? 'bg-n-accent-strong' : 'bg-n-border-default';
  const stateLabel = installed ? t('statusInstalled') : t('statusNotInstalled');

  return (
    <div className="mb-2 rounded-n-lg border border-n-border-subtle bg-n-surface px-4 py-3 shadow-n-card">
      <div className="flex items-start gap-3">
        <span className="flex-1 text-[13px] text-n-fg">
          <span className="font-medium">{t('title')}</span>
          <span className="mt-1 block text-[12px] text-n-muted">{t('subtitle')}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-n-sm border border-n-border-subtle bg-n-raised px-2 py-1 font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-muted">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${stateDot}`} />
          {stateLabel}
        </span>
      </div>

      {error && (
        <div className="mt-3 rounded-n-sm border border-red-700 bg-red-950 px-3 py-2 text-[12px] text-red-200">
          {error}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {!installed && (
          <button
            type="button"
            onClick={() => void openDiff()}
            disabled={busy}
            className="inline-flex h-7 items-center rounded-n-sm border border-n-accent-line bg-n-accent-soft px-2.5 font-n-mono text-[11.5px] text-n-accent-strong transition-colors hover:bg-n-accent-line disabled:opacity-50"
          >
            {t('enableButton')}
          </button>
        )}
        {installed && (
          <button
            type="button"
            onClick={() => void handleUninstall()}
            disabled={busy}
            className="inline-flex h-7 items-center rounded-n-sm border border-n-border-default bg-n-raised px-2.5 font-n-mono text-[11.5px] text-n-fg transition-colors hover:bg-n-canvas disabled:opacity-50"
          >
            {t('disableButton')}
          </button>
        )}
      </div>

      {installed && status && (
        <PathsSection status={status} />
      )}

      {diffOpen && (
        <DriftDiffModal
          diff={diff}
          busy={busy}
          onCancel={() => setDiffOpen(false)}
          onConfirm={() => void confirmInstall()}
        />
      )}
    </div>
  );
}

function PathsSection({ status }: { status: DriftHookStatus }) {
  const { t } = useTranslation('drift-detection');
  return (
    <div className="mt-4 border-t border-n-border-subtle pt-3">
      <div className="font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-subtle">
        {t('pathsHeading')}
      </div>
      <div className="mt-2 flex flex-col gap-1">
        <PathRow label={t('pathStopLabel')} value={status.scriptPaths.stop} />
        <PathRow label={t('pathUserPromptLabel')} value={status.scriptPaths.userPromptSubmit} />
        <PathRow label={t('pathSettingsLabel')} value={status.settingsPath} />
      </div>
    </div>
  );
}

function PathRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-0.5">
      <span className="w-44 shrink-0 font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
        {label}
      </span>
      <span className="flex-1 break-all font-n-mono text-[11px] text-n-muted">{value}</span>
    </div>
  );
}

interface DriftDiffModalProps {
  diff: DriftHookDiff;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function DriftDiffModal({ diff, busy, onCancel, onConfirm }: DriftDiffModalProps) {
  const { t } = useTranslation('drift-detection');
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-[860px] flex-col overflow-hidden rounded-n-lg border border-n-border-default bg-n-canvas shadow-n-card"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-n-border-subtle bg-n-surface px-5 py-3">
          <h2 className="m-0 text-[14.5px] font-medium text-n-fg">{t('diffTitle')}</h2>
          <p className="mt-1 mb-0 text-[12px] text-n-muted">{t('diffDescription')}</p>
        </header>

        <div className="flex-1 overflow-auto px-5 py-4">
          <DiffField label={t('diffPathLabel')} value={diff.settingsPath} />
          <DiffField label={t('diffScriptStopLabel')} value={diff.scriptPaths.stop} />
          <DiffField label={t('diffScriptUserPromptLabel')} value={diff.scriptPaths.userPromptSubmit} />

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <DiffPane
              title={t('diffBeforeLabel')}
              content={diff.exists ? diff.current : t('diffNotExistsLabel')}
              tone="neutral"
            />
            <DiffPane title={t('diffAfterLabel')} content={diff.next} tone="accent" />
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-n-border-subtle bg-n-surface px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-7 items-center rounded-n-sm border border-n-border-default bg-n-raised px-3 font-n-mono text-[11.5px] text-n-fg hover:bg-n-canvas disabled:opacity-50"
          >
            {t('diffCancelButton')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex h-7 items-center rounded-n-sm border border-n-accent-line bg-n-accent-soft px-3 font-n-mono text-[11.5px] text-n-accent-strong hover:bg-n-accent-line disabled:opacity-50"
          >
            {t('diffConfirmButton')}
          </button>
        </footer>
      </div>
    </div>
  );
}

function DiffField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-40 shrink-0 font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
        {label}
      </span>
      <span className="flex-1 break-all font-n-mono text-[11.5px] text-n-muted">{value}</span>
    </div>
  );
}

function DiffPane({
  title,
  content,
  tone,
}: {
  title: string;
  content: string;
  tone: 'neutral' | 'accent';
}) {
  const border = tone === 'accent' ? 'border-n-accent-line' : 'border-n-border-subtle';
  return (
    <div className={`overflow-hidden rounded-n-sm border ${border} bg-n-raised`}>
      <div className="border-b border-n-border-subtle bg-n-surface px-3 py-1.5 font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
        {title}
      </div>
      <pre className="m-0 max-h-[40vh] overflow-auto whitespace-pre-wrap break-all px-3 py-3 font-n-mono text-[11.5px] leading-[1.55] text-n-muted">
        {content}
      </pre>
    </div>
  );
}
