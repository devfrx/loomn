import type { RandomSource } from './random';
import type { DieGroup, Modifier, RollExpr } from './dice';
import { resolveCheck, type CheckResult } from './check';
import { getAttribute, getSkill, type Actor } from './actor';
import { checkModifierFrom } from './condition';
import { equippedItems, collectItemDice, collectItemCheckModifier } from './item';

export interface CheckRequest {
  actor: Actor;
  attribute?: string;
  skill?: string;
  baseDice?: DieGroup[];
  situationalModifiers?: Modifier[];
  includeEquipped?: boolean;
  dc: number;
}

/** Compone l'espressione di tiro di una prova a partire dall'attore:
 *  dadi base (default 1d20) + dadi degli oggetti equipaggiati (se includeEquipped)
 *  + attributo + abilità + modificatori da condizioni + da oggetti + situazionali.
 *  Funzione pura. */
export function buildCheckExpr(req: CheckRequest): RollExpr {
  const modifiers: Modifier[] = [];

  if (req.attribute !== undefined) {
    modifiers.push({ value: getAttribute(req.actor, req.attribute), source: `attr:${req.attribute}` });
  }
  if (req.skill !== undefined) {
    modifiers.push({ value: getSkill(req.actor, req.skill), source: `skill:${req.skill}` });
  }

  const condTarget = req.skill ?? req.attribute;
  const condMod = checkModifierFrom(req.actor.conditions, condTarget);
  if (condMod !== 0) {
    modifiers.push({ value: condMod, source: 'conditions' });
  }

  const equipped = req.includeEquipped === true ? equippedItems(req.actor) : [];
  const itemMod = collectItemCheckModifier(equipped, condTarget);
  if (itemMod !== 0) {
    modifiers.push({ value: itemMod, source: 'items' });
  }

  if (req.situationalModifiers !== undefined) {
    modifiers.push(...req.situationalModifiers);
  }

  const baseDice = req.baseDice ?? [{ count: 1, sides: 20 }];
  const dice = [...baseDice, ...collectItemDice(equipped, 'check')];

  return { dice, modifiers, mode: 'check' };
}

/** Esegue una prova dell'attore: costruisce l'espressione e la risolve
 *  in modo deterministico data una RandomSource. */
export function actorCheck(req: CheckRequest, rng: RandomSource): CheckResult {
  return resolveCheck(buildCheckExpr(req), req.dc, rng);
}
