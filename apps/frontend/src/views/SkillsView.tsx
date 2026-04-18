import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, ChevronDown, File, Folder, Loader2, Play, Plus, Save, Search, Sparkles, CheckCircle, Wrench, XCircle, FlaskConical } from 'lucide-react';
import clsx from 'clsx';
import type { AuditRun, Project, Skill, SkillFileEntry, SkillEvalGrading, SkillEvalGradingRun } from '@nakiros/shared';
import { Checkbox, MarkdownViewer } from '../components/ui';
import { isImagePath } from '../utils/file-types';
import EvalRunsView from './EvalRunsView';
import AuditView from './AuditView';
import FixView from './FixView';
import SkillAuditsTab from '../components/skill/SkillAuditsTab';

interface Props {
  project: Project;
}

type SkillDetailTab = 'files' | 'evals' | 'audits';

export default function SkillsView({ project }: Props) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<SkillDetailTab>('files');

  // File viewer state
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
  const [activeCreate, setActiveCreate] = useState<{ run: AuditRun; skillName: string } | null>(null);
  const [creating, setCreating] = useState(false);
  /** Any in-flight create for this project — surfaced as a top-level "Draft in progress" badge. */
  const [pendingCreate, setPendingCreate] = useState<AuditRun | null>(null);
  /** When non-null, the "New skill name" modal is open (Electron disables window.prompt). */
  const [createNameInput, setCreateNameInput] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [ongoingRunsBySkill, setOngoingRunsBySkill] = useState<Map<string, { runIds: string[]; iteration: number }>>(new Map());
  const [activeFixBySkill, setActiveFixBySkill] = useState<Map<string, AuditRun>>(new Map());
  const [activeAuditBySkill, setActiveAuditBySkill] = useState<Map<string, AuditRun>>(new Map());

  useEffect(() => {
    const terminalStatuses = new Set(['completed', 'failed', 'stopped']);

    async function pollOngoing() {
      const all = await window.nakiros.listEvalRuns();
      const projectActive = all.filter((r) => r.scope === 'project' && !terminalStatuses.has(r.status));
      const map = new Map<string, { runIds: string[]; iteration: number }>();
      for (const run of projectActive) {
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
        if (run.scope !== 'project' || run.projectId !== project.id) continue;
        map.set(run.skillName, run);
      }
      setActiveFixBySkill(map);
    }

    async function pollAudits() {
      const all = await window.nakiros.listActiveAuditRuns();
      const map = new Map<string, AuditRun>();
      for (const run of all) {
        if (run.scope !== 'project' || run.projectId !== project.id) continue;
        map.set(run.skillName, run);
      }
      setActiveAuditBySkill(map);
    }

    async function pollCreate() {
      const all = await window.nakiros.listActiveCreateRuns();
      // There's at most one create per (scope, projectId, skillName); keep the
      // most recent one so reopening the view picks up an in-flight draft.
      const relevant = all.filter((r) => r.scope === 'project' && r.projectId === project.id);
      setPendingCreate(relevant[0] ?? null);
    }

    void pollOngoing();
    void pollFixes();
    void pollAudits();
    void pollCreate();
    const interval = setInterval(() => {
      void pollOngoing();
      void pollFixes();
      void pollAudits();
      void pollCreate();
    }, 2000);
    return () => clearInterval(interval);
  }, [project.id]);

  function resumeOngoing(skillName: string) {
    const ongoing = ongoingRunsBySkill.get(skillName);
    if (!ongoing) return;
    setActiveRuns({ runIds: ongoing.runIds, iteration: ongoing.iteration, skillName });
  }

  useEffect(() => {
    setLoading(true);
    window.nakiros.listProjectSkills(project.id).then((sk) => {
      setSkills(sk);
      setLoading(false);
    });
  }, [project.id]);

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
        scope: 'project',
        projectId: project.id,
        skillName: selectedSkill,
        relativePath,
      });
      setImageDataUrl(dataUrl);
      setFileContent('');
      setOriginalContent('');
    } else {
      const content = await window.nakiros.readSkillFile(project.id, selectedSkill, relativePath);
      const text = content ?? '';
      setFileContent(text);
      setOriginalContent(text);
    }
    setLoadingFile(false);
  }

  async function handleSave() {
    if (!selectedSkill || !selectedFile) return;
    setSaving(true);
    await window.nakiros.saveSkillFile(project.id, selectedSkill, selectedFile, fileContent);
    setOriginalContent(fileContent);
    setSaving(false);
  }

  async function handleRunEvals(skillName: string) {
    if (starting) return;
    setStarting(true);
    try {
      const response = await window.nakiros.startEvalRuns({
        scope: 'project',
        projectId: project.id,
        skillName,
        includeBaseline,
      });
      setActiveRuns({ runIds: response.runIds, iteration: response.iteration, skillName });
    } catch (err) {
      console.error(err);
      alert(`Failed to start eval runs: ${(err as Error).message}`);
    } finally {
      setStarting(false);
    }
  }

  async function handleStartAudit(skillName: string) {
    if (auditing) return;
    setAuditing(true);
    try {
      const run = await window.nakiros.startAudit({
        scope: 'project',
        projectId: project.id,
        skillName,
      });
      setActiveAudit({ run, skillName });
    } catch (err) {
      alert(`Failed to start audit: ${(err as Error).message}`);
    } finally {
      setAuditing(false);
    }
  }

  async function handleStartFix(skillName: string) {
    if (fixing) return;
    setFixing(true);
    try {
      const run = await window.nakiros.startFix({
        scope: 'project',
        projectId: project.id,
        skillName,
      });
      setActiveFix({ run, skillName });
    } catch (err) {
      alert(`Failed to start fix: ${(err as Error).message}`);
    } finally {
      setFixing(false);
    }
  }

  function openCreateNameModal() {
    if (creating) return;
    setCreateError(null);
    setCreateNameInput('');
  }

  async function submitCreateName() {
    if (creating || createNameInput == null) return;
    const name = createNameInput.trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      setCreateError('Use lowercase letters, numbers, and hyphens. Must start with a letter.');
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

  const dirty = fileContent !== originalContent;
  const isMarkdown = selectedFile?.endsWith('.md') ?? false;

  if (activeRuns) {
    return (
      <EvalRunsView
        scope="project"
        projectId={project.id}
        skillName={activeRuns.skillName}
        initialRunIds={activeRuns.runIds}
        iteration={activeRuns.iteration}
        onClose={() => {
          setActiveRuns(null);
          window.nakiros.listProjectSkills(project.id).then(setSkills);
        }}
      />
    );
  }

  if (activeAudit) {
    return (
      <AuditView
        scope="project"
        projectId={project.id}
        skillName={activeAudit.skillName}
        initialRun={activeAudit.run}
        onClose={() => {
          setActiveAudit(null);
          window.nakiros.listProjectSkills(project.id).then(setSkills);
        }}
      />
    );
  }

  if (activeFix) {
    return (
      <FixView
        scope="project"
        projectId={project.id}
        skillName={activeFix.skillName}
        initialRun={activeFix.run}
        onClose={() => {
          setActiveFix(null);
          window.nakiros.listProjectSkills(project.id).then(setSkills);
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
          window.nakiros.listProjectSkills(project.id).then(setSkills);
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">
        Loading skills...
      </div>
    );
  }

  // Skill detail
  if (selectedSkill) {
    const skill = skills.find((s) => s.name === selectedSkill);
    if (!skill) return null;

    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Skill header */}
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-2.5">
          <button
            onClick={() => setSelectedSkill(null)}
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

          <button
            onClick={() => {
              const active = activeAuditBySkill.get(skill.name);
              if (active) setActiveAudit({ run: active, skillName: skill.name });
              else handleStartAudit(skill.name);
            }}
            disabled={auditing}
            className={clsx(
              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
              activeAuditBySkill.has(skill.name)
                ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)] hover:bg-[var(--primary-soft)]/80'
                : 'border-[var(--line)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--primary)] hover:text-[var(--primary)]',
            )}
            title={
              activeAuditBySkill.has(skill.name)
                ? 'An audit is already running for this skill — click to resume'
                : 'Run an audit of this skill (uses nakiros-skill-factory)'
            }
          >
            {activeAuditBySkill.has(skill.name) ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            {activeAuditBySkill.has(skill.name) ? 'Audit running' : auditing ? 'Starting...' : 'Audit'}
          </button>

          <button
            onClick={() => {
              const active = activeFixBySkill.get(skill.name);
              if (active) setActiveFix({ run: active, skillName: skill.name });
              else handleStartFix(skill.name);
            }}
            disabled={fixing}
            className={clsx(
              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
              activeFixBySkill.has(skill.name)
                ? 'border-amber-400 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                : 'border-[var(--line)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-amber-400 hover:text-amber-400',
            )}
            title={
              activeFixBySkill.has(skill.name)
                ? 'A fix session is already running for this skill — click to resume'
                : 'Apply fixes based on the latest audit + eval results + feedback'
            }
          >
            {activeFixBySkill.has(skill.name) ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />}
            {activeFixBySkill.has(skill.name) ? 'Fix running' : fixing ? 'Starting...' : 'Fix'}
          </button>

          {detailTab === 'evals' && skill.evals && skill.evals.definitions.length > 0 && (
            <div className="flex items-center gap-2">
              {ongoingRunsBySkill.has(skill.name) ? (
                <button
                  onClick={() => resumeOngoing(skill.name)}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white"
                >
                  <Loader2 size={12} className="animate-spin" />
                  Resume ({ongoingRunsBySkill.get(skill.name)!.runIds.length} running)
                </button>
              ) : (
                <>
                  <label
                    className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--text-muted)]"
                    title="Also run each eval without the skill loaded, to measure real skill value via delta"
                  >
                    <Checkbox
                      checked={includeBaseline}
                      onCheckedChange={(checked) => setIncludeBaseline(checked === true)}
                    />
                    Include baseline
                  </label>
                  <button
                    onClick={() => handleRunEvals(skill.name)}
                    disabled={starting}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
                  >
                    <Play size={12} />
                    {starting ? 'Starting...' : 'Run evals'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Tab switcher */}
          <div className="flex rounded-lg border border-[var(--line)] bg-[var(--bg-soft)]">
            <TabButton active={detailTab === 'files'} onClick={() => setDetailTab('files')}>
              Files
            </TabButton>
            <TabButton active={detailTab === 'evals'} onClick={() => setDetailTab('evals')}>
              <FlaskConical size={12} />
              Evals {skill.evals && `(${skill.evals.definitions.length})`}
            </TabButton>
            <TabButton active={detailTab === 'audits'} onClick={() => setDetailTab('audits')}>
              <Search size={12} />
              Audits {skill.auditCount > 0 && `(${skill.auditCount})`}
            </TabButton>
          </div>
        </div>

        {detailTab === 'audits' && (
          <SkillAuditsTab scope="project" projectId={project.id} skillName={skill.name} />
        )}

        {/* Tab content */}
        {detailTab === 'files' && (
          <div className="flex flex-1 overflow-hidden">
            {/* File tree sidebar */}
            <div className="flex w-[260px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--bg-soft)]">
              <div className="flex-1 overflow-y-auto py-1">
                <FileTree entries={skill.files} selectedPath={selectedFile} onSelect={openFile} />
              </div>
            </div>

            {/* File content */}
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
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                  {loadingFile ? (
                    <div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">Loading...</div>
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
                      Unable to display image
                    </div>
                  ) : isMarkdown && !dirty ? (
                    <div className="flex-1 overflow-y-auto p-6">
                      <MarkdownViewer content={fileContent} />
                    </div>
                  ) : (
                    <textarea
                      value={fileContent}
                      onChange={(e) => setFileContent(e.target.value)}
                      className="flex-1 resize-none border-none bg-[var(--bg-base)] p-4 font-mono text-sm text-[var(--text-primary)] outline-none"
                      spellCheck={false}
                    />
                  )}
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
                  <File size={32} />
                  <p className="text-sm">Select a file to view</p>
                </div>
              )}
            </div>
          </div>
        )}

        {detailTab === 'evals' && (
          <EvalsPanel skill={skill} />
        )}
      </div>
    );
  }

  // Skills list
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">
          Skills ({skills.length})
        </h2>
        <div className="flex items-center gap-2">
          {pendingCreate && (
            <button
              onClick={() => setActiveCreate({ run: pendingCreate, skillName: pendingCreate.skillName })}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-400 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
              title={`Resume the in-progress draft: ${pendingCreate.skillName}`}
            >
              <Loader2 size={12} className="animate-spin" />
              Draft: {pendingCreate.skillName}
            </button>
          )}
          <button
            onClick={openCreateNameModal}
            disabled={creating}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
            title="Create a new skill in this project using nakiros-skill-factory"
          >
            <Plus size={12} />
            {creating ? 'Starting...' : 'New skill'}
          </button>
        </div>
      </div>
      {skills.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[var(--line-strong)] px-4 py-3.5 text-[13px] text-[var(--text-muted)]">
          No skills found. Skills should be in <code className="rounded bg-[var(--bg-muted)] px-1">.claude/skills/</code>
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
                      running
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
                {skill.hasEvals && <Badge label={`${skill.evals?.definitions.length ?? 0} evals`} />}
                {skill.auditCount > 0 && <Badge label={`${skill.auditCount} audits`} />}
                {skill.hasReferences && <Badge label="refs" />}
                {skill.hasTemplates && <Badge label="templates" />}
                <Badge label={`${countFiles(skill.files)} files`} />
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
            <h3 className="mb-2 text-sm font-bold text-[var(--text-primary)]">Create a new skill</h3>
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              Pick a short, kebab-case name. The skill-factory will ask design questions before writing any file.
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
              placeholder="data-migration"
              disabled={creating}
              className="w-full rounded border border-[var(--line)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)] disabled:opacity-50"
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
                Cancel
              </button>
              <button
                onClick={() => void submitCreateName()}
                disabled={creating || !createNameInput.trim()}
                className="flex items-center gap-1.5 rounded bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {creating && <Loader2 size={12} className="animate-spin" />}
                {creating ? 'Starting…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Evals Panel ─────────────────────────────────────────────────────────────

function EvalsPanel({ skill }: { skill: Skill }) {
  const [expandedIter, setExpandedIter] = useState<number | null>(
    skill.evals?.iterations.length ? skill.evals.iterations[skill.evals.iterations.length - 1].number : null,
  );
  const [expandedEval, setExpandedEval] = useState<string | null>(null);

  if (!skill.evals || skill.evals.definitions.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
        <FlaskConical size={32} />
        <p className="text-sm">No evals defined for this skill</p>
      </div>
    );
  }

  const { definitions, iterations } = skill.evals;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Eval definitions summary */}
      <div className="mb-6">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Eval Definitions ({definitions.length})
        </h3>
        <div className="flex flex-col gap-1.5">
          {definitions.map((def) => (
            <div key={def.id} className="rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[var(--text-primary)]">{def.name}</span>
                <Badge label={`${def.assertions.length} assertions`} />
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{def.prompt}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Iterations */}
      {iterations.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Iterations ({iterations.length})
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
                      Iteration {iter.number}
                    </span>
                    {isLatest && (
                      <span className="rounded bg-[var(--primary)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                        latest
                      </span>
                    )}
                    {!hasBaseline && (
                      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-400" title="No baseline (without_skill) — absolute pass rate alone is weak evidence">
                        no baseline
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-3 text-xs text-[var(--text-muted)]">
                      <span>
                        with: <PassRateBadge rate={iter.withSkill.passRate} size="sm" />
                      </span>
                      {hasBaseline && iter.withoutSkill && (
                        <span>
                          without: <PassRateBadge rate={iter.withoutSkill.passRate} size="sm" />
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
                          <div className="mb-0.5 text-[var(--text-muted)]">With skill</div>
                          <div className="font-semibold">
                            {iter.withSkill.passedAssertions}/{iter.withSkill.totalAssertions} ·{' '}
                            {formatTokens(iter.withSkill.tokens)} · {formatDuration(iter.withSkill.durationMs)}
                          </div>
                        </div>
                        <div>
                          <div className="mb-0.5 text-[var(--text-muted)]">Without skill (baseline)</div>
                          <div className="font-semibold">
                            {iter.withoutSkill ? (
                              <>
                                {iter.withoutSkill.passedAssertions}/{iter.withoutSkill.totalAssertions} ·{' '}
                                {formatTokens(iter.withoutSkill.tokens)} · {formatDuration(iter.withoutSkill.durationMs)}
                              </>
                            ) : (
                              <span className="text-amber-400">not run — delta unavailable</span>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="mb-0.5 text-[var(--text-muted)]">Delta (skill value)</div>
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
                            <th className="pb-2 font-medium">Eval</th>
                            <th className="pb-2 text-center font-medium">With</th>
                            <th className="pb-2 text-center font-medium">Without</th>
                            <th className="pb-2 text-right font-medium">Δ</th>
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

function EvalRow({ grading, expanded, onToggle }: { grading: SkillEvalGrading; expanded: boolean; onToggle(): void }) {
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
                human review
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
              {withSkill && <RunBlock title="With skill" run={withSkill} />}
              {withoutSkill && <RunBlock title="Without skill (baseline)" run={withoutSkill} />}
              {humanFeedback && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
                  <div className="mb-1 font-semibold text-amber-400">Human review</div>
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

function RunBlock({ title, run }: { title: string; run: SkillEvalGradingRun }) {
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
            grader: {run.graderModel}
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
