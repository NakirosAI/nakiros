import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'bin/nakiros': 'bin/nakiros.ts',
  },
  format: ['esm'],
  outDir: 'dist',
  target: 'node20',
  platform: 'node',
  sourcemap: false,
  clean: true,
  dts: false,
  splitting: false,
  bundle: true,
  // Keep node_modules externalized so npm install pulls them; we only bundle our workspace sources.
  noExternal: ['@nakiros/shared', '@nakiros/agents-bundle'],
  banner: { js: '#!/usr/bin/env node' },
});
