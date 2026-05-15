# path-suggester

**Path:** `apps/nakiros/src/services/path-suggester.ts`

Lightweight workspace walker that generates glob-pattern suggestions for the rule `paths:` editor. Scans the project tree up to depth 3 (excluding common build/cache dirs) to identify the most-used file extensions and top-level directories, then returns a ranked list of at most 7 glob suggestions. No persistent cache — the scan is bounded and typically completes in under 200 ms.

## Exports

### `suggestRulePaths`

```ts
export function suggestRulePaths(projectPath: string): string[]
```

Walk `projectPath` up to depth 3, count file extensions and top-level directories, and return a sorted list of glob suggestions for the rule editor.

Output format:
- `**/*.<ext>` for the top 4 file extensions by file count
- `**/*.test.<topExt>` when at least 3 test/spec files are detected
- `<dir>/**` for the top 3 first-level directories by file count
- Deduplicated, capped at 7 entries

Hidden entries (names starting with `.`) and directories in the built-in ignore list (`node_modules`, `dist`, `build`, `.git`, etc.) are skipped at every depth level.

**Parameters:**
- `projectPath` — absolute path to the project root to scan

**Returns:** ordered glob suggestions, most useful first; may be empty for an empty or unreadable project.
