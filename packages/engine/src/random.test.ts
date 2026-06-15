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

  it('golden: seed 42 produce la sequenza canonica mulberry32', () => {
    const rng = createSeededRandom(42);
    expect([rng.next(), rng.next(), rng.next()]).toEqual([
      0.6011037519201636, 0.44829055899754167, 0.8524657934904099,
    ]);
  });

  it('gestisce il seed 0 (caso degenere): valori validi e deterministici', () => {
    const a = createSeededRandom(0);
    const b = createSeededRandom(0);
    for (let i = 0; i < 5; i++) {
      const v = a.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(v).toEqual(b.next());
    }
  });
});
