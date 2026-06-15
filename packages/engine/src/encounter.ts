import { zoneDistance, rangeBand, type ZoneMap, type RangeBand } from './zone';

export interface Participant {
  actorId: string;
  zone: string;
  initiative: number;
  actedThisRound: boolean;
}

export interface Encounter {
  id: string;
  participants: Participant[]; // ordinati per iniziativa decrescente (ordine di turno)
  round: number;
  turnIndex: number;
}

export interface ParticipantInput {
  actorId: string;
  zone: string;
  initiative: number;
}

/** Crea uno scontro: ordina i partecipanti per iniziativa decrescente (a parità,
 *  ordine d'ingresso, perché Array.sort è stabile), round 1, turno al primo. Funzione pura. */
export function createEncounter(id: string, participants: ParticipantInput[]): Encounter {
  const ordered: Participant[] = [...participants]
    .sort((a, b) => b.initiative - a.initiative)
    .map((p) => ({
      actorId: p.actorId,
      zone: p.zone,
      initiative: p.initiative,
      actedThisRound: false,
    }));
  return { id, participants: ordered, round: 1, turnIndex: 0 };
}

/** Banda di gittata tra due partecipanti secondo la mappa delle zone.
 *  Lancia se uno dei due non è nello scontro. */
export function rangeBetween(
  enc: Encounter,
  map: ZoneMap,
  actorIdA: string,
  actorIdB: string,
): RangeBand {
  const a = enc.participants.find((p) => p.actorId === actorIdA);
  const b = enc.participants.find((p) => p.actorId === actorIdB);
  if (a === undefined || b === undefined) {
    throw new Error('Partecipante sconosciuto nello scontro');
  }
  return rangeBand(zoneDistance(map, a.zone, b.zone));
}
