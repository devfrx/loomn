import type { LayoutItem } from './presets';
import { presetFor } from './presets';
import type { PhaseView } from '../stores/read-model';

/** Port di persistenza del layout (preferenza di vista, NON stato di dominio/event store).
 *  Astrazione deliberata: oggi adapter localStorage del renderer; se un domani servisse lato main
 *  (multi-finestra/backup) si scambia l adapter senza toccare i call site (isolato-e-migrabile). */
export interface LayoutPersistence {
  load(phase: PhaseView): LayoutItem[] | null;
  save(phase: PhaseView, layout: LayoutItem[]): void;
}

const KEY_PREFIX = 'loomn:layout:';

/** Adapter localStorage. `storage` iniettabile (default window.localStorage) -> testabile con un
 *  doppio. Letture resilienti: JSON corrotto / forma non valida -> null (si ricade sul preset). */
export function createLocalStoragePersistence(
  storage: Storage = window.localStorage,
): LayoutPersistence {
  return {
    load(phase) {
      const raw = storage.getItem(KEY_PREFIX + phase);
      if (raw === null) return null;
      try {
        const parsed: unknown = JSON.parse(raw);
        return isLayout(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    save(phase, layout) {
      storage.setItem(KEY_PREFIX + phase, JSON.stringify(layout));
    },
  };
}

function isLayout(v: unknown): v is LayoutItem[] {
  return (
    Array.isArray(v) &&
    v.every((it) => {
      if (typeof it !== 'object' || it === null) return false;
      const o = it as Record<string, unknown>;
      return (
        typeof o['i'] === 'string' &&
        typeof o['x'] === 'number' &&
        typeof o['y'] === 'number' &&
        typeof o['w'] === 'number' &&
        typeof o['h'] === 'number'
      );
    })
  );
}

/** Risolve il layout per la fase: override persistito se valido, altrimenti il preset di default. */
export function resolveLayout(phase: PhaseView, persistence: LayoutPersistence): LayoutItem[] {
  return persistence.load(phase) ?? presetFor(phase);
}
