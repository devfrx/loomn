import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import type { RulesetResult, ReadModelPush } from '@loomn/shared';
import EncounterPanel from './EncounterPanel.vue';
import { useReadModelStore } from '../stores/read-model';

const RULESET: Extract<RulesetResult, { ok: true }> = {
  ok: true,
  vocabulary: { attributes: ['forza'], skills: ['lame'], resources: ['hp'], defenses: ['difesa'], defaultResources: {} },
  difficulties: ['moderate'],
  softPhases: ['exploration'],
  questOutcomes: ['completed'],
  directions: ['restore', 'drain'],
  commandPhaseRules: { combatOnly: [], nonCombatOnly: [] },
};

// LoomnPanel/LoomnButton stub passthrough (gli attr come :disabled cadono sul root via fallthrough).
const stubs = {
  LoomnPanel: { template: '<div><slot /></div>' },
  LoomnButton: { template: '<button><slot /></button>' },
};

function combatPush(): ReadModelPush {
  return {
    version: 2,
    state: {
      version: 2,
      phase: 'combat',
      quests: {},
      actors: {
        a: { id: 'a', name: 'Alfa', kind: 'pc', attributes: {}, skills: {}, resources: { hp: { current: 8, max: 10 } }, conditions: [], items: [], progression: { xp: 0, level: 1 } },
        b: { id: 'b', name: 'Beta', kind: 'npc', attributes: {}, skills: {}, resources: { hp: { current: 4, max: 6 } }, conditions: [{ key: 'morente', source: 'combat', effects: [], duration: { kind: 'permanent' } }], items: [], progression: { xp: 0, level: 1 } },
      },
      encounter: {
        id: 'enc1', round: 2, turnIndex: 0,
        participants: [
          { actorId: 'a', zone: 'fronte', initiative: 18, actedThisRound: false },
          { actorId: 'b', zone: 'retro', initiative: 9, actedThisRound: true },
        ],
      },
    },
  };
}

describe('EncounterPanel', () => {
  let dispatch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    setActivePinia(createPinia());
    dispatch = vi.fn(() => Promise.resolve({ ok: true as const, version: 3, events: [] }));
    window.loomn = { getRuleset: () => Promise.resolve(RULESET), dispatch } as unknown as typeof window.loomn;
  });

  function mountPanel() {
    const pinia = createPinia();
    setActivePinia(pinia);
    useReadModelStore().applyPush(combatPush());
    return mount(EncounterPanel, { global: { plugins: [pinia], stubs } });
  }

  function clickByText(w: ReturnType<typeof mount>, text: string): Promise<void> {
    const btn = w.findAll('button').find((b) => b.text() === text);
    return btn!.trigger('click');
  }

  it('mostra round, turno corrente, ordine e stato a terra', async () => {
    const w = mountPanel();
    await flushPromises();
    expect(w.text()).toContain('round 2');
    expect(w.text()).toContain('Alfa');
    expect(w.text()).toContain('Beta');
    expect(w.text()).toContain('a terra');
  });

  it('raggruppa i partecipanti per zona', async () => {
    const w = mountPanel();
    await flushPromises();
    expect(w.text()).toContain('fronte');
    expect(w.text()).toContain('retro');
  });

  it('Fine turno dispaccia EndTurn', async () => {
    const w = mountPanel();
    await flushPromises();
    await clickByText(w, 'Fine turno');
    expect(dispatch).toHaveBeenCalledWith({ type: 'EndTurn' });
  });

  it('Round successivo dispaccia NextRound', async () => {
    const w = mountPanel();
    await flushPromises();
    await clickByText(w, 'Round successivo');
    expect(dispatch).toHaveBeenCalledWith({ type: 'NextRound' });
  });

  it('Termina scontro dispaccia EndEncounter', async () => {
    const w = mountPanel();
    await flushPromises();
    await clickByText(w, 'Termina scontro');
    expect(dispatch).toHaveBeenCalledWith({ type: 'EndEncounter' });
  });

  it('Attacca dispaccia Attack con l attaccante di turno', async () => {
    const w = mountPanel();
    await flushPromises();
    await w.find('select[aria-label="bersaglio"]').setValue('b');
    await w.find('select[aria-label="difesa"]').setValue('difesa');
    await w.find('select[aria-label="risorsa danno"]').setValue('hp');
    await clickByText(w, 'Attacca');
    expect(dispatch).toHaveBeenCalledWith({ type: 'Attack', attackerId: 'a', targetId: 'b', defense: 'difesa', defenseBase: 10, damageResource: 'hp' });
  });

  it('senza scontro mostra lo stato vuoto', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useReadModelStore().applyPush({ version: 1, state: { version: 1, phase: 'combat', quests: {}, actors: {}, encounter: null } });
    const w = mount(EncounterPanel, { global: { plugins: [pinia], stubs } });
    await flushPromises();
    expect(w.text()).toContain('Nessuno scontro attivo');
  });
});
