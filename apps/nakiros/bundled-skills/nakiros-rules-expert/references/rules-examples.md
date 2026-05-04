# Rule Examples — Good and Anti-patterns

Three annotated examples for training and reference.

---

## Example 1 — Well-structured rule (pass all 15 checks)

```markdown
---
paths:
  - "apps/frontend/src/**/*.tsx"
  - "apps/frontend/src/i18n/**"
---

# Rule — i18n

All user-facing text in `apps/frontend/**` must go through i18next.

## How

\`\`\`tsx
import { useTranslation } from 'react-i18next';

function Component() {
  const { t } = useTranslation('namespace');
  return <button>{t('save')}</button>;
}
\`\`\`

- **Always pass a namespace** to `useTranslation`. Use the existing namespace
  for the screen (e.g., `conversations`, `claudeMd`, `runs`) or add a new
  one with both bundles.
- **Never** write FR/EN ternaries (no `isFr ? '...' : '...'`).
- **Never** hardcode a French or English string in JSX.

## Both bundles must move together

Every key added must exist in **both**:

- `apps/frontend/src/i18n/locales/en/<namespace>.json`
- `apps/frontend/src/i18n/locales/fr/<namespace>.json`

If you only add the FR key (or only EN), the missing-translation fallback
will display the key name to the user. That is a bug.

## Source language

Authoring source is **English**. Translate to French — never the reverse.
```

**Why this passes:**
- Frontmatter with `paths:` scoped to matching files — not global.
- H1 clearly names the topic (`i18n`).
- Concrete code block illustrating correct usage.
- All bullets imperative: `Always`, `Never`, `must`.
- Single topic (internationalisation, one concern).
- Under 50 lines — concise.
- No fluff, no vague advice.

---

## Example 2 — Too long and multi-topic (anti-pattern)

```markdown
# General Frontend Rules

Welcome to our awesome frontend codebase! This file covers everything you
need to know when working on the UI.

## Component guidelines

- Make sure your components are reusable and well-designed.
- Consider using proper TypeScript types for props.
- Ideally, keep component files under 300 lines.
- Write tests for important components.
- Be careful with state management — edge cases exist.
- Use Tailwind for styling (usually).
- Avoid inline styles unless absolutely needed.
- Always import from the component index.
- Consider extracting hooks for complex logic.

## Testing rules

- Run tests before committing.
- Use descriptive test names.
- Mock external dependencies.

## API calls

- All API calls must use the NakirosClient.
- Never call fetch() directly from components.

## i18n

- Use i18next for all user-facing strings.
- Both EN and FR bundles must be updated.

## Performance

- Avoid unnecessary re-renders.
- Use React.memo where appropriate.
- Be careful with useEffect dependencies.

## Accessibility

- Add aria-labels to interactive elements.
- Ensure keyboard navigation works.

## State management

- Use Zustand for global state.
- Keep local state close to where it's used.

... (continues for 200+ lines)
```

**Why this fails:**
- **Multi-topic**: Testing + API + i18n + Performance + Accessibility + State
  in one file → `content.single_topic: fail`.
- **Too long**: Over 150 lines → `structure.line_count: fail`.
- **Vague bullets**: "Make sure", "Be careful", "Ideally", "Consider",
  "Usually" → `tone.actionable: fail`.
- **Fluff**: "Welcome to our awesome frontend codebase" →
  `tone.no_fluff: fail`.
- **No paths**: Global rule loading everything on every session →
  `frontmatter.paths_field: fail` (critical).
- **No frontmatter block at all** → `frontmatter.present: fail` (critical).

**Fix**: Split into 6 separate focused rules: `i18n.md`, `testing.md`,
`api-calls.md`, `performance.md`, `accessibility.md`, `state.md`. Each gets
its own `paths:` frontmatter and stays under 50 lines.

---

## Example 3 — Broken frontmatter (anti-pattern)

```markdown
paths:
  - "src/**/*.ts"

# TypeScript Rules

- Use strict mode in tsconfig.json.
- Prefer interface over type for object shapes.
- Export types from the index barrel file.
```

**Why this fails:**
- **No `---` delimiters**: The `paths:` key is raw text, not a YAML frontmatter
  block. Claude Code does not parse it → `frontmatter.present: fail` (critical)
  and `frontmatter.paths_field: fail` (critical).
- The rule loads globally on every session instead of only for `.ts` files.
- Under-specified: no code examples → `content.has_examples: fail`.
- Line 2 ("Use strict mode") is borderline obvious if `tsconfig.json` already
  has `"strict": true` → `content.no_obvious_restatement: warn`.

**Fix**:
```markdown
---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# Rule — TypeScript conventions

- Prefer `interface` over `type` for object shapes that are extended.
- Export all public types from `src/index.ts` (the barrel file).
- **Never** use `any` — use `unknown` and narrow.

\`\`\`typescript
// Correct: interface for extendable shapes
interface UserProfile {
  id: string;
  name: string;
}
// Avoid: type alias for object with no extension intent
type Config = { debug: boolean }; // fine for simple non-extended types
\`\`\`
```
