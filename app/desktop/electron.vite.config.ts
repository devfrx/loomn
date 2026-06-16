import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import vue from '@vitejs/plugin-vue';
import { cpSync } from 'node:fs';
import { join } from 'node:path';

// I pacchetti workspace TS sono source-only: vanno bundlati (esclusi dall esternalizzazione), cosi
// esbuild ne compila il TS. better-sqlite3 (nativa) e drizzle-orm restano esternalizzati (deps di
// app/desktop) -> risolti a runtime da node_modules.
const WORKSPACE_TS = ['@loomn/shared', '@loomn/host', '@loomn/engine', '@loomn/ai', '@loomn/memory'];

// Plugin: copia le migrazioni di @loomn/memory in out/migrations. memory/db.ts risolve la cartella
// con fileURLToPath(new URL('../migrations', import.meta.url)); nel main bundlato (out/main/index.js)
// quel percorso e out/migrations -> migrate() le trova (verificato in sandbox, HANDOFF 7-bis).
function copyMigrationsPlugin() {
  return {
    name: 'loomn-copy-migrations',
    closeBundle(): void {
      const src = join(__dirname, '../../packages/memory/migrations');
      const dest = join(__dirname, 'out/migrations');
      cpSync(src, dest, { recursive: true });
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_TS }), copyMigrationsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_TS })],
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
