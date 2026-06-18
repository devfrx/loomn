import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import type { StatusResult } from '@loomn/shared';
import { routes } from '../router';
import { useProviderStatusStore } from '../stores/provider-status';
import { runFirstRun } from './use-first-run';

function router() {
  return createRouter({ history: createMemoryHistory(), routes });
}
function stubStatus(status: StatusResult): void {
  window.loomn = { getStatus: () => Promise.resolve(status) } as unknown as typeof window.loomn;
}

describe('runFirstRun', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('guida a Impostazioni quando nessun provider e configurato', async () => {
    stubStatus({ version: 0, safeStorageAvailable: true, providerConfigured: false });
    const r = router();
    await r.push('/');
    await runFirstRun(r, useProviderStatusStore());
    expect(r.currentRoute.value.name).toBe('settings');
  });

  it('resta dove e quando il provider e gia configurato', async () => {
    stubStatus({
      version: 1,
      safeStorageAvailable: true,
      providerConfigured: true,
      provider: { baseUrl: 'http://x/v1', model: 'm', hasApiKey: true },
    });
    const r = router();
    await r.push('/');
    await runFirstRun(r, useProviderStatusStore());
    expect(r.currentRoute.value.name).toBe('game');
  });
});
