import { describe, it, expect } from 'vitest';
import type { Actor } from './actor';
import { awardXp, levelFor, applyProgression, advanceMilestone } from './progression';

function actorAt(xp: number, level: number): Actor {
  return {
    id: 'a',
    name: 'A',
    kind: 'npc',
    attributes: {},
    skills: {},
    resources: {},
    conditions: [],
    items: [],
    progression: { xp, level },
  };
}

describe('awardXp', () => {
  it('aggiunge XP restituendo un nuovo attore', () => {
    const original = actorAt(10, 1);
    const out = awardXp(original, 5);
    expect(out.progression.xp).toBe(15);
    expect(original.progression.xp).toBe(10);
  });
});

describe('levelFor', () => {
  it('calcola il livello dalle soglie cumulative', () => {
    const t = [100, 300, 600];
    expect(levelFor(0, t)).toBe(1);
    expect(levelFor(99, t)).toBe(1);
    expect(levelFor(100, t)).toBe(2);
    expect(levelFor(299, t)).toBe(2);
    expect(levelFor(300, t)).toBe(3);
    expect(levelFor(1000, t)).toBe(4);
  });
});

describe('applyProgression', () => {
  it('ricalcola il livello in base allo XP corrente', () => {
    const out = applyProgression(actorAt(300, 1), [100, 300, 600]);
    expect(out.progression.level).toBe(3);
    expect(out.progression.xp).toBe(300);
  });
});

describe('advanceMilestone', () => {
  it('incrementa il livello di 1', () => {
    const out = advanceMilestone(actorAt(0, 2));
    expect(out.progression.level).toBe(3);
  });
});
