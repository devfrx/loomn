# Loomn — Sessione di Audit Bug + Revisione Design (playbook per il prossimo agente)

> **Per agenti:** questo NON e un piano TDD di implementazione. E il **playbook di una sessione di audit** del codebase, deciso con l utente. Tu (prossimo agente) lo ESEGUI a freddo in una sessione dedicata: scout → fan-out multi-agente → sintesi → **report di findings prioritizzati**. **NON correggere il codice in questa sessione** finche l utente non ha triato il report (vedi "Output"). I fix verranno fatti DOPO, TDD + subagent-driven (flusso HANDOFF §4).

**Obiettivo:** Produrre un **report di findings prioritizzati** (bug di correttezza + debiti/incoerenze di design) su **tutto** il codebase Loomn, con verifica avversariale dei findings, pronto per il triage dell utente e i fix successivi.

**Origine:** Sessione 2026-06-19, decisa con l utente DOPO il completamento del Piano 10 (UI). Parametri scelti via AskUserQuestion (sotto). Il codebase e stato costruito TDD con final review opus per ogni piano (Piani 1-9 + backlog + Piano 0/10a-10e) → relativamente indurito, MA **mai auditato trasversalmente a freddo**: questa sessione cerca i bug latenti e le incoerenze di design che la review-per-piano (scope ristretto) non vede.

---

## Parametri decisi con l utente (vincolanti)

- **Ambito:** **tutto il codebase** — `packages/engine`, `packages/shared`, `packages/memory`, `packages/ai`, `packages/host`, `app/desktop` (main + preload + renderer).
- **Focus:** **bug di correttezza** *e* **design & architettura** (entrambi). NON un focus separato su coerenza/dead-code/naming (lo si raccoglie opportunisticamente come Minor, non e l obiettivo).
- **Profondita:** **MISTA** — scout inline (solo) per costruire la work-list, poi **fan-out multi-agente mirato** (Workflow) dove paga, poi sintesi solo. NON un audit solo-manuale, NON un mega-workflow indiscriminato. **L utente ha esplicitamente approvato l orchestrazione multi-agente** per questa sessione (= opt-in valido per il tool Workflow nella sessione di esecuzione).
- **Output:** **report-first.** Produci un report di findings prioritizzati (severita + file:riga + fix proposto + confidenza). **L utente tria cosa correggere.** SOLO DOPO il via libera → fix TDD (sessione successiva). **Nessuna modifica al codice di prodotto in questa sessione di audit** (puoi creare/aggiornare solo il file di report sotto `docs/superpowers/`).

---

## Principio guida del progetto (la lente dell audit)

**"Il codice e l arbitro, l AI e il narratore"** (regole/tiri deterministici in codice; l AI propone Command tipizzati e narra). Architettura **esagonale + DDD**; **Event Sourcing** nel contesto Campaign/World; memoria a strati L1 / L1.5 (canon ledger) / L2 (riassunti). Monorepo pnpm. **`@loomn/shared` e foglia** (NON importa engine); **`@loomn/ai` ha acquisito engine** (non foglia); la composizione `ai`+`memory` vive **solo** in `@loomn/host`. Ogni finding va pesato contro questi invarianti: una violazione di un invariante architetturale e un finding di design ad alta priorita.

---

## Mappa delle aree (il codebase, con ipotesi di rischio da sondare)

Conteggi righe sorgente (non-test) rilevati il 2026-06-19. Ogni area ha un **codice** (A1..A10) usato nel report e nel fan-out. Le "ipotesi di rischio" NON sono accuse: sono i punti dove un bug, se esiste, e piu probabile — l agente le verifica leggendo il codice.

### A1 — Engine: nucleo deterministico (`packages/engine`, ~1217 righe)
File chiave: `random.ts` (mulberry32 seedato), `dice.ts`, `check.ts`/`actor-check.ts`, `combat.ts`, `encounter.ts`, `zone.ts`, `condition.ts`/`resource.ts`/`actor.ts`/`item.ts`/`progression.ts`, `difficulty.ts`, `quest.ts`, `phase.ts`, `ruleset.ts`, `commands.ts` (`decide`, 255 righe), `events.ts` (`applyEvent`/replay, 125), `event-store.ts`.
**Ipotesi di rischio:**
- **Purezza:** qualche `Math.random`/`Date.now`/stato globale sfuggito (l RNG dev essere SOLO `RandomSource` iniettato; l unico stato mutabile e l `EventStore`). Grep mirato + lettura.
- **Replay-safety:** `applyEvent` deve essere puro e **non** consumare RNG ne il `Ruleset` (il replay rigioca senza RNG/ruleset). Verifica che nessun `applyEvent`/`rebuild` legga `ruleset` o tiri dadi (G3/G4 garantiva che `ActorAdded` porta l attore gia mergiato — riconfermare).
- **`decide` come gate (SP4):** `isCommandLegalInPhase` in cima a `decide`; invariante **`phase=combat ⟺ encounter≠null`** imposto con coppie atomiche; throw + **0 eventi** sui rami di rifiuto. Cerca un Command che muti stato PRIMA di un possibile throw (atomicita), o un rifiuto che lasci eventi parziali.
- **`requireMember` (G3/G4):** rifiuto degli id fuori-vocabolario PRIMA di tirare. Cerca un percorso (AddActor/Attack/RequestCheck/ApplyEffect) che tiri o muti prima della validazione del vocabolario.
- **Clamp/segno:** `adjustResource` clamp `[0,max]`; `ApplyEffect` magnitudine `≥0` (restore non drena / drain non ripristina); `dcForDifficulty`. Cerca off-by-one, clamp mancante, `-0`/NaN/Infinity propagati (vedi nota SP2 sul `-0` "innocuo" → **ri-validare empiricamente**, non darlo per scontato).
- **Esaustivita:** switch su union con `default: never`; `noUncheckedIndexedAccess` (`getAttribute`/`getSkill` `?? 0` — verificare che lo `0 silenzioso` sia voluto e non mascheri un id sbagliato ora che `requireMember` esiste).

### A2 — Event Sourcing + schema di dominio (`engine/events.ts` + `packages/shared/domain-schema.ts`, 350 righe — il file piu grande)
**Ipotesi di rischio:**
- **`domainEventSchema`:** struttura `z.union([discriminatedUnion([...]), eventi-con-opzionali-top-level con `.transform()`])` (CheckResolved e gli altri con opzionali stanno FUORI dalla discriminatedUnion sotto `exactOptionalPropertyTypes`). Verifica che OGNI variante di `DomainEvent` engine sia coperta e che i `.transform()` siano **cast-free** e idempotenti. Un evento nuovo dimenticato nello schema = bug silenzioso al confine IPC/persistenza.
- **Drift guard a compile-time** engine↔shared: esistono (Piano 6) — verificare che catturino davvero un drift (es. un campo aggiunto a un evento engine ma non allo schema). Se la guard e aggirabile, e un finding di design.
- **Validazione solo in lettura** (Piano 6): la persistenza valida Zod **solo in lettura**. Confermare che non ci sia un percorso di scrittura non validato che possa persistere un evento malformato.

### A3 — Persistenza + memoria a strati (`packages/memory`, ~876 righe)
File: `db.ts` (better-sqlite3 + Drizzle, WAL), `sqlite-event-store.ts`/`event-store-on.ts` (append in transazione + concorrenza ottimistica `ConcurrencyError`), `canon-ledger.ts` (L1.5), `summary-store.ts` (L2), `salience.ts`, `reflection.ts` + `reflection-cursor.ts` + `scene-segmentation.ts` (item 6), `context-assembler.ts`, `schema.ts`, migrazioni scritte a mano.
**Ipotesi di rischio:**
- **Concorrenza ottimistica:** `append` rifiuta su versione divergente (`ConcurrencyError`). Cerca una race tra `latestSnapshot`/`append` o una transazione non atomica.
- **Id deterministici della Reflection:** item 6 ha chiuso il bug `UNIQUE constraint` (cursor singleton + segmentazione per scena, avanza il watermark DOPO ogni scena = crash-safe). Ri-verifica: un `reflect` ripetuto, o due scene con range adiacenti, non collidono; il reorder behaviour-preserving di `runReflection` (entrambe le await LLM prima delle scritture) regge un fallimento LLM a meta scena senza scrittura parziale.
- **Migrazioni a mano:** `0001..0004` scritte a mano (drizzle-kit rimandato). Cerca un ALTER/`CREATE` che diverga dallo schema Drizzle (`schema.ts`) → un drift schema↔migrazione e un bug latente alla prossima feature.
- **Context Assembler (budget token):** L1+L1.5 mai tagliati, L2 rankata per salienza×recency e tagliata dal basso entro un budget. Cerca un off-by-one nel budget o un taglio che possa lasciare L2 vuoto quando non dovrebbe; la recency e calcolata a tempo di lettura via `Clock` — verifica che il `Clock` iniettato non introduca non-determinismo nei test.

### A4 — Pipeline AI (`packages/ai`, ~1122 righe)
File: `language-model.ts` (porta), `openai-adapter.ts` (SSE, 259), `transport.ts`, `structured-output.ts` (3 livelli di fallback, 167), `json-repair.ts`, `coercion.ts` (`llmNumber`/`llmArray`/`llmInt`/`coerceNumericString`), `master-tools.ts` (260), `master-turn.ts` (turno agentico, 154), `tracing.ts`.
**Ipotesi di rischio:**
- **Parsing SSE robusto ai confini di chunk** + accumulo tool-call frammentate (l adapter emette tool-call **intere**). Cerca un caso di frammentazione (chunk spezzato a meta di un campo UTF-8, tool-call su piu `data:`) che rompa l accumulo o perda un delta. `streamErrorMessage` (F2) rileva i frame `data:{error:...}` HTTP-200 — verifica che `error:null` su un chunk di successo NON sia trattato come errore.
- **Coercizione strict (G1/G6/F3-G5):** `llmNumber` coerce SOLO stringhe numeriche (rifiuta `""`/`null`/`Infinity`/non-finito); `llmArray` `JSON.parse` solo stringhe-array reali; `llmInt(min)`. Cerca un input di rottura che passi la coercizione e produca garbage silenzioso (contro "il codice e l arbitro"). Lo schema JSON al modello deve restare pulito (`{type:number/array}`) — la guardia di trasparenza c e, verificare che valga anche per il write-path Reflection.
- **`structured-output` 3 livelli:** function-call → `json_schema` → repair+1 retry; **Zod e il gate** a ogni livello; qualunque fallimento cascata. Cerca un percorso dove un errore provider venga inghiottito senza cascata, o dove `StructuredOutputError` perda `lastText`.
- **`master-turn` (turno agentico singolo):** RNG iniettato in `decide`; reiniezione degli Event reali come messaggio `role:user`; termina su testo libero o `maxIterations`. **Follow-up noto (7c): nessun TraceEvent/narrazione di fallback quando si esaurisce `maxIterations`** → confermare se e ancora aperto e se e un bug (turno vuoto senza diagnostica) o accettabile. `masterToolDefs(phase)` filtrato per-iterazione (SP4) — verifica che il filtro per fase sia coerente col gate `decide` (single source of truth, nessuna divergenza tool↔decide).

### A5 — Host / application layer (`packages/host`, ~580 righe)
File: `memory-system.ts` (UNA connessione: EventStore+CanonLedger+SummaryStore+ContextAssembler), `campaign-service.ts` (277), `reflection-ports.ts` (125, LLM-backed FactExtractor/Summarizer + coercizione F3/G5), `provider.ts`/`createLanguageProvider` (+ `normalizeBaseUrl`), `dev-vocabulary.ts` (`devRuleset`), `clock.ts`/`systemClock`, `wiring.ts`.
**Ipotesi di rischio:**
- **Serializzazione FIFO:** `dispatch`/`runTurn`/`reflect` SERIALIZZATI in coda; i **read** (`getReadModel`/`getNarrationHistory`/`getCanon`/`getSummaries`/`getRuleset`) sono **sincroni FUORI dalla coda** (letture su stato committato). Cerca una read che legga stato a meta di una scrittura in volo (la proiezione in-memory dev essere aggiornata atomicamente dopo il commit), o una scrittura che aggiorni la proiezione PRIMA del commit DB (read-your-write incoerente).
- **`createLanguageProvider` / `normalizeBaseUrl`:** fix post-10b (`/v1` aggiunto se manca). Cerca edge: base-URL con path gia presente ma diverso da `/v1`, trailing slash, query string.
- **`reflection-ports` coercizione (F3/G5):** i 2 cast `as z.ZodType<...>` load-bearing (importanceSchema, factsResultSchema). Verifica che siano runtime-safe (l input `unknown` del preprocess e l unico motivo del cast) e che non mascherino un mismatch.
- **`getRuleset` derivato (10g):** `commandPhaseRules` derivato da `COMMAND_TYPES.filter(isCommandLegalInPhase...)` (single-source, nessuna lista hardcoded). Verifica che resti single-source (nessuna duplicazione re-introdotta) e che l ordine cosmetico non sia load-bearing.

### A6 — Confine IPC + contratto (`packages/shared/ipc.ts` 246 + `app/desktop/src/main/index.ts` 276 + `app/desktop/src/preload/index.ts`)
**Ipotesi di rischio:**
- **`commandSchema` = unione `Command` completa (Piano 0):** verifica che copra ESATTAMENTE l unione engine (drift guard cast-free host wire→engine). Un Command engine non in `commandSchema` = la UI non puo emetterlo; un campo nello schema non nell engine = clone IPC che passa garbage.
- **PLAIN payloads (lezione 10b, bug reale):** la clone strutturata IPC **rifiuta i Proxy reactive Vue**. Audit di TUTTI i call-site `window.loomn.dispatch(...)` e dei builder di Command nel renderer (`combat-commands.ts`, `gm-commands.ts`, `actor-form.ts`, `use-dispatch.ts`): devono produrre oggetti **literal/PLAIN**, mai un `reactive(...)` o un campo proxy annidato. Questo e un **finding-class ad alta priorita** (un crash silenzioso reale e gia successo).
- **Validazione Zod negli handler:** ogni handler IPC `safeParse` la richiesta e ritorna `{ok:false,error}` su fallimento (mai throw non gestito attraverso l IPC). Cerca un handler che non validi, o che lasci propagare un throw.
- **Read DTO ↔ tipi memory (Piano 0/10g):** i DTO canon/summary/ruleset rispecchiano i tipi `@loomn/memory`/engine; l assegnabilita e imposta a compile-time dall handler del main (drift guard read). Verifica che la guard sia reale (un campo aggiunto al tipo memory ma non al DTO deve rompere `vue-tsc`).
- **safeStorage / settings (10f):** la chiave API non attraversa MAI l IPC (solo `hasApiKey`); tri-stato `resolveStoredKey`. Cerca un percorso dove la chiave in chiaro possa finire in un push read-side, in un log, o in `get-status`.

### A7 — Renderer: store + lib pure (`app/desktop/src/renderer/src/stores` + `lib` + `composables` + `layout`)
File: stores `read-model.ts`/`narration.ts`/`dice.ts`/`provider-status.ts`/`ruleset.ts`/`journal.ts`; lib `dice.ts`/`turn-events.ts`/`sheet-view.ts`/`encounter-view.ts`/`combat-commands.ts`/`gm-commands.ts`/`company-view.ts`/`journal-view.ts`/`actor-form.ts`/`provider-form.ts`; composables `use-run-turn.ts`/`use-dispatch.ts`/`use-game-layout.ts`/`use-first-run.ts`; layout `persistence.ts`/`presets.ts`.
**Ipotesi di rischio:**
- **CQRS read-side immutabile:** `useReadModelStore` — `applyPush` e l UNICA scrittura, `state` incapsulato, i getter sono proiezioni. Cerca una mutazione dello stato del read-model dal renderer, o un getter che muti.
- **Reattivita Vue:** i `computed` derivano sopra ref di store (non valori catturati una volta). Cerca uno stale closure, un `computed` che legge `.value` fuori dal tracking, o un derivato che non si aggiorna. (10e: `pcCards`/`canonForActor(journal.canon)` — confermare che `journal.canon` sia tracciato.)
- **Coda dadi (10b):** `DiceCanvas` serializza i roll del turno (la lib azzera+rimpiazza) — bug di concorrenza gia trovato e fixato in 10b; ri-verifica che attacco+effetto nello stesso turno non si sovrascrivano.
- **Mappe pure:** `sheet-view`/`encounter-view`/`dice`/`journal-view`/`company-view` non importano engine per il dominio (tipi da `@loomn/shared`). Cerca un import engine fuggito, o un edge non gestito (es. `encounter-view` ordine di turno = `participants` PRE-ORDINATO — confermare che NON ri-ordini; `sheet-view` `resolveSelectedActor` ripiego; `company-view` slug-collision noto).
- **Persistenza layout:** `LayoutPersistence` (localStorage) — `isLayout` rifiuta array vuoto/coord non finite (10a). Cerca un layout corrotto che passi la guard.

### A8 — Renderer: viste + componenti (`app/desktop/src/renderer/src/views` + `components` + `App.vue` + `renderer.ts`)
File: views `GameView`/`JournalView`/`SheetView`/`CompanyView`/`SettingsView`; components `LoomnPanel`/`LoomnButton`/`LoomnDialog`/`NarrativePanel`/`DicePanel`/`DiceCanvas`/`EncounterPanel`/`SheetPanel`/`GmConsole`/`FirstRunBanner`; `App.vue`; `renderer.ts` (bootstrap + self-test, 206).
**Ipotesi di rischio:**
- **Niente `<form>` nelle viste-form (lezione 10f):** `LoomnButton` rende `<button type=submit>` → dentro un `<form>` fa doppio-fire (submit+click). Audit: nessuna vista con input usa `<form>` (SettingsView/CompanyView/GmConsole usano `<div>`). Un `<form>` reintrodotto = bug.
- **Token CSS reali (lezione ricorrente):** ogni `var(--...)` negli `<style scoped>` deve esistere in `styles/tokens.css` (drift gia trovato in 10b: il piano usava nomi inesistenti). Audit trasversale: estrai tutti i `var(--x)` dei `.vue` e confronta con `tokens.css`. Un token inventato = stile rotto silenzioso.
- **Surfacing degli errori (finding 10e final-review, cross-cutting):** `JournalView`/`NarrativePanel` NON mostrano `store.error` all utente (il canale fallisce → pannello vuoto/stantio senza segnale). Pattern preesistente, non regressione — **da valutare come decisione di design**: surfacing coerente in tutti i pannelli read, o accettabile per uno strumento interno? Finding di design da portare al triage, non da fixare unilateralmente.
- **Stub `window.loomn` nei test (lezione ripetuta 10b/10d/10e):** una vista resa reale e montata via route in `App.test`/altri test introduce unhandled-rejection da stub mancanti. Verifica che i test montino sempre uno stub completo dei canali chiamati `onMounted`.
- **`renderer.ts` self-test (gate):** il `LOOMN_SELFTEST` 2 fasi e il gate "esegui l app". Verifica che la versione persistita attesa (7) sia ancora coerente e che il self-test non chiami operazioni LLM-backed (es. `reflect`) senza un LLM reale.
- **`DiceCanvas` init LAZY:** mai nel gate a finestra nascosta; degrada in silenzio; retry init transitorio. Cerca un percorso dove un fallimento WebGL rompa il turno invece di degradare.

### A9 — Cross-cutting / build / operatività (config, CSP, ABI nativa, gate)
**Ipotesi di rischio (questi sono per lo piu DESIGN/operativi, NON toccare i file di config — sono passo orchestratore):**
- **CSP di produzione:** `app/desktop` gira sotto `script-src 'self'` + niente worker/wasm/eval/blob (i dadi threejs sono stati scelti proprio per questo). Verifica (lettura `index.html`/`electron.vite.config`) che la CSP non sia stata rilassata inavvertitamente e che gli asset (font woff2, texture dadi) siano serviti offline (`font-src 'self'`, publicDir → out/renderer).
- **ABI nativa (better-sqlite3):** **hazard operativo reale** — `pnpm rebuild:electron` (gate) vs `pnpm rebuild:node` (test); una sessione `pnpm dev` fantasma ri-flippa l ABI su Electron e tiene il lock su `better_sqlite3.node` (visto 2 volte il 2026-06-19). Questo NON e un bug del codice ma una **fragilita di processo** — finding di design/DX: vale la pena uno script che rilevi/uccida le sessioni dev fantasma prima del rebuild, o documentare meglio? Portarlo al triage.
- **Seed RNG per-campagna NON persistito (follow-up aperto):** il replay e gia deterministico ma il seed non e persistito per-campagna. Valutare se e un debito reale (riproducibilita cross-restart) o YAGNI.
- **Delta read-model (spec §13, deferito):** lo snapshot completo `{version,state}` cresce con lo stato; i canali read sono paginati. Valutare se lo stato puo crescere abbastanza da rendere il push un problema (oggi no — confermare la soglia).

### A10 — Inventario di follow-up dichiarati e decisioni "declinate" da ri-validare
Questi sono **input espliciti** all audit (raccolti da HANDOFF/memoria/review): l agente li verifica, NON li da per chiusi.
- **`maxIterations` senza narrazione di fallback** (7c) — turno vuoto senza diagnostica: ancora aperto? bug o accettabile?
- **`-0` normalization in `ApplyEffect`** (SP2, declinato come "innocuo"): ri-validare empiricamente che `delta` non possa propagare `-0`/`NaN` nello stato o nel push (`node -e` / test mirato).
- **slug-collision in `canonForActor`** (10e, display-only): confermare che resti solo cosmetico (un attore di nome = id di un altro mostra relazioni altrui).
- **`morente` segnaposto pre-ES in `combat.ts`** (Piano 4): la condizione e ancora un literal — coerente con l Event Sourcing attuale? duplicato altrove (`encounter-view.ts` mirror del literal `ActorDowned`)? rischio di drift del literal.
- **Surfacing errori store nei pannelli read** (10e): vedi A8.
- **Single-instance lock rimosso** (revert 1fadda2): una sola istanza sullo stesso `loomn.db` — nessuna guardia. Aprire due istanze corrompe il DB? finding operativo.
- **Polish deferito 10b:** colore semantico outcome nel readout dadi (cosmetico, Minor).

---

## Metodologia (la profondita "mista")

Tre fasi. Le prime due le esegui tu (prossimo agente); la terza produce il deliverable.

### Fase A — Scout inline (SOLO, ~no subagent)
Obiettivo: costruire la **work-list** concreta e non delegare alla cieca.
1. Leggi questo playbook + HANDOFF (§0-tervicies, §3 stato engine, §3-bis/§3-ter, §4 processo, §5 house rules, §8 roadmap) + memoria (`loomn-project.md`, `loomn-working-style.md`).
2. Per ogni area A1–A8, **leggi i barrel** (`index.ts`) e i **file piu grandi** (vedi conteggi) per confermare/raffinare le ipotesi di rischio. Annota le ipotesi che reggono (→ vanno nel fan-out) e quelle gia smentite dalla lettura (→ scartate con motivo, niente fan-out sprecato).
3. Esegui i **grep trasversali a basso costo** che danno findings deterministici senza un agente:
   - Purezza engine: `Math.random|Date.now|new Date\(` in `packages/engine/src` (atteso: zero, tranne usi documentati).
   - Token CSS: estrai `var\(--[a-z0-9-]+\)` da tutti i `.vue` e confronta con i nomi definiti in `app/desktop/src/renderer/src/styles/tokens.css` → lista dei token usati-ma-non-definiti (atteso: zero).
   - `<form>` nelle viste: `<form` in `app/desktop/src/renderer/src/{views,components}` (atteso: zero).
   - Apostrofi nelle stringhe di test in apici singoli: `(it|describe|check)\('[^']*'[A-Za-zàèéìòù]` su tutto `**/*.test.ts` (atteso: zero).
   - PLAIN payloads: tutti i call-site `\.dispatch\(` e i builder di Command nel renderer → lista da ispezionare a mano per proxy reactive.
   - `as ` cast in `packages` (esclusi i test): lista i cast load-bearing da verificare runtime-safe.
4. Produci la **work-list**: una tabella `(area, ipotesi confermata-da-sondare, dimensione [correttezza|design], priorita-attesa)`. Questa pilota il fan-out.

### Fase B — Fan-out multi-agente mirato (WORKFLOW)
**L utente ha approvato l orchestrazione multi-agente.** Esegui UN Workflow (`Workflow` tool) che, per ogni cella `(area × dimensione)` della work-list, lancia un **finder** e poi **verifica avversarialmente** ogni finding. Schema raccomandato (pipeline, non barriera, salvo il dedup):

- **Stage 1 — Finder** (uno per cella area×dimensione, `schema` strutturato): legge i file dell area, applica la **checklist di dimensione** (sotto), ritorna findings `{id, area, dimension, severity, confidence, file, line, title, description, evidence, proposedFix, effort}`. Prompt del finder = "sei un revisore avversariale; per quest area cerca SOLO [correttezza|design]; ogni finding deve citare file:riga ed evidenza concreta dal codice, non congetture; default a NON segnalare se non sei sicuro".
- **Stage 2 — Verifica avversariale** (per ogni finding, N=2–3 skeptic indipendenti, lenti diversi dove ha senso: "riproduce davvero?", "e gia gestito a valle?", "viola un invariante reale?"): ogni skeptic prova a **REFUTARE** il finding leggendo il codice. Un finding sopravvive solo se **la maggioranza NON lo refuta**. Questo elimina i plausibili-ma-falsi (lezione working-style §5.2: i reviewer hanno gia prodotto falsi CRITICAL — es. il falso allarme `mulberry32 | 0` smentito con `node -e`).
- **Dedup/merge** (barriera, una volta): unisci i findings confermati cross-area (lo stesso pattern in piu file = un finding-class), assegna id stabili.
- **Scala alla risposta:** aree ad alto rischio (A1 engine, A2 ES, A4 AI, A6 IPC) meritano finder+verifica piu fitti; le aree gia molto indurite e piccole possono avere un singolo finder. NON sprecare agenti su aree che la Fase A ha gia dichiarato pulite.
- **Budget/onestà:** se limiti la copertura (top-N file per area, niente verifica su Minor), **dichiaralo** nel report (niente truncation silenziosa).

### Fase C — Sintesi + report (SOLO)
Produci il **report di findings** (file unico sotto `docs/superpowers/`, vedi "Output"). Ordina per `severity` poi `confidence`. Per ogni finding: la scheda completa. Aggiungi una **tabella di triage** in testa (id, area, severity, confidence, titolo, effort stimato) per la decisione rapida dell utente. Includi una sezione **"verificati e SCARTATI"** (ipotesi sondate e risultate non-bug, con il motivo) — e prova di rigore e evita che il prossimo giro le ri-sondi.

### Fase D — Triage utente → fix (SESSIONE SUCCESSIVA, non in questa)
L utente legge il report e marca cosa correggere. **Solo allora** parte il flusso fix: per ogni finding approvato, **TDD + subagent-driven** (HANDOFF §4/§5) — test che riproduce il bug (RED) → fix (GREEN) → spec/code-quality review → gate dove serve. Bug-fix e cleanup vanno su un branch dedicato, **mai su main**; aggiorna HANDOFF/memoria a fine.

---

## Checklist di dimensione (cosa cerca ogni finder)

### D1 — Correttezza (bug)
- Logica/algoritmo sbagliato; off-by-one; clamp/segno mancante; `-0`/NaN/Infinity propagati; divisione per zero.
- Edge case non gestiti (input vuoto, array vuoto, id assente, `undefined` da accesso indicizzato).
- **Purezza/replay (engine):** RNG/`Date.now`/stato globale fuggito; `applyEvent` che consuma RNG/ruleset; replay non deterministico.
- **Atomicita:** mutazione di stato prima di un possibile throw; rifiuto che lascia eventi/effetti parziali; transazione DB non atomica; race nella coda FIFO / read-your-write.
- **Confine IPC:** payload non-PLAIN (proxy reactive); handler senza `safeParse`; throw che attraversa l IPC; chiave API che trapela.
- **Reattivita Vue:** stale closure; `computed` fuori tracking; mutazione del read-model; binding controlled vs `v-model` che rompe un invariante (es. selettore Scheda 10d).
- **Coercizione AI:** input di rottura che passa `llmNumber/llmArray/llmInt` e produce garbage; SSE frammentato che perde un delta; fallback `structured-output` che inghiotte un errore.
- **TS strict:** `exactOptionalPropertyTypes` (campo `: undefined` esplicito invece dello spread condizionale); `noUncheckedIndexedAccess` non guardato; switch non esaustivo.
- **Test che non testano:** test che asseriscono sui mock invece del comportamento; test verde per il motivo sbagliato; ramo contrattuale reale non coperto.

### D2 — Design & architettura
- **Violazione di confine esagonale/DDD:** `shared` che importa engine (deve restare foglia); composizione `ai`+`memory` fuori da `host`; un layer che conosce un altro che non dovrebbe.
- **Leaky abstraction / accoppiamento:** un dettaglio di implementazione che trapela attraverso un confine; un tipo engine che attraversa l IPC al posto di un DTO.
- **Debito/duplicazione:** logica duplicata che dovrebbe essere single-source (es. liste comandi hardcoded vs derivate — 10g lezione); drift guard mancante dove due rappresentazioni devono restare allineate.
- **Sovra/sotto-ingegnerizzazione (YAGNI):** astrazione a 1 implementazione modellata su 1 caso (trappola SP1); oppure un invariante non imposto in codice che dovrebbe esserlo.
- **Incoerenza di pattern:** un pannello/store/lib che diverge dalla convenzione stabilita dai fratelli senza motivo.
- **Error handling incoerente:** surfacing degli errori presente in alcuni pannelli e assente in altri (decisione cross-cutting).
- **Invarianti non documentati o fragili:** un literal duplicato (`morente`) a rischio di drift; un ordine "cosmetico" che diventa load-bearing.

---

## Output — formato del report

Crea **`docs/superpowers/audits/2026-MM-GG-loomn-audit-findings.md`** (la data della sessione di esecuzione). Struttura:

1. **Intestazione:** data, HEAD del codebase auditato, ambito coperto, aree NON coperte (con motivo), conteggio findings per severita.
2. **Tabella di triage** (in testa): `| id | area | dimensione | severity | confidence | titolo | effort |` ordinata per severity→confidence. L utente spunta qui.
3. **Findings dettagliati**, uno per scheda:
   ```
   ### [id] [titolo]
   - Area: A_n · Dimensione: correttezza|design · Severity: Critical|Important|Minor · Confidence: alta|media|bassa
   - File: path:riga
   - Descrizione: cosa e sbagliato e perche
   - Evidenza: lo snippet/percorso preciso che lo dimostra (citato dal codice, non congetturato)
   - Verifica avversariale: N skeptic, esito (sopravvissuto/quasi-refutato), eventuali riserve
   - Fix proposto: il cambiamento concreto (e perche e in-scope/in-stile)
   - Effort: S|M|L · Rischio del fix: basso|medio|alto
   ```
4. **Verificati e SCARTATI:** ipotesi sondate risultate non-bug, col motivo (rigore + anti-ri-lavoro).
5. **Decisioni di design da portare all utente** (non-bug, ma scelte trasversali da decidere: es. surfacing errori, hazard ABI, seed RNG persistito).

**Severity rubric:**
- **Critical:** corruzione dati / crash / violazione dell invariante "il codice e l arbitro" (l AI o un input fa passare garbage nello stato) / perdita di sicurezza (chiave che trapela) / replay non deterministico.
- **Important:** bug che produce risultato sbagliato in un caso realistico ma non corrompe/crasha; debito di design che costera caro alla prossima feature (drift guard mancante, single-source violato).
- **Minor:** edge improbabile, incoerenza cosmetica, polish, dead code, naming.

**Confidence:** alta = riprodotto/dimostrato dal codice; media = forte sospetto, un caso plausibile non confermato; bassa = ipotesi che vale la pena tracciare.

---

## Fuori ambito (esplicito)

- **NON correggere il codice di prodotto in questa sessione** (solo il file di report). I fix sono la sessione successiva, TDD, dopo il triage.
- **NON toccare config/CSP/`tokens.css`/`package.json`/`vitest.*`/`electron.vite.config`** nemmeno in lettura-poi-scrittura (sono passo orchestratore; in audit si LEGGONO per i findings A9, non si modificano).
- **NON ri-litigare le deferral decise** (motore Inventario, movimento/zona, streaming, multi-campagna, delta read-model, relazioni strutturate): NON sono bug, sono feature deferite. Se durante l audit emerge che una deferral nasconde un bug *nel codice attuale* (non nella feature mancante), quello e un finding; la feature mancante in se non lo e.
- **NON proporre rewrite di codice funzionante** per gusto estetico. Un finding di design deve avere un costo concreto (bug futuro, debito che paga interessi), non "sarebbe piu pulito".
- **Niente Playwright/E2E nuovi**, niente nuove dipendenze.

---

## Self-review (eseguita dall autore del playbook)

1. **Copertura dell ambito:** tutte e 6 i package + main/preload/renderer mappati in A1–A8; cross-cutting/operativo in A9; follow-up/decisioni-declinate in A10. ✅
2. **Focus rispettato:** ogni area ha ipotesi sia D1 (correttezza) sia D2 (design); la checklist di dimensione copre entrambi. ✅
3. **Profondita mista codificata:** Fase A solo-scout, Fase B Workflow mirato con verifica avversariale, Fase C sintesi solo. Opt-in workflow dichiarato. ✅
4. **Report-first rispettato:** Fase D (fix) e esplicitamente la sessione successiva; "fuori ambito" vieta modifiche al codice di prodotto ora. ✅
5. **Ancorato al reale:** aree, file e conteggi presi dal codebase il 2026-06-19; follow-up presi da HANDOFF/memoria/review (maxIterations, `-0`, slug-collision, `morente`, surfacing errori, lock single-instance). ✅
6. **Anti-falsi-positivi:** verifica avversariale obbligatoria (lezione del falso `mulberry32 | 0`); sezione "verificati e scartati". ✅
7. **Niente placeholder:** ogni fase ha passi concreti, grep esatti, schema di output completo. ✅

---

## Execution Handoff

**Playbook completo e salvato in `docs/superpowers/plans/2026-06-19-loomn-audit-bug-design-review.md`.**

Il prossimo agente, in una **sessione dedicata**: legge questo playbook + HANDOFF + memoria → **Fase A (scout inline)** costruisce la work-list ed esegue i grep trasversali → **Fase B (Workflow)** fan-out finder + verifica avversariale per area×dimensione → **Fase C** scrive il report in `docs/superpowers/audits/AAAA-MM-GG-loomn-audit-findings.md` e lo presenta all utente per il **triage** → (sessione ancora successiva) **Fase D** fix TDD + subagent-driven dei findings approvati, branch dedicato, gate dove serve, aggiorna HANDOFF/memoria. **Nessuna modifica al codice di prodotto prima del triage dell utente.**
