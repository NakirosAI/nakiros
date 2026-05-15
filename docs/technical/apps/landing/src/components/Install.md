# Install.tsx

**Path:** `apps/landing/src/components/Install.tsx`

Renders the "Install" section (terminal-style demo of the install + first run flow). Lines are static mock output coherent with the rest of the landing copy (4 skills, 3 agents, 2 rules, 1 output-style). Includes a bottom tip surfacing `nakiros service install` for launchd/systemd autostart. All copy from `messages.install`.

## Exports

### `Install`

```ts
export function Install(): JSX.Element
```

"Install" section — terminal-style demo of the install + first run flow. Adapted from v2 lp-sections.jsx → InstallSection. Lines are static mock output; numbers stay coherent with the rest of the landing copy (4 skills · 3 agents · 2 rules · 1 output-style).

The bottom tip surfaces the `nakiros service install` command shipped recently for launchd / systemd autostart.
