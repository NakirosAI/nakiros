import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/** Failure callbacks plugged into eval/audit/fix start handlers. */
export interface SkillActionErrorHandlers {
  onEvalFailure: (message: string) => void;
  onAuditFailure: (message: string) => void;
  onFixFailure: (message: string) => void;
}

/**
 * Shared alert handlers wired to the `skill-actions` i18n namespace.
 * Used by every skills view (project/nakiros/global/plugin) so the failure
 * messages stay consistent and live in a single place.
 */
export function useSkillActionErrorHandlers(): SkillActionErrorHandlers {
  const { t } = useTranslation('skill-actions');
  return useMemo(
    () => ({
      onEvalFailure: (message: string) => alert(t('alertEvalFailed', { message })),
      onAuditFailure: (message: string) => alert(t('alertAuditFailed', { message })),
      onFixFailure: (message: string) => alert(t('alertFixFailed', { message })),
    }),
    [t],
  );
}
