import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import NarrativePanel from './NarrativePanel.vue';
import { useProviderStatusStore } from '../stores/provider-status';
import { useNarrationStore } from '../stores/narration';

function stubLoomn(over: Partial<typeof window.loomn> = {}): void {
  window.loomn = {
    getNarrationHistory: vi.fn(() => Promise.resolve({ ok: true as const, entries: [], hasMore: false })),
    getStatus: vi.fn(() => Promise.resolve({ version: 0, safeStorageAvailable: true, providerConfigured: true })),
    runTurn: vi.fn(() => Promise.resolve({ ok: true as const, narration: 'narrato', version: 1, events: [] })),
    ...over,
  } as unknown as typeof window.loomn;
}

const stubs = { LoomnPanel: { template: '<div><slot /></div>' }, LoomnButton: { template: '<button><slot /></button>' } };

describe('NarrativePanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    stubLoomn();
  });

  it('al mount carica la storia e la mostra', async () => {
    stubLoomn({
      getNarrationHistory: vi.fn(() => Promise.resolve({ ok: true as const, hasMore: false, entries: [{ seq: 1, playerAction: 'guardo', narration: 'La sala e buia.' }] })),
    });
    const w = mount(NarrativePanel, { global: { plugins: [createPinia()], stubs } });
    await flushPromises();
    expect(w.text()).toContain('La sala e buia.');
  });

  it('disabilita l invio quando il provider non e configurato', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const provider = useProviderStatusStore();
    window.loomn = { ...window.loomn, getStatus: vi.fn(() => Promise.resolve({ version: 0, safeStorageAvailable: true, providerConfigured: false })) } as typeof window.loomn;
    await provider.refresh();
    const w = mount(NarrativePanel, { global: { plugins: [pinia], stubs } });
    await flushPromises();
    expect(w.find('textarea').attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('Configura un provider');
  });

  it('quando pending mostra che il Master sta scrivendo', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const narration = useNarrationStore();
    narration.setPending(true);
    const w = mount(NarrativePanel, { global: { plugins: [pinia], stubs } });
    await flushPromises();
    expect(w.text()).toContain('sta scrivendo');
  });

  it('invia l azione e la passa a runTurn', async () => {
    const runTurn = vi.fn(() => Promise.resolve({ ok: true as const, narration: 'esito', version: 1, events: [] }));
    const pinia = createPinia();
    setActivePinia(pinia);
    const provider = useProviderStatusStore();
    stubLoomn({ runTurn });
    await provider.refresh();
    const w = mount(NarrativePanel, { global: { plugins: [pinia], stubs } });
    await flushPromises();
    await w.find('textarea').setValue('apro la porta');
    await w.find('button').trigger('click');
    await flushPromises();
    expect(runTurn).toHaveBeenCalledWith({ playerAction: 'apro la porta' });
    expect(w.text()).toContain('esito');
  });
});
