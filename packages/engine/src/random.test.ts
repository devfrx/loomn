import { describe, it, expect } from 'vitest';
import { createSeededRandom } from './random';

describe('createSeededRandom', () => {
  it('produce valori in [0, 1)', () => {
    const rng = createSeededRandom(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('è deterministico: stesso seed → stessa sequenza', () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(42);
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
  });

  it('seed diversi → sequenze diverse', () => {
    const a = createSeededRandom(1);
    const b = createSeededRandom(2);
    expect(a.next()).not.toEqual(b.next());
  });
});
