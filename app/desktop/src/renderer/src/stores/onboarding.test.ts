import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isReactive } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import type { GenerateSeedResult, SeedCampaignResult } from '@loomn/shared';
import { useOnboardingStore } from './onboarding';

const SEED = {
  frame: {
    id: 'la-cripta', name: 'La Cripta', premise: 'p',
    setting: { place: 'Porto', era: 'bronzo', genres: ['fantasy'] },
    tone: 'cupo', openingScene: 'Notte.', hooks: ['gancio'],
  },
  keyNpcs: [{ id: 'orsa', name: 'Orsa', description: 'vetraia' }],
  keyPlaces: [{ id: 'molo', name: 'Molo', description: 'assi' }],
  initialFacts: [{ subject: 'orsa', predicate: 'lavora-a', object: 'molo' }],
};

function stub(over: Partial<Record<'generateSeed' | 'seedCampaign', unknown>>): void {
  window.loomn = {
    generateSeed: vi.fn((): Promise<GenerateSeedResult> => Promise.resolve({ ok: true, seed: SEED })),
    seedCampaign: vi.fn((): Promise<SeedCampaignResult> => Promise.resolve({ ok: true, version: 5, narration: 'apertura' })),
    ...over,
  } as unknown as typeof window.loomn;
}

describe('useOnboardingStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    stub({});
  });

  it('buildBrief tesse text + overrides e omette i campi vuoti', () => {
    const s = useOnboardingStore();
    s.text = '  pirati  ';
    s.genres = 'fantasy, avventura';
    s.tone = '';
    s.npcCount = 3;
    expect(s.buildBrief()).toEqual({ text: 'pirati', overrides: { genres: ['fantasy', 'avventura'], npcCount: 3 } });
  });

  it('generate ok popola draft e passa a review', async () => {
    const s = useOnboardingStore();
    s.text = 'pirati';
    await s.generate();
    expect(s.draft?.frame.name).toBe('La Cripta');
    expect(s.step).toBe('review');
    expect(s.error).toBeNull();
  });

  it('generate con testo vuoto non chiama l IPC', async () => {
    const gen = vi.fn();
    stub({ generateSeed: gen });
    const s = useOnboardingStore();
    s.text = '   ';
    await s.generate();
    expect(gen).not.toHaveBeenCalled();
  });

  it('generate non ok imposta error e resta su brief', async () => {
    stub({ generateSeed: vi.fn((): Promise<GenerateSeedResult> => Promise.resolve({ ok: false, error: 'nessun provider' })) });
    const s = useOnboardingStore();
    s.text = 'x';
    await s.generate();
    expect(s.error).toBe('nessun provider');
    expect(s.step).toBe('brief');
  });

  it('confirm invia un seed PLAIN (non un proxy reactive) e passa a opening', async () => {
    const seedCampaign = vi.fn((): Promise<SeedCampaignResult> => Promise.resolve({ ok: true, version: 5, narration: 'apertura' }));
    stub({ seedCampaign });
    const s = useOnboardingStore();
    s.text = 'x';
    await s.generate();
    await s.confirm();
    const calls = seedCampaign.mock.calls as unknown as Array<Array<unknown>>;
    const arg = calls[0]![0] as { seed: unknown };
    expect(isReactive(arg.seed)).toBe(false);
    expect(arg.seed).toEqual(SEED);
    expect(s.opening).toBe('apertura');
    expect(s.step).toBe('opening');
  });

  it('regenerate riporta allo step brief tenendo il brief', async () => {
    const s = useOnboardingStore();
    s.text = 'x';
    await s.generate();
    s.regenerate();
    expect(s.step).toBe('brief');
    expect(s.text).toBe('x');
  });
});
