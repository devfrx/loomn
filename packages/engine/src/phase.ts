// FSM di fase (spec §5.5): macchina a stati dichiarata. Modulo PURO, single-purpose, isolato
// come difficulty.ts (SP1) e quest.ts (SP3). Nessuna dipendenza da events/commands.

export const PHASES = ['exploration', 'dialogue', 'combat', 'downtime'] as const;
export type Phase = (typeof PHASES)[number];

// Le fasi non-combat: le uniche che l AI puo proporre con enter_phase (combat e modale).
export const SOFT_PHASES = ['exploration', 'dialogue', 'downtime'] as const;
export type SoftPhase = (typeof SOFT_PHASES)[number];

export const INITIAL_PHASE: Phase = 'exploration';

/** Gli ARCHI del grafo di fase (transizioni esplicite e testabili, spec §5.5).
 *  - stessa fase: non e una transizione;
 *  - da combat: si esce SOLO verso exploration (via end_encounter);
 *  - da una fase non-combat: ogni altra fase e raggiungibile (soft<->soft via enter_phase;
 *    soft->combat via start_encounter). */
export function canTransition(from: Phase, to: Phase): boolean {
  if (from === to) return false;
  if (from === 'combat') return to === 'exploration';
  return true;
}
