import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { RulesetResult } from '@loomn/shared';
import { useRulesetStore } from './ruleset';

const OK: Extract<RulesetResult, { ok: true }> = {
  ok: true,
  vocabulary: {
    attributes: ['forza', 'destrezza'],
    skills: ['atletica'],
    resources: ['hp', 'mana'],
    defenses: ['difesa'],
    defaultResources: { hp: { current: 10, max: 10 } },
  },
  difficulties: ['moderate'],
  softPhases: ['exploration', 'dialogue', 'downtime'],
  questOutcomes: ['completed', 'failed'],
  directions: ['restore', 'drain'],
  commandPhaseRules: { combatOnly: ['Attack', 'EndEncounter'], nonCombatOnly: ['StartEncounter', 'EnterPhase'] },
};

describe('useRulesetStore', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('load popola il vocabolario e gli enum', async () => {
    window.loomn = { getRuleset: () => Promise.resolve(OK) } as unknown as typeof window.loomn;
    const s = useRulesetStore();
    await s.load();
    expect(s.loaded).toBe(true);
    expect(s.vocabulary?.attributes).toContain('forza');
    expect(s.difficulties).toEqual(['moderate']);
    expect(s.commandPhaseRules.combatOnly).toContain('EndEncounter');
  });

  it('load e fetch-once (non rilegge se gia caricato)', async () => {
    const spy = vi.fn(() => Promise.resolve(OK));
    window.loomn = { getRuleset: spy } as unknown as typeof window.loomn;
    const s = useRulesetStore();
    await s.load();
    await s.load();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('cattura l errore di un esito non ok', async () => {
    window.loomn = { getRuleset: () => Promise.resolve({ ok: false, error: 'boom' }) } as unknown as typeof window.loomn;
    const s = useRulesetStore();
    await s.load();
    expect(s.loaded).toBe(false);
    expect(s.error).toBe('boom');
  });
});
