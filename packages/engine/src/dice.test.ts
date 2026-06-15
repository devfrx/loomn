import { describe, it, expect } from 'vitest';
import type { RandomSource } from './random';
import { rollExpression, type RollExpr } from './dice';

/** Stub: restituisce in ordine i valori forniti, ciclando se servono di più. */
function stubRandom(values: number[]): RandomSource {
  let i = 0;
  return { next: () => values[i++ % values.length]! };
}

describe('rollExpression', () => {
  it('tira ogni dado del gruppo e somma con i modificatori', () => {
    // next()=0 → faccia 1 ; next()=0.99 → faccia max
    const rng = stubRandom([0, 0.99]); // 1d6 → 1, poi 1d6 → 6
    const expr: RollExpr = {
      dice: [{ count: 2, sides: 6, tag: 'spadone' }],
      modifiers: [{ value: 2, source: 'forza' }],
      mode: 'effect',
    };
    const res = rollExpression(expr, rng);
    expect(res.dice).toEqual([
      { sides: 6, value: 1, tag: 'spadone' },
      { sides: 6, value: 6, tag: 'spadone' },
    ]);
    expect(res.modifierTotal).toBe(2);
    expect(res.total).toBe(1 + 6 + 2);
    expect(res.mode).toBe('effect');
  });

  it('gestisce più gruppi di dadi e nessun modificatore', () => {
    const rng = stubRandom([0]); // ogni dado → faccia 1
    const expr: RollExpr = {
      dice: [
        { count: 1, sides: 20 },
        { count: 1, sides: 4 },
      ],
      modifiers: [],
      mode: 'check',
    };
    const res = rollExpression(expr, rng);
    expect(res.dice.map((d) => d.value)).toEqual([1, 1]);
    expect(res.modifierTotal).toBe(0);
    expect(res.total).toBe(2);
  });

  it('mappa next() sulla faccia corretta: floor(next*sides)+1', () => {
    const rng = stubRandom([0.5]); // 0.5 * 20 = 10 → faccia 11
    const res = rollExpression(
      { dice: [{ count: 1, sides: 20 }], modifiers: [], mode: 'check' },
      rng,
    );
    expect(res.dice[0]!.value).toBe(11);
  });
});
