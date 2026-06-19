import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { takeSnapshot, rebuild, type Actor, type DomainEvent } from '@loomn/engine';
import { openDatabase } from './db';
import { events } from './schema';
import { createSqliteEventStore } from './sqlite-event-store';

function actor(id: string): Actor {
  return {
    id,
    name: id,
    kind: 'npc',
    attributes: {},
    skills: {},
    resources: { hp: { current: 10, max: 10 } },
    conditions: [],
    items: [],
    progression: { xp: 0, level: 1 },
  };
}

const evs: DomainEvent[] = [
  { type: 'ActorAdded', actor: actor('goblin') },
  { type: 'DamageApplied', targetId: 'goblin', resource: 'hp', amount: 3 },
  { type: 'DamageApplied', targetId: 'goblin', resource: 'hp', amount: 3 },
];

describe('createSqliteEventStore - persistenza su file', () => {
  it('persiste gli eventi tra riaperture dello stesso file (migrazione idempotente)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loomn-mem-'));
    const path = join(dir, 'campaign.db');
    try {
      const a = createSqliteEventStore(path);
      a.append(evs, 0);
      a.close();
      const b = createSqliteEventStore(path);
      expect(b.version()).toBe(3);
      expect(b.load().map((s) => s.seq)).toEqual([1, 2, 3]);
      b.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('createSqliteEventStore - isolamento e validazione', () => {
  it('load restituisce oggetti freschi: mutare un evento caricato non altera un load successivo', () => {
    const store = createSqliteEventStore(':memory:');
    store.append([{ type: 'ActorAdded', actor: actor('goblin') }], 0);
    const first = store.load()[0];
    if (first !== undefined && first.event.type === 'ActorAdded') {
      first.event.actor.name = 'MUTATO';
    }
    const second = store.load()[0];
    const name = second !== undefined && second.event.type === 'ActorAdded' ? second.event.actor.name : '';
    expect(name).toBe('goblin');
    store.close();
  });

  it('load lancia se un payload memorizzato e malformato (validazione Zod al confine)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loomn-mem-'));
    const path = join(dir, 'corrupt.db');
    try {
      const inject = openDatabase(path);
      inject.db.insert(events).values({ type: 'DamageApplied', payload: '{"type":"DamageApplied"}' }).run();
      inject.close();
      const store = createSqliteEventStore(path);
      expect(() => store.load()).toThrow(ZodError);
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('createSqliteEventStore - snapshot', () => {
  it('latestSnapshot e undefined quando non ci sono snapshot', () => {
    const store = createSqliteEventStore(':memory:');
    expect(store.latestSnapshot()).toBeUndefined();
    store.close();
  });

  it('saveSnapshot e latestSnapshot fanno round-trip dello stato attraverso il DB', () => {
    const store = createSqliteEventStore(':memory:');
    store.append(evs, 0);
    const snap = takeSnapshot(rebuild(store.load()));
    store.saveSnapshot(snap);
    expect(store.latestSnapshot()).toEqual(snap);
    store.close();
  });

  it('persiste lo snapshot su file tra riaperture', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loomn-mem-'));
    const path = join(dir, 'snap.db');
    try {
      const a = createSqliteEventStore(path);
      a.append(evs, 0);
      const snap = takeSnapshot(rebuild(a.load()));
      a.saveSnapshot(snap);
      a.close();
      const b = createSqliteEventStore(path);
      expect(b.latestSnapshot()).toEqual(snap);
      b.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('createSqliteEventStore - letture finestrate (I-05/M-03)', () => {
  const narr = (action: string, text: string): DomainEvent => ({
    type: 'NarrationRecorded',
    playerAction: action,
    narration: text,
  });

  it('loadSince ritorna solo gli eventi con seq maggiore della soglia, in ordine', () => {
    const store = createSqliteEventStore(':memory:');
    try {
      store.append(evs, 0); // 3 eventi: seq 1,2,3
      expect(store.loadSince(0).map((s) => s.seq)).toEqual([1, 2, 3]);
      expect(store.loadSince(2).map((s) => s.seq)).toEqual([3]);
      expect(store.loadSince(3)).toEqual([]);
    } finally {
      store.close();
    }
  });

  it('loadNarration ritorna i soli NarrationRecorded, newest-first, rispettando il limit', () => {
    const store = createSqliteEventStore(':memory:');
    try {
      store.append([narr('a1', 'n1'), { type: 'TurnEnded' }, narr('a2', 'n2'), narr('a3', 'n3')], 0);
      const all = store.loadNarration({ limit: 50 });
      expect(all.map((s) => s.seq)).toEqual([4, 3, 1]); // newest-first, salta il TurnEnded
      const page = store.loadNarration({ limit: 2 });
      expect(page.map((s) => s.seq)).toEqual([4, 3]);
    } finally {
      store.close();
    }
  });

  it('loadNarration con before pagina gli eventi con seq minore del cursore', () => {
    const store = createSqliteEventStore(':memory:');
    try {
      store.append([narr('a1', 'n1'), narr('a2', 'n2'), narr('a3', 'n3')], 0); // seq 1,2,3
      expect(store.loadNarration({ before: 3, limit: 50 }).map((s) => s.seq)).toEqual([2, 1]);
      expect(store.loadNarration({ before: 2, limit: 50 }).map((s) => s.seq)).toEqual([1]);
    } finally {
      store.close();
    }
  });

  it('loadNarration NON parsa le righe non-narrazione fuori dal filtro (niente Zod sull intero stream)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loomn-mem-'));
    const path = join(dir, 'win.db');
    try {
      const inject = openDatabase(path);
      // Riga NON-narrazione con payload corrotto: load() ci morirebbe sopra; loadNarration la filtra DB-side.
      inject.db.insert(events).values({ type: 'DamageApplied', payload: '{"type":"DamageApplied"}' }).run();
      inject.db.insert(events).values({ type: 'NarrationRecorded', payload: JSON.stringify(narr('a', 'storia')) }).run();
      inject.close();
      const store = createSqliteEventStore(path);
      const got = store.loadNarration({ limit: 50 });
      expect(got.map((s) => s.seq)).toEqual([2]); // solo la narrazione; la riga corrotta non e mai parsata
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loadSince NON parsa gli eventi sotto la soglia (finestra fresca)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loomn-mem-'));
    const path = join(dir, 'since.db');
    try {
      const inject = openDatabase(path);
      inject.db.insert(events).values({ type: 'DamageApplied', payload: '{"type":"DamageApplied"}' }).run(); // seq 1 corrotto
      inject.db.insert(events).values({ type: 'NarrationRecorded', payload: JSON.stringify(narr('a', 'storia')) }).run(); // seq 2 valido
      inject.close();
      const store = createSqliteEventStore(path);
      expect(store.loadSince(1).map((s) => s.seq)).toEqual([2]); // la riga 1 corrotta non e parsata
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
