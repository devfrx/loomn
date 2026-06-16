import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import vue from '@vitejs/plugin-vue';

// Default entry (convenzione electron-vite): src/main/index.ts, src/preload/index.ts,
// src/renderer/index.html. externalizeDepsPlugin esternalizza le deps di package.json (nessuna
// nativa in 9a), ma `exclude` forza il bundling del TS di @loomn/shared (non ha build a JS).
// Il preload e forzato a CJS: un preload sandboxed non puo essere un ES module (verificato).
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@loomn/shared'] })],
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@loomn/shared'] })],
    build: {
      rollupOptions: {
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    plugins: [vue()],
  },
});
