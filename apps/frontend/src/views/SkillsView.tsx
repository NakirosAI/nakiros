import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, File, Loader2, Play, Plus, Save, Search, Sparkles, Wrench, FlaskConical } from 'lucide-react';
import clsx from 'clsx';
import type { AuditRun, Project } from '@nakiros/shared';
import { Checkbox, MarkdownViewer } from '../components/ui';
import { isImagePath } from '../utils/file-types';
import EvalRunsView from './EvalRunsView';
import AuditView from './AuditView';
import FixView from './FixView';
import SkillAuditsTab from '../components/skill/SkillAuditsTab';
import { useSkillsViewState } from './skills/useSkillsViewState';
import type { SkillsViewConfig } from './skills/types';
import {
  Badge,
  FileTree,
  PassRateBadge,
  TabButton,
  countFiles,
} from './skills/components';
import { SkillEvalsPanel } from './skills/EvalsPanel';

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
          <SkillEvalsPanel skill={skill} scope="project" projectId={project.id} />
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

