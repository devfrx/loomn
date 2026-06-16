# Piano 8a — Canon Ledger (L1.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere a `@loomn/memory` il **Canon Ledger (L1.5)** della spec §6: lo store dei **fatti narrativi discreti e interrogabili** `(soggetto, predicato, oggetto, eventSeq, stato)` che il Master usa per **non contraddirsi** — una proiezione SQLite `canon_facts` con `record`/`active`/`all`/`retract` e il primitivo anti-contraddizione `supersede`.

**Architecture:** Il Canon Ledger e una **proiezione SQLite** (come `events`/`snapshots`), quindi vive in `@loomn/memory` (`memory → engine → shared`). Una nuova tabella `canon_facts` (schema Drizzle) + una **migrazione scritta a mano** `0001_canon_ledger.sql` (coerente con la `0000` esistente). Il modulo `canon-ledger.ts` espone `createCanonLedger(db)` che opera su un handle Drizzle gia aperto (`openDatabase`), così il futuro wiring (Piano 9) condivide **una sola** connessione fra event store e ledger. La validazione dello `status` letto dal DB usa Zod (confine non fidato, come fa l event store). `supersede` e il primitivo di anti-contraddizione per i predicati funzionali (ritira-e-rimpiazza in transazione); la **politica** di quali predicati siano funzionali e demandata a chi scrive (Reflection nel Piano 8b / moduli).

**Tech Stack:** TypeScript strict (`tsconfig.base.json`), Vitest (config root), `drizzle-orm@^0.38.4`, `better-sqlite3@^12.10.1`, `zod@^3.23.8`. **Nessuna dipendenza nuova** (niente Setup orchestratore).

---

## Dove sta il Piano 8a — il Piano 8 e splittato (8a/8b/8c)

Lo spec §6 (memoria a strati) copre tre sottosistemi indipendenti; come il Piano 7 (7a/7b/7c), il **Piano 8 e splittato** e ogni sotto-piano si scrive+esegue+mergia da solo:

- **8a — Canon Ledger (L1.5) ← QUESTO**: tabella `canon_facts` + `createCanonLedger`. Testabile con fatti scritti a mano (niente LLM). Fondamenta su cui poggiano 8b/8c.
- **8b — Reflection + L2 (riassunti)**: tabella `summaries` (scena→sessione→arco→campagna) + la pipeline di Reflection che prende **porte iniettate** `FactExtractor`/`Summarizer` (le implementazioni LLM-backed vivono in `@loomn/ai` o nell app; `memory` NON dipende da `ai`) + salienza. Scrive su L1.5 (8a) e L2.
- **8c — Context Assembler**: allocatore con **budget di token** (spec §6.2) che legge L1 (GameState/engine) + L1.5 + L2 e produce il contesto; **iniettato** in `runMasterTurn` (oggi `assembleContextStub`), perche `ai` non puo importare `memory`.

### Cosa esiste gia in `@loomn/memory` (Piano 6)

- `schema.ts`: tabelle Drizzle `events` (seq/type/payload) e `snapshots` (version/state).
- `db.ts`: `openDatabase(dbPath): OpenDb` (`{ db: BetterSQLite3Database; close() }`) — apre SQLite, pragma WAL, applica le migrazioni da `../migrations` via `migrate()` (idempotente). `migrationsFolder` esportata.
- `sqlite-event-store.ts`: `createSqliteEventStore(dbPath)` (porta `EventStore` + snapshot); valida con Zod **in lettura** (`load`/`latestSnapshot`).
- `migrations/0000_init.sql` + `migrations/meta/_journal.json` (**scritti a mano**, journal con `when` congelato `1750000000000`, versione 6; **non** c e un `0000_snapshot.json` di drizzle-kit).
- Deps: `@loomn/engine`, `@loomn/shared`, `better-sqlite3`, `drizzle-orm`, `zod`.

### Decisioni risolte (e perche)

1. **Il Canon Ledger vive in `@loomn/memory`** (e una proiezione SQLite derivata dallo stream, spec §6/§6.3), non in `shared` (che ospita solo gli schemi del dominio engine) ne in `ai`.
2. **`createCanonLedger(db: BetterSQLite3Database)` prende un handle gia aperto**, non un path. Cosi l app (Piano 9) apre il DB **una volta** (`openDatabase`) e condivide la connessione fra event store, ledger e (8b) summaries — evitando connessioni separate e, su `:memory:`, database distinti. I test fanno `openDatabase(':memory:')` e passano `db`.
3. **Migrazione SCRITTA A MANO, drizzle-kit RIMANDATO (decisione empirica — corregge l ipotesi del HANDOFF).** Verificato in sandbox: su questa baseline (journal scritto a mano, **senza** `0000_snapshot.json`) `drizzle-kit generate` non ha uno snapshot precedente con cui diffare → mette nella `0001` la `CREATE TABLE` di **tutte e tre** le tabelle (events/snapshots ricreate → `migrate()` fallirebbe con "table already exists"), e scrive un `when` non-deterministico nel journal. Introdurre drizzle-kit pulito richiederebbe di **rigenerare la baseline** (toccando la `0000` congelata) o **ricostruire a mano** il `0000_snapshot.json` (formato interno, fragile). Per una singola tabella non vale: una `CREATE TABLE` scritta a mano + una voce di journal con `when` congelato e **deterministica, banale e coerente con la `0000`** (e l SQL e esattamente quello che drizzle-kit stesso genera per la tabella). drizzle-kit si introdurra quando il churn dello schema lo giustifichera (rinominazioni, FK), con la ricostruzione della baseline una tantum; finora le aggiunte (8b `summaries`, eventuali colonne) restano `CREATE TABLE`/`ALTER TABLE` semplici a mano.
4. **`supersede` e il primitivo di anti-contraddizione; la politica e fuori da 8a.** Lo spec §6.1 cita la "validazione anti-contraddizione". 8a fornisce il **meccanismo**: `supersede(fact)` ritira in transazione i fatti ATTIVI con lo stesso `(subject, predicate)` e attiva il nuovo (per i predicati **funzionali**, es. `si_trova_a`). QUALI predicati siano funzionali (vs additivi come `possiede`) e conoscenza di dominio → la decide chi scrive (Reflection 8b / moduli, Piano 11). 8a non impone politica.
5. **`status` validato con Zod in lettura** (`'active' | 'retracted'`), come l event store valida gli eventi: il DB e un confine non fidato (spec §4 "validazione Zod ai confini").
6. **Ogni fatto porta `eventSeq` (provenienza).** Il **rebuild dallo stream** (spec §6.3) richiede l estrattore LLM (Reflection) → e nel Piano 8b; 8a e lo store con provenienza, pronto per un clear+rebuild futuro.
7. **Niente salienza in 8a.** La salienza (importanza × ricorrenza, spec §6.1) e assegnata dalla Reflection → colonna aggiunta nel Piano 8b (migrazione incrementale). YAGNI qui.
8. **Niente dipendenze nuove → niente Setup orchestratore.** 8a tocca solo file dentro `packages/memory/`.

### Verifica empirica gia svolta (sandbox, prima della stesura — HANDOFF §5.3)

Tutto il codice e i test di 8a sono stati **eseguiti verdi** in una sandbox pnpm-workspace esterna al repo, con la toolchain reale (Node v24.9.0, pnpm 9.12.0, TS strict identico, Vitest 2.1.9, **better-sqlite3 buildato**, `drizzle-orm@0.38.4`) e copie reali di `@loomn/engine`+`@loomn/shared`+`@loomn/memory`. In particolare:

- **drizzle-kit (v0.30.6) sulla baseline senza snapshot** → confermato che `generate` rigenera tutte e 3 le tabelle nella 0001 (rotto) e usa `when` non-deterministico → scelta: migrazione scritta a mano (Decisione 3).
- **Migrazione `0001_canon_ledger.sql` + voce di journal scritte a mano** → `openDatabase(':memory:')` applica 0000 **e** 0001; `canon_facts` e creata e usabile (insert+select verdi).
- **`createCanonLedger`**: `record`/`active`/`all`/`retract`/`supersede` + filtri (subject/predicate/object) + ordinamento per `eventSeq` + validazione `status` (uno status illegale scritto a mano in SQLite fa `throw` in lettura). La query usa `.where(buildWhere(...))` con `buildWhere` che ritorna `SQL | undefined` (`.where(undefined)` = nessun filtro, verificato).
- **Risultato sandbox**: `pnpm -r typecheck` pulito (engine/shared/memory); **27/27 test memory verdi** (20 baseline + 1 migrazione `canon_facts` + 6 `canon-ledger`); le suite esistenti restano verdi.

> La sandbox di verifica e esterna al repo (`C:\Users\zagor\loomn-p8a-sandbox`) e va rimossa a fine lavoro; non fa parte del repository.

---

## Disciplina di scope (vale per OGNI task — incollala nel prompt di ogni subagent)

> **Regole rigide (HANDOFF §5).** Modifica **SOLO** i file elencati nel task. **MAI** toccare `package.json`/`tsconfig*.json`/`vitest.config.ts` (di root o di qualunque pacchetto). **MAI** creare un `tsconfig.json` di root, `composite`/project references, ne introdurre drizzle-kit/`drizzle.config.ts` (la migrazione e scritta a mano — vedi piano). Crea i file con lo strumento Write (non `New-Item -Force`). Prima di committare esegui `git status --short` e verifica che siano cambiati solo i file previsti. Stringhe dei test in apici singoli **senza apostrofi** (`l'`, `un'`, `dell'`, `c'è`) — usa forme senza apostrofo (`è`/`é` vanno bene). Il typecheck di pacchetto e `tsc --noEmit` (via `pnpm -C packages/memory typecheck`); il typecheck root e `pnpm -r typecheck` (**mai** `tsc -b`). L engine resta puro; nessun `Math.random`/`Date.now`. Usa Bash per git/pnpm; i warning `LF will be replaced by CRLF` sono cosmetici.

---

## File structure — modifiche a `packages/memory/`

| File | Stato | Responsabilita |
|---|---|---|
| `src/schema.ts` | MODIFY (Task 1) | + tabella Drizzle `canonFacts` (`canon_facts`). |
| `migrations/0001_canon_ledger.sql` | CREATE (Task 1) | `CREATE TABLE canon_facts` (scritta a mano). |
| `migrations/meta/_journal.json` | MODIFY (Task 1) | + voce `idx:1` `0001_canon_ledger` (`when` congelato). |
| `src/db.test.ts` | MODIFY (Task 1) | + 1 test: la migrazione 0001 crea `canon_facts` usabile. |
| `src/canon-ledger.ts` | CREATE (Task 2) | `createCanonLedger` + `CanonLedger`/`CanonFact`/`CanonFactInput`/`CanonFactFilter`/`CanonStatus`. |
| `src/canon-ledger.test.ts` | CREATE (Task 2) | 6 test (su `openDatabase(':memory:')`). |
| `src/index.ts` | MODIFY (Task 2) | + export di `createCanonLedger` e dei tipi. |

**Conteggi test attesi (cumulativi, baseline 174):** Task 1 → **175** (+1), Task 2 → **181** (+6).

---

### Task 1: Tabella `canon_facts` + migrazione 0001

**Files:**
- Modify: `packages/memory/src/schema.ts`
- Create: `packages/memory/migrations/0001_canon_ledger.sql`
- Modify: `packages/memory/migrations/meta/_journal.json`
- Test: `packages/memory/src/db.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce** (in `db.test.ts`)

Cambia l import in cima al file per includere `canonFacts`:
```ts
import { events, snapshots, canonFacts } from './schema';
```
e aggiungi questo test dentro il `describe('openDatabase', ...)`, dopo il test su `snapshots`:
```ts
  it('crea la tabella canon_facts utilizzabile dopo la migrazione 0001', () => {
    const { db, close } = openDatabase(':memory:');
    db.insert(canonFacts)
      .values({ id: 'f1', subject: 's', predicate: 'p', object: 'o', eventSeq: 1, status: 'active' })
      .run();
    expect(db.select().from(canonFacts).all()).toEqual([
      { id: 'f1', subject: 's', predicate: 'p', object: 'o', eventSeq: 1, status: 'active' },
    ]);
    close();
  });
```

- [ ] **Step 2: Esegui il test per vederlo fallire**

Run: `pnpm test packages/memory/src/db.test.ts`
Expected: FAIL — `canonFacts` non e esportato da `./schema` (errore di import/typecheck).

- [ ] **Step 3: Aggiungi la tabella `canonFacts` a `schema.ts`**

In `packages/memory/src/schema.ts`, dopo la tabella `snapshots`, aggiungi:
```ts
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
```
(`sqliteTable`, `integer`, `text` sono gia importati in cima al file.)

- [ ] **Step 4: Crea la migrazione `0001_canon_ledger.sql`**

`packages/memory/migrations/0001_canon_ledger.sql`:
```sql
CREATE TABLE `canon_facts` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`predicate` text NOT NULL,
	`object` text NOT NULL,
	`event_seq` integer NOT NULL,
	`status` text NOT NULL
);
```

- [ ] **Step 5: Registra la migrazione nel journal**

In `packages/memory/migrations/meta/_journal.json`, aggiungi la seconda voce all array `entries` (lascia invariata la prima). Il file deve risultare:
```json
{
  "version": "7",
  "dialect": "sqlite",
  "entries": [
    { "idx": 0, "version": "6", "when": 1750000000000, "tag": "0000_init", "breakpoints": true },
    { "idx": 1, "version": "6", "when": 1750000000001, "tag": "0001_canon_ledger", "breakpoints": true }
  ]
}
```

- [ ] **Step 6: Esegui test + typecheck**

Run: `pnpm test`
Expected: PASS — **175** test (174 + 1).
Run: `pnpm -C packages/memory typecheck`
Expected: nessun errore.

- [ ] **Step 7: Commit**

```bash
git add packages/memory/src/schema.ts packages/memory/migrations/0001_canon_ledger.sql packages/memory/migrations/meta/_journal.json packages/memory/src/db.test.ts
git commit -m "feat(memory): tabella canon_facts (L1.5) + migrazione 0001 scritta a mano"
```

---

### Task 2: `CanonLedger` (`canon-ledger.ts`)

**Files:**
- Create: `packages/memory/src/canon-ledger.ts`
- Modify: `packages/memory/src/index.ts` (aggiungi gli export del canon ledger)
- Test: `packages/memory/src/canon-ledger.test.ts`

- [ ] **Step 1: Scrivi i test che falliscono**

`packages/memory/src/canon-ledger.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase, type OpenDb } from './db';
import { createCanonLedger } from './canon-ledger';

let open: OpenDb | undefined;
afterEach(() => {
  open?.close();
  open = undefined;
});

function ledger() {
  open = openDatabase(':memory:');
  return createCanonLedger(open.db);
}

describe('CanonLedger', () => {
  it('registra e ritrova un fatto attivo con la sua provenienza', () => {
    const l = ledger();
    l.record({ id: 'f1', subject: 'pc1', predicate: 'ha_ucciso', object: 'Guardia#3', eventSeq: 8120 });
    expect(l.active()).toEqual([
      { id: 'f1', subject: 'pc1', predicate: 'ha_ucciso', object: 'Guardia#3', eventSeq: 8120, status: 'active' },
    ]);
  });

  it('filtra i fatti attivi per subject, predicate e object', () => {
    const l = ledger();
    l.record({ id: 'f1', subject: 'pc1', predicate: 'si_trova_a', object: 'Taverna', eventSeq: 1 });
    l.record({ id: 'f2', subject: 'pc1', predicate: 'possiede', object: 'Spada', eventSeq: 2 });
    l.record({ id: 'f3', subject: 'npc1', predicate: 'si_trova_a', object: 'Taverna', eventSeq: 3 });
    expect(l.active({ subject: 'pc1' }).map((f) => f.id)).toEqual(['f1', 'f2']);
    expect(l.active({ predicate: 'si_trova_a' }).map((f) => f.id)).toEqual(['f1', 'f3']);
    expect(l.active({ object: 'Taverna' }).map((f) => f.id)).toEqual(['f1', 'f3']);
    expect(l.active({ subject: 'pc1', predicate: 'possiede' }).map((f) => f.id)).toEqual(['f2']);
  });

  it('ritira un fatto: esce dagli attivi ma resta nello storico', () => {
    const l = ledger();
    l.record({ id: 'f1', subject: 'pc1', predicate: 'alleato_di', object: 'Re', eventSeq: 1 });
    l.retract('f1');
    expect(l.active()).toEqual([]);
    expect(l.all().map((f) => ({ id: f.id, status: f.status }))).toEqual([{ id: 'f1', status: 'retracted' }]);
  });

  it('supersede ritira il fatto funzionale precedente e ne attiva uno nuovo', () => {
    const l = ledger();
    l.record({ id: 'loc1', subject: 'pc1', predicate: 'si_trova_a', object: 'Taverna', eventSeq: 1 });
    l.supersede({ id: 'loc2', subject: 'pc1', predicate: 'si_trova_a', object: 'Foresta', eventSeq: 5 });
    expect(l.active({ subject: 'pc1', predicate: 'si_trova_a' })).toEqual([
      { id: 'loc2', subject: 'pc1', predicate: 'si_trova_a', object: 'Foresta', eventSeq: 5, status: 'active' },
    ]);
    expect(l.all({ subject: 'pc1', predicate: 'si_trova_a' }).map((f) => ({ id: f.id, status: f.status }))).toEqual([
      { id: 'loc1', status: 'retracted' },
      { id: 'loc2', status: 'active' },
    ]);
  });

  it('supersede non tocca fatti con predicato diverso dello stesso soggetto', () => {
    const l = ledger();
    l.record({ id: 'a', subject: 'pc1', predicate: 'possiede', object: 'Spada', eventSeq: 1 });
    l.supersede({ id: 'b', subject: 'pc1', predicate: 'si_trova_a', object: 'Foresta', eventSeq: 2 });
    expect(l.active({ subject: 'pc1' }).map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('valida lo status letto dal DB e rifiuta un valore illegale (confine non fidato)', () => {
    const l = ledger();
    l.record({ id: 'f1', subject: 's', predicate: 'p', object: 'o', eventSeq: 1 });
    open?.db.run(sql`UPDATE canon_facts SET status = 'bogus' WHERE id = 'f1'`);
    expect(() => l.all()).toThrow();
  });
});
```

- [ ] **Step 2: Esegui i test per vederli fallire**

Run: `pnpm test packages/memory/src/canon-ledger.test.ts`
Expected: FAIL — `Cannot find module './canon-ledger'`.

- [ ] **Step 3: Implementa `canon-ledger.ts`**

`packages/memory/src/canon-ledger.ts`:
```ts
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
  status: CanonStatus;
}

/** Un nuovo fatto da registrare; lo stato iniziale e sempre 'active'. */
export interface CanonFactInput {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  eventSeq: number;
}

export interface CanonFactFilter {
  subject?: string;
  predicate?: string;
  object?: string;
}

export interface CanonLedger {
  /** Registra un nuovo fatto (status 'active'). */
  record(fact: CanonFactInput): void;
  /** Fatti ATTIVI che soddisfano il filtro (tutti se assente), ordinati per eventSeq. */
  active(filter?: CanonFactFilter): CanonFact[];
  /** Tutti i fatti (attivi e ritirati) che soddisfano il filtro, ordinati per eventSeq. */
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
  status: string;
}): CanonFact {
  return { ...row, status: statusSchema.parse(row.status) };
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
    const rows = db.select().from(canonFacts).where(buildWhere(filter, activeOnly)).orderBy(canonFacts.eventSeq).all();
    return rows.map(toFact);
  };
  return {
    record(fact) {
      db.insert(canonFacts).values({ ...fact, status: 'active' }).run();
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
        tx.insert(canonFacts).values({ ...fact, status: 'active' }).run();
      });
    },
  };
}
```

- [ ] **Step 4: Aggiorna il barrel**

`packages/memory/src/index.ts` (mantieni le righe esistenti, aggiungi gli export del ledger):
```ts
export { openDatabase, type OpenDb } from './db';
export { createSqliteEventStore, type SqliteEventStore } from './sqlite-event-store';
export {
  createCanonLedger,
  type CanonLedger,
  type CanonFact,
  type CanonFactInput,
  type CanonFactFilter,
  type CanonStatus,
} from './canon-ledger';
```

- [ ] **Step 5: Esegui test + typecheck**

Run: `pnpm test`
Expected: PASS — **181** test (175 + 6).
Run: `pnpm -C packages/memory typecheck` e `pnpm typecheck`
Expected: nessun errore (engine/shared/memory/ai puliti).

- [ ] **Step 6: Commit**

```bash
git add packages/memory/src/canon-ledger.ts packages/memory/src/canon-ledger.test.ts packages/memory/src/index.ts
git commit -m "feat(memory): CanonLedger L1.5 (record/active/all/retract/supersede)"
```

---

## Fuori ambito (esplicito)

- **Reflection (estrazione LLM dei fatti + riassunti) e L2 (summaries).** → Piano 8b. 8a e lo store; chi scrive i fatti (porte `FactExtractor`/`Summarizer` iniettate) arriva dopo. `memory` non dipendera mai da `ai`.
- **Context Assembler con budget di token** (spec §6.2) e iniezione in `runMasterTurn`. → Piano 8c.
- **Salienza** (importanza × ricorrenza). → Piano 8b (colonna aggiunta con migrazione incrementale).
- **Rebuild del ledger dallo stream** (spec §6.3). Richiede l estrattore (Reflection) → Piano 8b. 8a conserva la provenienza `eventSeq` per renderlo possibile.
- **drizzle-kit / `drizzle.config.ts`.** Rimandato (Decisione 3): migrazione scritta a mano qui; drizzle-kit quando il churn dello schema lo giustifichera (con ricostruzione una tantum della baseline).
- **Politica dei predicati funzionali** (quali predicati usano `supersede`). E conoscenza di dominio → Reflection (8b) / moduli (Piano 11).
- **Indici su `canon_facts`.** YAGNI finche le tabelle sono piccole; si aggiungono con dati e misure.
- **`Command`/`Event` engine per gli strumenti rimandati di 7c** (`request_check`/`apply_effect`/`advance_quest`) e **FSM di fase**. Restano fuori dal Piano 8 salvo decisione esplicita.

## Self-review (svolta sul piano vs spec)

- **Spec §6 «L1.5 CANON LEDGER — fatti narrativi DISCRETI e interrogabili (soggetto, predicato, oggetto, eventId, stato). Precisione sui nomi»** → tabella `canon_facts` (subject/predicate/object/eventSeq/status) + `CanonFact`; query per subject/predicate/object. ✓
- **Spec §6 «Per non contraddirsi, il Master ha bisogno di fatti discreti»** → `supersede` (ritira-e-rimpiazza per predicati funzionali) + `active`/`retract`; politica demandata a chi scrive. ✓
- **Spec §6.3 «L1/L1.5/L2: tabelle SQLite (Drizzle), rigenerabili dagli eventi»** → proiezione Drizzle `canon_facts`; `eventSeq` di provenienza pronto per il rebuild (estrattore in 8b). ✓
- **Spec §4 «Validazione Zod ai confini»** → `status` validato in lettura con `statusSchema`; test col valore illegale. ✓
- **Spec §3/§4 «dependency rule memory → engine → shared»** → 8a sta in `memory`, niente `ai`. ✓
- **Placeholder scan:** nessun TODO/TBD; ogni step ha codice/comando completo. ✓
- **Type consistency:** `CanonLedger`/`CanonFact`/`CanonFactInput`/`CanonFactFilter`/`CanonStatus`/`createCanonLedger` coerenti fra modulo, barrel e test; `canonFacts` (schema) usata in `db.test.ts`, `canon-ledger.ts`; `openDatabase`/`OpenDb` da `./db`. ✓
- **Bug-apostrofo:** tutte le stringhe `it()/describe()` in apici singoli sono senza apostrofi. Grep: `(it|describe)\('[^']*'[A-Za-zàèéìòù]` → atteso *no matches* (verificato in sandbox). ✓
- **Disciplina di scope:** Task 1/2 toccano solo file sotto `packages/memory/`; nessuna dipendenza nuova, nessun `package.json`/`tsconfig`/`vitest.config` toccato; niente drizzle-kit. ✓
- **Conteggi test:** 175 → 181 (cumulativi). ✓ (verificati in sandbox: 7 nuovi test verdi.)

## Roadmap (Fase 1, aggiornata)

- **Piano 6 — Persistenza** ✅ fatto
- **Piano 7a/7b/7c — Provider Layer / StructuredOutputPort / AI Master pipeline** ✅ fatto
- **Piano 8a — Canon Ledger (L1.5)** ← *questo*
- **Piano 8b — Reflection + L2 (riassunti)** (tabella `summaries`, porte `FactExtractor`/`Summarizer` iniettate, salienza)
- **Piano 8c — Context Assembler** (budget di token §6.2; iniezione in `runMasterTurn`)
- **Piano 9 — Shell Electron** (main/preload/renderer, sicurezza, IPC tipizzato, Clock; wiring di EventStore + CanonLedger su una connessione condivisa)
- **Piano 10 — UI Vue** (chat, scheda PG, dadi 3D, journal, provider) (grande, probabile split)
- **Piano 11 — Moduli a tema** (formato dati Zod + import/export + 1 modulo curato)

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-16-loomn-fase1-piano8a-canon-ledger.md`. Two execution options:**

**1. Subagent-Driven (consigliato)** — nessun Setup orchestratore (niente deps nuove); un subagent fresco per task (model sonnet), spec review + code-quality review per task (sonnet), final review dell intero branch (opus), poi `finishing-a-development-branch` → merge locale in main. **Non far leggere il file di piano al subagent: incolla il testo completo del task + la disciplina di scope.** Branch dedicato `feat/fase1-piano8a-canon-ledger`.

**2. Inline Execution** — esecuzione dei task in questa sessione con `executing-plans`, checkpoint di review fra i batch.

**Quale approccio?**
