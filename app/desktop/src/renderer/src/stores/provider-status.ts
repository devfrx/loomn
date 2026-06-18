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

  const loaded = computed<boolean>(() => status.value !== null);
  const providerConfigured = computed<boolean>(() => status.value?.providerConfigured ?? false);
  const provider = computed(() => status.value?.provider ?? null);
  const safeStorageAvailable = computed<boolean>(() => status.value?.safeStorageAvailable ?? false);
  const canRunTurn = computed<boolean>(() => providerConfigured.value);

  return { refresh, loaded, providerConfigured, provider, safeStorageAvailable, canRunTurn };
});
