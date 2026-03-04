# Step 1: Discovery — Analyse de tous les repos

## MANDATORY EXECUTION RULES (READ FIRST):

- 🛑 NEVER generate context files in this step — this step is READ-ONLY
- 📖 CRITICAL: Read this entire file before taking any action
- ✅ YOU ARE A FACILITATOR — present your findings, do not dump files
- 💬 Communicate in `communication_language` from workflow config
- 🚫 FORBIDDEN to load step-02-generate.md until user selects [C]
- ⚠️ You MUST analyze ALL repos listed in workspace config, not only the cwd

## EXECUTION PROTOCOLS:

- 🎯 Announce the list of repos before starting analysis
- 🔍 For each repo, collect findings in memory (no files written)
- 📋 Present a structured summary with corrections invited
- 🚪 End with the [C] menu — wait for user confirmation

---

## YOUR TASK:

Analyse the entire workspace (all repos), present your findings for validation, and wait for the user to confirm before any file is generated.

---

## STEP 1A — Load configuration

1. Load `{project-root}/.nakiros.yaml` (required). Warn but continue if missing.
2. Load `~/.nakiros/config.yaml` if available (optional).
3. Apply defaults: `communication_language = Français`, `document_language = English`.
4. Read `{project-root}/.nakiros.workspace.yaml` if present.
5. Build `repos_to_analyze`:
   - If workspace config found → full list from `workspace.repos`
   - Otherwise → `[current repo only]`

**Announce immediately in communication_language:**

```
📋 [GENERATE-CONTEXT] Step 1 — Discovery

Repos détectés ({N} total) :
1. {name} · {role} · {localPath}
2. {name} · {role} · {localPath}
...
```

---

## STEP 1B — Analyse each repo (READ-ONLY)

**For EACH repo in repos_to_analyze, in order:**

**Entry Points** — identify `main.ts`, `index.ts`, `app.ts`, `server.ts`, `main.py`, `app.py`, `main.go`, etc.

**Tech Stack** — read dependency manifests (`package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`, `pom.xml`). Note primary framework, ORM, infra/deployment.

**Directory Structure** — map top-level dirs with a one-sentence role. Go one level deeper for core domain logic dirs.

**Architectural Patterns** — monolith / microservices / monorepo, MVC / hexagonal / clean / layered, state management, API style (REST / GraphQL / gRPC / tRPC), testing strategy.

**Key Interfaces & Contracts** — critical shared types, API contracts between modules. Cite exact file paths.

**Tech Debt** — flag items with severity:
- `[CRITICAL]` — blocks features or creates a security risk
- `[MODERATE]` — degrades developer velocity
- `[MINOR]` — cosmetic or low-impact

**If multi-repo:** after analysing all repos individually, map cross-repo contracts, shared packages, event/message boundaries (queues, webhooks, events).

> Store all findings in memory. **DO NOT write any files.**

---

## STEP 1C — Present findings and invite corrections

Present findings in `communication_language` using this exact structure:

```
📊 Voici ce que j'ai compris sur [workspace_name] ({N} repos)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[repo_name] · role: {primary|secondary}
{localPath}

Stack       : {language + framework + key libs}
Pattern     : {dominant architectural pattern}
Points clés :
  • {important observation 1}
  • {important observation 2}
  • {important observation 3}
Dette tech  : {[CRITICAL]/[MODERATE] items, or "Aucune critique identifiée"}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{repeat for each repo}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{if multi-repo:}
Relations inter-repos
  • {key cross-repo contract or dependency}
  • {or "Aucune relation directe détectée"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 Fichiers qui seront générés :

Par repo (dans chaque repo respectif) :
  • {repo1}/_nakiros/context/architecture.md
  • {repo2}/_nakiros/context/architecture.md
  ...

Niveau workspace (global) :
  • ~/.nakiros/workspaces/{workspace_name}/global-context.md
  • ~/.nakiros/workspaces/{workspace_name}/pm-context.md
{if multi-repo: "  • ~/.nakiros/workspaces/{workspace_name}/inter-repo.md"}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Apportez vos corrections ou ajouts ici si nécessaire.

[C] Confirmer et générer les fichiers de contexte
```

---

## SUCCESS METRICS:

✅ All repos from workspace config were analysed (not only cwd)
✅ Findings stored in memory, no files written to disk
✅ Structured summary presented in communication_language
✅ Corrections invited before user selects [C]
✅ Workflow stopped — waiting for user input

## FAILURE MODES:

❌ Writing any file during this step
❌ Analysing only the cwd repo and ignoring others
❌ Proceeding to step-02-generate.md without user selecting [C]
❌ Presenting findings without inviting corrections
❌ **CRITICAL**: Skipping repos that are not in cwd

## NEXT STEP:

After user selects [C], return control to the orchestrator (`instructions.xml`).
The orchestrator executes:
- Phase B: specialist sub-agents (Architect per repo, PM for workspace)
- Phase C: synthesis from findings → final .md files

Note any corrections the user mentioned — they will be passed to sub-agents in Phase B.

**Do NOT spawn any sub-agent or write any file until the user explicitly selects [C].**
