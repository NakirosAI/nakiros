# Nakiros — Jira App Description

## App name
Nakiros

## Short description (255 characters max)
Nakiros is an AI agent orchestration layer for dev teams. It connects to Jira to read tickets, update statuses, log worklogs, and post comments automatically — driven by specialized AI agents.

## Long description

Nakiros is a local AI agent orchestration platform for software development teams. It wraps existing AI editors (Claude Code, Cursor, Codex) with structured delivery processes, directly connected to your Jira projects.

**What Nakiros does with Jira:**

Nakiros reads your Jira tickets and uses them as the source of truth for its AI agents. When a developer starts working on a story, Nakiros automatically:
- Fetches the ticket content, acceptance criteria, and context
- Transitions the ticket status (e.g. To Do → In Progress → In Review)
- Starts and stops worklogs to track time spent
- Posts structured comments with progress updates and PR links
- Challenges ticket quality before implementation (clarity, AC, scope, dependencies)

At the end of each day, Nakiros generates a daily standup report. At the end of each sprint, it generates a per-developer retrospective — all synced back to your Jira project.

**Permissions used:**

- **Read** projects, boards, sprints, issues, epics
- **Write** issue status transitions, worklogs, comments
- **No access** to billing, admin settings, or user management

**How it works:**

Nakiros runs entirely on the developer's local machine. It connects to Jira via OAuth 2.0 and routes all requests through a local MCP server (Model Context Protocol). No data is sent to external servers — everything stays on the user's machine.

**Supported Jira configurations:**
- Scrum and Kanban boards
- Classic and Next-gen projects
- Multiple Jira instances per workspace

## App category
Developer Tools

## Vendor
Nakiros

## Website
https://nakiros.com

## Privacy policy
https://nakiros.com/privacy

---

## Scopes required

| Scope | Reason |
|---|---|
| `read:jira-work` | Read issues, sprints, epics, boards |
| `write:jira-work` | Update issue status, post comments, log worklogs |
| `read:jira-user` | Identify the authenticated user |
| `offline_access` | Maintain persistent connection without re-authentication |
