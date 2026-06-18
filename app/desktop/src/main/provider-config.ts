// Logica PURA della config provider (nessun import electron): testabile su ABI Node/jsdom. La
// cifratura (safeStorage) e iniettata, cosi settings.ts la cabla e questo modulo resta verificabile.

/** Tri-stato della chiave nel salvataggio (anti-footgun, spec 10f §2.4): apiKey undefined (campo
 *  lasciato vuoto) = MANTIENI il ciphertext esistente; '' (azione esplicita rimuovi) = RIMUOVI;
 *  stringa non vuota = SOSTITUISCI (cifra). Ritorna il ciphertext da persistere, o undefined. */
export function resolveStoredKey(
  apiKey: string | undefined,
  priorEnc: string | undefined,
  encrypt: (plain: string) => string,
): string | undefined {
  if (apiKey === undefined) return priorEnc;
  if (apiKey === '') return undefined;
  return encrypt(apiKey);
}
