import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import type { ReflectResult } from '@loomn/shared';
import JournalView from './JournalView.vue';

function stubFull(): void {
  window.loomn = {
    getNarrationHistory: () => Promise.resolve({ ok: true, entries: [{ seq: 1, playerAction: 'Apro la porta', narration: 'La porta cigola' }], hasMore: false }),
    getSummaries: () => Promise.resolve({ ok: true, summaries: [{ id: 's1', level: 'scene', scope: 'sess-1', text: 'Riassunto della scena', importance: 5, salience: 0.5, createdAt: 1000, eventSeqFrom: 1, eventSeqTo: 3 }] }),
    getCanon: () => Promise.resolve({ ok: true, facts: [{ id: 'f1', subject: 'Eroe', predicate: 'possiede', object: 'spada', eventSeq: 2, salience: 0.8, status: 'active' }] }),
    reflect: vi.fn((): Promise<ReflectResult> => Promise.resolve({ ok: true, factCount: 2, summarized: true })),
  } as unknown as typeof window.loomn;
}

function stubEmpty(): void {
  window.loomn = {
    getNarrationHistory: () => Promise.resolve({ ok: true, entries: [], hasMore: false }),
    getSummaries: () => Promise.resolve({ ok: true, summaries: [] }),
    getCanon: () => Promise.resolve({ ok: true, facts: [] }),
    reflect: vi.fn((): Promise<ReflectResult> => Promise.resolve({ ok: true, factCount: 0, summarized: false })),
  } as unknown as typeof window.loomn;
}

describe('JournalView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    stubFull();
  });

  it('mostra la cronologia della narrazione', async () => {
    const w = mount(JournalView, { global: { plugins: [createPinia()] } });
    await flushPromises();
    expect(w.text()).toContain('Apro la porta');
    expect(w.text()).toContain('La porta cigola');
  });

  it('mostra i riassunti raggruppati per livello', async () => {
    const w = mount(JournalView, { global: { plugins: [createPinia()] } });
    await flushPromises();
    expect(w.text()).toContain('Scena');
    expect(w.text()).toContain('Riassunto della scena');
  });

  it('mostra i fatti canonici', async () => {
    const w = mount(JournalView, { global: { plugins: [createPinia()] } });
    await flushPromises();
    expect(w.text()).toContain('Eroe possiede spada');
  });

  it('Rifletti chiama il trigger col scope e mostra l esito', async () => {
    const reflect = vi.fn((): Promise<ReflectResult> => Promise.resolve({ ok: true, factCount: 2, summarized: true }));
    window.loomn = { ...window.loomn, reflect } as unknown as typeof window.loomn;
    const w = mount(JournalView, { global: { plugins: [createPinia()] } });
    await flushPromises();
    const btn = w.findAll('button').find((b) => b.text() === 'Rifletti');
    expect(btn).toBeDefined();
    await btn!.trigger('click');
    await flushPromises();
    expect(reflect).toHaveBeenCalledWith({ scope: 'sessione' });
    expect(w.text()).toContain('Riflessione completata');
  });

  it('mostra gli stati vuoti senza memoria', async () => {
    stubEmpty();
    const w = mount(JournalView, { global: { plugins: [createPinia()] } });
    await flushPromises();
    expect(w.text()).toContain('Nessuna scena');
    expect(w.text()).toContain('Nessun riassunto');
    expect(w.text()).toContain('Nessun fatto');
  });

  it('mostra l errore del canale read quando una lettura fallisce', async () => {
    window.loomn = {
      getNarrationHistory: () => Promise.resolve({ ok: true, entries: [], hasMore: false }),
      getSummaries: () => Promise.resolve({ ok: true, summaries: [] }),
      getCanon: () => Promise.resolve({ ok: false, error: 'ledger non leggibile' }),
    } as unknown as typeof window.loomn;
    const w = mount(JournalView, { global: { plugins: [createPinia()] } });
    await flushPromises();
    expect(w.find('[role="alert"]').text()).toContain('ledger non leggibile');
  });
});
