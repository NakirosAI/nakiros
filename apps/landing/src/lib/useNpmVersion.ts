import { useEffect, useState } from 'react';

/**
 * Fetches the latest published version of an npm package.
 * Returns `null` if the package doesn't exist yet or the fetch fails.
 */
export function useNpmVersion(packageName: string): string | null {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`https://registry.npmjs.org/${packageName}/latest`, {
      headers: { accept: 'application/json' },
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as { version?: string };
        return data.version ?? null;
      })
      .catch(() => null)
      .then((v) => {
        if (!cancelled) setVersion(v);
      });

    return () => {
      cancelled = true;
    };
  }, [packageName]);

  return version;
}
