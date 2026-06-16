// Salienza (spec 6.1): importanza x ricorrenza, stile Generative Agents. Funzione PURA:
// l importanza (1..10 dall estrattore) e normalizzata a (0,1]; la ricorrenza (quante volte
// il soggetto compare gia) la amplifica; il risultato sta in [0.1,1] (clamp a 1). La RECENCY non e
// qui: e a tempo di lettura (8c), che decade il punteggio in base a `created_at` (Clock).
export interface SalienceInput {
  /** Importanza del ricordo (1..10); valori fuori range vengono clampati. */
  importance: number;
  /** Quante volte il soggetto compare gia (>= 0); valori negativi trattati come 0. */
  recurrence: number;
}

/** Peso della ricorrenza nel boost moltiplicativo. Tarabile (spec 13). */
const RECURRENCE_WEIGHT = 0.1;

/** Punteggio di salienza in [0.1, 1] (importanza minima 1 -> 0.1). Deterministico, arrotondato
 *  a 6 decimali per stabilita. */
export function scoreSalience(input: SalienceInput): number {
  const importance = Math.min(10, Math.max(1, input.importance)) / 10;
  const recurrence = Math.max(0, input.recurrence);
  const raw = importance * (1 + RECURRENCE_WEIGHT * recurrence);
  const clamped = Math.min(1, raw);
  return Math.round(clamped * 1e6) / 1e6;
}
