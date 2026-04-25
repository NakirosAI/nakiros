import { useEffect, useMemo, useState } from 'react';
import type { AuditRun, ClaudeModelId, Skill } from '@nakiros/shared';
import { DEFAULT_EVAL_MODEL } from '@nakiros/shared';
import { isImagePath } from '../../utils/file-types';
import { usePolling } from '../../hooks/usePolling';
import { agentRunFocus } from '../../lib/agent-run-focus';
import type { SkillIdentity, SkillsViewConfig } from './types';

export type SkillDetailTab = 'files' | 'evals' | 'audits';

type OngoingRun = { runIds: string[]; iteration: number };

/**
 * Owns every piece of state + every handler shared by all scoped skill views.
 * Each scope supplies its `SkillsViewConfig` — the hook takes care of the rest.
 */
export function useSkillsViewState(config: SkillsViewConfig) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<SkillDetailTab>('files');

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);

  const [activeRuns, setActiveRuns] = useState<{ runIds: string[]; iteration: number; skill: Skill } | null>(null);
  const [starting, setStarting] = useState(false);
  const [includeBaseline, setIncludeBaseline] = useState(true);
  const [selectedModel, setSelectedModel] = useState<ClaudeModelId>(DEFAULT_EVAL_MODEL);

  const [activeAudit, setActiveAudit] = useState<{ run: AuditRun; skill: Skill } | null>(null);
  const [auditing, setAuditing] = useState(false);

  const [activeFix, setActiveFix] = useState<{ run: AuditRun; skill: Skill } | null>(null);
  const [fixing, setFixing] = useState(false);

  const [ongoingByKey, setOngoingByKey] = useState<Map<string, OngoingRun>>(new Map());
  const [activeAuditByKey, setActiveAuditByKey] = useState<Map<string, AuditRun>>(new Map());
  const [activeFixByKey, setActiveFixByKey] = useState<Map<string, AuditRun>>(new Map());
  const [pendingCreate, setPendingCreate] = useState<AuditRun | null>(null);

  // ── Initial skill list ───────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    config.listSkills().then((sk) => {
      setSkills(sk);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.scope]);

  // ── Consume an `agentRunFocus` request after skills are loaded ───────────
  // Effect is gated on `!loading && skills.length > 0` so we never consume a
  // focus we cannot honour. Subscribes for the case where the focus is set
  // after the view has mounted (e.g. user already on this scope's view
  // clicks a run from the topbar). For `kind: 'audit'` focuses, we also
  // open the AuditView overlay — the user expects landing on the run, not
  // just on the skill.
  useEffect(() => {
    if (loading || skills.length === 0) return;

    async function tryConsume() {
      const focus = agentRunFocus.consume();
      if (!focus) return;
      if (focus.target.type !== 'skill') return;
      if (!config.matchesScope(focus.target)) {
        // Wrong scope — push it back so the matching view can take it.
        agentRunFocus.set(focus);
        return;
      }
      const match = skills.find((s) => config.keyOf(s) === config.keyOfRun(focus.target));
      if (!match) return;
      setSelectedKey(config.keyOf(match));

      // Per-kind landing: open the native overlay matching the run's kind
      // so the user lands on the run, not just on the skill.
      if (focus.kind === 'audit') {
        setDetailTab('audits');
        try {
          const auditRun = await window.nakiros.getAuditRun(focus.id);
          if (auditRun) setActiveAudit({ run: auditRun, skill: match });
        } catch (err) {
          console.error('[useSkillsViewState] getAuditRun failed', err);
        }
      } else if (focus.kind === 'fix') {
        setDetailTab('files');
        try {
          const fixRun = await window.nakiros.getFixRun(focus.id);
          if (fixRun) setActiveFix({ run: fixRun, skill: match });
        } catch (err) {
          console.error('[useSkillsViewState] getFixRun failed', err);
        }
      } else if (focus.kind === 'eval' && focus.meta?.kind === 'eval') {
        setDetailTab('evals');
        setActiveRuns({
          runIds: focus.meta.runIds,
          iteration: focus.meta.iteration,
          skill: match,
        });
      } else {
        // create — overlay is owned by SkillsView itself, not the hook.
        // Selecting the skill is the best we can do here for now.
        setDetailTab('files');
      }
    }

    void tryConsume();
    return agentRunFocus.subscribe(() => {
      void tryConsume();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, skills]);

  // ── Polling: ongoing evals / active fix / active audit / optional create ─
  usePolling(async () => {
    const terminal = new Set(['completed', 'failed', 'stopped']);

    const [evalRuns, fixRuns, auditRuns] = await Promise.all([
      window.nakiros.listEvalRuns(),
      window.nakiros.listActiveFixRuns(),
      window.nakiros.listActiveAuditRuns(),
    ]);

    const ongoing = new Map<string, OngoingRun>();
    for (const run of evalRuns) {
      if (!config.matchesScope(run)) continue;
      if (terminal.has(run.status)) continue;
      const k = config.keyOfRun(run);
      const entry = ongoing.get(k) ?? { runIds: [], iteration: run.iteration };
      entry.runIds.push(run.runId);
      ongoing.set(k, entry);
    }
    setOngoingByKey(ongoing);

    const activeFix = new Map<string, AuditRun>();
    for (const run of fixRuns) {
      if (!config.matchesScope(run)) continue;
      activeFix.set(config.keyOfRun(run), run);
    }
    setActiveFixByKey(activeFix);

    const activeAudit = new Map<string, AuditRun>();
    for (const run of auditRuns) {
      if (!config.matchesScope(run)) continue;
      activeAudit.set(config.keyOfRun(run), run);
    }
    setActiveAuditByKey(activeAudit);

    if (config.pollActiveCreate) {
      const create = await config.pollActiveCreate();
      setPendingCreate(create);
    }
  }, 2000);

  // ── Derived values ───────────────────────────────────────────────────────
  const selectedSkill = useMemo(
    () => (selectedKey ? skills.find((s) => config.keyOf(s) === selectedKey) ?? null : null),
    [selectedKey, skills, config],
  );
  const dirty = fileContent !== originalContent;
  const isMarkdown = selectedFile?.endsWith('.md') ?? false;

  // ── Handlers ─────────────────────────────────────────────────────────────
  function openSkill(skill: Skill) {
    setSelectedKey(config.keyOf(skill));
    setDetailTab('files');
    setSelectedFile(null);
    setFileContent('');
    setOriginalContent('');
    setImageDataUrl(null);
  }

  function closeSkill() {
    setSelectedKey(null);
  }

  async function openFile(relativePath: string) {
    if (!selectedSkill) return;
    setLoadingFile(true);
    setSelectedFile(relativePath);
    setImageDataUrl(null);
    try {
      if (isImagePath(relativePath)) {
        const identity = config.identityOf(selectedSkill);
        const dataUrl = await window.nakiros.readSkillFileAsDataUrl({ ...identity, relativePath });
        setImageDataUrl(dataUrl);
        setFileContent('');
        setOriginalContent('');
      } else {
        const content = await config.readFile(selectedSkill, relativePath);
        const text = content ?? '';
        setFileContent(text);
        setOriginalContent(text);
      }
    } finally {
      setLoadingFile(false);
    }
  }

  async function handleSave() {
    if (!selectedSkill || !selectedFile) return;
    setSaving(true);
    try {
      await config.saveFile(selectedSkill, selectedFile, fileContent);
      setOriginalContent(fileContent);
    } finally {
      setSaving(false);
    }
  }

  async function handleRunEvals(skill: Skill, onFailure: (message: string) => void) {
    if (starting) return;
    setStarting(true);
    try {
      const identity: SkillIdentity = config.identityOf(skill);
      const response = await window.nakiros.startEvalRuns({ ...identity, includeBaseline, model: selectedModel });
      setActiveRuns({ runIds: response.runIds, iteration: response.iteration, skill });
    } catch (err) {
      onFailure((err as Error).message);
    } finally {
      setStarting(false);
    }
  }

  async function handleStartAudit(skill: Skill, onFailure: (message: string) => void) {
    if (auditing) return;
    setAuditing(true);
    try {
      const run = await window.nakiros.startAudit(config.identityOf(skill));
      setActiveAudit({ run, skill });
    } catch (err) {
      onFailure((err as Error).message);
    } finally {
      setAuditing(false);
    }
  }

  async function handleStartFix(skill: Skill, onFailure: (message: string) => void) {
    if (fixing) return;
    setFixing(true);
    try {
      const run = await window.nakiros.startFix(config.identityOf(skill));
      setActiveFix({ run, skill });
    } catch (err) {
      onFailure((err as Error).message);
    } finally {
      setFixing(false);
    }
  }

  function resumeOngoing(skill: Skill) {
    const ongoing = ongoingByKey.get(config.keyOf(skill));
    if (!ongoing) return;
    setActiveRuns({ runIds: ongoing.runIds, iteration: ongoing.iteration, skill });
  }

  /** Called by overlay `onClose` to drop back into the list + refresh. */
  async function refreshSkills() {
    const fresh = await config.listSkills();
    setSkills(fresh);
  }

  return {
    // state
    skills,
    loading,
    selectedSkill,
    selectedKey,
    detailTab,
    setDetailTab,
    selectedFile,
    fileContent,
    setFileContent,
    imageDataUrl,
    saving,
    loadingFile,
    dirty,
    isMarkdown,
    activeRuns,
    setActiveRuns,
    starting,
    includeBaseline,
    setIncludeBaseline,
    selectedModel,
    setSelectedModel,
    activeAudit,
    setActiveAudit,
    auditing,
    activeFix,
    setActiveFix,
    fixing,
    ongoingByKey,
    activeAuditByKey,
    activeFixByKey,
    pendingCreate,
    // actions
    openSkill,
    closeSkill,
    openFile,
    handleSave,
    handleRunEvals,
    handleStartAudit,
    handleStartFix,
    resumeOngoing,
    refreshSkills,
  };
}

export type SkillsViewState = ReturnType<typeof useSkillsViewState>;
