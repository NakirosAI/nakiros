import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const sharedEntry = resolve(__dirname, '../../packages/shared/src/index.ts');
const serverEntry = resolve(__dirname, '../../packages/server/src/index.ts');
const outRoot = 'dist-electron';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@nakiros/server', '@nakiros/shared'] })],
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
