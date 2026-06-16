# Loomn — Handoff per il prossimo agente

> **Data:** 2026-06-16 · **Branch:** `main` · **HEAD:** `ae558a5` (più eventuali commit doc successivi — fai `git log`) · **Stato:** Piani 1-6 + **7a/7b/7c + 8a** completi e mergiati (engine + persistenza + Provider Layer AI + StructuredOutputPort + AI Master pipeline + Canon Ledger L1.5), **182 test verdi**, typecheck pulito, tree pulito.
>
> Questo documento ti permette di riprendere **esattamente** da dove siamo. Leggilo tutto prima di agire. La memoria di progetto è in `.claude/.../memory/loomn-project.md` e `loomn-working-style.md` (caricata a inizio sessione).

---

## 0. TL;DR — cosa fare adesso

L'engine (Piani 1-5), la **Persistenza (6)**, il **Provider Layer AI (7a)**, lo **StructuredOutputPort (7b)**, l'**AI Master pipeline (7c)** e il **Canon Ledger L1.5 (8a)** sono **finiti e mergiati** in `main`. Il Piano 7 è completo; il **Piano 8 è splittato in 8a/8b/8c** (come il 7) e **8a è fatto**. Il prossimo passo è **scrivere ed eseguire il Piano 8b — Reflection (asincrona, fuori dal turno) + L2 (riassunti gerarchici scena→sessione→arco→campagna)**: tabella `summaries` + la pipeline di Reflection che prende **porte iniettate** `FactExtractor`/`Summarizer` (impl LLM-backed in `@loomn/ai`/app; `memory` NON dipende da `ai`), scrive su L1.5 (8a) e L2, e assegna la **salienza** (spec §6.1). Poi 8c = **Context Assembler** con budget di token (spec §6.2, rimpiazza `assembleContextStub` di 7c, iniettato in `runMasterTurn`). Valuta se infilare in 8b/8c (o in un piano dedicato) i `Command`/`Event` engine mancanti per gli strumenti rimandati di 7c (`request_check`/`apply_effect`/`advance_quest`) e la **FSM di fase** (spec §5.5). Tutti i piani sono in `docs/superpowers/plans/`.

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
  - `2026-06-15-loomn-fase1-piano6-persistenza.md` ✅ fatto (pacchetti `shared` + `memory`)
  - `2026-06-15-loomn-fase1-piano7a-provider-layer.md` ✅ fatto (`@loomn/ai`)
  - `2026-06-15-loomn-fase1-piano7b-structured-output.md` ✅ fatto
  - `2026-06-15-loomn-fase1-piano7c-ai-master-pipeline.md` ✅ fatto
  - `2026-06-16-loomn-fase1-piano8a-canon-ledger.md` ✅ fatto (Canon Ledger L1.5 in `memory`)
  - **Piano 8b → prossimo da scrivere** (Reflection + L2; vedi §0/§7/§8).
- **Memoria:** `C:\Users\zagor\.claude\projects\C--Users-zagor-Desktop-tabl\memory\` (`loomn-project.md`, `loomn-working-style.md`, indice in `MEMORY.md`).

Ogni piano ha in fondo una **roadmap aggiornata** e una sezione **self-review**.

---

## 3. Stato dell'engine (`packages/engine`) — cosa esiste già

Monorepo **pnpm workspaces** (`pnpm-workspace.yaml` globba `packages/*` e `app/*`). Esistono `packages/engine` (dettagliato qui sotto), più `packages/shared` e `packages/memory` (Piano 6 + 8a — vedi §3-bis) e `packages/ai` (Piani 7a/7b/7c — vedi §3-ter). TS strict (`tsconfig.base.json`): `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`. Test: Vitest (config root `vitest.config.ts`, include `packages/**/*.test.ts`). **182 test verdi totali** (98 engine + 35 `shared`/`memory` + 49 `ai`).

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

### 3-bis. Pacchetti `shared` e `memory` (Piano 6 + 8a) — cosa esiste già

Aggiunti dal Piano 6 (+ Canon Ledger dal Piano 8a), mergiati in `main`. Grafo dipendenze: `memory → engine`, `memory → shared`; **`shared` è foglia** (dipende solo da `zod`, NON importa engine). **`memory` NON dipende da `ai`** (regola di dipendenza; la Reflection LLM-backed di 8b userà porte iniettate).

| Pacchetto | Export / contenuto |
|---|---|
| `@loomn/shared` (`packages/shared`) | `domain-schema.ts` → `domainEventSchema`, `gameStateSchema` (Zod). **Unica fonte di validazione** ai confini. Cast-free: `.transform()` sui 4 campi opzionali (`DieGroup.tag`, `DieResult.tag`, `ConditionEffect.appliesTo`, `ItemEffect.appliesTo`) → `z.infer` assegnabile 1:1 ai tipi engine sotto `exactOptionalPropertyTypes`. Dep: `zod`. |
| `@loomn/memory` (`packages/memory`) | `createSqliteEventStore(dbPath): SqliteEventStore` (implementa la porta `EventStore` del Piano 5 + `saveSnapshot`/`latestSnapshot`/`close`); `openDatabase(dbPath): OpenDb`. **`createCanonLedger(db): CanonLedger` (8a — L1.5):** `record`/`active`/`all`/`retract`/`supersede` su `canon_facts` (id/subject/predicate/object/eventSeq/status); prende un **handle Drizzle gia aperto** (l app condividera UNA connessione fra event store e ledger); `status` validato Zod in lettura; `supersede` = anti-contraddizione per predicati funzionali (ritira-e-rimpiazza in transazione; funge anche da primo inserimento). `schema.ts` (tabelle Drizzle `events`/`snapshots`/**`canonFacts`**), `migrations/` (`0000_init` + `0001_canon_ledger`, **scritte a mano**, journal con `when` congelato, applicate via `migrate()`). Deps: `@loomn/engine`, `@loomn/shared`, `better-sqlite3@^12.10.1` (la 11.x non ha prebuilt per Node 24 sotto pnpm), `drizzle-orm@^0.38.4`, `zod`. |

**Punti chiave (NON romperli):** la porta `EventStore` resta **sincrona** (better-sqlite3 sincrono). `append` usa una **transazione** con check `MAX(seq) === expectedVersion` → `ConcurrencyError` (riusata da engine); validazione Zod **solo in lettura** (`load`/`latestSnapshot`), non in scrittura (gli eventi vengono da `decide`, già tipati). Due **drift guard** a compile-time in `sqlite-event-store.ts` tengono gli schemi Zod allineati ai tipi engine. Una **suite di conformità condivisa** (`event-store-contract.ts`, `runEventStoreContract`) gira verde su in-memory **e** SQLite (contract test, spec §9). **`drizzle-kit` RIMANDATO (verificato empiricamente in 8a):** su questa baseline (journal scritto a mano, senza `0000_snapshot.json`) `drizzle-kit generate` non ha uno snapshot con cui diffare → ricrea **tutte** le tabelle nella nuova migrazione (il `migrate()` fallirebbe) e usa un `when` non-deterministico. Le migrazioni restano **scritte a mano** (deterministiche, `when` congelato, coerenti); drizzle-kit si introdurrà quando il churn dello schema lo giustificherà, con la ricostruzione una tantum della baseline. La `8a` aggiunge `canon_facts` con `0001_canon_ledger.sql` a mano.

### 3-ter. Pacchetto `ai` (Piani 7a + 7b + 7c) — cosa esiste già

Aggiunto dai Piani 7a/7b/7c, mergiato in `main`. Dipende da `zod` + `zod-to-json-schema@~3.23.5` + `jsonrepair` (runtime) + **`@loomn/engine@workspace:*` (aggiunta in 7c → `ai` NON è più foglia)** e `@types/node` (dev). Rispetta la regola `ai → engine → shared`; **NON** dipende da `@loomn/shared` (in 7c non serviva — gli `Command`/`Event` vengono già tipati dall'engine; YAGNI). L'engine **non** importa `ai` (nessun ciclo, verificato). Tutto il codice è stato verificato empiricamente in sandbox prima della stesura dei piani.

| Modulo (`packages/ai/src/`) | Export / contenuto |
|---|---|
| `language-model.ts` | Porta `LanguageModel` (`readonly id`; `stream(req): AsyncIterable<LlmStreamEvent>`); tipi `LlmRole`/`LlmMessage`/`LlmToolDef`/`LlmResponseFormat`/`LlmRequest`/`LlmFinishReason`/`LlmStreamEvent`(text\|tool-call\|finish)/`LlmToolCall`/`LlmResponse`; `collectResponse(stream)` → `{text,toolCalls,finishReason}`. |
| `transport.ts` | `HttpRequest`/`HttpResponse` (`body()`/`text()` **mutuamente esclusivi**, single-use)/`HttpTransport`; `createFetchTransport(fetchImpl=fetch)` (avvolge `fetch`; l'adapter non lo chiama mai direttamente). |
| `tracing.ts` | `TraceEvent` (`request`\|`response`\|`validation-failure`\|`retry`\|`error`; **senza timestamp** → chiamanti puri; `strategy` è `string` per evitare cicli), `TracingPort`, `noopTracer`, `createRecordingTracer`. |
| `openai-adapter.ts` | `createOpenAiCompatibleModel(config)` (LM Studio + cloud), `LanguageModelError`, `OpenAiCompatibleConfig`. Internamente: `buildBody` (spread condizionali per `exactOptionalPropertyTypes`), `parseSse` (robusto ai confini di chunk: buffer + `\n\n` + `TextDecoder({stream:true})`), `streamChatCompletion` (chunk validato Zod con `safeParse` + skip difensivo anche su `data:` non-JSON; accumulo tool-call per `index` in Map; emissione ordinata; `[DONE]`). |
| `json-repair.ts` (7b, interno) | `parseJson`, `extractJsonCandidate` (strip fence + slice primo`{`..ultimo`}`, **object-rooted** per design), `repairJson`. `jsonrepair` è **lenient** (coerce testo nudo a stringa) → la validazione Zod è il vero filtro. **Non** nel barrel. |
| `structured-output.ts` (7b) | `createStructuredOutput(model, {tracer?, strategies?})`, `StructuredOutputPort`, `StructuredOutputError` (con `lastText`), tipi `StructuredOutputRequest/Result/Options/Strategy`. 3 livelli in ordine (function-call → json_schema → repair+retry), Zod come gate, cascata su qualunque fallimento; `strategies` per saltare livelli. Costruito sopra `LanguageModel` (testato con fake model). |
| `language-model-contract.ts` | `runLanguageModelContract(label, makeModel)`: suite di conformità condivisa (spec §9), come `event-store-contract.ts`. **Non** nel barrel (utility di test). Oggi gira sull'adapter OpenAI; in Fase 2 la riuseranno Anthropic/Gemini. |
| `master-tools.ts` (7c) | Contratto LLM↔engine del Master. 5 strumenti che mappano 1:1 ai `Command` esistenti: `spawn_npc→AddActor`, `attack→Attack`, `start_encounter→StartEncounter`, `end_turn→EndTurn`, `next_round→NextRound`. Registro omogeneo type-safe (`makeEntry<A>` cattura il tipo concreto dello schema Zod → `ToolEntry` type-erased, niente cast non sicuri). `masterToolDefs()` → `LlmToolDef[]` (schema JSON **inline** via `zodToJsonSchema` openApi3/`$refStrategy:'none'`); `resolveToolCall(name, rawArgs)` → `ToolResolution` (parse via `parseJson` + Zod `safeParse` + map al `Command`, o errore). |
| `master-turn.ts` (7c) | `runMasterTurn(request)`: **turno agentico singolo** (spec §5.4). `assembleContextStub(state)` (stub L1, il vero Context Assembler è il Piano 8c) + `buildMasterMessages` + il ciclo: `model.stream` con `tools`+`toolChoice:'auto'` → `collectResponse` → per ogni tool-call `resolveToolCall` → `decide(state,cmd,rng)` (RNG **iniettato**, `request.rng`) → `applyEvent` → **reiniezione degli Event reali come messaggio `role:'user'`** (provider-agnostico: l'adapter 7a NON fa round-trip dei `tool_calls`; un `role:'tool'` verrebbe rifiutato da un provider reale). Termina su testo libero (= narrazione) o `maxIterations` (default 6). Rami falliti (Zod o `decide` che lancia) tracciati (`validation-failure`/`error`) e **senza eventi**. Ritorna `{state, events, narration, invocations, transcript}`. |

**Punti chiave (NON romperli):** la porta è **async/streaming** (a differenza dell'`EventStore` sincrono); l'adapter **nasconde** la frammentazione delle tool-call (emette tool-call intere); il transport è **iniettato** (nessuna chiamata di rete reale nei test — fake con SSE predefinito); il `TracingPort` non porta tempo nei suoi eventi (purezza dei chiamanti); il barrel `index.ts` esporta language-model/tracing/transport/openai-adapter/structured-output/master-tools/master-turn (NON il contract né `json-repair`, interni). **7c — il codice è l'arbitro:** nel turno, `decide` consuma l'RNG seedato e produce gli **Event reali**; gli argomenti dei tool sono validati con Zod (`resolveToolCall`) prima di diventare `Command`; comandi invalidi → rifiutati senza eventi. Strumenti rimandati (`request_check`/`apply_effect`/`advance_quest`) e **FSM di fase** (spec §5.5) sono **fuori ambito** di 7c (servono nuovi `Command`/`Event` engine o il contesto quest). Follow-up minore noto: nessun TraceEvent/narrazione di fallback al raggiungimento di `maxIterations`.

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
- **Verifica (dalla root):** `pnpm test` (Vitest, atteso **182 verdi**), `pnpm typecheck` (→ `pnpm -r typecheck` → `tsc --noEmit` su engine/shared/memory/ai), `pnpm -C packages/<pkg> typecheck` per il singolo pacchetto.
- I subagent creano file con lo strumento Write (NON `New-Item -Force`, che tronca).

---

## 7. Piano 7 (7a/7b/7c) e Piano 8a — COMPLETI. PROSSIMO PASSO: Piano 8b

> **Piano 8a — Canon Ledger (L1.5) ✅ FATTO e mergiato** — vedi `docs/superpowers/plans/2026-06-16-loomn-fase1-piano8a-canon-ledger.md` e §3-bis. `canon_facts` (proiezione SQLite) + `createCanonLedger` (record/active/all/retract/supersede). Migrazione **scritta a mano** (drizzle-kit rimandato, vedi §3-bis). Il **Piano 8 è splittato in 8a (fatto) / 8b / 8c**; il prossimo è **8b** (Reflection + L2, vedi §0/§8). Follow-up minore noto: `record`/`supersede` lanciano su `id` duplicato (PK) — quando 8b genera gli id, documentarlo o gestire l upsert.

Il **Piano 7** (spec §5.4/§7) era splittato in tre sotto-piani, **tutti fatti e mergiati**:

- **7a — Provider Layer ✅ FATTO e mergiato** — vedi `docs/superpowers/plans/2026-06-15-loomn-fase1-piano7a-provider-layer.md` e la §3-ter. Pacchetto `@loomn/ai`: porta `LanguageModel` (async/streaming), adapter OpenAI-compatibile su `HttpTransport` iniettabile, `TracingPort`, suite `runLanguageModelContract`.
- **7b — `StructuredOutputPort` + 3 livelli di fallback ✅ FATTO e mergiato** — vedi `docs/superpowers/plans/2026-06-15-loomn-fase1-piano7b-structured-output.md` e la §3-ter. `createStructuredOutput(model, {tracer?, strategies?})`: dato uno schema Zod, ritorna un oggetto **validato** con 3 livelli in ordine — (1) function-call nativo → (2) constrained decoding `response_format: json_schema` → (3) parse+repair+1 retry — con **Zod come gate** a ogni livello e cascata su qualunque fallimento; `StructuredOutputError` se tutti falliscono. `json-repair.ts` (interno), `TraceEvent` esteso. Deps `zod-to-json-schema@~3.23.5` + `jsonrepair`.
- **7c — AI Master pipeline + tool schemas ✅ FATTO e mergiato** — vedi `docs/superpowers/plans/2026-06-15-loomn-fase1-piano7c-ai-master-pipeline.md` e la §3-ter. `master-tools.ts` (schemi Zod dei 5 strumenti + `masterToolDefs`/`resolveToolCall`, mappa 1:1 ai `Command` esistenti) + `master-turn.ts` (`runMasterTurn`, turno agentico singolo: contesto stub → prompt → `LanguageModel.stream` → tool-call → Zod → `Command` → `decide` con RNG seedato → reiniezione Event reali come `role:'user'` → narra). `ai` ha acquisito **`@loomn/engine`** (NON `shared`: non serviva). **Fuori ambito (rimandati):** strumenti `request_check`/`apply_effect`/`advance_quest` (servono nuovi `Command`/`Event` engine o il contesto quest) e la **FSM di fase** (spec §5.5).

> **Decisioni di confine del Piano 7 (prese in 7a/7b/7c):** `LanguageModel` async/streaming; lo stream emette tool-call **intere** (frammentazione nascosta), `collectResponse` aggrega; transport **iniettato** (nessuna rete reale nei test); validazione Zod ovunque; lo `StructuredOutputPort` è **object-rooted**; schemi degli strumenti in `@loomn/ai`. 7c: turno agentico **singolo** (`toolChoice:'auto'`, niente "risolvi→narra"), reiniezione eventi come messaggio utente (l'adapter 7a non fa round-trip dei `tool_calls`), validazione tool-call con Zod inline (non lo `StructuredOutputPort`, che resta per i casi a singolo oggetto forzato es. Reflection del Piano 8).
>
> **Metodo replicato in 7a/7b/7c (replicalo nei prossimi):** decisioni aperte risolte verso lo spec + **verifica empirica in sandbox** di ogni scelta tecnica prima della stesura (i piani contenevano solo codice già eseguito verde — per 7c provati cross-package import+typecheck, `zodToJsonSchema` inline, l'attrito `.default()`/`exactOptionalPropertyTypes`, il ciclo agentico con determinismo/replay). La sandbox è esterna al repo e va rimossa a fine lavoro.

---

## 8. Roadmap rimanente (Fase 1)

- **Piano 6 — Persistenza** (SQLite/Drizzle, EventStore SQLite, contract test, pacchetti `shared`+`memory`) ✅ fatto
- **Piano 7a — Provider Layer** (`@loomn/ai`: porta `LanguageModel` async/streaming, adapter OpenAI-compatibile, `HttpTransport` iniettabile, `TracingPort`, contract `runLanguageModelContract`) ✅ fatto
- **Piano 7b — StructuredOutputPort + 3 livelli di fallback** (`createStructuredOutput`: function-call → json_schema → repair+retry; Zod come gate; `json-repair.ts`; `TraceEvent` esteso) ✅ fatto
- **Piano 7c — AI Master pipeline + tool schemas** (`@loomn/ai`: `master-tools.ts` + `master-turn.ts`; `ai` acquisisce `@loomn/engine`) ✅ fatto
- **Piano 8a — Canon Ledger (L1.5)** (`@loomn/memory`: `canon_facts` + `createCanonLedger`; migrazione scritta a mano) ✅ fatto
- **Piano 8b — Reflection + L2 (riassunti)** ← *prossimo* (tabella `summaries`, porte `FactExtractor`/`Summarizer` iniettate, salienza; spec §6.1)
- **Piano 8c — Context Assembler** (budget di token §6.2; rimpiazza `assembleContextStub`; iniettato in `runMasterTurn`)
- **Piano 9 — Shell Electron** (main/preload/renderer, sicurezza contextIsolation/sandbox/safeStorage, IPC tipizzato, **Clock** per i meta degli eventi; wiring di EventStore+CanonLedger su connessione condivisa)
- **Piano 10 — UI Vue** (chat, scheda PG, **pannello dadi 3D** con `@3d-dice/dice-box` a risultati predeterminati, journal, gestione provider) (grande, probabile split)
- **Piano 11 — Moduli a tema** (formato dati Zod + import/export + 1 modulo curato)

Stima: ~5-8 piani per fine Fase 1; ~17-25 per la visione completa (Fase 2 = Module Editor, RAG/L3, più provider/moduli; Fase 3 = multiplayer). I piani grandi (7, 8, 10) si decompongono in sotto-piani — è una feature, non un'imprecisione. Da qui in poi si entra nell'IO reale (DB, AI, Electron, UI): i piani saranno meno puramente unit-testabili.

---

## 9. Checklist d'avvio per te (prossimo agente)

1. Leggi questo file + lo spec (per il Piano 8b contano **§6** memoria a strati e **§6.1** Reflection/salienza) + (se utile) i Piani 6, 7c e 8a (porte e pacchetti esistenti).
2. `git status` (atteso pulito, su `main`) e `pnpm test` (atteso **182 verdi**), `pnpm typecheck` pulito.
3. Quando l'utente dice "scrivi il Piano 8b": usa `writing-plans`, applica le house rules (§5), parti dalla sintesi in §0/§8. Esiste già `@loomn/memory` con EventStore SQLite + snapshot (6) e **Canon Ledger L1.5** (8a, `createCanonLedger`); il turno del Master (7c) ha `assembleContextStub` (lo rimpiazza 8c). Piano 8b = tabella `summaries` (L2) + pipeline di Reflection con **porte iniettate** `FactExtractor`/`Summarizer` (impl LLM-backed in `ai`/app; `memory` NON importa `ai`) + salienza, che scrive su L1.5 (8a) e L2. Migrazioni **scritte a mano** (drizzle-kit rimandato, vedi §3-bis). Valuta se includere i `Command`/`Event` engine per gli strumenti rimandati di 7c e la FSM di fase (spec §5.5).
4. Verifica il piano (grep apostrofi), committa il doc su main, chiedi l'esecuzione, e procedi subagent-driven (§4).
5. Mantieni il rigore: scope discipline nei prompt, verifica empirica del feedback, hardening solo su rami reali, niente over-engineering.
