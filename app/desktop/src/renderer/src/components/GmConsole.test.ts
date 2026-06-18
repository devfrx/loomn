import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import type { RulesetResult, ReadModelPush } from '@loomn/shared';
import GmConsole from './GmConsole.vue';
import { useReadModelStore } from '../stores/read-model';

const RULESET: Extract<RulesetResult, { ok: true }> = {
  ok: true,
  vocabulary: { attributes: ['forza'], skills: ['atletica'], resources: ['hp'], defenses: ['difesa'], defaultResources: {} },
  difficulties: ['moderate'],
  softPhases: ['exploration', 'dialogue', 'downtime'],
  questOutcomes: ['completed', 'failed'],
  directions: ['restore', 'drain'],
  commandPhaseRules: { combatOnly: ['EndEncounter'], nonCombatOnly: ['EnterPhase'] },
};

function pushState(phase: ReadModelPush['state']['phase']): ReadModelPush {
  return { version: 1, state: { version: 1, actors: {}, encounter: null, quests: {}, phase } };
}

describe('GmConsole', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.loomn = { getRuleset: () => Promise.resolve(RULESET), dispatch: vi.fn(() => Promise.resolve({ ok: true as const, version: 1, events: [] })) } as unknown as typeof window.loomn;
  });

  it('in exploration EnterPhase e abilitato e EndEncounter disabilitato', async () => {
    useReadModelStore().applyPush(pushState('exploration'));
    const w = mount(GmConsole);
    await flushPromises();
    await w.find('button').trigger('click');
    const fieldsets = w.findAll('.cmd');
    const enterPhase = fieldsets.find((f) => f.text().includes('Cambia fase'))!;
    const endEncounter = fieldsets.find((f) => f.text().includes('Termina scontro'))!;
    expect(enterPhase.find('fieldset').attributes('disabled')).toBeUndefined();
    expect(endEncounter.find('fieldset').attributes('disabled')).toBeDefined();
  });

  it('in combat EndEncounter e abilitato e EnterPhase disabilitato', async () => {
    useReadModelStore().applyPush(pushState('combat'));
    const w = mount(GmConsole);
    await flushPromises();
    await w.find('button').trigger('click');
    const fieldsets = w.findAll('.cmd');
    const enterPhase = fieldsets.find((f) => f.text().includes('Cambia fase'))!;
    const endEncounter = fieldsets.find((f) => f.text().includes('Termina scontro'))!;
    expect(endEncounter.find('fieldset').attributes('disabled')).toBeUndefined();
    expect(enterPhase.find('fieldset').attributes('disabled')).toBeDefined();
  });
});
