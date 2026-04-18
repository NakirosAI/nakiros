# @nakirosai/nakiros

> Is your Claude Code skill actually worth keeping?

Local daemon + web UI that audits, evaluates, fixes, and creates
[Claude Code](https://www.anthropic.com/claude-code) skills. Many skills add
nothing; some make Claude worse. Nakiros tells you which ones to keep,
improve, or drop — with real eval runs, all on your machine.

## Install

```bash
npm i -g @nakirosai/nakiros
```

Then, anywhere:

```bash
nakiros
```

The daemon starts on `http://localhost:4242` and opens your default browser.

## Requirements

- **Node.js ≥ 20**
- **Claude Code** installed (the daemon reads from `~/.claude/` to discover
  your projects and skills)

## What it does

- **Scan** — discovers every skill in your Claude projects and in
  `~/.claude/skills`
- **Audit** — runs a structured quality audit on any skill (trigger
  description, references, outputs, examples)
- **Evaluate** — spins up an isolated copy of a skill and runs a suite of
  evals with/without the skill, so you can compare
- **Fix** — iterate on a skill in a temp workdir, re-run evals against the
  baseline, ship when better
- **Create** — draft a new skill from scratch, evaluate it before deployment

All data stays on your machine. No account, no cloud, no telemetry.

## CLI options

```
nakiros [options]

  --port <n>   Preferred port (default 4242 or $NAKIROS_PORT).
               Falls back to next free port if taken.
  --no-open    Do not open the browser automatically.
  -h, --help   Show help.
```

Press `Ctrl+C` to stop the daemon.

## Links

- **Website**: <https://nakiros.com>
- **Repository**: <https://github.com/NakirosAI/nakiros>
- **Issues**: <https://github.com/NakirosAI/nakiros/issues>

## License

MIT © [NakirosAI](https://github.com/NakirosAI)
