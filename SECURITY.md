# Security policy

## Supported versions

Security updates are published for the latest minor release on npm
(`@nakirosai/nakiros`). Older minors are **not** backported.

| Version | Supported          |
| ------- | ------------------ |
| 0.4.x   | :white_check_mark: |
| < 0.4   | :x:                |

## Reporting a vulnerability

**Do not open a public GitHub issue for security reports.**

Pick whichever channel you prefer:

- **GitHub private advisory** (preferred):
  <https://github.com/NakirosAI/nakiros/security/advisories/new> — fill
  in a description, reproduction steps, and the versions affected.
- **Email**: <security@nakiros.com> — PGP not required; please include
  the same information as above.

We will acknowledge the report within **5 business days**, agree on a fix
timeline, and coordinate disclosure. If the report is valid, you will be
credited in the advisory (unless you prefer to stay anonymous).

## Scope

In scope:

- `@nakirosai/nakiros` npm package (local daemon + web UI).
- Anything that lets an attacker escape the local-only model (e.g. a
  network call we didn't document, a path traversal out of `~/.nakiros/`,
  or a skill execution that breaks the sandbox).

Out of scope:

- Vulnerabilities that require the user to have already installed a
  malicious third-party skill (skill code runs with the user's
  permissions — that's the user's trust boundary, not ours).
- Social-engineering attacks against the project (typosquatting,
  phishing, etc.) — report those directly to npm / GitHub.
