import { describe, it, expect } from 'vitest';
import type { RandomSource } from './random';
import type { Actor, Item } from './actor';
import { performAttack } from './combat';

function stubRandom(values: number[]): RandomSource {
  let i = 0;
  return { next: () => values[i++ % values.length]! };
}

const weapon: Item = {
  id: 'sword',
  name: 'Spadone',
  equipped: true,
  effects: [{ kind: 'contributeDice', dice: [{ count: 2, sides: 6 }], mode: 'effect' }],
};

const armor: Item = {
  id: 'plate',
  name: 'Armatura',
  equipped: true,
  effects: [{ kind: 'defenseModifier', defense: 'difesa', value: 5 }],
};

function attacker(): Actor {
  return {
    id: 'eroe',
    name: 'Eroe',
    kind: 'pc',
    attributes: { forza: 3 },
    skills: {},
    resources: { hp: { current: 10, max: 10 } },
    conditions: [],
    items: [weapon],
    progression: { xp: 0, level: 1 },
  };
}

function target(extraItems: Item[] = []): Actor {
  return {
    id: 'goblin',
    name: 'Goblin',
    kind: 'npc',
    attributes: {},
    skills: {},
    resources: { hp: { current: 10, max: 10 } },
    conditions: [],
    items: extraItems,
    progression: { xp: 0, level: 1 },
  };
}

describe('performAttack', () => {
  it('colpo riuscito: applica il danno e segna downed a 0 HP', () => {
    // rng: d20=0.95 -> faccia 20 ; danno 2d6 con 0.5,0.5 -> 4+4=8 ; +2 (forza) = 10
    const rng = stubRandom([0.95, 0.5, 0.5]);
    const res = performAttack(
      {
        attacker: attacker(),
        target: target(),
        attribute: 'forza',
        defense: 'difesa',
        defenseBase: 10,
        damageResource: 'hp',
        damageModifiers: [{ value: 2, source: 'forza' }],
      },
      rng,
    );
    expect(res.hit).toBe(true);
    expect(res.check.outcome).toBe('critical'); // 20 + 3 = 23 vs CD 10 -> margine 13
    expect(res.damage).toBe(10);
    expect(res.target.resources['hp']!.current).toBe(0);
    expect(res.downed).toBe(true);
    // La condizione 'morente' e materializzata da applyEvent(ActorDowned), non da performAttack
    // (single-source in condition.ts/events.ts; coperto da events.test.ts "ActorDowned aggiunge morente").
    expect(res.target.conditions.some((c) => c.key === 'morente')).toBe(false);
  });

  it('colpo mancato: nessun danno e bersaglio invariato', () => {
    const rng = stubRandom([0]); // d20 -> faccia 1 ; 1 + 3 = 4 vs CD 10 -> fallimento
    const res = performAttack(
      {
        attacker: attacker(),
        target: target(),
        attribute: 'forza',
        defense: 'difesa',
        defenseBase: 10,
        damageResource: 'hp',
      },
      rng,
    );
    expect(res.hit).toBe(false);
    expect(res.damage).toBe(0);
    expect(res.target.resources['hp']!.current).toBe(10);
    expect(res.downed).toBe(false);
  });

  it('la difesa del bersaglio alza la CD e fa mancare il colpo', () => {
    // d20=0.3 -> faccia 7 ; 7 + 3 = 10. Senza armatura CD 10 (colpo). Con armatura CD 15 -> manca.
    const rng = stubRandom([0.3]);
    const res = performAttack(
      {
        attacker: attacker(),
        target: target([armor]),
        attribute: 'forza',
        defense: 'difesa',
        defenseBase: 10,
        damageResource: 'hp',
      },
      rng,
    );
    expect(res.hit).toBe(false);
    expect(res.target.resources['hp']!.current).toBe(10);
  });

  it('successo con costo conta come colpo', () => {
    // d20=0.3 -> faccia 7 ; 7 + 3 = 10 vs CD 10 -> margine 0 -> success_at_cost (colpo)
    const rng = stubRandom([0.3, 0.5, 0.5]); // poi danno 2d6 = 4+4 = 8
    const res = performAttack(
      {
        attacker: attacker(),
        target: target(),
        attribute: 'forza',
        defense: 'difesa',
        defenseBase: 10,
        damageResource: 'hp',
      },
      rng,
    );
    expect(res.check.outcome).toBe('success_at_cost');
    expect(res.hit).toBe(true);
    expect(res.damage).toBe(8);
    expect(res.target.resources['hp']!.current).toBe(2);
    expect(res.downed).toBe(false);
  });
});
