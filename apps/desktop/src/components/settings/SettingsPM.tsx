import { WorkspaceProviderCredentialsSection } from './ProviderCredentialsSettings';
import type { SettingsPMProps } from './types';

export function SettingsPM({ workspace }: SettingsPMProps) {
  return (
    <WorkspaceProviderCredentialsSection
      workspace={workspace}
    />
  );
}
