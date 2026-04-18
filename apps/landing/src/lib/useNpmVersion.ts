import { useEffect, useState } from 'react';

export interface NpmVersionInfo {
  version: string;
  tag: 'latest' | 'beta' | 'alpha' | 'rc' | string;
}

/**
 * Fetches the latest published version of an npm package, falling back across
 * dist-tags in order of stability: latest → rc → beta → alpha.
 * Returns `null` if the package doesn't exist yet or the fetch fails.
 */
export function useNpmVersion(packageName: string): NpmVersionInfo | null {
  const [info, setInfo] = useState<NpmVersionInfo | null>(null);

  useEffect(() => {
    if (!packageName) return;
    let cancelled = false;

    fetch(`https://registry.npmjs.org/${packageName}`, {
      headers: { accept: 'application/json' },
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as { 'dist-tags'?: Record<string, string> };
        const tags = data['dist-tags'] ?? {};
        const priority: NpmVersionInfo['tag'][] = ['latest', 'rc', 'beta', 'alpha'];
        for (const tag of priority) {
          const version = tags[tag];
          if (version) return { version, tag };
        }
        return null;
      })
      .catch(() => null)
      .then((result) => {
        if (!cancelled) setInfo(result);
      });

    return () => {
      cancelled = true;
    };
  }, [packageName]);

  return info;
}
