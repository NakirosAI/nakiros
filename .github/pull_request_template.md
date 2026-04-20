<!--
Thanks for contributing to Nakiros!

Every PR must be linked to a triaged issue. See CONTRIBUTING.md for the
full flow. If there is no issue yet, please open one first and wait for
maintainer approval before opening this PR.
-->

## Linked issue

Closes #<!-- issue number -->

## Summary

<!-- What does this PR change, and why? Reconstruct the reasoning — don't
just paste the commit list. If the PR crosses multiple files, explain what
ties them together. -->

## Test plan

<!-- Checklist of what you verified manually. Be specific; "it works" is
not a test plan. -->

- [ ]
- [ ]
- [ ]

## Breaking changes / migration

<!-- None? Say "None." Otherwise describe what users must do. -->

None.

## Checklist

- [ ] I opened an issue first and a maintainer approved the direction.
- [ ] My branch is named with a `feat/`, `fix/`, `refactor/`, or `docs/` prefix.
- [ ] Commit messages follow `<type>(<scope>): <summary>` in English.
- [ ] `pnpm -F @nakirosai/nakiros exec tsc --noEmit` passes.
- [ ] `pnpm -F @nakiros/frontend exec tsc --noEmit` passes.
- [ ] `turbo build` passes.
