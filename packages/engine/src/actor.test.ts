import { describe, it, expect } from 'vitest';
import { getAttribute, getSkill, type Actor } from './actor';

function sampleActor(): Actor {
  return {
    id: 'pg-1',
    name: 'Kael',
    kind: 'pc',
    attributes: { forza: 3, mente: 1 },
    skills: { atletica: 2 },
    resources: { hp: { current: 10, max: 10 } },
    conditions: [],
  };
}

describe('getAttribute', () => {
  it('ritorna il valore di un attributo presente', () => {
    expect(getAttribute(sampleActor(), 'forza')).toBe(3);
  });
  it('ritorna 0 per un attributo assente (default)', () => {
    expect(getAttribute(sampleActor(), 'destrezza')).toBe(0);
  });
});

describe('getSkill', () => {
  it('ritorna il valore di una abilità presente', () => {
    expect(getSkill(sampleActor(), 'atletica')).toBe(2);
  });
  it('ritorna 0 per una abilità assente (default)', () => {
    expect(getSkill(sampleActor(), 'furtività')).toBe(0);
  });
});
