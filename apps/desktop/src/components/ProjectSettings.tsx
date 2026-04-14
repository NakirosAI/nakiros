import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch, LayoutDashboard, Plug, User } from 'lucide-react';
import clsx from 'clsx';
import type { StoredWorkspace } from '@nakiros/shared';
import { SettingsGeneral, SettingsGit, SettingsMCP, SettingsPM } from './settings';

type SettingsSection = 'general' | 'git' | 'pm' | 'mcps';

interface Props {
  workspace: StoredWorkspace;
  onUpdate(workspace: StoredWorkspace): Promise<void>;
  onTicketsRefresh?(): void;
  onDelete?(): void;
}

export default function ProjectSettings({ workspace, onUpdate, onTicketsRefresh, onDelete }: Props) {
  const { t } = useTranslation('settings');
  const [section, setSection] = useState<SettingsSection>('general');

  const navItems: { id: SettingsSection; label: string; icon: ReactNode }[] = [
    { id: 'general', label: t('navGeneral'), icon: <User size={15} /> },
    { id: 'git', label: t('navGit'), icon: <GitBranch size={15} /> },
    { id: 'pm', label: t('navPM'), icon: <LayoutDashboard size={15} /> },
    { id: 'mcps', label: t('navMCPs'), icon: <Plug size={15} /> },
  ];

  return (
    <div className="flex flex-1 overflow-hidden">
      <nav className="flex w-40 shrink-0 flex-col gap-0.5 border-r border-[var(--line)] bg-[var(--bg-soft)] p-[10px_8px]">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setSection(item.id)}
            className={clsx(
              'flex w-full items-center gap-2 rounded-[10px] border px-[10px] py-2 text-left text-[13px]',
              section === item.id
                ? 'border-[var(--primary)] bg-[var(--primary-soft)] font-bold text-[var(--primary)]'
                : 'border-transparent font-medium text-[var(--text)]',
            )}
          >
            <span className={clsx('shrink-0', section === item.id ? 'opacity-100' : 'opacity-60')}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[640px]">
          {section === 'general' && <SettingsGeneral workspace={workspace} onUpdate={onUpdate} onDelete={onDelete} />}
          {section === 'git' && <SettingsGit workspace={workspace} onUpdate={onUpdate} />}
          {section === 'pm' && <SettingsPM workspace={workspace} onUpdate={onUpdate} onTicketsRefresh={onTicketsRefresh} />}
          {section === 'mcps' && <SettingsMCP workspace={workspace} onUpdate={onUpdate} />}
        </div>
      </div>
    </div>
  );
}
