import { useTranslation } from 'react-i18next';
import { ArrowRight, Layers3, ShieldCheck, Sparkles } from 'lucide-react';
import type { StoredWorkspace } from '@nakiros/shared';
import appIcon from '../assets/icon.svg';
import { Button } from '../components/ui';

interface Props {
  workspace: StoredWorkspace;
  onContinue(): void;
  onBackHome(): void;
}

export default function WorkspaceGettingStarted({ workspace, onContinue, onBackHome }: Props) {
  const { t } = useTranslation('onboarding');

  const steps = [
    {
      id: 'context',
      icon: <Sparkles size={18} className="text-[var(--primary)]" />,
      title: t('workspaceGettingStartedStepContextTitle'),
      description: t('workspaceGettingStartedStepContextDescription'),
    },
    {
      id: 'confidence',
      icon: <Layers3 size={18} className="text-[var(--primary)]" />,
      title: t('workspaceGettingStartedStepConfidenceTitle'),
      description: t('workspaceGettingStartedStepConfidenceDescription'),
    },
    {
      id: 'tickets',
      icon: <ShieldCheck size={18} className="text-[var(--primary)]" />,
      title: t('workspaceGettingStartedStepTicketsTitle'),
      description: t('workspaceGettingStartedStepTicketsDescription'),
    },
  ];

  return (
    <div className="box-border flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-[760px] rounded-[18px] border border-[var(--line)] bg-[var(--bg-soft)] p-8 shadow-[var(--shadow-sm)]">
        <div className="mb-8 flex items-center gap-3">
          <img
            src={appIcon}
            alt="Logo Nakiros"
            width={44}
            height={44}
            className="block rounded-xl"
          />
          <div>
            <p className="m-0 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--primary)]">
              {t('workspaceGettingStartedEyebrow')}
            </p>
            <h1 className="mt-1 text-[30px] font-[750] tracking-[-0.02em] text-[var(--text)]">
              {t('workspaceGettingStartedTitle', { name: workspace.name })}
            </h1>
          </div>
        </div>

        <p className="mb-8 max-w-[620px] text-[15px] leading-6 text-[var(--text-muted)]">
          {t('workspaceGettingStartedDescription')}
        </p>

        <div className="mb-8 grid gap-3">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className="rounded-[14px] border border-[var(--line)] bg-[var(--bg-card)] px-4 py-4"
            >
              <div className="mb-2 flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-[var(--primary-soft)]">
                  {step.icon}
                </div>
                <div>
                  <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {t('workspaceGettingStartedStepLabel', { number: index + 1 })}
                  </p>
                  <h2 className="m-0 text-[16px] font-semibold text-[var(--text)]">{step.title}</h2>
                </div>
              </div>
              <p className="m-0 text-[13px] leading-5 text-[var(--text-muted)]">{step.description}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={onContinue} className="gap-2">
            {t('workspaceGettingStartedContinue')}
            <ArrowRight size={16} />
          </Button>
          <Button type="button" variant="ghost" onClick={onBackHome}>
            {t('workspaceGettingStartedBack')}
          </Button>
        </div>
      </div>
    </div>
  );
}
