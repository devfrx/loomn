import type { DispatchCommand } from '@loomn/shared';

// Tipi derivati dal CONTRATTO IPC (z.input di commandSchema): il renderer NON importa engine.
type AttackCmd = Extract<DispatchCommand, { type: 'Attack' }>;
type StartEncounterCmd = Extract<DispatchCommand, { type: 'StartEncounter' }>;
type ParticipantInput = StartEncounterCmd['participants'][number];

/** Parametri dell affordance Attacco del cockpit (attribute/skill opzionali; senza, l engine usa i
 *  dadi base — actorCheck). */
export interface AttackParams {
  attackerId: string;
  targetId: string;
  defense: string;
  defenseBase: number;
  damageResource: string;
  attribute?: string;
  skill?: string;
}

/** Costruisce un Command Attack PLAIN (mai un proxy reactive: la clone IPC rifiuta i Proxy, lezione
 *  10b), omettendo gli opzionali assenti o vuoti (cast-free sotto exactOptionalPropertyTypes). */
export function buildAttack(p: AttackParams): AttackCmd {
  return {
    type: 'Attack',
    attackerId: p.attackerId,
    targetId: p.targetId,
    defense: p.defense,
    defenseBase: p.defenseBase,
    damageResource: p.damageResource,
    ...(p.attribute !== undefined && p.attribute !== '' ? { attribute: p.attribute } : {}),
    ...(p.skill !== undefined && p.skill !== '' ? { skill: p.skill } : {}),
  };
}

/** Comandi di turno (literal, nessun argomento). */
export const endTurn = (): DispatchCommand => ({ type: 'EndTurn' });
export const nextRound = (): DispatchCommand => ({ type: 'NextRound' });
export const endEncounter = (): DispatchCommand => ({ type: 'EndEncounter' });

/** Riga del builder di scontro: un attore candidato con inclusione/iniziativa/zona. */
export interface ParticipantRowInput {
  actorId: string;
  include: boolean;
  initiative: number;
  zone: string;
}

/** Costruisce StartEncounter dai soli attori inclusi (oggetti PLAIN). Ritorna null se nessuno e
 *  incluso (uno scontro senza partecipanti non ha senso per il cockpit). */
export function buildStartEncounter(
  encounterId: string,
  rows: readonly ParticipantRowInput[],
): StartEncounterCmd | null {
  const participants: ParticipantInput[] = rows
    .filter((r) => r.include)
    .map((r) => ({ actorId: r.actorId, zone: r.zone, initiative: r.initiative }));
  if (participants.length === 0) return null;
  return { type: 'StartEncounter', encounterId, participants };
}
