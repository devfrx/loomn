import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { setActivePinia, createPinia } from 'pinia';
import type { ReadModelPush, StatusResult } from '@loomn/shared';
import { routes } from '../router';
import SettingsView from './SettingsView.vue';

const PUSH_WITH_CAMPAIGN = { version: 1, state: { campaignFrame: { id: 'c1' } } } as unknown as ReadModelPush;
const PUSH_NO_CAMPAIGN = { version: 0, state: {} } as unknown as ReadModelPush;

function stub(
  status: StatusResult,
  opts: { setProvider?: ReturnType<typeof vi.fn>; push?: ReadModelPush } = {},
): { setProvider: ReturnType<typeof vi.fn> } {
  const setProvider = opts.setProvider ?? vi.fn(() => Promise.resolve({ ok: true as const }));
  window.loomn = {
    getStatus: () => Promise.resolve(status),
    setProvider,
    getReadModel: vi.fn(() => Promise.resolve(opts.push ?? PUSH_WITH_CAMPAIGN)),
  } as unknown as typeof window.loomn;
  return { setProvider };
}
function mountView() {
  const router = createRouter({ history: createMemoryHistory(), routes });
  return { w: mount(SettingsView, { global: { plugins: [router] } }), router };
}

describe('SettingsView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('pre-compila baseUrl e model dal read-back', async () => {
    stub({ ok: true, version: 1, safeStorageAvailable: true, providerConfigured: true, provider: { baseUrl: 'http://x/v1', model: 'm', hasApiKey: true } });
    const { w } = mountView();
    await flushPromises();
    const inputs = w.findAll('input[type="text"]');
    expect((inputs[0]!.element as HTMLInputElement).value).toBe('http://x/v1');
    expect((inputs[1]!.element as HTMLInputElement).value).toBe('m');
  });

  it('salvando con keyAction keep OMETTE apiKey nel payload', async () => {
    const { setProvider } = stub({ ok: true, version: 1, safeStorageAvailable: true, providerConfigured: true, provider: { baseUrl: 'http://x/v1', model: 'm', hasApiKey: true } });
    const { w } = mountView();
    await flushPromises();
    await w.find('.loomn-btn').trigger('click');
    await flushPromises();
    expect(setProvider).toHaveBeenCalledWith({ baseUrl: 'http://x/v1', model: 'm' });
  });

  it('dopo un salvataggio ok senza campagna naviga a nuova-campagna', async () => {
    stub({ ok: true, version: 0, safeStorageAvailable: true, providerConfigured: false }, { push: PUSH_NO_CAMPAIGN });
    const { w, router } = mountView();
    await flushPromises();
    const inputs = w.findAll('input[type="text"]');
    await inputs[0]!.setValue('http://x/v1');
    await inputs[1]!.setValue('m');
    await w.find('.loomn-btn').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('onboarding');
  });
});
