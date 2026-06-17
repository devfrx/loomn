import { describe, it, expect } from 'vitest';
import { createVocabulary, createRuleset } from './ruleset';
import { dcForDifficulty } from './difficulty';

describe('createVocabulary', () => {
  it('espone i set di membership con has()', () => {
    const v = createVocabulary({ attributes: ['forza'], skills: ['arcano'], resources: ['hp'], defenses: ['difesa'] });
    expect(v.attributes.has('forza')).toBe(true);
    expect(v.attributes.has('magia')).toBe(false);
    expect(v.skills.has('arcano')).toBe(true);
    expect(v.resources.has('hp')).toBe(true);
    expect(v.defenses.has('difesa')).toBe(true);
  });

  it('defaultResources e vuoto se non fornito', () => {
    const v = createVocabulary({ attributes: [], skills: [], resources: ['hp'], defenses: [] });
    expect(v.defaultResources).toEqual({});
  });

  it('conserva i defaultResources con chiavi dichiarate', () => {
    const v = createVocabulary({
      attributes: [], skills: [], resources: ['hp'], defenses: [],
      defaultResources: { hp: { current: 10, max: 10 } },
    });
    expect(v.defaultResources).toEqual({ hp: { current: 10, max: 10 } });
  });

  it('rifiuta defaultResources con una risorsa non dichiarata', () => {
    expect(() =>
      createVocabulary({ attributes: [], skills: [], resources: ['hp'], defenses: [], defaultResources: { mana: { current: 5, max: 5 } } }),
    ).toThrow(/mana/);
  });
});

describe('createRuleset', () => {
  it('usa dcForDifficulty del motore come default', () => {
    const v = createVocabulary({ attributes: [], skills: [], resources: [], defenses: [] });
    const r = createRuleset({ vocabulary: v });
    expect(r.dcForDifficulty('moderate')).toBe(dcForDifficulty('moderate'));
    expect(r.vocabulary).toBe(v);
  });

  it('accetta un dcForDifficulty sovrascritto', () => {
    const v = createVocabulary({ attributes: [], skills: [], resources: [], defenses: [] });
    const r = createRuleset({ vocabulary: v, dcForDifficulty: () => 99 });
    expect(r.dcForDifficulty('moderate')).toBe(99);
  });
});
