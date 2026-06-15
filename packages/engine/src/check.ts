import type { RandomSource } from './random';
import { rollExpression, type RollExpr, type RollResult } from './dice';

export type Outcome =
  | 'critical'
  | 'success'
  | 'success_at_cost'
  | 'failure'
  | 'disaster';

export interface CheckResult extends RollResult {
  dc: number;
  margin: number;
  outcome: Outcome;
}

/** Mappa il margine (total - dc) sul grado di successo. Soglie di default. */
export function outcomeFromMargin(margin: number): Outcome {
  if (margin >= 10) return 'critical';
  if (margin >= 5) return 'success';
  if (margin >= 0) return 'success_at_cost';
  if (margin > -10) return 'failure';
  return 'disaster';
}

/** Risolve una prova: tira l'espressione, confronta con dc, calcola l'esito. */
export function resolveCheck(
  expr: RollExpr,
  dc: number,
  rng: RandomSource,
): CheckResult {
  const roll = rollExpression(expr, rng);
  const margin = roll.total - dc;
  return { ...roll, dc, margin, outcome: outcomeFromMargin(margin) };
}
