import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { StatusResult } from '@loomn/shared';

/** Stato del provider AI (read-side, 10f): get-status reattivo. Unica sorgente per gating first-run,
 *  pre-fill di Impostazioni e il segnale canRunTurn (il turno, AI-dipendente, lo consumera 10b). */
export const useProviderStatusStore = defineStore('providerStatus', () => {
  const status = ref<StatusResult | null>(null);

  /** Rilegge get-status (al boot e dopo ogni set-provider ok). */
  async function refresh(): Promise<void> {
    status.value = await window.loomn.getStatus();
  }

  /** True solo sull arm ok: i getter degradano in sicurezza sull arm di errore. */
  const ok = computed<boolean>(() => status.value?.ok === true);
  const loaded = computed<boolean>(() => status.value !== null);
  const providerConfigured = computed<boolean>(() =>
    status.value?.ok === true ? status.value.providerConfigured : false,
  );
  const provider = computed(() => (status.value?.ok === true ? (status.value.provider ?? null) : null));
  const safeStorageAvailable = computed<boolean>(() =>
    status.value?.ok === true ? status.value.safeStorageAvailable : false,
  );
  const canRunTurn = computed<boolean>(() => providerConfigured.value);
  /** Messaggio dell arm di errore (null su ok/non caricato). Il surfacing in UI e di F5/F6. */
  const error = computed<string | null>(() =>
    status.value !== null && status.value.ok === false ? status.value.error : null,
  );

  return { refresh, ok, loaded, providerConfigured, provider, safeStorageAvailable, canRunTurn, error };
});
