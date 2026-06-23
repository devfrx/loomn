import type { Router } from 'vue-router';
import { useProviderStatusStore } from '../stores/provider-status';
import { useReadModelStore } from '../stores/read-model';

/** Gate di boot (spec 10f e D-01c): idrata lo status; se nessun provider e configurato guida a
 *  Impostazioni; altrimenti idrata il read-model e, se non esiste una campagna, guida all onboarding.
 *  NON e un hard gate ne un router guard globale: e una rotta one-shot al boot. */
export async function runFirstRun(
  router: Router,
  store: ReturnType<typeof useProviderStatusStore>,
  readModel: ReturnType<typeof useReadModelStore>,
): Promise<void> {
  await store.refresh();
  if (!store.providerConfigured) {
    await router.push('/impostazioni');
    return;
  }
  const push = await window.loomn.getReadModel();
  readModel.applyPush(push);
  if (!readModel.hasCampaign) await router.push('/nuova-campagna');
}
