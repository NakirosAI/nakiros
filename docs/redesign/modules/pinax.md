# Module — Pinax (vision only)

> πίναξ, *register / index*. Cross-repo, per-entity code knowledge base.

> **Status: vision only.** This is the largest net-new build. Detailed
> architecture is deferred to a dedicated design session. This page records the
> intent so the rest of the suite is shaped to accommodate it.

## The problem

A company has many git repositories. Each service depends on others. AI agents
(and humans) lose the thread: an agent working in one repo has no idea how a
neighbouring service behaves, what its contracts are, or why a decision was made
elsewhere.

## The idea

Pinax is **per entity, not per project**. It:

- analyses code **across repositories**,
- builds documentation that is readable by **both humans and AI**,
- ingests external context through **connectors** (Jira, Confluence, …) to feed
  the picture beyond code,
- so that an AI agent (and a person) simply *knows more* when working anywhere in
  the entity.

## Where it fits in the suite

- Distributed and run like every other module: backend + front + manifest,
  loaded into the same host, on the same `:4242`, using the shared runner.
- Likely **provides** a `knowledge.context` capability that other modules — and
  external agents — **consume** to enrich runs. Added via the same
  `provides`/`consumes` + shared payload type mechanism (doc 05); no changes to
  other modules' code.

## Open questions for the dedicated session

- Storage & indexing: how cross-repo knowledge is stored and searched
  (vector index? graph? both?).
- Ingestion: incremental code analysis across many repos; connector framework
  (Jira, Confluence, and how to add more).
- Consumption surface: how an external agent (Claude Code, etc.) queries Pinax —
  MCP server? local API? both?
- Human surface: the browsable documentation UI.
- Freshness: keeping the knowledge base current as repos change.

These are deliberately left open — Pinax gets its own design pass.
