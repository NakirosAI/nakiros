import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlaskConical, Loader2, Plus, Search, ShieldCheck, Sparkles } from 'lucide-react';
import type { AgentRun, Project, Skill } from '@nakiros/shared';
import SkillCard, { extractSkillDescription } from '../components/skill/SkillCard';
import { launchCreate, type OpenRunTabCallback } from '../lib/run-launcher';
import { useActiveAgentRuns } from '../hooks/useAgentRun';

interface Props {
  /** Project whose `.claude/skills/` directory is listed. */
  project: Project;
  /** Activated when the user picks a skill — opens the detail view. */
  onOpenSkill(skillName: string): void;
  /** Pushes a fresh run tab once a create run has started or to re-enter
   *  the in-progress draft of an active create run. */
  onOpenRunTab: OpenRunTabCallback;
}

/**
 * New-design Skills list. Renders production skills (`.claude/skills/`)
 * alongside any in-progress create run for this project (sandbox under
 * `~/.nakiros/tmp-skills/<runId>/`). Drafts in progress show a spinner
 * badge and re-open their RunScreen on click; production cards keep
 * their normal score/iter/eval summary.
 *
 * "Nouveau skill" opens a name modal that refuses duplicates against
 * production skills or in-progress drafts of this project.
 */
export default function SkillsScreen({ project, onOpenSkill, onOpenRunTab }: Props) {
  const { t } = useTranslation('skills');
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const [createNameInput, setCreateNameInput] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Create runs for this project — surfaced inline as draft cards so the
  // user can re-enter / clean up runs without leaving Skills. We include
  // `cancelled` and `failed` runs because a daemon kill mid-run leaves the
  // sandbox on disk in `~/.nakiros/tmp-skills/<runId>/` with the run mapped
  // to `cancelled` (no resumable sessionId). Without this the draft would
  // be invisible even though its files survived. `done` runs DO sync-back
  // into `.claude/skills/<name>/` and surface as production skills, so we
  // exclude them here.
  const activeRuns = useActiveAgentRuns();
  const inProgressDrafts = useMemo(() => {
    return activeRuns.filter((r): r is InProgressDraft => {
      if (r.kind !== 'create') return false;
      if (r.status === 'done') return false;
      const target = r.target;
      if (!target || target.type !== 'skill') return false;
      if (target.scope !== 'project') return false;
      return target.projectId === project.id;
    });
  }, [activeRuns, project.id]);

  // Re-fetch the listing whenever the count of active create runs for this
  // project changes (a new draft started, or one terminated and synced
  // back into `.claude/skills/`).
  const inProgressCount = inProgressDrafts.length;

  useEffect(() => {
    let cancelled = false;
    setError(null);
    window.nakiros
      .listProjectSkills(project.id)
      .then((list) => {
        if (cancelled) return;
        setSkills(list);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, inProgressCount]);

  const filteredSkills = useMemo(() => {
    if (!skills) return null;
    if (!query.trim()) return skills;
    const q = query.toLowerCase();
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        extractSkillDescription(s.content).toLowerCase().includes(q),
    );
  }, [skills, query]);

  const filteredDrafts = useMemo(() => {
    if (!query.trim()) return inProgressDrafts;
    const q = query.toLowerCase();
    return inProgressDrafts.filter((d) => d.target.skillName.toLowerCase().includes(q));
  }, [inProgressDrafts, query]);

  function openCreateModal() {
    if (creating) return;
    setCreateError(null);
    setCreateNameInput('');
  }

  async function submitCreateName() {
    if (creating || createNameInput == null) return;
    const name = createNameInput.trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      setCreateError(
        t('modal.nameValidationError', {
          defaultValue: 'Use lowercase letters, digits and dashes (must start with a letter).',
        }),
      );
      return;
    }
    if ((skills ?? []).some((s) => s.name === name)) {
      setCreateError(
        t('modal.nameTakenProd', {
          defaultValue: 'A skill of this name already exists in production.',
        }),
      );
      return;
    }
    if (inProgressDrafts.some((d) => d.target.skillName === name)) {
      setCreateError(
        t('modal.nameTakenDraft', {
          defaultValue:
            'A draft of this name is already in progress — open it from the listing to resume.',
        }),
      );
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await launchCreate(
        { scope: 'project', projectId: project.id, skillName: name },
        onOpenRunTab,
      );
      setCreateNameInput(null);
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const totalCount = (skills?.length ?? 0) + inProgressDrafts.length;
  const hasAnything =
    (filteredSkills && filteredSkills.length > 0) ||
    (filteredDrafts && filteredDrafts.length > 0);

  return (
    <div className="flex flex-1 flex-col overflow-hidden font-n-sans">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-4 border-b border-n-border-subtle px-7 py-3.5">
        <h2 className="m-0 text-[15px] font-semibold text-n-fg">
          {t('skillsTitle', { defaultValue: 'Skills' })}{' '}
          {skills && (
            <span className="font-n-mono text-[12px] font-normal text-n-faint">
              · {totalCount}
              {inProgressDrafts.length > 0 && (
                <>
                  {' '}
                  ·{' '}
                  <span className="text-n-watch">
                    {inProgressDrafts.length} draft{inProgressDrafts.length > 1 ? 's' : ''} en cours
                  </span>
                </>
              )}
            </span>
          )}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          <ToolbarButton icon={<ShieldCheck size={11} strokeWidth={2} />} label="Audit all" disabled />
          <ToolbarButton icon={<FlaskConical size={11} strokeWidth={2} />} label="Run evals" disabled />
          <ToolbarButton
            icon={creating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} strokeWidth={2.25} />}
            label={creating ? t('creating', { defaultValue: 'Création…' }) : t('newSkill', { defaultValue: 'Nouveau skill' })}
            onClick={openCreateModal}
            disabled={creating}
            primary
          />
        </div>
      </header>

      {/* Search row */}
      <div className="flex items-center gap-3 border-b border-n-border-subtle px-7 py-2.5">
        <div className="relative">
          <Search
            size={13}
            strokeWidth={2}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-n-subtle"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder', { defaultValue: 'Search skills…' })}
            className="h-7 w-64 rounded-n-sm border border-n-border-subtle bg-n-sunken pl-7 pr-2.5 font-n-mono text-[12px] text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-7 py-5">
        {error && (
          <div className="rounded-n-md border border-n-critical bg-n-critical-soft px-4 py-3 font-n-mono text-[12px] text-n-critical">
            {error}
          </div>
        )}

        {!error && skills === null && (
          <div className="font-n-mono text-[12px] text-n-muted">
            {t('common:loading', { defaultValue: 'Loading…' })}
          </div>
        )}

        {!error && skills !== null && (
          <>
            {!hasAnything && (
              <div className="rounded-n-md border border-dashed border-n-border-default bg-n-surface p-10 text-center font-n-mono text-[12.5px] text-n-muted">
                {query
                  ? t('noMatch', { defaultValue: 'No skill matches your search.' })
                  : t('emptyState', { defaultValue: 'This project has no skills yet.' })}
              </div>
            )}
            {hasAnything && (
              <div
                className="grid gap-2.5"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))' }}
              >
                {filteredDrafts.map((draft) => (
                  <InProgressDraftCard
                    key={draft.id}
                    draft={draft}
                    onOpen={() =>
                      onOpenRunTab({
                        runId: draft.id,
                        runKind: 'create',
                        label: `Create · ${draft.target.skillName}`,
                      })
                    }
                  />
                ))}
                {filteredSkills?.map((skill) => (
                  <SkillCard key={skill.name} skill={skill} onOpen={() => onOpenSkill(skill.name)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {createNameInput != null && (
        <CreateSkillModal
          value={createNameInput}
          error={createError}
          submitting={creating}
          onChange={(v) => {
            setCreateNameInput(v);
            if (createError) setCreateError(null);
          }}
          onCancel={() => {
            if (creating) return;
            setCreateNameInput(null);
          }}
          onSubmit={() => void submitCreateName()}
        />
      )}
    </div>
  );
}

// ── In-progress draft card ─────────────────────────────────────────────────

type InProgressDraft = AgentRun & {
  kind: 'create';
  target: { type: 'skill'; scope: 'project'; projectId: string; skillName: string };
};

function InProgressDraftCard({
  draft,
  onOpen,
}: {
  draft: InProgressDraft;
  onOpen(): void;
}) {
  const { t } = useTranslation('skills');
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex flex-col gap-0 rounded-n-lg border border-n-watch-line bg-n-watch-soft/40 p-4 text-left transition-colors hover:border-n-watch"
    >
      <div className="flex items-start justify-between gap-3.5">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <Sparkles size={13} strokeWidth={2.25} className="flex-shrink-0 text-n-watch" />
            <strong className="truncate font-n-mono text-[13.5px] font-medium text-n-fg">
              {draft.target.skillName}
            </strong>
            <span className="flex-shrink-0 inline-flex items-center gap-1 rounded-n-sm border border-n-watch-line bg-n-watch-soft px-1.5 py-px font-n-mono text-[9.5px] uppercase tracking-wide text-n-watch">
              <Loader2 size={9} className="animate-spin" />
              {t('draftBadge', { defaultValue: 'Draft · en cours' })}
            </span>
          </div>
          <p className="m-0 text-[12px] leading-relaxed text-n-muted">
            {t('draftInProgressHint', {
              defaultValue: 'Création en cours dans la sandbox. Clique pour reprendre.',
            })}
          </p>
        </div>
      </div>

      <div className="mt-3.5 flex items-center gap-2.5 border-t border-n-watch-line/40 pt-3 font-n-mono text-[11px] text-n-muted">
        <span className="text-n-faint">run id</span>{' '}
        <span className="truncate" title={draft.id}>
          {draft.id}
        </span>
      </div>
    </button>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────

function CreateSkillModal({
  value,
  error,
  submitting,
  onChange,
  onCancel,
  onSubmit,
}: {
  value: string;
  error: string | null;
  submitting: boolean;
  onChange(next: string): void;
  onCancel(): void;
  onSubmit(): void;
}) {
  const { t } = useTranslation('skills');
  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="w-[440px] rounded-n-lg border border-n-border-default bg-n-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="m-0 mb-2 text-[14px] font-semibold text-n-fg">
          {t('modal.title', { defaultValue: 'Nouveau skill' })}
        </h3>
        <p className="m-0 mb-4 text-[12px] text-n-muted">
          {t('modal.hint', {
            defaultValue:
              'Choisis un nom court (lettres, chiffres, tirets). L\'agent travaillera dans une sandbox isolée puis Apply & deploy le posera dans .claude/skills/.',
          })}
        </p>
        <input
          type="text"
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit();
            else if (e.key === 'Escape') onCancel();
          }}
          placeholder={t('modal.placeholder', { defaultValue: 'mon-nouveau-skill' })}
          disabled={submitting}
          className="w-full rounded-n-sm border border-n-border-subtle bg-n-sunken px-3 py-2 font-n-mono text-[12.5px] text-n-fg placeholder:text-n-faint outline-none focus:border-n-accent-line disabled:opacity-50"
        />
        {error && <p className="m-0 mt-2 text-[11.5px] text-n-critical">{error}</p>}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-n-sm px-3 py-1.5 font-n-mono text-[11.5px] text-n-muted hover:text-n-fg disabled:opacity-50"
          >
            {t('modal.cancel', { defaultValue: 'Annuler' })}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || !value.trim()}
            className="inline-flex items-center gap-1.5 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-3 py-1.5 font-n-mono text-[11.5px] text-n-accent hover:bg-n-accent-line hover:text-n-canvas disabled:opacity-50 disabled:hover:bg-n-accent-soft disabled:hover:text-n-accent"
          >
            {submitting && <Loader2 size={11} className="animate-spin" />}
            {submitting
              ? t('modal.creating', { defaultValue: 'Création…' })
              : t('modal.create', { defaultValue: 'Créer' })}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({
  icon,
  label,
  primary = false,
  onClick,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const isDisabled = disabled || !onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className={
        'inline-flex h-7 items-center gap-1.5 rounded-n-sm border px-2.5 font-n-mono text-[11.5px] transition-colors ' +
        (primary
          ? 'border-n-accent-line bg-n-accent-soft text-n-accent hover:bg-n-accent-line hover:text-n-canvas disabled:opacity-60 disabled:hover:bg-n-accent-soft disabled:hover:text-n-accent'
          : 'border-n-border-subtle bg-transparent text-n-muted hover:border-n-border-default hover:text-n-fg disabled:opacity-60')
      }
    >
      {icon}
      {label}
    </button>
  );
}
