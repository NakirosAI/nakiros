# useNpmVersion.ts

**Path:** `apps/landing/src/lib/useNpmVersion.ts`

React hook that fetches the latest published version of an npm package from the public registry. Falls back across dist-tags in order of stability (`latest` → `rc` → `beta` → `alpha`) so a package available only as a pre-release still surfaces a version. Used by `InstallCommand` to render the version badge and to suffix the install command with `@<tag>` when needed.

## Exports

### `NpmVersionInfo`

```ts
export interface NpmVersionInfo {
  version: string
  tag: 'latest' | 'beta' | 'alpha' | 'rc' | string
}
```

Resolved npm version (`version`) and the dist-tag that produced it (`tag`).

### `useNpmVersion`

```ts
export function useNpmVersion(packageName: string): NpmVersionInfo | null
```

Fetches `https://registry.npmjs.org/<packageName>` on mount and whenever `packageName` changes, walks the dist-tag priority list, and stores the first match in state. Returns `null` while loading, when no package name is provided, or when the fetch fails. Cancels stale state writes via a `cancelled` flag in the cleanup function.
