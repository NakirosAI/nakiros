import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronRight, ChevronDown, File, Folder, Loader2, Play, Plus, Save, Search, Sparkles, CheckCircle, Wrench, XCircle, FlaskConical } from 'lucide-react';
import clsx from 'clsx';
import type { AuditRun, Project, Skill, SkillFileEntry, SkillEvalGrading, SkillEvalGradingRun, SkillScope } from '@nakiros/shared';
import type { TFunction } from 'i18next';
import { Checkbox, MarkdownViewer } from '../components/ui';
import { isImagePath } from '../utils/file-types';
import EvalRunsView from './EvalRunsView';
import AuditView from './AuditView';
import FixView from './FixView';
import SkillAuditsTab from '../components/skill/SkillAuditsTab';
import { EvalMatrix } from '../components/eval-matrix';
import { useSkillsViewState } from './skills/useSkillsViewState';
import type { SkillsViewConfig } from './skills/types';

interface Props {
  project: Project;
}

export default function SkillsView({ project }: Props) {
  const { t } = useTranslation('skills');

  const config = useMemo<SkillsViewConfig>(
    () => ({
      scope: 'project',
      keyOf: (sk) => sk.name,
      keyOfRun: (r) => r.skillName,
      identityOf: (sk) => ({ scope: 'project', projectId: project.id, skillName: sk.name }),
      matchesScope: (r) => r.scope === 'project' && r.projectId === project.id,
      listSkills: () => window.nakiros.listProjectSkills(project.id),
      readFile: (sk, p) => window.nakiros.readSkillFile(project.id, sk.name, p),
      saveFile: (sk, p, c) =>
        window.nakiros.saveSkillFile(project.id, sk.name, p, c).then(() => undefined),
      pollActiveCreate: async () => {
        const all = await window.nakiros.listActiveCreateRuns();
        const relevant = all.filter((r) => r.scope === 'project' && r.projectId === project.id);
        return relevant[0] ?? null;
      },
    }),
    [project.id],
  );

  const s = useSkillsViewState(config);
  const onEvalFailure = (message: string) => alert(t('alertEvalFailed', { message }));
  const onAuditFailure = (message: string) => alert(t('alertAuditFailed', { message }));
  const onFixFailure = (message: string) => alert(t('alertFixFailed', { message }));

  // Project-only "create skill" state (modal + in-flight create overlay).
  const [activeCreate, setActiveCreate] = useState<{ run: AuditRun; skillName: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [createNameInput, setCreateNameInput] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  function openCreateNameModal() {
    if (creating) return;
    setCreateError(null);
    setCreateNameInput('');
  }

  async function submitCreateName() {
    if (creating || createNameInput == null) return;
    const name = createNameInput.trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      setCreateError(t('modal.nameValidationError'));
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const run = await window.nakiros.startCreate({
        scope: 'project',
        projectId: project.id,
        skillName: name,
      });
      setCreateNameInput(null);
      setActiveCreate({ run, skillName: name });
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  if (s.activeRuns) {
    return (
      <EvalRunsView
        scope="project"
        projectId={project.id}
        skillName={s.activeRuns.skill.name}
        initialRunIds={s.activeRuns.runIds}
        iteration={s.activeRuns.iteration}
        onClose={() => {
          s.setActiveRuns(null);
          void s.refreshSkills();
        }}
      />
    );
  }

  if (s.activeAudit) {
    return (
      <AuditView
        scope="project"
        projectId={project.id}
        skillName={s.activeAudit.skill.name}
        initialRun={s.activeAudit.run}
        onClose={() => {
          s.setActiveAudit(null);
          void s.refreshSkills();
        }}
      />
    );
  }

  if (s.activeFix) {
    return (
      <FixView
        scope="project"
        projectId={project.id}
        skillName={s.activeFix.skill.name}
        initialRun={s.activeFix.run}
        onClose={() => {
          s.setActiveFix(null);
          void s.refreshSkills();
        }}
      />
    );
  }

  if (activeCreate) {
    return (
      <FixView
        scope="project"
        projectId={project.id}
        skillName={activeCreate.skillName}
        initialRun={activeCreate.run}
        mode="create"
        onClose={() => {
          setActiveCreate(null);
          void s.refreshSkills();
        }}
      />
    );
  }

  if (s.loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">
        {t('loading')}
      </div>
    );
  }

  // Skill detail
  if (s.selectedSkill) {
    const skill = s.selectedSkill;

    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Skill header */}
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-2.5">
          <button
            onClick={() => s.closeSkill()}
            className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft size={16} />
          </button>
          <Sparkles size={14} className="text-[var(--primary)]" />
          <span className="font-semibold text-[var(--text-primary)]">{skill.name}</span>

          {/* Eval pass rate badge */}
          {skill.evals?.latestPassRate != null && (
            <PassRateBadge rate={skill.evals.latestPassRate} />
          )}

          <div className="flex-1" />

          {s.detailTab === 'audits' && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const active = s.activeAuditByKey.get(skill.name);
                  if (active) s.setActiveAudit({ run: active, skill });
                  else void s.handleStartAudit(skill, onAuditFailure);
                }}
                disabled={s.auditing}
                className={clsx(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                  s.activeAuditByKey.has(skill.name)
                    ? 'border border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)] hover:bg-[var(--primary-soft)]/80'
                    : 'bg-[var(--primary)] text-white hover:opacity-90',
                )}
                title={
                  s.activeAuditByKey.has(skill.name)
                    ? t('auditResumeTooltip')
                    : t('auditTooltip')
                }
              >
                {s.activeAuditByKey.has(skill.name) ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                {s.activeAuditByKey.has(skill.name) ? t('auditRunning') : s.auditing ? t('auditStarting') : t('audit')}
              </button>

              <button
                onClick={() => {
                  const active = s.activeFixByKey.get(skill.name);
                  if (active) s.setActiveFix({ run: active, skill });
                  else void s.handleStartFix(skill, onFixFailure);
                }}
                disabled={s.fixing || (!s.activeFixByKey.has(skill.name) && skill.auditCount === 0)}
                className={clsx(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                  s.activeFixByKey.has(skill.name)
                    ? 'border border-amber-400 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                    : 'bg-amber-500 text-white hover:opacity-90',
                )}
                title={
                  s.activeFixByKey.has(skill.name)
                    ? t('fixResumeTooltip')
                    : skill.auditCount === 0
                      ? t('fixNoAuditTooltip')
                      : t('fixTooltip')
                }
              >
                {s.activeFixByKey.has(skill.name) ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />}
                {s.activeFixByKey.has(skill.name) ? t('fixRunning') : s.fixing ? t('fixStarting') : t('fix')}
              </button>
            </div>
          )}

          {s.detailTab === 'evals' && skill.evals && skill.evals.definitions.length > 0 && (
            <div className="flex items-center gap-2">
              {s.ongoingByKey.has(skill.name) ? (
                <button
                  onClick={() => s.resumeOngoing(skill)}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white"
                >
                  <Loader2 size={12} className="animate-spin" />
                  {t('resumeEvals', { count: s.ongoingByKey.get(skill.name)!.runIds.length })}
                </button>
              ) : (
                <>
                  <label
                    className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--text-muted)]"
                    title={t('baselineTooltip')}
                  >
                    <Checkbox
                      checked={s.includeBaseline}
                      onCheckedChange={(checked) => s.setIncludeBaseline(checked === true)}
                    />
                    {t('includeBaseline')}
                  </label>
                  <button
                    onClick={() => void s.handleRunEvals(skill, onEvalFailure)}
                    disabled={s.starting}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
                  >
                    <Play size={12} />
                    {s.starting ? t('starting') : t('runEvals')}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Tab switcher */}
          <div className="flex rounded-lg border border-[var(--line)] bg-[var(--bg-soft)]">
            <TabButton active={s.detailTab === 'files'} onClick={() => s.setDetailTab('files')}>
              {t('tabFiles')}
            </TabButton>
            <TabButton active={s.detailTab === 'evals'} onClick={() => s.setDetailTab('evals')}>
              <FlaskConical size={12} />
              {t('tabEvals')} {skill.evals && `(${skill.evals.definitions.length})`}
            </TabButton>
            <TabButton active={s.detailTab === 'audits'} onClick={() => s.setDetailTab('audits')}>
              <Search size={12} />
              {t('tabAudits')} {skill.auditCount > 0 && `(${skill.auditCount})`}
            </TabButton>
          </div>
        </div>

        {s.detailTab === 'audits' && (
          <SkillAuditsTab scope="project" projectId={project.id} skillName={skill.name} />
        )}

        {/* Tab content */}
        {s.detailTab === 'files' && (
          <div className="flex flex-1 overflow-hidden">
            {/* File tree sidebar */}
            <div className="flex w-[260px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--bg-soft)]">
              <div className="flex-1 overflow-y-auto py-1">
                <FileTree entries={skill.files} selectedPath={s.selectedFile} onSelect={s.openFile} />
              </div>
            </div>

            {/* File content */}
            <div className="flex flex-1 flex-col overflow-hidden">
              {s.selectedFile ? (
                <>
                  <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2">
                    <span className="text-xs text-[var(--text-muted)]">{s.selectedFile}</span>
                    <button
                      onClick={s.handleSave}
                      disabled={!s.dirty || s.saving}
                      className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1 text-xs font-medium text-white transition-colors disabled:opacity-50"
                    >
                      <Save size={12} />
                      {s.saving ? t('saving') : t('save')}
                    </button>
                  </div>
                  {s.loadingFile ? (
                    <div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">{t('loadingFile')}</div>
                  ) : s.imageDataUrl ? (
                    <div className="flex flex-1 items-center justify-center overflow-auto bg-[var(--bg-muted)] p-6">
                      <img
                        src={s.imageDataUrl}
                        alt={s.selectedFile ?? ''}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  ) : s.selectedFile && isImagePath(s.selectedFile) ? (
                    <div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">
                      {t('imageError')}
                    </div>
                  ) : s.isMarkdown && !s.dirty ? (
                    <div className="flex-1 overflow-y-auto p-6">
                      <MarkdownViewer content={s.fileContent} />
                    </div>
                  ) : (
                    <textarea
                      value={s.fileContent}
                      onChange={(e) => s.setFileContent(e.target.value)}
                      className="flex-1 resize-none border-none bg-[var(--bg)] p-4 font-mono text-sm text-[var(--text-primary)] outline-none"
                      spellCheck={false}
                    />
                  )}
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
                  <File size={32} />
                  <p className="text-sm">{t('selectFile')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {s.detailTab === 'evals' && (
          <EvalsPanel skill={skill} scope="project" projectId={project.id} t={t} />
        )}
      </div>
    );
  }

  // Skills list
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">
          {t('heading', { count: s.skills.length })}
        </h2>
        <div className="flex items-center gap-2">
          {s.pendingCreate && (
            <button
              onClick={() =>
                setActiveCreate({ run: s.pendingCreate!, skillName: s.pendingCreate!.skillName })
              }
              className="flex items-center gap-1.5 rounded-lg border border-emerald-400 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
              title={t('draftTooltip', { name: s.pendingCreate.skillName })}
            >
              <Loader2 size={12} className="animate-spin" />
              {t('draftInProgress', { name: s.pendingCreate.skillName })}
            </button>
          )}
          <button
            onClick={openCreateNameModal}
            disabled={creating}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
            title={t('newSkillTooltip')}
          >
            <Plus size={12} />
            {creating ? t('creating') : t('newSkill')}
          </button>
        </div>
      </div>
      {s.skills.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[var(--line-strong)] px-4 py-3.5 text-[13px] text-[var(--text-muted)]">
          {t('noSkills')} <code className="rounded bg-[var(--bg-muted)] px-1">.claude/skills/</code>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {s.skills.map((skill) => (
            <button
              key={skill.name}
              onClick={() => s.openSkill(skill)}
              className="flex flex-col items-start gap-2 rounded-lg border border-[var(--line)] bg-[var(--bg-card)] p-4 text-left transition-colors hover:border-[var(--primary)]"
            >
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-[var(--primary)]" />
                  <span className="text-sm font-bold text-[var(--text-primary)]">{skill.name}</span>
                  {s.ongoingByKey.has(skill.name) && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        s.resumeOngoing(skill);
                      }}
                      className="flex cursor-pointer items-center gap-1 rounded bg-[var(--primary)] px-1.5 py-0.5 text-[10px] font-bold text-white hover:opacity-90"
                    >
                      <Loader2 size={10} className="animate-spin" />
                      {t('running')}
                    </span>
                  )}
                </div>
                {skill.evals?.latestPassRate != null && (
                  <PassRateBadge rate={skill.evals.latestPassRate} size="sm" />
                )}
              </div>
              {skill.content && (
                <p className="line-clamp-2 text-xs text-[var(--text-muted)]">
                  {skill.content.slice(0, 200)}
                </p>
              )}
              <div className="flex gap-1.5">
                {skill.hasEvals && <Badge label={t('evalsBadge', { count: skill.evals?.definitions.length ?? 0 })} />}
                {skill.auditCount > 0 && <Badge label={t('auditsBadge', { count: skill.auditCount })} />}
                {skill.hasReferences && <Badge label={t('refsBadge')} />}
                {skill.hasTemplates && <Badge label={t('templatesBadge')} />}
                <Badge label={t('filesBadge', { count: countFiles(skill.files) })} />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* "New skill" name modal — Electron disables window.prompt so we render our own. */}
      {createNameInput != null && (
        <div
          className="fixed inset-0 z-[500] flex items-center justify-center bg-black/50"
          onClick={() => !creating && setCreateNameInput(null)}
        >
          <div
            className="w-[420px] rounded-lg border border-[var(--line)] bg-[var(--bg-card)] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-sm font-bold text-[var(--text-primary)]">{t('modal.title')}</h3>
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              {t('modal.hint')}
            </p>
            <input
              type="text"
              autoFocus
              value={createNameInput}
              onChange={(e) => {
                setCreateNameInput(e.target.value);
                if (createError) setCreateError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitCreateName();
                else if (e.key === 'Escape') setCreateNameInput(null);
              }}
              placeholder={t('modal.placeholder')}
              disabled={creating}
              className="w-full rounded border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)] disabled:opacity-50"
            />
            {createError && (
              <p className="mt-2 text-xs text-red-400">{createError}</p>
            )}
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                onClick={() => setCreateNameInput(null)}
                disabled={creating}
                className="rounded px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                {t('modal.cancel')}
              </button>
              <button
                onClick={() => void submitCreateName()}
                disabled={creating || !createNameInput.trim()}
                className="flex items-center gap-1.5 rounded bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {creating && <Loader2 size={12} className="animate-spin" />}
                {creating ? t('modal.creating') : t('modal.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Evals Panel ─────────────────────────────────────────────────────────────

function EvalsPanel({
  skill,
  scope,
  projectId,
  t,
}: {
  skill: Skill;
  scope: SkillScope;
  projectId?: string;
  t: TFunction<'skills'>;
}) {
  const [expandedIter, setExpandedIter] = useState<number | null>(
    skill.evals?.iterations.length ? skill.evals.iterations[skill.evals.iterations.length - 1].number : null,
  );
  const [expandedEval, setExpandedEval] = useState<string | null>(null);
  void expandedIter; void setExpandedIter; void expandedEval; void setExpandedEval; // retained for legacy block below

  if (!skill.evals || skill.evals.definitions.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
        <FlaskConical size={32} />
        <p className="text-sm">{t('evals.noEvals')}</p>
      </div>
    );
  }

  const { definitions, iterations } = skill.evals;
  void iterations; // the legacy panel used this; the matrix fetches its own data

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Eval definitions summary */}
      <div className="mb-6">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {t('evals.definitionsHeading', { count: definitions.length })}
        </h3>
        <div className="flex flex-col gap-1.5">
          {definitions.map((def) => (
            <div key={def.id} className="rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[var(--text-primary)]">{def.name}</span>
                <Badge label={t('evals.assertionsBadge', { count: def.assertions.length })} />
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{def.prompt}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Evolution matrix — replaces the old iteration accordion. The old code
          is kept below, commented out, for a quick revert if needed. */}
      <EvalMatrix request={{ scope, projectId, skillName: skill.name }} />

      {/* eslint-disable-next-line @typescript-eslint/no-unused-expressions */}
      {false && iterations.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {t('evals.iterationsHeading', { count: iterations.length })}
          </h3>
          <div className="flex flex-col gap-2">
            {[...iterations].reverse().map((iter) => {
              const isExpanded = expandedIter === iter.number;
              const isLatest = iter.number === iterations[iterations.length - 1].number;
              const hasBaseline = iter.withoutSkill != null;

              return (
                <div key={iter.number} className="rounded-lg border border-[var(--line)] bg-[var(--bg-card)]">
                  {/* Iteration header */}
                  <button
                    onClick={() => setExpandedIter(isExpanded ? null : iter.number)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="text-sm font-semibold text-[var(--text-primary)]">
                      {t('evals.iterationLabel', { number: iter.number })}
                    </span>
                    {isLatest && (
                      <span className="rounded bg-[var(--primary)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {t('evals.latestBadge')}
                      </span>
                    )}
                    {!hasBaseline && (
                      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-400" title={t('evals.noBaselineTooltip')}>
                        {t('evals.noBaselineBadge')}
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-3 text-xs text-[var(--text-muted)]">
                      <span>
                        {t('evals.with')} <PassRateBadge rate={iter.withSkill.passRate} size="sm" />
                      </span>
                      {hasBaseline && iter.withoutSkill && (
                        <span>
                          {t('evals.without')} <PassRateBadge rate={iter.withoutSkill.passRate} size="sm" />
                        </span>
                      )}
                      {iter.delta.passRate != null && (
                        <span className={clsx('font-bold', iter.delta.passRate > 0 ? 'text-emerald-400' : iter.delta.passRate < 0 ? 'text-red-400' : 'text-[var(--text-muted)]')}>
                          Δ {iter.delta.passRate > 0 ? '+' : ''}{(iter.delta.passRate * 100).toFixed(0)}%
                        </span>
                      )}
                    </span>
                  </button>

                  {/* Iteration detail */}
                  {isExpanded && (
                    <div className="border-t border-[var(--line)] px-4 py-3">
                      {/* Summary row */}
                      <div className="mb-3 grid grid-cols-3 gap-3 rounded bg-[var(--bg-muted)] p-3 text-xs">
                        <div>
                          <div className="mb-0.5 text-[var(--text-muted)]">{t('evals.withSkill')}</div>
                          <div className="font-semibold">
                            {iter.withSkill.passedAssertions}/{iter.withSkill.totalAssertions} ·{' '}
                            {formatTokens(iter.withSkill.tokens)} · {formatDuration(iter.withSkill.durationMs)}
                          </div>
                        </div>
                        <div>
                          <div className="mb-0.5 text-[var(--text-muted)]">{t('evals.withoutSkillBaseline')}</div>
                          <div className="font-semibold">
                            {iter.withoutSkill ? (
                              <>
                                {iter.withoutSkill.passedAssertions}/{iter.withoutSkill.totalAssertions} ·{' '}
                                {formatTokens(iter.withoutSkill.tokens)} · {formatDuration(iter.withoutSkill.durationMs)}
                              </>
                            ) : (
                              <span className="text-amber-400">{t('evals.notRun')}</span>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="mb-0.5 text-[var(--text-muted)]">{t('evals.delta')}</div>
                          <div className="font-semibold">
                            {iter.delta.passRate != null
                              ? `${iter.delta.passRate > 0 ? '+' : ''}${(iter.delta.passRate * 100).toFixed(0)}%`
                              : '—'}
                            {iter.delta.tokens != null && ` · ${iter.delta.tokens > 0 ? '+' : ''}${formatTokens(iter.delta.tokens)}`}
                          </div>
                        </div>
                      </div>

                      <table className="w-full">
                        <thead>
                          <tr className="text-left text-xs text-[var(--text-muted)]">
                            <th className="pb-2 font-medium">{t('evals.table.name')}</th>
                            <th className="pb-2 text-center font-medium">{t('evals.table.with')}</th>
                            <th className="pb-2 text-center font-medium">{t('evals.table.without')}</th>
                            <th className="pb-2 text-right font-medium">{t('evals.table.delta')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {iter.gradings.map((grading) => (
                            <EvalRow
                              key={grading.evalName}
                              grading={grading}
                              t={t}
                              expanded={expandedEval === `${iter.number}-${grading.evalName}`}
                              onToggle={() =>
                                setExpandedEval(
                                  expandedEval === `${iter.number}-${grading.evalName}`
                                    ? null
                                    : `${iter.number}-${grading.evalName}`,
                                )
                              }
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function EvalRow({ grading, expanded, onToggle, t }: { grading: SkillEvalGrading; expanded: boolean; onToggle(): void; t: TFunction<'skills'> }) {
  const { withSkill, withoutSkill, deltaPassRate, humanFeedback } = grading;

  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-t border-[var(--line)] transition-colors hover:bg-[var(--bg-muted)]"
      >
        <td className="py-2 text-sm text-[var(--text-primary)]">
          <div className="flex items-center gap-1.5">
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {grading.evalName}
            {humanFeedback && (
              <span title={humanFeedback} className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] text-amber-400">
                {t('evals.humanReview')}
              </span>
            )}
          </div>
        </td>
        <td className="py-2 text-center">
          {withSkill ? (
            <span className="text-xs">
              <span className="text-emerald-400">{withSkill.passed}✓</span>
              {withSkill.failed > 0 && <span className="ml-1 text-red-400">{withSkill.failed}✗</span>}
            </span>
          ) : (
            <span className="text-xs text-[var(--text-muted)]">—</span>
          )}
        </td>
        <td className="py-2 text-center">
          {withoutSkill ? (
            <span className="text-xs">
              <span className="text-emerald-400">{withoutSkill.passed}✓</span>
              {withoutSkill.failed > 0 && <span className="ml-1 text-red-400">{withoutSkill.failed}✗</span>}
            </span>
          ) : (
            <span className="text-xs text-amber-400">—</span>
          )}
        </td>
        <td className="py-2 text-right">
          {deltaPassRate != null ? (
            <span className={clsx('text-xs font-bold', deltaPassRate > 0 ? 'text-emerald-400' : deltaPassRate < 0 ? 'text-red-400' : 'text-[var(--text-muted)]')}>
              {deltaPassRate > 0 ? '+' : ''}{(deltaPassRate * 100).toFixed(0)}%
            </span>
          ) : (
            <span className="text-xs text-[var(--text-muted)]">—</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={4} className="pb-3">
            <div className="ml-5 mt-1 flex flex-col gap-3">
              {withSkill && <RunBlock title={t('evals.withSkill')} run={withSkill} t={t} />}
              {withoutSkill && <RunBlock title={t('evals.withoutSkillBaseline')} run={withoutSkill} t={t} />}
              {humanFeedback && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
                  <div className="mb-1 font-semibold text-amber-400">{t('evals.humanReviewHeading')}</div>
                  <p className="text-[var(--text-primary)]">{humanFeedback}</p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function RunBlock({ title, run, t }: { title: string; run: SkillEvalGradingRun; t: TFunction<'skills'> }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-semibold text-[var(--text-primary)]">{title}</span>
        <PassRateBadge rate={run.passRate} size="sm" />
        {run.timing && (
          <span className="text-[10px] text-[var(--text-muted)]">
            {formatTokens(run.timing.totalTokens)} · {formatDuration(run.timing.durationMs)}
          </span>
        )}
        {run.graderModel && (
          <span className="ml-auto rounded bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
            {t('evals.grader', { model: run.graderModel })}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {run.assertions.map((a, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            {a.passed ? (
              <CheckCircle size={12} className="mt-0.5 shrink-0 text-emerald-400" />
            ) : (
              <XCircle size={12} className="mt-0.5 shrink-0 text-red-400" />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                {a.type && (
                  <span className={clsx('rounded px-1 py-0 text-[9px]', a.type === 'script' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400')}>
                    {a.type}
                  </span>
                )}
                <span className="text-[var(--text-primary)]">{a.text}</span>
              </div>
              {a.evidence && <p className="mt-0.5 text-[var(--text-muted)]">{a.evidence}</p>}
            </div>
          </div>
        ))}
        {run.notes && (
          <p className="mt-1 rounded bg-[var(--bg-muted)] px-2 py-1 text-[10px] text-[var(--text-muted)]">
            {run.notes}
          </p>
        )}
      </div>
    </div>
  );
}

function formatTokens(n: number): string {
  if (n < 1000) return `${n} tok`;
  return `${(n / 1000).toFixed(1)}k tok`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
}

// ─── Shared components ──────────────────────────────────────────────────────

function PassRateBadge({ rate, size = 'md' }: { rate: number; size?: 'sm' | 'md' }) {
  const pct = Math.round(rate * 100);
  const color = pct >= 80 ? 'bg-emerald-500/20 text-emerald-400' : pct >= 50 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400';
  return (
    <span className={clsx('rounded-full font-bold', color, size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs')}>
      {pct}%
    </span>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
        active ? 'bg-[var(--bg-muted)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
      )}
    >
      {children}
    </button>
  );
}

function countFiles(entries: SkillFileEntry[]): number {
  let count = 0;
  for (const entry of entries) {
    if (entry.isDirectory && entry.children) {
      count += countFiles(entry.children);
    } else if (!entry.isDirectory) {
      count++;
    }
  }
  return count;
}

// ─── File Tree ──────────────────────────────────────────────────────────────

function FileTree({ entries, selectedPath, onSelect, depth = 0 }: { entries: SkillFileEntry[]; selectedPath: string | null; onSelect(path: string): void; depth?: number }) {
  return (
    <>
      {entries.map((entry) => (
        <FileTreeNode key={entry.relativePath} entry={entry} selectedPath={selectedPath} onSelect={onSelect} depth={depth} />
      ))}
    </>
  );
}

function FileTreeNode({ entry, selectedPath, onSelect, depth }: { entry: SkillFileEntry; selectedPath: string | null; onSelect(path: string): void; depth: number }) {
  const [expanded, setExpanded] = useState(depth === 0);
  const isSelected = selectedPath === entry.relativePath;
  const paddingLeft = 8 + depth * 16;

  if (entry.isDirectory) {
    return (
      <>
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="flex w-full items-center gap-1.5 py-1 text-left text-xs text-[var(--text-muted)] hover:bg-[var(--bg-muted)]"
          style={{ paddingLeft }}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Folder size={12} className="text-[var(--primary)]" />
          <span>{entry.name}</span>
        </button>
        {expanded && entry.children && (
          <FileTree entries={entry.children} selectedPath={selectedPath} onSelect={onSelect} depth={depth + 1} />
        )}
      </>
    );
  }

  return (
    <button
      onClick={() => onSelect(entry.relativePath)}
      className={clsx(
        'flex w-full items-center gap-1.5 py-1 text-left text-xs transition-colors hover:bg-[var(--bg-muted)]',
        isSelected ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : 'text-[var(--text-primary)]',
      )}
      style={{ paddingLeft: paddingLeft + 16 }}
    >
      <File size={12} className="shrink-0 text-[var(--text-muted)]" />
      <span className="truncate">{entry.name}</span>
      {entry.sizeBytes !== undefined && (
        <span className="ml-auto shrink-0 pr-2 text-[10px] text-[var(--text-muted)]">
          {formatSize(entry.sizeBytes)}
        </span>
      )}
    </button>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
      {label}
    </span>
  );
}
