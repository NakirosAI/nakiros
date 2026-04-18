import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

const sharedEntry = resolve(__dirname, '../../packages/shared/src/index.ts');

export default defineConfig({
  root: 'src',
  resolve: {
    alias: {
      '@nakiros/shared': sharedEntry,
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist-electron/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: { index: resolve(__dirname, 'src/index.html') },
    },
  },
  plugins: [react(), tailwindcss()],
});
