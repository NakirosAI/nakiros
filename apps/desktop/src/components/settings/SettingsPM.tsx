import { useTranslation } from 'react-i18next';
import type { SettingsPMProps } from './types';

export function SettingsPM({ workspace }: SettingsPMProps) {
  const { t } = useTranslation('settings');

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="mb-1 mt-0 text-xl font-bold">{t('navPM')}</h2>
      </div>
    </div>
  );
}
