import { describe, it, expect } from 'vitest';
import { extractRolls } from './turn-events';
import type { DomainEventView } from './dice';

const attack: DomainEventView = {
  type: 'AttackResolved',
  attackerId: 'goblin',
  targetId: 'eroe',
  hit: true,
  check: {
    dice: [{ sides: 20, value: 18 }],
    modifierTotal: 2,
    total: 20,
    mode: 'check',
    dc: 12,
    margin: 8,
    outcome: 'success',
  },
};
const check: DomainEventView = {
  type: 'CheckResolved',
  actorId: 'eroe',
  difficulty: 'moderate',
  attribute: 'forza',
  result: {
    dice: [{ sides: 20, value: 4 }],
    modifierTotal: 1,
    total: 5,
    mode: 'check',
    dc: 15,
    margin: -10,
    outcome: 'disaster',
  },
};
const effect: DomainEventView = {
  type: 'ResourceEffectApplied',
  targetId: 'eroe',
  resource: 'hp',
  delta: 8,
  roll: { dice: [{ sides: 6, value: 3 }, { sides: 6, value: 5 }], modifierTotal: 0, total: 8, mode: 'effect' },
};

describe('extractRolls', () => {
  it('estrae un tiro da AttackResolved con readout della prova', () => {
    const rolls = extractRolls([attack]);
    expect(rolls).toHaveLength(1);
    const r = rolls[0]!;
    expect(r.source).toBe('attack');
    expect(r.notation).toBe('1d20@18');
    expect(r.modifierTotal).toBe(2);
    expect(r.total).toBe(20);
    expect(r.dc).toBe(12);
    expect(r.outcome).toBe('success');
  });

  it('estrae un tiro da CheckResolved', () => {
    const rolls = extractRolls([check]);
    expect(rolls[0]!.source).toBe('check');
    expect(rolls[0]!.outcome).toBe('disaster');
    expect(rolls[0]!.notation).toBe('1d20@4');
  });

  it('estrae un effetto senza dc/outcome (non e una prova)', () => {
    const rolls = extractRolls([effect]);
    expect(rolls[0]!.source).toBe('effect');
    expect(rolls[0]!.notation).toBe('2d6@3,5');
    expect(rolls[0]!.dc).toBeUndefined();
    expect(rolls[0]!.outcome).toBeUndefined();
  });

  it('ignora gli eventi senza tiri e preserva l ordine', () => {
    const narr: DomainEventView = { type: 'NarrationRecorded', playerAction: 'a', narration: 'b' };
    const rolls = extractRolls([narr, attack, narr, effect]);
    expect(rolls.map((r) => r.source)).toEqual(['attack', 'effect']);
  });

  it('su lista vuota ritorna lista vuota', () => {
    expect(extractRolls([])).toEqual([]);
  });
});
