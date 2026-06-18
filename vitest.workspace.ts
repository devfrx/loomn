import { defineWorkspace } from 'vitest/config';

// I pacchetti (node) restano in ./vitest.config.ts; il renderer (jsdom+vue) in app/desktop.
// `pnpm test` (vitest run, root) esegue entrambi i progetti.
export default defineWorkspace(['./vitest.config.ts', './app/desktop/vitest.config.ts']);
