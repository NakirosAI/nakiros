import { useCallback, useEffect, useState } from 'react';
import type {
  ClaudeMdFileContent,
  ClaudeMdListResult,
  ClaudeMdMutationResult,
  SaveClaudeMdRequest,
  ConfigurationProvider,
} from '@nakiros/shared';
import {
  codexInstructionFile,
  codexInstructionMutation,
  codexResourceDriver,
  isCodex,
} from '../../lib/hestia-provider-driver';

interface UseClaudeMdListApi {
  list: ClaudeMdListResult | null;
  loading: boolean;
  error: string | null;
  refresh(): void;
}

/** Loads the summary for the project's root CLAUDE.md. */
export function useClaudeMdList(
  projectId: string,
  provider: ConfigurationProvider,
  projectPath: string,
): UseClaudeMdListApi {
  const [list, setList] = useState<ClaudeMdListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const request = isCodex(provider)
      ? codexResourceDriver.read(projectId, 'instructions', 'AGENTS.md').then((result) => {
          if (!result.ok) throw new Error(result.message);
          return {
            file: codexInstructionFile(projectPath, result.file),
            agentsMdAtRoot: false,
            projectPath,
          } satisfies ClaudeMdListResult;
        })
      : window.nakiros.listClaudeMd(projectId);
    request
      .then((result) => {
        if (cancelled) return;
        setList(result as ClaudeMdListResult);
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
  return { list, loading, error, refresh };
}

interface UseClaudeMdFileApi {
  file: ClaudeMdFileContent | null;
  loading: boolean;
  error: string | null;
  refresh(): void;
  save(request: SaveClaudeMdRequest): Promise<ClaudeMdMutationResult>;
  remove(): Promise<ClaudeMdMutationResult>;
}

/** Loads the root CLAUDE.md's full content + metadata, with save /
 *  delete helpers that auto-refresh on success. */
export function useClaudeMdFile(
  projectId: string,
  provider: ConfigurationProvider,
  projectPath: string,
  onListChange: () => void,
): UseClaudeMdFileApi {
  const [file, setFile] = useState<ClaudeMdFileContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const request = isCodex(provider)
      ? codexResourceDriver.read(projectId, 'instructions', 'AGENTS.md').then((result) => {
          if (!result.ok) throw new Error(result.message);
          return codexInstructionFile(projectPath, result.file);
        })
      : window.nakiros.readClaudeMd(projectId);
    request
      .then((result) => {
        if (cancelled) return;
        setFile((result as ClaudeMdFileContent | null) ?? null);
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
    async (request: SaveClaudeMdRequest): Promise<ClaudeMdMutationResult> => {
      const result = isCodex(provider)
        ? codexInstructionMutation(
            await codexResourceDriver.save(
              projectId,
              'instructions',
              'AGENTS.md',
              request.body,
              request.mtimeAtRead,
            ),
            projectPath,
          )
        : await window.nakiros.saveClaudeMdFile(projectId, request);
      if (result.ok) {
        refresh();
        onListChange();
      }
      return result;
    },
    [projectId, projectPath, provider, refresh, onListChange],
  );

  const remove = useCallback(async (): Promise<ClaudeMdMutationResult> => {
    const result = isCodex(provider)
      ? codexInstructionMutation(
          await codexResourceDriver.remove(projectId, 'instructions', 'AGENTS.md'),
          projectPath,
        )
      : await window.nakiros.deleteClaudeMd(projectId);
    if (result.ok) {
      refresh();
      onListChange();
    }
    return result;
  }, [projectId, projectPath, provider, refresh, onListChange]);

  return { file, loading, error, refresh, save, remove };
}
