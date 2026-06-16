// L2/L1.5 read path — Context Assembler (spec 6.2). Questo modulo vive in `memory` (legge i
// propri store L1.5/L2 e il GameState/L1 da engine; NON importa `ai`). Qui i due helper PURI:
// la stima dei token (porta iniettabile, default char/4) e il peso di recency a tempo di
// lettura (decadimento sul createdAt, "now" dalla porta Clock). La factory e nel resto del file.

const MS_PER_HOUR = 3_600_000;

/** Euristica token di default: circa 4 caratteri per token (Math.ceil). */
export function defaultEstimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Peso di recency a tempo di lettura (stile Generative Agents): decay^(ore trascorse).
 *  Eta negativa (createdAt nel futuro, es. clock di test) trattata come 0 -> peso 1.
 *  Deterministico dato (now, createdAt, decayPerHour). */
export function recencyWeight(now: number, createdAt: number, decayPerHour: number): number {
  const ageHours = Math.max(0, now - createdAt) / MS_PER_HOUR;
  return Math.pow(decayPerHour, ageHours);
}
