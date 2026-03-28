# Step 1: Discovery — Analyse onboarding du workspace

## MANDATORY EXECUTION RULES (READ FIRST):

- NEVER generate context files in this step — this step is READ-ONLY
- Read this entire file before taking any action
- You are a facilitator — present findings, do not dump files
- Communicate in `communication_language` from workflow config
- FORBIDDEN to start specialist file generation until user selects [C]
- You MUST analyze ALL repos listed in workspace config, not only the cwd
- Distinguish `Confirmed`, `Inferred`, and `Unknown` in your reasoning even if the final summary stays concise
- If the current working directory is `~/.nakiros` (or another agent runtime directory), do NOT analyze it as the user project

---

## YOUR TASK

Analyse the entire workspace as if you were onboarding a new developer:
- understand what each repo seems to do
- understand how the repos collaborate
- understand where someone should go to work on a topic
- present your current understanding for validation

Do not write files in this step.

---

## STEP 1A — Load configuration

1. Load `~/.nakiros/config.yaml` if available (optional).
2. Apply defaults: `communication_language = Français`, `document_language = English`.
3. Read `workspace.yaml` from cwd — cwd is the workspace dir (`~/.nakiros/workspaces/{workspace_slug}/`), repos are available as subdirectories.
4. Build `repos_to_analyze` from the `repos` list in `workspace.yaml`; each repo is accessible as a subdirectory of cwd.
5. Guard rail:
   - If `workspace.yaml` is missing from cwd, STOP.
   - Report a scope error: the workflow must be launched from the workspace dir, not from an individual repo.
   - Do not continue to repo analysis in that case.

**Announce immediately in communication_language:**

```text
📋 [GENERATE-CONTEXT] Step 1 — Discovery

Repos détectés ({N} total) :
1. {name} · {role} · {localPath}
2. {name} · {role} · {localPath}
...
```

---

## STEP 1B — Analyse each repo (READ-ONLY)

For EACH repo in `repos_to_analyze`, in order:

### Repo purpose

- Identify what business or platform responsibility the repo appears to own.
- Back the statement with concrete evidence from README, route/module names, entry points, or contracts.

### Entry points and stack

- Identify `main.ts`, `index.ts`, `app.ts`, `server.ts`, `main.py`, `app.py`, `main.go`, etc.
- Read dependency manifests (`package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`, `pom.xml`, `pyproject.toml`, etc.).

### Main modules and dominant areas

- Map top-level directories with a short role description.
- Go one level deeper for dominant code directories.
- Identify 2-4 core modules/features that look central to the repo.

### Contracts and execution hints

- Capture critical APIs, events, shared types, or integration files.
- Capture useful run/build/test commands when they are discoverable in manifests or docs.

### Risks, migrations, and hotspots

- Flag legacy/new coexistence, double writes, hard-coded infra, fragile auth, partial migrations, or expensive reads.
- Severity scale:
  - `[CRITICAL]` blocks safe delivery or creates strong production risk
  - `[MODERATE]` slows delivery or makes change riskier
  - `[MINOR]` low-impact inconsistency

### Confidence

- End each repo analysis with:
  - `Confidence`: `high`, `medium`, or `low`
  - `Unknowns`: what you could not confidently confirm

If multi-repo, after individual analysis:

### Workspace/system view

- Map main end-to-end flows across repos
- Identify likely source-of-truth ownership per domain
- Identify repo order to inspect for common change types

Store all findings in memory. Do NOT write any files.

---

## STEP 1C — Present findings and invite corrections

Present findings in `communication_language` using this exact structure:

```text
📊 Voici ce que j'ai compris sur [workspace_name] ({N} repos)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[repo_name] · role: {primary|secondary}
{localPath}

Purpose     : {what this repo seems to own}
Stack       : {language + framework + key libs}
Modules     : {2–4 dominant modules/directories}
Contrats    : {important APIs/events/types + useful run/test clue}
Risques     : {key legacy/migration/debt observations}
Confidence  : {high|medium|low} — {top unknown if any}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{repeat for each repo}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{if multi-repo:}
Vue système
  • {main product flow}
  • {source of truth insight}
  • {recommended repo order for a common change}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Contexte qui sera généré :

Par repo :
  • {repo1}/_nakiros/architecture/index.md
  • {repo1}/_nakiros/architecture/{domain}.md
  • {repo1}/_nakiros/stack.md
  • {repo1}/_nakiros/conventions.md
  • {repo1}/_nakiros/api.md
  • {repo1}/_nakiros/llms.txt
  • {repo1}/_nakiros/product/features/{feature}.md
  ...

Niveau workspace :
  • ~/.nakiros/workspaces/{workspace_slug}/context/architecture/index.md
  • ~/.nakiros/workspaces/{workspace_slug}/context/architecture/{domain}.md
  • ~/.nakiros/workspaces/{workspace_slug}/context/product-context.md
{if multi-repo: "  • ~/.nakiros/workspaces/{workspace_slug}/context/inter-repo.md"}
  • ~/.nakiros/workspaces/{workspace_slug}/context/global-context.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Apportez vos corrections ou ajouts ici si nécessaire.

[C] Confirmer et générer le contexte
```

---

## SUCCESS METRICS

- All repos from workspace config were analysed
- Findings stored in memory, no files written to disk
- Summary helps a new dev understand where to start
- Confidence and unknowns are explicit
- Corrections invited before user selects [C]
- Workflow stopped — waiting for user input

## FAILURE MODES

- Writing any file during this step
- Analysing only the cwd repo and ignoring others
- Proceeding to specialist file generation without user selecting [C]
- Presenting a purely technical inventory with no action guidance
- Hiding uncertainty instead of stating confidence / unknowns

## NEXT STEP

After user selects [C], return control to the orchestrator.
The orchestrator executes repo specialists first, then Analyst aggregates the generated docs into workspace-global files.
