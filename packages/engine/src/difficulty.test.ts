import { describe, it, expect } from 'vitest';
import { DIFFICULTIES, dcForDifficulty } from './difficulty';

describe('dcForDifficulty', () => {
  it('mappa ogni band alla CD attesa', () => {
    expect(dcForDifficulty('trivial')).toBe(5);
    expect(dcForDifficulty('easy')).toBe(10);
    expect(dcForDifficulty('moderate')).toBe(15);
    expect(dcForDifficulty('hard')).toBe(20);
    expect(dcForDifficulty('formidable')).toBe(25);
    expect(dcForDifficulty('legendary')).toBe(30);
  });

  it('copre tutte le band di DIFFICULTIES con CD finita e crescente', () => {
    let prev = 0;
    for (const d of DIFFICULTIES) {
      const dc = dcForDifficulty(d);
      expect(Number.isFinite(dc)).toBe(true);
      expect(dc).toBeGreaterThan(prev);
      prev = dc;
    }
  });
});
