// MemorySystem: compone l intero sottosistema di memoria su UNA sola connessione better-sqlite3
// (HANDOFF 7-bis). Event store + Canon Ledger (L1.5) + Summary Store (L2) + Context Assembler
// (read path 8c) leggono/scrivono lo STESSO DB: letture coerenti, concorrenza ottimistica sullo
// stesso stream. `assembleContext` e il vero allocatore di contesto, pronto da iniettare in
// runMasterTurn (MasterTurnRequest.assembleContext) al posto di assembleContextStub.
import {
  openDatabase,
  createSqliteEventStoreOn,
  createCanonLedger,
  createSummaryStore,
  createReflectionCursor,
  createContextAssembler,
  type SqliteEventStoreOn,
  type CanonLedger,
  type SummaryStore,
  type ReflectionCursor,
  type Clock,
} from '@loomn/memory';
import type { GameState } from '@loomn/engine';
import { systemClock } from './clock';

export interface MemorySystemConfig {
  /** Clock condiviso (createdAt della Reflection + recency dell assembler). Default: systemClock. */
  clock?: Clock;
  /** Budget di token del blocco di contesto assemblato (L1+L1.5+L2). Default 2000. */
  tokenBudget?: number;
  /** Fattore di decadimento recency per ora del Context Assembler. Default: quello di memory (0.995). */
  recencyDecayPerHour?: number;
  /** Stima token iniettabile per il Context Assembler. Default: euristica char/4 di memory. */
  estimateTokens?: (text: string) => number;
}

export interface MemorySystem {
  /** Event store (porta EventStore + snapshot) sulla connessione condivisa. */
  eventStore: SqliteEventStoreOn;
  /** Canon Ledger L1.5 sulla connessione condivisa. */
  ledger: CanonLedger;
  /** Summary Store L2 sulla connessione condivisa. */
  summaries: SummaryStore;
  /** Watermark di riflessione (item 6) sulla connessione condivisa. */
  cursor: ReflectionCursor;
  /** Clock condiviso (lo stesso passato all assembler e da passare alla Reflection). */
  clock: Clock;
  /** Context Assembler reale (read path 8c), gia chiuso su ledger/summaries/clock. Da iniettare
   *  in runMasterTurn al posto di assembleContextStub. */
  assembleContext: (state: GameState) => string;
  /** Esegue `fn` in UNA transazione sulla connessione condivisa: tutte le scritture (ledger +
   *  summaries + cursor) committano o rollano-back insieme. La Reflection lo usa per l atomicita
   *  per-scena (M-13). better-sqlite3 e sincrono -> `fn` deve essere sincrono (niente await dentro). */
  runInTransaction<T>(fn: () => T): T;
  /** Chiude la connessione SQLite condivisa. */
  close(): void;
}

const DEFAULT_TOKEN_BUDGET = 2000;

/** Apre UNA connessione (dbPath=':memory:' nei test) e monta event store + ledger + summaries +
 *  assembler sullo stesso handle Drizzle. Il chiamante chiude con `close()`. */
export function createMemorySystem(dbPath: string, config: MemorySystemConfig = {}): MemorySystem {
  const { db, close } = openDatabase(dbPath);
  const clock = config.clock ?? systemClock;
  const eventStore = createSqliteEventStoreOn(db);
  const ledger = createCanonLedger(db);
  const summaries = createSummaryStore(db);
  const cursor = createReflectionCursor(db);
  const assembleContext = createContextAssembler(
    { ledger, summaries, clock },
    {
      tokenBudget: config.tokenBudget ?? DEFAULT_TOKEN_BUDGET,
      ...(config.recencyDecayPerHour !== undefined ? { recencyDecayPerHour: config.recencyDecayPerHour } : {}),
      ...(config.estimateTokens !== undefined ? { estimateTokens: config.estimateTokens } : {}),
    },
  );
  return {
    eventStore,
    ledger,
    summaries,
    cursor,
    clock,
    assembleContext,
    runInTransaction: <T>(fn: () => T): T => db.transaction(() => fn()),
    close,
  };
}
