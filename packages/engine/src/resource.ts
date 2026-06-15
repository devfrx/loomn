import type { Actor } from './actor';

/** Aggiusta una risorsa di `delta`, clampando `current` in [0, max].
 *  Lancia se la risorsa non esiste (precondizione violata). Funzione pura. */
export function adjustResource(actor: Actor, resource: string, delta: number): Actor {
  const pool = actor.resources[resource];
  if (pool === undefined) {
    throw new Error(`Risorsa sconosciuta: ${resource}`);
  }
  const next = Math.max(0, Math.min(pool.max, pool.current + delta));
  return {
    ...actor,
    resources: { ...actor.resources, [resource]: { current: next, max: pool.max } },
  };
}

/** True se la risorsa è esaurita (current <= 0). Lancia se la risorsa non esiste. */
export function isDepleted(actor: Actor, resource: string): boolean {
  const pool = actor.resources[resource];
  if (pool === undefined) {
    throw new Error(`Risorsa sconosciuta: ${resource}`);
  }
  return pool.current <= 0;
}
