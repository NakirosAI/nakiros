# Contributing to Nakiros

Thanks for your interest in improving Nakiros! This document describes how to
propose a change.

## 1. Open an issue first

**Every contribution must start with a GitHub issue.** Even a one-line bug
fix — the issue is where we agree on *what* needs to change and *why* before
any code is written.

Pick the right template:

- **Bug report** — something is broken or behaves unexpectedly.
- **Feature request** — you want to add a capability or change a behavior.

Wait for a maintainer to **triage and approve** the issue before you start
coding. This avoids wasted effort on changes that don't fit the scope, and
lets us surface context you may not have (adjacent refactors, deprecated
paths, etc.).

## 2. Fork and branch

Once the issue is approved:

1. **Fork** the repository to your own GitHub account.
2. Clone your fork locally and install deps with `pnpm install`.
3. Create a **feature branch** off `main` named after the change. Prefix it
   with the type:
   - `feat/<short-description>`
   - `fix/<short-description>`
   - `refactor/<short-description>`
   - `docs/<short-description>`

   Example: `feat/plugin-skills-search`.

## 3. Make your change

- Follow the conventions in [`CLAUDE.md`](./CLAUDE.md) and
  [`ARCHITECTURE.md`](./ARCHITECTURE.md).
- Keep the change focused — one issue, one PR. Don't smuggle unrelated
  cleanups into a feature PR; open a separate issue/PR for those.
- Commit messages in **English**, using conventional-commits style:
  `<type>(<scope>): <summary>` (e.g. `fix(plugin-skills): handle missing
  marketplace dir`).
- Before pushing, run the validation pipeline:

  ```bash
  pnpm -F @nakirosai/nakiros exec tsc --noEmit
  pnpm -F @nakiros/frontend   exec tsc --noEmit
  pnpm -F @nakiros/landing    exec tsc --noEmit
  turbo build
  ```

- Test the feature in the browser (daemon + web UI) when the change
  touches UI or runtime behavior.

## 4. Open a pull request

Push your branch to your fork and open a PR against `NakirosAI/nakiros:main`.

Your PR description **must**:

1. Link the issue with `Closes #<issue-number>` (or `Refs #<issue-number>`
   if the issue will stay open).
2. Summarize *what* changed and *why* — the PR is the place the reviewer
   reconstructs the reasoning from, so don't just paste the commit list.
3. Include a **Test plan**: a short checklist of what you verified
   manually (and any cases you left uncovered).
4. Call out any breaking change or migration users will need.

A PR without a linked issue will be closed and asked to re-open once an
issue exists.

## 5. Review

- Address review comments by **new commits on your branch** (we squash on
  merge, so don't rebase/force-push unless asked).
- A maintainer merges once the PR has at least one approval and all CI
  checks pass.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](./LICENSE) that covers this repository.
