# InstallCommand.tsx

**Path:** `apps/landing/src/components/InstallCommand.tsx`

Copy-to-clipboard install command pill used in the Hero and FinalCta sections. Resolves the latest published version via `useNpmVersion`; when only a pre-release dist-tag is available, suffixes the command with `@<tag>` so the snippet stays directly executable. Renders a teal "latest" or amber pre-release version badge next to the command and reverts the copy icon after 1.5s.

## Exports

### `InstallCommand`

```ts
export function InstallCommand(props: Props): JSX.Element
```

React component rendering the command pill. Props (interface kept private to the file):

- `command: string` — shell command to display and copy.
- `className?: string` — extra Tailwind classes merged onto the wrapper.
- `label?: string` — optional uppercase label rendered above the pill.
- `packageName?: string` — npm package to fetch latest version for; omit to hide the badge.
