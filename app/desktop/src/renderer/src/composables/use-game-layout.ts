import { ref, watch, type Ref } from 'vue';
import type { LayoutItem } from '../layout/presets';
import { resolveLayout, type LayoutPersistence } from '../layout/persistence';
import type { PhaseView } from '../stores/read-model';

/** Logica del layout del Gioco: risolve il layout per la fase corrente (override persistito o
 *  preset), ri-risolve al cambio fase, e persiste il riarrangiamento dell utente. Estratta dal
 *  componente per essere testabile senza grid-layout-plus (che misura il DOM). */
export function useGameLayout(
  phase: Ref<PhaseView>,
  persistence: LayoutPersistence,
): { layout: Ref<LayoutItem[]>; onLayoutUpdated: (next: LayoutItem[]) => void } {
  const layout = ref<LayoutItem[]>(resolveLayout(phase.value, persistence));

  watch(phase, (next) => {
    // Qualunque riarrangiamento non ancora persistito viene scartato: il preset/override per-fase
    // e canonico (il layout e una preferenza per-fase, non stato condiviso fra fasi).
    layout.value = resolveLayout(next, persistence);
  });

  /** Lo chiama grid-layout-plus su layout-updated: persiste l arrangiamento per la fase corrente. */
  function onLayoutUpdated(next: LayoutItem[]): void {
    layout.value = next;
    persistence.save(phase.value, next);
  }

  return { layout, onLayoutUpdated };
}
