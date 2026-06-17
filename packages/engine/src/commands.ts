import type { RandomSource } from './random';
import type { Actor } from './actor';
import { rollExpression, type Modifier, type DieGroup, type RollExpr } from './dice';
import { createEncounter, type ParticipantInput } from './encounter';
import { performAttack } from './combat';
import type { GameState, DomainEvent } from './events';
import { actorCheck } from './actor-check';
import { dcForDifficulty, type Difficulty } from './difficulty';
import type { Quest, QuestOutcome } from './quest';

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
    }
  | { type: 'RequestCheck'; actorId: string; attribute?: string; skill?: string; difficulty: Difficulty }
  | { type: 'ApplyEffect'; targetId: string; resource: string; direction: 'restore' | 'drain'; dice: DieGroup[]; bonus?: number }
  | { type: 'StartQuest'; id: string; title: string; description?: string }
  | { type: 'AdvanceQuest'; questId: string; status: QuestOutcome };

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
    case 'RequestCheck': {
      const actor = state.actors[command.actorId];
      if (actor === undefined) {
        throw new Error(`Attore sconosciuto: ${command.actorId}`);
      }
      const result = actorCheck(
        {
          actor,
          includeEquipped: true,
          dc: dcForDifficulty(command.difficulty),
          ...(command.attribute !== undefined ? { attribute: command.attribute } : {}),
          ...(command.skill !== undefined ? { skill: command.skill } : {}),
        },
        rng,
      );
      return [
        {
          type: 'CheckResolved',
          actorId: command.actorId,
          difficulty: command.difficulty,
          result,
          ...(command.attribute !== undefined ? { attribute: command.attribute } : {}),
          ...(command.skill !== undefined ? { skill: command.skill } : {}),
        },
      ];
    }
    case 'ApplyEffect': {
      const target = state.actors[command.targetId];
      if (target === undefined) {
        throw new Error(`Attore sconosciuto: ${command.targetId}`);
      }
      if (target.resources[command.resource] === undefined) {
        throw new Error(`Risorsa sconosciuta: ${command.resource}`);
      }
      const expr: RollExpr = {
        dice: command.dice,
        modifiers: command.bonus !== undefined ? [{ value: command.bonus, source: 'effect' }] : [],
        mode: 'effect',
      };
      const roll = rollExpression(expr, rng);
      const magnitude = Math.max(0, roll.total); // restore non drena mai, e viceversa
      const delta = command.direction === 'restore' ? magnitude : -magnitude;
      return [{ type: 'ResourceEffectApplied', targetId: command.targetId, resource: command.resource, delta, roll }];
    }
    case 'StartQuest': {
      if (state.quests[command.id] !== undefined) {
        throw new Error(`Quest già presente: ${command.id}`);
      }
      const quest: Quest = {
        id: command.id,
        title: command.title,
        status: 'active',
        ...(command.description !== undefined ? { description: command.description } : {}),
      };
      return [{ type: 'QuestStarted', quest }];
    }
    case 'AdvanceQuest': {
      const quest = state.quests[command.questId];
      if (quest === undefined) {
        throw new Error(`Quest sconosciuta: ${command.questId}`);
      }
      if (quest.status !== 'active') {
        throw new Error(`Quest già terminata (${quest.status}): ${command.questId}`);
      }
      return [{ type: 'QuestAdvanced', questId: command.questId, status: command.status }];
    }
    default: {
      const _exhaustive: never = command;
      return _exhaustive;
    }
  }
}
