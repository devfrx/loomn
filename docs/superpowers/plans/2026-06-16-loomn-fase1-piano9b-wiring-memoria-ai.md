# Piano 9b — Wiring memoria+AI (core testabile) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Comporre per la prima volta `@loomn/ai` + `@loomn/memory` in un nuovo pacchetto `@loomn/host` che, su UNA sola connessione SQLite condivisa, espone il sottosistema di memoria (event store + Canon Ledger + Summary Store + Context Assembler), un Clock di sistema reale, e le implementazioni LLM-backed di `FactExtractor`/`Summarizer` che pilotano `runReflection` — il tutto unit-testabile a porte iniettate su ABI Node, senza DB nativo nell'app (concern del 9c).

**Architecture:** Architettura esagonale: `engine` puro, `memory` e `ai` indipendenti (nessuno dei due importa l'altro). `@loomn/host` è il **pacchetto di composizione**: l'unico posto dove `ai` e `memory` si incontrano. Il percorso di **lettura** (Context Assembler, spec §6.2) viene composto da `createMemorySystem` ed iniettato in `runMasterTurn` al posto di `assembleContextStub`; il percorso di **scrittura** (Reflection, spec §6.1) viene composto da `reflectionDepsFor`, che monta le porte LLM-backed (su `StructuredOutputPort` di 7b) sopra ledger/summaries/clock del MemorySystem. Tutte le porte sono iniettabili → i test usano doppi/fake e restano deterministici su ABI Node.

**Tech Stack:** TypeScript strict (ESM, `verbatimModuleSyntax`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), pnpm workspaces, Vitest, Zod, Drizzle ORM + better-sqlite3 (riusati via `@loomn/memory`, NON importati direttamente da host).

**Riferimenti spec (autorità):** `docs/superpowers/specs/2026-06-15-simulatore-campagne-ai-design.md` — §5.4 (AI Master come pipeline esplicita), §6.1 (Reflection, write path), §6.2 (Context Assembler, read path), §7 (strato AI / `StructuredOutputPort`). Continuità operativa: `docs/superpowers/HANDOFF.md` §7-bis (groundwork già verificato per 9b — NON rifare la sandbox) e §0/§8.

---

## Contesto: cosa esiste già (non reimplementarlo)

Tutti i pacchetti sono mergiati in `main`, **221 test verdi**, typecheck pulito.

- **`@loomn/engine`** — Event Sourcing puro: `decide`/`applyEvent`/`initialState`/`replay`, `createSeededRandom`, tipi `GameState`/`DomainEvent`/`StoredEvent`/`Command`/`RandomSource`/`Actor`, porta `EventStore`, `ConcurrencyError`, `Snapshot`/`takeSnapshot`/`rebuild`.
- **`@loomn/memory`** — `openDatabase(dbPath): { db, close }` (apre better-sqlite3 + migra); `createSqliteEventStore(dbPath)` (apre la SUA connessione); `createCanonLedger(db)` (L1.5, prende un handle Drizzle); `createSummaryStore(db)` (L2, prende un handle); `createContextAssembler(deps{ledger,summaries,clock}, config{tokenBudget,estimateTokens?,recencyDecayPerHour?})` (read path 8c, ritorna `(state)=>string`); `runReflection(deps{ledger,summaries,extractor,summarizer,clock}, input{events,scope})` (write path 8b, porte iniettate); porta `Clock` (`now():number`); tipi `FactExtractor`/`Summarizer`/`ExtractedFact`/`SceneSummaryDraft`/`ReflectionInput`/`ReflectionDeps`/`ReflectionResult`/`CanonLedger`/`SummaryStore`. `memory` **NON importa `ai`**.
- **`@loomn/ai`** — porta `LanguageModel` (async/streaming) + `collectResponse`; `createStructuredOutput(model, opts?): StructuredOutputPort` (3 livelli di fallback, Zod come gate) con `StructuredOutputRequest`/`StructuredOutputResult`; `runMasterTurn(request)` con `MasterTurnRequest.assembleContext?: AssembleContext` (punto di iniezione 8c; default `assembleContextStub`); tipi `LlmMessage`/`LlmStreamEvent`. `ai` **NON importa `memory`**.

**Verificato empiricamente in sandbox (HANDOFF §7-bis) — fondamento di questo piano:**
- L'event store può girare su un handle Drizzle già aperto (`eventStoreOn(db)`): da qui `createSqliteEventStoreOn(db)`.
- `openDatabase(':memory:')` → ledger + summary + assembler + event store sulla **stessa** connessione: letture coerenti, concorrenza ottimistica ok.
- Né `ai` né `memory` possono importarsi a vicenda; un pacchetto `packages/*` che dipende da entrambi (`@loomn/host`) li compone e resta coperto da `vitest.config.ts` (`packages/**`) **senza toccarlo**.

---

## Fuori ambito (esplicito) — NON fare in 9b

- **Nessun DB nativo nell'app / nessun Electron.** `better-sqlite3` ricompilato per ABI Electron, copia migrazioni in `out/migrations`, conflitto ABI Node↔Electron, `safeStorage` per le chiavi: tutto **Piano 9c**. In 9b si lavora solo su ABI Node (`:memory:` nei test) → i 221 test restano verdi.
- **Nessun IPC write/read reale.** Il giro Command→persisti→proietta e il push degli Event al renderer sono 9c.
- **Nessun adapter di rete reale.** I test usano fake `LanguageModel` / fake `StructuredOutputPort`; nessuna chiamata HTTP.
- **Nessun cambiamento a `runMasterTurn` o allo `StructuredOutputPort`.** Il punto di iniezione (`assembleContext?`) e i 3 livelli di fallback esistono già: 9b li **usa**, non li modifica.
- **Nessun nuovo `Command`/`Event` engine, nessuna FSM di fase** (traccia engine separata).
- **Nessun tokenizer reale** (resta l'euristica char/4 iniettabile), **nessun L3/RAG** (Fase 2).

---

## Disciplina di scope (CRITICA — vale per OGNI task subagent)

1. Ogni subagent modifica **SOLO** i file elencati nel suo task. Esegue `git status --short` prima del commit e verifica che l'insieme dei file toccati coincida con la lista.
2. **MAI** toccare `package.json`, `tsconfig*.json`, `vitest.config.ts`, `pnpm-workspace.yaml`, `tsconfig.base.json`. **MAI** creare un tsconfig di root o aggiungere `composite`/project references. La creazione del manifesto di `@loomn/host`, del suo `tsconfig.json` e l'aggiunta di dipendenze sono **passi dell'orchestratore** (vedi "Setup orchestratore" sotto), non dei subagent.
3. Crea i file con lo strumento **Write** (NON `New-Item -Force`, che tronca).
4. Niente apostrofi nelle descrizioni `it('...')`/`describe('...')` in apici singoli (`l'`, `un'`, `dell'`, `c'è` spezzano la stringa). `è/é` vanno bene (sono lettere).
5. TS strict: `exactOptionalPropertyTypes` → niente `campo: undefined`; usa **spread condizionali** `...(x !== undefined ? { campo: x } : {})`. `verbatimModuleSyntax` → usa `import type` per i soli tipi. `noUncheckedIndexedAccess` → l'accesso a array/Record è `T | undefined`.

---

## File Structure

| File | Responsabilità | Task |
|---|---|---|
| `packages/memory/src/sqlite-event-store.ts` (modifica) | Estrae il corpo dell'event store in `createSqliteEventStoreOn(db)` (su handle, senza `close`); `createSqliteEventStore(dbPath)` delega + aggiunge `close`. | 1 |
| `packages/memory/src/index.ts` (modifica) | Esporta `createSqliteEventStoreOn` + `type SqliteEventStoreOn`. | 1 |
| `packages/memory/src/event-store-on.test.ts` (nuovo) | Test della variante su handle condiviso (interoperabilità con Canon Ledger sullo stesso DB; nessun `close`). | 1 |
| `packages/host/package.json` (nuovo) | Manifesto `@loomn/host`. **Passo orchestratore.** | Setup |
| `packages/host/tsconfig.json` (nuovo) | tsconfig del pacchetto (estende la base, `tsc --noEmit`). **Passo orchestratore.** | Setup |
| `packages/host/src/clock.ts` (nuovo) | `systemClock`: impl reale della porta `Clock` (unico punto sanzionato per `Date.now`). | 2 |
| `packages/host/src/memory-system.ts` (nuovo) | `createMemorySystem(dbPath, config?)`: UNA connessione → event store + ledger + summaries + assembler; `MemorySystem`/`MemorySystemConfig`. | 2 |
| `packages/host/src/memory-system.test.ts` (nuovo) | Test della connessione condivisa, dell'assembler reale e di `systemClock`. | 2 |
| `packages/host/src/reflection-ports.ts` (nuovo) | `createLlmFactExtractor`/`createLlmSummarizer` (su `StructuredOutputPort`), `renderEventsForReflection`, `reflectionDepsFor`. | 3 |
| `packages/host/src/reflection-ports.test.ts` (nuovo) | Test delle porte LLM-backed con fake model/port. | 3 |
| `packages/host/src/index.ts` (nuovo) | Barrel del pacchetto. | 2 (creato), 3 (esteso) |
| `packages/host/src/wiring.test.ts` (nuovo) | Test di integrazione: assembler reale iniettato in `runMasterTurn`; Reflection write→read end-to-end sullo stesso DB. | 4 |

---

## Setup orchestratore (PRIMA del Task 2) — NON è un task subagent

> Questi passi li esegue l'orchestratore a mano (creano il manifesto e aggiungono dipendenze: per house rule è competenza dell'orchestratore, non di un subagent). Vanno fatti **dopo** il Task 1 (così `createSqliteEventStoreOn` esiste già quando host lo importa) e **prima** del Task 2.

- [ ] **Setup-1: Crea `packages/host/package.json`**

```json
{
  "name": "@loomn/host",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@loomn/ai": "workspace:*",
    "@loomn/engine": "workspace:*",
    "@loomn/memory": "workspace:*",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.10.5"
  }
}
```

> **Decisione (YAGNI):** host NON dichiara `@loomn/shared` né `better-sqlite3`/`drizzle-orm` fra le dipendenze: in 9b nessun file di host li importa direttamente (la persistenza passa tutta per `@loomn/memory`). Si aggiungeranno se/quando un import reale li richiederà.

- [ ] **Setup-2: Crea `packages/host/tsconfig.json`** (identico per forma a `packages/memory/tsconfig.json`)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Setup-3: Installa/collega il workspace**

Run: `pnpm install`
Expected: pnpm risolve `@loomn/host` come 7° workspace project, link `workspace:*` a engine/memory/ai, nessun errore. (`vitest.config.ts` include già `packages/**/*.test.ts` e `pnpm -r typecheck` include già tutti i pacchetti: NON vanno modificati.)

- [ ] **Setup-4: Verifica che il workspace sia sano prima di scrivere codice host**

Run: `pnpm -r typecheck`
Expected: `Scope: 6 of 7 workspace projects` (host non ha ancora `src/` → o non compare o non ha file: va bene). Nessun errore sui 5 pacchetti esistenti.

---

## Task 1: `createSqliteEventStoreOn(db)` — event store su handle condiviso (in `@loomn/memory`)

**Files:**
- Modify: `packages/memory/src/sqlite-event-store.ts`
- Modify: `packages/memory/src/index.ts`
- Test: `packages/memory/src/event-store-on.test.ts` (nuovo)

**Disciplina di scope:** modifica SOLO questi 3 file. NON toccare `package.json`/`tsconfig`/`vitest.config`. NON aggiungere dipendenze. Il refactor deve essere **a comportamento invariato** per `createSqliteEventStore` (i 18 test event store esistenti — `sqlite-event-store.test.ts` + `event-store-contract.test.ts` su SQLite — devono restare verdi).

- [ ] **Step 1: Scrivi il test che fallisce** (`packages/memory/src/event-store-on.test.ts`)

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { type Actor, type DomainEvent } from '@loomn/engine';
import { openDatabase, type OpenDb } from './db';
import { createSqliteEventStoreOn } from './sqlite-event-store';
import { createCanonLedger } from './canon-ledger';

let open: OpenDb | undefined;
afterEach(() => {
  open?.close();
  open = undefined;
});

function actor(id: string): Actor {
  return {
    id,
    name: id,
    kind: 'npc',
    attributes: {},
    skills: {},
    resources: { hp: { current: 10, max: 10 } },
    conditions: [],
    items: [],
    progression: { xp: 0, level: 1 },
  };
}

const evs: DomainEvent[] = [
  { type: 'ActorAdded', actor: actor('goblin') },
  { type: 'DamageApplied', targetId: 'goblin', resource: 'hp', amount: 3 },
];

describe('createSqliteEventStoreOn - handle condiviso', () => {
  it('append e load funzionano su un handle Drizzle gia aperto', () => {
    open = openDatabase(':memory:');
    const store = createSqliteEventStoreOn(open.db);
    expect(store.version()).toBe(0);
    expect(store.append(evs, 0)).toBe(2);
    expect(store.load().map((s) => s.seq)).toEqual([1, 2]);
    expect(store.version()).toBe(2);
  });

  it('event store e Canon Ledger condividono la stessa connessione e si vedono a vicenda', () => {
    open = openDatabase(':memory:');
    const store = createSqliteEventStoreOn(open.db);
    const ledger = createCanonLedger(open.db);
    store.append(evs, 0);
    ledger.record({ id: 'f1', subject: 'goblin', predicate: 'si_trova_a', object: 'Caverna', eventSeq: 2 });
    // Un secondo store sullo STESSO handle vede gli stessi eventi (lettura coerente).
    const store2 = createSqliteEventStoreOn(open.db);
    expect(store2.version()).toBe(2);
    expect(ledger.active({ subject: 'goblin' }).map((f) => f.id)).toEqual(['f1']);
  });

  it('createSqliteEventStoreOn non possiede la connessione (nessun metodo close)', () => {
    open = openDatabase(':memory:');
    const store = createSqliteEventStoreOn(open.db);
    expect('close' in store).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm -C packages/memory exec vitest run src/event-store-on.test.ts`
Expected: FAIL — `createSqliteEventStoreOn` non è esportato (`does not provide an export named 'createSqliteEventStoreOn'` o type error in import).

- [ ] **Step 3: Refactor di `packages/memory/src/sqlite-event-store.ts`** (parametrizza il corpo sul handle; `createSqliteEventStore` delega)

Sostituisci l'INTERO contenuto del file con:

```typescript
import { sql, desc } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  ConcurrencyError,
  type DomainEvent,
  type StoredEvent,
  type Snapshot,
  type GameState,
  type EventStore,
} from '@loomn/engine';
import type { z } from 'zod';
import { domainEventSchema, gameStateSchema } from '@loomn/shared';
import { openDatabase } from './db';
import { events, snapshots } from './schema';

export interface SqliteEventStore extends EventStore {
  /** Persiste uno snapshot (sovrascrive quello con la stessa versione). */
  saveSnapshot(snapshot: Snapshot): void;
  /** Lo snapshot a versione massima, o undefined se non ce ne sono. */
  latestSnapshot(): Snapshot | undefined;
  /** Rilascia la connessione SQLite sottostante. */
  close(): void;
}

/** Event store SQLite + snapshot SENZA `close`: opera su un handle Drizzle gia aperto di cui
 *  NON possiede il ciclo di vita (chiude chi ha aperto la connessione). E la forma condivisibile
 *  con Canon Ledger e Summary Store sullo STESSO handle (Piano 9b / HANDOFF 7-bis). */
export type SqliteEventStoreOn = Omit<SqliteEventStore, 'close'>;

/** Costruisce l event store su una connessione gia aperta e condivisa. Concorrenza ottimistica
 *  via MAX(seq) in transazione; load/latestSnapshot validano con Zod (confine non fidato). Non
 *  chiude la connessione. */
export function createSqliteEventStoreOn(db: BetterSQLite3Database): SqliteEventStoreOn {
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
        // corretto solo finche events e append-only e senza gap (nessun DELETE): seq contiguo
        return expectedVersion + toAppend.length;
      });
    },
    load(): StoredEvent[] {
      const rows = db.select().from(events).orderBy(events.seq).all();
      return rows.map((r) => ({ seq: r.seq, event: domainEventSchema.parse(JSON.parse(r.payload)) }));
    },
    saveSnapshot(snapshot: Snapshot): void {
      const state = JSON.stringify(snapshot.state);
      db.insert(snapshots)
        .values({ version: snapshot.version, state })
        .onConflictDoUpdate({ target: snapshots.version, set: { state } })
        .run();
    },
    latestSnapshot(): Snapshot | undefined {
      const row = db.select().from(snapshots).orderBy(desc(snapshots.version)).limit(1).get();
      if (row === undefined) {
        return undefined;
      }
      return { version: row.version, state: gameStateSchema.parse(JSON.parse(row.state)) };
    },
  };
}

/** Adapter SQLite della porta EventStore (Piano 5) + snapshot, che POSSIEDE la propria
 *  connessione: apre dbPath, costruisce il corpo su quel handle e aggiunge `close`. */
export function createSqliteEventStore(dbPath: string): SqliteEventStore {
  const { db, close } = openDatabase(dbPath);
  return { ...createSqliteEventStoreOn(db), close };
}

// Drift guard a compile-time: gli schemi Zod devono restare allineati ai tipi del motore
// in entrambe le direzioni. Se i tipi divergono, queste righe falliscono il typecheck.
type _EventInfer = z.infer<typeof domainEventSchema>;
type _StateInfer = z.infer<typeof gameStateSchema>;
const _eventForward: DomainEvent = null as unknown as _EventInfer;
const _eventBackward: _EventInfer = null as unknown as DomainEvent;
const _stateForward: GameState = null as unknown as _StateInfer;
const _stateBackward: _StateInfer = null as unknown as GameState;
void _eventForward;
void _eventBackward;
void _stateForward;
void _stateBackward;
```

- [ ] **Step 4: Esporta dal barrel** (`packages/memory/src/index.ts`)

Sostituisci la riga 2 (`export { createSqliteEventStore, type SqliteEventStore } from './sqlite-event-store';`) con:

```typescript
export {
  createSqliteEventStore,
  createSqliteEventStoreOn,
  type SqliteEventStore,
  type SqliteEventStoreOn,
} from './sqlite-event-store';
```

- [ ] **Step 5: Esegui i test del pacchetto e verifica che passano (nessuna regressione)**

Run: `pnpm -C packages/memory exec vitest run`
Expected: PASS — i 3 nuovi test di `event-store-on.test.ts` verdi e tutti i preesistenti (incluso `sqlite-event-store.test.ts` e `event-store-contract.test.ts`) ancora verdi.

- [ ] **Step 6: Typecheck del pacchetto**

Run: `pnpm -C packages/memory typecheck`
Expected: nessun errore (drift guard ancora soddisfatte).

- [ ] **Step 7: Verifica scope e commit**

Run: `git status --short`
Expected: esattamente `M packages/memory/src/sqlite-event-store.ts`, `M packages/memory/src/index.ts`, `?? packages/memory/src/event-store-on.test.ts`.

```bash
git add packages/memory/src/sqlite-event-store.ts packages/memory/src/index.ts packages/memory/src/event-store-on.test.ts
git commit -m "feat(memory): createSqliteEventStoreOn su handle Drizzle condiviso"
```

**Conteggio test atteso (cumulativo):** 221 → **224** (+3).

---

## Task 2: `systemClock` + `createMemorySystem(dbPath)` — composizione storage su UNA connessione (in `@loomn/host`)

> **Precondizione:** Setup orchestratore (host package + tsconfig + `pnpm install`) già eseguito.

**Files:**
- Create: `packages/host/src/clock.ts`
- Create: `packages/host/src/memory-system.ts`
- Create: `packages/host/src/index.ts`
- Test: `packages/host/src/memory-system.test.ts`

**Disciplina di scope:** crea SOLO questi 4 file. NON toccare `package.json`/`tsconfig`/`vitest.config`. NON aggiungere dipendenze (engine/memory/ai/zod sono già nel manifesto creato dall'orchestratore).

- [ ] **Step 1: Scrivi il test che fallisce** (`packages/host/src/memory-system.test.ts`)

```typescript
import { describe, it, expect } from 'vitest';
import { initialState, applyEvent, type Actor } from '@loomn/engine';
import { createMemorySystem } from './memory-system';
import { systemClock } from './clock';

function actor(id: string, name: string): Actor {
  return {
    id,
    name,
    kind: 'npc',
    attributes: {},
    skills: {},
    resources: { hp: { current: 10, max: 10 } },
    conditions: [],
    items: [],
    progression: { xp: 0, level: 1 },
  };
}

describe('createMemorySystem - connessione condivisa', () => {
  it('event store, ledger e summaries scrivono e leggono lo stesso DB', () => {
    const sys = createMemorySystem(':memory:', { clock: { now: () => 1000 } });
    try {
      sys.eventStore.append([{ type: 'ActorAdded', actor: actor('goblin', 'Goblin') }], 0);
      sys.ledger.record({ id: 'f1', subject: 'Goblin', predicate: 'impugna', object: 'pugnale', eventSeq: 1 });
      sys.summaries.record({
        id: 's1',
        level: 'scene',
        scope: 'sess-1',
        text: 'Il goblin appare nella caverna.',
        importance: 5,
        salience: 0.5,
        createdAt: 1000,
        eventSeqFrom: 1,
        eventSeqTo: 1,
      });
      expect(sys.eventStore.version()).toBe(1);
      expect(sys.ledger.active({ subject: 'Goblin' }).map((f) => f.id)).toEqual(['f1']);
      expect(sys.summaries.list().map((s) => s.id)).toEqual(['s1']);
    } finally {
      sys.close();
    }
  });

  it('assembleContext reale riflette L1, L1.5 e L2 dal DB condiviso', () => {
    const sys = createMemorySystem(':memory:', { clock: { now: () => 1000 }, tokenBudget: 2000 });
    try {
      sys.ledger.record({ id: 'f1', subject: 'Goblin', predicate: 'impugna', object: 'pugnale', eventSeq: 1 });
      sys.summaries.record({
        id: 's1',
        level: 'scene',
        scope: 'sess-1',
        text: 'Il goblin appare nella caverna.',
        importance: 5,
        salience: 0.5,
        createdAt: 1000,
        eventSeqFrom: 1,
        eventSeqTo: 1,
      });
      const state = applyEvent(initialState, { type: 'ActorAdded', actor: actor('goblin', 'Goblin') });
      const ctx = sys.assembleContext(state);
      expect(ctx).toContain('Goblin'); // L1 (attore in scena)
      expect(ctx).toContain('impugna'); // L1.5 (fatto canonico sul soggetto in scena)
      expect(ctx).toContain('Il goblin appare nella caverna.'); // L2 (riassunto recente)
    } finally {
      sys.close();
    }
  });

  it('close chiude la connessione condivisa (riuso dopo close fallisce)', () => {
    const sys = createMemorySystem(':memory:');
    sys.close();
    expect(() => sys.eventStore.version()).toThrow();
  });
});

describe('systemClock', () => {
  it('now ritorna un timestamp numerico positivo', () => {
    expect(typeof systemClock.now()).toBe('number');
    expect(systemClock.now()).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm -C packages/host exec vitest run src/memory-system.test.ts`
Expected: FAIL — moduli `./memory-system` e `./clock` non esistono.

- [ ] **Step 3: Crea `packages/host/src/clock.ts`**

```typescript
import type { Clock } from '@loomn/memory';

/** Impl reale della porta Clock (Piano 8b). E l UNICO punto sanzionato in cui si legge il tempo
 *  di sistema: l engine e i pacchetti puri non usano mai Date.now (house rule), ma host e un
 *  adapter di composizione, quindi qui e corretto. Nei test si inietta un clock fisso. */
export const systemClock: Clock = {
  now: () => Date.now(),
};
```

- [ ] **Step 4: Crea `packages/host/src/memory-system.ts`**

```typescript
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
  createContextAssembler,
  type SqliteEventStoreOn,
  type CanonLedger,
  type SummaryStore,
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
  /** Clock condiviso (lo stesso passato all assembler e da passare alla Reflection). */
  clock: Clock;
  /** Context Assembler reale (read path 8c), gia chiuso su ledger/summaries/clock. Da iniettare
   *  in runMasterTurn al posto di assembleContextStub. */
  assembleContext: (state: GameState) => string;
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
  const assembleContext = createContextAssembler(
    { ledger, summaries, clock },
    {
      tokenBudget: config.tokenBudget ?? DEFAULT_TOKEN_BUDGET,
      ...(config.recencyDecayPerHour !== undefined ? { recencyDecayPerHour: config.recencyDecayPerHour } : {}),
      ...(config.estimateTokens !== undefined ? { estimateTokens: config.estimateTokens } : {}),
    },
  );
  return { eventStore, ledger, summaries, clock, assembleContext, close };
}
```

- [ ] **Step 5: Crea il barrel `packages/host/src/index.ts`**

```typescript
export { systemClock } from './clock';
export { createMemorySystem, type MemorySystem, type MemorySystemConfig } from './memory-system';
```

- [ ] **Step 6: Esegui i test e verifica che passano**

Run: `pnpm -C packages/host exec vitest run`
Expected: PASS — i 4 test di `memory-system.test.ts` verdi.

- [ ] **Step 7: Typecheck del pacchetto**

Run: `pnpm -C packages/host typecheck`
Expected: nessun errore.

- [ ] **Step 8: Verifica scope e commit**

Run: `git status --short`
Expected: solo `?? packages/host/src/clock.ts`, `?? packages/host/src/memory-system.ts`, `?? packages/host/src/index.ts`, `?? packages/host/src/memory-system.test.ts` (più `packages/host/package.json` e `tsconfig.json` se non ancora committati dall'orchestratore — quelli li committa/gestisce l'orchestratore separatamente).

```bash
git add packages/host/src/clock.ts packages/host/src/memory-system.ts packages/host/src/index.ts packages/host/src/memory-system.test.ts
git commit -m "feat(host): createMemorySystem e systemClock su connessione condivisa"
```

**Conteggio test atteso (cumulativo):** 224 → **228** (+4).

---

## Task 3: `FactExtractor`/`Summarizer` LLM-backed + `reflectionDepsFor` (in `@loomn/host`)

**Files:**
- Create: `packages/host/src/reflection-ports.ts`
- Modify: `packages/host/src/index.ts`
- Test: `packages/host/src/reflection-ports.test.ts`

**Disciplina di scope:** crea/modifica SOLO questi 3 file. Nessuna dipendenza nuova (zod e ai sono già nel manifesto).

- [ ] **Step 1: Scrivi il test che fallisce** (`packages/host/src/reflection-ports.test.ts`)

```typescript
import { describe, it, expect } from 'vitest';
import {
  createStructuredOutput,
  type LanguageModel,
  type LlmStreamEvent,
  type StructuredOutputPort,
  type StructuredOutputRequest,
  type StructuredOutputResult,
} from '@loomn/ai';
import type { StoredEvent } from '@loomn/engine';
import {
  createLlmFactExtractor,
  createLlmSummarizer,
  renderEventsForReflection,
  reflectionDepsFor,
} from './reflection-ports';
import { createMemorySystem } from './memory-system';

/** Fake LanguageModel che ignora la richiesta e riproduce una sequenza di eventi di stream. */
function fakeModel(streamEvents: LlmStreamEvent[]): LanguageModel {
  return {
    id: 'fake',
    async *stream() {
      for (const e of streamEvents) yield e;
    },
  };
}

/** Fake StructuredOutputPort che cattura le richieste e ritorna un valore prefissato. */
function capturingPort(value: unknown): {
  port: StructuredOutputPort;
  calls: StructuredOutputRequest<unknown>[];
} {
  const calls: StructuredOutputRequest<unknown>[] = [];
  const port: StructuredOutputPort = {
    generate: async <T>(request: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> => {
      calls.push(request as StructuredOutputRequest<unknown>);
      return { value: value as T, strategy: 'function-call' };
    },
  };
  return { port, calls };
}

const sceneEvents: StoredEvent[] = [
  { seq: 1, event: { type: 'ActorAdded', actor: { id: 'goblin', name: 'Goblin', kind: 'npc', attributes: {}, skills: {}, resources: { hp: { current: 10, max: 10 } }, conditions: [], items: [], progression: { xp: 0, level: 1 } } } },
  { seq: 2, event: { type: 'DamageApplied', targetId: 'goblin', resource: 'hp', amount: 4 } },
];

describe('renderEventsForReflection', () => {
  it('rende una riga per evento in ordine di seq', () => {
    const text = renderEventsForReflection(sceneEvents);
    const lines = text.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('#1 ActorAdded');
    expect(lines[1]).toContain('#2 DamageApplied');
  });
});

describe('createLlmFactExtractor', () => {
  it('ritorna i fatti validati ottenuti dallo StructuredOutputPort (via createStructuredOutput reale)', async () => {
    const args = JSON.stringify({
      facts: [{ subject: 'Goblin', predicate: 'si_trova_a', object: 'Caverna', functional: true, importance: 7 }],
    });
    const model = fakeModel([
      { type: 'tool-call', id: 't1', name: 'extract_facts', arguments: args },
      { type: 'finish', reason: 'tool_calls' },
    ]);
    const extractor = createLlmFactExtractor(createStructuredOutput(model));
    const facts = await extractor.extract({ events: sceneEvents, scope: 'sess-1' });
    expect(facts).toEqual([
      { subject: 'Goblin', predicate: 'si_trova_a', object: 'Caverna', functional: true, importance: 7 },
    ]);
  });

  it('mette gli eventi resi e il nome schema corretto nella richiesta al port', async () => {
    const { port, calls } = capturingPort({ facts: [] });
    const extractor = createLlmFactExtractor(port);
    await extractor.extract({ events: sceneEvents, scope: 'sess-1' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.schemaName).toBe('extract_facts');
    const joined = calls[0]?.messages.map((m) => m.content).join('\n') ?? '';
    expect(joined).toContain('#1 ActorAdded');
    expect(joined).toContain('#2 DamageApplied');
  });
});

describe('createLlmSummarizer', () => {
  it('ritorna la bozza di riassunto validata dallo StructuredOutputPort', async () => {
    const { port, calls } = capturingPort({ text: 'Il goblin viene ferito.', importance: 6 });
    const summarizer = createLlmSummarizer(port);
    const draft = await summarizer.summarize({ events: sceneEvents, scope: 'sess-1' });
    expect(draft).toEqual({ text: 'Il goblin viene ferito.', importance: 6 });
    expect(calls[0]?.schemaName).toBe('summarize_scene');
  });
});

describe('reflectionDepsFor', () => {
  it('compone ledger, summaries e clock del MemorySystem con le porte LLM-backed', () => {
    const sys = createMemorySystem(':memory:', { clock: { now: () => 42 } });
    try {
      const { port } = capturingPort({ facts: [] });
      const deps = reflectionDepsFor(sys, port);
      expect(deps.ledger).toBe(sys.ledger);
      expect(deps.summaries).toBe(sys.summaries);
      expect(deps.clock).toBe(sys.clock);
      expect(typeof deps.extractor.extract).toBe('function');
      expect(typeof deps.summarizer.summarize).toBe('function');
    } finally {
      sys.close();
    }
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm -C packages/host exec vitest run src/reflection-ports.test.ts`
Expected: FAIL — `./reflection-ports` non esiste.

- [ ] **Step 3: Crea `packages/host/src/reflection-ports.ts`**

```typescript
// Impl LLM-backed delle porte di SCRITTURA della memoria (spec 6.1). E l UNICO punto in cui
// ai (StructuredOutputPort di 7b) e memory (FactExtractor/Summarizer/ReflectionDeps) si
// compongono per il write path: FactExtractor/Summarizer pilotano lo StructuredOutputPort con
// uno schema Zod; reflectionDepsFor li monta su ledger/summaries/clock del MemorySystem, pronto
// per runReflection. (Il read path e gia composto da MemorySystem.assembleContext.)
import { z } from 'zod';
import type { LlmMessage, StructuredOutputPort } from '@loomn/ai';
import type { StoredEvent } from '@loomn/engine';
import type {
  FactExtractor,
  Summarizer,
  ReflectionInput,
  ExtractedFact,
  SceneSummaryDraft,
  ReflectionDeps,
} from '@loomn/memory';
import type { MemorySystem } from './memory-system';

const extractedFactSchema = z.object({
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.string().min(1),
  functional: z.boolean(),
  importance: z.number().int().min(1).max(10),
});

const factsResultSchema = z.object({ facts: z.array(extractedFactSchema) });

const sceneDraftSchema = z.object({
  text: z.string().min(1),
  importance: z.number().int().min(1).max(10),
});

const EXTRACT_SYSTEM =
  'Sei un analista narrativo. Dagli eventi del motore estrai i fatti canonici DISCRETI come ' +
  'terne (subject, predicate, object). functional=true se il predicato ammette un solo valore ' +
  'per soggetto (es. si_trova_a, alleato_di), cosi il valore precedente va sostituito. ' +
  'importance da 1 (effimero) a 10 (permanente). Ometti i dettagli effimeri (singoli tiri).';

const SUMMARIZE_SYSTEM =
  'Sei un cronista. Riassumi la scena in 1-3 frasi di prosa per la continuita narrativa. ' +
  'importance da 1 (effimero) a 10 (svolta permanente).';

/** Rende gli eventi della scena in testo deterministico per il prompt (una riga per evento). */
export function renderEventsForReflection(events: StoredEvent[]): string {
  return events.map((e) => `#${e.seq} ${e.event.type} ${JSON.stringify(e.event)}`).join('\n');
}

function reflectionMessages(system: string, input: ReflectionInput): LlmMessage[] {
  return [
    { role: 'system', content: system },
    { role: 'user', content: `Scena ${input.scope} (eventi del motore):\n${renderEventsForReflection(input.events)}` },
  ];
}

/** FactExtractor LLM-backed: pilota lo StructuredOutputPort (7b) con uno schema Zod. */
export function createLlmFactExtractor(port: StructuredOutputPort): FactExtractor {
  return {
    async extract(input: ReflectionInput): Promise<ExtractedFact[]> {
      const res = await port.generate({
        messages: reflectionMessages(EXTRACT_SYSTEM, input),
        schema: factsResultSchema,
        schemaName: 'extract_facts',
        schemaDescription: 'Fatti canonici discreti estratti dalla scena.',
      });
      return res.value.facts;
    },
  };
}

/** Summarizer LLM-backed: pilota lo StructuredOutputPort (7b) con uno schema Zod. */
export function createLlmSummarizer(port: StructuredOutputPort): Summarizer {
  return {
    async summarize(input: ReflectionInput): Promise<SceneSummaryDraft> {
      const res = await port.generate({
        messages: reflectionMessages(SUMMARIZE_SYSTEM, input),
        schema: sceneDraftSchema,
        schemaName: 'summarize_scene',
        schemaDescription: 'Riassunto in prosa della scena.',
      });
      return res.value;
    },
  };
}

/** Compone le ReflectionDeps (porte di scrittura, Piano 8b) da un MemorySystem (ledger+summaries+
 *  clock sullo STESSO DB) e da uno StructuredOutputPort (impl LLM di extractor/summarizer). */
export function reflectionDepsFor(system: MemorySystem, port: StructuredOutputPort): ReflectionDeps {
  return {
    ledger: system.ledger,
    summaries: system.summaries,
    extractor: createLlmFactExtractor(port),
    summarizer: createLlmSummarizer(port),
    clock: system.clock,
  };
}
```

- [ ] **Step 4: Estendi il barrel `packages/host/src/index.ts`** (aggiungi in fondo)

```typescript
export {
  createLlmFactExtractor,
  createLlmSummarizer,
  reflectionDepsFor,
  renderEventsForReflection,
} from './reflection-ports';
```

- [ ] **Step 5: Esegui i test e verifica che passano**

Run: `pnpm -C packages/host exec vitest run`
Expected: PASS — i 6 nuovi test di `reflection-ports.test.ts` verdi (più i 4 del Task 2).

- [ ] **Step 6: Typecheck del pacchetto**

Run: `pnpm -C packages/host typecheck`
Expected: nessun errore.

- [ ] **Step 7: Verifica scope e commit**

Run: `git status --short`
Expected: `M packages/host/src/index.ts`, `?? packages/host/src/reflection-ports.ts`, `?? packages/host/src/reflection-ports.test.ts`.

```bash
git add packages/host/src/reflection-ports.ts packages/host/src/reflection-ports.test.ts packages/host/src/index.ts
git commit -m "feat(host): FactExtractor/Summarizer LLM-backed e reflectionDepsFor"
```

**Conteggio test atteso (cumulativo):** 228 → **234** (+6).

---

## Task 4: Wiring end-to-end memoria+AI (test di integrazione, in `@loomn/host`)

> Task **test-only**: nessun nuovo codice di produzione, solo prova che i pezzi compongono. Dimostra (a) l'assembler reale iniettato in `runMasterTurn` al posto dello stub, e (b) il giro write→read della memoria (Reflection scrive L1.5/L2 → assembler li recupera) sullo STESSO DB. La **code-quality review si salta** (task senza logica nuova), come da processo §4 — dichiararlo.

**Files:**
- Test: `packages/host/src/wiring.test.ts` (nuovo)

**Disciplina di scope:** crea SOLO questo file. Nessuna dipendenza nuova.

- [ ] **Step 1: Scrivi il test di integrazione** (`packages/host/src/wiring.test.ts`)

```typescript
import { describe, it, expect } from 'vitest';
import {
  initialState,
  applyEvent,
  createSeededRandom,
  type Actor,
  type DomainEvent,
  type StoredEvent,
} from '@loomn/engine';
import {
  runMasterTurn,
  type LanguageModel,
  type LlmMessage,
  type LlmStreamEvent,
  type StructuredOutputPort,
  type StructuredOutputRequest,
  type StructuredOutputResult,
} from '@loomn/ai';
import { runReflection } from '@loomn/memory';
import { createMemorySystem } from './memory-system';
import { reflectionDepsFor } from './reflection-ports';

function actor(id: string, name: string): Actor {
  return {
    id,
    name,
    kind: 'npc',
    attributes: {},
    skills: {},
    resources: { hp: { current: 10, max: 10 } },
    conditions: [],
    items: [],
    progression: { xp: 0, level: 1 },
  };
}

/** Fake LanguageModel che cattura i messaggi ricevuti e riproduce uno stream prefissato. */
function recordingModel(streamEvents: LlmStreamEvent[]): { model: LanguageModel; captured: () => LlmMessage[] } {
  let messages: LlmMessage[] = [];
  const model: LanguageModel = {
    id: 'rec',
    async *stream(request) {
      messages = request.messages;
      for (const e of streamEvents) yield e;
    },
  };
  return { model, captured: () => messages };
}

describe('wiring - assembler reale iniettato in runMasterTurn', () => {
  it('runMasterTurn riceve il contesto reale (L1 + L1.5) prodotto dal MemorySystem, non lo stub', async () => {
    const sys = createMemorySystem(':memory:', { clock: { now: () => 1000 } });
    try {
      sys.ledger.record({ id: 'f1', subject: 'goblin', predicate: 'impugna', object: 'pugnale', eventSeq: 1 });
      const state = applyEvent(initialState, { type: 'ActorAdded', actor: actor('goblin', 'Goblin') });
      const { model, captured } = recordingModel([
        { type: 'text', delta: 'Il goblin ti osserva guardingo.' },
        { type: 'finish', reason: 'stop' },
      ]);
      const result = await runMasterTurn({
        model,
        rng: createSeededRandom(1),
        state,
        playerAction: 'Osservo il goblin.',
        assembleContext: sys.assembleContext,
      });
      const systemContext = captured()
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n');
      expect(systemContext).toContain('Goblin'); // L1 dal vero assembler
      expect(systemContext).toContain('impugna'); // L1.5 dal vero assembler (mai presente nello stub)
      expect(result.narration).toBe('Il goblin ti osserva guardingo.');
    } finally {
      sys.close();
    }
  });
});

describe('wiring - Reflection write -> Context Assembler read sullo stesso DB', () => {
  it('cio che la Reflection scrive in L1.5/L2 viene poi recuperato dal Context Assembler', async () => {
    const sys = createMemorySystem(':memory:', { clock: { now: () => 5000 }, tokenBudget: 2000 });
    try {
      // StructuredOutputPort fake: fatto canonico per extract_facts, riassunto per summarize_scene.
      const port: StructuredOutputPort = {
        generate: async <T>(request: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> => {
          if (request.schemaName === 'extract_facts') {
            const value = {
              facts: [{ subject: 'Goblin', predicate: 'ha_rubato', object: 'la gemma', functional: false, importance: 8 }],
            };
            return { value: value as T, strategy: 'function-call' };
          }
          const draft = { text: 'Il goblin ha rubato la gemma ed e fuggito nel bosco.', importance: 8 };
          return { value: draft as T, strategy: 'function-call' };
        },
      };
      const deps = reflectionDepsFor(sys, port);
      const sceneEvents: StoredEvent[] = [
        { seq: 1, event: { type: 'ActorAdded', actor: actor('goblin', 'Goblin') } as DomainEvent },
      ];
      const reflected = await runReflection(deps, { events: sceneEvents, scope: 'sess-1' });
      expect(reflected.facts.map((f) => f.predicate)).toContain('ha_rubato');
      expect(reflected.summary?.text).toContain('ha rubato la gemma');

      // Read path: l assembler sullo stesso DB recupera il fatto (L1.5) e il riassunto (L2).
      const state = applyEvent(initialState, { type: 'ActorAdded', actor: actor('goblin', 'Goblin') });
      const ctx = sys.assembleContext(state);
      expect(ctx).toContain('ha_rubato'); // L1.5 affiorato in lettura
      expect(ctx).toContain('Il goblin ha rubato la gemma'); // L2 affiorato in lettura
    } finally {
      sys.close();
    }
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che passano**

Run: `pnpm -C packages/host exec vitest run src/wiring.test.ts`
Expected: PASS — 2 test verdi.

- [ ] **Step 3: Esegui l'intera suite host + typecheck**

Run: `pnpm -C packages/host exec vitest run`
Expected: PASS — tutti i test host verdi (Task 2 + 3 + 4).

Run: `pnpm -C packages/host typecheck`
Expected: nessun errore.

- [ ] **Step 4: Verifica scope e commit**

Run: `git status --short`
Expected: solo `?? packages/host/src/wiring.test.ts`.

```bash
git add packages/host/src/wiring.test.ts
git commit -m "test(host): wiring end-to-end memoria+AI (assembler iniettato, reflection write->read)"
```

**Conteggio test atteso (cumulativo):** 234 → **236** (+2).

---

## Verifica finale dell'intero branch (orchestratore, prima del merge)

- [ ] **Suite completa dalla root**

Run: `pnpm test`
Expected: **236 test verdi** (221 baseline + 3 Task1 + 4 Task2 + 6 Task3 + 2 Task4 = 236).

- [ ] **Typecheck ricorsivo (mai `tsc -b`)**

Run: `pnpm -r typecheck`
Expected: `Scope: 6 of 7 workspace projects` (host ora ha `src/` → compare), nessun errore su engine/shared/ai/memory/**host** + `app/desktop` (vue-tsc).

- [ ] **Grep anti-apostrofo nei test (house rule §5.4)**

Run (bash): `grep -rEn "(it|describe)\('[^']*'[A-Za-zàèéìòù]" packages/`
Expected: nessun match.

---

## Self-review (eseguita su questo piano)

**1. Copertura spec.**
- §5.4 (AI Master come pipeline esplicita, contesto assemblato dalla memoria) → Task 2 (`assembleContext` reale) + Task 4 (iniezione in `runMasterTurn`). ✅
- §6.1 (Reflection write path) → Task 3 (porte LLM-backed `FactExtractor`/`Summarizer`) + Task 4 (giro `runReflection`). ✅
- §6.2 (Context Assembler read path con budget) → Task 2 (`createMemorySystem` monta `createContextAssembler`, `tokenBudget` configurabile). ✅
- §7 (`StructuredOutputPort` 3 livelli come base delle porte AI) → Task 3 (le porte LLM-backed usano `createStructuredOutput`/`StructuredOutputPort`; Task 3 testa anche il livello function-call reale via fake model). ✅
- HANDOFF §7-bis (event store su handle condiviso, UNA connessione, composizione `ai`+`memory` solo in host) → Task 1 + Task 2 + Task 3. ✅

**2. Scan placeholder.** Nessun TODO/TBD/"simile a Task N"/"gestisci gli edge case". Tutto il codice è completo ed eseguibile. ✅

**3. Coerenza dei tipi.** `SqliteEventStoreOn` (Task 1) usato in `MemorySystem.eventStore` (Task 2). `MemorySystem`/`MemorySystemConfig`/`createMemorySystem` coerenti fra memory-system.ts, barrel e i test. `reflectionDepsFor(system, port)` ritorna `ReflectionDeps` con esattamente i campi richiesti da `runReflection` (`ledger`/`summaries`/`extractor`/`summarizer`/`clock`). `createLlmFactExtractor`/`createLlmSummarizer` ritornano `FactExtractor`/`Summarizer` (firme `extract(input): Promise<ExtractedFact[]>` / `summarize(input): Promise<SceneSummaryDraft>`) che combaciano con le porte di `@loomn/memory`. Gli schemi Zod inferiscono forme assegnabili a `ExtractedFact`/`SceneSummaryDraft`. `schemaName` `'extract_facts'`/`'summarize_scene'` usato coerentemente fra impl e test (incluso il branch del fake port nel Task 4). ✅

**4. House rules.** Scope discipline in ogni task; manifesto + tsconfig + dipendenze come passo orchestratore (non subagent); `exactOptionalPropertyTypes` via spread condizionali in `createMemorySystem`; `verbatimModuleSyntax` via `import type`; nessun apostrofo nelle stringhe dei test in apici singoli; `pnpm -r typecheck` (mai `tsc -b`); engine resta puro (l'unico `Date.now` vive in `host/clock.ts`, adapter di composizione); `memory` non importa `ai` e `ai` non importa `memory` (si compongono solo in `host`). ✅

---

## Roadmap dopo il Piano 9b

- **Piano 9b — Wiring memoria+AI** ← *questo piano* (pacchetto `@loomn/host`: `createSqliteEventStoreOn`, `createMemorySystem`, `systemClock`, porte LLM-backed, assembler iniettato; tutto ABI Node, ~236 test).
- **Piano 9c — IPC write/read reale + persistenza nell'app:** `app/desktop` apre il DB via `@loomn/host` (better-sqlite3 ricompilato per ABI Electron + plugin che copia `packages/memory/migrations` in `out/migrations`; gestione conflitto ABI Node↔Electron, copia nativa condivisa nello store pnpm); canale IPC dei Command (write side: `decide`→persisti→proietta), push degli Event al renderer (read side), `runMasterTurn` dietro IPC con `assembleContext` iniettato + `safeStorage` per le chiavi provider. (Groundwork nativo già verificato in HANDOFF §7-bis.)
- **Traccia engine separata:** nuovi `Command`/`Event` per gli strumenti rimandati di 7c (`request_check`/`apply_effect`/`advance_quest` + contesto quest) e la **FSM di fase** (spec §5.5).
- **Piano 10 — UI Vue** (chat, scheda PG, pannello dadi 3D, journal, provider): preceduto da una fase di studio/design dedicata (brainstorming + `frontend-design`), NON si parte da `writing-plans`.
- **Piano 11 — Moduli a tema** (formato dati Zod + import/export + 1 modulo curato).

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-16-loomn-fase1-piano9b-wiring-memoria-ai.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — un subagent fresco per task, spec review + code-quality review fra i task (code-quality saltata sul Task 4 test-only), final review dell'intero branch, poi `finishing-a-development-branch` (merge locale in main). I passi "Setup orchestratore" (manifesto/tsconfig/deps di `@loomn/host`) li eseguo io fra il Task 1 e il Task 2.

**2. Inline Execution** — eseguo i task in questa sessione con `executing-plans`, a blocchi con checkpoint di review.

**Quale approccio?**
