import { describe, it, expect, afterEach } from 'vitest';
import { type Actor, type DomainEvent } from '@loomn/engine';
import { openDatabase, type OpenDb } from './db';
import { createSqliteEventStoreOn } from './sqlite-event-store';
import { createCanonLedger } from './canon-ledger';

let open: OpenDb | undefined;
afterEach(() => {
  open?.close();
  open = undefined;
});

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
];

describe('createSqliteEventStoreOn - handle condiviso', () => {
  it('append e load funzionano su un handle Drizzle gia aperto', () => {
    open = openDatabase(':memory:');
    const store = createSqliteEventStoreOn(open.db);
    expect(store.version()).toBe(0);
    expect(store.append(evs, 0)).toBe(2);
    expect(store.load().map((s) => s.seq)).toEqual([1, 2]);
    expect(store.version()).toBe(2);
  });

  it('event store e Canon Ledger condividono la stessa connessione e si vedono a vicenda', () => {
    open = openDatabase(':memory:');
    const store = createSqliteEventStoreOn(open.db);
    const ledger = createCanonLedger(open.db);
    store.append(evs, 0);
    ledger.record({ id: 'f1', subject: 'goblin', predicate: 'si_trova_a', object: 'Caverna', eventSeq: 2 });
    const store2 = createSqliteEventStoreOn(open.db);
    expect(store2.version()).toBe(2);
    expect(ledger.active({ subject: 'goblin' }).map((f) => f.id)).toEqual(['f1']);
  });

  it('createSqliteEventStoreOn non possiede la connessione (nessun metodo close)', () => {
    open = openDatabase(':memory:');
    const store = createSqliteEventStoreOn(open.db);
    expect('close' in store).toBe(false);
  });
});
