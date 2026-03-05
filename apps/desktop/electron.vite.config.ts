import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { existsSync, readFileSync } from 'fs';

// Load .env manually so process.env is populated before define block is evaluated
const envPath = resolve(__dirname, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}

const sharedEntry = resolve(__dirname, '../../packages/shared/src/index.ts');
const serverEntry = resolve(__dirname, '../../packages/server/src/index.ts');
const outRoot = 'dist-electron';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@nakiros/server', '@nakiros/shared'] })],
    define: {
      'process.env.NAKIROS_API_KEY_STABLE': JSON.stringify(process.env.NAKIROS_API_KEY_STABLE ?? ''),
      'process.env.NAKIROS_API_KEY_BETA': JSON.stringify(process.env.NAKIROS_API_KEY_BETA ?? ''),
      'process.env.NAKIROS_FEEDBACK_KEY': JSON.stringify(process.env.NAKIROS_FEEDBACK_KEY ?? ''),
    },
    resolve: {
      alias: {
        '@nakiros/shared': sharedEntry,
        '@nakiros/server': serverEntry,
      },
    },
    build: {
      outDir: `${outRoot}/main`,
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/main.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@nakiros/server', '@nakiros/shared'] })],
    resolve: {
      alias: {
        '@nakiros/shared': sharedEntry,
        '@nakiros/server': serverEntry,
      },
    },
    build: {
      outDir: `${outRoot}/preload`,
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload.ts') },
      },
    },
  },
  renderer: {
    root: 'src',
    resolve: {
      alias: {
        '@nakiros/shared': sharedEntry,
        '@nakiros/server': serverEntry,
      },
    },
    build: {
      outDir: resolve(__dirname, `${outRoot}/renderer`),
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/index.html') },
      },
    },
    plugins: [react()],
  },
});
