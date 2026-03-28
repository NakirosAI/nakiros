#!/usr/bin/env node
/**
 * Scans bundle directories and rebuilds manifest.json files[] with fresh SHA256 hashes.
 * Preserves all metadata fields (version, channel, changelog, etc.) — only files[] is rebuilt.
 *
 * Scanned directories: agents/, workflows/, commands/, core/ (recursive)
 *
 * Usage: node packages/agents-bundle/scripts/generate-manifest.js
 */

const { createHash } = require('crypto');
const { readFileSync, readdirSync, statSync, writeFileSync } = require('fs');
const { resolve, join, relative, basename, extname } = require('path');

const BUNDLE_DIR = resolve(__dirname, '..');
const MANIFEST_PATH = resolve(BUNDLE_DIR, 'manifest.json');

const SCAN_DIRS = [
  { dir: 'agents', type: 'agent', recursive: false },
  { dir: 'workflows', type: 'workflow', recursive: true },
  { dir: 'commands', type: 'command', recursive: false },
  { dir: 'core', type: 'core', recursive: true },
];

function hashFile(filePath) {
  return `sha256:${createHash('sha256').update(readFileSync(filePath)).digest('hex')}`;
}

function scanDir(dirPath, type, recursive) {
  const entries = [];
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory() && recursive) {
      entries.push(...scanDir(fullPath, type, true));
    } else if (entry.isFile()) {
      const relPath = relative(BUNDLE_DIR, fullPath).replace(/\\/g, '/');
      entries.push({
        type,
        name: basename(entry.name, extname(entry.name)),
        filename: entry.name,
        path: relPath,
        hash: hashFile(fullPath),
      });
    }
  }
  return entries;
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

// Preserve existing meta fields — meta is set manually and must survive rehash
const existingMetaByName = new Map(
  (manifest.files ?? [])
    .filter((f) => f.meta)
    .map((f) => [f.name, f.meta]),
);

const files = [];

for (const { dir, type, recursive } of SCAN_DIRS) {
  const dirPath = resolve(BUNDLE_DIR, dir);
  try {
    statSync(dirPath);
  } catch {
    console.warn(`WARN: Directory not found, skipping: ${dir}`);
    continue;
  }
  files.push(...scanDir(dirPath, type, recursive));
}

// Merge preserved meta back into the fresh entries
for (const file of files) {
  const meta = existingMetaByName.get(file.name);
  if (meta) file.meta = meta;
}

manifest.files = files.sort((a, b) => a.path.localeCompare(b.path));
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`manifest.json updated — ${files.length} file(s) indexed.`);
files.forEach((f) => console.log(`  ${f.type.padEnd(9)} ${f.path}${f.meta ? ` (meta: ${Object.keys(f.meta).join(', ')})` : ''}`));
