import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { ReadModelPush } from '@loomn/shared';
import { useReadModelStore } from '../stores/read-model';
import GameView from './GameView.vue';

// Stub di grid-layout-plus (in jsdom misurerebbe il DOM): passthrough degli slot.
const GridLayout = { template: '<div class="grid-stub"><slot /></div>' };
const GridItem = {
  props: ['x', 'y', 'w', 'h', 'i'],
  template: '<div class="grid-item-stub"><slot /></div>',
};

function push(phase: ReadModelPush['state']['phase']): ReadModelPush {
  return { version: 1, state: { version: 1, actors: {}, encounter: null, quests: {}, phase } };
}

function mountGame() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(GameView, { global: { plugins: [pinia], stubs: { GridLayout, GridItem } } });
}

describe('GameView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('in exploration rende narrazione, scheda e dadi', () => {
    const w = mountGame();
    const text = w.text();
    expect(w.findAll('.grid-item-stub')).toHaveLength(3);
    expect(text).toContain('Narrazione');
    expect(text).toContain('Scheda');
    expect(text).toContain('Dadi');
  });

  it('passando a combat sostituisce la scheda con lo scontro', async () => {
    const w = mountGame();
    const store = useReadModelStore();
    store.applyPush(push('combat'));
    await flushPromises();
    const text = w.text();
    expect(text).toContain('Scontro');
    expect(text).not.toContain('Scheda');
  });
});
