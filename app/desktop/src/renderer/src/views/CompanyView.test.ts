import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import type { RulesetResult } from '@loomn/shared';
import CompanyView from './CompanyView.vue';

const RULESET: Extract<RulesetResult, { ok: true }> = {
  ok: true,
  vocabulary: {
    attributes: ['forza'],
    skills: ['atletica'],
    resources: ['hp'],
    defenses: ['difesa'],
    defaultResources: { hp: { current: 10, max: 10 } },
  },
  difficulties: ['moderate'],
  softPhases: ['exploration'],
  questOutcomes: ['completed'],
  directions: ['restore'],
  commandPhaseRules: { combatOnly: [], nonCombatOnly: [] },
};

describe('CompanyView', () => {
  let dispatch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    setActivePinia(createPinia());
    dispatch = vi.fn(() => Promise.resolve({ ok: true as const, version: 1, events: [] }));
    window.loomn = {
      getRuleset: () => Promise.resolve(RULESET),
      dispatch,
    } as unknown as typeof window.loomn;
  });

  it('apre il creatore e dispatcha AddActor col nome e id slug', async () => {
    const w = mount(CompanyView);
    await flushPromises();
    const btnAggiungi = w.findAll('button').find((b) => b.text().includes('Aggiungi'));
    expect(btnAggiungi).toBeDefined();
    await btnAggiungi!.trigger('click');
    await w.find('input[type="text"]').setValue('Kaelen');
    const btnCrea = w.findAll('button').find((b) => b.text() === 'Crea');
    expect(btnCrea).toBeDefined();
    await btnCrea!.trigger('click');
    await flushPromises();
    expect(dispatch).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const call = dispatch.mock.calls[0] as unknown[];
    const arg = call[0];
    expect(arg).toMatchObject({ type: 'AddActor' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = (arg as any).actor;
    expect(a.name).toBe('Kaelen');
    expect(a.id).toBe('kaelen');
    expect(a.progression).toEqual({ xp: 0, level: 1 });
  });
});
