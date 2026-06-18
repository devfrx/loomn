import { describe, it, expect } from 'vitest';
import { toDicePlan, STANDARD_SIDES } from './dice';

describe('toDicePlan', () => {
  it('raggruppa un pool misto standard in una notazione con le facce forzate', () => {
    const plan = toDicePlan([
      { sides: 20, value: 18 },
      { sides: 6, value: 3 },
      { sides: 6, value: 5 },
      { sides: 8, value: 7 },
    ]);
    expect(plan.notation).toBe('1d20+2d6+1d8@18,3,5,7');
    expect(plan.tokens).toEqual([]);
  });

  it('separa i sides non-standard come token numerici escludendoli dalla notazione', () => {
    const plan = toDicePlan([
      { sides: 20, value: 12 },
      { sides: 7, value: 5 },
    ]);
    expect(plan.notation).toBe('1d20@12');
    expect(plan.tokens).toEqual([{ sides: 7, value: 5 }]);
  });

  it('con soli sides non-standard non produce notazione 3D', () => {
    const plan = toDicePlan([{ sides: 7, value: 3 }]);
    expect(plan.notation).toBeNull();
    expect(plan.tokens).toEqual([{ sides: 7, value: 3 }]);
  });

  it('su lista vuota non produce notazione ne token', () => {
    const plan = toDicePlan([]);
    expect(plan.notation).toBeNull();
    expect(plan.tokens).toEqual([]);
  });

  it('fonde i dadi dello stesso sides nello stesso gruppo, ordine di prima apparizione', () => {
    const plan = toDicePlan([
      { sides: 6, value: 4 },
      { sides: 20, value: 11 },
      { sides: 6, value: 2 },
    ]);
    expect(plan.notation).toBe('2d6+1d20@4,2,11');
    expect(plan.tokens).toEqual([]);
  });

  it('considera standard i poliedri usuali', () => {
    expect([...STANDARD_SIDES].sort((a, b) => a - b)).toEqual([4, 6, 8, 10, 12, 20, 100]);
  });
});
