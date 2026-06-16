/// <reference types="vite/client" />
import type { LoomnBridge } from '@loomn/shared';

declare global {
  interface Window {
    loomn: LoomnBridge;
  }
}
