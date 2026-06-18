/** I 6 Command GM/manuali non-combat esposti da 10f (i combat — StartEncounter/Attack/EndTurn/
 *  NextRound — sono di 10c). */
export const GM_COMMANDS = [
  'RequestCheck',
  'ApplyEffect',
  'StartQuest',
  'AdvanceQuest',
  'EnterPhase',
  'EndEncounter',
] as const;
export type GmCommandType = (typeof GM_COMMANDS)[number];

export interface CommandPhaseRules {
  combatOnly: string[];
  nonCombatOnly: string[];
}

/** Un comando e abilitato nella fase corrente secondo le commandPhaseRules di get-ruleset:
 *  disabilitato se combatOnly e non si e in combat, o nonCombatOnly e si e in combat (single-source:
 *  niente classificazione hardcoded nel renderer). */
export function isGmCommandEnabled(type: string, phase: string, rules: CommandPhaseRules): boolean {
  const inCombat = phase === 'combat';
  if (rules.combatOnly.includes(type)) return inCombat;
  if (rules.nonCombatOnly.includes(type)) return !inCombat;
  return true;
}
