// Porta Clock: il tempo e iniettato (mai Date.now -> purezza/test stabili, house rule).
// La Reflection lo usa per timbrare `created_at` sui riassunti (riferimento di recency per
// il punteggio a tempo di lettura, Piano 8c). Coerente con il Clock previsto al Piano 9.
export interface Clock {
  /** Tempo corrente in millisecondi dall epoch. */
  now(): number;
}
