import { describe, it, expect } from 'vitest';
import { commandSchema, DIFFICULTIES, SOFT_PHASES, QUEST_OUTCOMES, RESOURCE_DIRECTIONS } from './domain-schema';

function sampleActor(id: string): unknown {
  return {
    id,
    name: id,
    kind: 'npc',
    attributes: {},
    skills: {},
    resources: { hp: { current: 10, max: 10 } },
    conditions: [],
    items: [],
    progression: { xp: 0, level: 1 },
  };
}

describe('commandSchema', () => {
  it('valida AddActor con un attore completo', () => {
    const parsed = commandSchema.parse({ type: 'AddActor', actor: sampleActor('goblin') });
    expect(parsed.type).toBe('AddActor');
  });

  it('valida StartEncounter con participant input senza actedThisRound', () => {
    const parsed = commandSchema.parse({
      type: 'StartEncounter',
      encounterId: 'enc1',
      participants: [{ actorId: 'goblin', zone: 'A', initiative: 12 }],
    });
    expect(parsed).toEqual({
      type: 'StartEncounter',
      encounterId: 'enc1',
      participants: [{ actorId: 'goblin', zone: 'A', initiative: 12 }],
    });
  });

  it('valida EndTurn e NextRound', () => {
    expect(commandSchema.parse({ type: 'EndTurn' })).toEqual({ type: 'EndTurn' });
    expect(commandSchema.parse({ type: 'NextRound' })).toEqual({ type: 'NextRound' });
  });

  it('valida Attack minimale e OMETTE i campi opzionali assenti (cast-free)', () => {
    const parsed = commandSchema.parse({
      type: 'Attack',
      attackerId: 'a',
      targetId: 'b',
      defense: 'difesa',
      defenseBase: 10,
      damageResource: 'hp',
    });
    expect(parsed).toEqual({
      type: 'Attack',
      attackerId: 'a',
      targetId: 'b',
      defense: 'difesa',
      defenseBase: 10,
      damageResource: 'hp',
    });
    expect('attribute' in parsed).toBe(false);
    expect('skill' in parsed).toBe(false);
    expect('damageModifiers' in parsed).toBe(false);
  });

  it('valida Attack completo con modificatori di danno', () => {
    const parsed = commandSchema.parse({
      type: 'Attack',
      attackerId: 'a',
      targetId: 'b',
      attribute: 'forza',
      skill: 'spade',
      defense: 'difesa',
      defenseBase: 10,
      damageResource: 'hp',
      damageModifiers: [{ value: 2, source: 'forza' }],
    });
    expect(parsed).toEqual({
      type: 'Attack',
      attackerId: 'a',
      targetId: 'b',
      attribute: 'forza',
      skill: 'spade',
      defense: 'difesa',
      defenseBase: 10,
      damageResource: 'hp',
      damageModifiers: [{ value: 2, source: 'forza' }],
    });
  });

  it('rifiuta un tipo sconosciuto', () => {
    expect(() => commandSchema.parse({ type: 'Teleport' })).toThrow();
  });

  it('rifiuta AddActor senza attore', () => {
    expect(() => commandSchema.parse({ type: 'AddActor' })).toThrow();
  });

  it('rifiuta Attack senza i campi richiesti', () => {
    expect(() => commandSchema.parse({ type: 'Attack', attackerId: 'a' })).toThrow();
  });

  it('rifiuta StartEncounter senza encounterId', () => {
    expect(() =>
      commandSchema.parse({ type: 'StartEncounter', participants: [{ actorId: 'x', zone: 'A', initiative: 1 }] }),
    ).toThrow();
  });

  it('valida RequestCheck minimale e OMETTE attribute e skill assenti', () => {
    const parsed = commandSchema.parse({ type: 'RequestCheck', actorId: 'a', difficulty: 'moderate' });
    expect(parsed).toEqual({ type: 'RequestCheck', actorId: 'a', difficulty: 'moderate' });
    expect('attribute' in parsed).toBe(false);
    expect('skill' in parsed).toBe(false);
  });

  it('valida RequestCheck completo con attribute e skill', () => {
    const parsed = commandSchema.parse({
      type: 'RequestCheck',
      actorId: 'a',
      attribute: 'destrezza',
      skill: 'furtivita',
      difficulty: 'hard',
    });
    expect(parsed).toEqual({
      type: 'RequestCheck',
      actorId: 'a',
      attribute: 'destrezza',
      skill: 'furtivita',
      difficulty: 'hard',
    });
  });

  it('rifiuta RequestCheck con difficulty fuori vocabolario', () => {
    expect(() => commandSchema.parse({ type: 'RequestCheck', actorId: 'a', difficulty: 'impossibile' })).toThrow();
  });

  it('valida ApplyEffect e OMETTE bonus assente', () => {
    const parsed = commandSchema.parse({
      type: 'ApplyEffect',
      targetId: 'b',
      resource: 'hp',
      direction: 'restore',
      dice: [{ count: 1, sides: 6 }],
    });
    expect(parsed).toEqual({
      type: 'ApplyEffect',
      targetId: 'b',
      resource: 'hp',
      direction: 'restore',
      dice: [{ count: 1, sides: 6 }],
    });
    expect('bonus' in parsed).toBe(false);
  });

  it('valida ApplyEffect con bonus e direction drain', () => {
    const parsed = commandSchema.parse({
      type: 'ApplyEffect',
      targetId: 'b',
      resource: 'mana',
      direction: 'drain',
      dice: [{ count: 2, sides: 8, tag: 'fuoco' }],
      bonus: 3,
    });
    expect(parsed).toEqual({
      type: 'ApplyEffect',
      targetId: 'b',
      resource: 'mana',
      direction: 'drain',
      dice: [{ count: 2, sides: 8, tag: 'fuoco' }],
      bonus: 3,
    });
  });

  it('rifiuta ApplyEffect con direction sconosciuta', () => {
    expect(() =>
      commandSchema.parse({ type: 'ApplyEffect', targetId: 'b', resource: 'hp', direction: 'boost', dice: [{ count: 1, sides: 6 }] }),
    ).toThrow();
  });

  it('valida StartQuest e OMETTE description assente', () => {
    const parsed = commandSchema.parse({ type: 'StartQuest', id: 'q1', title: 'La gemma perduta' });
    expect(parsed).toEqual({ type: 'StartQuest', id: 'q1', title: 'La gemma perduta' });
    expect('description' in parsed).toBe(false);
  });

  it('rifiuta StartQuest senza title', () => {
    expect(() => commandSchema.parse({ type: 'StartQuest', id: 'q1' })).toThrow();
  });

  it('valida AdvanceQuest con status terminale', () => {
    expect(commandSchema.parse({ type: 'AdvanceQuest', questId: 'q1', status: 'completed' })).toEqual({
      type: 'AdvanceQuest',
      questId: 'q1',
      status: 'completed',
    });
  });

  it('rifiuta AdvanceQuest con status non terminale', () => {
    expect(() => commandSchema.parse({ type: 'AdvanceQuest', questId: 'q1', status: 'active' })).toThrow();
  });

  it('valida EnterPhase verso una fase soft', () => {
    expect(commandSchema.parse({ type: 'EnterPhase', to: 'dialogue' })).toEqual({ type: 'EnterPhase', to: 'dialogue' });
  });

  it('rifiuta EnterPhase verso combat (non e una fase soft)', () => {
    expect(() => commandSchema.parse({ type: 'EnterPhase', to: 'combat' })).toThrow();
  });

  it('valida EndEncounter', () => {
    expect(commandSchema.parse({ type: 'EndEncounter' })).toEqual({ type: 'EndEncounter' });
  });
});

describe('finiteNumber — commandSchema rifiuta i numeri non-finiti', () => {
  it('rifiuta defenseBase non-finito (Infinity)', () => {
    expect(commandSchema.safeParse({
      type: 'Attack', attackerId: 'a', targetId: 'b',
      defense: 'difesa', defenseBase: Infinity, damageResource: 'hp',
    }).success).toBe(false);
  });
  it('rifiuta initiative non-finito in StartEncounter', () => {
    expect(commandSchema.safeParse({
      type: 'StartEncounter', encounterId: 'e',
      participants: [{ actorId: 'a', zone: 'z', initiative: Infinity }],
    }).success).toBe(false);
  });
  it('accetta un defenseBase finito normale', () => {
    expect(commandSchema.safeParse({
      type: 'Attack', attackerId: 'a', targetId: 'b',
      defense: 'difesa', defenseBase: 12, damageResource: 'hp',
    }).success).toBe(true);
  });
});

describe('commandSchema — StartEncounter richiede partecipanti', () => {
  it('rifiuta participants vuoto', () => {
    expect(commandSchema.safeParse({ type: 'StartEncounter', encounterId: 'e', participants: [] }).success).toBe(false);
  });
});

describe('dieGroupCommandSchema — vincoli su count/sides (difesa al confine ApplyEffect)', () => {
  it('ApplyEffect rifiuta dadi con count frazionario o sides < 2', () => {
    expect(commandSchema.safeParse({ type: 'ApplyEffect', targetId: 't', resource: 'hp', direction: 'restore', dice: [{ count: 1.5, sides: 6 }] }).success).toBe(false);
    expect(commandSchema.safeParse({ type: 'ApplyEffect', targetId: 't', resource: 'hp', direction: 'restore', dice: [{ count: 1, sides: 1 }] }).success).toBe(false);
  });
  it('ApplyEffect accetta dadi validi', () => {
    expect(commandSchema.safeParse({ type: 'ApplyEffect', targetId: 't', resource: 'hp', direction: 'restore', dice: [{ count: 2, sides: 6 }] }).success).toBe(true);
  });
});

describe('commandSchema — i dadi degli item NON sono ristretti dallo schema (arbitro = motore)', () => {
  it('AddActor accetta un item con dadi fuori-bound (sides 1, count 200)', () => {
    const actor = {
      id: 'prova',
      name: 'Prova',
      kind: 'pc',
      attributes: {},
      skills: {},
      resources: { hp: { current: 10, max: 10 } },
      conditions: [],
      items: [
        { id: 'dado-token', name: 'Dado token', equipped: false, effects: [{ kind: 'contributeDice', dice: [{ count: 200, sides: 1 }], mode: 'effect' }] },
      ],
      progression: { xp: 0, level: 1 },
    };
    expect(commandSchema.safeParse({ type: 'AddActor', actor }).success).toBe(true);
  });
});

describe('enum statici di comando esportati (per i form GM)', () => {
  it('DIFFICULTIES elenca le sei band di difficolta', () => {
    expect([...DIFFICULTIES]).toEqual(['trivial', 'easy', 'moderate', 'hard', 'formidable', 'legendary']);
  });

  it('SOFT_PHASES elenca le fasi proponibili con EnterPhase', () => {
    expect([...SOFT_PHASES]).toEqual(['exploration', 'dialogue', 'downtime']);
  });

  it('QUEST_OUTCOMES elenca gli esiti terminali di quest', () => {
    expect([...QUEST_OUTCOMES]).toEqual(['completed', 'failed']);
  });

  it('RESOURCE_DIRECTIONS elenca le direzioni di effetto', () => {
    expect([...RESOURCE_DIRECTIONS]).toEqual(['restore', 'drain']);
  });
});
