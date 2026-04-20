import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  Loader2,
  Play,
  Save,
  Search,
  Sparkles,
  CheckCircle,
  Wrench,
  XCircle,
  FlaskConical,
  Package,
} from 'lucide-react';
import clsx from 'clsx';
import type { AuditRun, Skill, SkillFileEntry, SkillEvalGrading, SkillEvalGradingRun, SkillScope } from '@nakiros/shared';
import { Checkbox, MarkdownViewer } from '../components/ui';
import { isImagePath } from '../utils/file-types';
import EvalRunsView from './EvalRunsView';
import AuditView from './AuditView';
import FixView from './FixView';
import SkillAuditsTab from '../components/skill/SkillAuditsTab';
import { EvalMatrix } from '../components/eval-matrix';

type SkillDetailTab = 'files' | 'evals' | 'audits';

interface Props {
  onBack(): void;
}

export default function NakirosSkillsView({ onBack }: Props) {
  const { t } = useTranslation('nakiros-skills');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<SkillDetailTab>('files');

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);

  const [activeRuns, setActiveRuns] = useState<{ runIds: string[]; iteration: number; skillName: string } | null>(null);
  const [starting, setStarting] = useState(false);
  const [includeBaseline, setIncludeBaseline] = useState(true);
  const [activeAudit, setActiveAudit] = useState<{ run: AuditRun; skillName: string } | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [activeFix, setActiveFix] = useState<{ run: AuditRun; skillName: string } | null>(null);
  const [fixing, setFixing] = useState(false);
  const [ongoingRunsBySkill, setOngoingRunsBySkill] = useState<Map<string, { runIds: string[]; iteration: number }>>(new Map());
  /** Active (non-terminal) fix runs, keyed by skill name. */
  const [activeFixBySkill, setActiveFixBySkill] = useState<Map<string, AuditRun>>(new Map());
  /** Active (non-terminal) audit runs, keyed by skill name. */
  const [activeAuditBySkill, setActiveAuditBySkill] = useState<Map<string, AuditRun>>(new Map());

  useEffect(() => {
    setLoading(true);
    window.nakiros.listBundledSkills().then((sk) => {
      setSkills(sk);
      setLoading(false);
    });
  }, []);

  // Poll for ongoing (non-terminal) runs across all bundled skills
  useEffect(() => {
    const terminalStatuses = new Set(['completed', 'failed', 'stopped']);

    async function pollOngoing() {
      const all = await window.nakiros.listEvalRuns();
      const bundledActive = all.filter((r) => r.scope === 'nakiros-bundled' && !terminalStatuses.has(r.status));
      const map = new Map<string, { runIds: string[]; iteration: number }>();
      for (const run of bundledActive) {
        const entry = map.get(run.skillName) ?? { runIds: [], iteration: run.iteration };
        entry.runIds.push(run.runId);
        map.set(run.skillName, entry);
      }
      setOngoingRunsBySkill(map);
    }

    async function pollFixes() {
      const all = await window.nakiros.listActiveFixRuns();
      const map = new Map<string, AuditRun>();
      for (const run of all) {
        if (run.scope !== 'nakiros-bundled') continue;
        map.set(run.skillName, run);
      }
      setActiveFixBySkill(map);
    }

    async function pollAudits() {
      const all = await window.nakiros.listActiveAuditRuns();
      const map = new Map<string, AuditRun>();
      for (const run of all) {
        if (run.scope !== 'nakiros-bundled') continue;
        map.set(run.skillName, run);
      }
      setActiveAuditBySkill(map);
    }

    void pollOngoing();
    void pollFixes();
    void pollAudits();
    const interval = setInterval(() => {
      void pollOngoing();
      void pollFixes();
      void pollAudits();
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  function openSkill(name: string) {
    setSelectedSkill(name);
    setDetailTab('files');
    setSelectedFile(null);
    setFileContent('');
  }

  async function openFile(relativePath: string) {
    if (!selectedSkill) return;
    setLoadingFile(true);
    setSelectedFile(relativePath);
    setImageDataUrl(null);
    if (isImagePath(relativePath)) {
      const dataUrl = await window.nakiros.readSkillFileAsDataUrl({
        scope: 'nakiros-bundled',
        skillName: selectedSkill,
        relativePath,
      });
      setImageDataUrl(dataUrl);
      setFileContent('');
      setOriginalContent('');
    } else {
      const content = await window.nakiros.readBundledSkillFile(selectedSkill, relativePath);
      const text = content ?? '';
      setFileContent(text);
      setOriginalContent(text);
    }
    setLoadingFile(false);
  }

  async function handleSave() {
    if (!selectedSkill || !selectedFile) return;
    setSaving(true);
    await window.nakiros.saveBundledSkillFile(selectedSkill, selectedFile, fileContent);
    setOriginalContent(fileContent);
    setSaving(false);
  }

  async function handleRunEvals(skillName: string) {
    if (starting) return;
    setStarting(true);
    try {
      const response = await window.nakiros.startEvalRuns({
        scope: 'nakiros-bundled',
        skillName,
        includeBaseline,
      });
      setActiveRuns({ runIds: response.runIds, iteration: response.iteration, skillName });
    } catch (err) {
      console.error(err);
      alert(t('alertEvalFailed', { message: (err as Error).message }));
    } finally {
      setStarting(false);
    }
  }

  async function handleStartAudit(skillName: string) {
    if (auditing) return;
    setAuditing(true);
    try {
      const run = await window.nakiros.startAudit({ scope: 'nakiros-bundled', skillName });
      setActiveAudit({ run, skillName });
    } catch (err) {
      alert(t('alertAuditFailed', { message: (err as Error).message }));
    } finally {
      setAuditing(false);
    }
  }

  async function handleStartFix(skillName: string) {
    if (fixing) return;
    setFixing(true);
    try {
      const run = await window.nakiros.startFix({ scope: 'nakiros-bundled', skillName });
      setActiveFix({ run, skillName });
    } catch (err) {
      alert(t('alertFixFailed', { message: (err as Error).message }));
    } finally {
      setFixing(false);
    }
  }


  const dirty = fileContent !== originalContent;
  const isMarkdown = selectedFile?.endsWith('.md') ?? false;

  function resumeOngoing(skillName: string) {
    const ongoing = ongoingRunsBySkill.get(skillName);
    if (!ongoing) return;
    setActiveRuns({ runIds: ongoing.runIds, iteration: ongoing.iteration, skillName });
  }

  // Show eval runs overlay
  if (activeRuns) {
    return (
      <EvalRunsView
        scope="nakiros-bundled"
        skillName={activeRuns.skillName}
        initialRunIds={activeRuns.runIds}
        iteration={activeRuns.iteration}
        onClose={() => {
          setActiveRuns(null);
          window.nakiros.listBundledSkills().then(setSkills);
        }}
      />
    );
  }

  // Show audit overlay
  if (activeAudit) {
    return (
      <AuditView
        scope="nakiros-bundled"
        skillName={activeAudit.skillName}
        initialRun={activeAudit.run}
        onClose={() => {
          setActiveAudit(null);
          window.nakiros.listBundledSkills().then(setSkills);
        }}
      />
    );
  }

  // Show fix overlay
  if (activeFix) {
    return (
      <FixView
        scope="nakiros-bundled"
        skillName={activeFix.skillName}
        initialRun={activeFix.run}
        onClose={() => {
          setActiveFix(null);
          window.nakiros.listBundledSkills().then(setSkills);
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-[var(--text-muted)]">
        {t('loading')}
      </div>
    );
  }

  // ─── Skill detail ──────────────────────────────────────────────────────────
  if (selectedSkill) {
    const skill = skills.find((s) => s.name === selectedSkill);
    if (!skill) return null;

    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <TopBar onBack={onBack} title={t('topBar.title')} backLabel={t('topBar.back')} />
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-2.5">
          <button
            onClick={() => setSelectedSkill(null)}
            className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft size={16} />
          </button>
          <Sparkles size={14} className="text-[var(--primary)]" />
          <span className="font-semibold text-[var(--text-primary)]">{skill.name}</span>

          {skill.evals?.latestPassRate != null && <PassRateBadge rate={skill.evals.latestPassRate} />}

          <div className="flex-1" />

          {detailTab === 'audits' && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const active = activeAuditBySkill.get(skill.name);
                  if (active) setActiveAudit({ run: active, skillName: skill.name });
                  else handleStartAudit(skill.name);
                }}
                disabled={auditing}
                className={clsx(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                  activeAuditBySkill.has(skill.name)
                    ? 'border border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)] hover:bg-[var(--primary-soft)]/80'
                    : 'bg-[var(--primary)] text-white hover:opacity-90',
                )}
                title={
                  activeAuditBySkill.has(skill.name)
                    ? t('auditResumeTooltip')
                    : t('auditTooltip')
                }
              >
                {activeAuditBySkill.has(skill.name) ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                {activeAuditBySkill.has(skill.name) ? t('auditRunning') : auditing ? t('auditStarting') : t('audit')}
              </button>

              <button
                onClick={() => {
                  const active = activeFixBySkill.get(skill.name);
                  if (active) setActiveFix({ run: active, skillName: skill.name });
                  else handleStartFix(skill.name);
                }}
                disabled={fixing || (!activeFixBySkill.has(skill.name) && skill.auditCount === 0)}
                className={clsx(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                  activeFixBySkill.has(skill.name)
                    ? 'border border-amber-400 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                    : 'bg-amber-500 text-white hover:opacity-90',
                )}
                title={
                  activeFixBySkill.has(skill.name)
                    ? t('fixResumeTooltip')
                    : skill.auditCount === 0
                      ? t('fixNoAuditTooltip')
                      : t('fixTooltip')
                }
              >
                {activeFixBySkill.has(skill.name) ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />}
                {activeFixBySkill.has(skill.name) ? t('fixRunning') : fixing ? t('fixStarting') : t('fix')}
              </button>
            </div>
          )}

          {detailTab === 'evals' && skill.evals && skill.evals.definitions.length > 0 && (
            <div className="flex items-center gap-2">
              {ongoingRunsBySkill.has(skill.name) ? (
                <button
                  onClick={() => resumeOngoing(skill.name)}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white"
                >
                  <Loader2 size={12} className="animate-spin" />
                  {t('resumeEvals', { count: ongoingRunsBySkill.get(skill.name)!.runIds.length })}
                </button>
              ) : (
                <>
                  <label
                    className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--text-muted)]"
                    title={t('baselineTooltip')}
                  >
                    <Checkbox
                      checked={includeBaseline}
                      onCheckedChange={(checked) => setIncludeBaseline(checked === true)}
                    />
                    {t('includeBaseline')}
                  </label>
                  <button
                    onClick={() => handleRunEvals(skill.name)}
                    disabled={starting}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
                  >
                    <Play size={12} />
                    {starting ? t('runEvalsStarting') : t('runEvals')}
                  </button>
                </>
              )}
            </div>
          )}

          <div className="flex rounded-lg border border-[var(--line)] bg-[var(--bg-soft)]">
            <TabButton active={detailTab === 'files'} onClick={() => setDetailTab('files')}>
              {t('tabFiles')}
            </TabButton>
            <TabButton active={detailTab === 'evals'} onClick={() => setDetailTab('evals')}>
              <FlaskConical size={12} />
              {t('tabEvals')} {skill.evals && `(${skill.evals.definitions.length})`}
            </TabButton>
            <TabButton active={detailTab === 'audits'} onClick={() => setDetailTab('audits')}>
              <Search size={12} />
              {t('tabAudits')} {skill.auditCount > 0 && `(${skill.auditCount})`}
            </TabButton>
          </div>
        </div>

        {detailTab === 'audits' && (
          <SkillAuditsTab scope="nakiros-bundled" skillName={skill.name} />
        )}

        {detailTab === 'files' && (
          <div className="flex flex-1 overflow-hidden">
            <div className="flex w-[260px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--bg-soft)]">
              <div className="flex-1 overflow-y-auto py-1">
                <FileTree entries={skill.files} selectedPath={selectedFile} onSelect={openFile} />
              </div>
            </div>

            <div className="flex flex-1 flex-col overflow-hidden">
              {selectedFile ? (
                <>
                  <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2">
                    <span className="text-xs text-[var(--text-muted)]">{selectedFile}</span>
                    <button
                      onClick={handleSave}
                      disabled={!dirty || saving}
                      className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1 text-xs font-medium text-white transition-colors disabled:opacity-50"
                    >
                      <Save size={12} />
                      {saving ? t('saving') : t('save')}
                    </button>
                  </div>
                  {loadingFile ? (
                    <div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">
                      {t('loadingFile')}
                    </div>
                  ) : imageDataUrl ? (
                    <div className="flex flex-1 items-center justify-center overflow-auto bg-[var(--bg-muted)] p-6">
                      <img
                        src={imageDataUrl}
                        alt={selectedFile ?? ''}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  ) : selectedFile && isImagePath(selectedFile) ? (
                    <div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">
                      {t('imageError')}
                    </div>
                  ) : isMarkdown && !dirty ? (
                    <div className="flex-1 overflow-y-auto p-6">
                      <MarkdownViewer content={fileContent} />
                    </div>
                  ) : (
                    <textarea
                      value={fileContent}
                      onChange={(e) => setFileContent(e.target.value)}
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

        {detailTab === 'evals' && <EvalsPanel skill={skill} scope="nakiros-bundled" t={t} />}
      </div>
    );
  }

  // ─── Skills list ───────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar onBack={onBack} title={t('topBar.title')} backLabel={t('topBar.back')} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-[900px]">
          <div className="mb-4 flex items-center gap-2">
            <Package size={18} className="text-[var(--primary)]" />
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              {t('heading', { count: skills.length })}
            </h2>
          </div>
          <p className="mb-6 text-sm text-[var(--text-muted)]">
            {t('descriptionBefore')} <code className="rounded bg-[var(--bg-muted)] px-1">~/.claude/skills/</code> {t('descriptionAfter')}
          </p>

          {skills.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-[var(--line-strong)] px-4 py-3.5 text-[13px] text-[var(--text-muted)]">
              {t('noSkills')}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {skills.map((skill) => (
                <button
                  key={skill.name}
                  onClick={() => openSkill(skill.name)}
                  className="flex flex-col items-start gap-2 rounded-lg border border-[var(--line)] bg-[var(--bg-card)] p-4 text-left transition-colors hover:border-[var(--primary)]"
                >
                  <div className="flex w-full items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} className="text-[var(--primary)]" />
                      <span className="text-sm font-bold text-[var(--text-primary)]">{skill.name}</span>
                      {ongoingRunsBySkill.has(skill.name) && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            resumeOngoing(skill.name);
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

function TopBar({ onBack, title, backLabel }: { onBack(): void; title: string; backLabel: string }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--line)] bg-[var(--bg-soft)] px-[18px]">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
      >
        <ArrowLeft size={14} />
        {backLabel}
      </button>
      <span className="text-sm font-semibold text-[var(--text-primary)]">{title}</span>
    </div>
  );
}

// ─── Evals panel (duplicated from SkillsView) ──────────────────────────────

function EvalsPanel({
  skill,
  scope,
  t,
}: {
  skill: Skill;
  scope: SkillScope;
  t: TFunction<'nakiros-skills'>;
}) {
  const [expandedIter, setExpandedIter] = useState<number | null>(
    skill.evals?.iterations.length
      ? skill.evals.iterations[skill.evals.iterations.length - 1].number
      : null,
  );
  const [expandedEval, setExpandedEval] = useState<string | null>(null);
  void expandedIter; void setExpandedIter; void expandedEval; void setExpandedEval;

  if (!skill.evals || skill.evals.definitions.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
        <FlaskConical size={32} />
        <p className="text-sm">{t('evals.noEvals')}</p>
      </div>
    );
  }

  const { definitions, iterations } = skill.evals;
  void iterations;

  return (
    <div className="flex-1 overflow-y-auto p-6">
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
          below is guarded behind `{false && ...}` for a quick revert. */}
      <EvalMatrix request={{ scope, skillName: skill.name }} />

      {/* eslint-disable-next-line @typescript-eslint/no-constant-binary-expression, @typescript-eslint/no-unused-expressions */}
      {false && (iterations.length > 0 ? (
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
                      <span
                        className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-400"
                        title={t('evals.noBaselineTooltip')}
                      >
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
                        <span
                          className={clsx(
                            'font-bold',
                            iter.delta.passRate > 0
                              ? 'text-emerald-400'
                              : iter.delta.passRate < 0
                                ? 'text-red-400'
                                : 'text-[var(--text-muted)]',
                          )}
                        >
                          Δ {iter.delta.passRate > 0 ? '+' : ''}
                          {(iter.delta.passRate * 100).toFixed(0)}%
                        </span>
                      )}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[var(--line)] px-4 py-3">
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
                            {iter.delta.tokens != null &&
                              ` · ${iter.delta.tokens > 0 ? '+' : ''}${formatTokens(iter.delta.tokens)}`}
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
                              expanded={expandedEval === `${iter.number}-${grading.evalName}`}
                              onToggle={() =>
                                setExpandedEval(
                                  expandedEval === `${iter.number}-${grading.evalName}`
                                    ? null
                                    : `${iter.number}-${grading.evalName}`,
                                )
                              }
                              t={t}
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
      ) : (
        <div className="rounded-[10px] border border-dashed border-[var(--line-strong)] px-4 py-3.5 text-[13px] text-[var(--text-muted)]">
          {t('evals.noIterationsBefore')}{' '}
          <code className="rounded bg-[var(--bg-muted)] px-1">eval run {skill.name}</code> {t('evals.noIterationsAfter')}
        </div>
      ))}
    </div>
  );
}

function EvalRow({
  grading,
  expanded,
  onToggle,
  t,
}: {
  grading: SkillEvalGrading;
  expanded: boolean;
  onToggle(): void;
  t: TFunction<'nakiros-skills'>;
}) {
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
              <span
                title={humanFeedback}
                className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] text-amber-400"
              >
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
            <span
              className={clsx(
                'text-xs font-bold',
                deltaPassRate > 0
                  ? 'text-emerald-400'
                  : deltaPassRate < 0
                    ? 'text-red-400'
                    : 'text-[var(--text-muted)]',
              )}
            >
              {deltaPassRate > 0 ? '+' : ''}
              {(deltaPassRate * 100).toFixed(0)}%
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

function RunBlock({ title, run, t }: { title: string; run: SkillEvalGradingRun; t: TFunction<'nakiros-skills'> }) {
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
                  <span
                    className={clsx(
                      'rounded px-1 py-0 text-[9px]',
                      a.type === 'script' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400',
                    )}
                  >
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

// ─── Shared helpers ────────────────────────────────────────────────────────

function PassRateBadge({ rate, size = 'md' }: { rate: number; size?: 'sm' | 'md' }) {
  const pct = Math.round(rate * 100);
  const color =
    pct >= 80
      ? 'bg-emerald-500/20 text-emerald-400'
      : pct >= 50
        ? 'bg-amber-500/20 text-amber-400'
        : 'bg-red-500/20 text-red-400';
  return (
    <span
      className={clsx(
        'rounded-full font-bold',
        color,
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs',
      )}
    >
      {pct}%
    </span>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'bg-[var(--bg-muted)] text-[var(--text-primary)]'
          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
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

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
      {label}
    </span>
  );
}

function FileTree({
  entries,
  selectedPath,
  onSelect,
  depth = 0,
}: {
  entries: SkillFileEntry[];
  selectedPath: string | null;
  onSelect(path: string): void;
  depth?: number;
}) {
  return (
    <>
      {entries.map((entry) => (
        <FileTreeNode
          key={entry.relativePath}
          entry={entry}
          selectedPath={selectedPath}
          onSelect={onSelect}
          depth={depth}
        />
      ))}
    </>
  );
}

function FileTreeNode({
  entry,
  selectedPath,
  onSelect,
  depth,
}: {
  entry: SkillFileEntry;
  selectedPath: string | null;
  onSelect(path: string): void;
  depth: number;
}) {
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

function formatTokens(n: number): string {
  if (n < 1000) return `${n} tok`;
  return `${(n / 1000).toFixed(1)}k tok`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
}
