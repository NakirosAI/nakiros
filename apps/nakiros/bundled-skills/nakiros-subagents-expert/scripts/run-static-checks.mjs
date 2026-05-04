#!/usr/bin/env node
/**
 * Static (deterministic) audit checks for nakiros-subagents-expert.
 *
 * Run by the agent at the START of an audit, before doing any judgement-based
 * checks. Produces:
 *
 *   <output-dir>/audit-manifest.json   — copy of the static manifest with target filled in
 *   <output-dir>/audit-progress.jsonl  — one line per check this script can decide
 *                                          (~11/15). The agent fills the rest by
 *                                          appending more lines.
 *
 * Usage:
 *   node scripts/run-static-checks.mjs --subagent <path-to-subagent.md> --output-dir <path>
 *
 * Exit code is always 0 — a failed check is an audit signal, not a script error.
 * Real errors (cannot read file, manifest missing) exit non-zero.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(SCRIPT_DIR, '..');

// ─── arg parsing ────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { subagentPath: null, outputDir: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--subagent') args.subagentPath = argv[++i];
    else if (argv[i] === '--output-dir') args.outputDir = argv[++i];
  }
  if (!args.subagentPath || !args.outputDir) {
    console.error('Usage: run-static-checks.mjs --subagent <path> --output-dir <path>');
    process.exit(2);
  }
  return args;
}

const { subagentPath, outputDir } = parseArgs(process.argv.slice(2));
mkdirSync(outputDir, { recursive: true });

// ─── manifest copy ──────────────────────────────────────────────────────────
const manifestSrc = join(SKILL_ROOT, 'audit-manifest.json');
if (!existsSync(manifestSrc)) {
  console.error(`Static manifest not found at ${manifestSrc}`);
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(manifestSrc, 'utf8'));
manifest.target = subagentPath;
writeFileSync(join(outputDir, 'audit-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// ─── load subagent file ──────────────────────────────────────────────────────
if (!existsSync(subagentPath)) {
  console.error(`Subagent file not found at ${subagentPath}`);
  process.exit(2);
}
const raw = readFileSync(subagentPath, 'utf8');
const lines = raw.split('\n');
const lineCount = lines.length;

// ─── frontmatter parser (minimal YAML) ───────────────────────────────────────
/**
 * Parses YAML frontmatter between the first pair of --- delimiters.
 * Returns { found, keys, fields, endLine }
 * fields: Record<string, string|string[]> for known scalar/list fields
 */
function parseFrontmatter(lines) {
  if (lines[0] !== '---') return { found: false, keys: [], fields: {}, endLine: 0 };
  const endIdx = lines.findIndex((l, i) => i > 0 && l === '---');
  if (endIdx === -1) return { found: false, keys: [], fields: {}, endLine: 0 };

  const fmLines = lines.slice(1, endIdx);
  const keys = [];
  const fields = {};
  let currentKey = null;
  let inListBlock = false;

  for (const line of fmLines) {
    const topLevelKey = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)/);
    if (topLevelKey) {
      currentKey = topLevelKey[1];
      const value = topLevelKey[2].trim();
      keys.push(currentKey);
      inListBlock = false;

      if (value === '' || value === '|' || value === '>') {
        // block scalar or empty list — read following lines
        fields[currentKey] = value === '' ? null : '';
        inListBlock = (value === '');
      } else if (value.startsWith('[')) {
        // inline array: tools: [Read, Bash]
        const items = value
          .replace(/^\[/, '').replace(/\]$/, '')
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
        fields[currentKey] = items;
      } else {
        fields[currentKey] = value.replace(/^["']|["']$/g, '');
      }
      continue;
    }

    // list item under a key
    const listItem = line.match(/^\s+-\s+["']?(.+?)["']?\s*$/);
    if (listItem && currentKey) {
      if (!Array.isArray(fields[currentKey])) fields[currentKey] = [];
      fields[currentKey].push(listItem[1]);
      continue;
    }

    // continuation of block scalar (description: >)
    if (currentKey && typeof fields[currentKey] === 'string' && line.trim() !== '') {
      fields[currentKey] = (fields[currentKey] + ' ' + line.trim()).trim();
    }
  }

  return { found: true, keys, fields, endLine: endIdx };
}

const fm = parseFrontmatter(lines);

// ─── per-check evaluators ───────────────────────────────────────────────────
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

// ── frontmatter.name_format ──────────────────────────────────────────────────
{
  if (!fm.found) {
    record('frontmatter.name_format', 'fail', 'No frontmatter — name: field cannot be evaluated');
  } else {
    const nameVal = typeof fm.fields['name'] === 'string' ? fm.fields['name'] : null;
    if (!nameVal) {
      record('frontmatter.name_format', 'fail', 'name: field missing from frontmatter');
    } else if (/^[a-z][a-z0-9-]*$/.test(nameVal)) {
      record('frontmatter.name_format', 'pass', `name: '${nameVal}' matches /^[a-z][a-z0-9-]*$/`);
    } else {
      record('frontmatter.name_format', 'fail', `name: '${nameVal}' fails /^[a-z][a-z0-9-]*$/ — use lowercase letters and hyphens only`);
    }
  }
}

// ── frontmatter.description_present ─────────────────────────────────────────
{
  if (!fm.found) {
    record('frontmatter.description_present', 'fail', 'No frontmatter — description: field cannot be evaluated');
  } else {
    const desc = typeof fm.fields['description'] === 'string' ? fm.fields['description'].trim() : null;
    if (desc && desc.length > 0) {
      record('frontmatter.description_present', 'pass', `description: present (${desc.length} chars)`);
    } else {
      record('frontmatter.description_present', 'fail', 'description: field missing or empty');
    }
  }
}

// ── frontmatter.description_actionable ──────────────────────────────────────
{
  if (!fm.found) {
    record('frontmatter.description_actionable', 'fail', 'No frontmatter — description: field cannot be evaluated');
  } else {
    const desc = typeof fm.fields['description'] === 'string' ? fm.fields['description'] : '';
    if (!desc.trim()) {
      record('frontmatter.description_actionable', 'fail', 'description: is empty — no delegation keywords possible');
    } else {
      const keywordMatch = desc.match(/\b(use|for|when|proactively)\b/gi);
      const unique = keywordMatch ? [...new Set(keywordMatch.map((k) => k.toLowerCase()))] : [];
      if (unique.length > 0) {
        record('frontmatter.description_actionable', 'pass', `Delegation keywords found: ${unique.join(', ')}`);
      } else {
        record('frontmatter.description_actionable', 'fail', 'No delegation keywords (use/for/when/proactively) in description');
      }
    }
  }
}

// ── structure.line_count ─────────────────────────────────────────────────────
{
  if (lineCount > 200) {
    record('structure.line_count', 'fail', `${lineCount} lines (target ≤ 200)`);
  } else {
    record('structure.line_count', 'pass', `${lineCount} lines (≤ 200)`);
  }
}

// ── structure.body_present ───────────────────────────────────────────────────
{
  if (!fm.found) {
    record('structure.body_present', 'fail', 'No frontmatter — cannot determine body extent');
  } else {
    const bodyLines = lines.slice(fm.endLine + 1);
    const nonBlank = bodyLines.filter((l) => l.trim().length > 0);
    if (nonBlank.length >= 5) {
      record('structure.body_present', 'pass', `Body present: ${nonBlank.length} non-blank lines after frontmatter`);
    } else if (nonBlank.length > 0) {
      record('structure.body_present', 'fail', `Body too short: only ${nonBlank.length} non-blank lines (minimum 5)`);
    } else {
      record('structure.body_present', 'fail', 'No body after frontmatter — subagent has no system prompt');
    }
  }
}

// ── structure.heading_hierarchy ──────────────────────────────────────────────
{
  const bodyStartLine = fm.found ? fm.endLine + 1 : 0;
  const bodyLines = lines.slice(bodyStartLine);
  const headingLevels = [];

  for (const line of bodyLines) {
    const m = line.match(/^(#{1,6})\s+\S/);
    if (m) headingLevels.push(m[1].length);
  }

  if (headingLevels.length === 0) {
    record('structure.heading_hierarchy', 'pass', 'No headings — flat prose body is acceptable');
  } else {
    let issue = null;
    const maxDepth = Math.max(...headingLevels);
    if (maxDepth > 3) {
      issue = `Heading depth H${maxDepth} exceeds maximum H3`;
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
    } else {
      record('structure.heading_hierarchy', 'pass', `${headingLevels.length} heading(s), max depth H${maxDepth}, hierarchy valid`);
    }
  }
}

// ── config.model_specified ───────────────────────────────────────────────────
{
  if (!fm.found) {
    record('config.model_specified', 'fail', 'No frontmatter — model: field cannot be evaluated');
  } else {
    const modelVal = typeof fm.fields['model'] === 'string' ? fm.fields['model'].trim() : null;
    const VALID_SHORT = new Set(['sonnet', 'opus', 'haiku', 'inherit']);
    if (modelVal && (VALID_SHORT.has(modelVal) || /^claude-/i.test(modelVal))) {
      record('config.model_specified', 'pass', `model: '${modelVal}' specified`);
    } else if (modelVal) {
      record('config.model_specified', 'fail', `model: '${modelVal}' is not a recognised value (expected: sonnet/opus/haiku/inherit or full Claude model ID)`);
    } else {
      record('config.model_specified', 'fail', 'model: not specified — subagent inherits from parent session');
    }
  }
}

// ── config.tools_scoped ──────────────────────────────────────────────────────
{
  if (!fm.found) {
    record('config.tools_scoped', 'fail', 'No frontmatter — tools scoping cannot be evaluated');
  } else {
    const hasTools = Array.isArray(fm.fields['tools']) && fm.fields['tools'].length > 0;
    const hasDisallowed = Array.isArray(fm.fields['disallowedTools']) && fm.fields['disallowedTools'].length > 0;
    if (hasTools) {
      record('config.tools_scoped', 'pass', `tools: allowlist present (${fm.fields['tools'].join(', ')})`);
    } else if (hasDisallowed) {
      record('config.tools_scoped', 'pass', `disallowedTools: denylist present (${fm.fields['disallowedTools'].join(', ')})`);
    } else {
      record('config.tools_scoped', 'fail', 'No tool scoping — subagent inherits all tools without restriction');
    }
  }
}

// ── config.no_unjustified_bypass ─────────────────────────────────────────────
{
  const bypassPresent = raw.includes('bypassPermissions');
  if (!bypassPresent) {
    record('config.no_unjustified_bypass', 'pass', 'permissionMode: bypassPermissions not present');
  } else {
    // Check body for justification
    const bodyStart = fm.found ? fm.endLine + 1 : 0;
    const bodyText = lines.slice(bodyStart).join('\n').toLowerCase();
    const justificationPattern = /bypass|full access|elevated|intentionally|requires.*permission|dangerous/i;
    if (justificationPattern.test(bodyText)) {
      record('config.no_unjustified_bypass', 'pass', 'bypassPermissions present — body contains justification');
    } else {
      record('config.no_unjustified_bypass', 'fail', 'bypassPermissions present WITHOUT body justification — DANGEROUS');
    }
  }
}

// ── content.has_examples ─────────────────────────────────────────────────────
{
  const bodyStart = fm.found ? fm.endLine + 1 : 0;
  const bodyText = lines.slice(bodyStart).join('\n');
  const hasFencedCode = /```[\s\S]*?```/.test(bodyText);
  const hasExamplePattern = /\bExample:|When asked (to|about)\b/i.test(bodyText);
  if (hasFencedCode) {
    record('content.has_examples', 'pass', 'Fenced code block found in body');
  } else if (hasExamplePattern) {
    record('content.has_examples', 'pass', '"Example:" or "When asked" pattern found in body');
  } else {
    record('content.has_examples', 'fail', 'No fenced code block or Example:/When asked pattern found');
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
