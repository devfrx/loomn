// Watermark di riflessione (item 6): traccia fino a che `seq` lo stream e stato riflesso.
// Proiezione SQLite su `reflection_cursor` (riga singleton id=0, seminata dalla migrazione
// 0004). Gemello di createCanonLedger/createSummaryStore (handle Drizzle condiviso). Una sola
// frontiera per stream: gli id deterministici di fatti/summary sono globali, non per-scope.
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { reflectionCursor } from './schema';

export interface ReflectionCursor {
  /** seq fino a cui lo stream e stato riflesso (0 = niente ancora). */
  get(): number;
  /** Avanza il watermark al seq dato. */
  set(seq: number): void;
}

// La riga singleton ha sempre id 0 (la migrazione 0004 la semina): get/set la mirano.
const CURSOR_ID = 0;

/** Crea il cursor di riflessione su un handle Drizzle gia aperto (vedi `openDatabase`). La
 *  tabella `reflection_cursor` e creata e seminata dalla migrazione 0004. */
export function createReflectionCursor(db: BetterSQLite3Database): ReflectionCursor {
  return {
    get() {
      const row = db.select().from(reflectionCursor).where(eq(reflectionCursor.id, CURSOR_ID)).get();
      return row?.reflectedThroughSeq ?? 0;
    },
    set(seq) {
      db.update(reflectionCursor).set({ reflectedThroughSeq: seq }).where(eq(reflectionCursor.id, CURSOR_ID)).run();
    },
  };
}
