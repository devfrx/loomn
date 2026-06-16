import { sql, desc } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
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

/** Event store SQLite + snapshot SENZA `close`: opera su un handle Drizzle gia aperto di cui
 *  NON possiede il ciclo di vita (chiude chi ha aperto la connessione). E la forma condivisibile
 *  con Canon Ledger e Summary Store sullo STESSO handle (Piano 9b / HANDOFF 7-bis). */
export type SqliteEventStoreOn = Omit<SqliteEventStore, 'close'>;

/** Costruisce l event store su una connessione gia aperta e condivisa. Concorrenza ottimistica
 *  via MAX(seq) in transazione; load/latestSnapshot validano con Zod (confine non fidato). Non
 *  chiude la connessione. */
export function createSqliteEventStoreOn(db: BetterSQLite3Database): SqliteEventStoreOn {
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
  };
}

/** Adapter SQLite della porta EventStore (Piano 5) + snapshot, che POSSIEDE la propria
 *  connessione: apre dbPath, costruisce il corpo su quel handle e aggiunge `close`. */
export function createSqliteEventStore(dbPath: string): SqliteEventStore {
  const { db, close } = openDatabase(dbPath);
  return { ...createSqliteEventStoreOn(db), close };
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
