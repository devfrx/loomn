import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { CanonResult, SummariesResult, ReflectResult } from '@loomn/shared';
import { useJournalStore } from './journal';

const SUMS: SummariesResult = {
  ok: true,
  summaries: [{ id: 's1', level: 'scene', scope: 'sess-1', text: 'scena', importance: 5, salience: 0.5, createdAt: 1000, eventSeqFrom: 1, eventSeqTo: 3 }],
};
const CANON: CanonResult = { ok: true, facts: [{ id: 'f1', subject: 'Eroe', predicate: 'possiede', object: 'spada', eventSeq: 2, salience: 0.8, status: 'active' }] };

function stub(over: Partial<Record<'getSummaries' | 'getCanon' | 'reflect', unknown>>): void {
  window.loomn = {
    getSummaries: vi.fn(() => Promise.resolve(SUMS)),
    getCanon: vi.fn(() => Promise.resolve(CANON)),
    reflect: vi.fn((): Promise<ReflectResult> => Promise.resolve({ ok: true, factCount: 2, summarized: true })),
    ...over,
  } as unknown as typeof window.loomn;
}

describe('useJournalStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    stub({});
  });

  it('load popola riassunti e canon su esito ok', async () => {
    const store = useJournalStore();
    await store.load();
    expect(store.summaries.map((s) => s.id)).toEqual(['s1']);
    expect(store.canon.map((f) => f.id)).toEqual(['f1']);
    expect(store.error).toBeNull();
  });

  it('load imposta error se un canale fallisce', async () => {
    stub({ getCanon: vi.fn(() => Promise.resolve({ ok: false, error: 'ledger ko' })) });
    const store = useJournalStore();
    await store.load();
    expect(store.summaries.map((s) => s.id)).toEqual(['s1']);
    expect(store.error).toBe('ledger ko');
  });

  it('su un canale fallito conserva l elenco gia caricato per quel canale', async () => {
    const store = useJournalStore();
    await store.load();
    expect(store.canon.map((f) => f.id)).toEqual(['f1']);
    stub({ getCanon: vi.fn(() => Promise.resolve({ ok: false, error: 'ledger ko' })) });
    await store.load();
    expect(store.canon.map((f) => f.id)).toEqual(['f1']);
    expect(store.error).toBe('ledger ko');
  });

  it('runReflect ok pubblica il messaggio e ricarica', async () => {
    const reflect = vi.fn((): Promise<ReflectResult> => Promise.resolve({ ok: true, factCount: 2, summarized: true }));
    const getCanon = vi.fn(() => Promise.resolve(CANON));
    stub({ reflect, getCanon });
    const store = useJournalStore();
    await store.runReflect('sessione');
    expect(reflect).toHaveBeenCalledWith({ scope: 'sessione' });
    expect(store.reflectInfo).toContain('2 fatti');
    expect(getCanon).toHaveBeenCalledTimes(1);
  });

  it('runReflect non ok pubblica l errore e non ricarica', async () => {
    const getCanon = vi.fn(() => Promise.resolve(CANON));
    stub({ reflect: vi.fn((): Promise<ReflectResult> => Promise.resolve({ ok: false, error: 'nessun provider' })), getCanon });
    const store = useJournalStore();
    await store.runReflect('sessione');
    expect(store.reflectInfo).toContain('nessun provider');
    expect(getCanon).not.toHaveBeenCalled();
  });
});
