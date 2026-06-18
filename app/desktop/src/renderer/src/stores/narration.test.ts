import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useNarrationStore } from './narration';

function stubHistory(impl: (req: { before?: number; limit?: number }) => unknown): void {
  window.loomn = { getNarrationHistory: vi.fn(impl) } as unknown as typeof window.loomn;
}

describe('useNarrationStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    stubHistory(() => ({ ok: true, entries: [], hasMore: false }));
  });

  it('parte vuoto e non in pending', () => {
    const s = useNarrationStore();
    expect(s.entries).toEqual([]);
    expect(s.pending).toBe(false);
    expect(s.error).toBeNull();
    expect(s.hasMore).toBe(false);
  });

  it('loadInitial popola la storia in ordine cronologico crescente', async () => {
    stubHistory(() => ({
      ok: true,
      hasMore: true,
      entries: [
        { seq: 3, playerAction: 'a3', narration: 'n3' },
        { seq: 2, playerAction: 'a2', narration: 'n2' },
        { seq: 1, playerAction: 'a1', narration: 'n1' },
      ],
    }));
    const s = useNarrationStore();
    await s.loadInitial();
    expect(s.entries.map((e) => e.narration)).toEqual(['n1', 'n2', 'n3']);
    expect(s.hasMore).toBe(true);
  });

  it('loadOlder pagina con before = seq minima e antepone', async () => {
    const calls: Array<{ before?: number }> = [];
    stubHistory((req) => {
      calls.push(req);
      if (req.before === undefined) {
        return { ok: true, hasMore: true, entries: [{ seq: 3, playerAction: 'a3', narration: 'n3' }] };
      }
      return { ok: true, hasMore: false, entries: [{ seq: 2, playerAction: 'a2', narration: 'n2' }] };
    });
    const s = useNarrationStore();
    await s.loadInitial();
    await s.loadOlder();
    expect(calls[1]?.before).toBe(3);
    expect(s.entries.map((e) => e.narration)).toEqual(['n2', 'n3']);
    expect(s.hasMore).toBe(false);
  });

  it('appendTurn aggiunge una voce in coda (la piu recente)', async () => {
    const s = useNarrationStore();
    await s.loadInitial();
    s.appendTurn('attacco il goblin', 'Il goblin para e ringhia.');
    expect(s.entries.at(-1)?.playerAction).toBe('attacco il goblin');
    expect(s.entries.at(-1)?.narration).toBe('Il goblin para e ringhia.');
  });

  it('loadInitial su esito di errore popola error e non lancia', async () => {
    stubHistory(() => ({ ok: false, error: 'boom' }));
    const s = useNarrationStore();
    await s.loadInitial();
    expect(s.error).toBe('boom');
    expect(s.entries).toEqual([]);
  });
});
