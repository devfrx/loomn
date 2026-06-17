import { describe, it, expect } from 'vitest';
import { PHASES, SOFT_PHASES, INITIAL_PHASE, canTransition } from './phase';

describe('costanti di fase', () => {
  it('PHASES contiene le quattro fasi', () => {
    expect(PHASES).toEqual(['exploration', 'dialogue', 'combat', 'downtime']);
  });
  it('SOFT_PHASES sono le tre non-combat e non contengono combat', () => {
    expect(SOFT_PHASES).toEqual(['exploration', 'dialogue', 'downtime']);
  });
  it('INITIAL_PHASE e exploration', () => {
    expect(INITIAL_PHASE).toBe('exploration');
  });
});

describe('canTransition', () => {
  it('la stessa fase non e una transizione', () => {
    for (const p of PHASES) expect(canTransition(p, p)).toBe(false);
  });
  it('da combat si esce solo verso exploration', () => {
    expect(canTransition('combat', 'exploration')).toBe(true);
    expect(canTransition('combat', 'dialogue')).toBe(false);
    expect(canTransition('combat', 'downtime')).toBe(false);
  });
  it('da una fase non-combat ogni altra fase e raggiungibile', () => {
    for (const from of SOFT_PHASES) {
      for (const to of PHASES) {
        expect(canTransition(from, to)).toBe(from !== to);
      }
    }
  });
});
