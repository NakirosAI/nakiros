import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpCircle, ExternalLink, X } from 'lucide-react';
import clsx from 'clsx';
import { useVersionInfo } from '../hooks/useVersionInfo';
import { MarkdownViewer } from './ui/MarkdownViewer';

interface Props {
  /**
   * `compact` — rounded pill for the legacy Dashboard topbar.
   * `inline`  — bare text, no border/background. Meant as a discreet informational
   *             marker (e.g. top-right of the Home screen). Still clickable when
   *             an update is available so the user can open the upgrade modal.
   * `topbar`  — new-design shell topbar variant. Mirrors the mockup
   *             (`apps/Nakiros-new-design/shell.jsx`): a tiny `font-n-mono`
   *             label in `n-faint`, sitting right of the RunDock pill. Promotes
   *             to an amber upgrade affordance when a newer npm release exists.
   */
  variant?: 'compact' | 'inline' | 'topbar';
}

const LS_LAST_SEEN_KEY = 'nakiros:lastSeenVersion';

/**
 * Persist the given version as the last seen in localStorage.
 * Wrapped in try/catch to be safe in private-browsing contexts.
 */
function persistLastSeen(version: string): void {
  try {
    localStorage.setItem(LS_LAST_SEEN_KEY, version);
  } catch {
    // localStorage may throw in private-browsing edge cases — best-effort
  }
}

/**
 * Extract the markdown section for a given version from a Keep-a-Changelog
 * formatted document. A section starts at `## [VERSION]` and ends at the
 * next `## [` or end of file. Returns empty string if not found.
 */
function extractVersionSection(markdown: string, version: string): string {
  const escaped = version.replace(/\./g, '\\.');
  const headerRe = new RegExp(`^##\\s*\\[${escaped}\\]`, 'm');
  const startMatch = markdown.match(headerRe);
  if (!startMatch || startMatch.index == null) return '';
  const start = startMatch.index;
  const rest = markdown.slice(start + startMatch[0].length);
  const endMatch = rest.match(/^##\s*\[/m);
  const end =
    endMatch?.index != null
      ? start + startMatch[0].length + endMatch.index
      : markdown.length;
  return markdown.slice(start, end).trim();
}

/**
 * Tiny pill / inline marker showing the running CLI version and, when an
 * update is available on npm, an actionable upgrade flow (modal with the
 * `npm install -g` command). When up-to-date, click opens the ChangelogModal.
 * Hides itself entirely until the `useVersionInfo` hook resolves.
 *
 * Auto-shows ChangelogModal (or UpdateModal) once per version based on
 * `localStorage.nakiros:lastSeenVersion`.
 */
export default function VersionIndicator({ variant = 'compact' }: Props) {
  const { t } = useTranslation('version');
  const info = useVersionInfo();
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [changelogModalOpen, setChangelogModalOpen] = useState(false);

  // Auto-show once per version: compare running version to last seen.
  // UpdateModal takes priority if an update is also available.
  useEffect(() => {
    if (!info) return;
    const lastSeen = localStorage.getItem(LS_LAST_SEEN_KEY);
    if (lastSeen === info.current) return; // already shown for this version
    if (info.updateAvailable) {
      setUpdateModalOpen(true);
    } else {
      setChangelogModalOpen(true);
    }
  }, [info]);

  if (!info) return null;

  const tooltip = info.updateAvailable
    ? t('updateAvailableTooltip', { latest: info.latest ?? '?', current: info.current })
    : info.latest == null
      ? t('devTooltip')
      : t('upToDateTooltip', { current: info.current });

  const label = info.updateAvailable
    ? `v${info.current} → v${info.latest}`
    : t('currentVersion', { version: info.current });

  function handleClick() {
    if (info!.updateAvailable) {
      setUpdateModalOpen(true);
    } else {
      setChangelogModalOpen(true);
    }
  }

  function handleCloseUpdateModal() {
    setUpdateModalOpen(false);
    persistLastSeen(info!.current);
  }

  function handleCloseChangelogModal() {
    setChangelogModalOpen(false);
    persistLastSeen(info!.current);
  }

  if (variant === 'topbar') {
    return (
      <>
        <button
          type="button"
          onClick={handleClick}
          title={tooltip}
          className={clsx(
            'inline-flex items-center gap-1 border-0 bg-transparent p-0 font-n-mono text-[11px] leading-none transition-colors',
            info.updateAvailable
              ? 'cursor-pointer text-amber-400 hover:text-amber-300'
              : 'cursor-pointer text-n-faint hover:text-n-subtle',
          )}
        >
          {info.updateAvailable && <ArrowUpCircle size={10} />}
          {label}
        </button>

        {updateModalOpen && info.updateAvailable && (
          <UpdateModal
            current={info.current}
            latest={info.latest!}
            onClose={handleCloseUpdateModal}
          />
        )}
        {changelogModalOpen && (
          <ChangelogModal version={info.current} onClose={handleCloseChangelogModal} />
        )}
      </>
    );
  }

  if (variant === 'inline') {
    return (
      <>
        <button
          type="button"
          onClick={handleClick}
          title={tooltip}
          className={clsx(
            'inline-flex items-center gap-1 border-0 bg-transparent p-0 font-mono text-[10px] leading-none transition-colors',
            info.updateAvailable
              ? 'cursor-pointer text-amber-400 hover:text-amber-300'
              : 'cursor-pointer text-[var(--text-muted)]/60 hover:text-[var(--text-muted)]',
          )}
        >
          {info.updateAvailable && <ArrowUpCircle size={10} />}
          {label}
        </button>

        {updateModalOpen && info.updateAvailable && (
          <UpdateModal
            current={info.current}
            latest={info.latest!}
            onClose={handleCloseUpdateModal}
          />
        )}
        {changelogModalOpen && (
          <ChangelogModal version={info.current} onClose={handleCloseChangelogModal} />
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
        onClick={handleClick}
        title={tooltip}
        className={clsx(
          'flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-1 font-mono text-[10px] font-medium transition-colors',
          tone,
        )}
      >
        {info.updateAvailable && <ArrowUpCircle size={10} />}
        {label}
      </button>

      {updateModalOpen && info.updateAvailable && (
        <UpdateModal
          current={info.current}
          latest={info.latest!}
          onClose={handleCloseUpdateModal}
        />
      )}
      {changelogModalOpen && (
        <ChangelogModal version={info.current} onClose={handleCloseChangelogModal} />
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

function ChangelogModal({
  version,
  onClose,
}: {
  version: string;
  onClose(): void;
}) {
  const { t } = useTranslation('version');
  const [markdown, setMarkdown] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.nakiros
      .getChangelog()
      .then((res) => {
        if (!cancelled) {
          setMarkdown(extractVersionSection(res.markdown, version) || res.markdown);
        }
      })
      .catch(() => {
        if (!cancelled) setMarkdown('');
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  return (
    <div
      className="fixed inset-0 z-[900] flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[640px] max-h-[80vh] overflow-y-auto rounded-2xl border border-n-line bg-n-bg p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="m-0 text-base font-bold text-n-text">
            {t('changelogTitle', { version })}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-n-fg-muted hover:bg-n-bg-soft hover:text-n-text"
            aria-label={t('dismiss')}
          >
            <X size={14} />
          </button>
        </div>

        {markdown === null ? (
          <p className="text-sm text-n-fg-muted">{t('changelogLoading')}</p>
        ) : markdown === '' ? (
          <p className="text-sm text-n-fg-muted">{t('changelogEmpty')}</p>
        ) : (
          <MarkdownViewer content={markdown} />
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-n-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            {t('changelogGotIt')}
          </button>
        </div>
      </div>
    </div>
  );
}
