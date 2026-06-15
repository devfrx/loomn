import { describe, it, expect } from 'vitest';
import { domainEventSchema, gameStateSchema } from './index';

const fullActor = {
  id: 'eroe',
  name: 'Eroe',
  kind: 'pc',
  attributes: { forza: 3 },
  skills: { atletica: 1 },
  resources: { hp: { current: 10, max: 10 } },
  conditions: [
    { key: 'ispirato', source: 'bardo', effects: [{ kind: 'checkModifier', value: 1 }], duration: { kind: 'turns', remaining: 2 } },
  ],
  items: [
    { id: 'sword', name: 'Spadone', equipped: true, effects: [{ kind: 'contributeDice', dice: [{ count: 2, sides: 6 }], mode: 'effect' }] },
  ],
  progression: { xp: 0, level: 1 },
};

describe('domainEventSchema', () => {
  it('valida ActorAdded e fa round-trip di un attore senza campi opzionali', () => {
    const ev = { type: 'ActorAdded', actor: fullActor };
    expect(domainEventSchema.parse(ev)).toEqual(ev);
  });

  it('preserva i campi opzionali presenti (tag, appliesTo)', () => {
    const ev = {
      type: 'ActorAdded',
      actor: {
        ...fullActor,
        conditions: [
          { key: 'maledetto', source: 'strega', effects: [{ kind: 'checkModifier', value: -1, appliesTo: 'forza' }], duration: { kind: 'permanent' } },
        ],
        items: [
          { id: 'ascia', name: 'Ascia', equipped: true, effects: [{ kind: 'contributeDice', dice: [{ count: 1, sides: 8, tag: 'arma' }], mode: 'effect' }] },
        ],
      },
    };
    expect(domainEventSchema.parse(ev)).toEqual(ev);
  });

  it('valida AttackResolved con CheckResult e DieResult con tag', () => {
    const ev = {
      type: 'AttackResolved',
      attackerId: 'eroe',
      targetId: 'goblin',
      check: { dice: [{ sides: 20, value: 15, tag: 'd20' }], modifierTotal: 3, total: 18, mode: 'check', dc: 10, margin: 8, outcome: 'success' },
      hit: true,
    };
    expect(domainEventSchema.parse(ev)).toEqual(ev);
  });

  it('valida gli eventi semplici DamageApplied, ActorDowned, TurnEnded', () => {
    expect(domainEventSchema.parse({ type: 'DamageApplied', targetId: 'goblin', resource: 'hp', amount: 4 })).toEqual({ type: 'DamageApplied', targetId: 'goblin', resource: 'hp', amount: 4 });
    expect(domainEventSchema.parse({ type: 'ActorDowned', actorId: 'goblin' })).toEqual({ type: 'ActorDowned', actorId: 'goblin' });
    expect(domainEventSchema.parse({ type: 'TurnEnded' })).toEqual({ type: 'TurnEnded' });
  });

  it('rifiuta un discriminante di tipo sconosciuto', () => {
    expect(() => domainEventSchema.parse({ type: 'Boom' })).toThrow();
  });

  it('rifiuta un evento con un campo obbligatorio mancante', () => {
    expect(() => domainEventSchema.parse({ type: 'DamageApplied', targetId: 'goblin', resource: 'hp' })).toThrow();
  });
});

describe('gameStateSchema', () => {
  it('fa round-trip di uno stato con encounter null e non null', () => {
    const s1 = { version: 2, actors: { eroe: fullActor }, encounter: null };
    expect(gameStateSchema.parse(s1)).toEqual(s1);
    const s2 = {
      version: 3,
      actors: { eroe: fullActor },
      encounter: { id: 'e', participants: [{ actorId: 'eroe', zone: 'a', initiative: 10, actedThisRound: false }], round: 1, turnIndex: 0 },
    };
    expect(gameStateSchema.parse(s2)).toEqual(s2);
  });
});
