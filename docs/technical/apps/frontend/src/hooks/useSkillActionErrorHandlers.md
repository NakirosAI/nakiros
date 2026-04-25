# useSkillActionErrorHandlers.ts

**Path:** `apps/frontend/src/hooks/useSkillActionErrorHandlers.ts`

Centralizes the `alert()` failure messages shown after eval/audit/fix
actions, tied to the `skill-actions` i18n namespace. Reused by every
scoped skills view so the wording stays consistent.

## Exports

### `SkillActionErrorHandlers`

```ts
interface SkillActionErrorHandlers {
  onEvalFailure(message: string): void;
  onAuditFailure(message: string): void;
  onFixFailure(message: string): void;
}
```

### `useSkillActionErrorHandlers`

```ts
function useSkillActionErrorHandlers(): SkillActionErrorHandlers;
```

Returns memoized handlers wired to `t('alertEvalFailed' | 'alertAuditFailed'
| 'alertFixFailed', { message })`.
