import { describe, it, expect } from 'vitest';
import { ConcurrencyError, takeSnapshot, rebuild, type Actor, type DomainEvent, type EventStore } from '@loomn/engine';

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

/** Suite di conformita condivisa: ogni implementazione della porta EventStore deve passarla
 *  identica (spec 9). makeStore crea uno store fresco per ogni caso di test. */
export function runEventStoreContract(label: string, makeStore: () => EventStore): void {
  describe(`EventStore contract: ${label}`, () => {
    it('parte da versione 0', () => {
      expect(makeStore().version()).toBe(0);
    });

    it('appende eventi, traccia la versione e li ricarica con seq progressivo', () => {
      const store = makeStore();
      const v = store.append(evs, 0);
      expect(v).toBe(3);
      expect(store.version()).toBe(3);
      expect(store.load().map((s) => s.seq)).toEqual([1, 2, 3]);
    });

    it('lancia ConcurrencyError se expectedVersion non coincide', () => {
      const store = makeStore();
      store.append(evs, 0);
      expect(() => store.append([{ type: 'TurnEnded' }], 0)).toThrow(ConcurrencyError);
    });

    it('ConcurrencyError espone expected e actual', () => {
      const store = makeStore();
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

    it('rebuild senza snapshot equivale al replay completo', () => {
      const store = makeStore();
      store.append(evs, 0);
      const s = rebuild(store.load());
      expect(s.version).toBe(3);
      expect(s.actors['goblin']?.resources['hp']?.current).toBe(4);
    });

    it('rebuild da snapshot applica solo gli eventi successivi', () => {
      const store = makeStore();
      store.append(evs, 0);
      const snap = takeSnapshot(rebuild(store.load()));
      store.append([{ type: 'DamageApplied', targetId: 'goblin', resource: 'hp', amount: 2 }], 3);
      const full = rebuild(store.load());
      const fromSnap = rebuild(store.load(), snap);
      expect(fromSnap).toEqual(full);
      expect(fromSnap.actors['goblin']?.resources['hp']?.current).toBe(2);
    });
  });
}
