import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, X } from 'lucide-react';
import clsx from 'clsx';
import type {
  BundledSkillConflict,
  BundledSkillConflictResolution,
} from '@nakiros/shared';
import SkillDiffView, {
  type SkillDiffFileContent,
  type SkillDiffFileEntry,
  type SkillDiffLabels,
} from '../components/diff/SkillDiffView';

interface Props {
  conflicts: BundledSkillConflict[];
  onClose(): void;
  onResolved(skillName: string): void;
}

export default function BundledSkillConflictsView({ conflicts, onClose, onResolved }: Props) {
  const { t } = useTranslation('bundled-conflicts');
  const [activeSkill, setActiveSkill] = useState<string | null>(conflicts[0]?.skillName ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!activeSkill && conflicts[0]) setActiveSkill(conflicts[0].skillName);
  }, [conflicts, activeSkill]);

  const current = conflicts.find((c) => c.skillName === activeSkill) ?? null;

  const files: SkillDiffFileEntry[] = useMemo(() => {
    if (!current) return [];
    const all = new Set<string>([...current.userModifiedPaths, ...current.romChangedPaths]);
    return [...all].map((relativePath) => ({
      relativePath,
      inOriginal: current.romChangedPaths.includes(relativePath),
      inModified: current.userModifiedPaths.includes(relativePath),
    }));
  }, [current]);

  const fetchDiff = useCallback(
    async (relativePath: string): Promise<SkillDiffFileContent> => {
      if (!current) throw new Error('No active conflict');
      const payload = await window.nakiros.readBundledSkillConflictDiff(current.skillName, relativePath);
      return {
        originalContent: payload.romContent,
        modifiedContent: payload.liveContent,
        isBinary: payload.isBinary,
      };
    },
    [current],
  );

  async function resolve(resolution: BundledSkillConflictResolution) {
    if (!current) return;
    const skillName = current.skillName;
    setBusy(skillName);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[skillName];
      return next;
    });
    try {
      await window.nakiros.resolveBundledSkillConflict(skillName, resolution);
      onResolved(skillName);
      const remaining = conflicts.filter((c) => c.skillName !== skillName);
      setActiveSkill(remaining[0]?.skillName ?? null);
    } catch (err) {
      setErrors((prev) => ({ ...prev, [skillName]: (err as Error).message }));
    } finally {
      setBusy(null);
    }
  }

  if (conflicts.length === 0) return null;

  const labels: SkillDiffLabels = {
    filesPanelTitle: t('filesPanelTitle'),
    originalColumn: t('diffRom'),
    modifiedColumn: t('diffLive'),
    missingFile: t('diffMissing'),
    binaryNotice: t('diffBinary'),
    identicalNotice: t('diffIdentical'),
    loading: t('diffLoading'),
    errorTemplate: (message) => t('diffFailed', { message }),
    emptyState: t('diffPickFile'),
    sideOriginalOnly: t('side.rom'),
    sideModifiedOnly: t('side.user'),
    sideBoth: t('side.both'),
    addedLinesLabel: (count) => t('addedLines', { count }),
    removedLinesLabel: (count) => t('removedLines', { count }),
  };

  return (
    <div className="flex h-screen flex-col bg-[var(--bg)]">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--bg-soft)] px-4 py-2.5">
        <AlertTriangle size={16} className="text-amber-400" />
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-[var(--text-primary)]">{t('title')}</span>
          <span className="text-[11px] text-[var(--text-muted)]">{t('subtitle')}</span>
        </div>
        <span className="ml-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-amber-400">
          {t('count', { count: conflicts.length })}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onClose}
            title={t('closeHint')}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X size={12} />
            {t('close')}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Skills sidebar */}
        {conflicts.length > 1 && (
          <div className="flex w-[220px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--bg-soft)]">
            <div className="border-b border-[var(--line)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              {t('skillsPanelTitle')}
            </div>
            <div className="flex-1 overflow-y-auto">
              {conflicts.map((c) => {
                const active = c.skillName === activeSkill;
                const fileCount = new Set([...c.userModifiedPaths, ...c.romChangedPaths]).size;
                return (
                  <button
                    key={c.skillName}
                    onClick={() => setActiveSkill(c.skillName)}
                    className={clsx(
                      'flex w-full flex-col items-start gap-0.5 border-l-2 px-3 py-2 text-left',
                      active
                        ? 'border-l-[var(--primary)] bg-[var(--bg-card)]'
                        : 'border-l-transparent hover:bg-[var(--bg-muted)]',
                    )}
                  >
                    <span className="text-xs font-semibold text-[var(--text-primary)]">{c.skillName}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">{fileCount} files</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {current ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Skill header + actions */}
            <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-4 py-2.5">
              <code className="rounded bg-[var(--bg-muted)] px-1.5 py-0.5 text-xs font-semibold text-[var(--text-primary)]">
                {current.skillName}
              </code>
              <span className="rounded-full border border-[var(--line)] bg-[var(--bg-card)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                {current.previousVersion
                  ? t('versionRange', { from: current.previousVersion, to: current.currentVersion })
                  : t('versionInitial', { to: current.currentVersion })}
              </span>
              {current.overlappingPaths.length > 0 && (
                <span
                  className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400"
                  title={t('overlappingHint')}
                >
                  {t('overlapping')}
                </span>
              )}

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <ActionButton
                  tone="primary"
                  disabled={busy === current.skillName}
                  label={busy === current.skillName ? t('applying') : t('applyRom')}
                  description={t('applyRomDesc')}
                  onClick={() => void resolve('apply-rom')}
                />
                <ActionButton
                  tone="secondary"
                  disabled={busy === current.skillName}
                  label={t('keepMine')}
                  description={t('keepMineDesc')}
                  onClick={() => void resolve('keep-mine')}
                />
                <ActionButton
                  tone="secondary"
                  disabled={busy === current.skillName}
                  label={t('promoteMine')}
                  description={t('promoteMineDesc')}
                  onClick={() => void resolve('promote-mine')}
                />
              </div>
            </div>

            {errors[current.skillName] && (
              <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">
                {t('applyFailed', { message: errors[current.skillName] })}
              </div>
            )}

            <div className="flex-1 overflow-hidden">
              <SkillDiffView
                cacheScope={`conflict:${current.skillName}`}
                files={files}
                fetchDiff={fetchDiff}
                labels={labels}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--text-muted)]">
            {t('allResolved')}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  description,
  onClick,
  disabled,
  tone,
}: {
  label: string;
  description: string;
  onClick(): void;
  disabled: boolean;
  tone: 'primary' | 'secondary';
}) {
  const toneClass =
    tone === 'primary'
      ? 'border-[var(--primary)] bg-[var(--primary)] text-white hover:opacity-90'
      : 'border-[var(--line)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:border-[var(--primary)] hover:text-[var(--primary)]';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={description}
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${toneClass}`}
    >
      {label}
    </button>
  );
}
