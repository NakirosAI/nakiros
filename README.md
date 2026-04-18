# Nakiros

Local daemon that observes Claude Code usage and lets you inspect, audit,
evaluate and improve your skills — all from your browser.

## What it does

- **Scans** your Claude Code projects and surfaces the skills they use
- **Reads** your Claude Code conversations to identify friction signals
- **Audits** skills against best practices
- **Evaluates** skills via automated runs to measure quality
- **Fixes** skills (isolated temp workdir, run evals on the fix before deploying)
- **Creates** new skills from scratch, review-then-deploy

All data stays on your machine — Nakiros is local-first and open source.

## Requirements

- Node.js ≥ 20
- Claude Code installed (the daemon observes `~/.claude/`)

## Install

```bash
npm i -g nakiros
```

Then anywhere:

```bash
nakiros
```

The daemon starts on `http://localhost:4242` and opens your default browser.

### Options

```
nakiros [options]

  --port <n>   Preferred port (default 4242 or $NAKIROS_PORT).
               Falls back to next free port if taken.
  --no-open    Do not open the browser automatically.
  -h, --help   Show help.
```

Press `Ctrl+C` to stop the daemon.

## Development

Monorepo layout:

```
apps/
  nakiros/        # The published npm package (daemon + CLI entry)
  frontend/       # React SPA bundled into nakiros at build time
packages/
  shared/         # Shared TypeScript types
  agents-bundle/  # Team agents (PM, architect, dev, etc.)
```

### Running locally

```bash
pnpm install
turbo build
# In two terminals for HMR dev:
pnpm -F @nakiros/frontend dev     # Vite dev server
pnpm -F nakiros dev               # daemon on 4242
```

Or one-shot:

```bash
turbo build
node apps/nakiros/dist/bin/nakiros.js
```

### Publishing

```bash
cd apps/nakiros
npm pack                          # creates nakiros-<version>.tgz
npm i -g ./nakiros-<version>.tgz  # test install locally
npm publish                        # once confident
```

## License

MIT
