# Segmentazione `reflect` per scena — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere `reflect(scope)` incrementale e segmentato per scena (confini `PhaseChanged` di SP4) con un watermark persistito, così che riflessioni ripetute non collidano sugli id deterministici globali (`f-<from>-<to>-<i>`, `s-scene-<from>-<to>`).

**Architecture:** Tre responsabilità isolate in `@loomn/memory` — una funzione pura di segmentazione (`segmentScenes`), uno store-proiezione del watermark (`ReflectionCursor` + tabella `reflection_cursor`, gemello di `canon-ledger`/`summary-store`), e un orchestratore (`runScenesReflection`) che riusa il primitivo single-scene `runReflection` per ogni scena avanzando il cursor **per scena** (crash-safe). `runReflection` subisce un riordino interno behaviour-preserving (entrambe le `await` LLM prima delle scritture → atomicità della scena). `@loomn/host` resta wiring sottile: monta il cursor, lo passa alle deps, aggrega l'array di risultati in `ReflectOutcome` (invariato). Blast radius confinato a `memory`+`host`.

**Tech Stack:** TypeScript strict (monorepo pnpm), Vitest, Drizzle ORM + better-sqlite3, Zod. Spec: `docs/superpowers/specs/2026-06-17-item6-segmentazione-reflect-design.md`. Autorità: `2026-06-15-simulatore-campagne-ai-design.md` (§6/§6.1/§6.2).

**Conteggi test attesi (cumulativi):** baseline **427** → Task 1 **432** → Task 2 **435** → Task 3 **436** → Task 4 **442** → Task 5 **444**.

**Disciplina di scope (house rule §5.1 — in OGNI task):** ogni task modifica SOLO i file elencati. **MAI** toccare `package.json`, `tsconfig*.json`, `vitest.config.ts`; mai creare un tsconfig di root o aggiungere `composite`/project references. `git status --short` prima di ogni commit (deve mostrare solo i file del task). I file si creano con lo strumento **Write** (mai `New-Item -Force`, che tronca). **Bug apostrofo (house rule §5.4):** nelle descrizioni `it('...')`/`describe('...')` in apici singoli NIENTE apostrofi (`l'`, `un'`, `dell'`, `c'è`); le lettere accentate `è/é/à/ì/ò/ù` vanno bene.

**Comandi (dalla root):** singolo file → `pnpm exec vitest run packages/<pkg>/src/<file>.test.ts`; suite intera → `pnpm test`; typecheck → `pnpm -r typecheck`. Se i test SQLite falliscono con `NODE_MODULE_VERSION 146 ... requires 137` → `pnpm -r rebuild better-sqlite3` (HANDOFF §7-quinquies).

---

### Task 1: `segmentScenes` — funzione pura di segmentazione

Spezza una sequenza di eventi (ordinata per seq) in scene ai confini `PhaseChanged`. Pura, zero IO, foglia (come `phase.ts`/`difficulty.ts`).

**Files:**
- Create: `packages/memory/src/scene-segmentation.ts`
- Create: `packages/memory/src/scene-segmentation.test.ts`
- Modify: `packages/memory/src/index.ts` (re-export `segmentScenes`)

- [ ] **Step 1: Scrivi il test che fallisce**

Create `packages/memory/src/scene-segmentation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { StoredEvent } from '@loomn/engine';
import { segmentScenes } from './scene-segmentation';

const added = (seq: number): StoredEvent => ({
  seq,
  event: { type: 'ActorAdded', actor: { id: `a${seq}`, name: `A${seq}`, kind: 'npc', attributes: {}, skills: {}, resources: {}, conditions: [], items: [], progression: { xp: 0, level: 1 } } },
});
const phase = (seq: number): StoredEvent => ({ seq, event: { type: 'PhaseChanged', from: 'exploration', to: 'combat' } });

/** Estrae i seq di ogni scena (per asserire contiguita e non-sovrapposizione). */
function seqs(scenes: StoredEvent[][]): number[][] {
  return scenes.map((s) => s.map((e) => e.seq));
}

describe('segmentScenes', () => {
  it('senza PhaseChanged ritorna una sola scena con tutti gli eventi', () => {
    expect(seqs(segmentScenes([added(1), added(2), added(3)]))).toEqual([[1, 2, 3]]);
  });

  it('un PhaseChanged in mezzo produce due scene contigue e non sovrapposte', () => {
    // Il PhaseChanged TERMINA la scena corrente (e l ultimo evento di quella scena).
    expect(seqs(segmentScenes([added(1), phase(2), added(3)]))).toEqual([[1, 2], [3]]);
  });

  it('un PhaseChanged come ultimo evento non lascia una scena vuota in coda', () => {
    expect(seqs(segmentScenes([added(1), phase(2)]))).toEqual([[1, 2]]);
  });

  it('due PhaseChanged consecutivi danno una scena intermedia mono-evento', () => {
    expect(seqs(segmentScenes([added(1), phase(2), phase(3), added(4)]))).toEqual([[1, 2], [3], [4]]);
  });

  it('una lista vuota ritorna nessuna scena', () => {
    expect(segmentScenes([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisce**

Run: `pnpm exec vitest run packages/memory/src/scene-segmentation.test.ts`
Expected: FAIL (`segmentScenes` non esiste / modulo non trovato).

- [ ] **Step 3: Scrivi l'implementazione minima**

Create `packages/memory/src/scene-segmentation.ts`:

```ts
// Segmentazione per scena (item 6): spezza lo stream ai confini di fase per la Reflection.
// I PhaseChanged (SP4) sono i confini naturali di scena. Funzione PURA (come phase.ts):
// nessun IO, deterministica. Vive in memory perche e un concern del write-path della memoria
// (come raggruppare lo stream per riflettere), non una regola di dominio dell engine.
import type { StoredEvent } from '@loomn/engine';

/** Spezza una sequenza di eventi (in ordine di seq) in scene ai confini PhaseChanged.
 *  Regola: un PhaseChanged TERMINA la scena corrente (e l ultimo evento di quella scena);
 *  l evento successivo apre una scena nuova. La coda dopo l ultimo PhaseChanged (fase non
 *  ancora cambiata) e una scena APERTA e viene comunque restituita (flush, spec item 6 §1).
 *  Niente PhaseChanged -> una sola scena (regge spike/sessione mono-fase). Vuoto -> [].
 *  Le scene risultanti sono contigue e NON sovrapposte (gli id derivati restano unici). */
export function segmentScenes(events: StoredEvent[]): StoredEvent[][] {
  const scenes: StoredEvent[][] = [];
  let current: StoredEvent[] = [];
  for (const e of events) {
    current.push(e);
    if (e.event.type === 'PhaseChanged') {
      scenes.push(current);
      current = [];
    }
  }
  if (current.length > 0) scenes.push(current);
  return scenes;
}
```

- [ ] **Step 4: Esegui il test per verificare che passa**

Run: `pnpm exec vitest run packages/memory/src/scene-segmentation.test.ts`
Expected: PASS (5 test).

- [ ] **Step 5: Re-export dal barrel**

Modify `packages/memory/src/index.ts` — aggiungi dopo la riga `export { type Clock } from './clock';`:

```ts
export { segmentScenes } from './scene-segmentation';
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm -C packages/memory typecheck` (Expected: nessun errore)
Run: `git status --short` (Expected: solo i 3 file del task)

```bash
git add packages/memory/src/scene-segmentation.ts packages/memory/src/scene-segmentation.test.ts packages/memory/src/index.ts
git commit -m "feat(memory): segmentScenes - segmentazione pura per scena ai confini PhaseChanged"
```

---

### Task 2: `ReflectionCursor` — watermark persistito (tabella + store + migrazione)

Store-proiezione del watermark di riflessione, gemello di `createCanonLedger`/`createSummaryStore`. Riga singleton (una sola frontiera di riflessione per stream).

**Files:**
- Modify: `packages/memory/src/schema.ts` (tabella `reflectionCursor`)
- Create: `packages/memory/migrations/0004_reflection_cursor.sql`
- Modify: `packages/memory/migrations/meta/_journal.json` (5ª entry)
- Create: `packages/memory/src/reflection-cursor.ts`
- Create: `packages/memory/src/reflection-cursor.test.ts`
- Modify: `packages/memory/src/index.ts` (re-export)

- [ ] **Step 1: Aggiungi la tabella allo schema Drizzle**

Modify `packages/memory/src/schema.ts` — aggiungi in fondo al file:

```ts
// Watermark di riflessione (item 6): fino a che `seq` lo stream e stato riflesso. Riga
// SINGLETON (id sempre 0): c e una sola frontiera di riflessione per stream (gli id dei
// fatti/summary sono globali, non per-scope). Proiezione memory, NON evento di dominio.
export const reflectionCursor = sqliteTable('reflection_cursor', {
  id: integer('id').primaryKey(),
  reflectedThroughSeq: integer('reflected_through_seq').notNull(),
});
```

- [ ] **Step 2: Scrivi la migrazione a mano**

Create `packages/memory/migrations/0004_reflection_cursor.sql` (crea la tabella e semina la riga singleton a 0 — `--> statement-breakpoint` separa i due statement, come da convenzione `breakpoints:true`):

```sql
CREATE TABLE `reflection_cursor` (
	`id` integer PRIMARY KEY NOT NULL,
	`reflected_through_seq` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `reflection_cursor` (`id`, `reflected_through_seq`) VALUES (0, 0);
```

- [ ] **Step 3: Aggiungi la 5ª entry al journal**

Modify `packages/memory/migrations/meta/_journal.json` — aggiungi una entry all'array `entries` (dopo `0003_canon_salience`), `when` congelato e coerente con la serie:

```json
    { "idx": 4, "version": "6", "when": 1750000000004, "tag": "0004_reflection_cursor", "breakpoints": true }
```

Il risultato finale dell'array `entries` deve essere (verifica la virgola dopo l'entry 3):

```json
  "entries": [
    { "idx": 0, "version": "6", "when": 1750000000000, "tag": "0000_init", "breakpoints": true },
    { "idx": 1, "version": "6", "when": 1750000000001, "tag": "0001_canon_ledger", "breakpoints": true },
    { "idx": 2, "version": "6", "when": 1750000000002, "tag": "0002_summaries", "breakpoints": true },
    { "idx": 3, "version": "6", "when": 1750000000003, "tag": "0003_canon_salience", "breakpoints": true },
    { "idx": 4, "version": "6", "when": 1750000000004, "tag": "0004_reflection_cursor", "breakpoints": true }
  ]
```

- [ ] **Step 4: Scrivi il test che fallisce**

Create `packages/memory/src/reflection-cursor.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { openDatabase, type OpenDb } from './db';
import { createReflectionCursor } from './reflection-cursor';

let open: OpenDb | undefined;
afterEach(() => {
  open?.close();
  open = undefined;
});

describe('createReflectionCursor', () => {
  it('get di default ritorna 0 (riga seminata dalla migrazione)', () => {
    open = openDatabase(':memory:');
    const cursor = createReflectionCursor(open.db);
    expect(cursor.get()).toBe(0);
  });

  it('set poi get ritorna il seq impostato', () => {
    open = openDatabase(':memory:');
    const cursor = createReflectionCursor(open.db);
    cursor.set(7);
    expect(cursor.get()).toBe(7);
  });

  it('set ripetuto avanza il watermark (idempotente sulla riga singleton)', () => {
    open = openDatabase(':memory:');
    const cursor = createReflectionCursor(open.db);
    cursor.set(3);
    cursor.set(9);
    expect(cursor.get()).toBe(9);
  });
});
```

- [ ] **Step 5: Esegui il test per verificare che fallisce**

Run: `pnpm exec vitest run packages/memory/src/reflection-cursor.test.ts`
Expected: FAIL (`createReflectionCursor` non esiste).

- [ ] **Step 6: Scrivi l'implementazione**

Create `packages/memory/src/reflection-cursor.ts`:

```ts
// Watermark di riflessione (item 6): traccia fino a che `seq` lo stream e stato riflesso.
// Proiezione SQLite su `reflection_cursor` (riga singleton id=0, seminata dalla migrazione
// 0004). Gemello di createCanonLedger/createSummaryStore (handle Drizzle condiviso). Una sola
// frontiera per stream: gli id deterministici di fatti/summary sono globali, non per-scope.
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { reflectionCursor } from './schema';

export interface ReflectionCursor {
  /** seq fino a cui lo stream e stato riflesso (0 = niente ancora). */
  get(): number;
  /** Avanza il watermark al seq dato. */
  set(seq: number): void;
}

// La riga singleton ha sempre id 0 (la migrazione 0004 la semina): get/set la mirano.
const CURSOR_ID = 0;

/** Crea il cursor di riflessione su un handle Drizzle gia aperto (vedi `openDatabase`). La
 *  tabella `reflection_cursor` e creata e seminata dalla migrazione 0004. */
export function createReflectionCursor(db: BetterSQLite3Database): ReflectionCursor {
  return {
    get() {
      const row = db.select().from(reflectionCursor).where(eq(reflectionCursor.id, CURSOR_ID)).get();
      return row?.reflectedThroughSeq ?? 0;
    },
    set(seq) {
      db.update(reflectionCursor).set({ reflectedThroughSeq: seq }).where(eq(reflectionCursor.id, CURSOR_ID)).run();
    },
  };
}
```

- [ ] **Step 7: Esegui il test per verificare che passa**

Run: `pnpm exec vitest run packages/memory/src/reflection-cursor.test.ts`
Expected: PASS (3 test). *(Se fallisce con `no such table: reflection_cursor`, la migrazione/journal non sono allineati — ricontrolla Step 2/3.)*

- [ ] **Step 8: Re-export dal barrel**

Modify `packages/memory/src/index.ts` — aggiungi dopo la riga `export { segmentScenes } from './scene-segmentation';`:

```ts
export { createReflectionCursor, type ReflectionCursor } from './reflection-cursor';
```

- [ ] **Step 9: Verifica regressione, typecheck + commit**

Run: `pnpm exec vitest run packages/memory` (Expected: tutti verdi — la migrazione 0004 e additiva, non rompe gli altri test memory)
Run: `pnpm -C packages/memory typecheck` (Expected: nessun errore)
Run: `git status --short` (Expected: solo i 6 file del task)

```bash
git add packages/memory/src/schema.ts packages/memory/migrations/0004_reflection_cursor.sql packages/memory/migrations/meta/_journal.json packages/memory/src/reflection-cursor.ts packages/memory/src/reflection-cursor.test.ts packages/memory/src/index.ts
git commit -m "feat(memory): ReflectionCursor - watermark persistito (tabella reflection_cursor + migrazione 0004)"
```

---

### Task 3: riordino behaviour-preserving di `runReflection` (atomicità della scena)

Sposta entrambe le `await` LLM (`extract`/`summarize`) **prima** di qualunque scrittura. Output identico (lo snapshot di ricorrenza resta calcolato prima delle scritture); chiude la finestra "fatti scritti ma summarizer fallito → collisione su retry". Prerequisito di robustezza per l'avanzamento per-scena del cursor (Task 4).

**Files:**
- Modify: `packages/memory/src/reflection.ts:66-120` (corpo di `runReflection`)
- Modify: `packages/memory/src/reflection.test.ts` (+1 test di atomicità)

- [ ] **Step 1: Scrivi il test che fallisce**

Modify `packages/memory/src/reflection.test.ts` — aggiungi questo test DENTRO il `describe('runReflection', ...)` (prima della `}` di chiusura del describe, riga 110). Usa gli helper `setup`/`events` gia presenti nel file:

```ts
  it('se il summarizer lancia, nessun fatto viene scritto (atomicita della scena)', async () => {
    const facts: ExtractedFact[] = [{ subject: 'pc1', predicate: 'ha_ucciso', object: 'Oste', functional: false, importance: 9 }];
    const { d, ledger } = setup(facts, { text: 'x', importance: 5 }, 1);
    const throwingSummarizer: Summarizer = { summarize: () => Promise.reject(new Error('summarize fallita')) };
    const deps = { ...d, summarizer: throwingSummarizer };
    await expect(runReflection(deps, { events, scope: 'sess1' })).rejects.toThrow('summarize fallita');
    // Atomicita: il summarizer lancia DOPO extract ma PRIMA di scrivere i fatti -> ledger vuoto.
    expect(ledger.active()).toEqual([]);
  });
```

- [ ] **Step 2: Esegui il test per verificare che fallisce**

Run: `pnpm exec vitest run packages/memory/src/reflection.test.ts`
Expected: FAIL sul nuovo test (oggi i fatti vengono scritti PRIMA di `summarize` → `ledger.active()` non e vuoto). I 6 test esistenti restano verdi.

- [ ] **Step 3: Riordina `runReflection`**

Modify `packages/memory/src/reflection.ts` — sostituisci il corpo della funzione `runReflection` (righe 66-120) con questa versione (entrambe le `await` prima delle scritture; tutto il resto invariato):

```ts
export async function runReflection(deps: ReflectionDeps, input: ReflectionInput): Promise<ReflectionResult> {
  if (input.events.length === 0) {
    return { facts: [], summary: null };
  }
  const seqs = input.events.map((e) => e.seq);
  const from = Math.min(...seqs);
  const to = Math.max(...seqs);

  // Entrambe le chiamate LLM PRIMA di qualunque scrittura: la scena diventa ATOMICA contro un
  // fallimento di extract/summarize (niente fatti scritti senza summary -> niente collisione su
  // un retry, item 6). L output e identico: lo snapshot di ricorrenza resta calcolato sul ledger
  // PRIMA delle scritture di questa scena.
  const extracted = await deps.extractor.extract(input);
  const draft = await deps.summarizer.summarize(input);

  // Ricorrenza = fatti attivi del soggetto PRIMA di questa Reflection, presa come SNAPSHOT
  // (un solo conteggio per soggetto, prima di ogni scrittura): cosi piu fatti dello stesso
  // soggetto nello stesso batch condividono la stessa baseline e la salienza NON dipende
  // dall ordine nel batch (coerente con la purezza/determinismo del progetto).
  const recurrenceBySubject = new Map<string, number>();
  for (const ef of extracted) {
    if (!recurrenceBySubject.has(ef.subject)) {
      recurrenceBySubject.set(ef.subject, deps.ledger.active({ subject: ef.subject }).length);
    }
  }
  const facts: CanonFact[] = [];
  extracted.forEach((ef, i) => {
    const recurrence = recurrenceBySubject.get(ef.subject) ?? 0;
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

- [ ] **Step 4: Esegui i test per verificare che passano**

Run: `pnpm exec vitest run packages/memory/src/reflection.test.ts`
Expected: PASS (7 test: 6 esistenti behaviour-preserving + il nuovo di atomicità).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm -C packages/memory typecheck` (Expected: nessun errore)
Run: `git status --short` (Expected: solo `reflection.ts` e `reflection.test.ts`)

```bash
git add packages/memory/src/reflection.ts packages/memory/src/reflection.test.ts
git commit -m "refactor(memory): runReflection - await LLM prima delle scritture (atomicita scena)"
```

---

### Task 4: `runScenesReflection` — orchestratore incrementale per scena

Riflette tutte le scene non ancora riflesse (`seq > cursor`), segmentate ai confini di fase, riusando `runReflection` per scena e avanzando il cursor **dopo ogni scena** (crash-safety).

**Files:**
- Modify: `packages/memory/src/reflection.ts` (aggiunge import, `ScenesReflectionDeps`, `runScenesReflection`)
- Modify: `packages/memory/src/reflection.test.ts` (+6 test, nuovo `describe`)
- Modify: `packages/memory/src/index.ts` (re-export)

- [ ] **Step 1: Scrivi i test che falliscono**

Modify `packages/memory/src/reflection.test.ts` — (a) aggiungi `runScenesReflection` e `ScenesReflectionDeps` all'import da `./reflection` in cima al file:

```ts
import {
  runReflection,
  runScenesReflection,
  type ExtractedFact,
  type FactExtractor,
  type SceneSummaryDraft,
  type Summarizer,
  type ReflectionInput,
  type ReflectionDeps,
  type ScenesReflectionDeps,
} from './reflection';
```

(b) Aggiungi in fondo al file (dopo la chiusura del `describe('runReflection', ...)`) questo nuovo blocco. Definisce un fake cursor in-memory e gli helper per costruire eventi; riusa `setup`/`fakeExtractor`/`fakeSummarizer`/`fixedClock` gia nel file:

```ts
import type { ReflectionCursor } from './reflection-cursor';
import type { StoredEvent as SE } from '@loomn/engine';

function fakeCursor(initial = 0): ReflectionCursor {
  let seq = initial;
  return { get: () => seq, set: (s) => { seq = s; } };
}
const added = (seq: number): SE => ({
  seq,
  event: { type: 'ActorAdded', actor: { id: `a${seq}`, name: `A${seq}`, kind: 'npc', attributes: {}, skills: {}, resources: {}, conditions: [], items: [], progression: { xp: 0, level: 1 } } },
});
const phaseEv = (seq: number): SE => ({ seq, event: { type: 'PhaseChanged', from: 'exploration', to: 'combat' } });

describe('runScenesReflection', () => {
  it('riflessioni ripetute su scene successive non collidono sugli id deterministici', async () => {
    const facts: ExtractedFact[] = [{ subject: 'pc1', predicate: 'incontra', object: 'Oste', functional: false, importance: 5 }];
    const { d, summaries } = setup(facts, { text: 'scena', importance: 5 }, 1);
    const cursor = fakeCursor();
    const deps: ScenesReflectionDeps = { ...d, cursor };
    // 1a chiamata: eventi 1..3 con un PhaseChanged@2 -> due scene [1,2] e [3].
    await runScenesReflection(deps, { events: [added(1), phaseEv(2), added(3)], scope: 'sess1' });
    // 2a chiamata: stream cresciuto (4,5 con PhaseChanged@5) -> solo la scena nuova [4,5].
    await runScenesReflection(deps, { events: [added(1), phaseEv(2), added(3), added(4), phaseEv(5)], scope: 'sess1' });
    // Nessun throw (niente UNIQUE constraint): summary con range disgiunti.
    expect(summaries.list().map((s) => s.id)).toEqual(['s-scene-1-2', 's-scene-3-3', 's-scene-4-5']);
    expect(cursor.get()).toBe(5);
  });

  it('un PhaseChanged segmenta lo stream in due scene riflesse separatamente', async () => {
    const facts: ExtractedFact[] = [{ subject: 'pc1', predicate: 'vede', object: 'Oste', functional: false, importance: 5 }];
    const { d, ledger } = setup(facts, { text: 'scena', importance: 5 }, 1);
    const deps: ScenesReflectionDeps = { ...d, cursor: fakeCursor() };
    const results = await runScenesReflection(deps, { events: [added(1), phaseEv(2), added(3)], scope: 'sess1' });
    expect(results).toHaveLength(2);
    expect(ledger.active().map((f) => f.id)).toEqual(['f-1-2-0', 'f-3-3-0']);
  });

  it('la scena aperta viene riflessa (flush) e una seconda chiamata non collide', async () => {
    const facts: ExtractedFact[] = [{ subject: 'pc1', predicate: 'esplora', object: 'Bosco', functional: false, importance: 4 }];
    const { d, summaries } = setup(facts, { text: 'scena', importance: 4 }, 1);
    const cursor = fakeCursor();
    const deps: ScenesReflectionDeps = { ...d, cursor };
    // Nessun PhaseChanged: una sola scena aperta [1,2] -> flush.
    await runScenesReflection(deps, { events: [added(1), added(2)], scope: 'sess1' });
    // Cresce ancora (sempre senza PhaseChanged): la seconda scena aperta e [3].
    await runScenesReflection(deps, { events: [added(1), added(2), added(3)], scope: 'sess1' });
    expect(summaries.list().map((s) => s.id)).toEqual(['s-scene-1-2', 's-scene-3-3']);
    expect(cursor.get()).toBe(3);
  });

  it('senza eventi nuovi e un no-op e non avanza il cursor', async () => {
    const facts: ExtractedFact[] = [{ subject: 'pc1', predicate: 'vede', object: 'Oste', functional: false, importance: 5 }];
    const { d, summaries } = setup(facts, { text: 'scena', importance: 5 }, 1);
    const cursor = fakeCursor(3); // gia riflesso fino a 3
    const deps: ScenesReflectionDeps = { ...d, cursor };
    const results = await runScenesReflection(deps, { events: [added(1), added(2), added(3)], scope: 'sess1' });
    expect(results).toEqual([]);
    expect(summaries.list()).toEqual([]);
    expect(cursor.get()).toBe(3);
  });

  it('il cursor avanza per scena: un fallimento a meta lascia le scene committate e riprende senza collidere', async () => {
    const facts: ExtractedFact[] = [{ subject: 'pc1', predicate: 'agisce', object: 'X', functional: false, importance: 5 }];
    const { d, summaries } = setup(facts, { text: 'scena', importance: 5 }, 1);
    const cursor = fakeCursor();
    // Summarizer che lancia SOLO alla seconda chiamata (la 2a scena del primo pass).
    let calls = 0;
    const flaky: Summarizer = {
      summarize: (input) => {
        calls += 1;
        if (calls === 2) return Promise.reject(new Error('summarize fallita'));
        return Promise.resolve({ text: 'scena', importance: 5 });
      },
    };
    const deps: ScenesReflectionDeps = { ...d, summarizer: flaky, cursor };
    // Pass 1: scene [1,2] e [3]; la 2a (scena [3]) fallisce.
    await expect(runScenesReflection(deps, { events: [added(1), phaseEv(2), added(3)], scope: 'sess1' })).rejects.toThrow('summarize fallita');
    // La 1a scena e committata, il cursor e avanzato fino al suo ultimo seq (2).
    expect(summaries.list().map((s) => s.id)).toEqual(['s-scene-1-2']);
    expect(cursor.get()).toBe(2);
    // Retry: ora summarize non lancia piu -> riflette SOLO la scena [3], niente collisione.
    await runScenesReflection(deps, { events: [added(1), phaseEv(2), added(3)], scope: 'sess1' });
    expect(summaries.list().map((s) => s.id)).toEqual(['s-scene-1-2', 's-scene-3-3']);
    expect(cursor.get()).toBe(3);
  });

  it('la ricorrenza cross-scena alza la salienza del fatto ripetuto', async () => {
    const facts: ExtractedFact[] = [{ subject: 'pc1', predicate: 'possiede', object: 'Spada', functional: false, importance: 5 }];
    const { d, ledger } = setup(facts, { text: 'scena', importance: 5 }, 1);
    const deps: ScenesReflectionDeps = { ...d, cursor: fakeCursor() };
    // Due scene (PhaseChanged@2): lo stesso fatto ricorre -> la 2a scena vede la 1a nel ledger.
    await runScenesReflection(deps, { events: [added(1), phaseEv(2), added(3)], scope: 'sess1' });
    const sal = ledger.active().map((f) => f.salience);
    expect(sal).toHaveLength(2);
    expect(sal[1]!).toBeGreaterThan(sal[0]!); // recurrence 1 > recurrence 0
  });
});
```

- [ ] **Step 2: Esegui i test per verificare che falliscono**

Run: `pnpm exec vitest run packages/memory/src/reflection.test.ts`
Expected: FAIL (`runScenesReflection`/`ScenesReflectionDeps` non esistono).

- [ ] **Step 3: Implementa l'orchestratore**

Modify `packages/memory/src/reflection.ts` — (a) aggiungi gli import in cima al file (dopo gli import esistenti):

```ts
import { segmentScenes } from './scene-segmentation';
import type { ReflectionCursor } from './reflection-cursor';
```

(b) Aggiungi in fondo al file (dopo `runReflection`):

```ts
/** Deps della riflessione multi-scena: le ReflectionDeps single-scene + il cursor (watermark).
 *  runReflection accetta comunque queste deps piu larghe (ignora `cursor`). */
export interface ScenesReflectionDeps extends ReflectionDeps {
  cursor: ReflectionCursor;
}

/** Riflette tutte le scene non ancora riflesse (seq > cursor), segmentate ai confini PhaseChanged
 *  (item 6). Riusa runReflection per ogni scena (range [from,to] per-scena -> id globalmente unici
 *  -> niente collisione su chiamate ripetute). Avanza il cursor DOPO ogni scena riuscita: un
 *  fallimento a meta lascia il cursor all ultima scena committata, cosi il retry riprende da li
 *  senza ri-riflettere ne collidere. La coda aperta (oltre l ultimo PhaseChanged) viene riflessa
 *  (flush). Nessun evento nuovo -> []. */
export async function runScenesReflection(
  deps: ScenesReflectionDeps,
  input: ReflectionInput,
): Promise<ReflectionResult[]> {
  const through = deps.cursor.get();
  const fresh = input.events.filter((e) => e.seq > through);
  const scenes = segmentScenes(fresh);
  const results: ReflectionResult[] = [];
  for (const scene of scenes) {
    const res = await runReflection(deps, { events: scene, scope: input.scope });
    results.push(res);
    const lastSeq = scene[scene.length - 1]?.seq;
    if (lastSeq !== undefined) deps.cursor.set(lastSeq); // avanza per scena (crash-safe)
  }
  return results;
}
```

- [ ] **Step 4: Esegui i test per verificare che passano**

Run: `pnpm exec vitest run packages/memory/src/reflection.test.ts`
Expected: PASS (13 test: 7 di `runReflection` + 6 di `runScenesReflection`).

- [ ] **Step 5: Re-export dal barrel**

Modify `packages/memory/src/index.ts` — nel blocco `export { ... } from './reflection';` aggiungi `runScenesReflection` e `type ScenesReflectionDeps`:

```ts
export {
  runReflection,
  runScenesReflection,
  type FactExtractor,
  type Summarizer,
  type ExtractedFact,
  type SceneSummaryDraft,
  type ReflectionInput,
  type ReflectionDeps,
  type ReflectionResult,
  type ScenesReflectionDeps,
} from './reflection';
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm -C packages/memory typecheck` (Expected: nessun errore)
Run: `git status --short` (Expected: solo `reflection.ts`, `reflection.test.ts`, `index.ts`)

```bash
git add packages/memory/src/reflection.ts packages/memory/src/reflection.test.ts packages/memory/src/index.ts
git commit -m "feat(memory): runScenesReflection - reflect incrementale per scena, cursor crash-safe"
```

---

### Task 5: wiring `@loomn/host` — monta il cursor e rendi `reflect` segmentato

`MemorySystem` espone `cursor`; `reflectionDepsFor` lo include; `campaign-service.reflect` usa `runScenesReflection` e aggrega in `ReflectOutcome` (invariato → IPC/UI intatti).

**Files:**
- Modify: `packages/host/src/memory-system.ts` (monta `createReflectionCursor`, aggiunge `cursor` a `MemorySystem`)
- Modify: `packages/host/src/memory-system.test.ts` (+1 test del cursor)
- Modify: `packages/host/src/reflection-ports.ts` (aggiunge `cursor` alle deps, ritorna `ScenesReflectionDeps`)
- Modify: `packages/host/src/reflection-ports.test.ts` (rafforza il test `reflectionDepsFor` con il cursor)
- Modify: `packages/host/src/campaign-service.ts` (usa `runScenesReflection`, aggrega)
- Modify: `packages/host/src/campaign-service.test.ts` (+1 test no-collisione)

- [ ] **Step 1: Scrivi i test che falliscono**

(a) Modify `packages/host/src/memory-system.test.ts` — aggiungi questo test dentro `describe('createMemorySystem - connessione condivisa', ...)`:

```ts
  it('il cursor di riflessione e montato sulla connessione condivisa (default 0, persiste il set)', () => {
    const sys = createMemorySystem(':memory:', { clock: { now: () => 1000 } });
    try {
      expect(sys.cursor.get()).toBe(0);
      sys.cursor.set(5);
      expect(sys.cursor.get()).toBe(5);
    } finally {
      sys.close();
    }
  });
```

(b) Modify `packages/host/src/reflection-ports.test.ts` — nel test `reflectionDepsFor` (`compone ledger, summaries e clock...`) aggiungi un'asserzione sul cursor dopo `expect(deps.clock).toBe(sys.clock);`:

```ts
      expect(deps.cursor).toBe(sys.cursor);
```

(c) Modify `packages/host/src/campaign-service.test.ts` — aggiungi questo test dentro `describe('createCampaignService - reflect e serializzazione', ...)`. Usa un `port` che ritorna un fatto e un riassunto a ogni chiamata; tra le due `reflect` aggiunge eventi con un cambio di fase reale (`start_encounter` via tool nel turno emette `EncounterStarted`+`PhaseChanged`):

```ts
  it('reflect chiamato due volte con eventi aggiunti in mezzo non collide (segmentazione per scena)', async () => {
    const port: StructuredOutputPort = {
      generate: async <T>(request: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> => {
        if (request.schemaName === 'extract_facts') {
          const value = { facts: [{ subject: 'Goblin', predicate: 'minaccia', object: 'il villaggio', functional: false, importance: 6 }] };
          return { value: value as T, strategy: 'function-call' };
        }
        const draft = { text: 'Il goblin minaccia il villaggio.', importance: 6 };
        return { value: draft as T, strategy: 'function-call' };
      },
    };
    const { service, memory } = makeService({ structured: port });
    try {
      await service.dispatch({ type: 'AddActor', actor: actor('goblin', 'Goblin') });
      const first = await service.reflect('sess-1');
      expect(first.factCount).toBe(1);
      expect(first.summarized).toBe(true);
      // Aggiunge altri eventi tra le due reflect (incluso un PhaseChanged via start_encounter).
      await service.dispatch({ type: 'StartEncounter', encounter: { id: 'enc1', participants: [{ actorId: 'goblin', zone: 'z1', initiative: 10 }] } });
      // Seconda reflect: NON deve lanciare (UNIQUE constraint) e riflette solo gli eventi nuovi.
      const second = await service.reflect('sess-1');
      expect(second.summarized).toBe(true);
      expect(memory.eventStore.version()).toBeGreaterThan(1);
    } finally {
      memory.close();
    }
  });
```

- [ ] **Step 2: Esegui i test per verificare che falliscono**

Run: `pnpm exec vitest run packages/host/src/memory-system.test.ts packages/host/src/reflection-ports.test.ts packages/host/src/campaign-service.test.ts`
Expected: FAIL (`sys.cursor`/`deps.cursor` non esistono; la seconda `reflect` collide con `UNIQUE constraint failed`).

- [ ] **Step 3: Monta il cursor nel MemorySystem**

Modify `packages/host/src/memory-system.ts`:

(a) nell'import da `@loomn/memory`, aggiungi `createReflectionCursor` e `type ReflectionCursor`:

```ts
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
```

(b) nell'interfaccia `MemorySystem`, aggiungi il campo `cursor` (dopo `summaries`):

```ts
  /** Summary Store L2 sulla connessione condivisa. */
  summaries: SummaryStore;
  /** Watermark di riflessione (item 6) sulla connessione condivisa. */
  cursor: ReflectionCursor;
```

(c) in `createMemorySystem`, monta il cursor e aggiungilo al return:

```ts
  const summaries = createSummaryStore(db);
  const cursor = createReflectionCursor(db);
```

```ts
  return { eventStore, ledger, summaries, cursor, clock, assembleContext, close };
```

- [ ] **Step 4: Includi il cursor nelle ReflectionDeps**

Modify `packages/host/src/reflection-ports.ts`:

(a) nell'import dei tipi da `@loomn/memory`, aggiungi `type ScenesReflectionDeps` (e rimuovi `ReflectionDeps` dall'uso del return se preferisci — qui ampliamo il tipo di ritorno):

```ts
import type {
  FactExtractor,
  Summarizer,
  ReflectionInput,
  ExtractedFact,
  SceneSummaryDraft,
  ScenesReflectionDeps,
} from '@loomn/memory';
```

(b) cambia `reflectionDepsFor` per ritornare `ScenesReflectionDeps` includendo il cursor:

```ts
export function reflectionDepsFor(system: MemorySystem, port: StructuredOutputPort): ScenesReflectionDeps {
  return {
    ledger: system.ledger,
    summaries: system.summaries,
    extractor: createLlmFactExtractor(port),
    summarizer: createLlmSummarizer(port),
    clock: system.clock,
    cursor: system.cursor,
  };
}
```

- [ ] **Step 5: Rendi `reflect` segmentato in campaign-service**

Modify `packages/host/src/campaign-service.ts`:

(a) cambia l'import da `@loomn/memory`:

```ts
import { runScenesReflection } from '@loomn/memory';
```

(b) sostituisci il corpo del metodo `reflect` (righe 142-151) con la versione segmentata + aggregazione:

```ts
    reflect(scope: string): Promise<ReflectOutcome> {
      return enqueue(async () => {
        const stored = deps.memory.eventStore.load();
        const results = await runScenesReflection(reflectionDepsFor(deps.memory, deps.structured), {
          events: stored,
          scope,
        });
        const factCount = results.reduce((n, r) => n + r.facts.length, 0);
        const summarized = results.some((r) => r.summary !== null);
        return { factCount, summarized };
      });
    },
```

- [ ] **Step 6: Esegui i test del task per verificare che passano**

Run: `pnpm exec vitest run packages/host/src/memory-system.test.ts packages/host/src/reflection-ports.test.ts packages/host/src/campaign-service.test.ts`
Expected: PASS (memory-system 5, reflection-ports 8, campaign-service 16 → tutti verdi; la seconda `reflect` non lancia piu).

- [ ] **Step 7: Suite intera + typecheck + commit**

Run: `pnpm test` (Expected: **444** verdi)
Run: `pnpm -r typecheck` (Expected: pulito, 6 progetti)
Run: `git status --short` (Expected: solo i 6 file del task)

```bash
git add packages/host/src/memory-system.ts packages/host/src/memory-system.test.ts packages/host/src/reflection-ports.ts packages/host/src/reflection-ports.test.ts packages/host/src/campaign-service.ts packages/host/src/campaign-service.test.ts
git commit -m "feat(host): reflect segmentato per scena (cursor montato, runScenesReflection, esito aggregato)"
```

---

## Self-review (orchestratore — prima di eseguire)

**Copertura spec (`2026-06-17-item6-segmentazione-reflect-design.md`):**
- §1 comportamento incrementale + flush scena aperta → Task 4 (`runScenesReflection`, filtro `seq>cursor`, segmentazione, scena aperta inclusa). ✓
- §2 cursor esplicito singleton → Task 2 (tabella + store). ✓
- §3 layering (watermark in proiezione, non evento; niente entità Scene; blast radius memory+host, `ReflectOutcome` invariato) → Task 2 (proiezione) + Task 5 (`{factCount, summarized}` invariato, IPC non toccato). ✓
- §4.1 `segmentScenes` puro → Task 1. ✓
- §4.2 `ReflectionCursor` store → Task 2. ✓
- §4.3 schema + migrazione 0004 + journal → Task 2. ✓
- §4.4 reorder `runReflection` + `runScenesReflection` cursor per scena → Task 3 + Task 4. ✓
- §5 wiring host → Task 5. ✓
- §7 strategia di test (segmentazione isolata, cursor, acceptance no-collisione, flush, no-op, crash-safety, ricorrenza cross-scena, giro host reale) → coperta tra Task 1/2/3/4/5. ✓
- §9 acceptance → il test centrale di Task 4 (no-collisione) + il test host di Task 5 (giro reale) + crash-safety di Task 4. ✓

**Placeholder scan:** nessun TBD/TODO; ogni step ha codice completo e comandi con output atteso. ✓

**Consistenza dei tipi/nomi:** `segmentScenes(events: StoredEvent[]): StoredEvent[][]` (T1) usato in T4; `ReflectionCursor {get/set}` (T2) usato in T4/T5; `ScenesReflectionDeps extends ReflectionDeps {cursor}` (T4) usato in T5 (`reflectionDepsFor` return type); `runScenesReflection(deps, input): Promise<ReflectionResult[]>` (T4) consumato in T5 con `.reduce`/`.some`; `MemorySystem.cursor` (T5) ↔ `system.cursor` in `reflectionDepsFor` (T5). `reflectionCursor` (tabella Drizzle) resta interna a `schema.ts` (NON nel barrel, coerente con `canonFacts`/`summaries`). Nomi coerenti. ✓
- **Bug apostrofo:** verificato — nessuna descrizione `it/describe` contiene apostrofi (grep di verifica sotto). ✓

**Anti-ripple (suite verde a ogni task):** T1/T2/T3/T4 sono additivi o behaviour-preserving (i 6 test di `runReflection` restano verdi al reorder; la migrazione 0004 è additiva). T5 cambia `reflect` ma gli scenari dei test reflect esistenti (stream senza/con eventi, range da seq 1) producono id identici → restano verdi; il nuovo test valida la non-collisione. Nessun ripple cross-package non confinato. ✓

## Fuori ambito (dal §6 dello spec — NON implementare)
Atomicità intra-scena oltre il reorder LLM (transazione DB per scena); filtro semantico delle scene meccaniche; rollup L2; `sceneCount` nell'esito/IPC; re-nudge prompt per-iterazione. Tutti deferral dichiarati.

## Roadmap
Item 6 è l'**ULTIMO** del backlog pre-Piano 10 (HANDOFF §0-quinquies). A merge fatto → backlog pre-Piano 10 **CHIUSO** → **Piano 10 (UI, design-first)**. Pianificata anche la feature core Inventario & Equipaggiamento (§8, design-first all'apertura).

## Execution handoff
Flusso §4: branch `feat/item6-segmentazione-reflect` → subagent-driven (implementer + spec-review + code-quality-review per task; final review opus del branch) → `finishing-a-development-branch` (merge ff locale, `pnpm test` verde, branch cancellato) → aggiorna HANDOFF (nuovo §0-…) + memoria + indice MEMORY.md.
