import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

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
