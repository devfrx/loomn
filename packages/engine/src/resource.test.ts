import { describe, it, expect } from 'vitest';
import type { Actor } from './actor';
import { adjustResource, isDepleted, clampPool } from './resource';

function actorWith(current: number, max: number): Actor {
  return {
    id: 'a',
    name: 'A',
    kind: 'npc',
    attributes: {},
    skills: {},
    resources: { hp: { current, max } },
    conditions: [],
    items: [],
    progression: { xp: 0, level: 1 },
  };
}

describe('adjustResource', () => {
  it('applica un delta negativo (danno)', () => {
    const out = adjustResource(actorWith(10, 10), 'hp', -3);
    expect(out.resources['hp']).toEqual({ current: 7, max: 10 });
  });

  it('clampa a 0 (non scende sotto)', () => {
    const out = adjustResource(actorWith(2, 10), 'hp', -5);
    expect(out.resources['hp']!.current).toBe(0);
  });

  it('clampa a max (la cura non supera il massimo)', () => {
    const out = adjustResource(actorWith(8, 10), 'hp', +5);
    expect(out.resources['hp']!.current).toBe(10);
  });

  it('non muta lo stato originale (purezza)', () => {
    const original = actorWith(10, 10);
    adjustResource(original, 'hp', -3);
    expect(original.resources['hp']!.current).toBe(10);
  });

  it('lancia un errore per una risorsa sconosciuta', () => {
    expect(() => adjustResource(actorWith(10, 10), 'mana', -1)).toThrow(
      'Risorsa sconosciuta: mana',
    );
  });
});

describe('isDepleted', () => {
  it('è true quando current <= 0', () => {
    expect(isDepleted(actorWith(0, 10), 'hp')).toBe(true);
  });
  it('è false quando current > 0', () => {
    expect(isDepleted(actorWith(1, 10), 'hp')).toBe(false);
  });
  it('lancia per risorsa sconosciuta', () => {
    expect(() => isDepleted(actorWith(1, 10), 'mana')).toThrow(
      'Risorsa sconosciuta: mana',
    );
  });
});

describe('clampPool', () => {
  it('clampa current sopra max', () => {
    expect(clampPool({ current: 999, max: 10 })).toEqual({ current: 10, max: 10 });
  });
  it('clampa current negativo a 0', () => {
    expect(clampPool({ current: -5, max: 10 })).toEqual({ current: 0, max: 10 });
  });
  it('lascia invariato un pool valido', () => {
    expect(clampPool({ current: 7, max: 10 })).toEqual({ current: 7, max: 10 });
  });
  it('lancia su max negativo o non finito', () => {
    expect(() => clampPool({ current: 1, max: -1 })).toThrow(/max/);
    expect(() => clampPool({ current: 1, max: Infinity })).toThrow(/max/);
  });
  it('lancia su current non finito (NaN)', () => {
    expect(() => clampPool({ current: NaN, max: 10 })).toThrow(/current/);
  });
});
