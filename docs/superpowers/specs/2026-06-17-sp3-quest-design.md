# SP3 — Quest in L1 + `advance_quest`: il Master traccia gli obiettivi, l'engine possiede lo stato (design)

> **Data:** 2026-06-17 · **Tipo:** design/spec · **Traccia:** engine/AI (item 3 di HANDOFF §0-quinquies) · **Sotto-progetto:** SP3 di 4 · **Cross-package** (engine + shared + ai + memory).
> **Autorità:** spec di design `2026-06-15-simulatore-campagne-ai-design.md` (§5.4 AI Master, §6 memoria a strati L1/L1.5/L2). Questo doc è subordinato a quello.

## 0. Contesto e posizione nella traccia engine

La traccia engine (item 3 del backlog pre-Piano 10) realizza gli strumenti del Master rimandati dal Piano 7c — `request_check`, `apply_effect`, `advance_quest` (spec §5.4) — più il **contesto quest** in L1 e la **FSM di fase** (§5.5), decomposta in 4 sotto-progetti (vedi SP1 §0):

- **SP1 — `request_check`** ✅ fatto (`c04d9a3`): Command/Event per le prove, band di difficoltà→CD.
- **SP2 — `apply_effect`** ✅ fatto (`dbee1a8`): Command/Event per i delta di risorsa, dadi tirati dall'engine.
- **SP3 — Quest in L1 + `advance_quest`** *(questo doc)*: nuova entità `Quest` nel `GameState`, eventi del ciclo di vita, contesto quest reso in L1. **È il primo SP che cambia la forma del `GameState`** (nuovo campo `quests`) e tocca anche `@loomn/memory` (resa L1) → cross-package.
- **SP4 — FSM di fase (§5.5)**: per ultima, vincola un vocabolario di Command completo e fissa i confini di scena (item 6 del backlog).

## 1. Principio: il codice è l'arbitro anche per le quest

> *Il codice è l'arbitro, l'AI è il narratore.* (spec, principio sacro)

Per i **check** (SP1) il codice possiede i numeri (band→CD, tiro); per gli **effetti** (SP2) il codice tira e clampa. Una quest non ha "numeri" — quindi qui il codice possiede lo **stato e le sue transizioni legali**:

- non puoi **avanzare** una quest inesistente;
- non puoi **avanzare** una quest già terminata (completata/fallita);
- non puoi **creare** una quest con un id già esistente.

L'AI propone il **contenuto narrativo** (titolo, eventuale descrizione dell'obiettivo) e l'**intento** (avvia / porta a esito); l'engine valida la FSM del ciclo di vita in modo deterministico e replay-safe. Nessun campo che reintroduca "l'AI inventa le regole".

## 2. Il modello dati: `Quest` minimale (solo stato) — decisione architetturale

L'entità Quest in L1 modella **solo i fatti meccanici autorevoli** di una quest: che esiste, la sua identità, il suo stato. Il **racconto** della quest (cosa ha fatto il giocatore, svolte, tradimenti) è **narrazione** → vive in L1.5/L2, dove **F4 lo instrada già** via `NarrationRecorded`.

**Nuovo modulo engine `quest.ts`** (single-purpose, isolato come `difficulty.ts` di SP1):

```ts
// I due esiti terminali che l'AI puo' proporre (sottoinsieme avanzabile-a).
export const QUEST_OUTCOMES = ['completed', 'failed'] as const;
export type QuestOutcome = (typeof QUEST_OUTCOMES)[number];

// Stati completi: 'active' (creazione) + gli esiti terminali.
export const QUEST_STATUSES = ['active', ...QUEST_OUTCOMES] as const; // ['active','completed','failed']
export type QuestStatus = (typeof QUEST_STATUSES)[number];

export interface Quest {
  id: string;
  title: string;
  description?: string; // statement canonico dell'obiettivo, fissato alla creazione (NON progresso narrativo)
  status: QuestStatus;
}
```

`GameState` acquisisce un nuovo campo **`quests: Record<string, Quest>`** (accanto a `actors`/`encounter`); `initialState.quests = {}`.

### Perché "solo stato" è la scelta a zero debiti (non la scelta magra)

1. **È la decomposizione corretta secondo l'architettura di memoria dello spec, non una semplificazione.** Lo spec §6 elenca le quest tra i *"fatti meccanici autorevoli"* di L1 e impone che *"tutti i livelli derivano dallo stream… non sono un sistema parallelo da sincronizzare → niente debito di sync"*. I fatti autorevoli di una quest sono esistenza + identità + stato. Aggiungere alla quest un `progress: string[]` o obiettivi semi-narrativi rimetterebbe **narrazione in L1** = duplicherebbe L2 = **il debito di sync che lo spec vieta**. Separazione di strato corretta: la storia la possiede già la memoria (via F4).
2. **FSM pulita, interamente posseduta dall'engine** (`active → completed | failed`, terminali immutabili): banale da testare, replay-safe, "il codice è l'arbitro" nella forma più pura per le quest.
3. **Nessun hazard silenzioso.** Niente indirizzamento di sotto-obiettivi (indice fragile / id da riecheggiare = rischio G3/G4), niente pre-pianificazione rigida del checklist.
4. **Estensibile senza rework, e dichiarato.** Obiettivi discreti, ricompense, link quest↔PNG sono **puramente additivi** (campi opzionali nuovi + eventi nuovi) — migrazione in stile `dcForDifficulty`, non riscrittura. Sono deferral §7, non debito silenzioso.

`description` è opzionale ed è lo **statement dell'obiettivo** (es. "Recuperare l'Amuleto di Pietranera per il Barone Vhalmar"), fissato alla creazione e autorevole come il nome di un PNG — non è progresso narrativo (quello passa da `NarrationRecorded`).

## 3. Command, Event, risoluzione (engine)

**Command** (`packages/engine/src/commands.ts`):
```ts
| { type: 'StartQuest'; id: string; title: string; description?: string }
| { type: 'AdvanceQuest'; questId: string; status: QuestOutcome }
```
L'AI **non** passa lo stato alla creazione: lo stato iniziale `'active'` è posseduto dall'engine (come per `spawn_npc` che non passa le condizioni). `AdvanceQuest.status` è ristretto a `QuestOutcome` (`completed`/`failed`): non si può "avanzare a active".

`decide()` (puro, nessun RNG per questi due comandi):
```ts
case 'StartQuest': {
  if (state.quests[command.id] !== undefined) {
    throw new Error(`Quest già presente: ${command.id}`);
  }
  const quest: Quest = {
    id: command.id,
    title: command.title,
    status: 'active',
    ...(command.description !== undefined ? { description: command.description } : {}),
  };
  return [{ type: 'QuestStarted', quest }];
}
case 'AdvanceQuest': {
  const quest = state.quests[command.questId];
  if (quest === undefined) {
    throw new Error(`Quest sconosciuta: ${command.questId}`);
  }
  if (quest.status !== 'active') {
    throw new Error(`Quest già terminata (${quest.status}): ${command.questId}`);
  }
  return [{ type: 'QuestAdvanced', questId: command.questId, status: command.status }];
}
```

**Event** (`packages/engine/src/events.ts`):
```ts
| { type: 'QuestStarted'; quest: Quest }
| { type: 'QuestAdvanced'; questId: string; status: QuestOutcome }
```
`applyEvent` (a differenza di SP1/SP2 **muta stato reale**, è il primo SP a farlo per una nuova struttura):
```ts
case 'QuestStarted':
  return { ...bumped, quests: { ...state.quests, [event.quest.id]: event.quest } };
case 'QuestAdvanced': {
  const quest = state.quests[event.questId];
  if (quest === undefined) {
    throw new Error(`Quest sconosciuta: ${event.questId}`); // come requireActor: lo stream è coerente
  }
  return { ...bumped, quests: { ...state.quests, [event.questId]: { ...quest, status: event.status } } };
}
```
`applyEvent(QuestAdvanced)` si fida dello stream (la legalità è già stata arbitrata in `decide`), ma richiede la quest esistente come `requireActor` per gli altri eventi (replay-safe; lo stream non contiene mai un `QuestAdvanced` orfano). Nessun RNG nel proiettore.

## 4. Confine AI: tool, flusso del turno, memoria

**Tool** (`packages/ai/src/master-tools.ts`): **8° e 9° strumento** (dopo SP2 i tool sono 7), mirror di `spawn_npc` (crea) vs `attack` (opera).
```ts
const startQuestSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1).optional(),
});
const advanceQuestSchema = z.object({
  questId: z.string().min(1),
  status: z.enum(QUEST_OUTCOMES), // QUEST_OUTCOMES importato dall'engine: singola fonte, niente drift
});
```
`status` è un **enum auto-validante**: l'AI non può inventare un esito (Zod lo rifiuta) — il rovescio coercitivo-ma-strict di G1/G6, identico a `difficulty` (SP1) e `direction` (SP2). `masterToolDefs()` espone ora **9 tool**. È l'**unico** tocco a `@loomn/ai`.

**Flusso del turno** (`master-turn.ts`): **nessuna modifica.** Gli Event reali sono reiniettati con un `JSON.stringify` generico (`master-turn.ts:128`): `QuestStarted`/`QuestAdvanced` ci passano automaticamente come `CheckResolved`/`ResourceEffectApplied` oggi — il modello legge il JSON e narra.

**Memoria — Reflection** (`reflection-ports.ts`): **nessuna modifica.** `renderEventsForReflection` non è uno switch esaustivo: gli eventi diversi da `NarrationRecorded` cadono nel ramo generico (`#seq <type> <json>`) — `QuestStarted`/`QuestAdvanced` inclusi. `EXTRACT_SYSTEM` istruisce di **non** estrarre lo stato meccanico già tracciato dal motore: lo stato della quest è ora in L1, quindi non va promosso a fatto L1.5 (la *storia* della quest la porta `NarrationRecorded`). Comportamento già corretto — da confermare nel self-review.

## 5. Il contesto quest entra in L1 (`@loomn/memory`, Context Assembler)

`renderL1` (`context-assembler.ts`) acquisisce un blocco **"Quest attive"**, reso **solo quando esiste almeno una quest attiva** (così lo stato senza quest rende identico a oggi → i test L1 esistenti restano verdi e L1 resta snello):
```ts
const activeQuests = Object.values(state.quests)
  .filter((q) => q.status === 'active')
  .sort((a, b) => byId(a.id, b.id)); // determinismo (come gli altri render)
const quests =
  activeQuests.length > 0
    ? `Quest attive (L1):\n${activeQuests
        .map((q) => `- ${q.title} (id=${q.id})${q.description !== undefined ? `: ${q.description}` : ''}`)
        .join('\n')}`
    : '';
return [`Stato attuale (L1):\n${list}\n${enc}`, quests].filter((b) => b.length > 0).join('\n\n');
```
Le quest **terminate escono dal contesto attivo**: la loro conclusione è narrata → finisce in L1.5/L2 via F4. Questo è il "contesto quest in L1" del mandato. Il blocco quest fa parte di L1 (priorità 2, **mai tagliato** dal budget di token), coerente con `renderL1`.

> `byId` esiste già in `context-assembler.ts` (tie-break stabile). Nessuna interazione con il filtro L1.5 per soggetti in scena (quello resta sugli attori); le quest sono un blocco L1 a sé.

## 6. Confine non fidato (`@loomn/shared`, `domain-schema.ts`)

`shared` è **foglia** (non importa engine) → rispecchia i literal degli stati con propri `z.enum`, esattamente come `difficultySchema` rispecchia `DIFFICULTIES` (SP1) e `outcomeSchema` rispecchia `Outcome`. Il drift guard bidirezionale (`sqlite-event-store.ts`) tiene allineate le liste.

```ts
const questStatusSchema = z.enum(['active', 'completed', 'failed']);
const questOutcomeSchema = z.enum(['completed', 'failed']);

// description opzionale: .transform() la OMETTE quando assente -> tipo inferito assegnabile 1:1 a
// Quest sotto exactOptionalPropertyTypes (pattern di dieGroupSchema). La transform è NIDIFICATA
// dentro `quest`, quindi l'evento QuestStarted resta un ZodObject e può stare nella discriminatedUnion.
const questSchema = z
  .object({ id: z.string(), title: z.string(), description: z.string().optional(), status: questStatusSchema })
  .transform((o) =>
    o.description === undefined
      ? { id: o.id, title: o.title, status: o.status }
      : { id: o.id, title: o.title, status: o.status, description: o.description },
  );
```

**`domainEventSchema`:** `QuestStarted` e `QuestAdvanced` **entrano direttamente nella `z.discriminatedUnion` interna** (nessun campo opzionale **top-level**: `QuestStarted` ha solo `quest`, l'opzionale `description` è nidificato e gestito dalla transform di `questSchema`; `QuestAdvanced` ha `questId`/`status` entrambi richiesti). **Non** serve l'arm `z.union` con transform top-level di `CheckResolved` (SP1).
```ts
z.object({ type: z.literal('QuestStarted'), quest: questSchema }),
z.object({ type: z.literal('QuestAdvanced'), questId: z.string(), status: questOutcomeSchema }),
```

**`gameStateSchema`:** nuovo campo `quests: z.record(z.string(), questSchema)`. Il drift guard `_StateInfer`/`_StateForward`/`_StateBackward` resta verde con la transform nidificata.

**Snapshot persistiti:** aggiungere un campo richiesto a `GameState` rende `gameStateSchema` più stringente. Coerente con spec §6.3 (*"migrazioni di memoria = rebuild dallo stream; mai migrazioni manuali fragili"*): lo stato si **ricostruisce sempre dagli eventi** (`replay`/`rebuild`), gli eventuali snapshot dev pre-esistenti sono usa-e-getta. **Nessuna migrazione SQLite** (la tabella `snapshots` non cambia: lo snapshot è una stringa JSON dello stato). Il `commandSchema` (confine IPC renderer→main) **non** è toccato: `StartQuest`/`AdvanceQuest` sono interni al contesto AI (proposti dal Master via tool), non un dispatch IPC del renderer — esattamente come `RequestCheck`/`ApplyEffect` di SP1/SP2 restano fuori da `commandSchema`.

## 7. Fuori ambito (dichiarato — nessun debito silenzioso)

- **Obiettivi/checklist discreti** (`objectives: { description, done }[]`): additivi, future SP. Aprono il problema di indirizzamento (indice/id) → fuori scope ora.
- **`abandoned` come stato distinto:** `failed` copre "non riuscita/abbandonata" a livello narrativo. Additivo se mai servisse.
- **Ricompense / link quest↔PNG↔luogo** (quest giver, reward su completamento): entangled col vocabolario (item 4/Piano 11) e con `apply_effect` (SP2). Non auto-applicati: è l'AI che, vista la quest completata, propone l'`apply_effect` (principio §5.4, come check→conseguenza in SP1/SP2).
- **Riapertura di una quest terminata:** YAGNI; l'AI può avviarne una nuova. La FSM resta a senso unico.
- **FSM di fase (§5.5):** SP4. **Ruleset injection (§5.3):** item deliberato successivo.

## 8. Strategia di test (TDD)

- **engine** (`quest.test.ts` nuovo, `commands.test.ts`, `events.test.ts`):
  - `quest.ts`: `QUEST_STATUSES`/`QUEST_OUTCOMES` hanno i literal attesi; `QUEST_OUTCOMES ⊂ QUEST_STATUSES`.
  - `decide(StartQuest)`: crea `QuestStarted` con `status:'active'` (con/senza `description`); id duplicato → throw, **0 eventi**.
  - `decide(AdvanceQuest)`: quest attiva → `QuestAdvanced` con lo stato richiesto; quest sconosciuta → throw, 0 eventi; quest **già terminata** → throw, 0 eventi.
  - `applyEvent(QuestStarted)`: aggiunge la quest (`version++`, attori/encounter invariati); `applyEvent(QuestAdvanced)`: aggiorna lo `status` della quest; `QuestAdvanced` su quest assente → throw.
  - replay deterministico: `replay([QuestStarted, QuestAdvanced])` → quest nello stato terminale atteso; `initialState.quests === {}`.
- **ai** (`master-tools.test.ts`): `start_quest` mappa a `StartQuest` (con/senza `description`); `advance_quest` mappa a `AdvanceQuest`; `status`/`outcome` **invalido** (es. `'active'`, `'paused'`) rifiutato da Zod; `masterToolDefs()` espone **9 tool** e lo schema di `advance_quest` mostra l'enum degli esiti.
- **shared** (`domain-schema.test.ts`): round-trip di `QuestStarted` (con/senza `description`) e `QuestAdvanced` in `domainEventSchema`; round-trip di un `GameState` con `quests` non vuoto in `gameStateSchema`; il tipo inferito resta assegnabile a `DomainEvent`/`GameState` (drift guard); `description` assente è **omessa** (non `undefined`).
- **memory** (`context-assembler.test.ts`): con quest attive, L1 include il blocco "Quest attive" (ordinato per id, con/senza `description`); con sole quest terminate (o nessuna), **nessun** blocco quest; il blocco quest non è mai tagliato dal budget (fa parte di L1). I test esistenti (stato senza quest) restano verdi invariati.

> **Bug apostrofo (house rule §5.4):** nelle descrizioni `it('...')`/`describe('...')` in apici singoli, niente apostrofi (`l'`, `un'`, `dell'`). Grep di verifica del piano: `(it|describe)\('[^']*'[A-Za-zàèéìòù]` → no matches.

## 9. File toccati (orientativo per il piano)

- `packages/engine/src/`: **nuovo** `quest.ts` (+ `quest.test.ts`), `events.ts` (+ test: nuovi eventi, `GameState.quests`, `initialState.quests`, `applyEvent`), `commands.ts` (+ test: nuovi Command, `decide`), `index.ts` (re-export di `quest`).
- `packages/shared/src/`: `domain-schema.ts` (questSchema, gameStateSchema, domainEventSchema) (+ `domain-schema.test.ts`).
- `packages/ai/src/`: `master-tools.ts` (+ `master-tools.test.ts`).
- `packages/memory/src/`: `context-assembler.ts` (renderL1) (+ `context-assembler.test.ts`).
- **Ripple del campo `quests` richiesto in `GameState`** (letterali da aggiornare con `quests: {}`, per la disciplina di scope): `packages/host/src/campaign-service.test.ts` (l'`toEqual` del read model vuoto), `packages/shared/src/ipc.test.ts` (i `readModelPushSchema.parse({...})`), `packages/shared/src/domain-schema.test.ts` (i `gameStateSchema.parse({...})`), `packages/memory/src/context-assembler.test.ts` (il letterale `HERO_STATE`). I file che usano `initialState`/`applyEvent` (`commands.test.ts`, `host/wiring.test.ts`, `memory-system.test.ts`, `master-turn.ts`) ereditano `quests: {}` gratis.
- **Quattro pacchetti** (engine + shared + ai + memory), tocchi piccoli per pacchetto. **Niente** modifiche a `master-turn.ts`, `reflection-ports.ts`/`host` (produzione), `commandSchema`, `app/desktop`/UI, migrazioni SQLite.

## 10. Acceptance

- L'AI può **avviare** una quest (titolo, descrizione opzionale) e **portarla a esito** (`completed`/`failed`) via tool; l'engine possiede lo stato e rifiuta le transizioni illegali (id duplicato, quest sconosciuta, quest già terminata) — throw, **0 eventi**.
- Un esito inventato/fuori enum è **rifiutato** (Zod), non interpretato.
- `decide`/`applyEvent` restano puri e replay-safe; `QuestStarted`/`QuestAdvanced` mutano **solo** `quests` (+ `version`), mai `actors`/`encounter`.
- Il **contesto quest entra in L1**: le quest **attive** compaiono nel contesto assemblato (mai tagliate); le terminate escono. I test L1 esistenti restano verdi.
- `GameState` acquisisce `quests` come campo richiesto; lo stato si ricostruisce dallo stream (nessuna migrazione manuale). Drift guard verde.
- Nessun nuovo debito silenzioso; i deferral (obiettivi, ricompense, riapertura, FSM, Ruleset) sono dichiarati e assegnati.
