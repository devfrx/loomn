import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import type { RulesetResult, ReadModelPush } from '@loomn/shared';
import SheetPanel from './SheetPanel.vue';
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

// LoomnPanel stub passthrough (rende title/meta + slot).
const stubs = {
  LoomnPanel: { props: ['title', 'eyebrow', 'meta'], template: '<div>{{ title }} {{ meta }}<slot /></div>' },
};

function push(): ReadModelPush {
  return {
    version: 1,
    state: {
      version: 1,
      phase: 'exploration',
      quests: {},
      encounter: null,
      actors: {
        png: { id: 'png', name: 'Goblin', kind: 'npc', attributes: { forza: 1 }, skills: {}, resources: { hp: { current: 3, max: 6 } }, conditions: [], items: [], progression: { xp: 0, level: 1 } },
        eroe: {
          id: 'eroe', name: 'Eroe', kind: 'pc',
          attributes: { forza: 4 }, skills: { lame: 2 },
          resources: { hp: { current: 7, max: 10 } },
          conditions: [{ key: 'benedetto', source: 'rito', effects: [{ kind: 'checkModifier', value: 1 }], duration: { kind: 'turns', remaining: 2 } }],
          items: [{ id: 'spada', name: 'Spada', equipped: true, effects: [{ kind: 'defenseModifier', defense: 'difesa', value: 1 }] }],
          progression: { xp: 50, level: 2 },
        },
      },
    },
  };
}

describe('SheetPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.loomn = { getRuleset: () => Promise.resolve(RULESET) } as unknown as typeof window.loomn;
  });

  function mountPanel() {
    const pinia = createPinia();
    setActivePinia(pinia);
    useReadModelStore().applyPush(push());
    return mount(SheetPanel, { global: { plugins: [pinia], stubs } });
  }

  it('di default mostra il primo PG', async () => {
    const w = mountPanel();
    await flushPromises();
    expect(w.text()).toContain('Eroe');
    expect(w.text()).toContain('liv. 2');
  });

  it('mostra attributi e abilita con i valori', async () => {
    const w = mountPanel();
    await flushPromises();
    expect(w.text()).toContain('forza');
    expect(w.text()).toContain('4');
    expect(w.text()).toContain('lame');
  });

  it('mostra le barre risorse con current/max', async () => {
    const w = mountPanel();
    await flushPromises();
    expect(w.text()).toContain('hp');
    expect(w.text()).toContain('7/10');
  });

  it('mostra le condizioni con la durata', async () => {
    const w = mountPanel();
    await flushPromises();
    expect(w.text()).toContain('benedetto');
    expect(w.text()).toContain('2 turni');
  });

  it('elenca gli oggetti col flag equipaggiato e gli effetti', async () => {
    const w = mountPanel();
    await flushPromises();
    expect(w.text()).toContain('Spada');
    expect(w.text().toLowerCase()).toContain('equipaggiato');
    expect(w.text()).toContain('difesa +1');
  });

  it('cambiando selezione mostra un altro attore', async () => {
    const w = mountPanel();
    await flushPromises();
    expect(w.text()).toContain('7/10'); // Eroe selezionato di default (hp 7/10)
    await w.find('select[aria-label="attore"]').setValue('png');
    expect(w.text()).toContain('3/6'); // ora Goblin (hp 3/6)
    expect(w.text()).not.toContain('7/10'); // la scheda di Eroe non e piu mostrata
  });

  it('senza attori mostra lo stato vuoto', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useReadModelStore().applyPush({ version: 1, state: { version: 1, phase: 'exploration', quests: {}, actors: {}, encounter: null } });
    const w = mount(SheetPanel, { global: { plugins: [pinia], stubs } });
    await flushPromises();
    expect(w.text()).toContain('Nessun personaggio');
  });

  it('con un solo attore nasconde il selettore e mostra comunque la scheda', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useReadModelStore().applyPush({
      version: 1,
      state: {
        version: 1, phase: 'exploration', quests: {}, encounter: null,
        actors: { solo: { id: 'solo', name: 'Solitario', kind: 'pc', attributes: {}, skills: {}, resources: {}, conditions: [], items: [], progression: { xp: 0, level: 1 } } },
      },
    });
    const w = mount(SheetPanel, { global: { plugins: [pinia], stubs } });
    await flushPromises();
    expect(w.find('select[aria-label="attore"]').exists()).toBe(false);
    expect(w.text()).toContain('Solitario');
  });
});
