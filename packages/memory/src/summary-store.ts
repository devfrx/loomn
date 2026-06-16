// L2 Memoria narrativa (spec 6): store dei riassunti gerarchici scena -> sessione -> arco ->
// campagna. Proiezione SQLite su `summaries`. `level` validato Zod in lettura (confine non
// fidato, come lo status del Canon Ledger). Minimo: record + list filtrabile/ordinata.
import { z } from 'zod';
import { and, eq, type SQL } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { summaries } from './schema';

export type SummaryLevel = 'scene' | 'session' | 'arc' | 'campaign';

export interface Summary {
  id: string;
  level: SummaryLevel;
  scope: string;
  text: string;
  importance: number;
  salience: number;
  createdAt: number;
  eventSeqFrom: number;
  eventSeqTo: number;
}

// L input per registrare un riassunto coincide con la forma persistita: nessun campo e
// assegnato dallo store (id/salience/createdAt sono gia calcolati dalla Reflection).
export type SummaryInput = Summary;

export interface SummaryFilter {
  level?: SummaryLevel;
  scope?: string;
}

export interface SummaryStore {
  /** Registra un riassunto. */
  record(summary: SummaryInput): void;
  /** Riassunti che soddisfano il filtro (tutti se assente), ordinati per eventSeqFrom. */
  list(filter?: SummaryFilter): Summary[];
}

const levelSchema = z.enum(['scene', 'session', 'arc', 'campaign']);

function toSummary(row: {
  id: string;
  level: string;
  scope: string;
  text: string;
  importance: number;
  salience: number;
  createdAt: number;
  eventSeqFrom: number;
  eventSeqTo: number;
}): Summary {
  return { ...row, level: levelSchema.parse(row.level) };
}

function buildWhere(filter: SummaryFilter | undefined): SQL | undefined {
  const conds: SQL[] = [];
  if (filter?.level !== undefined) conds.push(eq(summaries.level, filter.level));
  if (filter?.scope !== undefined) conds.push(eq(summaries.scope, filter.scope));
  return conds.length > 0 ? and(...conds) : undefined;
}

/** Crea uno store L2 su un handle Drizzle gia aperto (vedi `openDatabase`). La tabella
 *  `summaries` e creata dalla migrazione 0002. */
export function createSummaryStore(db: BetterSQLite3Database): SummaryStore {
  return {
    record(summary) {
      db.insert(summaries).values(summary).run();
    },
    list(filter) {
      const rows = db.select().from(summaries).where(buildWhere(filter)).orderBy(summaries.eventSeqFrom).all();
      return rows.map(toSummary);
    },
  };
}
