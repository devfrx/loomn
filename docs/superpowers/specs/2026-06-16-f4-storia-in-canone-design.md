# F4 — La storia entra in canone (design)

> **Data:** 2026-06-16 · **Stato:** design approvato (brainstorming), in attesa di `writing-plans` ·
> **Relazione con lo spec:** raffina `2026-06-15-simulatore-campagne-ai-design.md` §5.4 (AI Master),
> §6.1 (Reflection) e §6 (memoria deriva dallo stream). Origine: finding **F4** della Traccia B
> (`docs/superpowers/findings-slice-llm.md`), ri-confermato dalla ri-validazione post-G1.

## 1. Problema

Per un simulatore **narrativo**, la memoria di lungo periodo deve ricordare la **storia**
(relazioni, segreti, moventi, luoghi, alleanze), non solo le statistiche meccaniche. Oggi non
succede:

- `runTurn` (`packages/host/src/campaign-service.ts`) produce `narration` e la **restituisce al
  chiamante, ma non la persiste**. La prosa è effimera.
- `reflect(scope)` carica `eventStore.load()` — **solo i `DomainEvent` meccanici** — e li passa a
  `runReflection`, il cui `ReflectionInput` (`packages/memory/src/reflection.ts`) **non ha nemmeno
  un campo per la narrazione**.

Risultato osservato (slice con LLM reale, due run): la Reflection produce fatti L1.5 e riassunti L2
**tutti meccanici** ("X aggiunto", "Eldra ha attaccato Krix"); l'affare losco di Krix, Krix che
serve il **Barone Vhalmar di Pietranera**, la supplica — **niente** entra in canone. La memoria
ricorda le statistiche e dimentica la storia.

## 2. Il vincolo che vincola le opzioni

Lo spec §6 (righe 169-170) e §6.3 sono un vincolo **duro**:

> "tutti i livelli **derivano dallo stream di eventi**; non sono un sistema parallelo da
> sincronizzare → niente debito di sync." · "L1/L1.5/L2 rigenerabili dagli eventi… migrazioni di
> memoria = rebuild dallo stream."

Conseguenza: **perché la storia entri in canone, deve prima entrare nello stream come Evento.**
Passare la stringa di narrazione in-memory alla Reflection (versione ingenua dell'opzione "dai la
narrazione alla Reflection") **violerebbe** l'invariante: un rebuild futuro non avrebbe la
narrazione → canone non ricostruibile → stato orfano. Lo spec §5.4 (righe 147-148) lo conferma in
positivo: *"Fatti narrativi canonici generati dall'AI… passano anch'essi da Command→Event → diventano
canone replayabile."*

## 3. Approccio scelto: A′ — Narrazione come Evento, la Reflection la spoglia

Il turno appende la narrazione nello stream come evento di prima classe; la Reflection (già il
percorso di scrittura §6.1) la riceve **insieme** agli eventi meccanici e ne estrae fatti narrativi
(L1.5) e un riassunto narrativo (L2).

### Alternative considerate (per il record)

- **B — Tool/Command `record_fact`:** il Master promuove i fatti **in-turn** via un nuovo tool →
  `FactRecorded` → L1.5. *Scartata come partenza:* mette il pezzo difficile nell'hot path dove il
  modello è meno affidabile (i findings: inventa identificatori, stringifica argomenti); non risolve
  il riassunto L2; cambia di più come si popola il Canon Ledger.
- **C — Entrambi (A′ + record_fact):** il più completo ma over-scope per un F4 focalizzato.
  Evoluzione futura possibile: `record_fact` aggiungerebbe un evento `FactRecorded` **ortogonale** a
  `NarrationRecorded`, quindi A′ non chiude la porta a C.

A′ è la scelta perché: (1) il Master in-turn resta semplice — nessun nuovo fallimento dove il
modello è debole; (2) cattura la prosa **verbatim** (L2 finalmente narrativo); (3) l'estrazione
prosa→fatti è un compito **async e controllabile** (constrained decoding / modello più forte / retry),
non nell'hot path; (4) risolve **F4 + F3 + L2-meccanico** insieme; (5) è la Reflection §6.1 che
finalmente fa il suo mestiere, alimentata dalla prosa.

## 4. Decisione architetturale: `NarrationRecorded` come `DomainEvent`

`NarrationRecorded` diventa una **variante di `DomainEvent`** nel motore
(`packages/engine/src/events.ts`), con `applyEvent` che la tratta come **no-op di stato** (solo
`version++`, esattamente come `AttackResolved`).

- **Perché nel motore e non in un log separato:** `applyEvent`/`replay`/`rebuild` e l'event store
  operano tutti su `DomainEvent`; un tipo esterno romperebbe il rebuild o richiederebbe una
  proiezione parallela — il "sistema parallelo da sincronizzare" che lo spec vieta. Lo stream è per
  spec la *unica verità della campagna* (non solo dello stato meccanico): "cosa ha narrato il Master"
  è verità della campagna → stesso stream, rebuild-safe. Il motore è la casa **coerente**.
- **È l'unico evento non prodotto da `decide`:** registra l'output dell'AI (nessun RNG né
  validazione meccanica), lo costruisce `runTurn`. È coerente con il pattern esistente degli eventi
  informativi (`AttackResolved` è già un no-op di stato). Replay resta **deterministico**: il testo è
  persistito e rigiocato verbatim.
- **Forma:** `{ type: 'NarrationRecorded'; playerAction: string; narration: string }` — cattura
  l'intero scambio narrativo del turno (azione del giocatore + narrazione del Master), l'unità che la
  Reflection vuole. Granularità più fine (eventi separati player/master) è YAGNI e resta un'aggiunta
  additiva se mai servisse.

## 5. Flusso dati (prima → dopo)

**Prima:** `runTurn` → `narration` restituita e persa. `reflect` → solo eventi meccanici.

**Dopo (A′):**

```
runTurn(playerAction):
  result = runMasterTurn(...)            # result.events (meccanici); result.state (= pre-turno + result.events); result.narration
  toStore = [...result.events]
  nextState = result.state               # gia include result.events applicati
  if result.narration != "":
     nEvent = { type:'NarrationRecorded', playerAction, narration: result.narration }
     toStore.push(nEvent)                # la prosa entra nello stream
     nextState = applyEvent(nextState, nEvent)   # NarrationRecorded => solo version++
  if toStore.length > 0:
     eventStore.append(toStore, startVersion)    # mecc. + narrazione, contro startVersion
     state = nextState
  return { narration, events: result.events, ... }   # TurnOutcome.events resta MECCANICA

reflect(scope):
  stored = eventStore.load()            # ora contiene anche i NarrationRecorded
  runReflection(reflectionDepsFor(...), { events: stored, scope })
    -> renderEventsForReflection rende i NarrationRecorded come PROSA
    -> FactExtractor estrae fatti NARRATIVI -> L1.5
    -> Summarizer produce un riassunto NARRATIVO -> L2
```

**Punto cruciale:** anche i turni di **puro dialogo** (zero eventi meccanici — es. la conversazione
con Krix) ora producono un `NarrationRecorded` → lasciano traccia. È esattamente il caso che oggi
sparisce.

`TurnOutcome.events` restituita al chiamante resta la lista **meccanica** (`result.events`): il
`NarrationRecorded` è un dettaglio di persistenza dello stream, non un esito meccanico del turno. La
`version` del read model riflette comunque il bump (lo stream è cresciuto davvero).

## 6. Modifiche per pacchetto (focalizzate)

- **`@loomn/engine` — `events.ts`:** +variante `NarrationRecorded { playerAction, narration }` in
  `DomainEvent`; +`case 'NarrationRecorded': return bumped;` in `applyEvent` (no-op di stato).
- **`@loomn/shared` — `domain-schema.ts`:** +variante `NarrationRecorded` nel `domainEventSchema`
  (validazione in lettura, confine di persistenza). Aggiornare i 2 drift-guard a compile-time in
  `packages/memory/src/sqlite-event-store.ts` se scattano (è il loro scopo: tenere schema↔tipi
  allineati).
- **`@loomn/host`:**
  - `campaign-service.ts` — `runTurn` appende `NarrationRecorded` quando `narration` ≠ vuota
    (append unico nella coda FIFO; `applyEvent` per aggiornare lo stato locale). `applyEvent` è già
    importato.
  - `reflection-ports.ts` — `renderEventsForReflection` formatta i `NarrationRecorded` come prosa
    leggibile (azione + narrazione), gli eventi meccanici come prima; `EXTRACT_SYSTEM` raffinato:
    estrai fatti **narrativi** (relazioni/segreti/luoghi/alleanze/promesse) ed **escludi le
    statistiche meccaniche già in L1** (chiude anche **F3**); `SUMMARIZE_SYSTEM` invariato o lieve
    ritocco (ora ha prosa vera da riassumere).
- **Nessuna modifica** a `commandSchema` (`NarrationRecorded` non è un Command), a `app/desktop`,
  alla UI, né alle migrazioni DB (gli eventi sono JSON: un nuovo `type` è additivo → zero migrazione;
  gli stream esistenti senza `NarrationRecorded` continuano a fare rebuild).

## 7. Scope / fuori ambito

**Dentro F4:** la narrazione entra nello stream + la Reflection la consuma + i prompt di estrazione
diventano narrativi (incl. la chiusura di F3 a livello di prompt).

**Fuori ambito (follow-up noti, invariati):**

- Qualità fine dell'estrazione su modelli deboli oltre il prompt — **F3/G5** (constrained decoding /
  modello più forte per la Reflection): asse ortogonale, dietro lo stesso seam.
- Segmentazione `reflect` per scena (oggi `reflect` riflette l'intero stream come una scena; la
  seconda `reflect` sullo stesso range collide sugli id deterministici).
- `record_fact` esplicito (Approccio B; eventuale evoluzione C).
- **G6** (coercizione degli argomenti **array** stringificati — `participants`/`facts`).
- Nuovi `Command`/`Event` engine (`request_check`/`apply_effect`/`advance_quest` + contesto quest) e
  la **FSM di fase** (spec §5.5): piano separato.

## 8. Strategia di test (TDD)

- **engine:** `applyEvent(NarrationRecorded)` → `version++` senza toccare `actors`/`encounter`;
  `replay`/`rebuild` deterministici con `NarrationRecorded` nello stream (golden/round-trip).
- **shared:** `domainEventSchema` valida/round-trip della variante `NarrationRecorded`.
- **host:**
  - `runTurn` appende `NarrationRecorded` **se e solo se** `narration` ≠ vuota; caso **puro
    dialogo** (0 eventi meccanici → 1 `NarrationRecorded`, version++); caso narrazione vuota → nessun
    evento aggiunto.
  - `renderEventsForReflection` rende i `NarrationRecorded` come prosa (azione + narrazione) e gli
    eventi meccanici come prima.
  - **Test comportamentale chiave:** un `NarrationRecorded` nello stream **raggiunge il
    `FactExtractor` come prosa** (fake extractor che cattura il proprio input → asserzione non-vacua),
    e il fatto narrativo che ne estrae finisce in L1.5; wiring `runTurn`→`reflect` end-to-end su
    `createMemorySystem(':memory:')` con fake al seam model/port.

Tutto su **ABI Node** (niente Electron/rete reale): `createMemorySystem(':memory:')` + fake
`LanguageModel`/`StructuredOutputPort`, come gli altri test di `@loomn/host`.

## 9. Rischi e debiti (onesti)

- **Qualità dell'estrazione (non un debito di A′):** A′ rende l'architettura corretta e migliora già
  la qualità (L2 narrativo, F3 nel prompt), ma i fatti estratti dipendono ancora dall'LLM. È un
  **confine pulito dietro lo stesso seam** (la Reflection), non un debito nascosto: migliorarla
  (constrained decoding / modello) non richiederà rilavorare l'architettura.
- **Prosa nello stream:** scelta deliberata e spec-allineata (§6); l'alternativa (log separato)
  introdurrebbe il debito di sync che lo spec vieta. A′ è la più debt-free.

## 10. Esito atteso

Dopo una scena narrata (es. l'incontro con Krix), `reflect` produce in L1.5 fatti **narrativi**
(es. *Krix serve il Barone Vhalmar di Pietranera*) e in L2 un riassunto **della storia**, e il
Context Assembler li ripresenta al turno successivo. La memoria smette di dimenticare la storia.
