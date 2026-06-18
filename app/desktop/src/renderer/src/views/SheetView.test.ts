import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import type { RulesetResult, ReadModelPush } from '@loomn/shared';
import SheetView from './SheetView.vue';
import { useReadModelStore } from '../stores/read-model';

const RULESET: Extract<RulesetResult, { ok: true }> = {
  ok: true,
  vocabulary: { attributes: ['forza'], skills: [], resources: ['hp'], defenses: [], defaultResources: {} },
  difficulties: [], softPhases: [], questOutcomes: [], directions: [], commandPhaseRules: { combatOnly: [], nonCombatOnly: [] },
};

function push(): ReadModelPush {
  return {
    version: 1,
    state: {
      version: 1, phase: 'exploration', quests: {}, encounter: null,
      actors: { eroe: { id: 'eroe', name: 'Eroe', kind: 'pc', attributes: { forza: 3 }, skills: {}, resources: { hp: { current: 5, max: 5 } }, conditions: [], items: [], progression: { xp: 0, level: 1 } } },
    },
  };
}

describe('SheetView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.loomn = { getRuleset: () => Promise.resolve(RULESET) } as unknown as typeof window.loomn;
  });

  it('monta la Scheda nella route con l attore dal read-model', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useReadModelStore().applyPush(push());
    const w = mount(SheetView, { global: { plugins: [pinia] } });
    await flushPromises();
    expect(w.find('.route-view').exists()).toBe(true);
    expect(w.text()).toContain('Eroe');
  });
});
