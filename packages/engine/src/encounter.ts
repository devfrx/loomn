import { zoneDistance, rangeBand, areAdjacent, type ZoneMap, type RangeBand } from './zone';

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

/** Il partecipante di turno corrente. Lancia se il turno è oltre la fine del round. */
export function currentParticipant(enc: Encounter): Participant {
  const p = enc.participants[enc.turnIndex];
  if (p === undefined) {
    throw new Error('Nessun partecipante per il turno corrente (round completo)');
  }
  return p;
}

/** Termina il turno corrente: marca il partecipante come "ha agito" e avanza l'indice.
 *  Funzione pura. */
export function endTurn(enc: Encounter): Encounter {
  const participants = enc.participants.map((p, i) =>
    i === enc.turnIndex ? { ...p, actedThisRound: true } : p,
  );
  return { ...enc, participants, turnIndex: enc.turnIndex + 1 };
}

/** True se tutti i partecipanti hanno avuto il loro turno in questo round. */
export function roundComplete(enc: Encounter): boolean {
  return enc.turnIndex >= enc.participants.length;
}

/** Avvia il round successivo: azzera "ha agito", incrementa il round, riparte dal primo.
 *  Funzione pura. */
export function nextRound(enc: Encounter): Encounter {
  const participants = enc.participants.map((p) => ({ ...p, actedThisRound: false }));
  return { ...enc, participants, round: enc.round + 1, turnIndex: 0 };
}

/** Muove un partecipante in una zona adiacente. Lancia se il partecipante non esiste
 *  o se la zona di destinazione non è adiacente a quella attuale. Funzione pura. */
export function moveParticipant(
  enc: Encounter,
  map: ZoneMap,
  actorId: string,
  toZone: string,
): Encounter {
  const p = enc.participants.find((x) => x.actorId === actorId);
  if (p === undefined) {
    throw new Error('Partecipante sconosciuto nello scontro');
  }
  if (!areAdjacent(map, p.zone, toZone)) {
    throw new Error(`Mossa non valida: ${p.zone} -> ${toZone} non sono adiacenti`);
  }
  const participants = enc.participants.map((x) =>
    x.actorId === actorId ? { ...x, zone: toZone } : x,
  );
  return { ...enc, participants };
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
