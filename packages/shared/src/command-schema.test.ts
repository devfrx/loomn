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
});
