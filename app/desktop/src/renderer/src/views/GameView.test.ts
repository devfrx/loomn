import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { ReadModelPush } from '@loomn/shared';
import { useReadModelStore } from '../stores/read-model';
import GameView from './GameView.vue';

const GridLayout = { template: '<div class="grid-stub"><slot /></div>' };
const GridItem = { props: ['x', 'y', 'w', 'h', 'i'], template: '<div class="grid-item-stub"><slot /></div>' };
// Componenti pesanti: stub passthrough (NarrativePanel monta loomn, DiceCanvas usa WebGL).
const NarrativePanel = { template: '<div class="narrative-stub">Narrazione</div>' };
const DicePanel = { template: '<div class="dice-stub">Dadi</div>' };
const EncounterPanel = { template: '<div class="encounter-stub">Scontro</div>' };
const SheetPanel = { template: '<div class="sheet-stub">Scheda</div>' };

function push(phase: ReadModelPush['state']['phase']): ReadModelPush {
  return { version: 1, state: { version: 1, actors: {}, encounter: null, quests: {}, phase } };
}

function mountGame() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(GameView, { global: { plugins: [pinia], stubs: { GridLayout, GridItem, NarrativePanel, DicePanel, EncounterPanel, SheetPanel } } });
}

describe('GameView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.loomn = {
      getNarrationHistory: vi.fn(() => Promise.resolve({ ok: true, entries: [], hasMore: false })),
      getStatus: vi.fn(() => Promise.resolve({ ok: true, version: 0, safeStorageAvailable: true, providerConfigured: false })),
    } as unknown as typeof window.loomn;
  });

  it('in exploration monta narrazione, scheda e dadi', async () => {
    const w = mountGame();
    await flushPromises();
    expect(w.findAll('.grid-item-stub')).toHaveLength(3);
    expect(w.text()).toContain('Narrazione');
    expect(w.text()).toContain('Scheda');
    expect(w.text()).toContain('Dadi');
  });

  it('passando a combat sostituisce la scheda con lo scontro', async () => {
    const w = mountGame();
    const store = useReadModelStore();
    store.applyPush(push('combat'));
    await flushPromises();
    expect(w.text()).toContain('Scontro');
    expect(w.text()).not.toContain('Scheda');
  });
});
