import type { StoredWorkspace } from '@nakiros/shared';

export interface SettingsBaseProps {
  workspace: StoredWorkspace;
  onUpdate(workspace: StoredWorkspace): Promise<void>;
}

export interface SettingsGeneralProps extends SettingsBaseProps {
  onDelete?(): void;
}

export interface SettingsPMProps extends SettingsBaseProps {
  onTicketsRefresh?(): void;
}

