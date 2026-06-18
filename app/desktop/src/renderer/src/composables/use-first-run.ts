import type { Router } from 'vue-router';
import { useProviderStatusStore } from '../stores/provider-status';

/** First-run (spec 10f §4.3): idrata lo status e, se nessun provider e configurato, guida a
 *  Impostazioni UNA volta (chiamato al boot). NON e un hard gate: dopo, l utente naviga libero. */
export async function runFirstRun(
  router: Router,
  store: ReturnType<typeof useProviderStatusStore>,
): Promise<void> {
  await store.refresh();
  if (!store.providerConfigured) await router.push('/impostazioni');
}
