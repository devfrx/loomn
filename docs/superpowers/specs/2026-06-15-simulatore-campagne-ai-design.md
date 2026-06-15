# Simulatore di Campagne Interattive con Master AI — Design

> **Stato:** bozza di architettura approvata. La **struttura di gioco** (attributi,
> abilità, funzionalità di gameplay, contenuti dei moduli a tema) è **ancora da
> studiare** ed è marcata come `DA DEFINIRE` più sotto.
>
> **Nome del progetto:** **Loomn** (deciso 2026-06-15). Evoca il telaio (*loom*) che
> *tesse* le trame di qualsiasi genere; variante coniata per essere ownable ed evitare il
> marchio "Loom" (video). Verifica fatta: nessun conflitto nel settore giochi/AI/software.
>
> **Data:** 2026-06-15

---

## 1. Visione

Un simulatore di **campagne interattive** giocabili in **single e multiplayer**, guidate
da un **Master AI** che fa da narratore, arbitro e interprete dei PNG. Deve supportare
**qualsiasi tema e genere** e offrire **meccaniche complete e profonde**.

Il Master AI deve poter girare:
- **in locale** tramite **LM Studio** (offline, senza chiavi cloud);
- tramite le **API dei principali servizi AI** (OpenAI, Anthropic, Google, OpenRouter, Groq, Mistral, ecc.).

### Principio guida
> **Il codice è l'arbitro, l'AI è il narratore.**
> Tiri, danni, HP, esiti delle prove e invarianti di gioco sono calcolati in modo
> **deterministico** dal codice. L'AI **propone** azioni e **narra** gli esiti reali;
> non decide mai i numeri e non muta direttamente lo stato.

---

## 2. Forma del prodotto

- **Esperienza:** single e multiplayer, entrambi con Master AI.
  - Single e local-first sono la Fase 1.
  - Multiplayer (sessione condivisa) è una fase successiva, ma l'architettura è
    progettata per renderlo possibile senza riscritture (vedi Event Sourcing).
- **Piattaforma:** **app desktop** con stack **Electron + Vue 3**.
- **Sistema di regole:** **motore generico universale deterministico**, progettato per
  accettare **moduli a tema** (preset di genere) caricabili come dati. Niente sistemi su
  licenza (es. D&D 5e) per non vincolarsi a un genere e per evitare problemi legali.

---

## 3. Stile architetturale

**Esagonale (Ports & Adapters) + DDD tattico.** Il nucleo di dominio non conosce né
Electron né Vue: definisce **porte** (interfacce) implementate da **adattatori** ai bordi.
Conseguenza: il dominio è testabile in isolamento e ogni dipendenza esterna (DB, AI,
random, clock) è sostituibile. Lo stesso motore è riusabile per un futuro server/web.

### Bounded context espliciti (per evitare il "god model")
| Contesto            | Persistenza            | Note |
|---------------------|------------------------|------|
| **Campaign/World**  | **Event Sourcing**     | L'**unico** contesto event-sourced. |
| **Rules/Content**   | dati versionati + Zod  | CRUD, **non** ES. Moduli a tema. |
| **AI/Conversation** | orchestrazione + transiente | **non** ES. |
| **App/Settings**    | CRUD cifrato           | **non** ES. Chiavi API, preferenze UI. |

> **Anti-pigrizia:** l'Event Sourcing è giustificato *solo* nel contesto Campaign/World,
> dove i requisiti lo meritano davvero (undo/rewind, audit = memoria, sync futura).
> Applicarlo a config/settings/contenuti sarebbe pattern messo per dogma → debito.

---

## 4. Struttura del codice (monorepo)

Monorepo **pnpm workspaces**.

```
repo/
├─ packages/
│  ├─ engine/    ← TS PURO. Regole, dadi, combattimento, modello personaggio,
│  │              stati, progressione. Zero IO, zero Electron/Vue. Test a unità.
│  ├─ content/   ← Schema + dati dei moduli a tema. Data-driven, validato Zod.
│  ├─ ai/        ← AI Master + Provider Layer (OpenAI-compat + adattatori
│  │              Anthropic/Gemini). Orchestrazione prompt, streaming, tool-calling,
│  │              structured output con fallback.
│  ├─ memory/    ← Persistenza + memoria a strati (L1/L1.5/L2; L3 in Fase 2).
│  │              Drizzle + SQLite.
│  └─ shared/    ← Tipi condivisi + contratti IPC + schemi Zod (unica fonte).
│
└─ app/
   ├─ main/      ← Processo Electron (Node). Possiede DB, engine, chiavi API
   │              (OS keychain via safeStorage), handler IPC. Unico "fidato".
   ├─ preload/   ← contextBridge: API IPC tipizzata e ristretta. Niente Node nel renderer.
   └─ renderer/  ← Vue 3 + Vite + TS + Pinia + Vue Router. SOLO UI. Parla via IPC.
```

### Regole anti-debito
- **Dependency rule unidirezionale:** `app → packages`; dentro packages
  `ai/memory/content → engine → shared`. Mai il contrario. Il renderer Vue **non**
  importa engine/db: solo IPC.
- **Engine puro:** funzioni deterministiche; **niente `Date.now`/random globali** — il
  random è iniettato (seed) → partite riproducibili, test stabili.
- **Sicurezza Electron by default:** `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`, preload a superficie minima. Chiavi API mai nel renderer, cifrate con
  `safeStorage`.
- **Validazione Zod ai confini:** contenuti dei moduli, output dell'LLM, payload IPC.
  Non fidarsi mai di JSON esterni o dell'output del modello.
- **Strict TypeScript** ovunque, lint/format condivisi, test su `engine` di prima classe.

---

## 5. Architettura interna (pattern)

### 5.1 Pattern centrale: Event Sourcing + CQRS (solo Campaign/World)
- **Command** = intenzione (`DichiaraAzione`, `RisolviAttacco`, `UsaOggetto`).
- L'engine valida il Command contro lo stato → emette **Event** immutabili.
- Gli **Event** sono l'unica fonte di verità; lo stato è una loro **proiezione**.

Vantaggi sfruttati:
- Il **log eventi è la memoria della campagna** (stesso stream per riassunti e RAG).
- **Replay deterministico** (random seedato) → debug/test riproducibili.
- **Undo/redo/rewind** quasi gratuiti.
- **Multiplayer** = trasmettere lo stream di eventi (vedi §5.6: non è "gratis", ma il 60% del lavoro è tolto).

### 5.2 CQRS attraverso i processi (Electron)
- **Write side** solo nel `main` (autorevole): riceve Command via IPC, esegue, persiste eventi.
- **Read side:** il `renderer` (Pinia) tiene **proiezioni di sola lettura** aggiornate dagli
  eventi spinti dal main. Il renderer non muta mai lo stato.

### 5.3 Modello di dominio dell'engine
- **Value Object** immutabili: `DiceExpr` ("2d6+3"), `Attribute`, `Modifier`, `Skill`,
  `CheckResult` (espr, rolls, total, dc, outcome, margin).
- **Entity:** `Character` (PG e PNG, stesso modello: attributi, skill, resources
  HP/mana/stamina, conditions, inventory, progression).
- **Aggregate Root:** es. `Encounter` (combattimento) — garante delle invarianti
  (nessuno agisce due volte/round, HP non sotto 0 senza emettere "Morente", ecc.).
- **Regole come funzioni pure:** `(state, cmd, rng, ruleset) → DomainEvent[]`. Il
  `Ruleset` è iniettato → i moduli a tema possono estendere/sostituire le regole senza
  toccare l'engine.

### 5.4 AI Master come pipeline esplicita
```
assembla contesto (memoria a strati, §6)
  → costruisce prompt
  → LLM (streaming) via porta LanguageModel
  → tool-call → validazione Zod → Command
  → engine valida/esegue (deterministico, rng seedato)
  → l'AI riceve gli Event REALI e narra
```
- **L'AI propone Command, non tocca il DB.** Strumenti esposti con schema Zod
  (`request_check`, `apply_effect`, `spawn_npc`, `advance_quest`, `narrate`).
- Il **tiro lo fa l'engine**, non l'AI. Command che violano le invarianti → rifiutati.
- **Fatti narrativi canonici generati dall'AI** (nuovo PNG, nuovo fatto di trama) passano
  anch'essi da Command→Event → diventano canone replayabile.
- **Provider = Strategy** dietro la porta `LanguageModel` (OpenAI-compat + adattatori).
- **Ottimizzazione flusso:** preferire **un singolo turno agentico in streaming** (il
  runtime reinietta gli Event reali nello stesso turno) invece di due chiamate
  "risolvi→narra", per dimezzare latenza e costo a parità di rigore.

### 5.5 Fasi di gioco come State Machine
Esplorazione / dialogo / combattimento / downtime sono una **FSM** dichiarata: ogni fase
abilita Command diversi e una diversa strategia di prompt. Transizioni esplicite e
testabili (niente `if` annidati sparsi).

### 5.6 Concorrenza e multiplayer (correttezza, non "gratis")
- **Concorrenza ottimistica** sull'event store (`expectedVersion` sullo stream; conflitto
  → retry/merge).
- Servono comunque: ordinamento/autorità dei Command, politica per i conflitti narrativi.
- L'ES toglie ~60% del lavoro multiplayer, non il 100%. Fase successiva.

---

## 6. Architettura della memoria a strati

**Principio:** tutti i livelli **derivano dallo stream di eventi**; non sono un sistema
parallelo da sincronizzare → niente debito di sync.

```
EVENT STREAM (unica verità, append-only)
  ▼ derivazione
L1   STATO STRUTTURATO   — fatti meccanici autorevoli (HP, inventario, luogo, quest,
                           condizioni, relazioni). Proiezioni SQLite. SEMPRE iniettato.
L1.5 CANON LEDGER        — fatti narrativi DISCRETI e interrogabili
                           (soggetto, predicato, oggetto, eventId, stato). Precisione sui nomi.
L2   MEMORIA NARRATIVA   — riassunti gerarchici: scena → sessione → arco → campagna.
                           Recente verbatim, vecchio compresso. Continuità.
L3   MEMORIA EPISODICA   — RAG: indice vettoriale su log narrativo + canon. [Fase 2]
                           Recupero on-demand per rilevanza. "Memoria infinita".
+    MEMORIA PER ENTITÀ  — ogni PNG porta la sua memoria delle interazioni col giocatore.
```

> **Perché L1.5 (Canon Ledger):** la prosa dei riassunti perde precisione. Per *non
> contraddirsi*, il Master ha bisogno di fatti discreti (`(PG, ha_ucciso, Guardia#3, evt:8120)`),
> non solo riassunti sfumati. È il pezzo che la maggior parte dei sistemi dimentica.

### 6.1 Percorso di scrittura — Reflection (asincrono, fuori dal turno)
```
fine scena/sessione → REFLECTION
  ├─ estrae fatti nuovi → Canon Ledger (con validazione anti-contraddizione)
  ├─ genera riassunto scena → L2 (ricompone i livelli superiori)
  ├─ assegna salienza (importanza × ricorrenza)
  └─ [Fase 2] calcola embedding → L3
```
**Salienza:** un round di combattimento è effimero; "il giocatore ha tradito il re" è
permanente. Lo score (importanza × recency × rilevanza, stile Generative Agents) decide
cosa promuovere a lungo termine e cosa recuperare.

### 6.2 Percorso di lettura — Context Assembler con budget di token
**Non** "infila tutto e prega": allocatore con priorità e degrado controllato.
```
budget token = N. Priorità (alto → basso; si taglia dal basso):
  1. ruolo/regole/fase        (fisso)
  2. L1 stato rilevante       (entità della scena, non tutto il mondo)
  3. L1.5 canon rilevante     (fatti su scena/PNG presenti)
  4. L2 narrativa recente     (ultima scena verbatim + riassunto sessione)
  5. L3 ricordi recuperati    (top-k per salienza)  [Fase 2]
  6. azione del giocatore     (fisso)
oltre budget → si tagliano prima i ricordi L3 a salienza minore; MAI L1/L1.5.
```
Degrado esplicito → lo stesso flusso gira con un 7B locale a contesto piccolo e con un
modello cloud a contesto enorme.

### 6.3 Persistenza (offline-first)
- L1 / L1.5 / L2: tabelle **SQLite** (Drizzle), rigenerabili dagli eventi (no stato orfano).
- L3: store vettoriale locale (`sqlite-vec` / libSQL vector). **Embedding locali di
  default** (endpoint embeddings di LM Studio o modello on-device) → memoria semantica
  **senza chiavi cloud**. Provider cloud solo opzionale.
- **Migrazioni di memoria = rebuild dallo stream.** Mai migrazioni manuali fragili.

---

## 7. Strato AI / Provider (requisito locale + cloud)

- **Client unificato OpenAI-compatibile** come base (LM Studio, OpenAI, OpenRouter, Groq,
  Mistral, ecc. via URL/chiave configurabili). **Adattatori dedicati** solo per chi differisce
  (Anthropic, Gemini).
- **`StructuredOutputPort` con 3 livelli di fallback** (CRITICO per i modelli locali, che
  spesso fanno tool-calling male o per niente):
  1. **function-calling nativo** (provider che lo supportano bene);
  2. **constrained decoding / grammar** (GBNF / JSON-schema): LM Studio e llama.cpp possono
     *forzare* l'output a rispettare lo schema → JSON valido anche da modelli deboli;
  3. **parsing + riparazione + riprova**.
- **`TracingPort`** trasversale dal giorno 1: prompt, token, costo, latenza, tool-call,
  **fallimenti di validazione**, retry. Senza osservabilità = debito invisibile.

---

## 8. Moduli a tema (plugin)

Un genere (fantasy, sci-fi, horror, investigativo…) è un **plugin** che registra contenuti
(attributi, abilità, bestiari, tabelle, tono narrativo) e *opzionalmente* estensioni di
regole, tramite contratto definito e validato.

**Sicurezza/anti-debito:**
- **Dichiarativi by default:** dati validati Zod; formule come espressioni valutate in modo
  sicuro (no `eval` di codice esterno).
- **Codice solo dietro hook tipizzati e vagliati.** In Electron, codice di terze parti è
  superficie d'attacco e può violare le invarianti dell'engine → vietato per default.

---

## 9. Qualità e affidabilità

- **Contract test condivisi** per ogni adattatore: la **stessa suite di conformità** deve
  passare verde su ogni provider AI (OpenAI, Anthropic, LM Studio…) e su ogni adattatore
  `Repository`. Impedisce la deriva tra implementazioni.
- **Engine 100% testato a unità** (è la parte che deve essere ferrea); test deterministici
  via random seedato.
- **Replay-based tests** sul contesto Campaign/World (riproduci uno stream → asserisci lo stato).

### Dove NON aggiungere complessità (disciplina)
- No message bus / broker esterni: Command/Event in-process bastano.
- No microservizi, no DDD "strategico" pesante: 4 bounded context concettuali, un processo.
- No astrazione multi-DB prematura: SQLite + Drizzle dietro la porta `Repository`.
- Proiezioni in-memory + snapshot persistiti; niente read-model store separato finché non serve.

---

## 10. Decomposizione in fasi

- **Fase 1 — Core giocabile single, local-first**
  - `engine`: risoluzione (espressione di dadi componibile §11.1, gradi di successo §11.2),
    combattimento a zone (`PositionModel` §11.5), risorse/condizioni/progressione/inventario
    guidati dai dati (§11.6–11.9). Deterministico, RNG seedato.
  - **Formato dati dei moduli** validato Zod + **import/export** + **1 modulo a tema curato a
    mano** (per giocare subito).
  - AI Master base (pipeline §5.4) + Provider Layer (OpenAI-compat + LM Studio) +
    `StructuredOutputPort` con fallback grammar.
  - Memoria **L1 + L1.5 + L2** + Context Assembler con budget.
  - Event Sourcing del contesto Campaign/World + snapshot.
  - UI Vue: chat narrativa, scheda PG, **pannello dadi 3D** (§11.3), log/journal,
    gestione provider.
  - `TracingPort`.
- **Fase 2 — Profondità memoria, authoring e modelli**
  - **Module Editor visuale** (§11-bis) — percorso principale di creazione moduli.
  - **L3 (RAG)** con embedding locali + memoria per-entità + salienza con decadimento.
  - Adattatori provider aggiuntivi (Anthropic, Gemini) con contract test.
  - Più moduli a tema.
- **Fase 3 — Multiplayer**
  - Sessione condivisa via stream di eventi, concorrenza ottimistica, autorità Command.

---

## 11. Struttura di gioco (motore generico universale)

**Principio trasversale:** l'**engine fornisce le meccaniche**, il **modulo a tema fornisce
i dati**. Nessun attributo/risorsa/condizione è hardcoded: l'engine sa solo *come* le cose
funzionano, non *quali* esistono.

### 11.1 Risoluzione — il tiro
Un **Roll** è un'**espressione di dadi componibile**, non un singolo dado. Le *fonti*
(arma, abilità, talenti, modificatori, vantaggio/svantaggio) contribuiscono dadi e bonus a
un'unica espressione che l'engine risolve in modo deterministico (RNG **seedato**).

```
Roll = { dadi: [ {quantità, facce, tag} … ], modificatori: [ {valore, fonte} … ], modo }
   modo = "prova"  (confronto vs difficoltà)  |  "effetto"  (somma, es. danno)

es. attacco con spadone + talento + vantaggio:
   prova:   1d20 +2(forza) +1(talento)        → vs Difesa
   effetto: 2d6  +2(forza)                     → danno
```
Un solo primitivo copre prove, danni e qualsiasi genere; il pannello 3D disegna i dadi
contenuti nell'espressione.

### 11.2 Esito delle prove — gradi di successo
Esito a **più gradi** in base al margine vs difficoltà:
**critico / successo / successo con costo / fallimento / disastro.** Stessa matematica del
d20, ma molti più agganci narrativi per il Master AI. (Soglie/numero di gradi: default
nell'engine, eventualmente regolabili dal modulo.)

### 11.3 Pannello dadi 3D
Tavolo visto dall'alto, dadi lanciati in 3D; **lancio multiplo** quando l'espressione ha
più dadi. **Regola d'oro:** l'engine decide il risultato, il 3D è **cosmetico** e atterra
sulle facce predeterminate. Mai lasciare che la fisica determini l'esito (romperebbe
determinismo/replay/multiplayer/anti-cheat).
Tecnica: nel renderer Vue, libreria dedicata `@3d-dice/dice-box` (supporta risultati
predeterminati e temi grafici per modulo) o Three.js + physics (rapier/cannon-es).

### 11.4 Attributi & abilità
**Definiti dal modulo** (dati). Un genere usa Forza/Destrezza, un altro Logica/Empatia/
Hacking. L'engine sa solo come alimentano i tiri e le statistiche derivate.

### 11.5 Combattimento & posizionamento
**A zone astratte** (corpo a corpo / vicino / lontano / copertura): universale per ogni
genere, profondo nelle scelte (avvicinarsi, rompere l'ingaggio, cercare copertura, colpire
dalla distanza), narrabile dall'AI. Modellato come astrazione **`PositionModel`** di cui le
zone sono la prima implementazione → una **griglia tattica** può innestarsi come modulo in
futuro senza riscrivere il combattimento. Include iniziativa e azioni per turno.

### 11.6 Risorse
Generiche e definite dal modulo (HP, stamina, mana, "stress", "munizioni", "Sanità"…).
L'engine gestisce current/max, soglie ed esaurimento. Nessuna risorsa hardcoded.

### 11.7 Condizioni / stati
Dati del modulo (avvelenato, stordito, ispirato…), con **effetti dichiarativi** su
tiri/risorse e **durata** (turni/scene). L'engine li applica e li fa scadere.

### 11.8 Progressione
Modello scelto dal modulo: **XP/livelli** *oppure* **milestone** *oppure* avanzamenti
liberi. L'engine traccia e applica gli avanzamenti; il modulo definisce le curve.

### 11.9 Inventario & oggetti
Oggetti come dati con proprietà ed **effetti dichiarativi** (un'arma *contribuisce dadi*
all'espressione di tiro; un'armatura *modifica* una difesa). L'engine gestisce
possesso/uso/peso se il modulo lo richiede. Economia opzionale per modulo.

---

## 11-bis. Creazione dei moduli a tema (authoring)

**Obiettivo:** user-friendly. La creazione passa da un **editor visuale**, non da file.
(**AI-authoring escluso** dall'ambito su decisione esplicita; rivalutabile in futuro senza
impatti architetturali.)

- **Fondamenta — modulo = dato validato.** Pacchetto **portabile** (export/import) di dati
  validati dagli **stessi schemi Zod** del sistema: attributi, abilità, risorse, condizioni,
  oggetti, curve di progressione, bestiario, tono narrativo, tema dei dadi 3D.
- **Livello 1 — file (power user/portabilità):** formato leggibile (JSON/YAML) validato.
  Esiste per apertura e versionamento; non è il percorso principale.
- **Livello 2 — Module Editor visuale (percorso principale):** form e wizard dentro Loomn,
  **validazione live** (lo stesso Zod) e **anteprima**. Un utente non tecnico costruisce un
  modulo completo senza toccare file.
- **Sicurezza (già deciso):** moduli **dichiarativi**; codice solo dietro hook tipizzati e
  vagliati. Nessuna esecuzione di codice arbitrario da un modulo.

---

## 12. Stack tecnico (riepilogo)

- **Desktop:** Electron + Vue 3 + Vite + TypeScript (strict).
- **Stato UI:** Pinia. **Routing:** Vue Router.
- **Monorepo:** pnpm workspaces.
- **DB:** SQLite + Drizzle ORM (nel processo main).
- **Vettori (Fase 2):** sqlite-vec / libSQL vector, embedding locali di default.
- **Validazione:** Zod (unica fonte di schemi in `shared`).
- **AI:** client OpenAI-compatibile unificato + adattatori Anthropic/Gemini;
  structured output con fallback (function-call → grammar → repair).
- **Sicurezza:** contextIsolation + sandbox + safeStorage per le chiavi.

---

## 13. Aperto / da decidere

- ~~Nome e branding del progetto~~ → **deciso: Loomn** (2026-06-15). Resta da registrare
  dominio/marchio (valutare `.app`/`.io`/`.game` se il `.com` non è libero).
- ~~Struttura del gioco (§11)~~ → **definita** (2026-06-15).
- **AI-authoring dei moduli:** fuori ambito per scelta; eventuale rivalutazione futura
  (riuserebbe `StructuredOutputPort`, nessun impatto architetturale).
- Soglie/numero esatto dei gradi di successo (default engine vs override modulo) — da tarare in playtest.
- Set di azioni di combattimento e definizione esatta delle zone del `PositionModel`.
- Dettaglio del protocollo di aggiornamento read-model main→renderer (delta vs snapshot).
