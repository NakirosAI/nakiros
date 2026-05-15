# recommendation-apply.ts

**Path:** `apps/nakiros/src/services/recommendation-apply.ts`

Bridge between friction-pattern reco cards and the existing downstream runners (`startFix`, `startCreate`, `startEdit`). Given a `RecoCard`, it picks the correct runner, constructs the typed `StartAuditRequest` with the matching `*Target` field, and sends the card's `brief` as the first user message so the agent receives the recommendation verbatim.

## Exports

### `ApplyRecoCtx`

```ts
export interface ApplyRecoCtx {
  projectPath: string;
  editedBrief?: string;
  onEvent: (event: AuditRunEvent) => void;
  skillDir?: string;
}
```

Context supplied by the daemon handler when calling `applyReco`.

- `projectPath` — absolute path to the project root on disk; used to populate the `*Target` fields.
- `editedBrief` — optional user-edited brief text. When provided and different from `card.brief`, the markdown body is updated before the run is spawned.
- `onEvent` — forwarded to the downstream runner as its `onEvent` callback.
- `skillDir` — on-disk skill directory for skill-scoped runs; empty string for `.claude/` artefact runs (runner ignores `skillDir` when a `*Target` field is present).

---

### `applyReco`

```ts
export async function applyReco(
  projectId: string,
  patternId: string,
  recId: string,
  ctx: ApplyRecoCtx,
): Promise<ApplyRecoResponse>
```

Translates a `RecoCard` into a downstream runner call and returns the resulting `runId` plus `runKind` so the caller can navigate to the correct run screen.

Idempotent when the card is already `'applied'` — returns the prior `runId` without re-spawning the runner.

Artifact-type → runner mapping:

| `artifactType` | `action` | Runner | `*Target` field |
|---|---|---|---|
| `skill` | `fix` | `startFix` | — (skillName) |
| `skill` | `create` | `startCreate` | — (skillName `__new__`) |
| `rules` | any | `startEdit` | `rulesTarget.ruleName = card.target` |
| `claudemd` | any | `startEdit` | `claudemdTarget` (singleton) |
| `subagent` | any | `startEdit` | `subagentsTarget.subagentName = card.target` |
| `hook` | any | `startEdit` | `hooksTarget` (singleton) |
| `permission` | any | `startEdit` | `permissionsTarget.scope = 'project'` |
| `mcp` | any | `startEdit` | `mcpTarget` (singleton) |
| `output-style` | any | `startEdit` | `outputStylesTarget.styleName = card.target` |

All `.claude/` artefacts use mode `'edit'` on the expert skill regardless of `card.action`.

**Parameters:**
- `projectId` — the project this card belongs to
- `patternId` — the friction pattern the card was derived from
- `recId` — the card's own identifier
- `ctx` — caller-resolved context (projectPath, editedBrief, onEvent, skillDir)

**Returns:** `ApplyRecoResponse` — `{ ok: true, runId, runKind }` on success; `{ ok: false, error }` when the card is not found, the brief is empty after trimming, or the artifact type is unknown.
