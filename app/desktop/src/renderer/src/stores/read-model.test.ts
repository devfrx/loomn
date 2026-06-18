import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { ReadModelPush } from '@loomn/shared';
import { useReadModelStore } from './read-model';

function actor(id: string, name: string, kind: 'pc' | 'npc') {
  return {
    id,
    name,
    kind,
    attributes: {},
    skills: {},
    resources: {},
    conditions: [],
    items: [],
    progression: { xp: 0, level: 1 },
  };
}

function push(over: Partial<ReadModelPush['state']> = {}, version = 1): ReadModelPush {
  return {
    version,
    state: { version, actors: {}, encounter: null, quests: {}, phase: 'exploration', ...over },
  };
}

describe('useReadModelStore', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('parte vuoto con fase iniziale exploration', () => {
    const s = useReadModelStore();
    expect(s.loaded).toBe(false);
    expect(s.version).toBe(0);
    expect(s.phase).toBe('exploration');
    expect(s.actors).toEqual([]);
    expect(s.quests).toEqual([]);
    expect(s.encounter).toBeNull();
    expect(s.inCombat).toBe(false);
  });

  it('applyPush popola versione e stato', () => {
    const s = useReadModelStore();
    s.applyPush(push({ actors: { goblin: actor('goblin', 'Goblin', 'npc') } }, 3));
    expect(s.version).toBe(3);
    expect(s.loaded).toBe(true);
    expect(s.actors.map((a) => a.id)).toEqual(['goblin']);
  });

  it('proietta pcs e npcs separati', () => {
    const s = useReadModelStore();
    s.applyPush(push({ actors: { k: actor('k', 'Kaelen', 'pc'), g: actor('g', 'Goblin', 'npc') } }));
    expect(s.pcs.map((a) => a.id)).toEqual(['k']);
    expect(s.npcs.map((a) => a.id)).toEqual(['g']);
  });

  it('riflette la fase e inCombat', () => {
    const s = useReadModelStore();
    s.applyPush(push({ phase: 'combat' }));
    expect(s.phase).toBe('combat');
    expect(s.inCombat).toBe(true);
  });

  it('proietta un encounter non-null', () => {
    const s = useReadModelStore();
    s.applyPush(push({ encounter: { id: 'enc1', participants: [], round: 1, turnIndex: 0 } }));
    expect(s.encounter?.id).toBe('enc1');
  });

  it('proietta le quest come array', () => {
    const s = useReadModelStore();
    s.applyPush(push({ quests: { q1: { id: 'q1', title: 'La gemma', status: 'active' } } }));
    expect(s.quests.map((q) => q.id)).toEqual(['q1']);
  });

  it('l ultimo push sostituisce lo stato precedente', () => {
    const s = useReadModelStore();
    s.applyPush(push({ actors: { a: actor('a', 'A', 'pc') } }, 1));
    s.applyPush(push({ actors: {} }, 2));
    expect(s.version).toBe(2);
    expect(s.actors).toEqual([]);
  });
});
