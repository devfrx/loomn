import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import type { RulesetResult, ReadModelPush, CanonResult } from '@loomn/shared';
import CompanyView from './CompanyView.vue';
import { useReadModelStore } from '../stores/read-model';

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

const CANON: CanonResult = {
  ok: true,
  facts: [{ id: 'f1', subject: 'Eroe', predicate: 'protegge', object: 'Villaggio', eventSeq: 1, salience: 0.7, status: 'active' }],
};

function rosterPush(): ReadModelPush {
  return {
    version: 1,
    state: {
      version: 1,
      phase: 'exploration',
      quests: {},
      encounter: null,
      actors: {
        eroe: { id: 'eroe', name: 'Eroe', kind: 'pc', attributes: {}, skills: {}, resources: { hp: { current: 7, max: 10 } }, conditions: [], items: [], progression: { xp: 0, level: 1 } },
        goblin: { id: 'goblin', name: 'Goblin', kind: 'npc', attributes: {}, skills: {}, resources: { hp: { current: 3, max: 6 } }, conditions: [], items: [], progression: { xp: 0, level: 1 } },
      },
    },
  };
}

describe('CompanyView', () => {
  let dispatch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    setActivePinia(createPinia());
    dispatch = vi.fn(() => Promise.resolve({ ok: true as const, version: 1, events: [] }));
    window.loomn = {
      getRuleset: () => Promise.resolve(RULESET),
      getSummaries: () => Promise.resolve({ ok: true, summaries: [] }),
      getCanon: () => Promise.resolve(CANON),
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

  it('elenca i PG e i PNG con le carte', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useReadModelStore().applyPush(rosterPush());
    const w = mount(CompanyView, { global: { plugins: [pinia] } });
    await flushPromises();
    expect(w.text()).toContain('Eroe');
    expect(w.text()).toContain('Goblin');
    expect(w.text()).toContain('liv. 1');
    expect(w.text()).toContain('hp 7/10');
  });

  it('mostra le relazioni canon per attore', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useReadModelStore().applyPush(rosterPush());
    const w = mount(CompanyView, { global: { plugins: [pinia] } });
    await flushPromises();
    expect(w.text()).toContain('Eroe protegge Villaggio');
  });

  it('mostra l errore del canale canon quando la lettura fallisce', async () => {
    window.loomn = {
      getRuleset: () => Promise.resolve(RULESET),
      getSummaries: () => Promise.resolve({ ok: true, summaries: [] }),
      getCanon: () => Promise.resolve({ ok: false, error: 'canon non leggibile' }),
      dispatch: vi.fn(),
    } as unknown as typeof window.loomn;
    const w = mount(CompanyView, { global: { plugins: [createPinia()] } });
    await flushPromises();
    expect(w.text()).toContain('canon non leggibile');
  });

  it('mostra l errore del vocabolario quando get-ruleset fallisce', async () => {
    window.loomn = {
      getRuleset: () => Promise.resolve({ ok: false, error: 'vocabolario non caricato' }),
      getSummaries: () => Promise.resolve({ ok: true, summaries: [] }),
      getCanon: () => Promise.resolve(CANON),
      dispatch: vi.fn(),
    } as unknown as typeof window.loomn;
    const w = mount(CompanyView, { global: { plugins: [createPinia()] } });
    await flushPromises();
    expect(w.text()).toContain('vocabolario non caricato');
  });
});
