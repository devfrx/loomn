# Context Assembler (Piano 8c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire lo `assembleContextStub` di 7c con un vero **Context Assembler** (spec §6.2): un allocatore che assembla il contesto del Master entro un **budget di token**, leggendo L1 (GameState/engine) + L1.5 (`canon_facts`, 8a) + L2 (`summaries`, 8b), con **degrado controllato** (priorità alte → basse, si taglia dal basso, mai L1/L1.5), e **iniettato** in `runMasterTurn`.

**Architecture:** Il Context Assembler vive in **`@loomn/memory`** (`packages/memory/src/context-assembler.ts`): legge i propri store L1.5/L2 e il `GameState`/L1 da `@loomn/engine`; **NON importa `ai`**. È una factory `createContextAssembler(deps, config)` che restituisce una funzione **pura** `(state: GameState) => string`. `@loomn/ai` definisce un **tipo funzione di iniezione** `AssembleContext = (state: GameState) => string` e lo accetta come campo opzionale di `MasterTurnRequest`, con default `assembleContextStub` (invariato). L'app (Piano 9) compone i due pacchetti **solo via iniezione** (`memory` e `ai` non si importano a vicenda). La **recency** è applicata a tempo di lettura sul `summaries.created_at` (timbrato da 8b via la porta `Clock`), con decadimento stile Generative Agents; la **salienza** è la colonna già scritta da 8b (read-time: `salience × recency`). Il **token budget** usa un'euristica `char/4` di default, sostituibile con un tokenizer reale tramite una porta iniettabile.

**Tech Stack:** TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), Vitest, `@loomn/engine` (GameState/L1), `@loomn/memory` (CanonLedger 8a, SummaryStore 8b, scoreSalience/Clock), `@loomn/ai` (runMasterTurn 7c). Nessuna nuova dipendenza, **nessun tocco allo schema/migrazioni**.

---

## Contesto per chi implementa (leggere prima)

- **Spec di riferimento:** `docs/superpowers/specs/2026-06-15-simulatore-campagne-ai-design.md` §6.2 (Context Assembler con budget di token), §6 (memoria a strati L1/L1.5/L2), §6.1 (salienza). Priorità §6.2 (alto→basso, si taglia dal basso): `1. ruolo/regole/fase (fisso)` · `2. L1 stato rilevante` · `3. L1.5 canon rilevante` · `4. L2 narrativa recente` · `5. L3 [Fase 2]` · `6. azione del giocatore (fisso)`. Oltre budget si tagliano prima i ricordi a salienza minore; **MAI L1/L1.5**.
- **API che 8c consuma (già in `main`, non modificarle):**
  - `@loomn/engine`: `GameState { version, actors: Record<string, Actor>, encounter: Encounter | null }`; `Actor { id, name, kind, resources: Record<string, ResourcePool>, ... }`; `ResourcePool { current, max }`; `Encounter { id, round, turnIndex, ... }`.
  - `@loomn/memory` (`packages/memory/src/`): `CanonLedger.active(filter?): CanonFact[]` (`canon-ledger.ts`) con `CanonFact { id, subject, predicate, object, eventSeq, salience, status }`; `SummaryStore.list(filter?): Summary[]` (`summary-store.ts`) con `Summary { id, level, scope, text, importance, salience, createdAt, eventSeqFrom, eventSeqTo }`; porta `Clock { now(): number }` (`clock.ts`); `openDatabase(':memory:')` (`db.ts`) applica le migrazioni e crea `canon_facts`+`summaries`.
  - `@loomn/ai` (`packages/ai/src/master-turn.ts`): `runMasterTurn(request)`, `assembleContextStub(state)`, `buildMasterMessages(context, playerAction)` → `[system(SYSTEM_PROMPT), system(context), user(playerAction)]`.
- **Mappatura priorità → implementazione 8c:** priorità 1 (ruolo/regole) e 6 (azione del giocatore) **restano fuori dall'assembler** (sono i messaggi fissi costruiti da `buildMasterMessages` in `ai`). La **fase** (FSM §5.5) NON esiste ancora → resta parte del blocco ruolo/regole (system prompt) e NON è toccata qui (vedi *Fuori ambito*). L'assembler produce il **blocco di contesto** = L1 (priorità 2) + L1.5 (priorità 3) + L2 (priorità 4). Solo L2 viene tagliata dal budget; L1/L1.5 mai.

## Decisioni di confine (prese scrivendo il piano, verificate empiricamente in sandbox)

1. **Dove vive l'assembler:** in `memory` (legge i propri store + GameState da engine; non importa `ai`). L'app lo costruirà e lo inietterà (Piano 9).
2. **Punto di iniezione:** un **tipo funzione** `AssembleContext = (state: GameState) => string` in `ai`, accettato come campo opzionale `assembleContext?` di `MasterTurnRequest`, default `assembleContextStub`. La firma `(state) => string` coincide con quella dello stub di 7c → cambio minimo, retro-compatibile, e l'assembler di `memory` è **strutturalmente assegnabile** (compatibilità verificata: entrambi i pacchetti riferiscono lo stesso `GameState` di `@loomn/engine`). L'azione del giocatore NON è passata all'assembler (la *relevance* query-dependent è L3/RAG, **Fase 2**); resta il messaggio utente separato.
3. **Stima dei token:** porta iniettabile `estimateTokens?: (text: string) => number`, default euristica `char/4` (`Math.ceil(len/4)`). Mantiene `memory` senza dipendenze da tokenizer e l'output deterministico; l'app potrà iniettare un tokenizer reale. Il budget governa l'inclusione di L2 ed è **approssimato a livello di separatori** (il costo è stimato per blocco/riga, non sull'esatta stringa concatenata): sufficiente per un degrado graduale.
4. **Recency a tempo di lettura:** decadimento sul `summaries.createdAt` con `recency = decay^(ore trascorse)` (stile Generative Agents, `decay` default 0.995, tarabile, spec §13). Il "now" arriva dalla porta **`Clock`** iniettata (mai `Date.now`). Età negativa (createdAt nel futuro / clock di test) → trattata come 0 → peso 1. Il ranking di L2 è `salience × recency` (la salienza è la colonna scritta da 8b; **non** ricalcolata).
5. **Cosa si legge per la scena:** L1 = `GameState` reso in prosa (attori presenti + scontro). L1.5 = `ledger.active()` filtrato ai **soggetti in scena** (`{id, name}` di ogni attore presente) → "fatti su scena/PNG presenti, non tutto il mondo". L2 = `summaries.list()` rankato per `salience × recency`, incluso dal punteggio più alto finché c'è budget; al primo riassunto che non entra ci si ferma (**si taglia dal basso**, priorità stretta).
6. **Strumenti rimandati di 7c + FSM di fase:** **fuori ambito** (vedi sotto). 8c resta focalizzato sul percorso di lettura. **Niente split:** 8c è un'unica feature coesa in 4 task bite-sized.

## Struttura dei file

| File | Responsabilità | Task |
|---|---|---|
| `packages/ai/src/master-turn.ts` (modifica) | Tipo `AssembleContext`; campo `assembleContext?` in `MasterTurnRequest`; uso `request.assembleContext ?? assembleContextStub` | 1 |
| `packages/ai/src/master-turn.test.ts` (modifica) | Test del punto di iniezione (iniettato vs default) | 1 |
| `packages/memory/src/context-assembler.ts` (nuovo) | Helper puri (`defaultEstimateTokens`, `recencyWeight`) → poi `createContextAssembler` + tipi + render privati | 2, 3 |
| `packages/memory/src/context-assembler.test.ts` (nuovo) | Test helper (2) + test factory su sqlite reale (3) | 2, 3 |
| `packages/memory/src/index.ts` (modifica) | Export pubblico dell'assembler + tipi; test di compatibilità con il punto di iniezione | 4 |

**Disciplina di scope (CRITICA, in ogni task):** ogni task modifica **SOLO** i file elencati nel task. **MAI** toccare `package.json`, `tsconfig*.json`, `vitest.config.ts`, né creare tsconfig di root o aggiungere `composite`/project references. Creare i file nuovi elencati **è** in ambito. Nessuna nuova dipendenza (non ne servono). Verifica `git status --short` prima di ogni commit: devono comparire solo i file del task.

---

### Task 1: Punto di iniezione `AssembleContext` in `runMasterTurn` (`@loomn/ai`)

**Files:**
- Modify: `packages/ai/src/master-turn.ts`
- Test: `packages/ai/src/master-turn.test.ts`

**Disciplina di scope:** modifica SOLO i due file qui sopra. Non toccare altri file di `ai`, né i manifest. Non rimuovere `assembleContextStub` (resta come default).

- [ ] **Step 1: Scrivi i test di iniezione (falliscono perché il campo non esiste)**

In `packages/ai/src/master-turn.test.ts`, aggiungi `assembleContextStub` all'import esistente da `./master-turn`:

```typescript
import { runMasterTurn, assembleContextStub } from './master-turn';
```

In fondo al file, aggiungi un nuovo blocco `describe` (dopo `describe('runMasterTurn', ...)`):

```typescript
describe('iniezione del Context Assembler', () => {
  it('usa l assembler iniettato per il messaggio di contesto', async () => {
    const model = fakeModel(() => text('ok'));
    const res = await runMasterTurn({
      model,
      rng: createSeededRandom(1),
      state: baseState,
      playerAction: 'Guardo intorno.',
      assembleContext: () => 'CONTESTO-INIETTATO',
    });
    // transcript: [system(prompt), system(contesto), user(azione)] -> indice 1 e il contesto.
    expect(res.transcript[1]?.content).toBe('CONTESTO-INIETTATO');
  });

  it('senza iniezione usa assembleContextStub (default invariato)', async () => {
    const model = fakeModel(() => text('ok'));
    const res = await runMasterTurn({ model, rng: createSeededRandom(1), state: baseState, playerAction: 'Guardo intorno.' });
    expect(res.transcript[1]?.content).toBe(assembleContextStub(baseState));
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che FALLISCANO**

Run: `pnpm -C packages/ai test -- master-turn`
Expected: FAIL — il primo test fallisce perché `assembleContext` non è una proprietà nota di `MasterTurnRequest` (errore di tipo) o, se TS non blocca, perché `transcript[1].content` non è `'CONTESTO-INIETTATO'`.

- [ ] **Step 3: Aggiungi il tipo e il campo, e usa l'assembler iniettato**

In `packages/ai/src/master-turn.ts`, **dopo** la funzione `assembleContextStub` (cioè dopo la riga `}` che la chiude, prima di `buildMasterMessages`), aggiungi il tipo del punto di iniezione:

```typescript
/** Punto di iniezione del Context Assembler (Piano 8c). `ai` NON importa `memory`: l app
 *  fornisce l impl reale (creata in `memory`) iniettandola in runMasterTurn. La firma
 *  coincide con quella di assembleContextStub, che resta il default. */
export type AssembleContext = (state: GameState) => string;
```

In `MasterTurnRequest`, aggiungi il campo opzionale (dopo `maxIterations?`):

```typescript
export interface MasterTurnRequest {
  model: LanguageModel;
  rng: RandomSource;
  state: GameState;
  playerAction: string;
  tracer?: TracingPort;
  /** numero massimo di iterazioni del ciclo agentico (default 6). */
  maxIterations?: number;
  /** Context Assembler iniettato (Piano 8c). Default: assembleContextStub (stub L1 di 7c). */
  assembleContext?: AssembleContext;
}
```

In `runMasterTurn`, sostituisci la riga che costruisce `messages`:

```typescript
  const assemble = request.assembleContext ?? assembleContextStub;
  const messages: LlmMessage[] = buildMasterMessages(assemble(state), request.playerAction);
```

(prima era: `const messages: LlmMessage[] = buildMasterMessages(assembleContextStub(state), request.playerAction);`)

- [ ] **Step 4: Esegui i test e verifica che PASSINO**

Run: `pnpm -C packages/ai test -- master-turn`
Expected: PASS — tutti i test di `master-turn` (i 7 esistenti + i 2 nuovi) verdi.

- [ ] **Step 5: Typecheck del pacchetto + verifica scope**

Run: `pnpm -C packages/ai typecheck`
Expected: nessun errore.
Run: `git status --short`
Expected: solo `packages/ai/src/master-turn.ts` e `packages/ai/src/master-turn.test.ts` modificati.

- [ ] **Step 6: Commit**

```bash
git add packages/ai/src/master-turn.ts packages/ai/src/master-turn.test.ts
git commit -m "feat(ai): punto di iniezione AssembleContext in runMasterTurn (default stub)"
```

**Conteggio test atteso (cumulativo): 204** (202 + 2).

---

### Task 2: Helper puri — stima token + recency (`@loomn/memory`)

**Files:**
- Create: `packages/memory/src/context-assembler.ts`
- Test: `packages/memory/src/context-assembler.test.ts`

**Disciplina di scope:** crea SOLO i due file qui sopra. Non toccare `index.ts` (l'export è il Task 4), né altri file/manifest. In questo task il file contiene **solo** i due helper puri; la factory arriva nel Task 3.

- [ ] **Step 1: Scrivi i test degli helper (falliscono: il modulo non esiste)**

Crea `packages/memory/src/context-assembler.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { defaultEstimateTokens, recencyWeight } from './context-assembler';

const HOUR = 3_600_000;

describe('recencyWeight (decadimento a tempo di lettura)', () => {
  it('eta 0 -> peso 1', () => {
    expect(recencyWeight(1000, 1000, 0.995)).toBe(1);
  });
  it('createdAt nel futuro -> trattato come eta 0 -> peso 1', () => {
    expect(recencyWeight(1000, 5000, 0.995)).toBe(1);
  });
  it('decade monotonicamente col passare del tempo', () => {
    const young = recencyWeight(10 * HOUR, 9 * HOUR, 0.995);
    const old = recencyWeight(10 * HOUR, 1 * HOUR, 0.995);
    expect(young).toBeGreaterThan(old);
    expect(young).toBeLessThan(1);
  });
  it('1 ora con decay 0.995 -> circa 0.995', () => {
    expect(recencyWeight(2 * HOUR, 1 * HOUR, 0.995)).toBeCloseTo(0.995, 6);
  });
});

describe('defaultEstimateTokens (euristica char/4)', () => {
  it('arrotonda per eccesso', () => {
    expect(defaultEstimateTokens('')).toBe(0);
    expect(defaultEstimateTokens('abc')).toBe(1);
    expect(defaultEstimateTokens('abcd')).toBe(1);
    expect(defaultEstimateTokens('abcde')).toBe(2);
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che FALLISCANO**

Run: `pnpm -C packages/memory test -- context-assembler`
Expected: FAIL — `Cannot find module './context-assembler'` / export non risolti.

- [ ] **Step 3: Crea il modulo con i soli helper puri**

Crea `packages/memory/src/context-assembler.ts`:

```typescript
// L2/L1.5 read path — Context Assembler (spec 6.2). Questo modulo vive in `memory` (legge i
// propri store L1.5/L2 e il GameState/L1 da engine; NON importa `ai`). Qui i due helper PURI:
// la stima dei token (porta iniettabile, default char/4) e il peso di recency a tempo di
// lettura (decadimento sul createdAt, "now" dalla porta Clock). La factory e nel resto del file.

const MS_PER_HOUR = 3_600_000;

/** Euristica token di default: circa 4 caratteri per token (Math.ceil). */
export function defaultEstimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Peso di recency a tempo di lettura (stile Generative Agents): decay^(ore trascorse).
 *  Eta negativa (createdAt nel futuro, es. clock di test) trattata come 0 -> peso 1.
 *  Deterministico dato (now, createdAt, decayPerHour). */
export function recencyWeight(now: number, createdAt: number, decayPerHour: number): number {
  const ageHours = Math.max(0, now - createdAt) / MS_PER_HOUR;
  return Math.pow(decayPerHour, ageHours);
}
```

- [ ] **Step 4: Esegui i test e verifica che PASSINO**

Run: `pnpm -C packages/memory test -- context-assembler`
Expected: PASS — 5 test verdi.

- [ ] **Step 5: Typecheck del pacchetto + verifica scope**

Run: `pnpm -C packages/memory typecheck`
Expected: nessun errore.
Run: `git status --short`
Expected: solo i due nuovi file `context-assembler.ts` e `context-assembler.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add packages/memory/src/context-assembler.ts packages/memory/src/context-assembler.test.ts
git commit -m "feat(memory): helper Context Assembler (stima token char/4 + recency decay)"
```

**Conteggio test atteso (cumulativo): 209** (204 + 5).

---

### Task 3: `createContextAssembler` — budget + render + ranking (`@loomn/memory`)

**Files:**
- Modify: `packages/memory/src/context-assembler.ts`
- Test: `packages/memory/src/context-assembler.test.ts`

**Disciplina di scope:** modifica SOLO i due file qui sopra. I test usano gli **store reali** (`openDatabase(':memory:')` + `createCanonLedger` + `createSummaryStore`) — non creare doppi. Non toccare `index.ts` (Task 4), schema, migrazioni o manifest.

- [ ] **Step 1: Scrivi i test della factory (falliscono: la factory non esiste)**

In `packages/memory/src/context-assembler.test.ts`, aggiorna gli import in cima al file e aggiungi i fixture + il blocco `describe` della factory. Gli import diventano:

```typescript
import { describe, it, expect } from 'vitest';
import {
  createContextAssembler,
  defaultEstimateTokens,
  recencyWeight,
} from './context-assembler';
import { openDatabase } from './db';
import { createCanonLedger } from './canon-ledger';
import { createSummaryStore, type Summary } from './summary-store';
import type { Clock } from './clock';
import type { GameState } from '@loomn/engine';
```

Dopo `const HOUR = 3_600_000;` aggiungi i fixture:

```typescript
function fixedClock(now: number): Clock {
  return { now: () => now };
}

const HERO_STATE: GameState = {
  version: 1,
  encounter: null,
  actors: {
    pc1: { id: 'pc1', name: 'Eroe', kind: 'pc', attributes: {}, skills: {}, resources: { hp: { current: 10, max: 12 } }, conditions: [], items: [], progression: { xp: 0, level: 0 } },
    g1: { id: 'g1', name: 'Goblin', kind: 'npc', attributes: {}, skills: {}, resources: { hp: { current: 8, max: 8 } }, conditions: [], items: [], progression: { xp: 0, level: 0 } },
  },
};

function summary(over: Partial<Summary> & Pick<Summary, 'id' | 'text' | 'salience' | 'createdAt'>): Summary {
  return { level: 'scene', scope: 'sess1', importance: 5, eventSeqFrom: 0, eventSeqTo: 0, ...over };
}
```

In fondo al file, aggiungi il blocco della factory:

```typescript
describe('createContextAssembler (read path combinato, sqlite reale)', () => {
  it('assembla L1 + L1.5 (solo soggetti in scena) + L2', () => {
    const { db, close } = openDatabase(':memory:');
    try {
      const ledger = createCanonLedger(db);
      const summaries = createSummaryStore(db);
      ledger.record({ id: 'f1', subject: 'Eroe', predicate: 'ha_ucciso', object: 'Guardia#3', eventSeq: 10, salience: 0.8 });
      ledger.record({ id: 'f2', subject: 'Re', predicate: 'ha_promesso', object: 'ricompensa', eventSeq: 11, salience: 0.9 });
      summaries.record(summary({ id: 's1', text: 'Il gruppo entra nella cripta.', salience: 0.7, createdAt: 5 * HOUR }));

      const ctx = createContextAssembler({ ledger, summaries, clock: fixedClock(5 * HOUR) }, { tokenBudget: 1000 })(HERO_STATE);

      expect(ctx).toContain('Stato attuale (L1)');
      expect(ctx).toContain('Eroe (pc, id=pc1): hp 10/12');
      expect(ctx).toContain('Fatti canonici (L1.5)');
      expect(ctx).toContain('Eroe ha_ucciso Guardia#3'); // soggetto in scena
      expect(ctx).not.toContain('Re ha_promesso'); // Re NON in scena -> escluso
      expect(ctx).toContain('Memoria recente (L2)');
      expect(ctx).toContain('Il gruppo entra nella cripta.');
    } finally {
      close();
    }
  });

  it('budget: con estimate fisso entra solo il piu saliente; L1/L1.5 mai tagliati', () => {
    const { db, close } = openDatabase(':memory:');
    try {
      const ledger = createCanonLedger(db);
      const summaries = createSummaryStore(db);
      ledger.record({ id: 'f1', subject: 'Eroe', predicate: 'porta', object: 'la spada', eventSeq: 1, salience: 0.5 });
      summaries.record(summary({ id: 's-hi', text: 'alta salienza', salience: 0.9, createdAt: 1000 }));
      summaries.record(summary({ id: 's-mid', text: 'media salienza', salience: 0.5, createdAt: 1000 }));
      summaries.record(summary({ id: 's-lo', text: 'bassa salienza', salience: 0.1, createdAt: 1000 }));
      // estimate fisso = 1 token per blocco/riga: L1 + L1.5 costano 2; budget 3 -> 1 sola riga L2.
      const ctx = createContextAssembler(
        { ledger, summaries, clock: fixedClock(1000) },
        { tokenBudget: 3, estimateTokens: () => 1 },
      )(HERO_STATE);
      expect(ctx).toContain('Stato attuale (L1)'); // mai tagliato
      expect(ctx).toContain('Eroe porta la spada'); // L1.5 mai tagliato
      expect(ctx).toContain('alta salienza'); // top per salienza
      expect(ctx).not.toContain('media salienza');
      expect(ctx).not.toContain('bassa salienza');
    } finally {
      close();
    }
  });

  it('budget 0: L2 vuota, L1 e L1.5 restano', () => {
    const { db, close } = openDatabase(':memory:');
    try {
      const ledger = createCanonLedger(db);
      const summaries = createSummaryStore(db);
      ledger.record({ id: 'f1', subject: 'Goblin', predicate: 'impugna', object: 'una clava', eventSeq: 1, salience: 0.4 });
      summaries.record(summary({ id: 's1', text: 'qualcosa di recente', salience: 0.9, createdAt: 1000 }));
      const ctx = createContextAssembler({ ledger, summaries, clock: fixedClock(1000) }, { tokenBudget: 0 })(HERO_STATE);
      expect(ctx).toContain('Stato attuale (L1)');
      expect(ctx).toContain('Goblin impugna una clava');
      expect(ctx).not.toContain('Memoria recente (L2)');
    } finally {
      close();
    }
  });

  it('recency rompe la parita di salienza: il piu recente vince', () => {
    const { db, close } = openDatabase(':memory:');
    try {
      const ledger = createCanonLedger(db);
      const summaries = createSummaryStore(db);
      summaries.record(summary({ id: 's-old', text: 'evento vecchio', salience: 0.6, createdAt: 1 * HOUR }));
      summaries.record(summary({ id: 's-new', text: 'evento recente', salience: 0.6, createdAt: 9 * HOUR }));
      // nessun fatto -> fisso = solo L1 (1 token con estimate fisso); budget 2 -> 1 slot L2.
      const ctx = createContextAssembler(
        { ledger, summaries, clock: fixedClock(10 * HOUR) },
        { tokenBudget: 2, estimateTokens: () => 1 },
      )(HERO_STATE);
      expect(ctx).toContain('evento recente');
      expect(ctx).not.toContain('evento vecchio');
    } finally {
      close();
    }
  });

  it('e deterministico: stessi input -> stessa stringa', () => {
    const { db, close } = openDatabase(':memory:');
    try {
      const ledger = createCanonLedger(db);
      const summaries = createSummaryStore(db);
      ledger.record({ id: 'f1', subject: 'Eroe', predicate: 'e', object: 'stanco', eventSeq: 1, salience: 0.3 });
      summaries.record(summary({ id: 's1', text: 'A', salience: 0.5, createdAt: 100 }));
      summaries.record(summary({ id: 's2', text: 'B', salience: 0.5, createdAt: 100 }));
      const make = () => createContextAssembler({ ledger, summaries, clock: fixedClock(200) }, { tokenBudget: 1000 })(HERO_STATE);
      expect(make()).toBe(make());
    } finally {
      close();
    }
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che FALLISCANO**

Run: `pnpm -C packages/memory test -- context-assembler`
Expected: FAIL — `createContextAssembler` non esportato (i 5 test helper restano verdi, i 5 nuovi falliscono).

- [ ] **Step 3: Estendi il modulo con tipi, render privati e la factory**

Sostituisci l'**intero** contenuto di `packages/memory/src/context-assembler.ts` con la versione completa (gli helper del Task 2 restano invariati in cima):

```typescript
// L2/L1.5 read path — Context Assembler (spec 6.2). Questo modulo vive in `memory` (legge i
// propri store L1.5/L2 e il GameState/L1 da engine; NON importa `ai`). Allocatore con priorita
// e degrado controllato: L1 (priorita 2) + L1.5 (priorita 3) sempre inclusi, mai tagliati; L2
// (priorita 4) rankata per salienza x recency (decadimento a tempo di lettura sul createdAt via
// Clock) e inclusa dal punteggio piu alto finche c e budget (si taglia dal basso). La funzione
// restituita (state) => string e strutturalmente compatibile col punto di iniezione di `ai`.
import type { GameState } from '@loomn/engine';
import type { CanonFact, CanonLedger } from './canon-ledger';
import type { Summary, SummaryStore } from './summary-store';
import type { Clock } from './clock';

const MS_PER_HOUR = 3_600_000;

/** Euristica token di default: circa 4 caratteri per token (Math.ceil). */
export function defaultEstimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Peso di recency a tempo di lettura (stile Generative Agents): decay^(ore trascorse).
 *  Eta negativa (createdAt nel futuro, es. clock di test) trattata come 0 -> peso 1.
 *  Deterministico dato (now, createdAt, decayPerHour). */
export function recencyWeight(now: number, createdAt: number, decayPerHour: number): number {
  const ageHours = Math.max(0, now - createdAt) / MS_PER_HOUR;
  return Math.pow(decayPerHour, ageHours);
}

export interface ContextAssemblerDeps {
  ledger: CanonLedger;
  summaries: SummaryStore;
  clock: Clock;
}

export interface ContextAssemblerConfig {
  /** Budget di token per il blocco di contesto assemblato (L1 + L1.5 + L2). I messaggi fissi
   *  (ruolo/regole/fase e azione del giocatore, spec 6.2 priorita 1 e 6) vivono fuori, in `ai`:
   *  il chiamante dimensiona questo budget di conseguenza. */
  tokenBudget: number;
  /** Stima dei token di un testo. Default: euristica char/4. Porta iniettabile: l app puo
   *  fornire un tokenizer reale senza che `memory` acquisisca dipendenze. */
  estimateTokens?: (text: string) => number;
  /** Fattore di decadimento della recency per ora trascorsa, in (0,1]. Default 0.995 (stile
   *  Generative Agents, tarabile, spec 13). */
  recencyDecayPerHour?: number;
}

/** Soggetti in scena = id e nome di ogni attore presente in L1. Filtra L1.5 ai fatti su
 *  scena/PNG presenti (non tutto il mondo, spec 6.2). */
function sceneSubjects(state: GameState): Set<string> {
  const subjects = new Set<string>();
  for (const actor of Object.values(state.actors)) {
    subjects.add(actor.id);
    subjects.add(actor.name);
  }
  return subjects;
}

function renderL1(state: GameState): string {
  const actors = Object.values(state.actors).map((a) => {
    const res = Object.entries(a.resources)
      .map(([k, p]) => `${k} ${p.current}/${p.max}`)
      .join(', ');
    return `- ${a.name} (${a.kind}, id=${a.id})${res.length > 0 ? `: ${res}` : ''}`;
  });
  const list = actors.length > 0 ? actors.join('\n') : '- (nessun attore)';
  const enc =
    state.encounter === null
      ? 'Nessuno scontro attivo.'
      : `Scontro ${state.encounter.id}: round ${state.encounter.round}, turno ${state.encounter.turnIndex}.`;
  return `Stato attuale (L1):\n${list}\n${enc}`;
}

function renderFact(f: CanonFact): string {
  return `- ${f.subject} ${f.predicate} ${f.object}`;
}

function renderSummary(s: Summary): string {
  return `- [${s.level}] ${s.text}`;
}

/** Tie-break stabile per id (determinismo a parita di chiave di ordinamento). */
function byId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Crea un Context Assembler (spec 6.2). `deps` chiude su ledger L1.5 (8a), store L2 (8b) e
 *  Clock (8b); `config` fissa budget, stima token e decadimento. Ritorna una funzione PURA
 *  (dato lo stato + il contenuto degli store + clock.now()) che assembla il blocco di contesto. */
export function createContextAssembler(
  deps: ContextAssemblerDeps,
  config: ContextAssemblerConfig,
): (state: GameState) => string {
  const estimate = config.estimateTokens ?? defaultEstimateTokens;
  const decay = config.recencyDecayPerHour ?? 0.995;

  return (state: GameState): string => {
    // Priorita 2 — L1 stato rilevante (sempre incluso, mai tagliato).
    const l1 = renderL1(state);

    // Priorita 3 — L1.5 canon rilevante: fatti ATTIVI sui soggetti in scena (sempre inclusi).
    const subjects = sceneSubjects(state);
    const facts = deps.ledger.active().filter((f) => subjects.has(f.subject));
    const l15 = facts.length > 0 ? `Fatti canonici (L1.5):\n${facts.map(renderFact).join('\n')}` : '';

    // Costo dei blocchi fissi (L1 + L1.5): erode il budget per L2; MAI tagliati.
    const fixedTokens = [l1, l15].filter((b) => b.length > 0).reduce((sum, b) => sum + estimate(b), 0);
    const remaining = Math.max(0, config.tokenBudget - fixedTokens);

    // Priorita 4 — L2 narrativa recente: rankata per salienza x recency (decadimento sul
    // createdAt a tempo di lettura, Clock iniettato). Inclusa dal punteggio piu alto finche
    // c e budget; al primo riassunto che non entra ci si ferma (si taglia dal basso).
    const now = deps.clock.now();
    const ranked = deps.summaries
      .list()
      .map((s) => ({ s, score: s.salience * recencyWeight(now, s.createdAt, decay) }))
      .sort((a, b) => b.score - a.score || b.s.createdAt - a.s.createdAt || byId(a.s.id, b.s.id));

    const chosen: Summary[] = [];
    let used = 0;
    for (const { s } of ranked) {
      const cost = estimate(renderSummary(s));
      if (used + cost > remaining) break;
      chosen.push(s);
      used += cost;
    }
    // Render in ordine cronologico per leggibilita (la selezione resta per punteggio).
    chosen.sort((a, b) => a.createdAt - b.createdAt || byId(a.id, b.id));
    const l2 = chosen.length > 0 ? `Memoria recente (L2):\n${chosen.map(renderSummary).join('\n')}` : '';

    return [l1, l15, l2].filter((b) => b.length > 0).join('\n\n');
  };
}
```

- [ ] **Step 4: Esegui i test e verifica che PASSINO**

Run: `pnpm -C packages/memory test -- context-assembler`
Expected: PASS — 10 test verdi (5 helper + 5 factory).

- [ ] **Step 5: Typecheck del pacchetto + verifica scope**

Run: `pnpm -C packages/memory typecheck`
Expected: nessun errore.
Run: `git status --short`
Expected: solo `packages/memory/src/context-assembler.ts` e `packages/memory/src/context-assembler.test.ts` modificati.

- [ ] **Step 6: Commit**

```bash
git add packages/memory/src/context-assembler.ts packages/memory/src/context-assembler.test.ts
git commit -m "feat(memory): createContextAssembler con budget di token e degrado controllato"
```

**Conteggio test atteso (cumulativo): 214** (209 + 5).

---

### Task 4: Export pubblico + compatibilità con il punto di iniezione (`@loomn/memory`)

**Files:**
- Modify: `packages/memory/src/index.ts`
- Test: `packages/memory/src/context-assembler.test.ts`

**Disciplina di scope:** modifica SOLO i due file qui sopra. Non toccare `package.json`/manifest. `memory` continua a NON importare `ai`: il test replica **localmente** il tipo del punto di iniezione (non importa `@loomn/ai`).

- [ ] **Step 1: Scrivi il test di compatibilità (fallisce: export non ancora pubblico)**

In fondo a `packages/memory/src/context-assembler.test.ts`, aggiungi:

```typescript
describe('compatibilita col punto di iniezione di ai', () => {
  // Replica LOCALE del tipo `AssembleContext` di `ai` (memory NON importa ai): prova che
  // l assembler reale e assegnabile al punto di iniezione di runMasterTurn.
  type AssembleContext = (state: GameState) => string;

  it('l assembler e assegnabile a (state) => string e produce il contesto', () => {
    const { db, close } = openDatabase(':memory:');
    try {
      const ledger = createCanonLedger(db);
      const summaries = createSummaryStore(db);
      const injected: AssembleContext = createContextAssembler({ ledger, summaries, clock: fixedClock(0) }, { tokenBudget: 500 });
      expect(injected(HERO_STATE)).toContain('Stato attuale (L1)');
    } finally {
      close();
    }
  });
});
```

- [ ] **Step 2: Esegui i test e verifica lo stato**

Run: `pnpm -C packages/memory test -- context-assembler`
Expected: PASS — il test passa già (usa import diretti da `./context-assembler`). Questo step fissa la **compatibilità di tipo** del valore di ritorno con la firma del punto di iniezione; serve da rete di sicurezza per il refactor dell'export.

- [ ] **Step 3: Esporta l'API pubblica dal barrel**

In `packages/memory/src/index.ts`, aggiungi in fondo:

```typescript
export {
  createContextAssembler,
  defaultEstimateTokens,
  recencyWeight,
  type ContextAssemblerDeps,
  type ContextAssemblerConfig,
} from './context-assembler';
```

- [ ] **Step 4: Verifica build pubblica, suite completa e typecheck di root**

Run: `pnpm -C packages/memory test -- context-assembler`
Expected: PASS — 11 test di `context-assembler`.
Run: `pnpm test`
Expected: **215 test verdi** (32 file di test).
Run: `pnpm typecheck`
Expected: nessun errore su engine/shared/memory/ai.

- [ ] **Step 5: Verifica scope**

Run: `git status --short`
Expected: solo `packages/memory/src/index.ts` e `packages/memory/src/context-assembler.test.ts` modificati.

- [ ] **Step 6: Commit**

```bash
git add packages/memory/src/index.ts packages/memory/src/context-assembler.test.ts
git commit -m "feat(memory): esporta Context Assembler dal barrel (8c completo)"
```

**Conteggio test atteso (cumulativo): 215** (214 + 1).

---

## Fuori ambito (esplicito)

- **Wiring nell'app:** costruire l'assembler con gli store reali (connessione condivisa) e iniettarlo in `runMasterTurn`, più le impl LLM-backed di `FactExtractor`/`Summarizer` e il `Clock` reale → **Piano 9** (Shell Electron). 8c fornisce solo l'unità componibile + il punto di iniezione.
- **Strumenti rimandati di 7c** (`request_check`/`apply_effect`/`advance_quest`): richiedono nuovi `Command`/`Event` engine e/o il contesto quest → **piano dedicato** (traccia engine), non 8c (percorso di lettura).
- **FSM di fase (spec §5.5):** la "fase" della priorità 1 resta parte del blocco ruolo/regole (system prompt). La FSM dichiarata (esplorazione/dialogo/combattimento/downtime) è un piano a sé → non 8c.
- **L3 / RAG (priorità 5) e relevance query-dependent:** **Fase 2**. Per questo l'assembler non riceve l'azione del giocatore.
- **Memoria per entità** (ogni PNG con la sua memoria): non in 8c.
- **Tokenizer reale:** 8c espone la porta `estimateTokens` con default `char/4`; l'iniezione di un tokenizer vero è scelta dell'app.

## Self-review (eseguita sul piano contro lo spec)

**1. Copertura spec §6.2.** Priorità 1 (ruolo/fase) e 6 (azione): restano i messaggi fissi di `buildMasterMessages` in `ai` (non toccati; la fase è deferita con la FSM) ✓. Priorità 2 (L1 rilevante): `renderL1` su `GameState` ✓. Priorità 3 (L1.5 canon rilevante): `ledger.active()` filtrato per soggetti in scena ✓. Priorità 4 (L2 recente): `summaries.list()` rankato per salienza × recency ✓. "si taglia dal basso, MAI L1/L1.5": L1+L1.5 fuori dal taglio, solo L2 ridotta dal budget (test budget 0 e budget=3) ✓. Degrado controllato su contesti piccoli e grandi: `tokenBudget` parametrico ✓. Priorità 5 (L3): fuori ambito, Fase 2 ✓.

**2. Scansione placeholder.** Nessun "TBD/TODO/handle edge cases"; ogni step di codice mostra il codice completo; comandi con output atteso; il Task 3 riporta il file **intero**, non un diff parziale (l'engineer può leggerlo fuori ordine). Tipi/funzioni usati (`createContextAssembler`, `defaultEstimateTokens`, `recencyWeight`, `ContextAssemblerDeps/Config`, `AssembleContext`) sono tutti definiti nei rispettivi task.

**3. Coerenza dei tipi/nomi.** `AssembleContext = (state: GameState) => string` (Task 1) == firma del valore restituito da `createContextAssembler` (Task 3) == replica locale del test (Task 4). `CanonLedger.active`/`SummaryStore.list`/`Clock.now`/`Summary.salience`/`Summary.createdAt` combaciano con le firme reali di 8a/8b. Campi `Actor` nei fixture di test (`attributes/skills/resources/conditions/items/progression`) combaciano col tipo engine.

**4. Bug apostrofo.** Tutte le descrizioni `it(...)`/`describe(...)` sono in apici singoli **senza** apostrofi (`l assembler`, `c e`, `stessi input`). Grep di verifica (deve dare *no matches*): `(it|describe)\('[^']*'[A-Za-zàèéìòù]`.

**5. Verifica empirica.** Tutto il codice del piano (assembler, helper, punto di iniezione, test) è stato eseguito **verde in sandbox esterna** (`better-sqlite3` buildato; sqlite reale per il read path combinato; typecheck strict pulito) prima della stesura: 12 test verdi su (recency, char/4, read path combinato, taglio per budget, recency-tie-break, determinismo, compatibilità iniezione).

## Roadmap aggiornata (Fase 1)

- Piano 6 — Persistenza ✅ · 7a — Provider Layer ✅ · 7b — StructuredOutputPort ✅ · 7c — AI Master pipeline ✅
- Piano 8a — Canon Ledger (L1.5) ✅ · 8b — Reflection + L2 + Salienza ✅
- **Piano 8c — Context Assembler** ← *questo piano* (budget di token §6.2; legge L1+L1.5+L2; recency a tempo di lettura sul `created_at`; iniettato in `runMasterTurn`)
- Piano 9 — Shell Electron (main/preload/renderer; Clock reale; impl LLM-backed di FactExtractor/Summarizer; wiring EventStore+CanonLedger+SummaryStore+**ContextAssembler** su connessione condivisa; iniezione dell'assembler in runMasterTurn)
- Piano 10 — UI Vue (chat, scheda PG, pannello dadi 3D, journal, provider) · Piano 11 — Moduli a tema
- *Traccia engine separata:* strumenti `request_check`/`apply_effect`/`advance_quest` (nuovi Command/Event) + FSM di fase (§5.5)

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-16-loomn-fase1-piano8c-context-assembler.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — un subagent fresco per task, review tra i task, iterazione rapida.

**2. Inline Execution** — esecuzione dei task in questa sessione con checkpoint di review.

**Which approach?**

- Se **Subagent-Driven**: REQUIRED SUB-SKILL `superpowers:subagent-driven-development` — branch dedicato `feat/fase1-piano8c-context-assembler`, per ogni task implementer (sonnet) + spec review (sonnet) + code-quality review (sonnet, salto sui task di solo export se senza logica), final review dell'intero branch (opus), poi `finishing-a-development-branch` (merge locale fast-forward in main) e aggiornamento memoria/HANDOFF.
- Se **Inline Execution**: REQUIRED SUB-SKILL `superpowers:executing-plans`.
