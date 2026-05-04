#!/usr/bin/env node
/**
 * Static (deterministic) audit checks for nakiros-rules-expert.
 *
 * Run by the agent at the START of an audit, before doing any judgement-based
 * checks. Produces:
 *
 *   <output-dir>/audit-manifest.json   — copy of the static manifest with target filled in
 *   <output-dir>/audit-progress.jsonl  — one line per check this script can decide
 *                                          (~9/15). The agent fills the rest by
 *                                          appending more lines.
 *
 * Usage:
 *   node scripts/run-static-checks.mjs --rule <path-to-rule.md> --output-dir <path>
 *
 * Exit code is always 0 — a failed check is an audit signal, not a script error.
 * Real errors (cannot read rule file, manifest missing) exit non-zero.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(SCRIPT_DIR, '..');

// ─── known frontmatter keys ──────────────────────────────────────────────────
const KNOWN_FRONTMATTER_KEYS = new Set(['paths', 'description', 'name', 'title']);

// ─── arg parsing ────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { rulePath: null, outputDir: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--rule') args.rulePath = argv[++i];
    else if (argv[i] === '--output-dir') args.outputDir = argv[++i];
  }
  if (!args.rulePath || !args.outputDir) {
    console.error('Usage: run-static-checks.mjs --rule <path> --output-dir <path>');
    process.exit(2);
  }
  return args;
}

const { rulePath, outputDir } = parseArgs(process.argv.slice(2));
mkdirSync(outputDir, { recursive: true });

// ─── manifest copy ──────────────────────────────────────────────────────────
const manifestSrc = join(SKILL_ROOT, 'audit-manifest.json');
if (!existsSync(manifestSrc)) {
  console.error(`Static manifest not found at ${manifestSrc}`);
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(manifestSrc, 'utf8'));
manifest.target = rulePath;
writeFileSync(join(outputDir, 'audit-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// ─── load rule file ──────────────────────────────────────────────────────────
if (!existsSync(rulePath)) {
  console.error(`Rule file not found at ${rulePath}`);
  process.exit(2);
}
const raw = readFileSync(rulePath, 'utf8');
const lines = raw.split('\n');
const lineCount = lines.length;

// ─── frontmatter parser (minimal YAML) ───────────────────────────────────────
/**
 * Parses YAML frontmatter between the first pair of --- delimiters.
 * Returns { found: boolean, keys: string[], paths: string[] | null, endLine: number }
 */
function parseFrontmatter(lines) {
  if (lines[0] !== '---') return { found: false, keys: [], paths: null, endLine: 0 };
  const endIdx = lines.findIndex((l, i) => i > 0 && l === '---');
  if (endIdx === -1) return { found: false, keys: [], paths: null, endLine: 0 };

  const fmLines = lines.slice(1, endIdx);
  const keys = [];
  const pathsValues = [];
  let inPathsBlock = false;

  for (const line of fmLines) {
    const topLevelKey = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):/);
    if (topLevelKey) {
      keys.push(topLevelKey[1]);
      inPathsBlock = topLevelKey[1] === 'paths';
      // inline array: paths: ["foo"]
      const inlineArr = line.match(/^paths:\s*\[(.+)\]/);
      if (inlineArr) {
        const items = inlineArr[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
        pathsValues.push(...items);
        inPathsBlock = false;
      }
      continue;
    }
    if (inPathsBlock) {
      const item = line.match(/^\s*-\s+["']?(.+?)["']?\s*$/);
      if (item) pathsValues.push(item[1]);
    }
  }

  return {
    found: true,
    keys,
    paths: pathsValues.length > 0 ? pathsValues : null,
    endLine: endIdx,
  };
}

const fm = parseFrontmatter(lines);

// ─── strip code fences for prose checks ─────────────────────────────────────
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
const proseLines = proseOnly.split('\n');

// ─── per-check evaluators ───────────────────────────────────────────────────
const outcomes = [];
const record = (checkId, result, detail) => outcomes.push({ checkId, result, detail });

// frontmatter.present
{
  if (fm.found) {
    record('frontmatter.present', 'pass', 'YAML frontmatter block found');
  } else {
    record('frontmatter.present', 'fail', 'No valid --- frontmatter block at file start');
  }
}

// frontmatter.paths_field
{
  if (!fm.found) {
    record('frontmatter.paths_field', 'fail', 'No frontmatter — paths: field cannot be evaluated');
  } else if (fm.paths && fm.paths.length > 0) {
    record('frontmatter.paths_field', 'pass', `paths: field present with ${fm.paths.length} glob(s): ${fm.paths.slice(0, 3).join(', ')}`);
  } else {
    record('frontmatter.paths_field', 'fail', 'paths: key missing or empty — rule will load unconditionally (only valid for truly global rules)');
  }
}

// frontmatter.no_unknown_keys
{
  if (!fm.found) {
    record('frontmatter.no_unknown_keys', 'fail', 'No frontmatter to inspect');
  } else {
    const unknown = fm.keys.filter((k) => !KNOWN_FRONTMATTER_KEYS.has(k));
    if (unknown.length > 0) {
      record('frontmatter.no_unknown_keys', 'fail', `Unknown frontmatter keys: ${unknown.join(', ')}`);
    } else {
      record('frontmatter.no_unknown_keys', 'pass', `All frontmatter keys recognised: ${fm.keys.join(', ') || '(none)'}`);
    }
  }
}

// structure.line_count — threshold is 150 for rules (more focused than CLAUDE.md)
{
  if (lineCount > 200) {
    record('structure.line_count', 'fail', `${lineCount} lines (> 200, severely over budget)`);
  } else if (lineCount > 150) {
    record('structure.line_count', 'fail', `${lineCount} lines (target ≤ 150)`);
  } else {
    record('structure.line_count', 'pass', `${lineCount} lines (≤ 150)`);
  }
}

// structure.heading_hierarchy — H1 unique, no skipped levels
{
  const bodyLines = lines.slice(fm.endLine + 1);
  const headingLevels = [];
  const h1Lines = [];
  for (let i = 0; i < bodyLines.length; i++) {
    const m = bodyLines[i].match(/^(#{1,6})\s+\S/);
    if (m) {
      headingLevels.push(m[1].length);
      if (m[1].length === 1) h1Lines.push(fm.endLine + 1 + i + 1);
    }
  }

  let issue = null;
  if (h1Lines.length > 1) {
    issue = `Multiple H1 headings found (lines ${h1Lines.join(', ')}) — use exactly one H1 as the rule title`;
  } else {
    for (let i = 1; i < headingLevels.length; i++) {
      if (headingLevels[i] > headingLevels[i - 1] + 1) {
        issue = `Skipped from H${headingLevels[i - 1]} to H${headingLevels[i]}`;
        break;
      }
    }
  }

  if (issue) {
    record('structure.heading_hierarchy', 'fail', issue);
  } else if (headingLevels.length === 0) {
    record('structure.heading_hierarchy', 'fail', 'No headings found — rule needs at least an H1 title');
  } else {
    record('structure.heading_hierarchy', 'pass', `${headingLevels.length} heading(s), max depth H${Math.max(...headingLevels)}, single H1`);
  }
}

// structure.section_size — no section (## to next ##) > 40 lines
{
  const bodyLines = lines.slice(fm.endLine + 1);
  const sectionStarts = [];
  for (let i = 0; i < bodyLines.length; i++) {
    if (/^##\s+\S/.test(bodyLines[i])) {
      sectionStarts.push({ line: i, name: bodyLines[i].replace(/^##\s+/, '').trim() });
    }
  }
  let largest = { name: null, size: 0 };
  for (let i = 0; i < sectionStarts.length; i++) {
    const start = sectionStarts[i].line;
    const end = i + 1 < sectionStarts.length ? sectionStarts[i + 1].line : bodyLines.length;
    const size = end - start;
    if (size > largest.size) largest = { name: sectionStarts[i].name, size };
  }
  if (largest.size > 40) {
    record('structure.section_size', 'fail', `Section "${largest.name}" = ${largest.size} lines (> 40)`);
  } else if (largest.name) {
    record('structure.section_size', 'pass', `Largest section "${largest.name}" = ${largest.size} lines`);
  } else {
    record('structure.section_size', 'pass', 'No ## sections (single-block rule)');
  }
}

// tone.no_fluff — banned marketing tokens
{
  const banned = /(welcome|awesome|world-class|cutting-edge|robust|scalable|seamless|state-of-the-art|elegant|beautiful)/gi;
  const matches = proseOnly.match(banned) ?? [];
  const unique = [...new Set(matches.map((m) => m.toLowerCase()))];
  if (unique.length > 0) {
    record('tone.no_fluff', 'fail', `Marketing tokens found: ${unique.join(', ')}`);
  } else {
    record('tone.no_fluff', 'pass', 'No marketing/fluff tokens');
  }
}

// tone.actionable — detect vague/hedge bullets without concrete reference
{
  const vague = /\b(consider|as needed|ideally|typically|usually|generally|think about|be careful|make sure)\b/gi;
  const failingLines = [];
  for (let i = 0; i < proseLines.length; i++) {
    const line = proseLines[i];
    if (line.trim().startsWith('```')) continue;
    vague.lastIndex = 0;
    if (vague.test(line)) {
      vague.lastIndex = 0;
      const hasConcrete = /`[^`]+`|\.\w+|\/\w+|\b[A-Z][a-zA-Z0-9_]+\b\(/.test(line);
      if (!hasConcrete) failingLines.push(i + 1);
    }
    vague.lastIndex = 0;
  }
  if (failingLines.length === 0) {
    record('tone.actionable', 'pass', 'No vague bullets without concrete reference');
  } else {
    record('tone.actionable', 'fail', `${failingLines.length} vague bullet(s) without concrete reference (e.g. line ${failingLines[0]})`);
  }
}

// content.has_examples — presence of a fenced code block or inline code
{
  const hasFencedCode = /```[\s\S]*?```/.test(raw);
  // Count inline backtick spans >= 2 chars (not just single-char escapes)
  const inlineCodeMatches = raw.match(/`[^`]{2,}`/g) ?? [];
  const hasInlineCode = inlineCodeMatches.length >= 2;

  if (hasFencedCode) {
    record('content.has_examples', 'pass', 'Fenced code block found');
  } else if (hasInlineCode) {
    record('content.has_examples', 'pass', `No fenced block but ${inlineCodeMatches.length} inline code spans present`);
  } else {
    record('content.has_examples', 'fail', 'No fenced code block or inline code examples found');
  }
}

// ─── write JSONL ────────────────────────────────────────────────────────────
const jsonlPath = join(outputDir, 'audit-progress.jsonl');
const out = outcomes.map((o) => JSON.stringify(o)).join('\n') + '\n';
writeFileSync(jsonlPath, out);

const passed = outcomes.filter((o) => o.result === 'pass').length;
const failed = outcomes.filter((o) => o.result === 'fail').length;
console.log(`run-static-checks: ${outcomes.length} checks emitted (${passed} pass, ${failed} fail). Wrote ${jsonlPath}.`);
console.log(`run-static-checks: ${manifest.totalChecks - outcomes.length} checks remain for the agent to evaluate.`);
