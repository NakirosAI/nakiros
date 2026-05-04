#!/usr/bin/env node
/**
 * Static (deterministic) audit checks for nakiros-output-styles-expert.
 *
 * Run by the agent at the START of an audit, before doing any judgement-based
 * checks. Produces:
 *
 *   <output-dir>/audit-manifest.json   — copy of the static manifest with target filled in
 *   <output-dir>/audit-progress.jsonl  — one line per check this script can decide
 *                                          (8/12). The agent fills the rest by
 *                                          appending more lines.
 *
 * Usage:
 *   node scripts/run-static-checks.mjs --style <path-to-style.md> --output-dir <path>
 *
 * Exit code is always 0 — a failed check is an audit signal, not a script error.
 * Real errors (cannot read file, manifest missing) exit non-zero.
 *
 * Checks handled here (8/12 deterministic):
 *   frontmatter.present, frontmatter.name_or_filename, frontmatter.description_present
 *   structure.line_count, structure.body_present, structure.heading_hierarchy
 *   content.role_defined, content.imperative_mood
 *
 * Checks left for agent (4/12):
 *   content.tone_specified, content.format_specified
 *   crossref.no_conflict_with_claudemd, crossref.unique_role
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(SCRIPT_DIR, '..');

// ─── arg parsing ────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { stylePath: null, outputDir: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--style') args.stylePath = argv[++i];
    else if (argv[i] === '--output-dir') args.outputDir = argv[++i];
  }
  if (!args.stylePath || !args.outputDir) {
    console.error('Usage: run-static-checks.mjs --style <path> --output-dir <path>');
    process.exit(2);
  }
  return args;
}

const { stylePath, outputDir } = parseArgs(process.argv.slice(2));
mkdirSync(outputDir, { recursive: true });

// ─── manifest copy ──────────────────────────────────────────────────────────
const manifestSrc = join(SKILL_ROOT, 'audit-manifest.json');
if (!existsSync(manifestSrc)) {
  console.error(`Static manifest not found at ${manifestSrc}`);
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(manifestSrc, 'utf8'));
manifest.target = stylePath;
writeFileSync(join(outputDir, 'audit-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// ─── load style file ─────────────────────────────────────────────────────────
if (!existsSync(stylePath)) {
  console.error(`Style file not found at ${stylePath}`);
  process.exit(2);
}
const raw = readFileSync(stylePath, 'utf8');
const lines = raw.split('\n');
const lineCount = lines.length;

// ─── frontmatter parser ───────────────────────────────────────────────────────
/**
 * Parses YAML frontmatter between the first pair of --- delimiters.
 * Returns { found, keys, fields: Record<string, string>, endLine }
 */
function parseFrontmatter(lines) {
  if (lines[0] !== '---') return { found: false, keys: [], fields: {}, endLine: 0 };
  const endIdx = lines.findIndex((l, i) => i > 0 && l === '---');
  if (endIdx === -1) return { found: false, keys: [], fields: {}, endLine: 0 };

  const fmLines = lines.slice(1, endIdx);
  const keys = [];
  const fields = {};
  let currentKey = null;
  let blockScalarLines = [];

  for (const line of fmLines) {
    // Top-level key detection
    const topLevelKey = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)/);
    if (topLevelKey) {
      // Flush previous block scalar
      if (currentKey && blockScalarLines.length > 0) {
        fields[currentKey] = blockScalarLines.join('\n').trim();
        blockScalarLines = [];
      }
      currentKey = topLevelKey[1];
      keys.push(currentKey);
      const inlineValue = topLevelKey[2].trim();
      if (inlineValue && inlineValue !== '|' && inlineValue !== '>') {
        // Remove surrounding quotes
        fields[currentKey] = inlineValue.replace(/^["']|["']$/g, '');
        currentKey = null; // done with this key
      }
      // else: block scalar — collect subsequent lines
      continue;
    }
    // Block scalar continuation
    if (currentKey) {
      blockScalarLines.push(line.replace(/^\s+/, ''));
    }
  }
  // Flush last block scalar
  if (currentKey && blockScalarLines.length > 0) {
    fields[currentKey] = blockScalarLines.join('\n').trim();
  }

  return { found: true, keys, fields, endLine: endIdx };
}

const fm = parseFrontmatter(lines);

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Strip fenced code blocks from text for prose-only checks */
function stripFences(text) {
  const out = [];
  let inFence = false;
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (!inFence) out.push(line);
  }
  return out.join('\n');
}

/** Extract body lines (after closing ---) */
function getBodyLines(lines, fmEndLine) {
  if (!fm.found) return lines;
  return lines.slice(fmEndLine + 1);
}

const bodyLines = getBodyLines(lines, fm.endLine);
const bodyText = bodyLines.join('\n');
const proseBody = stripFences(bodyText);
const proseBodyLines = proseBody.split('\n');

// Meaningful body lines: non-blank
const meaningfulBodyLines = bodyLines.filter((l) => l.trim().length > 0);

// ─── per-check evaluators ────────────────────────────────────────────────────
const outcomes = [];
const record = (checkId, result, detail) => outcomes.push({ checkId, result, detail });

// ── frontmatter.present ──────────────────────────────────────────────────────
{
  if (fm.found) {
    record('frontmatter.present', 'pass', 'YAML frontmatter block found');
  } else {
    record('frontmatter.present', 'fail', 'No valid --- frontmatter block at file start');
  }
}

// ── frontmatter.name_or_filename ─────────────────────────────────────────────
{
  if (!fm.found) {
    // No frontmatter at all — cannot evaluate name field, check filename only
    const filename = basename(stylePath, '.md');
    const validFilename = /^[a-zA-Z0-9][a-zA-Z0-9-_.]*$/.test(filename);
    if (validFilename) {
      record('frontmatter.name_or_filename', 'pass', `No frontmatter name: field, but filename "${filename}" is a valid identifier`);
    } else {
      record('frontmatter.name_or_filename', 'fail', `No frontmatter name: field and filename "${filename}" contains spaces or special characters`);
    }
  } else {
    const nameVal = fm.fields['name'];
    if (nameVal && nameVal.trim().length > 0) {
      record('frontmatter.name_or_filename', 'pass', `name: "${nameVal.trim()}" present`);
    } else {
      // No name: — check filename as fallback
      const filename = basename(stylePath, '.md');
      const validFilename = /^[a-zA-Z0-9][a-zA-Z0-9-_.]*$/.test(filename);
      if (validFilename) {
        record('frontmatter.name_or_filename', 'pass', `name: field absent — filename "${filename}" used as display name in /config picker`);
      } else {
        record('frontmatter.name_or_filename', 'fail', `name: field absent and filename "${filename}" is not a clean identifier — add name: field`);
      }
    }
  }
}

// ── frontmatter.description_present ─────────────────────────────────────────
{
  if (!fm.found) {
    record('frontmatter.description_present', 'fail', 'No frontmatter — description: field cannot be evaluated');
  } else {
    const desc = fm.fields['description'];
    if (desc && desc.trim().length >= 10) {
      record('frontmatter.description_present', 'pass', `description: present — "${desc.trim().slice(0, 80)}${desc.length > 80 ? '...' : ''}"`);
    } else if (desc && desc.trim().length > 0) {
      record('frontmatter.description_present', 'fail', `description: present but very short ("${desc.trim()}") — add meaningful description for /config picker`);
    } else {
      record('frontmatter.description_present', 'fail', 'description: field absent — users cannot identify this style in /config picker');
    }
  }
}

// ── structure.line_count ─────────────────────────────────────────────────────
{
  if (lineCount > 200) {
    record('structure.line_count', 'fail', `${lineCount} lines (> 200 — over budget)`);
  } else {
    record('structure.line_count', 'pass', `${lineCount} lines (≤ 200)`);
  }
}

// ── structure.body_present ───────────────────────────────────────────────────
{
  if (meaningfulBodyLines.length >= 5) {
    record('structure.body_present', 'pass', `${meaningfulBodyLines.length} non-empty body lines found`);
  } else if (meaningfulBodyLines.length > 0) {
    record('structure.body_present', 'fail', `Only ${meaningfulBodyLines.length} non-empty body line(s) — style body is too sparse (minimum 5 lines)`);
  } else {
    record('structure.body_present', 'fail', 'Body is empty — no content after frontmatter');
  }
}

// ── structure.heading_hierarchy ──────────────────────────────────────────────
{
  const headingLevels = [];
  for (const line of bodyLines) {
    const m = line.match(/^(#{1,6})\s+\S/);
    if (m) headingLevels.push(m[1].length);
  }

  if (headingLevels.length === 0) {
    // No headings is fine for a short style
    record('structure.heading_hierarchy', 'pass', 'No headings — single-block style (acceptable for short styles)');
  } else {
    let issue = null;
    for (let i = 1; i < headingLevels.length; i++) {
      if (headingLevels[i] > headingLevels[i - 1] + 1) {
        issue = `Skipped from H${headingLevels[i - 1]} to H${headingLevels[i]}`;
        break;
      }
    }
    const hasH4Plus = headingLevels.some((h) => h > 3);
    if (hasH4Plus && !issue) {
      issue = `H4+ heading found — max depth is H3 for output styles`;
    }

    if (issue) {
      record('structure.heading_hierarchy', 'fail', issue);
    } else {
      record('structure.heading_hierarchy', 'pass', `${headingLevels.length} heading(s), max depth H${Math.max(...headingLevels)}`);
    }
  }
}

// ── content.role_defined ─────────────────────────────────────────────────────
{
  // Heuristic: look for role-trigger phrases in the body prose
  const rolePattern = /\b(you are|tu es|act as|behave as|as a |as an )\b/i;
  const hasRole = rolePattern.test(proseBody);
  if (hasRole) {
    const match = proseBody.match(rolePattern);
    record('content.role_defined', 'pass', `Role trigger phrase found: "${match[0]}"`);
  } else {
    record('content.role_defined', 'fail', 'No role trigger phrase found (e.g. "You are", "Act as", "Tu es") — define a clear persona');
  }
}

// ── content.imperative_mood ──────────────────────────────────────────────────
{
  // Detect hedge patterns in prose
  const hedgePatterns = [
    /should consider/gi,
    /may want to/gi,
    /might be helpful/gi,
    /consider doing/gi,
    /\bperhaps\b/gi,
    /you might\b/gi,
    /\bideally\b/gi,
  ];

  const foundHedges = [];
  for (const pattern of hedgePatterns) {
    const matches = proseBody.match(pattern);
    if (matches) {
      // Deduplicate by lowercase
      for (const m of matches) {
        const lower = m.toLowerCase();
        if (!foundHedges.includes(lower)) foundHedges.push(lower);
      }
    }
  }

  if (foundHedges.length === 0) {
    record('content.imperative_mood', 'pass', 'No hedge patterns detected — imperative style');
  } else if (foundHedges.length <= 2) {
    record('content.imperative_mood', 'pass', `${foundHedges.length} hedge(s) found (acceptable): ${foundHedges.join(', ')}`);
  } else {
    record('content.imperative_mood', 'fail', `${foundHedges.length} hedge patterns found (> 2): ${foundHedges.join(', ')} — replace with imperatives`);
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
