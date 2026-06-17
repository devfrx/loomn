# SP3 — Quest in L1 + `advance_quest` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere l'entità `Quest` (solo stato) al dominio dell'engine, con il ciclo di vita `start`/`advance` posseduto dal codice, esposto al Master via tool `start_quest`/`advance_quest`, e reso in L1 dal Context Assembler.

**Architecture:** L'engine possiede la FSM della quest (`active → completed | failed`, terminali immutabili) e le transizioni legali; l'AI propone contenuto narrativo (titolo/descrizione) e intento. Nuovo modulo `quest.ts` (isolato come `difficulty.ts`), nuovo campo richiesto `quests: Record<string, Quest>` in `GameState`, eventi `QuestStarted`/`QuestAdvanced` validati al confine `@loomn/shared`, tool in `@loomn/ai`, blocco "Quest attive" in `renderL1` di `@loomn/memory`. La *storia* della quest resta in L1.5/L2 (via `NarrationRecorded`, F4) — niente narrazione in L1.

**Tech Stack:** TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Zod, Vitest, monorepo pnpm. Spec di riferimento: `docs/superpowers/specs/2026-06-17-sp3-quest-design.md`.

**Autorità:** spec di design `2026-06-15-simulatore-campagne-ai-design.md` (§5.4, §6). Sotto-progetto **SP3 di 4** della traccia engine (dopo SP1 `request_check` e SP2 `apply_effect`).

---

## Disciplina di scope (in OGNI task — house rules §5)

- Ogni task modifica **SOLO** i file elencati nella sua sezione **Files**. **MAI** toccare `package.json`, `tsconfig*.json`, `vitest.config.ts`; mai creare un tsconfig di root o aggiungere `composite`/project references.
- Verifica `git status --short` **prima** di ogni commit: solo i file attesi.
- **Bug apostrofo:** nelle descrizioni `it('...')`/`describe('...')` in apici singoli, **niente apostrofi** (`l'`, `un'`, `dell'`, `c'è`). Scrivi senza (`l attore`, `c e`); `è/é` vanno bene. Grep di verifica: `(it|describe)\('[^']*'[A-Za-zàèéìòù]` → no matches.
- I file si creano con lo strumento Write (non `New-Item -Force`).
- Comandi dalla **root** del repo. Per girare un singolo file di test: `pnpm exec vitest run packages/<pkg>/src/<file>.test.ts`. Typecheck di pacchetto: `pnpm -C packages/<pkg> typecheck`. Typecheck globale: `pnpm -r typecheck`.

**Conteggi test cumulativi attesi:** baseline **329** → T1 **331** → T2 **340** → T3 **348** → T4 **354** → T5 **358**.

---

## Task 1: Modulo `quest.ts` (engine — tipi + costanti di stato)

Modulo isolato (come `difficulty.ts`): tipi `Quest`/`QuestStatus`/`QuestOutcome` e le costanti degli stati. Nessuna modifica al `GameState` ancora.

**Files:**
- Create: `packages/engine/src/quest.ts`
- Create: `packages/engine/src/quest.test.ts`
- Modify: `packages/engine/src/index.ts` (re-export di `quest`)

- [ ] **Step 1: Scrivi il test che fallisce**

`packages/engine/src/quest.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { QUEST_STATUSES, QUEST_OUTCOMES } from './quest';

describe('costanti di stato delle quest', () => {
  it('QUEST_STATUSES ha i tre stati attesi', () => {
    expect(QUEST_STATUSES).toEqual(['active', 'completed', 'failed']);
  });

  it('QUEST_OUTCOMES e il sottoinsieme terminale di QUEST_STATUSES', () => {
    expect(QUEST_OUTCOMES).toEqual(['completed', 'failed']);
    for (const o of QUEST_OUTCOMES) {
      expect(QUEST_STATUSES).toContain(o);
    }
    expect(QUEST_OUTCOMES).not.toContain('active');
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `pnpm exec vitest run packages/engine/src/quest.test.ts`
Expected: FAIL (`Cannot find module './quest'` o simile).

- [ ] **Step 3: Implementa il modulo**

`packages/engine/src/quest.ts`:
```ts
// Quest = obiettivo del giocatore. In L1 modella SOLO i fatti meccanici autorevoli (esiste,
// identita, stato): il CODICE possiede la FSM del ciclo di vita (il codice e l arbitro). La
// STORIA della quest (svolte, tradimenti) e narrazione -> vive in L1.5/L2 (via NarrationRecorded,
// F4), non qui. Modulo isolato come difficulty.ts. Stati e esiti come liste esplicite (zero
// rischio di inferenza; il test fissa l invariante QUEST_OUTCOMES sottoinsieme di QUEST_STATUSES).

// Esiti terminali che l AI puo' proporre con advance_quest (sottoinsieme avanzabile-a).
export const QUEST_OUTCOMES = ['completed', 'failed'] as const;
export type QuestOutcome = (typeof QUEST_OUTCOMES)[number];

// Stati completi: 'active' (creazione, posseduto dall engine) + gli esiti terminali.
export const QUEST_STATUSES = ['active', 'completed', 'failed'] as const;
export type QuestStatus = (typeof QUEST_STATUSES)[number];

export interface Quest {
  id: string;
  title: string;
  description?: string; // statement canonico dell obiettivo, fissato alla creazione (NON progresso)
  status: QuestStatus;
}
```

`packages/engine/src/index.ts` — aggiungi il re-export di `quest` dopo `difficulty` (riga 4):
```ts
export * from './check';
export * from './difficulty';
export * from './quest';
export * from './actor';
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `pnpm exec vitest run packages/engine/src/quest.test.ts`
Expected: PASS (2 test).
Run: `pnpm -C packages/engine typecheck`
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/quest.ts packages/engine/src/quest.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): modulo quest (tipi Quest/QuestStatus/QuestOutcome + costanti di stato) (SP3)"
```

---

## Task 2: `quests` nel `GameState` + eventi `QuestStarted`/`QuestAdvanced` + confine shared (+ ripple)

Il cambio di forma del `GameState` (nuovo campo **richiesto** `quests`) e i due eventi del ciclo di vita. È atomico cross-package: aggiungere `quests` a `GameState` rompe subito il **drift guard** in `memory` (che confronta `GameState` con `gameStateSchema`) e i letterali `GameState` in alcuni test → engine + shared + i letterali di ripple vanno aggiornati nello **stesso** commit per restare verdi.

**Files:**
- Modify: `packages/engine/src/events.ts` (campo `quests`, `initialState`, due eventi, `applyEvent`)
- Modify: `packages/engine/src/events.test.ts` (test dei nuovi eventi)
- Modify: `packages/shared/src/domain-schema.ts` (`questSchema`, `gameStateSchema.quests`, due eventi in `domainEventSchema`)
- Modify: `packages/shared/src/domain-schema.test.ts` (round-trip nuovi eventi + stato con quests; aggiorna i letterali esistenti)
- Modify: `packages/shared/src/ipc.test.ts` (aggiungi `quests: {}` al letterale di stato in `readModelPushSchema.parse`)
- Modify: `packages/memory/src/context-assembler.test.ts` (aggiungi `quests: {}` a `HERO_STATE`)
- Modify: `packages/host/src/campaign-service.test.ts` (aggiungi `quests: {}` al letterale dello stato nel `toEqual`)

- [ ] **Step 1: Scrivi i test che falliscono (engine)**

In `packages/engine/src/events.test.ts`, aggiungi questi test dentro il `describe('applyEvent', () => { ... })` esistente (dopo il test `ResourceEffectApplied lancia su risorsa sconosciuta`, prima della chiusura del describe):
```ts
  it('QuestStarted aggiunge la quest attiva e incrementa la versione', () => {
    const s = applyEvent(initialState, {
      type: 'QuestStarted',
      quest: { id: 'q1', title: 'Trova l amuleto', status: 'active' },
    });
    expect(s.quests['q1']).toEqual({ id: 'q1', title: 'Trova l amuleto', status: 'active' });
    expect(s.actors).toEqual(initialState.actors);
    expect(s.encounter).toEqual(initialState.encounter);
    expect(s.version).toBe(1);
  });

  it('QuestAdvanced aggiorna lo stato della quest', () => {
    const started = applyEvent(initialState, {
      type: 'QuestStarted',
      quest: { id: 'q1', title: 'Trova l amuleto', status: 'active' },
    });
    const s = applyEvent(started, { type: 'QuestAdvanced', questId: 'q1', status: 'completed' });
    expect(s.quests['q1']?.status).toBe('completed');
    expect(s.version).toBe(2);
  });

  it('QuestAdvanced lancia su quest sconosciuta', () => {
    expect(() =>
      applyEvent(initialState, { type: 'QuestAdvanced', questId: 'ignota', status: 'completed' }),
    ).toThrow('Quest sconosciuta: ignota');
  });

  it('initialState ha quests vuoto', () => {
    expect(initialState.quests).toEqual({});
  });
```

E in `packages/engine/src/events.test.ts` aggiungi un test di replay dentro il `describe('replay', () => { ... })` (dopo il test esistente):
```ts
  it('ricostruisce una quest fino allo stato terminale', () => {
    const events: DomainEvent[] = [
      { type: 'QuestStarted', quest: { id: 'q1', title: 'Salva il villaggio', status: 'active' } },
      { type: 'QuestAdvanced', questId: 'q1', status: 'failed' },
    ];
    const s = replay(events);
    expect(s.version).toBe(2);
    expect(s.quests['q1']?.status).toBe('failed');
  });
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `pnpm exec vitest run packages/engine/src/events.test.ts`
Expected: FAIL (i tipi `QuestStarted`/`QuestAdvanced` non esistono ancora; `quests` non e su `GameState`).

- [ ] **Step 3: Implementa engine (`events.ts`)**

In `packages/engine/src/events.ts`:

a) aggiungi l'import di `Quest` in cima (dopo gli import esistenti):
```ts
import type { Quest } from './quest';
```

b) estendi `DomainEvent` con i due eventi (dopo `ResourceEffectApplied`, riga 19):
```ts
  | { type: 'ResourceEffectApplied'; targetId: string; resource: string; delta: number; roll: RollResult }
  | { type: 'QuestStarted'; quest: Quest }
  | { type: 'QuestAdvanced'; questId: string; status: QuestOutcome };
```
e aggiungi `QuestOutcome` all'import da `./quest`:
```ts
import type { Quest, QuestOutcome } from './quest';
```

c) aggiungi il campo `quests` a `GameState` e a `initialState`:
```ts
export interface GameState {
  version: number;
  actors: Record<string, Actor>;
  encounter: Encounter | null;
  quests: Record<string, Quest>;
}

export const initialState: GameState = { version: 0, actors: {}, encounter: null, quests: {} };
```

d) aggiungi i due casi a `applyEvent` (dentro lo `switch`, dopo il caso `ResourceEffectApplied`, prima di `ActorDowned`):
```ts
    case 'QuestStarted':
      return { ...bumped, quests: { ...state.quests, [event.quest.id]: event.quest } };
    case 'QuestAdvanced': {
      const quest = state.quests[event.questId];
      if (quest === undefined) {
        throw new Error(`Quest sconosciuta: ${event.questId}`);
      }
      return { ...bumped, quests: { ...state.quests, [event.questId]: { ...quest, status: event.status } } };
    }
```

- [ ] **Step 4: Esegui i test engine e verifica che passino**

Run: `pnpm exec vitest run packages/engine/src/events.test.ts`
Expected: PASS (tutti, inclusi i 5 nuovi).
Run: `pnpm -C packages/engine typecheck`
Expected: nessun errore.

- [ ] **Step 5: Scrivi i test che falliscono (shared)**

In `packages/shared/src/domain-schema.test.ts`, dentro il `describe('domainEventSchema', ...)` (vicino agli altri round-trip evento) aggiungi:
```ts
  it('fa round-trip di QuestStarted con description', () => {
    const event = {
      type: 'QuestStarted' as const,
      quest: { id: 'q1', title: 'Trova l amuleto', description: 'Recuperalo per il Barone', status: 'active' as const },
    };
    expect(domainEventSchema.parse(event)).toEqual(event);
  });

  it('fa round-trip di QuestStarted senza description (omessa, non undefined)', () => {
    const event = {
      type: 'QuestStarted' as const,
      quest: { id: 'q1', title: 'Trova l amuleto', status: 'active' as const },
    };
    const parsed = domainEventSchema.parse(event);
    expect(parsed).toEqual(event);
    if (parsed.type !== 'QuestStarted') throw new Error('atteso QuestStarted');
    expect('description' in parsed.quest).toBe(false);
  });

  it('fa round-trip di QuestAdvanced', () => {
    const event = { type: 'QuestAdvanced' as const, questId: 'q1', status: 'completed' as const };
    expect(domainEventSchema.parse(event)).toEqual(event);
  });
```

E dentro il `describe('gameStateSchema', ...)` aggiungi:
```ts
  it('fa round-trip di uno stato con quests non vuoto', () => {
    const s = {
      version: 4,
      actors: { eroe: fullActor },
      encounter: null,
      quests: { q1: { id: 'q1', title: 'Trova l amuleto', status: 'active' as const } },
    };
    expect(gameStateSchema.parse(s)).toEqual(s);
  });
```

Inoltre **aggiorna i due letterali esistenti** in `describe('gameStateSchema', ...)` (test `fa round-trip di uno stato con encounter null e non null`) aggiungendo `quests: {}` (altrimenti `gameStateSchema.parse` lancera per campo mancante):
```ts
    const s1 = { version: 2, actors: { eroe: fullActor }, encounter: null, quests: {} };
    expect(gameStateSchema.parse(s1)).toEqual(s1);
    const s2 = {
      version: 3,
      actors: { eroe: fullActor },
      encounter: { id: 'e', participants: [{ actorId: 'eroe', zone: 'a', initiative: 10, actedThisRound: false }], round: 1, turnIndex: 0 },
      quests: {},
    };
    expect(gameStateSchema.parse(s2)).toEqual(s2);
```

- [ ] **Step 6: Esegui i test shared e verifica che falliscano**

Run: `pnpm exec vitest run packages/shared/src/domain-schema.test.ts`
Expected: FAIL (questSchema/quests non esistono; i nuovi eventi non sono nello schema).

- [ ] **Step 7: Implementa shared (`domain-schema.ts`)**

In `packages/shared/src/domain-schema.ts`:

a) aggiungi gli enum e lo `questSchema` (dopo `difficultySchema`, riga ~130; `shared` e foglia → rispecchia i literal degli stati come fa `difficultySchema`):
```ts
// Stati delle quest: shared e FOGLIA (non importa engine) -> rispecchia i literal di QuestStatus/
// QuestOutcome. Il drift guard bidirezionale (sqlite-event-store) verifica l allineamento 1:1.
const questStatusSchema = z.enum(['active', 'completed', 'failed']);
const questOutcomeSchema = z.enum(['completed', 'failed']);

// description opzionale: il .transform() la OMETTE quando assente, cosi il tipo inferito e
// assegnabile 1:1 a Quest sotto exactOptionalPropertyTypes (pattern di dieGroupSchema). La
// transform e NIDIFICATA dentro `quest`, quindi l evento QuestStarted resta un ZodObject e puo'
// stare nella discriminatedUnion (come actorSchema, che contiene transform annidate).
const questSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    status: questStatusSchema,
  })
  .transform((o) =>
    o.description === undefined
      ? { id: o.id, title: o.title, status: o.status }
      : { id: o.id, title: o.title, status: o.status, description: o.description },
  );
```

b) aggiungi i due eventi nella `z.discriminatedUnion` interna di `domainEventSchema` (dopo il membro `ResourceEffectApplied`, dentro l'array della `discriminatedUnion`):
```ts
    z.object({
      type: z.literal('ResourceEffectApplied'),
      targetId: z.string(),
      resource: z.string(),
      delta: z.number(),
      roll: z.object({ ...rollResultFields }),
    }),
    z.object({ type: z.literal('QuestStarted'), quest: questSchema }),
    z.object({ type: z.literal('QuestAdvanced'), questId: z.string(), status: questOutcomeSchema }),
```

c) aggiungi il campo `quests` a `gameStateSchema`:
```ts
export const gameStateSchema = z.object({
  version: z.number(),
  actors: z.record(z.string(), actorSchema),
  encounter: encounterSchema.nullable(),
  quests: z.record(z.string(), questSchema),
});
```

- [ ] **Step 8: Aggiorna i letterali di ripple (shared/memory/host)**

Questi letterali `GameState` rompono il typecheck (campo richiesto mancante) o il test (parse stringente). Aggiungi `quests: {}`:

In `packages/shared/src/ipc.test.ts` (test `valida uno snapshot con stato vuoto`):
```ts
    const push = readModelPushSchema.parse({ version: 0, state: { version: 0, actors: {}, encounter: null, quests: {} } });
```

In `packages/memory/src/context-assembler.test.ts`, il letterale `HERO_STATE`:
```ts
const HERO_STATE: GameState = {
  version: 1,
  encounter: null,
  quests: {},
  actors: {
    pc1: { id: 'pc1', name: 'Eroe', kind: 'pc', attributes: {}, skills: {}, resources: { hp: { current: 10, max: 12 } }, conditions: [], items: [], progression: { xp: 0, level: 0 } },
    g1: { id: 'g1', name: 'Goblin', kind: 'npc', attributes: {}, skills: {}, resources: { hp: { current: 8, max: 8 } }, conditions: [], items: [], progression: { xp: 0, level: 0 } },
  },
};
```

In `packages/host/src/campaign-service.test.ts` (il `toEqual` del read model vuoto, riga ~92):
```ts
      expect(service.getReadModel()).toEqual({ version: 0, state: { version: 0, actors: {}, encounter: null, quests: {} } });
```

- [ ] **Step 9: Esegui tutto e verifica che passi**

Run: `pnpm exec vitest run packages/shared/src/domain-schema.test.ts packages/shared/src/ipc.test.ts packages/memory/src/context-assembler.test.ts packages/host/src/campaign-service.test.ts packages/engine/src/events.test.ts`
Expected: PASS.
Run: `pnpm -r typecheck`
Expected: nessun errore (6 progetti; drift guard verde).
Run: `pnpm test`
Expected: **340** test verdi.

- [ ] **Step 10: Commit**

```bash
git add packages/engine/src/events.ts packages/engine/src/events.test.ts packages/shared/src/domain-schema.ts packages/shared/src/domain-schema.test.ts packages/shared/src/ipc.test.ts packages/memory/src/context-assembler.test.ts packages/host/src/campaign-service.test.ts
git commit -m "feat(engine,shared): quests nel GameState + eventi QuestStarted/QuestAdvanced + confine zod (SP3)"
```

---

## Task 3: Command `StartQuest`/`AdvanceQuest` + `decide` (engine)

La FSM del ciclo di vita posseduta dall'engine: creazione (rifiuta id duplicato) e avanzamento a terminale (rifiuta quest ignota o gia terminata). Nessun RNG.

**Files:**
- Modify: `packages/engine/src/commands.ts` (due Command, due casi `decide`)
- Modify: `packages/engine/src/commands.test.ts` (test `decide`)

- [ ] **Step 1: Scrivi i test che falliscono**

In `packages/engine/src/commands.test.ts`, aggiungi in fondo (dopo `describe('decide ApplyEffect', ...)`):
```ts
describe('decide StartQuest', () => {
  it('emette QuestStarted attiva con description', () => {
    const events = decide(
      initialState,
      { type: 'StartQuest', id: 'q1', title: 'Trova l amuleto', description: 'Per il Barone' },
      rng,
    );
    expect(events).toEqual([
      { type: 'QuestStarted', quest: { id: 'q1', title: 'Trova l amuleto', description: 'Per il Barone', status: 'active' } },
    ]);
  });

  it('omette description quando assente', () => {
    const events = decide(initialState, { type: 'StartQuest', id: 'q1', title: 'Trova l amuleto' }, rng);
    expect(events).toHaveLength(1);
    const ev = events[0]!;
    if (ev.type !== 'QuestStarted') throw new Error('atteso QuestStarted');
    expect(ev.quest).toEqual({ id: 'q1', title: 'Trova l amuleto', status: 'active' });
    expect('description' in ev.quest).toBe(false);
  });

  it('lancia su id gia presente, senza eventi', () => {
    const started = applyEvent(initialState, {
      type: 'QuestStarted',
      quest: { id: 'q1', title: 'X', status: 'active' },
    });
    expect(() => decide(started, { type: 'StartQuest', id: 'q1', title: 'Y' }, rng)).toThrow('Quest già presente: q1');
  });
});

describe('decide AdvanceQuest', () => {
  function withQuest(): GameState {
    return applyEvent(initialState, { type: 'QuestStarted', quest: { id: 'q1', title: 'X', status: 'active' } });
  }

  it('quest attiva -> QuestAdvanced con lo stato richiesto', () => {
    expect(decide(withQuest(), { type: 'AdvanceQuest', questId: 'q1', status: 'completed' }, rng)).toEqual([
      { type: 'QuestAdvanced', questId: 'q1', status: 'completed' },
    ]);
  });

  it('puo portare a failed', () => {
    expect(decide(withQuest(), { type: 'AdvanceQuest', questId: 'q1', status: 'failed' }, rng)).toEqual([
      { type: 'QuestAdvanced', questId: 'q1', status: 'failed' },
    ]);
  });

  it('lancia su quest sconosciuta, senza eventi', () => {
    expect(() => decide(initialState, { type: 'AdvanceQuest', questId: 'ignota', status: 'completed' }, rng)).toThrow(
      'Quest sconosciuta: ignota',
    );
  });

  it('lancia su quest gia terminata, senza eventi', () => {
    let s = withQuest();
    s = applyEvent(s, { type: 'QuestAdvanced', questId: 'q1', status: 'completed' });
    expect(() => decide(s, { type: 'AdvanceQuest', questId: 'q1', status: 'failed' }, rng)).toThrow(
      'Quest già terminata',
    );
  });

  it('ciclo decide->apply: start poi advance, lo stato riflette il terminale', () => {
    let s = initialState;
    for (const e of decide(s, { type: 'StartQuest', id: 'q1', title: 'X' }, rng)) s = applyEvent(s, e);
    for (const e of decide(s, { type: 'AdvanceQuest', questId: 'q1', status: 'completed' }, rng)) s = applyEvent(s, e);
    expect(s.quests['q1']?.status).toBe('completed');
  });
});
```

> Nota apostrofo: `'Trova l amuleto'`, `'gia terminata'` — niente `'` dentro le stringhe in apici singoli. (Le `toThrow('Quest già presente: q1')` contengono `à`, una lettera, non un apostrofo → ok.)

- [ ] **Step 2: Esegui e verifica il fallimento**

Run: `pnpm exec vitest run packages/engine/src/commands.test.ts`
Expected: FAIL (Command `StartQuest`/`AdvanceQuest` non gestiti da `decide`).

- [ ] **Step 3: Implementa `commands.ts`**

a) aggiungi l'import del tipo `QuestOutcome` (l'import engine-interno; in cima al file, accanto agli altri `import type` da `./...`):
```ts
import { dcForDifficulty, type Difficulty } from './difficulty';
import type { QuestOutcome } from './quest';
```

b) estendi l'unione `Command` (dopo la variante `ApplyEffect`, riga 27):
```ts
  | { type: 'ApplyEffect'; targetId: string; resource: string; direction: 'restore' | 'drain'; dice: DieGroup[]; bonus?: number }
  | { type: 'StartQuest'; id: string; title: string; description?: string }
  | { type: 'AdvanceQuest'; questId: string; status: QuestOutcome };
```

c) aggiungi i due casi a `decide` (dentro lo `switch`, dopo il caso `ApplyEffect`, prima del `default`):
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

d) aggiungi `Quest` all'import da `./quest` (serve per l'annotazione `const quest: Quest`):
```ts
import type { Quest, QuestOutcome } from './quest';
```

- [ ] **Step 4: Esegui e verifica il pass**

Run: `pnpm exec vitest run packages/engine/src/commands.test.ts`
Expected: PASS (tutti, inclusi gli 8 nuovi).
Run: `pnpm -C packages/engine typecheck`
Expected: nessun errore (lo `switch` di `decide` resta esaustivo).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/commands.ts packages/engine/src/commands.test.ts
git commit -m "feat(engine): Command StartQuest/AdvanceQuest + decide (FSM del ciclo di vita quest) (SP3)"
```

---

## Task 4: Tool `start_quest`/`advance_quest` (ai)

Il confine LLM↔engine: due strumenti che mappano ai Command. `advance_quest.status` e un enum auto-validante (`QUEST_OUTCOMES`): l'AI non puo' inventare un esito (rovescio strict di G1/G6, come `difficulty`/`direction`).

**Files:**
- Modify: `packages/ai/src/master-tools.ts` (due schemi, due voci in `TOOLS`, import `QUEST_OUTCOMES`)
- Modify: `packages/ai/src/master-tools.test.ts` (aggiorna il conteggio a 9; test dei due tool)

- [ ] **Step 1: Scrivi i test che falliscono**

In `packages/ai/src/master-tools.test.ts`:

a) **aggiorna** il test esistente `espone i 7 strumenti...` a 9 (cambia titolo e array dei nomi ordinati):
```ts
  it('espone i 9 strumenti con schemi JSON inline (niente ref)', () => {
    const defs = masterToolDefs();
    const names = defs.map((d) => d.name).sort();
    expect(names).toEqual([
      'advance_quest', 'apply_effect', 'attack', 'end_turn', 'next_round',
      'request_check', 'spawn_npc', 'start_encounter', 'start_quest',
    ]);
    for (const d of defs) {
      expect(typeof d.description).toBe('string');
      expect((d.parameters as { type?: string }).type).toBe('object');
      expect(JSON.stringify(d.parameters)).not.toContain('$ref');
    }
  });
```

b) aggiungi in fondo al file:
```ts
describe('resolveToolCall start_quest', () => {
  it('mappa start_quest valido a StartQuest con description', () => {
    const r = resolveToolCall('start_quest', '{"id":"q1","title":"Trova l amuleto","description":"Per il Barone"}');
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    expect(r.command).toEqual({ type: 'StartQuest', id: 'q1', title: 'Trova l amuleto', description: 'Per il Barone' });
  });

  it('omette description quando assente', () => {
    const r = resolveToolCall('start_quest', '{"id":"q1","title":"Trova l amuleto"}');
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    expect(r.command).toEqual({ type: 'StartQuest', id: 'q1', title: 'Trova l amuleto' });
    expect('description' in r.command).toBe(false);
  });
});

describe('resolveToolCall advance_quest', () => {
  it('mappa advance_quest valido a AdvanceQuest', () => {
    const r = resolveToolCall('advance_quest', '{"questId":"q1","status":"completed"}');
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    expect(r.command).toEqual({ type: 'AdvanceQuest', questId: 'q1', status: 'completed' });
  });

  it('rifiuta uno status fuori enum (es. active)', () => {
    const r = resolveToolCall('advance_quest', '{"questId":"q1","status":"active"}');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('status');
  });

  it('rifiuta status mancante', () => {
    const r = resolveToolCall('advance_quest', '{"questId":"q1"}');
    expect(r.ok).toBe(false);
  });

  it('mostra status come enum [completed, failed] nello schema', () => {
    const aq = masterToolDefs().find((d) => d.name === 'advance_quest');
    if (aq === undefined) throw new Error('atteso advance_quest');
    const status = (aq.parameters as { properties: Record<string, { enum?: string[] }> }).properties.status;
    expect(status?.enum).toEqual(['completed', 'failed']);
  });
});
```

- [ ] **Step 2: Esegui e verifica il fallimento**

Run: `pnpm exec vitest run packages/ai/src/master-tools.test.ts`
Expected: FAIL (strumenti `start_quest`/`advance_quest` sconosciuti; conteggio 7≠9).

- [ ] **Step 3: Implementa `master-tools.ts`**

a) aggiungi `QUEST_OUTCOMES` all'import dall'engine (riga 8):
```ts
import { DIFFICULTIES, QUEST_OUTCOMES } from '@loomn/engine';
```

b) aggiungi i due schemi (dopo `applyEffectSchema`, prima di `endTurnSchema`):
```ts
const startQuestSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1).optional(),
});

const advanceQuestSchema = z.object({
  questId: z.string().min(1),
  status: z.enum(QUEST_OUTCOMES), // enum auto-validante: l AI dichiara l esito, non puo' inventarlo
});
```

c) aggiungi le due voci a `TOOLS` (dopo `apply_effect`, prima di `attack` — l'ordine non conta, i test ordinano per nome):
```ts
  start_quest: makeEntry(
    'Avvia una nuova quest (obiettivo del giocatore). Usa id univoci. description e lo statement dell obiettivo.',
    startQuestSchema,
    (a) => ({
      type: 'StartQuest',
      id: a.id,
      title: a.title,
      ...(a.description !== undefined ? { description: a.description } : {}),
    }),
  ),
  advance_quest: makeEntry(
    'Porta una quest esistente al suo esito: completed (riuscita) o failed (fallita). Il motore rifiuta una quest inesistente o gia terminata.',
    advanceQuestSchema,
    (a) => ({ type: 'AdvanceQuest', questId: a.questId, status: a.status }),
  ),
```

- [ ] **Step 4: Esegui e verifica il pass**

Run: `pnpm exec vitest run packages/ai/src/master-tools.test.ts`
Expected: PASS (inclusi i 6 nuovi + il test del conteggio aggiornato).
Run: `pnpm -C packages/ai typecheck`
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/master-tools.ts packages/ai/src/master-tools.test.ts
git commit -m "feat(ai): tool start_quest/advance_quest (status enum auto-validante via QUEST_OUTCOMES) (SP3)"
```

---

## Task 5: Il contesto quest entra in L1 (`renderL1`, memory)

Il Context Assembler rende le **quest attive** in L1 (priorita 2, mai tagliate dal budget). Solo se ce n'e almeno una attiva → nessun blocco altrimenti (i test L1 esistenti restano verdi). Le terminate escono.

**Files:**
- Modify: `packages/memory/src/context-assembler.ts` (`renderL1`)
- Modify: `packages/memory/src/context-assembler.test.ts` (test del blocco quest)

- [ ] **Step 1: Scrivi i test che falliscono**

In `packages/memory/src/context-assembler.test.ts`, aggiungi un nuovo `describe` in fondo al file (usa stati con quest; costruiti come variazioni di `HERO_STATE`):
```ts
describe('blocco quest in L1', () => {
  function withQuests(quests: GameState['quests']): GameState {
    return { ...HERO_STATE, quests };
  }
  function assemble(state: GameState): string {
    const { db, close } = openDatabase(':memory:');
    try {
      const ledger = createCanonLedger(db);
      const summaries = createSummaryStore(db);
      return createContextAssembler({ ledger, summaries, clock: fixedClock(0) }, { tokenBudget: 1000 })(state);
    } finally {
      close();
    }
  }

  it('rende le quest attive ordinate per id, con e senza description', () => {
    const ctx = assemble(
      withQuests({
        qb: { id: 'qb', title: 'Salva il villaggio', status: 'active' },
        qa: { id: 'qa', title: 'Trova l amuleto', description: 'Per il Barone', status: 'active' },
      }),
    );
    expect(ctx).toContain('Quest attive (L1)');
    expect(ctx).toContain('- Trova l amuleto (id=qa): Per il Barone');
    expect(ctx).toContain('- Salva il villaggio (id=qb)');
    // ordinate per id: qa prima di qb
    expect(ctx.indexOf('id=qa')).toBeLessThan(ctx.indexOf('id=qb'));
  });

  it('non rende un blocco quest se non ci sono quest attive (solo terminate)', () => {
    const ctx = assemble(
      withQuests({
        q1: { id: 'q1', title: 'Completata', status: 'completed' },
        q2: { id: 'q2', title: 'Fallita', status: 'failed' },
      }),
    );
    expect(ctx).not.toContain('Quest attive (L1)');
    expect(ctx).not.toContain('Completata');
  });

  it('non rende un blocco quest quando quests e vuoto (stato esistente invariato)', () => {
    expect(assemble(HERO_STATE)).not.toContain('Quest attive (L1)');
  });

  it('il blocco quest fa parte di L1: non viene tagliato con budget 0', () => {
    const ctx = assemble(withQuests({ q1: { id: 'q1', title: 'Urgente', status: 'active' } }));
    const ctx0 = (() => {
      const { db, close } = openDatabase(':memory:');
      try {
        const ledger = createCanonLedger(db);
        const summaries = createSummaryStore(db);
        return createContextAssembler({ ledger, summaries, clock: fixedClock(0) }, { tokenBudget: 0 })(
          { ...HERO_STATE, quests: { q1: { id: 'q1', title: 'Urgente', status: 'active' } } },
        );
      } finally {
        close();
      }
    })();
    expect(ctx).toContain('Urgente');
    expect(ctx0).toContain('Quest attive (L1)');
    expect(ctx0).toContain('Urgente');
  });
});
```

- [ ] **Step 2: Esegui e verifica il fallimento**

Run: `pnpm exec vitest run packages/memory/src/context-assembler.test.ts`
Expected: FAIL (nessun blocco "Quest attive").

- [ ] **Step 3: Implementa `renderL1` (`context-assembler.ts`)**

Sostituisci la funzione `renderL1` (righe 58-71) con:
```ts
function renderL1(state: GameState): string {
  const actors = Object.values(state.actors).map((a) => {
    const res = Object.entries(a.resources)
      .map(([k, p]) => `${k} ${p.current}/${p.max}`)
      .join(', ');
    return `- ${a.name} (${a.kind}, id=${a.id})${res.length > 0 ? `: ${res}` : ''}`;
  });
  const list = actors.length > 0 ? actors.join('\n') : '- (nessun attore)';
  const enc =
    state.encounter === null
      ? 'Nessuno scontro attivo.'
      : `Scontro ${state.encounter.id}: round ${state.encounter.round}, turno ${state.encounter.turnIndex}.`;
  const stateBlock = `Stato attuale (L1):\n${list}\n${enc}`;

  // Quest ATTIVE in L1 (spec 6: le quest sono fatti meccanici autorevoli). Solo se presenti, cosi
  // lo stato senza quest rende identico a prima. Le terminate escono: la loro conclusione e narrata
  // -> finisce in L1.5/L2 (F4). Fa parte di L1 (priorita 2), quindi mai tagliato dal budget.
  const activeQuests = Object.values(state.quests)
    .filter((q) => q.status === 'active')
    .sort((a, b) => byId(a.id, b.id));
  const questBlock =
    activeQuests.length > 0
      ? `Quest attive (L1):\n${activeQuests
          .map((q) => `- ${q.title} (id=${q.id})${q.description !== undefined ? `: ${q.description}` : ''}`)
          .join('\n')}`
      : '';

  return [stateBlock, questBlock].filter((b) => b.length > 0).join('\n\n');
}
```

> `byId` e gia definito piu sotto nel file (dichiarazione di funzione, hoisted → chiamabile da `renderL1`).

- [ ] **Step 4: Esegui e verifica il pass**

Run: `pnpm exec vitest run packages/memory/src/context-assembler.test.ts`
Expected: PASS (inclusi i 4 nuovi; i test L1 esistenti invariati).
Run: `pnpm -C packages/memory typecheck`
Expected: nessun errore.
Run: `pnpm test`
Expected: **358** test verdi.
Run: `pnpm -r typecheck`
Expected: nessun errore (6 progetti).

- [ ] **Step 5: Commit**

```bash
git add packages/memory/src/context-assembler.ts packages/memory/src/context-assembler.test.ts
git commit -m "feat(memory): renderL1 rende le quest attive in L1 (contesto quest) (SP3)"
```

---

## Self-Review (orchestratore — già eseguita in fase di scrittura)

**Copertura spec:**
- §2 modello `Quest` solo stato + `quest.ts` → Task 1. ✅
- §3 Command/Event/`decide`/`applyEvent` + `GameState.quests` → Task 2 (eventi/stato) + Task 3 (command). ✅
- §4 tool `start_quest`/`advance_quest` (enum auto-validante) → Task 4. ✅ `master-turn`/`reflection` non toccati (conformi spec §4). ✅
- §5 blocco "Quest attive" in `renderL1` (solo se attive, mai tagliato) → Task 5. ✅
- §6 confine shared (`questSchema` con transform nidificata, `gameStateSchema`, `domainEventSchema` nella discriminatedUnion interna, drift guard) → Task 2. ✅ `commandSchema` non toccato (conforme spec §6). ✅
- §9 ripple del campo `quests` (4 file di test) → Task 2 Step 8. ✅
- §7 fuori ambito (obiettivi, ricompense, abandoned, riapertura, FSM, Ruleset): non implementati, dichiarati. ✅

**Scansione placeholder:** nessun TODO/TBD; ogni step ha codice e comando completi.

**Consistenza tipi/nomi:** `Quest`/`QuestStatus`/`QuestOutcome`, `QUEST_STATUSES`/`QUEST_OUTCOMES`, eventi `QuestStarted { quest }`/`QuestAdvanced { questId, status }`, Command `StartQuest { id, title, description? }`/`AdvanceQuest { questId, status }`, tool `start_quest`/`advance_quest` — coerenti fra Task 1→5 e con lo spec. Messaggi di errore (`Quest già presente`, `Quest sconosciuta`, `Quest già terminata`) coerenti fra `decide` (Task 3) e i `toThrow` dei test.

**Verifica anti-bug-apostrofo (da rieseguire prima del commit di ogni task):** `(it|describe)\('[^']*'[A-Za-zàèéìòù]` → no matches. Le stringhe di test usano `l amuleto`/`gia` senza apostrofo.

## Roadmap

SP3 è il 3° di 4 sotto-progetti della traccia engine. Dopo SP3: **SP4 — FSM di fase (§5.5)** (design-first → brainstorming), poi gli ultimi item del backlog (G3/G4 vocabolario, F3/G5 estrazione, segmentazione `reflect`), infine **Piano 10 — UI**. Aggiorna HANDOFF (§0-novies → nuovo §0-decies) e la memoria a merge avvenuto.

## Execution Handoff

Piano completo e salvato in `docs/superpowers/plans/2026-06-17-loomn-sp3-quest.md`. Flusso: commit del piano su `main` → branch `feat/sp3-quest` → subagent-driven (un implementer + spec-review + code-quality-review per task; final review opus del branch) → `finishing-a-development-branch` (merge ff locale) → aggiorna HANDOFF + memoria.
