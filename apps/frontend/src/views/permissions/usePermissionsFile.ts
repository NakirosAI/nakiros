import { useCallback, useEffect, useState } from 'react';
import type {
  PermissionsAuditHistoryEntry,
  PermissionsExpertMutationResult,
  PermissionsExpertScope,
  PermissionsReadResult,
  ConfigurationProvider,
} from '@nakiros/shared';
import { absoluteProjectPath, codexResourceDriver, isCodex } from '../../lib/hestia-provider-driver';

interface UsePermissionsFileApi {
  file: PermissionsReadResult | null;
  loading: boolean;
  error: string | null;
  refresh(): void;
  save(
    content: string,
    mtimeAtRead: string,
  ): Promise<PermissionsExpertMutationResult>;
}

/**
 * Loads the project's permissions block from the settings file for the given
 * scope (`settings.json` for `'project'`, `settings.local.json` for `'local'`)
 * as a raw JSON string via the permissions-expert IPC. Exposes a `save` helper
 * that round-trips only the permissions slice while preserving all other settings
 * keys.
 *
 * Mirrors {@link useHooksFile} in shape so `PermissionsScreen` can follow the
 * exact same pattern as `HooksScreen`.
 */
export function usePermissionsFile(
  projectId: string,
  provider: ConfigurationProvider,
  projectPath: string,
  scope: PermissionsExpertScope,
  onRefreshAudits?: () => void,
): UsePermissionsFileApi {
  const [file, setFile] = useState<PermissionsReadResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const request = isCodex(provider)
      ? codexResourceDriver.read(projectId, 'permissions', 'permissions').then((result) => {
          if (!result.ok) throw new Error(result.message);
          return {
            content: result.file.content,
            mtime: result.file.mtime,
            exists: result.file.exists,
            path: absoluteProjectPath(projectPath, result.file.path),
          } satisfies PermissionsReadResult;
        })
      : window.nakiros.readPermissions(projectId, scope);
    request
      .then((result) => {
        if (cancelled) return;
        setFile((result as PermissionsReadResult | null) ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, projectPath, provider, scope, reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const save = useCallback(
    async (
      content: string,
      mtimeAtRead: string,
    ): Promise<PermissionsExpertMutationResult> => {
      const result = isCodex(provider)
        ? await codexResourceDriver.save(
            projectId,
            'permissions',
            'permissions',
            content,
            mtimeAtRead,
          ).then((saved) => saved.ok
            ? { ok: true }
            : { ok: false, code: saved.code, message: saved.message })
        : await window.nakiros.savePermissions(projectId, scope, content, mtimeAtRead);
      if (result.ok) {
        refresh();
        onRefreshAudits?.();
      }
      return result;
    },
    [projectId, provider, scope, refresh, onRefreshAudits],
  );

  return { file, loading, error, refresh, save };
}

// Re-export for convenience.
export type { PermissionsAuditHistoryEntry };
