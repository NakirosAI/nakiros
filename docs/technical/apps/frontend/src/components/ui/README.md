# ui/

**Path:** `apps/frontend/src/components/ui/`

Themed UI primitives shared by every feature view in the Nakiros frontend. Pure Tailwind + CSS variables, plus thin wrappers around Radix primitives where appropriate. Most callers should import from [`index.ts`](./index.md) (the curated barrel); a few primitives (`Card`, `Progress`, `ScrollArea`, `Tabs`, `Tooltip`) are imported directly from their source modules.

## Files

- [Badge.tsx](./Badge.md) — Inline pill component used to label statuses, counts and short tags.
- [Button.tsx](./Button.md) — Primary call-to-action component built on Radix `Slot` (`asChild`) and `class-variance-authority`.
- [Card.tsx](./Card.md) — Composable card surface (`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`).
- [Checkbox.tsx](./Checkbox.md) — Themed checkbox built on the Radix `Checkbox` primitive.
- [EmptyState.tsx](./EmptyState.md) — Centered placeholder shown when a list or panel has no data.
- [FormField.tsx](./FormField.md) — Vertical label / control / hint-or-error layout used internally by `Input`, `Select`, `Textarea`.
- [Input.tsx](./Input.md) — Themed text input wrapped in a `FormField` with optional leading icon.
- [MarkdownViewer.tsx](./MarkdownViewer.md) — Themed `react-markdown` + `remark-gfm` renderer with custom support for Mermaid and unified diffs.
- [Modal.tsx](./Modal.md) — Lightweight controlled modal dialog (not portalled).
- [Select.tsx](./Select.md) — Themed native `<select>` driven by an `options` array.
- [Textarea.tsx](./Textarea.md) — Themed multi-line text input wrapped in a `FormField`.
- [alert.tsx](./alert.md) — Banner used to surface contextual feedback (info, errors).
- [index.ts](./index.md) — Curated barrel re-exporting the subset of primitives feature code consumes.
- [progress.tsx](./progress.md) — Themed horizontal progress bar built on the Radix `Progress` primitive.
- [scroll-area.tsx](./scroll-area.md) — Themed scroll container built on the Radix `ScrollArea` primitive.
- [separator.tsx](./separator.md) — Thin divider built on the Radix `Separator` primitive.
- [tabs.tsx](./tabs.md) — Themed tab system built on the Radix `Tabs` primitive.
- [tooltip.tsx](./tooltip.md) — Themed tooltip stack built on the Radix `Tooltip` primitive.
