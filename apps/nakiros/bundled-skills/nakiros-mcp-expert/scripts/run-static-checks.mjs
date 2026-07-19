#!/usr/bin/env node
/**
 * Static (deterministic) audit checks for nakiros-mcp-expert — provider dispatcher.
 *
 * Run by the agent at the START of an audit, before doing any judgement-based
 * checks. Produces:
 *
 *   <output-dir>/audit-manifest.json   — copy of the static manifest with target filled in
 *                                         (audit-manifest.json for claude, audit-manifest.codex.json for codex —
 *                                         always written to the same output filename regardless of provider)
 *   <output-dir>/audit-progress.jsonl  — one line per check this script can decide.
 *                                         The agent fills the remaining checks by appending more lines
 *                                         (4/14 for claude — cross-entity; more for codex, see below).
 *
 * Usage:
 *   node scripts/run-static-checks.mjs --provider claude --mcp-config <path-to-.mcp.json> --output-dir <path>
 *   node scripts/run-static-checks.mjs --provider codex  --mcp-config <path-to-.codex/config.toml> --output-dir <path>
 *
 * --provider defaults to "claude" for backward compatibility with existing callers.
 *
 * Exit code is always 0 — a failed check is an audit signal, not a script error.
 * Real errors (manifest missing, output-dir cannot be created, unknown --provider) exit non-zero.
 *
 * This script and everything under scripts/lib/ is dependency-free (only `node:*`
 * built-ins) so the skill works standalone, without the Nakiros daemon's node_modules —
 * see references/codex/mcp-spec.md and scripts/lib/toml-reader.mjs for why the Codex
 * path can't just `import { parseTOML } from 'confbox'` like the daemon adapter does.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runClaudeChecks } from './lib/claude-checks.mjs';
import { runCodexChecks } from './lib/codex-checks.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(SCRIPT_DIR, '..');

const PROVIDERS = {
  claude: { manifestFile: 'audit-manifest.json', run: runClaudeChecks },
  codex: { manifestFile: 'audit-manifest.codex.json', run: runCodexChecks },
};

function parseArgs(argv) {
  const args = { mcpConfigPath: null, outputDir: null, provider: 'claude' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--mcp-config') args.mcpConfigPath = argv[++i];
    else if (argv[i] === '--output-dir') args.outputDir = argv[++i];
    else if (argv[i] === '--provider') args.provider = argv[++i];
  }
  if (!args.mcpConfigPath || !args.outputDir) {
    console.error('Usage: run-static-checks.mjs --provider claude|codex --mcp-config <path> --output-dir <path>');
    process.exit(2);
  }
  if (!PROVIDERS[args.provider]) {
    console.error(`Unknown --provider "${args.provider}". Expected one of: ${Object.keys(PROVIDERS).join(', ')}`);
    process.exit(2);
  }
  return args;
}

const { mcpConfigPath, outputDir, provider } = parseArgs(process.argv.slice(2));
const { manifestFile, run } = PROVIDERS[provider];

mkdirSync(outputDir, { recursive: true });

const manifestSrc = join(SKILL_ROOT, manifestFile);
if (!existsSync(manifestSrc)) {
  console.error(`Static manifest not found at ${manifestSrc}`);
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(manifestSrc, 'utf8'));
manifest.target = mcpConfigPath;
writeFileSync(join(outputDir, 'audit-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const outcomes = run(mcpConfigPath, manifest);

const jsonlPath = join(outputDir, 'audit-progress.jsonl');
writeFileSync(jsonlPath, outcomes.map((o) => JSON.stringify(o)).join('\n') + '\n');

const passed = outcomes.filter((o) => o.result === 'pass').length;
const failed = outcomes.filter((o) => o.result === 'fail').length;
const na = outcomes.filter((o) => o.result === 'na').length;
console.log(`run-static-checks (${provider}): ${outcomes.length} checks emitted (${passed} pass, ${failed} fail, ${na} na). Wrote ${jsonlPath}.`);
console.log(`run-static-checks (${provider}): ${manifest.totalChecks - outcomes.length} check(s) remain for the agent to evaluate.`);
