/** I 6 Command GM/manuali della Regia: i 5 non-combat di 10f (RequestCheck/ApplyEffect/StartQuest/
 *  AdvanceQuest/EnterPhase) + StartEncounter (entrata in combat, nonCombatOnly: vive nella Regia perche
 *  il cockpit non e visibile fuori combat). I comandi IN-combat (Attack/EndTurn/NextRound/EndEncounter)
 *  vivono nel cockpit di 10c. */
export const GM_COMMANDS = [
  'RequestCheck',
  'ApplyEffect',
  'StartQuest',
  'AdvanceQuest',
  'EnterPhase',
  'StartEncounter',
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
