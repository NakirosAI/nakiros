import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  ArrowLeft,
  File,
  Loader2,
  Play,
  Save,
  Search,
  Sparkles,
  Wrench,
  FlaskConical,
  Package,
} from 'lucide-react';
import clsx from 'clsx';
import { Checkbox, MarkdownViewer } from '../components/ui';
import { isImagePath } from '../utils/file-types';
import EvalRunsView from './EvalRunsView';
import AuditView from './AuditView';
import FixView from './FixView';
import SkillAuditsTab from '../components/skill/SkillAuditsTab';
import { useSkillActionErrorHandlers } from '../hooks/useSkillActionErrorHandlers';
import { useSkillsViewState } from './skills/useSkillsViewState';
import type { SkillsViewConfig } from './skills/types';
import {
  Badge,
  EvalModelSelector,
  FileTree,
  PassRateBadge,
  TabButton,
  countFiles,
} from './skills/components';
import { SkillEvalsPanel } from './skills/EvalsPanel';

interface Props {
  onBack(): void;
}

export default function GlobalSkillsView({ onBack }: Props) {
  const { t } = useTranslation('global-skills');

  const config = useMemo<SkillsViewConfig>(
    () => ({
      scope: 'claude-global',
      keyOf: (s) => s.name,
      keyOfRun: (r) => r.skillName,
      identityOf: (s) => ({ scope: 'claude-global', skillName: s.name }),
      matchesScope: (r) => r.scope === 'claude-global',
      listSkills: () => window.nakiros.listClaudeGlobalSkills(),
      readFile: (s, p) => window.nakiros.readClaudeGlobalSkillFile(s.name, p),
      saveFile: (s, p, c) =>
        window.nakiros.saveClaudeGlobalSkillFile(s.name, p, c).then(() => undefined),
    }),
    [],
  );

  const s = useSkillsViewState(config);
  const { onEvalFailure, onAuditFailure, onFixFailure } = useSkillActionErrorHandlers();

  // Show eval runs overlay
  if (s.activeRuns) {
    return (
      <EvalRunsView
        scope="claude-global"
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

  // Show audit overlay
  if (s.activeAudit) {
    return (
      <AuditView
        scope="claude-global"
        skillName={s.activeAudit.skill.name}
        initialRun={s.activeAudit.run}
        onClose={() => {
          s.setActiveAudit(null);
          void s.refreshSkills();
        }}
      />
    );
  }

  // Show fix overlay
  if (s.activeFix) {
    return (
      <FixView
        scope="claude-global"
        skillName={s.activeFix.skill.name}
        initialRun={s.activeFix.run}
        onClose={() => {
          s.setActiveFix(null);
          void s.refreshSkills();
        }}
      />
    );
  }

  if (s.loading) {
    return (
      <div className="flex h-screen items-center justify-center text-[var(--text-muted)]">
        {t('loading')}
      </div>
    );
  }

  // ─── Skill detail ──────────────────────────────────────────────────────────
  if (s.selectedSkill) {
    const skill = s.selectedSkill;

    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <TopBar onBack={onBack} title={t('topBarTitle')} t={t} />
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-2.5">
          <button
            onClick={() => s.closeSkill()}
            className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft size={16} />
          </button>
          <Sparkles size={14} className="text-[var(--primary)]" />
          <span className="font-semibold text-[var(--text-primary)]">{skill.name}</span>

          {skill.evals?.latestPassRate != null && <PassRateBadge rate={skill.evals.latestPassRate} />}

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
                  <EvalModelSelector
                    value={s.selectedModel}
                    onChange={s.setSelectedModel}
                    disabled={s.starting}
                    label={t('model')}
                    title={t('modelTooltip')}
                  />
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
                    {s.starting ? t('evalStarting') : t('runEvals')}
                  </button>
                </>
              )}
            </div>
          )}

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
          <SkillAuditsTab scope="claude-global" skillName={skill.name} />
        )}

        {s.detailTab === 'files' && (
          <div className="flex flex-1 overflow-hidden">
            <div className="flex w-[260px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--bg-soft)]">
              <div className="flex-1 overflow-y-auto py-1">
                <FileTree entries={skill.files} selectedPath={s.selectedFile} onSelect={s.openFile} />
              </div>
            </div>

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
                    <div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">
                      {t('loadingFile')}
                    </div>
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
          <SkillEvalsPanel
            skill={skill}
            scope="claude-global"
            onComparisonLaunched={(runIds) =>
              s.setActiveRuns({ runIds, iteration: 0, skill })
            }
          />
        )}
      </div>
    );
  }

  // ─── Skills list ───────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar onBack={onBack} title={t('topBarTitle')} t={t} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-[900px]">
          <div className="mb-4 flex items-center gap-2">
            <Package size={18} className="text-emerald-400" />
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              {t('heading', { count: s.skills.length })}
            </h2>
          </div>
          <p className="mb-6 text-sm text-[var(--text-muted)]">
            {t('descriptionStart')} <code className="rounded bg-[var(--bg-muted)] px-1">~/.claude/skills/</code> {t('descriptionMiddle')} <strong>{t('nakirosSkillsLabel')}</strong>{t('descriptionEnd')}
          </p>

          {s.skills.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-[var(--line-strong)] px-4 py-3.5 text-[13px] text-[var(--text-muted)]">
              {t('noSkills')}
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
        </div>
      </div>
    </div>
  );
}

// ─── Top bar ────────────────────────────────────────────────────────────────

function TopBar({ onBack, title, t }: { onBack(): void; title: string; t: TFunction<'global-skills'> }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--line)] bg-[var(--bg-soft)] px-[18px]">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
      >
        <ArrowLeft size={14} />
        {t('topBarBack')}
      </button>
      <span className="text-sm font-semibold text-[var(--text-primary)]">{title}</span>
    </div>
  );
}

