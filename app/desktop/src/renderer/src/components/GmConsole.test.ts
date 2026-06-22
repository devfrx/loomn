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
  commandPhaseRules: { combatOnly: ['EndEncounter'], nonCombatOnly: ['EnterPhase', 'StartEncounter'] },
};

function actor(id: string, name: string) {
  return { id, name, kind: 'pc' as const, attributes: {}, skills: {}, resources: {}, conditions: [], items: [], progression: { xp: 0, level: 1 } };
}

function pushState(phase: ReadModelPush['state']['phase'], actors: ReadModelPush['state']['actors'] = {}): ReadModelPush {
  return { version: 1, state: { version: 1, actors, encounter: null, quests: {}, phase } };
}

describe('GmConsole', () => {
  let dispatch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    setActivePinia(createPinia());
    dispatch = vi.fn(() => Promise.resolve({ ok: true as const, version: 1, events: [] }));
    window.loomn = { getRuleset: () => Promise.resolve(RULESET), dispatch } as unknown as typeof window.loomn;
  });

  it('in exploration EnterPhase e StartEncounter sono abilitati', async () => {
    useReadModelStore().applyPush(pushState('exploration'));
    const w = mount(GmConsole);
    await flushPromises();
    await w.find('button').trigger('click');
    const fieldsets = w.findAll('.cmd');
    const enterPhase = fieldsets.find((f) => f.text().includes('Cambia fase'))!;
    const startEncounter = fieldsets.find((f) => f.text().includes('Avvia scontro'))!;
    expect(enterPhase.find('fieldset').attributes('disabled')).toBeUndefined();
    expect(startEncounter.find('fieldset').attributes('disabled')).toBeUndefined();
  });

  it('in combat EnterPhase e StartEncounter sono disabilitati', async () => {
    useReadModelStore().applyPush(pushState('combat'));
    const w = mount(GmConsole);
    await flushPromises();
    await w.find('button').trigger('click');
    const fieldsets = w.findAll('.cmd');
    const enterPhase = fieldsets.find((f) => f.text().includes('Cambia fase'))!;
    const startEncounter = fieldsets.find((f) => f.text().includes('Avvia scontro'))!;
    expect(enterPhase.find('fieldset').attributes('disabled')).toBeDefined();
    expect(startEncounter.find('fieldset').attributes('disabled')).toBeDefined();
  });

  it('Avvia scontro dispaccia StartEncounter coi soli partecipanti inclusi', async () => {
    useReadModelStore().applyPush(pushState('exploration', { a: actor('a', 'Alfa'), b: actor('b', 'Beta') }));
    const w = mount(GmConsole);
    await flushPromises();
    await w.find('button').trigger('click');
    // include il primo attore (Alfa) lasciando Beta escluso
    await w.find('input[type="checkbox"]').setValue(true);
    const avvia = w.findAll('button').find((b) => b.text() === 'Avvia scontro')!;
    await avvia.trigger('click');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'StartEncounter',
      encounterId: 'scontro-1',
      participants: [{ actorId: 'a', zone: 'centro', initiative: 10 }],
    });
  });

  it('una push incrementale preserva le selezioni gia fatte', async () => {
    const store = useReadModelStore();
    store.applyPush(pushState('exploration', { a: actor('a', 'Alfa') }));
    const w = mount(GmConsole);
    await flushPromises();
    await w.find('button').trigger('click'); // apre la Regia
    await w.find('input[type="checkbox"]').setValue(true); // include Alfa
    // seconda push con lo stesso roster (un turno che non cambia gli attori)
    store.applyPush(pushState('exploration', { a: actor('a', 'Alfa') }));
    await flushPromises();
    expect((w.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true);
  });

  it('mostra l errore del vocabolario quando get-ruleset fallisce', async () => {
    window.loomn = { getRuleset: () => Promise.resolve({ ok: false, error: 'vocabolario non caricato' }), dispatch } as unknown as typeof window.loomn;
    useReadModelStore().applyPush(pushState('exploration'));
    const w = mount(GmConsole);
    await flushPromises();
    await w.find('button').trigger('click'); // apre la Regia
    expect(w.text()).toContain('vocabolario non caricato');
  });
});
