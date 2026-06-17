# G3/G4 — Vocabolario di gioco + `spawn_npc` combat-ready — Design

> **Data:** 2026-06-17 · **Tipo:** design-first (brainstorming → questo spec) · **Traccia:** backlog pre-Piano 10, item 4 (HANDOFF §0-quinquies / §0-undecies).
> **Stato di partenza:** `main` pulito, HEAD `7583c6b`, 392 test verdi, typecheck pulito (6 progetti). Traccia engine CHIUSA (SP1-4).

## 1. Problema (dai findings della slice)

La slice con LLM reale (`docs/superpowers/findings-slice-llm.md`, findings **G3/G4** + ri-validazione) ha mostrato tre falle che lasciano l'AI "inventare le regole":

1. **Il contesto è cieco.** Il Context Assembler (`renderL1`) espone **solo le risorse** (`hp 20/20`), mai attributi/abilità/difese. Il modello non ha id reali da copiare → inventa `skill:"spada"`, `defense:"difesa"`, `damageResource:"danno"`.
2. **Il motore ingoia gli id inventati.** Prove: `getAttribute`/`getSkill` fanno `?? 0` → una skill allucinata tira silenziosamente 0 (il deferral dichiarato da SP1, §0-octies). Attacco: `adjustResource` **lancia dopo aver tirato** (rumoroso ma spreca il tiro). `ApplyEffect`: già valida la risorsa up-front (il pattern buono).
3. **`spawn_npc` crea non-combattenti.** Mappa attributi/abilità/risorse liberi senza default né igiene delle chiavi → PNG senza `hp` (non attaccabili) e con chiavi malformate (`" oro"`, spazio iniziale).

La tensione di fondo: lo spec assegna il vocabolario (attributi/abilità/risorse/difese) ai **moduli** (§11.4-11.7, §8) — ma il sistema di moduli è il **Piano 11**, ancora inesistente; e SP1 ha **declinato** una `Ruleset` injection prematura.

## 2. Decisioni di design (prese col brainstorming, 2026-06-17)

- **Il vocabolario è territorio-modulo**, ma front-load di una fetta **minima e dati-only** ora (Option A): è la fetta che lo spec già attribuisce ai moduli, con tre consumatori concreti oggi (validazione + contesto + `spawn_npc`). **NON** è la trappola SP1 (quella era una *strategia comportamentale* a una-impl; questo è *dato* spec-mandato).
- **Carrier = iniettato (§5.3).** Lo spec definisce `(state, cmd, rng, **ruleset**) → DomainEvent[]`. Il vocabolario è **config statica di modulo**, NON play-state → **non** event-sourced (lo stream resta fatti-agnostici-dal-modulo; il replay avviene sotto un ruleset re-iniettato). L'iniezione è già l'idioma del codebase (rng/clock/model/assembleContext). Conseguenza pulita: **`@loomn/shared` NON viene toccato** (nessun cambio di forma di `Command`/`GameState`).
- **Contenitore = `Ruleset { vocabulary, dcForDifficulty }`.** Nasce con i *dati* (vocabulary) **e** la sua *prima behavior*: si **migra dentro `dcForDifficulty`** (la funzione band→CD che SP1 aveva parcheggiato come "migrabile in un Ruleset deliberato"). Chiude il loose-end di SP1 e dà al `Ruleset` una forma reale, non un contenitore mono-campo. La firma di `decide` diventa definitiva: il Piano 11 e le regole future aggiungono solo campi al `Ruleset` (churn zero).
- **Il motore è l'arbitro.** `decide` rifiuta gli id fuori-vocabolario **prima di tirare**, con errori che **elencano il set legale** (l'errore reiniettato fa auto-correggere il loop agentico).
- **`spawn_npc` combat-ready via auto-fill.** `decide(AddActor)` riempie le risorse mancanti dal template `vocabulary.defaultResources` (es. `hp`) → il PNG è **garantito** combat-ready anche se il modello dimentica `hp`; le risorse fornite dal modello si fondono sopra.
- **Strumenti vincolati con `z.enum` dal vocabolario.** I campi vocab-bound dei tool diventano `z.enum([...])` (stesso idioma di `difficulty`/`direction`/`status`/`phase`): il modello non può **emettere** un id fuori-vocabolario. Steering al confine; il motore resta l'arbitro/backstop.
- **Esposizione nel contesto = per-attore.** `renderL1` aggiunge attributi+abilità di ogni attore (oggi solo risorse). I set legali (incl. skill legali-ma-non-addestrate) li portano già gli `z.enum` dei tool → niente blocco-vocabolario globale in prosa, niente vocab da filare in `memory`.
- **Seme dev in `@loomn/host`**, mai nel motore puro (niente vocabolario fantasy hardcoded, §11.6). Il Piano 11 cambia solo la **sorgente** (const → modulo caricato): stessa forma `Vocabulary`.

## 3. Architettura

### 3.1 `engine/ruleset.ts` (nuovo modulo, puro — come `difficulty.ts`/`quest.ts`/`phase.ts`)

```ts
export interface Vocabulary {
  attributes: ReadonlySet<string>;
  skills: ReadonlySet<string>;
  resources: ReadonlySet<string>;
  defenses: ReadonlySet<string>;
  /** Template combat-ready applicato da decide(AddActor). Chiavi ⊆ resources (invariante del factory).
   *  Record (non Map) così il merge dell auto-fill è uno spread pulito con actor.resources. */
  defaultResources: Readonly<Record<string, ResourcePool>>;
}

export interface Ruleset {
  vocabulary: Vocabulary;
  dcForDifficulty: (d: Difficulty) => number;
}

// Factory: arrays in → Set per membership O(1); valida defaultResources.keys ⊆ resources.
export function createVocabulary(input: {
  attributes: string[]; skills: string[]; resources: string[]; defenses: string[];
  defaultResources?: Record<string, ResourcePool>;
}): Vocabulary;

// Assembla un Ruleset; dcForDifficulty default = la funzione del motore (SP1).
export function createRuleset(input: { vocabulary: Vocabulary; dcForDifficulty?: (d: Difficulty) => number }): Ruleset;
```

Helper di membership condiviso (errori che elencano il set legale):

```ts
// Lancia se key ∉ set, elencando i valori legali (aiuta l auto-correzione del modello).
function requireMember(set: ReadonlySet<string>, key: string, kind: string): void;
```

### 3.2 `decide(state, cmd, rng, ruleset)` — validazione per Command

`decide` acquisisce il 4° parametro `ruleset` (§5.3). Validazioni aggiunte (tutte **prima** di qualsiasi tiro):

| Command | Validato contro `ruleset.vocabulary` |
|---|---|
| `AddActor` | ogni chiave di `attributes`/`skills`/`resources` ∈ set rispettivo (match esatto — niente trim silenzioso; `" oro"` → rifiuto pulito). **Poi auto-fill:** `resources = { ...defaultResources, ...actor.resources }` (il modello sovrascrive i default; le mancanti vengono riempite) → l'`ActorAdded` porta l'attore arricchito (replay coerente). |
| `Attack` | `attribute?`∈attributes, `skill?`∈skills, `defense`∈defenses, `damageResource`∈resources **e** presente in `target.resources`. |
| `RequestCheck` | `attribute?`∈attributes, `skill?`∈skills. Usa `ruleset.dcForDifficulty(difficulty)` (era import diretto). |
| `ApplyEffect` | `resource`∈vocabulary.resources (in aggiunta al check esistente `target.resources[resource]≠undefined`). |

Una skill vocab-legale ma non addestrata (assente sull'attore) tira ancora 0 — **legittimamente**, perché ora "legale" lo decide il vocabolario, non il fatto che quell'attore l'abbia addestrata. L'ambiguità non-addestrato-vs-allucinato sparisce. Comandi senza campi vocab (`StartQuest`/`AdvanceQuest`/`EnterPhase`/`EndEncounter`/`EndTurn`/`NextRound`/`StartEncounter`) restano invariati.

### 3.3 `master-tools.ts` (ai) — schemi parametrizzati sul vocabolario + `z.enum`

Il registro `TOOLS` smette di essere una const statica: diventa una funzione del vocabolario. I campi vocab-bound usano `z.enum` dal vocabolario (con fallback a `z.string().min(1)` se un set è vuoto, perché `z.enum([])` è invalido in Zod):

```ts
function enumOrString(set: ReadonlySet<string>): z.ZodTypeAny; // set non vuoto → z.enum([...set]); vuoto → z.string().min(1)
function buildTools(vocab: Vocabulary): Record<string, ToolEntry>;
```

- `attack`: `attribute`/`skill`/`defense`/`damageResource` via `enumOrString`.
- `request_check`: `attribute`/`skill` via `enumOrString`.
- `apply_effect`: `resource` via `enumOrString`.
- `spawn_npc`: **NIENTE enum nel tool schema** — i campi record (`attributes`/`skills`/`resources`) restano `z.record(valueSchema)` aperti. *Motivo (verificato empiricamente, Zod 3.25):* `z.record(z.enum([...]), v)` *valida* le chiavi (rifiuta l'ignota) ma `zodToJsonSchema` lo rende con **tutte le chiavi `required`** → schema ingannevole (il modello crederebbe di dover fornire ogni attributo). Le chiavi di `spawn_npc` sono quindi validate **dal motore** (`decide(AddActor)`, §3.2) con errore che elenca il set legale; il JSON del tool resta onesto (object aperto).

`masterToolDefs(phase, vocab)` e `resolveToolCall(name, rawArgs, vocab)` prendono il vocabolario (**un solo set di schemi** usato sia per il JSON mostrato al modello sia per la validazione → niente divergenza, le guardie di trasparenza restano valide). La macchineria `commandType`/`Extract<Command,{type:T}>`/`makeEntry` resta invariata.

### 3.4 `master-turn.ts` (ai) — threading

`MasterTurnRequest` acquisisce `ruleset: Ruleset`. Nel loop: `decide(state, cmd, rng, ruleset)`; `masterToolDefs(phase, ruleset.vocabulary)` (ricomputato per-iterazione come già fa SP4); `resolveToolCall(name, args, ruleset.vocabulary)`.

### 3.5 `context-assembler.ts` (memory) — esposizione per-attore

`renderL1` aggiunge, per ogni attore, attributi e abilità (nomi+valori) accanto alle risorse già rese. Compatto (L1 non è mai tagliato). **`memory` NON acquisisce il vocabolario** (i set legali li portano gli `z.enum`; il contesto porta gli specifici dell'attore) → cambiamento self-contained, nessun nuovo dep/parametro nell'assembler.

### 3.6 `@loomn/host` — seme dev del vocabolario

Un `Vocabulary` di default fantasy (stand-in dev: pochi attributi/abilità, `hp` + `defaultResources`), costruito con `createVocabulary`/`createRuleset` e iniettato in `createCampaignService` (deps acquisisce `ruleset`) → `dispatch` passa il ruleset a `decide`, `runTurn` lo passa a `runMasterTurn`. **Il Piano 11 sostituisce la sorgente del seme** (modulo caricato), stessa forma.

## 4. Impatto sui package e ripple

- **engine:** `ruleset.ts` (nuovo) + `decide` firma/validazioni + migrazione `dcForDifficulty` in `RequestCheck`. **Ripple:** ogni call-site di `decide` nei test engine deve passare un `ruleset` con un vocabolario che copre i suoi attori (test espliciti: asseriscono sia accettazione che rifiuto). È il grosso del lavoro, meccanico — va **enumerato per task** (lezione SP4: il ripple appartiene al task che lo causa; suite verde a ogni task).
- **ai:** `master-tools.ts` (parametrizzato + enum) + `master-turn.ts` (threading) + i loro test.
- **memory:** `context-assembler.ts` (`renderL1`) + test.
- **host:** seme dev + threading in `createCampaignService` + test.
- **shared:** **INTATTO** (conferma che l'iniezione era il carrier giusto vs event-sourcing).

Cross-package come SP3 (engine+ai+memory+host), ma senza `shared`. ~6-8 task TDD nel piano.

## 5. Seam per il Piano 11 + sinergia con l'Inventario

Il `Ruleset` iniettato è la casa di tutto ciò che è "regole/vocabolario di modulo". Il Piano 11 popola `vocabulary` (e può sovrascrivere `dcForDifficulty`) **senza ridisegnare nulla** — stessa firma di `decide`, si aggiungono campi al `Ruleset`. La **feature Inventario & Equipaggiamento** (pianificata, HANDOFF §8): la **tassonomia degli slot è vocabolario-di-modulo** → vivrà nello stesso `Ruleset` (`slots`, `itemCatalog`), aggiunto come campo, churn-zero sulla firma. G3/G4 costruisce questa fondazione.

## 6. Fuori ambito (deferral dichiarati)

- **Validazione degli identificatori dentro gli effetti degli oggetti** (`defenseModifier.defense ∈ vocabulary.defenses`, ecc.): appartiene alla traccia Inventario (oggi gli oggetti non vengono dall'AI — `spawn_npc` mappa `items:[]` — e il loop inventario non esiste → YAGNI ora). G3/G4 valida le chiavi-stat dell'attore (`attributes`/`skills`/`resources`).
- **Vocabolario delle zone** in `start_encounter` (i findings non l'hanno segnalato).
- **Vocabolario di condizioni/status** (l'altra famiglia di "id di modulo"; va col Piano 11 / la famiglia condizioni).
- **`Ruleset` comportamentale oltre `dcForDifficulty`** (formule di difesa, default flat, hook): si aggiungono al `Ruleset` quando un consumatore reale ne rivela la forma (come ora il vocabolario).
- **Richiedere a un check di nominare ≥1 stat** (oggi `RequestCheck`/`Attack` ammettono entrambi i campi assenti = solo dado base): hardening minore non richiesto dai findings; eventualmente in un follow-up.
- **Feature Inventario & Equipaggiamento completa** (Command/Event del ciclo di vita, strumenti Master, slot profondi UI, contenitori, economia): traccia dedicata pianificata (HANDOFF §8).

## 7. Acceptance

- Il modello **non può facilmente inventare** id che rompono/azzerano silenziosamente il motore: gli `z.enum` impediscono l'emissione fuori-vocabolario e il motore **rifiuta** (prima di tirare) gli id illegali con errori che elencano il set legale.
- I PNG generati da `spawn_npc` sono **combat-ready** (auto-fill di `hp` dal template anche se il modello lo dimentica) e senza chiavi malformate (match esatto, niente `" oro"`).
- Il contesto espone gli attributi/abilità reali degli attori in scena.
- Il `Ruleset` iniettato è il seam pulito che il Piano 11 / l'Inventario riempiranno senza churn di firma.
- `shared` intatto; 392 test esistenti restano verdi (più i nuovi); typecheck pulito (6 progetti).

## 8. Approccio di test (TDD)

Engine: test di `createVocabulary`/`createRuleset` (membership, invariante `defaultResources.keys ⊆ resources`); per ogni Command validato, un test di **accettazione** (id legale) e uno di **rifiuto** (id illegale → throw + 0 eventi + messaggio che elenca il set); auto-fill di `AddActor` (risorsa mancante riempita; risorsa fornita preservata/sovrascrive). AI: `z.enum` rifiuta un id fuori-vocabolario in `resolveToolCall`; `masterToolDefs` mostra l'enum nel JSON (guardia di trasparenza); fallback `z.string()` con set vuoto; `runMasterTurn` fila il ruleset. Memory: `renderL1` mostra attributi/abilità. Host: seme dev copre gli attori del servizio; giro `dispatch`/`runTurn` con vocabolario reale. RNG seedato ovunque; doppi al seam model/port.

## 9. Self-review

- **Placeholder:** nessuno (tutte le firme/decisioni concrete).
- **Coerenza:** `shared` intatto coerente con "no cambio Command/GameState"; l'iniezione coerente con §5.3 e con l'idioma del codebase; auto-fill coerente con §11.8 (il motore applica, il modulo definisce).
- **Scope:** un'unica feature (il vocabolario) cross-package; il ripple di firma di `decide` è il rischio principale → da decomporre con cura nel piano (suite verde a ogni task, lezione SP4). Se in `writing-plans` risultasse troppo grande, splittare engine-core vs ai/memory/host.
- **Ambiguità risolte:** "legale" = membership nel vocabolario iniettato (non per-attore); auto-fill fonde il modello sopra i default; un solo set di schemi tool (no divergenza JSON↔validazione).
