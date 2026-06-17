// Segmentazione per scena (item 6): spezza lo stream ai confini di fase per la Reflection.
// I PhaseChanged (SP4) sono i confini naturali di scena. Funzione PURA (come phase.ts):
// nessun IO, deterministica. Vive in memory perche e un concern del write-path della memoria
// (come raggruppare lo stream per riflettere), non una regola di dominio dell engine.
import type { StoredEvent } from '@loomn/engine';

/** Spezza una sequenza di eventi (in ordine di seq) in scene ai confini PhaseChanged.
 *  Regola: un PhaseChanged TERMINA la scena corrente (e l ultimo evento di quella scena);
 *  l evento successivo apre una scena nuova. La coda dopo l ultimo PhaseChanged (fase non
 *  ancora cambiata) e una scena APERTA e viene comunque restituita (flush, spec item 6 §1).
 *  Niente PhaseChanged -> una sola scena (regge spike/sessione mono-fase). Vuoto -> [].
 *  Le scene risultanti sono contigue e NON sovrapposte (gli id derivati restano unici). */
export function segmentScenes(events: StoredEvent[]): StoredEvent[][] {
  const scenes: StoredEvent[][] = [];
  let current: StoredEvent[] = [];
  for (const e of events) {
    current.push(e);
    if (e.event.type === 'PhaseChanged') {
      scenes.push(current);
      current = [];
    }
  }
  if (current.length > 0) scenes.push(current);
  return scenes;
}
