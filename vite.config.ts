import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // three.js alone is ~600 kB minified. It is split into its own chunk below so
    // an app-only change does not invalidate the vendor chunk in a player's cache;
    // the remaining app code stays well under the default 500 kB warning.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three';
          return undefined;
        },
      },
    },
  },
  server: {
    host: true,
    port: 3030,
    open: false,
  },
});
