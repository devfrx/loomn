import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import type { StatusResult } from '@loomn/shared';
import SettingsView from './SettingsView.vue';

function stub(status: StatusResult, setProvider = vi.fn(() => Promise.resolve({ ok: true as const }))): { setProvider: ReturnType<typeof vi.fn> } {
  window.loomn = {
    getStatus: () => Promise.resolve(status),
    setProvider,
  } as unknown as typeof window.loomn;
  return { setProvider };
}

describe('SettingsView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('pre-compila baseUrl e model dal read-back', async () => {
    stub({
      ok: true,
      version: 1,
      safeStorageAvailable: true,
      providerConfigured: true,
      provider: { baseUrl: 'http://x/v1', model: 'm', hasApiKey: true },
    });
    const w = mount(SettingsView);
    await flushPromises();
    const inputs = w.findAll('input[type="text"]');
    expect((inputs[0]!.element as HTMLInputElement).value).toBe('http://x/v1');
    expect((inputs[1]!.element as HTMLInputElement).value).toBe('m');
  });

  it('salvando con keyAction keep OMETTE apiKey nel payload', async () => {
    const { setProvider } = stub({
      ok: true,
      version: 1,
      safeStorageAvailable: true,
      providerConfigured: true,
      provider: { baseUrl: 'http://x/v1', model: 'm', hasApiKey: true },
    });
    const w = mount(SettingsView);
    await flushPromises();
    await w.find('.loomn-btn').trigger('click');
    await flushPromises();
    expect(setProvider).toHaveBeenCalledWith({ baseUrl: 'http://x/v1', model: 'm' });
  });
});
