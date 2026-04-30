#!/usr/bin/env node
/**
 * Static (deterministic) audit checks for the nakiros-skill-factory.
 *
 * Run by the agent at the START of an audit, before doing any judgement-based
 * checks. Produces:
 *
 *   outputs/audit-manifest.json   — copy of the static manifest with skillName filled in
 *   outputs/audit-progress.jsonl  — one line per check this script can decide
 *                                    (~11/23). The agent fills the rest by
 *                                    appending more lines.
 *
 * Usage:
 *   node scripts/run-static-checks.mjs --skill-dir <path> --output-dir <path>
 *
 * Exit code is always 0 — a check failing is an audit signal, not a script
 * error. Real errors (cannot read SKILL.md, manifest missing) exit non-zero.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const FACTORY_ROOT = resolve(SCRIPT_DIR, '..');

// ─── arg parsing ────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { skillDir: null, outputDir: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--skill-dir') args.skillDir = argv[++i];
    else if (argv[i] === '--output-dir') args.outputDir = argv[++i];
  }
  if (!args.skillDir || !args.outputDir) {
    console.error('Usage: run-static-checks.mjs --skill-dir <path> --output-dir <path>');
    process.exit(2);
  }
  return args;
}

const { skillDir, outputDir } = parseArgs(process.argv.slice(2));

// ─── manifest copy ──────────────────────────────────────────────────────────
const manifestSrc = join(FACTORY_ROOT, 'audit-manifest.json');
if (!existsSync(manifestSrc)) {
  console.error(`Static manifest not found at ${manifestSrc}`);
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(manifestSrc, 'utf8'));
const skillName = basename(skillDir.replace(/\/$/, ''));
manifest.skillName = skillName;
writeFileSync(join(outputDir, 'audit-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// ─── load SKILL.md ──────────────────────────────────────────────────────────
const skillMdPath = join(skillDir, 'SKILL.md');
if (!existsSync(skillMdPath)) {
  console.error(`SKILL.md not found at ${skillMdPath}`);
  process.exit(2);
}
const skillMd = readFileSync(skillMdPath, 'utf8');
const lines = skillMd.split('\n');
const lineCount = lines.length;

// Frontmatter parsing (simple — assumes first --- block).
let frontmatter = {};
let bodyStart = 0;
if (lines[0]?.trim() === '---') {
  const end = lines.slice(1).findIndex((l) => l.trim() === '---');
  if (end !== -1) {
    bodyStart = end + 2;
    for (const raw of lines.slice(1, end + 1)) {
      const m = raw.match(/^([a-zA-Z_-]+):\s*(.*)$/);
      if (m) frontmatter[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  }
}
const body = lines.slice(bodyStart).join('\n');

// ─── per-check evaluators ───────────────────────────────────────────────────
const outcomes = [];
const record = (checkId, result, detail) => outcomes.push({ checkId, result, detail });

// frontmatter.name_match — name matches folder, lowercase, no consecutive hyphens
{
  const name = frontmatter.name ?? '';
  const valid = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
  if (!name) record('frontmatter.name_match', 'fail', 'frontmatter `name` is missing');
  else if (name !== skillName) record('frontmatter.name_match', 'fail', `frontmatter name="${name}" ≠ folder "${skillName}"`);
  else if (!valid) record('frontmatter.name_match', 'fail', `name "${name}" must be lowercase, no leading/trailing/consecutive hyphens`);
  else record('frontmatter.name_match', 'pass', `name="${name}" matches folder, valid format`);
}

// frontmatter.description_quality — < 1024 chars (WHAT/WHEN/triggers stays LLM)
{
  const desc = frontmatter.description ?? '';
  if (!desc) record('frontmatter.description_quality', 'fail', 'frontmatter `description` is missing');
  else if (desc.length > 1024) record('frontmatter.description_quality', 'fail', `description is ${desc.length} chars (> 1024)`);
  else if (desc.length < 80) record('frontmatter.description_quality', 'fail', `description is ${desc.length} chars (< 80, likely missing WHEN/triggers)`);
  // 80–1024 is a length-pass; the LLM still rules on quality (WHAT/WHEN/triggers)
  // by appending its own line for this check. We emit nothing here in that range.
}

// frontmatter.no_extra_fields — only known keys allowed
{
  const allowed = new Set(['name', 'description', 'user-invocable', 'license', 'keywords', 'allowed-tools']);
  const extras = Object.keys(frontmatter).filter((k) => !allowed.has(k));
  if (extras.length === 0) record('frontmatter.no_extra_fields', 'pass', 'no unexpected frontmatter fields');
  else record('frontmatter.no_extra_fields', 'fail', `unexpected frontmatter field(s): ${extras.join(', ')}`);
}

// io.inputs_section — heading "## Inputs"
{
  const has = /^##\s+Inputs?\b/m.test(body);
  record('io.inputs_section', has ? 'pass' : 'fail', has ? 'found `## Inputs` heading' : 'missing `## Inputs` section');
}

// io.outputs_section — heading "## Outputs"
{
  const has = /^##\s+Outputs?\b/m.test(body);
  record('io.outputs_section', has ? 'pass' : 'fail', has ? 'found `## Outputs` heading' : 'missing `## Outputs` section');
}

// structure.under_500_lines — line count
{
  if (lineCount > 500) record('structure.under_500_lines', 'fail', `${lineCount} lines (> 500 — split into references/)`);
  else record('structure.under_500_lines', 'pass', `${lineCount} lines (under 500)`);
}

// structure.commands_at_bottom — heading mentioning commands in the last 30% of the file
{
  const tail = lines.slice(Math.floor(lineCount * 0.7)).join('\n');
  const has = /^##\s+(Available\s+)?Commands?\b/im.test(tail);
  record('structure.commands_at_bottom', has ? 'pass' : 'fail', has ? 'commands section near the bottom' : 'no commands section in the last third of SKILL.md');
}

// content.gotchas_section — heading "## Gotchas"
{
  const has = /^##\s+Gotchas?\b/m.test(body);
  record('content.gotchas_section', has ? 'pass' : 'fail', has ? 'found `## Gotchas` heading' : 'missing `## Gotchas` section');
}

// safety.ask_when_unsure — keyword presence
{
  const has = /\bASK\b|\bdon'?t\s+assume\b|\bask\s+(?:the\s+)?user\b/i.test(body);
  record('safety.ask_when_unsure', has ? 'pass' : 'fail', has ? 'found ASK/don\'t-assume guidance' : 'no explicit ASK-when-unsure guidance');
}

// consistency.french_rule — keyword presence
{
  const has = /français|french|en\s+français/i.test(body);
  record('consistency.french_rule', has ? 'pass' : 'fail', has ? 'french communication rule found' : 'no french communication rule found');
}

// consistency.paths_match — `{project}/.claude/skills/...` pattern is present and not malformed
{
  // We only catch obvious wrong patterns: hardcoded /Users/* paths, or absolute non-template paths.
  const absoluteUserPath = /\/Users\/[a-z0-9_-]+\//i.test(body);
  if (absoluteUserPath) record('consistency.paths_match', 'fail', 'hardcoded `/Users/...` path found in SKILL.md (use `{project}/...` template)');
  else record('consistency.paths_match', 'pass', 'no hardcoded user paths in SKILL.md');
}

// ─── write JSONL ────────────────────────────────────────────────────────────
const jsonlPath = join(outputDir, 'audit-progress.jsonl');
const lines_out = outcomes.map((o) => JSON.stringify(o)).join('\n') + '\n';
writeFileSync(jsonlPath, lines_out);

const passed = outcomes.filter((o) => o.result === 'pass').length;
const failed = outcomes.filter((o) => o.result === 'fail').length;
console.log(`run-static-checks: ${outcomes.length} checks emitted (${passed} pass, ${failed} fail). Wrote ${jsonlPath}.`);
console.log(`run-static-checks: ${manifest.totalChecks - outcomes.length} checks remain for the agent to evaluate.`);
