# D‑01a — Campaign Seed: motore + contesto (incipit/campagna) — Design

> **Data:** 2026-06-23 · **Traccia:** D‑01 (incipit/campagna progettata, "il problema enorme") · **Slice:** D‑01a (prima di b/c/d) · **Stato:** design da approvare → poi `superpowers:writing-plans`.

## 1. Problema

Oggi il Master AI narra **nel vuoto**: nessuno scenario/universo/trama/scena d'apertura è iniettato nel suo contesto (audit **D‑01**, `audits/2026-06-19-loomn-audit-findings.md:284`). Si crea un PG (Compagnia → crea PG) e si inizia a dispacciare turni, ma il Master non ha una premessa da cui partire. È una **lacuna funzionale core** di un simulatore narrativo, non un bug. Il `Ruleset`/`Vocabulary` porta solo il vocabolario di *regole* (attributi/abilità/risorse/difficoltà), non la premessa narrativa.

## 2. Decisioni prese (con l'utente, via brainstorming)

1. **Seed source-agnostic (ibrido).** Il dato canonico è un `CampaignSeed` strutturato, popolabile da più sorgenti; la **prima** sorgente (D‑01b) sarà l'AI‑da‑brief. Moduli (D‑01d/Piano 11) e scrittura manuale popolano lo stesso seed.
2. **Strutturato + semina lo stato.** Il seed non è solo contesto narrativo: i **PNG chiave** diventano attori reali e **luoghi/fatti** diventano canon, così il mondo esiste per l'arbitro dal turno 0 (coerente con "il codice è l'arbitro").
3. **Decomposizione.** D‑01 si splitta in **D‑01a** (motore + contesto, seed da default — questo spec), **D‑01b** (generazione AI‑da‑brief via StructuredOutput), **D‑01c** (UX onboarding), **D‑01d → Piano 11** (moduli come sorgente).
4. **Approccio A — Command `SeedCampaign`.** Un nuovo Command che il motore espande in `CampaignFramed` (nuovo campo `GameState.campaignFrame`, event‑sourced) + `ActorAdded` per i PNG; il host semina i fatti canon e lancia il turno Master d'apertura; il Context Assembler aggiunge il blocco "campaign frame". Atomico, arbitrato, replayable, single-source.
5. **Fondamenta multi-campagna decise ORA (gestione additiva in D‑03).** Isolamento = **un DB per campagna** (`userData/campaigns/<id>/loomn.db`); **identità** (`id`+`name`) nel seed/frame, event‑sourced. D‑01a opera sulla **campagna attiva** (id `default` finché non c'è il registro). Il **registro** (lista/crea/seleziona/switch/elimina) e la sua UX restano **D‑03**, ma ora **puramente additivi** (zero rework): definire *prima* cos'è UNA campagna (il seed) abilita la gestione del plurale. *(Verificato: il cuore del seed è già per-stream → multi-ready; l'unica assunzione single-campaign era `main` che apre un DB, `app/desktop/src/main/index.ts:277`.)*

## 3. Scope

**IN (D‑01a):**
- `CampaignSeed` + `CampaignFrame` come schemi in `@loomn/shared`, con **identità** (`id`+`name`).
- Command `SeedCampaign` + evento `CampaignFramed` + campo `GameState.campaignFrame` (`@loomn/engine`), che semina i PNG riusando la logica `AddActor`.
- Seeding dei fatti canon iniziali nel Canon Ledger (`@loomn/memory`/`@loomn/host`).
- Blocco "campaign frame" nel Context Assembler.
- `seedCampaign(seed)` su `CampaignService` (atomico) + **narrazione d'apertura** (turno 0) best-effort.
- **Layout DB-per-campagna** + apertura della **campagna attiva** a `userData/campaigns/<id>/loomn.db` (piccolo cambio al wiring del `main`; `createMemorySystem(dbPath)` resta il seam) → fondamenta multi-campagna (§4.4).
- `devCampaignSeed` di default (come `devRuleset`) per provare end‑to‑end senza AI/UX.

**DIFFERITO (NON D‑01a):**
- Generazione AI‑da‑brief del seed → **D‑01b**.
- UX onboarding nuova-campagna (brief → review/edit → crea PG → apertura) → **D‑01c** (può intrecciarsi con D‑02).
- Moduli/Piano 11 come sorgente di seed → **D‑01d**.
- **Topologia/movimento di zona** (già differito post-Piano-10): i luoghi sono **solo canon**, non zone con movimento.
- **Gestione** multi-campagna (registro: lista/crea/seleziona/switch/elimina + UX) → **D‑03**, ora **additiva** perché le fondamenta (isolamento per-DB + identità) sono in D‑01a (§4.4). L'isolamento è **by-file** (un DB per campagna), niente `campaignId` sulle righe.

## 4. Data model (`@loomn/shared`)

Tutti gli schemi vivono in `packages/shared/src/domain-schema.ts`, accanto a `actorSchema`/`questSchema`. `shared` resta **foglia** (solo `zod`); l'allineamento con l'engine è tenuto dai drift-guard esistenti (§9).

### 4.1 `CampaignSeed` (input del seeding)

```
CampaignSeed {
  id: string                      // identità: chiave del DB-per-campagna (userData/campaigns/<id>/)
  name: string                    // nome leggibile della campagna
  premise: string                 // logline: il cuore della campagna
  setting: {
    place: string                 // dove
    era: string                   // quando
    genres: string[]              // generi/atmosfera
    worldRules?: string           // come funziona il mondo (magia/tech/...), opz.
  }
  tone: string                    // registro narrativo
  contentGuidance?: string        // limiti/safety (lines & veils), opz.
  openingScene: string            // l'ancora narrativa del turno 0
  hooks: string[]                 // spinte/obiettivi iniziali
  keyNpcs:   SeedNpc[]            // → diventano ATTORI nel motore (via logica AddActor)
  keyPlaces: SeedPlace[]         // → fatti CANON (no topologia in D-01a)
  initialFacts: SeedFact[]       // fatti CANON su mondo/relazioni
}
SeedNpc   { id: string, name: string, description: string,
            attributes?: Record<string,number>, skills?: Record<string,number>,
            resources?: Record<string, ResourcePool> }
            // stat omessi → auto-fill dai default del Ruleset (come spawn_npc, G3/G4)
SeedPlace { id: string, name: string, description: string }
SeedFact  { subject: string, predicate: string, object: string }  // 1:1 sul Canon Ledger
```

### 4.2 `CampaignFrame` (stato narrativo event-sourced)

```
CampaignFrame {
  id: string
  name: string
  premise: string
  setting: { place, era, genres: string[], worldRules? }
  tone: string
  contentGuidance?: string
  openingScene: string
  hooks: string[]
}
```

`CampaignFrame` = il sottoinsieme **narrativo** di `CampaignSeed` (senza `keyNpcs`/`keyPlaces`/`initialFacts`, che diventano attori/canon). È ciò che finisce in `GameState.campaignFrame` e nel contesto del Master.

### 4.3 Convenzione debt-free (CRITICA)

- `campaignSeedSchema`/`campaignFrameSchema` sono **permissivi** (read/event path): nessun bound su stringhe/array. Usati da `CampaignFramed` (evento) e da `gameStateSchema.campaignFrame` → **mai restringere** (parsano dati storici a ogni replay/load). Modello: `questSchema` (`domain-schema.ts:194`), con `.transform()` per i campi opzionali sotto `exactOptionalPropertyTypes`.
- I **bound** (lunghezze, `.min(1)` sugli array, ecc.) vanno **solo** su `seedCampaignCommandSchema` (difesa-in-profondità al confine IPC), mai sul read path. Modello: split `dieGroupSchema`/`dieGroupCommandSchema` (`domain-schema.ts:23` vs `:38`).

### 4.4 Fondamenta multi-campagna (decise ora; gestione in D‑03, additiva)

- **Isolamento = un DB per campagna**, layout `userData/campaigns/<id>/loomn.db`. È il modello più pulito per event-sourcing + zero-debt: isolamento totale **by-file**, nessun filtro `campaignId` su ogni query (che, se dimenticato, farebbe leakare tra campagne). `createMemorySystem(dbPath)` è **già** il seam — multi-campagna = scegliere il path. *(Alternativa scartata: un DB con `campaignId` su ogni riga — più invasiva e fragile.)*
- **Identità** `id`+`name` nel frame (event-sourced) → la campagna "conosce" il proprio nome (Master/UI lo usano) e l'`id` è anche la chiave del path. `createdAt`/`lastPlayed` sono metadati di **registro** (D‑03), **non** del frame (la purezza engine evita `Date.now`).
- **D‑01a** stabilisce il layout e apre la **campagna attiva** (id `default` finché non c'è il registro), con un piccolo cambio al wiring del `main` (`createMemorySystem(campaignDbPath(userData, id))`). **D‑03** aggiunge il registro (lista/crea/seleziona/switch/elimina) + UX — **puramente additivo**: niente da ritrattare, perché le fondamenta (per-DB + identità) sono qui. Il single-instance lock per-userData (I‑11) resta valido (una sola istanza app; cambiare campagna = swappare il service).

## 5. Engine (`@loomn/engine`)

### 5.1 `GameState.campaignFrame`

`packages/engine/src/events.ts:27` — aggiungere il campo **opzionale**:
```ts
export interface GameState {
  version: number;
  actors: Record<string, Actor>;
  encounter: Encounter | null;
  quests: Record<string, Quest>;
  phase: Phase;
  campaignFrame?: CampaignFrame;   // settato una volta da CampaignFramed; undefined prima del seeding
}
```
`initialState` (`events.ts:35`) non cambia (il campo opzionale è implicitamente `undefined`). **Precedente che lo legittima:** il motore porta già contenuto narrativo nello stato — i `Quest` hanno `title`/`description`, le `NarrationRecorded` portano prosa. `campaignFrame` segue lo stesso precedente.

### 5.2 Evento `CampaignFramed`

`packages/engine/src/events.ts:11` — nuova arm:
```ts
| { type: 'CampaignFramed'; frame: CampaignFrame }
```
`applyEvent` (`events.ts:56`) — nuova `case` (immutabile, come `ActorAdded`):
```ts
case 'CampaignFramed':
  return { ...bumped, campaignFrame: event.frame };
```
La guard di esaustività (`events.ts:110`) **costringe** ad aggiungere la case.

### 5.3 Command `SeedCampaign`

`packages/engine/src/commands.ts:21` — nuova arm nell'union `Command`:
```ts
| { type: 'SeedCampaign'; seed: CampaignSeed }
```
`COMMAND_TYPES` (`commands.ts:71`) — aggiungere `'SeedCampaign'` (le guard bidirezionali `commands.ts:89-92` lo esigono).

`decide(SeedCampaign)` (in `commands.ts`, dove vive `requireMember` privato):
1. **Once-guard:** se `state.campaignFrame !== undefined` → `throw new Error('Campagna già seminata')` (pattern di `AddActor`/`StartQuest`, `commands.ts:102`/`:246`).
2. Per ogni `keyNpc`: **riusa la logica `AddActor`** (validazione vocabolario via `requireMember` su `attributes`/`skills`/`resources`; merge `defaultResources` + `clampPool`; guard id duplicato) → un evento `ActorAdded`. Estrarre la logica `AddActor` in un helper interno condiviso (`commands.ts:101-116`) per evitare duplicazione.
3. Emette la sequenza: `[{ type: 'CampaignFramed', frame }, ...ActorAdded per ogni keyNpc]`. (Multi-evento come `StartEncounter`, `commands.ts:127`.)
4. **Fase:** phase-agnostico (non in `COMBAT_ONLY`/`NON_COMBAT_ONLY`); il once-guard è la barriera vera. *(Opzionale: aggiungerlo a `NON_COMBAT_ONLY` per vietare il seeding in combat; il once-guard basta comunque.)*

I `keyPlaces` e gli `initialFacts` **non** generano eventi engine: diventano canon nel host (§7).

### 5.4 `CampaignSeed`/`CampaignFrame` come tipi engine

Il motore ha bisogno dei tipi `CampaignSeed`/`CampaignFrame` (per `Command`/`DomainEvent`). Definirli in `engine` (es. `packages/engine/src/campaign.ts`) come interfacce pure; `shared` li **rispecchia** con gli schemi Zod (foglia, drift-guard struct in `sqlite-event-store.ts:107-118` li allinea).

## 6. Shared schema (`@loomn/shared`)

`packages/shared/src/domain-schema.ts`:
- `campaignFrameSchema` (permissivo, con `.transform()` per `worldRules?`/`contentGuidance?`), `campaignSeedSchema` (permissivo, include `keyNpcs`/`keyPlaces`/`initialFacts`).
- **Evento:** arm `CampaignFramed` in `domainEventSchema`. Se ha solo campi non-opzionali al top → dentro il `discriminatedUnion` con `.strict()`. `frame` è un oggetto annidato (i suoi opzionali interni sono ok). (Se servisse un `.transform()` al top, va appeso al `z.union` esterno come `checkResolvedEventSchema`, `domain-schema.ts:233`.)
- **Command:** `seedCampaignCommandSchema` (con i **bound**) come nuova arm di `commandSchema` (`domain-schema.ts:375`).
- **`gameStateSchema`** (`:272`): aggiungere `campaignFrame: campaignFrameSchema.optional()` (sicuro: nessun `.strict()`, vecchi snapshot parsano).

## 7. Memory + canon seeding (`@loomn/memory` / `@loomn/host`)

I `keyPlaces` e gli `initialFacts` diventano fatti canon via `CanonLedger.record` (`canon-ledger.ts:96`):
- **Mappatura:** `SeedFact{subject,predicate,object}` → 1:1. `SeedPlace{id,name,description}` → un fatto (es. `subject=place.id, predicate='descrizione', object=description`), eventualmente un fatto `nome`.
- **Id deterministici:** `seed-<i>` (distinti dai `f-<from>-<to>-<i>` della Reflection, `reflection.ts:107`).
- **`eventSeq`:** la seq dell'evento `CampaignFramed` (provenienza = la framing). Ottenuta dall'append dei seed-events.
- **Idempotenza:** garantita a monte dal **once-guard nel motore** (`decide(SeedCampaign)` rifiuta se `campaignFrame` già settato) → se si ri-semina, `decide` lancia **prima** di scrivere canon, niente id duplicati. Vale anche dopo riavvio (lo stato in-memory è ricostruito da replay → `campaignFrame` settato).

## 8. Context Assembler — blocco "campaign frame"

`packages/memory/src/context-assembler.ts`: il port `assembleContext: (state: GameState) => string` riceve già lo `GameState` completo, e il host inietta l'impl reale in `runMasterTurn` (`master-turn.ts:111`). Aggiungere un helper dedicato `renderCampaignFrame(frame)` che produce un blocco **never-cut**, **anteposto** al blocco L1 nel join finale (`context-assembler.ts:151`) — separazione netta e testabile, invece di annidarlo in `renderL1`. Il frame eredita la garanzia "mai tagliato" e fluisce in `messages[1]` (il system message di contesto). Quando `campaignFrame === undefined` (pre-seed), `renderCampaignFrame` ritorna stringa vuota e il `filter(b => b.length > 0)` esistente lo esclude (nessuna regressione).

## 9. Host — `seedCampaign` + narrazione d'apertura

`packages/host/src/campaign-service.ts`, nuovo metodo `seedCampaign(seed)` **accodato** (`enqueue`, `:150`):
1. **Atomico** in `memory.runInTransaction` (sync, `memory-system.ts:81`): `decide(state, {type:'SeedCampaign', seed}, rng, ruleset)` → `eventStore.append(events, state.version)` → applica gli eventi allo stato in-memory → registra i fatti canon (`ledger.record` per ogni `SeedPlace`/`SeedFact`, id `seed-<i>`, `eventSeq` = seq di `CampaignFramed`). *(La narrazione, essendo async/LLM, NON entra nella tx.)*
2. **Narrazione d'apertura (best-effort, dopo la tx, stesso `enqueue`):** se il provider è configurato (`canRunTurn`), invoca il path di `runTurn` con un `playerAction` sentinella (es. `'(apertura)'`): `runMasterTurn` legge `campaignFrame` + canon/attori seminati e narra la scena iniziale → `NarrationRecorded` (il fallback I‑04, `master-turn.ts:167`, garantisce narrazione non-vuota). Se il provider manca → seed comunque riuscito, l'apertura slitta al primo turno reale (graceful).
3. Ritorna un esito `{ readModel, narration? }`.

`devCampaignSeed` — nuovo `packages/host/src/dev-campaign-seed.ts` (come `dev-vocabulary.ts:1`), re-export da `host/src/index.ts`. Una campagna d'esempio concreta (premessa + setting + 1-2 PNG + 1-2 luoghi + qualche fatto) per provare il flusso end‑to‑end senza AI/UX.

## 10. Error handling

- `decide(SeedCampaign)` lancia su: campagna già seminata, id PNG duplicato, attributo/abilità/risorsa PNG fuori vocabolario (`requireMember`, messaggi con la lista dei validi). Gli errori risalgono come `{ok:false,error}` al confine IPC (handler `dispatch` esistente, `main/index.ts:77`) — `seedCampaign` segue lo stesso contratto.
- La tx di seeding è atomica: un fallimento (append/concorrenza/canon) rolla-back tutto.
- La narrazione d'apertura è best-effort: un suo fallimento **non** annulla il seed (loggato, l'apertura slitta).

## 11. Testing (TDD, ABI Node)

- **Engine:** `decide(SeedCampaign)` — emette `[CampaignFramed, ActorAdded…]`; once-guard; validazione vocabolario PNG; auto-fill `defaultResources`+`clampPool`; `applyEvent(CampaignFramed)` setta `campaignFrame`; replay deterministico. Drift-guard (engine `COMMAND_TYPES`/union, `DomainEvent` esaustività).
- **Shared/host:** drift-guard `Command`↔`commandSchema` (`command-schema.test.ts:18`), `DomainEvent`/`GameState`↔schemi (`sqlite-event-store.ts:107`); `seedCampaignCommandSchema` accetta/rifiuta ai bound; `gameStateSchema` parsa snapshot **senza** `campaignFrame` (regressione debt-free).
- **Memory:** blocco campaign-frame nel contesto (presente con `campaignFrame`, assente senza); canon seminato con id/seq attesi.
- **Host:** `seedCampaign` atomico (seed + canon); once-guard end-to-end; narrazione d'apertura con **fake model** (no rete); `seedCampaign` senza provider → seed ok, niente narrazione.
- **Gate Electron 2 fasi:** la narrazione d'apertura è **LLM-backed** → **non** nel self-test (come `reflect`, escluso in 10e). D‑01a è engine/shared/memory/host: **non tocca di per sé** `renderer.ts`. **Se** il piano decide di estendere il self-test per seminare `devCampaignSeed` e verificare lo stato/canon/`campaignFrame` post-seed (parte deterministica, senza la narrazione), allora la **versione persistita attesa cambierà** (il seed aggiunge `CampaignFramed`+N×`ActorAdded`): in quel caso va ricalcolata nel piano e motivata al gate. Altrimenti il self-test resta invariato (versione 8) e la copertura del seeding vive negli unit test ABI Node.

## 12. Drift-guard checklist (aggiungere insieme, o il typecheck rompe)

1. `engine`: `Command` union + `COMMAND_TYPES` (`'SeedCampaign'`) + `case` in `decide`; `DomainEvent` (`CampaignFramed`) + `case` in `applyEvent`; `GameState.campaignFrame?`; tipi `CampaignSeed`/`CampaignFrame`.
2. `shared`: `campaignSeedSchema`/`campaignFrameSchema`; arm `CampaignFramed` in `domainEventSchema`; `seedCampaignCommandSchema` in `commandSchema`; `gameStateSchema.campaignFrame`.
3. `memory`: il struct drift-guard `sqlite-event-store.ts:107-118` si soddisfa da sé una volta allineati 1+2.
4. `host`: test del drift-guard Command + nuovo test `seedCampaign`.

## 13. Foresight (slice future — fuori da D‑01a, ma il design le abilita)

- **D‑01b (AI‑da‑brief):** `createStructuredOutput(model).generate({ messages, schema: campaignSeedSchema, schemaName: 'campaign_seed' })` (`structured-output.ts:56`) genera un `CampaignSeed` validato da un brief; l'utente lo blocca → `seedCampaign(seed)`. Lo stesso `campaignSeedSchema` è già il gate.
- **D‑01c (UX):** la route onboarding chiama `seedCampaign` via IPC (un nuovo canale `seed-campaign` con `seedCampaignCommandSchema`, oppure `dispatch(SeedCampaign)` se basta) + mostra la narrazione d'apertura.
- **D‑01d / Piano 11:** un modulo curato è una sorgente di `CampaignSeed` (stesso schema), importabile.

## 14. Fuori ambito (esplicito)

Generazione AI del seed (D‑01b), UX onboarding (D‑01c), moduli (D‑01d/Piano 11), zone con topologia/movimento (i luoghi sono solo canon), la **gestione** multi-campagna (registro/selezione/switch/elimina + UX → D‑03; ma le fondamenta — isolamento per-DB + identità — sono in D‑01a, §4.4), un flag "turno d'apertura" su `NarrationRecorded` (l'apertura è inferibile dal `playerAction` sentinella; se la UI lo richiede, è un follow-up).
