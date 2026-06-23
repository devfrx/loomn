import { describe, it, expect } from 'vitest';
import {
  campaignSeedSchema,
  campaignBriefSchema,
  generateSeedResultSchema,
  seedCampaignResultSchema,
} from './domain-schema';
import { generateSeedRequestSchema, seedCampaignRequestSchema } from './ipc';

const VALID_SEED = {
  frame: {
    id: 'la-cripta',
    name: 'La Cripta',
    premise: 'premessa',
    setting: { place: 'Porto', era: 'eta del bronzo', genres: ['fantasy'] },
    tone: 'cupo',
    openingScene: 'Notte sul molo.',
    hooks: ['un gancio'],
  },
  keyNpcs: [{ id: 'orsa', name: 'Orsa', description: 'vetraia' }],
  keyPlaces: [{ id: 'molo', name: 'Molo', description: 'assi marce' }],
  initialFacts: [{ subject: 'orsa', predicate: 'lavora-a', object: 'molo' }],
};

describe('campaignSeedSchema', () => {
  it('parsa un seed valido (gate estratto, behaviour-preserving)', () => {
    const r = campaignSeedSchema.safeParse(VALID_SEED);
    expect(r.success).toBe(true);
  });

  it('rifiuta un seed con id PNG vuoto', () => {
    const bad = { ...VALID_SEED, keyNpcs: [{ id: '', name: 'X', description: 'd' }] };
    expect(campaignSeedSchema.safeParse(bad).success).toBe(false);
  });
});

describe('campaignBriefSchema', () => {
  it('parsa un brief minimo (solo text)', () => {
    const r = campaignBriefSchema.safeParse({ text: 'una storia di pirati' });
    expect(r.success).toBe(true);
    expect(r.success && r.data.text).toBe('una storia di pirati');
  });

  it('parsa overrides e OMETTE le chiavi assenti (exactOptional)', () => {
    const r = campaignBriefSchema.safeParse({ text: 't', overrides: { tone: 'epico' } });
    expect(r.success).toBe(true);
    expect(r.success && r.data.overrides).toEqual({ tone: 'epico' });
  });

  it('rifiuta text vuoto', () => {
    expect(campaignBriefSchema.safeParse({ text: '' }).success).toBe(false);
  });
});

describe('schemi dei canali onboarding', () => {
  it('generateSeedRequestSchema accetta un brief', () => {
    expect(generateSeedRequestSchema.safeParse({ text: 't' }).success).toBe(true);
  });

  it('generateSeedResultSchema parsa l arm ok con seed', () => {
    expect(generateSeedResultSchema.safeParse({ ok: true, seed: VALID_SEED }).success).toBe(true);
  });

  it('seedCampaignRequestSchema richiede seed valido', () => {
    expect(seedCampaignRequestSchema.safeParse({ seed: VALID_SEED }).success).toBe(true);
  });

  it('seedCampaignResultSchema parsa ok con version e narration opzionale', () => {
    expect(seedCampaignResultSchema.safeParse({ ok: true, version: 3 }).success).toBe(true);
    expect(seedCampaignResultSchema.safeParse({ ok: true, version: 3, narration: 'apertura' }).success).toBe(true);
  });
});
