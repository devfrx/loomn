import { describe, it, expect } from 'vitest';
import { GM_COMMANDS, isGmCommandEnabled } from './gm-commands';

const RULES = { combatOnly: ['Attack', 'EndEncounter'], nonCombatOnly: ['StartEncounter', 'EnterPhase'] };

describe('GM_COMMANDS', () => {
  it('elenca i 6 comandi non-combat di 10f', () => {
    expect(GM_COMMANDS).toEqual([
      'RequestCheck',
      'ApplyEffect',
      'StartQuest',
      'AdvanceQuest',
      'EnterPhase',
      'EndEncounter',
    ]);
  });
});

describe('isGmCommandEnabled (legalita per fase da commandPhaseRules)', () => {
  it('EnterPhase (nonCombatOnly) abilitato fuori combat, disabilitato in combat', () => {
    expect(isGmCommandEnabled('EnterPhase', 'exploration', RULES)).toBe(true);
    expect(isGmCommandEnabled('EnterPhase', 'combat', RULES)).toBe(false);
  });

  it('EndEncounter (combatOnly) abilitato solo in combat', () => {
    expect(isGmCommandEnabled('EndEncounter', 'combat', RULES)).toBe(true);
    expect(isGmCommandEnabled('EndEncounter', 'exploration', RULES)).toBe(false);
  });

  it('RequestCheck (in nessuna lista) abilitato in ogni fase', () => {
    expect(isGmCommandEnabled('RequestCheck', 'combat', RULES)).toBe(true);
    expect(isGmCommandEnabled('RequestCheck', 'downtime', RULES)).toBe(true);
  });
});
