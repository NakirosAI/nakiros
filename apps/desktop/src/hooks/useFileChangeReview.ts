import { useCallback, useMemo, useState } from 'react';
import type { FileChangesReviewSession } from '@nakiros/shared';

export interface UseFileChangeReviewArgs {
  onToast?: (message: string) => void;
}

export function useFileChangeReview({ onToast }: UseFileChangeReviewArgs) {
  const [activeSession, setActiveSession] = useState<FileChangesReviewSession | null>(null);
  const [isDockOpen, setIsDockOpen] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const openSession = useCallback((session: FileChangesReviewSession) => {
    setActiveSession(session);
    setIsDockOpen(true);
  }, []);

  const closeDock = useCallback(() => {
    setIsDockOpen(false);
  }, []);

  const reopenDock = useCallback(() => {
    if (activeSession) setIsDockOpen(true);
  }, [activeSession]);

  const acceptAll = useCallback(async () => {
    if (!activeSession || isMutating) return;
    setIsMutating(true);
    try {
      await window.nakiros.snapshotResolve(activeSession.workspaceSlug, activeSession.runId);
      setActiveSession(null);
      setIsDockOpen(false);
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : String(err));
    } finally {
      setIsMutating(false);
    }
  }, [activeSession, isMutating, onToast]);

  const rejectAll = useCallback(async () => {
    if (!activeSession || isMutating) return;
    setIsMutating(true);
    try {
      await window.nakiros.snapshotRevert(activeSession.workspaceSlug, activeSession.runId);
      await window.nakiros.snapshotResolve(activeSession.workspaceSlug, activeSession.runId);
      setActiveSession(null);
      setIsDockOpen(false);
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : String(err));
    } finally {
      setIsMutating(false);
    }
  }, [activeSession, isMutating, onToast]);

  const rejectFile = useCallback(async (relativePath: string) => {
    if (!activeSession || isMutating) return;
    setIsMutating(true);
    try {
      await window.nakiros.snapshotRevert(activeSession.workspaceSlug, activeSession.runId, [relativePath]);
      setActiveSession((prev) => {
        if (!prev) return prev;
        const remaining = prev.changes.filter((c) => c.relativePath !== relativePath);
        if (remaining.length === 0) {
          void window.nakiros.snapshotResolve(prev.workspaceSlug, prev.runId);
          return null;
        }
        return { ...prev, changes: remaining };
      });
      if (activeSession.changes.length <= 1) setIsDockOpen(false);
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : String(err));
    } finally {
      setIsMutating(false);
    }
  }, [activeSession, isMutating, onToast]);

  const acceptFile = useCallback(async (relativePath: string) => {
    if (!activeSession || isMutating) return;
    setActiveSession((prev) => {
      if (!prev) return prev;
      const remaining = prev.changes.filter((c) => c.relativePath !== relativePath);
      if (remaining.length === 0) {
        void window.nakiros.snapshotResolve(prev.workspaceSlug, prev.runId);
        setIsDockOpen(false);
        return null;
      }
      return { ...prev, changes: remaining };
    });
  }, [activeSession, isMutating]);

  return useMemo(() => ({
    activeSession,
    isDockOpen,
    isMutating,
    canReopenDock: Boolean(activeSession && !isDockOpen),
    openSession,
    closeDock,
    reopenDock,
    acceptAll,
    rejectAll,
    rejectFile,
    acceptFile,
  }), [
    activeSession,
    isDockOpen,
    isMutating,
    openSession,
    closeDock,
    reopenDock,
    acceptAll,
    rejectAll,
    rejectFile,
    acceptFile,
  ]);
}
