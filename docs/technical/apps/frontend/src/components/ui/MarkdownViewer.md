# MarkdownViewer.tsx

**Path:** `apps/frontend/src/components/ui/MarkdownViewer.tsx`

Themed markdown renderer used by the Nakiros frontend to display skill content, evaluation reports and other long-form text. Wraps `react-markdown` + `remark-gfm` and adds custom renderers for headings, tables, inline code, fenced code, Mermaid diagrams (` ```mermaid `) and unified diffs (` ```diff `).

External links are opened in the system browser via `window.nakiros.openPath`. Internal links delegate to a caller-provided callback so feature views can route in-app.

## Exports

### `MarkdownViewer`

```ts
export function MarkdownViewer(props: MarkdownViewerProps): JSX.Element
```

Renders the provided `content` string as styled markdown.

**Parameters:**
- `content` — markdown source. Defaults to `''`.
- `className` — class merged onto the scrollable wrapper.
- `onInternalLinkClick` — invoked when a non-`http(s)` link is clicked.
