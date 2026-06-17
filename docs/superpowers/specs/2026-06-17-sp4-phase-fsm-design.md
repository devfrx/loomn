# SP4 — FSM di fase (§5.5): il codice possiede la macchina a stati, l'AI propone l'intento (design)

> **Data:** 2026-06-17 · **Tipo:** design/spec · **Traccia:** engine/AI (item 3 di HANDOFF §0-quinquies) · **Sotto-progetto:** SP4 di 4 (ultimo della traccia engine) · **Cross-package** (engine + shared + ai).
> **Autorità:** spec di design `2026-06-15-simulatore-campagne-ai-design.md` (§5.5 Fasi come State Machine, §5.4 AI Master, §6.2 Context Assembler — "fase" è priorità 1 con ruolo/regole). Questo doc è subordinato a quello.

## 0. Contesto e posizione nella traccia engine

La traccia engine (item 3 del backlog pre-Piano 10) realizza gli strumenti del Master rimandati dal Piano 7c più la **FSM di fase** (§5.5), decomposta in 4 sotto-progetti:

- **SP1 — `request_check`** ✅ fatto (`c04d9a3`): band di difficoltà→CD, evento `CheckResolved`.
- **SP2 — `apply_effect`** ✅ fatto (`dbee1a8`): delta di risorsa via dadi tirati dall'engine, evento `ResourceEffectApplied`.
- **SP3 — Quest in L1 + `advance_quest`** ✅ fatto (`8d3f67b`): entità `Quest` nel `GameState`, ciclo di vita posseduto dall'engine.
- **SP4 — FSM di fase (§5.5)** *(questo doc)*: macchina a stati dichiarata (esplorazione/dialogo/combattimento/downtime); ogni fase abilita Command diversi e una strategia di prompt diversa; transizioni esplicite e testabili. È per ultima perché vincola un vocabolario di Command ormai completo (`request_check`/`apply_effect`/`advance_quest` esistono) e fissa i **confini di scena** che serviranno all'item 6 (segmentazione `reflect`).

SP4 è **design-first** (lo spec §5.5 dà solo il principio): il design è stato deciso in brainstorming con l'utente. Le decisioni chiave sono registrate qui sotto, ognuna con la sua giustificazione architetturale.

## 1. Principio: il codice possiede la FSM, l'AI propone l'intento

> *Il codice è l'arbitro, l'AI è il narratore.* (spec, principio sacro)

Coerente con SP1 (il codice possiede i numeri dei check), SP2 (il codice tira e clampa gli effetti) e SP3 (il codice possiede il ciclo di vita delle quest): per le fasi il codice possiede **lo stato di fase e le transizioni legali**; l'AI propone il **giudizio narrativo** (siamo in un dialogo? il party riposa? lo scontro è finito?) dove non esiste un segnale meccanico. Nessun campo che reintroduca "l'AI inventa le regole": il target di una transizione è sempre un `z.enum` auto-validante e l'engine arbitra la legalità.

La distinzione cardine guida tutto il design:

- **Il combattimento è meccanicamente fondato**: ha stato reale (l'`Encounter`) e inizia/finisce con azioni di dominio. L'engine lo possiede e lo deriva.
- **Esplorazione / dialogo / downtime sono puramente narrativi**: nessun segnale meccanico li distingue. Solo la narrazione sa quando "il party parla con un PNG" diventa "il party riposa". L'AI propone l'intento; l'engine valida la transizione.

## 2. Il modello: `phase` primario, `encounter` subordinato — decisione architetturale

**Decisione (asse 1).** `phase` è il **campo dichiarato autoritativo** del `GameState`, event-sourced come `quests` (SP3). Il `combat` **non** è un secondo campo né una derivazione ad-hoc: `encounter` è una **conseguenza** dell'essere in fase `combat`.

```ts
// packages/engine/src/events.ts
export interface GameState {
  version: number;
  actors: Record<string, Actor>;
  encounter: Encounter | null;
  quests: Record<string, Quest>;
  phase: Phase;            // nuovo campo richiesto
}
export const initialState: GameState = { version: 0, actors: {}, encounter: null, quests: {}, phase: 'exploration' };
```

### Perché `phase` primario (e non "combat derivato da encounter≠null")

Le altre tre fasi (esplorazione/dialogo/downtime) **non hanno alcuna rappresentazione** nello stato attuale — sono modi puramente narrativi. Quindi un campo `phase` serve comunque. A quel punto, lasciare `combat` come derivazione (`encounter !== null`) creerebbe **due meccanismi** (un campo per le soft, una derivazione per combat) = l'`if` annidato che lo spec §5.5 vuole eliminare. Rendere `phase` l'unica fonte di verità, con `encounter` subordinato, dà una FSM pulita a quattro stati paritari.

### L'invariante (posseduta e testata dall'engine)

```
phase === 'combat'  ⟺  encounter !== null
```

È mantenuta perché `decide` emette gli eventi di transizione in **coppia atomica** (vedi §4): entrare in combat produce `[EncounterStarted, PhaseChanged{→combat}]`, uscire produce `[EncounterEnded, PhaseChanged{combat→exploration}]`. Nessun comando muta `phase` a/da `combat` senza muovere `encounter` di conseguenza. L'invariante è un **test di proprietà** sul set di comandi, non una convenzione implicita. Bonus diretto del modello: i guard `encounter === null` sparsi in `decide` diventano un **gate di fase uniforme** (§4) — il "niente if annidati sparsi" dello spec.

## 3. La FSM dichiarata (nuovo modulo `engine/phase.ts`)

Modulo puro, single-purpose, isolato come `difficulty.ts` (SP1) e `quest.ts` (SP3).

```ts
// packages/engine/src/phase.ts
export const PHASES = ['exploration', 'dialogue', 'combat', 'downtime'] as const;
export type Phase = (typeof PHASES)[number];

// Le fasi non-combat: le uniche che l'AI puo' proporre con enter_phase (combat e' modale).
export const SOFT_PHASES = ['exploration', 'dialogue', 'downtime'] as const;
export type SoftPhase = (typeof SOFT_PHASES)[number];

export const INITIAL_PHASE: Phase = 'exploration';

/** Gli ARCHI del grafo di fase (transizioni esplicite e testabili, spec §5.5).
 *  - stessa fase: non e' una transizione;
 *  - da combat: si esce SOLO verso exploration (via end_encounter);
 *  - da una fase non-combat: ogni altra fase e' raggiungibile (soft↔soft via enter_phase;
 *    soft→combat via start_encounter). */
export function canTransition(from: Phase, to: Phase): boolean {
  if (from === to) return false;
  if (from === 'combat') return to === 'exploration';
  return true;
}
```

`canTransition` è la relazione di adiacenza **dichiarata** (asse 2b: permissiva tra le fasi soft, combat modale). I vincoli duri vengono solo dall'invariante combat; non si vieta `dialogue → downtime` (la narrazione lo fa legittimamente) perché non c'è ragione *meccanica* di vietarlo.

### Action-set per fase (co-locato con `Command` in `commands.ts`)

La relazione fase→Command (asse 3) vive accanto a `Command`/`decide` (per evitare un ciclo di tipo `phase.ts ↔ commands.ts`); `phase.ts` resta puro (stati + archi).

```ts
// packages/engine/src/commands.ts
// Combat-only: operano DENTRO l'encounter (o la sua chiusura).
const COMBAT_ONLY = new Set<Command['type']>(['Attack', 'EndTurn', 'NextRound', 'EndEncounter']);
// Non-combat-only: entrano IN una fase; illegali in combat (combat e' modale).
const NON_COMBAT_ONLY = new Set<Command['type']>(['StartEncounter', 'EnterPhase']);

export function isCommandLegalInPhase(phase: Phase, type: Command['type']): boolean {
  if (COMBAT_ONLY.has(type)) return phase === 'combat';
  if (NON_COMBAT_ONLY.has(type)) return phase !== 'combat';
  return true; // phase-agnostic: spawn_npc, request_check, apply_effect, start/advance_quest
}
```

**Onestà architetturale (no over-engineering):** il gating dei *Command* è essenzialmente **combat vs non-combat** — le tre fasi soft abilitano lo stesso action-set. Ciò che le rende davvero diverse è la **strategia di prompt** (§5). Dichiariamo comunque la relazione come predicato unico e testato (è la struttura che §5.5 chiede, ed è dove Piano 11/fasi future faranno atterrare Command genuinamente per-fase), **senza fabbricare distinzioni che oggi non esistono**.

### Diagramma

```
        enter_phase (intento AI, soft↔soft, permissivo)
   ┌───────────────────────────────────────────┐
   ▼                                           ▼
exploration ⇄ dialogue ⇄ downtime   ──start_encounter──▶  combat
   ▲                                                        │
   └──────────────── end_encounter ─────────────────────────┘
                     (combat esce SOLO → exploration)
```

## 4. Command, Event, `decide` (engine)

**Command** (`commands.ts`) — due nuovi:
```ts
| { type: 'EnterPhase'; to: SoftPhase }   // l'AI propone una fase narrativa (mai 'combat')
| { type: 'EndEncounter' }                // chiude lo scontro attivo (solo in combat)
```
`EnterPhase.to` è ristretto a `SoftPhase`: l'AI non può proporre `combat` (si entra solo con `start_encounter`). `EndEncounter` non porta argomenti.

**Gate di fase uniforme** in cima a `decide` (sostituisce i guard `encounter === null` sparsi):
```ts
export function decide(state: GameState, command: Command, rng: RandomSource): DomainEvent[] {
  if (!isCommandLegalInPhase(state.phase, command.type)) {
    throw new Error(`Azione ${command.type} non disponibile in fase ${state.phase}`);
  }
  switch (command.type) { /* ... */ }
}
```

**Casi nuovi/modificati** (puri, nessun RNG per le transizioni):
```ts
case 'StartEncounter': {
  for (const p of command.participants) {
    if (state.actors[p.actorId] === undefined) throw new Error(`Attore sconosciuto: ${p.actorId}`);
  }
  return [
    { type: 'EncounterStarted', encounter: createEncounter(command.encounterId, command.participants) },
    { type: 'PhaseChanged', from: state.phase, to: 'combat' },   // coppia atomica → invariante
  ];
}
case 'EndEncounter': {
  const enc = state.encounter; // il gate garantisce phase==='combat' ⟹ enc!==null
  if (enc === null) throw new Error('Nessuno scontro attivo'); // difesa: invariante mai violata
  return [
    { type: 'EncounterEnded', encounterId: enc.id },
    { type: 'PhaseChanged', from: 'combat', to: 'exploration' },
  ];
}
case 'EnterPhase': {
  if (!canTransition(state.phase, command.to)) {
    throw new Error(`Transizione di fase non valida: ${state.phase} -> ${command.to}`);
  }
  return [{ type: 'PhaseChanged', from: state.phase, to: command.to }];
}
case 'EndTurn':  return [{ type: 'TurnEnded' }];     // niente piu' check encounter: il gate lo garantisce
case 'NextRound': return [{ type: 'RoundAdvanced' }];
```
I guard `if (state.encounter === null) throw` di `EndTurn`/`NextRound` **vengono rimossi**: il gate li rende combat-only ⟹ `encounter !== null` (invariante); `applyEvent` mantiene il suo `requireEncounter` come difesa in profondità per gli stati degeneri. `EnterPhase` rifiuta la **stessa fase** via `canTransition` (l'unico caso che oggi scatta, dato che il gate forza `from ≠ combat` e l'enum forza `to ∈ soft`).

> **Decisione `attack` combat-only (asse confermato con l'utente).** `Attack` entra in `COMBAT_ONLY`: un attacco con tiro+danno appartiene a un encounter (iniziativa/zone/turni). **Non blocca** l'attacco fuori combat: lo **incanala** — il tool `attack` è filtrato fuori dalle fasi soft (§5), quindi il modello apre prima `start_encounter` (= round di sorpresa) e poi colpisce. È il modello corretto di un'imboscata. Costo: ripple sui test di attacco fuori-scontro (devono entrare in combat prima) + il caso "un colpo" = 3 tool-call. "Attacco fuori-combat" e un helper "ambush" (start+attack) sono deferral YAGNI (§8).

**Event** (`events.ts`) — due nuovi:
```ts
| { type: 'PhaseChanged'; from: Phase; to: Phase }
| { type: 'EncounterEnded'; encounterId: string }
```
`applyEvent` (muta stato reale, come `QuestStarted` di SP3):
```ts
case 'PhaseChanged':
  return { ...bumped, phase: event.to };                 // 'from' e' provenienza (item 6), non rigiocato
case 'EncounterEnded':
  return { ...bumped, encounter: null };                 // chiude l'encounter; l'invariante torna phase≠combat con PhaseChanged
```
`from` di `PhaseChanged` è **provenienza** (per la narrazione e i confini di scena dell'item 6), non serve al proiettore. Nessun RNG nel proiettore.

## 5. Confine AI: tool filtrati per fase + frammento di prompt per-fase (`@loomn/ai`)

**Tool** (`master-tools.ts`): due nuovi (10° e 11° strumento) e il filtro per fase.
```ts
const enterPhaseSchema = z.object({ to: z.enum(SOFT_PHASES) }); // enum auto-validante: niente 'combat', niente fasi inventate
const endEncounterSchema = z.object({});                        // come end_turn

// Ogni ToolEntry dichiara il suo commandType, cosi masterToolDefs(phase) puo' filtrare senza risolvere.
interface ToolEntry { description: string; jsonSchema: Record<string, unknown>; commandType: Command['type']; resolve(json): ...; }

/** Definizioni degli strumenti ABILITATI nella fase corrente: consuma lo STESSO isCommandLegalInPhase
 *  dell'engine (single source of truth, niente mappa duplicata → niente drift). */
export function masterToolDefs(phase: Phase): LlmToolDef[] {
  return Object.entries(TOOLS)
    .filter(([, t]) => isCommandLegalInPhase(phase, t.commandType))
    .map(([name, t]) => ({ name, description: t.description, parameters: t.jsonSchema }));
}
```
`resolveToolCall` resta invariato (cerca in `TOOLS` per nome): è la rete di sicurezza autoritativa — se il modello chiama un tool non offerto, `decide` lo rifiuta col gate (asse 3: engine autoritativo + filtro come ergonomia). `enter_phase` espone solo l'enum soft; `end_encounter` ha args vuoti.

**Filtro per-iterazione** (`master-turn.ts`): `masterToolDefs(state.phase)` va ricomputato **dentro** il loop agentico (oggi è calcolato una volta prima del loop), perché la fase può cambiare durante il turno: il flusso `start_encounter` (entra in combat) → `attack` (colpisce) richiede che l'iterazione successiva veda i tool di combat.
```ts
for (let iter = 0; iter < maxIterations; iter++) {
  const toolDefs = masterToolDefs(state.phase);   // ← dentro il loop, riflette la fase corrente
  const res = await collectResponse(request.model.stream({ messages, tools: toolDefs, toolChoice: 'auto' }));
  /* ... */
}
```

**Frammento di prompt per-fase** (asse 4a): è dove le 4 fasi guadagnano identità distinta (il command-gating è binario). I dati sono un `Record<Phase, string>` interno; l'**unità modulare** è la funzione pura esportata `phaseGuidance(phase)` (testabile in isolamento e riusabile — vedi sotto il seam additivo).
```ts
const PHASE_GUIDANCE: Record<Phase, string> = {
  exploration: 'Fase: esplorazione. Descrivi luoghi e dettagli sensoriali; per iniziare uno scontro usa start_encounter.',
  dialogue:    'Fase: dialogo. Interpreta i PNG in prima persona; dai peso alle scelte sociali.',
  combat:      'Fase: combattimento. Sii tattico e conciso; usa attack/end_turn/next_round e chiudi con end_encounter quando lo scontro e risolto.',
  downtime:    'Fase: tempo libero. Ritmo riflessivo: recupero, preparativi, relazioni.',
};
export function phaseGuidance(phase: Phase): string { return PHASE_GUIDANCE[phase]; }

export function buildMasterMessages(context: string, playerAction: string, phase: Phase): LlmMessage[] {
  return [
    { role: 'system', content: `${SYSTEM_PROMPT}\n${phaseGuidance(phase)}` },
    { role: 'system', content: context },
    { role: 'user', content: playerAction },
  ];
}
```
Il frammento riflette la fase a **inizio turno** (`request.state.phase`). **Nessun buco di consapevolezza a metà turno:** se la fase cambia durante il turno, l'evento `PhaseChanged{from,to}` è già **reiniettato** nel loop col `JSON.stringify` generico esistente (come ogni evento) → il modello *sa* di aver cambiato fase. L'unico deferral è il **re-nudge di tono** (ri-iniettare la linea-guida tattica della nuova fase): è YAGNI finché la slice non mostra un lag di tono, e il seam è **puramente additivo** — la stessa `phaseGuidance(phase)` si inietta nel messaggio di reiniezione (`master-turn.ts:133-136`) quando un evento del batch è un `PhaseChanged`. Il filtro dei tool è invece per-iterazione perché è meccanicamente necessario (flusso start_encounter→attack). Coerente con spec §6.2 (la "fase" è priorità 1 *con ruolo/regole* = il livello system prompt), quindi vive in `ai` e **non** tocca il Context Assembler di `@loomn/memory`.

**Flusso del turno** (`master-turn.ts`): gli Event reali (`PhaseChanged`/`EncounterEnded`) sono reiniettati col `JSON.stringify` generico esistente — il modello li narra, come per gli eventi di SP1/SP2/SP3. Nessun altro cambiamento al loop.

## 6. Confine non fidato (`@loomn/shared`, `domain-schema.ts`)

`shared` è **foglia** → rispecchia i literal di `Phase` con un proprio `z.enum`, come `difficultySchema`/`questStatusSchema`. Il drift guard bidirezionale (`sqlite-event-store.ts:85-90`, `_EventInfer`/`_StateInfer` + forward/backward) tiene allineate le liste.
```ts
const phaseSchema = z.enum(['exploration', 'dialogue', 'combat', 'downtime']);
```
**`domainEventSchema`:** `PhaseChanged` e `EncounterEnded` **entrano direttamente nella `z.discriminatedUnion` interna** (nessun campo opzionale top-level → **non** serve l'arm `z.union` con `.transform()` di `CheckResolved`/SP1):
```ts
z.object({ type: z.literal('PhaseChanged'), from: phaseSchema, to: phaseSchema }),
z.object({ type: z.literal('EncounterEnded'), encounterId: z.string() }),
```
**`gameStateSchema`:** nuovo campo `phase: phaseSchema`. Il drift guard `_StateInfer`/`_stateForward`/`_stateBackward` resta verde.

**Snapshot persistiti:** aggiungere un campo richiesto a `GameState` rende `gameStateSchema` più stringente. Coerente con spec §6.3: lo stato si **ricostruisce sempre dagli eventi** (`replay`/`rebuild`), gli snapshot dev pre-esistenti sono usa-e-getta. **Nessuna migrazione SQLite** (la tabella `snapshots` è una stringa JSON dello stato). Il **`commandSchema`** (confine IPC renderer→main) **non** è toccato: `EnterPhase`/`EndEncounter` sono comandi interni al contesto AI (proposti dal Master via tool), non dispatch IPC del renderer — esattamente come `RequestCheck`/`ApplyEffect`/`StartQuest` di SP1/SP2/SP3.

## 7. Confini di scena per l'item 6 (substrato, fuori scope qui)

Gli eventi `PhaseChanged` sono **confini di scena veri** nello stream canonico: grazie al rifiuto della stessa-fase (`canTransition`, §3) non esistono boundary spuri. Questo è il substrato pulito su cui l'**item 6** (segmentazione `reflect` per scena) costruirà — tracciando i range già riflessi e segmentando per boundary di fase. **SP4 non implementa la segmentazione** (asse 4b): resta l'item 6, separato come nel backlog. SP4 si limita a rendere l'item 6 un follow-up pulito (i `PhaseChanged` portano `from`/`to` e il loro `seq` nello stream).

## 8. Fuori ambito (dichiarato — nessun debito silenzioso)

- **Segmentazione `reflect` per scena:** item 6 del backlog (SP4 fornisce solo il substrato, §7).
- **Re-nudge di tono per-iterazione:** se la fase cambia a metà turno, il *fatto* è già reiniettato (`PhaseChanged` nello stream → il modello lo vede); solo la ri-iniezione della **linea-guida di tono** è rimandata. Seam additivo già pronto: iniettare `phaseGuidance(phase)` nel messaggio di reiniezione quando il batch contiene un `PhaseChanged`. Validare prima con la slice (YAGNI), zero rework.
- **Attacco fuori-combat / helper "ambush" (start+attack in un colpo):** YAGNI; l'attacco fuori combat è già incanalato via `start_encounter` (§4).
- **Sotto-fasi / azioni di combat granulari** (movimento per zone come fase, fasi di reazione): l'`Encounter` resta il modello del combat; non se ne fanno sotto-fasi FSM.
- **Transizioni di combat→fase soft diversa da exploration** (es. il nemico si arrende → dialogo diretto): `end_encounter` torna sempre a `exploration`; l'AI può poi `enter_phase('dialogue')`. Una uscita parametrica è additiva se mai servisse.
- **Fase persistita per-PNG / fasi annidate, Ruleset injection (§5.3):** item deliberati successivi.

## 9. Strategia di test (TDD)

- **engine** (`phase.test.ts` nuovo, `commands.test.ts`, `events.test.ts`):
  - `phase.ts`: `PHASES`/`SOFT_PHASES` hanno i literal attesi; `SOFT_PHASES ⊂ PHASES` e non contiene `combat`; `INITIAL_PHASE === 'exploration'`. `canTransition`: stessa-fase → false; `combat → exploration` true, `combat → {dialogue,downtime}` false; da ogni soft → ogni altra fase (incl. `combat`) true.
  - `isCommandLegalInPhase`: combat-only ({Attack,EndTurn,NextRound,EndEncounter}) legali **solo** in `combat`; non-combat-only ({StartEncounter,EnterPhase}) legali in **ogni** fase tranne `combat`; phase-agnostic legali ovunque.
  - `decide` gate: ogni Command fuori fase → throw `Azione <type> non disponibile in fase <phase>`, **0 eventi**.
  - `decide(StartEncounter)`: in fase soft → `[EncounterStarted, PhaseChanged{from,→combat}]`; in `combat` → throw (gate; **chiude il doppio start_encounter**).
  - `decide(EndEncounter)`: in `combat` → `[EncounterEnded{encounterId}, PhaseChanged{combat→exploration}]`; fuori combat → throw (gate).
  - `decide(EnterPhase)`: soft→soft diversa → `[PhaseChanged{from,to}]`; stessa fase → throw `Transizione di fase non valida`, 0 eventi; in `combat` → throw (gate).
  - `decide(EndTurn/NextRound)`: in `combat` → l'evento; fuori combat → throw via gate (non più "Nessuno scontro attivo").
  - `applyEvent(PhaseChanged)`: muta `phase=to` (`version++`, actors/encounter/quests invariati); `applyEvent(EncounterEnded)`: `encounter=null`.
  - **Invariante** (test di proprietà): per ogni sequenza legale di comandi, dopo `applyEvent`, `phase==='combat' ⟺ encounter!==null`. `initialState`: `phase==='exploration'`, `encounter===null`.
  - replay deterministico: `replay([…, EncounterStarted, PhaseChanged{→combat}, EncounterEnded, PhaseChanged{combat→exploration}])` → `phase==='exploration'`, `encounter===null`.
- **ai** (`master-tools.test.ts`, `master-turn.test.ts`):
  - `masterToolDefs('combat')` espone i combat-only + i phase-agnostic, **non** start_encounter/enter_phase; `masterToolDefs('exploration')` espone start_encounter/enter_phase + phase-agnostic, **non** attack/end_turn/next_round/end_encounter. Conteggi per fase pinnati.
  - `enter_phase` mappa a `EnterPhase`; `to` fuori enum (es. `'combat'`, `'paused'`) rifiutato da Zod. `end_encounter` mappa a `EndEncounter`.
  - lo schema di `enter_phase` mostra l'enum soft (no `combat`).
  - `phaseGuidance(phase)` ritorna la linea-guida attesa per ogni fase; `buildMasterMessages(ctx, action, phase)` inietta il frammento giusto nel system prompt.
  - `runMasterTurn`: il flusso `start_encounter`→`attack` in iterazioni successive funziona (i tool di combat compaiono dopo la transizione); fake model + RNG seedato, determinismo invariato.
- **shared** (`domain-schema.test.ts`): round-trip di `PhaseChanged`/`EncounterEnded` in `domainEventSchema`; round-trip di un `GameState` con `phase` non-default in `gameStateSchema`; il tipo inferito resta assegnabile a `DomainEvent`/`GameState` (drift guard); `phase` fuori enum rifiutato.

> **Bug apostrofo (house rule §5.4):** nelle descrizioni `it('...')`/`describe('...')` in apici singoli, niente apostrofi. Grep di verifica del piano: `(it|describe)\('[^']*'[A-Za-zàèéìòù]` → no matches.

## 10. File toccati (orientativo per il piano)

- `packages/engine/src/`: **nuovo** `phase.ts` (+ `phase.test.ts`); `commands.ts` (+ test: `isCommandLegalInPhase`, gate, `EnterPhase`/`EndEncounter`, `StartEncounter`/`EndTurn`/`NextRound` aggiornati); `events.ts` (+ test: `GameState.phase`, `initialState.phase`, `PhaseChanged`/`EncounterEnded` in `applyEvent`, invariante); `index.ts` (re-export di `phase`).
- `packages/shared/src/`: `domain-schema.ts` (phaseSchema, domainEventSchema, gameStateSchema) (+ `domain-schema.test.ts`).
- `packages/ai/src/`: `master-tools.ts` (enter_phase/end_encounter, `commandType` su ToolEntry, `masterToolDefs(phase)`) e `master-turn.ts` (filtro per-iterazione, `PHASE_GUIDANCE`, `buildMasterMessages(…, phase)`) (+ `master-tools.test.ts`, `master-turn.test.ts`).
- **Ripple del campo `phase` richiesto in `GameState`** (letterali da aggiornare con `phase: 'exploration'`, per la disciplina di scope): i letterali di `GameState`/read-model in `packages/host/src/campaign-service.test.ts`, `packages/shared/src/ipc.test.ts` e `domain-schema.test.ts`, `packages/memory/src/context-assembler.test.ts` (es. `HERO_STATE`). I file che derivano da `initialState`/`replay` ereditano `phase` gratis.
- **Ripple `attack` combat-only**: i test `decide(Attack)` fuori-scontro (`commands.test.ts`) devono prima entrare in combat (replay di `ActorAdded`×2 + `EncounterStarted` + `PhaseChanged{→combat}`, o helper). `combat.test.ts` (testa `performAttack` puro) **non** è toccato.
- **Ripple firma `masterToolDefs`/`buildMasterMessages`**: solo dentro `@loomn/ai` (master-turn + test); `host`/`app/desktop` chiamano `runMasterTurn`, non queste.
- **Tre pacchetti** (engine + shared + ai). **Niente** modifiche a `@loomn/memory` (Context Assembler), `reflection-ports.ts`/`host` (produzione), `commandSchema`, `app/desktop`/UI, migrazioni SQLite.

## 11. Acceptance

- Le fasi sono una **FSM esplicita e testabile**: `phase.ts` dichiara stati, archi (`canTransition`) e action-set per fase (`isCommandLegalInPhase`) come funzioni pure; niente `if` annidati sparsi.
- `phase` è il campo autoritativo del `GameState`; l'**invariante `phase==='combat' ⟺ encounter!==null`** è imposta da `decide` (coppie atomiche) e verificata da un test di proprietà.
- Le transizioni sono eventi `PhaseChanged` (con `from`/`to`) nello stream canonico, replay-safe; `EncounterEnded` chiude lo scontro. `decide`/`applyEvent` restano puri.
- Ogni fase **abilita Command diversi** (gate autoritativo in `decide`) e i tool sono **filtrati per fase** in `ai` consumando lo stesso predicato (single source of truth); ogni fase ha una **strategia di prompt diversa** (frammento per-fase).
- Le transizioni innescate: combat via `start_encounter`/`end_encounter` (engine-grounded); soft via `enter_phase` (intento AI validato). `enter_phase('combat')` e una fase inventata sono **rifiutati** (enum + gate). Il doppio `start_encounter` è rifiutato (bug latente chiuso).
- `attack` è combat-only: l'attacco fuori combat è **incanalato** via `start_encounter`, non perso.
- Nessun nuovo debito silenzioso; i deferral (segmentazione reflect, re-framing per-iterazione, ambush, sotto-fasi, uscita combat parametrica, Ruleset) sono dichiarati e assegnati.
- `GameState` acquisisce `phase` come campo richiesto; lo stato si ricostruisce dallo stream (nessuna migrazione manuale). Drift guard verde.
