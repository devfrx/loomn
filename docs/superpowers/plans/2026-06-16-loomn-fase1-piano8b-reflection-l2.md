# Piano 8b — Reflection + L2 (riassunti) + Salienza Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere a `@loomn/memory` il **percorso di scrittura della memoria** della spec §6.1: la **Reflection** (asincrona, fuori dal turno) che a fine scena estrae fatti discreti nel **Canon Ledger** (8a), genera un **riassunto** nella nuova **memoria narrativa L2** (`summaries`, gerarchia scena→sessione→arco→campagna) e assegna la **salienza** (importanza × ricorrenza). Tutte le impl LLM-backed restano fuori (`memory` NON dipende da `ai`): Reflection consuma **porte iniettate** `FactExtractor`/`Summarizer`/`Clock`, testate con doppi.

**Architecture:** Tre proiezioni/utility nuove in `@loomn/memory` (`memory → engine → shared`), nessuna dipendenza nuova: (1) tabella `summaries` (L2) + `createSummaryStore` (come `canon_facts`/`createCanonLedger` di 8a); (2) `scoreSalience` (funzione pura) + porta `Clock` (tempo iniettato, mai `Date.now`); (3) `runReflection(deps, input)` che orchestra le **porte** `FactExtractor`/`Summarizer` (impl LLM-backed iniettate dall app al Piano 9 — `ai` e `memory` non si importano a vicenda) scrivendo su Canon Ledger (8a) e L2. La salienza diventa una colonna su `canon_facts` (migrazione incrementale 0003) e un campo su `summaries`. Migrazioni **scritte a mano** (drizzle-kit rimandato, come 8a).

**Tech Stack:** TypeScript strict (`tsconfig.base.json`), Vitest (config root), `drizzle-orm@^0.38.4`, `better-sqlite3@^12.10.1`, `zod@^3.23.8`. **Nessuna dipendenza nuova** (niente Setup orchestratore).

---

## Dove sta il Piano 8b — il Piano 8 e splittato (8a/8b/8c)

Lo spec §6 (memoria a strati) copre tre sottosistemi indipendenti; come il Piano 7 (7a/7b/7c), il **Piano 8 e splittato** e ogni sotto-piano si scrive+esegue+mergia da solo:

- **8a — Canon Ledger (L1.5) ✅ FATTO**: tabella `canon_facts` + `createCanonLedger` (record/active/all/retract/supersede). Lo store su cui 8b scrive i fatti.
- **8b — Reflection + L2 (riassunti) + Salienza ← QUESTO**: tabella `summaries` (L2) + `createSummaryStore`; `scoreSalience` + porta `Clock`; colonna `salience` su `canon_facts`; la pipeline `runReflection` con porte `FactExtractor`/`Summarizer` iniettate (impl LLM-backed nell app). Testabile **interamente coi doppi** (niente LLM, niente rete).
- **8c — Context Assembler**: allocatore con **budget di token** (spec §6.2) che legge L1 (GameState/engine) + L1.5 (8a) + L2 (8b) e produce il contesto; **iniettato** in `runMasterTurn` (oggi `assembleContextStub`), perche `ai` non puo importare `memory`. Qui applichera la **recency** a tempo di lettura (decadimento su `created_at`).

### Cosa esiste gia in `@loomn/memory` (Piano 6 + 8a)

- `schema.ts`: tabelle Drizzle `events`, `snapshots`, **`canonFacts`** (`canon_facts`, 8a).
- `db.ts`: `openDatabase(dbPath): OpenDb` (`{ db: BetterSQLite3Database; close() }`) — apre SQLite, pragma WAL, applica le migrazioni da `../migrations` via `migrate()` (idempotente). `migrationsFolder` esportata.
- `canon-ledger.ts` (8a): `createCanonLedger(db)` → `record`/`active`/`all`/`retract`/`supersede`; `status` validato Zod in lettura; `supersede` = ritira-e-rimpiazza in transazione per i predicati funzionali. Tipi `CanonFact`/`CanonFactInput`/`CanonFactFilter`/`CanonStatus`.
- `sqlite-event-store.ts`: `createSqliteEventStore(dbPath)` (porta `EventStore` + snapshot).
- `migrations/`: `0000_init.sql` + `0001_canon_ledger.sql` + `meta/_journal.json` (**scritti a mano**, journal con `when` congelato `1750000000000`/`...001`, top-level `version: "7"`, entries `version: "6"`; **non** c e un `0000_snapshot.json` di drizzle-kit).
- `index.ts` (barrel): esporta `openDatabase`/`OpenDb`, `createSqliteEventStore`/`SqliteEventStore`, `createCanonLedger` + i tipi del ledger.
- `@loomn/engine` esporta `StoredEvent` (`{ seq: number; event: DomainEvent }`) e `DomainEvent` (riusati da `runReflection` come input della scena). Deps di `memory`: `@loomn/engine`, `@loomn/shared`, `better-sqlite3`, `drizzle-orm`, `zod`.

### Decisioni risolte (e perche) — i punti aperti del handoff

1. **8b consegna SOLO il lato `memory` (porte + pipeline + L2 + salienza + Clock); l adapter LLM e RIMANDATO all app (Piano 9).** Motivo (regola di dipendenza, gia fissata): `memory` NON importa `ai` (handoff §5) **e** `ai` NON importa `memory` (deciso in 8a per il Context Assembler: «`ai` non puo importare `memory`»). L unico punto dove `ai` e `memory` si compongono e l **app** (`app → packages`). Quindi l impl LLM-backed di `FactExtractor`/`Summarizer` (che usa lo `StructuredOutputPort` di 7b — caso «oggetto strutturato forzato») implementa l interfaccia di `memory` usando `ai`, e vive nell app. Un «adapter sottile in `ai`» non eviterebbe la colla a livello app (dovrebbe duplicare i tipi per non importare `memory`) → scelta piu pulita: niente adapter in `ai`, porte in `memory`, impl nell app. Identico pattern del Context Assembler (8c). 8b e testato **interamente con doppi**.
2. **Le porte vivono dove le consuma la pipeline: in `memory`.** `FactExtractor`/`Summarizer`/`Clock` sono `interface` in `@loomn/memory`. La pipeline `runReflection` le riceve iniettate. Hexagonal puro: la porta e del core (Reflection), l adapter sta al bordo (app).
3. **L2 `summaries` modella la gerarchia con una colonna `level`** (`'scene' | 'session' | 'arc' | 'campaign'`) + `scope` (chiave di raggruppamento, es. id sessione) + `text` + `importance` + `salience` + `created_at` + `event_seq_from`/`event_seq_to` (range coperto). `level` validato Zod in lettura (confine non fidato, come lo `status` del ledger). 8b genera **solo riassunti di scena** (`level: 'scene'`); lo store e la colonna `level` **abilitano** la ricomposizione dei livelli superiori, ma la **ricomposizione automatica** (riassumere i riassunti a fine sessione/arco) e fuori ambito (vedi Fuori ambito): e la stessa pipeline su confini piu grossi, nessuna architettura nuova.
4. **Salienza = importanza × ricorrenza (spec §6.1), funzione PURA `scoreSalience`.** L importanza (1..10) viene dall estrattore/summarizer; la ricorrenza = quante volte il **soggetto** del fatto compare gia attivo nel ledger. Formula bounded e tarabile (spec §13): `min(1, (clamp(importance,1,10)/10) * (1 + 0.1*recurrence))`, arrotondata a 6 decimali. Memorizzata: colonna `salience` su `canon_facts` (migrazione 0003) e campo `salience` su `summaries`. **La recency NON e qui:** e a tempo di lettura (8c), che decadra il punteggio in base a `created_at`. Per questo la Reflection timbra `created_at` sui riassunti via la **porta `Clock`** (mai `Date.now` — purezza, house rule; coerente col Clock del Piano 9). I `canon_facts` non prendono `created_at`: hanno gia `event_seq` come ordine/provenienza e un fatto e «vero finche non ritirato» (la recency conta per la prosa L2, non per i fatti discreti) — asimmetria voluta, documentata.
5. **Schema id deterministico dal range di seq della scena.** Fatti: `f-<from>-<to>-<i>` (i = indice nel batch estratto); riassunto di scena: `s-scene-<from>-<to>`. `from`/`to` = min/max `seq` degli eventi della scena. Deterministico e privo di collisioni **a patto di una sola Reflection per range** (precondizione documentata) — risolve il follow-up noto di 8a (`record`/`supersede` lanciano su id duplicato): garantendo l unicita per range non si entra mai nel caso PK-duplicata.
6. **La politica «quali predicati sono funzionali» e dell estrattore.** `ExtractedFact.functional: boolean`: l estrattore (LLM, informato dalla semantica dei predicati del modulo via prompt, app-wired) etichetta ogni fatto; la pipeline instrada `supersede` (funzionale, anti-contraddizione) vs `record` (additivo). Coerente con 8a («la politica e demandata a chi scrive: Reflection / moduli»). I moduli (Piano 11) la influenzano via il prompt dell estrattore.
7. **`salience` su `canon_facts` con `DEFAULT 0` → i call site 8a restano validi.** `CanonFactInput.salience?` opzionale (default 0): chi non la passa (8a, test) ottiene 0; la Reflection passa il punteggio. `CanonFact` (forma in lettura) acquisisce `salience: number` → **i test 8a esistenti vanno aggiornati** (i loro `toEqual` di oggetto intero ottengono `salience: 0`): 3 asserzioni in `canon-ledger.test.ts` + 1 in `db.test.ts` (elencate nel Task 3). E conseguenza necessaria dello schema, dentro lo stesso pacchetto → in ambito.
8. **8b resta UN solo piano (non ulteriormente splittato).** Pipeline + L2 + salienza sono un unico **percorso di scrittura coeso**: la pipeline E cio che riempie L2 e assegna la salienza; separarle creerebbe cuciture artificiali. I 5 task restano comunque bite-sized. (8 e gia decomposto in 8a/8b/8c — feature, non imprecisione.)
9. **Migrazioni SCRITTE A MANO, drizzle-kit RIMANDATO** (stessa decisione empirica di 8a — vedi quel piano): su questa baseline (journal a mano, senza `0000_snapshot.json`) `drizzle-kit generate` rigenererebbe tutte le tabelle e userebbe un `when` non-deterministico. `0002_summaries.sql` (CREATE) e `0003_canon_salience.sql` (ALTER ADD COLUMN) sono SQL banale e deterministico, identico a quello che drizzle-kit genererebbe per quelle modifiche. drizzle-kit si introdurra col churn di schema, con ricostruzione una tantum della baseline.
10. **Niente dipendenze nuove → niente Setup orchestratore.** 8b tocca solo file dentro `packages/memory/`.

### Verifica empirica gia svolta (sandbox, prima della stesura — handoff §5.3)

Tutto il codice e i test di 8b sono stati **eseguiti verdi** in una sandbox esterna al repo, con la toolchain reale (Node v24.9.0, pnpm 9.12.0, TS strict identico a `tsconfig.base.json`, Vitest 2.1.9, **better-sqlite3 12.11.1 buildato**, `drizzle-orm@0.38.4`, `zod@3.25.x`), con copie reali di `schema.ts`/`db.ts`/`canon-ledger.ts` + i nuovi moduli + le migrazioni + uno stub minimale dei tipi engine (`StoredEvent`/`DomainEvent`, che nel repo vengono da `@loomn/engine`). In particolare verificato:

- **Migrazioni `0002`/`0003` + journal a mano (4 entries, `when` congelato)**: `openDatabase(':memory:')` applica `0000`→`0003` in ordine; `summaries` e creata e usabile; `ALTER TABLE canon_facts ADD salience real DEFAULT 0 NOT NULL` funziona e l insert senza `salience` da `0`. (L applicazione incrementale su un DB persistente che ha gia `0000`/`0001` e lo **stesso meccanismo** gia provato in 8a per `0001`-su-`0000`.)
- **`createSummaryStore`**: `record`/`list` + filtri `level`/`scope` + ordinamento `eventSeqFrom` + validazione Zod del `level` (un livello illegale scritto a mano fa `throw` in lettura). `buildWhere` ritorna `SQL | undefined` (`.where(undefined)` = nessun filtro).
- **`scoreSalience`**: valori esatti (`{10,0}→1`, `{5,0}→0.5`, `{2,0}→0.2`, `{5,2}→0.6`, `{8,10}→1` clamp, clamp di importanza/ricorrenza fuori range).
- **`createCanonLedger` esteso**: `record`/`supersede` con `salience` (default 0 quando omessa, valore fornito conservato); i tipi `CanonFact.salience`/`CanonFactInput.salience?` sotto `exactOptionalPropertyTypes` (spread `{ ...fact, salience: fact.salience ?? 0 }`).
- **`runReflection` (coi doppi)**: no-op senza eventi; fatti additivi → `record` con id `f-<from>-<to>-<i>` e salienza da importanza; fatti funzionali → `supersede` (anti-contraddizione: il precedente passa a `retracted`); riassunto di scena → L2 con `level`/`scope`/range/`created_at` dal Clock; la ricorrenza del soggetto aumenta la salienza.
- **Risultato sandbox**: `tsc --noEmit` pulito; **19/19 test verdi**; grep anti-apostrofo sulle stringhe dei test → *no matches*.

> La sandbox di verifica e esterna al repo (`C:\Users\zagor\loomn-p8b-sandbox`) e va rimossa a fine lavoro; non fa parte del repository.

---

## Disciplina di scope (vale per OGNI task — incollala nel prompt di ogni subagent)

> **Regole rigide (handoff §5).** Modifica **SOLO** i file elencati nel task. **MAI** toccare `package.json`/`tsconfig*.json`/`vitest.config.ts` (di root o di qualunque pacchetto). **MAI** creare un `tsconfig.json` di root, `composite`/project references, ne introdurre drizzle-kit/`drizzle.config.ts` (le migrazioni sono scritte a mano — vedi piano). Crea i file con lo strumento Write (non `New-Item -Force`). Prima di committare esegui `git status --short` e verifica che siano cambiati solo i file previsti. Stringhe dei test in apici singoli **senza apostrofi** (`l'`, `un'`, `dell'`, `c'è`) — usa forme senza apostrofo (`è`/`é` vanno bene). Il typecheck di pacchetto e `tsc --noEmit` (via `pnpm -C packages/memory typecheck`); il typecheck root e `pnpm -r typecheck` (**mai** `tsc -b`). L engine resta puro; nessun `Math.random`/`Date.now` (il tempo arriva dalla porta `Clock`). Usa Bash per git/pnpm; i warning `LF will be replaced by CRLF` sono cosmetici.

---

## File structure — modifiche a `packages/memory/`

| File | Stato | Responsabilita |
|---|---|---|
| `src/schema.ts` | MODIFY (Task 1 + Task 3) | + tabella `summaries` (Task 1); + colonna `salience` su `canonFacts` (Task 3). |
| `migrations/0002_summaries.sql` | CREATE (Task 1) | `CREATE TABLE summaries` (scritta a mano). |
| `migrations/0003_canon_salience.sql` | CREATE (Task 3) | `ALTER TABLE canon_facts ADD salience` (scritta a mano). |
| `migrations/meta/_journal.json` | MODIFY (Task 1 + Task 3) | + voce `idx:2` `0002_summaries` (Task 1); + voce `idx:3` `0003_canon_salience` (Task 3). |
| `src/db.test.ts` | MODIFY (Task 1 + Task 3) | + 1 test `summaries` (Task 1); + 1 test `salience` default + aggiorna 1 asserzione `canon_facts` (Task 3). |
| `src/summary-store.ts` | CREATE (Task 2) | `createSummaryStore` + `SummaryStore`/`Summary`/`SummaryInput`/`SummaryFilter`/`SummaryLevel`. |
| `src/summary-store.test.ts` | CREATE (Task 2) | 4 test. |
| `src/canon-ledger.ts` | MODIFY (Task 3) | `CanonFact.salience`, `CanonFactInput.salience?`, `toFact`/`record`/`supersede`. |
| `src/canon-ledger.test.ts` | MODIFY (Task 3) | aggiorna 3 asserzioni esistenti (+`salience: 0`) + 2 test nuovi. |
| `src/salience.ts` | CREATE (Task 4) | `scoreSalience` + `SalienceInput`. |
| `src/clock.ts` | CREATE (Task 4) | porta `Clock`. |
| `src/salience.test.ts` | CREATE (Task 4) | 5 test. |
| `src/reflection.ts` | CREATE (Task 5) | `runReflection` + porte `FactExtractor`/`Summarizer` + `ExtractedFact`/`SceneSummaryDraft`/`ReflectionInput`/`ReflectionDeps`/`ReflectionResult`. |
| `src/reflection.test.ts` | CREATE (Task 5) | 5 test. |
| `src/index.ts` | MODIFY (Task 2 + Task 4 + Task 5) | + export di summary-store / salience+clock / reflection. |

**Conteggi test attesi (cumulativi, baseline 182):** Task 1 → **183** (+1), Task 2 → **187** (+4), Task 3 → **190** (+3, 4 asserzioni esistenti aggiornate senza variazione di conteggio), Task 4 → **195** (+5), Task 5 → **200** (+5).

---

### Task 1: Tabella `summaries` (L2) + migrazione 0002

**Files:**
- Modify: `packages/memory/src/schema.ts`
- Create: `packages/memory/migrations/0002_summaries.sql`
- Modify: `packages/memory/migrations/meta/_journal.json`
- Test: `packages/memory/src/db.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce** (in `db.test.ts`)

Cambia l import in cima al file per includere `summaries`:
```ts
import { events, snapshots, canonFacts, summaries } from './schema';
```
e aggiungi questo test dentro il `describe('openDatabase', ...)`, dopo il test su `canon_facts`:
```ts
  it('crea la tabella summaries utilizzabile dopo la migrazione 0002', () => {
    const { db, close } = openDatabase(':memory:');
    db.insert(summaries)
      .values({ id: 's1', level: 'scene', scope: 'sess1', text: 'la taverna brucia', importance: 7, salience: 0.7, createdAt: 1000, eventSeqFrom: 1, eventSeqTo: 4 })
      .run();
    expect(db.select().from(summaries).all()).toEqual([
      { id: 's1', level: 'scene', scope: 'sess1', text: 'la taverna brucia', importance: 7, salience: 0.7, createdAt: 1000, eventSeqFrom: 1, eventSeqTo: 4 },
    ]);
    close();
  });
```

- [ ] **Step 2: Esegui il test per vederlo fallire**

Run: `pnpm test packages/memory/src/db.test.ts`
Expected: FAIL — `summaries` non e esportato da `./schema` (errore di import/typecheck).

- [ ] **Step 3: Aggiungi la tabella `summaries` a `schema.ts`**

In `packages/memory/src/schema.ts`, prima aggiorna l import in cima per includere `real` (vedi **Nota import** sotto), poi, dopo la tabella `canonFacts`, aggiungi (`sqliteTable`/`integer`/`text` sono gia importati):
```ts
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
```
**Nota import:** la riga 1 di `schema.ts` e oggi `import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';`. Cambiala in:
```ts
import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
```

- [ ] **Step 4: Crea la migrazione `0002_summaries.sql`**

`packages/memory/migrations/0002_summaries.sql`:
```sql
CREATE TABLE `summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`level` text NOT NULL,
	`scope` text NOT NULL,
	`text` text NOT NULL,
	`importance` integer NOT NULL,
	`salience` real NOT NULL,
	`created_at` integer NOT NULL,
	`event_seq_from` integer NOT NULL,
	`event_seq_to` integer NOT NULL
);
```

- [ ] **Step 5: Registra la migrazione nel journal**

In `packages/memory/migrations/meta/_journal.json`, aggiungi la terza voce all array `entries` (lascia invariate le prime due). Il file deve risultare:
```json
{
  "version": "7",
  "dialect": "sqlite",
  "entries": [
    { "idx": 0, "version": "6", "when": 1750000000000, "tag": "0000_init", "breakpoints": true },
    { "idx": 1, "version": "6", "when": 1750000000001, "tag": "0001_canon_ledger", "breakpoints": true },
    { "idx": 2, "version": "6", "when": 1750000000002, "tag": "0002_summaries", "breakpoints": true }
  ]
}
```

- [ ] **Step 6: Esegui test + typecheck**

Run: `pnpm test`
Expected: PASS — **183** test (182 + 1).
Run: `pnpm -C packages/memory typecheck`
Expected: nessun errore.

- [ ] **Step 7: Commit**

```bash
git add packages/memory/src/schema.ts packages/memory/migrations/0002_summaries.sql packages/memory/migrations/meta/_journal.json packages/memory/src/db.test.ts
git commit -m "feat(memory): tabella summaries (L2) + migrazione 0002 scritta a mano"
```

---

### Task 2: `SummaryStore` (`summary-store.ts`)

**Files:**
- Create: `packages/memory/src/summary-store.ts`
- Modify: `packages/memory/src/index.ts`
- Test: `packages/memory/src/summary-store.test.ts`

- [ ] **Step 1: Scrivi i test che falliscono**

`packages/memory/src/summary-store.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase, type OpenDb } from './db';
import { createSummaryStore } from './summary-store';

let open: OpenDb | undefined;
afterEach(() => {
  open?.close();
  open = undefined;
});

function store() {
  open = openDatabase(':memory:');
  return createSummaryStore(open.db);
}

const base = { scope: 'sess1', text: 't', importance: 5, salience: 0.5, createdAt: 1000 };

describe('SummaryStore', () => {
  it('registra e ritrova un riassunto con tutti i campi', () => {
    const s = store();
    s.record({ id: 's1', level: 'scene', scope: 'sess1', text: 'la taverna brucia', importance: 7, salience: 0.7, createdAt: 1234, eventSeqFrom: 1, eventSeqTo: 4 });
    expect(s.list()).toEqual([
      { id: 's1', level: 'scene', scope: 'sess1', text: 'la taverna brucia', importance: 7, salience: 0.7, createdAt: 1234, eventSeqFrom: 1, eventSeqTo: 4 },
    ]);
  });

  it('ordina i riassunti per eventSeqFrom crescente', () => {
    const s = store();
    s.record({ id: 'b', level: 'scene', ...base, eventSeqFrom: 10, eventSeqTo: 12 });
    s.record({ id: 'a', level: 'scene', ...base, eventSeqFrom: 1, eventSeqTo: 3 });
    expect(s.list().map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('filtra per level e per scope', () => {
    const s = store();
    s.record({ id: 'sc', level: 'scene', scope: 'sess1', text: 't', importance: 5, salience: 0.5, createdAt: 1, eventSeqFrom: 1, eventSeqTo: 2 });
    s.record({ id: 'se', level: 'session', scope: 'arc1', text: 't', importance: 5, salience: 0.5, createdAt: 2, eventSeqFrom: 1, eventSeqTo: 9 });
    expect(s.list({ level: 'scene' }).map((x) => x.id)).toEqual(['sc']);
    expect(s.list({ scope: 'arc1' }).map((x) => x.id)).toEqual(['se']);
  });

  it('valida il level letto dal DB e rifiuta un valore illegale', () => {
    const s = store();
    s.record({ id: 's1', level: 'scene', scope: 'sess1', text: 't', importance: 5, salience: 0.5, createdAt: 1, eventSeqFrom: 1, eventSeqTo: 2 });
    open?.db.run(sql`UPDATE summaries SET level = 'bogus' WHERE id = 's1'`);
    expect(() => s.list()).toThrow();
  });
});
```

- [ ] **Step 2: Esegui i test per vederli fallire**

Run: `pnpm test packages/memory/src/summary-store.test.ts`
Expected: FAIL — `Cannot find module './summary-store'`.

- [ ] **Step 3: Implementa `summary-store.ts`**

`packages/memory/src/summary-store.ts`:
```ts
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

export interface SummaryInput {
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
```

- [ ] **Step 4: Aggiorna il barrel**

In `packages/memory/src/index.ts`, dopo gli export del canon ledger, aggiungi:
```ts
export {
  createSummaryStore,
  type SummaryStore,
  type Summary,
  type SummaryInput,
  type SummaryFilter,
  type SummaryLevel,
} from './summary-store';
```

- [ ] **Step 5: Esegui test + typecheck**

Run: `pnpm test`
Expected: PASS — **187** test (183 + 4).
Run: `pnpm -C packages/memory typecheck`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add packages/memory/src/summary-store.ts packages/memory/src/summary-store.test.ts packages/memory/src/index.ts
git commit -m "feat(memory): SummaryStore L2 (record/list, gerarchia scena-campagna)"
```

---

### Task 3: Colonna `salience` su `canon_facts` (migrazione 0003) + `CanonLedger` esteso

**Files:**
- Modify: `packages/memory/src/schema.ts`
- Create: `packages/memory/migrations/0003_canon_salience.sql`
- Modify: `packages/memory/migrations/meta/_journal.json`
- Modify: `packages/memory/src/canon-ledger.ts`
- Modify: `packages/memory/src/db.test.ts`
- Modify: `packages/memory/src/canon-ledger.test.ts`

- [ ] **Step 1: Scrivi i test che falliscono / aggiorna quelli esistenti**

(a) In `packages/memory/src/db.test.ts`, aggiungi un test dentro `describe('openDatabase', ...)`, dopo il test su `summaries`:
```ts
  it('aggiunge la colonna salience a canon_facts con la migrazione 0003 (default 0)', () => {
    const { db, close } = openDatabase(':memory:');
    db.insert(canonFacts).values({ id: 'f1', subject: 's', predicate: 'p', object: 'o', eventSeq: 1, status: 'active' }).run();
    expect(db.select().from(canonFacts).all()).toEqual([
      { id: 'f1', subject: 's', predicate: 'p', object: 'o', eventSeq: 1, status: 'active', salience: 0 },
    ]);
    close();
  });
```
E **aggiorna** l asserzione del test esistente «crea la tabella canon_facts utilizzabile dopo la migrazione 0001»: l oggetto atteso passa da
```ts
      { id: 'f1', subject: 's', predicate: 'p', object: 'o', eventSeq: 1, status: 'active' },
```
a
```ts
      { id: 'f1', subject: 's', predicate: 'p', object: 'o', eventSeq: 1, status: 'active', salience: 0 },
```

(b) In `packages/memory/src/canon-ledger.test.ts`, **aggiungi** due test nuovi dentro `describe('CanonLedger', ...)`:
```ts
  it('registra un fatto con la salienza fornita', () => {
    const l = ledger();
    l.record({ id: 'f1', subject: 'pc1', predicate: 'ha_ucciso', object: 'Guardia#3', eventSeq: 8120, salience: 0.9 });
    expect(l.active()[0]?.salience).toBe(0.9);
  });

  it('supersede conserva la salienza del nuovo fatto funzionale', () => {
    const l = ledger();
    l.record({ id: 'loc1', subject: 'pc1', predicate: 'si_trova_a', object: 'Taverna', eventSeq: 1, salience: 0.3 });
    l.supersede({ id: 'loc2', subject: 'pc1', predicate: 'si_trova_a', object: 'Foresta', eventSeq: 5, salience: 0.6 });
    expect(l.active({ subject: 'pc1', predicate: 'si_trova_a' })[0]?.salience).toBe(0.6);
  });
```
E **aggiorna** le 3 asserzioni di oggetto intero esistenti aggiungendo `salience: 0` (i fatti registrati senza salienza nei test 8a):
- Nel test «registra e ritrova un fatto attivo con la sua provenienza»:
  ```ts
      { id: 'f1', subject: 'pc1', predicate: 'ha_ucciso', object: 'Guardia#3', eventSeq: 8120, salience: 0, status: 'active' },
  ```
- Nel test «supersede ritira il fatto funzionale precedente e ne attiva uno nuovo» (la prima `expect(...).toEqual([...])`):
  ```ts
      { id: 'loc2', subject: 'pc1', predicate: 'si_trova_a', object: 'Foresta', eventSeq: 5, salience: 0, status: 'active' },
  ```
- Nel test «supersede senza un fatto precedente attiva direttamente il nuovo (primo inserimento)»:
  ```ts
      { id: 'loc1', subject: 'pc1', predicate: 'si_trova_a', object: 'Taverna', eventSeq: 1, salience: 0, status: 'active' },
  ```
(Le asserzioni che usano `.map((f) => f.id)` o `.map((f) => ({ id: f.id, status: f.status }))` NON cambiano.)

- [ ] **Step 2: Esegui i test per vederli fallire**

Run: `pnpm test packages/memory/src/db.test.ts packages/memory/src/canon-ledger.test.ts`
Expected: FAIL — la colonna `salience` non esiste ancora / `CanonFact` non ha `salience` (le asserzioni aggiornate e i test nuovi falliscono).

- [ ] **Step 3: Aggiungi la colonna `salience` a `canonFacts` in `schema.ts`**

In `packages/memory/src/schema.ts`, nella tabella `canonFacts`, aggiungi la colonna `salience` come ultimo campo:
```ts
export const canonFacts = sqliteTable('canon_facts', {
  id: text('id').primaryKey(),
  subject: text('subject').notNull(),
  predicate: text('predicate').notNull(),
  object: text('object').notNull(),
  eventSeq: integer('event_seq').notNull(),
  status: text('status').notNull(),
  salience: real('salience').notNull().default(0),
});
```
(`real` e gia importato dopo il Task 1.)

- [ ] **Step 4: Crea la migrazione `0003_canon_salience.sql`**

`packages/memory/migrations/0003_canon_salience.sql`:
```sql
ALTER TABLE `canon_facts` ADD `salience` real DEFAULT 0 NOT NULL;
```

- [ ] **Step 5: Registra la migrazione nel journal**

In `packages/memory/migrations/meta/_journal.json`, aggiungi la quarta voce all array `entries`. Il file deve risultare:
```json
{
  "version": "7",
  "dialect": "sqlite",
  "entries": [
    { "idx": 0, "version": "6", "when": 1750000000000, "tag": "0000_init", "breakpoints": true },
    { "idx": 1, "version": "6", "when": 1750000000001, "tag": "0001_canon_ledger", "breakpoints": true },
    { "idx": 2, "version": "6", "when": 1750000000002, "tag": "0002_summaries", "breakpoints": true },
    { "idx": 3, "version": "6", "when": 1750000000003, "tag": "0003_canon_salience", "breakpoints": true }
  ]
}
```

- [ ] **Step 6: Estendi `canon-ledger.ts` con la salienza**

In `packages/memory/src/canon-ledger.ts`:

(a) aggiungi `salience: number` a `CanonFact` (dopo `eventSeq`):
```ts
export interface CanonFact {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  eventSeq: number;
  salience: number;
  status: CanonStatus;
}
```
(b) aggiungi `salience?: number` opzionale a `CanonFactInput` (dopo `eventSeq`) con il commento:
```ts
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
```
(c) in `toFact`, includi `salience` nel parametro `row` e nel ritorno (costruzione esplicita campo per campo):
```ts
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
```
(d) in `record` e nel `tx.insert` di `supersede`, scrivi la salienza con default (spread condizionale-friendly: chiave esplicita dopo lo spread):
```ts
    record(fact) {
      db.insert(canonFacts).values({ ...fact, salience: fact.salience ?? 0, status: 'active' }).run();
    },
```
e dentro `supersede`:
```ts
        tx.insert(canonFacts).values({ ...fact, salience: fact.salience ?? 0, status: 'active' }).run();
```
(Il resto di `canon-ledger.ts` — `buildWhere`, `active`/`all`/`retract`, la `update` di `supersede` — resta invariato.)

- [ ] **Step 7: Esegui test + typecheck**

Run: `pnpm test`
Expected: PASS — **190** test (187 + 3).
Run: `pnpm -C packages/memory typecheck` e `pnpm typecheck`
Expected: nessun errore (engine/shared/memory/ai puliti).

- [ ] **Step 8: Commit**

```bash
git add packages/memory/src/schema.ts packages/memory/migrations/0003_canon_salience.sql packages/memory/migrations/meta/_journal.json packages/memory/src/canon-ledger.ts packages/memory/src/db.test.ts packages/memory/src/canon-ledger.test.ts
git commit -m "feat(memory): salienza su canon_facts (colonna + migrazione 0003)"
```

---

### Task 4: `scoreSalience` (funzione pura) + porta `Clock`

**Files:**
- Create: `packages/memory/src/salience.ts`
- Create: `packages/memory/src/clock.ts`
- Modify: `packages/memory/src/index.ts`
- Test: `packages/memory/src/salience.test.ts`

- [ ] **Step 1: Scrivi i test che falliscono**

`packages/memory/src/salience.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { scoreSalience } from './salience';

describe('scoreSalience', () => {
  it('importanza massima senza ricorrenza da 1', () => {
    expect(scoreSalience({ importance: 10, recurrence: 0 })).toBe(1);
  });

  it('importanza senza ricorrenza scala linearmente', () => {
    expect(scoreSalience({ importance: 5, recurrence: 0 })).toBe(0.5);
    expect(scoreSalience({ importance: 2, recurrence: 0 })).toBe(0.2);
  });

  it('la ricorrenza amplifica la salienza', () => {
    expect(scoreSalience({ importance: 5, recurrence: 2 })).toBe(0.6);
  });

  it('clampa il risultato a 1', () => {
    expect(scoreSalience({ importance: 8, recurrence: 10 })).toBe(1);
  });

  it('clampa importanza e ricorrenza fuori range', () => {
    expect(scoreSalience({ importance: 99, recurrence: 0 })).toBe(1);
    expect(scoreSalience({ importance: -5, recurrence: 0 })).toBe(0.1);
    expect(scoreSalience({ importance: 5, recurrence: -3 })).toBe(0.5);
  });
});
```

- [ ] **Step 2: Esegui i test per vederli fallire**

Run: `pnpm test packages/memory/src/salience.test.ts`
Expected: FAIL — `Cannot find module './salience'`.

- [ ] **Step 3: Implementa `salience.ts` e `clock.ts`**

`packages/memory/src/salience.ts`:
```ts
// Salienza (spec 6.1): importanza x ricorrenza, stile Generative Agents. Funzione PURA:
// l importanza (1..10 dall estrattore) e normalizzata a (0,1]; la ricorrenza (quante volte
// il soggetto compare gia) la amplifica; il risultato e clampato a [0,1]. La RECENCY non e
// qui: e a tempo di lettura (8c), che decade il punteggio in base a `created_at` (Clock).
export interface SalienceInput {
  /** Importanza del ricordo (1..10); valori fuori range vengono clampati. */
  importance: number;
  /** Quante volte il soggetto compare gia (>= 0); valori negativi trattati come 0. */
  recurrence: number;
}

/** Peso della ricorrenza nel boost moltiplicativo. Tarabile (spec 13). */
const RECURRENCE_WEIGHT = 0.1;

/** Punteggio di salienza in [0,1]. Deterministico, arrotondato a 6 decimali per stabilita. */
export function scoreSalience(input: SalienceInput): number {
  const importance = Math.min(10, Math.max(1, input.importance)) / 10;
  const recurrence = Math.max(0, input.recurrence);
  const raw = importance * (1 + RECURRENCE_WEIGHT * recurrence);
  const clamped = Math.min(1, raw);
  return Math.round(clamped * 1e6) / 1e6;
}
```

`packages/memory/src/clock.ts`:
```ts
// Porta Clock: il tempo e iniettato (mai Date.now -> purezza/test stabili, house rule).
// La Reflection lo usa per timbrare `created_at` sui riassunti (riferimento di recency per
// il punteggio a tempo di lettura, Piano 8c). Coerente con il Clock previsto al Piano 9.
export interface Clock {
  /** Tempo corrente in millisecondi dall epoch. */
  now(): number;
}
```

- [ ] **Step 4: Aggiorna il barrel**

In `packages/memory/src/index.ts`, dopo gli export di `summary-store`, aggiungi:
```ts
export { scoreSalience, type SalienceInput } from './salience';
export { type Clock } from './clock';
```

- [ ] **Step 5: Esegui test + typecheck**

Run: `pnpm test`
Expected: PASS — **195** test (190 + 5).
Run: `pnpm -C packages/memory typecheck`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add packages/memory/src/salience.ts packages/memory/src/clock.ts packages/memory/src/salience.test.ts packages/memory/src/index.ts
git commit -m "feat(memory): scoreSalience (importanza x ricorrenza) + porta Clock"
```

---

### Task 5: Pipeline di Reflection (`reflection.ts`)

**Files:**
- Create: `packages/memory/src/reflection.ts`
- Modify: `packages/memory/src/index.ts`
- Test: `packages/memory/src/reflection.test.ts`

- [ ] **Step 1: Scrivi i test che falliscono**

`packages/memory/src/reflection.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { openDatabase, type OpenDb } from './db';
import { createCanonLedger } from './canon-ledger';
import { createSummaryStore } from './summary-store';
import {
  runReflection,
  type ExtractedFact,
  type FactExtractor,
  type SceneSummaryDraft,
  type Summarizer,
  type ReflectionInput,
  type ReflectionDeps,
} from './reflection';
import type { Clock } from './clock';
import type { StoredEvent } from '@loomn/engine';

let open: OpenDb | undefined;
afterEach(() => {
  open?.close();
  open = undefined;
});

function fakeExtractor(facts: ExtractedFact[]): FactExtractor {
  return { extract: (_input: ReflectionInput) => Promise.resolve(facts) };
}
function fakeSummarizer(draft: SceneSummaryDraft): Summarizer {
  return { summarize: (_input: ReflectionInput) => Promise.resolve(draft) };
}
function fixedClock(ms: number): Clock {
  return { now: () => ms };
}

function setup(facts: ExtractedFact[], draft: SceneSummaryDraft, clockMs: number) {
  open = openDatabase(':memory:');
  const ledger = createCanonLedger(open.db);
  const summaries = createSummaryStore(open.db);
  const d: ReflectionDeps = {
    ledger,
    summaries,
    extractor: fakeExtractor(facts),
    summarizer: fakeSummarizer(draft),
    clock: fixedClock(clockMs),
  };
  return { d, ledger, summaries };
}

const events: StoredEvent[] = [
  { seq: 5, event: { type: 'ActorAdded', actor: { id: 'npc1', name: 'Oste', kind: 'npc', attributes: {}, skills: {}, resources: {}, conditions: [], items: [], progression: { xp: 0, level: 1 } } } },
  { seq: 7, event: { type: 'ActorDowned', actorId: 'npc1' } },
];

describe('runReflection', () => {
  it('e un no-op senza eventi', async () => {
    const { d, summaries } = setup([], { text: 't', importance: 5 }, 1000);
    const res = await runReflection(d, { events: [], scope: 'sess1' });
    expect(res).toEqual({ facts: [], summary: null });
    expect(summaries.list()).toEqual([]);
  });

  it('registra i fatti additivi nel ledger con id deterministici e salienza', async () => {
    const facts: ExtractedFact[] = [{ subject: 'pc1', predicate: 'ha_ucciso', object: 'Oste', functional: false, importance: 9 }];
    const { d, ledger } = setup(facts, { text: 'scena', importance: 6 }, 2000);
    const res = await runReflection(d, { events, scope: 'sess1' });
    expect(ledger.active()).toEqual([
      { id: 'f-5-7-0', subject: 'pc1', predicate: 'ha_ucciso', object: 'Oste', eventSeq: 7, salience: 0.9, status: 'active' },
    ]);
    expect(res.facts.map((f) => f.id)).toEqual(['f-5-7-0']);
  });

  it('usa supersede per i fatti funzionali (anti-contraddizione)', async () => {
    const facts: ExtractedFact[] = [{ subject: 'pc1', predicate: 'si_trova_a', object: 'Foresta', functional: true, importance: 4 }];
    const { d, ledger } = setup(facts, { text: 'x', importance: 5 }, 1);
    ledger.record({ id: 'loc0', subject: 'pc1', predicate: 'si_trova_a', object: 'Taverna', eventSeq: 1 });
    await runReflection(d, { events, scope: 'sess1' });
    expect(ledger.active({ subject: 'pc1', predicate: 'si_trova_a' }).map((f) => f.object)).toEqual(['Foresta']);
    expect(ledger.all({ subject: 'pc1', predicate: 'si_trova_a' }).map((f) => ({ id: f.id, status: f.status }))).toEqual([
      { id: 'loc0', status: 'retracted' },
      { id: 'f-5-7-0', status: 'active' },
    ]);
  });

  it('scrive il riassunto di scena in L2 con livello, scope, range e timestamp del Clock', async () => {
    const { d, summaries } = setup([], { text: 'la taverna brucia', importance: 8 }, 4242);
    const res = await runReflection(d, { events, scope: 'sess1' });
    expect(summaries.list()).toEqual([
      { id: 's-scene-5-7', level: 'scene', scope: 'sess1', text: 'la taverna brucia', importance: 8, salience: 0.8, createdAt: 4242, eventSeqFrom: 5, eventSeqTo: 7 },
    ]);
    expect(res.summary?.id).toBe('s-scene-5-7');
  });

  it('la ricorrenza di un soggetto gia presente aumenta la salienza del fatto', async () => {
    const facts: ExtractedFact[] = [{ subject: 'pc1', predicate: 'possiede', object: 'Spada', functional: false, importance: 5 }];
    const { d, ledger } = setup(facts, { text: 'x', importance: 5 }, 1);
    ledger.record({ id: 'pre1', subject: 'pc1', predicate: 'alleato_di', object: 'Re', eventSeq: 1 });
    ledger.record({ id: 'pre2', subject: 'pc1', predicate: 'teme', object: 'Drago', eventSeq: 2 });
    await runReflection(d, { events, scope: 'sess1' });
    expect(ledger.active({ predicate: 'possiede' })[0]?.salience).toBe(0.6);
  });
});
```

> **Nota per l implementer (forma dell evento di test).** `StoredEvent.event` e un `DomainEvent` dell engine; `ActorAdded` richiede un `Actor` completo. La forma sopra (`kind`/`attributes`/`skills`/`resources`/`conditions`/`items`/`progression`) e quella minima che typecheck-a contro `@loomn/engine`. Se il typecheck segnala campi mancanti/extra dell `Actor`, **allinea l oggetto al tipo `Actor` reale** (vedi `packages/engine/src/actor.ts`) — la Reflection usa solo `seq`, quindi i valori interni dell attore sono irrilevanti per la logica.

- [ ] **Step 2: Esegui i test per vederli fallire**

Run: `pnpm test packages/memory/src/reflection.test.ts`
Expected: FAIL — `Cannot find module './reflection'`.

- [ ] **Step 3: Implementa `reflection.ts`**

`packages/memory/src/reflection.ts`:
```ts
// Reflection (spec 6.1): percorso di SCRITTURA della memoria, asincrono e fuori dal turno.
// fine scena -> estrae fatti (FactExtractor) -> Canon Ledger 8a (supersede se funzionale,
// altrimenti record) -> genera riassunto scena (Summarizer) -> L2 -> assegna salienza.
// memory NON dipende da ai: FactExtractor/Summarizer/Clock sono PORTE iniettate; le impl
// LLM-backed (StructuredOutputPort di 7b) vivono nell app (Piano 9), che compone ai+memory.
import type { StoredEvent } from '@loomn/engine';
import type { CanonFact, CanonLedger } from './canon-ledger';
import type { Summary, SummaryStore } from './summary-store';
import type { Clock } from './clock';
import { scoreSalience } from './salience';

/** Un fatto narrativo estratto dalla scena. `functional` = predicato funzionale (es.
 *  si_trova_a): la Reflection usa `supersede` (anti-contraddizione); altrimenti `record`.
 *  La POLITICA di cosa sia funzionale e dell estrattore (informato dal modulo, app-wired). */
export interface ExtractedFact {
  subject: string;
  predicate: string;
  object: string;
  functional: boolean;
  /** Importanza 1..10 (alimenta la salienza). */
  importance: number;
}

/** Bozza di riassunto della scena prodotta dal Summarizer. */
export interface SceneSummaryDraft {
  text: string;
  /** Importanza 1..10 (alimenta la salienza del riassunto). */
  importance: number;
}

export interface ReflectionInput {
  /** Eventi della scena (con seq), in ordine. Se vuoto, la Reflection e un no-op. */
  events: StoredEvent[];
  /** Chiave di raggruppamento del riassunto (es. id sessione). */
  scope: string;
}

/** Porta: estrae fatti discreti dalla scena. Impl LLM-backed iniettata (app). */
export interface FactExtractor {
  extract(input: ReflectionInput): Promise<ExtractedFact[]>;
}

/** Porta: riassume la scena in prosa. Impl LLM-backed iniettata (app). */
export interface Summarizer {
  summarize(input: ReflectionInput): Promise<SceneSummaryDraft>;
}

export interface ReflectionDeps {
  ledger: CanonLedger;
  summaries: SummaryStore;
  extractor: FactExtractor;
  summarizer: Summarizer;
  clock: Clock;
}

export interface ReflectionResult {
  /** Fatti registrati nel Canon Ledger (gia attivi). */
  facts: CanonFact[];
  /** Riassunto di scena registrato in L2, o null se non c erano eventi. */
  summary: Summary | null;
}

/** Esegue la Reflection di una scena. Id deterministici dal range di seq della scena
 *  (`f-<from>-<to>-<i>`, `s-scene-<from>-<to>`) -> precondizione: una sola Reflection per
 *  range (i call site 8a lanciano su id duplicato). Non fa rete: usa le porte iniettate. */
export async function runReflection(deps: ReflectionDeps, input: ReflectionInput): Promise<ReflectionResult> {
  if (input.events.length === 0) {
    return { facts: [], summary: null };
  }
  const seqs = input.events.map((e) => e.seq);
  const from = Math.min(...seqs);
  const to = Math.max(...seqs);

  const extracted = await deps.extractor.extract(input);
  const facts: CanonFact[] = [];
  extracted.forEach((ef, i) => {
    const recurrence = deps.ledger.active({ subject: ef.subject }).length;
    const salience = scoreSalience({ importance: ef.importance, recurrence });
    const factInput = {
      id: `f-${from}-${to}-${i}`,
      subject: ef.subject,
      predicate: ef.predicate,
      object: ef.object,
      eventSeq: to,
      salience,
    };
    if (ef.functional) {
      deps.ledger.supersede(factInput);
    } else {
      deps.ledger.record(factInput);
    }
    facts.push({ ...factInput, status: 'active' });
  });

  const draft = await deps.summarizer.summarize(input);
  const summary: Summary = {
    id: `s-scene-${from}-${to}`,
    level: 'scene',
    scope: input.scope,
    text: draft.text,
    importance: draft.importance,
    salience: scoreSalience({ importance: draft.importance, recurrence: 0 }),
    createdAt: deps.clock.now(),
    eventSeqFrom: from,
    eventSeqTo: to,
  };
  deps.summaries.record(summary);

  return { facts, summary };
}
```

- [ ] **Step 4: Aggiorna il barrel**

In `packages/memory/src/index.ts`, dopo gli export di salience/clock, aggiungi:
```ts
export {
  runReflection,
  type FactExtractor,
  type Summarizer,
  type ExtractedFact,
  type SceneSummaryDraft,
  type ReflectionInput,
  type ReflectionDeps,
  type ReflectionResult,
} from './reflection';
```

- [ ] **Step 5: Esegui test + typecheck**

Run: `pnpm test`
Expected: PASS — **200** test (195 + 5).
Run: `pnpm -C packages/memory typecheck` e `pnpm typecheck`
Expected: nessun errore (engine/shared/memory/ai puliti).

- [ ] **Step 6: Commit**

```bash
git add packages/memory/src/reflection.ts packages/memory/src/reflection.test.ts packages/memory/src/index.ts
git commit -m "feat(memory): pipeline Reflection (fatti -> ledger, riassunto -> L2, salienza)"
```

---

## Fuori ambito (esplicito)

- **Impl LLM-backed di `FactExtractor`/`Summarizer`.** → Piano 9 (app). Usano lo `StructuredOutputPort` di 7b (caso «oggetto strutturato forzato»); implementano le porte di `memory` e vivono nell **app** (l unico punto dove `ai` e `memory` si compongono — nessuno dei due importa l altro). 8b consegna le porte + la pipeline testata coi doppi.
- **Ricomposizione automatica dei livelli superiori L2** (riassumere i riassunti a fine sessione/arco/campagna). Lo store e la colonna `level` la abilitano; e la stessa pipeline su confini piu grossi (Summarizer su riassunti figli) → estensione futura, niente architettura nuova.
- **Recency / decadimento del punteggio a tempo di lettura.** → Piano 8c (Context Assembler): decadra `salience` in base a `created_at` (timbrato qui dal Clock) per il ranking di recupero. 8b memorizza salienza (importanza × ricorrenza) e `created_at`.
- **Provenienza per-fatto piu fine.** Oggi `eventSeq` del fatto = fine scena (`to`). Un `eventSeq` per singolo fatto (campo su `ExtractedFact`) e un raffinamento futuro. YAGNI.
- **Idempotenza/replay del rebuild dallo stream** (spec §6.3: rigenerare L1.5/L2 ri-eseguendo la Reflection). Gli id deterministici per range la rendono possibile, ma la logica di clear+rebuild e fuori ambito (richiede orchestrazione lato app). Precondizione attuale: una sola Reflection per range.
- **`Clock` reale** (basato su tempo di sistema). → Piano 9 (app/Electron): un `Clock` di produzione + il wiring di EventStore + CanonLedger + SummaryStore su **una** connessione condivisa (`openDatabase`).
- **drizzle-kit / `drizzle.config.ts`.** Rimandato (Decisione 9), come 8a: migrazioni scritte a mano; drizzle-kit col churn di schema (con ricostruzione una tantum della baseline).
- **Indici su `summaries`/`canon_facts`.** YAGNI finche le tabelle sono piccole; si aggiungono con dati e misure.
- **`Command`/`Event` engine per gli strumenti rimandati di 7c** (`request_check`/`apply_effect`/`advance_quest`) e **FSM di fase** (spec §5.5). Restano fuori dal Piano 8 salvo decisione esplicita.

## Self-review (svolta sul piano vs spec)

- **Spec §6 «L2 MEMORIA NARRATIVA — riassunti gerarchici: scena → sessione → arco → campagna»** → tabella `summaries` con `level`/`scope`/range + `createSummaryStore`; 8b produce il livello `scene`, la gerarchia e abilitata (Decisione 3). ✓
- **Spec §6.1 «fine scena/sessione → REFLECTION: estrae fatti → Canon Ledger (con validazione anti-contraddizione); genera riassunto → L2; assegna salienza»** → `runReflection`: `FactExtractor` → `record`/`supersede` (anti-contraddizione per i funzionali); `Summarizer` → L2; `scoreSalience`. ✓
- **Spec §6.1 «asincrono, fuori dal turno»** → `runReflection` e `async`, separato da `runMasterTurn` (7c); nessun accoppiamento col turno. ✓
- **Spec §6.1 «Salienza: importanza × ricorrenza/recency, stile Generative Agents»** → `scoreSalience` (importanza × ricorrenza, bounded/tarabile); recency a tempo di lettura via `created_at` (Clock) → 8c. ✓
- **Spec §6.1 «con validazione anti-contraddizione»** → fatti `functional` instradati a `supersede` (8a). ✓
- **Spec §4 «engine puro / niente Date.now»** → tempo via porta `Clock` iniettata; `scoreSalience` pura; la pipeline non usa orologi globali. ✓
- **Spec §4 «Validazione Zod ai confini»** → `level` di `summaries` validato in lettura (`levelSchema`); `status` di `canon_facts` resta validato (8a). ✓
- **Spec §3/§4 «dependency rule ai/memory → engine → shared»** → 8b sta in `memory`, importa solo `@loomn/engine` (tipo `StoredEvent`) + drizzle/zod; NON importa `ai`; l impl LLM-backed e nell app (Decisione 1). ✓
- **Spec §6.3 «tabelle SQLite (Drizzle), rigenerabili dagli eventi»** → proiezioni Drizzle `summaries`/`canon_facts`; provenienza `event_seq`/range pronta per il rebuild (fuori ambito qui). ✓
- **Placeholder scan:** nessun TODO/TBD; ogni step ha codice/comando completo (la nota sull `Actor` di test indica la forma minima e il file di riferimento, non un placeholder). ✓
- **Type consistency:** `Summary`/`SummaryInput`/`SummaryStore`/`SummaryLevel`/`createSummaryStore`; `CanonFact.salience`/`CanonFactInput.salience?`; `SalienceInput`/`scoreSalience`; `Clock`; `FactExtractor`/`Summarizer`/`ExtractedFact`/`SceneSummaryDraft`/`ReflectionInput`/`ReflectionDeps`/`ReflectionResult`/`runReflection` coerenti fra moduli, barrel e test. La pipeline usa `ledger.active`/`record`/`supersede` (8a) e `summaries.record` (Task 2) con le firme reali. ✓
- **Bug-apostrofo:** tutte le stringhe `it()/describe()` in apici singoli sono senza apostrofi (`gia`, `da`, non `c'è`). Grep di verifica: `(it|describe)\('[^']*'[A-Za-zàèéìòù]` → atteso *no matches* (verificato in sandbox). ✓
- **Disciplina di scope:** tutti i task toccano solo file sotto `packages/memory/`; nessuna dipendenza nuova, nessun `package.json`/`tsconfig`/`vitest.config` toccato; niente drizzle-kit. ✓
- **Conteggi test:** 183 → 187 → 190 → 195 → 200 (cumulativi). ✓ (verificati in sandbox: 18 nuovi test verdi + 4 asserzioni 8a aggiornate.)

## Roadmap (Fase 1, aggiornata)

- **Piano 6 — Persistenza** ✅ fatto
- **Piano 7a/7b/7c — Provider Layer / StructuredOutputPort / AI Master pipeline** ✅ fatto
- **Piano 8a — Canon Ledger (L1.5)** ✅ fatto
- **Piano 8b — Reflection + L2 (riassunti) + Salienza** ← *questo* (tabella `summaries`, porte `FactExtractor`/`Summarizer`/`Clock` iniettate, `scoreSalience`)
- **Piano 8c — Context Assembler** (budget di token §6.2; legge L1+L1.5+L2; applica la recency; rimpiazza `assembleContextStub`; iniezione in `runMasterTurn`)
- **Piano 9 — Shell Electron** (main/preload/renderer, sicurezza, IPC tipizzato, **Clock** reale; impl LLM-backed di `FactExtractor`/`Summarizer`; wiring di EventStore + CanonLedger + SummaryStore su una connessione condivisa)
- **Piano 10 — UI Vue** (chat, scheda PG, dadi 3D, journal, provider) (grande, probabile split)
- **Piano 11 — Moduli a tema** (formato dati Zod + import/export + 1 modulo curato; politica dei predicati funzionali via prompt dell estrattore)

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-16-loomn-fase1-piano8b-reflection-l2.md`. Two execution options:**

**1. Subagent-Driven (consigliato)** — nessun Setup orchestratore (niente deps nuove); un subagent fresco per task (model sonnet), spec review + code-quality review per task (sonnet), final review dell intero branch (opus), poi `finishing-a-development-branch` → merge locale in main. **Non far leggere il file di piano al subagent: incolla il testo completo del task + la disciplina di scope.** Branch dedicato `feat/fase1-piano8b-reflection-l2`.

**2. Inline Execution** — esecuzione dei task in questa sessione con `executing-plans`, checkpoint di review fra i batch.

**Quale approccio?**
