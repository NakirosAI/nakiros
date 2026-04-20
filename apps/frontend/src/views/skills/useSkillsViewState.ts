import { useEffect, useMemo, useState } from 'react';
import type { AuditRun, Skill } from '@nakiros/shared';
import { isImagePath } from '../../utils/file-types';
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

  // ── Polling: ongoing evals / active fix / active audit / optional create ─
  useEffect(() => {
    const terminal = new Set(['completed', 'failed', 'stopped']);

    async function pollOngoing() {
      const all = await window.nakiros.listEvalRuns();
      const next = new Map<string, OngoingRun>();
      for (const run of all) {
        if (!config.matchesScope(run)) continue;
        if (terminal.has(run.status)) continue;
        const k = config.keyOfRun(run);
        const entry = next.get(k) ?? { runIds: [], iteration: run.iteration };
        entry.runIds.push(run.runId);
        next.set(k, entry);
      }
      setOngoingByKey(next);
    }

    async function pollFixes() {
      const all = await window.nakiros.listActiveFixRuns();
      const next = new Map<string, AuditRun>();
      for (const run of all) {
        if (!config.matchesScope(run)) continue;
        next.set(config.keyOfRun(run), run);
      }
      setActiveFixByKey(next);
    }

    async function pollAudits() {
      const all = await window.nakiros.listActiveAuditRuns();
      const next = new Map<string, AuditRun>();
      for (const run of all) {
        if (!config.matchesScope(run)) continue;
        next.set(config.keyOfRun(run), run);
      }
      setActiveAuditByKey(next);
    }

    async function pollCreate() {
      if (!config.pollActiveCreate) return;
      const run = await config.pollActiveCreate();
      setPendingCreate(run);
    }

    function tick() {
      void pollOngoing();
      void pollFixes();
      void pollAudits();
      void pollCreate();
    }

    tick();
    const interval = setInterval(tick, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.scope]);

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
      const response = await window.nakiros.startEvalRuns({ ...identity, includeBaseline });
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
