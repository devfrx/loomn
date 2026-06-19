import type { Actor, Condition } from './actor';
import { adjustResource } from './resource';

/** Chiave canonica della condizione "a terra" (morente). Single-source nel motore: referenziata
 *  da applyEvent(ActorDowned). Esposta dal barrel; il renderer la consuma via il DTO get-ruleset
 *  (non importa engine per il dominio). Sostituisce i literal sparsi (rischio di drift). */
export const DOWNED_CONDITION_KEY = 'morente';

/** Costruisce la condizione "morente" permanente applicata a chi va a 0 sulla risorsa di combat. */
export function dyingCondition(): Condition {
  return { key: DOWNED_CONDITION_KEY, source: 'combat', effects: [], duration: { kind: 'permanent' } };
}

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
