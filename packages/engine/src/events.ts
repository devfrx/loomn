import type { Actor } from './actor';
import type { CheckResult } from './check';
import type { RollResult } from './dice';
import type { Difficulty } from './difficulty';
import type { Quest, QuestOutcome } from './quest';
import { INITIAL_PHASE, type Phase } from './phase';
import type { CampaignFrame } from './campaign';
import { adjustResource } from './resource';
import { addCondition, DOWNED_CONDITION_KEY, dyingCondition } from './condition';
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
  | { type: 'CheckResolved'; actorId: string; attribute?: string; skill?: string; difficulty: Difficulty; result: CheckResult }
  | { type: 'ResourceEffectApplied'; targetId: string; resource: string; delta: number; roll: RollResult }
  | { type: 'QuestStarted'; quest: Quest }
  | { type: 'QuestAdvanced'; questId: string; status: QuestOutcome }
  | { type: 'PhaseChanged'; from: Phase; to: Phase }
  | { type: 'EncounterEnded'; encounterId: string }
  | { type: 'CampaignFramed'; frame: CampaignFrame };

export interface GameState {
  version: number;
  actors: Record<string, Actor>;
  encounter: Encounter | null;
  quests: Record<string, Quest>;
  phase: Phase;
  campaignFrame?: CampaignFrame;
}

export const initialState: GameState = { version: 0, actors: {}, encounter: null, quests: {}, phase: INITIAL_PHASE };

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
    case 'ResourceEffectApplied': {
      // Il delta e gia risolto e firmato nell evento (replay-safe, niente RNG nel proiettore).
      // adjustResource clampa current in [0, max], come DamageApplied. Il roll e provenienza,
      // non viene rigiocato.
      const target = adjustResource(requireActor(state, event.targetId), event.resource, event.delta);
      return { ...bumped, actors: { ...state.actors, [event.targetId]: target } };
    }
    case 'QuestStarted':
      return { ...bumped, quests: { ...state.quests, [event.quest.id]: event.quest } };
    case 'QuestAdvanced': {
      const quest = state.quests[event.questId];
      if (quest === undefined) {
        throw new Error(`Quest sconosciuta: ${event.questId}`);
      }
      return { ...bumped, quests: { ...state.quests, [event.questId]: { ...quest, status: event.status } } };
    }
    case 'ActorDowned': {
      const actor = requireActor(state, event.actorId);
      if (actor.conditions.some((c) => c.key === DOWNED_CONDITION_KEY)) {
        return bumped;
      }
      const downed = addCondition(actor, dyingCondition());
      return { ...bumped, actors: { ...state.actors, [event.actorId]: downed } };
    }
    case 'PhaseChanged':
      // 'from' e provenienza (narrazione / confini di scena, item 6): non serve al proiettore.
      return { ...bumped, phase: event.to };
    case 'EncounterEnded':
      // chiude lo scontro; la fase torna non-combat con il PhaseChanged emesso in coppia da decide.
      return { ...bumped, encounter: null };
    case 'CampaignFramed':
      return { ...bumped, campaignFrame: event.frame };
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
