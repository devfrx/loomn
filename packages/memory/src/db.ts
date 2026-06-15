import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';

/** Cartella delle migrazioni, risolta relativamente al sorgente (indipendente dalla cwd). */
export const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

export interface OpenDb {
  db: BetterSQLite3Database;
  close(): void;
}

/** Apre il database SQLite al percorso dato (':memory:' per i test), applica le migrazioni
 *  (idempotente) e restituisce l istanza Drizzle e una funzione di chiusura. */
export function openDatabase(dbPath: string): OpenDb {
  const sqlite = new Database(dbPath);
  // WAL: predispone letture concorrenti future (Fase 3); su :memory: e un no-op innocuo
  sqlite.pragma('journal_mode = WAL');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder });
  return { db, close: () => sqlite.close() };
}
