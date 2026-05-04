#!/usr/bin/env node
// PostToolUse hook for Edit / Write — lint just the modified file.
// Fast pass-through on non-TS files. Surfaces ESLint errors back to Claude
// via exit code 2 so they appear inline in the conversation.

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const filePath =
  input?.tool_input?.file_path ?? input?.tool_input?.notebook_path;
if (!filePath) process.exit(0);

const ext = path.extname(filePath);
if (!['.ts', '.tsx', '.mjs', '.js', '.cjs'].includes(ext)) process.exit(0);

const repoRoot = process.cwd();
if (!filePath.startsWith(repoRoot)) process.exit(0);

const rel = path.relative(repoRoot, filePath);
if (
  rel.startsWith('node_modules/') ||
  rel.includes('/dist/') ||
  rel.startsWith('dist/') ||
  rel.startsWith('docs/technical/')
) {
  process.exit(0);
}

const result = spawnSync(
  'pnpm',
  ['exec', 'eslint', '--fix', '--no-warn-ignored', filePath],
  { cwd: repoRoot, encoding: 'utf8' }
);

if (result.status === 0) process.exit(0);

const out = (result.stdout || '') + (result.stderr || '');
process.stderr.write(out);
process.exit(2);
