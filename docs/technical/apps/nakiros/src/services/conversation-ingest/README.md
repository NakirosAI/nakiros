# conversation-ingest

Opt-in pipeline that captures Claude Code session JSONL files via a global Stop hook and persists their parsed turns to `~/.nakiros/ingest/projects/<encoded>/`. Sessions are tagged `user` or `synthetic`; a best-effort sentiment pre-pass scores user messages via a local ONNX model after each ingest.

## Files

- [index.md](./index.md) — service barrel (public API surface)
- [runner.md](./runner.md) — core ingest runner: queue drain, full scan, lazy per-project indexers, sentiment IIFE
- [project-store.md](./project-store.md) — persistent project-keyed index + session body store
- [paths.md](./paths.md) — directory/file path helpers for the pipeline
- [hook-installer.md](./hook-installer.md) — install/uninstall the Stop hook in `~/.claude/settings.json`
- [hook-script.md](./hook-script.md) — inline source of the `hook-stop.cjs` daemon-independent script
- [watcher.md](./watcher.md) — chokidar-based queue watcher
- [classifier.md](./classifier.md) — V1.1 friction classifier digest persistence helpers
- [digest-builder.md](./digest-builder.md) — conversation → dense LLM-ready digest compressor
- [classifier-parser.md](./classifier-parser.md) — JSON parser for the classifier skill output
