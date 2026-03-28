import { useEffect, useState } from 'react';
import type { JiraAuthCompletePayload, JiraProject, JiraStatus, StoredWorkspace } from '@nakiros/shared';
import { useIpcListener } from './useIpcListener';

interface UseJiraConnectionOptions {
  workspaceId: string;
  enabled: boolean;
  onWorkspaceUpdated?: (workspace: StoredWorkspace) => void | Promise<void>;
}

export function useJiraConnection(options: UseJiraConnectionOptions) {
  const { workspaceId, enabled, onWorkspaceUpdated } = options;
  const [status, setStatus] = useState<JiraStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadProjects() {
    setProjectsLoading(true);
    try {
      const nextProjects = await window.nakiros.jiraGetProjects(workspaceId);
      setProjects(nextProjects);
      setError(null);
      return nextProjects;
    } catch (err) {
      setProjects([]);
      setError(err instanceof Error ? err.message : String(err));
      return [];
    } finally {
      setProjectsLoading(false);
    }
  }

  useEffect(() => {
    if (!enabled) {
      setStatus(null);
      setProjects([]);
      setProjectsLoading(false);
      setStatusLoading(false);
      setConnecting(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setStatusLoading(true);

    void window.nakiros.jiraGetStatus(workspaceId)
      .then(async (nextStatus) => {
        if (cancelled) return;
        setStatus(nextStatus);
        if (nextStatus.connected) {
          await loadProjects();
        } else {
          setProjects([]);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus({ connected: false });
        setProjects([]);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, workspaceId]);

  useIpcListener(
    window.nakiros.onJiraAuthComplete,
    (data: JiraAuthCompletePayload) => {
      if (data.wsId !== workspaceId) return;
      setConnecting(false);
      setStatus({ connected: true, cloudUrl: data.cloudUrl, displayName: data.displayName });
      setError(null);
      void loadProjects();
      if (data.workspace) {
        void onWorkspaceUpdated?.(data.workspace);
      }
    },
    [workspaceId, onWorkspaceUpdated],
    enabled,
  );

  useIpcListener(
    window.nakiros.onJiraAuthError,
    (data) => {
      if (data.wsId !== workspaceId && data.wsId !== '') return;
      setConnecting(false);
      setError(data.error);
    },
    [workspaceId],
    enabled,
  );

  async function connect(jiraUrl?: string) {
    setConnecting(true);
    setError(null);
    await window.nakiros.jiraStartAuth(workspaceId, jiraUrl);
  }

  async function disconnect() {
    setConnecting(false);
    const updatedWorkspace = await window.nakiros.jiraDisconnect(workspaceId);
    setStatus({ connected: false });
    setProjects([]);
    setError(null);
    if (updatedWorkspace) {
      await onWorkspaceUpdated?.(updatedWorkspace);
    }
    return updatedWorkspace;
  }

  return {
    status,
    statusLoading,
    connecting,
    projects,
    projectsLoading,
    error,
    setError,
    connect,
    disconnect,
    loadProjects,
  };
}
