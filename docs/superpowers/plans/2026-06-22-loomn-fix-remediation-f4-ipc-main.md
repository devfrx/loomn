# Fase 4 — Confine IPC & robustezza dell'app — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chiudere a causa radice, debt-free, i 3 finding del confine IPC/main della campagna di remediation (I‑02 Ctrl+R perde i dati, I‑11 avvio non robusto + nessun single-instance lock, M‑06 `getStatus` senza error-handling né result-union) + i 2 flag cross-fase di F4 (self-test versione, `.finite()` sui read-DTO).

**Architecture:** Il read-side diventa self-healing (canale pull `get-read-model` + pull-on-mount + `.once`→`.on`), così lo store renderer si ri-idrata a ogni reload indipendentemente dal timing del push. L'avvio diventa robusto (single-instance lock per-userData + try/catch attorno alla creazione del DB/servizio con `dialog.showErrorBox`). Il confine IPC diventa coerente (`StatusResult` migrato a `z.union([{ok:true,…},{ok:false,error}])` come gli altri canali, handler try/catch). Tutti i fix riusano i pattern esistenti del Piano 0 (canali read sincroni fuori dalla coda FIFO) e del 9c-ii (handler union).

**Tech Stack:** TypeScript strict, Zod 3.25, Electron 42, Vue 3 + Pinia (renderer), Vitest. Monorepo pnpm.

---

## Contesto e ambito

**Documenti d'autorità:**
- Piano-campagna: `docs/superpowers/plans/2026-06-19-loomn-remediation-campaign.md` (sezione "F4 — Confine IPC & robustezza dell'app" + §9 mappa finding→fase).
- Report d'audit: `docs/superpowers/audits/2026-06-19-loomn-audit-findings.md` (schede I‑02, I‑11, M‑06).
- HANDOFF §0 (primo bullet) + §4 (processo) + §5 (house rules) + §6 (ambiente/comandi) + §9 (checklist d'avvio, gate Electron 2 fasi).

**Decisioni di design GIÀ bloccate (NON ri-litigare):**
- **I‑02 = Decisione 5:** canale pull `get-read-model` (handler sincrono `service.getReadModel()` + `structuredClone`, fuori dalla coda FIFO come `getCanon`/`getSummaries`) + pull-on-mount nel bootstrap renderer + `.once`→`.on` su `did-finish-load`.
- **I‑11:** `app.requestSingleInstanceLock()` (false → focus finestra esistente + `app.quit()`); try/catch attorno a `createMemorySystem`/`createCampaignService` → `dialog.showErrorBox` + `app.exit(1)`; `process.on('unhandledRejection')` nel main.
- **M‑06:** migrare `StatusResult` a `z.union([{ok:true,…},{ok:false,error}])`; try/catch nell'handler; adeguare `provider-status.ts` all'arm d'errore.

**Scope F4 (file toccabili):**
- `packages/shared/src/ipc.ts` (+ `ipc.test.ts`)
- `app/desktop/src/main/` (`index.ts`, `settings.ts`)
- `app/desktop/src/preload/index.ts`
- `app/desktop/src/renderer/src/renderer.ts` (bootstrap + self-test)
- `app/desktop/src/renderer/src/stores/provider-status.ts` (+ `provider-status.test.ts`)
- Stub di `getStatus` nei test renderer toccati come **conseguenza necessaria** della union M‑06 (NON cambia la logica delle viste): `use-first-run.test.ts`, `views/GameView.test.ts`, `views/SettingsView.test.ts`, `components/NarrativePanel.test.ts`, `components/FirstRunBanner.test.ts`.

**Fuori ambito (NON toccare):**
- `packages/engine|ai|memory` (oltre il consumo dei contratti esistenti). Nessun nuovo `Command`/`Event`.
- Altri pannelli/viste renderer e la loro **logica** (sono F5/F6). Le `.vue` NON cambiano: `SettingsView.vue` legge tutto via lo **store** `useProviderStatusStore` (verificato), che mantiene la stessa superficie di getter.
- `stores/read-model.ts` (`applyPush`) — vedi "Flag/follow-up emersi" sotto.
- Il bottone 'Round successivo' renderer (→ F6).
- L'estensione self-test del path **reload** (`location.reload()`) — è di **F7** per il piano-campagna.
- `package.json`, `tsconfig*.json`, `vitest.config*` (house rule §5.1; eccezione consapevole è di F7).

**Vincolo debt-free (lezione F1/F2/F3 — RICONFERMATO):** mai restringere lo schema di **LETTURA** con bound (`.int()/.min()/.max()`): rifiuterebbe dati storici legittimi. `.finite()` è la categoria **SICURA** (rifiuta solo `Infinity`/`NaN`, mai un valore storico legittimo: `salience ∈ [0.1,1]`, `importance 1–10` sono sempre finiti) — è esattamente il flag read-DTO che F4 chiude. Per `get-read-model` non si aggiunge alcuno schema nuovo: si **riusa** `readModelPushSchema` (= snapshot `{version,state}` già spinto dal push). Per `StatusResult` la union è additiva (gli arm non aggiungono bound numerici nuovi).

**Flag cross-fase di F4 (gestiti qui):**
1. **`.finite()` sui read-DTO** `canonFactSchema.salience`, `summarySchema.importance`, `summarySchema.salience` → **Task 1**.
2. **Self-test versione 7→8** → **RISOLTO = resta 7.** Tutti i fix F4 sono read-only/robustezza: NON aggiungono `DomainEvent`, quindi la versione persistita NON avanza. Il self-test phase 2 continua ad attendere `version === 7`. Il canale `get-read-model` viene **esercitato in sola lettura** nel self-test (asserisce `version === 7`), senza mutare lo stato. L'estensione che forza un `location.reload()` (l'unico scenario che giustificherebbe una gestione-versione diversa) è di **F7**. Questo flag è documentato e chiuso, NON richiede un bump.

**Flag/follow-up NUOVI emersi durante la stesura (ANNOTATI, NON implementati in F4):**
- **Guardia di monotonia su `applyPush` (`stores/read-model.ts`):** con il pull-on-mount un pull stantio (versione più bassa) potrebbe in teoria sovrascrivere un push più fresco. Reachability **praticamente nulla** (richiede un dispatch nella finestra sub-millisecondo del bootstrap, prima che la UI sia interattiva; nel reload reale pull e push sono alla STESSA versione → nessun clobber). Fuori scope F4 (tocca `read-model.ts`, non elencato). Follow-up: `if (state.value !== null && push.version < version.value) return;` in `applyPush`. → annotare in HANDOFF.
- **`rulesetResultSchema.vocabulary.defaultResources` usa `z.number()` nudo** (`current`/`max`): pre-esistente, non nel set nominato dal flag F4. `.finite()` sarebbe sicuro ma è espansione di scope → NON in F4, annotare come consistenza minore.

---

## File Structure

| File | Responsabilità | Task |
|------|----------------|------|
| `packages/shared/src/ipc.ts` | `.finite()` su 3 read-DTO; canale `getReadModel` + metodo bridge; `statusResultSchema` → union | 1, 2, 3 |
| `packages/shared/src/ipc.test.ts` | test schema: `.finite()`, canale `get-read-model`, `StatusResult` union | 1, 2, 3 |
| `app/desktop/src/main/index.ts` | helper `buildReadModelPush` + handler `get-read-model` + `.once`→`.on`; handler `getStatus` union+try/catch; single-instance + avvio robusto | 2, 3, 4 |
| `app/desktop/src/main/settings.ts` | `ProviderMeta` derivato dall'arm `ok:true` di `StatusResult` | 3 |
| `app/desktop/src/preload/index.ts` | metodo bridge `getReadModel` | 2 |
| `app/desktop/src/renderer/src/renderer.ts` | pull-on-mount; self-test: esercizio `get-read-model`; callsite `getStatus` union | 2, 3 |
| `app/desktop/src/renderer/src/stores/provider-status.ts` | getter guardati sull'arm `ok`; getter `error` | 3 |
| `app/desktop/src/renderer/src/stores/provider-status.test.ts` | stub union + test arm d'errore | 3 |
| 5 file di test con stub `getStatus` | adattamento meccanico alla union (`ok:true`) | 3 |

---

## Task 1 — Flag cross-fase: `.finite()` sui read-DTO (`salience`/`importance`)

**Razionale:** i campi `canonFactSchema.salience`, `summarySchema.importance`, `summarySchema.salience` usano `z.number()` nudo, che accetta `Infinity`/`-Infinity`. `.finite()` li rende coerenti con la disciplina di I‑13 (F1). È **sicuro** sul read-path: i valori legittimi sono sempre finiti (`salience ∈ [0.1,1]` da `scoreSalience`; `importance` coerciuta finita in F3/G5). NON è un bound (`.int()/.min()/.max()`), quindi NON rifiuta dati storici legittimi.

**Files:**
- Modify: `packages/shared/src/ipc.ts:146` (`canonFactSchema.salience`), `:171` (`summarySchema.importance`), `:172` (`summarySchema.salience`)
- Test: `packages/shared/src/ipc.test.ts`

- [ ] **Step 1: Scrivi i test falliti**

Aggiungi in `packages/shared/src/ipc.test.ts`, dentro il `describe('canali read on-demand (narrazione / canon / L2)')` esistente (oppure in un nuovo `describe` adiacente), questi due `it`:

```ts
  it('canonFact salience rifiuta Infinity (finite, read-DTO sicuro)', () => {
    const base = {
      id: 'f1',
      subject: 'krix',
      predicate: 'teme',
      object: 'il barone',
      eventSeq: 3,
      status: 'active' as const,
    };
    expect(canonFactSchema.parse({ ...base, salience: 0.7 }).salience).toBe(0.7);
    expect(() => canonFactSchema.parse({ ...base, salience: Infinity })).toThrow();
    expect(() => canonFactSchema.parse({ ...base, salience: -Infinity })).toThrow();
  });

  it('summary importance e salience rifiutano Infinity (finite, read-DTO sicuro)', () => {
    const base = {
      id: 's1',
      level: 'scene' as const,
      scope: 'campaign',
      text: 'riassunto',
      createdAt: 1,
      eventSeqFrom: 1,
      eventSeqTo: 5,
    };
    expect(summarySchema.parse({ ...base, importance: 6, salience: 0.5 }).importance).toBe(6);
    expect(() => summarySchema.parse({ ...base, importance: Infinity, salience: 0.5 })).toThrow();
    expect(() => summarySchema.parse({ ...base, importance: 6, salience: Infinity })).toThrow();
  });
```

Assicurati che `canonFactSchema` e `summarySchema` siano importati in cima a `ipc.test.ts` (aggiungili all'import da `'./ipc'` se mancano).

- [ ] **Step 2: Lancia i test per verificarne il fallimento**

Run: `pnpm exec vitest run packages/shared/src/ipc.test.ts`
Expected: FAIL — i casi `Infinity` passano (perché `z.number()` accetta `Infinity`), quindi le asserzioni `toThrow()` falliscono.

- [ ] **Step 3: Aggiungi `.finite()` ai tre campi**

In `packages/shared/src/ipc.ts`, nel `canonFactSchema`:

```ts
  salience: z.number().finite(),
```

Nel `summarySchema`:

```ts
  importance: z.number().finite(),
  salience: z.number().finite(),
```

(Lascia invariati `eventSeq`/`createdAt`/`eventSeqFrom`/`eventSeqTo`: sono già `.int().nonnegative()`.)

- [ ] **Step 4: Lancia i test per verificarne il successo**

Run: `pnpm exec vitest run packages/shared/src/ipc.test.ts`
Expected: PASS (tutti, inclusi i 2 nuovi).

- [ ] **Step 5: Typecheck del pacchetto**

Run: `pnpm -C packages/shared typecheck`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/ipc.ts packages/shared/src/ipc.test.ts
git commit -m "fix(ipc): .finite() su salience/importance dei read-DTO [F4 flag, read-path sicuro]"
```

**Conteggio test atteso:** +2 in `packages/shared` → **~753** (conferma con l'output reale).

---

## Task 2 — I‑02: canale pull `get-read-model` + `.once`→`.on` + pull-on-mount

**Razionale:** `createWindow` registra il push con `.once('did-finish-load')` → consumato al primo load; a un Ctrl+R `did-finish-load` rifira ma il listener è consumato → nessun re-push e nessun canale pull → lo store renderer resta vuoto fino a un dispatch (SEED‑1). Fix robusto (Decisione 5): (a) canale pull `get-read-model` (handler sincrono che riusa lo stesso payload `{version,state}` del push); (b) pull-on-mount nel bootstrap; (c) `.once`→`.on` (ogni load ri-spinge). Read-side self-healing.

**`get-read-model` riusa `readModelPushSchema`/`ReadModelPush`** (= snapshot `{version,state}`): nessuno schema nuovo, e il bootstrap può fare `store.applyPush(await window.loomn.getReadModel())` direttamente (NON una union `{ok,…}`, coerente col fatto che `getReadModel()` è una proiezione in-memory pura — `pushReadModel` già la chiama senza try/catch).

**Files:**
- Modify: `packages/shared/src/ipc.ts` (`IPC_CHANNELS.getReadModel`, `LoomnBridge.getReadModel`)
- Test: `packages/shared/src/ipc.test.ts`
- Modify: `app/desktop/src/main/index.ts` (helper `buildReadModelPush`, handler, `.once`→`.on`, import del tipo)
- Modify: `app/desktop/src/preload/index.ts` (metodo bridge)
- Modify: `app/desktop/src/renderer/src/renderer.ts` (pull-on-mount + esercizio self-test)

- [ ] **Step 1: Scrivi il test fallito del canale**

In `packages/shared/src/ipc.test.ts`, aggiungi nel `describe('readModelPushSchema …')` (o adiacente) un `it`, e aggiungi l'asserzione del nome canale nel test `IPC_CHANNELS` esistente.

Nel test esistente che asserisce i nomi canale (`expect(IPC_CHANNELS.readModelPush).toBe('loomn:read-model-push');`), aggiungi subito sotto:

```ts
    expect(IPC_CHANNELS.getReadModel).toBe('loomn:get-read-model');
```

Nuovo `it`:

```ts
  it('il canale get-read-model riusa readModelPushSchema come risultato (pull = push)', () => {
    const snapshot = { version: 4, state: { version: 4, actors: {}, encounter: null, quests: {}, phase: 'exploration' as const } };
    const parsed = readModelPushSchema.parse(snapshot);
    expect(parsed.version).toBe(4);
    expect(IPC_CHANNELS.getReadModel).toBe('loomn:get-read-model');
  });
```

- [ ] **Step 2: Lancia il test per verificarne il fallimento**

Run: `pnpm exec vitest run packages/shared/src/ipc.test.ts`
Expected: FAIL — `IPC_CHANNELS.getReadModel` è `undefined` (canale non ancora definito).

- [ ] **Step 3: Aggiungi il canale e il metodo bridge in `ipc.ts`**

In `IPC_CHANNELS`, dopo `getRuleset` (prima di `readModelPush`):

```ts
  /** invoke/handle: PULL del read-model (read-side self-healing, I-02). Stesso payload {version,state}
   *  del push readModelPush; il renderer lo idrata on-mount, indipendente dal timing del push. */
  getReadModel: 'loomn:get-read-model',
```

In `interface LoomnBridge`, dopo `getRuleset(): Promise<RulesetResult>;`:

```ts
  /** Pull del read-model corrente (snapshot {version,state}), per la re-idratazione on-mount (I-02). */
  getReadModel(): Promise<ReadModelPush>;
```

- [ ] **Step 4: Lancia il test per verificarne il successo**

Run: `pnpm exec vitest run packages/shared/src/ipc.test.ts`
Expected: PASS.

- [ ] **Step 5: Implementa l'handler nel main (DRY con `pushReadModel`)**

In `app/desktop/src/main/index.ts`:

(a) Aggiungi l'import del tipo canale (già presente `IPC_CHANNELS`; assicurati che `ReadModelPush` sia importato — lo è già da `@loomn/shared`).

(b) Estrai un helper e refactora `pushReadModel` per riusarlo. Sostituisci la funzione `pushReadModel` esistente con:

```ts
/** Costruisce lo snapshot read-side {version, state} (spec 5.2). structuredClone difensivo del
 *  riferimento read-only di ReadModel.state (auto-documenta il contratto; send/IPC clona comunque). */
function buildReadModelPush(service: CampaignService): ReadModelPush {
  const rm = service.getReadModel();
  return { version: rm.version, state: structuredClone(rm.state) };
}

/** Read side (spec 5.2): spinge lo snapshot {version, state} al renderer (push). */
function pushReadModel(service: CampaignService): void {
  if (mainWindow === undefined) return;
  mainWindow.webContents.send(IPC_CHANNELS.readModelPush, buildReadModelPush(service));
}
```

(c) In `registerHandlers`, dopo l'handler `getRuleset`, aggiungi:

```ts
  ipcMain.handle(IPC_CHANNELS.getReadModel, (): ReadModelPush => buildReadModelPush(service));
```

(d) `.once`→`.on` in `createWindow` (riga ~236). Sostituisci:

```ts
  win.webContents.once('did-finish-load', () => pushReadModel(service));
```

con:

```ts
  // I-02: .on (non .once) -> ogni did-finish-load, incluso un reload (Ctrl+R), ri-spinge il read-model.
  win.webContents.on('did-finish-load', () => pushReadModel(service));
```

- [ ] **Step 6: Implementa il metodo nel preload**

In `app/desktop/src/preload/index.ts`, nel `const bridge: LoomnBridge`, dopo `getRuleset`:

```ts
  getReadModel: (): Promise<ReadModelPush> => ipcRenderer.invoke(IPC_CHANNELS.getReadModel),
```

(`ReadModelPush` è già importato nel preload.)

- [ ] **Step 7: Pull-on-mount nel bootstrap renderer**

In `app/desktop/src/renderer/src/renderer.ts`, dopo la riga della sottoscrizione push:

```ts
const store = useReadModelStore(pinia);
window.loomn.onReadModelPush((push) => store.applyPush(push));
```

aggiungi:

```ts
// I-02: pull-on-mount. Read-side self-healing: idrata lo store anche se il push e gia passato (Ctrl+R),
// indipendente dal timing del push. Nel reale post-reload pull e push sono alla stessa versione.
void window.loomn.getReadModel().then((push) => store.applyPush(push));
```

- [ ] **Step 8: Esercizio read-only di `get-read-model` nel self-test**

In `renderer.ts`, nella `runSelfTest`, **phase '1'**, subito dopo il blocco del comando GM `EnterPhase` (dopo il `check(... 'comando GM EnterPhase cambia fase')`), aggiungi:

```ts
      // I-02: il canale pull ritorna lo snapshot corrente (qui versione 7, dopo EnterPhase). Read-only.
      const rmPull = await window.loomn.getReadModel();
      check(
        rmPull.version === 7 && rmPull.state.actors['goblin']?.name === 'Goblin',
        'get-read-model pull ritorna lo stato corrente (canale I-02)',
      );
```

E nella **phase 2** (l'`else`), dopo l'ultimo `check(... 'store Pinia riflette lo stato persistito')`, aggiungi:

```ts
      // I-02: dopo il riavvio il pull ri-idrata lo stato persistito senza dipendere dal push.
      const rmPull = await window.loomn.getReadModel();
      check(
        rmPull.version === 7 && rmPull.state.actors['goblin']?.name === 'Goblin',
        'get-read-model pull ri-idrata dopo il riavvio (canale I-02)',
      );
```

(La versione attesa resta **7**: F4 non aggiunge eventi di dominio.)

- [ ] **Step 9: Typecheck (compile-time guard del bridge)**

Run: `pnpm -C packages/shared typecheck && pnpm -C app/desktop typecheck`
Expected: nessun errore. (Il tipo `LoomnBridge` forza preload e renderer a implementare/usare `getReadModel` coerentemente; se mancasse, `vue-tsc`/`tsc` fallirebbe.)

- [ ] **Step 10: Suite mirata**

Run: `pnpm exec vitest run packages/shared/src/ipc.test.ts`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add packages/shared/src/ipc.ts packages/shared/src/ipc.test.ts app/desktop/src/main/index.ts app/desktop/src/preload/index.ts app/desktop/src/renderer/src/renderer.ts
git commit -m "fix(ipc): canale pull get-read-model + .once->.on + pull-on-mount [I-02, read-side self-healing]"
```

**Nota di test:** l'handler nel main e il bootstrap renderer NON sono unit-testabili (Electron); sono verificati dal **gate Electron 2 fasi** (che ora esercita `get-read-model` in sola lettura) + lettura di review. Il test automatico è il contratto schema/canale in `ipc.test.ts`. Il path **reload** (`location.reload()`) è coperto dal self-test esteso in **F7**.

**Conteggio test atteso:** +1 in `packages/shared` → **~754**.

---

## Task 3 — M‑06: `StatusResult` → union + handler robusto + store + stub

**Razionale:** `getStatus` è l'unico handler senza try/catch e `StatusResult` l'unico result non modellato come union `ok/error`. Se `loadProviderMeta`/`safeStorage` lanciasse, il renderer riceverebbe un reject grezzo (unhandled rejection nel bootstrap). Fix: union `z.union([{ok:true,…},{ok:false,error}])` come gli altri canali + try/catch nell'handler + adattamento dei consumatori all'arm d'errore.

**Conseguenze necessarie (stessa contract change, NON nuova feature):**
- `settings.ts:71` `ProviderMeta = NonNullable<StatusResult['provider']>` → deve derivare dall'arm `ok:true` (la union non ha `provider` su tutti gli arm).
- `provider-status.ts` getter guardati su `.ok` (preservando la superficie pubblica → le viste NON cambiano).
- `renderer.ts` self-test: ogni `getStatus()` letto come `s.ok && s.campo`.
- Stub `getStatus` nei test renderer: aggiungere `ok: true` (al runtime lo store legge `.ok`; senza, i test falliscono).

**Files:**
- Modify: `packages/shared/src/ipc.ts` (`statusResultSchema`)
- Test: `packages/shared/src/ipc.test.ts`
- Modify: `app/desktop/src/main/index.ts` (handler `getStatus`)
- Modify: `app/desktop/src/main/settings.ts` (`ProviderMeta`)
- Modify: `app/desktop/src/renderer/src/stores/provider-status.ts`
- Test: `app/desktop/src/renderer/src/stores/provider-status.test.ts`
- Modify (stub): `app/desktop/src/renderer/src/composables/use-first-run.test.ts`, `views/GameView.test.ts`, `views/SettingsView.test.ts`, `components/NarrativePanel.test.ts`, `components/FirstRunBanner.test.ts`
- Modify: `app/desktop/src/renderer/src/renderer.ts` (self-test `getStatus`)

- [ ] **Step 1: Riscrivi i test schema di `StatusResult` in forma union (alcuni RED)**

In `packages/shared/src/ipc.test.ts`, sostituisci i 4 `it` di `statusResult` (da `statusResult richiede i tre flag diagnostici` a `statusResult con provider rifiuta hasApiKey mancante`) con:

```ts
  it('statusResult ok porta i tre flag diagnostici', () => {
    expect(
      statusResultSchema.parse({ ok: true, version: 0, safeStorageAvailable: true, providerConfigured: false }),
    ).toEqual({ ok: true, version: 0, safeStorageAvailable: true, providerConfigured: false });
  });

  it('statusResult ok accetta il read-back provider opzionale (baseUrl/model/hasApiKey)', () => {
    const withProvider = statusResultSchema.parse({
      ok: true,
      version: 2,
      safeStorageAvailable: true,
      providerConfigured: true,
      provider: { baseUrl: 'http://localhost:1234/v1', model: 'local', hasApiKey: true },
    });
    expect(withProvider).toEqual({
      ok: true,
      version: 2,
      safeStorageAvailable: true,
      providerConfigured: true,
      provider: { baseUrl: 'http://localhost:1234/v1', model: 'local', hasApiKey: true },
    });
  });

  it('statusResult ok resta valido senza provider (nessuna config persistita)', () => {
    const noProvider = statusResultSchema.parse({
      ok: true,
      version: 0,
      safeStorageAvailable: true,
      providerConfigured: false,
    });
    expect(noProvider).toEqual({ ok: true, version: 0, safeStorageAvailable: true, providerConfigured: false });
  });

  it('statusResult ok con provider rifiuta hasApiKey mancante', () => {
    expect(() =>
      statusResultSchema.parse({
        ok: true,
        version: 0,
        safeStorageAvailable: true,
        providerConfigured: true,
        provider: { baseUrl: 'http://x/v1', model: 'm' },
      }),
    ).toThrow();
  });

  it('statusResult arm di errore porta ok false e error', () => {
    expect(statusResultSchema.parse({ ok: false, error: 'safeStorage non disponibile' })).toEqual({
      ok: false,
      error: 'safeStorage non disponibile',
    });
    // Senza il discriminante ok i flag nudi non sono piu un result valido (era la vecchia forma).
    expect(() => statusResultSchema.parse({ version: 0, safeStorageAvailable: true, providerConfigured: false })).toThrow();
  });
```

- [ ] **Step 2: Lancia i test per verificarne il fallimento**

Run: `pnpm exec vitest run packages/shared/src/ipc.test.ts`
Expected: FAIL — `statusResultSchema` è ancora l'oggetto piatto (non accetta `ok`/`error`, e accetta i flag nudi).

- [ ] **Step 3: Migra `statusResultSchema` a union in `ipc.ts`**

Sostituisci il blocco `statusResultSchema`/`StatusResult` (righe ~92‑103) con:

```ts
// --- getStatus (diagnostica + read-back config provider) ---
/** provider e il read-back della config persistita per pre-compilare Impostazioni (10f): baseUrl/model
 *  + hasApiKey (la chiave non attraversa MAI l IPC). Opzionale-assente quando nessun provider e salvato.
 *  Union ok/errore come gli altri canali (M-06): l handler non propaga throw grezzi al renderer. */
export const statusResultSchema = z.union([
  z.object({
    ok: z.literal(true),
    version: z.number().int().nonnegative(),
    safeStorageAvailable: z.boolean(),
    providerConfigured: z.boolean(),
    provider: z
      .object({ baseUrl: z.string(), model: z.string(), hasApiKey: z.boolean() })
      .optional(),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type StatusResult = z.infer<typeof statusResultSchema>;
```

- [ ] **Step 4: Lancia i test schema per verificarne il successo**

Run: `pnpm exec vitest run packages/shared/src/ipc.test.ts`
Expected: PASS.

- [ ] **Step 5: Adegua l'handler `getStatus` nel main (try/catch + arm)**

In `app/desktop/src/main/index.ts`, sostituisci l'handler `getStatus` (righe ~122‑130) con:

```ts
  ipcMain.handle(IPC_CHANNELS.getStatus, (): StatusResult => {
    try {
      const meta = loadProviderMeta();
      return {
        ok: true,
        version: service.getReadModel().version,
        safeStorageAvailable: safeStorage.isEncryptionAvailable(),
        providerConfigured: holder.isConfigured(),
        ...(meta !== undefined ? { provider: meta } : {}),
      };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });
```

- [ ] **Step 6: Adegua `ProviderMeta` in `settings.ts`**

In `app/desktop/src/main/settings.ts`, sostituisci (riga ~71):

```ts
export type ProviderMeta = NonNullable<StatusResult['provider']>;
```

con:

```ts
/** = arm ok di StatusResult -> provider (read-drift guard, come canon/summary del Piano 0): se il DTO
 *  di get-status cambiasse, questo alias romperebbe qui. La chiave non e mai inclusa (solo hasApiKey). */
export type ProviderMeta = NonNullable<Extract<StatusResult, { ok: true }>['provider']>;
```

- [ ] **Step 7: Scrivi il test dell'arm d'errore nello store (RED)**

In `app/desktop/src/renderer/src/stores/provider-status.test.ts`:

(a) aggiorna lo stub di default in `beforeEach` (riga ~16) aggiungendo `ok: true`:

```ts
    window.loomn = {
      getStatus: () => Promise.resolve({ ok: true, version: 0, safeStorageAvailable: true, providerConfigured: false }),
    } as unknown as typeof window.loomn;
```

(b) aggiungi `ok: true` ai due `stubStatus({...})` esistenti (il test "refresh popola lo status…" e "canRunTurn e false…"):

```ts
    stubStatus({
      ok: true,
      version: 1,
      safeStorageAvailable: true,
      providerConfigured: true,
      provider: { baseUrl: 'http://x/v1', model: 'm', hasApiKey: true },
    });
```

```ts
    stubStatus({ ok: true, version: 0, safeStorageAvailable: true, providerConfigured: false });
```

(c) aggiungi un nuovo `it` per l'arm d'errore:

```ts
  it('refresh con arm di errore non crasha e resta non configurato', async () => {
    stubStatus({ ok: false, error: 'safeStorage non disponibile' });
    const s = useProviderStatusStore();
    await s.refresh();
    expect(s.loaded).toBe(true);
    expect(s.providerConfigured).toBe(false);
    expect(s.canRunTurn).toBe(false);
    expect(s.provider).toBeNull();
    expect(s.safeStorageAvailable).toBe(false);
    expect(s.error).toBe('safeStorage non disponibile');
  });
```

- [ ] **Step 8: Lancia il test dello store per verificarne il fallimento**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/stores/provider-status.test.ts`
Expected: FAIL — i getter leggono ancora `status.value?.providerConfigured` (l'arm `ok:false` non ha quei campi) e non esiste `error`; typecheck/runtime rompono.

- [ ] **Step 9: Adegua lo store `provider-status.ts` all'arm d'errore (preservando la superficie)**

Sostituisci il corpo della funzione di store (dal `const status = ref…` al `return …`) con:

```ts
  const status = ref<StatusResult | null>(null);

  /** Rilegge get-status (al boot e dopo ogni set-provider ok). */
  async function refresh(): Promise<void> {
    status.value = await window.loomn.getStatus();
  }

  /** True solo sull arm ok: i getter degradano in sicurezza sull arm di errore. */
  const ok = computed<boolean>(() => status.value?.ok === true);
  const loaded = computed<boolean>(() => status.value !== null);
  const providerConfigured = computed<boolean>(() =>
    status.value?.ok === true ? status.value.providerConfigured : false,
  );
  const provider = computed(() => (status.value?.ok === true ? (status.value.provider ?? null) : null));
  const safeStorageAvailable = computed<boolean>(() =>
    status.value?.ok === true ? status.value.safeStorageAvailable : false,
  );
  const canRunTurn = computed<boolean>(() => providerConfigured.value);
  /** Messaggio dell arm di errore (null su ok/non caricato). Il surfacing in UI e di F5/F6. */
  const error = computed<string | null>(() =>
    status.value !== null && status.value.ok === false ? status.value.error : null,
  );

  return { refresh, ok, loaded, providerConfigured, provider, safeStorageAvailable, canRunTurn, error };
```

(La superficie pubblica resta retro-compatibile per le viste: `refresh`, `loaded`, `providerConfigured`, `provider`, `safeStorageAvailable`, `canRunTurn`; `ok`/`error` sono additivi.)

- [ ] **Step 10: Lancia il test dello store per verificarne il successo**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/stores/provider-status.test.ts`
Expected: PASS.

- [ ] **Step 11: Adegua gli stub `getStatus` negli altri test renderer (meccanico)**

In ciascun file, ogni oggetto-risultato di `getStatus` deve acquisire `ok: true` (o `ok: true as const` dove il file già usa `as const` per altri canali). **NON** cambiare la logica delle viste/componenti — solo i mock.

`composables/use-first-run.test.ts` — i due `stubStatus({...})`:

```ts
    stubStatus({ ok: true, version: 0, safeStorageAvailable: true, providerConfigured: false });
```
```ts
    stubStatus({
      ok: true,
      version: 1,
      safeStorageAvailable: true,
      providerConfigured: true,
      provider: { baseUrl: 'http://x/v1', model: 'm', hasApiKey: true },
    });
```

`views/GameView.test.ts` — riga ~31:

```ts
      getStatus: vi.fn(() => Promise.resolve({ ok: true, version: 0, safeStorageAvailable: true, providerConfigured: false })),
```

`views/SettingsView.test.ts` — i due `stub({...})`:

```ts
    stub({
      ok: true,
      version: 1,
      safeStorageAvailable: true,
      providerConfigured: true,
      provider: { baseUrl: 'http://x/v1', model: 'm', hasApiKey: true },
    });
```
```ts
    const { setProvider } = stub({
      ok: true,
      version: 1,
      safeStorageAvailable: true,
      providerConfigured: true,
      provider: { baseUrl: 'http://x/v1', model: 'm', hasApiKey: true },
    });
```

`components/NarrativePanel.test.ts` — riga ~11 (default in `stubLoomn`) e riga ~38:

```ts
    getStatus: vi.fn(() => Promise.resolve({ ok: true as const, version: 0, safeStorageAvailable: true, providerConfigured: true })),
```
```ts
    window.loomn = { ...window.loomn, getStatus: vi.fn(() => Promise.resolve({ ok: true as const, version: 0, safeStorageAvailable: true, providerConfigured: false })) } as typeof window.loomn;
```

`components/FirstRunBanner.test.ts` — riga ~14, riga ~38, e il blocco righe ~52‑57:

```ts
    window.loomn = { getStatus: () => Promise.resolve({ ok: true, version: 0, safeStorageAvailable: true, providerConfigured: false }) } as unknown as typeof window.loomn;
```
```ts
    window.loomn = { getStatus: () => Promise.resolve({ ok: true, version: 1, safeStorageAvailable: true, providerConfigured: true, provider: { baseUrl: 'http://x/v1', model: 'm', hasApiKey: true } }) } as unknown as typeof window.loomn;
```
```ts
      getStatus: () =>
        Promise.resolve({
          ok: true,
          version: 1,
          safeStorageAvailable: true,
          providerConfigured: true,
          provider: { baseUrl: 'http://x/v1', model: 'm', hasApiKey: true },
        }),
```

- [ ] **Step 12: Adegua i callsite `getStatus` del self-test (`renderer.ts`)**

In `runSelfTest`, **phase '1'**:

```ts
      const s0 = await window.loomn.getStatus();
      check(s0.ok && s0.version === 0, 'DB fresco a versione 0');
      check(s0.ok && s0.safeStorageAvailable, 'safeStorage disponibile');
      check(s0.ok && s0.provider === undefined, 'nessun provider persistito a DB fresco');
```

```ts
      const s1 = await window.loomn.getStatus();
      check(s1.ok && s1.providerConfigured, 'provider configurato dopo set-provider');
      check(
        s1.ok &&
          s1.provider?.baseUrl === 'http://localhost:1234/v1' &&
          s1.provider?.model === 'local' &&
          s1.provider?.hasApiKey === true,
        'get-status espone il read-back provider dopo set-provider',
      );
```

```ts
      const s2 = await window.loomn.getStatus();
      check(s2.ok && s2.provider?.model === 'local-2' && s2.provider?.hasApiKey === true, 'chiave mantenuta ri-salvando senza chiave');
```

**Phase 2** (`else`):

```ts
      const s0 = await window.loomn.getStatus();
      check(s0.ok && s0.version === 7, 'versione 7 PERSISTITA dopo il riavvio (durabilita: incluso lo slice combat 10c)');
      check(s0.ok && s0.providerConfigured, 'provider ricostruito da settings.json (chiave decifrata)');
      check(s0.ok && s0.provider?.hasApiKey === true, 'read-back provider con chiave persistito dopo riavvio');
```

- [ ] **Step 13: Typecheck + suite renderer + shared**

Run: `pnpm -C packages/shared typecheck && pnpm -C app/desktop typecheck`
Expected: nessun errore.

Run: `pnpm exec vitest run packages/shared/src/ipc.test.ts app/desktop/src/renderer/src/stores/provider-status.test.ts app/desktop/src/renderer/src/composables/use-first-run.test.ts app/desktop/src/renderer/src/views/GameView.test.ts app/desktop/src/renderer/src/views/SettingsView.test.ts app/desktop/src/renderer/src/components/NarrativePanel.test.ts app/desktop/src/renderer/src/components/FirstRunBanner.test.ts`
Expected: PASS (tutti).

- [ ] **Step 14: Commit**

```bash
git add packages/shared/src/ipc.ts packages/shared/src/ipc.test.ts app/desktop/src/main/index.ts app/desktop/src/main/settings.ts app/desktop/src/renderer/src/stores/provider-status.ts app/desktop/src/renderer/src/stores/provider-status.test.ts app/desktop/src/renderer/src/composables/use-first-run.test.ts app/desktop/src/renderer/src/views/GameView.test.ts app/desktop/src/renderer/src/views/SettingsView.test.ts app/desktop/src/renderer/src/components/NarrativePanel.test.ts app/desktop/src/renderer/src/components/FirstRunBanner.test.ts app/desktop/src/renderer/src/renderer.ts
git commit -m "fix(ipc): StatusResult union ok/error + getStatus try/catch + store arm d'errore [M-06]"
```

**Conteggio test atteso:** +1 in `packages/shared` (arm d'errore) + +1 renderer (store arm d'errore) → **~756** (i 4 test statusResult restano 4, riscritti in forma union).

---

## Task 4 — I‑11: single-instance lock + avvio robusto

**Razionale:** nessun single-instance lock (due istanze sullo stesso `loomn.db` divergono → `ConcurrencyError`) + `createMemorySystem`/`migrate()` fuori da try/catch dentro `whenReady` (DB lockato o migrazione rotta → la Promise rigetta in silenzio, finestra mai creata, nessun messaggio). Fix: lock per-userData (false → `app.quit()`, `second-instance` rifocalizza), try/catch attorno alla creazione DB/servizio → `dialog.showErrorBox` + `app.exit(1)`, `process.on('unhandledRejection')` diagnostico.

**Ordine critico:** `app.setPath('userData', override)` va PRIMA del lock (il lock è per-userData → il gate con `LOOMN_USERDATA` deve bloccare sulla dir temp, non sulla default) e prima di `whenReady` (Electron lo esige per userData). Il gate fa **due lanci sequenziali** sulla stessa userData → il lock viene acquisito e rilasciato a ogni lancio (no conflitto).

**`unhandledRejection` solo-log:** NON chiama `app.exit` (una rejection benigna durante il gate non deve far fallire il self-test). L'audit lo segna "opzionale"; manteniamo il surfacing diagnostico minimale.

**Files:**
- Modify: `app/desktop/src/main/index.ts` (import `dialog`; ristrutturazione top-level di avvio)

- [ ] **Step 1: Aggiungi `dialog` all'import di electron**

```ts
import { app, BrowserWindow, dialog, ipcMain, safeStorage } from 'electron';
```

- [ ] **Step 2: Ristruttura l'avvio (single-instance + try/catch + unhandledRejection)**

Sostituisci l'intero blocco da `void app.whenReady().then(() => {` fino alla chiusura `});` di `whenReady` (righe ~240‑266, **NON** i due `app.on(...)` finali `window-all-closed`/`will-quit`) con:

```ts
// userData override per il gate (due lanci sequenziali sullo stesso DB temp); in produzione: default OS.
// Va impostata PRIMA del lock (per-userData) e prima di whenReady (Electron lo esige per userData).
const userDataOverride = process.env['LOOMN_USERDATA'];
if (userDataOverride !== undefined) app.setPath('userData', userDataOverride);

// I-11: una rejection non gestita nel main viene loggata (diagnostica). NON killa il processo: nel gate
// una rejection benigna non deve far fallire il self-test.
process.on('unhandledRejection', (reason) => {
  console.error('[MAIN] unhandledRejection:', reason instanceof Error ? reason.message : reason);
});

// I-11: una sola istanza per userData (la seconda divergerebbe sullo stesso loomn.db -> ConcurrencyError).
if (!app.requestSingleInstanceLock()) {
  // Seconda istanza: cedi il passo (la prima riceve 'second-instance' e si rifocalizza) ed esci.
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow === undefined) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void app.whenReady().then(() => {
    try {
      // Persistenza reale dentro Electron: UNA connessione (event store + ledger + summaries + assembler).
      memory = createMemorySystem(join(app.getPath('userData'), 'loomn.db'));
      const service = createCampaignService({
        memory,
        model: holder.model,
        structured: holder.structured,
        rng: createSeededRandom(DEV_SEED),
        ruleset: devRuleset,
      });

      // Provider persistito (settings.json) -> ricostruisci all avvio (decifra la chiave con safeStorage).
      const savedProvider = loadProviderConfig();
      if (savedProvider !== undefined) holder.configure(createLanguageProvider(toLanguageProviderConfig(savedProvider)));

      registerHandlers(service);
      mainWindow = createWindow(service);
      console.log('[MAIN] Loomn pronto');

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow(service);
      });
    } catch (err) {
      // Avvio fallito (DB lockato, migrazione rotta, ...): mostra un messaggio invece della finestra nera.
      dialog.showErrorBox('Loomn non può avviarsi', errorMessage(err));
      app.exit(1);
    }
  });
}
```

(I due handler finali `app.on('window-all-closed', …)` e `app.on('will-quit', …)` restano invariati. `memory?.close()` resta sicuro anche se la seconda istanza esce prima di creare `memory` — è `undefined`, no-op.)

- [ ] **Step 3: Typecheck**

Run: `pnpm -C app/desktop typecheck`
Expected: nessun errore.

- [ ] **Step 4: Suite del progetto desktop (nessuna regressione)**

Run: `pnpm exec vitest run app/desktop`
Expected: PASS (i test renderer non importano `main/index.ts`; nessun cambiamento di conteggio).

- [ ] **Step 5: Commit**

```bash
git add app/desktop/src/main/index.ts
git commit -m "fix(main): single-instance lock + avvio robusto (try/catch + dialog) + unhandledRejection [I-11]"
```

**Nota di test:** I‑11 NON è unit-testabile (Electron-level). È verificato dal **gate Electron 2 fasi** (happy path: lock acquisito, app parte, finestra creata, self-test PASS su entrambe le fasi) + lettura di review dei rami `second-instance`/`catch`. Nessun nuovo test automatico.

**Conteggio test atteso:** +0 → **~756**.

---

## Verifica finale & gate (orchestratore, dopo i 4 task)

1. **Typecheck completo:** `pnpm -r typecheck` → 6 progetti puliti (incluso `app/desktop` via `vue-tsc`).
2. **Suite completa (ABI Node):** `pnpm test` dalla root → **~756 verdi** (conferma il numero reale). ⚠️ se `NODE_MODULE_VERSION 146 … requires 137` → `pnpm rebuild:node`.
3. **Anti-apostrofo del piano (house rule §5.4):** prima del commit del doc, `(it|describe)\('[^']*'[A-Za-zàèéìòù]` su questo file → **no matches**.
4. **Gate Electron 2 fasi** (da F4 in poi è obbligatorio — tocca `main` + bootstrap renderer). Procedura (HANDOFF §6/§9):
   - `pnpm --filter @loomn/desktop build` (ABI Node)
   - `pnpm rebuild:electron`
   - `GATE=$(mktemp -d); WIN_GATE=$(cygpath -m "$GATE")`
   - `LOOMN_SELFTEST=1 LOOMN_USERDATA="$WIN_GATE" pnpm --filter @loomn/desktop exec electron .` → atteso `VERDICT: PASS`, exit 0
   - `LOOMN_SELFTEST=2 LOOMN_USERDATA="$WIN_GATE" pnpm --filter @loomn/desktop exec electron .` (STESSO `$WIN_GATE`) → atteso `VERDICT: PASS`, exit 0 (persistenza, versione 7)
   - `pnpm rebuild:node` (torna ad ABI Node per `pnpm test`)
   - ⚠️ EBUSY/EPERM su `better_sqlite3.node` → trova SOLO i processi Loomn (`Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'tabl|loomn' -and $_.Name -match 'electron|node' }`), `Stop-Process -Force`, poi rebuild.

**Il gate esercita ora `get-read-model` in sola lettura (Task 2) e legge `getStatus` come union (Task 3); la versione persistita resta 7.**

---

## Self-review (copertura dello spec F4)

**Copertura finding/flag:**
- **I‑02** → Task 2 (canale pull `get-read-model` + `.once`→`.on` + pull-on-mount). ✅
- **I‑11** → Task 4 (single-instance + try/catch + dialog + unhandledRejection). ✅
- **M‑06** → Task 3 (`StatusResult` union + handler try/catch + store + stub). ✅
- **Flag `.finite()` read-DTO** → Task 1. ✅
- **Flag self-test 7→8** → risolto = resta 7 (nessun evento di dominio aggiunto da F4), documentato; reload-self-test è F7. ✅

**Causa radice, no debiti:** I‑02 = canale pull + self-healing (non la sola pezza `.once`→`.on`); M‑06 = union come gli altri canali (non solo try/catch); I‑11 = lock + dialog + diagnostica. Riuso massimo: `get-read-model` riusa `readModelPushSchema` (zero schema nuovi) e `buildReadModelPush` estratto da `pushReadModel` (DRY); la union segue il pattern dei canali esistenti; il read-drift guard `ProviderMeta` resta (adattato all'arm `ok`). ✅

**Debt-free / read-path:** `.finite()` è l'unica restrizione aggiunta (sicura, mai un bound); la union non aggiunge bound numerici. Nessuno schema di LETTURA ristretto con `.int()/.min()/.max()`. ✅

**Disciplina di scope:** ogni task elenca i file esatti; nessun engine/ai/memory; nessuna `.vue` runtime; niente `package.json`/`tsconfig`/`vitest.config`; `read-model.ts` lasciato intatto (follow-up annotato). ✅

**Type consistency:** `getReadModel` (canale `IPC_CHANNELS.getReadModel`, metodo `LoomnBridge.getReadModel`, handler, preload, bootstrap) coerente, ritorna `ReadModelPush`; `StatusResult` union usato coerentemente in handler/settings/store/self-test/stub; `ProviderMeta = Extract<StatusResult, {ok:true}>['provider']`. ✅

**Placeholder scan:** nessun TBD/TODO; ogni step di codice ha il blocco completo. ✅

---

## Execution Handoff

Piano salvato in `docs/superpowers/plans/2026-06-22-loomn-fix-remediation-f4-ipc-main.md`. Esecuzione **subagent-driven** (HANDOFF §4): branch `fix/remediation-f4-ipc-main` (mai su main); per ogni task implementer (testo completo del task, NON il file di piano) → spec-review → code-quality-review (legge i file, riesegue test/typecheck); hardening solo su rami reali con verifica empirica; final review opus dell'intero branch; poi `finishing-a-development-branch` (merge ff in main → gate Electron 2 fasi PASS → `pnpm test` verde → `git push origin main` → cancella il branch) e aggiornamento HANDOFF + memoria.
