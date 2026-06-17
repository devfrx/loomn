import { describe, it, expect } from 'vitest';
import { commandSchema } from './domain-schema';

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
