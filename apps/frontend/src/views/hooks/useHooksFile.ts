import { useCallback, useEffect, useState } from 'react';
import type { ConfigurationProvider, HooksAuditHistoryEntry, HooksExpertMutationResult, HooksReadResult } from '@nakiros/shared';
import { absoluteProjectPath, codexResourceDriver, isCodex } from '../../lib/hestia-provider-driver';

interface UseHooksFileApi {
  file: HooksReadResult | null;
  loading: boolean;
  error: string | null;
  refresh(): void;
  save(content: string, mtimeAtRead: string): Promise<HooksExpertMutationResult>;
}

/**
 * Loads the project's hooks block (from `.claude/settings.json`) as a raw
 * JSON string via the hooks-expert IPC. Exposes a `save` helper that
 * round-trips only the hooks slice while preserving all other settings keys.
 *
 * Mirrors {@link useClaudeMdFile} in shape so `HooksScreen` can follow the
 * exact same pattern as `ClaudeMdScreen`.
 */
export function useHooksFile(
  projectId: string,
  provider: ConfigurationProvider,
  projectPath: string,
  onRefreshAudits?: () => void,
): UseHooksFileApi {
  const [file, setFile] = useState<HooksReadResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const request = isCodex(provider)
      ? codexResourceDriver.read(projectId, 'hooks', 'hooks').then((result) => {
          if (!result.ok) throw new Error(result.message);
          let content = '{}';
          if (result.file.content.trim()) {
            const root = JSON.parse(result.file.content) as Record<string, unknown>;
            content = JSON.stringify(root.hooks ?? root, null, 2);
          }
          return {
            content,
            mtime: result.file.mtime,
            exists: result.file.exists,
            path: absoluteProjectPath(projectPath, result.file.path),
          } satisfies HooksReadResult;
        })
      : window.nakiros.readHooks(projectId);
    request
      .then((result) => {
        if (cancelled) return;
        setFile((result as HooksReadResult | null) ?? null);
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
  }, [projectId, projectPath, provider, reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const save = useCallback(
    async (content: string, mtimeAtRead: string): Promise<HooksExpertMutationResult> => {
      const result = isCodex(provider)
        ? await saveCodexHooks(projectId, content, mtimeAtRead)
        : await window.nakiros.saveHooks(projectId, content, mtimeAtRead);
      if (result.ok) {
        refresh();
        onRefreshAudits?.();
      }
      return result;
    },
    [projectId, provider, refresh, onRefreshAudits],
  );

  return { file, loading, error, refresh, save };
}

async function saveCodexHooks(
  projectId: string,
  content: string,
  mtimeAtRead: string,
): Promise<HooksExpertMutationResult> {
  const current = await codexResourceDriver.read(projectId, 'hooks', 'hooks');
  if (!current.ok) return { ok: false, code: current.code, message: current.message };
  let root: Record<string, unknown> = {};
  if (current.file.content.trim()) {
    const parsed = JSON.parse(current.file.content) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      root = parsed as Record<string, unknown>;
    }
  }
  root.hooks = JSON.parse(content || '{}') as unknown;
  const result = await codexResourceDriver.save(
    projectId,
    'hooks',
    'hooks',
    `${JSON.stringify(root, null, 2)}\n`,
    mtimeAtRead,
  );
  return result.ok
    ? { ok: true }
    : { ok: false, code: result.code, message: result.message };
}

// Re-export for convenience — screens that only need the audit list can use
// this directly instead of duplicating the fetch logic.
export type { HooksAuditHistoryEntry };
