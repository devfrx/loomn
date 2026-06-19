import type { Actor, ResourcePool } from './actor';

/** Clampa un valore corrente nell intervallo [0, max]. Punto unico dell invariante di risorsa. */
function clampCurrent(current: number, max: number): number {
  return Math.max(0, Math.min(max, current));
}

/** Normalizza un pool: current clampato in [0, max]. Lancia se max e negativo o non finito
 *  (garbage che non puo entrare nello stato). Usato alla CREAZIONE dell attore (decide AddActor),
 *  dove lo spread del vocabolario+input non e altrimenti clampato. Funzione pura. */
export function clampPool(pool: ResourcePool): ResourcePool {
  if (!Number.isFinite(pool.max) || pool.max < 0) {
    throw new Error(`Risorsa con max non valido: ${pool.max}`);
  }
  if (!Number.isFinite(pool.current)) {
    throw new Error(`Risorsa con current non valido: ${pool.current}`);
  }
  return { current: clampCurrent(pool.current, pool.max), max: pool.max };
}

/** Aggiusta una risorsa di `delta`, clampando `current` in [0, max].
 *  Lancia se la risorsa non esiste (precondizione violata). Funzione pura. */
export function adjustResource(actor: Actor, resource: string, delta: number): Actor {
  const pool = actor.resources[resource];
  if (pool === undefined) {
    throw new Error(`Risorsa sconosciuta: ${resource}`);
  }
  const next = clampCurrent(pool.current + delta, pool.max);
  return {
    ...actor,
    resources: { ...actor.resources, [resource]: { current: next, max: pool.max } },
  };
}

/** True se la risorsa e esaurita (current <= 0). Lancia se la risorsa non esiste. */
export function isDepleted(actor: Actor, resource: string): boolean {
  const pool = actor.resources[resource];
  if (pool === undefined) {
    throw new Error(`Risorsa sconosciuta: ${resource}`);
  }
  return pool.current <= 0;
}
