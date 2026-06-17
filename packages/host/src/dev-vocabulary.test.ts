import { describe, it, expect } from 'vitest';
import { devRuleset } from './dev-vocabulary';

describe('devRuleset', () => {
  it('dichiara un vocabolario fantasy minimale', () => {
    expect(devRuleset.vocabulary.attributes.has('forza')).toBe(true);
    expect(devRuleset.vocabulary.resources.has('hp')).toBe(true);
    expect(devRuleset.vocabulary.defenses.has('difesa')).toBe(true);
  });

  it('rende combat-ready via defaultResources (hp)', () => {
    expect(devRuleset.vocabulary.defaultResources.hp).toEqual({ current: 10, max: 10 });
  });

  it('porta dcForDifficulty del motore', () => {
    expect(devRuleset.dcForDifficulty('moderate')).toBe(15);
  });
});
