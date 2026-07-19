# Codex AGENTS.md audit checklist

Use the shared 18-check instruction-quality taxonomy from the skill, with these Codex interpretations:

- `architecture_pointers`: paths and authority boundaries are repository-relative and verifiable.
- `mandatory_constraints`: hard rules are concrete and applicable to Codex work.
- `quick_pointers`: only non-obvious, execution-relevant guidance is included.
- `validation_commands`: every command exists in project configuration or documentation.
- `runtime_stack`: languages, runtime, and package manager match project evidence.
- `paths_references`: no Claude-only `@import` syntax; nested instruction files are referenced by real paths when relevant.
- `external_docs`: link instead of reproducing lengthy external documentation.

Additionally report these as details under the closest existing check; do not invent new check IDs:

- Root instructions contain narrowly scoped guidance that belongs in a nested `AGENTS.md`.
- A nested `AGENTS.override.md` contradicts a root constraint in a surprising or unsafe way.
- The file refers to missing `.codex/`, `.agents/skills/`, or validation resources.
- The file describes Claude-specific behavior as if Codex supported it.

An absent root `AGENTS.md` is valid for `create`, but an `audit` must report that no target exists and must not fabricate a passing score.
