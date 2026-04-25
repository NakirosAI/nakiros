# index.ts

**Path:** `apps/frontend/src/components/ui/index.ts`

Barrel file re-exporting the subset of `ui/*` primitives that feature code is expected to consume. Note: not every file under `ui/` is re-exported here — components like `Card`, `Progress`, `ScrollArea`, `Tabs` and `Tooltip` are imported directly from their source modules.

## Re-exports

- `Badge`, `BadgeVariant` — see [Badge.md](./Badge.md)
- `Checkbox` — see [Checkbox.md](./Checkbox.md)
- `Button`, `buttonVariants` — see [Button.md](./Button.md)
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` — see [Card.md](./Card.md)
- `EmptyState` — see [EmptyState.md](./EmptyState.md)
- `FormField` — see [FormField.md](./FormField.md)
- `Input`, `InputProps` — see [Input.md](./Input.md)
- `Modal`, `ModalSize` — see [Modal.md](./Modal.md)
- `Select`, `SelectOption`, `SelectProps` — see [Select.md](./Select.md)
- `Textarea`, `TextareaProps` — see [Textarea.md](./Textarea.md)
- `Alert`, `AlertTitle`, `AlertDescription` — see [alert.md](./alert.md)
- `Separator` — see [separator.md](./separator.md)
- `MarkdownViewer` — see [MarkdownViewer.md](./MarkdownViewer.md)
