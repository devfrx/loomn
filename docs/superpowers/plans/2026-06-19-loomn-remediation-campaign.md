# Loomn — Campagna di Remediation dei Findings d'Audit (piano a fasi)

> **Per agentic workers:** questo è il **piano-campagna master** (roadmap di remediation), NON un piano TDD bite-sized. Decompone i 28 finding d'audit in **7 fasi** coerenti per layer. **Ogni fase ha il suo piano dettagliato bite-sized**, da scrivere via `superpowers:writing-plans` al momento dell'esecuzione, poi eseguito via `superpowers:subagent-driven-development` su un **branch dedicato** (mai su main), gate dove tocca l'app, merge ff → `git push origin main` → aggiorna HANDOFF/memoria. Stessa decomposizione di Piano 10 (10a–10e) e della traccia engine (SP1–4).

**Goal:** Risolvere **tutti i 28 finding** del report `audits/2026-06-19-loomn-audit-findings.md` **alla causa radice, senza debiti**, in 7 fasi indipendentemente mergeabili.

**Architettura:** fasi ordinate per layer (motore → memoria → AI → confine IPC/app → renderer-logica → renderer-UI → operatività). Le prime 3 girano su **ABI Node** senza gate Electron (niente flip ABI); il gate Electron entra dalla Fase 4. Ogni fix è la **versione robusta** (causa radice), non la pezza minima.

**Tech stack:** monorepo pnpm; TS strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`); Vitest (packages Node + renderer jsdom via `vitest.workspace.ts`); Electron 42 + Vue 3 + Pinia + Reka UI; Zod ai confini; Event Sourcing (engine), Drizzle/better-sqlite3 (memory).

---

## Decisioni bloccate con l'utente (2026-06-19) — vincolanti per i task

1. **Ambito:** solo i **28 bug** (13 Important + 15 Minor) a causa radice + le decisioni embedded. Le tracce grandi **D‑01 (incipit/campagna progettata)**, **D‑02 (redesign UI/UX)**, **D‑03 (multi-campagna)** restano **iniziative design-first separate, DOPO** la campagna (referenziate in §10, NON dettagliate qui — vanno aperte con `superpowers:brainstorming`).
2. **I‑01 (FSM round/turno):** il motore **possiede l'intera FSM** → `decide(EndTurn)` **auto-emette `RoundAdvanced`** quando l'ultimo turno chiude il round, **e rifiuta** (throw + 0 eventi) `NextRound` prematuro / `EndTurn` oltre la fine.
3. **M‑15 / D‑04 (Regia GmConsole):** **dev-gate** dietro `import.meta.env.DEV` → invisibile nella build di produzione.
4. **M‑03 / D‑08 (snapshot):** **cablare lo snapshotting** (save a soglia di N eventi + `rebuild(load, latestSnapshot)` all'avvio) → rimuove il full-replay O(stream).
5. *(Default debt-free dell'autore, confermabili)* **I‑08 / D‑05:** surfacing errori read tramite un componente condiviso **`PanelError`** usato coerentemente in tutti i pannelli read. **I‑02:** fix robusto = **canale pull `get-read-model` + pull-on-mount** (non solo `.once`→`.on`). **I‑11:** ri-aggiungere il **single-instance lock** + dialog d'errore all'avvio (non più la pezza revertata). **M‑10:** **adottare `LoomnDialog`** (Reka, accessibile) per creator/Regia, rimuovendo lo scrim hand-rolled. **I‑07:** difesa **autorevole nel motore** (`rollExpression`/`RollExpr` validato) + difesa-in-profondità a schema/tool/UI.

---

## Quadro delle fasi

| Fase | Tema (layer) | Findings | ABI / Gate | Effort |
|---|---|---|---|---|
| **F1** | Motore: integrità dello stato autorevole (`engine` + `shared` schema) | I‑01, I‑06, I‑07(arbiter), I‑12, I‑13, M‑02 | Node · niente gate | M |
| **F2** | Persistenza & memoria (`memory` + `host`) | I‑05, I‑10, M‑01, M‑03, M‑05, M‑12, M‑13, M‑14 | Node · niente gate | L |
| **F3** | Pipeline AI (`ai`) | I‑04, I‑07(tool), M‑04 | Node · niente gate | S–M |
| **F4** | Confine IPC & robustezza app (`shared/ipc` + `main` + renderer bootstrap) | I‑02, I‑11, M‑06 | **Gate Electron** | M |
| **F5** | Renderer: logica & robustezza (composables/stores/lib) | I‑08, I‑09, M‑07, M‑08 | jsdom | S–M |
| **F6** | Renderer: UI & layout (views/components/styles) | I‑03, I‑07(UI), M‑09, M‑10, M‑15 | jsdom + **verifica visiva** | M |
| **F7** | Operatività, gate & CI (scripts/config) | M‑11 + D‑06 + estensione self-test del path reload di I‑02 | scripts · gate | S–M |

**Ordine consigliato:** F1 → F2 → F3 → F4 → F5 → F6 → F7. Le prime 3 (engine/memory/ai) sono tutte ABI-Node → eseguibili back-to-back senza flip ABI; il gate Electron entra in F4. Copertura: **28/28 finding** mappati (vedi §9 self-review).

---

## F1 — Motore: integrità dello stato autorevole

**Obiettivo:** chiudere ogni percorso in cui un input (AI/utente) fa passare garbage nello **stato event-sourced autorevole** ("il codice è l'arbitro"), e rendere il motore l'unico proprietario della FSM round/turno. Pacchetti: `packages/engine`, `packages/shared` (schema). Pure, TDD classico su ABI Node, nessun gate Electron.

**Findings + approccio causa-radice:**

- **I‑01 (FSM round/turno)** — `engine/commands.ts:123-126`, `engine/encounter.ts:46-65`.
  - **Decisione 2 applicata:** in `decide(EndTurn)`, dopo `TurnEnded`, se quel turno era l'ultimo del round (`roundComplete` dopo l'avanzamento) emettere **anche** `RoundAdvanced` (sequenza atomica `[TurnEnded, RoundAdvanced]`); in `decide(NextRound)` **rifiutare** (throw + 0 eventi) se `!roundComplete(state.encounter)`; in `decide(EndTurn)` rifiutare se il round è già oltre la fine (stato impossibile da raggiungere una volta auto-avanzato, ma guardia difensiva). Importare `roundComplete` in `commands.ts`.
  - **Test:** "EndTurn sull'ultimo partecipante auto-avanza il round (round+1, turnIndex 0, actedThisRound azzerati)"; "NextRound a metà round è illegale (throw, 0 eventi)"; "nessun `turnIndex` può superare `participants.length`".
- **I‑06 (AddActor pool fuori range)** — `engine/commands.ts:104-110`, `engine/resource.ts:10`.
  - Estrarre `clampPool(pool)` (riusa la logica `Math.max(0, Math.min(max, current))` di `adjustResource`); in `decide(AddActor)` clampare ogni pool fornito prima di emettere `ActorAdded`; rifiutare `max<0`/non-finito. **Test:** `AddActor` con `{current:999,max:10}` → stato con `{current:10,max:10}`; `current` negativo → 0.
- **I‑07 (dadi non vincolati) — difesa AUTOREVOLE nel motore** — `engine/dice.ts:38-40`, `shared/domain-schema.ts:10`.
  - Causa radice: validare `RollExpr`/`DieGroup` nel motore (count/sides **interi positivi** con un max sano) così **nessun** percorso (UI o AI) può produrre un tiro garbage o un loop. Aggiungere il vincolo anche a `dieGroupSchema` in `shared` (`z.number().int().positive().max(…)`). I layer tool (F3) e UI (F6) restano difesa-in-profondità.
  - **Test:** `rollExpression` con count frazionario/negativo/enorme → rifiutato/clampato (decidere "throw" coerente con lo stile); `dieGroupSchema` rifiuta 2.5 / -1 / 1e9.
- **I‑12 (literal 'morente' triplicato)** — `engine/condition.ts` (nuovo), `engine/combat.ts:64-71`, `engine/events.ts:98-106`, `shared` (DTO ruleset), renderer `lib/encounter-view.ts:5`.
  - `export const DOWNED_CONDITION_KEY = 'morente'` in `engine/condition.ts`; referenziarlo da `combat.ts` ed `events.ts`. Rimuovere il blocco morto `combat.ts:64-71` (ridurre a `downed: boolean`, dato che `decide(Attack)` scarta `result.target`). Esporre la chiave via il DTO `get-ruleset` (single-source attraversa l'IPC) **oppure** drift-guard di test renderer↔motore (la scelta del veicolo è dettaglio del piano F1/F6; preferito: ruleset DTO, così `encounter-view.ts` legge la chiave invece di hardcodarla → chiude il drift cross-package). **Test:** drift guard che fallisce se la chiave diverge.
- **I‑13 (z.number() accetta Infinity)** — `shared/domain-schema.ts` (campi numerici di eventi/stato/comandi).
  - `z.number()` → `z.number().finite()` (helper `finiteNumber`). **Test:** un comando con `initiative: Infinity` → `commandSchema.safeParse` `ok:false`; round-trip persistenza con valore finito invariato.
- **M‑02 (StartEncounter vuoto)** — `engine/commands.ts:112-122`, `shared/domain-schema.ts`.
  - `if (command.participants.length === 0) throw …` in `decide(StartEncounter)` + `.min(1)` sullo schema. **Test:** `StartEncounter` con `[]` → throw, 0 eventi.

**Verifica F1:** `pnpm exec vitest run packages/engine packages/shared` verde; `pnpm -C packages/engine typecheck` + `pnpm -C packages/shared typecheck` puliti. Nessun gate Electron (engine/shared puri). `shared` resta foglia.
**Dipendenze:** nessuna. È la fondazione (gli altri layer si appoggiano agli schemi `.finite()`/`dieGroup` di qui).

---

## F2 — Persistenza & memoria

**Obiettivo:** eliminare i costi O(stream) sul percorso più navigato, blindare il determinismo della memoria, cablare lo snapshotting, rinforzare i drift guard. Pacchetti: `packages/memory`, `packages/host`, con guard a `shared`. ABI Node, niente gate Electron.

**Findings + approccio causa-radice:**

- **I‑05 (narration history full-scan + Zod per pagina)** — `host/campaign-service.ts:218-230`, `memory/sqlite-event-store.ts:55-58`, porta `EventStore`.
  - Aggiungere all'adapter SQLite (esposto via `MemorySystem`) una lettura **finestrata DB-side**: `loadNarration({before?, limit})` (`WHERE type='NarrationRecorded' AND seq < :before ORDER BY seq DESC LIMIT :limit`, la colonna `type` è già persistita) e `loadSince(seq)` per `reflect`. `getNarrationHistory`/`reflect` la usano. **Test (contract):** la finestra non Zod-parsa gli eventi fuori pagina; equivalenza coi risultati attuali.
- **I‑10 (drift guard Command debole)** — `host` (nuovo guard) vs `memory/sqlite-event-store.ts:85-90`.
  - Aggiungere in host due righe compile-time **bidirezionali esaustive** sorelle di quelle degli eventi: `type _CmdInfer = z.output<commandSchema>; const _f: Command = null as unknown as _CmdInfer; const _b: z.input<commandSchema> = null as unknown as Command;`. **Test:** probe `@ts-expect-error` che un campo driftato rompe il typecheck.
- **M‑01 (drift guard cieco agli opzionali)** — `memory/sqlite-event-store.ts:85-94`.
  - `.strict()` sugli arm di `domainEventSchema` (un campo non dichiarato fa **fallire il parse** a runtime → rilevabile dai round-trip), **o** guard di esaustività strutturale tipo-livello. Documentare. **Test:** round-trip con un campo extra → parse fallisce (oggi lo strippa silenziosamente).
- **M‑03 (snapshot cablato)** — `host/campaign-service.ts:139`, `host/memory-system.ts`, `memory/sqlite-event-store.ts:59-72`.
  - **Decisione 4:** all'avvio `rebuild(eventStore.loadSince(snap.version), latestSnapshot())` invece del full-replay; `saveSnapshot` ogni N eventi dentro `dispatch`/`runTurn` (soglia configurabile). Sfrutta il path `rebuild`-da-snapshot già testato. **Test:** avvio con snapshot + eventi successivi ricostruisce lo stesso stato del full-replay; lo snapshot viene scritto a soglia.
- **M‑05 (limit=0 ritorna tutto)** — `host/campaign-service.ts:219`.
  - `const limit = Math.max(1, Math.trunc(query.limit ?? 50));`. **Test:** `limit:0` → finestra vuota o ≥1, non l'intero array; `limit` negativo → idem.
- **M‑12 (ordine canon indeterminato)** — `memory/canon-ledger.ts:90`.
  - `.orderBy(canonFacts.eventSeq, canonFacts.id)` (tie-break deterministico; l'id `f-<from>-<to>-<i>` è già coerente). **Test:** due fatti same-seq escono in ordine di id stabile.
- **M‑13 (reflection senza transazione)** — `memory/reflection.ts:93-124`, `host/memory-system.ts`.
  - Confine transazionale per-scena: esporre `runInTransaction(fn)` da `MemorySystem` e avvolgere il blocco di scritture (fatti + riassunto) in un'unica `db.transaction`, così committano o falliscono insieme; in alternativa/aggiunta `ledger.record` idempotente (`onConflictDoUpdate` sull'id deterministico). **Test:** crash simulato dopo i fatti e prima del riassunto → retry non collide (no UNIQUE grezzo).
- **M‑14 (getRuleset proxy 'exploration')** — `host/campaign-service.ts:253-258`, `engine`.
  - Derivare `commandPhaseRules` iterando su `SOFT_PHASES` e **asserendo** legalità costante su tutte (throw o drift-test), invece di hardcodare `'exploration'`. **Test:** se l'engine introducesse un comando legale in dialogue ma non in exploration, la derivazione fallisce rumorosamente.

**Verifica F2:** `pnpm exec vitest run packages/memory packages/host` verde (⚠️ richiede ABI Node — se "NODE_MODULE_VERSION", `pnpm rebuild:node`); typecheck `memory`/`host` puliti. Nessun gate Electron.
**Dipendenze:** F1 (gli schemi `.finite()` e i guard di `shared`).

---

## F3 — Pipeline AI

**Obiettivo:** nessun turno muto senza diagnostica; difesa-in-profondità sui dadi proposti dall'AI; niente lavoro puro ripetuto. Pacchetto `packages/ai`. ABI Node.

- **I‑04 (maxIterations turno muto)** — `ai/master-turn.ts:102-153`, `ai/tracing.ts`.
  - Dopo il loop, se uscito per cap con `narration === ''`: emettere un **TraceEvent diagnostico** (kind dedicato o `kind:'error'` con `maxIterations`/conteggio invocazioni) **e** produrre una **narrazione di fallback deterministica non-vuota** (riassunto sobrio delle `invocations`/eventi risolti, o stringa neutra) → `NarrationRecorded` viene persistito, il giocatore non resta nel vuoto. **Test:** modello che chiama tool a ogni iterazione → asserisce TraceEvent + narrazione non vuota.
- **I‑07 (tool-schema dadi) — difesa-in-profondità** — `ai/master-tools.ts:43-46`, `ai/coercion.ts:52-54`.
  - `llmInt(min, max?)` con `.max()`; `dieGroupArgSchema` usa `llmIntRange(1,100)`/`(2,1000)` → un count allucinato diventa ARGOMENTI NON VALIDI reiniettato, non un freeze del main. (La difesa autorevole è in F1; questa è la barriera lato AI.) **Test:** `count:1e8` → schema rifiuta.
- **M‑04 (buildTools non memoizzato)** — `ai/master-tools.ts:109-260`.
  - Memoizzare il registro per identità del `Vocabulary` (WeakMap/Map; dato-only stabile per ruleset) → `masterToolDefs`/`resolveToolCall` riusano lo stesso registro compilato. **Test:** stesso `Vocabulary` → stessa referenza di registro (no ricostruzione); behaviour-preserving.

**Verifica F3:** `pnpm exec vitest run packages/ai` verde; typecheck `ai` pulito. Nessun gate Electron.
**Dipendenze:** F1 (coerenza dei vincoli dadi).

---

## F4 — Confine IPC & robustezza dell'app

**Obiettivo:** read-side self-healing (chiude SEED‑1 alla radice), avvio robusto, error-handling coerente al confine. `packages/shared/ipc.ts`, `app/desktop/src/main`, + il bootstrap renderer. **Richiede il gate Electron 2 fasi.**

- **I‑02 (Ctrl+R perde i dati) — fix ROBUSTO** — `shared/ipc.ts`, `main/index.ts:236`, `renderer.ts:19-22`.
  - **Decisione 5:** aggiungere il canale pull **`get-read-model`** a `IPC_CHANNELS` (+ `LoomnBridge`), handler **sincrono** `service.getReadModel()` con `structuredClone` (fuori dalla coda FIFO, come `getCanon`/`getSummaries` del Piano 0); nel bootstrap renderer un **pull-on-mount** (`store.applyPush(await window.loomn.getReadModel())`) **prima/oltre** la sottoscrizione push; **e** `.once`→`.on` su `did-finish-load` (re-push ad ogni load). Read-side indipendente dal timing del push. **Test:** unit del canale; il path reload è coperto dal self-test esteso in F7.
- **I‑11 (no single-instance lock + avvio non gestito)** — `main/index.ts:240-266`.
  - `app.requestSingleInstanceLock()` prima di `createMemorySystem`; se false → focus sulla finestra esistente (`second-instance`) e `app.quit()`. Avvolgere `createMemorySystem`/`createCampaignService` in try/catch → su errore `dialog.showErrorBox('Loomn non può avviarsi', err.message)` + `app.exit(1)`. `process.on('unhandledRejection')` nel main. **Test:** difficile da unit-testare (Electron) → verificato dal gate + lettura di review.
- **M‑06 (getStatus senza try/catch + result non-union)** — `main/index.ts:122-130`, `shared/ipc.ts:95-103`, `renderer/stores/provider-status.ts`.
  - Migrare `StatusResult` a `z.union([{ok:true,…},{ok:false,error}])` come gli altri canali; try/catch nell'handler; adeguare `provider-status.ts` a gestire l'arm d'errore. **Test:** unit dello schema; handler che cattura un throw simulato.

**Verifica F4:** unit `shared`/renderer verdi; **gate Electron 2 fasi `VERDICT: PASS`** (build → `pnpm rebuild:electron` → 2 lanci `LOOMN_SELFTEST` su userData temp → `pnpm rebuild:node`).
**Dipendenze:** F1 (`commandSchema`/`.finite()`), F2 (`get-read-model` legge `getReadModel`).

---

## F5 — Renderer: logica & robustezza

**Obiettivo:** nessun fallimento silenzioso lato renderer; surfacing coerente degli errori read. `app/desktop/src/renderer/src/{composables,stores,components}`. ABI jsdom.

- **I‑09 (useDispatch ingoia i reject)** — `composables/use-dispatch.ts:10-14`.
  - Avvolgere la invoke in try/catch e ritornare `{ok:false,error}` sul reject → i caller (`GmConsole`/`EncounterPanel`, che già leggono `res.ok/res.error`) mostrano il feedback senza modifiche. Garanzia "mai fallire in silenzio" single-source nel composable. **Test:** invoke che rejecta → `dispatch` ritorna `{ok:false,error}` (non throw).
- **I‑08 (errori read mai mostrati) — `PanelError` condiviso** — nuovo `components/PanelError.vue`, `views/JournalView.vue`, `views/CompanyView.vue`, pannelli dipendenti dal vocabolario, `stores/journal.ts`/`ruleset.ts`.
  - **Decisione 5:** componente `<PanelError :error role="alert">` riusato; renderizzarlo dove `journal.error`/`ruleset.error` sono popolati (Diario, Compagnia, pannelli che dipendono dal vocabolario). Allineato a `NarrativePanel`. **Test:** store con `error` → il pannello rende il messaggio (non lo stato vuoto).
- **M‑07 (useDispatch non azzera i dadi)** — `composables/use-dispatch.ts:11-12`.
  - `dice.clear()` prima dell'enqueue (allineamento a `useRunTurn`). **Test:** comando GM no-roll dopo un tiro → readout azzerato.
- **M‑08 (azione persa su errore)** — `components/NarrativePanel.vue:18-23`.
  - Ripristinare il `draft` sul fallimento (svuotare solo dopo esito ok, o ri-popolare in caso d'errore). **Test:** `submit` che fallisce → `draft` ripristinato all'azione digitata.

**Verifica F5:** `pnpm exec vitest run` (progetto renderer) verde; `vue-tsc` pulito. Nessun gate Electron (renderer-logica jsdom).
**Dipendenze:** F4 (i canali/`{ok,error}` coerenti).

---

## F6 — Renderer: UI & layout

**Obiettivo:** risolvere il bug di scroll osservato, coerenza visiva, accessibilità delle modali, dev-gate della Regia. `views`/`components`/`styles`. ABI jsdom + **verifica visiva** (preview tools, NON sulla sessione live dell'utente).

- **I‑03 (scroll/overflow in tutta l'app)** — `views/GameView.vue`, `components/LoomnPanel.vue`, `App.vue:112`, `styles/base.css:17` (+ grid-layout-plus).
  - **Prima riprodurre in-browser** (DevTools/preview) per isolare il locus (sospetto primario: timing di misurazione iniziale di grid-layout-plus → celle troppo basse, "si sblocca col resize"). Poi: fixare la catena di altezza vincolata, forzare un re-measure del grid all'init (`nextTick`/ResizeObserver), e aggiungere un fallback `overflow:auto` a livello route così un clip non sia mai silenzioso. **Verifica:** screenshot/preview che mostra il contenuto scrollabile su tutte le route + il Gioco.
- **I‑07 (input dadi UI) — barriera UI** — `components/GmConsole.vue:100-153`, `EncounterPanel.vue`.
  - `min="1" step="1"` sugli input count/sides + clamp a intero positivo nel builder (`Math.max(1, Math.trunc(...))`). (Difesa autorevole già in F1.) **Test:** input frazionario non raggiunge un dispatch valido.
- **M‑09 (drift colore errore)** — `SettingsView.vue:123`, `CompanyView.vue:202`, `GmConsole.vue:199`.
  - Sostituire `#d98b6b` con `var(--bad)` (o definire `--bad-2` in `tokens.css` se la tinta più chiara è voluta). **Test:** grep che `#d98b6b` non compare più.
- **M‑10 (LoomnDialog morto) — adottare** — `components/LoomnDialog.vue`, `GmConsole.vue:126-186`, `CompanyView.vue:124-168`.
  - **Default 5 applicato:** usare `LoomnDialog` (Reka: Escape + focus-trap) per il creator di `CompanyView` (e per la Regia se mantenuta — vedi M‑15), rimuovendo lo scrim hand-rolled. **Test:** il dialog si chiude con Escape; component test del wiring.
- **M‑15 (Regia ungated) — dev-gate** — `App.vue:48`, `components/GmConsole.vue`.
  - **Decisione 3:** `<GmConsole v-if="import.meta.env.DEV" />` (o flag impostazioni). Invisibile in produzione. **Test:** la Regia non è montata quando `DEV` è false.

**Verifica F6:** renderer test verdi + `vue-tsc` pulito; **verifica visiva** di I‑03 (preview tools) su tutte le route; gate Electron 2 fasi PASS (la versione persistita resta invariata dove read-only).
**Dipendenze:** F5 (`PanelError` per i pannelli), F1 (chiave morente via ruleset se scelto lì).

---

## F7 — Operatività, gate & CI

**Obiettivo:** rendere il gate riproducibile e ripetibile; chiudere la lacuna del gate sul path reload; ridurre l'attrito ABI. `package.json` (root + `@loomn/desktop`), `renderer.ts` (self-test). *(Nota: in questa fase si TOCCA la config — il vincolo "non toccare config" era dell'audit, non del fix.)*

- **M‑11 (gate senza script/CI) + D‑06 (hazard ABI)** — `package.json:6-12`, eventuale `.github/workflows`.
  - Script `gate:selftest` (sequenza a due lanci con `LOOMN_SELFTEST`/`LOOMN_USERDATA` temp + `rebuild:electron`→`rebuild:node`); `verify` aggregato (`pnpm -r typecheck && pnpm test`); script che **rilevi/uccida le sessioni dev fantasma** che tengono il lock su `better_sqlite3.node` (la causa #1 di rebuild falliti — `Get-CimInstance … tabl|loomn`) prima del rebuild. Documentare in `package.json`/README. *(CI opzionale: il gate flippa l'ABI e lancia Electron headless — valutare se fattibile in CI o solo locale.)*
- **Estensione self-test del path reload (chiude la lacuna che ha fatto sfuggire I‑02 al gate)** — `renderer.ts`.
  - Aggiungere una fase che forza un `location.reload()` e verifica che lo store si **ri-popoli senza dispatch** (copre il pull-on-mount di F4). Aggiornare la versione attesa se necessario.

**Verifica F7:** `pnpm verify` verde end-to-end; `pnpm gate:selftest` → `VERDICT: PASS` su entrambe le fasi (incluso il nuovo check reload).
**Dipendenze:** F4 (il pull-on-mount che il self-test verifica).

---

## 8. Processo per ogni fase (replica HANDOFF §4)

Per **ciascuna** fase F1..F7, in una sessione dedicata:
1. `superpowers:writing-plans` → piano **dettagliato bite-sized TDD** della fase (file esatti, codice completo, comandi+output atteso, commit; conteggi test attesi cumulativi; "fuori ambito"; disciplina di scope per task). Grep anti-apostrofo. Commit del doc su `main`.
2. Branch dedicato `fix/remediation-fN-<tema>` (mai su main).
3. `superpowers:subagent-driven-development`: per ogni task → implementer + spec-review + code-quality-review; hardening solo su rami reali; **verifica empirica** del feedback (working-style §5.2). Final review opus del branch.
4. Gate dove tocca l'app (F4/F6/F7): Electron 2 fasi `VERDICT: PASS`.
5. `superpowers:finishing-a-development-branch` → merge ff in `main` → `pnpm test` → `git push origin main` → cancella il branch.
6. Aggiorna **HANDOFF** + memoria (`loomn-project.md`): fase fatta, conteggio test, prossima fase.

**House rules (§5 HANDOFF):** disciplina di scope nei prompt; MAI toccare `tsconfig`/`vitest.config` (eccezione consapevole F7 su `package.json` scripts); apostrofi-bug nei test; TS strict (spread condizionali, switch esaustivi, accessi indicizzati guardati); purezza engine.

---

## 9. Self-review (copertura dello spec = report d'audit)

**Copertura 28/28 finding:**
- **Important (13):** I‑01→F1 · I‑02→F4 · I‑03→F6 · I‑04→F3 · I‑05→F2 · I‑06→F1 · I‑07→F1(arbiter)+F3(tool)+F6(UI) · I‑08→F5 · I‑09→F5 · I‑10→F2 · I‑11→F4 · I‑12→F1 · I‑13→F1. ✅
- **Minor (15):** M‑01→F2 · M‑02→F1 · M‑03→F2 · M‑04→F3 · M‑05→F2 · M‑06→F4 · M‑07→F5 · M‑08→F5 · M‑09→F6 · M‑10→F6 · M‑11→F7 · M‑12→F2 · M‑13→F2 · M‑14→F2 · M‑15→F6. ✅
- **Decisioni embedded:** I‑01 strategia (dec.2), Regia (dec.3), snapshot (dec.4), surfacing (dec.5), I‑02/I‑11/I‑12/M‑10 default (dec.5) — tutte risolte. ✅
- **Refutati/deferiti:** S‑01 (fragilità route-view) tracciata come nota in I‑03/F6; S‑02 (seed RNG) → D‑07, parte della traccia multi-campagna D‑03 (deferita). ✅
- **Causa radice, no debiti:** ogni fix è la versione robusta (I‑02 pull channel, M‑03 snapshot cablato, I‑12 single-source, M‑13 transazione, I‑07 arbiter nel motore). Nessuna pezza minima. ✅
- **No placeholder:** ogni finding ha file:riga + approccio concreto + idea di test; il codice bite-sized completo vive nel piano dettagliato per-fase (sanzionato dal "Scope Check" di writing-plans per spec multi-subsystem). ✅

---

## 10. Dopo la campagna — tracce design-first separate (NON in questo piano)

Da aprire con `superpowers:brainstorming` (+ `frontend-design` dove UI), una alla volta, dopo F1–F7:
- **D‑01 — Incipit / campagna progettata (il "problema enorme").** Concetto di "campaign setup" (premessa/universo/trama/scena d'apertura iniettata nel contesto del Master); probabile aggancio ai **moduli a tema (Piano 11)**. **Priorità più alta** tra le tracce di prodotto.
- **D‑02 — Redesign UI/UX completo.** Sessione `frontend-design` dedicata; i fix UI della campagna (I‑03, I‑08, M‑09, M‑10) la preparano.
- **D‑03 — Multi-campagna** (+ **D‑07** seed RNG per-campagna). Schema/IPC per `campaignId`, picker, attori per-campagna. Sblocca "quale PG/PNG in quale campagna".
- Più le **feature deferite** già a roadmap (motore Inventario & Equipaggiamento, movimento/topologia di zona — §8 HANDOFF), anch'esse design-first.

---

## Execution Handoff

Piano-campagna salvato in `docs/superpowers/plans/2026-06-19-loomn-remediation-campaign.md`. **Prossimo passo:** scrivere il piano dettagliato bite-sized della **Fase 1** (`superpowers:writing-plans`) ed eseguirlo **subagent-driven** su branch `fix/remediation-f1-motore`. Si procede una fase alla volta (F1 → … → F7), con review tra le fasi e merge ff dopo ciascuna.
