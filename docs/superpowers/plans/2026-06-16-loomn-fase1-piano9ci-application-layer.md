# Piano 9c-i — Application layer della campagna (core testabile su ABI Node) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire il livello applicativo della campagna — il **write side** (Command → `decide` → persisti → proietta), la **proiezione read side** in memoria, il **turno agentico** dietro un servizio, la **Reflection**, e il **provider AI reale** (model + structured output) — interamente in `@loomn/host` + un `commandSchema` di confine in `@loomn/shared`, **tutto unit-testabile su ABI Node** (`createMemorySystem(':memory:')` con SQLite reale + fake `LanguageModel`/transport), senza Electron e senza la nativa ricompilata.

**Architecture:** Architettura esagonale: l'**application service** vive in `@loomn/host` (l'unico pacchetto che compone `engine` + `memory` + `ai`) e lavora **solo in tipi del motore** (`Command`/`GameState`/`DomainEvent`), a porte iniettate (`MemorySystem`, `LanguageModel`, `StructuredOutputPort`, `RandomSource`). Electron (Piano 9c-ii) ne sarà un **adapter IPC sottile**: il servizio non sa nulla del processo. Il `commandSchema` (validazione del payload non fidato renderer→main, spec §4) vive in `@loomn/shared` (foglia). Questo piano NON tocca `app/desktop` né la nativa: i 235 test restano verdi su ABI Node e il conflitto ABI Node↔Electron resta **interamente confinato** al Piano 9c-ii (gate "esegui l'app").

**Tech Stack:** TypeScript strict (ESM, `verbatimModuleSyntax`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), pnpm workspaces, Vitest, Zod. Riusa `@loomn/engine` (ES puro), `@loomn/memory` (SQLite/Drizzle dietro le porte), `@loomn/ai` (adapter OpenAI-compat + StructuredOutputPort) — composti, non modificati.

**Riferimenti spec (autorità):** `docs/superpowers/specs/2026-06-15-simulatore-campagne-ai-design.md` — §5.1 (Event Sourcing + CQRS), §5.2 (CQRS attraverso i processi: write side autorevole, read side proiezione — qui costruiamo la **logica**, l'IPC è 9c-ii), §5.4 (AI Master come pipeline esplicita), §5.6 (concorrenza ottimistica/ordinamento), §6.1 (Reflection), §6.2 (Context Assembler, già composto in 9b), §4 (validazione Zod ai confini). Continuità: `docs/superpowers/HANDOFF.md` §7-ter (API di `@loomn/host` consegnata dal 9b), §7-bis (groundwork nativo già verificato — è materia del 9c-ii), §0/§9.

---

## Perché questo piano è "9c-i" (e cosa NON è)

Il Piano 9 è splittato in **9a** (shell Electron, fatto), **9b** (wiring memoria+AI in `@loomn/host`, fatto), **9c** (IPC write/read reale + persistenza nell'app). Il 9c ha due nature di verifica radicalmente diverse:

1. **Logica applicativa** (write/read/turn/reflect, provider): **pura, testabile su ABI Node** con SQLite reale `:memory:` + fake del modello. → **questo piano (9c-i)**.
2. **Integrazione Electron** (DB su `userData` dentro Electron, handler IPC, `safeStorage`, plugin Vite che copia le migrazioni in `out/migrations`, ricompilazione nativa per ABI Electron): verificabile **solo eseguendo l'app**. → **Piano 9c-ii** (prossimo).

Confinare la ricompilazione nativa (che capovolge l'ABI dell'intero repo: `pnpm test` si rompe finché non si ripristina) **interamente** nel 9c-ii è la ragione architetturale dello split: 9c-i si esegue col rituale TDD subagent-driven standard e **chiude con la suite tutta verde**; il rischio ABI tocca un solo gate, alla fine del 9c-ii.

**9c-i NON fa:** nessun file in `app/desktop`, nessun `electron`/`@electron/rebuild`, nessun `safeStorage`, nessun handler IPC, nessun plugin Vite, nessuna evoluzione di `readModelPushSchema`/`LoomnBridge`/rimozione di `ping` (quelle riscrivono la shell 9a → sono 9c-ii). Nessun nuovo `Command`/`Event` del motore, nessuna FSM di fase (traccia engine separata). Nessun tokenizer reale, nessun L3/RAG (Fase 2).

---

## Contesto: cosa esiste già (non reimplementarlo)

Tutto mergiato in `main`, **235 test verdi**, `pnpm -r typecheck` pulito (7 progetti).

- **`@loomn/engine`** (ES puro): `decide(state, command, rng): DomainEvent[]` (valida il Command, consuma l'RNG, registra i fatti risolti); `applyEvent(state, event): GameState` (proiezione pura, niente RNG); `rebuild(stored: StoredEvent[], snapshot?): GameState`; `initialState`; `replay`; `createSeededRandom(seed): RandomSource` (mulberry32). Tipi: `Command` (5 varianti: `AddActor`/`StartEncounter`/`EndTurn`/`NextRound`/`Attack`), `DomainEvent`, `GameState` (`{version, actors, encounter}`), `StoredEvent` (`{seq, event}`), `RandomSource`, `Actor`, `Modifier` (`{value, source}`), `ConcurrencyError`. `Command.Attack` ha i campi opzionali `attribute?`/`skill?`/`damageModifiers?` (sotto `exactOptionalPropertyTypes`: assenti o del tipo esatto, **mai** `| undefined`).
- **`@loomn/shared`** (foglia, solo `zod`): `domain-schema.ts` con `domainEventSchema`/`gameStateSchema` (Zod, **unica fonte** di validazione ai confini; cast-free via `.transform()` sui 4 campi opzionali, verificato). Building block **module-local** (non esportati): `actorSchema`, `participantSchema`, `encounterSchema`, `resourcePoolSchema`, ecc. `ipc.ts` con `IPC_CHANNELS`/schemi/tipi del 9a (`ping`, `readModelPush`, `LoomnBridge`) — **9c-i non li tocca**. Barrel: `export * from './domain-schema'` + `export * from './ipc'`.
- **`@loomn/ai`** (`ai → engine`): porta `LanguageModel` (async/streaming) + `collectResponse`; `createOpenAiCompatibleModel(config)` (config `{baseUrl, model, apiKey?, transport, tracer?}`) su `HttpTransport` **iniettabile** (`createFetchTransport(fetchImpl=fetch)`); `createStructuredOutput(model, {tracer?, strategies?}): StructuredOutputPort` (3 livelli di fallback, Zod come gate); `runMasterTurn(request)` con `MasterTurnRequest = {model, rng, state, playerAction, tracer?, maxIterations?, assembleContext?}` → `{state, events, narration, invocations, transcript}` (assembler iniettato al posto di `assembleContextStub`); `masterToolDefs`/`resolveToolCall` (5 strumenti mappati 1:1 ai `Command`; `spawn_npc` accetta `{id, name, attributes?, skills?, resources?}` → `AddActor`). Tipi: `LlmStreamEvent`, `LlmMessage`, `TracingPort`, `HttpTransport`/`HttpRequest`/`HttpResponse`, `StructuredOutputPort`/`StructuredOutputRequest`/`StructuredOutputResult`.
- **`@loomn/host`** (composizione `engine`+`memory`+`ai`, deps engine/memory/ai + zod): `createMemorySystem(dbPath, config?): MemorySystem` → **UNA** connessione SQLite con `{ eventStore, ledger, summaries, clock, assembleContext, close }` (`eventStore` ha `version()`/`append(events, expectedVersion)`/`load(): StoredEvent[]`); `systemClock`; `createLlmFactExtractor`/`createLlmSummarizer`/`reflectionDepsFor(system, port): ReflectionDeps`/`renderEventsForReflection`. `@loomn/memory` esporta `runReflection(deps, input): Promise<ReflectionResult>` (`input = {events: StoredEvent[], scope}` → `{facts, summary}`).

**Già verificato (HANDOFF §7-bis/§7-ter):** `createMemorySystem(':memory:')` monta event store + ledger + summaries + assembler sulla **stessa** connessione (letture coerenti, concorrenza ottimistica); su ABI Node i test girano con better-sqlite3 reale (nessun bisogno della nativa Electron). La composizione `ai`+`memory` vive **solo** in `@loomn/host`.

---

## Decisioni di progetto (motivate — sfidabili dai reviewer)

1. **Application service in `@loomn/host`, a porte iniettate.** `createCampaignService({ memory, model, structured, rng })` espone `getReadModel`/`dispatch`/`runTurn`/`reflect`. Lavora **solo in tipi del motore**. Electron (9c-ii) lo costruisce con DB reale + provider reale e gli appende sopra gli handler IPC. → il 95% della logica del 9c è testabile su ABI Node; l'adapter Electron resta sottile (spec §3 "il dominio non conosce Electron").
2. **Proiezione in-memory, ricostruita dallo stream.** Il servizio tiene `state: GameState` in RAM, `rebuild(eventStore.load())` alla costruzione, avanzato con `applyEvent` a ogni `append` (spec §9 "proiezioni in-memory + snapshot persistiti"). Il read model spinto al renderer (9c-ii) è uno **snapshot** `{ version, state }`; il protocollo delta (spec §13) è rimandato (YAGNI). *In 9c-i definiamo solo il TIPO `ReadModel`, non lo schema IPC — quello è 9c-ii.*
3. **Concorrenza ottimistica + serializzazione FIFO.** `append(events, expectedVersion)` usa la versione **all'inizio** dell'operazione. Il turno agentico è asincrono (await sul modello): un `dispatch` interfogliato durante l'attesa farebbe fallire l'`append` del turno con `ConcurrencyError`. Una **coda FIFO** (catena di Promise) serializza `dispatch`/`runTurn`/`reflect` → niente fallimenti spuri, ordinamento esplicito (spec §5.6 "correttezza, non gratis"). Non è over-engineering: è la sola primitiva di correttezza, niente broker/bus (spec §9 "dove NON aggiungere complessità").
4. **`commandSchema` in `@loomn/shared`, cast-free.** Riusa `actorSchema` + nuovi `modifierSchema`/`participantInputSchema`. **`z.union`** (non `z.discriminatedUnion`): la variante `Attack` richiede `.transform()` per i campi opzionali cast-free (`exactOptionalPropertyTypes`), e `discriminatedUnion` accetta solo membri `ZodObject`, non `ZodEffects`. L'assegnabilità a `Command` del motore è provata da un test di integrazione in `host` (`commandSchema.parse(...) → service.dispatch(...)`), che è anche il **drift guard** wire↔motore.
5. **Provider AI come factory testabile.** `createLanguageProvider({ baseUrl, model, apiKey?, transport?, tracer? }): { model, structured }` compone 7a+7b. Il `transport` è **iniettabile** (default `createFetchTransport()`): i test usano un fake SSE, **nessuna rete**. La gestione delle chiavi (`safeStorage`) e l'IO del file di settings restano nell'adapter Electron (9c-ii): la factory riceve la chiave **già in chiaro**, host resta agnostico dal processo.
6. **RNG seedato iniettato.** Il servizio riceve un `RandomSource`. `decide` lo consuma e registra i fatti negli Event → il **replay resta deterministico senza RNG** (l'app può ricostruirsi a ogni avvio). La sorgente del seed (per-campagna, persistito) è un **follow-up**: in 9c-ii l'app userà un seed costante di sviluppo (nessun `Date.now` fuori da `host/clock.ts`). In 9c-i i test iniettano `createSeededRandom(1)`.

---

## Disciplina di scope (CRITICA — vale per OGNI task subagent)

1. Ogni subagent modifica **SOLO** i file elencati nel suo task. Esegue `git status --short` prima del commit e verifica che l'insieme dei file toccati coincida con la lista.
2. **MAI** toccare `package.json`, `tsconfig*.json`, `vitest.config.ts`, `pnpm-workspace.yaml`, `tsconfig.base.json`. **MAI** creare un tsconfig di root o aggiungere `composite`/project references. L'aggiunta della dipendenza `@loomn/shared` (devDep) a `@loomn/host` e il `pnpm install` sono **passi dell'orchestratore** (vedi "Setup orchestratore"), non di un subagent.
3. Crea i file con lo strumento **Write** (NON `New-Item -Force`, che tronca).
4. Niente apostrofi nelle descrizioni `it('...')`/`describe('...')` in apici singoli (`l'`, `un'`, `dell'`, `c'è` spezzano la stringa JS). Scrivi `l attore`, `c e`, `e` per `è`; `è/é` come lettere in mezzo a parola vanno bene. **Grep di verifica:** `(it|describe)\('[^']*'[A-Za-zàèéìòù]` → no matches.
5. TS strict: `exactOptionalPropertyTypes` → niente `campo: undefined`; usa **spread condizionali** `...(x !== undefined ? { campo: x } : {})`. `verbatimModuleSyntax` → `import type` per i soli tipi. `noUncheckedIndexedAccess` → l'accesso a array/`Record` è `T | undefined` (usa `?.`/`?? default`).
6. NON modificare `app/desktop`, né `@loomn/ai`/`@loomn/memory`/`@loomn/engine` (si **compongono**, non si toccano), né `packages/shared/src/ipc.ts` (è materia del 9c-ii).

---

## File Structure

| File | Responsabilità | Task |
|---|---|---|
| `packages/shared/src/domain-schema.ts` (modifica) | Aggiunge `modifierSchema`, `participantInputSchema`, `commandSchema` (export). Riusa `actorSchema`. | 1 |
| `packages/shared/src/command-schema.test.ts` (nuovo) | Test di `commandSchema`: happy path per variante, omissione cast-free degli opzionali, rifiuti. | 1 |
| `packages/host/src/provider.ts` (nuovo) | `createLanguageProvider(config): { model, structured }` (compone adapter OpenAI-compat + StructuredOutputPort; transport iniettabile). | 2 |
| `packages/host/src/provider.test.ts` (nuovo) | Test con fake transport (SSE): id del modello, streaming, header Authorization con/senza apiKey. | 2 |
| `packages/host/src/index.ts` (modifica) | Esporta `createLanguageProvider` + tipi (Task 2) e `createCampaignService` + tipi (Task 3). | 2, 3 |
| `packages/host/package.json` (modifica) | Aggiunge `@loomn/shared` come **devDependency** (solo il test del Task 3 lo importa). **Passo orchestratore.** | Setup |
| `packages/host/src/campaign-service.ts` (nuovo) | `createCampaignService(deps)`: write side + proiezione + turno + reflection, serializzati FIFO. | 3 |
| `packages/host/src/campaign-service.test.ts` (nuovo) | Test: dispatch/persistenza/proiezione, rebuild, Command da `commandSchema`, rifiuto invarianti, runTurn (assembler iniettato + persistenza), reflect, serializzazione. | 3 |

---

## Setup orchestratore (PRIMA del Task 3) — NON è un task subagent

> L'orchestratore lo esegue a mano (aggiungere una dipendenza è competenza dell'orchestratore, house rule). Va fatto **dopo** il Task 2 e **prima** del Task 3 (il test del Task 3 importa `commandSchema` da `@loomn/shared`).

- [ ] **Setup-1: Aggiungi `@loomn/shared` come devDependency di `@loomn/host`.**

In `packages/host/package.json`, dentro `"devDependencies"`, aggiungi la riga `@loomn/shared` accanto a `@types/node`:

```json
  "devDependencies": {
    "@loomn/shared": "workspace:*",
    "@types/node": "^22.10.5"
  }
```

> **Decisione (YAGNI):** `@loomn/shared` è **devDependency**, non `dependency`: nessun file di produzione di `host` importa `shared` (il servizio lavora in tipi del motore). Solo `campaign-service.test.ts` importa `commandSchema` per provare l'assegnabilità wire→motore. L'app reale (9c-ii) importerà `commandSchema` direttamente da `@loomn/shared`, non via host. (Coerente con la nota del 9b: shared si aggiunge a host "se/quando un import reale lo richiede".)

- [ ] **Setup-2: Installa/collega il workspace.**

Run: `pnpm install`
Expected: pnpm collega `@loomn/shared` in `packages/host/node_modules`, nessun errore. `vitest.config.ts` (`packages/**/*.test.ts`) e `pnpm -r typecheck` includono già host: NON vanno modificati.

- [ ] **Setup-3: Sanity check pre-Task-3.**

Run: `pnpm -C packages/host typecheck`
Expected: nessun errore (host ancora con i soli file del 9b + provider.ts del Task 2).

---

## Task 1: `commandSchema` di confine in `@loomn/shared`

**Files:**
- Modify: `packages/shared/src/domain-schema.ts`
- Test: `packages/shared/src/command-schema.test.ts` (nuovo)

**Disciplina di scope:** modifica SOLO questi 2 file. NON toccare `ipc.ts`, `package.json`, `tsconfig*`, `vitest.config.ts`. `@loomn/shared` resta foglia: NON importare `engine`/`electron`/altri `@loomn/*`. Il barrel (`index.ts`) ri-esporta già `* from './domain-schema'` → `commandSchema` esce automaticamente, **non** modificare `index.ts`.

- [ ] **Step 1: Scrivi il test che fallisce** (`packages/shared/src/command-schema.test.ts`)

```typescript
import { describe, it, expect } from 'vitest';
import { commandSchema } from './domain-schema';

function sampleActor(id: string): unknown {
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

describe('commandSchema', () => {
  it('valida AddActor con un attore completo', () => {
    const parsed = commandSchema.parse({ type: 'AddActor', actor: sampleActor('goblin') });
    expect(parsed.type).toBe('AddActor');
  });

  it('valida StartEncounter con participant input senza actedThisRound', () => {
    const parsed = commandSchema.parse({
      type: 'StartEncounter',
      encounterId: 'enc1',
      participants: [{ actorId: 'goblin', zone: 'A', initiative: 12 }],
    });
    expect(parsed).toEqual({
      type: 'StartEncounter',
      encounterId: 'enc1',
      participants: [{ actorId: 'goblin', zone: 'A', initiative: 12 }],
    });
  });

  it('valida EndTurn e NextRound', () => {
    expect(commandSchema.parse({ type: 'EndTurn' })).toEqual({ type: 'EndTurn' });
    expect(commandSchema.parse({ type: 'NextRound' })).toEqual({ type: 'NextRound' });
  });

  it('valida Attack minimale e OMETTE i campi opzionali assenti (cast-free)', () => {
    const parsed = commandSchema.parse({
      type: 'Attack',
      attackerId: 'a',
      targetId: 'b',
      defense: 'difesa',
      defenseBase: 10,
      damageResource: 'hp',
    });
    expect(parsed).toEqual({
      type: 'Attack',
      attackerId: 'a',
      targetId: 'b',
      defense: 'difesa',
      defenseBase: 10,
      damageResource: 'hp',
    });
    expect('attribute' in parsed).toBe(false);
    expect('skill' in parsed).toBe(false);
    expect('damageModifiers' in parsed).toBe(false);
  });

  it('valida Attack completo con modificatori di danno', () => {
    const parsed = commandSchema.parse({
      type: 'Attack',
      attackerId: 'a',
      targetId: 'b',
      attribute: 'forza',
      skill: 'spade',
      defense: 'difesa',
      defenseBase: 10,
      damageResource: 'hp',
      damageModifiers: [{ value: 2, source: 'forza' }],
    });
    expect(parsed).toMatchObject({
      attribute: 'forza',
      skill: 'spade',
      damageModifiers: [{ value: 2, source: 'forza' }],
    });
  });

  it('rifiuta un tipo sconosciuto', () => {
    expect(() => commandSchema.parse({ type: 'Teleport' })).toThrow();
  });

  it('rifiuta AddActor senza attore', () => {
    expect(() => commandSchema.parse({ type: 'AddActor' })).toThrow();
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm -C packages/shared exec vitest run src/command-schema.test.ts`
Expected: FAIL — `commandSchema` non è esportato da `./domain-schema` (`does not provide an export named 'commandSchema'`).

- [ ] **Step 3: Aggiungi `commandSchema` a `packages/shared/src/domain-schema.ts`** (in fondo al file, dopo `gameStateSchema`)

```typescript

// --- Command (intenzione, spec 5.1): schema Zod del payload IPC non fidato (renderer->main, spec 4).
// Riusa i building block del motore (actorSchema, ...). z.union e NON z.discriminatedUnion perche
// la variante Attack usa .transform() per i campi opzionali cast-free (exactOptionalPropertyTypes):
// discriminatedUnion accetta solo membri ZodObject, non i ZodEffects prodotti da .transform().

const modifierSchema = z.object({ value: z.number(), source: z.string() });

const participantInputSchema = z.object({
  actorId: z.string(),
  zone: z.string(),
  initiative: z.number(),
});

// Attack ha 3 campi opzionali: il .transform() li OMETTE quando assenti, cosi il tipo inferito
// non porta `| undefined` ed e assegnabile 1:1 a Command.Attack sotto exactOptionalPropertyTypes.
const attackCommandSchema = z
  .object({
    type: z.literal('Attack'),
    attackerId: z.string(),
    targetId: z.string(),
    attribute: z.string().optional(),
    skill: z.string().optional(),
    defense: z.string(),
    defenseBase: z.number(),
    damageResource: z.string(),
    damageModifiers: z.array(modifierSchema).optional(),
  })
  .transform((o) => ({
    type: o.type,
    attackerId: o.attackerId,
    targetId: o.targetId,
    defense: o.defense,
    defenseBase: o.defenseBase,
    damageResource: o.damageResource,
    ...(o.attribute !== undefined ? { attribute: o.attribute } : {}),
    ...(o.skill !== undefined ? { skill: o.skill } : {}),
    ...(o.damageModifiers !== undefined ? { damageModifiers: o.damageModifiers } : {}),
  }));

/** Schema Zod dell unione Command del motore (spec 5.1). Validazione del payload IPC non fidato
 *  (renderer->main, spec 4). L inferenza e cast-free assegnabile 1:1 a Command (provato in host). */
export const commandSchema = z.union([
  z.object({ type: z.literal('AddActor'), actor: actorSchema }),
  z.object({
    type: z.literal('StartEncounter'),
    encounterId: z.string(),
    participants: z.array(participantInputSchema),
  }),
  z.object({ type: z.literal('EndTurn') }),
  z.object({ type: z.literal('NextRound') }),
  attackCommandSchema,
]);
```

- [ ] **Step 4: Esegui il test e verifica che passa**

Run: `pnpm -C packages/shared exec vitest run src/command-schema.test.ts`
Expected: PASS — 7 test verdi.

- [ ] **Step 5: Suite + typecheck del pacchetto (nessuna regressione)**

Run: `pnpm -C packages/shared exec vitest run`
Expected: PASS — i 7 nuovi + i preesistenti (`domain-schema.test.ts` 7, `ipc.test.ts` 6) verdi.

Run: `pnpm -C packages/shared typecheck`
Expected: nessun errore.

- [ ] **Step 6: Verifica scope e commit**

Run: `git status --short`
Expected: esattamente `M packages/shared/src/domain-schema.ts`, `?? packages/shared/src/command-schema.test.ts`.

```bash
git add packages/shared/src/domain-schema.ts packages/shared/src/command-schema.test.ts
git commit -m "feat(shared): commandSchema cast-free per la validazione IPC dei Command"
```

**Conteggio test atteso (cumulativo):** 235 → **242** (+7).

---

## Task 2: `createLanguageProvider` — provider AI reale (in `@loomn/host`)

**Files:**
- Create: `packages/host/src/provider.ts`
- Modify: `packages/host/src/index.ts`
- Test: `packages/host/src/provider.test.ts`

**Disciplina di scope:** crea/modifica SOLO questi 3 file. NON toccare `package.json`/`tsconfig`/`vitest.config`. Nessuna dipendenza nuova (engine/memory/ai/zod sono già nel manifesto di host). NON modificare `@loomn/ai`.

- [ ] **Step 1: Scrivi il test che fallisce** (`packages/host/src/provider.test.ts`)

```typescript
import { describe, it, expect } from 'vitest';
import {
  collectResponse,
  type HttpRequest,
  type HttpResponse,
  type HttpTransport,
} from '@loomn/ai';
import { createLanguageProvider } from './provider';

/** Transport fake: ignora il body della richiesta e riproduce un corpo SSE prefissato (nessuna rete). */
function fakeTransport(sseLines: string[]): { transport: HttpTransport; seen: () => HttpRequest[] } {
  const seen: HttpRequest[] = [];
  const encoder = new TextEncoder();
  const transport: HttpTransport = async (request) => {
    seen.push(request);
    const res: HttpResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      body: async function* () {
        for (const line of sseLines) yield encoder.encode(line);
      },
      text: async () => '',
    };
    return res;
  };
  return { transport, seen: () => seen };
}

const TEXT_SSE = [
  'data: {"choices":[{"delta":{"content":"Ciao"}}]}\n\n',
  'data: {"choices":[{"delta":{"content":" mondo"},"finish_reason":"stop"}]}\n\n',
  'data: [DONE]\n\n',
];

describe('createLanguageProvider', () => {
  it('espone un model con l id del modello configurato e uno structured port', () => {
    const { transport } = fakeTransport(TEXT_SSE);
    const provider = createLanguageProvider({ baseUrl: 'http://x/v1', model: 'm-test', transport });
    expect(provider.model.id).toBe('m-test');
    expect(typeof provider.structured.generate).toBe('function');
  });

  it('il model fa streaming via il transport iniettato (nessuna rete reale)', async () => {
    const { transport, seen } = fakeTransport(TEXT_SSE);
    const provider = createLanguageProvider({ baseUrl: 'http://x/v1', model: 'm-test', transport });
    const res = await collectResponse(provider.model.stream({ messages: [{ role: 'user', content: 'ehi' }] }));
    expect(res.text).toBe('Ciao mondo');
    expect(seen()).toHaveLength(1);
    expect(seen()[0]?.url).toBe('http://x/v1/chat/completions');
  });

  it('inietta l header Authorization quando apiKey e presente', async () => {
    const { transport, seen } = fakeTransport(TEXT_SSE);
    const provider = createLanguageProvider({ baseUrl: 'http://x/v1', model: 'm', apiKey: 'sk-secret', transport });
    await collectResponse(provider.model.stream({ messages: [{ role: 'user', content: 'x' }] }));
    expect(seen()[0]?.headers['authorization']).toBe('Bearer sk-secret');
  });

  it('senza apiKey non manda Authorization (path LM Studio locale)', async () => {
    const { transport, seen } = fakeTransport(TEXT_SSE);
    const provider = createLanguageProvider({ baseUrl: 'http://x/v1', model: 'm', transport });
    await collectResponse(provider.model.stream({ messages: [{ role: 'user', content: 'x' }] }));
    expect(seen()[0]?.headers['authorization']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm -C packages/host exec vitest run src/provider.test.ts`
Expected: FAIL — `./provider` non esiste (`Failed to resolve import` o `does not provide an export named 'createLanguageProvider'`).

- [ ] **Step 3: Crea `packages/host/src/provider.ts`**

```typescript
// Provider AI reale: composizione di 7a (adapter OpenAI-compat) + 7b (StructuredOutputPort).
// Costruisce sia il LanguageModel (per runMasterTurn) sia lo StructuredOutputPort (per la
// Reflection). Il transport e INIETTABILE -> testabile senza rete (default: createFetchTransport(),
// fetch globale, usato dall app reale nel 9c-ii). NON tocca safeStorage/IO: la chiave arriva gia
// in chiaro (decifrata dal main nel 9c-ii); host resta agnostico dal processo Electron.
import {
  createOpenAiCompatibleModel,
  createStructuredOutput,
  createFetchTransport,
  type LanguageModel,
  type StructuredOutputPort,
  type HttpTransport,
  type TracingPort,
} from '@loomn/ai';

export interface LanguageProviderConfig {
  /** URL base OpenAI-compatibile (es. http://localhost:1234/v1 per LM Studio). */
  baseUrl: string;
  /** Nome/id del modello passato al provider. */
  model: string;
  /** Chiave API gia in chiaro (assente per LM Studio locale). */
  apiKey?: string;
  /** Transport HTTP iniettabile (default: createFetchTransport(), fetch globale). */
  transport?: HttpTransport;
  /** Tracer opzionale (osservabilita, spec 7). Default: noopTracer dentro adapter/structured. */
  tracer?: TracingPort;
}

export interface LanguageProvider {
  /** Per runMasterTurn (turno agentico). */
  model: LanguageModel;
  /** Per la Reflection (createLlmFactExtractor/Summarizer via reflectionDepsFor). */
  structured: StructuredOutputPort;
}

/** Costruisce model + structured port da una config risolta. exactOptionalPropertyTypes -> spread
 *  condizionali (mai campo:undefined). */
export function createLanguageProvider(config: LanguageProviderConfig): LanguageProvider {
  const transport = config.transport ?? createFetchTransport();
  const model = createOpenAiCompatibleModel({
    baseUrl: config.baseUrl,
    model: config.model,
    transport,
    ...(config.apiKey !== undefined ? { apiKey: config.apiKey } : {}),
    ...(config.tracer !== undefined ? { tracer: config.tracer } : {}),
  });
  const structured = createStructuredOutput(model, {
    ...(config.tracer !== undefined ? { tracer: config.tracer } : {}),
  });
  return { model, structured };
}
```

- [ ] **Step 4: Estendi il barrel `packages/host/src/index.ts`** (aggiungi in fondo)

```typescript
export { createLanguageProvider, type LanguageProvider, type LanguageProviderConfig } from './provider';
```

- [ ] **Step 5: Esegui il test e verifica che passa**

Run: `pnpm -C packages/host exec vitest run src/provider.test.ts`
Expected: PASS — 4 test verdi.

- [ ] **Step 6: Suite + typecheck del pacchetto**

Run: `pnpm -C packages/host exec vitest run`
Expected: PASS — i 4 nuovi + gli 11 preesistenti del 9b.

Run: `pnpm -C packages/host typecheck`
Expected: nessun errore.

- [ ] **Step 7: Verifica scope e commit**

Run: `git status --short`
Expected: `M packages/host/src/index.ts`, `?? packages/host/src/provider.ts`, `?? packages/host/src/provider.test.ts`.

```bash
git add packages/host/src/provider.ts packages/host/src/provider.test.ts packages/host/src/index.ts
git commit -m "feat(host): createLanguageProvider (model + structured, transport iniettabile)"
```

**Conteggio test atteso (cumulativo):** 242 → **246** (+4).

---

## Task 3: `createCampaignService` — write side + proiezione + turno + reflection (in `@loomn/host`)

> **Precondizione:** Setup orchestratore (devDep `@loomn/shared` + `pnpm install`) già eseguito.

**Files:**
- Create: `packages/host/src/campaign-service.ts`
- Modify: `packages/host/src/index.ts`
- Test: `packages/host/src/campaign-service.test.ts`

**Disciplina di scope:** crea/modifica SOLO questi 3 file. NON toccare `package.json`/`tsconfig`/`vitest.config`. `@loomn/shared` è già nel manifesto (devDep, passo orchestratore): **importalo solo nel file di test**, NON in `campaign-service.ts`. NON modificare `app/desktop` né `@loomn/ai`/`@loomn/memory`/`@loomn/engine`.

- [ ] **Step 1: Scrivi il test che fallisce** (`packages/host/src/campaign-service.test.ts`)

```typescript
import { describe, it, expect } from 'vitest';
import { createSeededRandom, type Actor, type Command, type LlmStreamEvent as _Unused } from '@loomn/engine';
import {
  type LanguageModel,
  type LlmMessage,
  type LlmStreamEvent,
  type StructuredOutputPort,
  type StructuredOutputRequest,
  type StructuredOutputResult,
} from '@loomn/ai';
import { commandSchema } from '@loomn/shared';
import { createMemorySystem } from './memory-system';
import { createCampaignService, type CampaignServiceDeps } from './campaign-service';

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

/** Fake model che rigioca SEMPRE la stessa sequenza di stream (per i turni a singola iterazione). */
function fakeModel(streamEvents: LlmStreamEvent[]): LanguageModel {
  return {
    id: 'fake',
    async *stream() {
      for (const e of streamEvents) yield e;
    },
  };
}

/** Fake model che riproduce uno stream diverso a ogni chiamata (per i turni multi-iterazione). */
function scriptedModel(perCall: LlmStreamEvent[][]): LanguageModel {
  let i = 0;
  return {
    id: 'scripted',
    async *stream() {
      const events = perCall[i] ?? perCall[perCall.length - 1] ?? [];
      i += 1;
      for (const e of events) yield e;
    },
  };
}

/** Fake model che cattura i messaggi ricevuti e poi narra (per verificare l assembler iniettato). */
function recordingModel(streamEvents: LlmStreamEvent[]): { model: LanguageModel; captured: () => LlmMessage[] } {
  let messages: LlmMessage[] = [];
  return {
    model: {
      id: 'rec',
      async *stream(request) {
        messages = request.messages;
        for (const e of streamEvents) yield e;
      },
    },
    captured: () => messages,
  };
}

/** Porta structured che non viene mai chiamata (per i test che non esercitano la Reflection). */
const idlePort: StructuredOutputPort = {
  generate: async <T>(_request: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> => {
    throw new Error('structured port non previsto in questo test');
  },
};

function makeService(over: Partial<CampaignServiceDeps> = {}): {
  service: ReturnType<typeof createCampaignService>;
  memory: ReturnType<typeof createMemorySystem>;
} {
  const memory = over.memory ?? createMemorySystem(':memory:', { clock: { now: () => 1000 } });
  const service = createCampaignService({
    memory,
    model: over.model ?? fakeModel([{ type: 'finish', reason: 'stop' }]),
    structured: over.structured ?? idlePort,
    rng: over.rng ?? createSeededRandom(1),
  });
  return { service, memory };
}

describe('createCampaignService - dispatch (write side)', () => {
  it('all avvio la proiezione e vuota (versione 0)', () => {
    const { service, memory } = makeService();
    try {
      expect(service.getReadModel()).toEqual({ version: 0, state: { version: 0, actors: {}, encounter: null } });
    } finally {
      memory.close();
    }
  });

  it('dispatch(AddActor) persiste l Event, avanza la versione e la proiezione', async () => {
    const { service, memory } = makeService();
    try {
      const out = await service.dispatch({ type: 'AddActor', actor: actor('goblin', 'Goblin') });
      expect(out.events).toEqual([{ type: 'ActorAdded', actor: actor('goblin', 'Goblin') }]);
      expect(out.readModel.version).toBe(1);
      expect(out.readModel.state.actors['goblin']?.name).toBe('Goblin');
      expect(memory.eventStore.version()).toBe(1);
    } finally {
      memory.close();
    }
  });

  it('accetta un Command validato da commandSchema (confine IPC al motore, cast-free)', async () => {
    const { service, memory } = makeService();
    try {
      const wire: Command = commandSchema.parse({ type: 'AddActor', actor: actor('orc', 'Orc') });
      const out = await service.dispatch(wire);
      expect(out.readModel.state.actors['orc']?.name).toBe('Orc');
    } finally {
      memory.close();
    }
  });

  it('un Command che viola le invarianti viene rifiutato e non lascia Event', async () => {
    const { service, memory } = makeService();
    try {
      await service.dispatch({ type: 'AddActor', actor: actor('goblin', 'Goblin') });
      await expect(service.dispatch({ type: 'AddActor', actor: actor('goblin', 'Goblin') })).rejects.toThrow();
      expect(memory.eventStore.version()).toBe(1);
    } finally {
      memory.close();
    }
  });

  it('ricostruisce la proiezione dallo stream persistito a una nuova costruzione', async () => {
    const memory = createMemorySystem(':memory:', { clock: { now: () => 1000 } });
    try {
      const s1 = createCampaignService({
        memory,
        model: fakeModel([{ type: 'finish', reason: 'stop' }]),
        structured: idlePort,
        rng: createSeededRandom(1),
      });
      await s1.dispatch({ type: 'AddActor', actor: actor('goblin', 'Goblin') });
      const s2 = createCampaignService({
        memory,
        model: fakeModel([{ type: 'finish', reason: 'stop' }]),
        structured: idlePort,
        rng: createSeededRandom(1),
      });
      expect(s2.getReadModel().version).toBe(1);
      expect(s2.getReadModel().state.actors['goblin']?.name).toBe('Goblin');
    } finally {
      memory.close();
    }
  });
});

describe('createCampaignService - runTurn (AI dietro il servizio)', () => {
  it('runTurn inietta l assembler reale: il contesto include L1 e L1.5 dal MemorySystem', async () => {
    const { model, captured } = recordingModel([
      { type: 'text', delta: 'Il goblin ti osserva.' },
      { type: 'finish', reason: 'stop' },
    ]);
    const { service, memory } = makeService({ model });
    try {
      memory.ledger.record({ id: 'f1', subject: 'goblin', predicate: 'impugna', object: 'pugnale', eventSeq: 1 });
      await service.dispatch({ type: 'AddActor', actor: actor('goblin', 'Goblin') });
      const out = await service.runTurn('Osservo il goblin.');
      const systemContext = captured()
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n');
      expect(systemContext).toContain('Goblin'); // L1 (attore in scena)
      expect(systemContext).toContain('impugna'); // L1.5 (mai presente nello stub)
      expect(out.narration).toBe('Il goblin ti osserva.');
      expect(out.events).toEqual([]);
    } finally {
      memory.close();
    }
  });

  it('persiste gli Event prodotti dal turno (tool-call -> decide -> append)', async () => {
    const spawnArgs = JSON.stringify({ id: 'png1', name: 'Locandiere' });
    const model = scriptedModel([
      [
        { type: 'tool-call', id: 't1', name: 'spawn_npc', arguments: spawnArgs },
        { type: 'finish', reason: 'tool_calls' },
      ],
      [
        { type: 'text', delta: 'Un locandiere appare.' },
        { type: 'finish', reason: 'stop' },
      ],
    ]);
    const { service, memory } = makeService({ model });
    try {
      const out = await service.runTurn('Entro nella taverna.');
      expect(out.events.some((e) => e.type === 'ActorAdded')).toBe(true);
      expect(out.narration).toBe('Un locandiere appare.');
      expect(out.readModel.version).toBe(1);
      expect(out.readModel.state.actors['png1']?.name).toBe('Locandiere');
      expect(memory.eventStore.version()).toBe(1);
    } finally {
      memory.close();
    }
  });
});

describe('createCampaignService - reflect e serializzazione', () => {
  it('reflect estrae fatti e riassunto, e il read path li recupera', async () => {
    const port: StructuredOutputPort = {
      generate: async <T>(request: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> => {
        if (request.schemaName === 'extract_facts') {
          const value = {
            facts: [{ subject: 'Goblin', predicate: 'ha_rubato', object: 'la gemma', functional: false, importance: 8 }],
          };
          return { value: value as T, strategy: 'function-call' };
        }
        const draft = { text: 'Il goblin ha rubato la gemma.', importance: 8 };
        return { value: draft as T, strategy: 'function-call' };
      },
    };
    const { service, memory } = makeService({ structured: port });
    try {
      await service.dispatch({ type: 'AddActor', actor: actor('goblin', 'Goblin') });
      const out = await service.reflect('sess-1');
      expect(out.factCount).toBe(1);
      expect(out.summarized).toBe(true);
      const ctx = memory.assembleContext(service.getReadModel().state);
      expect(ctx).toContain('ha_rubato'); // L1.5 affiorato in lettura
      expect(ctx).toContain('Il goblin ha rubato la gemma'); // L2 affiorato in lettura
    } finally {
      memory.close();
    }
  });

  it('serializza turno e dispatch concorrenti: nessun ConcurrencyError, ordine FIFO', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let firstCall = true;
    const model: LanguageModel = {
      id: 'gated',
      async *stream() {
        if (firstCall) {
          firstCall = false;
          await gate;
          yield { type: 'tool-call', id: 't1', name: 'spawn_npc', arguments: JSON.stringify({ id: 'png1', name: 'Locandiere' }) };
          yield { type: 'finish', reason: 'tool_calls' };
          return;
        }
        yield { type: 'text', delta: 'Il locandiere saluta.' };
        yield { type: 'finish', reason: 'stop' };
      },
    };
    const { service, memory } = makeService({ model });
    try {
      const turn = service.runTurn('Entro.'); // si accoda e si blocca sul gate
      const disp = service.dispatch({ type: 'AddActor', actor: actor('goblin', 'Goblin') }); // accodato DOPO
      release();
      const [turnOut, dispOut] = await Promise.all([turn, disp]);
      expect(turnOut.events.some((e) => e.type === 'ActorAdded')).toBe(true);
      expect(dispOut.readModel.version).toBe(2); // turno (v1) poi dispatch (v2), senza conflitto
      expect(memory.eventStore.version()).toBe(2);
      const finalState = service.getReadModel().state;
      expect(finalState.actors['png1']?.name).toBe('Locandiere');
      expect(finalState.actors['goblin']?.name).toBe('Goblin');
    } finally {
      memory.close();
    }
  });
});
```

> **Nota sull import:** la riga `type LlmStreamEvent as _Unused` da `@loomn/engine` NON esiste — **rimuovila**: `LlmStreamEvent` viene da `@loomn/ai`. Il blocco import corretto da `@loomn/engine` è `import { createSeededRandom, type Actor, type Command } from '@loomn/engine';`. (Lasciata qui come promemoria: l'implementer scriva l'import pulito.)

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm -C packages/host exec vitest run src/campaign-service.test.ts`
Expected: FAIL — `./campaign-service` non esiste (`does not provide an export named 'createCampaignService'`).

- [ ] **Step 3: Crea `packages/host/src/campaign-service.ts`**

```typescript
// Servizio applicativo della campagna: write side + proiezione read side (spec 5.1/5.2).
// Vive in @loomn/host (composizione): orchestra engine (decide/applyEvent/rebuild) + memoria
// (MemorySystem, UNA connessione) + AI (runMasterTurn con assembler reale iniettato; Reflection
// con porte LLM-backed). Tutto a porte INIETTATE -> testabile su ABI Node (createMemorySystem
// ':memory:' + fake model/port). Electron (9c-ii) ne sara solo l adapter IPC sottile.
// Le operazioni mutanti (dispatch/runTurn/reflect) sono SERIALIZZATE (coda FIFO): il turno
// agentico e asincrono e non deve interfogliarsi con i dispatch (concorrenza ottimistica, 5.6).
import {
  decide,
  applyEvent,
  rebuild,
  type Command,
  type DomainEvent,
  type GameState,
  type RandomSource,
} from '@loomn/engine';
import { runMasterTurn, type LanguageModel, type StructuredOutputPort } from '@loomn/ai';
import { runReflection } from '@loomn/memory';
import type { MemorySystem } from './memory-system';
import { reflectionDepsFor } from './reflection-ports';

export interface CampaignServiceDeps {
  /** Sottosistema di memoria su UNA connessione (event store + ledger + summaries + assembler). */
  memory: MemorySystem;
  /** Modello reale per il turno agentico (runMasterTurn). */
  model: LanguageModel;
  /** Porta structured output per la Reflection (extract/summarize). */
  structured: StructuredOutputPort;
  /** RNG seedato: decide lo consuma e registra i fatti risolti negli Event (replay senza RNG). */
  rng: RandomSource;
}

/** Proiezione di sola lettura (read side, spec 5.2). Snapshot completo (delta rimandato, spec 13).
 *  Il 9c-ii la spinge al renderer via IPC. */
export interface ReadModel {
  version: number;
  state: GameState;
}

export interface DispatchOutcome {
  events: DomainEvent[];
  readModel: ReadModel;
}

export interface TurnOutcome {
  narration: string;
  events: DomainEvent[];
  readModel: ReadModel;
}

export interface ReflectOutcome {
  factCount: number;
  summarized: boolean;
}

export interface CampaignService {
  /** Proiezione corrente (in-memory, sempre allineata all event store). */
  getReadModel(): ReadModel;
  /** Write side: valida il Command (decide), persiste gli Event (concorrenza ottimistica),
   *  avanza la proiezione. La Promise rigetta se il Command viola le invarianti (decide lancia). */
  dispatch(command: Command): Promise<DispatchOutcome>;
  /** Turno agentico (spec 5.4) dietro il servizio: assembler reale iniettato, Event reali persistiti. */
  runTurn(playerAction: string): Promise<TurnOutcome>;
  /** Reflection (spec 6.1) sull intero stream corrente come una scena (scope). */
  reflect(scope: string): Promise<ReflectOutcome>;
}

export function createCampaignService(deps: CampaignServiceDeps): CampaignService {
  // Proiezione in-memory ricostruita dallo stream all avvio (spec 9: proiezioni in-memory + snapshot).
  let state: GameState = rebuild(deps.memory.eventStore.load());

  // Coda FIFO: serializza le operazioni mutanti (niente interfogliamento del turno async col dispatch).
  let tail: Promise<unknown> = Promise.resolve();
  function enqueue<T>(op: () => T | Promise<T>): Promise<T> {
    const run = tail.then(op, op);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  const readModel = (): ReadModel => ({ version: state.version, state });

  return {
    getReadModel: readModel,

    dispatch(command: Command): Promise<DispatchOutcome> {
      return enqueue(() => {
        const expected = state.version;
        const events = decide(state, command, deps.rng);
        deps.memory.eventStore.append(events, expected);
        for (const ev of events) state = applyEvent(state, ev);
        return { events, readModel: readModel() };
      });
    },

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
        if (result.events.length > 0) {
          deps.memory.eventStore.append(result.events, startVersion);
          state = result.state;
        }
        return { narration: result.narration, events: result.events, readModel: readModel() };
      });
    },

    reflect(scope: string): Promise<ReflectOutcome> {
      return enqueue(async () => {
        const stored = deps.memory.eventStore.load();
        const res = await runReflection(reflectionDepsFor(deps.memory, deps.structured), {
          events: stored,
          scope,
        });
        return { factCount: res.facts.length, summarized: res.summary !== null };
      });
    },
  };
}
```

- [ ] **Step 4: Estendi il barrel `packages/host/src/index.ts`** (aggiungi in fondo)

```typescript
export {
  createCampaignService,
  type CampaignService,
  type CampaignServiceDeps,
  type ReadModel,
  type DispatchOutcome,
  type TurnOutcome,
  type ReflectOutcome,
} from './campaign-service';
```

- [ ] **Step 5: Esegui il test e verifica che passa**

Run: `pnpm -C packages/host exec vitest run src/campaign-service.test.ts`
Expected: PASS — 9 test verdi.

- [ ] **Step 6: Suite + typecheck del pacchetto**

Run: `pnpm -C packages/host exec vitest run`
Expected: PASS — i 9 nuovi + 4 (Task 2) + 11 (9b) = 24 test host verdi.

Run: `pnpm -C packages/host typecheck`
Expected: nessun errore (incluso `commandSchema.parse(...)` assegnato a `Command` nel test → assegnabilità wire→motore provata a compile-time).

- [ ] **Step 7: Verifica scope e commit**

Run: `git status --short`
Expected: `M packages/host/src/index.ts`, `?? packages/host/src/campaign-service.ts`, `?? packages/host/src/campaign-service.test.ts`. (Il `M packages/host/package.json` del Setup orchestratore è già committato a parte dall'orchestratore.)

```bash
git add packages/host/src/campaign-service.ts packages/host/src/campaign-service.test.ts packages/host/src/index.ts
git commit -m "feat(host): createCampaignService (write side, proiezione, turno, reflection serializzati)"
```

**Conteggio test atteso (cumulativo):** 246 → **255** (+9).

---

## Verifica finale dell'intero branch (orchestratore, prima del merge)

- [ ] **Suite completa dalla root**

Run: `pnpm test`
Expected: **255 test verdi** (235 baseline + 7 Task1 + 4 Task2 + 9 Task3).

- [ ] **Typecheck ricorsivo (mai `tsc -b`)**

Run: `pnpm -r typecheck`
Expected: `Scope: ... 7 workspace projects`, nessun errore su engine/shared/ai/memory/**host** + `app/desktop` (vue-tsc). `app/desktop` resta **invariato** (9c-i non lo tocca) e continua a usare il contratto IPC del 9a.

- [ ] **Grep anti-apostrofo nei test (house rule §5.4)**

Run (bash): `grep -rEn "(it|describe)\('[^']*'[A-Za-zàèéìòù]" packages/`
Expected: nessun match.

- [ ] **Conferma che il 9c-i NON ha toccato Electron/nativa**

Run (bash): `git diff --name-only <BASE>..HEAD`
Expected: solo file sotto `packages/shared/` e `packages/host/` (più `docs/superpowers/plans/` per il doc). Nessun file in `app/desktop/`, nessun `package.json` se non `packages/host/package.json`.

---

## Self-review (eseguita su questo piano)

**1. Copertura spec.**
- §5.1 (ES + CQRS: Command → Event → proiezione) → Task 3 (`dispatch`: `decide`→`append`→`applyEvent`; proiezione in-memory). ✅
- §5.2 (CQRS attraverso i processi: write side autorevole + read side proiezione) → Task 3 costruisce la **logica** del write side e la proiezione read side (`ReadModel`); l'attraversamento dei processi (IPC) è esplicitamente 9c-ii. ✅ (parziale per disegno dello split, dichiarato)
- §5.4 (AI Master come pipeline esplicita) → Task 3 (`runTurn` con `runMasterTurn` + assembler reale iniettato) + Task 2 (provider reale model). ✅
- §5.6 (concorrenza ottimistica / ordinamento) → Task 3 (`append(expectedVersion)` + coda FIFO; test di serializzazione). ✅
- §6.1 (Reflection) → Task 3 (`reflect` via `reflectionDepsFor` + `runReflection`) + provider `structured` (Task 2). ✅
- §6.2 (Context Assembler, read path) → composto dal 9b (`MemorySystem.assembleContext`), iniettato in `runTurn` (Task 3). ✅
- §4/§7 (validazione Zod ai confini; provider OpenAI-compat + StructuredOutputPort) → Task 1 (`commandSchema`) + Task 2 (`createLanguageProvider`). ✅
- Esplicitamente FUORI 9c-i (→ 9c-ii): IPC reale, persistenza su `userData` dentro Electron, `safeStorage`, nativa per ABI Electron, copia migrazioni in `out/migrations`. Dichiarato in "Perché questo piano è 9c-i". ✅

**2. Scan placeholder.** Nessun TODO/TBD/"simile a Task N"/"gestisci gli edge case". Tutto il codice è completo ed eseguibile. L'unico avviso è la **nota esplicita** nel test del Task 3 di rimuovere l'import-promemoria errato (`LlmStreamEvent as _Unused` da engine) e scrivere `import { createSeededRandom, type Actor, type Command } from '@loomn/engine';` — istruzione, non placeholder. ✅

**3. Coerenza dei tipi.** `CampaignServiceDeps` (memory/model/structured/rng) usato identico fra impl, barrel e `makeService`. `ReadModel` = `{version, state}` coerente in `getReadModel`/`DispatchOutcome`/`TurnOutcome`. `createLanguageProvider` ritorna `{model, structured}` (Task 2) iniettati come `model`/`structured` del servizio (Task 3). `commandSchema.parse(...)` (Task 1) assegnato a `Command` del motore (Task 3 test) → cast-free verificato a compile-time. `spawn_npc` args `{id, name}` combaciano con `spawnNpcSchema` di `@loomn/ai` (campi extra opzionali). `runMasterTurn` request usa i campi reali (`model/rng/state/playerAction/assembleContext`). `runReflection(deps, {events, scope})` e `reflectionDepsFor(memory, structured)` combaciano con le firme di `@loomn/memory`/`@loomn/host`. ✅

**4. House rules.** Scope discipline in ogni task; devDep + `pnpm install` come passo orchestratore (non subagent); `exactOptionalPropertyTypes` via spread condizionali (provider, commandSchema transform); `verbatimModuleSyntax` via `import type`; `noUncheckedIndexedAccess` via `?.` negli accessi a `Record` nei test; nessun apostrofo nelle descrizioni in apici singoli; `pnpm -r typecheck` (mai `tsc -b`); engine/memory/ai **composti non modificati**; `Date.now` assente (host/clock.ts del 9b resta l'unico punto; il servizio riceve il clock via `MemorySystem` e l'RNG iniettato); `shared` resta foglia (commandSchema non importa engine; l'assegnabilità è provata in host). ✅

---

## Roadmap dopo il Piano 9c-i

- **Piano 9c-i — Application layer della campagna** ← *questo piano* (`@loomn/host`: `createCampaignService` + `createLanguageProvider`; `@loomn/shared`: `commandSchema`; ~255 test, tutto ABI Node, suite verde).
- **Piano 9c-ii — Integrazione Electron (IPC reale + persistenza nell'app):** `app/desktop` apre il DB reale via `createMemorySystem(join(app.getPath('userData'),'loomn.db'))` **dentro Electron** (better-sqlite3 ricompilato per ABI Electron via `@electron/rebuild`; plugin Vite `closeBundle` che copia `packages/memory/migrations` in `out/migrations`; gestione conflitto ABI Node↔Electron — i test restano su ABI Node, "l'app apre il DB" si verifica eseguendo l'app). Evolve `@loomn/shared/ipc.ts` (canali `dispatch`/`run-turn`/`set-provider`/`reflect`, `readModelPush` → `{version, state}`, `LoomnBridge`, rimozione di `ping`); `main` istanzia `createCampaignService` + `createLanguageProvider` (chiavi via `safeStorage`, settings in `userData`) e monta gli handler IPC sottili sopra il servizio; preload aggiorna il bridge; renderer come diagnostica (un self-test `LOOMN_SELFTEST` che dispatcha un Command, logga `VERDICT:` con versione/read-model/`safeStorage`, poi `app.quit()` → gate scriptabile, non-GUI, non-rete). Conclude il Piano 9.
- **Traccia engine separata:** nuovi `Command`/`Event` per gli strumenti rimandati di 7c (`request_check`/`apply_effect`/`advance_quest` + contesto quest) e la **FSM di fase** (spec §5.5).
- **Piano 10 — UI Vue** (chat, scheda PG, pannello dadi 3D, journal, gestione provider): preceduto da fase di studio/design dedicata (brainstorming + `frontend-design`), NON si parte da `writing-plans`. Il `ReadModel = {version, state}` e i canali del 9c-ii sono il punto di aggancio per Pinia.
- **Piano 11 — Moduli a tema** (formato dati Zod + import/export + 1 modulo curato).

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-16-loomn-fase1-piano9ci-application-layer.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — un subagent fresco per task, spec review + code-quality review fra i task, final review dell'intero branch, poi `finishing-a-development-branch` (merge locale in main). Il passo "Setup orchestratore" (devDep `@loomn/shared` su host + `pnpm install`) lo eseguo io fra il Task 2 e il Task 3.

**2. Inline Execution** — eseguo i task in questa sessione con `executing-plans`, a blocchi con checkpoint di review.

**Quale approccio?**
