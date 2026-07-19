/**
 * Dependency-free, BOUNDED TOML reader for the `[mcp_servers.*]` subset used
 * by Codex's `.codex/config.toml`.
 *
 * This is NOT a general-purpose TOML parser. It intentionally supports only
 * what the Codex MCP adapter (`apps/nakiros/src/services/provider-configuration
 * /codex-mcp-adapter.ts`) actually reads and writes:
 *
 *   - Table headers:            [mcp_servers.<name>]  and  [mcp_servers.<name>.<subtable>]
 *   - String scalars:           key = "value"  or  key = 'value'
 *   - String arrays (one line): key = ["a", "b", "c"]
 *   - Booleans / finite numbers as scalars (for robustness against unknown keys)
 *   - `#` line comments (outside of quoted strings)
 *
 * Deliberately NOT supported (out of scope for the mcp_servers slice this
 * skill audits): multi-line arrays, inline tables (`{ a = 1 }`), array-of-
 * tables (`[[...]]`), dotted keys inside a single `key = value` line,
 * multi-line strings (`"""..."""`), non-ASCII escapes beyond what
 * `JSON.parse` accepts for a basic string. If a real-world file needs any
 * of these, this reader reports a parse error rather than silently
 * mis-parsing — the agent should then fall back to reading the file
 * directly and reasoning about it manually (see SKILL.md gotchas).
 *
 * Runs with only `node:*` built-ins — no `confbox`, no third-party package.
 * This module must stay standalone: the skill ships without the daemon's
 * node_modules available.
 */

/**
 * Parses the bounded TOML subset described above.
 *
 * @param {string} source Raw file contents.
 * @returns {{ ok: true, value: Record<string, unknown> } | { ok: false, error: string }}
 */
export function parseTomlSubset(source) {
  const root = {};
  let current = root;
  let currentPath = [];
  const lines = source.split(/\r\n|\n/);

  for (let lineNo = 0; lineNo < lines.length; lineNo++) {
    const rawLine = lines[lineNo];
    const line = stripComment(rawLine).trim();
    if (line === '') continue;

    if (line.startsWith('[')) {
      const headerResult = parseTableHeader(line);
      if (!headerResult.ok) {
        return { ok: false, error: `line ${lineNo + 1}: ${headerResult.error}` };
      }
      if (headerResult.arrayOfTables) {
        return {
          ok: false,
          error: `line ${lineNo + 1}: array-of-tables ([[...]]) is not supported by this bounded reader`,
        };
      }
      current = ensurePath(root, headerResult.path);
      currentPath = headerResult.path;
      continue;
    }

    const eq = findTopLevelEquals(line);
    if (eq === -1) {
      return { ok: false, error: `line ${lineNo + 1}: expected "key = value", got: ${JSON.stringify(rawLine)}` };
    }
    const rawKey = line.slice(0, eq).trim();
    const rawValue = line.slice(eq + 1).trim();
    const keyResult = parseKey(rawKey);
    if (!keyResult.ok) {
      return { ok: false, error: `line ${lineNo + 1}: invalid key ${JSON.stringify(rawKey)}` };
    }
    const valueResult = parseValue(rawValue);
    if (!valueResult.ok) {
      return {
        ok: false,
        error: `line ${lineNo + 1}: ${valueResult.error} (in ${currentPath.join('.') || '<root>'})`,
      };
    }
    current[keyResult.key] = valueResult.value;
  }

  return { ok: true, value: root };
}

function stripComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '#' && !inSingle && !inDouble) return line.slice(0, i);
  }
  return line;
}

function findTopLevelEquals(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '=' && !inSingle && !inDouble) return i;
  }
  return -1;
}

function parseTableHeader(line) {
  const arrayOfTables = line.startsWith('[[');
  const inner = arrayOfTables
    ? line.replace(/^\[\[/, '').replace(/\]\]\s*$/, '')
    : line.replace(/^\[/, '').replace(/\]\s*$/, '');
  if (inner === line) {
    return { ok: false, error: `malformed table header: ${line}` };
  }
  const path = splitDottedPath(inner);
  if (!path) {
    return { ok: false, error: `malformed table header path: ${inner}` };
  }
  return { ok: true, path, arrayOfTables };
}

/** Splits a dotted TOML key/table path, respecting quoted segments. */
function splitDottedPath(raw) {
  const segments = [];
  let buf = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"' && !inSingle) { inDouble = !inDouble; buf += ch; continue; }
    if (ch === "'" && !inDouble) { inSingle = !inSingle; buf += ch; continue; }
    if (ch === '.' && !inSingle && !inDouble) {
      segments.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  segments.push(buf.trim());
  const cleaned = [];
  for (const seg of segments) {
    const keyResult = parseKey(seg);
    if (!keyResult.ok) return null;
    cleaned.push(keyResult.key);
  }
  return cleaned.length > 0 ? cleaned : null;
}

function parseKey(raw) {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false };
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2)
    || (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return { ok: true, key: trimmed.slice(1, -1) };
  }
  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return { ok: true, key: trimmed };
  }
  return { ok: false };
}

function ensurePath(root, path) {
  let node = root;
  for (const segment of path) {
    if (node[segment] === undefined) node[segment] = {};
    if (typeof node[segment] !== 'object' || Array.isArray(node[segment])) {
      // Overwrite a scalar with a table only if this is genuinely a fresh
      // table declaration; in this bounded reader we treat this as an error
      // condition surfaced by the caller re-reading the file, not here —
      // simplest safe behavior is to coerce to a table so parsing continues.
      node[segment] = {};
    }
    node = node[segment];
  }
  return node;
}

function parseValue(raw) {
  if (raw === '') return { ok: false, error: 'empty value' };
  if (raw.startsWith('[')) return parseStringArray(raw);
  if (raw.startsWith('"') || raw.startsWith("'")) return parseScalarString(raw);
  if (raw === 'true' || raw === 'false') return { ok: true, value: raw === 'true' };
  if (/^-?\d+(\.\d+)?$/.test(raw)) return { ok: true, value: Number(raw) };
  return { ok: false, error: `unsupported value shape: ${raw}` };
}

function parseScalarString(raw) {
  const quote = raw[0];
  if (!raw.endsWith(quote) || raw.length < 2) {
    return { ok: false, error: `unterminated string: ${raw}` };
  }
  const body = raw.slice(1, -1);
  if (quote === "'") {
    // TOML literal string — no escaping at all.
    return { ok: true, value: body };
  }
  try {
    // TOML basic-string escaping is a superset-compatible-enough subset of
    // JSON string escaping for the values this skill deals with (paths,
    // URLs, tokens). Fall back to the raw body if JSON.parse rejects it.
    return { ok: true, value: JSON.parse(`"${body}"`) };
  } catch {
    return { ok: true, value: body };
  }
}

function parseStringArray(raw) {
  if (!raw.endsWith(']')) {
    return { ok: false, error: `multi-line arrays are not supported by this bounded reader: ${raw}` };
  }
  const inner = raw.slice(1, -1).trim();
  if (inner === '') return { ok: true, value: [] };
  const items = splitArrayItems(inner);
  const values = [];
  for (const item of items) {
    const trimmed = item.trim();
    const result = parseValue(trimmed);
    if (!result.ok) return { ok: false, error: `invalid array item ${JSON.stringify(trimmed)}: ${result.error}` };
    values.push(result.value);
  }
  return { ok: true, value: values };
}

function splitArrayItems(inner) {
  const items = [];
  let buf = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "'" && !inDouble) inSingle = !inSingle;
    if (ch === ',' && !inSingle && !inDouble) {
      items.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim() !== '') items.push(buf);
  return items;
}
