import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { StatusResult } from '@loomn/shared';
import { useProviderStatusStore } from './provider-status';

function stubStatus(status: StatusResult): void {
  window.loomn = { getStatus: () => Promise.resolve(status) } as unknown as typeof window.loomn;
}

describe('useProviderStatusStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // Default sicuro: nessun test dipende dall ordine; i test che servono uno status specifico
    // ri-stubbano con stubStatus.
    window.loomn = {
      getStatus: () => Promise.resolve({ version: 0, safeStorageAvailable: true, providerConfigured: false }),
    } as unknown as typeof window.loomn;
  });

  it('parte non caricato e non configurato', () => {
    const s = useProviderStatusStore();
    expect(s.loaded).toBe(false);
    expect(s.providerConfigured).toBe(false);
    expect(s.canRunTurn).toBe(false);
    expect(s.provider).toBeNull();
  });

  it('refresh popola lo status e il read-back provider', async () => {
    stubStatus({
      version: 1,
      safeStorageAvailable: true,
      providerConfigured: true,
      provider: { baseUrl: 'http://x/v1', model: 'm', hasApiKey: true },
    });
    const s = useProviderStatusStore();
    await s.refresh();
    expect(s.loaded).toBe(true);
    expect(s.providerConfigured).toBe(true);
    expect(s.canRunTurn).toBe(true);
    expect(s.provider?.model).toBe('m');
    expect(s.safeStorageAvailable).toBe(true);
  });

  it('canRunTurn e false quando il provider non e configurato', async () => {
    stubStatus({ version: 0, safeStorageAvailable: true, providerConfigured: false });
    const s = useProviderStatusStore();
    await s.refresh();
    expect(s.canRunTurn).toBe(false);
    expect(s.provider).toBeNull();
  });
});
