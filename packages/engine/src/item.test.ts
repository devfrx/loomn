import { describe, it, expect } from 'vitest';
import type { Actor, Item } from './actor';
import { addItem, removeItem, setEquipped, equippedItems } from './item';

function baseActor(): Actor {
  return {
    id: 'a',
    name: 'A',
    kind: 'npc',
    attributes: {},
    skills: {},
    resources: {},
    conditions: [],
    items: [],
    progression: { xp: 0, level: 1 },
  };
}

const sword: Item = { id: 'sword', name: 'Spadone', equipped: false, effects: [] };
const shield: Item = { id: 'shield', name: 'Scudo', equipped: false, effects: [] };

describe('addItem', () => {
  it('aggiunge un oggetto restituendo un nuovo attore', () => {
    const original = baseActor();
    const out = addItem(original, sword);
    expect(out.items).toHaveLength(1);
    expect(original.items).toHaveLength(0);
  });
});

describe('removeItem', () => {
  it('rimuove un oggetto per id', () => {
    const out = removeItem(addItem(baseActor(), sword), 'sword');
    expect(out.items).toHaveLength(0);
  });
  it('è un no-op se id assente', () => {
    const out = removeItem(addItem(baseActor(), sword), 'inesistente');
    expect(out.items).toHaveLength(1);
  });
});

describe('setEquipped', () => {
  it('imposta equipped solo per id corrispondente', () => {
    let actor = addItem(addItem(baseActor(), sword), shield);
    actor = setEquipped(actor, 'sword', true);
    expect(actor.items.find((i) => i.id === 'sword')?.equipped).toBe(true);
    expect(actor.items.find((i) => i.id === 'shield')?.equipped).toBe(false);
  });
});

describe('equippedItems', () => {
  it('ritorna solo gli oggetti equipaggiati', () => {
    let actor = addItem(addItem(baseActor(), sword), shield);
    actor = setEquipped(actor, 'sword', true);
    expect(equippedItems(actor).map((i) => i.id)).toEqual(['sword']);
  });
});
