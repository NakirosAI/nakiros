# SkillAuditsTab.tsx

**Path:** `apps/frontend/src/components/skill/SkillAuditsTab.tsx`

Tab inside `SkillView` listing past audit reports for the active skill. Two states:
- **list**: clickable cards (one per audit report on disk)
- **reader**: full-width Markdown viewer with a back button

Both are populated via the IPC client (`listAuditHistory` + `readAuditReport`).

## Exports

### `SkillAuditsTab` (default export)

```ts
export default function SkillAuditsTab(props: {
  scope: SkillScope;
  projectId?: string;
  pluginName?: string;
  marketplaceName?: string;
  skillName: string;
}): JSX.Element
```

Scope + identifying fields are forwarded as-is to the daemon; only the matching combination is resolved upstream. Empty state nudges the user toward running an audit.

```ts
interface Props {
  /** Skill scope (project / plugin / marketplace / global). */
  scope: SkillScope;
  /** Project id when scope === 'project'. */
  projectId?: string;
  /** Plugin name when scope === 'plugin'. */
  pluginName?: string;
  /** Marketplace name when scope === 'marketplace'. */
  marketplaceName?: string;
  /** Skill name (always required). */
  skillName: string;
}
```
