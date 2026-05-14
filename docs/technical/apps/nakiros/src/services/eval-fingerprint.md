# eval-fingerprint

**Path:** `apps/nakiros/src/services/eval-fingerprint.ts`

Deterministic SHA-256 fingerprinting for eval inputs. Used by the baseline cache and the comparison runner to detect whether an eval's question has changed — a fingerprint flip means the cached baseline must be discarded and recomputed. The hash folds both the eval definition (name, prompt, expected output, mode, assertions) and the full byte content of every fixture file listed in `files`, so editing a prompt, swapping a fixture, or tightening assertions all cause a cache miss.

## Exports

### `EvalInputForFingerprint`

```ts
export interface EvalInputForFingerprint {
  name: string
  prompt: string
  expected_output?: string
  mode?: 'autonomous' | 'interactive'
  /** Fixture paths relative to the skill dir. */
  files?: string[]
  output_files?: string[]
  /** Assertion definitions. Treated opaquely — folded as JSON. */
  assertions: unknown
}
```

Subset of an `evals.json` entry that fully determines the eval question. Only fields that can change Claude's behaviour on the baseline run (no-skill execution) are included. Callers should extract this subset from the full eval record before passing to `computeEvalFingerprint`.

---

### `computeEvalFingerprint`

```ts
export function computeEvalFingerprint(
  skillDir: string,
  evalRecord: EvalInputForFingerprint,
): string
```

Compute a deterministic SHA-256 fingerprint of the eval inputs. Folds the eval definition fields (name, prompt, expected_output, mode, output_files, assertions) and the full byte content of every fixture listed in `evalRecord.files` (sorted by relative path to eliminate readdir ordering effects).

Missing fixture files don't throw — they're folded as a `<missing>` marker so a present-vs-absent fixture still flips the fingerprint.

**Parameters:**
- `skillDir` — absolute path to the skill directory; fixture paths in `evalRecord.files` are resolved relative to this
- `evalRecord` — the subset of the eval definition that defines its question

**Returns:** fingerprint string prefixed with `sha256:` (convention matches `computeSkillFingerprint`).
