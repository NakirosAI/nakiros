# skill-fingerprint.ts

**Path:** `apps/nakiros/src/services/skill-fingerprint.ts`

Deterministic content hash of a skill directory. Used by the eval matrix to distinguish a real regression (skill actually changed between iterations) from LLM-judge variance (identical skill, different grading), and by the comparison runner to decide whether a previous iteration's artefacts can be reused instead of re-run.

Hashing rules:
- Walk every file under `skillDir`.
- Skip `evals/workspace/`, `.git`, `node_modules`, `.turbo`, `.next`, `dist`, `.DS_Store`.
- Skip files larger than 5 MB (unlikely to carry skill behaviour, slow the hash).
- For each remaining file: hash `<relative-path>\n<content>` so renames AND edits flip the fingerprint.
- Sort entries by path so `readdirSync` order doesn't matter.
- Fold into a single SHA-256.

## Exports

### `function computeSkillFingerprint`

Compute the SHA-256 fingerprint of a skill directory.

```ts
export function computeSkillFingerprint(skillDir: string): string
```

**Returns:** fingerprint prefixed with `sha256:` (e.g. `sha256:abc123…`).
