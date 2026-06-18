import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useDiceStore } from './dice';
import type { RolledDice } from '../lib/turn-events';

const roll: RolledDice = {
  source: 'attack', tag: 'Attacco -> eroe', notation: '1d20@18', tokens: [],
  modifierTotal: 2, total: 20, dc: 12, margin: 8, outcome: 'success',
};

describe('useDiceStore', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('parte vuoto a nonce 0', () => {
    const s = useDiceStore();
    expect(s.rolls).toEqual([]);
    expect(s.nonce).toBe(0);
  });

  it('enqueue imposta i tiri e incrementa il nonce', () => {
    const s = useDiceStore();
    s.enqueue([roll]);
    expect(s.rolls).toEqual([roll]);
    expect(s.nonce).toBe(1);
    s.enqueue([roll]);
    expect(s.nonce).toBe(2);
  });

  it('enqueue di lista vuota non incrementa il nonce', () => {
    const s = useDiceStore();
    s.enqueue([]);
    expect(s.nonce).toBe(0);
  });

  it('clear svuota i tiri senza toccare il nonce', () => {
    const s = useDiceStore();
    s.enqueue([roll]);
    s.clear();
    expect(s.rolls).toEqual([]);
    expect(s.nonce).toBe(1);
  });
});
