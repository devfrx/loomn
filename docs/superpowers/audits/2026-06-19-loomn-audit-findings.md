# Loomn — Report di Audit: Bug di correttezza + Revisione di design

> **Sessione:** 2026-06-19 · **Tipo:** audit report-first (nessuna modifica al codice di prodotto in questa sessione) · **Autore:** sessione di audit guidata dal playbook `plans/2026-06-19-loomn-audit-bug-design-review.md`.
> **Stato:** PRONTO PER IL TRIAGE DELL'UTENTE. I fix sono la sessione successiva (TDD + subagent-driven, branch dedicato).

---

## 1. Intestazione

- **HEAD auditato:** `bffc642` (doc); **ultimo codice = `0e91cc2`** (Piano 10e — Diario + Compagnia). Working tree pulito (solo `.claude/` untracked).
- **Ambito coperto:** tutto il codebase — `packages/engine`, `packages/shared`, `packages/memory`, `packages/ai`, `packages/host`, `app/desktop` (main + preload + renderer). Aree A1–A9.
- **Metodologia:** Fase A scout inline (grep trasversali + lettura barrel/file grandi + 3 seed dell'utente root-caused) → Fase B Workflow multi-agente (17 celle finder per area×dimensione + verifica avversariale) → Fase C sintesi (questo report).
- **Esito quantitativo:** 37 findings grezzi → **35 sopravvissuti** alla verifica avversariale → **deduplicati in 28 finding-class** (13 Important, 15 Minor; **0 Critical**) + 2 refutati + **143 ipotesi probed-and-rejected**.

### Conteggio per severità (finding-class deduplicate)

| Severità | N | Note |
|---|---|---|
| **Critical** | 0 | Nessuna corruzione dati/crash/leak chiave/replay non-deterministico confermato. Il codebase è indurito (TDD + review per piano). |
| **Important** | 13 | Risultato sbagliato in un caso realistico, o debito di design che costa caro alla prossima feature. Include 3 dei seed dell'utente. |
| **Minor** | 15 | Edge improbabili, incoerenze, dead code, polish. |

### Seed dell'utente (osservati dal vivo) → mappatura

| Seed utente | Esito | Finding-class |
|---|---|---|
| Ctrl+R perde i dati a schermo | 🔴 confermato, root-caused | **I‑02** |
| Nessuna pagina scrolla / overflow clippato in tutta l'app | 🔴 confermato (sovrascrive una falsa refutazione) | **I‑03** |
| Round di combattimento da gestire meglio | 🔴 confermato | **I‑01** |
| Regia in UI: solo dev? | 🟡 decisione di design | **M‑15** + **D‑04** |
| Multi-campagna non gestita / quale PG in quale campagna | ⚪ feature deferita (non bug) | **D‑03** |
| Stile/colori/UX da rivedere completamente | ⚪ iniziativa di prodotto (non bug) | **D‑02** |
| Narrazione senza incipit/universo/trama (il "problema enorme") | ⚪ lacuna funzionale core (non bug del codice attuale) | **D‑01** |

### Cap di copertura dichiarati (niente truncation silenziosa)

- **Verifica avversariale:** ogni finding Critical/Important e ogni finding a confidence bassa → **3 skeptic indipendenti** (sopravvive se ≤1 refuta); ogni finding Minor → **1 skeptic** (sopravvive se non refutato). Dichiarato per onestà di budget.
- **Ambiente di test:** durante la sessione i 13 file di test SQLite (memory/host) **non hanno potuto girare su ABI Node** (la sessione `pnpm dev` attiva dell'utente teneva la nativa `better-sqlite3` su ABI Electron). I 599 test non-SQLite passano, `typecheck` pulito (6 progetti). Le verifiche che richiedevano better-sqlite3 (es. l'ordine canon di **M‑12**) sono state fatte per **analisi statica + ragionamento**, non per esecuzione dinamica.
- **I‑03 (scroll/overflow):** NON ho eseguito l'app per isolare il locus esatto (la sessione era la finestra **attiva dell'utente**, da non interrompere). Il bug è confermato dall'evidenza dal vivo + screenshot (confidence **alta** sull'esistenza); il **locus esatto è a confidence media** e va inchiodato in-browser nella sessione di fix.
- **File non toccati (solo letti per i findings A9):** `tokens.css`, CSP (`index.html`), `electron.vite.config.ts`, `package.json`, `vitest.*`.

---

## 2. Tabella di triage

> Spunta qui cosa correggere. Severità → Confidence. `corr`=correttezza, `des`=design. Effort: S(≤½g) / M(≤2g) / L(>2g).

| id | area | dim | sev | conf | titolo | effort |
|---|---|---|---|---|---|---|
| **I‑01** | A1 | corr+des | Important | alta | FSM round/turno senza invariante nel motore: `EndTurn`/`NextRound` incondizionati → `turnIndex` overflow + round che salta partecipanti (SEED‑3) | S–M |
| **I‑02** | A6/A7 | corr+des | Important | alta | Ctrl+R perde i dati: push read-side `.once` + nessun canale pull → store renderer vuoto fino a un dispatch (SEED‑1) | S–M |
| **I‑03** | A8 | corr | Important | alta/media | Nessuno scroll, overflow clippato in tutta l'app, "si sblocca solo ridimensionando" (SEED‑2) | M |
| **I‑04** | A4 | corr+des | Important | alta | `maxIterations` esaurito → turno muto: nessuna narrazione di fallback né TraceEvent diagnostico (SEED A10) | S |
| **I‑05** | A3/A5 | des | Important | alta | `getNarrationHistory` ri-carica + Zod-valida l'INTERO event log a ogni pagina (cursor-pagination vanificata) | M |
| **I‑06** | A1 | des | Important | alta | `decide(AddActor)` ammette `ResourcePool` fuori range nello stato autorevole (clamp [0,max] imposto ovunque tranne alla creazione) | S |
| **I‑07** | A8/A4 | corr | Important | alta | Input dadi (count/sides) non vincolano interi positivi: frazionari/negativi/enormi raggiungono il roll deterministico | S |
| **I‑08** | A8 | des | Important | alta | Errori dei canali read (journal/ruleset) raccolti negli store ma MAI mostrati: pannello vuoto/stantio senza segnale | M |
| **I‑09** | A7 | des | Important | alta | `useDispatch` ingoia in silenzio i reject IPC (es. clone serialization): asimmetrico col gemello `CompanyView`/`useRunTurn` | S |
| **I‑10** | A2/A6 | des | Important | alta | Drift guard `Command`↔`commandSchema` asimmetrico e debole (forward-only, non esaustivo, solo runtime) vs quello di `DomainEvent` | S |
| **I‑11** | A9 | des | Important | alta | Nessun single-instance lock + nessuna gestione errori all'avvio: 2ª istanza o DB lockato = `ConcurrencyError` o schermata nera silenziosa | S–M |
| **I‑12** | A1 | des | Important | alta | Literal `'morente'` triplicato senza single-source né drift guard (engine ×2 + renderer); copia in `combat.ts` ridondante (shadowed dall'ES) | S–M |
| **I‑13** | A2 | corr | Important | media | `z.number()` accetta `Infinity`: un valore non-finito in un evento rende lo stream NON replayabile dopo il reload | S |
| **M‑01** | A2 | corr | Minor | alta | Drift guard a compile-time CIECO ai campi OPZIONALI aggiunti a un evento engine (Zod strippa silenziosamente) | S |
| **M‑02** | A1 | corr | Minor | alta | `StartEncounter` accetta `participants` vuoto: scontro degenere a 0 partecipanti, bloccato in combat | S |
| **M‑03** | A3/A9 | des | Minor | alta | Infrastruttura snapshot (tabella + save/load + Zod) costruita e testata ma MAI usata: full-replay ad ogni avvio (costo non limitato) | M |
| **M‑04** | A4 | des | Minor | alta | `buildTools(vocabulary)` ricostruisce l'intero registro (`zodToJsonSchema` ×11) a ogni `masterToolDefs` E `resolveToolCall` | S |
| **M‑05** | A5 | corr | Minor | alta | `getNarrationHistory` con `limit=0` ritorna TUTTA la storia (`slice(-0)===slice(0)`); `limit` negativo pagina garbage | S |
| **M‑06** | A6 | des | Minor | alta | `getStatus` unico handler senza try/catch + `StatusResult` unico result senza discriminante `ok/error` | S |
| **M‑07** | A7 | des | Minor | alta | `useDispatch` non azzera i dadi prima dell'enqueue: comando GM no-roll lascia un readout stantio (divergenza da `useRunTurn`) | S |
| **M‑08** | A8 | corr | Minor | alta | L'azione digitata si perde se il turno fallisce: draft svuotato prima dell'await senza ripristino | S |
| **M‑09** | A8 | des | Minor | alta | Drift colore-errore: 3 file hardcodano `#d98b6b` invece di `var(--bad)` (colore diverso + bypassa il theming per-fase) | S |
| **M‑10** | A8 | des | Minor | alta | `LoomnDialog` (Reka, accessibile) morto/solo-test mentre `GmConsole` reimplementa a mano uno scrim/dialog meno accessibile | M |
| **M‑11** | A9 | des | Minor | alta | Il gate Electron (unica copertura integrazione IPC/DB/safeStorage) senza script né CI: lancio manuale col flip ABI | M |
| **M‑12** | A3 | corr | Minor | media | Ordine dei fatti canon a parità di `eventSeq` indeterminato (ORDER BY a singola colonna) → prompt L1.5 non garantito deterministico | S |
| **M‑13** | A3 | des | Minor | media | Scritture di una scena (fatti + riassunto) senza confine transazionale comune: crash a metà → id-collision irreversibile al retry | M |
| **M‑14** | A5 | des | Minor | media | `getRuleset` usa `'exploration'` come proxy hardcoded di "qualsiasi fase non-combat" senza guard che imponga l'equivalenza | S |
| **M‑15** | A8 | des | Minor | media | `GmConsole` (Regia) sempre montata in produzione senza gate DEV: decisione di prodotto da esplicitare | S |

---

## 3. Findings dettagliati

### Important

#### I‑01 — FSM round/turno senza invariante nel motore (SEED‑3)
- **Area:** A1 · **Dim:** correttezza + design · **Severity:** Important · **Confidence:** alta · **Effort:** S (i due guard) / M (FSM completa)
- **File:** `packages/engine/src/commands.ts:123-126` (`decide`) · `packages/engine/src/encounter.ts:46-65`
- **Descrizione:** `decide(EndTurn)` ritorna sempre `[{type:'TurnEnded'}]` e `decide(NextRound)` sempre `[{type:'RoundAdvanced'}]`, **senza consultare lo stato dell'encounter**. `roundComplete()` esiste ma non è consumato da `decide` né dall'host (grep: zero chiamanti fuori dai test), e non c'è auto-advance del round. Conseguenze sullo stato autorevole, realistiche in gioco AI-driven (il modello invoca `end_turn`/`next_round` in ordine arbitrario): (1) `EndTurn` a round già completo porta `turnIndex` a 4,5,6… senza limite → `currentParticipant()` lancerebbe e il round non progredisce più; (2) `NextRound` a metà round azzera `actedThisRound`/`turnIndex` **saltando i partecipanti non ancora agiti** — viola direttamente l'invariante di Piano 4 "ognuno agisce una volta per round". Non Critical perché niente corruzione dati attore né crash IPC (il renderer usa `order[turnIndex] ?? null`, tollera l'overflow mostrando current=null).
- **Evidenza:** `commands.ts:123` `case 'EndTurn': return [{ type: 'TurnEnded' }];` / `:125` `case 'NextRound': return [{ type: 'RoundAdvanced' }];` (nessun guard). `encounter.ts:52` `turnIndex: enc.turnIndex + 1` (nessun clamp). `encounter.ts:38-44` `currentParticipant` lancia se fuori bound. Traccia: 3 `endTurn` su 3 partecipanti → `turnIndex=3` (roundComplete true); 4° → `turnIndex=4` → throw.
- **Verifica avversariale:** 3 skeptic, 0 refutazioni (tutti confermano Important, con traccia di riproduzione codice-per-codice).
- **Fix proposto:** in `decide(EndTurn)` lanciare se `roundComplete(state.encounter)` (errore reiniettato → auto-corregge il loop agentico, coerente con `requireMember`); in `decide(NextRound)` lanciare se `!roundComplete(state.encounter)`. In alternativa di design: `decide(EndTurn)` auto-emette `RoundAdvanced` quando l'ultimo turno chiude il round (flusso a prova di mis-sequencing AI). Aggiungere test "EndTurn a round completo illegale" e "NextRound a metà round illegale".
- **Rischio del fix:** basso (guard additivi, atomici come gli altri rifiuti). La scelta "throw vs auto-advance" è una decisione di design da fissare col triage.

#### I‑02 — Ctrl+R perde i dati: read-model push-only + `.once` (SEED‑1)
- **Area:** A6 (causa) / A7 (gap di design renderer) · **Dim:** correttezza + design · **Severity:** Important · **Confidence:** alta · **Effort:** S (`.once`→`.on`) / M (canale pull)
- **File:** `app/desktop/src/main/index.ts:236` · `app/desktop/src/renderer/src/renderer.ts:19-22` · `stores/read-model.ts:18-38` · `packages/shared/src/ipc.ts`
- **Descrizione:** `createWindow` registra il push read-side con `win.webContents.once('did-finish-load', …)`. `.once` si consuma al primo load; a un **reload** (Ctrl+R) `did-finish-load` rifira ma il listener è già consumato → **nessun re-push**. Lato renderer l'unica via d'ingresso è `onReadModelPush` (`applyPush` è l'unica scrittura, `state` parte `null`) e **non esiste un canale pull on-mount** (`get-read-model` assente — confermato via grep sull'intero repo). Quindi dopo un reload lo store resta vuoto e tutte le viste mostrano lo stato iniziale finché un dispatch (es. AddActor) non chiama di nuovo `pushReadModel`. Riproduce esattamente "al Ctrl+R perdo i dati finché non aggiungo un PG". Il DB su disco è intatto: è una proiezione read-side stantia. Il self-test di durabilità non lo copre perché è un **riavvio** (finestra nuova → primo push regolare), non un reload in-finestra → il bug è sfuggito al gate.
- **Evidenza:** `main/index.ts:236` `win.webContents.once('did-finish-load', () => pushReadModel(service));` (unico trigger di push al load, oltre a dispatch/runTurn). `renderer.ts:22` `window.loomn.onReadModelPush((push) => store.applyPush(push));` (unica via). grep: nessun canale `get-read-model`.
- **Verifica avversariale:** 3+3 skeptic (su I‑02 raccoglie #11/#12/#14), 0 refutazioni; uno ha verificato empiricamente con un EventEmitter (`.once` fira 1 su 3 emit, `.on` 3 su 3).
- **Fix proposto:** **Minimo (correttezza):** `.once` → `.on` a `main/index.ts:236` (ogni `did-finish-load`, incluso il reload, ri-spinge; non rompe il self-test). **Robusto (raccomandato, chiude il design):** aggiungere un canale pull `get-read-model` (handler sincrono `service.getReadModel()` + `structuredClone`, fuori dalla coda FIFO come `getCanon`/`getSummaries` del Piano 0) + pull-on-mount nel bootstrap renderer → read-side self-healing, indipendente dal timing del push (allinea l'asimmetria con `provider-status`, che ha già un pull). Aggiungere al self-test un ramo `location.reload()` che verifichi la re-idratazione senza dispatch.
- **Rischio del fix:** basso. Il pull è additivo e in-stile coi canali read del Piano 0.

#### I‑03 — Nessuno scroll: overflow clippato in tutta l'app (SEED‑2)
- **Area:** A8 · **Dim:** correttezza · **Severity:** Important · **Confidence:** **alta sull'esistenza, media sul locus esatto** · **Effort:** M
- **File:** `app/desktop/src/renderer/src/views/GameView.vue` (grid-layout) · `components/LoomnPanel.vue:29,58-63` · `App.vue:112-117` (`.stage`) · `styles/base.css:17`
- **Descrizione:** **Confermato dall'evidenza dal vivo dell'utente + screenshot**: il contenuto che sborda non è visibile e **nessuna pagina scrolla**, "a meno che non ridimensioni la finestra". Lo screenshot mostra il pannello Scheda (nel Gioco) con attributi tagliati (Saggezza/Carisma) e nessuna scrollbar. ⚠️ **Nota metodologica importante:** il Workflow ha prodotto un finding correlato (asimmetria overflow route-view vs GameView) che la verifica avversariale ha **REFUTATO** — correttamente per la sua *claim ristretta*: le route-view scrollano via `LoomnPanel.__body { overflow:auto }`, quindi **non clippano oggi**. Ma quella refutazione **non spiega l'osservazione dell'utente** (clipping nel Gioco), che ha un meccanismo diverso. Per la regola di progetto "evidenza prima delle asserzioni" (working-style §5.2), l'osservazione dal vivo prevale: **questo è un caso in cui la verifica avversariale ha prodotto un falso negativo sul sintomo più ampio.**
- **Meccanismi candidati (da inchiodare in-browser nella sessione di fix):**
  1. **`grid-layout-plus` (vue-grid-layout) — misurazione iniziale del container** (sospetto primario): le righe del grid del Gioco vengono calcolate prima che il container/i font si assestino → celle troppo basse → il contenuto del pannello eccede la cella e viene clippato da `.loomn-panel { overflow:hidden }` mentre `.__body { overflow:auto }` non ingaggia; un resize fa scattare il `ResizeObserver` e ricalcola → **"si sblocca ridimensionando"** (combacia con lo screenshot e il sintomo).
  2. **Catena flex/grid di altezza non vincolata** in qualche anello (es. `.stage` a `App.vue:112` privo di `min-height:0`), così che il `overflow:auto` del body non ottenga mai un'altezza vincolata.
  3. **`body { overflow:hidden }` (base.css:17)** rimuove ogni fallback di scroll a livello documento → quando (1)/(2) clippano, non c'è recupero.
- **Evidenza:** screenshot utente (Scheda clippata, no scrollbar) + report dal vivo "in tutta l'app, sbloccato solo dal resize". `base.css:17` `body { overflow: hidden; }`. `LoomnPanel.vue:29` `overflow:hidden` (clip esterno) / `:61` `.__body { overflow:auto }`. `App.vue:112-117` `.stage` senza `min-height:0`/`overflow`.
- **Verifica avversariale:** N/A diretta (re-validato dall'autore del report leggendo la catena CSS + l'evidenza dell'utente, che sovrascrive la refutazione di R1, vedi §4).
- **Fix proposto:** nella sessione di fix, **riprodurre in-browser** (DevTools / preview tools quando NON è la finestra dell'utente), isolare il locus (sospetto: init/ResizeObserver di grid-layout-plus), fixare la catena di altezza vincolata, e aggiungere un fallback `overflow:auto` a livello route/documento così che un clip non possa mai essere silenzioso. Valutare un `nextTick`/observer-forced-resize all'init del grid.
- **Rischio del fix:** medio (CSS layout cross-cutting; serve verifica visiva su tutte le route + il Gioco, non solo unit test).

#### I‑04 — `maxIterations` esaurito: turno muto senza fallback né diagnostica (SEED A10)
- **Area:** A4 · **Dim:** correttezza + design · **Severity:** Important · **Confidence:** alta · **Effort:** S
- **File:** `packages/ai/src/master-turn.ts:102-153`
- **Descrizione:** il ciclo agentico `for (iter < maxIterations)` assegna `narration` **solo** quando un'iterazione produce zero tool-call (break a `:112-115`). Uno scenario realistico — un modello (specie locale debole) che chiama strumenti a ogni iterazione — fa cadere il loop in fondo con `narration` ancora `''` e **nessun TraceEvent terminale**. A valle `campaign-service.runTurn` salta `NarrationRecorded` (guard `narration.length > 0`, `:184`) ma **persiste comunque gli eventi meccanici** già applicati (`:193`): lo stato avanza (PNG creati, danno applicato, fase cambiata) mentre il giocatore vede la propria azione seguita dal **vuoto**, senza errore (`use-run-turn.ts:26` `narration.appendTurn(trimmed, '')`). Turno morto silenzioso, stato mutato senza spiegazione, zero tracciabilità.
- **Evidenza:** `master-turn.ts:112-115` unico assegnamento di `narration`; nessun codice post-loop né trace di esaurimento. `campaign-service.ts:184` salta `NarrationRecorded`, `:193` appende gli eventi meccanici. `master-turn.test.ts`: nessun test esercita l'esaurimento di `maxIterations`.
- **Verifica avversariale:** 3+3 skeptic (I‑04 raccoglie #8/#9), 0 refutazioni.
- **Fix proposto:** dopo il loop, se `narration === ''` (esaurimento): emettere un TraceEvent diagnostico (`kind:'error'`, message con `maxIterations` e numero invocazioni) **e** produrre una narrazione di fallback deterministica non-vuota (riassunto sobrio delle azioni risolte, o messaggio neutro) così che `NarrationRecorded` venga persistito e il giocatore non resti senza risposta. Test che fa restituire tool-call ad ogni iterazione e asserisce TraceEvent + narrazione non vuota.
- **Rischio del fix:** basso (additivo, non tocca gli eventi meccanici già corretti).

#### I‑05 — `getNarrationHistory` ricarica + Zod-valida l'INTERO event log a ogni pagina
- **Area:** A3 / A5 · **Dim:** design · **Severity:** Important · **Confidence:** alta · **Effort:** M
- **File:** `packages/host/src/campaign-service.ts:218-230` · `packages/memory/src/sqlite-event-store.ts:55-58`
- **Descrizione:** `getNarrationHistory` espone un'API a cursore (`before`/`limit`, newest-first) ma l'unico read path dello store è `EventStore.load()`, che fa `SELECT * FROM events ORDER BY seq` e `domainEventSchema.parse(JSON.parse(payload))` su **ogni** riga; solo dopo filtra i `NarrationRecorded` in JS e fa `slice(-limit)`. Costo per pagina = **O(eventi totali)**, non O(limit): la paginazione ripete il lavoro invece di ridurlo. Incoerente coi fratelli `getCanon`/`getSummaries`, che spingono filtro+finestra a livello SQL. Anche `reflect()` paga lo stesso costo. Non è la feature deferita (delta read-model): è la cronologia già implementata, sul percorso più navigato.
- **Evidenza:** `campaign-service.ts:222` `for (const s of deps.memory.eventStore.load())`; `sqlite-event-store.ts:55-57` load full-scan + parse Zod per riga; confronto: `canon-ledger.ts:90` filtra DB-side.
- **Verifica avversariale:** 2+ skeptic, 0 refutazioni (I‑05 raccoglie #7/#10).
- **Fix proposto:** aggiungere all'event store (o all'adapter SQLite, esposto via un metodo dedicato di `MemorySystem`) una lettura finestrata che spinga il filtro nel DB: per la cronologia `WHERE type='NarrationRecorded' AND seq < :before ORDER BY seq DESC LIMIT :limit` (la colonna `type` è già persistita a `:49`); per `reflect`, `WHERE seq > :through`. Costo → O(limit)/O(eventi-freschi), evita di Zod-parsare payload non richiesti.
- **Rischio del fix:** basso-medio (estende la porta `EventStore` o aggiunge un metodo all'adapter; va coperto da contract test).

#### I‑06 — `decide(AddActor)` ammette `ResourcePool` fuori range nello stato autorevole
- **Area:** A1 · **Dim:** design (con impatto correttezza: garbage nello stato) · **Severity:** Important · **Confidence:** alta · **Effort:** S
- **File:** `packages/engine/src/commands.ts:104-110`
- **Descrizione:** l'invariante `current ∈ [0,max]` è imposto da `adjustResource` (`resource.ts:10`) su **ogni** mutazione successiva. Ma `decide(AddActor)` costruisce le risorse con un puro spread `{ ...vocab.defaultResources, ...command.actor.resources }` (`:109`) **senza validare** `current<=max` né `>=0`; `requireMember` valida solo la membership della chiave, non il range. Un `AddActor` con `resources:{hp:{current:999,max:10}}` (o negativo) entra come `ActorAdded` con il pool corrotto (verificato: lo spread produce `{current:999,max:10}`). Viola "il codice è l'arbitro": l'unico boundary che **crea** un attore è l'unico che non impone il clamp che il resto del motore garantisce. Lo schema IPC a monte non copre il buco (`resourcePoolSchema = z.object({current:z.number(),max:z.number()})`, nessun refine).
- **Evidenza:** `commands.ts:108-110` spread senza clamp; `resource.ts:10` clamp solo in `adjustResource`; `domain-schema.ts:47` `resourcePoolSchema` senza refine.
- **Verifica avversariale:** 1 skeptic (Important), 0 refutazioni.
- **Fix proposto:** in `decide(AddActor)` normalizzare ogni pool clampando `current ∈ [0,max]` (estrarre un helper `clampPool` condiviso con `adjustResource`) prima di emettere `ActorAdded`; rifiutare `max<0` o valori non finiti. In aggiunta, refine `current<=max && current>=0` su `resourcePoolSchema` al boundary IPC (difesa in profondità).
- **Rischio del fix:** basso.

#### I‑07 — Input dadi (count/sides) non vincolano interi positivi
- **Area:** A8 (UI) + A4 (tool schema) · **Dim:** correttezza · **Severity:** Important · **Confidence:** alta · **Effort:** S
- **File:** `app/desktop/src/renderer/src/components/GmConsole.vue:100-153` · `packages/ai/src/master-tools.ts:43-46` · `packages/shared/src/domain-schema.ts:10`
- **Descrizione:** due loci dello stesso buco. **(a) UI Regia:** gli input `count`/`sides`/`bonus` di ApplyEffect sono `<input v-model.number type="number">` senza `min`/`step`; l'unica guardia è la truthiness `!ae.count || !ae.sides` (blocca solo 0 e ""). Frazionari (`sides=2.5`, `count=1.5`) o negativi passano, passano lo schema IPC (`dieGroupSchema` usa `z.number()` puro), e arrivano a `rollExpression`: `for (i<group.count)` con 1.5 fa 2 iterazioni; `1 + Math.floor(rng.next()*2.5)` produce un dado che non esiste. Il tiro garbage finisce in un evento `ResourceEffectApplied` event-sourced. **(b) Tool schema AI:** `dieGroupArgSchema` valida `count: llmInt(1)`/`sides: llmInt(2)` **senza `.max()`**: un modello che allucina `count: 100000000` fa girare l'engine **sul processo main** per centinaia di milioni di iterazioni → freeze dell'intera app.
- **Evidenza:** `GmConsole.vue:150-153` input senza vincolo + guardia truthiness; `dice.ts:39-40` `for (i<group.count)`; `domain-schema.ts:10` `z.number()` senza `.int()/.positive()`; `master-tools.ts:43-46` `llmInt(1)/llmInt(2)` senza `.max()`.
- **Verifica avversariale:** 3 skeptic (UI, Important) + 1 skeptic (tool schema, Minor), 0 refutazioni.
- **Fix proposto:** UI: `min="1" step="1"` + clamp a intero positivo nel builder (`Math.max(1, Math.trunc(...))`) o guardia `Number.isInteger && >0`. Schema IPC: `dieGroupSchema.count/sides → z.number().int().positive()`. Tool AI: `llmInt(min, max)` con `.max()` e usare `llmIntRange(1,100)`/`(2,1000)` in `dieGroupArgSchema` (un valore fuori range → ARGOMENTI NON VALIDI reiniettato, non freeze).
- **Rischio del fix:** basso. Difesa autorevole nel motore/schema; gli input UI sono la prima barriera.

#### I‑08 — Errori dei canali read raccolti negli store ma mai mostrati
- **Area:** A8 · **Dim:** design · **Severity:** Important · **Confidence:** alta · **Effort:** M
- **File:** `views/JournalView.vue`, `views/CompanyView.vue`, `components/SheetPanel.vue`/`EncounterPanel.vue`/`GmConsole.vue` · `stores/journal.ts:14,26-28` · `stores/ruleset.ts:16,25`
- **Descrizione:** gli store espongono `error` e lo popolano su esito non-ok di `getSummaries`/`getCanon`/`getRuleset`, ma **nessuna vista lo renderizza**. Se `getCanon`/`getSummaries` falliscono, Diario/Compagnia mostrano "Nessun fatto canonico" — indistinguibile da "tutto ok ma vuoto". Se `getRuleset` fallisce, i dropdown del vocabolario (attributi/risorse/difficoltà/fasi) restano vuoti e Regia/Attacco diventano **silenziosamente inoperabili**. Incoerenza: gli errori di scrittura/turno SONO surfacciati (`NarrativePanel.vue:40` mostra `narration.error`; Settings/Company mostrano gli errori di dispatch), quelli di lettura no.
- **Evidenza:** `journal.ts:26-28` popola `error`; `JournalView.vue` non legge mai `journal.error`; `ruleset.ts:25` `error.value=res.error` mai letto; contrasto `NarrativePanel.vue:40`.
- **Verifica avversariale:** 3 skeptic, 0 refutazioni.
- **Fix proposto:** **decisione cross-cutting da triare (D‑05)**: adottare un pattern unico di surfacing per i canali read. Minimale: `<p v-if="journal.error" role="alert">…</p>` in Journal/Company; mostrare `ruleset.error` (o un banner "vocabolario non caricato") nei pannelli dipendenti dal vocabolario. Idealmente un `<PanelError :error/>` riusato, allineato a `NarrativePanel`.
- **Rischio del fix:** basso, ma è una scelta di policy (vedi D‑05) — non fixare unilateralmente prima del triage.

#### I‑09 — `useDispatch` ingoia in silenzio i reject IPC
- **Area:** A7 · **Dim:** design (con impatto correttezza) · **Severity:** Important · **Confidence:** alta · **Effort:** S
- **File:** `app/desktop/src/renderer/src/composables/use-dispatch.ts:10-14`
- **Descrizione:** `useDispatch.dispatch` fa `await window.loomn.dispatch(command)` **senza try/catch**. `window.loomn.dispatch` è `ipcRenderer.invoke`: la promise **rejecta** se l'handler lancia o se l'argomento fallisce la structured-clone (l'esatto "An object could not be cloned" quando un proxy reactive Vue trapela — bug reale già accaduto in `buildActor`, lezione 10b). I caller (`GmConsole.send`, `EncounterPanel.send`) leggono `res.ok` senza try/catch → un reject diventa **unhandled rejection**, `feedback` resta null, l'utente non vede nulla (comando GM/combat fallito in silenzio). Il path **gemello** `CompanyView.submit` fa la stessa dispatch avvolta in try/catch col commento esplicito "Mai fallire in silenzio…". La decisione cross-cutting è applicata in un path e dimenticata nel gemello.
- **Evidenza:** `use-dispatch.ts:10-14` nessun try/catch; `CompanyView.vue:70-72` catch con commento; `use-run-turn.ts:28` catch `narration.setError`.
- **Verifica avversariale:** 3 skeptic, 0 refutazioni.
- **Fix proposto:** avvolgere la invoke in `useDispatch` e ritornare `{ok:false,error}` sul reject, così i caller (che già leggono `res.ok/res.error`) mostrano il feedback senza modifiche. La garanzia "mai fallire in silenzio" diventa single-source nel composable.
- **Rischio del fix:** basso.

#### I‑10 — Drift guard `Command`↔`commandSchema` asimmetrico e debole
- **Area:** A2 / A6 · **Dim:** design · **Severity:** Important · **Confidence:** alta · **Effort:** S
- **File:** `packages/host/src/command-schema.test.ts:15-51` vs `packages/memory/src/sqlite-event-store.ts:85-90`
- **Descrizione:** `DomainEvent`/`GameState` e `commandSchema`/`Command` devono restare allineati, ma sono protetti in modo molto diverso. Gli eventi hanno un guard **compile-time, bidirezionale, esaustivo** (`_eventForward`/`_eventBackward`/`_stateForward`/`_stateBackward`): qualsiasi drift rompe il typecheck. Il guard `Command` vive **solo** in un test ed è (1) **forward-only** (wire→engine), (2) **non esaustivo** (assegna `: Command` solo a 6 delle 11 varianti: mancano AddActor, StartEncounter, EndTurn, NextRound, e soprattutto **Attack** coi campi combat), (3) **runtime** (fallisce solo se i test girano). Una futura modifica al `Command` del motore — nuova variante, o campo nuovo/rinominato su Attack/RequestCheck/ApplyEffect — può desincronizzare il contratto IPC **senza rompere build né test**. Debito che paga interessi alla pianificata feature Inventario (aggiungerà Command/Event di ciclo di vita).
- **Evidenza:** `sqlite-event-store.ts:85-90` guard forte bidirezionale; `command-schema.test.ts` copre 6/11 varianti solo forward; grep: nessun `z.infer/z.input<commandSchema> <- Command` nel repo.
- **Verifica avversariale:** 3 skeptic, 1 refutazione (la maggioranza conferma Important).
- **Fix proposto:** promuovere il guard `Command` alla stessa forza di quello degli eventi: in host (dove engine+shared coesistono) due righe compile-time bidirezionali esaustive, sorelle di quelle in `sqlite-event-store.ts` (`type _CmdInfer = z.output<commandSchema>; const _f: Command = null as unknown as _CmdInfer; const _b: z.input<commandSchema> = null as unknown as Command;`). I 6 `it()` di esempio restano come documentazione.
- **Rischio del fix:** basso (additivo, type-level).

#### I‑11 — Nessun single-instance lock + nessuna gestione errori all'avvio
- **Area:** A9 · **Dim:** design/operativo · **Severity:** Important · **Confidence:** alta · **Effort:** S–M
- **File:** `app/desktop/src/main/index.ts:240-266`
- **Descrizione:** il single-instance lock è stato rimosso (revert `1fadda2`) e niente l'ha rimpiazzato: due istanze Electron aprono lo stesso `userData/loomn.db`, ognuna con la propria proiezione in-memory e concorrenza ottimistica su `MAX(seq)` → divergono e producono `ConcurrencyError` (o, con WAL, una blocca l'altra). Peggio: `createMemorySystem` (`:246`) apre il DB ed esegue `migrate()` **senza try/catch** dentro `app.whenReady().then(...)`. Se il DB è lockato (seconda istanza, o una sessione dev/gate fantasma che tiene il lock su `better_sqlite3` — hazard reale documentato) o la migrazione fallisce, la Promise rigetta in silenzio: **la finestra non viene mai creata**, nessun `dialog.showErrorBox` → l'utente vede l'app non partire senza messaggio.
- **Evidenza:** nessun `requestSingleInstanceLock` (grep a vuoto); `:246` `createMemorySystem(...)` fuori da try/catch; gli unici try/catch sono dentro gli handler IPC.
- **Verifica avversariale:** 3 skeptic, 0 refutazioni.
- **Fix proposto:** in `app.whenReady` (prima di `createMemorySystem`) `app.requestSingleInstanceLock()`; se false → `app.quit()` (o focus sulla finestra esistente via `second-instance`). Avvolgere `createMemorySystem`/`createCampaignService` in try/catch e, su errore, `dialog.showErrorBox('Loomn non può avviarsi', err.message)` + `app.exit(1)`. Opzionale: `process.on('unhandledRejection')` nel main.
- **Rischio del fix:** basso. (Nota: il revert del lock era intenzionale per attrito in dev — la ri-aggiunta va fatta "di proposito in un passo di packaging", come notato in memoria; il triage decide il timing.)

#### I‑12 — Literal `'morente'` triplicato senza single-source né drift guard
- **Area:** A1 · **Dim:** design · **Severity:** Important (borderline; nessun comportamento sbagliato OGGI) · **Confidence:** alta · **Effort:** S–M
- **File:** `packages/engine/src/combat.ts:64-71` · `packages/engine/src/events.ts:98-106` · `app/desktop/src/renderer/src/lib/encounter-view.ts:5`
- **Descrizione:** la chiave di condizione `'morente'` compare hardcoded in **tre** punti senza costante condivisa né drift guard: `combat.ts:66` (performAttack), `events.ts:102` (proiettore `ActorDowned`), e `encounter-view.ts:5` `DOWNED_CONDITION_KEY='morente'` (il cui commento si auto-dichiara "Mirror del literal engine"). **(A) Drift cross-package:** il renderer non importa il valore dal motore (per non accoppiarsi al dominio) → un rename nel motore lascia il renderer a cercare `'morente'` inesistente, `isDowned` diventa **silenziosamente sempre false**, i partecipanti a-terra smettono di essere segnalati nel cockpit, nessun test lo cattura. **(B) Ridondanza nel motore:** `decide(Attack)` usa solo `result.hit/damage/downed` e **scarta** `result.target`; la condizione che la UI vede è quella aggiunta da `applyEvent(ActorDowned)` (`events.ts`), non quella di `combat.ts` → il blocco `combat.ts:64-71` calcola e butta via, logica di fatto **morta in produzione**.
- **Evidenza:** `combat.ts:64-66`, `events.ts:98-102`, `encounter-view.ts:3-5` (commento "Mirror"), `decide(Attack)` (`commands.ts:154-162`) non usa mai `result.target`.
- **Verifica avversariale:** 3 skeptic su #3 (tutti Important) + 1 su #20 (Minor) → classe Important per il costo di drift cross-package.
- **Fix proposto:** const esportata dal motore (es. in `condition.ts`: `export const DOWNED_CONDITION_KEY = 'morente'`) referenziata da `combat.ts` ed `events.ts`. Per il confine renderer: esporre la chiave via il DTO `get-ruleset` (single-source attraversa l'IPC come gli altri vocabolari) **oppure** un drift guard di test che asserisce `DOWNED_CONDITION_KEY` renderer == motore. In subordine, rimuovere il blocco `combat.ts:64-71` (ridurre a `downed: boolean`), eliminando la logica morta.
- **Rischio del fix:** basso.

#### I‑13 — `z.number()` accetta `Infinity` → stream non replayabile dopo il reload
- **Area:** A2 · **Dim:** correttezza · **Severity:** Important · **Confidence:** media (reachability bassa dal Vue trusted, ma costo grave) · **Effort:** S
- **File:** `packages/shared/src/domain-schema.ts` (campi numerici di eventi/stato/comandi)
- **Descrizione:** tutti i campi numerici usano `z.number()` nudo, che **accetta `Infinity`/`-Infinity`** (a differenza di NaN). Catena di corruzione: renderer emette `initiative: Infinity` → `commandSchema.parse` lo accetta → `decide` lo incorpora in `EncounterStarted` → `append` persiste con `JSON.stringify` dove `Infinity` → `null` → al reload `domainEventSchema.parse(JSON.parse(payload))` **fallisce** (null non è number) → **l'intero stream è irreplayabile, la campagna non si carica più**. Reachability bassa dagli input Vue normali, ma il guard schema è proprio il punto dove fermarlo, e il costo (campagna non caricabile) è grave.
- **Evidenza:** verificato con node/zod 3.25.76: `z.number().safeParse(Infinity).success === true` (NaN === false); `JSON.stringify({amount:Infinity})` → `"amount":null` → reparse `success:false`. Il codebase usa già `z.number().int().nonnegative()`/`.positive().max(200)` altrove (pattern in-stile).
- **Verifica avversariale:** 3 skeptic, 0 refutazioni.
- **Fix proposto:** `z.number()` → `z.number().finite()` (o helper `finiteNumber`) per i campi numerici di `domain-schema` (eventi, stato, input di comando). Un valore non-finito viene rifiutato al confine IPC (`ok:false` esplicito) invece di corrompere lo stream.
- **Rischio del fix:** basso (più stretto, in-stile).

### Minor

> Cards compatte. Tutti sopravvissuti a 1 skeptic (Minor), 0 refutazioni, salvo dove indicato.

#### M‑01 — Drift guard a compile-time cieco ai campi OPZIONALI
- **A2 · correttezza · Minor · alta · S** — `packages/memory/src/sqlite-event-store.ts:85-94`. Il guard `_eventForward`/`_eventBackward` verifica l'assegnabilità ma per le proprietà **opzionali** non cattura un drift: se un evento engine guadagna un campo opzionale (es. `CheckResolved.note?`) e lo schema non è aggiornato, build+test verdi ma `domainEventSchema.parse()` **strippa silenziosamente** il campo a ogni lettura/rebuild/IPC (verificato: probe tsc — un campo *richiesto* rompe il forward, uno *opzionale* no; Zod strippa le chiavi ignote, anche con `.transform()`). Il pattern di opzionali è già attivo (`CheckResolved.attribute?/skill?`). **Nota:** il finder l'aveva valutato Important, i 3 skeptic l'hanno **declassato a Minor** (lo strip riguarda un campo *non ancora esistente*; il rischio è per il prossimo che aggiunge un opzionale). **Fix:** `.strict()` sugli arm (un campo non dichiarato fa fallire il parse, rilevabile dai round-trip), o un guard di esaustività strutturale tipo-livello; documentare che il guard attuale copre solo i campi richiesti.

#### M‑02 — `StartEncounter` accetta `participants` vuoto
- **A1 · correttezza · Minor · alta · S** — `commands.ts:112-122`. `decide(StartEncounter)` non valida `participants` non-vuoto (né lo schema: `z.array(participantInputSchema)` senza `.min(1)`). Con `[]` → `createEncounter` produce un Encounter a 0 partecipanti + `PhaseChanged→combat`: `roundComplete` subito true, `currentParticipant` lancerebbe, uscita solo via `EndEncounter`. **Fix:** `if (command.participants.length === 0) throw …` in `decide`, + `.min(1)` sullo schema.

#### M‑03 — Infrastruttura snapshot costruita ma MAI usata
- **A3/A9 · design · Minor · alta · M** — `sqlite-event-store.ts:16-23,59-72`. `saveSnapshot`/`latestSnapshot` + tabella `snapshots` + round-trip Zod esistono e sono testati, ma **zero chiamanti di produzione**: `campaign-service.ts:139` fa sempre `rebuild(load())` (full-replay ad ogni avvio). Astrazione a 0 call-site (YAGNI) che maschera il fatto che lo snapshotting di spec §9 non è cablato; costo d'avvio cresce monotono con lo stream. **Fix (decisione D‑08):** cablare lo snapshot (save ogni N eventi + `rebuild(load, latestSnapshot())` all'avvio) **oppure** marcare l'infra come deferita con un commento sul call-site così nessuno assuma che gli snapshot vengano scritti.

#### M‑04 — `buildTools` ricostruisce il registro a ogni chiamata
- **A4 · design · Minor · alta · S** — `master-tools.ts:109-260`. `buildTools(vocabulary)` (con `zodToJsonSchema` su ~11 schemi) è chiamato da `masterToolDefs` (per-iterazione) E `resolveToolCall` (per-call): in un turno ~`6 + 6·N` ricostruzioni, lavoro puro gettato via. **Fix:** memoizzare per identità del `Vocabulary` (WeakMap/Map; il vocabolario è dato-only stabile per ruleset → cache sicura behaviour-preserving).

#### M‑05 — `getNarrationHistory` `limit=0` ritorna tutto
- **A5 · correttezza · Minor · alta · S** — `campaign-service.ts:218-230`. `eligible.slice(-limit)` con `limit===0` → `slice(-0)===slice(0)` = **copia completa** con `hasMore:false` (opposto dell'intento); `limit` negativo pagina garbage. Non raggiungibile via IPC (lo schema `@loomn/shared` impone `.int().positive().max(200)`), ma `CampaignService` è esportato e chiamabile direttamente su ABI Node → difesa-in-profondità mancante. **Fix:** `const limit = Math.max(1, Math.trunc(query.limit ?? 50));` prima dello slice.

#### M‑06 — `getStatus` unico handler senza try/catch
- **A6 · design · Minor · alta · S** — `main/index.ts:122-130` + `ipc.ts:95-103`. Ogni altro handler avvolge il service in try/catch e ritorna `{ok:false,error}`; `getStatus` no, e `StatusResult` è l'unico result non modellato come union `ok/error`. Se mai lanciasse (es. `safeStorage` nativo, o un futuro `loadProviderMeta` con IO), il renderer riceverebbe un reject grezzo (`provider-status.ts:11-13` non ha catch → unhandled rejection nel bootstrap). **Fix:** try/catch nel corpo; idealmente migrare `StatusResult` a union `ok/error` come gli altri (Opzione A), o ritornare uno status degradato deterministico su throw (Opzione B).

#### M‑07 — `useDispatch` non azzera i dadi prima dell'enqueue
- **A7 · design · Minor · alta · S** — `use-dispatch.ts:11-12`. `useRunTurn` chiama `dice.clear()` prima dell'enqueue (intenzionale); `useDispatch` no → un Command GM senza tiri (StartQuest/AdvanceQuest/EnterPhase/EndTurn/EndEncounter/StartEncounter) lascia i dadi del comando precedente (`enqueue([])` è no-op). Divergenza di pattern tra composable gemelli; costo cosmetico (readout stantio). **Fix:** `dice.clear()` prima dell'enqueue in `useDispatch` (allineamento), o documentare la persistenza intenzionale.

#### M‑08 — L'azione digitata si perde se il turno fallisce
- **A8 · correttezza · Minor · alta · S** — `NarrativePanel.vue:18-23`. `onSend` svuota `draft.value=''` **prima** dell'await `submit(action)`; se il turno fallisce (provider error/IPC reject), `use-run-turn` imposta `narration.error` ma nessuno ripristina il testo → l'utente perde l'azione su un percorso d'errore realistico (provider locale che cade a metà). **Fix:** ripristinare il draft sul fallimento (svuotare solo dopo esito ok, o ri-popolare in caso d'errore).

#### M‑09 — Drift colore-errore `#d98b6b` vs `var(--bad)`
- **A8 · design · Minor · alta · S** — `SettingsView.vue:123`, `CompanyView.vue:202`, `GmConsole.vue:199` hardcodano `#d98b6b` (rosso più chiaro, inesistente in `tokens.css`) mentre `EncounterPanel.vue:140`/`NarrativePanel.vue:68` usano correttamente `var(--bad)` (`#c5635b`). Stesso significato "errore" in due colori, fuori dal single-source dei token e dall'override `[data-phase]`. **Fix:** sostituire con `var(--bad)`; se serve una tinta più chiara per i form, definirla come token `--bad-2`.

#### M‑10 — `LoomnDialog` morto mentre `GmConsole` reimplementa a mano
- **A8 · design · Minor · alta · M** — `LoomnDialog.vue` (wrapper Reka completo: overlay/focus-trap/escape) è importato **solo dal suo test**; `GmConsole.vue:126-186` reimplementa a mano uno scrim/dialog **senza Escape né focus trap**, e `CompanyView` espande un creator inline. Astrazione a zero-uso (YAGNI) **e** incoerenza: il componente accessibile resta a bagnomaria mentre i fratelli divergono con mezze-soluzioni. **Fix (triage):** adottare `LoomnDialog` per Regia/creator (recupera Escape+focus trap) **oppure** eliminarlo come dead code. Non lasciare entrambi.

#### M‑11 — Il gate Electron senza script né CI
- **A9 · design/operativo · Minor · alta · M** — `package.json:6-12`. L'integrazione Electron (DB reale/IPC/safeStorage) è coperta SOLO dal self-test a due lanci, che è cablato (`renderer.ts` + `main/index.ts`) ma **senza script** `gate:selftest`/`verify` né `.github/workflows`, e richiede il flip ABI manuale. Attrito puro → il gate viene saltato → regressioni di wiring IPC passano inosservate. **Fix:** script `gate:selftest` (sequenza a due lanci con userData temp) + `verify` aggregato (`pnpm -r typecheck && pnpm test`); documentare il flip ABI; opzionale: script che rilevi/uccida le sessioni dev fantasma che tengono il lock su `better_sqlite3.node` (causa #1 di rebuild falliti — vedi D‑06).

#### M‑12 — Ordine canon indeterminato a parità di `eventSeq`
- **A3 · correttezza · Minor · media · S** — `canon-ledger.ts:90` → effetto in `context-assembler.ts:123-124`. `query()` ordina solo per `eventSeq`, senza tie-break secondario. La Reflection assegna lo **stesso** `eventSeq` a tutti i fatti di una scena (`reflection.ts:102` `eventSeq: to`) → l'ordine relativo di `f-5-7-0`/`f-5-7-1` è demandato al tie-break non specificato di SQLite (rowid de-facto, ma non un contratto). Il Context Assembler rende il blocco L1.5 in quest'ordine → una variazione del tie-break perturberebbe il prompt LLM, incrinando il determinismo dichiarato. *Confidence media: non riproducibile dinamicamente (better-sqlite3 su ABI Electron durante la sessione); SQLite di solito preserva il rowid → stabile de-facto.* **Fix:** `.orderBy(canonFacts.eventSeq, canonFacts.id)` (l'id `f-<from>-<to>-<i>` è già lessicograficamente coerente con l'ordine d'estrazione) — una riga, in-stile.

#### M‑13 — Scritture di scena senza confine transazionale comune
- **A3 · design · Minor · media · M** — `reflection.ts:93-124`. `runReflection` è atomica solo contro un fallimento **LLM** (ordina le await prima delle scritture); ma le scritture vere (loop `ledger.record/supersede` + `summaries.record`) sono unità auto-commit separate, senza `db.transaction` avvolgente (le porte non possiedono l'handle db). Un crash di processo tra fatti e riassunto lascia: cursor non avanzato + alcuni `canon_facts` committati → al retry la stessa scena ri-tenta gli stessi id → **UNIQUE constraint grezzo**, scena bloccata ad ogni reflect futuro. Finestra stretta, danno permanente. **Fix:** confine transazionale per-scena (esporre `runInTransaction(fn)` da `MemorySystem` e avvolgere il blocco di scritture), **oppure** rendere `ledger.record` idempotente con `onConflictDoUpdate` sull'id (i fatti sono deterministici dal range).

#### M‑14 — `getRuleset` usa `'exploration'` come proxy hardcoded
- **A5 · design · Minor · media · S** — `campaign-service.ts:253-258`. `commandPhaseRules` è derivato confrontando `isCommandLegalInPhase('combat',t)` vs `('exploration',t)`. Per la membership è single-source corretto, ma la scelta di `'exploration'` come rappresentante di **tutte** le soft-phase è un'assunzione non imposta (regge perché `commands.ts:63` tratta ogni non-combat identicamente). Se l'engine introducesse un comando legale in dialogue ma non in exploration, la derivazione produrrebbe `combatOnly/nonCombatOnly` **silenziosamente sbagliati**. Invariante fragile load-bearing non documentato. **Fix:** iterare su `SOFT_PHASES` asserendo legalità costante (throw/typecheck se diverge), o un test di drift host; in subordine, un commento esplicito.

#### M‑15 — `GmConsole` (Regia) sempre montata in produzione
- **A8 · design · Minor · media · S** — `App.vue:48` monta `<GmConsole />` incondizionatamente (nessun gate `import.meta.env.DEV`/flag). La Regia espone i 6 Command non-narrativi con input liberi = un **override manuale del Master**. Non è un bug (gli input passano da `decide()`+`safeParse`), ma una **decisione di prodotto non esplicitata** (vedi **D‑04**): in un prodotto dove il GM è l'AI, una console che bypassa l'AI è tipicamente un dev-tool da nascondere, o un "modo regista" intenzionale da etichettare. **Fix (triage):** (a) gate dietro `import.meta.env.DEV`/impostazioni se è dev-tool, **oppure** (b) mantenerla etichettata "Regia (override manuale)" con copy che ne chiarisca il ruolo.

---

## 4. Verificati e SCARTATI (rigore + anti-ri-lavoro)

### Findings refutati dalla verifica avversariale

- **S‑01 — "Asimmetria overflow route-view vs GameView" (A8/design, refutato come bug presente).** Il finder aveva ipotizzato che le route-view (`SettingsView`/`JournalView`/`CompanyView`: `.route-view{flex:1;min-height:0}` senza `overflow:auto`) clippassero. **Refutazione corretta per la claim ristretta:** le route-view incapsulano tutto il contenuto in un singolo `<LoomnPanel>`, il cui `.__body { overflow:auto }` (LoomnPanel.vue:61) assorbe lo scroll → **non clippano oggi**; inoltre `#app` NON ha `overflow:hidden` (solo `body`). Resta una **fragilità latente** (una futura route che mettesse contenuto in `.route-view` fuori da un LoomnPanel clipperebbe senza segnale) → tracciata, non un bug presente. ⚠️ **Attenzione:** questa refutazione **NON** copre l'overflow osservato dall'utente nel Gioco (lo screenshot mostra il pannello Scheda clippato), che ha un meccanismo diverso (grid-layout) ed è **confermato** come **I‑03**. *Lezione di metodo: la verifica avversariale qui ha prodotto un falso negativo sul sintomo più ampio; l'evidenza empirica dell'utente prevale (working-style §5.2).*
- **S‑02 — "DEV_SEED non persistito per-campagna" (A9/design, refutato).** Tutte le claim fattuali sono vere (`DEV_SEED=1`, `createSeededRandom(DEV_SEED)`, `applyEvent` puro senza RNG), ma il problema dichiarato ("non riproducibile cross-restart per-campagna") **diventa reale solo alla feature multi-campagna**, che è esplicitamente deferita → fuori dal perimetro di bug. Il codice già lo documenta come follow-up (`main/index.ts:47-48`). Tracciato come **D‑07** (decisione futura), non un bug.

### Ipotesi probed-and-rejected (143 totali, per cella)

I finder hanno sondato e **scartato** 143 ipotesi di rischio (evidenza di rigore + evita che il prossimo giro le ri-sondi). Distribuzione: A1 19, A2 18, A3 15, A4 15, A5 18, A6 12, A7 23, A8 17, A9 6. Esempi notabili **confermati puliti**:

- **Purezza engine:** zero `Math.random`/`Date.now`/`new Date` in `packages/engine/src` (grep Fase A + finder). `applyEvent` puro, non consuma RNG né Ruleset; `ActorAdded` porta l'attore già mergiato (G3/G4 regge).
- **Coda FIFO host:** `dispatch`/`runTurn`/`reflect` serializzati; nessuna race read-your-write confermata; la coda non si blocca dopo un rigetto.
- **Coercizione AI (G1/G6/F3-G5):** `llmNumber`/`llmArray`/`llmInt` rifiutano `""`/`null`/`Infinity`/non-array; lo schema JSON al modello resta pulito; F2 `streamErrorMessage` non tratta `error:null` come errore.
- **`structured-output` 3 livelli:** Zod è il gate a ogni livello, cascata corretta, `lastText` preservato.
- **CQRS read-side:** `useReadModelStore.applyPush` è l'unica scrittura, i getter sono proiezioni pure (nessuna mutazione del read-model dal renderer).
- **PLAIN payloads:** `buildActor`/i builder di Command producono oggetti PLAIN (la lezione 10b regge); `CompanyView` dispaccia un attore PLAIN.
- **Token CSS:** zero `var(--x)` usati-ma-non-definiti (24 usati / 30 definiti); zero `<form>` nelle viste; zero apostrofi-bug nei test.
- **Segmentazione reflect per scena (item 6):** cursor singleton + segmentazione `PhaseChanged` corretti; `reflect` ripetuto è no-op (la non-collisione regge — salvo il caso crash-a-metà di **M‑13**).
- **Concorrenza ottimistica + migrazioni:** `append` rifiuta su versione divergente; migrazioni 0000-0004 coerenti con `schema.ts` (nessun drift schema↔migrazione rilevato).

---

## 5. Decisioni di design da portare all'utente

Queste **non sono bug**: sono scelte di prodotto/architettura trasversali che richiedono una decisione, alcune originate dalle domande dell'utente. Vanno aperte **design-first** (`superpowers:brainstorming`) come tracce dedicate, **non** fixate in questa né necessariamente nella prossima sessione.

- **D‑01 — Incipit / premessa / "campagna progettata" (il "problema enorme").** Oggi il Master non ha un punto d'inizio: nessun scenario/universo/trama/incipit iniettato nel suo contesto. È una **lacuna funzionale core** (un simulatore narrativo senza setup narrativo), non un bug del codice attuale. Probabilmente lega a un concetto di "campaign setup" + i **moduli a tema (Piano 11)**. **Priorità più alta tra le decisioni di prodotto.** → traccia design-first dedicata.
- **D‑02 — Revisione completa di stile/colori/UX e layout.** Iniziativa di redesign, non un finding d'audit. Sessione design-first dedicata (`frontend-design`). I bug UI concreti emersi dall'audit la alimentano: **I‑03** (scroll), **I‑08** (surfacing errori), **M‑09** (token colore), **M‑10** (dialog accessibile).
- **D‑03 — Multi-campagna.** Feature **deferita** (campaign-picker deferito nello studio Piano 10); oggi una campagna implicita per file `loomn.db`, nessun `campaignId` nello schema → ogni attore appartiene all'unica campagna ("quale PG/PNG in quale campagna" è conseguenza della deferral). **Non un bug.** Quando si aprirà: schema/IPC per campaign id, picker, e il seed per-campagna di D‑07.
- **D‑04 — Regia in produzione (vedi M‑15).** Decidere: dev-tool da gatare dietro `import.meta.env.DEV`/flag, **oppure** "modo regista / override manuale del Master" intenzionale ed etichettato.
- **D‑05 — Policy di surfacing degli errori read (vedi I‑08).** Adottare un pattern coerente di surfacing su tutti i pannelli read (es. `<PanelError>`), oppure accettare il silenzio per uno strumento interno. Scelta cross-cutting.
- **D‑06 — Hazard ABI nativa / DX del gate (vedi M‑11).** Il balletto `rebuild:electron`/`rebuild:node` + la sessione dev fantasma che ri-flippa l'ABI e tiene il lock su `better_sqlite3.node` (riprodotto in questa sessione). Vale uno script che rilevi/uccida i processi Loomn fantasma + script `gate:selftest`/`verify` + doc?
- **D‑07 — Seed RNG per-campagna persistito (vedi S‑02).** Replay già deterministico (i tiri sono nello stream); il seed non persistito diventa debito reale alla multi-campagna (D‑03). Cheap (evento di genesi o riga di config). Decidere se anticiparlo o tenerlo YAGNI documentato.
- **D‑08 — Snapshot: adottare o rimuovere (vedi M‑03).** L'infra snapshot completa esiste ma non è cablata (full-replay ad ogni avvio). Decidere: cablarla (perf d'avvio O(1) ammortizzato) oppure marcarla deferita/rimuoverla finché non serve.

---

## 6. Nota per la sessione di fix (Fase D)

- **Report-first rispettato:** nessuna modifica al codice di prodotto in questa sessione. Solo questo file.
- **Flusso fix:** per ogni finding approvato dall'utente → **TDD** (test che riproduce il bug RED → fix GREEN → spec/code-quality review) + **subagent-driven**, su **branch dedicato** (mai su main), gate Electron dove tocca l'app, aggiornare HANDOFF/memoria a fine.
- **Quick wins suggeriti (alta confidenza, effort S, rischio basso):** I‑02 (`.once`→`.on`), I‑13 (`.finite()`), I‑06 (clamp pool), I‑01 (i due guard di round), I‑07 (vincoli dadi), M‑05 (clamp limit), M‑09 (token colore). Raggruppabili.
- **Da verificare in-browser prima del fix:** **I‑03** (locus scroll/overflow — riprodurre con DevTools/preview quando non è la sessione live dell'utente).
- **Da decidere col triage prima di fixare:** I‑08 (policy D‑05), M‑15 (D‑04), M‑03/D‑08, I‑01 (throw vs auto-advance), I‑11 (timing del single-instance lock).
