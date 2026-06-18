import { describe, it, expect } from 'vitest';
import { GM_COMMANDS, isGmCommandEnabled } from './gm-commands';

const RULES = { combatOnly: ['Attack', 'EndEncounter'], nonCombatOnly: ['StartEncounter', 'EnterPhase'] };

describe('GM_COMMANDS', () => {
  it('elenca i 6 comandi GM della Regia (StartEncounter al posto di EndEncounter)', () => {
    expect(GM_COMMANDS).toEqual([
      'RequestCheck',
      'ApplyEffect',
      'StartQuest',
      'AdvanceQuest',
      'EnterPhase',
      'StartEncounter',
    ]);
  });
});

describe('isGmCommandEnabled (legalita per fase da commandPhaseRules)', () => {
  it('StartEncounter (nonCombatOnly) abilitato fuori combat, disabilitato in combat', () => {
    expect(isGmCommandEnabled('StartEncounter', 'exploration', RULES)).toBe(true);
    expect(isGmCommandEnabled('StartEncounter', 'combat', RULES)).toBe(false);
  });

  it('Attack (combatOnly) abilitato solo in combat', () => {
    expect(isGmCommandEnabled('Attack', 'combat', RULES)).toBe(true);
    expect(isGmCommandEnabled('Attack', 'exploration', RULES)).toBe(false);
  });

  it('RequestCheck (in nessuna lista) abilitato in ogni fase', () => {
    expect(isGmCommandEnabled('RequestCheck', 'combat', RULES)).toBe(true);
    expect(isGmCommandEnabled('RequestCheck', 'downtime', RULES)).toBe(true);
  });
});
