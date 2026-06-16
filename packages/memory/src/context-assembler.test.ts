import { describe, it, expect } from 'vitest';
import { defaultEstimateTokens, recencyWeight } from './context-assembler';

const HOUR = 3_600_000;

describe('recencyWeight (decadimento a tempo di lettura)', () => {
  it('eta 0 -> peso 1', () => {
    expect(recencyWeight(1000, 1000, 0.995)).toBe(1);
  });
  it('createdAt nel futuro -> trattato come eta 0 -> peso 1', () => {
    expect(recencyWeight(1000, 5000, 0.995)).toBe(1);
  });
  it('decade monotonicamente col passare del tempo', () => {
    const young = recencyWeight(10 * HOUR, 9 * HOUR, 0.995);
    const old = recencyWeight(10 * HOUR, 1 * HOUR, 0.995);
    expect(young).toBeGreaterThan(old);
    expect(young).toBeLessThan(1);
  });
  it('1 ora con decay 0.995 -> circa 0.995', () => {
    expect(recencyWeight(2 * HOUR, 1 * HOUR, 0.995)).toBeCloseTo(0.995, 6);
  });
});

describe('defaultEstimateTokens (euristica char/4)', () => {
  it('arrotonda per eccesso', () => {
    expect(defaultEstimateTokens('')).toBe(0);
    expect(defaultEstimateTokens('abc')).toBe(1);
    expect(defaultEstimateTokens('abcd')).toBe(1);
    expect(defaultEstimateTokens('abcde')).toBe(2);
  });
});
