import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

// Progetto di test del renderer (logica/componenti Vue): ambiente jsdom + plugin-vue per gli SFC.
// NON tocca better-sqlite3 (i test importano @loomn/shared, foglia zod-only, e Vue) -> resta su ABI
// Node, nessun conflitto col nativo. passWithNoTests: durante lo scaffold non esistono ancora test.
export default defineConfig({
  plugins: [vue()],
  test: {
    name: 'renderer',
    include: ['src/**/*.test.ts'],
    environment: 'jsdom',
    passWithNoTests: true,
  },
});
