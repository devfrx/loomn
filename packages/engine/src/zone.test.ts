import { describe, it, expect } from 'vitest';
import { areAdjacent, zoneDistance, rangeBand, type ZoneMap } from './zone';

// a — b — c   (catena lineare; d isolata)
const map: ZoneMap = {
  a: ['b'],
  b: ['a', 'c'],
  c: ['b'],
  d: [],
};

describe('areAdjacent', () => {
  it('riconosce le zone adiacenti dalla mappa', () => {
    expect(areAdjacent(map, 'a', 'b')).toBe(true);
    expect(areAdjacent(map, 'a', 'c')).toBe(false);
    expect(areAdjacent(map, 'a', 'a')).toBe(false);
  });
});

describe('zoneDistance', () => {
  it('calcola la distanza minima via BFS', () => {
    expect(zoneDistance(map, 'a', 'a')).toBe(0);
    expect(zoneDistance(map, 'a', 'b')).toBe(1);
    expect(zoneDistance(map, 'a', 'c')).toBe(2);
    expect(zoneDistance(map, 'a', 'd')).toBe(Infinity);
    expect(zoneDistance(map, 'a', 'z')).toBe(Infinity);
  });
});

describe('rangeBand', () => {
  it('classifica la distanza in banda di gittata', () => {
    expect(rangeBand(0)).toBe('engaged');
    expect(rangeBand(1)).toBe('near');
    expect(rangeBand(2)).toBe('far');
    expect(rangeBand(5)).toBe('far');
  });
});
