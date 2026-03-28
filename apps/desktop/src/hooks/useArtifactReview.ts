import { useCallback, useMemo, useState } from 'react';
import type {
  ArtifactChangeProposal,
  ArtifactReviewSession,
  ArtifactReviewSourceSurface,
  ArtifactTarget,
} from '@nakiros/shared';
import {
  applyArtifactSnapshot,
  hasArtifactBaselineConflict,
  readArtifactSnapshot,
  rollbackArtifactSnapshot,
} from '../utils/artifact-review.js';

export interface ArtifactReviewMutation {
  nonce: number;
  sessionId: string;
  target: ArtifactTarget;
  status: 'applied' | 'accepted' | 'rejected';
}

interface OpenArtifactReviewArgs {
  proposal: ArtifactChangeProposal;
  sourceSurface: ArtifactReviewSourceSurface;
  conversationId?: string | null;
  triggerMessageId?: string | null;
  baselineContentOverride?: string | null;
  alreadyApplied?: boolean;
}

interface UseArtifactReviewArgs {
  onToast?: (message: string) => void;
}

export function useArtifactReview({ onToast }: UseArtifactReviewArgs) {
  const [activeSession, setActiveSession] = useState<ArtifactReviewSession | null>(null);
  const [isDockOpen, setIsDockOpen] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [lastMutation, setLastMutation] = useState<ArtifactReviewMutation | null>(null);

  const canReopenDock = Boolean(
    activeSession
    && !isDockOpen
    && (activeSession.status === 'pending' || activeSession.status === 'applied'),
  );

  const openProposal = useCallback(async (args: OpenArtifactReviewArgs) => {
    try {
      const sessionId = `artifact-review-${Date.now()}`;
      const baseline = args.baselineContentOverride != null
        ? {
          content: args.baselineContentOverride,
          title: args.proposal.title,
        }
        : await readArtifactSnapshot(args.proposal.target);
      let status: ArtifactReviewSession['status'] = 'pending';

      if (args.alreadyApplied) {
        status = 'applied';
      } else if (args.proposal.mode === 'yolo') {
        await applyArtifactSnapshot(args.proposal.target, args.proposal.proposedContent);
        status = 'applied';
        setLastMutation({
          nonce: Date.now(),
          sessionId,
          target: args.proposal.target,
          status: 'applied',
        });
      }

      setActiveSession({
        id: sessionId,
        sourceSurface: args.sourceSurface,
        conversationId: args.conversationId ?? null,
        target: args.proposal.target,
        mode: args.proposal.mode,
        baselineContent: baseline.content,
        proposedContent: args.proposal.proposedContent,
        status,
        title: args.proposal.title || baseline.title,
        triggerMessageId: args.triggerMessageId ?? null,
      });
      setIsDockOpen(true);
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : String(error));
    }
  }, [onToast]);

  const closeDock = useCallback(() => {
    setIsDockOpen(false);
  }, []);

  const reopenDock = useCallback(() => {
    if (!activeSession) return;
    setIsDockOpen(true);
  }, [activeSession]);

  const acceptActive = useCallback(async () => {
    if (!activeSession || isMutating) return;
    setIsMutating(true);
    try {
      if (activeSession.mode === 'diff') {
        const hasConflict = await hasArtifactBaselineConflict(activeSession.target, activeSession.baselineContent);
        if (hasConflict) {
          onToast?.('Artifact baseline changed since proposal creation. Please regenerate the change.');
          return;
        }
        await applyArtifactSnapshot(activeSession.target, activeSession.proposedContent);
        setLastMutation({
          nonce: Date.now(),
          sessionId: activeSession.id,
          target: activeSession.target,
          status: 'accepted',
        });
      }

      setActiveSession((current) => (
        current && current.id === activeSession.id
          ? { ...current, status: 'accepted' }
          : current
      ));
      setIsDockOpen(false);
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : String(error));
    } finally {
      setIsMutating(false);
    }
  }, [activeSession, isMutating, onToast]);

  const rejectActive = useCallback(async () => {
    if (!activeSession || isMutating) return;
    setIsMutating(true);
    try {
      if (activeSession.mode === 'yolo' || activeSession.status === 'applied') {
        await rollbackArtifactSnapshot(activeSession.target, activeSession.baselineContent);
        setLastMutation({
          nonce: Date.now(),
          sessionId: activeSession.id,
          target: activeSession.target,
          status: 'rejected',
        });
      }

      setActiveSession((current) => (
        current && current.id === activeSession.id
          ? { ...current, status: 'rejected' }
          : current
      ));
      setIsDockOpen(false);
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : String(error));
    } finally {
      setIsMutating(false);
    }
  }, [activeSession, isMutating, onToast]);

  return useMemo(() => ({
    activeSession,
    isDockOpen,
    canReopenDock,
    isMutating,
    lastMutation,
    openProposal,
    closeDock,
    reopenDock,
    acceptActive,
    rejectActive,
  }), [
    activeSession,
    isDockOpen,
    canReopenDock,
    isMutating,
    lastMutation,
    openProposal,
    closeDock,
    reopenDock,
    acceptActive,
    rejectActive,
  ]);
}
