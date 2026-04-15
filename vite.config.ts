import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
        'react/index': fileURLToPath(new URL('./src/react/index.ts', import.meta.url)),
      },
      formats: ['es'],
    },
    emptyOutDir: false,
    rollupOptions: {
      external: ['use-sync-external-store', 'use-sync-external-store/shim'],
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
});
