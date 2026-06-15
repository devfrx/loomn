import type { RandomSource } from './random';
import type { DieGroup, Modifier, RollExpr } from './dice';
import { resolveCheck, type CheckResult } from './check';
import { getAttribute, getSkill, type Actor } from './actor';
import { checkModifierFrom } from './condition';

export interface CheckRequest {
  actor: Actor;
  attribute?: string;
  skill?: string;
  baseDice?: DieGroup[];
  situationalModifiers?: Modifier[];
  dc: number;
}

/** Compone l'espressione di tiro di una prova a partire dall'attore:
 *  dadi base (default 1d20) + attributo + abilità + modificatori da condizioni
 *  + modificatori situazionali. Funzione pura. */
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

  if (req.situationalModifiers !== undefined) {
    modifiers.push(...req.situationalModifiers);
  }

  return {
    dice: req.baseDice ?? [{ count: 1, sides: 20 }],
    modifiers,
    mode: 'check',
  };
}

/** Esegue una prova dell'attore: costruisce l'espressione e la risolve
 *  in modo deterministico data una RandomSource. */
export function actorCheck(req: CheckRequest, rng: RandomSource): CheckResult {
  return resolveCheck(buildCheckExpr(req), req.dc, rng);
}
