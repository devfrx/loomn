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

  it('valida NarrationRecorded e ne fa round-trip', () => {
    const ev = {
      type: 'NarrationRecorded',
      playerAction: 'Attacco Krix.',
      narration: 'La lama manca il bersaglio di un soffio.',
    };
    expect(domainEventSchema.parse(ev)).toEqual(ev);
  });

  it('valida gli eventi semplici DamageApplied, ActorDowned, RoundAdvanced, TurnEnded', () => {
    expect(domainEventSchema.parse({ type: 'DamageApplied', targetId: 'goblin', resource: 'hp', amount: 4 })).toEqual({ type: 'DamageApplied', targetId: 'goblin', resource: 'hp', amount: 4 });
    expect(domainEventSchema.parse({ type: 'ActorDowned', actorId: 'goblin' })).toEqual({ type: 'ActorDowned', actorId: 'goblin' });
    expect(domainEventSchema.parse({ type: 'RoundAdvanced' })).toEqual({ type: 'RoundAdvanced' });
    expect(domainEventSchema.parse({ type: 'TurnEnded' })).toEqual({ type: 'TurnEnded' });
  });

  it('rifiuta un discriminante di tipo sconosciuto', () => {
    expect(() => domainEventSchema.parse({ type: 'Boom' })).toThrow();
  });

  it('rifiuta un evento con un campo obbligatorio mancante', () => {
    expect(() => domainEventSchema.parse({ type: 'DamageApplied', targetId: 'goblin', resource: 'hp' })).toThrow();
  });

  it('valida e fa round-trip di CheckResolved con enum difficolta e CheckResult annidato', () => {
    const event = {
      type: 'CheckResolved' as const,
      actorId: 'pc-eldra',
      attribute: 'forza',
      difficulty: 'hard' as const,
      result: {
        dice: [{ sides: 20, value: 14 }],
        modifierTotal: 3,
        total: 17,
        mode: 'check' as const,
        dc: 20,
        margin: -3,
        outcome: 'failure' as const,
      },
    };
    expect(domainEventSchema.parse(event)).toEqual(event);
  });

  it('omette attribute e skill assenti in CheckResolved (cast-free)', () => {
    const event = {
      type: 'CheckResolved' as const,
      actorId: 'pc-eldra',
      difficulty: 'easy' as const,
      result: { dice: [{ sides: 20, value: 8 }], modifierTotal: 0, total: 8, mode: 'check' as const, dc: 10, margin: -2, outcome: 'failure' as const },
    };
    const parsed = domainEventSchema.parse(event);
    expect('attribute' in parsed).toBe(false);
    expect('skill' in parsed).toBe(false);
  });

  it('rifiuta una difficolta fuori band in CheckResolved', () => {
    expect(() =>
      domainEventSchema.parse({
        type: 'CheckResolved',
        actorId: 'pc-eldra',
        difficulty: 'impossibile',
        result: { dice: [], modifierTotal: 0, total: 0, mode: 'check', dc: 10, margin: -10, outcome: 'disaster' },
      }),
    ).toThrow();
  });

  it('valida e fa round-trip di ResourceEffectApplied con roll annidato', () => {
    const event = {
      type: 'ResourceEffectApplied' as const,
      targetId: 'pc-eldra',
      resource: 'hp',
      delta: 7,
      roll: {
        dice: [{ sides: 6, value: 4 }, { sides: 6, value: 2 }],
        modifierTotal: 1,
        total: 7,
        mode: 'effect' as const,
      },
    };
    expect(domainEventSchema.parse(event)).toEqual(event);
  });

  it('rifiuta ResourceEffectApplied con un campo obbligatorio mancante (delta)', () => {
    expect(() =>
      domainEventSchema.parse({
        type: 'ResourceEffectApplied',
        targetId: 'pc-eldra',
        resource: 'hp',
        roll: { dice: [{ sides: 6, value: 4 }], modifierTotal: 0, total: 4, mode: 'effect' },
      }),
    ).toThrow();
  });

  it('fa round-trip di QuestStarted con description', () => {
    const event = {
      type: 'QuestStarted' as const,
      quest: { id: 'q1', title: 'Trova l amuleto', description: 'Recuperalo per il Barone', status: 'active' as const },
    };
    expect(domainEventSchema.parse(event)).toEqual(event);
  });

  it('fa round-trip di QuestStarted senza description (omessa, non undefined)', () => {
    const event = {
      type: 'QuestStarted' as const,
      quest: { id: 'q1', title: 'Trova l amuleto', status: 'active' as const },
    };
    const parsed = domainEventSchema.parse(event);
    expect(parsed).toEqual(event);
    if (parsed.type !== 'QuestStarted') throw new Error('atteso QuestStarted');
    expect('description' in parsed.quest).toBe(false);
  });

  it('fa round-trip di QuestAdvanced', () => {
    const event = { type: 'QuestAdvanced' as const, questId: 'q1', status: 'completed' as const };
    expect(domainEventSchema.parse(event)).toEqual(event);
  });

  it('rifiuta QuestAdvanced con status non terminale', () => {
    expect(() =>
      domainEventSchema.parse({ type: 'QuestAdvanced', questId: 'q1', status: 'active' }),
    ).toThrow();
  });
});

describe('gameStateSchema', () => {
  it('fa round-trip di uno stato con encounter null e non null', () => {
    const s1 = { version: 2, actors: { eroe: fullActor }, encounter: null, quests: {} };
    expect(gameStateSchema.parse(s1)).toEqual(s1);
    const s2 = {
      version: 3,
      actors: { eroe: fullActor },
      encounter: { id: 'e', participants: [{ actorId: 'eroe', zone: 'a', initiative: 10, actedThisRound: false }], round: 1, turnIndex: 0 },
      quests: {},
    };
    expect(gameStateSchema.parse(s2)).toEqual(s2);
  });

  it('fa round-trip di uno stato con quests non vuoto', () => {
    const s = {
      version: 4,
      actors: { eroe: fullActor },
      encounter: null,
      quests: { q1: { id: 'q1', title: 'Trova l amuleto', status: 'active' as const } },
    };
    expect(gameStateSchema.parse(s)).toEqual(s);
  });
});
