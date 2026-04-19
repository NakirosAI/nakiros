import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpCircle, ExternalLink, X } from 'lucide-react';
import clsx from 'clsx';
import { useVersionInfo } from '../hooks/useVersionInfo';

interface Props {
  /**
   * `compact` — rounded pill for the Dashboard topbar.
   * `inline` — bare text, no border/background. Meant as a discreet informational
   *            marker (e.g. top-right of the Home screen). Still clickable when
   *            an update is available so the user can open the upgrade modal.
   */
  variant?: 'compact' | 'inline';
}

export default function VersionIndicator({ variant = 'compact' }: Props) {
  const { t } = useTranslation('version');
  const info = useVersionInfo();
  const [modalOpen, setModalOpen] = useState(false);

  if (!info) return null;

  const tooltip = info.updateAvailable
    ? t('updateAvailableTooltip', { latest: info.latest ?? '?', current: info.current })
    : info.latest == null
      ? t('devTooltip')
      : t('upToDateTooltip', { current: info.current });

  const label = info.updateAvailable
    ? `v${info.current} → v${info.latest}`
    : t('currentVersion', { version: info.current });

  if (variant === 'inline') {
    return (
      <>
        <button
          type="button"
          onClick={() => info.updateAvailable && setModalOpen(true)}
          disabled={!info.updateAvailable}
          title={tooltip}
          className={clsx(
            'inline-flex items-center gap-1 border-0 bg-transparent p-0 font-mono text-[10px] leading-none transition-colors',
            info.updateAvailable
              ? 'cursor-pointer text-amber-400 hover:text-amber-300'
              : 'cursor-default text-[var(--text-muted)]/60',
          )}
        >
          {info.updateAvailable && <ArrowUpCircle size={10} />}
          {label}
        </button>

        {modalOpen && info.updateAvailable && (
          <UpdateModal current={info.current} latest={info.latest!} onClose={() => setModalOpen(false)} />
        )}
      </>
    );
  }

  const tone = info.updateAvailable
    ? 'border-amber-400 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
    : 'border-[var(--line)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)]';

  return (
    <>
      <button
        onClick={() => info.updateAvailable && setModalOpen(true)}
        disabled={!info.updateAvailable}
        title={tooltip}
        className={clsx(
          'flex items-center gap-1.5 rounded-full border px-2 py-1 font-mono text-[10px] font-medium transition-colors',
          tone,
          !info.updateAvailable && 'cursor-default',
        )}
      >
        {info.updateAvailable && <ArrowUpCircle size={10} />}
        {label}
      </button>

      {modalOpen && info.updateAvailable && (
        <UpdateModal current={info.current} latest={info.latest!} onClose={() => setModalOpen(false)} />
      )}
    </>
  );
}

function UpdateModal({
  current,
  latest,
  onClose,
}: {
  current: string;
  latest: string;
  onClose(): void;
}) {
  const { t } = useTranslation('version');
  const npmUrl = 'https://www.npmjs.com/package/@nakirosai/nakiros';

  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/60 p-6">
      <div className="w-full max-w-[420px] rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <ArrowUpCircle size={18} className="text-amber-400" />
            <h2 className="m-0 text-base font-bold text-[var(--text-primary)]">
              {t('updateAvailable')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
            aria-label={t('dismiss')}
          >
            <X size={14} />
          </button>
        </div>

        <p className="m-0 mb-3 text-sm text-[var(--text-primary)]">
          <span className="font-mono text-[var(--text-muted)]">v{current}</span>
          <span className="mx-2 text-[var(--text-muted)]">→</span>
          <span className="font-mono font-semibold text-amber-400">v{latest}</span>
        </p>

        <pre className="m-0 mb-4 overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--bg)] p-3 text-[11px] text-[var(--text-primary)]">
          npm install -g @nakirosai/nakiros@latest
        </pre>

        <p className="m-0 mb-4 text-xs text-[var(--text-muted)]">{t('updateInstructions')}</p>

        <div className="flex items-center justify-end gap-2">
          <a
            href={npmUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <ExternalLink size={12} />
            {t('openNpm')}
          </a>
          <button
            onClick={onClose}
            className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            {t('dismiss')}
          </button>
        </div>
      </div>
    </div>
  );
}
