# Markdown structure — docs/technical/

This document defines the layout and format of the mirrored Markdown tree.

## Mirror rule

The `docs/technical/` tree is a strict mirror of the source layout, with `.ts` / `.tsx` replaced by `.md` and folders gaining a `README.md` index:

```
Source                                               Doc
apps/nakiros/src/daemon/handlers/skills.ts     →     docs/technical/apps/nakiros/src/daemon/handlers/skills.md
apps/nakiros/src/daemon/handlers/                    docs/technical/apps/nakiros/src/daemon/handlers/README.md
apps/nakiros/src/daemon/                             docs/technical/apps/nakiros/src/daemon/README.md
apps/nakiros/                                        docs/technical/apps/nakiros/README.md
apps/                                                docs/technical/apps/README.md
                                                     docs/technical/README.md   (root index)
```

No renaming, no flattening, no grouping by topic. If the source moves, the doc moves with it.

## Two file types

### Leaf file (`*.md`, one per source file)

Reproduces the TSDoc of every exported symbol from the mirrored source file. See `templates/leaf.md`.

**No line cap** — a leaf documenting a file with 40 exported functions will be long. That's fine: the leaf is for targeted reading, not browsing.

### Index file (`README.md`, one per folder)

Lists direct children (subfolders + leaf files) with a one-line description each. See `templates/index.md`.

**Hard cap: 200 lines.** If an index would exceed 200 lines, split per "Splitting large indexes" below.

## Index content rules

Every index has:
1. A title (the folder name or its role).
2. A short purpose paragraph (2–3 lines): what this folder is about, who reads files under it.
3. A `## Subfolders` section (if any subfolders exist) — bullet list linking each subfolder's `README.md`.
4. A `## Files` section (if any leaves exist) — bullet list linking each leaf.
5. No prose beyond those sections. No duplication of leaf content.

Entry format (one line per child):

```md
- [name](./path) — one-line description
```

The description:
- For a subfolder: copy the purpose paragraph's first sentence from the child's `README.md`.
- For a leaf: copy the leaf's top-level purpose line (the description of the file itself, not of its first exported symbol).

## Splitting large indexes

When a `README.md` would exceed 200 lines, split by **thematic grouping** — not alphabetical chunks. Two strategies (pick the one that fits):

### Strategy 1 — Promote subfolders

If the folder has many subfolders AND many direct files, move the direct files into an appropriately-named subfolder in the **source tree** (not just the doc). That's a source-level refactor, so flag it to the user in chat rather than doing it silently.

If you cannot refactor the source: proceed to Strategy 2.

### Strategy 2 — Thematic sub-indexes

Create sub-indexes inside the same folder, named `README.<theme>.md`:

```
docs/technical/apps/nakiros/src/daemon/handlers/
├── README.md                    (root index — lists themes)
├── README.skills.md             (skills:* channels)
├── README.audit.md              (audit:* channels)
├── README.fix.md                (fix:* channels)
└── skills.ts.md, audit.ts.md, … (leaves)
```

The root `README.md` then only lists themes and their `README.<theme>.md`, not individual files. Each `README.<theme>.md` lists the files in its theme.

Choose themes based on the real functional grouping, not arbitrary letter ranges. If no natural grouping exists, ask the user which split makes sense before creating one.

## Orphan detection

After refreshing indexes, cross-check: every `.md` file under the folder must be reachable from its `README.md` (direct link or via a `README.<theme>.md`). If a leaf exists on disk but is not linked anywhere → it's an orphan, add it back to the index.

## Deletion cascade

When a source file is deleted:
1. Delete the mirror leaf.
2. Remove the entry from the parent `README.md` (or the theme `README.<theme>.md` if split).
3. If the deletion empties a folder entirely → delete the folder's `README.md` and remove the entry from its parent.

## Root index (`docs/technical/README.md`)

The root index is special:
- States what `docs/technical/` is for (one paragraph: "Generated TSDoc mirror for the Nakiros monorepo. Read the index closest to your target file; leaves reproduce the TSDoc of one source file each.").
- Lists the top-level packages: `apps/`, `packages/`.
- Notes the last refresh date (`> Last refresh: <ISO date>`, pulled from manifest `updated_at`).
- Never exceeds 200 lines (trivially true since it only lists 2 packages).
