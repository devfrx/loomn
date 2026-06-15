import type { RandomSource } from './random';

export type RollMode = 'check' | 'effect';

export interface DieGroup {
  count: number;
  sides: number;
  tag?: string;
}

export interface Modifier {
  value: number;
  source: string;
}

export interface RollExpr {
  dice: DieGroup[];
  modifiers: Modifier[];
  mode: RollMode;
}

export interface DieResult {
  sides: number;
  value: number;
  tag?: string;
}

export interface RollResult {
  dice: DieResult[];
  modifierTotal: number;
  total: number;
  mode: RollMode;
}

/** Risolve un'espressione di dadi in modo deterministico data una RandomSource. */
export function rollExpression(expr: RollExpr, rng: RandomSource): RollResult {
  const dice: DieResult[] = [];
  for (const group of expr.dice) {
    for (let i = 0; i < group.count; i++) {
      const value = 1 + Math.floor(rng.next() * group.sides);
      dice.push(
        group.tag === undefined
          ? { sides: group.sides, value }
          : { sides: group.sides, value, tag: group.tag },
      );
    }
  }
  const diceTotal = dice.reduce((sum, d) => sum + d.value, 0);
  const modifierTotal = expr.modifiers.reduce((sum, m) => sum + m.value, 0);
  return { dice, modifierTotal, total: diceTotal + modifierTotal, mode: expr.mode };
}
