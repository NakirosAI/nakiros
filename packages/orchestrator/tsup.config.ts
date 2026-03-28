import { defineConfig } from 'tsup';

export default defineConfig([
  // Library entry — imported by Desktop and other consumers
  {
    entry: { index: 'src/index.ts' },
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    sourcemap: true,
  },
  // CLI binary — standalone nakiros executable
  {
    entry: { 'bin/nakiros': 'bin/nakiros.ts' },
    format: ['esm'],
    dts: false,
    clean: false,
    sourcemap: false,
    banner: { js: '#!/usr/bin/env node' },
  },
]);
