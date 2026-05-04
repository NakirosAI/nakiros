#!/usr/bin/env node
/**
 * Static (deterministic) audit checks for nakiros-permissions-expert.
 *
 * Run by the agent at the START of an audit, before doing any judgement-based
 * checks. Produces:
 *
 *   <output-dir>/audit-manifest.json   — copy of the static manifest with target filled in
 *   <output-dir>/audit-progress.jsonl  — one line per check this script can decide
 *                                         (9/14). The agent fills the rest by
 *                                         appending more lines.
 *
 * Usage:
 *   node scripts/run-static-checks.mjs --settings <path-to-settings.json> --output-dir <path>
 *
 * Exit code is always 0 — a failed check is an audit signal, not a script error.
 * Real errors (manifest missing, output-dir cannot be created) exit non-zero.
 *
 * Deterministic checks handled (9/14):
 *   structure.valid_json
 *   structure.permissions_keys_known
 *   structure.rule_format
 *   syntax.allow_rules_valid
 *   syntax.ask_rules_valid
 *   syntax.deny_rules_valid
 *   syntax.default_mode_valid
 *   security.default_mode_not_bypass
 *   security.dangerous_bash_denied
 *
 * Judgement checks left for the agent (5/14):
 *   security.dotclaude_writes_denied
 *   security.env_files_denied
 *   crossref.agent_rules_match_subagents
 *   crossref.mcp_rules_match_servers
 *   crossref.no_useless_deny_for_undefined_tools
 *
 * Handles these cases gracefully:
 *   - settings.json does not exist → structure.valid_json: fail, rest: na
 *   - settings.json is not valid JSON → structure.valid_json: fail, rest: na
 *   - settings.json has no "permissions" key → most checks: na (nothing to audit)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(SCRIPT_DIR, '..');

// ─── arg parsing ────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { settingsPath: null, outputDir: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--settings') args.settingsPath = argv[++i];
    else if (argv[i] === '--output-dir') args.outputDir = argv[++i];
  }
  if (!args.settingsPath || !args.outputDir) {
    console.error('Usage: run-static-checks.mjs --settings <path> --output-dir <path>');
    process.exit(2);
  }
  return args;
}

const { settingsPath, outputDir } = parseArgs(process.argv.slice(2));
mkdirSync(outputDir, { recursive: true });

// ─── manifest copy ──────────────────────────────────────────────────────────
const manifestSrc = join(SKILL_ROOT, 'audit-manifest.json');
if (!existsSync(manifestSrc)) {
  console.error(`Static manifest not found at ${manifestSrc}`);
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(manifestSrc, 'utf8'));
manifest.target = settingsPath;
writeFileSync(join(outputDir, 'audit-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// ─── per-check result helpers ────────────────────────────────────────────────
const outcomes = [];
const record = (checkId, result, detail) => outcomes.push({ checkId, result, detail });
const naAll = (ids, reason) => ids.forEach((id) => record(id, 'na', reason));

// All check IDs from manifest
const ALL_CHECKS = manifest.checks.map((c) => c.id);

// IDs handled by this script (deterministic)
const STATIC_CHECK_IDS = [
  'structure.valid_json',
  'structure.permissions_keys_known',
  'structure.rule_format',
  'syntax.allow_rules_valid',
  'syntax.ask_rules_valid',
  'syntax.deny_rules_valid',
  'syntax.default_mode_valid',
  'security.default_mode_not_bypass',
  'security.dangerous_bash_denied',
];

// IDs left for the agent
const AGENT_CHECK_IDS = ALL_CHECKS.filter((id) => !STATIC_CHECK_IDS.includes(id));

// ─── constants ───────────────────────────────────────────────────────────────

// Known keys in the permissions block
const KNOWN_PERMISSIONS_KEYS = new Set([
  'allow', 'ask', 'deny', 'defaultMode',
  'additionalDirectories', 'disableBypassPermissionsMode', 'disableAutoMode',
]);

// Valid defaultMode values
const VALID_DEFAULT_MODES = new Set([
  'default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions',
]);

// Recommended dangerous Bash deny patterns (at least one should be present)
const RECOMMENDED_DENY_PATTERNS = [
  'Bash(rm -rf *)',
  'Bash(curl *)',
  'Bash(wget *)',
  'Bash(sudo *)',
];

// Format regex for a valid rule string
const RULE_FORMAT_REGEX = /^[A-Z][A-Za-z]+(\(.+\))?$/;

// ─── rule syntax helpers ─────────────────────────────────────────────────────

/**
 * Validate a single rule string for syntax errors.
 * Returns null if valid, or an error string if invalid.
 */
function validateRuleSyntax(rule) {
  if (typeof rule !== 'string') return 'not a string';

  // Format check (uppercase start, optional specifier)
  if (!RULE_FORMAT_REGEX.test(rule)) {
    if (rule.length === 0) return 'empty rule string';
    if (/^[a-z]/.test(rule)) return `starts with lowercase letter`;
    return `does not match expected format Tool or Tool(specifier)`;
  }

  // If specifier is present, check balanced parentheses and non-empty content
  const parenIdx = rule.indexOf('(');
  if (parenIdx !== -1) {
    const specifier = rule.slice(parenIdx + 1, -1); // strip outer parens
    if (specifier.trim() === '') return 'empty specifier — use Tool without parens instead';

    const openCount = (rule.match(/\(/g) || []).length;
    const closeCount = (rule.match(/\)/g) || []).length;
    if (openCount !== closeCount) return `unbalanced parentheses in "${rule}"`;
  }

  return null; // valid
}

/**
 * Check a list of rules (allow/ask/deny) for syntax errors.
 * Returns { valid: boolean, errors: string[] }
 */
function checkRuleList(rules) {
  if (!Array.isArray(rules)) return { valid: false, errors: ['not an array'] };

  const errors = [];
  for (const rule of rules) {
    const err = validateRuleSyntax(rule);
    if (err) errors.push(`"${rule}": ${err}`);
  }
  return { valid: errors.length === 0, errors };
}

// ─── flush helper (defined early so it can be called on early-exit paths) ───
function flush() {
  const jsonlPath = join(outputDir, 'audit-progress.jsonl');
  const out = outcomes.map((o) => JSON.stringify(o)).join('\n') + '\n';
  writeFileSync(jsonlPath, out);

  const passed = outcomes.filter((o) => o.result === 'pass').length;
  const failed = outcomes.filter((o) => o.result === 'fail').length;
  const na = outcomes.filter((o) => o.result === 'na').length;
  console.log(`run-static-checks: ${outcomes.length} checks emitted (${passed} pass, ${failed} fail, ${na} na). Wrote ${jsonlPath}.`);
  console.log(`run-static-checks: ${manifest.totalChecks - outcomes.length} check(s) remain for the agent to evaluate.`);
}

// ─── load settings.json ──────────────────────────────────────────────────────

if (!existsSync(settingsPath)) {
  record('structure.valid_json', 'fail', `settings.json not found at ${settingsPath}`);
  naAll(ALL_CHECKS.filter((id) => id !== 'structure.valid_json'), 'settings.json not found — cannot evaluate');
  flush();
  process.exit(0);
}

let raw;
try {
  raw = readFileSync(settingsPath, 'utf8');
} catch (err) {
  record('structure.valid_json', 'fail', `Cannot read settings.json: ${err.message}`);
  naAll(ALL_CHECKS.filter((id) => id !== 'structure.valid_json'), 'settings.json unreadable');
  flush();
  process.exit(0);
}

let settings;
try {
  settings = JSON.parse(raw);
  record('structure.valid_json', 'pass', 'settings.json is valid JSON');
} catch (err) {
  record('structure.valid_json', 'fail', `Invalid JSON: ${err.message}`);
  naAll(ALL_CHECKS.filter((id) => id !== 'structure.valid_json'), 'Invalid JSON — remaining checks not evaluable');
  flush();
  process.exit(0);
}

// No permissions block at all
if (!settings.permissions || typeof settings.permissions !== 'object') {
  const noPermsReason = 'No "permissions" block in settings.json — nothing to audit';
  // structure.valid_json already recorded as pass above
  // The other static checks are N/A since there's nothing to check
  naAll(STATIC_CHECK_IDS.filter((id) => id !== 'structure.valid_json'), noPermsReason);
  // Agent checks are also N/A
  naAll(AGENT_CHECK_IDS, noPermsReason);
  flush();
  process.exit(0);
}

const perms = settings.permissions;

// ─── structure.permissions_keys_known ────────────────────────────────────────
{
  const unknownKeys = Object.keys(perms).filter((k) => !KNOWN_PERMISSIONS_KEYS.has(k));
  if (unknownKeys.length === 0) {
    record('structure.permissions_keys_known', 'pass',
      `All ${Object.keys(perms).length} key(s) in permissions block are known`);
  } else {
    record('structure.permissions_keys_known', 'fail',
      `Unknown permissions key(s): ${unknownKeys.join(', ')}`);
  }
}

// ─── structure.rule_format ────────────────────────────────────────────────────
{
  const allRules = [
    ...((Array.isArray(perms.allow) ? perms.allow : [])),
    ...((Array.isArray(perms.ask)   ? perms.ask   : [])),
    ...((Array.isArray(perms.deny)  ? perms.deny  : [])),
  ];

  if (allRules.length === 0) {
    record('structure.rule_format', 'na', 'No rules in allow/ask/deny — format check not applicable');
  } else {
    const invalid = allRules.filter((r) => typeof r !== 'string' || !RULE_FORMAT_REGEX.test(r));
    if (invalid.length === 0) {
      record('structure.rule_format', 'pass',
        `All ${allRules.length} rule(s) match expected format`);
    } else {
      record('structure.rule_format', 'fail',
        `Invalid rule format: ${invalid.map((r) => `"${r}"`).join(', ')}`);
    }
  }
}

// ─── syntax.allow_rules_valid ─────────────────────────────────────────────────
{
  const allow = perms.allow;
  if (!Array.isArray(allow) || allow.length === 0) {
    record('syntax.allow_rules_valid', 'na', 'allow is absent or empty — syntax check not applicable');
  } else {
    const { valid, errors } = checkRuleList(allow);
    if (valid) {
      record('syntax.allow_rules_valid', 'pass', `All ${allow.length} allow rule(s) are syntactically valid`);
    } else {
      record('syntax.allow_rules_valid', 'fail',
        `allow rule syntax error(s): ${errors.join('; ')}`);
    }
  }
}

// ─── syntax.ask_rules_valid ───────────────────────────────────────────────────
{
  const ask = perms.ask;
  if (!Array.isArray(ask) || ask.length === 0) {
    record('syntax.ask_rules_valid', 'na', 'ask is absent or empty — syntax check not applicable');
  } else {
    const { valid, errors } = checkRuleList(ask);
    if (valid) {
      record('syntax.ask_rules_valid', 'pass', `All ${ask.length} ask rule(s) are syntactically valid`);
    } else {
      record('syntax.ask_rules_valid', 'fail',
        `ask rule syntax error(s): ${errors.join('; ')}`);
    }
  }
}

// ─── syntax.deny_rules_valid ──────────────────────────────────────────────────
{
  const deny = perms.deny;
  if (!Array.isArray(deny) || deny.length === 0) {
    record('syntax.deny_rules_valid', 'na', 'deny is absent or empty — syntax check not applicable');
  } else {
    const { valid, errors } = checkRuleList(deny);
    if (valid) {
      record('syntax.deny_rules_valid', 'pass', `All ${deny.length} deny rule(s) are syntactically valid`);
    } else {
      record('syntax.deny_rules_valid', 'fail',
        `deny rule syntax error(s): ${errors.join('; ')}`);
    }
  }
}

// ─── syntax.default_mode_valid ───────────────────────────────────────────────
{
  if (!('defaultMode' in perms)) {
    record('syntax.default_mode_valid', 'pass',
      'defaultMode not set — implicitly "default" (safe)');
  } else if (!VALID_DEFAULT_MODES.has(perms.defaultMode)) {
    record('syntax.default_mode_valid', 'fail',
      `defaultMode "${perms.defaultMode}" is not a recognised permission mode. ` +
      `Valid values: ${[...VALID_DEFAULT_MODES].join(', ')}`);
  } else {
    record('syntax.default_mode_valid', 'pass',
      `defaultMode "${perms.defaultMode}" is a valid permission mode`);
  }
}

// ─── security.default_mode_not_bypass ────────────────────────────────────────
{
  if (perms.defaultMode === 'bypassPermissions') {
    record('security.default_mode_not_bypass', 'fail',
      'defaultMode is bypassPermissions — ALL permission prompts are disabled, ' +
      'including safety circuit breakers for root/home directory deletion');
  } else {
    const modeInfo = ('defaultMode' in perms)
      ? `(current: "${perms.defaultMode}")`
      : '(defaultMode not set — defaults to "default")';
    record('security.default_mode_not_bypass', 'pass',
      `defaultMode is not bypassPermissions ${modeInfo}`);
  }
}

// ─── security.dangerous_bash_denied ──────────────────────────────────────────
{
  // If defaultMode is dontAsk, deny-all is already in effect — check is na
  if (perms.defaultMode === 'dontAsk') {
    record('security.dangerous_bash_denied', 'na',
      'defaultMode is dontAsk — all commands require explicit allow, explicit deny not needed');
  } else {
    const deny = Array.isArray(perms.deny) ? perms.deny : [];

    // Normalize for loose matching: strip internal spaces and lowercase for comparison
    const normalizedDeny = deny.map((r) => (typeof r === 'string' ? r.replace(/\s+/g, '').toLowerCase() : ''));

    const foundPatterns = RECOMMENDED_DENY_PATTERNS.filter((pattern) => {
      // Exact match first
      if (deny.includes(pattern)) return true;
      // Loose match (case-insensitive, whitespace-normalized)
      const normalized = pattern.replace(/\s+/g, '').toLowerCase();
      return normalizedDeny.includes(normalized);
    });

    const missingPatterns = RECOMMENDED_DENY_PATTERNS.filter((p) => !foundPatterns.includes(p));

    if (foundPatterns.length === 0) {
      record('security.dangerous_bash_denied', 'fail',
        `No dangerous Bash patterns in deny. ` +
        `Recommended: ${RECOMMENDED_DENY_PATTERNS.join(', ')}`);
    } else {
      const detail = foundPatterns.length > 0
        ? `Found in deny: ${foundPatterns.join(', ')}` +
          (missingPatterns.length > 0 ? `. Missing (recommended): ${missingPatterns.join(', ')}` : '')
        : `All recommended patterns present`;
      record('security.dangerous_bash_denied', 'pass', detail);
    }
  }
}

// ─── flush ────────────────────────────────────────────────────────────────────
flush();
