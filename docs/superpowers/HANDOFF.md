# Loomn — Handoff per il prossimo agente

> **Data:** 2026-06-15 · **Branch:** `main` · **HEAD al momento del handoff:** `8004418` (il commit di questo file sarà successivo) · **Stato:** engine completo, 98 test verdi, tree pulito.
>
> Questo documento ti permette di riprendere **esattamente** da dove siamo. Leggilo tutto prima di agire. La memoria di progetto è in `.claude/.../memory/loomn-project.md` e `loomn-working-style.md` (caricata a inizio sessione).

---

## 0. TL;DR — cosa fare adesso

L'engine deterministico è **finito** (Piani 1-5, tutti mergiati in `main`). Il prossimo passo è **scrivere ed eseguire il Piano 6 — Persistenza** (pacchetto `memory`: SQLite + Drizzle che implementa la porta `EventStore` del Piano 5). I Piani 1-5 sono documenti già scritti; **il Piano 6 NON è ancora stato scritto.**

Il flusso da seguire è sempre lo stesso (vedi §4): `writing-plans` → commit doc su main → branch → `subagent-driven-development` (implementer + 2 review per task) → `finishing-a-development-branch` (merge locale) → aggiorna memoria.

L'utente scrive tipicamente **"scrivi il Piano N"** e poi sceglie **"subagent-driven"** per l'esecuzione. Procedi in autonomia fino al merge, senza fermarti tra i task.

---

## 1. Il progetto

**Loomn** = app desktop (**Electron + Vue 3**) per **campagne interattive di qualsiasi genere** con un **Master AI**, girabile sia **in locale (LM Studio)** sia via **API cloud** (client OpenAI-compatibile + adattatori Anthropic/Gemini).

**Principio guida (sacro):** *il codice è l'arbitro, l'AI è il narratore.* Regole/tiri/HP deterministici in codice; l'AI **propone Command tipizzati** e **narra** gli esiti reali, non decide mai i numeri né muta lo stato direttamente.

**Architettura:** esagonale + DDD; **Event Sourcing solo nel contesto Campaign/World**; memoria a strati L1/L1.5(canon ledger)/L2/L3(RAG, Fase 2); monorepo pnpm. Vedi lo **spec completo** (autorità): `docs/superpowers/specs/2026-06-15-simulatore-campagne-ai-design.md`.

Decisioni di prodotto fissate: single + multiplayer con Master AI; motore **generico universale** + moduli a tema (no sistemi su licenza); tiro = **espressione di dadi componibile** + **gradi di successo**; pannello **dadi 3D deterministico**; combattimento **a zone**; authoring moduli via **editor visuale** (AI-authoring **escluso**). Nome **Loomn** (verificato, niente conflitti nel settore).

---

## 2. Documenti chiave (in-repo)

- **Spec (autorità del design):** `docs/superpowers/specs/2026-06-15-simulatore-campagne-ai-design.md`
- **Piani (tutti in `docs/superpowers/plans/`):**
  - `2026-06-15-loomn-fase1-piano1-fondamenta-engine.md` ✅ fatto
  - `2026-06-15-loomn-fase1-piano2-modello-dominio.md` ✅ fatto
  - `2026-06-15-loomn-fase1-piano3-inventario-progressione.md` ✅ fatto
  - `2026-06-15-loomn-fase1-piano4-combattimento-zone.md` ✅ fatto
  - `2026-06-15-loomn-fase1-piano5-event-sourcing.md` ✅ fatto
  - **Piano 6 → da scrivere.**
- **Memoria:** `C:\Users\zagor\.claude\projects\C--Users-zagor-Desktop-tabl\memory\` (`loomn-project.md`, `loomn-working-style.md`, indice in `MEMORY.md`).

Ogni piano ha in fondo una **roadmap aggiornata** e una sezione **self-review**.

---

## 3. Stato dell'engine (`packages/engine`) — cosa esiste già

Monorepo **pnpm workspaces** (`pnpm-workspace.yaml` globba `packages/*` e `app/*`). Solo `packages/engine` esiste finora. TS strict (`tsconfig.base.json`): `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`. Test: Vitest (config root `vitest.config.ts`, include `packages/**/*.test.ts`). **98 test verdi.**

`packages/engine/src/index.ts` ri-esporta **15 moduli**, in quest'ordine. Export pubblici per modulo:

| Modulo | Export principali |
|---|---|
| `random.ts` | `RandomSource` (porta), `createSeededRandom(seed)` — mulberry32 |
| `dice.ts` | `RollMode`('check'\|'effect'), `DieGroup{count,sides,tag?}`, `Modifier{value,source}`, `RollExpr{dice,modifiers,mode}`, `DieResult{sides,value,tag?}`, `RollResult{dice,modifierTotal,total,mode}`, `rollExpression(expr,rng)` |
| `check.ts` | `Outcome`('critical'\|'success'\|'success_at_cost'\|'failure'\|'disaster'), `CheckResult` (RollResult + `dc,margin,outcome`), `outcomeFromMargin(margin)`, `resolveCheck(expr,dc,rng)` |
| `actor.ts` | `ActorKind`('pc'\|'npc'), `ResourcePool{current,max}`, `ConditionEffect`(checkModifier\|resourcePerTurn), `Duration`(turns\|scenes\|permanent), `Condition{key,source,effects,duration}`, `ItemEffect`(contributeDice\|checkModifier\|defenseModifier), `Item{id,name,equipped,effects}`, `Progression{xp,level}`, `Actor{id,name,kind,attributes,skills,resources,conditions,items,progression}`, `getAttribute`, `getSkill` |
| `resource.ts` | `adjustResource(actor,resource,delta)` (clamp [0,max], throw se risorsa ignota), `isDepleted(actor,resource)` |
| `condition.ts` | `addCondition`, `checkModifierFrom(conditions,target?)`, `tickConditions(actor)` |
| `actor-check.ts` | `CheckRequest{actor,attribute?,skill?,baseDice?,situationalModifiers?,includeEquipped?,dc}`, `buildCheckExpr(req)`, `actorCheck(req,rng)` |
| `item.ts` | `addItem`, `removeItem`, `setEquipped`, `equippedItems`, `collectItemDice(items,mode)`, `collectItemCheckModifier(items,target?)`, `defenseValue(actor,defense,base)` |
| `progression.ts` | `awardXp(actor,amount)`, `levelFor(xp,thresholds)`, `applyProgression(actor,thresholds)`, `advanceMilestone(actor)` |
| `zone.ts` | `ZoneMap`(Record<string,string[]>), `RangeBand`('engaged'\|'near'\|'far'), `areAdjacent(map,a,b)`, `zoneDistance(map,from,to)` (BFS), `rangeBand(distance)` |
| `encounter.ts` | `Participant{actorId,zone,initiative,actedThisRound}`, `Encounter{id,participants,round,turnIndex}`, `ParticipantInput`, `createEncounter(id,participants)`, `rangeBetween(enc,map,a,b)`, `currentParticipant(enc)`, `endTurn(enc)`, `roundComplete(enc)`, `nextRound(enc)`, `moveParticipant(enc,map,actorId,toZone)` |
| `combat.ts` | `AttackInput`, `AttackResult{check,hit,damage,target,downed}`, `performAttack(input,rng)` |
| `events.ts` | `DomainEvent` (7 varianti: ActorAdded, EncounterStarted, TurnEnded, RoundAdvanced, AttackResolved, DamageApplied, ActorDowned), `GameState{version,actors,encounter}`, `initialState`, `applyEvent(state,event)` (reducer puro, version++ ogni evento), `replay(events)` |
| `commands.ts` | `Command` (5 varianti: AddActor, StartEncounter, EndTurn, NextRound, Attack), `decide(state,command,rng)` |
| `event-store.ts` | `StoredEvent{seq,event}`, `ConcurrencyError`(class, `readonly expected/actual`), `EventStore`(porta: `version()`/`append(events,expectedVersion)`/`load()`), `createInMemoryEventStore()`, `Snapshot{state,version}`, `takeSnapshot(state)`, `rebuild(stored,snapshot?)` |

**Grafo dipendenze (aciclico):** `random` ← `dice` ← `check`; `actor` → `dice`(type); `resource`/`condition`/`actor-check`/`item`/`progression` → `actor`(+ dice/check); `zone` (foglia) ← `encounter`; `combat` → actor/dice/check/actor-check/resource/condition/item; `events` → actor/check/resource/condition/encounter; `commands` → events + encounter/combat/dice; `event-store` → events. **Nessun ciclo. Niente importa `events`/`commands`/`event-store`/`encounter`/`combat` (a parte il barrel).**

**La proprietà ES centrale (NON romperla):** `decide` consuma l'RNG e registra i **fatti risolti** negli eventi; `applyEvent` **rigioca senza RNG** → replay deterministico. `decide(Attack)` esegue `performAttack` ma usa solo i fatti (`check/hit/damage/downed`), **scartando** il `target` mutato; lo stato cambia solo via `applyEvent`.

---

## 4. Il processo di sviluppo (replicalo identico)

Workflow superpowers, una skill per fase:

1. **Scrivi il piano** — skill `superpowers:writing-plans`. Decomponi in ~4 task bite-sized TDD; ogni task elenca i file esatti, codice completo (no placeholder), comandi con output atteso, e un commit. Includi: riferimenti allo spec, "fuori ambito" esplicito, **disciplina di scope** in ogni task, self-review, roadmap, execution handoff. **Conteggi test attesi** per task (cumulativi). Salva in `docs/superpowers/plans/AAAA-MM-GG-...md`.
2. **Verifica il piano**: grep anti-bug-apostrofo (vedi §5), poi committa il doc su `main` (commit `docs: ...` con la riga Co-Authored-By).
3. **Chiedi all'utente** come eseguire (di solito "subagent-driven").
4. **Esegui subagent-driven** — skill `superpowers:subagent-driven-development`:
   - Crea un **branch dedicato** `feat/fase1-pianoN-...` (MAI implementare su main).
   - Per **ogni task**, in sequenza:
     - **Implementer** (`Agent`, model **sonnet**): incolla il **testo completo** del task + contesto + **istruzioni di disciplina di scope**. Non far leggere il file di piano al subagent.
     - **Spec review** (`Agent`, sonnet): "non fidarti del report, verifica leggendo i file e rieseguendo test/typecheck". Deve dire ✅/❌.
     - **Code-quality review** (`Agent`, sonnet) — *solo dopo* spec ✅. Per i task senza logica (scaffold/solo tipi) la salto e lo dico.
     - **Hardening selettivo** (vedi §5): accogli SOLO rami reali; uno o due test/doc extra via un piccolo Agent "test-only".
   - **Final review** dell'intero branch (`Agent`, model **opus**), con BASE=punto di branch e HEAD=ultimo commit.
   - **finishing-a-development-branch** — skill `superpowers:finishing-a-development-branch`: presenta le 4 opzioni; l'utente sceglie sempre **"Merge in main (locale)"** → `git checkout main && git merge <branch>` (fast-forward) → `pnpm test` (verifica) → `git branch -d <branch>`.
   - **Aggiorna la memoria** (`loomn-project.md`): segna il piano fatto, conteggio test, prossimo passo.

**Model selection:** implementer + review = `sonnet`; final review = `opus`. (Sono andati bene così.)

**Comunicazione:** tra un task e l'altro l'utente NON va interpellato; procedi fino al merge. Tieni l'utente aggiornato con una tabellina di stato dei task.

---

## 5. House rules / lezioni dure (rispettale alla lettera)

1. **Disciplina di scope (CRITICO).** Ogni subagent modifica SOLO i file elencati. **MAI** toccare `package.json`, `tsconfig*.json`, `vitest.config.ts`; **MAI** creare un `tsconfig.json` di root o aggiungere `composite`/project references. Verifica `git status --short` prima di ogni commit. *(Incidente reale nel Piano 2: un subagent annullò il fix del typecheck e aggiunse composite/root tsconfig fuori dal commit — andò annullato a mano. Da allora la regola è in ogni prompt di task.)*
2. **typecheck root = `pnpm -r typecheck`** (in `package.json`). **NON** reintrodurre `tsc -b --noEmit` (era rotto: manca un tsconfig root con references). Il typecheck di pacchetto è `tsc --noEmit`.
3. **Verifica EMPIRICAMENTE il feedback dei reviewer prima di applicarlo.** *(Nel Piano 1 un reviewer segnalò un falso "CRITICAL": sosteneva che mulberry32 finisse con `| 0`; il canonico finisce con `^ t`. Smentito con `node -e`. C'è un golden-test che fissa la sequenza canonica.)* Tieni i reviewer all'evidenza (i loro prompt lo richiedono già).
4. **Bug apostrofo nelle stringhe dei test.** Le descrizioni `it('...')`/`describe('...')` in **apici singoli** NON devono contenere apostrofi (`l'`, `un'`, `dell'`, `c'è`). Spezzano la stringa JS. Scrivi senza apostrofo (`l attore`, `c è`); `è/é` vanno bene (sono lettere). **Grep di verifica del piano:** `(it|describe)\('[^']*'[A-Za-zàèéìòù]` → deve dare *no matches*.
5. **Filosofia di hardening (niente over-engineering).** Accogli test/doc extra SOLO per rami **algoritmici/contrattuali reali** (terminazione BFS su cicli, percorsi di `throw`/error-contract, confini del set "colpito", errori tipati, golden values del PRNG). **Scarta** il gold-plating: delegati sottili già coperti a valle, edge YAGNI. Dichiara cosa accetti e cosa scarti.
6. **TS strict.** `exactOptionalPropertyTypes` → niente `campo: undefined` esplicito: usa **spread condizionali** `...(x !== undefined ? { campo: x } : {})`. `noUncheckedIndexedAccess` → l'accesso a `Record`/array è `T | undefined`: usa `?? default` o guardie. Switch su union → **esaustivi** con `default: { const _exhaustive: never = x; ... }`.
7. **Purezza dell'engine.** NIENTE `Math.random`/`Date.now`/stato globale. RNG iniettato (`RandomSource`, seedato mulberry32). Funzioni pure `(stato,…) → nuovo stato`. L'**unico** pezzo con stato mutabile è l'`EventStore` (adapter).
8. **Git:** nessun remote configurato → i merge sono fast-forward locali. I doc di piano e i fix che faccio *io direttamente* hanno la riga `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`; i commit dei subagent usano messaggi conventional semplici. Branch per il lavoro, `main` per i doc.

---

## 6. Ambiente / comandi

- **OS:** Windows 11. Shell: PowerShell; **Bash disponibile** (usa Bash per git/pnpm, sono POSIX). I warning `LF will be replaced by CRLF` sono cosmetici.
- **Toolchain:** Node v24.9.0, pnpm 9.12.0, corepack 0.34.0 (già installati, su PATH).
- **Verifica (dalla root):** `pnpm test` (Vitest, atteso 98 verdi ora), `pnpm typecheck` (→ `pnpm -r typecheck` → engine `tsc --noEmit`), `pnpm -C packages/engine typecheck`.
- I subagent creano file con lo strumento Write (NON `New-Item -Force`, che tronca).

---

## 7. PROSSIMO PASSO — Piano 6: Persistenza (da scrivere)

Obiettivo (spec §4 pacchetto `memory`, §5.1, §9 contract test): un **adapter SQLite** che implementa la **stessa porta `EventStore`** del Piano 5, più persistenza degli snapshot, con **contract test condivisi** (la stessa suite verde su in-memory e SQLite).

**Bozza di design** (da rifinire scrivendo il piano):
- **Nuovo pacchetto `packages/memory`** (il workspace globba già `packages/*`): `package.json` (`@loomn/memory`), `tsconfig.json` che estende la base, dipende da `@loomn/engine` (workspace dep). Dipendenza ammessa: `memory → engine` (regola spec: `ai/memory/content → engine → shared`).
- **DB:** SQLite. La porta `EventStore` del Piano 5 è **sincrona** (`append`/`load`/`version` ritornano valori sync) → usa un driver **sincrono: `better-sqlite3`** per implementarla senza cambiare la porta. *(Se in futuro serve async — es. libsql — la porta andrebbe resa async: decisione esplicita, non implicita.)*
- **`createSqliteEventStore(db): EventStore`** — tabella `events(seq INTEGER PRIMARY KEY, type TEXT, payload TEXT/JSON)`. `append` in **transazione** con check `MAX(seq) === expectedVersion` → altrimenti `ConcurrencyError` (riusa la classe di engine). `load()` deserializza in `StoredEvent[]`. Persisti anche gli **snapshot** (tabella `snapshots(version, state JSON)`).
- **Serializzazione/validazione:** i payload `DomainEvent` contengono `Actor`/`Encounter`/`CheckResult` annidati → round-trip JSON. Lo spec vuole **validazione Zod ai confini**. **Decisione da prendere nel brainstorming/piano:** introdurre ora il pacchetto **`shared`** con gli schemi Zod di `DomainEvent` (unica fonte, spec §4/§12) oppure rimandare. Raccomandazione: valuta `shared` qui, perché serializzazione+validazione è il primo punto in cui serve davvero.
- **Contract test condivisi:** estrai da `event-store.test.ts` (engine) una funzione di suite riutilizzabile e falla girare su `createInMemoryEventStore` **e** `createSqliteEventStore` (in-memory `:memory:` per i test). Questo è il "contract test" dello spec §9.
- **Affronta i deferral del Piano 5:** hardening copia di `load()` (shallow → evitare leak di riferimenti) e copia difensiva dello snapshot.
- **Drizzle** ORM + migrazioni (lo spec cita Drizzle). Valuta se Drizzle serve davvero per uno schema così piccolo o se `better-sqlite3` puro basta in Fase 1 — decisione da motivare nel piano (lo spec dice Drizzle, ma niente debito: scegli con criterio).

**Punti aperti da decidere quando scrivi il Piano 6** (segnalali all'utente o risolvili con default motivati): sync vs async EventStore (racc. sync); `shared` + Zod ora o dopo; Drizzle vs better-sqlite3 puro.

---

## 8. Roadmap rimanente (Fase 1)

- **Piano 6 — Persistenza** (SQLite/Drizzle, EventStore SQLite, contract test) ← *prossimo*
- **Piano 7 — Provider AI + AI Master + StructuredOutputPort + TracingPort** (grande, probabile split in 2-3)
- **Piano 8 — Memoria L1.5 (canon ledger) + L2 (riassunti) + Context Assembler**
- **Piano 9 — Shell Electron** (main/preload/renderer, sicurezza contextIsolation/sandbox/safeStorage, IPC tipizzato, **Clock** per i meta degli eventi)
- **Piano 10 — UI Vue** (chat, scheda PG, **pannello dadi 3D** con `@3d-dice/dice-box` a risultati predeterminati, journal, gestione provider) (grande, probabile split)
- **Piano 11 — Moduli a tema** (formato dati Zod + import/export + 1 modulo curato)

Stima: ~6-9 piani per fine Fase 1; ~18-26 per la visione completa (Fase 2 = Module Editor, RAG/L3, più provider/moduli; Fase 3 = multiplayer). I piani grandi (7, 10) si decompongono — è una feature, non un'imprecisione. Da qui in poi si entra nell'IO reale (DB, AI, Electron, UI): i piani saranno meno puramente unit-testabili.

---

## 9. Checklist d'avvio per te (prossimo agente)

1. Leggi questo file + lo spec + (se utile) il Piano 5.
2. `git status` (atteso pulito, su `main`) e `pnpm test` (atteso 98 verdi).
3. Quando l'utente dice "scrivi il Piano 6": usa `writing-plans`, applica le house rules (§5), incolla la bozza §7, prendi le decisioni aperte (sync EventStore, shared/Zod, Drizzle).
4. Verifica il piano (grep apostrofi), committa il doc su main, chiedi l'esecuzione, e procedi subagent-driven (§4).
5. Mantieni il rigore: scope discipline nei prompt, verifica empirica del feedback, hardening solo su rami reali, niente over-engineering.
