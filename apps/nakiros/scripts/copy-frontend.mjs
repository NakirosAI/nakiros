#!/usr/bin/env node
// After tsup builds dist/bin/nakiros.js, copy the frontend bundle to dist/ui/
// so the published tarball is self-contained.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..');
const frontendDist = resolve(appRoot, '../frontend/dist');
const outUi = resolve(appRoot, 'dist/ui');

if (!existsSync(frontendDist)) {
  console.error(
    `[copy-frontend] ${frontendDist} not found. Run \`pnpm -F @nakiros/frontend build\` first (or \`turbo build\`).`,
  );
  process.exit(1);
}

if (existsSync(outUi)) rmSync(outUi, { recursive: true, force: true });
cpSync(frontendDist, outUi, { recursive: true });
console.log(`[copy-frontend] copied ${frontendDist} → ${outUi}`);
