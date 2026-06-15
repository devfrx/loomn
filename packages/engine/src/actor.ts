import type { DieGroup, RollMode } from './dice';

export type ActorKind = 'pc' | 'npc';

export interface ResourcePool {
  current: number;
  max: number;
}

export type ConditionEffect =
  | { kind: 'checkModifier'; value: number; appliesTo?: string }
  | { kind: 'resourcePerTurn'; resource: string; delta: number };

export type Duration =
  | { kind: 'turns'; remaining: number }
  | { kind: 'scenes'; remaining: number }
  | { kind: 'permanent' };

export interface Condition {
  key: string;
  source: string;
  effects: ConditionEffect[];
  duration: Duration;
}

export type ItemEffect =
  | { kind: 'contributeDice'; dice: DieGroup[]; mode: RollMode }
  | { kind: 'checkModifier'; value: number; appliesTo?: string }
  | { kind: 'defenseModifier'; defense: string; value: number };

export interface Item {
  id: string;
  name: string;
  equipped: boolean;
  effects: ItemEffect[];
}

export interface Progression {
  xp: number;
  level: number;
}

export interface Actor {
  id: string;
  name: string;
  kind: ActorKind;
  attributes: Record<string, number>;
  skills: Record<string, number>;
  resources: Record<string, ResourcePool>;
  conditions: Condition[];
  items: Item[];
  progression: Progression;
}

/** Valore di un attributo, 0 se assente (i dati definiscono quali esistono). */
export function getAttribute(actor: Actor, key: string): number {
  return actor.attributes[key] ?? 0;
}

/** Valore di un'abilità, 0 se assente. */
export function getSkill(actor: Actor, key: string): number {
  return actor.skills[key] ?? 0;
}
