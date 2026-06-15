import type { RandomSource } from './random';
import type { Actor } from './actor';
import type { Modifier } from './dice';
import { createEncounter, type ParticipantInput } from './encounter';
import { performAttack } from './combat';
import type { GameState, DomainEvent } from './events';

export type Command =
  | { type: 'AddActor'; actor: Actor }
  | { type: 'StartEncounter'; encounterId: string; participants: ParticipantInput[] }
  | { type: 'EndTurn' }
  | { type: 'NextRound' }
  | {
      type: 'Attack';
      attackerId: string;
      targetId: string;
      attribute?: string;
      skill?: string;
      defense: string;
      defenseBase: number;
      damageResource: string;
      damageModifiers?: Modifier[];
    };

/** Valida un comando contro lo stato e produce gli eventi risultanti.
 *  L'RNG è consumato dai comandi che lo richiedono (es. Attack). Funzione pura. */
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
    case 'Attack': {
      const attacker = state.actors[command.attackerId];
      const target = state.actors[command.targetId];
      if (attacker === undefined || target === undefined) {
        throw new Error('Attaccante o bersaglio sconosciuto');
      }
      const result = performAttack(
        {
          attacker,
          target,
          defense: command.defense,
          defenseBase: command.defenseBase,
          damageResource: command.damageResource,
          ...(command.attribute !== undefined ? { attribute: command.attribute } : {}),
          ...(command.skill !== undefined ? { skill: command.skill } : {}),
          ...(command.damageModifiers !== undefined ? { damageModifiers: command.damageModifiers } : {}),
        },
        rng,
      );
      const events: DomainEvent[] = [
        { type: 'AttackResolved', attackerId: command.attackerId, targetId: command.targetId, check: result.check, hit: result.hit },
      ];
      if (result.hit) {
        events.push({ type: 'DamageApplied', targetId: command.targetId, resource: command.damageResource, amount: result.damage });
        if (result.downed) {
          events.push({ type: 'ActorDowned', actorId: command.targetId });
        }
      }
      return events;
    }
    default: {
      const _exhaustive: never = command;
      return _exhaustive;
    }
  }
}
