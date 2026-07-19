import { useCallback, useEffect, useState } from 'react';
import type {
  ConfigurationProvider,
  McpAuditHistoryEntry,
  McpExpertMutationResult,
  McpReadResult,
} from '@nakiros/shared';
import { absoluteProjectPath, codexResourceDriver, isCodex } from '../../lib/hestia-provider-driver';

interface UseMcpFileApi {
  file: McpReadResult | null;
  loading: boolean;
  error: string | null;
  refresh(): void;
  save(content: string, mtimeAtRead: string): Promise<McpExpertMutationResult>;
}

/**
 * Loads the project's `.mcp.json` file as a complete JSON string via the
 * mcp-expert IPC (`mcp:read`). Exposes a `save` helper that writes the
 * entire file (no merge — `.mcp.json` is a standalone file, not a sub-key
 * of `settings.json`).
 *
 * Mirrors {@link useHooksFile} in shape so `McpScreen` can follow the
 * exact same pattern as `HooksScreen`.
 */
export function useMcpFile(
  projectId: string,
  provider: ConfigurationProvider,
  projectPath: string,
  onRefreshAudits?: () => void,
): UseMcpFileApi {
  const [file, setFile] = useState<McpReadResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const request = isCodex(provider)
      ? codexResourceDriver.read(projectId, 'mcp', 'mcp').then((result) => {
          if (!result.ok) throw new Error(result.message);
          return {
            content: result.file.content,
            mtime: result.file.mtime,
            exists: result.file.exists,
            path: absoluteProjectPath(projectPath, result.file.path),
          } satisfies McpReadResult;
        })
      : window.nakiros.readMcp(projectId);
    request
      .then((result) => {
        if (cancelled) return;
        setFile((result as McpReadResult | null) ?? null);
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
    async (content: string, mtimeAtRead: string): Promise<McpExpertMutationResult> => {
      const result: McpExpertMutationResult = isCodex(provider)
        ? await codexResourceDriver.save(projectId, 'mcp', 'mcp', content, mtimeAtRead).then((saved) =>
            saved.ok
              ? { ok: true }
              : { ok: false, code: saved.code, message: saved.message },
          )
        : await window.nakiros.saveMcp(projectId, content, mtimeAtRead);
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

// Re-export for convenience.
export type { McpAuditHistoryEntry };
