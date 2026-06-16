# Piano 9c-ii — Integrazione Electron (IPC reale + persistenza nell'app) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Montare l'application layer già pronto del 9c-i (`createCampaignService` + `createLanguageProvider`) dentro `app/desktop` dietro handler IPC sottili, con il DB SQLite reale aperto su `userData` dentro Electron e le chiavi provider cifrate con `safeStorage` — completando il Piano 9.

**Architecture:** Il `main` Electron è l'unico processo fidato (spec §5.2): apre **UNA** connessione via `@loomn/host` `createMemorySystem(userData/loomn.db)`, costruisce `createCampaignService` e lo espone dietro handler IPC `invoke/handle` che Zod-validano il payload non fidato renderer→main (`commandSchema`). Il read side è una proiezione `{version, state}` spinta al renderer (Pinia in Fase 2; qui un renderer diagnostico). Il provider AI si configura a runtime (`set-provider`): un'**indirezione app-side** (`provider-holder`) espone a `createCampaignService` un `model`/`structured` stabili che delegano al provider corrente, così `@loomn/host` non si modifica. Le parti non unit-testabili su ABI Node (main/preload/renderer/nativa) si verificano con `vue-tsc` + `electron-vite build` (entrambi su ABI Node) e un **gate finale "esegui l'app"** (self-test scriptabile a due lanci).

**Tech Stack:** TypeScript strict (ESM, `verbatimModuleSyntax`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Electron 42 (Node ABI 146), electron-vite 4, Vue 3, Zod, better-sqlite3@12 (ricompilato per ABI Electron al gate), Drizzle. Riusa `@loomn/host` (composizione), `@loomn/shared` (contratto IPC, foglia), `@loomn/engine` (RNG seedato).

**Riferimenti spec (autorità):** `docs/superpowers/specs/2026-06-15-simulatore-campagne-ai-design.md` — §5.2 (CQRS attraverso i processi: write side autorevole nel main, read side proiezione nel renderer), §5.1 (ES+CQRS), §6.3 (persistenza offline-first: SQLite rigenerabile dagli eventi), §4 (struttura main/preload/renderer; sicurezza `contextIsolation`/`sandbox`/`nodeIntegration:false`/`safeStorage`; validazione Zod ai confini), §5.4 (turno agentico), §6.1 (Reflection). Continuità: `docs/superpowers/HANDOFF.md` §7-quater (API del 9c-i da montare), §7-ter (`@loomn/host` del 9b), §7-bis (**groundwork nativo già verificato in sandbox — NON rifarlo**), §0/§9.

---

## Perché questo piano è "9c-ii" (e cosa NON è)

Il Piano 9 è splittato in **9a** (shell Electron, fatto), **9b** (`@loomn/host`, fatto), **9c**, e il **9c in 9c-i** (application layer su ABI Node, fatto) **/ 9c-ii** (questo). Lo split del 9c (deciso con l'utente) confina il pericoloso **flip ABI Node↔Electron** al solo gate finale del 9c-ii: la copia nativa di better-sqlite3 è condivisa nello store pnpm (un binario per versione, §7-bis), quindi ricompilarla per Electron rompe `pnpm test` (ABI Node) finché non si ripristina.

**Conseguenza sulla verifica (dichiarata, by design):** il codice app si **scrive/committa su ABI Node** — il typecheck (`vue-tsc`) e il bundling (`electron-vite build`, che **esternalizza** la nativa senza caricarla) girano su ABI Node e sono il gate automatico dei Task 2–4. Solo l'**esecuzione** dell'app carica la nativa: la verifica "l'app apre il DB / il giro IPC funziona / safeStorage cifra" si fa **eseguendo l'app ricompilata per Electron**, in un gate finale gestito dall'orchestratore (self-test `LOOMN_SELFTEST`). Subito dopo si **ripristina l'ABI Node** (`rebuild:node`) e si riconferma `pnpm test`.

**9c-ii NON fa:** nessun nuovo `Command`/`Event` del motore, nessuna FSM di fase (traccia engine separata, spec §5.5). Nessun tokenizer reale, nessun L3/RAG (Fase 2). **Nessuna UI reale** (Piano 10, preceduto da fase di studio): il renderer resta diagnostico. Nessuna chiamata LLM reale nel gate automatico (lo smoke test live LM Studio è **manuale**, documentato). Nessuna modifica a `@loomn/host`/`@loomn/ai`/`@loomn/memory`/`@loomn/engine` (si **compongono**, non si toccano). Nessun delta read-model (spec §13, rimandato): lo snapshot `{version, state}` basta. Seed RNG per-campagna persistito e segmentazione `reflect` per scena: **follow-up** (vedi in fondo).

---

## Contesto: cosa esiste già (non reimplementarlo)

Tutto mergiato in `main`, **258 test verdi**, `pnpm -r typecheck` pulito (engine/shared/ai/memory/host + `app/desktop` via `vue-tsc`).

- **`@loomn/host`** (`packages/host`, composizione engine+memory+ai) — barrel `src/index.ts`:
  - `createMemorySystem(dbPath: string, config?): MemorySystem` → apre **UNA** connessione better-sqlite3 e monta event store + Canon Ledger + Summary Store + Context Assembler sullo stesso handle. `MemorySystem = { eventStore, ledger, summaries, clock, assembleContext, close }`. `close()` chiude la connessione condivisa.
  - `createCampaignService(deps): CampaignService` con `deps = { memory: MemorySystem, model: LanguageModel, structured: StructuredOutputPort, rng: RandomSource }`. Espone `getReadModel(): ReadModel` (`{version, state: GameState}`, **`state` è un riferimento puntuale read-only**), `dispatch(command: Command): Promise<DispatchOutcome>` (`{events, readModel}`), `runTurn(playerAction: string): Promise<TurnOutcome>` (`{narration, events, readModel}`), `reflect(scope: string): Promise<ReflectOutcome>` (`{factCount, summarized}`). Operazioni mutanti serializzate in coda FIFO.
  - `createLanguageProvider(config): LanguageProvider` con `config = { baseUrl, model, apiKey?, transport?, tracer? }` → `{ model: LanguageModel, structured: StructuredOutputPort }`. `transport` default `createFetchTransport()` (fetch globale). Riceve la chiave **già in chiaro**.
  - Tipi esportati: `MemorySystem`, `CampaignService`, `CampaignServiceDeps`, `ReadModel`, `DispatchOutcome`, `TurnOutcome`, `ReflectOutcome`, `LanguageProvider`, `LanguageProviderConfig`.
- **`@loomn/ai`** — barrel esporta (fra gli altri): `type LanguageModel` (`{ readonly id: string; stream(request: LlmRequest): AsyncIterable<LlmStreamEvent> }`), `type LlmRequest`, `type LlmStreamEvent`, `type StructuredOutputPort` (`{ generate<T>(request: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> }`), `type StructuredOutputRequest`, `type StructuredOutputResult`.
- **`@loomn/engine`** — `createSeededRandom(seed: number): RandomSource` (mulberry32); tipi `Command` (5 varianti), `GameState` (`{version, actors, encounter}`), `RandomSource`; `initialState = {version:0, actors:{}, encounter:null}`.
- **`@loomn/shared`** (foglia, solo `zod`) — `domain-schema.ts`: `domainEventSchema`, `gameStateSchema`, **`commandSchema`** (validatore cast-free dell'unione `Command`, `z.union`; l'inferenza è assegnabile 1:1 a `Command` del motore, provato in `host`); `actorSchema` (module-local). `ipc.ts` (Piano 9a): `IPC_CHANNELS` (`ping`, `readModelPush`), schemi/tipi (`pingRequestSchema`/`pingResponseSchema`/`readModelPushSchema` `{version, summary}`) e `interface LoomnBridge` (`ping`, `onReadModelPush`). Barrel: `export * from './domain-schema'` + `export * from './ipc'`. **9c-ii riscrive `ipc.ts`.**
- **`app/desktop`** (`@loomn/desktop`, Piano 9a) — electron-vite 4 + Vue 3 + TS. `electron.vite.config.ts` (main ESM; preload forzato a CJS per `sandbox:true`; `externalizeDepsPlugin({exclude:['@loomn/shared']})`; renderer Vue). Un solo `tsconfig.json`, typecheck via `vue-tsc --noEmit` (incluso in `pnpm -r typecheck`). `src/main/index.ts` (BrowserWindow sicura + handler `ping` + push read-side scaffold), `src/preload/index.ts` (`contextBridge.exposeInMainWorld('loomn', bridge)`, CJS), `src/renderer/{index.html (CSP), env.d.ts, src/App.vue, src/renderer.ts}`. **`app/desktop` NON è nell'include Vitest** (`vitest.config.ts` = `packages/**`): il suo gate è `vue-tsc` + build + esecuzione (Piano 9a). `app/desktop/package.json` + le deps + `electron.vite.config.ts` = **passi orchestratore**.

**Già verificato in sandbox esterna (HANDOFF §7-bis — NON rifarlo):** Electron 42 → Node **ABI 146**; `better-sqlite3` va **ricompilato** per l'ABI Electron (`electron-rebuild -f -w better-sqlite3`) → carica sotto Electron; `safeStorage.isEncryptionAvailable() === true`; la copia nativa è **condivisa nello store pnpm** (un binario per versione → i test ABI Node e l'app ABI Electron non la usano simultaneamente); electron-vite **bundla** i pacchetti workspace TS nel main (esbuild) e `new URL('../migrations', import.meta.url)` di `memory/db.ts` **sopravvive al bundle** risolvendo a `out/migrations` → un plugin Vite `closeBundle` che copia `packages/memory/migrations` in `out/migrations` fa passare `migrate()`. `__dirname` disponibile nella config electron-vite.

**Dettaglio confermato (lettura di `packages/memory/src/db.ts`):** `openDatabase(dbPath)` fa `new Database(dbPath)` → `pragma('journal_mode = WAL')` → `migrate(db, { migrationsFolder })` dove `migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url))`. Le migrazioni sono 4 file SQL + `meta/_journal.json` in `packages/memory/migrations/`.

---

## Decisioni di progetto (motivate — sfidabili dai reviewer)

1. **Application layer montato, non riscritto.** Il `main` istanzia `createCampaignService` + `createLanguageProvider` del 9c-i e ci appende sopra handler IPC **sottili**. L'IPC è l'unico codice nuovo del 9c-ii lato dominio; la logica (write/read/turn/reflect/coda FIFO) è già testata su ABI Node nel 9c-i. → `@loomn/host` resta intatto (spec §3 "il dominio non conosce Electron").
2. **Provider swappabile via indirezione app-side (`provider-holder`), NON modificando `host`.** `createCampaignService` lega `model`/`structured` alla costruzione, ma il provider si configura a runtime (`set-provider`). Il `provider-holder` espone un `LanguageModel`/`StructuredOutputPort` **stabili** che delegano al provider corrente; `set-provider` chiama `holder.configure(createLanguageProvider(...))`. Finché nessun provider è configurato, `model.stream`/`structured.generate` lanciano un errore chiaro → gli handler `run-turn`/`reflect` lo traducono in `{ok:false, error}`. **Alternativa scartata:** ricostruire il `CampaignService` a ogni `set-provider` (perderebbe/azzererebbe la coda FIFO e la proiezione in volo; lo stato è nell'event store, ma il churn è inutile — YAGNI). **Alternativa scartata:** cambiare la firma di `createCampaignService` per accettare un getter di provider (modificherebbe `host`, contro lo scope; l'indirezione è una scelta di **composizione dell'app**, il posto giusto). L'indirezione è ~25 righe pure (nessun import Electron) e si esercita al gate (path "provider non configurato").
3. **Handler IPC con esito tipizzato `{ok:true,…}|{ok:false,error}`, non throw grezzi.** Il main non propaga stack trace o errori del motore al renderer non fidato (spec §4): `safeParse` del payload + `try/catch` attorno al servizio → union discriminata. Il renderer riceve un errore-stringa, mai un'eccezione IPC opaca. **Alternativa scartata:** lasciar rigettare `ipcRenderer.invoke` (rifletterebbe l'errore del motore al renderer, e perderemmo il confine pulito).
4. **Read side = snapshot `{version, state}` pushato (no delta).** `readModelPush` → `{version, state}` (`gameStateSchema`). Spinto su `did-finish-load` e dopo ogni mutazione. Il protocollo delta (spec §13) è **rimandato** (YAGNI; la proiezione completa basta per un single-player con stati piccoli). **`structuredClone` difensivo** del `state` al push: `webContents.send` serializza **già** con structured clone (il renderer riceve una copia profonda, non il riferimento interno) → il clone esplicito è **ridondante per correttezza** ma **auto-documenta** il contratto read-only di `ReadModel.state` (9c-quater) ed evita che un futuro consumatore in-process del read model tocchi il riferimento del motore. Lo teniamo (una riga, `GameState` è dato puro → clonabile senza throw). *Dichiarato come difensivo/documentale, non come rete di sicurezza critica.*
5. **`safeStorage` per le chiavi, settings in `userData/settings.json`.** `set-provider` cifra `apiKey` con `safeStorage.encryptString` → base64 su disco (mai in chiaro, spec §4); `baseUrl`/`model` in chiaro. All'avvio il main rilegge e **decifra** (solo il processo fidato), ricostruendo il provider. LM Studio locale non ha chiave → `apiKey` assente. La lettura del file **rivalida** (spec §4 "non fidarsi di JSON esterni").
6. **Gate "esegui l'app" a due lanci (durabilità reale), non-GUI/non-rete, scriptabile.** Self-test guidato dal **renderer** (esercita l'intero giro renderer→preload→main→`commandSchema`→service→push, cioè il codice nuovo). Fase 1 (`LOOMN_SELFTEST=1`): DB fresco → `dispatch(AddActor)` → `set-provider` con chiave fittizia → asserisce versione/`safeStorage`. Fase 2 (`LOOMN_SELFTEST=2`, **secondo processo sullo stesso DB**): asserisce che la versione e l'attore **sono sopravvissuti al riavvio** (durabilità su disco, spec §6.3) e che il provider è stato **ricostruito da `settings.json`** (chiave decifrata). Il renderer logga un singolo `VERDICT: PASS|FAIL …`; il main lo cattura (`console-message`) e fa `app.exit(0|1)` → **exit code scriptabile**, niente canale di test nel contratto di produzione. **Nessuna chiamata LLM reale** (il provider configurato non viene esercitato in rete): lo smoke test live (LM Studio) è **manuale** e documentato.
7. **RNG seedato costante di sviluppo.** Il main inietta `createSeededRandom(1)` (nessun `Date.now` fuori da `host/clock.ts`; il replay resta deterministico perché `decide` registra i fatti negli Event). Seed per-campagna persistito = **follow-up**.

---

## Disciplina di scope (CRITICA — vale per OGNI task subagent)

1. Ogni subagent modifica **SOLO** i file elencati nel suo task. Esegue `git status --short` prima del commit e verifica che l'insieme dei file toccati coincida con la lista.
2. **MAI** toccare `package.json` (root o di pacchetto), `tsconfig*.json`, `vitest.config.ts`, `pnpm-workspace.yaml`, `tsconfig.base.json`, **`app/desktop/electron.vite.config.ts`**. **MAI** creare un tsconfig di root o aggiungere `composite`/project references. L'aggiunta di dipendenze ad `app/desktop`, gli script ABI in root, la modifica di `electron.vite.config.ts` e `pnpm install`/rebuild sono **passi dell'orchestratore** (vedi "Setup orchestratore" e "Gate finale"), non di un subagent.
3. Crea i file con lo strumento **Write** (NON `New-Item -Force`, che tronca).
4. Niente apostrofi nelle descrizioni `it('...')`/`describe('...')` in apici singoli (`l'`, `un'`, `dell'`, `c'è` spezzano la stringa JS). Scrivi `l attore`, `c e`, `e` per `è`; `è/é` come lettere in mezzo a parola vanno bene. **Grep di verifica:** `(it|describe)\('[^']*'[A-Za-zàèéìòù]` → no matches. Stessa convenzione nei **commenti** (niente apostrofi, `e` per `è`).
5. TS strict: `exactOptionalPropertyTypes` → niente `campo: undefined`; usa **spread condizionali** `...(x !== undefined ? { campo: x } : {})` o assegnazione condizionale a proprietà opzionale. `verbatimModuleSyntax` → `import type` per i soli tipi. `noUncheckedIndexedAccess` → l'accesso a array/`Record` è `T | undefined` (usa `?.`/`?? default`).
6. NON importare `electron` né `zod` direttamente in `app/desktop` se non già disponibile: `electron` è dep di `app/desktop` (ok in main/preload, **mai** nel renderer); `zod` **non** è dep diretta di `app/desktop` (riusa gli schemi di `@loomn/shared`, non importare `'zod'`). `@loomn/shared` resta foglia (NON importare `engine`/`electron`/`ai`/`memory`; `ipc.ts` importa **solo** da `./domain-schema`, stesso pacchetto).

---

## File Structure

| File | Responsabilità | Task |
|---|---|---|
| `app/desktop/package.json` (modifica) | deps `@loomn/host`/`@loomn/engine`/`better-sqlite3`/`drizzle-orm`; devDep `@electron/rebuild`. **Passo orchestratore.** | Setup |
| `package.json` (root, modifica) | script `rebuild:electron`/`rebuild:node`. **Passo orchestratore.** | Setup |
| `app/desktop/electron.vite.config.ts` (modifica) | `exclude` = tutti i workspace TS; plugin `closeBundle` che copia le migrazioni in `out/migrations`. **Passo orchestratore.** | Setup |
| `packages/shared/src/ipc.ts` (riscrittura) | Canali `dispatch`/`run-turn`/`set-provider`/`reflect`/`get-status`/`read-model-push`; schemi Zod (riusa `commandSchema`/`gameStateSchema`); `LoomnBridge`. Rimuove `ping`. | 1 |
| `packages/shared/src/ipc.test.ts` (riscrittura) | Test degli schemi IPC (ABI Node, in suite). | 1 |
| `app/desktop/src/main/provider-holder.ts` (nuovo) | `createProviderHolder()`: `model`/`structured` deleganti + `configure`/`isConfigured`. | 2 |
| `app/desktop/src/main/settings.ts` (nuovo) | `saveProviderConfig`/`loadProviderConfig` su `userData/settings.json` con `safeStorage`. | 2 |
| `app/desktop/src/main/index.ts` (riscrittura) | Lifecycle; `createMemorySystem` su `userData`; `createCampaignService`; handler IPC; push read-side; self-test exit. | 3 |
| `app/desktop/src/preload/index.ts` (riscrittura) | Bridge `LoomnBridge` reale sui nuovi canali (CJS, superficie minima). | 4 |
| `app/desktop/src/renderer/src/renderer.ts` (riscrittura) | Boot diagnostico + self-test `LOOMN_SELFTEST` a due fasi. | 4 |
| `app/desktop/src/renderer/src/App.vue` (modifica) | Testo di stato aggiornato (non più "Piano 9a"). | 4 |

`app/desktop/src/renderer/env.d.ts` resta **invariato** (importa `LoomnBridge`, ancora valido). `app/desktop/src/renderer/index.html` resta invariato (CSP ok).

---

## Setup orchestratore (PRIMA del Task 1) — NON è un task subagent

> L'orchestratore lo esegue a mano. Aggiungere dipendenze, gli script ABI in root e i config Electron sono competenza dell'orchestratore (house rule). Va fatto **prima** del Task 1 perché il Task 1 (in `shared`) gira già su ABI Node senza nuove deps, ma il bundling/typecheck dei Task 2–4 richiede le deps di `app/desktop` linkate. Eseguito su **ABI Node** (nessun rebuild ancora).

- [ ] **Setup-1: deps di `app/desktop`.** In `app/desktop/package.json`, aggiungi alle `dependencies` (accanto a `@loomn/shared`):

```json
  "dependencies": {
    "@loomn/shared": "workspace:*",
    "@loomn/host": "workspace:*",
    "@loomn/engine": "workspace:*",
    "better-sqlite3": "^12.10.1",
    "drizzle-orm": "^0.38.4"
  },
```

e alle `devDependencies` (accanto a `electron`):

```json
    "@electron/rebuild": "^3.7.0",
```

> **Decisione (bundling):** i pacchetti workspace TS (`@loomn/shared`/`@loomn/host`/`@loomn/engine`, più `@loomn/ai`/`@loomn/memory` raggiunti transitivamente da host) sono **source-only** → vanno **bundlati** (esclusi dall'esternalizzazione). `better-sqlite3` (nativa) e `drizzle-orm` sono npm con build → **esternalizzati** (perciò devono essere deps dirette di `app/desktop`, così a runtime risolvono da `app/desktop/node_modules`). `zod` non è dep di `app/desktop` → viene bundlato (è puro JS).

- [ ] **Setup-2: script ABI in root.** In `package.json` (root), aggiungi a `scripts`:

```json
    "rebuild:electron": "pnpm --filter @loomn/desktop exec electron-rebuild -f -w better-sqlite3",
    "rebuild:node": "pnpm rebuild better-sqlite3",
```

> `rebuild:electron` ricompila la copia nativa condivisa per l'ABI Electron (gate). `rebuild:node` la riporta all'ABI Node (ripristino post-gate). Sono i due lati del toggle ABI (§7-bis).

- [ ] **Setup-3: `electron.vite.config.ts`** (riscrittura completa):

```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import vue from '@vitejs/plugin-vue';
import { cpSync } from 'node:fs';
import { join } from 'node:path';

// I pacchetti workspace TS sono source-only: vanno bundlati (esclusi dall esternalizzazione), cosi
// esbuild ne compila il TS. better-sqlite3 (nativa) e drizzle-orm restano esternalizzati (deps di
// app/desktop) -> risolti a runtime da node_modules.
const WORKSPACE_TS = ['@loomn/shared', '@loomn/host', '@loomn/engine', '@loomn/ai', '@loomn/memory'];

// Plugin: copia le migrazioni di @loomn/memory in out/migrations. memory/db.ts risolve la cartella
// con fileURLToPath(new URL('../migrations', import.meta.url)); nel main bundlato (out/main/index.js)
// quel percorso e out/migrations -> migrate() le trova (verificato in sandbox, HANDOFF 7-bis).
function copyMigrationsPlugin() {
  return {
    name: 'loomn-copy-migrations',
    closeBundle(): void {
      const src = join(__dirname, '../../packages/memory/migrations');
      const dest = join(__dirname, 'out/migrations');
      cpSync(src, dest, { recursive: true });
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_TS }), copyMigrationsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_TS })],
    build: {
      rollupOptions: {
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    plugins: [vue()],
  },
});
```

- [ ] **Setup-4: install.** Run: `pnpm install`. Expected: pnpm linka `@loomn/host`/`@loomn/engine`/`better-sqlite3`/`drizzle-orm` in `app/desktop/node_modules`, nessun errore. (better-sqlite3 resta su **ABI Node** — il rebuild Electron è al gate.)

- [ ] **Setup-5: sanity check.** Run: `pnpm test`. Expected: **258 verdi** (immutati; nessun file di pacchetto toccato ancora). Run: `pnpm -r typecheck`. Expected: pulito (app/desktop ancora con `ipc.ts` del 9a — i nuovi import arrivano coi task).

---

## Task 1: Contratto IPC reale in `@loomn/shared` (`ipc.ts`)

**Files:**
- Riscrittura: `packages/shared/src/ipc.ts`
- Riscrittura: `packages/shared/src/ipc.test.ts`

**Disciplina di scope:** modifica SOLO questi 2 file. `@loomn/shared` resta foglia: `ipc.ts` importa **solo** `z` da `zod` e `commandSchema`/`gameStateSchema` da `./domain-schema`. NON toccare `domain-schema.ts`, `index.ts` (il barrel `export * from './ipc'` ri-esporta i nuovi simboli automaticamente), `package.json`, `tsconfig*`, `vitest.config.ts`. Questo task gira su **ABI Node** (è in suite Vitest).

- [ ] **Step 1: Scrivi il test che fallisce** (`packages/shared/src/ipc.test.ts`, riscrittura completa)

```typescript
import { describe, it, expect } from 'vitest';
import {
  IPC_CHANNELS,
  dispatchRequestSchema,
  dispatchResultSchema,
  runTurnRequestSchema,
  runTurnResultSchema,
  providerConfigSchema,
  providerResultSchema,
  reflectRequestSchema,
  reflectResultSchema,
  statusResultSchema,
  readModelPushSchema,
} from './ipc';

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

describe('IPC_CHANNELS', () => {
  it('non espone piu il canale ping (rimosso in 9c-ii)', () => {
    expect((IPC_CHANNELS as Record<string, string>)['ping']).toBeUndefined();
  });

  it('espone i canali write e read del 9c-ii', () => {
    expect(IPC_CHANNELS.dispatch).toBe('loomn:dispatch');
    expect(IPC_CHANNELS.runTurn).toBe('loomn:run-turn');
    expect(IPC_CHANNELS.setProvider).toBe('loomn:set-provider');
    expect(IPC_CHANNELS.reflect).toBe('loomn:reflect');
    expect(IPC_CHANNELS.getStatus).toBe('loomn:get-status');
    expect(IPC_CHANNELS.readModelPush).toBe('loomn:read-model-push');
  });
});

describe('dispatchRequestSchema (= commandSchema al confine)', () => {
  it('valida un Command ben formato (AddActor)', () => {
    const parsed = dispatchRequestSchema.parse({ type: 'AddActor', actor: sampleActor('goblin') });
    expect(parsed.type).toBe('AddActor');
  });

  it('rifiuta un payload che non e un Command', () => {
    expect(() => dispatchRequestSchema.parse({ type: 'Teleport' })).toThrow();
  });
});

describe('dispatchResultSchema (union ok/errore)', () => {
  it('accetta l esito ok con versione', () => {
    expect(dispatchResultSchema.parse({ ok: true, version: 3 })).toEqual({ ok: true, version: 3 });
  });

  it('accetta l esito di errore', () => {
    expect(dispatchResultSchema.parse({ ok: false, error: 'boom' })).toEqual({ ok: false, error: 'boom' });
  });

  it('rifiuta ok senza versione', () => {
    expect(() => dispatchResultSchema.parse({ ok: true })).toThrow();
  });
});

describe('schemi run-turn / provider / reflect / status', () => {
  it('runTurnRequest richiede playerAction stringa', () => {
    expect(runTurnRequestSchema.parse({ playerAction: 'apro la porta' })).toEqual({ playerAction: 'apro la porta' });
    expect(() => runTurnRequestSchema.parse({})).toThrow();
  });

  it('runTurnResult ok porta narration e versione', () => {
    expect(runTurnResultSchema.parse({ ok: true, narration: 'x', version: 1 })).toEqual({
      ok: true,
      narration: 'x',
      version: 1,
    });
  });

  it('providerConfig accetta apiKey opzionale (path LM Studio locale senza chiave)', () => {
    expect(providerConfigSchema.parse({ baseUrl: 'http://x/v1', model: 'm' })).toEqual({
      baseUrl: 'http://x/v1',
      model: 'm',
    });
    expect(providerConfigSchema.parse({ baseUrl: 'http://x/v1', model: 'm', apiKey: 'sk' }).apiKey).toBe('sk');
  });

  it('providerResult e reflectResult validano le union ok/errore', () => {
    expect(providerResultSchema.parse({ ok: true })).toEqual({ ok: true });
    expect(reflectResultSchema.parse({ ok: true, factCount: 2, summarized: true })).toEqual({
      ok: true,
      factCount: 2,
      summarized: true,
    });
    expect(() => reflectResultSchema.parse({ ok: true })).toThrow();
  });

  it('statusResult richiede i tre flag diagnostici', () => {
    expect(statusResultSchema.parse({ version: 0, safeStorageAvailable: true, providerConfigured: false })).toEqual({
      version: 0,
      safeStorageAvailable: true,
      providerConfigured: false,
    });
  });
});

describe('readModelPushSchema (snapshot read-side version e state)', () => {
  it('valida uno snapshot con stato vuoto', () => {
    const push = readModelPushSchema.parse({ version: 0, state: { version: 0, actors: {}, encounter: null } });
    expect(push.version).toBe(0);
    expect(push.state.actors).toEqual({});
  });

  it('rifiuta uno snapshot senza state', () => {
    expect(() => readModelPushSchema.parse({ version: 0 })).toThrow();
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm exec vitest run packages/shared/src/ipc.test.ts`
Expected: FAIL — gli export `dispatchRequestSchema`/… non esistono ancora (`does not provide an export named …`), e `IPC_CHANNELS.dispatch` è undefined.

- [ ] **Step 3: Riscrivi `packages/shared/src/ipc.ts`** (sostituisci l'intero file)

```typescript
// Contratto IPC (spec 4): UNICA fonte di nomi canale, schemi Zod dei payload e tipi inferiti,
// condivisa dai tre processi Electron. `shared` resta foglia: importa solo `zod` e gli schemi di
// ./domain-schema (stesso pacchetto), mai electron ne altri @loomn/*. La validazione Zod ai confini
// IPC (payload non fidati renderer->main) usa questi schemi; il read side e una proiezione di sola
// lettura {version, state} spinta dal main (spec 5.2).
import { z } from 'zod';
import { commandSchema, gameStateSchema } from './domain-schema';

/** Nomi dei canali IPC (prefisso `loomn:` per evitare collisioni). */
export const IPC_CHANNELS = {
  /** invoke/handle: write side. Renderer->main: un Command (validato con commandSchema). */
  dispatch: 'loomn:dispatch',
  /** invoke/handle: turno agentico (spec 5.4). Richiede un provider configurato. */
  runTurn: 'loomn:run-turn',
  /** invoke/handle: configura il provider AI (chiave cifrata con safeStorage nel main). */
  setProvider: 'loomn:set-provider',
  /** invoke/handle: Reflection (spec 6.1) sullo stream corrente. */
  reflect: 'loomn:reflect',
  /** invoke/handle: stato diagnostico (versione, safeStorage, provider). Nessun side effect. */
  getStatus: 'loomn:get-status',
  /** send/on (push main->renderer): proiezione read-side {version, state} (spec 5.2). */
  readModelPush: 'loomn:read-model-push',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

// --- dispatch (write side) ---
/** Il payload di dispatch e un Command: lo valida commandSchema al confine non fidato (spec 4). */
export const dispatchRequestSchema = commandSchema;
/** Forma del Command lato chiamante (input dello schema, prima del .transform di Attack). */
export type DispatchCommand = z.input<typeof commandSchema>;

/** Esito tipizzato del dispatch: union ok/errore -> il main non propaga stack trace grezzi. */
export const dispatchResultSchema = z.union([
  z.object({ ok: z.literal(true), version: z.number().int().nonnegative() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type DispatchResult = z.infer<typeof dispatchResultSchema>;

// --- runTurn (turno agentico) ---
export const runTurnRequestSchema = z.object({ playerAction: z.string() });
export type RunTurnRequest = z.infer<typeof runTurnRequestSchema>;

export const runTurnResultSchema = z.union([
  z.object({ ok: z.literal(true), narration: z.string(), version: z.number().int().nonnegative() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type RunTurnResult = z.infer<typeof runTurnResultSchema>;

// --- setProvider (config AI) ---
export const providerConfigSchema = z.object({
  baseUrl: z.string(),
  model: z.string(),
  apiKey: z.string().optional(),
});
export type ProviderConfig = z.infer<typeof providerConfigSchema>;

export const providerResultSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type ProviderResult = z.infer<typeof providerResultSchema>;

// --- reflect (Reflection) ---
export const reflectRequestSchema = z.object({ scope: z.string() });
export type ReflectRequest = z.infer<typeof reflectRequestSchema>;

export const reflectResultSchema = z.union([
  z.object({ ok: z.literal(true), factCount: z.number().int().nonnegative(), summarized: z.boolean() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type ReflectResult = z.infer<typeof reflectResultSchema>;

// --- getStatus (diagnostica) ---
export const statusResultSchema = z.object({
  version: z.number().int().nonnegative(),
  safeStorageAvailable: z.boolean(),
  providerConfigured: z.boolean(),
});
export type StatusResult = z.infer<typeof statusResultSchema>;

// --- read-model push (read side) ---
/** Proiezione read-side spinta dal main (spec 5.2): snapshot {version, state}. Il protocollo delta
 *  (spec 13) resta rimandato (YAGNI). `state` e validato con gameStateSchema (riuso del Piano 6). */
export const readModelPushSchema = z.object({
  version: z.number().int().nonnegative(),
  state: gameStateSchema,
});
export type ReadModelPush = z.infer<typeof readModelPushSchema>;

/** Superficie IPC esposta dal preload al renderer (contratto tipizzato del bridge). */
export interface LoomnBridge {
  /** Write side: invia un Command; il main lo valida e risponde con esito tipizzato. */
  dispatch(command: DispatchCommand): Promise<DispatchResult>;
  /** Turno agentico (richiede un provider configurato). */
  runTurn(request: RunTurnRequest): Promise<RunTurnResult>;
  /** Configura il provider AI (la chiave viene cifrata nel main). */
  setProvider(config: ProviderConfig): Promise<ProviderResult>;
  /** Reflection sullo stream corrente. */
  reflect(request: ReflectRequest): Promise<ReflectResult>;
  /** Stato diagnostico (nessun side effect). */
  getStatus(): Promise<StatusResult>;
  /** Sottoscrive i push read-side; ritorna una funzione che annulla la sottoscrizione. */
  onReadModelPush(listener: (push: ReadModelPush) => void): () => void;
}
```

- [ ] **Step 4: Esegui il test e verifica che passa**

Run: `pnpm exec vitest run packages/shared/src/ipc.test.ts`
Expected: PASS — 14 test verdi.

- [ ] **Step 5: Suite + typecheck del pacchetto**

Run: `pnpm exec vitest run packages/shared/`
Expected: PASS — `ipc.test.ts` 14 + `domain-schema.test.ts` + `command-schema.test.ts` invariati.

Run: `pnpm -C packages/shared typecheck`
Expected: nessun errore.

- [ ] **Step 6: Verifica scope e commit**

Run: `git status --short`
Expected: esattamente `M packages/shared/src/ipc.ts`, `M packages/shared/src/ipc.test.ts`.

```bash
git add packages/shared/src/ipc.ts packages/shared/src/ipc.test.ts
git commit -m "feat(shared): contratto IPC 9c-ii (dispatch/run-turn/set-provider/reflect/status, read-model {version,state}); rimuove ping"
```

**Conteggio test atteso (cumulativo):** 258 → **266** (`ipc.test.ts`: -6 vecchi +14 nuovi = +8). È l'unico task che cambia la suite (i Task 2–4 sono in `app/desktop`, fuori dall'include Vitest).

---

## Task 2: Indirezione provider + persistenza chiavi (`provider-holder.ts`, `settings.ts`)

**Files:**
- Create: `app/desktop/src/main/provider-holder.ts`
- Create: `app/desktop/src/main/settings.ts`

**Disciplina di scope:** crea SOLO questi 2 file. NON toccare `index.ts`/`package.json`/`electron.vite.config.ts`/`tsconfig`. NON importare `'zod'` (riusa `providerConfigSchema` di `@loomn/shared`). Verifica = `vue-tsc` (ABI Node, non carica la nativa). **Niente test Vitest** (`app/desktop` è fuori dall'include): la verifica runtime è il gate finale.

- [ ] **Step 1: Crea `app/desktop/src/main/provider-holder.ts`**

```typescript
// Indirezione app-side: il CampaignService lega model+structured alla costruzione (9c-i), ma il
// provider AI si configura a RUNTIME (canale set-provider). Il holder espone un LanguageModel e uno
// StructuredOutputPort STABILI che delegano al provider corrente -> set-provider riconfigura senza
// ricostruire il service e SENZA modificare @loomn/host. Finche nessun provider e configurato,
// model/structured falliscono con un errore chiaro -> i handler runTurn/reflect lo traducono in {ok:false}.
import type { LanguageProvider } from '@loomn/host';
import type {
  LanguageModel,
  LlmRequest,
  LlmStreamEvent,
  StructuredOutputPort,
  StructuredOutputRequest,
  StructuredOutputResult,
} from '@loomn/ai';

export interface ProviderHolder {
  /** LanguageModel stabile (per runMasterTurn): delega al provider corrente. */
  model: LanguageModel;
  /** StructuredOutputPort stabile (per la Reflection): delega al provider corrente. */
  structured: StructuredOutputPort;
  /** Sostituisce il provider corrente (set-provider). */
  configure(provider: LanguageProvider): void;
  /** True se un provider e stato configurato. */
  isConfigured(): boolean;
}

const NO_PROVIDER = 'provider AI non configurato';

export function createProviderHolder(): ProviderHolder {
  let current: LanguageProvider | undefined;

  const model: LanguageModel = {
    id: 'loomn-delegating',
    stream(request: LlmRequest): AsyncIterable<LlmStreamEvent> {
      if (current === undefined) throw new Error(NO_PROVIDER);
      return current.model.stream(request);
    },
  };

  const structured: StructuredOutputPort = {
    generate<T>(request: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> {
      if (current === undefined) return Promise.reject(new Error(NO_PROVIDER));
      return current.structured.generate(request);
    },
  };

  return {
    model,
    structured,
    configure(provider: LanguageProvider): void {
      current = provider;
    },
    isConfigured(): boolean {
      return current !== undefined;
    },
  };
}
```

- [ ] **Step 2: Crea `app/desktop/src/main/settings.ts`**

```typescript
// Persistenza della config provider in userData/settings.json. La chiave API NON e mai in chiaro su
// disco: safeStorage (OS keychain, spec 4) la cifra; salviamo il ciphertext base64. La decifratura
// avviene solo nel main (processo fidato). LM Studio locale non ha chiave -> apiKey assente. La
// lettura rivalida con providerConfigSchema (spec 4: non fidarsi di JSON esterni).
import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { providerConfigSchema, type ProviderConfig } from '@loomn/shared';

interface StoredSettings {
  baseUrl: string;
  model: string;
  /** Ciphertext base64 della chiave (safeStorage). Assente se nessuna chiave. */
  apiKeyEnc?: string;
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json');
}

/** Salva la config provider; cifra la chiave con safeStorage se presente e disponibile. */
export function saveProviderConfig(config: ProviderConfig): void {
  const stored: StoredSettings = { baseUrl: config.baseUrl, model: config.model };
  if (config.apiKey !== undefined && config.apiKey !== '' && safeStorage.isEncryptionAvailable()) {
    stored.apiKeyEnc = safeStorage.encryptString(config.apiKey).toString('base64');
  }
  writeFileSync(settingsPath(), JSON.stringify(stored), 'utf8');
}

function readStored(path: string): StoredSettings | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
  if (typeof raw !== 'object' || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;
  if (typeof obj['baseUrl'] !== 'string' || typeof obj['model'] !== 'string') return undefined;
  const stored: StoredSettings = { baseUrl: obj['baseUrl'], model: obj['model'] };
  if (typeof obj['apiKeyEnc'] === 'string') stored.apiKeyEnc = obj['apiKeyEnc'];
  return stored;
}

/** Rilegge la config provider; decifra la chiave. undefined se assente o illeggibile. */
export function loadProviderConfig(): ProviderConfig | undefined {
  const path = settingsPath();
  if (!existsSync(path)) return undefined;
  const stored = readStored(path);
  if (stored === undefined) return undefined;
  const config: ProviderConfig = { baseUrl: stored.baseUrl, model: stored.model };
  if (stored.apiKeyEnc !== undefined && safeStorage.isEncryptionAvailable()) {
    config.apiKey = safeStorage.decryptString(Buffer.from(stored.apiKeyEnc, 'base64'));
  }
  return providerConfigSchema.parse(config);
}
```

- [ ] **Step 3: Typecheck del pacchetto**

Run: `pnpm -C app/desktop typecheck`
Expected: nessun errore (vue-tsc risolve i tipi di `@loomn/host`/`@loomn/ai`/`electron`; non carica la nativa). `index.ts` del 9a è ancora invariato → potrebbe già usare il vecchio `ipc.ts`: poiché il Task 1 ha riscritto `ipc.ts` (rimuovendo `ping`), `index.ts`/`preload`/`renderer` del 9a **non typecheckano più** finché non li riscriviamo nei Task 3/4. **Questo è atteso.** Per isolare il check di questo task, verifica solo i 2 nuovi file con un check mirato:

Run: `pnpm -C app/desktop exec vue-tsc --noEmit src/main/provider-holder.ts src/main/settings.ts`
Expected: nessun errore sui 2 file nuovi. (Il typecheck pieno del pacchetto torna verde dopo il Task 4.)

> **Nota orchestratore/reviewer:** Task 1 e i Task 3/4 sono accoppiati dal contratto `ipc.ts` (il 9a usa `ping`, rimosso). Tra il Task 1 e il Task 4 il typecheck **pieno** di `app/desktop` è rosso per costruzione; i Task 2/3/4 si verificano in modo mirato e il pacchetto torna verde alla fine del Task 4. Se il check mirato `vue-tsc <file>` non onora il tsconfig del pacchetto, in alternativa accetta il typecheck pieno verde **solo** al termine del Task 4 (lo dichiara lo Step finale del Task 4).

- [ ] **Step 4: Verifica scope e commit**

Run: `git status --short`
Expected: `?? app/desktop/src/main/provider-holder.ts`, `?? app/desktop/src/main/settings.ts`.

```bash
git add app/desktop/src/main/provider-holder.ts app/desktop/src/main/settings.ts
git commit -m "feat(desktop): provider-holder swappabile e persistenza chiavi con safeStorage"
```

**Conteggio test atteso:** invariato (**266** — `app/desktop` fuori dall'include Vitest; verifica via typecheck/build/gate).

---

## Task 3: Main — DB reale, servizio, handler IPC (`main/index.ts`)

**Files:**
- Riscrittura: `app/desktop/src/main/index.ts`

**Disciplina di scope:** modifica SOLO questo file. NON toccare `provider-holder.ts`/`settings.ts` (Task 2, importati), `package.json`/`electron.vite.config.ts`/`tsconfig`. Verifica = `vue-tsc`. Niente test Vitest. Usa **spread/assegnazioni condizionali** per gli opzionali; `process.env['NAME']` (mai `process.env.NAME` con `noUncheckedIndexedAccess` se lo stile lo richiede — qui `process.env['NAME']` è `string | undefined`, gestiscilo).

- [ ] **Step 1: Riscrivi `app/desktop/src/main/index.ts`** (sostituisci l'intero file)

```typescript
import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import { join } from 'node:path';
import { createSeededRandom } from '@loomn/engine';
import {
  createMemorySystem,
  createCampaignService,
  createLanguageProvider,
  type CampaignService,
  type MemorySystem,
} from '@loomn/host';
import {
  IPC_CHANNELS,
  dispatchRequestSchema,
  runTurnRequestSchema,
  providerConfigSchema,
  reflectRequestSchema,
  type DispatchResult,
  type RunTurnResult,
  type ProviderResult,
  type ReflectResult,
  type StatusResult,
  type ReadModelPush,
} from '@loomn/shared';
import { createProviderHolder, type ProviderHolder } from './provider-holder';
import { loadProviderConfig, saveProviderConfig } from './settings';

// Seme RNG di sviluppo costante: niente Date.now fuori da host/clock.ts; decide registra i fatti
// risolti negli Event -> replay deterministico. Seed per-campagna persistito = follow-up.
const DEV_SEED = 1;

// Holder del provider AI (configurabile a runtime via set-provider), creato una sola volta.
const holder: ProviderHolder = createProviderHolder();

let mainWindow: BrowserWindow | undefined;
let memory: MemorySystem | undefined;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Read side (spec 5.2): spinge lo snapshot {version, state} al renderer. structuredClone difensivo
 *  del riferimento read-only di ReadModel.state (auto-documenta il contratto; send() clona comunque). */
function pushReadModel(service: CampaignService): void {
  if (mainWindow === undefined) return;
  const rm = service.getReadModel();
  const push: ReadModelPush = { version: rm.version, state: structuredClone(rm.state) };
  mainWindow.webContents.send(IPC_CHANNELS.readModelPush, push);
}

/** Handler IPC sottili sopra il CampaignService. Payload renderer->main Zod-validato (spec 4); gli
 *  errori del motore/provider diventano {ok:false, error} (niente throw grezzi al renderer). */
function registerHandlers(service: CampaignService): void {
  ipcMain.handle(IPC_CHANNELS.dispatch, async (_e, raw): Promise<DispatchResult> => {
    const parsed = dispatchRequestSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: `Command non valido: ${parsed.error.message}` };
    try {
      const out = await service.dispatch(parsed.data);
      pushReadModel(service);
      return { ok: true, version: out.readModel.version };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.runTurn, async (_e, raw): Promise<RunTurnResult> => {
    const parsed = runTurnRequestSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: `Richiesta non valida: ${parsed.error.message}` };
    try {
      const out = await service.runTurn(parsed.data.playerAction);
      pushReadModel(service);
      return { ok: true, narration: out.narration, version: out.readModel.version };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.setProvider, async (_e, raw): Promise<ProviderResult> => {
    const parsed = providerConfigSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: `Config provider non valida: ${parsed.error.message}` };
    try {
      saveProviderConfig(parsed.data);
      holder.configure(createLanguageProvider(parsed.data));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.reflect, async (_e, raw): Promise<ReflectResult> => {
    const parsed = reflectRequestSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: `Richiesta non valida: ${parsed.error.message}` };
    try {
      const out = await service.reflect(parsed.data.scope);
      return { ok: true, factCount: out.factCount, summarized: out.summarized };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.getStatus,
    (): StatusResult => ({
      version: service.getReadModel().version,
      safeStorageAvailable: safeStorage.isEncryptionAvailable(),
      providerConfigured: holder.isConfigured(),
    }),
  );
}

function createWindow(service: CampaignService): BrowserWindow {
  const selfTest = process.env['LOOMN_SELFTEST'];
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    show: selfTest === undefined,
    webPreferences: {
      // Sicurezza non negoziabile (spec 4).
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: join(__dirname, '../preload/index.cjs'),
    },
  });

  if (selfTest !== undefined) {
    // Gate self-test: cattura il VERDICT loggato dal renderer ed esce con codice scriptabile.
    // La firma di console-message e cambiata fra le versioni Electron: estrai il messaggio robusto.
    win.webContents.on('console-message', (_event, ...rest: unknown[]) => {
      const first = rest[0];
      const message =
        typeof first === 'object' && first !== null && 'message' in first
          ? String((first as { message: unknown }).message)
          : String(rest[1] ?? '');
      if (message.startsWith('VERDICT:')) {
        console.log(`[MAIN] ${message}`);
        app.exit(message.includes('PASS') ? 0 : 1);
      }
    });
    // Rete di sicurezza: se il renderer non emette mai un VERDICT, non lasciare il gate appeso.
    setTimeout(() => {
      console.log('VERDICT: FAIL timeout self-test');
      app.exit(1);
    }, 15000);
  }

  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
  if (rendererUrl !== undefined) {
    const url = selfTest !== undefined ? `${rendererUrl}?selftest=${selfTest}` : rendererUrl;
    void win.loadURL(url);
  } else {
    const file = join(__dirname, '../renderer/index.html');
    void win.loadFile(file, selfTest !== undefined ? { query: { selftest: selfTest } } : {});
  }

  win.webContents.once('did-finish-load', () => pushReadModel(service));
  return win;
}

void app.whenReady().then(() => {
  // userData override per il gate (due lanci sullo stesso DB temporaneo); in produzione: default OS.
  const userDataOverride = process.env['LOOMN_USERDATA'];
  if (userDataOverride !== undefined) app.setPath('userData', userDataOverride);

  // Persistenza reale dentro Electron: UNA connessione (event store + ledger + summaries + assembler).
  memory = createMemorySystem(join(app.getPath('userData'), 'loomn.db'));
  const service = createCampaignService({
    memory,
    model: holder.model,
    structured: holder.structured,
    rng: createSeededRandom(DEV_SEED),
  });

  // Provider persistito (settings.json) -> ricostruisci all avvio (decifra la chiave con safeStorage).
  const savedProvider = loadProviderConfig();
  if (savedProvider !== undefined) holder.configure(createLanguageProvider(savedProvider));

  registerHandlers(service);
  mainWindow = createWindow(service);
  console.log('[MAIN] Loomn pronto');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow(service);
  });
});

app.on('window-all-closed', () => {
  memory?.close();
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 2: Typecheck mirato del main**

Run: `pnpm -C app/desktop exec vue-tsc --noEmit src/main/index.ts`
Expected: nessun errore sul main (i tipi di `@loomn/host`/`@loomn/shared`/`@loomn/engine`/`electron` risolvono; la nativa non viene caricata). Il typecheck **pieno** del pacchetto resta rosso finché preload/renderer (9a) non sono riscritti nel Task 4 — atteso.

> **Drift guard wire->motore a compile-time:** `dispatchRequestSchema.safeParse(raw).data` ha tipo `z.infer<typeof commandSchema>` ed e passato a `service.dispatch(command: Command)`: se compila, l'assegnabilità cast-free wire→`Command` (provata in `host` nel 9c-i) regge anche qui. Idem `pushReadModel`: `structuredClone(rm.state)` (engine `GameState`) assegnato a `ReadModelPush.state` (`z.infer<gameStateSchema>`) → il typecheck del main e il **drift guard** engine-state→push.

- [ ] **Step 3: Verifica scope e commit**

Run: `git status --short`
Expected: `M app/desktop/src/main/index.ts`.

```bash
git add app/desktop/src/main/index.ts
git commit -m "feat(desktop): main monta createCampaignService su DB reale dietro handler IPC (dispatch/run-turn/set-provider/reflect/status)"
```

**Conteggio test atteso:** invariato (**266**).

---

## Task 4: Preload bridge + renderer self-test (`preload/index.ts`, `renderer.ts`, `App.vue`)

**Files:**
- Riscrittura: `app/desktop/src/preload/index.ts`
- Riscrittura: `app/desktop/src/renderer/src/renderer.ts`
- Modifica: `app/desktop/src/renderer/src/App.vue`

**Disciplina di scope:** modifica SOLO questi 3 file. NON toccare `env.d.ts` (resta valido), `index.html`, `main/*`, `package.json`, `electron.vite.config.ts`. Il renderer NON importa `electron`/Node (sandbox). Verifica = `vue-tsc` pieno del pacchetto (deve tornare **verde** ora che tutto il giro è riscritto) + build.

- [ ] **Step 1: Riscrivi `app/desktop/src/preload/index.ts`** (sostituisci l'intero file)

```typescript
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IPC_CHANNELS,
  type LoomnBridge,
  type DispatchCommand,
  type DispatchResult,
  type RunTurnRequest,
  type RunTurnResult,
  type ProviderConfig,
  type ProviderResult,
  type ReflectRequest,
  type ReflectResult,
  type StatusResult,
  type ReadModelPush,
} from '@loomn/shared';

// Superficie IPC minima e tipizzata (spec 4): solo i canali del contratto, nessun accesso Node/DB
// esposto al renderer. Costruito a CJS (electron.vite.config) per sandbox:true.
const bridge: LoomnBridge = {
  dispatch: (command: DispatchCommand): Promise<DispatchResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.dispatch, command),
  runTurn: (request: RunTurnRequest): Promise<RunTurnResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.runTurn, request),
  setProvider: (config: ProviderConfig): Promise<ProviderResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.setProvider, config),
  reflect: (request: ReflectRequest): Promise<ReflectResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.reflect, request),
  getStatus: (): Promise<StatusResult> => ipcRenderer.invoke(IPC_CHANNELS.getStatus),
  onReadModelPush: (listener: (push: ReadModelPush) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, push: ReadModelPush): void => listener(push);
    ipcRenderer.on(IPC_CHANNELS.readModelPush, handler);
    return () => ipcRenderer.off(IPC_CHANNELS.readModelPush, handler);
  },
};

contextBridge.exposeInMainWorld('loomn', bridge);
```

- [ ] **Step 2: Riscrivi `app/desktop/src/renderer/src/renderer.ts`** (sostituisci l'intero file)

```typescript
import { createApp } from 'vue';
import App from './App.vue';
import type { ReadModelPush } from '@loomn/shared';

createApp(App).mount('#app');

// Boot normale (diagnostica; la UI vera e il Piano 10): sottoscrive i push read-side e li logga.
// In modalita self-test (gate 9c-ii) il renderer guida un giro IPC completo e logga un VERDICT.
const selfTest = new URLSearchParams(location.search).get('selftest');
if (selfTest === null) {
  window.loomn.onReadModelPush((push) => {
    console.log(`[renderer] read-model v${push.version}: ${Object.keys(push.state.actors).length} attori`);
  });
} else {
  void runSelfTest(selfTest);
}

// Self-test scriptabile (gate 9c-ii): NON-GUI, NON-rete. Esercita renderer->preload->main->service
// ->push. Logga un singolo VERDICT che il main cattura per uscire con codice 0 (PASS) / 1 (FAIL).
async function runSelfTest(phase: string): Promise<void> {
  const lines: string[] = [];
  const check = (cond: boolean, label: string): void => {
    lines.push(`${cond ? 'ok' : 'FAIL'} ${label}`);
  };
  // Cattura il primo snapshot read-side (spinto su did-finish-load): serve alla durabilita in fase 2.
  const firstPush = new Promise<ReadModelPush>((resolve) => {
    window.loomn.onReadModelPush((push) => resolve(push));
  });

  try {
    if (phase === '1') {
      const s0 = await window.loomn.getStatus();
      check(s0.version === 0, 'DB fresco a versione 0');
      check(s0.safeStorageAvailable, 'safeStorage disponibile');

      const d = await window.loomn.dispatch({
        type: 'AddActor',
        actor: {
          id: 'goblin',
          name: 'Goblin',
          kind: 'npc',
          attributes: {},
          skills: {},
          resources: { hp: { current: 10, max: 10 } },
          conditions: [],
          items: [],
          progression: { xp: 0, level: 1 },
        },
      });
      check(d.ok && d.version === 1, 'dispatch AddActor porta a versione 1');

      const sp = await window.loomn.setProvider({
        baseUrl: 'http://localhost:1234/v1',
        model: 'local',
        apiKey: 'sk-selftest',
      });
      check(sp.ok, 'set-provider ok (chiave cifrata con safeStorage)');

      const s1 = await window.loomn.getStatus();
      check(s1.providerConfigured, 'provider configurato dopo set-provider');
    } else {
      const s0 = await window.loomn.getStatus();
      check(s0.version === 1, 'versione 1 PERSISTITA dopo il riavvio (durabilita su disco)');
      check(s0.providerConfigured, 'provider ricostruito da settings.json (chiave decifrata)');

      const push = await Promise.race([
        firstPush,
        new Promise<ReadModelPush>((_resolve, reject) =>
          setTimeout(() => reject(new Error('nessun read-model push')), 5000),
        ),
      ]);
      check(push.state.actors['goblin']?.name === 'Goblin', 'attore goblin sopravvissuto al riavvio');
    }

    const passed = lines.every((l) => l.startsWith('ok'));
    console.log(`VERDICT: ${passed ? 'PASS' : 'FAIL'} fase=${phase} [${lines.join('; ')}]`);
  } catch (err) {
    console.log(`VERDICT: FAIL fase=${phase} eccezione=${err instanceof Error ? err.message : String(err)}`);
  }
}
```

- [ ] **Step 3: Aggiorna `app/desktop/src/renderer/src/App.vue`** (sostituisci l'intero file)

```vue
<script setup lang="ts">
import { ref } from 'vue';

const status = ref('Loomn pronto (persistenza + IPC, Piano 9c-ii). UI completa: Piano 10.');
</script>

<template>
  <main>
    <h1>Loomn</h1>
    <p>{{ status }}</p>
  </main>
</template>
```

- [ ] **Step 4: Typecheck pieno del pacchetto (ora torna verde)**

Run: `pnpm -C app/desktop typecheck`
Expected: nessun errore. Tutto il giro (main/preload/renderer) usa il nuovo `ipc.ts`; `ping` non è più referenziato.

- [ ] **Step 5: Verifica scope e commit**

Run: `git status --short`
Expected: `M app/desktop/src/preload/index.ts`, `M app/desktop/src/renderer/src/renderer.ts`, `M app/desktop/src/renderer/src/App.vue`.

```bash
git add app/desktop/src/preload/index.ts app/desktop/src/renderer/src/renderer.ts app/desktop/src/renderer/src/App.vue
git commit -m "feat(desktop): preload bridge reale e renderer self-test LOOMN_SELFTEST (gate 9c-ii)"
```

- [ ] **Step 6: Build su ABI Node (prova bundling + plugin migrazioni, senza caricare la nativa)**

Run: `pnpm --filter @loomn/desktop build`
Expected: build OK (esbuild bundla i workspace TS, esternalizza better-sqlite3/drizzle-orm). Verifica che il plugin abbia copiato le migrazioni:

Run (bash): `ls app/desktop/out/migrations && ls app/desktop/out/main/index.js`
Expected: `0000_init.sql … meta/` presenti in `out/migrations`; `out/main/index.js` presente. (Questo conferma il `closeBundle` + l'esternalizzazione su **ABI Node**, senza eseguire l'app.)

```bash
git add -A
git status --short
```
Expected: `out/` è ignorato da git (non compare) — se compare, NON committarlo (è un artefatto di build). Nessun commit in questo step se non ci sono sorgenti modificati.

**Conteggio test atteso:** invariato (**266**).

---

## Gate finale "esegui l'app" (orchestratore) — il flip ABI vive QUI e SOLO qui

> Eseguito dall'orchestratore, **dopo** che tutti i task sono committati e `pnpm test` è **266 verdi** su ABI Node. Capovolge l'ABI della copia nativa condivisa: `pnpm test` resta rotto finché non si ripristina. **Regola ferrea:** qualunque sia l'esito, ripristina l'ABI Node (`pnpm rebuild:node`) PRIMA di qualsiasi altra cosa. Su Windows Electron gira con finestra nascosta (`show:false` in self-test) senza display server.

- [ ] **G1: Stato pre-gate (ABI Node).** Run: `pnpm test` → **266 verdi**. Run: `pnpm -r typecheck` → pulito.

- [ ] **G2: Build (ABI Node).** Run: `pnpm --filter @loomn/desktop build`. Expected: OK + `app/desktop/out/migrations` popolata.

- [ ] **G3: Ricompila la nativa per ABI Electron.** Run: `pnpm rebuild:electron`. Expected: `electron-rebuild` ricompila `better-sqlite3` per l'ABI Electron (146). Da qui `pnpm test` (ABI Node) è atteso ROSSO finché non si ripristina (G7).

- [ ] **G4: Self-test fase 1 (DB temporaneo fresco).** Dalla cartella `app/desktop`, con una dir userData temporanea pulita (PowerShell):

```powershell
$env:LOOMN_USERDATA = Join-Path $env:TEMP 'loomn-selftest'
if (Test-Path $env:LOOMN_USERDATA) { Remove-Item -Recurse -Force $env:LOOMN_USERDATA }
New-Item -ItemType Directory -Force $env:LOOMN_USERDATA | Out-Null
$env:LOOMN_SELFTEST = '1'
pnpm --filter @loomn/desktop exec electron .
echo "exit=$LASTEXITCODE"
```

Expected: stdout contiene una riga `VERDICT: PASS fase=1 [...]`; `exit=0`. (Prova: nativa carica sotto Electron, DB aperto + migrato in `userData`, giro IPC dispatch, safeStorage cifra la chiave.)

- [ ] **G5: Self-test fase 2 (stesso DB — durabilità su disco).** Senza ripulire `LOOMN_USERDATA`:

```powershell
$env:LOOMN_SELFTEST = '2'
pnpm --filter @loomn/desktop exec electron .
echo "exit=$LASTEXITCODE"
```

Expected: `VERDICT: PASS fase=2 [...]`; `exit=0`. (Prova: la versione e l'attore `goblin` sono sopravvissuti al riavvio = persistenza ES reale su disco, spec §6.3; il provider è stato ricostruito da `settings.json` con la chiave **decifrata** = round-trip safeStorage completo.)

- [ ] **G6: Pulizia gate.**

```powershell
Remove-Item -Recurse -Force $env:LOOMN_USERDATA
Remove-Item Env:\LOOMN_USERDATA, Env:\LOOMN_SELFTEST
```

- [ ] **G7: Ripristina l'ABI Node (OBBLIGATORIO, anche se il gate è fallito).** Run: `pnpm rebuild:node`. Poi Run: `pnpm test` → **266 verdi** ripristinati. Run: `pnpm -r typecheck` → pulito.

- [ ] **G8 (manuale, opzionale — fuori dal gate automatico): smoke test LLM live.** Con LM Studio in ascolto su `http://localhost:1234/v1` (un modello caricato) e la nativa su ABI Electron: avvia `pnpm --filter @loomn/desktop dev`, dalla console del renderer chiama `await window.loomn.setProvider({ baseUrl:'http://localhost:1234/v1', model:'<id-modello>' })` poi `await window.loomn.runTurn({ playerAction:'Guardo intorno.' })` e verifica una `narration` non vuota. **Non** fa parte del gate scriptabile (richiede rete/modello). Al termine, se hai ricompilato per Electron, ripeti G7.

---

## Verifica finale dell'intero branch (orchestratore, prima del merge)

- [ ] **Suite completa (ABI Node ripristinato):** Run: `pnpm test` → **266 verdi**.
- [ ] **Typecheck ricorsivo (mai `tsc -b`):** Run: `pnpm -r typecheck` → pulito su engine/shared/ai/memory/host + `app/desktop` (vue-tsc).
- [ ] **Grep anti-apostrofo nei test (house rule §5.4):** Run (bash): `grep -rEn "(it|describe)\('[^']*'[A-Za-zàèéìòù]" packages/` → nessun match.
- [ ] **Build dell'app verde (ABI Node):** Run: `pnpm --filter @loomn/desktop build` → OK + `out/migrations` popolata.
- [ ] **Gate "esegui l'app" superato:** entrambe le fasi `VERDICT: PASS`, exit 0 (registrato sopra).
- [ ] **Scope del branch:** Run (bash): `git diff --name-only <BASE>..HEAD` → solo `packages/shared/src/ipc.ts`/`ipc.test.ts`, `app/desktop/src/**`, `app/desktop/package.json`, `app/desktop/electron.vite.config.ts`, `package.json` (root, script ABI), `docs/superpowers/plans/` (il doc). Nessun `out/` committato, nessun altro pacchetto toccato.

---

## Self-review (eseguita su questo piano)

**1. Copertura spec.**
- §5.2 (CQRS attraverso i processi: write side autorevole nel main + read side proiezione) → Task 3 (handler `dispatch`/`runTurn`/`reflect` nel main; `pushReadModel` snapshot al renderer). ✅
- §5.1 (ES + CQRS) → Task 3 monta `createCampaignService` del 9c-i (decide→persisti→proietta). ✅
- §6.3 (persistenza offline-first: SQLite rigenerabile dagli eventi) → Task 3 (`createMemorySystem` su `userData`) + Setup (plugin migrazioni → `out/migrations`) + Gate fase 2 (durabilità su disco verificata eseguendo l'app). ✅
- §4 (struttura main/preload/renderer; sicurezza `contextIsolation`/`sandbox`/`nodeIntegration:false`; `safeStorage`; validazione Zod ai confini) → Task 3 (webPreferences invariati dal 9a + `safeParse` ai confini), Task 2 (`safeStorage` per le chiavi), Task 1 (`commandSchema` al confine). ✅
- §5.4 (turno agentico) → Task 3 (`runTurn` handler) + provider reale (`createLanguageProvider` via `set-provider`/holder). Esecuzione live = smoke test manuale G8. ✅
- §6.1 (Reflection) → Task 3 (`reflect` handler sul servizio). ✅
- §13 (delta vs snapshot read-model) → snapshot scelto, delta rimandato (dichiarato). ✅
- Esplicitamente FUORI 9c-ii: UI reale (Piano 10), nuovi Command/Event/FSM (traccia engine), L3/RAG (Fase 2), LLM live nel gate (manuale). Dichiarato in "Perché questo piano è 9c-ii". ✅

**2. Scan placeholder.** Nessun TODO/TBD/"simile a Task N"/"gestisci gli edge case". Ogni step ha codice/comandi completi. L'unico punto "verificato eseguendo" è il gate finale — **per disegno** (parti non unit-testabili su ABI Node), con asserzioni esplicite (VERDICT) e exit code. ✅

**3. Coerenza dei tipi.** `IPC_CHANNELS` (Task 1) usati identici in main (Task 3) e preload (Task 4). `DispatchResult`/`RunTurnResult`/`ProviderResult`/`ReflectResult`/`StatusResult`/`ReadModelPush` (Task 1) sono i tipi di ritorno degli handler (Task 3) e del bridge (Task 4). `LoomnBridge` (Task 1) implementato dal preload (Task 4) e consumato dal renderer via `window.loomn` (`env.d.ts` invariato). `ProviderHolder` (Task 2: `model`/`structured`/`configure`/`isConfigured`) usato dal main (Task 3: `holder.model`/`holder.structured` → `createCampaignService`; `holder.configure(createLanguageProvider(...))`; `holder.isConfigured()`). `ProviderConfig` (Task 1) consumato da `settings.ts` (Task 2) e `set-provider` (Task 3). `dispatchRequestSchema.safeParse(...).data` (`z.infer<commandSchema>`) → `service.dispatch(command: Command)` cast-free (drift guard del 9c-i). `structuredClone(rm.state)` (engine `GameState`) → `ReadModelPush.state` (`z.infer<gameStateSchema>`): typecheck del main = drift guard engine→push. `createMemorySystem`/`createCampaignService`/`createLanguageProvider`/`LanguageProvider`/`MemorySystem`/`CampaignService` combaciano col barrel di `@loomn/host`. `LanguageModel`/`LlmRequest`/`LlmStreamEvent`/`StructuredOutputPort`/`StructuredOutputRequest`/`StructuredOutputResult` combaciano col barrel di `@loomn/ai`. `createSeededRandom` da `@loomn/engine`. ✅

**4. House rules.** Scope discipline in ogni task; deps/script ABI/config Electron come passi orchestratore (non subagent); `exactOptionalPropertyTypes` via assegnazioni condizionali (`settings.ts`, `provider-holder`); `verbatimModuleSyntax` via `import type`; `noUncheckedIndexedAccess` via `?.`/`?? ''` (`rest[1] ?? ''`, `actors['goblin']?.name`, `obj['baseUrl']`); nessun apostrofo nelle descrizioni in apici singoli né nei commenti (`e` per `è`); `pnpm -r typecheck` (mai `tsc -b`); `@loomn/host`/`ai`/`memory`/`engine` **composti, non modificati**; `Date.now` assente nel codice nuovo (il main inietta `createSeededRandom(1)`; il clock reale resta `host/clock.ts`); `shared` resta foglia (`ipc.ts` importa solo `zod` + `./domain-schema`); flip ABI confinato al solo gate finale con ripristino obbligatorio. ✅

**5. Rischi dichiarati (non placeholder, da confermare al gate).** (a) Firma di `console-message` variabile fra versioni Electron → estrazione robusta del messaggio + timeout di sicurezza; il gate conferma. (b) `loadFile(file, { query })` / `app.setPath('userData', …)` / `app.exit(code)` sono API Electron standard; il gate li esercita. (c) Assegnabilità engine `GameState` → `z.infer<gameStateSchema>` per il push: poggia sul design cast-free del Piano 6; il typecheck del main (Task 3) la prova a compile-time — se emergesse attrito, il fix e locale a `ipc.ts`/`pushReadModel`, non struttura. ✅

---

## Roadmap dopo il Piano 9c-ii (Piano 9 COMPLETO)

- **Piano 9c-ii** ← *questo piano* (Integrazione Electron: IPC reale + persistenza nell'app; ~266 test + gate "esegui l'app"). **Conclude il Piano 9.**
- **Traccia engine separata:** nuovi `Command`/`Event` per gli strumenti rimandati di 7c (`request_check`/`apply_effect`/`advance_quest` + contesto quest) e la **FSM di fase** (spec §5.5).
- **Piano 10 — UI Vue** (chat, scheda PG, **pannello dadi 3D** con `@3d-dice/dice-box` a risultati deterministici, journal, gestione provider): **preceduto da fase di studio/design dedicata** (brainstorming + `frontend-design`), NON si parte da `writing-plans`. Punto di aggancio: `ReadModel = {version, state}` + i canali del 9c-ii (Pinia sul read side; `set-provider`/`run-turn`/`reflect`).
- **Piano 11 — Moduli a tema** (formato dati Zod + import/export + 1 modulo curato).
- **Follow-up tracciati (non in 9c-ii):** seed RNG per-campagna **persistito** (replay già deterministico — gli Event memorizzano i fatti risolti); **segmentazione `reflect` per scena** (oggi `reflect(scope)` riflette l'intero stream come una scena → una seconda `reflect` sullo stesso range collide sugli id deterministici `f-<from>-<to>-<i>`/`s-scene-<from>-<to>`). Entrambi vanno con la traccia engine/UI. Delta read-model (spec §13) quando lo stato cresce.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-16-loomn-fase1-piano9cii-integrazione-electron.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — un subagent fresco per task, spec review + (dove c'è logica) code-quality review fra i task, final review dell'intero branch, poi `finishing-a-development-branch` (merge locale in main). I passi "Setup orchestratore" (deps `app/desktop` + script ABI + `electron.vite.config.ts` + `pnpm install`) e l'intero **Gate finale "esegui l'app"** (rebuild Electron → due lanci self-test → ripristino ABI Node) li eseguo io (orchestratore), non un subagent. I Task 2–4 sono *by-running-the-app*: la review fra i task verifica codice + `vue-tsc`/build su ABI Node; la prova runtime è il gate finale.

**2. Inline Execution** — eseguo i task in questa sessione con `executing-plans`, a blocchi con checkpoint di review.

**Quale approccio?**
