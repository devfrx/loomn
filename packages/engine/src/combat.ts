import type { RandomSource } from './random';
import type { Modifier } from './dice';
import { rollExpression } from './dice';
import type { Actor } from './actor';
import type { CheckResult } from './check';
import { actorCheck, type CheckRequest } from './actor-check';
import { adjustResource, isDepleted } from './resource';
import { addCondition } from './condition';
import { equippedItems, collectItemDice, defenseValue } from './item';

export interface AttackInput {
  attacker: Actor;
  target: Actor;
  attribute?: string;
  skill?: string;
  defense: string; // chiave della difesa del bersaglio (per la CD)
  defenseBase: number; // valore base della difesa
  damageResource: string; // risorsa danneggiata (es. 'hp')
  damageModifiers?: Modifier[];
}

export interface AttackResult {
  check: CheckResult;
  hit: boolean;
  damage: number;
  target: Actor; // bersaglio aggiornato
  downed: boolean;
}

/** Esegue un attacco. Prova-colpo dell'attaccante (con oggetti equipaggiati) contro la
 *  CD = difesa del bersaglio; in caso di colpo, tira i dadi-effetto dell'arma equipaggiata,
 *  applica il danno alla risorsa indicata e segna 'morente' se la risorsa arriva a 0.
 *  Funzione pura; ogni casualità passa per `rng`. */
export function performAttack(input: AttackInput, rng: RandomSource): AttackResult {
  const dc = defenseValue(input.target, input.defense, input.defenseBase);

  const req: CheckRequest = {
    actor: input.attacker,
    includeEquipped: true,
    dc,
    ...(input.attribute !== undefined ? { attribute: input.attribute } : {}),
    ...(input.skill !== undefined ? { skill: input.skill } : {}),
  };
  const check = actorCheck(req, rng);
  const hit =
    check.outcome === 'critical' ||
    check.outcome === 'success' ||
    check.outcome === 'success_at_cost';

  if (!hit) {
    return { check, hit: false, damage: 0, target: input.target, downed: false };
  }

  const damageDice = collectItemDice(equippedItems(input.attacker), 'effect');
  const damageRoll = rollExpression(
    { dice: damageDice, modifiers: input.damageModifiers ?? [], mode: 'effect' },
    rng,
  );
  const damage = damageRoll.total;

  let target = adjustResource(input.target, input.damageResource, -damage);
  const downed = isDepleted(target, input.damageResource);
  if (downed && !target.conditions.some((c) => c.key === 'morente')) {
    target = addCondition(target, {
      key: 'morente',
      source: 'combat',
      effects: [],
      duration: { kind: 'permanent' },
    });
  }

  return { check, hit: true, damage, target, downed };
}
