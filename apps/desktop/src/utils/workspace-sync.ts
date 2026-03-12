import type { StoredWorkspace } from '@nakiros/shared';

export async function syncWorkspaceArtifacts(workspace: StoredWorkspace): Promise<void> {
  await window.nakiros.syncWorkspaceYaml(workspace);
  await window.nakiros.syncWorkspace(workspace);
}
