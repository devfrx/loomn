import type { ProviderConfig } from '@loomn/shared';

/** Stato del form provider. keyAction modella la UX tri-stato della chiave (spec 10f §4.2):
 *  keep = mantieni la chiave esistente, set = sostituisci con keyInput, remove = cancella. */
export interface ProviderFormState {
  baseUrl: string;
  model: string;
  keyAction: 'keep' | 'set' | 'remove';
  keyInput: string;
}

/** Costruisce il payload set-provider applicando la semantica tri-stato: keep -> apiKey OMESSO;
 *  set -> apiKey = keyInput; remove -> apiKey = '' (il main, resolveStoredKey, interpreta). */
export function buildProviderPayload(form: ProviderFormState): ProviderConfig {
  const base = { baseUrl: form.baseUrl.trim(), model: form.model.trim() };
  if (form.keyAction === 'set') return { ...base, apiKey: form.keyInput };
  if (form.keyAction === 'remove') return { ...base, apiKey: '' };
  return base;
}
