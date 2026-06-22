/// <reference types="vite/client" />
import type { LoomnBridge } from '@loomn/shared';

declare global {
  interface Window {
    loomn: LoomnBridge;
  }
  // vite/client non e risolvibile per nome da app/desktop (pnpm strict linking: vite e solo dep
  // transitiva di electron-vite/vitest), quindi il reference sopra non applica l augmentation di
  // ImportMeta. Dichiariamo qui i membri di import.meta.env che usiamo (DEV per il dev-gate della
  // Regia, M-15) cosi vue-tsc li tipa.
  interface ImportMetaEnv {
    readonly DEV: boolean;
    readonly PROD: boolean;
    readonly MODE: string;
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
