---
paths:
  - "apps/frontend/src/components/ui/MarkdownViewer.tsx"
  - "apps/frontend/src/views/**/*.tsx"
  - "apps/frontend/src/components/conversations/**"
  - "apps/frontend/src/components/skill/**"
  - "apps/frontend/src/components/runs/**"
---

# Rule — Markdown rendering

All `.md` content displayed in the UI goes through
`apps/frontend/src/components/ui/MarkdownViewer.tsx`. No exceptions.

## What `MarkdownViewer` provides

- `react-markdown` + GFM (tables, task lists, strikethrough, autolink)
- Mermaid diagrams (`mermaid` code blocks)
- Diff blocks (`diff` code blocks)
- Syntax-highlighted code blocks
- Consistent typography that matches the new-design tokens

## Never do this

```tsx
// ❌ raw <pre> for markdown content
<pre className="whitespace-pre-wrap">{auditReport}</pre>

// ❌ ad-hoc <div dangerouslySetInnerHTML>
<div dangerouslySetInnerHTML={{ __html: marked(content) }} />

// ❌ a different markdown library
import ReactMarkdown from 'react-markdown';  // use MarkdownViewer instead
```

## Always do this

```tsx
import { MarkdownViewer } from '@/components/ui/MarkdownViewer';

<MarkdownViewer content={content} />
```

## Where it applies

Everywhere markdown is shown to the user:

- Skills (SKILL.md, references)
- Audit reports (audit-report.md)
- Fix findings, eval findings
- CLAUDE.md preview
- Chat messages
- Any markdown coming from the daemon over IPC

## No truncation of user content

Inside the viewer or alongside it: do **not** truncate paths, commands,
permissions strings, JSON payloads, or URLs. The user must be able to audit
the exact content. Use `whitespace-pre-wrap`, `break-all`, or `flex-wrap` to
make long lines wrap. Ellipsis is for decorative labels only.
