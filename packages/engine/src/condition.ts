import type { Actor, Condition } from './actor';
import { adjustResource } from './resource';

/** Aggiunge una condizione all'attore. Funzione pura. */
export function addCondition(actor: Actor, condition: Condition): Actor {
  return { ...actor, conditions: [...actor.conditions, condition] };
}

/** Somma i modificatori 'checkModifier' applicabili: globali (appliesTo assente)
 *  più quelli il cui `appliesTo` coincide con `target`. */
export function checkModifierFrom(conditions: Condition[], target?: string): number {
  let total = 0;
  for (const c of conditions) {
    for (const e of c.effects) {
      if (e.kind === 'checkModifier' && (e.appliesTo === undefined || e.appliesTo === target)) {
        total += e.value;
      }
    }
  }
  return total;
}

/** Avanza di un turno: applica gli effetti 'resourcePerTurn', decrementa le durate
 *  'turns' e rimuove le condizioni scadute. Le durate 'scenes'/'permanent' restano.
 *  Funzione pura. */
export function tickConditions(actor: Actor): Actor {
  let next = actor;
  for (const c of actor.conditions) {
    for (const e of c.effects) {
      if (e.kind === 'resourcePerTurn') {
        next = adjustResource(next, e.resource, e.delta);
      }
    }
  }

  const remaining: Condition[] = [];
  for (const c of next.conditions) {
    if (c.duration.kind === 'turns') {
      const left = c.duration.remaining - 1;
      if (left > 0) {
        remaining.push({ ...c, duration: { kind: 'turns', remaining: left } });
      }
    } else {
      remaining.push(c);
    }
  }
  return { ...next, conditions: remaining };
}
