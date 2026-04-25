# handlers/

**Path:** `apps/nakiros/src/daemon/handlers/`

Domain-scoped IPC handler bundles. Each `<domain>.ts` exports one `xxxHandlers: HandlerRegistry` map; `index.ts` merges them all into the final registry consumed by `POST /ipc/:channel`. Handlers never reference IPC channel strings directly — they use the `IPC_CHANNELS` registry from `@nakiros/shared` (enforced by `CLAUDE.md`).

## Files

### Infrastructure
- [index.ts](./index.md) — Handler registry builder. Merges every domain bundle.
- [run-helpers.ts](./run-helpers.md) — Cross-handler helpers: typed broadcaster factory, run-or-throw lookup, skill-directory resolver for the minimal `SkillRunIdentity` shape.
- [skill-dir.ts](./skill-dir.md) — Central scope-aware resolver turning a `StartEvalRunRequest` into an absolute skill directory path.

### App-level surfaces
- [meta.ts](./meta.md) — `meta:*` version info.
- [shell.ts](./shell.md) — `shell:openPath` OS default-handler.
- [preferences.ts](./preferences.md) — `preferences:*` app preferences CRUD.
- [onboarding.ts](./onboarding.md) — `onboarding:*` editor detection + install.

### Skill scopes
- [bundled-skills.ts](./bundled-skills.md) — `nakiros:*` bundled skills (ROM) + conflict resolution.
- [claude-global.ts](./claude-global.md) — `claudeGlobal:*` user-global skills under `~/.claude/skills/`.
- [plugin-skills.ts](./plugin-skills.md) — `pluginSkills:*` plugin-provided skills.
- [skills-common.ts](./skills-common.md) — `skill:readFileAsDataUrl` cross-scope binary reader.

### Installer
- [agents.ts](./agents.md) — `agents:*` skill-command installer status + install.

### Projects & conversations
- [projects.ts](./projects.md) — `project:*` scanning, conversations (deterministic + deep LLM analysis), project-scoped skill CRUD.

### Run kinds
- [eval.ts](./eval.md) — `eval:*` full eval runner surface (lifecycle, stream, artefacts, feedback, matrix).
- [comparison.ts](./comparison.md) — `comparison:*` A/B/C comparison across Haiku/Sonnet/Opus.
- [audit.ts](./audit.md) — `audit:*` static skill review producing an archived report.
- [fix.ts](./fix.md) — `fix:*` skill iteration flow editing a temp copy (tmp_skill pattern — load-bearing).
- [create.ts](./create.md) — `create:*` new-skill-from-scratch mirror of `fix:*`.
- [skill-agent.ts](./skill-agent.md) — `skillAgent:*` shared draft-file surface for fix + create.
