import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { WORKFLOW_CAPABILITIES } from '../../utils/workflow-capabilities';
import { Button, Card, Input } from '../ui';
import { SettingsDanger } from './SettingsDanger';
import type { SettingsGeneralProps } from './types';

export function SettingsGeneral({ workspace, onUpdate, onDelete }: SettingsGeneralProps) {
  const { t } = useTranslation('settings');
  const [name, setName] = useState(workspace.name);

  useEffect(() => {
    setName(workspace.name);
  }, [workspace.id, workspace.name]);

  async function handleNameBlur() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === workspace.name) return;
    await onUpdate({ ...workspace, name: trimmed });
  }

  const docLangs = [
    { value: 'Système', label: t('languageSystem') },
    { value: 'Français', label: t('languageFrench') },
    { value: 'English', label: t('languageEnglish') },
  ] as const;
  const selectedDocLang = workspace.documentLanguage ?? 'Système';

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="mb-1 mt-0 text-xl font-bold">{t('navGeneral')}</h2>
      </div>

      <Card padding="md" className="rounded-[10px] bg-[var(--bg-soft)]">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void handleNameBlur()}
          label={t('projectNameLabel')}
          className="rounded-[10px] border-[var(--line)] bg-[var(--bg-card)] px-2.5 py-2 text-[13px]"
        />
      </Card>

      <Card padding="md" className="rounded-[10px] bg-[var(--bg-soft)]">
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
          {t('docLangLabel')}
        </span>
        <p className="m-0 text-xs text-[var(--text-muted)]">{t('docLangHint')}</p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {docLangs.map((lang) => (
            <Button
              key={lang.value}
              type="button"
              variant="secondary"
              onClick={() => void onUpdate({ ...workspace, documentLanguage: lang.value })}
              className={clsx(
                'h-8 rounded-[10px] px-2.5 text-xs font-bold',
                selectedDocLang === lang.value
                  ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                  : 'border-[var(--line)] bg-[var(--bg-soft)] text-[var(--text)]',
              )}
            >
              {lang.label}
            </Button>
          ))}
        </div>
      </Card>

      <Card padding="md" className="rounded-[10px] bg-[var(--bg-soft)]">
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
          {t('workflowAvailabilityTitle')}
        </span>
        <p className="m-0 text-xs text-[var(--text-muted)]">{t('workflowAvailabilitySubtitle')}</p>
        <div className="mt-2.5 flex flex-col gap-2">
          {WORKFLOW_CAPABILITIES.map((capability) => (
            <Card key={capability.id} padding="sm" className="rounded-[10px] bg-[var(--bg-card)]">
              <div className="flex items-center justify-between gap-2.5">
                <strong className="text-[13px]">{capability.label}</strong>
                <span
                  className={clsx(
                    'inline-flex rounded-[10px] border px-1.5 py-0.5 text-[10px] font-bold',
                    capability.status === 'stable'
                      ? 'border-[#10b981] bg-[#d1fae5] text-[#065f46]'
                      : 'border-[#f59e0b] bg-[#fef3c7] text-[#92400e]',
                  )}
                >
                  {capability.status === 'stable' ? t('workflowStatusStable') : t('workflowStatusBeta')}
                </span>
              </div>
              <code className="mt-1 text-[11px]">{capability.command}</code>
              {capability.status === 'beta' && (
                <p className="mb-0 mt-1 text-xs text-[var(--text-muted)]">
                  {t('workflowBetaHint')} {capability.fallbackMessage}
                </p>
              )}
            </Card>
          ))}
        </div>
      </Card>

      <SettingsDanger workspace={workspace} onDeleted={onDelete} />
    </div>
  );
}

