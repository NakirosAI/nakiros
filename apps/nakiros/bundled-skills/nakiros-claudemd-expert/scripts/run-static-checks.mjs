#!/usr/bin/env node
/**
 * Static (deterministic) audit checks for nakiros-claudemd-expert.
 *
 * Run by the agent at the START of an audit, before doing any judgement-based
 * checks. Produces:
 *
 *   <output-dir>/audit-manifest.json   — copy of the static manifest with target filled in
 *   <output-dir>/audit-progress.jsonl  — one line per check this script can decide
 *                                          (~9/18). The agent fills the rest by
 *                                          appending more lines.
 *
 * Usage:
 *   node scripts/run-static-checks.mjs --claudemd <path-to-CLAUDE.md> --output-dir <path>
 *
 * Exit code is always 0 — a failed check is an audit signal, not a script error.
 * Real errors (cannot read CLAUDE.md, manifest missing) exit non-zero.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(SCRIPT_DIR, '..');

// ─── arg parsing ────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { claudemdPath: null, outputDir: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--claudemd') args.claudemdPath = argv[++i];
    else if (argv[i] === '--output-dir') args.outputDir = argv[++i];
  }
  if (!args.claudemdPath || !args.outputDir) {
    console.error('Usage: run-static-checks.mjs --claudemd <path> --output-dir <path>');
    process.exit(2);
  }
  return args;
}

const { claudemdPath, outputDir } = parseArgs(process.argv.slice(2));
mkdirSync(outputDir, { recursive: true });

// ─── manifest copy ──────────────────────────────────────────────────────────
const manifestSrc = join(SKILL_ROOT, 'audit-manifest.json');
if (!existsSync(manifestSrc)) {
  console.error(`Static manifest not found at ${manifestSrc}`);
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(manifestSrc, 'utf8'));
manifest.target = claudemdPath;
writeFileSync(join(outputDir, 'audit-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// ─── load CLAUDE.md ─────────────────────────────────────────────────────────
if (!existsSync(claudemdPath)) {
  console.error(`CLAUDE.md not found at ${claudemdPath}`);
  process.exit(2);
}
const raw = readFileSync(claudemdPath, 'utf8');
const lines = raw.split('\n');
const lineCount = lines.length;

// Strip code fences for content-based checks (so banned tokens inside code
// blocks don't trigger fluff/vague-advice detection).
function stripFences(text) {
  const out = [];
  let inFence = false;
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) out.push(line);
  }
  return out.join('\n');
}
const proseOnly = stripFences(raw);

// ─── per-check evaluators ───────────────────────────────────────────────────
const outcomes = [];
const record = (checkId, result, detail) => outcomes.push({ checkId, result, detail });

// structure.line_count
{
  if (lineCount > 500) record('structure.line_count', 'fail', `${lineCount} lines (> 500, severe attention loss)`);
  else if (lineCount > 200) record('structure.line_count', 'fail', `${lineCount} lines (target ≤ 200)`);
  else record('structure.line_count', 'pass', `${lineCount} lines (≤ 200)`);
}

// structure.heading_hierarchy
{
  const headingLevels = [];
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+\S/);
    if (m) headingLevels.push(m[1].length);
  }
  let issue = null;
  for (let i = 1; i < headingLevels.length; i++) {
    if (headingLevels[i] > headingLevels[i - 1] + 1) {
      issue = `skipped from H${headingLevels[i - 1]} to H${headingLevels[i]}`;
      break;
    }
  }
  const tooDeep = headingLevels.some((l) => l > 3);
  if (issue) record('structure.heading_hierarchy', 'fail', `Heading hierarchy: ${issue}`);
  else if (tooDeep) record('structure.heading_hierarchy', 'fail', `Heading depth > H3 (max recommended: ###)`);
  else if (headingLevels.length === 0) record('structure.heading_hierarchy', 'fail', 'No headings found');
  else record('structure.heading_hierarchy', 'pass', `${headingLevels.length} headings, max depth H${Math.max(...headingLevels)}`);
}

// structure.bullet_depth
{
  let maxDepth = 0;
  let firstViolationLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)([-*+])\s+\S/);
    if (m) {
      const indent = m[1].replace(/\t/g, '  ').length;
      const depth = Math.floor(indent / 2);
      if (depth > maxDepth) maxDepth = depth;
      if (depth > 2 && firstViolationLine === -1) firstViolationLine = i + 1;
    }
  }
  if (firstViolationLine !== -1) record('structure.bullet_depth', 'fail', `Bullet depth ${maxDepth + 1} at line ${firstViolationLine} (max 2)`);
  else record('structure.bullet_depth', 'pass', `Max bullet depth ${maxDepth + 1} (≤ 3)`);
}

// structure.section_size
{
  const sectionStarts = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+\S/.test(lines[i])) sectionStarts.push({ line: i, name: lines[i].replace(/^##\s+/, '').trim() });
  }
  let largest = { name: null, size: 0 };
  for (let i = 0; i < sectionStarts.length; i++) {
    const start = sectionStarts[i].line;
    const end = i + 1 < sectionStarts.length ? sectionStarts[i + 1].line : lines.length;
    const size = end - start;
    if (size > largest.size) largest = { name: sectionStarts[i].name, size };
  }
  if (largest.size > 50) record('structure.section_size', 'fail', `Section "${largest.name}" = ${largest.size} lines (> 50)`);
  else if (largest.name) record('structure.section_size', 'pass', `Largest section "${largest.name}" = ${largest.size} lines`);
  else record('structure.section_size', 'pass', 'No ## sections detected');
}

// content.runtime_stack — look for stack-identifying tokens
{
  const stackTokens = /\b(pnpm|npm|yarn|bun|cargo|rustc|pytest|python|poetry|uv|go\s+test|deno|bun|tsc|vite|webpack|esbuild|turbo|node|npx)\b/i;
  const found = raw.match(stackTokens);
  if (found) record('content.runtime_stack', 'pass', `Stack identified: "${found[0]}"`);
  else record('content.runtime_stack', 'fail', 'No stack-identifying tokens (pnpm/cargo/pytest/etc.) found');
}

// tone.no_fluff — banned marketing tokens
{
  const banned = /(welcome|awesome|world-class|cutting-edge|robust|scalable|seamless|state-of-the-art|elegant|beautiful)/gi;
  const matches = proseOnly.match(banned) ?? [];
  const unique = [...new Set(matches.map((m) => m.toLowerCase()))];
  if (unique.length > 0) record('tone.no_fluff', 'fail', `Marketing tokens found: ${unique.join(', ')}`);
  else record('tone.no_fluff', 'pass', 'No marketing/fluff tokens');
}

// antipattern.vague_advice — vague phrases without concrete reference within the same line
{
  const vague = /\b(be careful|appropriately|edge cases|consider|think about|as needed|usually|generally|ideally|typically|make sure)\b/gi;
  const failingLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```')) continue;
    if (vague.test(line)) {
      // Reset regex after test (g flag retains lastIndex)
      vague.lastIndex = 0;
      // Has a concrete reference if it mentions a path, command, or backtick token.
      const hasConcrete = /`[^`]+`|\.\w+|\/\w+|\b[A-Z][a-zA-Z0-9_]+\b\(/.test(line);
      if (!hasConcrete) failingLines.push(i + 1);
    }
    vague.lastIndex = 0;
  }
  if (failingLines.length === 0) record('antipattern.vague_advice', 'pass', 'No vague-advice lines without concrete reference');
  else record('antipattern.vague_advice', 'fail', `${failingLines.length} vague lines (e.g. line ${failingLines[0]})`);
}

// antipattern.long_lists — flat (depth 0) bullet list > 7 consecutive items
{
  let runStart = -1;
  let runCount = 0;
  let worst = { count: 0, line: -1 };
  for (let i = 0; i < lines.length; i++) {
    const isFlatBullet = /^[-*+]\s+\S/.test(lines[i]);
    if (isFlatBullet) {
      if (runStart === -1) runStart = i + 1;
      runCount += 1;
    } else if (lines[i].trim() === '') {
      // blank lines do not break a list
    } else {
      if (runCount > worst.count) worst = { count: runCount, line: runStart };
      runStart = -1;
      runCount = 0;
    }
  }
  if (runCount > worst.count) worst = { count: runCount, line: runStart };
  if (worst.count > 7) record('antipattern.long_lists', 'fail', `Flat list of ${worst.count} items at line ${worst.line} (> 7)`);
  else record('antipattern.long_lists', 'pass', `Longest flat list: ${worst.count} items`);
}

// paths.unambiguous — `./path` patterns
{
  const ambiguous = raw.match(/(?<![A-Za-z0-9_])\.\/[A-Za-z0-9_./-]+/g) ?? [];
  if (ambiguous.length > 0) record('paths.unambiguous', 'fail', `${ambiguous.length} ambiguous paths (e.g. "${ambiguous[0]}")`);
  else record('paths.unambiguous', 'pass', 'No `./`-prefixed paths');
}

// ─── write JSONL ────────────────────────────────────────────────────────────
const jsonlPath = join(outputDir, 'audit-progress.jsonl');
const out = outcomes.map((o) => JSON.stringify(o)).join('\n') + '\n';
writeFileSync(jsonlPath, out);

const passed = outcomes.filter((o) => o.result === 'pass').length;
const failed = outcomes.filter((o) => o.result === 'fail').length;
console.log(`run-static-checks: ${outcomes.length} checks emitted (${passed} pass, ${failed} fail). Wrote ${jsonlPath}.`);
console.log(`run-static-checks: ${manifest.totalChecks - outcomes.length} checks remain for the agent to evaluate.`);
