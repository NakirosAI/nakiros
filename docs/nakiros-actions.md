# Nakiros Actions — Agent Reference

Actions are the universal interface for all external data access and mutation. Every interaction with the workspace, context store, or PM tool goes through a `nakiros-action` block — no MCP, no local config files.

An agent emits a JSON code block in its response. The Desktop intercepts it, executes a direct API call to the Nakiros backend, and re-injects the full result as the next turn — invisible to the user, ~130 tokens total.

---

## Block format

~~~
```nakiros-action
{ "tool": "<tool_name>", "<arg_key>": "<arg_value>" }
```
~~~

Rules:
- Valid JSON object. `tool` is the only required key — all other keys are arguments.
- One tool per block. Emit **multiple consecutive blocks** to chain actions.
- The entire block is stripped from visible chat output — the user never sees it.

---

## Workspace discovery

### `workspace_info`
Get workspace metadata: id, name, pmTool, topology, documentLanguage, communicationLanguage.

~~~
```nakiros-action
{ "tool": "workspace_info" }
```
~~~

### `workspace_repos`
Get all repos in the workspace: name, role, localPath, profile, stack.

~~~
```nakiros-action
{ "tool": "workspace_repos" }
```
~~~

---

## Context

### `repo_context_get`
Read stored context for a specific repo. Returns fields: architecture, stack, conventions, api, llms.

~~~
```nakiros-action
{ "tool": "repo_context_get", "repo": "api" }
```
~~~

Optional: add `"field": "architecture"` to fetch a single key instead of all fields.

### `workspace_context_get`
Read a workspace-level context document.

~~~
```nakiros-action
{ "tool": "workspace_context_get", "key": "product" }
```
~~~

Keys: `product`, `global`, `interRepo`, `brainstorming`.

### `repo_context_set`
Write or update a context field for a specific repo.

~~~
```nakiros-action
{ "tool": "repo_context_set", "repo": "api", "field": "architecture", "content": "<markdown content>" }
```
~~~

Fields: `architecture`, `stack`, `conventions`, `api`, `llms`.

### `workspace_context_set`
Write or update a workspace-level context document.

~~~
```nakiros-action
{ "tool": "workspace_context_set", "key": "product", "content": "<markdown content>" }
```
~~~

Keys: `product`, `global`, `interRepo`, `brainstorming`.

---

## PM tool

Tool names are **PM-agnostic**. The Nakiros runtime routes to the configured issue tracker based on the workspace configuration. Agents never need to know which PM tool is active.

### `get_ticket`
Fetch full ticket details (title, description, status, assignee, comments).

~~~
```nakiros-action
{ "tool": "get_ticket", "ticket_id": "NAK-123" }
```
~~~

### `create_ticket`
Create a new ticket in the workspace's PM project.

~~~
```nakiros-action
{ "tool": "create_ticket", "title": "Fix login redirect after OAuth", "type": "bug", "priority": "high", "assignee": "thomas@nakiros.com", "description": "After OAuth callback the user lands on /dashboard instead of the original page." }
```
~~~

Optional fields: `description`, `type`, `priority`, `assignee`, `parent_id`.

### `update_ticket_status`
Move a ticket to a new status column.

~~~
```nakiros-action
{ "tool": "update_ticket_status", "ticket_id": "NAK-123", "status": "In Progress" }
```
~~~

Status values depend on the workspace board — use the exact column name (case-insensitive).

### `add_comment`
Post a comment on a ticket.

~~~
```nakiros-action
{ "tool": "add_comment", "ticket_id": "NAK-123", "body": "Root cause is the redirect_uri mismatch in the OAuth config. Fix in PR #42." }
```
~~~

### `list_tickets`
List tickets matching a filter.

~~~
```nakiros-action
{ "tool": "list_tickets", "status": "In Progress", "assignee": "thomas@nakiros.com", "limit": "10" }
```
~~~

Optional fields: `status`, `assignee`, `label`, `sprint`, `limit` (default 20).

### `get_sprint`
Get the current active sprint details (name, goal, dates, ticket list).

~~~
```nakiros-action
{ "tool": "get_sprint" }
```
~~~

### `create_epic`
Create a new epic in the workspace backlog.

~~~
```nakiros-action
{ "tool": "create_epic", "name": "Notifications système", "description": "Alertes en temps réel.", "color": "#6366f1" }
```
~~~

Required: `name`. Optional: `description`, `color` (hex string).

### `create_story`
Create a new story in the workspace backlog.

~~~
```nakiros-action
{ "tool": "create_story", "title": "En tant qu'utilisateur, je veux recevoir une notification quand mon sprint démarre", "epic_id": "<id>", "priority": "high", "story_points": "3", "acceptance_criteria": "Badge rouge sur l'icône sidebar\nLe clic ouvre le sprint actif\nLa notification disparaît après lecture" }
```
~~~

Required: `title`. Optional: `epic_id`, `description`, `acceptance_criteria` (criteria separated by `\n`), `priority` (`low` | `medium` | `high`), `story_points`.

### `create_task`
Create a technical task under a story.

~~~
```nakiros-action
{ "tool": "create_task", "story_id": "<id>", "title": "Endpoint Worker — PATCH /ws/:id/sprints/:sprintId", "type": "backend", "description": "Valider la transition planning→active, émettre un event." }
```
~~~

Required: `story_id`, `title`. Optional: `type` (`backend` | `frontend` | `test` | `other`), `description`.

---

## How results come back

After each action the Desktop:
1. Shows a compact inline card below the agent message: `↳ get_ticket · NAK-123 · Fix login redirect…`
2. Re-injects the full JSON result as the next user turn (silent — no bubble):

```
[ACTION RESULT: get_ticket]
{
  "key": "NAK-123",
  "summary": "Fix login redirect after OAuth",
  "status": "To Do",
  "assignee": "thomas@nakiros.com"
}
[END ACTION RESULT]
```

The agent receives this in its context window and can continue directly.

Multiple blocks in the same response are executed **sequentially** before the next agent turn starts.

---

## Patterns

### Workspace discovery at activation

~~~
```nakiros-action
{ "tool": "workspace_info" }
```
```nakiros-action
{ "tool": "workspace_repos" }
```
~~~

Emit both in the same response — they execute sequentially. Use the results to understand workspace scope before answering.

### Read-then-update

~~~
```nakiros-action
{ "tool": "get_ticket", "ticket_id": "NAK-456" }
```
```nakiros-action
{ "tool": "update_ticket_status", "ticket_id": "NAK-456", "status": "In Review" }
```
~~~

### Create Feature chain (epic → story → tasks)

Step 1 — create the epic and story (two blocks, independent):

~~~
```nakiros-action
{ "tool": "create_epic", "name": "Notifications système" }
```
```nakiros-action
{ "tool": "create_story", "title": "Notification de démarrage de sprint" }
```
~~~

Step 2 — after receiving both results, create tasks referencing the story id:

~~~
```nakiros-action
{ "tool": "create_task", "story_id": "<story id from previous result>", "title": "Worker — transition sprint status", "type": "backend" }
```
```nakiros-action
{ "tool": "create_task", "story_id": "<story id from previous result>", "title": "UI — badge sidebar sprint actif", "type": "frontend" }
```
~~~

Blocks in the same response cannot cross-reference each other's results. Always split creation from dependent steps into two separate turns.

### Load and update context

~~~
```nakiros-action
{ "tool": "repo_context_get", "repo": "api" }
```
~~~

After analysis, write back:

~~~
```nakiros-action
{ "tool": "repo_context_set", "repo": "api", "field": "architecture", "content": "## Architecture\n\nREST API built with Hono..." }
```
~~~

---

## Agent orchestration

To invite another agent into the conversation room, emit an `agent-orchestration` block (also JSON):

~~~
```agent-orchestration
{
  "mode": "dispatch",
  "round_state": "continue",
  "parallel": false,
  "participants": [
    { "agent": "architect", "provider": "current", "reason": "evaluate technical feasibility", "focus": "identify impacted repos and migration path" }
  ],
  "shared_context": { "scope": "workspace", "user_goal": "short restatement" },
  "synthesis_goal": "what the calling agent expects back"
}
```
~~~

Any agent can emit this block — not only Nakiros. The runtime handles all launches.

---

## When to use actions vs plain text

| Situation | Use |
|---|---|
| Discover workspace structure at activation | `workspace_info` + `workspace_repos` |
| Load existing context before analysis | `repo_context_get` / `workspace_context_get` |
| Need live ticket data to answer the user | `get_ticket` / `list_tickets` |
| User asked to update a ticket | `update_ticket_status` / `add_comment` |
| Workflow step requires creating a sub-ticket | `create_ticket` / `create_story` / `create_task` |
| Writing new or updated context after analysis | `repo_context_set` / `workspace_context_set` |
| Just describing what to do without executing | Plain text (no action block) |
| Complex query not covered by the tools above | Ask the user to do it manually |
