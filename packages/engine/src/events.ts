import type { Actor } from './actor';
import type { CheckResult } from './check';
import type { Difficulty } from './difficulty';
import { adjustResource } from './resource';
import { addCondition } from './condition';
import { endTurn, nextRound, type Encounter } from './encounter';

export type DomainEvent =
  | { type: 'ActorAdded'; actor: Actor }
  | { type: 'EncounterStarted'; encounter: Encounter }
  | { type: 'TurnEnded' }
  | { type: 'RoundAdvanced' }
  | { type: 'AttackResolved'; attackerId: string; targetId: string; check: CheckResult; hit: boolean }
  | { type: 'DamageApplied'; targetId: string; resource: string; amount: number }
  | { type: 'ActorDowned'; actorId: string }
  | { type: 'NarrationRecorded'; playerAction: string; narration: string }
  | { type: 'CheckResolved'; actorId: string; attribute?: string; skill?: string; difficulty: Difficulty; result: CheckResult };

export interface GameState {
  version: number;
  actors: Record<string, Actor>;
  encounter: Encounter | null;
}

export const initialState: GameState = { version: 0, actors: {}, encounter: null };

function requireActor(state: GameState, id: string): Actor {
  const a = state.actors[id];
  if (a === undefined) {
    throw new Error(`Attore sconosciuto: ${id}`);
  }
  return a;
}

function requireEncounter(state: GameState): Encounter {
  if (state.encounter === null) {
    throw new Error('Nessuno scontro attivo');
  }
  return state.encounter;
}

/** Proietta un evento sullo stato. Deterministico, niente RNG: i fatti casuali sono
 *  già risolti dentro l'evento. Funzione pura. La versione è sempre incrementata. */
export function applyEvent(state: GameState, event: DomainEvent): GameState {
  const bumped: GameState = { ...state, version: state.version + 1 };
  switch (event.type) {
    case 'ActorAdded':
      return { ...bumped, actors: { ...state.actors, [event.actor.id]: event.actor } };
    case 'EncounterStarted':
      return { ...bumped, encounter: event.encounter };
    case 'TurnEnded':
      return { ...bumped, encounter: endTurn(requireEncounter(state)) };
    case 'RoundAdvanced':
      return { ...bumped, encounter: nextRound(requireEncounter(state)) };
    case 'AttackResolved':
      return bumped;
    case 'CheckResolved':
      // Evento informativo: il fatto e gia risolto nel CheckResult (replay-safe, niente RNG).
      // No-op di stato come AttackResolved: non muta actors/encounter, solo version++.
      return bumped;
    case 'NarrationRecorded':
      // Evento informativo: registra la prosa del Master nello stream (spec F4). No-op di
      // stato (come AttackResolved): non muta actors/encounter, solo version++. e l unico
      // evento non prodotto da decide (lo appende runTurn nel host).
      return bumped;
    case 'DamageApplied': {
      const target = adjustResource(requireActor(state, event.targetId), event.resource, -event.amount);
      return { ...bumped, actors: { ...state.actors, [event.targetId]: target } };
    }
    case 'ActorDowned': {
      const actor = requireActor(state, event.actorId);
      if (actor.conditions.some((c) => c.key === 'morente')) {
        return bumped;
      }
      const downed = addCondition(actor, {
        key: 'morente',
        source: 'combat',
        effects: [],
        duration: { kind: 'permanent' },
      });
      return { ...bumped, actors: { ...state.actors, [event.actorId]: downed } };
    }
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

/** Ricostruisce lo stato applicando una sequenza di eventi dallo stato iniziale. */
export function replay(events: DomainEvent[]): GameState {
  return events.reduce(applyEvent, initialState);
}
