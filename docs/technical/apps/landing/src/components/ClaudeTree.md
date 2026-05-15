# ClaudeTree.tsx

**Path:** `apps/landing/src/components/ClaudeTree.tsx`

Static `.claude/` directory tree explorer. Renders a frozen mock of CLAUDE_TREE dataset — skills, agents, rules, output-styles, and top-level files — each row showing a kind icon, artifact name, score pill, and frontmatter-status badge. Used in the Hero and Room sections.

## Exports

### `ClaudeTree`

```ts
export function ClaudeTree({ highlight }: ClaudeTreeProps): JSX.Element
```

Static `.claude/` directory tree explorer used in the Hero and Room sections.

Renders a frozen mock of the CLAUDE_TREE dataset — no runtime fetch. Each row shows a kind icon, the artifact name, a score pill, and a frontmatter-status badge. The optional `highlight` prop accents a single row to draw the visitor's eye to a specific skill (typically `"proposal-engine"`).

### `ClaudeTreeProps`

```ts
interface ClaudeTreeProps {
  /** Name of the tree node to highlight with an accent left-border. Optional. */
  highlight?: string;
}
```

Props for `ClaudeTree`.
