#!/usr/bin/env node
// update-manifest.mjs — Updates docs/technical/.manifest.json
// with the current hashes of documented files.
//
// Usage (two equivalent forms):
//
//   1) Pipe a JSON payload on stdin:
//        echo '{"updated":["apps/nakiros/src/x.ts"],"deleted":["apps/nakiros/src/y.ts"]}' \
//          | node scripts/update-manifest.mjs
//
//   2) Arguments:
//        node scripts/update-manifest.mjs --files a.ts b.ts --delete c.ts
//
// The skill workflow uses form (1) because it maps cleanly to the diff
// payload produced by compute-diff.mjs.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';

const ROOT = process.cwd();
const DOCS_DIR = join(ROOT, 'docs/technical');
const MANIFEST_PATH = join(DOCS_DIR, '.manifest.json');

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function readStdin() {
  if (process.stdin.isTTY) return null;
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`update-manifest: stdin not valid JSON (${e.message})\n`);
    process.exit(2);
  }
}

function parseArgs(argv) {
  const updated = [];
  const deleted = [];
  let mode = null;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--files') mode = 'updated';
    else if (a === '--delete') mode = 'deleted';
    else if (mode === 'updated') updated.push(a);
    else if (mode === 'deleted') deleted.push(a);
  }
  return { updated, deleted };
}

async function main() {
  let updated = [];
  let deleted = [];

  const fromStdin = await readStdin();
  if (fromStdin) {
    updated = Array.isArray(fromStdin.updated) ? fromStdin.updated : [];
    deleted = Array.isArray(fromStdin.deleted) ? fromStdin.deleted : [];
  } else {
    const args = parseArgs(process.argv);
    updated = args.updated;
    deleted = args.deleted;
  }

  if (!existsSync(DOCS_DIR)) mkdirSync(DOCS_DIR, { recursive: true });

  let manifest;
  if (existsSync(MANIFEST_PATH)) {
    try {
      manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    } catch {
      manifest = { version: 1, files: {} };
    }
  } else {
    manifest = { version: 1, files: {} };
  }
  if (!manifest.files) manifest.files = {};

  let updatedOk = 0;
  const missing = [];
  for (const rel of updated) {
    const full = join(ROOT, rel);
    if (!existsSync(full)) {
      missing.push(rel);
      delete manifest.files[rel];
      continue;
    }
    manifest.files[rel] = sha256(full);
    updatedOk += 1;
  }

  for (const rel of deleted) {
    delete manifest.files[rel];
  }

  manifest.version = manifest.version || 1;
  manifest.updated_at = new Date().toISOString();

  if (!existsSync(dirname(MANIFEST_PATH))) {
    mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  }
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        total_tracked: Object.keys(manifest.files).length,
        updated_count: updatedOk,
        deleted_count: deleted.length,
        missing,
      },
      null,
      2,
    ) + '\n',
  );
}

main();
