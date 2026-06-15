import { describe, it, expect } from 'vitest';
import type { Actor, Item } from './actor';
import {
  addItem,
  removeItem,
  setEquipped,
  equippedItems,
  collectItemDice,
  collectItemCheckModifier,
  defenseValue,
} from './item';

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

const magicBlade: Item = {
  id: 'magicBlade',
  name: 'Lama magica',
  equipped: true,
  effects: [
    { kind: 'contributeDice', dice: [{ count: 1, sides: 6 }], mode: 'check' },
    { kind: 'contributeDice', dice: [{ count: 2, sides: 6 }], mode: 'effect' },
    { kind: 'checkModifier', value: 1 },
  ],
};

const plate: Item = {
  id: 'plate',
  name: 'Armatura',
  equipped: true,
  effects: [{ kind: 'defenseModifier', defense: 'difesa', value: 3 }],
};

const stowedRing: Item = {
  id: 'ring',
  name: 'Anello',
  equipped: false,
  effects: [{ kind: 'defenseModifier', defense: 'difesa', value: 5 }],
};

describe('collectItemDice', () => {
  it('raccoglie i dadi contributeDice del modo indicato', () => {
    expect(collectItemDice([magicBlade], 'check')).toEqual([{ count: 1, sides: 6 }]);
    expect(collectItemDice([magicBlade], 'effect')).toEqual([{ count: 2, sides: 6 }]);
  });
});

describe('collectItemCheckModifier', () => {
  it('somma i checkModifier globali e quelli sul target', () => {
    expect(collectItemCheckModifier([magicBlade])).toBe(1);
  });

  it('include il modificatore solo se appliesTo coincide con il target', () => {
    const item: Item = {
      id: 'x',
      name: 'X',
      equipped: true,
      effects: [{ kind: 'checkModifier', value: 5, appliesTo: 'forza' }],
    };
    expect(collectItemCheckModifier([item], 'forza')).toBe(5);
    expect(collectItemCheckModifier([item], 'mente')).toBe(0);
    expect(collectItemCheckModifier([item])).toBe(0);
  });
});

describe('defenseValue', () => {
  it('somma i defenseModifier degli oggetti equipaggiati alla base', () => {
    const actor: Actor = { ...baseActor(), items: [plate, stowedRing] };
    // base 10 + 3 (plate equipaggiata); anello non equipaggiato escluso
    expect(defenseValue(actor, 'difesa', 10)).toBe(13);
  });
});
