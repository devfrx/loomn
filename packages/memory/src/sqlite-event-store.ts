import { sql } from 'drizzle-orm';
import { ConcurrencyError, type DomainEvent, type StoredEvent, type EventStore } from '@loomn/engine';
import type { z } from 'zod';
import { domainEventSchema } from '@loomn/shared';
import { openDatabase } from './db';
import { events } from './schema';

export interface SqliteEventStore extends EventStore {
  /** Rilascia la connessione SQLite sottostante. */
  close(): void;
}

/** Adapter SQLite della porta EventStore (Piano 5). dbPath = ':memory:' o un percorso file.
 *  Concorrenza ottimistica via MAX(seq) in transazione; load valida con Zod (confine non fidato). */
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
        return expectedVersion + toAppend.length;
      });
    },
    load(): StoredEvent[] {
      const rows = db.select().from(events).orderBy(events.seq).all();
      return rows.map((r) => ({ seq: r.seq, event: domainEventSchema.parse(JSON.parse(r.payload)) }));
    },
    close,
  };
}

// Drift guard a compile-time: lo schema Zod deve restare allineato a DomainEvent del motore
// in entrambe le direzioni. Se i tipi divergono, queste righe falliscono il typecheck.
type _EventInfer = z.infer<typeof domainEventSchema>;
const _eventForward: DomainEvent = null as unknown as _EventInfer;
const _eventBackward: _EventInfer = null as unknown as DomainEvent;
void _eventForward;
void _eventBackward;
