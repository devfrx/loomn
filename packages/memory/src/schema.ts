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
