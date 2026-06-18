import { describe, it, expect } from 'vitest';
import { ref, nextTick } from 'vue';
import { useGameLayout } from './use-game-layout';
import { createLocalStoragePersistence } from '../layout/persistence';
import { presetFor, PANELS } from '../layout/presets';
import type { PhaseView } from '../stores/read-model';

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    removeItem: (k: string) => {
      m.delete(k);
    },
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
  };
}

describe('useGameLayout', () => {
  it('parte col preset della fase quando non c e nulla di persistito', () => {
    const phase = ref<PhaseView>('exploration');
    const { layout } = useGameLayout(phase, createLocalStoragePersistence(fakeStorage()));
    expect(layout.value).toEqual(presetFor('exploration'));
  });

  it('ri-risolve al cambio fase (combat porta il pannello scontro)', async () => {
    const phase = ref<PhaseView>('exploration');
    const { layout } = useGameLayout(phase, createLocalStoragePersistence(fakeStorage()));
    phase.value = 'combat';
    await nextTick();
    expect(layout.value.map((it) => it.i)).toContain(PANELS.encounter);
  });

  it('onLayoutUpdated persiste e aggiorna il layout corrente', () => {
    const phase = ref<PhaseView>('combat');
    const persistence = createLocalStoragePersistence(fakeStorage());
    const { layout, onLayoutUpdated } = useGameLayout(phase, persistence);
    const moved = [{ i: PANELS.narrative, x: 1, y: 1, w: 6, h: 10 }];
    onLayoutUpdated(moved);
    expect(layout.value).toEqual(moved);
    expect(persistence.load('combat')).toEqual(moved);
  });

  it('tornando a una fase con override persistito lo ricarica', async () => {
    const persistence = createLocalStoragePersistence(fakeStorage());
    const phase = ref<PhaseView>('combat');
    const { onLayoutUpdated } = useGameLayout(phase, persistence);
    const moved = [{ i: PANELS.dice, x: 0, y: 0, w: 4, h: 4 }];
    onLayoutUpdated(moved);
    phase.value = 'exploration';
    await nextTick();
    phase.value = 'combat';
    await nextTick();
    expect(persistence.load('combat')).toEqual(moved);
  });
});
