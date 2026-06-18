import { describe, it, expect, beforeEach } from 'vitest';
import { mount, RouterLinkStub } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { useProviderStatusStore } from '../stores/provider-status';
import FirstRunBanner from './FirstRunBanner.vue';

function mountBanner() {
  return mount(FirstRunBanner, { global: { stubs: { RouterLink: RouterLinkStub } } });
}

describe('FirstRunBanner', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.loomn = { getStatus: () => Promise.resolve({ version: 0, safeStorageAvailable: true, providerConfigured: false }) } as unknown as typeof window.loomn;
  });

  it('non mostra nulla finche lo status non e caricato', () => {
    const w = mountBanner();
    expect(w.find('.first-run').exists()).toBe(false);
  });

  it('mostra il banner quando il provider non e configurato', async () => {
    const store = useProviderStatusStore();
    await store.refresh();
    const w = mountBanner();
    expect(w.find('.first-run').exists()).toBe(true);
  });

  it('si nasconde dopo il dismiss', async () => {
    const store = useProviderStatusStore();
    await store.refresh();
    const w = mountBanner();
    await w.find('.first-run__dismiss').trigger('click');
    expect(w.find('.first-run').exists()).toBe(false);
  });

  it('non mostra il banner quando il provider e configurato', async () => {
    window.loomn = { getStatus: () => Promise.resolve({ version: 1, safeStorageAvailable: true, providerConfigured: true, provider: { baseUrl: 'http://x/v1', model: 'm', hasApiKey: true } }) } as unknown as typeof window.loomn;
    const store = useProviderStatusStore();
    await store.refresh();
    const w = mountBanner();
    expect(w.find('.first-run').exists()).toBe(false);
  });
});
