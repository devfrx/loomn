import type { EncounterView, ActorView } from '../stores/read-model';

/** Chiave della condizione che l engine aggiunge con ActorDowned (engine events.ts): un partecipante
 *  e "a terra" se la porta. Mirror del literal engine (il renderer non importa engine per il dominio). */
export const DOWNED_CONDITION_KEY = 'morente';

/** Lettura di una risorsa (hp, ...) per la riga partecipante. */
export interface ResourceReadout {
  key: string;
  current: number;
  max: number;
}

/** Una riga dell ordine di iniziativa, gia arricchita coi dati dell attore. */
export interface ParticipantRow {
  actorId: string;
  name: string;
  initiative: number;
  zone: string;
  actedThisRound: boolean;
  isCurrent: boolean;
  isDowned: boolean;
  resources: ResourceReadout[];
}

/** Raggruppamento DISPLAY-ONLY per zona (label, NON topologia: il movimento e deferito post-10). */
export interface ZoneGroup {
  zone: string;
  participants: ParticipantRow[];
}

/** Vista del cockpit di scontro derivata dal read-model. */
export interface CockpitView {
  round: number;
  turnIndex: number;
  /** Ordine di iniziativa: gia PRE-ORDINATO dal motore (createEncounter) — NON ri-ordinare. */
  order: ParticipantRow[];
  /** Partecipanti raggruppati per zona, ordine di prima apparizione (display-only). */
  zones: ZoneGroup[];
  /** Il partecipante di turno (order[turnIndex]) o null se il round e completo. */
  current: ParticipantRow | null;
}

/** Mappa l encounter del read-model nella vista del cockpit. Pura: nessun side effect, nessun RNG. */
export function toEncounterView(
  encounter: NonNullable<EncounterView>,
  actors: readonly ActorView[],
): CockpitView {
  const byId = new Map(actors.map((a) => [a.id, a]));
  const order: ParticipantRow[] = encounter.participants.map((p, i) => {
    const actor = byId.get(p.actorId);
    return {
      actorId: p.actorId,
      name: actor?.name ?? p.actorId,
      initiative: p.initiative,
      zone: p.zone,
      actedThisRound: p.actedThisRound,
      isCurrent: i === encounter.turnIndex,
      isDowned: actor?.conditions.some((c) => c.key === DOWNED_CONDITION_KEY) ?? false,
      resources: actor
        ? Object.entries(actor.resources).map(([key, pool]) => ({ key, current: pool.current, max: pool.max }))
        : [],
    };
  });

  // Raggruppa per zona in ordine di prima apparizione (stesso pattern di toDicePlan).
  const zoneOrder: string[] = [];
  const byZone = new Map<string, ParticipantRow[]>();
  for (const row of order) {
    if (!byZone.has(row.zone)) {
      byZone.set(row.zone, []);
      zoneOrder.push(row.zone);
    }
    byZone.get(row.zone)!.push(row);
  }
  const zones: ZoneGroup[] = zoneOrder.map((zone) => ({ zone, participants: byZone.get(zone)! }));

  return {
    round: encounter.round,
    turnIndex: encounter.turnIndex,
    order,
    zones,
    current: order[encounter.turnIndex] ?? null,
  };
}
