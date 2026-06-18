import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import DicePanel from './DicePanel.vue';
import { useDiceStore } from '../stores/dice';

// DiceCanvas usa WebGL (non disponibile in jsdom): stub passthrough.
const stubs = {
  LoomnPanel: { template: '<div><slot /></div>' },
  DiceCanvas: { template: '<div class="dice-canvas-stub" />' },
};

describe('DicePanel', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('senza tiri mostra uno stato vuoto', () => {
    const w = mount(DicePanel, { global: { plugins: [createPinia()], stubs } });
    expect(w.text()).toContain('Nessun tiro');
  });

  it('mostra il readout di una prova: modifier, total, esito e dc', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const dice = useDiceStore();
    dice.enqueue([{ source: 'attack', tag: 'Attacco -> goblin', notation: '1d20@18', tokens: [], modifierTotal: 2, total: 20, dc: 12, margin: 8, outcome: 'success' }]);
    const w = mount(DicePanel, { global: { plugins: [pinia], stubs } });
    const text = w.text();
    expect(text).toContain('+2');
    expect(text).toContain('20');
    expect(text).toContain('success');
    expect(text).toContain('12');
    expect(text).toContain('Attacco -> goblin');
  });

  it('mostra i token numerici per i sides non-standard', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const dice = useDiceStore();
    dice.enqueue([{ source: 'effect', tag: 'hp +3', notation: null, tokens: [{ sides: 7, value: 5 }], modifierTotal: 0, total: 5 }]);
    const w = mount(DicePanel, { global: { plugins: [pinia], stubs } });
    expect(w.text()).toContain('d7');
    expect(w.text()).toContain('5');
  });
});
