#!/usr/bin/env node
/**
 * Push the agents bundle to Cloudflare R2 using Wrangler CLI.
 *
 * Mirrors exactly what the GitHub Action does, for local testing.
 *
 * Prerequisites:
 *   npm install -g wrangler
 *   wrangler login  (or set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID)
 *
 * Usage:
 *   node packages/agents-bundle/scripts/push-bundle.js [--dry-run] [--force]
 *
 * Options:
 *   --dry-run   Print what would be uploaded without actually uploading
 *   --force     Skip the "version already exists" check (useful for re-push)
 *
 * Required env vars (or use wrangler login):
 *   CLOUDFLARE_ACCOUNT_ID
 *   R2_BUCKET_NAME   (default: nakiros-assets)
 */

const { readFileSync, existsSync, readdirSync, statSync } = require('fs');
const { execSync } = require('child_process');
const { resolve, relative, join } = require('path');

const BUNDLE_DIR = resolve(__dirname, '..');
const MANIFEST_PATH = resolve(BUNDLE_DIR, 'manifest.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');

// ─── Load manifest ────────────────────────────────────────────────────────────

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const { version, channel } = manifest;
const bucket = process.env.R2_BUCKET_NAME || 'nakiros-assets';

console.log(`\nBundle:  v${version} (${channel})`);
console.log(`Bucket:  ${bucket}`);
if (DRY_RUN) console.log('Mode:    DRY RUN — nothing will be uploaded\n');
else console.log('');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wrangler(args, opts = {}) {
  const cmd = `npx wrangler ${args}`;
  if (DRY_RUN) {
    console.log(`[dry-run] ${cmd}`);
    return '';
  }
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: opts.silent ? 'pipe' : 'inherit' });
  } catch (err) {
    throw new Error(`Wrangler command failed:\n  ${cmd}\n  ${err.message}`);
  }
}

function r2Put(localPath, r2Key) {
  return wrangler(`r2 object put "${bucket}/${r2Key}" --file "${localPath}"`);
}

// ─── Step 1: generate hashes ──────────────────────────────────────────────────

console.log('Step 1/4 — Generating hashes...');
execSync(`node "${resolve(__dirname, 'generate-manifest.js')}"`, { stdio: 'inherit' });

// Reload manifest after hash generation
const fresh = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

// ─── Step 2: check version doesn't already exist ─────────────────────────────

console.log('\nStep 2/4 — Checking R2 for existing version...');
if (!FORCE && !DRY_RUN) {
  let exists = false;
  try {
    const result = execSync(
      `npx wrangler r2 object get "${bucket}/channels/${channel}/${version}/manifest.json" --pipe`,
      { encoding: 'utf8', stdio: 'pipe' }
    );
    if (result) exists = true;
  } catch {
    // 404 = doesn't exist, which is what we want
    exists = false;
  }

  if (exists) {
    console.error(
      `\nERROR: Bundle version ${version} already exists on channel ${channel}.\n` +
      `Bump the version in manifest.json before pushing.\n` +
      `(Use --force to override this check.)`
    );
    process.exit(1);
  }
  console.log(`  ✓ Version ${version} not found — safe to push.`);
} else {
  console.log(`  Skipped (${FORCE ? '--force' : 'dry-run'}).`);
}

// ─── Step 3: upload bundle files to versioned path ───────────────────────────

const versionedPrefix = `channels/${channel}/${version}`;
console.log(`\nStep 3/4 — Uploading bundle files to ${versionedPrefix}/...`);

const SKIP = new Set(['scripts', 'CHANGELOG.md', 'package.json', '.wrangler', '.DS_Store', '.markdownlintrc.json']);

function walkDir(dir, baseDir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (SKIP.has(entry.name)) continue;
    if (entry.isDirectory()) {
      walkDir(fullPath, baseDir);
    } else {
      const relPath = relative(baseDir, fullPath).replace(/\\/g, '/');
      const r2Key = `${versionedPrefix}/${relPath}`;
      console.log(`  → ${relPath}`);
      r2Put(fullPath, r2Key);
    }
  }
}

walkDir(BUNDLE_DIR, BUNDLE_DIR);

// ─── Step 4: upload manifest.json to channel root ────────────────────────────

const channelManifestKey = `channels/${channel}/manifest.json`;
console.log(`\nStep 4/4 — Uploading manifest.json to ${channelManifestKey}...`);
r2Put(MANIFEST_PATH, channelManifestKey);

// ─── Done ─────────────────────────────────────────────────────────────────────

console.log(`\n✅ Bundle v${version} pushed to channel ${channel}${DRY_RUN ? ' (dry-run)' : ''}.`);
