# F4 — La storia entra in canone — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La narrazione del Master entra nello stream come evento `NarrationRecorded` e la Reflection la consuma, cosi la memoria ricorda la STORIA (relazioni/segreti/luoghi) e non solo le statistiche meccaniche.

**Architecture:** Approccio A′ dello spec `docs/superpowers/specs/2026-06-16-f4-storia-in-canone-design.md`. `NarrationRecorded` e una variante di `DomainEvent` no-op di stato (solo `version++`, come `AttackResolved`): l unico evento non prodotto da `decide`, appeso da `runTurn`. `reflect` lo riceve via `eventStore.load()` (la prosa e gia nello stream → rebuild-safe, vincolo spec §6); `renderEventsForReflection` lo rende come prosa e l estrattore/summarizer producono fatti narrativi (L1.5) + riassunto narrativo (L2).

**Tech Stack:** TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Zod, Vitest, monorepo pnpm (`@loomn/engine`, `@loomn/shared`, `@loomn/memory`, `@loomn/host`). Tutto su ABI Node (niente Electron/rete reale).

---

## Disciplina di scope (vale per OGNI task — house rule §5.1)

- Modifica **solo** i file elencati nel task. **MAI** toccare `package.json`, `tsconfig*.json`, `vitest.config.ts`; **MAI** creare un `tsconfig.json` di root o aggiungere `composite`/project references.
- Verifica `git status --short` prima di ogni commit: devono comparire **solo** i file del task.
- Niente cast (`as`) per aggirare i tipi; niente `any` al confine. `exactOptionalPropertyTypes` → spread condizionali, mai `campo: undefined`.
- Bug apostrofo (house rule §5.4): nessun apostrofo dentro le stringhe `it('...')`/`describe('...')` in apici singoli (`l'`, `un'`, `c'è`). Scrivi senza apostrofo (`l attore`, `c e`). `è/é` vanno bene.
- Crea i file con lo strumento Write (NON `New-Item -Force`, che tronca).

## Struttura dei file (cosa cambia e perche)

| File | Responsabilita | Task |
|---|---|---|
| `packages/engine/src/events.ts` | +variante `NarrationRecorded` in `DomainEvent` + `case` no-op in `applyEvent` | 1 |
| `packages/engine/src/events.test.ts` | test: `applyEvent(NarrationRecorded)` → solo `version++` | 1 |
| `packages/shared/src/domain-schema.ts` | +variante `NarrationRecorded` in `domainEventSchema` (validazione in lettura) | 1 |
| `packages/shared/src/domain-schema.test.ts` | test: round-trip Zod di `NarrationRecorded` | 1 |
| `packages/host/src/campaign-service.ts` | `runTurn` appende `NarrationRecorded` quando il Master narra | 2 |
| `packages/host/src/campaign-service.test.ts` | test nuovi (puro dialogo / narrazione vuota / end-to-end) + aggiornamento di 2 test esistenti sulla versione | 2, 4 |
| `packages/host/src/reflection-ports.ts` | `renderEventsForReflection` rende `NarrationRecorded` come prosa + `EXTRACT_SYSTEM` raffinato | 3 |
| `packages/host/src/reflection-ports.test.ts` | test: rendering prosa di `NarrationRecorded` | 3 |

**Coupling Task 1 (engine ↔ shared):** i drift-guard a compile-time `_eventForward`/`_eventBackward` in `packages/memory/src/sqlite-event-store.ts:85-88` confrontano bidirezionalmente `DomainEvent` (engine) ↔ `z.infer<domainEventSchema>` (shared). Aggiungere la variante a UN solo lato rompe `pnpm -r typecheck`. Per questo **engine e shared vanno insieme nel Task 1**, in un unico commit.

**Conteggi test attesi (cumulativi):** baseline **273** → Task 1 **275** → Task 2 **277** → Task 3 **278** → Task 4 **279**.

---

## Task 1: Evento `NarrationRecorded` (engine + shared)

**Files:**
- Modify: `packages/engine/src/events.ts`
- Test: `packages/engine/src/events.test.ts`
- Modify: `packages/shared/src/domain-schema.ts`
- Test: `packages/shared/src/domain-schema.test.ts`

Atomico: la variante va aggiunta in engine E shared insieme (drift-guard, vedi sopra).

- [ ] **Step 1: Scrivi il test engine (RED)**

In `packages/engine/src/events.test.ts`, dentro il `describe('applyEvent', …)`, **dopo** il test `AttackResolved non cambia lo stato ma incrementa la versione` (riga ~92), aggiungi:

```typescript
  it('NarrationRecorded non cambia lo stato ma incrementa la versione', () => {
    const base = withActors(actor('eroe'));
    const s = applyEvent(base, {
      type: 'NarrationRecorded',
      playerAction: 'Osservo il goblin.',
      narration: 'Il goblin ti fissa, diffidente.',
    });
    expect(s.actors).toEqual(base.actors);
    expect(s.encounter).toEqual(base.encounter);
    expect(s.version).toBe(base.version + 1);
  });
```

- [ ] **Step 2: Esegui il test e verifica che FALLISCE**

Run (dalla root): `pnpm exec vitest run packages/engine/src/events.test.ts`
Atteso: FAIL sul nuovo test. Vitest transpila con esbuild (ignora i tipi), quindi il test gira: `applyEvent` cade nel ramo `default` (`const _exhaustive: never = event; return _exhaustive;`) e **ritorna l oggetto evento** invece di uno stato → `s.version` e `undefined` → l asserzione `s.version === base.version + 1` fallisce. Gli altri test restano verdi.

- [ ] **Step 3: Implementa la variante engine + il case**

In `packages/engine/src/events.ts`, estendi l unione `DomainEvent` (aggiungi l ultima variante, sostituendo il `;` finale di `ActorDowned`):

```typescript
export type DomainEvent =
  | { type: 'ActorAdded'; actor: Actor }
  | { type: 'EncounterStarted'; encounter: Encounter }
  | { type: 'TurnEnded' }
  | { type: 'RoundAdvanced' }
  | { type: 'AttackResolved'; attackerId: string; targetId: string; check: CheckResult; hit: boolean }
  | { type: 'DamageApplied'; targetId: string; resource: string; amount: number }
  | { type: 'ActorDowned'; actorId: string }
  | { type: 'NarrationRecorded'; playerAction: string; narration: string };
```

E in `applyEvent`, aggiungi il `case` **prima** del `default` (subito dopo `case 'AttackResolved': return bumped;`):

```typescript
    case 'NarrationRecorded':
      // Evento informativo: registra la prosa del Master nello stream (spec F4). No-op di
      // stato (come AttackResolved): non muta actors/encounter, solo version++. e l unico
      // evento non prodotto da decide (lo appende runTurn nel host).
      return bumped;
```

- [ ] **Step 4: Esegui il test engine e verifica che PASSA**

Run: `pnpm exec vitest run packages/engine/src/events.test.ts`
Atteso: PASS (tutti i test del file verdi).

- [ ] **Step 5: Scrivi il test shared (RED)**

In `packages/shared/src/domain-schema.test.ts`, dentro il `describe('domainEventSchema', …)`, dopo il test `valida gli eventi semplici …` (riga ~58), aggiungi:

```typescript
  it('valida NarrationRecorded e ne fa round-trip', () => {
    const ev = {
      type: 'NarrationRecorded',
      playerAction: 'Attacco Krix.',
      narration: 'La lama manca il bersaglio di un soffio.',
    };
    expect(domainEventSchema.parse(ev)).toEqual(ev);
  });
```

- [ ] **Step 6: Esegui il test shared e verifica che FALLISCE**

Run: `pnpm exec vitest run packages/shared/src/domain-schema.test.ts`
Atteso: FAIL sul nuovo test: `domainEventSchema` e una `z.discriminatedUnion` che non conosce il discriminante `NarrationRecorded` → `parse` lancia.

- [ ] **Step 7: Implementa la variante nello schema Zod**

In `packages/shared/src/domain-schema.ts`, aggiungi al `z.discriminatedUnion('type', [...])` di `domainEventSchema` (dopo la variante `ActorDowned`, riga ~143):

```typescript
  z.object({ type: z.literal('NarrationRecorded'), playerAction: z.string(), narration: z.string() }),
```

- [ ] **Step 8: Esegui il test shared e verifica che PASSA**

Run: `pnpm exec vitest run packages/shared/src/domain-schema.test.ts`
Atteso: PASS.

- [ ] **Step 9: Typecheck dell intero workspace (drift-guard incluso)**

Run: `pnpm -r typecheck`
Atteso: tutti i pacchetti `Done`, nessun errore. (In particolare `@loomn/memory` compila: i drift-guard `_eventForward`/`_eventBackward` ora vedono la variante su entrambi i lati.)

- [ ] **Step 10: Esegui l intera suite**

Run: `pnpm test`
Atteso: **275 passed**.

- [ ] **Step 11: Commit**

```bash
git add packages/engine/src/events.ts packages/engine/src/events.test.ts packages/shared/src/domain-schema.ts packages/shared/src/domain-schema.test.ts
git commit -m "feat(engine,shared): evento NarrationRecorded (no-op di stato) per la storia-in-canone (F4)"
```

---

## Task 2: `runTurn` appende `NarrationRecorded`

**Files:**
- Modify: `packages/host/src/campaign-service.ts` (metodo `runTurn`)
- Test: `packages/host/src/campaign-service.test.ts` (2 test nuovi + aggiornamento di 2 test esistenti)

- [ ] **Step 1: Scrivi i test nuovi (RED)**

In `packages/host/src/campaign-service.test.ts`, dentro il `describe('createCampaignService - runTurn (AI dietro il servizio)', …)`, aggiungi questi due test:

```typescript
  it('runTurn di puro dialogo persiste un NarrationRecorded nello stream (la storia lascia traccia)', async () => {
    const model = fakeModel([
      { type: 'text', delta: 'Krix rivela di servire il Barone Vhalmar.' },
      { type: 'finish', reason: 'stop' },
    ]);
    const { service, memory } = makeService({ model });
    try {
      const out = await service.runTurn('Chiedo a Krix per chi lavora.');
      expect(out.events).toEqual([]); // TurnOutcome.events resta meccanica (niente NarrationRecorded)
      expect(out.readModel.version).toBe(1); // lo stream e cresciuto: il NarrationRecorded e persistito
      expect(memory.eventStore.version()).toBe(1);
      const stored = memory.eventStore.load();
      expect(stored).toHaveLength(1);
      expect(stored[0]?.event).toEqual({
        type: 'NarrationRecorded',
        playerAction: 'Chiedo a Krix per chi lavora.',
        narration: 'Krix rivela di servire il Barone Vhalmar.',
      });
    } finally {
      memory.close();
    }
  });

  it('runTurn non persiste nulla se la narrazione e vuota e non ci sono Event', async () => {
    const model = fakeModel([{ type: 'finish', reason: 'stop' }]); // niente testo, niente tool-call
    const { service, memory } = makeService({ model });
    try {
      const out = await service.runTurn('Resto in silenzio.');
      expect(out.narration).toBe('');
      expect(out.readModel.version).toBe(0);
      expect(memory.eventStore.version()).toBe(0);
    } finally {
      memory.close();
    }
  });
```

- [ ] **Step 2: Esegui i test e verifica che FALLISCONO**

Run: `pnpm exec vitest run packages/host/src/campaign-service.test.ts`
Atteso: il test `puro dialogo` FALLISCE (oggi una narrazione senza Event non viene persistita: `eventStore.version()` resta `0`, `stored` e vuoto). Il test `narrazione vuota` PASSA gia (comportamento attuale corretto: niente Event, niente narrazione → niente append). Va bene: il primo guida l implementazione, il secondo e una guardia di regressione.

- [ ] **Step 3: Implementa l append di `NarrationRecorded` in `runTurn`**

In `packages/host/src/campaign-service.ts`, sostituisci il corpo del metodo `runTurn` (oggi dal `const startVersion` al `return { narration … }`) con:

```typescript
    runTurn(playerAction: string): Promise<TurnOutcome> {
      return enqueue(async () => {
        const startVersion = state.version;
        const result = await runMasterTurn({
          model: deps.model,
          rng: deps.rng,
          state,
          playerAction,
          assembleContext: deps.memory.assembleContext,
        });
        // La narrazione del Master entra nello stream come NarrationRecorded (spec F4): cosi la
        // storia e rebuild-safe e la Reflection puo spogliarla. e l unico evento non prodotto da
        // decide (registra l output dell AI: nessun RNG ne validazione meccanica). result.state
        // ha gia applicato result.events; applichiamo SOLO la narrazione sopra.
        const toStore: DomainEvent[] = [...result.events];
        let nextState = result.state;
        if (result.narration.length > 0) {
          const narrationEvent: DomainEvent = {
            type: 'NarrationRecorded',
            playerAction,
            narration: result.narration,
          };
          toStore.push(narrationEvent);
          nextState = applyEvent(nextState, narrationEvent);
        }
        if (toStore.length > 0) {
          deps.memory.eventStore.append(toStore, startVersion);
          state = nextState;
        }
        // TurnOutcome.events resta la lista MECCANICA: il NarrationRecorded e persistenza di stream,
        // non un esito meccanico del turno. La version del read model riflette comunque il bump.
        return { narration: result.narration, events: result.events, readModel: readModel() };
      });
    },
```

(`DomainEvent` e `applyEvent` sono gia importati da `@loomn/engine` in cima al file — non aggiungere import.)

- [ ] **Step 4: Esegui i test nuovi e verifica che PASSANO**

Run: `pnpm exec vitest run packages/host/src/campaign-service.test.ts`
Atteso: i due test nuovi PASSANO, ma **2 test esistenti ora FALLISCONO** (`persiste gli Event prodotti dal turno` e `serializza turno e dispatch concorrenti`): asserivano la versione del vecchio comportamento (senza NarrationRecorded). Si aggiornano nello Step 5 (sono regressioni ATTESE e corrette: ora la narrazione e un evento persistito).

- [ ] **Step 5: Aggiorna i 2 test esistenti sulla versione**

Nel test `persiste gli Event prodotti dal turno (tool-call -> decide -> append)`: il turno produce `ActorAdded` (v1) **e** narra "Un locandiere appare." → ora si aggiunge un `NarrationRecorded` (v2). Cambia le due asserzioni:

```typescript
      expect(out.readModel.version).toBe(2); // ActorAdded (v1) + NarrationRecorded (v2)
      expect(out.readModel.state.actors['png1']?.name).toBe('Locandiere');
      expect(memory.eventStore.version()).toBe(2);
```

Nel test `serializza turno e dispatch concorrenti: nessun ConcurrencyError, ordine FIFO`: il turno produce `ActorAdded` (v1) + `NarrationRecorded` (v2, narrazione "Il locandiere saluta."), poi il dispatch del goblin (v3). Cambia:

```typescript
      expect(dispOut.readModel.version).toBe(3); // turno (ActorAdded v1 + NarrationRecorded v2) poi dispatch (v3)
      expect(memory.eventStore.version()).toBe(3);
```

- [ ] **Step 6: Esegui il file di test e verifica che PASSA**

Run: `pnpm exec vitest run packages/host/src/campaign-service.test.ts`
Atteso: PASS (tutti i test del file verdi).

- [ ] **Step 7: Typecheck + suite intera**

Run: `pnpm -C packages/host typecheck` poi `pnpm test`
Atteso: typecheck `Done`; suite **277 passed**.

- [ ] **Step 8: Commit**

```bash
git add packages/host/src/campaign-service.ts packages/host/src/campaign-service.test.ts
git commit -m "feat(host): runTurn appende NarrationRecorded quando il Master narra (F4)"
```

---

## Task 3: La Reflection rende `NarrationRecorded` come prosa

**Files:**
- Modify: `packages/host/src/reflection-ports.ts` (`renderEventsForReflection` + `EXTRACT_SYSTEM`)
- Test: `packages/host/src/reflection-ports.test.ts`

- [ ] **Step 1: Scrivi il test (RED)**

In `packages/host/src/reflection-ports.test.ts`, dentro il `describe('renderEventsForReflection', …)`, aggiungi:

```typescript
  it('rende un NarrationRecorded come prosa (azione del giocatore e narrazione del Master)', () => {
    const events: StoredEvent[] = [
      {
        seq: 5,
        event: {
          type: 'NarrationRecorded',
          playerAction: 'Chiedo a Krix per chi lavora.',
          narration: 'Krix rivela di servire il Barone Vhalmar.',
        },
      },
    ];
    const text = renderEventsForReflection(events);
    expect(text).toContain('Chiedo a Krix per chi lavora.');
    expect(text).toContain('Krix rivela di servire il Barone Vhalmar.');
    expect(text).not.toContain('NarrationRecorded'); // prosa, non il tipo grezzo
    expect(text).not.toContain('{"type"'); // niente dump JSON
  });
```

(`StoredEvent` e gia importato da `@loomn/engine` in cima al file di test.)

- [ ] **Step 2: Esegui il test e verifica che FALLISCE**

Run: `pnpm exec vitest run packages/host/src/reflection-ports.test.ts`
Atteso: FAIL: oggi `renderEventsForReflection` fa `#${seq} ${type} ${JSON.stringify(event)}` → produce `#5 NarrationRecorded {"type":"NarrationRecorded",…}`, quindi le asserzioni `not.toContain('NarrationRecorded')` e `not.toContain('{"type"')` falliscono.

- [ ] **Step 3: Implementa il rendering speciale + raffina `EXTRACT_SYSTEM`**

In `packages/host/src/reflection-ports.ts`, sostituisci la funzione `renderEventsForReflection`:

```typescript
/** Rende gli eventi della scena in testo per il prompt. I NarrationRecorded diventano PROSA
 *  (azione del giocatore + narrazione del Master) cosi l estrattore vede la storia; gli eventi
 *  meccanici restano una riga per evento (deterministico). */
export function renderEventsForReflection(events: StoredEvent[]): string {
  return events
    .map((e) => {
      if (e.event.type === 'NarrationRecorded') {
        return `#${e.seq} Scena (prosa)\nGiocatore: ${e.event.playerAction}\nMaster: ${e.event.narration}`;
      }
      return `#${e.seq} ${e.event.type} ${JSON.stringify(e.event)}`;
    })
    .join('\n');
}
```

E sostituisci la costante `EXTRACT_SYSTEM` (raffinamento: fatti NARRATIVI, escludi le statistiche meccaniche gia in L1 — chiude anche F3):

```typescript
const EXTRACT_SYSTEM =
  'Sei un analista narrativo. Dalla scena (eventi del motore e narrazione del Master) estrai i ' +
  'fatti canonici NARRATIVI e DISCRETI come terne (subject, predicate, object): relazioni, ' +
  'alleanze, segreti, moventi, luoghi, promesse, tradimenti. functional=true se il predicato ' +
  'ammette un solo valore per soggetto (es. si_trova_a, alleato_di), cosi il valore precedente va ' +
  'sostituito. importance da 1 (effimero) a 10 (permanente). NON estrarre statistiche meccaniche ' +
  'gia tracciate dal motore (hp, attributi, danni, singoli tiri): quelle sono gia in L1. Ometti i ' +
  'dettagli effimeri.';
```

- [ ] **Step 4: Esegui il test e verifica che PASSA**

Run: `pnpm exec vitest run packages/host/src/reflection-ports.test.ts`
Atteso: PASS (tutti i test del file verdi; il test esistente `rende una riga per evento in ordine di seq` usa solo eventi meccanici → resta verde).

- [ ] **Step 5: Typecheck + suite intera**

Run: `pnpm -C packages/host typecheck` poi `pnpm test`
Atteso: typecheck `Done`; suite **278 passed**.

- [ ] **Step 6: Commit**

```bash
git add packages/host/src/reflection-ports.ts packages/host/src/reflection-ports.test.ts
git commit -m "feat(host): la Reflection rende NarrationRecorded come prosa e mira ai fatti narrativi (F4, chiude F3 nel prompt)"
```

---

## Task 4: Wiring end-to-end — la narrazione raggiunge l estrattore e il fatto entra in L1.5

**Files:**
- Test: `packages/host/src/campaign-service.test.ts` (1 test nuovo; nessuna modifica di produzione)

Questo e il test corona del design: dimostra che dopo un turno narrato, la prosa raggiunge l estrattore e il fatto narrativo finisce in L1.5.

- [ ] **Step 1: Scrivi il test (RED)**

In `packages/host/src/campaign-service.test.ts`, dentro il `describe('createCampaignService - reflect e serializzazione', …)`, aggiungi:

```typescript
  it('runTurn poi reflect: la narrazione raggiunge l estrattore e il fatto narrativo entra in L1.5', async () => {
    const model = fakeModel([
      { type: 'text', delta: 'Krix rivela di servire il Barone Vhalmar di Pietranera.' },
      { type: 'finish', reason: 'stop' },
    ]);
    const extractPrompts: string[] = [];
    const port: StructuredOutputPort = {
      generate: async <T>(request: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> => {
        const joined = request.messages.map((m) => m.content).join('\n');
        if (request.schemaName === 'extract_facts') {
          extractPrompts.push(joined);
          const value = {
            facts: [{ subject: 'Krix', predicate: 'serve', object: 'Barone Vhalmar', functional: false, importance: 8 }],
          };
          return { value: value as T, strategy: 'function-call' };
        }
        const draft = { text: 'Krix confessa di servire il Barone Vhalmar.', importance: 8 };
        return { value: draft as T, strategy: 'function-call' };
      },
    };
    const { service, memory } = makeService({ model, structured: port });
    try {
      await service.runTurn('Chiedo a Krix per chi lavora.');
      const out = await service.reflect('scena-1');
      // La narrazione ha raggiunto l estrattore come prosa (asserzione non-vacua):
      expect(extractPrompts[0]).toContain('Barone Vhalmar di Pietranera');
      // Il fatto narrativo e entrato in L1.5:
      expect(out.factCount).toBe(1);
      const facts = memory.ledger.active();
      expect(facts.some((f) => f.subject === 'Krix' && f.predicate === 'serve')).toBe(true);
    } finally {
      memory.close();
    }
  });
```

Nota: si asserisce sul `ledger.active()` (e non su `assembleContext`) perche il Context Assembler filtra L1.5 ai soggetti **in scena** (attori presenti nello stato): qui non e stato creato alcun attore (turno di puro dialogo), quindi il fatto su `Krix` non comparirebbe nel contesto assemblato — ma e correttamente nel ledger. Il filtraggio dell assembler e gia coperto altrove.

- [ ] **Step 2: Esegui il test e verifica che FALLISCE prima di Task 2/3, PASSA dopo**

Run: `pnpm exec vitest run packages/host/src/campaign-service.test.ts`
Atteso (con Task 2 e 3 gia fatti): PASS. Se per qualche motivo Task 2/3 non fossero applicati, fallirebbe perche: senza Task 2 il `NarrationRecorded` non sarebbe nello stream (`extractPrompts[0]` non conterrebbe la prosa); senza Task 3 la prosa non sarebbe resa leggibile. Esegui comunque per confermare PASS.

- [ ] **Step 3: Typecheck + suite intera**

Run: `pnpm -C packages/host typecheck` poi `pnpm test`
Atteso: typecheck `Done`; suite **279 passed**.

- [ ] **Step 4: Commit**

```bash
git add packages/host/src/campaign-service.test.ts
git commit -m "test(host): wiring end-to-end F4 - la narrazione entra in L1.5 via Reflection"
```

---

## Self-review (compilata in fase di scrittura)

- **Copertura spec:** §3 (A′) → Task 1+2+3+4; §4 (`NarrationRecorded` DomainEvent no-op) → Task 1; §5 (flusso `runTurn`, `TurnOutcome.events` meccanica) → Task 2; §6 (engine/shared/host, niente UI/migrazioni/commandSchema) → Task 1+2+3; §6 (renderEventsForReflection prosa + EXTRACT_SYSTEM, chiude F3) → Task 3; §8 (test: engine no-op, shared round-trip, runTurn sse narrazione, puro dialogo, narrazione→estrattore→L1.5) → Task 1/2/4. Fuori ambito (§7) non implementato di proposito.
- **Placeholder:** nessun TBD/TODO; ogni step ha codice/comando/atteso concreti.
- **Coerenza tipi/nomi:** `NarrationRecorded` con `playerAction`/`narration` identici in engine, shared, host e test; `DomainEvent`/`applyEvent` gia importati in `campaign-service.ts`; `StoredEvent`/`StructuredOutputRequest`/`StructuredOutputResult` gia importati nei rispettivi test.
- **Regressioni attese gestite:** i 2 test esistenti su `runTurn` (versione) aggiornati esplicitamente in Task 2 Step 5 (da v1→v2 e v2→v3) — sono il riflesso corretto del nuovo comportamento (narrazione = evento persistito).

## Roadmap (dopo F4)

F4 chiude il finding centrale. Restano (fuori ambito, vedi spec §7 e HANDOFF): qualita estrazione su modelli deboli (F3/G5 oltre il prompt: constrained decoding/modello forte); **G6** (coercizione argomenti array stringificati — `participants`/`facts`); segmentazione `reflect` per scena (collisione id 2a reflect); `record_fact` (Approccio B/C); tool engine `request_check`/`apply_effect`/`advance_quest` + **FSM di fase** §5.5; poi **Piano 10 — UI** (ora costruibile su una memoria che ricorda la storia).

## Execution handoff

Processo HANDOFF §4: branch dedicato `feat/f4-storia-in-canone` → subagent-driven (implementer + spec review + code-quality review per task) → final review del branch → `finishing-a-development-branch` (merge locale fast-forward) → aggiorna memoria + HANDOFF. Modello a discrezione dell orchestratore per ruolo. Rispetta le house rules §5 (scope discipline, verifica empirica del feedback, hardening solo su rami reali, niente over-engineering).
