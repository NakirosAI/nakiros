import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CheckCircle2, Circle, Layers3, ShieldCheck, Sparkles } from 'lucide-react';
import type {
  OnboardingChatLaunchRequest,
  StoredWorkspace,
  WorkspaceGettingStartedContext,
  WorkspaceGettingStartedState,
} from '@nakiros/shared';
// @ts-expect-error SVG imports are resolved by Vite at build time
import appIcon from '../assets/icon.svg';
import { Button, Card } from '../components/ui';
import { AGENT_DEFINITIONS } from '../constants/agents';

const POLL_INTERVAL_MS = 4_000;

interface Props {
  workspace: StoredWorkspace;
  onLaunchChat(request: OnboardingChatLaunchRequest): void;
  onContinue(): void;
  onBackHome(): void;
}

function buildRequestId(step: 1 | 2 | 3, workspaceId: string): string {
  return `onboarding-step${step}-${workspaceId}-${Date.now()}`;
}

function getAgentCommand(agentId: string): string {
  return AGENT_DEFINITIONS.find((d) => d.id === agentId)?.command ?? `/${agentId}`;
}

export default function WorkspaceGettingStarted({ workspace, onLaunchChat, onContinue, onBackHome }: Props) {
  const { t } = useTranslation('workspace-setup');

  const [ctx, setCtx] = useState<WorkspaceGettingStartedContext | null>(null);
  const [launching, setLaunching] = useState<1 | 2 | 3 | null>(null);
  const [toastStep, setToastStep] = useState<1 | 2 | 3 | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  // ── Load context on mount ──────────────────────────────────────────────────
  const loadCtx = useCallback(async () => {
    try {
      const next = await window.nakiros.getWorkspaceGettingStartedContext(workspace);
      if (!mountedRef.current) return;
      setCtx((prev) => {
        // Show toast when a step transitions to complete
        if (prev) {
          if (!prev.step1Complete && next.step1Complete) showToast(1);
          if (!prev.step2Complete && next.step2Complete) showToast(2);
          const prevStep3 = prev.state.step3.completedAt !== null;
          const nextStep3 = next.state.step3.completedAt !== null;
          if (!prevStep3 && nextStep3) showToast(3);
        }
        return next;
      });
    } catch {
      // Silent — polling will retry
    }
  }, [workspace]);

  useEffect(() => {
    mountedRef.current = true;
    void loadCtx();
    pollTimerRef.current = window.setInterval(() => { void loadCtx(); }, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id]);

  function showToast(step: 1 | 2 | 3) {
    setToastStep(step);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastStep(null), 3_000);
  }

  // ── Launch handlers ───────────────────────────────────────────────────────
  async function handleLaunch(step: 1 | 2 | 3) {
    if (!ctx) return;
    setLaunching(step);

    const agentId = step === 3 ? 'pm' : 'architect';
    const command = step === 1
      ? getAgentCommand('generate-context')
      : step === 2
        ? getAgentCommand('project-confidence')
        : getAgentCommand('dev-story'); // PM agent does not have a dedicated pm-challenge workflow yet

    const chatTitleKey = step === 1
      ? 'step1ChatTitle'
      : step === 2
        ? 'step2ChatTitle'
        : 'step3ChatTitle';

    const title = t(chatTitleKey, { workspace: workspace.name });
    const requestId = buildRequestId(step, workspace.id);

    // Persist launched conversation reference
    const updatedState: WorkspaceGettingStartedState = {
      ...ctx.state,
      [`step${step}`]: {
        ...ctx.state[`step${step}` as 'step1' | 'step2' | 'step3'],
        launchedConversationId: requestId,
      },
    };
    try {
      await window.nakiros.saveWorkspaceGettingStartedState(workspace.name, updatedState);
    } catch {
      // Non-blocking
    }

    onLaunchChat({ requestId, title, agentId, command, step });
    setLaunching(null);
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const step1Complete = ctx?.step1Complete ?? false;
  const step2Complete = ctx?.step2Complete ?? false;
  const step3Complete = ctx?.state.step3.completedAt != null;
  const allComplete = step1Complete && step2Complete && step3Complete;
  const brownfield = ctx?.brownfieldMode ?? false;

  const hasJiraConnection = Boolean(workspace.jiraConnected && workspace.projectKey);

  // Step 3 PM prerequisite: needs Jira + step 2 done
  const step3PmReady = hasJiraConnection;

  if (!ctx) {
    return (
      <div className="grid h-screen place-items-center text-[var(--text-muted)]">
        <span className="text-sm">{t('continueButton')}</span>
      </div>
    );
  }

  // ── Ready state ───────────────────────────────────────────────────────────
  if (allComplete) {
    return (
      <div className="box-border flex min-h-screen items-center justify-center px-6 py-10">
        <div className="w-full max-w-[680px] rounded-[18px] border border-[var(--line)] bg-[var(--bg-soft)] p-8 shadow-[var(--shadow-sm)] text-center">
          <CheckCircle2 size={48} className="mx-auto mb-4 text-[var(--success)]" />
          <h1 className="mt-0 text-[28px] font-[750] tracking-[-0.02em] text-[var(--text)]">
            {t('readyTitle')}
          </h1>
          <p className="mt-2 text-[15px] leading-6 text-[var(--text-muted)]">
            {t('readyDescription')}
          </p>
          <div className="mt-6">
            <Button onClick={onContinue} className="gap-2">
              {t('readyCtaOverview')}
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Steps ─────────────────────────────────────────────────────────────────
  const steps: {
    num: 1 | 2 | 3;
    icon: React.ReactNode;
    title: string;
    description: string;
    complete: boolean;
    locked: boolean;
    lockedByStep: number;
    pmWarning: boolean;
  }[] = [
    {
      num: 1,
      icon: <Sparkles size={18} className="text-[var(--primary)]" />,
      title: brownfield ? t('step1TitleBrownfield') : t('step1TitleNew'),
      description: brownfield ? t('step1DescriptionBrownfield') : t('step1DescriptionNew'),
      complete: step1Complete,
      locked: false,
      lockedByStep: 0,
      pmWarning: false,
    },
    {
      num: 2,
      icon: <Layers3 size={18} className="text-[var(--primary)]" />,
      title: t('step2Title'),
      description: t('step2Description'),
      complete: step2Complete,
      locked: !step1Complete,
      lockedByStep: 1,
      pmWarning: false,
    },
    {
      num: 3,
      icon: <ShieldCheck size={18} className="text-[var(--primary)]" />,
      title: t('step3Title'),
      description: step3PmReady ? t('step3Description') : t('step3NoPmDescription'),
      complete: step3Complete,
      locked: !step2Complete,
      lockedByStep: 2,
      pmWarning: !step3PmReady,
    },
  ];

  return (
    <div className="box-border flex min-h-screen items-center justify-center px-6 py-10">
      {/* Toast */}
      {toastStep !== null && (
        <div
          className="fixed right-5 top-5 z-50 rounded-[12px] border border-[var(--line)] bg-[var(--bg-card)] px-4 py-2.5 text-[13px] font-semibold text-[var(--success)] shadow-[var(--shadow-sm)]"
          role="status"
        >
          {t('stepComplete', { number: toastStep })}
        </div>
      )}

      <div className="w-full max-w-[760px] rounded-[18px] border border-[var(--line)] bg-[var(--bg-soft)] p-8 shadow-[var(--shadow-sm)]">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <img src={appIcon} alt="Nakiros" width={44} height={44} className="block rounded-xl" />
          <div>
            <p className="m-0 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--primary)]">
              {t('eyebrow')}
            </p>
            <h1 className="mt-1 text-[28px] font-[750] tracking-[-0.02em] text-[var(--text)]">
              {t('title', { name: workspace.name })}
            </h1>
          </div>
        </div>

        <p className="mb-8 max-w-[620px] text-[15px] leading-6 text-[var(--text-muted)]">
          {t('description')}
        </p>

        {/* Step list */}
        <div className="mb-8 flex flex-col gap-3">
          {steps.map((step) => (
            <Card
              key={step.num}
              className="rounded-[14px] border border-[var(--line)] bg-[var(--bg-card)] px-4 py-4 shadow-none"
            >
              <div className="flex items-start gap-4">
                {/* Step icon / check */}
                <div className="mt-0.5 shrink-0">
                  {step.complete ? (
                    <CheckCircle2 size={20} className="text-[var(--success)]" />
                  ) : step.locked ? (
                    <Circle size={20} className="text-[var(--text-muted)]" />
                  ) : (
                    <div className="grid h-[20px] w-[20px] place-items-center rounded-full bg-[var(--primary-soft)]">
                      {step.icon}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {t('stepLabel', { number: step.num })}
                  </p>
                  <h2 className={[
                    'm-0 mt-0.5 text-[15px] font-semibold',
                    step.complete || step.locked ? 'text-[var(--text-muted)]' : 'text-[var(--text)]',
                  ].join(' ')}>
                    {step.title}
                  </h2>
                  <p className="m-0 mt-1 text-[13px] leading-5 text-[var(--text-muted)]">
                    {step.description}
                  </p>
                  {step.locked && (
                    <p className="m-0 mt-1 text-[12px] text-[var(--warning)]">
                      {t('prerequisiteMessage', { number: step.lockedByStep })}
                    </p>
                  )}
                </div>

                {/* Launch button */}
                <div className="shrink-0">
                  {step.complete ? null : step.locked || step.pmWarning ? (
                    <Button variant="secondary" disabled className="rounded-[10px] text-[13px] opacity-40">
                      {t('launch')}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => void handleLaunch(step.num)}
                      disabled={launching === step.num}
                      className="gap-1.5 rounded-[10px] text-[13px]"
                    >
                      {launching === step.num ? t('launching') : t('launch')}
                      {launching !== step.num && <ArrowRight size={14} />}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={onContinue} variant="secondary" className="gap-2">
            {t('continueButton')}
            <ArrowRight size={16} />
          </Button>
          <Button type="button" variant="ghost" onClick={onContinue}>
            {t('skipButton')}
          </Button>
          <Button type="button" variant="ghost" onClick={onBackHome} className="ml-auto">
            {t('backHome')}
          </Button>
        </div>
      </div>
    </div>
  );
}
