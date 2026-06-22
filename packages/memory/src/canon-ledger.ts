// L1.5 Canon Ledger (spec 6): store dei fatti narrativi DISCRETI e interrogabili che il
// Master usa per NON contraddirsi. Proiezione SQLite su `canon_facts`. Ogni fatto porta
// l eventSeq di provenienza e uno stato (active/retracted). La validazione anti-contraddizione
// per i predicati funzionali e il primitivo `supersede` (ritira-e-rimpiazza); la POLITICA di
// quali predicati siano funzionali e demandata a chi scrive (Reflection, 8b / moduli).
import { z } from 'zod';
import { and, eq, type SQL } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { canonFacts } from './schema';

export type CanonStatus = 'active' | 'retracted';

export interface CanonFact {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  eventSeq: number;
  salience: number;
  status: CanonStatus;
}

/** Un nuovo fatto da registrare; lo stato iniziale e sempre 'active'. `salience` opzionale
 *  (default 0): i call site 8a la omettono, la Reflection 8b la fornisce. */
export interface CanonFactInput {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  eventSeq: number;
  salience?: number;
}

export interface CanonFactFilter {
  subject?: string;
  predicate?: string;
  object?: string;
}

export interface CanonLedger {
  /** Registra un nuovo fatto (status 'active'). */
  record(fact: CanonFactInput): void;
  /** Fatti ATTIVI che soddisfano il filtro (tutti se assente), ordinati per eventSeq, poi per id
   *  (tie-break deterministico a parita di seq, M-12). */
  active(filter?: CanonFactFilter): CanonFact[];
  /** Tutti i fatti (attivi e ritirati) che soddisfano il filtro, ordinati per eventSeq, poi per id
   *  (tie-break deterministico a parita di seq, M-12). */
  all(filter?: CanonFactFilter): CanonFact[];
  /** Ritira un fatto (status 'retracted'); no-op se l id non esiste. */
  retract(id: string): void;
  /** Anti-contraddizione per predicati funzionali: ritira in transazione i fatti ATTIVI con
   *  lo stesso (subject, predicate) e registra il nuovo come unico attivo. */
  supersede(fact: CanonFactInput): void;
}

const statusSchema = z.union([z.literal('active'), z.literal('retracted')]);

// Valida lo `status` letto dal DB (confine non fidato, come fa l event store con Zod).
function toFact(row: {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  eventSeq: number;
  salience: number;
  status: string;
}): CanonFact {
  return {
    id: row.id,
    subject: row.subject,
    predicate: row.predicate,
    object: row.object,
    eventSeq: row.eventSeq,
    salience: row.salience,
    status: statusSchema.parse(row.status),
  };
}

function buildWhere(filter: CanonFactFilter | undefined, activeOnly: boolean): SQL | undefined {
  const conds: SQL[] = [];
  if (activeOnly) conds.push(eq(canonFacts.status, 'active'));
  if (filter?.subject !== undefined) conds.push(eq(canonFacts.subject, filter.subject));
  if (filter?.predicate !== undefined) conds.push(eq(canonFacts.predicate, filter.predicate));
  if (filter?.object !== undefined) conds.push(eq(canonFacts.object, filter.object));
  return conds.length > 0 ? and(...conds) : undefined;
}

/** Crea un Canon Ledger su un handle Drizzle gia aperto (vedi `openDatabase`). La tabella
 *  `canon_facts` e creata dalla migrazione 0001. */
export function createCanonLedger(db: BetterSQLite3Database): CanonLedger {
  const query = (filter: CanonFactFilter | undefined, activeOnly: boolean): CanonFact[] => {
    const rows = db.select().from(canonFacts).where(buildWhere(filter, activeOnly)).orderBy(canonFacts.eventSeq, canonFacts.id).all();
    return rows.map(toFact);
  };
  return {
    record(fact) {
      db.insert(canonFacts).values({ ...fact, salience: fact.salience ?? 0, status: 'active' }).run();
    },
    active(filter) {
      return query(filter, true);
    },
    all(filter) {
      return query(filter, false);
    },
    retract(id) {
      db.update(canonFacts).set({ status: 'retracted' }).where(eq(canonFacts.id, id)).run();
    },
    supersede(fact) {
      db.transaction((tx) => {
        tx
          .update(canonFacts)
          .set({ status: 'retracted' })
          .where(and(eq(canonFacts.subject, fact.subject), eq(canonFacts.predicate, fact.predicate), eq(canonFacts.status, 'active')))
          .run();
        tx.insert(canonFacts).values({ ...fact, salience: fact.salience ?? 0, status: 'active' }).run();
      });
    },
  };
}
