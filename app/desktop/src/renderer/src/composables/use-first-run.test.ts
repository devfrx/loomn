import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import type { ReadModelPush, StatusResult } from '@loomn/shared';
import { routes } from '../router';
import { useProviderStatusStore } from '../stores/provider-status';
import { useReadModelStore } from '../stores/read-model';
import { runFirstRun } from './use-first-run';

function router() {
  return createRouter({ history: createMemoryHistory(), routes });
}
function stub(status: StatusResult, push: ReadModelPush): void {
  window.loomn = {
    getStatus: () => Promise.resolve(status),
    getReadModel: vi.fn(() => Promise.resolve(push)),
  } as unknown as typeof window.loomn;
}
const STATE_NO_CAMPAIGN = { version: 0, state: {} } as unknown as ReadModelPush;
const STATE_WITH_CAMPAIGN = { version: 1, state: { campaignFrame: { id: 'c1' } } } as unknown as ReadModelPush;

describe('runFirstRun', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('guida a Impostazioni quando nessun provider e configurato', async () => {
    stub({ ok: true, version: 0, safeStorageAvailable: true, providerConfigured: false }, STATE_NO_CAMPAIGN);
    const r = router();
    await r.push('/');
    await runFirstRun(r, useProviderStatusStore(), useReadModelStore());
    expect(r.currentRoute.value.name).toBe('settings');
  });

  it('guida a nuova-campagna quando provider ok ma nessuna campagna', async () => {
    stub({ ok: true, version: 0, safeStorageAvailable: true, providerConfigured: true, provider: { baseUrl: 'http://x/v1', model: 'm', hasApiKey: true } }, STATE_NO_CAMPAIGN);
    const r = router();
    await r.push('/');
    await runFirstRun(r, useProviderStatusStore(), useReadModelStore());
    expect(r.currentRoute.value.name).toBe('onboarding');
  });

  it('resta sul Gioco quando provider ok e campagna esiste', async () => {
    stub({ ok: true, version: 1, safeStorageAvailable: true, providerConfigured: true, provider: { baseUrl: 'http://x/v1', model: 'm', hasApiKey: true } }, STATE_WITH_CAMPAIGN);
    const r = router();
    await r.push('/');
    await runFirstRun(r, useProviderStatusStore(), useReadModelStore());
    expect(r.currentRoute.value.name).toBe('game');
  });
});
