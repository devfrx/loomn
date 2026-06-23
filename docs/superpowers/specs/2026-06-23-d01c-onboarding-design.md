# D‑01c — UX onboarding nuova campagna (brief → genera → review/edit → conferma → apertura) — Design

> **Data:** 2026‑06‑23 · **Traccia:** D‑01 (incipit/campagna), slice c (UX onboarding) · **Stato:** design approvato, pronto per `writing-plans`.
> Dipende da D‑01a (motore+contesto, `14e7d21`) e D‑01b (generazione AI‑da‑brief, `76850e8`), entrambi fatti e mergiati. Baseline 817 test.

## 1. Problema

D‑01a ha consegnato il motore del seed (`SeedCampaign`/`CampaignFramed`/`GameState.campaignFrame`) e `seedCampaign(seed)` host atomico; D‑01b la generazione `generateSeed(brief): Promise<CampaignSeed>` (bozza, non‑enqueued). **Nessuno dei due è raggiungibile dall'utente:** non c'è canale IPC né UI. Oggi l'app avvia direttamente su una board **vuota** ([renderer.ts:30‑35](../../../app/desktop/src/renderer/src/renderer.ts:30)) — un vicolo cieco per chi installa.

D‑01c chiude l'anello: la UX che porta da "niente" a una campagna seminata e giocabile, più il contratto IPC che mancava.

## 2. Decisioni prese (con l'utente, via brainstorming)

1. **Ingresso = route dedicata `/nuova-campagna`, con gate al primo avvio** (Approccio A). Auto‑redirect quando il provider è configurato e non esiste ancora una `campaignFrame`; più un ingresso esplicito riusabile. Tenuto conto di **D‑03**: creare una campagna è la stessa azione, prima o n‑esima → la route è ciò che il picker di D‑03 riuserà tale e quale (zero rework).
2. **Review/edit = campi testo editabili.** Tutti i testi della bozza sono modificabili; la **struttura** (quali entità esistono) e le **statistiche** dei PNG (derivate dal tier via vocabolario del Ruleset) restano come generate → la bozza resta **sempre confermabile** (garanzia D‑01b). Le liste hanno **cardinalità fissa** in questa slice (no add/remove di PNG/luoghi/fatti/hook).
3. **Conferma via canale dedicato `seed-campaign`, NON `dispatch(SeedCampaign)`.** È correttezza: la narrazione d'apertura è prodotta dal *metodo host* `seedCampaign` (best‑effort, dopo la tx), **non** dal Command engine. `dispatch` seminerebbe senza mai generare l'apertura.
4. **Generazione fuori dal gate Electron** (LLM‑backed, come `reflect`/`run-turn`). Il self‑test non genera né semina → versione persistita **8 invariata**.
5. **Errori a schermo, mai silenziosi** (lezione I‑09/F5): provider non configurato, `StructuredOutputError`, conferma fallita — tutti via `PanelError`.

## 3. Scope

**Dentro:**
- `@loomn/shared`: estrazione di `campaignSeedSchema` (refactor puro) + nuovo `campaignBriefSchema`; due canali in `ipc.ts` (schemi + metodi `LoomnBridge`).
- `app/desktop` main: due handler (`generate-seed`, `seed-campaign`) in `registerHandlers`.
- `app/desktop` preload: due metodi sul bridge.
- `app/desktop` renderer: route `/nuova-campagna` + gate di boot (in `runFirstRun`) + `useOnboardingStore` + `OnboardingView` e i tre step + riuso `PanelError`.

**Fuori (esplicito):** add/remove di entità nella review (cardinalità liste editabile); rigenerazione parziale per‑campo; generazione vocabulary‑aware delle stat; **gestione** multi‑campagna (registro/picker list/crea/seleziona/switch/elimina → **D‑03**, additivo); moduli (D‑01d/Piano 11). `@loomn/ai`, `@loomn/engine`, `@loomn/host` **non si toccano** (agganci già pronti).

## 4. Architettura e layering

| Layer | File | Cosa cambia |
|---|---|---|
| `@loomn/shared` | [domain-schema.ts](../../../packages/shared/src/domain-schema.ts) | estrai `campaignSeedSchema` (da [:459](../../../packages/shared/src/domain-schema.ts:459)) + nuovo `campaignBriefSchema` |
| `@loomn/shared` | [ipc.ts](../../../packages/shared/src/ipc.ts) | 2 canali + schemi request/response + 2 metodi su `LoomnBridge` ([:233](../../../packages/shared/src/ipc.ts:233)) |
| `app/desktop` | [preload/index.ts](../../../app/desktop/src/preload/index.ts) | 2 metodi sul bridge (pattern `ipcRenderer.invoke`, [:26](../../../app/desktop/src/preload/index.ts:26)) |
| `app/desktop` | [main/index.ts](../../../app/desktop/src/main/index.ts) | 2 handler in `registerHandlers` ([:78](../../../app/desktop/src/main/index.ts:78)) |
| `app/desktop` | renderer (route, view, 4 componenti, store, gate boot) | la UX (§6‑8) |

`generateSeed`/`seedCampaign` esistono già sul `CampaignService` ([campaign-service.ts:264](../../../packages/host/src/campaign-service.ts:264)).

## 5. Contratto IPC

Due nuovi canali, convenzione `{ok:true,…}|{ok:false,error}` come tutti gli altri ([dispatchResultSchema, ipc.ts:46](../../../packages/shared/src/ipc.ts:46)):

```
generate-seed   req: campaignBriefSchema           → {ok:true, seed: campaignSeedSchema} | {ok:false, error}
seed-campaign   req: {seed: campaignSeedSchema}     → {ok:true, version, narration?}      | {ok:false, error}
```

- **`generate-seed`** → `service.generateSeed(brief)`. **Read‑side, non in coda** (usa solo provider+ruleset, non muta lo stato — come `getStatus`). Nessun read‑model push. **Pre‑check provider:** l'handler verifica `holder.isConfigured()` *prima* di chiamare, e ritorna subito un errore chiaro e deterministico se il provider manca (niente string‑sniffing del sentinel `NO_PROVIDER`).
- **`seed-campaign`** → `service.seedCampaign(seed)`. `seedCampaign` è **già `enqueue(...)`** nel host ([campaign-service.ts:265](../../../packages/host/src/campaign-service.ts:265)) → la serializzazione con dispatch/runTurn è garantita dal service, l'handler non gestisce code. Ritorna `version = outcome.readModel.version` e `narration` (da `SeedOutcome = { readModel; narration? }`, [campaign-service.ts:71](../../../packages/host/src/campaign-service.ts:71)). **Dopo, push del read‑model** (riusa `pushReadModel`, [main/index.ts:63](../../../app/desktop/src/main/index.ts:63)) → la board si popola.

### 5.1 `campaignSeedSchema` (estrazione, debt‑free)

Oggi lo schema del seed vive **annidato** dentro `seedCampaignCommandSchema` ([domain-schema.ts:459‑467](../../../packages/shared/src/domain-schema.ts:459)). Lo estraggo come schema nominato:

```ts
const campaignSeedSchema = z.object({
  frame: campaignFrameSchema,
  keyNpcs: z.array(seedNpcCommandSchema),
  keyPlaces: z.array(seedPlaceCommandSchema),
  initialFacts: z.array(seedFactCommandSchema),
});
const seedCampaignCommandSchema = z.object({ type: z.literal('SeedCampaign'), seed: campaignSeedSchema });
```

Refactor a **comportamento identico**. `campaignSeedSchema` è un **gate di confine IPC** (bound ammessi: riusa i componenti già bounded come `seedNpcCommandSchema` con `finiteNumber`, [:429](../../../packages/shared/src/domain-schema.ts:429)), **non** un read‑path di replay → rispetta "mai restringere uno schema di lettura". `seedCampaignCommandSchema` resta nella union `commandSchema` ([:487](../../../packages/shared/src/domain-schema.ts:487)).

### 5.2 `campaignBriefSchema` (nuovo, confine IPC)

Mirror Zod del tipo `CampaignBrief` di `@loomn/ai` ([campaign-generation.ts:21](../../../packages/ai/src/campaign-generation.ts:21)) — stessa relazione che `campaignFrameSchema` ha con l'engine `CampaignFrame`:

```ts
const campaignBriefSchema = z.object({
  text: z.string().min(1),
  name: z.string().optional(),
  overrides: z.object({
    genres: z.array(z.string()).optional(),
    tone: z.string().optional(),
    npcCount: finiteNumber.int().nonnegative().optional(),
    contentGuidance: z.string().optional(),
  }).optional(),
});
```

**Drift‑guard:** un test type‑level garantisce `z.infer<typeof campaignBriefSchema>` assegnabile a `CampaignBrief`. Vive dove **entrambi** i tipi sono importabili (test in `app/desktop`: il main importa `@loomn/shared` e `@loomn/host` che ri‑esporta `CampaignBrief`); `@loomn/shared` **non** può dipendere da `@loomn/ai`.

## 6. Renderer — route, gate di boot, store

### 6.1 Route + gate di boot
Nuova route `/nuova-campagna` → `OnboardingView.vue` (aggiunta a [router/index.ts:14](../../../app/desktop/src/renderer/src/router/index.ts:14)).

Il gate di onboarding vive **dentro `runFirstRun`** ([use-first-run.ts:6](../../../app/desktop/src/renderer/src/composables/use-first-run.ts:6)), **NON** come `router.beforeEach` globale. Logica estesa: `refresh()` provider → se non configurato `push('/impostazioni')` (esistente); altrimenti pull del read‑model → se nessuna `campaignFrame`, `push('/nuova-campagna')`.

> **Perché in `runFirstRun` e non un guard globale (vincolante per il gate Electron):** il self‑test pilota il router e asserisce i nomi di route (`push('/')` → `name === 'game'`, ecc.: [renderer.ts:100‑106](../../../app/desktop/src/renderer/src/renderer.ts:100), [:196‑200](../../../app/desktop/src/renderer/src/renderer.ts:196)) e **bypassa `runFirstRun`** (chiamato solo nel ramo non‑selftest, [renderer.ts:30‑35](../../../app/desktop/src/renderer/src/renderer.ts:30)). Un guard globale scatterebbe sui `push('/')` del self‑test (nessuna `campaignFrame` nello stato v8) e lo romperebbe. Un gate dentro `runFirstRun` è **self‑test‑safe per costruzione** → self‑test e versione 8 invariati.

Il read‑model store espone un getter `hasCampaign = state?.campaignFrame !== undefined` (D‑01a ha aggiunto `GameState.campaignFrame?`; store [read-model.ts:18](../../../app/desktop/src/renderer/src/stores/read-model.ts:18)). `runFirstRun` legge lo stato deterministicamente (await `window.loomn.getReadModel()`, come fa `await store.refresh()` per il provider). Hop "provider appena configurato → onboarding": agganciato al save riuscito di `SettingsView`.

### 6.2 `useOnboardingStore` (Pinia)
Stesso pattern degli store che chiamano `window.loomn.*` direttamente (`journal`, `narration`):
- stato: `brief` (text, name, overrides), `draft: CampaignSeed | null` (editabile), `step: 'brief'|'review'|'opening'`, `status: 'idle'|'generating'|'seeding'`, `error: string|null`, `opening: string|null`.
- `generate()` → `status='generating'`, azzera errore; `window.loomn.generateSeed(plain(brief))`; ok → `draft=seed`, `step='review'`; !ok → `error`. Reject IPC avvolto in try/catch (come [use-dispatch.ts:11](../../../app/desktop/src/renderer/src/composables/use-dispatch.ts:11)).
- `confirm()` → `status='seeding'`; `window.loomn.seedCampaign({ seed: deepPlain(draft) })`; ok → `opening=narration ?? null`, `step='opening'`; !ok → `error`. **`deepPlain(draft)`** è il punto critico anti‑proxy (lezione 10b: "An object could not be cloned") — il draft è un proxy reactive editato; lo schema lo ri‑valida al confine comunque.
- `regenerate()` → `step='brief'` (tieni il brief).
- guardie: generate disabilitato se `status==='generating'` o testo vuoto; confirm disabilitato se `status==='seeding'`.

### 6.3 Componenti
`OnboardingView.vue` (shell + stepper, instrada fra gli step in base a `store.step`) con tre figli presentazionali: `BriefStep.vue`, `ReviewStep.vue`, `OpeningStep.vue`. `PanelError.vue` ([components/PanelError.vue](../../../app/desktop/src/renderer/src/components/PanelError.vue)) riusato per gli errori.

## 7. UI (riassunto; mockup nel brainstorming)

- **Brief (step 1):** textarea per `text` (obbligatorio), `name` opzionale, sezione comprimibile "Opzioni avanzate" → `overrides` (generi split su virgola → `string[]`, tono, n. PNG, guida ai contenuti). Costruisce un `CampaignBrief` plain. "Genera bozza".
- **Review/edit (step 2):** ogni testo editabile (frame: nome/premessa/setting/tono/scena d'apertura/hook; PNG nome+descrizione; luoghi nome+descrizione; fatti = le 3 caselle della tripla). Statistiche PNG **bloccate** (chip "stat: da codice"). "Rigenera" + "Conferma e inizia".
- **Apertura (step 3):** mostra `narration`; se assente (best‑effort fallito) degrada mostrando `frame.openingScene`. "Entra nella campagna" → `router.push('/')`. L'apertura è anche persistita come `NarrationRecorded` → riappare in Gioco/Diario.

## 8. Error handling

Tutto su `PanelError` (`role="alert"`, `var(--bad)`), mai silenzioso:
1. **Provider non configurato (Generate):** handler `generate-seed` controlla `isConfigured()` prima → errore chiaro; `BriefStep` mostra `PanelError` + azione "Vai a Impostazioni" (`push('/impostazioni')`).
2. **`StructuredOutputError` (Generate):** 3 fallback falliti → propagato; `BriefStep` mostra il messaggio, il **brief resta nello store** → "Genera bozza" è il retry.
3. **Conferma fallita (Review):** raro (bozza garantita confermabile); `seedCampaign` è **atomico** → rollback, nessun mezzo‑seed; `ReviewStep` mostra `PanelError`, bozza intatta → ritenta conferma o rigenera.
4. **Validazione di confine:** brief/seed non validi allo Zod del main → `{ok:false, error:'… non valido'}`, stesso percorso.

## 9. Testing (TDD, ABI Node tranne il gate)

- **`@loomn/shared`:** estrazione `campaignSeedSchema` behaviour‑preserving (round‑trip parse di seed validi via lo schema estratto e via `seedCampaignCommandSchema`); `campaignBriefSchema` parse valido/invalido; parse delle union dei due canali.
- **Drift‑guard type‑level** (in `app/desktop`): `z.infer<typeof campaignBriefSchema>` assegnabile a `CampaignBrief`.
- **Main (handler, node/jsdom):** `generate-seed` (chiama `generateSeed`→`{ok,seed}`; `isConfigured()` falso → `{ok:false}`; reject → `{ok:false}`); `seed-campaign` (chiama `seedCampaign`→`{ok,version,narration}`, ri‑pusha read‑model; fallimento → `{ok:false}`). `CampaignService` finto.
- **Renderer (jsdom):** `useOnboardingStore` (generate/confirm happy+error, `regenerate` resetta lo step, **payload `seed-campaign` plain** — modifico il draft reactive, confermo, verifico clone semplice); gate di boot in `runFirstRun` (provider ok + 0 campagne → `/nuova-campagna`; con campagna → resta; no provider → `/impostazioni`); componenti (Genera disabilitato a testo vuoto, chip stat read‑only, `PanelError` mostra `store.error`, apertura con fallback a `openingScene`).
- **Grep anti‑apostrofo** sulle descrizioni dei test: `(it|describe)\('[^']*'[A-Za-zàèéìòù]` → no match.

## 10. Gate Electron (2 fasi, `pnpm gate:selftest`)

D‑01c tocca main + renderer → il gate va eseguito. **Self‑test e versione persistita 8 INVARIATI** perché: (a) la generazione è LLM‑backed, fuori dal gate (come `reflect`); il self‑test non genera né semina; (b) il gate di onboarding vive in `runFirstRun`, che il self‑test bypassa ([renderer.ts:30](../../../app/desktop/src/renderer/src/renderer.ts:30)) — **non** è un guard globale. Il gate verifica che l'app continui a bootare/persistere/ricaricare coi nuovi canali cablati. ABI: flip a Electron, `rebuild:node` in `finally`.

## 11. Drift‑guard checklist (aggiungere insieme, o il typecheck rompe)

Per ogni nuovo canale, allineare nello **stesso** task: `IPC_CHANNELS` + schema request + schema response + metodo su `LoomnBridge` ([ipc.ts](../../../packages/shared/src/ipc.ts)) → metodo nel bridge preload ([preload/index.ts](../../../app/desktop/src/preload/index.ts)) → handler nel main ([main/index.ts](../../../app/desktop/src/main/index.ts)). Ogni task chiude con `pnpm -r typecheck` verde (6 progetti).

## 12. Foresight (slice future — il design le abilita)

- **D‑03 (registro multi‑campagna, additivo):** la route `/nuova-campagna` è ciò che il pulsante "+ Nuova campagna" del picker riuserà; il gate di boot diventa "libreria vuota → onboarding; piena → picker" (cambia solo il bersaglio del redirect). Le fondamenta (1 DB per campagna, identità id+name) sono già in D‑01a.
- **Add/remove di entità nella review** + rigenerazione per‑campo: follow‑up puliti sopra `useOnboardingStore` (servono id auto‑generati + vocab‑fill stat al confine renderer).
- **D‑01d / Piano 11:** un modulo curato è un'altra sorgente di `CampaignSeed` → `seed-campaign`/`seedCampaign`.

## 13. Fuori ambito (esplicito)

Gestione multi‑campagna (D‑03), moduli (D‑01d/Piano 11), add/remove entità e rigenerazione parziale, generazione vocabulary‑aware delle stat, scaling risorse per tier. La narrazione d'apertura è già prodotta da `seedCampaign` (D‑01a), non reimplementata qui.
