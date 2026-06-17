import type { RandomSource } from './random';
import type { Actor } from './actor';
import { rollExpression, type Modifier, type DieGroup, type RollExpr } from './dice';
import { createEncounter, type ParticipantInput } from './encounter';
import { performAttack } from './combat';
import type { GameState, DomainEvent } from './events';
import { actorCheck } from './actor-check';
import type { Difficulty } from './difficulty';
import type { Ruleset } from './ruleset';
import type { Quest, QuestOutcome } from './quest';
import type { Phase } from './phase';
import { canTransition, type SoftPhase } from './phase';

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
  | { type: 'AdvanceQuest'; questId: string; status: QuestOutcome }
  | { type: 'EnterPhase'; to: SoftPhase }
  | { type: 'EndEncounter' };

// Lancia se key non e nel set, elencando i valori legali (l errore reiniettato fa auto-correggere
// il loop agentico). Il vocabolario e iniettato: "legale" = membership, non per-attore.
function requireMember(set: ReadonlySet<string>, key: string, kind: string): void {
  if (!set.has(key)) {
    const legal = [...set].join(', ') || '(nessuno)';
    throw new Error(`${kind} sconosciuto: ${key}. Validi: ${legal}`);
  }
}

// Action-set per fase (spec §5.5). Co-locato con Command/decide: la legalita di fase e una
// proprieta del vocabolario di comandi. phase.ts resta puro (stati + archi).
// Un Command non elencato in nessun set e phase-agnostico (default voluto, la maggioranza dei
// comandi). Aggiungilo a un set SOLO quando la restrizione di fase e imposta dallo spec.
const COMBAT_ONLY = new Set<Command['type']>(['Attack', 'EndTurn', 'NextRound', 'EndEncounter']);
const NON_COMBAT_ONLY = new Set<Command['type']>(['StartEncounter', 'EnterPhase']);

/** Un comando e legale nella fase data? combat-only solo in combat; i comandi di ingresso in
 *  ogni fase tranne combat (combat e modale); tutto il resto e phase-agnostic. */
export function isCommandLegalInPhase(phase: Phase, type: Command['type']): boolean {
  if (COMBAT_ONLY.has(type)) return phase === 'combat';
  if (NON_COMBAT_ONLY.has(type)) return phase !== 'combat';
  return true;
}

/** Valida un comando contro lo stato e produce gli eventi risultanti.
 *  L'RNG è consumato dai comandi che lo richiedono (es. Attack). Funzione pura. */
export function decide(state: GameState, command: Command, rng: RandomSource, ruleset: Ruleset): DomainEvent[] {
  if (!isCommandLegalInPhase(state.phase, command.type)) {
    throw new Error(`Azione ${command.type} non disponibile in fase ${state.phase}`);
  }
  switch (command.type) {
    case 'AddActor': {
      if (state.actors[command.actor.id] !== undefined) {
        throw new Error(`Attore già presente: ${command.actor.id}`);
      }
      const vocab = ruleset.vocabulary;
      for (const k of Object.keys(command.actor.attributes)) requireMember(vocab.attributes, k, 'Attributo');
      for (const k of Object.keys(command.actor.skills)) requireMember(vocab.skills, k, 'Abilita');
      for (const k of Object.keys(command.actor.resources)) requireMember(vocab.resources, k, 'Risorsa');
      // Auto-fill combat-ready: le risorse mancanti dal template; quelle fornite sovrascrivono.
      const resources = { ...vocab.defaultResources, ...command.actor.resources };
      return [{ type: 'ActorAdded', actor: { ...command.actor, resources } }];
    }
    case 'StartEncounter': {
      for (const p of command.participants) {
        if (state.actors[p.actorId] === undefined) {
          throw new Error(`Attore sconosciuto: ${p.actorId}`);
        }
      }
      return [
        { type: 'EncounterStarted', encounter: createEncounter(command.encounterId, command.participants) },
        { type: 'PhaseChanged', from: state.phase, to: 'combat' },
      ];
    }
    case 'EndTurn':
      return [{ type: 'TurnEnded' }];
    case 'NextRound':
      return [{ type: 'RoundAdvanced' }];
    case 'Attack': {
      const attacker = state.actors[command.attackerId];
      const target = state.actors[command.targetId];
      if (attacker === undefined || target === undefined) {
        throw new Error('Attaccante o bersaglio sconosciuto');
      }
      const vocab = ruleset.vocabulary;
      if (command.attribute !== undefined) requireMember(vocab.attributes, command.attribute, 'Attributo');
      if (command.skill !== undefined) requireMember(vocab.skills, command.skill, 'Abilita');
      requireMember(vocab.defenses, command.defense, 'Difesa');
      requireMember(vocab.resources, command.damageResource, 'Risorsa');
      if (target.resources[command.damageResource] === undefined) {
        throw new Error(`Risorsa sconosciuta: ${command.damageResource}`);
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
      if (command.attribute !== undefined) requireMember(ruleset.vocabulary.attributes, command.attribute, 'Attributo');
      if (command.skill !== undefined) requireMember(ruleset.vocabulary.skills, command.skill, 'Abilita');
      const result = actorCheck(
        {
          actor,
          includeEquipped: true,
          dc: ruleset.dcForDifficulty(command.difficulty),
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
      requireMember(ruleset.vocabulary.resources, command.resource, 'Risorsa');
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
    case 'EnterPhase': {
      if (!canTransition(state.phase, command.to)) {
        throw new Error(`Transizione di fase non valida: ${state.phase} -> ${command.to}`);
      }
      return [{ type: 'PhaseChanged', from: state.phase, to: command.to }];
    }
    case 'EndEncounter': {
      const enc = state.encounter; // il gate garantisce phase==='combat' => enc!==null
      if (enc === null) {
        throw new Error('Nessuno scontro attivo'); // difesa in profondita (invariante mai violata)
      }
      return [
        { type: 'EncounterEnded', encounterId: enc.id },
        { type: 'PhaseChanged', from: 'combat', to: 'exploration' },
      ];
    }
    default: {
      const _exhaustive: never = command;
      return _exhaustive;
    }
  }
}
