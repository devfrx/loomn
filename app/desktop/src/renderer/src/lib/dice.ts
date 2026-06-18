import type { DispatchResult } from '@loomn/shared';

// Tipi di vista derivati dal CONTRATTO IPC (shared resta la fonte; il renderer NON importa engine).
type OkDispatch = Extract<DispatchResult, { ok: true }>;
export type DomainEventView = OkDispatch['events'][number];
type AttackEv = Extract<DomainEventView, { type: 'AttackResolved' }>;
/** Forma di un tiro-prova (dice + modificatore + total/mode + dc/margin/outcome). */
export type CheckView = AttackEv['check'];
/** Un singolo dado risolto dal motore. */
export type DieView = CheckView['dice'][number];
/** Grado di esito di una prova. */
export type Outcome = CheckView['outcome'];

/** Poliedri che dice-box-threejs sa renderizzare. Tutto il resto -> token numerico (spec 6). */
export const STANDARD_SIDES: ReadonlySet<number> = new Set([4, 6, 8, 10, 12, 20, 100]);

/** Piano di rendering di un tiro: notazione 3D coi valori FORZATI + token per i sides non-standard. */
export interface DicePlan {
  /** Notazione `NdS+MdT@v1,v2,...` per i dadi standard, o null se non ce ne sono. */
  notation: string | null;
  /** Dadi a sides non-standard, da mostrare come chip numerici (non renderizzabili in 3D). */
  tokens: DieView[];
}

/** Traduce i dadi risolti dal motore nel piano di rendering. Pura: nessun RNG, nessun side effect. */
export function toDicePlan(dice: readonly DieView[]): DicePlan {
  const tokens: DieView[] = [];
  // Gruppi per sides, in ordine di prima apparizione.
  const order: number[] = [];
  const byside = new Map<number, number[]>();
  for (const d of dice) {
    if (!STANDARD_SIDES.has(d.sides)) {
      tokens.push(d.tag === undefined ? { sides: d.sides, value: d.value } : { sides: d.sides, value: d.value, tag: d.tag });
      continue;
    }
    if (!byside.has(d.sides)) {
      byside.set(d.sides, []);
      order.push(d.sides);
    }
    byside.get(d.sides)!.push(d.value);
  }
  if (order.length === 0) return { notation: null, tokens };
  const groups = order.map((s) => `${byside.get(s)!.length}d${s}`);
  const values = order.flatMap((s) => byside.get(s)!);
  return { notation: `${groups.join('+')}@${values.join(',')}`, tokens };
}
