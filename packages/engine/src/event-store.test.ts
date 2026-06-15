import { describe, it, expect } from 'vitest';
import type { Actor } from './actor';
import type { DomainEvent } from './events';
import { createInMemoryEventStore, takeSnapshot, rebuild, ConcurrencyError } from './event-store';

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

describe('createInMemoryEventStore', () => {
  it('appende eventi, traccia la versione e li ricarica con seq progressivo', () => {
    const store = createInMemoryEventStore();
    expect(store.version()).toBe(0);
    const v = store.append(evs, 0);
    expect(v).toBe(3);
    expect(store.version()).toBe(3);
    expect(store.load().map((s) => s.seq)).toEqual([1, 2, 3]);
  });

  it('lancia ConcurrencyError se expectedVersion non coincide', () => {
    const store = createInMemoryEventStore();
    store.append(evs, 0);
    expect(() => store.append([{ type: 'TurnEnded' }], 0)).toThrow(ConcurrencyError);
  });

  it('ConcurrencyError espone expected e actual', () => {
    const store = createInMemoryEventStore();
    store.append(evs, 0);
    let err: unknown;
    try {
      store.append([{ type: 'TurnEnded' }], 1);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConcurrencyError);
    expect((err as ConcurrencyError).expected).toBe(1);
    expect((err as ConcurrencyError).actual).toBe(3);
  });
});

describe('snapshot e rebuild', () => {
  it('rebuild senza snapshot equivale al replay completo', () => {
    const store = createInMemoryEventStore();
    store.append(evs, 0);
    const s = rebuild(store.load());
    expect(s.version).toBe(3);
    expect(s.actors['goblin']?.resources['hp']?.current).toBe(4);
  });

  it('rebuild da snapshot applica solo gli eventi successivi e dà lo stesso stato', () => {
    const store = createInMemoryEventStore();
    store.append(evs, 0);
    const snap = takeSnapshot(rebuild(store.load()));
    store.append([{ type: 'DamageApplied', targetId: 'goblin', resource: 'hp', amount: 2 }], 3);
    const full = rebuild(store.load());
    const fromSnap = rebuild(store.load(), snap);
    expect(fromSnap).toEqual(full);
    expect(fromSnap.actors['goblin']?.resources['hp']?.current).toBe(2);
  });
});
