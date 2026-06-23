import { describe, it, expect } from 'vitest';
import { createRuleset, createVocabulary, type Ruleset } from '@loomn/engine';
import { slugify, rawToCampaignSeed, type RawSeed } from './campaign-generation';
import { generateCampaignSeed, type CampaignBrief } from './campaign-generation';
import { StructuredOutputError, type StructuredOutputPort, type StructuredOutputRequest, type StructuredOutputResult } from './structured-output';

const RULESET: Ruleset = createRuleset({
  vocabulary: createVocabulary({
    attributes: ['forza', 'destrezza'],
    skills: ['atletica', 'furtivita'],
    resources: ['hp'],
    defenses: ['difesa'],
  }),
});

function baseRaw(): RawSeed {
  return {
    name: 'La Cripta',
    premise: 'Indagine notturna.',
    setting: { place: 'Porto', era: 'bronzo', genres: ['mistero'], worldRules: 'il vetro parla' },
    tone: 'cupo',
    openingScene: 'Notte ai moli.',
    hooks: ['marinai scomparsi'],
    npcs: [
      { name: 'Maestra Orsa', description: 'vetraia', tier: 'eccezionale' },
      { name: 'Maestra Orsa', description: 'omonima', tier: 'comune' },
    ],
    places: [{ name: 'Molo Vecchio', description: 'assi marce' }],
    facts: [{ subject: 'Maestra Orsa', predicate: 'lavora-a', object: 'Molo Vecchio' }],
  };
}

describe('slugify', () => {
  it('minuscola, accenti rimossi, spazi e simboli in trattini', () => {
    expect(slugify('Maestra Orsa')).toBe('maestra-orsa');
    expect(slugify('Città di Vetro!')).toBe('citta-di-vetro');
    expect(slugify('  Loy lo Sgherro  ')).toBe('loy-lo-sgherro');
    expect(slugify('Porto   Vetraio')).toBe('porto-vetraio');
  });

  it('una stringa senza alfanumerici diventa vuota', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('rawToCampaignSeed', () => {
  it('assembla frame, mappa tier in stat dal vocabolario, copia i fatti', () => {
    const seed = rawToCampaignSeed(baseRaw(), RULESET);
    expect(seed.frame.id).toBe('la-cripta');
    expect(seed.frame.name).toBe('La Cripta');
    expect(seed.frame.setting.worldRules).toBe('il vetro parla');
    expect(seed.keyNpcs[0]?.attributes).toEqual({ forza: 3, destrezza: 3 });
    expect(seed.keyNpcs[0]?.skills).toEqual({ atletica: 3, furtivita: 3 });
    expect(seed.keyNpcs[1]?.attributes).toEqual({ forza: 1, destrezza: 1 });
    expect(seed.keyPlaces[0]?.id).toBe('molo-vecchio');
    expect(seed.initialFacts).toEqual([{ subject: 'Maestra Orsa', predicate: 'lavora-a', object: 'Molo Vecchio' }]);
  });

  it('deduplica gli id derivati da nomi uguali', () => {
    const seed = rawToCampaignSeed(baseRaw(), RULESET);
    expect(seed.keyNpcs[0]?.id).toBe('maestra-orsa');
    expect(seed.keyNpcs[1]?.id).toBe('maestra-orsa-2');
  });

  it('omette worldRules quando assente nel raw', () => {
    const raw = baseRaw();
    raw.setting = { place: 'Porto', era: 'bronzo', genres: ['mistero'] };
    const seed = rawToCampaignSeed(raw, RULESET);
    expect('worldRules' in seed.frame.setting).toBe(false);
  });

  it('contentGuidance: override del brief ha precedenza sul raw', () => {
    const raw = baseRaw();
    raw.contentGuidance = 'no gore';
    const conOverride = rawToCampaignSeed(raw, RULESET, { text: 'x', overrides: { contentGuidance: 'niente violenza su minori' } });
    expect(conOverride.frame.contentGuidance).toBe('niente violenza su minori');
    const senzaOverride = rawToCampaignSeed(raw, RULESET);
    expect(senzaOverride.frame.contentGuidance).toBe('no gore');
  });
});

function fakePort(raw: RawSeed, capture?: (req: StructuredOutputRequest<unknown>) => void): StructuredOutputPort {
  return {
    generate: async <T>(req: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> => {
      capture?.(req as unknown as StructuredOutputRequest<unknown>);
      return { value: raw as unknown as T, strategy: 'function-call' };
    },
  };
}

describe('generateCampaignSeed', () => {
  it('genera un CampaignSeed dalla porta structured', async () => {
    const seed = await generateCampaignSeed({ text: 'voglio un horror' }, { structured: fakePort(baseRaw()), ruleset: RULESET });
    expect(seed.frame.name).toBe('La Cripta');
    expect(seed.keyNpcs[0]?.id).toBe('maestra-orsa');
  });

  it('il brief e gli override raggiungono il prompt e lo schemaName e corretto', async () => {
    let captured: StructuredOutputRequest<unknown> | undefined;
    const brief: CampaignBrief = { text: 'una citta sommersa', overrides: { genres: ['horror'], tone: 'teso', npcCount: 3 } };
    await generateCampaignSeed(brief, { structured: fakePort(baseRaw(), (r) => { captured = r; }), ruleset: RULESET });
    const user = captured?.messages.find((m) => m.role === 'user')?.content ?? '';
    expect(user).toContain('una citta sommersa');
    expect(user).toContain('horror');
    expect(user).toContain('teso');
    expect(captured?.schemaName).toBe('campaign_seed');
  });

  it('propaga StructuredOutputError se la generazione fallisce', async () => {
    const port: StructuredOutputPort = {
      generate: async () => {
        throw new StructuredOutputError('fallito', '');
      },
    };
    await expect(generateCampaignSeed({ text: 'x' }, { structured: port, ruleset: RULESET })).rejects.toThrow(StructuredOutputError);
  });
});
