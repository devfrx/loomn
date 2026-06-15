import { describe, it, expect } from 'vitest';
import type { RandomSource } from './random';
import type { RollExpr } from './dice';
import { outcomeFromMargin, resolveCheck } from './check';

function stubRandom(values: number[]): RandomSource {
  let i = 0;
  return { next: () => values[i++ % values.length]! };
}

describe('outcomeFromMargin', () => {
  it('mappa ogni banda al grado corretto', () => {
    expect(outcomeFromMargin(10)).toBe('critical');
    expect(outcomeFromMargin(15)).toBe('critical');
    expect(outcomeFromMargin(9)).toBe('success');
    expect(outcomeFromMargin(5)).toBe('success');
    expect(outcomeFromMargin(4)).toBe('success_at_cost');
    expect(outcomeFromMargin(0)).toBe('success_at_cost');
    expect(outcomeFromMargin(-1)).toBe('failure');
    expect(outcomeFromMargin(-9)).toBe('failure');
    expect(outcomeFromMargin(-10)).toBe('disaster');
    expect(outcomeFromMargin(-20)).toBe('disaster');
  });
});

describe('resolveCheck', () => {
  it('calcola margine ed esito da un tiro vs dc', () => {
    // 1d20 con next()=0.95 → faccia 20 ; +3 mod → total 23 ; dc 15 → margine 8 → success
    const rng = stubRandom([0.95]);
    const expr: RollExpr = {
      dice: [{ count: 1, sides: 20 }],
      modifiers: [{ value: 3, source: 'abilità' }],
      mode: 'check',
    };
    const res = resolveCheck(expr, 15, rng);
    expect(res.total).toBe(23);
    expect(res.dc).toBe(15);
    expect(res.margin).toBe(8);
    expect(res.outcome).toBe('success');
  });

  it('riporta i singoli dadi nel risultato (per il pannello 3D)', () => {
    const rng = stubRandom([0]); // faccia 1
    const res = resolveCheck(
      { dice: [{ count: 1, sides: 20 }], modifiers: [], mode: 'check' },
      10,
      rng,
    );
    expect(res.dice).toEqual([{ sides: 20, value: 1 }]);
    expect(res.margin).toBe(-9);
    expect(res.outcome).toBe('failure');
  });
});
