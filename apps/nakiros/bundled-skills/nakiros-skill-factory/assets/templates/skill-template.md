---
name: {skill-name}
description: "{What the skill does}. Use when {trigger scenarios}."
user-invocable: true
disable-model-invocation: false
---

# {Skill Title}

{One sentence: what this skill does and for whom.}

**IMPORTANT: Always speak French with the user. Only these instructions are in English.**

## Inputs

| Input | Source | When |
|-------|--------|------|
| {Command + args} | User chat (e.g., `"{example command}"`) | Always |
| {File or data} | {Path or source} | {Condition} |

## Outputs

| Command | Files produced | Chat output |
|---------|---------------|-------------|
| `{command}` | `{output path pattern}` | {What appears in chat} |

## Example flow

```
Input:  "{realistic user command}"
Reads:  {list of files read}
Output: {files created} + {chat summary}
```

## Context loading — do this EVERY time

1. {File to read}: read `{path}` — {why}
2. {File to read}: read `{path}` — {why}

## Workflow

### On `{command}`

1. {Step 1 — specific action}
2. {Step 2 — specific action}
3. {Step 3 — specific action}

## Gotchas

- {Project-specific trap the agent WILL fall into without this warning}
- {Another concrete gotcha with specific details}

## Available commands

- **"{command} [args]"** → {What it does}
