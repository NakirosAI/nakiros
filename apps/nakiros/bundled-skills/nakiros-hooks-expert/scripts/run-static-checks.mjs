#!/usr/bin/env node
/**
 * Static (deterministic) audit checks for nakiros-hooks-expert.
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
 * Handles these cases gracefully:
 *   - settings.json does not exist → structure.valid_json: fail, rest: na
 *   - settings.json is not valid JSON → structure.valid_json: fail, rest: na
 *   - settings.json has no "hooks" key → all checks: na (nothing to audit)
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

// All check IDs for convenience
const ALL_CHECKS = manifest.checks.map((c) => c.id);

// ─── load settings.json ──────────────────────────────────────────────────────

// Known valid hook events (full list from spec)
const VALID_EVENTS = new Set([
  'SessionStart', 'Setup', 'SessionEnd',
  'UserPromptSubmit', 'UserPromptExpansion', 'Stop', 'StopFailure',
  'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PostToolBatch',
  'PermissionRequest', 'PermissionDenied',
  'SubagentStart', 'SubagentStop', 'TaskCreated', 'TaskCompleted',
  'PreCompact', 'PostCompact',
  'Notification', 'TeammateIdle',
  'InstructionsLoaded', 'ConfigChange', 'CwdChanged', 'FileChanged',
  'WorktreeCreate', 'WorktreeRemove',
  'Elicitation', 'ElicitationResult',
]);

// Events that silently IGNORE the matcher field
const MATCHER_IGNORED_EVENTS = new Set([
  'UserPromptSubmit', 'PostToolBatch', 'Stop', 'TeammateIdle',
  'TaskCreated', 'TaskCompleted', 'WorktreeCreate', 'WorktreeRemove', 'CwdChanged',
]);

// Events where the if field on handlers is supported (tool events only)
const IF_SUPPORTED_EVENTS = new Set([
  'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'PermissionDenied',
]);

// Valid handler types
const VALID_HANDLER_TYPES = new Set(['command', 'http', 'mcp_tool', 'prompt', 'agent']);

// Required fields per handler type
const REQUIRED_FIELDS = {
  command: ['command'],
  http: ['url'],
  mcp_tool: ['server', 'tool'],
  prompt: ['prompt'],
  agent: ['prompt'],
};

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

// No hooks block at all
if (!settings.hooks || typeof settings.hooks !== 'object' || Object.keys(settings.hooks).length === 0) {
  naAll(ALL_CHECKS.filter((id) => id !== 'structure.valid_json'), 'No "hooks" block in settings.json — nothing to audit');
  flush();
  process.exit(0);
}

const hooksBlock = settings.hooks;
const eventNames = Object.keys(hooksBlock);

// ─── structure.valid_event_name ──────────────────────────────────────────────
{
  const unknownEvents = eventNames.filter((e) => !VALID_EVENTS.has(e));
  if (unknownEvents.length === 0) {
    record('structure.valid_event_name', 'pass', `All ${eventNames.length} event(s) are valid: ${eventNames.join(', ')}`);
  } else {
    record('structure.valid_event_name', 'fail', `Unknown hook event(s): ${unknownEvents.join(', ')}`);
  }
}

// ─── structure.matcher_compatible_with_event ─────────────────────────────────
{
  const incompatible = [];
  for (const [eventName, matcherGroups] of Object.entries(hooksBlock)) {
    if (!Array.isArray(matcherGroups)) continue;
    if (MATCHER_IGNORED_EVENTS.has(eventName)) {
      for (const group of matcherGroups) {
        if (group && typeof group === 'object' && 'matcher' in group && group.matcher != null && group.matcher !== '') {
          incompatible.push(`${eventName}[matcher="${group.matcher}"]`);
        }
      }
    }
  }
  if (incompatible.length === 0) {
    record('structure.matcher_compatible_with_event', 'pass', 'No matcher set on events that ignore it');
  } else {
    record('structure.matcher_compatible_with_event', 'fail',
      `Matcher set on events that ignore it (will be silently ignored): ${incompatible.join(', ')}`);
  }
}

// ─── structure.handlers_array_non_empty ──────────────────────────────────────
{
  const emptyGroups = [];
  for (const [eventName, matcherGroups] of Object.entries(hooksBlock)) {
    if (!Array.isArray(matcherGroups)) {
      emptyGroups.push(`${eventName} (matcher groups is not an array)`);
      continue;
    }
    for (let gi = 0; gi < matcherGroups.length; gi++) {
      const group = matcherGroups[gi];
      if (!group || !Array.isArray(group.hooks) || group.hooks.length === 0) {
        const label = group?.matcher ? `"${group.matcher}"` : `#${gi}`;
        emptyGroups.push(`${eventName}[${label}]`);
      }
    }
  }
  if (emptyGroups.length === 0) {
    record('structure.handlers_array_non_empty', 'pass', 'All matcher groups have at least 1 handler');
  } else {
    record('structure.handlers_array_non_empty', 'fail',
      `Matcher groups with empty handlers array: ${emptyGroups.join(', ')}`);
  }
}

// ─── collect all handlers for handler-level checks ───────────────────────────
// Each entry: { eventName, matcherLabel, handlerIndex, handler }
const allHandlers = [];
for (const [eventName, matcherGroups] of Object.entries(hooksBlock)) {
  if (!Array.isArray(matcherGroups)) continue;
  for (let gi = 0; gi < matcherGroups.length; gi++) {
    const group = matcherGroups[gi];
    if (!group || !Array.isArray(group.hooks)) continue;
    const matcherLabel = group.matcher != null ? String(group.matcher) : '*';
    for (let hi = 0; hi < group.hooks.length; hi++) {
      allHandlers.push({
        eventName,
        matcherLabel,
        handlerIndex: hi,
        handler: group.hooks[hi],
      });
    }
  }
}

// ─── handler.type_valid ───────────────────────────────────────────────────────
{
  const invalid = [];
  for (const { eventName, matcherLabel, handlerIndex, handler } of allHandlers) {
    if (!handler || typeof handler !== 'object') {
      invalid.push(`${eventName}/${matcherLabel}[${handlerIndex}]: not an object`);
      continue;
    }
    if (!VALID_HANDLER_TYPES.has(handler.type)) {
      invalid.push(`${eventName}/${matcherLabel}[${handlerIndex}]: type="${handler.type ?? '(missing)'}"`);
    }
  }
  if (invalid.length === 0) {
    record('handler.type_valid', 'pass', `All ${allHandlers.length} handler(s) have a valid type`);
  } else {
    record('handler.type_valid', 'fail', `Invalid handler type(s): ${invalid.join('; ')}`);
  }
}

// ─── handler.required_fields ─────────────────────────────────────────────────
{
  const missing = [];
  for (const { eventName, matcherLabel, handlerIndex, handler } of allHandlers) {
    if (!handler || !VALID_HANDLER_TYPES.has(handler.type)) continue; // already flagged above
    const required = REQUIRED_FIELDS[handler.type] ?? [];
    for (const field of required) {
      if (!(field in handler) || handler[field] == null || handler[field] === '') {
        missing.push(`${eventName}/${matcherLabel}[${handlerIndex}] type=${handler.type}: missing "${field}"`);
      }
    }
  }
  if (missing.length === 0) {
    record('handler.required_fields', 'pass', 'All handlers have required fields for their type');
  } else {
    record('handler.required_fields', 'fail', `Missing required fields: ${missing.join('; ')}`);
  }
}

// ─── handler.timeout_explicit ─────────────────────────────────────────────────
{
  const noTimeout = [];
  for (const { eventName, matcherLabel, handlerIndex, handler } of allHandlers) {
    if (!handler || handler.type !== 'command') continue;
    if (!('timeout' in handler) || handler.timeout == null) {
      noTimeout.push(`${eventName}/${matcherLabel}[${handlerIndex}]`);
    }
  }
  const commandHandlers = allHandlers.filter((h) => h.handler?.type === 'command');
  if (noTimeout.length === 0) {
    if (commandHandlers.length === 0) {
      record('handler.timeout_explicit', 'na', 'No command handlers — timeout check not applicable');
    } else {
      record('handler.timeout_explicit', 'pass', `All ${commandHandlers.length} command handler(s) have explicit timeout`);
    }
  } else {
    record('handler.timeout_explicit', 'fail',
      `${noTimeout.length} command hook(s) without explicit timeout: ${noTimeout.join(', ')}`);
  }
}

// ─── handler.if_condition_valid ───────────────────────────────────────────────
{
  const issues = [];
  for (const { eventName, matcherLabel, handlerIndex, handler } of allHandlers) {
    if (!handler || typeof handler !== 'object') continue;
    if (!('if' in handler)) continue;

    // if is only supported on tool events
    if (!IF_SUPPORTED_EVENTS.has(eventName)) {
      issues.push(`${eventName}/${matcherLabel}[${handlerIndex}]: "if" field not supported on ${eventName}`);
      continue;
    }

    // Basic syntax check: should look like ToolName(...) or a simple string
    const ifVal = handler.if;
    if (typeof ifVal !== 'string' || ifVal.trim() === '') {
      issues.push(`${eventName}/${matcherLabel}[${handlerIndex}]: "if" must be a non-empty string`);
      continue;
    }
    // Minimal sanity: parentheses must be balanced if present
    const openCount = (ifVal.match(/\(/g) || []).length;
    const closeCount = (ifVal.match(/\)/g) || []).length;
    if (openCount !== closeCount) {
      issues.push(`${eventName}/${matcherLabel}[${handlerIndex}]: "if" has unbalanced parentheses: "${ifVal}"`);
    }
  }
  if (issues.length === 0) {
    record('handler.if_condition_valid', 'pass', 'All "if" fields are on supported events and have valid syntax');
  } else {
    record('handler.if_condition_valid', 'fail', issues.join('; '));
  }
}

// ─── bp.no_unjustified_dangerous ─────────────────────────────────────────────
{
  const dangerous = [];
  for (const { eventName, matcherLabel, handlerIndex, handler } of allHandlers) {
    if (!handler || typeof handler !== 'object') continue;
    // http handlers: check for non-HTTPS URL
    if (handler.type === 'http' && handler.url) {
      if (/^http:\/\//i.test(handler.url)) {
        dangerous.push(`${eventName}/${matcherLabel}[${handlerIndex}]: HTTP (non-HTTPS) URL "${handler.url}"`);
      }
    }
    // command handlers: check for path traversal patterns
    if (handler.type === 'command' && handler.command) {
      if (/\.\.\//  .test(handler.command)) {
        dangerous.push(`${eventName}/${matcherLabel}[${handlerIndex}]: path traversal "../" in command`);
      }
    }
  }
  if (dangerous.length === 0) {
    record('bp.no_unjustified_dangerous', 'pass', 'No HTTP (non-HTTPS) URLs or path traversal found');
  } else {
    record('bp.no_unjustified_dangerous', 'fail', `Potentially dangerous patterns: ${dangerous.join('; ')}`);
  }
}

// ─── flush to JSONL ──────────────────────────────────────────────────────────
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

flush();
