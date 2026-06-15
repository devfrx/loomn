/** Sorgente di casualità iniettabile. `next()` ritorna un float in [0, 1). */
export interface RandomSource {
  next(): number;
}

/** PRNG deterministico seedato (mulberry32). Stesso seed → stessa sequenza. */
export function createSeededRandom(seed: number): RandomSource {
  let a = seed >>> 0;
  return {
    next(): number {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}
