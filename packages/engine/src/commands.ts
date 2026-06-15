import type { RandomSource } from './random';
import type { Actor } from './actor';
import { createEncounter, type ParticipantInput } from './encounter';
import type { GameState, DomainEvent } from './events';

export type Command =
  | { type: 'AddActor'; actor: Actor }
  | { type: 'StartEncounter'; encounterId: string; participants: ParticipantInput[] }
  | { type: 'EndTurn' }
  | { type: 'NextRound' };

/** Valida un comando contro lo stato e produce gli eventi risultanti.
 *  L'RNG è disponibile per i comandi che lo richiedono (qui nessuno). Funzione pura. */
export function decide(state: GameState, command: Command, rng: RandomSource): DomainEvent[] {
  switch (command.type) {
    case 'AddActor':
      if (state.actors[command.actor.id] !== undefined) {
        throw new Error(`Attore già presente: ${command.actor.id}`);
      }
      return [{ type: 'ActorAdded', actor: command.actor }];
    case 'StartEncounter': {
      for (const p of command.participants) {
        if (state.actors[p.actorId] === undefined) {
          throw new Error(`Attore sconosciuto: ${p.actorId}`);
        }
      }
      return [{ type: 'EncounterStarted', encounter: createEncounter(command.encounterId, command.participants) }];
    }
    case 'EndTurn':
      if (state.encounter === null) {
        throw new Error('Nessuno scontro attivo');
      }
      return [{ type: 'TurnEnded' }];
    case 'NextRound':
      if (state.encounter === null) {
        throw new Error('Nessuno scontro attivo');
      }
      return [{ type: 'RoundAdvanced' }];
    default: {
      const _exhaustive: never = command;
      return _exhaustive;
    }
  }
}
