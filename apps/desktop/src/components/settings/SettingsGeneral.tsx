import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
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

      <Card className="rounded-[16px] border-[var(--line)] bg-[var(--bg-soft)] p-5 shadow-none">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void handleNameBlur()}
          label={t('projectNameLabel')}
          className="rounded-[12px] border-[var(--line)] bg-[var(--bg-card)] px-3 py-2.5 text-[13px]"
        />
      </Card>

      <Card className="rounded-[16px] border-[var(--line)] bg-[var(--bg-soft)] p-5 shadow-none">
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
                'h-8 rounded-[10px] px-3 text-xs font-bold',
                selectedDocLang === lang.value
                  ? 'border-[var(--line-strong)] bg-[var(--bg-card)] text-[var(--text)]'
                  : 'border-[var(--line)] bg-[var(--bg-card)] text-[var(--text)]',
              )}
            >
              {lang.label}
            </Button>
          ))}
        </div>
      </Card>

      <SettingsDanger workspace={workspace} onDeleted={onDelete} />
    </div>
  );
}
