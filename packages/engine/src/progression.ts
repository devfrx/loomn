import type { Actor } from './actor';

/** Aggiunge XP all'attore. Funzione pura. */
export function awardXp(actor: Actor, amount: number): Actor {
  return {
    ...actor,
    progression: { ...actor.progression, xp: actor.progression.xp + amount },
  };
}

/** Livello dato l'XP cumulativo e le soglie (XP cumulativo richiesto per liv. 2, 3, …,
 *  in ordine crescente). Livello 1 = 0 XP.
 *  Precondizione: le soglie devono essere ordinate in modo crescente; un input non
 *  ordinato produce risultati errati (il ciclo si interrompe alla prima soglia non raggiunta). */
export function levelFor(xp: number, thresholds: number[]): number {
  let level = 1;
  for (const t of thresholds) {
    if (xp >= t) {
      level += 1;
    } else {
      break;
    }
  }
  return level;
}

/** Ricalcola il livello dell'attore dal suo XP secondo le soglie. Funzione pura. */
export function applyProgression(actor: Actor, thresholds: number[]): Actor {
  const level = levelFor(actor.progression.xp, thresholds);
  return { ...actor, progression: { ...actor.progression, level } };
}

/** Avanzamento a milestone: incrementa il livello di 1 (ignora l'XP). Funzione pura. */
export function advanceMilestone(actor: Actor): Actor {
  return {
    ...actor,
    progression: { ...actor.progression, level: actor.progression.level + 1 },
  };
}
