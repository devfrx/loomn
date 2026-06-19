# Fase 2 — Persistenza & memoria (remediation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chiudere a causa radice gli 8 finding d'audit del layer persistenza/memoria (I‑05, I‑10, M‑01, M‑03, M‑05, M‑12, M‑13, M‑14): eliminare i costi O(stream) sul percorso piu navigato, cablare lo snapshotting, blindare il determinismo della memoria e rinforzare i drift guard — senza debiti e senza regressioni di lettura.

**Architecture:** Tutto il lavoro vive in `packages/memory` e `packages/host` (con UN solo, chirurgico, hardening additivo a `packages/shared`). Le letture diventano DB-side e finestrate (cursori/indici), MAI restringendo gli schemi che validano i dati storici. Lo snapshot esistente (gia testato a livello adapter) viene cablato nell'application layer. La Reflection acquisisce un confine transazionale per-scena (fatti + riassunto + watermark, tutto-o-niente). I drift guard `Command`↔`commandSchema` ed evento diventano piu forti. ABI Node, nessun gate Electron.

**Tech Stack:** TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`); Vitest; Zod ai confini; Drizzle + better-sqlite3 (event-sourcing); pnpm monorepo.

---

## Decisioni bloccate (dal piano-campagna + sessione utente 2026-06-19)

Vincolanti — NON ri-litigarle nei task:

1. **Ambito = SOLO i 28 bug d'audit a causa radice.** F2 copre 8 finding (sopra). Le tracce D‑01/D‑02/D‑03 sono iniziative design-first DOPO la campagna. NON toccare engine/ai/app/desktop/renderer; NESSUN gate Electron (entra da F4).
2. **M‑03 (snapshot) = CABLARE lo snapshotting** (save a soglia di N eventi + `rebuild(loadSince(snap.version), snapshot)` all'avvio). Non marcarlo come deferito.
3. **I‑10 = drift guard `Command`↔`commandSchema` BIDIREZIONALE ed esaustivo** (sorella di quello degli eventi in `sqlite-event-store.ts`), con un probe `@ts-expect-error` che un campo driftato rompe il typecheck.

### Vincolo debt-free (la lezione di F1, non negoziabile)

- **MAI restringere lo schema/percorso di LETTURA** in modo da rifiutare dati storici persistiti. In F1 un bound `.int().min().max()` su `dieGroupSchema` (read-path condiviso) avrebbe bricato campagne con item dai dadi fuori-range. In F2: per I‑05/M‑05 cambia il **PIANO di lettura** (indici/limiti/cursori DB-side), non lo **SCHEMA** che valida i dati storici. I bound restano fuori scope.
- **M‑01 — perche `.strict()` qui e debt-free-safe (verificato):** `.strict()` rifiuta solo chiavi NON dichiarate. Gli eventi storici sono scritti da `JSON.stringify(event)` dove `event` e prodotto dal motore con ESATTAMENTE i campi dichiarati → nessun payload storico ha chiavi extra → `.strict()` non rifiuta MAI un dato storico. L'unico caso che rifiuta e un drift FUTURO (campo aggiunto al motore, schema non aggiornato): e esattamente cio che vogliamo rendere RUMOROSO, e viene colto dal round-trip test PRIMA del rilascio. (Un guard di esaustivita strutturale tipo-livello `Equals<DomainEvent, z.infer<domainEventSchema>>` e stato VALUTATO ED EMPIRICAMENTE SCARTATO: risolve a `false` gia oggi senza drift — i `.transform()` e l'annidamento `z.union([discriminatedUnion, checkResolved])` ne fanno un falso positivo. Verificato con `tsc --noEmit` su uno scratch.)

---

## File Structure

**`packages/memory`**
- `src/sqlite-event-store.ts` — **MODIFY**: aggiunge le letture finestrate DB-side `loadSince(throughSeq)` e `loadNarration({before?, limit})` a `SqliteEventStoreOn` (Task 1). Drift guard eventi gia presente (invariato).
- `src/index.ts` — **MODIFY**: esporta il nuovo tipo `NarrationWindow` (Task 1).
- `src/canon-ledger.ts` — **MODIFY**: tie-break `.orderBy(eventSeq, id)` (Task 7, M‑12).
- `src/reflection.ts` — **MODIFY**: split `compute` (async, LLM) / `write` (sync) + confine `runInTransaction` opzionale per-scena (Task 4, M‑13).
- Test: `sqlite-event-store.test.ts` (Task 1, Task 6), `reflection.test.ts` (Task 4), `canon-ledger.test.ts` (Task 7).

**`packages/host`**
- `src/campaign-service.ts` — **MODIFY**: `getNarrationHistory` finestrato + clamp `limit` (Task 2, I‑05/M‑05); `reflect` usa `loadSince` (Task 2, I‑05); snapshot cablato (Task 3, M‑03); `getRuleset` verifica la legalita su TUTTE le soft-phase (Task 7, M‑14).
- `src/memory-system.ts` — **MODIFY**: espone `runInTransaction` sulla connessione condivisa (Task 4, M‑13).
- `src/reflection-ports.ts` — **MODIFY**: `reflectionDepsFor` inoltra `runInTransaction` (Task 4, M‑13).
- Test: `campaign-service.test.ts` (Task 2, Task 3, Task 7), `memory-system.test.ts` (Task 4), `command-schema.test.ts` (Task 5, I‑10).

**`packages/shared`** (UN solo hardening additivo, sanzionato "guard a shared se serve")
- `src/domain-schema.ts` — **MODIFY**: `.strict()` sui 13 arm di `domainEventSchema` (Task 6, M‑01). Additivo: non cambia il tipo inferito (il drift guard bidirezionale resta valido), rende RUMOROSO il drift futuro di campo.

---

## Fuori ambito (NON fare in F2 — annotare se emergono)

- **Engine / AI / app/desktop / renderer.** Nessuna modifica. La porta `EventStore` del motore (`engine/event-store.ts`) resta `version/append/load`: i metodi finestrati vivono su `SqliteEventStoreOn` (adapter), non sulla porta del motore.
- **Gate Electron.** Niente flip ABI. Verifica solo `pnpm exec vitest run packages/memory packages/host` + typecheck.
- **Delta read-model** (spec §13) e **seed RNG per-campagna persistito** — follow-up noti, rimandati.
- **Flag cross-fase gia aperti da F1 (NON in F2):** self-test versione 7→8 (F4); tool `next_round` ridondante (F3); bottone 'Round successivo' ridondante (F6); `ipc.ts` `canonFactSchema.salience`/`summarySchema.importance`+`salience` senza `.finite()` sui read-DTO host→renderer (F4). Se ne emergono di nuovi, ANNOTALI qui e nell'HANDOFF, non implementarli.

---

## Note operative (ambiente)

- **ABI:** memory/host usano better-sqlite3. Se `pnpm exec vitest run packages/memory packages/host` da `NODE_MODULE_VERSION 146 ... requires 137`, la nativa e su ABI Electron → `pnpm rebuild:node` (= `pnpm -r rebuild better-sqlite3`). All'avvio di questa sessione l'ABI era gia su Node (verificato: `db.test.ts` verde).
- **Lanciare un singolo file di test dalla ROOT:** `pnpm exec vitest run packages/<pkg>/src/<file>.test.ts` (la forma `pnpm -C packages/<pkg> exec vitest` NON risolve la config di root).
- **Typecheck di pacchetto:** `pnpm -C packages/<pkg> typecheck`.
- **Conteggi test attesi:** baseline **719** (fine F1). I target cumulativi sotto sono stime — verifica il conteggio reale stampato da Vitest a ogni task.
- **House rules §5:** NON toccare `package.json`/`tsconfig*`/`vitest.config*`; apostrofi-bug nei test (descrizioni in apici singoli SENZA `l'`/`un'`/`c'è`); spread condizionali per `exactOptionalPropertyTypes`; accessi indicizzati guardati. Grep anti-apostrofo del piano gia eseguito.

---

## Task 1: Letture finestrate DB-side sull'event store SQLite (fondazione I‑05 + M‑03)

**Findings:** I‑05 (parte memory), abilita M‑03.

**Files:**
- Modify: `packages/memory/src/sqlite-event-store.ts`
- Modify: `packages/memory/src/index.ts`
- Test: `packages/memory/src/sqlite-event-store.test.ts`

**Contesto:** oggi l'unico read path e `load()` (full-scan + `domainEventSchema.parse` per OGNI riga). `getNarrationHistory` e `reflect` lo usano → costo O(stream) per pagina. Aggiungiamo due letture che spingono filtro+finestra nel DB (la colonna `type` e gia persistita a `schema.ts:6`), parsando SOLO le righe della finestra. Vivono su `SqliteEventStoreOn` (adapter), NON sulla porta `EventStore` del motore.

- [ ] **Step 1: Scrivi i test (RED)**

Aggiungi in fondo a `packages/memory/src/sqlite-event-store.test.ts` (gli helper `actor`/`evs`/import sono gia in cima al file). Aggiungi all'import esistente di `@loomn/engine` il tipo necessario solo se serve (non serve). I test usano la pattern di iniezione gia presente (`openDatabase` + insert grezzo).

```ts
describe('createSqliteEventStore - letture finestrate (I-05/M-03)', () => {
  const narr = (action: string, text: string): DomainEvent => ({
    type: 'NarrationRecorded',
    playerAction: action,
    narration: text,
  });

  it('loadSince ritorna solo gli eventi con seq maggiore della soglia, in ordine', () => {
    const store = createSqliteEventStore(':memory:');
    try {
      store.append(evs, 0); // 3 eventi: seq 1,2,3
      expect(store.loadSince(0).map((s) => s.seq)).toEqual([1, 2, 3]);
      expect(store.loadSince(2).map((s) => s.seq)).toEqual([3]);
      expect(store.loadSince(3)).toEqual([]);
    } finally {
      store.close();
    }
  });

  it('loadNarration ritorna i soli NarrationRecorded, newest-first, rispettando il limit', () => {
    const store = createSqliteEventStore(':memory:');
    try {
      store.append([narr('a1', 'n1'), { type: 'TurnEnded' }, narr('a2', 'n2'), narr('a3', 'n3')], 0);
      const all = store.loadNarration({ limit: 50 });
      expect(all.map((s) => s.seq)).toEqual([4, 3, 1]); // newest-first, salta il TurnEnded
      const page = store.loadNarration({ limit: 2 });
      expect(page.map((s) => s.seq)).toEqual([4, 3]);
    } finally {
      store.close();
    }
  });

  it('loadNarration con before pagina gli eventi con seq minore del cursore', () => {
    const store = createSqliteEventStore(':memory:');
    try {
      store.append([narr('a1', 'n1'), narr('a2', 'n2'), narr('a3', 'n3')], 0); // seq 1,2,3
      expect(store.loadNarration({ before: 3, limit: 50 }).map((s) => s.seq)).toEqual([2, 1]);
      expect(store.loadNarration({ before: 2, limit: 50 }).map((s) => s.seq)).toEqual([1]);
    } finally {
      store.close();
    }
  });

  it('loadNarration NON parsa le righe non-narrazione fuori dal filtro (niente Zod sull intero stream)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loomn-mem-'));
    const path = join(dir, 'win.db');
    try {
      const inject = openDatabase(path);
      // Riga NON-narrazione con payload corrotto: load() ci morirebbe sopra; loadNarration la filtra DB-side.
      inject.db.insert(events).values({ type: 'DamageApplied', payload: '{"type":"DamageApplied"}' }).run();
      inject.db.insert(events).values({ type: 'NarrationRecorded', payload: JSON.stringify(narr('a', 'storia')) }).run();
      inject.close();
      const store = createSqliteEventStore(path);
      const got = store.loadNarration({ limit: 50 });
      expect(got.map((s) => s.seq)).toEqual([2]); // solo la narrazione; la riga corrotta non e mai parsata
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loadSince NON parsa gli eventi sotto la soglia (finestra fresca)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loomn-mem-'));
    const path = join(dir, 'since.db');
    try {
      const inject = openDatabase(path);
      inject.db.insert(events).values({ type: 'DamageApplied', payload: '{"type":"DamageApplied"}' }).run(); // seq 1 corrotto
      inject.db.insert(events).values({ type: 'NarrationRecorded', payload: JSON.stringify(narr('a', 'storia')) }).run(); // seq 2 valido
      inject.close();
      const store = createSqliteEventStore(path);
      expect(store.loadSince(1).map((s) => s.seq)).toEqual([2]); // la riga 1 corrotta non e parsata
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Esegui i test (verifica RED)**

Run: `pnpm exec vitest run packages/memory/src/sqlite-event-store.test.ts`
Expected: FAIL — `loadSince`/`loadNarration` non esistono su `SqliteEventStore`.

- [ ] **Step 3: Implementa le letture finestrate**

In `packages/memory/src/sqlite-event-store.ts`:

(a) estendi l'import drizzle (riga 1) da `import { sql, desc } from 'drizzle-orm';` a:

```ts
import { sql, desc, eq, gt, lt, and } from 'drizzle-orm';
```

(b) aggiungi il tipo della finestra e i due metodi all'interfaccia `SqliteEventStore` (dopo `latestSnapshot()`, prima di `close()`):

```ts
/** Finestra cursor-by-seq per la cronologia di narrazione (newest-first). */
export interface NarrationWindow {
  /** Solo eventi con seq < before (assente = dal piu recente). */
  before?: number;
  /** Numero massimo di righe restituite. */
  limit: number;
}

export interface SqliteEventStore extends EventStore {
  /** Persiste uno snapshot (sovrascrive quello con la stessa versione). */
  saveSnapshot(snapshot: Snapshot): void;
  /** Lo snapshot a versione massima, o undefined se non ce ne sono. */
  latestSnapshot(): Snapshot | undefined;
  /** Eventi con seq > throughSeq, in ordine di seq. Parsa SOLO la finestra (rebuild-da-snapshot,
   *  reflect incrementale): evita il full-scan O(stream) di load(). */
  loadSince(throughSeq: number): StoredEvent[];
  /** Finestra DB-side dei soli NarrationRecorded, newest-first. Filtra per `type` (gia persistito)
   *  e seq < before nel DB → parsa O(limit) righe, non l intero stream. */
  loadNarration(query: NarrationWindow): StoredEvent[];
  /** Rilascia la connessione SQLite sottostante. */
  close(): void;
}
```

(c) implementa i due metodi dentro il `return { ... }` di `createSqliteEventStoreOn` (dopo `load()`, prima di `saveSnapshot`):

```ts
    loadSince(throughSeq: number): StoredEvent[] {
      const rows = db.select().from(events).where(gt(events.seq, throughSeq)).orderBy(events.seq).all();
      return rows.map((r) => ({ seq: r.seq, event: domainEventSchema.parse(JSON.parse(r.payload)) }));
    },
    loadNarration(query: NarrationWindow): StoredEvent[] {
      const conds: SQL[] = [eq(events.type, 'NarrationRecorded')];
      if (query.before !== undefined) conds.push(lt(events.seq, query.before));
      const rows = db.select().from(events).where(and(...conds)).orderBy(desc(events.seq)).limit(query.limit).all();
      return rows.map((r) => ({ seq: r.seq, event: domainEventSchema.parse(JSON.parse(r.payload)) }));
    },
```

(d) per il tipo `SQL` aggiungi `type SQL` all'import drizzle: la riga (a) diventa

```ts
import { sql, desc, eq, gt, lt, and, type SQL } from 'drizzle-orm';
```

(Nota: `SqliteEventStoreOn = Omit<SqliteEventStore, 'close'>` eredita automaticamente i due nuovi metodi.)

- [ ] **Step 4: Esporta `NarrationWindow` dal barrel**

In `packages/memory/src/index.ts`, nel blocco export di `./sqlite-event-store`, aggiungi `type NarrationWindow`:

```ts
export {
  createSqliteEventStore,
  createSqliteEventStoreOn,
  type SqliteEventStore,
  type SqliteEventStoreOn,
  type NarrationWindow,
} from './sqlite-event-store';
```

- [ ] **Step 5: Esegui i test (verifica GREEN) + typecheck**

Run: `pnpm exec vitest run packages/memory/src/sqlite-event-store.test.ts`
Expected: PASS (i 6 esistenti + i 5 nuovi = 11).
Run: `pnpm -C packages/memory typecheck`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add packages/memory/src/sqlite-event-store.ts packages/memory/src/index.ts packages/memory/src/sqlite-event-store.test.ts
git commit -m "feat(memory): loadSince + loadNarration finestrati DB-side sull event store [I-05/M-03]"
```

**Test attesi cumulativi:** ~724 (719 + 5).

---

## Task 2: `getNarrationHistory` finestrato + clamp `limit`; `reflect` finestrato (I‑05 + M‑05)

**Findings:** I‑05 (parte host), M‑05.

**Files:**
- Modify: `packages/host/src/campaign-service.ts`
- Test: `packages/host/src/campaign-service.test.ts`

**Contesto:** `getNarrationHistory` (`campaign-service.ts:218-230`) carica TUTTO lo stream, lo Zod-parsa, filtra in JS e `slice(-limit)` (con `limit=0` → `slice(-0)===slice(0)` = copia intera, opposto dell'intento: M‑05). `reflect` (`:203-214`) chiama `load()` (intero stream) poi `runScenesReflection` filtra `seq>cursor` in JS. Usiamo le letture finestrate del Task 1. Cambia il PIANO di lettura, NON lo schema (debt-free).

- [ ] **Step 1: Scrivi i test (RED)**

Aggiungi, nel `describe('createCampaignService - read on-demand ...')` di `packages/host/src/campaign-service.test.ts`, dopo il test esistente "getNarrationHistory su stream senza narrazione e vuota":

```ts
  it('getNarrationHistory con limit=0 NON ritorna tutto: clamp a >=1 (M-05)', async () => {
    const model = scriptedModel([
      [{ type: 'text', delta: 'Prima.' }, { type: 'finish', reason: 'stop' }],
      [{ type: 'text', delta: 'Seconda.' }, { type: 'finish', reason: 'stop' }],
    ]);
    const { service, memory } = makeService({ model });
    try {
      await service.runTurn('a1.');
      await service.runTurn('a2.');
      const h = service.getNarrationHistory({ limit: 0 });
      expect(h.entries.length).toBe(1); // clamp a 1, NON le 2 (slice(-0) ritornava tutto)
      expect(h.entries[0]?.seq).toBe(2); // la piu recente
      expect(h.hasMore).toBe(true);
    } finally {
      memory.close();
    }
  });

  it('getNarrationHistory con limit negativo viene clampato a >=1 (M-05)', async () => {
    const model = scriptedModel([[{ type: 'text', delta: 'Sola.' }, { type: 'finish', reason: 'stop' }]]);
    const { service, memory } = makeService({ model });
    try {
      await service.runTurn('a1.');
      const h = service.getNarrationHistory({ limit: -5 });
      expect(h.entries.length).toBe(1);
      expect(h.hasMore).toBe(false);
    } finally {
      memory.close();
    }
  });
```

E nel `describe('createCampaignService - reflect e serializzazione')`, dopo "reflect ripetuto sullo stesso stream non collide ...", aggiungi:

```ts
  it('reflect legge solo gli eventi freschi (loadSince dal cursore), riflettendo la scena nuova', async () => {
    const port: StructuredOutputPort = {
      generate: async <T>(request: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> => {
        if (request.schemaName === 'extract_facts') {
          const value = { facts: [{ subject: 'Goblin', predicate: 'fugge', object: 'nel bosco', functional: false, importance: 5 }] };
          return { value: value as T, strategy: 'function-call' };
        }
        return { value: { text: 'Il goblin fugge.', importance: 5 } as T, strategy: 'function-call' };
      },
    };
    const { service, memory } = makeService({ structured: port });
    try {
      await service.dispatch({ type: 'AddActor', actor: actor('goblin', 'Goblin') });
      const first = await service.reflect('sess-1');
      expect(first.factCount).toBe(1);
      // Il cursore e avanzato: una seconda reflect senza nuovi eventi e un no-op (legge loadSince(v) = []).
      const second = await service.reflect('sess-1');
      expect(second.factCount).toBe(0);
      expect(second.summarized).toBe(false);
    } finally {
      memory.close();
    }
  });
```

- [ ] **Step 2: Esegui i test (verifica RED)**

Run: `pnpm exec vitest run packages/host/src/campaign-service.test.ts`
Expected: FAIL — `limit:0` ritorna 2 entries (vecchio `slice(-0)`); il test reflect potrebbe gia passare (comportamento equivalente) ma serve a fissare il contratto.

- [ ] **Step 3: Aggiorna l'import dei tipi**

In cima a `packages/host/src/campaign-service.ts`, nell'import da `@loomn/memory` (riga 26 circa), aggiungi `type NarrationWindow`:

```ts
import type { CanonFact, CanonFactFilter, NarrationWindow, Summary, SummaryFilter } from '@loomn/memory';
```

- [ ] **Step 4: Riscrivi `getNarrationHistory` (finestrato + clamp)**

Sostituisci il corpo di `getNarrationHistory` (`:218-230`) con:

```ts
    getNarrationHistory(query: NarrationHistoryQuery = {}): NarrationHistory {
      // Clamp difensivo: limit<=0 o frazionario ritornerebbe garbage (M-05). Il confine IPC gia impone
      // .int().positive().max(200), ma CampaignService e chiamabile direttamente (difesa in profondita).
      const limit = Math.max(1, Math.trunc(query.limit ?? 50));
      // Finestra DB-side: chiediamo limit+1 righe per sapere se c e un altra pagina (hasMore), senza
      // contare/caricare l intero stream (I-05).
      const window: NarrationWindow = {
        limit: limit + 1,
        ...(query.before !== undefined ? { before: query.before } : {}),
      };
      const rows = deps.memory.eventStore.loadNarration(window); // gia newest-first
      const hasMore = rows.length > limit;
      const entries: NarrationEntry[] = rows.slice(0, limit).map((s) => {
        // loadNarration filtra type='NarrationRecorded' DB-side; il narrowing rende esplicito il tipo.
        if (s.event.type !== 'NarrationRecorded') {
          throw new Error('loadNarration ha restituito un evento non-narrazione');
        }
        return { seq: s.seq, playerAction: s.event.playerAction, narration: s.event.narration };
      });
      return { entries, hasMore };
    },
```

- [ ] **Step 5: Riscrivi `reflect` (finestrato dal cursore)**

Sostituisci, nel corpo di `reflect` (`:204-213`), la riga `const stored = deps.memory.eventStore.load();` e l'uso, con:

```ts
    reflect(scope: string): Promise<ReflectOutcome> {
      return enqueue(async () => {
        // Legge SOLO gli eventi freschi (seq > watermark): evita di Zod-parsare l intero stream a ogni
        // reflect (I-05). runScenesReflection ri-filtra sullo STESSO cursore (no-op) e avanza il watermark.
        const fresh = deps.memory.eventStore.loadSince(deps.memory.cursor.get());
        const results = await runScenesReflection(reflectionDepsFor(deps.memory, deps.structured), {
          events: fresh,
          scope,
        });
        const factCount = results.reduce((n, r) => n + r.facts.length, 0);
        const summarized = results.some((r) => r.summary !== null);
        return { factCount, summarized };
      });
    },
```

- [ ] **Step 6: Esegui i test (verifica GREEN) + typecheck**

Run: `pnpm exec vitest run packages/host/src/campaign-service.test.ts`
Expected: PASS (i 24 esistenti — inclusi i 3 test getNarrationHistory gia presenti, che restano verdi — + 3 nuovi = 27). I test esistenti "ritorna le voci newest-first", "rispetta limit e segnala hasMore, e pagina con before", "su stream senza narrazione e vuota" DEVONO restare verdi (equivalenza comportamentale).
Run: `pnpm -C packages/host typecheck`
Expected: nessun errore.

- [ ] **Step 7: Commit**

```bash
git add packages/host/src/campaign-service.ts packages/host/src/campaign-service.test.ts
git commit -m "fix(host): getNarrationHistory finestrato + clamp limit; reflect via loadSince [I-05/M-05]"
```

**Test attesi cumulativi:** ~727 (724 + 3).

---

## Task 3: Cabla lo snapshotting nell'application layer (M‑03)

**Findings:** M‑03.

**Files:**
- Modify: `packages/host/src/campaign-service.ts`
- Test: `packages/host/src/campaign-service.test.ts`

**Contesto:** `saveSnapshot`/`latestSnapshot` + tabella `snapshots` esistono e sono testati a livello adapter, ma `campaign-service.ts:139` fa SEMPRE `rebuild(load())` (full-replay ad ogni avvio): zero chiamanti di produzione, costo d'avvio monotono crescente. Cabliamo: all'avvio rebuild dallo snapshot + coda fresca (`loadSince`); save a soglia di N eventi dentro `dispatch`/`runTurn`. La firma di `createCampaignService` resta retro-compatibile (la soglia e un opzionale con default → il main di F4 non cambia).

- [ ] **Step 1: Scrivi i test (RED)**

Aggiungi un nuovo `describe` in fondo a `packages/host/src/campaign-service.test.ts`:

```ts
describe('createCampaignService - snapshot cablato (M-03)', () => {
  it('scrive uno snapshot alla soglia di eventi (snapshotEvery)', async () => {
    const memory = createMemorySystem(':memory:', { clock: { now: () => 1000 } });
    const service = createCampaignService({
      memory,
      model: fakeModel([{ type: 'finish', reason: 'stop' }]),
      structured: idlePort,
      rng: createSeededRandom(1),
      ruleset: SERVICE_RULESET,
      snapshotEvery: 2,
    });
    try {
      expect(memory.eventStore.latestSnapshot()).toBeUndefined();
      await service.dispatch({ type: 'AddActor', actor: actor('a', 'A') }); // v1: sotto soglia
      expect(memory.eventStore.latestSnapshot()).toBeUndefined();
      await service.dispatch({ type: 'AddActor', actor: actor('b', 'B') }); // v2: soglia raggiunta
      expect(memory.eventStore.latestSnapshot()?.version).toBe(2);
    } finally {
      memory.close();
    }
  });

  it('all avvio ricostruisce dallo snapshot + coda fresca: stesso stato del full-replay', async () => {
    const memory = createMemorySystem(':memory:', { clock: { now: () => 1000 } });
    try {
      const s1 = createCampaignService({
        memory,
        model: fakeModel([{ type: 'finish', reason: 'stop' }]),
        structured: idlePort,
        rng: createSeededRandom(1),
        ruleset: SERVICE_RULESET,
        snapshotEvery: 2,
      });
      await s1.dispatch({ type: 'AddActor', actor: actor('a', 'A') });
      await s1.dispatch({ type: 'AddActor', actor: actor('b', 'B') }); // snapshot @ v2
      await s1.dispatch({ type: 'AddActor', actor: actor('c', 'C') }); // v3 oltre lo snapshot
      // Nuovo servizio sulla stessa memoria: rebuild = snapshot(v2) + coda fresca(v3).
      const s2 = createCampaignService({
        memory,
        model: fakeModel([{ type: 'finish', reason: 'stop' }]),
        structured: idlePort,
        rng: createSeededRandom(1),
        ruleset: SERVICE_RULESET,
        snapshotEvery: 2,
      });
      expect(s2.getReadModel().version).toBe(3);
      expect(Object.keys(s2.getReadModel().state.actors).sort()).toEqual(['a', 'b', 'c']);
    } finally {
      memory.close();
    }
  });

  it('senza snapshot l avvio resta un full-replay corretto (retro-compatibile)', async () => {
    const memory = createMemorySystem(':memory:', { clock: { now: () => 1000 } });
    try {
      const s1 = createCampaignService({
        memory,
        model: fakeModel([{ type: 'finish', reason: 'stop' }]),
        structured: idlePort,
        rng: createSeededRandom(1),
        ruleset: SERVICE_RULESET,
        snapshotEvery: 1000, // soglia alta: nessuno snapshot scritto
      });
      await s1.dispatch({ type: 'AddActor', actor: actor('a', 'A') });
      expect(memory.eventStore.latestSnapshot()).toBeUndefined();
      const s2 = createCampaignService({
        memory,
        model: fakeModel([{ type: 'finish', reason: 'stop' }]),
        structured: idlePort,
        rng: createSeededRandom(1),
        ruleset: SERVICE_RULESET,
      });
      expect(s2.getReadModel().version).toBe(1);
      expect(s2.getReadModel().state.actors['a']?.name).toBe('A');
    } finally {
      memory.close();
    }
  });
});
```

- [ ] **Step 2: Esegui i test (verifica RED)**

Run: `pnpm exec vitest run packages/host/src/campaign-service.test.ts`
Expected: FAIL — `snapshotEvery` non esiste su `CampaignServiceDeps`; nessuno snapshot viene scritto.

- [ ] **Step 3: Importa `takeSnapshot` dal motore**

In `packages/host/src/campaign-service.ts`, aggiungi `takeSnapshot` all'import da `@loomn/engine` (riga 8-23):

```ts
  decide,
  applyEvent,
  rebuild,
  takeSnapshot,
  isCommandLegalInPhase,
```

- [ ] **Step 4: Aggiungi `snapshotEvery` ai deps e cabla startup + soglia**

(a) in `CampaignServiceDeps` (dopo `ruleset`):

```ts
  /** Ruleset iniettato (vocabolario + dcForDifficulty): passato a decide e runMasterTurn. */
  ruleset: Ruleset;
  /** Ogni quanti eventi salvare uno snapshot dello stato (default 100). Riduce il costo d avvio:
   *  all avvio si ricostruisce dallo snapshot piu recente + la sola coda fresca (M-03). */
  snapshotEvery?: number;
```

(b) costante + startup rebuild dallo snapshot. Sostituisci la riga `let state: GameState = rebuild(deps.memory.eventStore.load());` (`:138-139`) con:

```ts
export function createCampaignService(deps: CampaignServiceDeps): CampaignService {
  const snapshotEvery = deps.snapshotEvery ?? 100;
  // Avvio: ricostruisce dallo snapshot piu recente + la sola coda fresca (loadSince), invece del
  // full-replay O(stream) (M-03). Senza snapshot, loadSince(0) = tutti gli eventi → replay completo.
  const latestSnapshot = deps.memory.eventStore.latestSnapshot();
  let state: GameState = rebuild(deps.memory.eventStore.loadSince(latestSnapshot?.version ?? 0), latestSnapshot);
  let lastSnapshotVersion = latestSnapshot?.version ?? 0;
```

(c) helper di snapshot a soglia, definito subito dopo la closure `readModel` (`:152`):

```ts
  const readModel = (): ReadModel => ({ version: state.version, state });

  // Salva uno snapshot quando lo stream e cresciuto di almeno snapshotEvery eventi dall ultimo (M-03).
  // Chiamato dentro la coda FIFO dopo aver avanzato `state` (mai concorrente con un altra scrittura).
  function maybeSnapshot(): void {
    if (state.version - lastSnapshotVersion >= snapshotEvery) {
      deps.memory.eventStore.saveSnapshot(takeSnapshot(state));
      lastSnapshotVersion = state.version;
    }
  }
```

(d) chiama `maybeSnapshot()` dentro `dispatch` (dopo il loop `applyEvent`, prima del `return`):

```ts
    dispatch(command: Command): Promise<DispatchOutcome> {
      return enqueue(() => {
        const expected = state.version;
        const events = decide(state, command, deps.rng, deps.ruleset);
        deps.memory.eventStore.append(events, expected);
        for (const ev of events) state = applyEvent(state, ev);
        maybeSnapshot();
        return { events, readModel: readModel() };
      });
    },
```

(e) chiama `maybeSnapshot()` dentro `runTurn` (dentro il ramo `if (toStore.length > 0) { ... state = nextState; }`, subito dopo `state = nextState;`):

```ts
        if (toStore.length > 0) {
          deps.memory.eventStore.append(toStore, startVersion);
          state = nextState;
          maybeSnapshot();
        }
```

- [ ] **Step 5: Esegui i test (verifica GREEN) + typecheck**

Run: `pnpm exec vitest run packages/host/src/campaign-service.test.ts`
Expected: PASS (27 precedenti + 3 nuovi = 30). Il test esistente "ricostruisce la proiezione dallo stream persistito a una nuova costruzione" resta verde (default snapshotEvery=100, nessuno snapshot a v1 → full-replay come prima).
Run: `pnpm -C packages/host typecheck`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add packages/host/src/campaign-service.ts packages/host/src/campaign-service.test.ts
git commit -m "feat(host): cabla lo snapshotting (avvio da snapshot + coda fresca, save a soglia) [M-03]"
```

**Test attesi cumulativi:** ~730 (727 + 3).

---

## Task 4: Confine transazionale per-scena nella Reflection (M‑13)

**Findings:** M‑13.

**Files:**
- Modify: `packages/memory/src/reflection.ts`
- Test: `packages/memory/src/reflection.test.ts`
- Modify: `packages/host/src/memory-system.ts`
- Test: `packages/host/src/memory-system.test.ts`
- Modify: `packages/host/src/reflection-ports.ts`

**Contesto:** `runReflection` e atomica solo contro un fallimento LLM (ordina le `await` prima delle scritture). Ma le scritture vere (loop `ledger.record/supersede` + `summaries.record`) e l'avanzamento del cursor sono auto-commit separati. Un crash tra i fatti e il riassunto (o tra le scritture e il `cursor.set`) lascia fatti committati + cursor non avanzato → al retry la stessa scena ri-tenta gli STESSI id → UNIQUE constraint grezzo, scena bloccata per sempre. **Causa radice:** rendere ATOMICO l'intero blocco per-scena {fatti + riassunto + avanzamento cursor}: o committano tutti o nessuno. Cosi un crash o committa (cursor avanzato → retry salta la scena) o rolla-back tutto (cursor fermo, nessun fatto → retry ri-riflette pulito, ricorrenza/salienza ricalcolate fresche = determinismo preservato). L'idempotenza pura (`onConflictDoUpdate`) NON basta: al retry i fatti parziali gia presenti alzerebbero la `recurrence` → salienza diversa (rottura del determinismo). La transazione e la versione robusta.

Decomponiamo `runReflection` in fase async (`computeScene`: extract+summarize, FUORI dalla transazione — better-sqlite3 e sincrono) e fase sync (`writeScene`: ricorrenza + scritture). `runScenesReflection` avvolge {writeScene + cursor.set} in UNA transazione per scena. Il confine `runInTransaction` e iniettato opzionale (default pass-through → i test a fake restano verdi); lo fornisce il `MemorySystem` (host) sulla connessione condivisa.

- [ ] **Step 1: Aggiungi `runInTransaction` a `MemorySystem` (host) — test (RED)**

In `packages/host/src/memory-system.test.ts`, aggiungi nel `describe('createMemorySystem - connessione condivisa')`:

```ts
  it('runInTransaction committa il blocco e rolla-back su throw (M-13)', () => {
    const sys = createMemorySystem(':memory:', { clock: { now: () => 1000 } });
    try {
      // Commit: la scrittura sopravvive.
      sys.runInTransaction(() => {
        sys.ledger.record({ id: 'f1', subject: 's', predicate: 'p', object: 'o', eventSeq: 1 });
      });
      expect(sys.ledger.active().map((f) => f.id)).toEqual(['f1']);
      // Rollback: una scrittura seguita da throw NON sopravvive (atomicita).
      expect(() =>
        sys.runInTransaction(() => {
          sys.ledger.record({ id: 'f2', subject: 's', predicate: 'p', object: 'o', eventSeq: 2 });
          throw new Error('boom');
        }),
      ).toThrow('boom');
      expect(sys.ledger.active().map((f) => f.id)).toEqual(['f1']); // f2 rolled back
    } finally {
      sys.close();
    }
  });
```

- [ ] **Step 2: Esegui (RED)**

Run: `pnpm exec vitest run packages/host/src/memory-system.test.ts`
Expected: FAIL — `runInTransaction` non esiste su `MemorySystem`.

- [ ] **Step 3: Implementa `runInTransaction` in `MemorySystem`**

In `packages/host/src/memory-system.ts`:

(a) aggiungi alla `interface MemorySystem` (dopo `assembleContext`):

```ts
  /** Esegue `fn` in UNA transazione sulla connessione condivisa: tutte le scritture (ledger +
   *  summaries + cursor) committano o rollano-back insieme. La Reflection lo usa per l atomicita
   *  per-scena (M-13). better-sqlite3 e sincrono → `fn` deve essere sincrono (niente await dentro). */
  runInTransaction<T>(fn: () => T): T;
```

(b) nel `return { ... }` di `createMemorySystem`, aggiungi (dopo `assembleContext,`):

```ts
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
```

(Drizzle better-sqlite3 `db.transaction(cb)` e SINCRONO e ritorna il valore di `cb` (vedi `sqlite-event-store.ts:42`); le scritture via l handle condiviso `db` partecipano alla transazione perche la connessione e unica.)

- [ ] **Step 4: Esegui (GREEN) + typecheck**

Run: `pnpm exec vitest run packages/host/src/memory-system.test.ts`
Expected: PASS (5 esistenti + 1 = 6). **Verifica empirica chiave:** il ramo rollback prova che le scritture via handle condiviso partecipano alla transazione.
Run: `pnpm -C packages/host typecheck`
Expected: nessun errore.

- [ ] **Step 5: Reflection memory — test del rollback per-scena (RED)**

In `packages/memory/src/reflection.test.ts`, aggiungi gli import necessari in cima (il file gia importa `openDatabase`, `createCanonLedger`, `createSummaryStore`, `runReflection`, i tipi; aggiungi `type SummaryStore` all'import da `./summary-store`):

```ts
import { createSummaryStore, type SummaryStore } from './summary-store';
```

Aggiungi, dentro `describe('runReflection', ...)`, dopo "se il summarizer lancia, nessun fatto viene scritto ...":

```ts
  it('le scritture di scena sono atomiche dietro runInTransaction: fallimento a meta-scrittura → rollback (M-13)', async () => {
    open = openDatabase(':memory:');
    const ledger = createCanonLedger(open.db);
    const realSummaries = createSummaryStore(open.db);
    // Summaries che lancia DOPO che i fatti sono gia stati scritti nel ledger (dentro lo stesso writeScene).
    const throwingSummaries: SummaryStore = {
      record: () => {
        throw new Error('disco pieno a meta scrittura');
      },
      list: (filter) => realSummaries.list(filter),
    };
    const facts: ExtractedFact[] = [{ subject: 'pc1', predicate: 'trova', object: 'gemma', functional: false, importance: 7 }];
    const deps: ReflectionDeps = {
      ledger,
      summaries: throwingSummaries,
      extractor: fakeExtractor(facts),
      summarizer: fakeSummarizer({ text: 'scena', importance: 7 }),
      clock: fixedClock(1),
      runInTransaction: <T>(fn: () => T): T => open!.db.transaction(() => fn()),
    };
    await expect(runReflection(deps, { events, scope: 'sess1' })).rejects.toThrow('disco pieno');
    // Senza transazione i fatti resterebbero (auto-commit) → al retry UNIQUE collision. Con la
    // transazione il ledger e VUOTO: il retry puo ri-riflettere senza collidere.
    expect(ledger.active()).toEqual([]);
  });
```

- [ ] **Step 6: Esegui (RED)**

Run: `pnpm exec vitest run packages/memory/src/reflection.test.ts`
Expected: FAIL — `runInTransaction` non e nei `ReflectionDeps`, e/o `runReflection` non lo usa → il fatto resta nel ledger (`ledger.active()` non vuoto).

- [ ] **Step 7: Refactor `reflection.ts` (split compute/write + confine transazionale)**

Sostituisci INTEGRALMENTE da `export interface ReflectionDeps {` fino alla fine del file (`packages/memory/src/reflection.ts:50-156`) con:

```ts
export interface ReflectionDeps {
  ledger: CanonLedger;
  summaries: SummaryStore;
  extractor: FactExtractor;
  summarizer: Summarizer;
  clock: Clock;
  /** Confine transazionale opzionale per le SCRITTURE di scena (fatti + riassunto; in
   *  runScenesReflection anche il cursor): committano o falliscono insieme (M-13). Default
   *  pass-through (le impl a fake / senza db non transazionano). Lo fornisce il MemorySystem (host). */
  runInTransaction?: <T>(fn: () => T) => T;
}

export interface ReflectionResult {
  /** Fatti registrati nel Canon Ledger (gia attivi). */
  facts: CanonFact[];
  /** Riassunto di scena registrato in L2, o null se non c erano eventi. */
  summary: Summary | null;
}

/** Esito della fase async (LLM) di una scena: i dati da scrivere, ancora NON scritti. */
interface SceneComputation {
  from: number;
  to: number;
  extracted: ExtractedFact[];
  draft: SceneSummaryDraft;
}

/** Fase ASYNC: estrae fatti e riassunto (chiamate LLM). FUORI da qualunque transazione
 *  (better-sqlite3 e sincrono). Ritorna null se la scena e vuota. */
async function computeScene(deps: ReflectionDeps, input: ReflectionInput): Promise<SceneComputation | null> {
  if (input.events.length === 0) {
    return null;
  }
  const seqs = input.events.map((e) => e.seq);
  const from = Math.min(...seqs);
  const to = Math.max(...seqs);
  // Entrambe le chiamate LLM PRIMA di qualunque scrittura: la scena e atomica anche contro un
  // fallimento di extract/summarize (niente fatti scritti senza summary).
  const extracted = await deps.extractor.extract(input);
  const draft = await deps.summarizer.summarize(input);
  return { from, to, extracted, draft };
}

/** Fase SYNC: scrive fatti + riassunto nel DB. Da invocare dentro runInTransaction quando fornito,
 *  cosi le scritture sono atomiche (M-13). La ricorrenza e uno SNAPSHOT calcolato PRIMA delle scritture
 *  di questa scena (un conteggio per soggetto), cosi la salienza NON dipende dall ordine nel batch. */
function writeScene(deps: ReflectionDeps, input: ReflectionInput, c: SceneComputation): ReflectionResult {
  const recurrenceBySubject = new Map<string, number>();
  for (const ef of c.extracted) {
    if (!recurrenceBySubject.has(ef.subject)) {
      recurrenceBySubject.set(ef.subject, deps.ledger.active({ subject: ef.subject }).length);
    }
  }
  const facts: CanonFact[] = [];
  c.extracted.forEach((ef, i) => {
    const recurrence = recurrenceBySubject.get(ef.subject) ?? 0;
    const salience = scoreSalience({ importance: ef.importance, recurrence });
    const factInput = {
      id: `f-${c.from}-${c.to}-${i}`,
      subject: ef.subject,
      predicate: ef.predicate,
      object: ef.object,
      eventSeq: c.to,
      salience,
    };
    if (ef.functional) {
      deps.ledger.supersede(factInput);
    } else {
      deps.ledger.record(factInput);
    }
    facts.push({ ...factInput, status: 'active' });
  });

  const summary: Summary = {
    id: `s-scene-${c.from}-${c.to}`,
    level: 'scene',
    scope: input.scope,
    text: c.draft.text,
    importance: c.draft.importance,
    salience: scoreSalience({ importance: c.draft.importance, recurrence: 0 }),
    createdAt: deps.clock.now(),
    eventSeqFrom: c.from,
    eventSeqTo: c.to,
  };
  deps.summaries.record(summary);

  return { facts, summary };
}

/** Esegue la Reflection di una scena. Id deterministici dal range di seq della scena
 *  (`f-<from>-<to>-<i>`, `s-scene-<from>-<to>`) → precondizione: una sola Reflection per range
 *  (i call site 8a lanciano su id duplicato). Non fa rete: usa le porte iniettate. Le scritture
 *  sono avvolte in runInTransaction quando fornito (atomicita, M-13). */
export async function runReflection(deps: ReflectionDeps, input: ReflectionInput): Promise<ReflectionResult> {
  const c = await computeScene(deps, input);
  if (c === null) {
    return { facts: [], summary: null };
  }
  const run = deps.runInTransaction ?? (<T>(fn: () => T): T => fn());
  return run(() => writeScene(deps, input, c));
}

/** Deps della riflessione multi-scena: le ReflectionDeps single-scene + il cursor (watermark).
 *  runReflection accetta comunque queste deps piu larghe (ignora `cursor`). */
export interface ScenesReflectionDeps extends ReflectionDeps {
  cursor: ReflectionCursor;
}

/** Riflette tutte le scene non ancora riflesse (seq > cursor), segmentate ai confini PhaseChanged
 *  (item 6). Per ogni scena: fase LLM async FUORI dalla transazione, poi {scritture + avanzamento
 *  cursor} in UNA transazione (quando runInTransaction e fornito) → la scena e atomica (M-13): un
 *  crash o committa tutto (cursor avanzato, retry salta) o rolla-back tutto (cursor fermo, nessun
 *  fatto, retry ri-riflette pulito). La coda aperta (oltre l ultimo PhaseChanged) viene riflessa
 *  (flush). Nessun evento nuovo → []. */
export async function runScenesReflection(
  deps: ScenesReflectionDeps,
  input: ReflectionInput,
): Promise<ReflectionResult[]> {
  const through = deps.cursor.get();
  const fresh = input.events.filter((e) => e.seq > through);
  const scenes = segmentScenes(fresh);
  const run = deps.runInTransaction ?? (<T>(fn: () => T): T => fn());
  const results: ReflectionResult[] = [];
  for (const scene of scenes) {
    const sceneInput: ReflectionInput = { events: scene, scope: input.scope };
    // Fase async (LLM) FUORI dalla transazione.
    const c = await computeScene(deps, sceneInput);
    if (c === null) continue; // segmentScenes non produce scene vuote; guardia difensiva.
    // Fase sync atomica: scritture + avanzamento cursor insieme.
    const res = run(() => {
      const r = writeScene(deps, sceneInput, c);
      const lastSeq = scene[scene.length - 1]?.seq;
      if (lastSeq !== undefined) deps.cursor.set(lastSeq);
      return r;
    });
    results.push(res);
  }
  return results;
}
```

- [ ] **Step 8: Inoltra `runInTransaction` da `reflectionDepsFor` (host)**

In `packages/host/src/reflection-ports.ts`, nel `return` di `reflectionDepsFor` (`:117-124`), aggiungi `runInTransaction`:

```ts
export function reflectionDepsFor(system: MemorySystem, port: StructuredOutputPort): ScenesReflectionDeps {
  return {
    ledger: system.ledger,
    summaries: system.summaries,
    extractor: createLlmFactExtractor(port),
    summarizer: createLlmSummarizer(port),
    clock: system.clock,
    cursor: system.cursor,
    runInTransaction: system.runInTransaction,
  };
}
```

- [ ] **Step 9: Esegui i test (verifica GREEN) + typecheck**

Run: `pnpm exec vitest run packages/memory/src/reflection.test.ts packages/host/src/memory-system.test.ts packages/host/src/campaign-service.test.ts`
Expected: PASS. Tutti i 13 test esistenti di `reflection.test.ts` (inclusi runReflection e runScenesReflection, e il test "il cursor avanza per scena: un fallimento a meta...") restano verdi (default pass-through); il nuovo test M-13 passa (rollback). I test reflect di `campaign-service.test.ts` restano verdi (ora ogni scena gira in una transazione reale).
Run: `pnpm -C packages/memory typecheck && pnpm -C packages/host typecheck`
Expected: nessun errore.

- [ ] **Step 10: Commit**

```bash
git add packages/memory/src/reflection.ts packages/memory/src/reflection.test.ts packages/host/src/memory-system.ts packages/host/src/memory-system.test.ts packages/host/src/reflection-ports.ts
git commit -m "fix(memory,host): confine transazionale per-scena nella Reflection (fatti+riassunto+cursor atomici) [M-13]"
```

**Test attesi cumulativi:** ~732 (730 + 2: 1 memory + 1 host).

---

## Task 5: Drift guard `Command`↔`commandSchema` bidirezionale ed esaustivo (I‑10)

**Findings:** I‑10.

**Files:**
- Modify/Test: `packages/host/src/command-schema.test.ts`

**Contesto:** gli eventi hanno un guard compile-time bidirezionale esaustivo (`sqlite-event-store.ts:85-90`). Il guard `Command` vive solo in un test ed e (1) forward-only (6 `: Command` runtime su 11 varianti), (2) non esaustivo, (3) runtime. Una modifica al `Command` del motore puo desincronizzare il contratto IPC senza rompere build ne test. Promuoviamo il guard alla stessa forza: due righe compile-time bidirezionali (sorelle di quelle degli eventi) + estendiamo gli esempi runtime a TUTTE le 11 varianti + un probe `@ts-expect-error`. `@loomn/host` typecheck-a i file `.test.ts` (tsconfig `include: ["src"]`) → il guard nel test e effettivo; `commandSchema` e gia importato qui (devDependency `@loomn/shared`), nessun cambio di manifest.

- [ ] **Step 1: Aggiungi il guard compile-time bidirezionale + probe + esempi esaustivi**

In `packages/host/src/command-schema.test.ts`:

(a) estendi l'import in cima per avere `z` e i tipi necessari. Sostituisci le righe di import iniziali (`:1-10`) con:

```ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import type { Command } from '@loomn/engine';
import {
  DIFFICULTIES as ENGINE_DIFFICULTIES,
  SOFT_PHASES as ENGINE_SOFT_PHASES,
  QUEST_OUTCOMES as ENGINE_QUEST_OUTCOMES,
  RESOURCE_DIRECTIONS as ENGINE_RESOURCE_DIRECTIONS,
} from '@loomn/engine';
import { commandSchema } from '@loomn/shared';
import { DIFFICULTIES, SOFT_PHASES, QUEST_OUTCOMES, RESOURCE_DIRECTIONS } from '@loomn/shared';
```

(b) aggiungi a livello di MODULO (dopo gli import, prima del primo `describe`) il guard bidirezionale esaustivo + il probe:

```ts
// Drift guard COMPILE-TIME bidirezionale ed esaustivo Command <-> commandSchema (sorella del guard
// eventi in memory/sqlite-event-store.ts). z.output<commandSchema> e l unione inferita DOPO i
// .transform(); se una QUALSIASI variante driftasse (campo richiesto aggiunto/rimosso/rinominato, o
// variante nuova/spuria) una di queste righe fallirebbe il typecheck. shared e foglia → vive in host,
// dove engine e shared coesistono. (I 6 it() runtime sotto restano come documentazione eseguibile.)
type _CmdInfer = z.output<typeof commandSchema>;
const _cmdForward: Command = null as unknown as _CmdInfer;
const _cmdBackward: _CmdInfer = null as unknown as Command;
void _cmdForward;
void _cmdBackward;

// Probe del meccanismo: una variante "driftata" (campo richiesto in piu su Attack) NON e assegnabile
// dal Command del motore → la direzione backward del guard morderebbe cosi. Il @ts-expect-error PROVA
// che il guard ha denti: se un giorno il drift sparisse (i tipi coincidessero col campo extra) la riga
// smetterebbe di errorare e il test fallirebbe, segnalando un guard cieco.
type _DriftedAttack = Extract<Command, { type: 'Attack' }> & { campoDriftato: string };
// @ts-expect-error - Attack del motore NON ha `campoDriftato`: il guard backward morde su un drift simile
const _driftBites: _DriftedAttack = null as unknown as Extract<Command, { type: 'Attack' }>;
void _driftBites;
```

(c) estendi gli esempi runtime alle 5 varianti mancanti (AddActor, StartEncounter, EndTurn, NextRound, Attack), per esaustivita anche a runtime. Aggiungi, dentro `describe('commandSchema -> Command del motore (cast-free)', ...)`, dopo `it('EndEncounter e assegnabile a Command', ...)`:

```ts
  it('AddActor e assegnabile a Command', () => {
    const c: Command = commandSchema.parse({
      type: 'AddActor',
      actor: { id: 'a', name: 'A', kind: 'npc', attributes: {}, skills: {}, resources: {}, conditions: [], items: [], progression: { xp: 0, level: 1 } },
    });
    expect(c.type).toBe('AddActor');
  });

  it('StartEncounter e assegnabile a Command', () => {
    const c: Command = commandSchema.parse({
      type: 'StartEncounter',
      encounterId: 'e1',
      participants: [{ actorId: 'a', zone: 'z1', initiative: 10 }],
    });
    expect(c.type).toBe('StartEncounter');
  });

  it('EndTurn e assegnabile a Command', () => {
    const c: Command = commandSchema.parse({ type: 'EndTurn' });
    expect(c.type).toBe('EndTurn');
  });

  it('NextRound e assegnabile a Command', () => {
    const c: Command = commandSchema.parse({ type: 'NextRound' });
    expect(c.type).toBe('NextRound');
  });

  it('Attack e assegnabile a Command', () => {
    const c: Command = commandSchema.parse({
      type: 'Attack',
      attackerId: 'a',
      targetId: 'b',
      defense: 'difesa',
      defenseBase: 12,
      damageResource: 'hp',
    });
    expect(c.type).toBe('Attack');
  });
```

- [ ] **Step 2: Esegui i test + typecheck (verifica)**

Run: `pnpm exec vitest run packages/host/src/command-schema.test.ts`
Expected: PASS (10 esistenti + 5 nuovi = 15).
Run: `pnpm -C packages/host typecheck`
Expected: nessun errore. **Verifica empirica del probe:** il `@ts-expect-error` e atteso (la riga errora come previsto → typecheck pulito); se il `@ts-expect-error` fosse INUTILE tsc segnalerebbe "Unused '@ts-expect-error' directive" → fallirebbe. Conferma quindi che il guard ha denti.

- [ ] **Step 3: Commit**

```bash
git add packages/host/src/command-schema.test.ts
git commit -m "test(host): drift guard Command<->commandSchema bidirezionale esaustivo + probe @ts-expect-error [I-10]"
```

**Test attesi cumulativi:** ~737 (732 + 5).

---

## Task 6: `.strict()` sugli arm di `domainEventSchema` — drift evento RUMOROSO (M‑01)

**Findings:** M‑01.

**Files:**
- Modify: `packages/shared/src/domain-schema.ts`
- Test: `packages/memory/src/sqlite-event-store.test.ts`

**Contesto:** il guard `_eventForward`/`_eventBackward` (assignability) coglie il drift di campo RICHIESTO ma NON quello di campo OPZIONALE: se un evento engine guadagna un opzionale e lo schema non e aggiornato, build+test verdi ma `domainEventSchema.parse()` STRIPPA il campo silenziosamente a ogni lettura/rebuild/IPC. Fix: `.strict()` sui 13 arm di `domainEventSchema` → un campo non dichiarato fa FALLIRE il parse (rilevabile dai round-trip). **Debt-free-safe (vedi nota in testa al piano):** gli eventi storici non hanno mai chiavi extra (il motore e l unico writer e scrive solo i campi dichiarati) → `.strict()` non rifiuta MAI un dato storico; rifiuta solo un drift FUTURO, che e cio che vogliamo rendere rumoroso. `.strict()` NON cambia il tipo inferito → il drift guard bidirezionale resta valido (verificato: `z.infer` invariato sotto `.strict()`).

- [ ] **Step 1: Scrivi il test round-trip (RED)**

In `packages/memory/src/sqlite-event-store.test.ts`, aggiungi nel `describe('createSqliteEventStore - isolamento e validazione', ...)` (dopo "load lancia se un payload memorizzato e malformato ..."):

```ts
  it('domainEventSchema e strict: un campo non dichiarato fa fallire il load (drift evento RUMOROSO)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loomn-mem-'));
    const path = join(dir, 'drift.db');
    try {
      const inject = openDatabase(path);
      // NarrationRecorded VALIDO + un campo top-level non dichiarato: col vecchio schema veniva
      // strippato in silenzio (drift cieco); ora .strict() lo rifiuta al confine di lettura.
      inject.db
        .insert(events)
        .values({
          type: 'NarrationRecorded',
          payload: JSON.stringify({ type: 'NarrationRecorded', playerAction: 'a', narration: 'b', campoFantasma: 1 }),
        })
        .run();
      inject.close();
      const store = createSqliteEventStore(path);
      expect(() => store.load()).toThrow(ZodError);
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 2: Esegui (RED)**

Run: `pnpm exec vitest run packages/memory/src/sqlite-event-store.test.ts`
Expected: FAIL — col vecchio schema il campo extra viene strippato e `load()` non lancia.

- [ ] **Step 3: Applica `.strict()` ai 13 arm di `domainEventSchema`**

In `packages/shared/src/domain-schema.ts`:

(a) il `checkResolvedEventSchema` (`:212-228`) e `z.object({...}).transform(...)`: inserisci `.strict()` tra `z.object({...})` e `.transform(...)`:

```ts
const checkResolvedEventSchema = z
  .object({
    type: z.literal('CheckResolved'),
    actorId: z.string(),
    attribute: z.string().optional(),
    skill: z.string().optional(),
    difficulty: difficultySchema,
    result: checkResultSchema,
  })
  .strict()
  .transform((o) => ({
    type: o.type,
    actorId: o.actorId,
    difficulty: o.difficulty,
    result: o.result,
    ...(o.attribute !== undefined ? { attribute: o.attribute } : {}),
    ...(o.skill !== undefined ? { skill: o.skill } : {}),
  }));
```

(b) sostituisci la `discriminatedUnion` dentro `domainEventSchema` (`:232-261`) aggiungendo `.strict()` a OGNI arm `z.object`:

```ts
export const domainEventSchema = z.union([
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('ActorAdded'), actor: actorSchema }).strict(),
    z.object({ type: z.literal('EncounterStarted'), encounter: encounterSchema }).strict(),
    z.object({ type: z.literal('TurnEnded') }).strict(),
    z.object({ type: z.literal('RoundAdvanced') }).strict(),
    z
      .object({
        type: z.literal('AttackResolved'),
        attackerId: z.string(),
        targetId: z.string(),
        check: checkResultSchema,
        hit: z.boolean(),
      })
      .strict(),
    z.object({ type: z.literal('DamageApplied'), targetId: z.string(), resource: z.string(), amount: finiteNumber }).strict(),
    z.object({ type: z.literal('ActorDowned'), actorId: z.string() }).strict(),
    z.object({ type: z.literal('NarrationRecorded'), playerAction: z.string(), narration: z.string() }).strict(),
    z
      .object({
        type: z.literal('ResourceEffectApplied'),
        targetId: z.string(),
        resource: z.string(),
        delta: finiteNumber,
        roll: z.object({ ...rollResultFields }),
      })
      .strict(),
    z.object({ type: z.literal('QuestStarted'), quest: questSchema }).strict(),
    z.object({ type: z.literal('QuestAdvanced'), questId: z.string(), status: questOutcomeSchema }).strict(),
    z.object({ type: z.literal('PhaseChanged'), from: phaseSchema, to: phaseSchema }).strict(),
    z.object({ type: z.literal('EncounterEnded'), encounterId: z.string() }).strict(),
  ]),
  checkResolvedEventSchema,
]);
```

(Nota di scope: stricti solo gli ARM top-level di `domainEventSchema` (la superficie di drift documentata, es. `CheckResolved.note?`). NON stricti gli schemi annidati (actorSchema/encounterSchema/checkResultSchema/...) ne `gameStateSchema`: resterebbero coperti dal guard di assignability per i campi richiesti, e stricti tutto sarebbe over-engineering oltre il finding.)

- [ ] **Step 4: Esegui i test (verifica GREEN) + typecheck**

Run: `pnpm exec vitest run packages/memory/src/sqlite-event-store.test.ts packages/shared/src/domain-schema.test.ts`
Expected: PASS. Il nuovo test M-01 passa; TUTTI i test esistenti di shared e dello store restano verdi (gli eventi reali non hanno chiavi extra → `.strict()` non li rifiuta = prova empirica della debt-free-safety). Se `packages/shared` non ha `domain-schema.test.ts`, lancia solo il file dello store.
Run: `pnpm -C packages/shared typecheck && pnpm -C packages/memory typecheck`
Expected: nessun errore (il tipo inferito di `domainEventSchema` e invariato → il drift guard bidirezionale in `sqlite-event-store.ts` resta valido).

- [ ] **Step 5: Verifica anti-regressione del confine IPC (host)**

Run: `pnpm exec vitest run packages/host`
Expected: PASS — il round-trip wire→motore (`command-schema.test.ts`) e i test del servizio restano verdi (`.strict()` e su `domainEventSchema`, non su `commandSchema`).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/domain-schema.ts packages/memory/src/sqlite-event-store.test.ts
git commit -m "fix(shared): .strict() sugli arm di domainEventSchema -> drift evento rumoroso, non silenzioso [M-01]"
```

**Test attesi cumulativi:** ~738 (737 + 1).

---

## Task 7: Tie-break canon deterministico (M‑12) + `getRuleset` verifica tutte le soft-phase (M‑14)

**Findings:** M‑12, M‑14. (Due fix piccoli e indipendenti, in pacchetti diversi: scope chiaramente delimitato per sotto-step.)

**Files:**
- Modify: `packages/memory/src/canon-ledger.ts`
- Test: `packages/memory/src/canon-ledger.test.ts`
- Modify: `packages/host/src/campaign-service.ts`
- Test: `packages/host/src/campaign-service.test.ts`

### Parte A — M‑12 (memory): tie-break su `id` a parita di `eventSeq`

**Contesto:** `canon-ledger.ts:90` ordina solo per `eventSeq`. La Reflection assegna lo STESSO `eventSeq` a tutti i fatti di una scena (`reflection.ts` `eventSeq: to`) → l'ordine di `f-5-7-0`/`f-5-7-1` e demandato al tie-break non specificato di SQLite. Il Context Assembler rende L1.5 in quest'ordine → minaccia il determinismo dichiarato. Fix: tie-break secondario su `id` (gia lessicograficamente coerente con l'ordine d'estrazione).

- [ ] **Step A1: Scrivi il test (RED)**

In `packages/memory/src/canon-ledger.test.ts`, aggiungi (usa la pattern di setup del file: leggi le prime righe per gli helper `openDatabase`/`createCanonLedger`; se serve un `afterEach` che chiude `open`, e gia presente):

```ts
  it('a parita di eventSeq ordina per id (tie-break deterministico, non l ordine di inserimento)', () => {
    open = openDatabase(':memory:');
    const ledger = createCanonLedger(open.db);
    // Inserisco in ordine di id DECRESCENTE ma stesso eventSeq: l uscita deve essere per id crescente.
    ledger.record({ id: 'f-5-7-1', subject: 's', predicate: 'p', object: 'b', eventSeq: 7 });
    ledger.record({ id: 'f-5-7-0', subject: 's', predicate: 'p', object: 'a', eventSeq: 7 });
    expect(ledger.active().map((f) => f.id)).toEqual(['f-5-7-0', 'f-5-7-1']);
    expect(ledger.all().map((f) => f.id)).toEqual(['f-5-7-0', 'f-5-7-1']);
  });
```

(Se il file usa un setup diverso da `let open` con `afterEach`, adatta al pattern locale leggendo `canon-ledger.test.ts`; il punto e: due fatti stesso `eventSeq`, inseriti in ordine di id inverso, devono uscire per id.)

- [ ] **Step A2: Esegui (RED)**

Run: `pnpm exec vitest run packages/memory/src/canon-ledger.test.ts`
Expected: FAIL — senza tie-break SQLite ritorna l'ordine di inserimento (`f-5-7-1`, `f-5-7-0`).

- [ ] **Step A3: Aggiungi il tie-break**

In `packages/memory/src/canon-ledger.ts`, nella closure `query` (`:90`), aggiungi `canonFacts.id` all'`orderBy`:

```ts
    const rows = db.select().from(canonFacts).where(buildWhere(filter, activeOnly)).orderBy(canonFacts.eventSeq, canonFacts.id).all();
```

- [ ] **Step A4: Esegui (GREEN)**

Run: `pnpm exec vitest run packages/memory/src/canon-ledger.test.ts`
Expected: PASS (9 esistenti + 1 = 10).

### Parte B — M‑14 (host): `getRuleset` verifica la legalita su TUTTE le soft-phase

**Contesto:** `getRuleset` (`campaign-service.ts:253-258`) usa `'exploration'` come proxy hardcoded di "qualsiasi fase non-combat". Regge perche `commands.ts:63` tratta ogni non-combat identicamente, ma e un'assunzione non imposta: se l'engine introducesse un comando legale in `dialogue` ma non in `exploration`, la derivazione produrrebbe `combatOnly`/`nonCombatOnly` silenziosamente sbagliati. Fix: derivare verificando che la legalita sia COSTANTE su tutte le `SOFT_PHASES` (throw rumoroso se diverge), invece del proxy singolo.

- [ ] **Step B1: Scrivi il test (RED/regressione)**

In `packages/host/src/campaign-service.test.ts`, nel `describe('createCampaignService - getRuleset ...')`, dopo "deriva le regole di legalita-per-fase da isCommandLegalInPhase", aggiungi:

```ts
  it('deriva le regole verificando la legalita su TUTTE le soft-phase (non solo exploration) [M-14]', () => {
    const { service, memory } = makeService();
    try {
      // Le soft-phase trattano i comandi in modo identico oggi → la derivazione e coerente, niente throw,
      // e l output resta stabile. (Il guard interno lancerebbe se una soft-phase divergesse.)
      const rs = service.getRuleset();
      expect([...rs.commandPhaseRules.combatOnly].sort()).toEqual(['Attack', 'EndEncounter', 'EndTurn', 'NextRound']);
      expect([...rs.commandPhaseRules.nonCombatOnly].sort()).toEqual(['EnterPhase', 'StartEncounter']);
    } finally {
      memory.close();
    }
  });
```

- [ ] **Step B2: Esegui (verifica: passa col vecchio codice, fissa il contratto)**

Run: `pnpm exec vitest run packages/host/src/campaign-service.test.ts`
Expected: PASS gia col vecchio codice (output identico) — il test fissa il comportamento prima del refactor (anti-regressione del fix interno).

- [ ] **Step B3: Sostituisci il proxy con la verifica esaustiva**

In `packages/host/src/campaign-service.ts`, dentro `getRuleset()` (`:247-258`), sostituisci le due `const combatOnly`/`nonCombatOnly` con una derivazione che verifica la costanza su tutte le soft-phase:

```ts
    getRuleset(): RulesetView {
      const v = deps.ruleset.vocabulary;
      // MEMBERSHIP e ORDINE derivano da COMMAND_TYPES (guardato esaustivo a compile-time) filtrato con
      // isCommandLegalInPhase. Invece di usare 'exploration' come proxy di "qualsiasi non-combat" (M-14),
      // verifichiamo che la legalita sia COSTANTE su TUTTE le SOFT_PHASES: se una soft-phase divergesse,
      // questa derivazione lancerebbe (rumoroso) invece di produrre regole silenziosamente sbagliate.
      const legalInAllSoftPhases = (type: Command['type']): boolean => {
        const results = SOFT_PHASES.map((p) => isCommandLegalInPhase(p, type));
        const first = results[0] ?? true;
        if (results.some((r) => r !== first)) {
          throw new Error(`Legalita di fase incoerente per ${type} tra le soft-phase: ${SOFT_PHASES.join(', ')}`);
        }
        return first;
      };
      const combatOnly = COMMAND_TYPES.filter((t) => isCommandLegalInPhase('combat', t) && !legalInAllSoftPhases(t));
      const nonCombatOnly = COMMAND_TYPES.filter((t) => !isCommandLegalInPhase('combat', t) && legalInAllSoftPhases(t));
      return {
```

(Il resto del corpo di `getRuleset` — il `return { vocabulary: {...}, ..., commandPhaseRules: { combatOnly: [...combatOnly], nonCombatOnly: [...nonCombatOnly] } }` — resta invariato. `SOFT_PHASES`, `COMMAND_TYPES`, `isCommandLegalInPhase` e `type Command` sono gia importati da `@loomn/engine` in cima al file.)

- [ ] **Step B4: Esegui (GREEN) + typecheck**

Run: `pnpm exec vitest run packages/host/src/campaign-service.test.ts`
Expected: PASS (i 3 getRuleset esistenti + 1 nuovo, output invariato).
Run: `pnpm -C packages/host typecheck`
Expected: nessun errore.

- [ ] **Step 5: Commit (entrambe le parti)**

```bash
git add packages/memory/src/canon-ledger.ts packages/memory/src/canon-ledger.test.ts packages/host/src/campaign-service.ts packages/host/src/campaign-service.test.ts
git commit -m "fix(memory,host): tie-break canon su id [M-12]; getRuleset verifica tutte le soft-phase [M-14]"
```

**Test attesi cumulativi:** ~740 (738 + 2: 1 memory + 1 host).

---

## Verifica finale di fase (prima della final review)

- [ ] `pnpm exec vitest run packages/memory packages/host` → tutti verdi (~740; verifica il conteggio reale).
- [ ] `pnpm -C packages/memory typecheck` · `pnpm -C packages/host typecheck` · `pnpm -C packages/shared typecheck` → puliti.
- [ ] `git status --short` → solo i file di scope toccati (memory/host/shared + i loro test); NIENTE `package.json`/`tsconfig*`/`vitest.config*`.
- [ ] Nessun gate Electron in F2 (entra da F4).

---

## Self-review (copertura dei finding F2)

- **I‑05** (narration full-scan + Zod per pagina) → Task 1 (`loadSince`/`loadNarration` DB-side) + Task 2 (`getNarrationHistory`/`reflect` li usano). ✅
- **I‑10** (drift guard Command debole) → Task 5 (bidirezionale esaustivo + probe `@ts-expect-error`). ✅
- **M‑01** (drift guard cieco agli opzionali) → Task 6 (`.strict()` sugli arm di `domainEventSchema` + round-trip). ✅
- **M‑03** (snapshot mai usato) → Task 3 (avvio da snapshot + coda fresca, save a soglia). ✅
- **M‑05** (`limit=0` ritorna tutto) → Task 2 (`Math.max(1, Math.trunc(...))`). ✅
- **M‑12** (ordine canon indeterminato) → Task 7A (tie-break `.orderBy(eventSeq, id)`). ✅
- **M‑13** (reflection senza transazione) → Task 4 (confine transazionale per-scena {fatti+riassunto+cursor}). ✅
- **M‑14** (`getRuleset` proxy `'exploration'`) → Task 7B (verifica costanza su tutte le SOFT_PHASES). ✅

**Causa radice, no debiti:** ogni fix e la versione robusta (letture DB-side senza toccare lo schema di lettura; snapshot cablato col path `rebuild`-da-snapshot gia testato; transazione che preserva il determinismo della ricorrenza; guard compile-time esaustivi; `.strict()` debt-free-safe perche il motore e l unico writer). Nessuna pezza minima.

**No regressioni di lettura:** nessuno schema di lettura e ristretto in modo da rifiutare dati storici. I‑05/M‑05 cambiano il PIANO di lettura (query finestrate), non lo schema. `.strict()` (M‑01) e safe perche gli eventi storici non hanno chiavi extra (verificato dal fatto che i round-trip esistenti restano verdi).

**No placeholder:** ogni step ha codice completo, comandi e output atteso.

---

## Execution Handoff

Piano salvato in `docs/superpowers/plans/2026-06-19-loomn-fix-remediation-f2-memoria-host.md`.

**Flusso (mandato utente):** committa questo doc su `main` (commit `docs:` con `Co-Authored-By`) → branch `fix/remediation-f2-memoria-host` (MAI su main) → subagent-driven (per task: implementer col TESTO COMPLETO del task [NON fargli leggere il file di piano] → spec-review → code-quality-review; hardening solo su rami reali, verifica empirica del feedback) → final review opus dell'intero branch → `finishing-a-development-branch`: merge ff in `main` → `pnpm test` (full, ABI Node) → `git push origin main` → cancella il branch → aggiorna HANDOFF + memoria (F2 fatto, conteggio test, prossimo = F3) → FERMATI prima di F3 per il check dell'utente.

**Dopo F2:** F3 (AI: I‑04, I‑07-tool, M‑04) → F4 (IPC/main, gate Electron) → F5 → F6 → F7, una fase alla volta col piano dettagliato just-in-time.
