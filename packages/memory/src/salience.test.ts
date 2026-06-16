import { describe, it, expect } from 'vitest';
import { scoreSalience } from './salience';

describe('scoreSalience', () => {
  it('importanza massima senza ricorrenza da 1', () => {
    expect(scoreSalience({ importance: 10, recurrence: 0 })).toBe(1);
  });

  it('importanza minima senza ricorrenza da 0.1', () => {
    expect(scoreSalience({ importance: 1, recurrence: 0 })).toBe(0.1);
  });

  it('importanza senza ricorrenza scala linearmente', () => {
    expect(scoreSalience({ importance: 5, recurrence: 0 })).toBe(0.5);
    expect(scoreSalience({ importance: 2, recurrence: 0 })).toBe(0.2);
  });

  it('la ricorrenza amplifica la salienza', () => {
    expect(scoreSalience({ importance: 5, recurrence: 2 })).toBe(0.6);
  });

  it('clampa il risultato a 1', () => {
    expect(scoreSalience({ importance: 8, recurrence: 10 })).toBe(1);
  });

  it('clampa importanza e ricorrenza fuori range', () => {
    expect(scoreSalience({ importance: 99, recurrence: 0 })).toBe(1);
    expect(scoreSalience({ importance: -5, recurrence: 0 })).toBe(0.1);
    expect(scoreSalience({ importance: 5, recurrence: -3 })).toBe(0.5);
  });
});
