import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { initialState, applyEvent, type Actor } from '@loomn/engine';
import { createMemorySystem } from './memory-system';
import { systemClock } from './clock';

function actor(id: string, name: string): Actor {
  return {
    id,
    name,
    kind: 'npc',
    attributes: {},
    skills: {},
    resources: { hp: { current: 10, max: 10 } },
    conditions: [],
    items: [],
    progression: { xp: 0, level: 1 },
  };
}

describe('createMemorySystem - connessione condivisa', () => {
  it('event store, ledger e summaries scrivono e leggono lo stesso DB', () => {
    const sys = createMemorySystem(':memory:', { clock: { now: () => 1000 } });
    try {
      sys.eventStore.append([{ type: 'ActorAdded', actor: actor('goblin', 'Goblin') }], 0);
      sys.ledger.record({ id: 'f1', subject: 'Goblin', predicate: 'impugna', object: 'pugnale', eventSeq: 1 });
      sys.summaries.record({
        id: 's1',
        level: 'scene',
        scope: 'sess-1',
        text: 'Il goblin appare nella caverna.',
        importance: 5,
        salience: 0.5,
        createdAt: 1000,
        eventSeqFrom: 1,
        eventSeqTo: 1,
      });
      expect(sys.eventStore.version()).toBe(1);
      expect(sys.ledger.active({ subject: 'Goblin' }).map((f) => f.id)).toEqual(['f1']);
      expect(sys.summaries.list().map((s) => s.id)).toEqual(['s1']);
    } finally {
      sys.close();
    }
  });

  it('assembleContext reale riflette L1, L1.5 e L2 dal DB condiviso', () => {
    const sys = createMemorySystem(':memory:', { clock: { now: () => 1000 }, tokenBudget: 2000 });
    try {
      sys.ledger.record({ id: 'f1', subject: 'Goblin', predicate: 'impugna', object: 'pugnale', eventSeq: 1 });
      sys.summaries.record({
        id: 's1',
        level: 'scene',
        scope: 'sess-1',
        text: 'Il goblin appare nella caverna.',
        importance: 5,
        salience: 0.5,
        createdAt: 1000,
        eventSeqFrom: 1,
        eventSeqTo: 1,
      });
      const state = applyEvent(initialState, { type: 'ActorAdded', actor: actor('goblin', 'Goblin') });
      const ctx = sys.assembleContext(state);
      expect(ctx).toContain('Goblin');
      expect(ctx).toContain('impugna');
      expect(ctx).toContain('Il goblin appare nella caverna.');
    } finally {
      sys.close();
    }
  });

  it('close chiude la connessione condivisa (riuso dopo close fallisce)', () => {
    const sys = createMemorySystem(':memory:');
    sys.close();
    expect(() => sys.eventStore.version()).toThrow();
  });

  it('il cursor di riflessione e montato sulla connessione condivisa (default 0, persiste il set)', () => {
    const sys = createMemorySystem(':memory:', { clock: { now: () => 1000 } });
    try {
      expect(sys.cursor.get()).toBe(0);
      sys.cursor.set(5);
      expect(sys.cursor.get()).toBe(5);
    } finally {
      sys.close();
    }
  });

  it('runInTransaction committa il blocco e rolla-back su throw (M-13)', () => {
    const sys = createMemorySystem(':memory:', { clock: { now: () => 1000 } });
    try {
      // Commit: la scrittura sopravvive.
      sys.runInTransaction(() => {
        sys.ledger.record({ id: 'f1', subject: 's', predicate: 'p', object: 'o', eventSeq: 1 });
      });
      expect(sys.ledger.active().map((f) => f.id)).toEqual(['f1']);
      // Rollback: una scrittura seguita da throw NON sopravvive (atomicita).
      expect(() =>
        sys.runInTransaction(() => {
          sys.ledger.record({ id: 'f2', subject: 's', predicate: 'p', object: 'o', eventSeq: 2 });
          throw new Error('boom');
        }),
      ).toThrow('boom');
      expect(sys.ledger.active().map((f) => f.id)).toEqual(['f1']); // f2 rolled back
    } finally {
      sys.close();
    }
  });

  it('crea la directory genitore inesistente del path del DB', () => {
    const base = mkdtempSync(join(tmpdir(), 'loomn-ms-dir-'));
    const dbPath = join(base, 'campaigns', 'default', 'loomn.db'); // la dir genitore NON esiste
    const ms = createMemorySystem(dbPath);
    expect(existsSync(dirname(dbPath))).toBe(true);
    ms.close();
    rmSync(base, { recursive: true, force: true });
  });
});

describe('systemClock', () => {
  it('now ritorna un timestamp numerico positivo', () => {
    expect(typeof systemClock.now()).toBe('number');
    expect(systemClock.now()).toBeGreaterThan(0);
  });
});
