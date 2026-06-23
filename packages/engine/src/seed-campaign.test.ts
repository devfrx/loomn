import { describe, it, expect } from 'vitest';
import { decide, replay, initialState, createSeededRandom, createVocabulary, createRuleset } from './index';
import type { CampaignSeed } from './index';

// Ruleset minimo costruito in-test per evitare la dipendenza engine->host (engine e foglia).
// defaultResources fornisce 'hp' per coprire il test auto-fill.
const testVocabulary = createVocabulary({
  attributes: ['forza', 'agilita'],
  skills: ['persuasione'],
  resources: ['hp'],
  defenses: ['difesa'],
  defaultResources: { hp: { current: 10, max: 10 } },
});
const testRuleset = createRuleset({ vocabulary: testVocabulary });

const seed: CampaignSeed = {
  frame: {
    id: 'c1',
    name: 'Demo',
    premise: 'p',
    setting: { place: 'a', era: 'b', genres: ['fantasy'] },
    tone: 't',
    openingScene: 'o',
    hooks: ['h'],
  },
  keyNpcs: [{ id: 'npc-1', name: 'Vendor', description: 'un mercante' }],
  keyPlaces: [{ id: 'p-1', name: 'Mercato', description: 'affollato' }],
  initialFacts: [{ subject: 'npc-1', predicate: 'lavora-a', object: 'p-1' }],
};
const rng = createSeededRandom(1);

describe('decide(SeedCampaign)', () => {
  it('emette CampaignFramed seguito da un ActorAdded per ogni PNG', () => {
    const events = decide(initialState, { type: 'SeedCampaign', seed }, rng, testRuleset);
    expect(events[0]?.type).toBe('CampaignFramed');
    expect(events.filter((e) => e.type === 'ActorAdded')).toHaveLength(1);
  });

  it('auto-fill delle risorse del PNG dai default del Ruleset', () => {
    const events = decide(initialState, { type: 'SeedCampaign', seed }, rng, testRuleset);
    const s = replay(events);
    expect(s.actors['npc-1']?.resources['hp']).toBeDefined();
  });

  it('rifiuta una seconda semina (once-guard)', () => {
    const s = replay(decide(initialState, { type: 'SeedCampaign', seed }, rng, testRuleset));
    expect(() => decide(s, { type: 'SeedCampaign', seed }, rng, testRuleset)).toThrow(/gia seminata/);
  });

  it('rifiuta PNG seminati con id duplicato', () => {
    const dup: CampaignSeed = { ...seed, keyNpcs: [seed.keyNpcs[0]!, seed.keyNpcs[0]!] };
    expect(() => decide(initialState, { type: 'SeedCampaign', seed: dup }, rng, testRuleset)).toThrow(/duplicato/);
  });

  it('lo stato dopo il seed ha il campaignFrame con id e nome corretti', () => {
    const events = decide(initialState, { type: 'SeedCampaign', seed }, rng, testRuleset);
    const s = replay(events);
    expect(s.campaignFrame?.id).toBe('c1');
    expect(s.campaignFrame?.name).toBe('Demo');
  });

  it('SeedCampaign e phase-agnostico (funziona in exploration)', () => {
    expect(() => decide(initialState, { type: 'SeedCampaign', seed }, rng, testRuleset)).not.toThrow();
  });

  it('keyNpcs vuoto produce solo CampaignFramed', () => {
    const emptySeed: CampaignSeed = { ...seed, keyNpcs: [] };
    const events = decide(initialState, { type: 'SeedCampaign', seed: emptySeed }, rng, testRuleset);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('CampaignFramed');
  });

  it('rifiuta un PNG con un attributo fuori vocabolario', () => {
    const bad: CampaignSeed = {
      ...seed,
      keyNpcs: [{ id: 'npc-x', name: 'X', description: 'd', attributes: { nonEsiste: 3 } }],
    };
    expect(() => decide(initialState, { type: 'SeedCampaign', seed: bad }, rng, testRuleset)).toThrow();
  });
});
