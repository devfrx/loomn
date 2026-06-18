# Loomn — Piano 10 (UI Vue): spec di design

> **Data:** 2026-06-17 · **Stato:** studio design-first **chiuso** (deciso con l'utente via `superpowers:brainstorming` + `frontend-design`) · **Prossimo:** `writing-plans` partendo dal **Piano 0**.
>
> Questo documento è l'**autorità di design** del Piano 10. Non è un piano d'implementazione (quelli vengono dopo, in `docs/superpowers/plans/`). Cattura le decisioni prese, l'audit di collegamento al backend esistente, e la decomposizione in piani.

---

## 1. Scopo e contesto

Il **Piano 10** è la **UI Vue** di Loomn, costruita **sopra tutto il backend già esistente** (engine + AI + memory + IPC del Piano 9). È **design-first**: prima lo studio (questo doc), poi i piani.

Principi vincolanti:
- **Il codice è l'arbitro, l'AI è il narratore.** La UI è **read-side** (proiezioni di sola lettura) + **dispatch di Command**; non muta mai lo stato direttamente (spec autorità §5.2).
- **Copertura TOTALE (richiesta dell'utente):** la UI espone **tutto ciò che il backend già fa** — non un MVP sottile.
- **Ogni elemento UI lega a un substrato esistente (richiesta dell'utente):** niente dati decorativi inventati. Ciò che non esiste si renderizza **display-only** o si rimanda a una feature.
- **Qualità:** professionale, immersivo, eccellente UX — **niente estetica "AI-slop"** (no look di libreria pronto all'uso).

---

## 2. Decisioni di design (bloccate con l'utente)

1. **Layout** = C-frame / B-panels: shell **adattiva alla fase** (`GameState.phase`); i pannelli di stato sono **sempre presenti** (non drawer). La modalità chat-immersiva è la faccia `exploration`/`dialogue` dello stesso frame.
2. **Design language** = **"strumento notturno"** (§3): dark graphite, pannelli arrotondati e distanziati ovunque, accento brass che cambia tinta per fase, serif letterario per la narrazione + grotesk per la UI + mono per i numeri, motion sobrio, dadi WebGL. Bespoke, **token-driven** (variabili CSS).
3. **Component strategy** = primitivi **headless Reka UI** (comportamento/accessibilità) + **design system bespoke** a variabili CSS. **NO Tailwind**, NO librerie opinate (PrimeVue/Vuetify). Reka è headless → nessuno stile da "matchare"; il theming dei moduli = set di variabili CSS.
4. **Architettura informativa** = **ibrida** (§4): `Gioco` home immersiva con pannelli vivi + route dedicate **Diario / Scheda / Compagnia / Impostazioni** (Vue Router); stato condiviso Pinia dal read-model. **Campaign-picker deferito** (boot a campagna singola); **first-run** che guida alla config provider.
5. **Inventario** vive nella **Scheda** (non voce del rail). La tassonomia degli **slot tipizzati** è vocabolario di modulo → vive nel `Ruleset` → il pannello è **data-driven**. Si co-progetta ora, il **motore inventario arriva dopo**; per ora il pannello renderizza il **modello piatto** attuale `Item{id,name,equipped,effects}`.
6. **Pannelli del Gioco riposizionabili/ridimensionabili/adattabili** (non fissi): libreria **grid-layout-plus** (card su griglia con margini → coerente con lo stile "distanziato/arrotondato"). Ogni fase ha un **preset di layout** di default; l'arrangiamento dell'utente **persiste nelle UI settings** (preferenza, **non** event store).
7. **Dadi 3D** = `@3d-dice/dice-box`, **validato con uno spike** (§6). Il 3D è **cosmetico**: il motore decide, i dadi atterrano sulle facce predeterminate.
8. **`commandSchema` esteso all'intera unione `Command`** del motore (§7): la UI/GM può emettere **tutto ciò che l'engine supporta** (cambio fase, fine scontro, avanza quest, check/effetto manuali). Il gioco normale resta guidato dall'AI; questi sono **controlli GM/manuali**.
9. **Verifica UI** = mix a strati (§9): layer logico **TDD** (Vitest + Vue Test Utils) + component test selettivi + **self-test `LOOMN_SELFTEST` esteso** + screenshot. **NO Playwright E2E** (YAGNI).
10. **Streaming del turno DEFERITO** (fast-follow additivo): la UI funziona su `run-turn` request/response con uno stato "il Master sta scrivendo…".

---

## 3. Design language — "strumento notturno"

Direzione: uno **strumento narrativo serio**, non un giocattolo. La cifra è la **disciplina** (spaziatura, tipografia, ritmo, motion sobrio), **non** l'ornamento.

- **Superficie:** campo graphite (near-black, leggermente caldo) con grana/vignette tenui; **ogni sezione è un pannello arrotondato, leggermente staccato, con spazi reali** fra i pannelli — coerente su rail, topbar, pannelli.
- **Tipografia:** serif letterario (**Newsreader**) per la **narrazione del Master** (con drop-cap d'apertura scena); grotesk preciso (**Archivo**) per la **UI/chrome**; **mono (JetBrains Mono)** per **numeri, tiri, statistiche**; display serif (**Fraunces**) per wordmark e titoli di scena. Nessun Inter/Roboto/Arial.
- **Colore:** **un solo accento brass**, usato con parsimonia sugli stati attivi/importanti; **cambia tinta per fase** (brass / ember-clay / oro tenue / slate) così l'intera app comunica la modalità. Il **colore di genere e i temi dei dadi arrivano dai moduli** (sopra una shell neutra). Tutto via **variabili CSS (token)**.
- **Motion:** comparsa dei pannelli con stagger; rotolata dei dadi; transizioni sobrie. Niente effetti gratuiti.
- **Riferimento:** prototipo dark navigabile in `docs/superpowers/prototypes/piano10/play-shell.html` (approvato dall'utente come direzione; "migliorabile" → polish in corso, non rilavorazione).

---

## 4. Layout e architettura informativa

- **Frame adattivo alla fase:** la shell reagisce a `GameState.phase` (esplorazione/dialogo → chat-first; combattimento → cockpit; quiete → scheda/diario). La fase è già nel read-model.
- **IA ibrida:** `Gioco` è la home immersiva (pannelli vivi: scheda-sintesi, dadi, scontro, quest); le superfici profonde sono **route** (Vue Router): `Diario`, `Scheda`, `Compagnia`, `Impostazioni`. Pinia tiene il read-model **una volta** → cambiare route è istantaneo, tutte leggono lo stesso stato.
- **Campagna:** boot a **campagna singola** (il `loomn.db` del 9c-ii); il **campaign-picker/home multi-campagna è deferito** (la shell è progettata per ospitarlo dopo, senza rilavorazione). **First-run:** se `get-status.providerConfigured === false`, la shell guida a `Impostazioni` prima del primo turno.
- **Pannelli del Gioco:** mobili/ridimensionabili/adattabili via **grid-layout-plus**; **preset per fase** + arrangiamento utente **persistito nelle UI settings**.

---

## 5. Strategia tecnica (read-side)

- **Componenti:** Reka UI (primitivi headless: dialog, popover, menu, tabs, slider, tooltip, toast) **stilizzati al 100%** col design system bespoke; tutto il resto (pannelli, card, barre, chat, dadi) costruito a mano sui token. Wrapper riusabili (`LoomnPanel`, `LoomnButton`, `LoomnDialog`, …) costruiti una volta → consistenza per **riuso**, non per disciplina-per-componente.
- **Read-side (Pinia):** uno store tiene `{version, state: GameState}` da `read-model-push`; i pannelli sono **`computed`/selector derivati** (`actors`, `encounter`, `quests`, `phase`). Il renderer **non muta** lo stato.
- **Stack (da spec autorità §9.2):** Vue 3 + Vite + TypeScript strict, **Pinia**, **Vue Router**.

---

## 6. Dadi 3D

- **Principio (sacro, spec §11.3):** il motore decide l'esito (RNG seedato), il 3D è **cosmetico** e atterra sulle facce predeterminate. Mai la fisica decide.
- **Modello dati (verificato in `engine/dice.ts`/`check.ts`):** `RollResult.dice` è una **lista piatta di `DieResult{sides, value, tag?}`** (`rollExpression` espande tutti i `DieGroup`). Quindi **un solo tiro può contenere un pool misto** (es. `1d20` + `2d6` + `1d8`), ognuno col suo `value`; `tag` = fonte (arma/talento/vantaggio); più `modifierTotal`, `total`, `mode` (`check`|`effect`). Le prove sono `CheckResult extends RollResult` + `dc`, `margin`, `outcome` (5 gradi).
- **Data flow:** i `RollResult` vivono negli eventi (`AttackResolved.check`, `CheckResolved.result`, `ResourceEffectApplied.roll`). Il `CampaignService` li ritorna in `DispatchOutcome`/`TurnOutcome.events`, ma l'handler IPC li **scarta** → il **Piano 0** li espone. Un *dice service* nel renderer prende il `RollResult` e **forza** `@3d-dice/dice-box` sulle facce esatte.
- **Requisiti animazione (utente):** pool **misti** in un'unica gettata (poliedri diversi); ogni gettata **diversa**, fisica reale che simula la rotolata, **origini/impulsi differenti** ogni volta; facce finali **forzate** sui valori del motore. `modifierTotal` mostrato come chip `+N` (non un dado); `total` e (per prove) `outcome` vs `dc` nel readout; il `tag` etichetta/raggruppa per fonte.
- **Edge:** `sides` nel motore è **arbitrario** → poliedri standard in 3D, `sides` non-standard → **fallback grazioso** (token numerico).
- **Libreria:** `@3d-dice/dice-box` (scelta dello spec autorità), validata da uno **spike** (determinismo facce forzate + tema per-modulo + pool misti + fisica variata + fallback non-standard + integrazione Vue/asset). Il Three.js del prototipo è **solo** per giudicare il look (niente facce numerate/fisica) → resta **fallback** solo se lo spike fallisce.

---

## 7. Copertura totale e audit di collegamento

Audit verificato sul codice (2026-06-17). Legenda: 🟢 collegato (esiste + attraversa l'IPC) · 🟡 esiste nel backend ma **non esposto** sull'IPC · 🔴 non esiste (feature/defer).

| Elemento UI | Substrato backend esistente | Stato |
|---|---|---|
| Turno: azione → narrazione | `run-turn` (CampaignService.runTurn) | 🟢 |
| Stato live: attori, attributi, abilità, risorse, condizioni, progressione | `GameState.actors[]` via `read-model-push` | 🟢 |
| Quest lista/stato · fase · scontro (iniziativa/round/turni/zone) | `GameState.quests` / `.phase` / `.encounter` | 🟢 |
| Creazione PG · controllo combat (fine turno/round, avvia scontro, attacco) | `dispatch(AddActor/EndTurn/NextRound/StartEncounter/Attack)` | 🟢 |
| Provider · diagnostica | `set-provider` / `get-status` | 🟢 |
| Inventario (modello piatto) · roster Compagnia | `GameState.actors[].items` / `.kind` | 🟢 (display) |
| **Storia narrazione** (log persistente + Diario) | eventi `NarrationRecorded` nello stream | 🟡 read-layer |
| **Canon** (Diario) · **Narrativa L2** (Diario) | `ledger.active()/all()` · `summaries.list()` | 🟡 read-layer |
| **Dadi 3D + chip esito** | `RollResult`/`CheckResult` negli `events` di dispatch/turn | 🟡 (events scartati dall'IPC → esporre) |
| Azioni manuali/GM: cambia fase, fine scontro, avanza quest, check/effetto manuali | Command `EnterPhase/EndEncounter/AdvanceQuest/StartQuest/RequestCheck/ApplyEffect` (in engine, **non** in `commandSchema`) | 🟡 (estendere `commandSchema`) → 🟢 **Piano 0** |
| **Vocabolario di gioco** (creazione PG · controlli GM · Scheda data-driven) | `Ruleset` (host, iniettato in `createCampaignService`); enum di comando engine | 🟡 read-layer → **10g** |
| Equip/unequip · movimento in zona (come azioni) | nessun Command/Event (solo helper engine non cablati) | 🔴 feature/defer |
| Slot equip profondi + contenitori · relazioni strutturate | non esistono (relazioni solo come fatti canon) | 🔴 feature |
| Persistenza layout pannelli | nessuna (preferenza UI, non dominio) | 🔴 nuovo (UI settings) |

**Findings di binding verificati:**
- `commandSchema` (shared) copre **solo 5 Command** (AddActor, StartEncounter, EndTurn, NextRound, Attack); i nuovi (RequestCheck/ApplyEffect/StartQuest/AdvanceQuest/EnterPhase/EndEncounter) esistono in engine ma **non** nello schema IPC → oggi solo l'AI li emette.
- `CampaignService` espone `getReadModel/dispatch/runTurn/reflect`; `DispatchOutcome`/`TurnOutcome` **ritornano `events`** (coi tiri) ma l'handler IPC li **scarta** (`{narration/version}`).
- Canon ledger e riassunti L2 vivono in `host`/`memory` ma **non** attraversano l'IPC.
- Equip/unequip e movimento **non** sono Command/Event (solo helper engine non cablati).
- Il **vocabolario del `Ruleset`** (attributi/abilità/risorse/difese + `defaultResources`) è iniettato nel main e **non attraversa l'IPC** (il read-model è `{version, state}`; il vocabolario è la *lente*, non lo stato) → la UI data-driven (creazione PG, controlli GM, Scheda) non conosce gli id legali. **Risolto dal Piano 10g** (canale read `get-ruleset`), prima di 10f.

---

## 8. Lacune e risoluzioni

- **🟡 Read mancanti** → **Piano 0 (read-side):** esporre via canali IPC tipizzati la **storia narrazione** (proiezione `NarrationRecorded`), il **canon ledger**, i **riassunti L2** (query on-demand/paginate, **non** gonfiano il push di stato) + gli **`events`/tiri** nei risultati di dispatch/turn (additivo, validati da `domainEventSchema`).
- **🟡 Write mancante** → **Piano 0 (write-side):** estendere `commandSchema` all'**intera unione `Command`** (additivo, cast-free, drift-guard). *(Piano 0 ✅ FATTO, `614a6bb`.)*
- **🟡 Vocabolario di gioco mancante sull'IPC** → **Piano 10g (read-side):** il `Ruleset` (attributi/abilità/risorse/difese + `defaultResources`) è iniettato nel main e **non attraversa l'IPC** (il read-model è `{version, state}`; il vocabolario è la *lente*, non lo stato — G3/G4: `applyEvent`/`rebuild` non prendono il ruleset). I pannelli **data-driven** (creazione PG e controlli GM in 10f, Scheda in 10d) ne hanno bisogno per popolare i form coi valori legali (altrimenti si invia un id che il motore rifiuta). Canale read `get-ruleset` (DTO vocabolario + enum di comando `DIFFICULTIES`/`SOFT_PHASES`/`QUEST_OUTCOMES`/`restore|drain`), stile Piano 0 (additivo, testabile su ABI Node, `shared` resta foglia). **Prerequisito di 10f/10d, da eseguire prima di 10f.** *(Lacuna emersa dopo il Piano 0; l'audit §7 originale non l'aveva isolata.)*
- **Streaming** → **deferito** (fast-follow: canale progress additivo, quando vorremo). La UI funziona su request/response.
- **🔴 Non esiste** → **feature future** (motore inventario profondo; equip/movimento come Command/Event; relazioni strutturate). La UI è **display-only** su ciò che esiste; la persistenza-layout è preferenza UI (nuova ma fuori dominio).
- **Delta read-model** (spec autorità §13) → **deferito** (snapshot completo `{version,state}` resta; i nuovi canali read sono paginati → non aggravano il push).

---

## 9. Strategia di verifica

- **Layer logico (TDD vero):** store/selector Pinia (reducer del read-model, derivati), mapping `RollResult → notazione dice-box`, persistenza layout, formattazione esiti → **Vitest + Vue Test Utils (jsdom)**. *Aggiungere il setup di test al renderer è un passo orchestratore dichiarato* (`app/desktop` oggi non è nell'include Vitest; mai toccare config dai subagent — house rule §5.1).
- **Component test selettivi:** solo dove c'è logica/stato reale (pannello dadi, barre risorse, switch di layout per fase), non per i puramente presentazionali.
- **Gate "esegui l'app":** estendere `LOOMN_SELFTEST` (stile 9c-ii) per esercitare il renderer end-to-end con **provider stubbato deterministico** (carica campagna → dispatch → run-turn → read-model aggiornato → naviga le route) → `VERDICT: PASS`.
- **Prova visiva:** screenshot degli stati chiave allegati alla verifica di ogni sotto-piano.
- **Dadi 3D:** validati dallo **spike** (determinismo/tema), non da unit test.
- **Fuori:** Playwright E2E (YAGNI ora).

---

## 10. Decomposizione in piani

Ordine confermato: **0 → 10a → 10g → 10f → 10b → 10c → 10d → 10e** (10g = vocabolario/`Ruleset` su IPC, prerequisito dei pannelli data-driven di 10f/10d — aggiunto 2026-06-18 dopo il Piano 0; dipende solo da 0, quindi resequenziabile anche prima di 10a. Provider/first-run anticipato perché `run-turn` reale lo richiede).

| Piano | Cosa consegna | Lega a (esistente) | Dipende da |
|---|---|---|---|
| **0 · IPC/CQRS completeness** (pre-UI, backend testabile, flusso §4) | **write**: `commandSchema` = unione `Command` completa · **read**: `events` (coi tiri) nei risultati dispatch/turn + canali storia narrazione / canon / L2 (paginati) | engine `Command`, `NarrationRecorded`, `ledger`, `summaries`, `events` del CampaignService | — |
| **10a · Fondamenta UI** | design system "strumento notturno" (token + componenti base + Reka), Pinia read-side ← `read-model-push`, router shell (rail/topbar/route), frame adattivo, contenitore **grid-layout-plus** + persistenza layout | `read-model-push`, `GameState.phase` | 0 (parziale) |
| **10g · Vocabolario di gioco su IPC** (read channel `get-ruleset`, stile Piano 0) | canale read `get-ruleset` → DTO `{vocabulary:{attributes,skills,resources,defenses,defaultResources}, difficulties, softPhases, questOutcomes, directions}`; metodo sincrono su `CampaignService` (come i read del Piano 0) + handler IPC sottile + bridge; export degli enum statici di comando da `@loomn/shared`; self-test esteso. Additivo, testabile su ABI Node, `shared` resta foglia | `Ruleset` (host, iniettato in `createCampaignService`), enum engine | 0 |
| **10f · Impostazioni + first-run + GM** | provider (set-provider/safeStorage/get-status), first-run, **creazione PG** (AddActor), controlli GM/manuali (Command estesi) — **form data-driven dal vocabolario di 10g** | `set-provider`/`get-status`, `commandSchema` esteso, `get-ruleset` | 0, 10a, 10g |
| **10b · Gioco** | chat/narrazione (storia + run-turn), input azione, **dadi 3D** (spike `@3d-dice/dice-box`) + chip esito | `run-turn`, storia narrazione, `events`/`RollResult` | 0, 10a, 10f |
| **10c · Combattimento** | cockpit scontro (iniziativa/round/turni), zone, feedback attacco/check/effetto, re-theme per fase | `GameState.encounter`, Command combat | 10a, 10b |
| **10d · Scheda + inventario** | identità/attributi/risorse/condizioni/progressione + shell equip/inventario **data-driven** (modello piatto, Ruleset-aware) | `GameState.actors[]`, `get-ruleset` (10g) | 10a, 10g |
| **10e · Diario + Compagnia** | narrativa L2 + canon (+ trigger `reflect`), roster PG/PNG | canali read L2/canon, `reflect`, `GameState.actors` | 0, 10a |

Ogni piano segue il **flusso §4** dell'HANDOFF (writing-plans → commit doc su main → branch → subagent-driven → finishing-a-development-branch → aggiorna memoria/HANDOFF). Il **Piano 0 è FATTO e mergiato** (`614a6bb`, 476 test); il prossimo da scrivere è il **Piano 10a**, poi **10g** (vocabolario su IPC, prima di 10f).

---

## 11. Fuori ambito / deferiti (esplicito)

- **Streaming del turno** (token-by-token + feedback incrementale): fast-follow additivo.
- **Multi-campagna** (picker/home + creazione campagne): post-MVP; la shell lo ospiterà senza rilavorazione.
- **Motore Inventario & Equipaggiamento** (slot profondi, contenitori annidati, catalogo/economia): feature core dedicata, **dopo** il Piano 10 (UI co-progettata qui, data-driven, render piatto per ora).
- **Equip/movimento come azioni** (Command/Event): feature future; per ora display-only.
- **Relazioni strutturate** (Compagnia): solo come fatti canon per ora.
- **Delta read-model** (spec autorità §13): deferito.

---

## 12. Riferimenti

- **Spec autorità:** `docs/superpowers/specs/2026-06-15-simulatore-campagne-ai-design.md` (§4 sicurezza/IPC, §5.2 CQRS, §5.4 turno, §5.5 FSM fase, §6 memoria, §11.1-11.3 tiro/dadi, §13 aperti).
- **Contratto IPC:** `packages/shared/src/ipc.ts`. **Application layer:** `packages/host/src/campaign-service.ts`. **Modello dadi:** `packages/engine/src/dice.ts`, `check.ts`. **Command IPC:** `packages/shared/src/domain-schema.ts` (`commandSchema`).
- **Prototipo design:** `docs/superpowers/prototypes/piano10/play-shell.html`.
- **HANDOFF:** `docs/superpowers/HANDOFF.md` (§0-quaterdecies stato, §4 processo, §5 house rules, §7-quinquies 9c-ii, §8 roadmap + feature Inventario).
