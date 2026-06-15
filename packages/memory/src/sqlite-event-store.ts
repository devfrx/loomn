import { sql, desc } from 'drizzle-orm';
import {
  ConcurrencyError,
  type DomainEvent,
  type StoredEvent,
  type Snapshot,
  type GameState,
  type EventStore,
} from '@loomn/engine';
import type { z } from 'zod';
import { domainEventSchema, gameStateSchema } from '@loomn/shared';
import { openDatabase } from './db';
import { events, snapshots } from './schema';

export interface SqliteEventStore extends EventStore {
  /** Persiste uno snapshot (sovrascrive quello con la stessa versione). */
  saveSnapshot(snapshot: Snapshot): void;
  /** Lo snapshot a versione massima, o undefined se non ce ne sono. */
  latestSnapshot(): Snapshot | undefined;
  /** Rilascia la connessione SQLite sottostante. */
  close(): void;
}

/** Adapter SQLite della porta EventStore definita nel Piano 5 + persistenza degli snapshot.
 *  dbPath = ':memory:' o un percorso file. Concorrenza ottimistica via MAX(seq) in
 *  transazione; load/latestSnapshot validano con Zod (confine non fidato). */
export function createSqliteEventStore(dbPath: string): SqliteEventStore {
  const { db, close } = openDatabase(dbPath);

  const currentVersion = (): number => {
    const row = db.select({ v: sql<number>`COALESCE(MAX(${events.seq}), 0)` }).from(events).get();
    return row?.v ?? 0;
  };

  return {
    version: currentVersion,
    append(toAppend: DomainEvent[], expectedVersion: number): number {
      return db.transaction((tx): number => {
        const row = tx.select({ v: sql<number>`COALESCE(MAX(${events.seq}), 0)` }).from(events).get();
        const actual = row?.v ?? 0;
        if (actual !== expectedVersion) {
          throw new ConcurrencyError(expectedVersion, actual);
        }
        for (const event of toAppend) {
          tx.insert(events).values({ type: event.type, payload: JSON.stringify(event) }).run();
        }
        // corretto solo finche events e append-only e senza gap (nessun DELETE): seq contiguo
        return expectedVersion + toAppend.length;
      });
    },
    load(): StoredEvent[] {
      const rows = db.select().from(events).orderBy(events.seq).all();
      return rows.map((r) => ({ seq: r.seq, event: domainEventSchema.parse(JSON.parse(r.payload)) }));
    },
    saveSnapshot(snapshot: Snapshot): void {
      const state = JSON.stringify(snapshot.state);
      db.insert(snapshots)
        .values({ version: snapshot.version, state })
        .onConflictDoUpdate({ target: snapshots.version, set: { state } })
        .run();
    },
    latestSnapshot(): Snapshot | undefined {
      const row = db.select().from(snapshots).orderBy(desc(snapshots.version)).limit(1).get();
      if (row === undefined) {
        return undefined;
      }
      return { version: row.version, state: gameStateSchema.parse(JSON.parse(row.state)) };
    },
    close,
  };
}

// Drift guard a compile-time: gli schemi Zod devono restare allineati ai tipi del motore
// in entrambe le direzioni. Se i tipi divergono, queste righe falliscono il typecheck.
type _EventInfer = z.infer<typeof domainEventSchema>;
type _StateInfer = z.infer<typeof gameStateSchema>;
const _eventForward: DomainEvent = null as unknown as _EventInfer;
const _eventBackward: _EventInfer = null as unknown as DomainEvent;
const _stateForward: GameState = null as unknown as _StateInfer;
const _stateBackward: _StateInfer = null as unknown as GameState;
void _eventForward;
void _eventBackward;
void _stateForward;
void _stateBackward;
