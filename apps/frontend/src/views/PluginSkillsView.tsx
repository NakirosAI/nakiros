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
  Plug,
} from 'lucide-react';
import clsx from 'clsx';
import type {
  AuditRun,
  Skill,
  SkillFileEntry,
  SkillEvalGrading,
  SkillEvalGradingRun,
  SkillScope,
} from '@nakiros/shared';
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

/** Composite identity: `<marketplace>::<plugin>::<skill>`. */
function skillKey(skill: Pick<Skill, 'marketplaceName' | 'pluginName' | 'name'>): string {
  return `${skill.marketplaceName ?? ''}::${skill.pluginName ?? ''}::${skill.name}`;
}

export default function PluginSkillsView({ onBack }: Props) {
  const { t } = useTranslation('plugin-skills');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMarketplace, setSelectedMarketplace] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<SkillDetailTab>('files');

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);

  const [activeRuns, setActiveRuns] = useState<{
    runIds: string[];
    iteration: number;
    skill: Skill;
  } | null>(null);
  const [starting, setStarting] = useState(false);
  const [includeBaseline, setIncludeBaseline] = useState(true);
  const [activeAudit, setActiveAudit] = useState<{ run: AuditRun; skill: Skill } | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [activeFix, setActiveFix] = useState<{ run: AuditRun; skill: Skill } | null>(null);
  const [fixing, setFixing] = useState(false);
  const [ongoingRunsByKey, setOngoingRunsByKey] = useState<
    Map<string, { runIds: string[]; iteration: number }>
  >(new Map());
  const [activeFixByKey, setActiveFixByKey] = useState<Map<string, AuditRun>>(new Map());
  const [activeAuditByKey, setActiveAuditByKey] = useState<Map<string, AuditRun>>(new Map());

  useEffect(() => {
    setLoading(true);
    window.nakiros.listPluginSkills().then((sk) => {
      setSkills(sk);
      setLoading(false);
    });
  }, []);

  // Poll for ongoing (non-terminal) runs scoped to plugins.
  useEffect(() => {
    const terminalStatuses = new Set(['completed', 'failed', 'stopped']);

    function keyOf(run: {
      marketplaceName?: string;
      pluginName?: string;
      skillName: string;
    }): string {
      return `${run.marketplaceName ?? ''}::${run.pluginName ?? ''}::${run.skillName}`;
    }

    async function pollOngoing() {
      const all = await window.nakiros.listEvalRuns();
      const pluginActive = all.filter(
        (r) => r.scope === 'plugin' && !terminalStatuses.has(r.status),
      );
      const map = new Map<string, { runIds: string[]; iteration: number }>();
      for (const run of pluginActive) {
        const k = keyOf(run);
        const entry = map.get(k) ?? { runIds: [], iteration: run.iteration };
        entry.runIds.push(run.runId);
        map.set(k, entry);
      }
      setOngoingRunsByKey(map);
    }

    async function pollFixes() {
      const all = await window.nakiros.listActiveFixRuns();
      const map = new Map<string, AuditRun>();
      for (const run of all) {
        if (run.scope !== 'plugin') continue;
        map.set(keyOf(run), run);
      }
      setActiveFixByKey(map);
    }

    async function pollAudits() {
      const all = await window.nakiros.listActiveAuditRuns();
      const map = new Map<string, AuditRun>();
      for (const run of all) {
        if (run.scope !== 'plugin') continue;
        map.set(keyOf(run), run);
      }
      setActiveAuditByKey(map);
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

  function openSkill(skill: Skill) {
    setSelectedKey(skillKey(skill));
    setDetailTab('files');
    setSelectedFile(null);
    setFileContent('');
  }

  const selectedSkill = selectedKey ? skills.find((s) => skillKey(s) === selectedKey) : null;

  async function openFile(relativePath: string) {
    if (!selectedSkill?.pluginName || !selectedSkill.marketplaceName) return;
    setLoadingFile(true);
    setSelectedFile(relativePath);
    setImageDataUrl(null);
    if (isImagePath(relativePath)) {
      const dataUrl = await window.nakiros.readSkillFileAsDataUrl({
        scope: 'plugin',
        marketplaceName: selectedSkill.marketplaceName,
        pluginName: selectedSkill.pluginName,
        skillName: selectedSkill.name,
        relativePath,
      });
      setImageDataUrl(dataUrl);
      setFileContent('');
      setOriginalContent('');
    } else {
      const content = await window.nakiros.readPluginSkillFile(
        selectedSkill.marketplaceName,
        selectedSkill.pluginName,
        selectedSkill.name,
        relativePath,
      );
      const text = content ?? '';
      setFileContent(text);
      setOriginalContent(text);
    }
    setLoadingFile(false);
  }

  async function handleSave() {
    if (!selectedSkill?.pluginName || !selectedSkill.marketplaceName || !selectedFile) return;
    setSaving(true);
    await window.nakiros.savePluginSkillFile(
      selectedSkill.marketplaceName,
      selectedSkill.pluginName,
      selectedSkill.name,
      selectedFile,
      fileContent,
    );
    setOriginalContent(fileContent);
    setSaving(false);
  }

  async function handleRunEvals(skill: Skill) {
    if (starting || !skill.pluginName || !skill.marketplaceName) return;
    setStarting(true);
    try {
      const response = await window.nakiros.startEvalRuns({
        scope: 'plugin',
        marketplaceName: skill.marketplaceName,
        pluginName: skill.pluginName,
        skillName: skill.name,
        includeBaseline,
      });
      setActiveRuns({ runIds: response.runIds, iteration: response.iteration, skill });
    } catch (err) {
      console.error(err);
      alert(t('alertEvalFailed', { message: (err as Error).message }));
    } finally {
      setStarting(false);
    }
  }

  async function handleStartAudit(skill: Skill) {
    if (auditing || !skill.pluginName || !skill.marketplaceName) return;
    setAuditing(true);
    try {
      const run = await window.nakiros.startAudit({
        scope: 'plugin',
        marketplaceName: skill.marketplaceName,
        pluginName: skill.pluginName,
        skillName: skill.name,
      });
      setActiveAudit({ run, skill });
    } catch (err) {
      alert(t('alertAuditFailed', { message: (err as Error).message }));
    } finally {
      setAuditing(false);
    }
  }

  async function handleStartFix(skill: Skill) {
    if (fixing || !skill.pluginName || !skill.marketplaceName) return;
    setFixing(true);
    try {
      const run = await window.nakiros.startFix({
        scope: 'plugin',
        marketplaceName: skill.marketplaceName,
        pluginName: skill.pluginName,
        skillName: skill.name,
      });
      setActiveFix({ run, skill });
    } catch (err) {
      alert(t('alertFixFailed', { message: (err as Error).message }));
    } finally {
      setFixing(false);
    }
  }

  const dirty = fileContent !== originalContent;
  const isMarkdown = selectedFile?.endsWith('.md') ?? false;

  function resumeOngoing(skill: Skill) {
    const ongoing = ongoingRunsByKey.get(skillKey(skill));
    if (!ongoing) return;
    setActiveRuns({ runIds: ongoing.runIds, iteration: ongoing.iteration, skill });
  }

  if (activeRuns) {
    return (
      <EvalRunsView
        scope="plugin"
        marketplaceName={activeRuns.skill.marketplaceName}
        pluginName={activeRuns.skill.pluginName}
        skillName={activeRuns.skill.name}
        initialRunIds={activeRuns.runIds}
        iteration={activeRuns.iteration}
        onClose={() => {
          setActiveRuns(null);
          window.nakiros.listPluginSkills().then(setSkills);
        }}
      />
    );
  }

  if (activeAudit) {
    return (
      <AuditView
        scope="plugin"
        marketplaceName={activeAudit.skill.marketplaceName}
        pluginName={activeAudit.skill.pluginName}
        skillName={activeAudit.skill.name}
        initialRun={activeAudit.run}
        onClose={() => {
          setActiveAudit(null);
          window.nakiros.listPluginSkills().then(setSkills);
        }}
      />
    );
  }

  if (activeFix) {
    return (
      <FixView
        scope="plugin"
        marketplaceName={activeFix.skill.marketplaceName}
        pluginName={activeFix.skill.pluginName}
        skillName={activeFix.skill.name}
        initialRun={activeFix.run}
        onClose={() => {
          setActiveFix(null);
          window.nakiros.listPluginSkills().then(setSkills);
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

  if (selectedSkill) {
    const skill = selectedSkill;
    const currentKey = skillKey(skill);

    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <TopBar onBack={onBack} title={t('topBarTitle')} t={t} />
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-2.5">
          <button
            onClick={() => setSelectedKey(null)}
            className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft size={16} />
          </button>
          <Sparkles size={14} className="text-[var(--primary)]" />
          <span className="font-semibold text-[var(--text-primary)]">{skill.name}</span>
          {skill.pluginName && (
            <span className="rounded bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
              {t('pluginBadge', {
                marketplace: skill.marketplaceName ?? '',
                plugin: skill.pluginName,
              })}
            </span>
          )}

          {skill.evals?.latestPassRate != null && <PassRateBadge rate={skill.evals.latestPassRate} />}

          <div className="flex-1" />

          {detailTab === 'audits' && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const active = activeAuditByKey.get(currentKey);
                  if (active) setActiveAudit({ run: active, skill });
                  else handleStartAudit(skill);
                }}
                disabled={auditing}
                className={clsx(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                  activeAuditByKey.has(currentKey)
                    ? 'border border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)] hover:bg-[var(--primary-soft)]/80'
                    : 'bg-[var(--primary)] text-white hover:opacity-90',
                )}
                title={
                  activeAuditByKey.has(currentKey) ? t('auditResumeTooltip') : t('auditTooltip')
                }
              >
                {activeAuditByKey.has(currentKey) ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Search size={12} />
                )}
                {activeAuditByKey.has(currentKey)
                  ? t('auditRunning')
                  : auditing
                    ? t('auditStarting')
                    : t('audit')}
              </button>

              <button
                onClick={() => {
                  const active = activeFixByKey.get(currentKey);
                  if (active) setActiveFix({ run: active, skill });
                  else handleStartFix(skill);
                }}
                disabled={fixing || (!activeFixByKey.has(currentKey) && skill.auditCount === 0)}
                className={clsx(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                  activeFixByKey.has(currentKey)
                    ? 'border border-amber-400 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                    : 'bg-amber-500 text-white hover:opacity-90',
                )}
                title={
                  activeFixByKey.has(currentKey)
                    ? t('fixResumeTooltip')
                    : skill.auditCount === 0
                      ? t('fixNoAuditTooltip')
                      : t('fixTooltip')
                }
              >
                {activeFixByKey.has(currentKey) ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Wrench size={12} />
                )}
                {activeFixByKey.has(currentKey)
                  ? t('fixRunning')
                  : fixing
                    ? t('fixStarting')
                    : t('fix')}
              </button>
            </div>
          )}

          {detailTab === 'evals' && skill.evals && skill.evals.definitions.length > 0 && (
            <div className="flex items-center gap-2">
              {ongoingRunsByKey.has(currentKey) ? (
                <button
                  onClick={() => resumeOngoing(skill)}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white"
                >
                  <Loader2 size={12} className="animate-spin" />
                  {t('resumeEvals', { count: ongoingRunsByKey.get(currentKey)!.runIds.length })}
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
                    onClick={() => handleRunEvals(skill)}
                    disabled={starting}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
                  >
                    <Play size={12} />
                    {starting ? t('evalStarting') : t('runEvals')}
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
          <SkillAuditsTab
            scope="plugin"
            marketplaceName={skill.marketplaceName}
            pluginName={skill.pluginName}
            skillName={skill.name}
          />
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

        {detailTab === 'evals' && <EvalsPanel skill={skill} scope="plugin" t={t} />}
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar onBack={onBack} title={t('topBarTitle')} t={t} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-[900px]">
          <div className="mb-4 flex items-center gap-2">
            <Plug size={18} className="text-amber-400" />
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              {t('heading', { count: skills.length })}
            </h2>
          </div>
          <p className="mb-6 text-sm text-[var(--text-muted)]">
            {t('descriptionStart')}{' '}
            <code className="rounded bg-[var(--bg-muted)] px-1">
              ~/.claude/plugins/marketplaces/&lt;mkt&gt;/plugins/&lt;plugin&gt;/skills/
            </code>
            . {t('descriptionMiddle')}
          </p>

          {skills.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-[var(--line-strong)] px-4 py-3.5 text-[13px] text-[var(--text-muted)]">
              {t('noSkills')}
            </div>
          ) : selectedMarketplace === null ? (
            <div className="grid grid-cols-2 gap-4">
              {groupByMarketplace(skills).map(([marketplaceName, mktSkills]) => {
                const pluginCount = new Set(mktSkills.map((s) => s.pluginName ?? '')).size;
                return (
                  <button
                    key={marketplaceName}
                    onClick={() => setSelectedMarketplace(marketplaceName)}
                    className="flex items-center gap-4 rounded-xl border border-[var(--line)] bg-[var(--bg-card)] p-5 text-left transition-colors hover:border-[var(--primary)]"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                      <Plug size={22} className="text-amber-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-bold text-[var(--text-primary)]">
                        {marketplaceName || t('unknownMarketplace')}
                      </div>
                      <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {t('marketplaceCount', { count: mktSkills.length })} ·{' '}
                        {t('marketplacePluginCount', { count: pluginCount })}
                      </div>
                    </div>
                    <ChevronRight size={18} className="shrink-0 text-[var(--text-muted)]" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedMarketplace(null)}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                >
                  <ArrowLeft size={14} />
                  {t('marketplacesBack')}
                </button>
                <Plug size={14} className="text-amber-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
                  {selectedMarketplace || t('unknownMarketplace')}
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(() => {
                  const mktSkills = skills.filter(
                    (s) => (s.marketplaceName ?? '') === selectedMarketplace,
                  );
                  return mktSkills.map((skill) => {
                      const currentKey = skillKey(skill);
                      return (
                        <button
                          key={currentKey}
                          onClick={() => openSkill(skill)}
                          className="flex flex-col items-start gap-2 rounded-lg border border-[var(--line)] bg-[var(--bg-card)] p-4 text-left transition-colors hover:border-[var(--primary)]"
                        >
                          <div className="flex w-full items-center justify-between">
                            <div className="flex min-w-0 items-center gap-2">
                              <Sparkles size={16} className="text-[var(--primary)]" />
                              <span className="truncate text-sm font-bold text-[var(--text-primary)]">
                                {skill.name}
                              </span>
                              {ongoingRunsByKey.has(currentKey) && (
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    resumeOngoing(skill);
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
                          {skill.pluginName && (
                            <span className="rounded bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                              {t('pluginOnlyBadge', { plugin: skill.pluginName })}
                            </span>
                          )}
                          {skill.content && (
                            <p className="line-clamp-2 text-xs text-[var(--text-muted)]">
                              {skill.content.slice(0, 200)}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1.5">
                            {skill.hasEvals && (
                              <Badge
                                label={t('evalsBadge', {
                                  count: skill.evals?.definitions.length ?? 0,
                                })}
                              />
                            )}
                            {skill.auditCount > 0 && (
                              <Badge label={t('auditsBadge', { count: skill.auditCount })} />
                            )}
                            {skill.hasReferences && <Badge label={t('refsBadge')} />}
                            {skill.hasTemplates && <Badge label={t('templatesBadge')} />}
                            <Badge label={t('filesBadge', { count: countFiles(skill.files) })} />
                          </div>
                        </button>
                      );
                    });
                })()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TopBar({
  onBack,
  title,
  t,
}: {
  onBack(): void;
  title: string;
  t: TFunction<'plugin-skills'>;
}) {
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

function EvalsPanel({
  skill,
  scope,
  t,
}: {
  skill: Skill;
  scope: SkillScope;
  t: TFunction<'plugin-skills'>;
}) {
  const [expandedEval, setExpandedEval] = useState<string | null>(null);
  void expandedEval;
  void setExpandedEval;

  if (!skill.evals || skill.evals.definitions.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
        <FlaskConical size={32} />
        <p className="text-sm">—</p>
      </div>
    );
  }

  const { definitions } = skill.evals;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-6">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {definitions.length} evals
        </h3>
        <div className="flex flex-col gap-1.5">
          {definitions.map((def) => (
            <div
              key={def.id}
              className="rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[var(--text-primary)]">{def.name}</span>
                <Badge label={`${def.assertions.length} assertions`} />
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{def.prompt}</p>
            </div>
          ))}
        </div>
      </div>

      <EvalMatrix
        request={{
          scope,
          marketplaceName: skill.marketplaceName,
          pluginName: skill.pluginName,
          skillName: skill.name,
        }}
      />
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _EvalRow({
  grading,
  expanded,
  onToggle,
}: {
  grading: SkillEvalGrading;
  expanded: boolean;
  onToggle(): void;
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
          </div>
        </td>
        <td className="py-2 text-center">
          {withSkill ? (
            <span className="text-xs">
              <span className="text-emerald-400">{withSkill.passed}✓</span>
              {withSkill.failed > 0 && (
                <span className="ml-1 text-red-400">{withSkill.failed}✗</span>
              )}
            </span>
          ) : (
            <span className="text-xs text-[var(--text-muted)]">—</span>
          )}
        </td>
        <td className="py-2 text-center">
          {withoutSkill ? (
            <span className="text-xs">
              <span className="text-emerald-400">{withoutSkill.passed}✓</span>
              {withoutSkill.failed > 0 && (
                <span className="ml-1 text-red-400">{withoutSkill.failed}✗</span>
              )}
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
      {expanded && humanFeedback && (
        <tr>
          <td colSpan={4} className="pb-3">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
              <p className="text-[var(--text-primary)]">{humanFeedback}</p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _RunBlock({ title, run }: { title: string; run: SkillEvalGradingRun }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-semibold text-[var(--text-primary)]">{title}</span>
        <PassRateBadge rate={run.passRate} size="sm" />
      </div>
      <div className="flex flex-col gap-1">
        {run.assertions.map((a, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            {a.passed ? (
              <CheckCircle size={12} className="mt-0.5 shrink-0 text-emerald-400" />
            ) : (
              <XCircle size={12} className="mt-0.5 shrink-0 text-red-400" />
            )}
            <span className="text-[var(--text-primary)]">{a.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

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

function groupByMarketplace(skills: Skill[]): [string, Skill[]][] {
  const groups = new Map<string, Skill[]>();
  for (const skill of skills) {
    const key = skill.marketplaceName ?? '';
    const bucket = groups.get(key) ?? [];
    bucket.push(skill);
    groups.set(key, bucket);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
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
          <FileTree
            entries={entry.children}
            selectedPath={selectedPath}
            onSelect={onSelect}
            depth={depth + 1}
          />
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
