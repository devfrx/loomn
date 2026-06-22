// coercion.ts — politica di coercizione condivisa per gli argomenti emessi dagli LLM (G1/G6).
// Gli LLM stringificano di routine i numeri ("10") e gli array ("[{...}]"); questi helper
// coerciscono SOLO quelle due forme e restano STRICT: la stringa coerciuta viene passata allo
// schema reale a valle, che rifiuta tutto il resto (niente 0/array silenzioso). Estratti da
// master-tools.ts (tool-path) per essere riusati anche sul write-path della Reflection (F3/G5).
import { z } from 'zod';

// Coerce SOLO una stringa numerica trimmata a numero; lascia tutto il resto invariato (lo schema
// numerico a valle rifiuta vuoto/non-numerico/null/mancante). Politica condivisa da llmNumber e
// llmInt e dagli schemi che compongono coerceNumericString direttamente (es. importance del
// write-path): la regola vive in un solo posto (G1). Resta STRICT: niente 0/garbage silenzioso.
export function coerceNumericString(v: unknown): unknown {
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed === '') return v; // resta stringa -> lo schema numerico la rifiuta
    const n = Number(trimmed);
    return Number.isNaN(n) ? v : n; // numerica -> numero; non-numerica -> resta stringa (rifiutata)
  }
  return v; // number passa; null/undefined arrivano allo schema e sono rifiutati
}

// Gli LLM stringificano i numeri di routine ("defenseBase":"10") e cosi avevano bloccato il
// combattimento nella slice (finding G1). Coerciamo le stringhe numeriche a numero, ma restiamo
// STRICT: stringa vuota/whitespace/non-numerica/null/mancante e RIFIUTATA (niente 0 silenzioso).
// .finite() chiude anche "Infinity"/"-Infinity".
export const llmNumber = z.preprocess(coerceNumericString, z.number().finite());

// Gli LLM stringificano anche gli argomenti ARRAY ("participants":"[{...}]") e cosi avevano
// impedito l avvio dello scontro nella slice (finding G6) e degradato la Reflection (F3/G5).
// Coerciamo una stringa JSON-array ad array delegando poi allo schema reale, ma restiamo STRICT
// come llmNumber: una stringa non-JSON o un JSON che non e un array resta com e e lo schema array
// sottostante la rifiuta (niente array silenzioso). Il vincolo .min(1) vive nello schema avvolto.
export function llmArray<S extends z.ZodTypeAny>(schema: S) {
  return z.preprocess((v) => {
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed === '') return v; // resta stringa -> lo schema array la rifiuta
      try {
        return JSON.parse(trimmed) as unknown; // array -> validato; oggetto/numero -> rifiutato a valle
      } catch {
        return v; // non-JSON -> resta stringa (rifiutata)
      }
    }
    return v; // array passa; null/undefined arrivano allo schema e sono rifiutati
  }, schema);
}

// Coercivo-intero: gemello di llmNumber per i campi che DEVONO essere interi (count/sides dei
// dadi). z.number().int() rifiuta gia decimali, Infinity e NaN; .min(min) il sotto-minimo;
// .max(max) il sopra-massimo (opzionale: la barriera dadi lato AI rispecchia assertDieGroup del
// motore). Factory perche min/max variano per campo e vanno dentro lo schema avvolto dal
// preprocess (un ZodEffects non concatena .int()/.max()).
export function llmInt(min: number, max?: number) {
  const bounded = max !== undefined ? z.number().int().min(min).max(max) : z.number().int().min(min);
  return z.preprocess(coerceNumericString, bounded);
}
