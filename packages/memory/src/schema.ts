import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';

export const events = sqliteTable('events', {
  seq: integer('seq').primaryKey({ autoIncrement: true }),
  // colonna denormalizzata per query/filtri futuri; load() ricava il tipo dal payload JSON
  type: text('type').notNull(),
  payload: text('payload').notNull(),
});

export const snapshots = sqliteTable('snapshots', {
  version: integer('version').primaryKey(),
  state: text('state').notNull(),
});

// L1.5 Canon Ledger (spec 6): fatti narrativi DISCRETI e interrogabili
// (soggetto, predicato, oggetto, eventSeq di provenienza, stato). Proiezione SQLite.
export const canonFacts = sqliteTable('canon_facts', {
  id: text('id').primaryKey(),
  subject: text('subject').notNull(),
  predicate: text('predicate').notNull(),
  object: text('object').notNull(),
  eventSeq: integer('event_seq').notNull(),
  status: text('status').notNull(),
});

// L2 Memoria narrativa (spec 6): riassunti gerarchici scena -> sessione -> arco -> campagna.
// `level` = livello della gerarchia; `scope` = chiave di raggruppamento (es. id sessione);
// `created_at` = istante di formazione (porta Clock, per la recency a tempo di lettura, 8c).
export const summaries = sqliteTable('summaries', {
  id: text('id').primaryKey(),
  level: text('level').notNull(),
  scope: text('scope').notNull(),
  text: text('text').notNull(),
  importance: integer('importance').notNull(),
  salience: real('salience').notNull(),
  createdAt: integer('created_at').notNull(),
  eventSeqFrom: integer('event_seq_from').notNull(),
  eventSeqTo: integer('event_seq_to').notNull(),
});
