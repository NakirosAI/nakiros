#!/usr/bin/env node
// After tsup builds dist/bin/nakiros.js:
//  1. Copy the frontend bundle to dist/ui/ so the published tarball is self-contained.
//  2. Copy the workspace CHANGELOG.md to dist/CHANGELOG.md so the
//     meta:getChangelog IPC handler can read it at runtime.
import { copyFileSync, cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..');
const frontendDist = resolve(appRoot, '../frontend/dist');
const outUi = resolve(appRoot, 'dist/ui');

// ── 1. Frontend bundle ────────────────────────────────────────────────────────
if (!existsSync(frontendDist)) {
  console.error(
    `[copy-frontend] ${frontendDist} not found. Run \`pnpm -F @nakiros/frontend build\` first (or \`turbo build\`).`,
  );
  process.exit(1);
}

if (existsSync(outUi)) rmSync(outUi, { recursive: true, force: true });
cpSync(frontendDist, outUi, { recursive: true });
console.log(`[copy-frontend] copied ${frontendDist} → ${outUi}`);

// ── 2. CHANGELOG.md ──────────────────────────────────────────────────────────
// The workspace root is two levels up from apps/nakiros/ (monorepo layout).
const workspaceChangelog = resolve(appRoot, '../../CHANGELOG.md');
const outChangelog = resolve(appRoot, 'dist/CHANGELOG.md');

if (existsSync(workspaceChangelog)) {
  copyFileSync(workspaceChangelog, outChangelog);
  console.log(`[copy-frontend] copied ${workspaceChangelog} → ${outChangelog}`);
} else {
  console.warn(`[copy-frontend] CHANGELOG.md not found at ${workspaceChangelog} — skipping`);
}
