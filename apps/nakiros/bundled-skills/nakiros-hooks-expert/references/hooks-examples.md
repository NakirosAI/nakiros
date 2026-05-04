# Hooks Examples

Three annotated examples illustrating the spectrum from well-structured to
dangerous configurations. Use these as references when auditing and fixing.

---

## Example 1 — Well-structured hooks block

Every best practice applied: absolute paths, explicit timeout, `if` narrowing,
`exit 2` for blocking, HTTPS for http hooks, `statusMessage` for async work.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/guard-bash.sh",
            "if": "Bash(rm *)",
            "timeout": 10,
            "statusMessage": "Checking rm command"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/lint-changed.sh",
            "timeout": 30,
            "statusMessage": "Linting changed files"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/typecheck.sh",
            "async": true,
            "timeout": 120,
            "statusMessage": "Running tsc in background"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "http",
            "url": "https://hooks.internal/session-start",
            "headers": { "Authorization": "Bearer ${SESSION_TOKEN}" },
            "allowedEnvVars": ["SESSION_TOKEN"],
            "timeout": 10,
            "statusMessage": "Notifying session tracker"
          }
        ]
      }
    ]
  }
}
```

**Why this is good**:
- `$CLAUDE_PROJECT_DIR` with quoted path — cwd-independent, handles spaces
- `if: "Bash(rm *)"` — narrows execution to only `rm` commands (no spawn for every Bash call)
- `timeout: 10/30/120` — explicit on every handler
- `async: true` on Stop — background work so the session isn't blocked
- HTTPS URL — no credentials leak over plain HTTP
- `statusMessage` on all async handlers — user sees what's happening

**`guard-bash.sh` (what `exit 2` looks like)**:
```bash
#!/bin/bash
# Blocks rm commands that match a dangerous pattern.
# exit 2 = blocking error fed back to Claude.
if echo "$CLAUDE_TOOL_INPUT" | grep -qE 'rm -rf /|rm -rf \$HOME'; then
  echo "Blocked: destructive rm pattern detected" >&2
  exit 2
fi
exit 0
```

---

## Example 2 — Block with anti-patterns

Real hooks that work but have quality issues: missing timeouts, overly broad
matchers, matcher set on an event that ignores it.

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node scripts/post-tool-logger.mjs"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "build-done",
        "hooks": [
          {
            "type": "command",
            "command": "pnpm build"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl http://localhost:9000/session-ended"
          }
        ]
      }
    ]
  }
}
```

**Issues and their check IDs**:

| Issue | Check | Severity |
|-------|-------|----------|
| `PostToolUse` hooks: no `timeout` | `handler.timeout_explicit` | Warn |
| `Stop` hooks: no `timeout` | `handler.timeout_explicit` | Warn |
| `Stop` has `matcher: "build-done"` — Stop ignores matchers | `structure.matcher_compatible_with_event` | Warn |
| `SessionEnd` hook: no `timeout` | `handler.timeout_explicit` | Warn |
| `SessionEnd` hook: HTTP (non-HTTPS) URL via curl | `bp.no_unjustified_dangerous` | Warn |
| `PostToolUse` command: no `$CLAUDE_PROJECT_DIR` → depends on cwd | `crossref.command_path_exists` (agent check) | Warn |
| `PostToolUse` logs every tool call → not idempotent, no `statusMessage` | `bp.idempotent_or_documented` | Info |

**How to fix**:
- Add `timeout` to all three handlers
- Remove the `matcher: "build-done"` from `Stop` (it's silently ignored)
- Change `curl http://` to `curl https://`
- Prefix `node scripts/...` with `"$CLAUDE_PROJECT_DIR"/`
- Add `statusMessage: "Logging tool use"` to the logger

---

## Example 3 — Dangerous / incorrect configuration

Configuration with patterns that should block on audit or trigger critical fixes.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash -c \"eval $BASH_CMD\"",
            "timeout": 600
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "http",
            "url": "http://internal-tracker.local/log",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "rm -rf ../tmp && mkdir ../tmp",
            "timeout": 30
          }
        ]
      }
    ],
    "FakeEvent": [
      {
        "hooks": [
          {
            "type": "shell",
            "run": "echo hello"
          }
        ]
      }
    ]
  }
}
```

**Issues and their check IDs**:

| Issue | Check | Severity |
|-------|-------|----------|
| `"FakeEvent"` is not a valid hook event | `structure.valid_event_name` | Critical |
| `type: "shell"` is not a valid handler type | `handler.type_valid` | Critical |
| `"shell"` handler: missing `command` field (wrong type name) | `handler.required_fields` | Critical |
| HTTP (non-HTTPS) URL in PostToolUse | `bp.no_unjustified_dangerous` | Warn |
| `rm -rf ../tmp` — path traversal with `../` | `bp.no_unjustified_dangerous` | Warn |
| `eval $BASH_CMD` — injects unvalidated env var into shell | `bp.no_unjustified_dangerous` (agent judgement) | Warn |
| `timeout: 600` on a PreToolUse interactive hook — too long | `handler.timeout_explicit` (passes, but warn in Notes) | — |

**What the audit report should say for Priority Fixes**:

```
### Critical
- FakeEvent: unknown hook event name — will be silently ignored
- FakeEvent handler: type="shell" is not valid — use "command" instead
- FakeEvent handler: missing required field "command"

### Important
- PostToolUse http handler: HTTP URL leaks data over unencrypted channel — change to HTTPS
- Stop command handler: path traversal "../tmp" — use $CLAUDE_PROJECT_DIR instead
- PreToolUse command handler: eval of $BASH_CMD injects arbitrary code — verify intent

### Minor
- PreToolUse command handler: timeout=600s is the default max — consider 10–30s for interactive hooks
```
