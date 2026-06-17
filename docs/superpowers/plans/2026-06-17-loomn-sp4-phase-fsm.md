# SP4 — FSM di fase (§5.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introdurre una FSM di fase dichiarata (esplorazione/dialogo/combattimento/downtime) dove il codice possiede lo stato e le transizioni legali e l'AI propone l'intento, abilitando Command/tool diversi per fase e una strategia di prompt per fase.

**Architecture:** `phase` diventa un campo primario event-sourced del `GameState` (encounter subordinato, invariante `phase==='combat' ⟺ encounter≠null`). Un modulo puro `engine/phase.ts` dichiara stati e archi (`canTransition`); `commands.ts` dichiara gli action-set per fase (`isCommandLegalInPhase`) e un gate uniforme in `decide`. Transizioni ibride: combat via `start_encounter`/`end_encounter` (engine-grounded), fasi soft via `enter_phase` (intento AI). In `ai`, i tool sono filtrati per fase (stesso predicato dell'engine) e il prompt riceve un frammento per fase.

**Tech Stack:** TypeScript (monorepo pnpm), Zod (`@loomn/shared`), Vitest (TDD), event sourcing.

**Spec di riferimento:** `docs/superpowers/specs/2026-06-17-sp4-phase-fsm-design.md` (subordinato allo spec autorità `2026-06-15-...-design.md`, §5.5/§5.4/§6.2).

**Nota commit:** ogni messaggio di commit termina con la riga `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (omessa qui sotto per brevità — aggiungila).

**House rules (§5):** ogni task tocca SOLO i file elencati; mai toccare `package.json`/`tsconfig`/`vitest.config`; `git status --short` prima di ogni commit; **bug apostrofo**: niente apostrofi (`l'`, `un'`, `c'`, `dell'`) dentro le stringhe in apici singoli di `it('…')`/`describe('…')` — usa parafrasi senza apostrofo. Grep di verifica: `(it|describe)\('[^']*'[A-Za-zàèéìòù]` → no matches.

---

## File Structure

- **`packages/engine/src/phase.ts`** *(nuovo)* — modulo puro FSM: `PHASES`/`Phase`, `SOFT_PHASES`/`SoftPhase`, `INITIAL_PHASE`, `canTransition`. Nessuna dipendenza da events/commands.
- **`packages/engine/src/events.ts`** — `GameState.phase`, `initialState.phase`, eventi `PhaseChanged`/`EncounterEnded`, casi `applyEvent`.
- **`packages/engine/src/commands.ts`** — `isCommandLegalInPhase` (+ insiemi), gate in `decide`, Command `EnterPhase`/`EndEncounter`, `StartEncounter` aggiornato, pulizia `EndTurn`/`NextRound`, `Attack` combat-only.
- **`packages/engine/src/index.ts`** — re-export di `./phase`.
- **`packages/shared/src/domain-schema.ts`** — `phaseSchema`, `gameStateSchema.phase`, varianti `PhaseChanged`/`EncounterEnded` in `domainEventSchema`.
- **`packages/ai/src/master-tools.ts`** — tool `enter_phase`/`end_encounter`, `commandType` su `ToolEntry`, `masterToolDefs(phase)` filtrante.
- **`packages/ai/src/master-turn.ts`** — `masterToolDefs(state.phase)` per-iterazione, `PHASE_GUIDANCE`/`phaseGuidance`, `buildMasterMessages(…, phase)`.
- **Ripple** (campo `phase` richiesto in `GameState`): `packages/shared/src/domain-schema.test.ts`, `packages/shared/src/ipc.test.ts`, `packages/host/src/campaign-service.test.ts`, `packages/memory/src/context-assembler.test.ts`.

**Non toccati:** `commandSchema` (shared), `reflection-ports.ts`/`host` (produzione), `app/desktop`/UI, migrazioni SQLite, `@loomn/memory` Context Assembler (produzione).

---

## Task 1: Modulo FSM puro `engine/phase.ts`

**Files:**
- Create: `packages/engine/src/phase.ts`
- Create: `packages/engine/src/phase.test.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/phase.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PHASES, SOFT_PHASES, INITIAL_PHASE, canTransition, type Phase } from './phase';

describe('costanti di fase', () => {
  it('PHASES contiene le quattro fasi', () => {
    expect(PHASES).toEqual(['exploration', 'dialogue', 'combat', 'downtime']);
  });
  it('SOFT_PHASES sono le tre non-combat e non contengono combat', () => {
    expect(SOFT_PHASES).toEqual(['exploration', 'dialogue', 'downtime']);
    expect((SOFT_PHASES as readonly string[]).includes('combat')).toBe(false);
  });
  it('INITIAL_PHASE e exploration', () => {
    expect(INITIAL_PHASE).toBe('exploration');
  });
});

describe('canTransition', () => {
  it('la stessa fase non e una transizione', () => {
    for (const p of PHASES) expect(canTransition(p, p)).toBe(false);
  });
  it('da combat si esce solo verso exploration', () => {
    expect(canTransition('combat', 'exploration')).toBe(true);
    expect(canTransition('combat', 'dialogue')).toBe(false);
    expect(canTransition('combat', 'downtime')).toBe(false);
  });
  it('da una fase non-combat ogni altra fase e raggiungibile', () => {
    const soft: Phase[] = ['exploration', 'dialogue', 'downtime'];
    for (const from of soft) {
      for (const to of PHASES) {
        expect(canTransition(from, to)).toBe(from !== to);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `phase.test.ts` non compila (`Cannot find module './phase'`).

- [ ] **Step 3: Write minimal implementation**

Create `packages/engine/src/phase.ts`:

```ts
// FSM di fase (spec §5.5): macchina a stati dichiarata. Modulo PURO, single-purpose, isolato
// come difficulty.ts (SP1) e quest.ts (SP3). Nessuna dipendenza da events/commands.

export const PHASES = ['exploration', 'dialogue', 'combat', 'downtime'] as const;
export type Phase = (typeof PHASES)[number];

// Le fasi non-combat: le uniche che l AI puo proporre con enter_phase (combat e modale).
export const SOFT_PHASES = ['exploration', 'dialogue', 'downtime'] as const;
export type SoftPhase = (typeof SOFT_PHASES)[number];

export const INITIAL_PHASE: Phase = 'exploration';

/** Gli ARCHI del grafo di fase (transizioni esplicite e testabili, spec §5.5).
 *  - stessa fase: non e una transizione;
 *  - da combat: si esce SOLO verso exploration (via end_encounter);
 *  - da una fase non-combat: ogni altra fase e raggiungibile (soft<->soft via enter_phase;
 *    soft->combat via start_encounter). */
export function canTransition(from: Phase, to: Phase): boolean {
  if (from === to) return false;
  if (from === 'combat') return to === 'exploration';
  return true;
}
```

In `packages/engine/src/index.ts`, dopo la riga `export * from './quest';`, aggiungi:

```ts
export * from './phase';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS (i nuovi test di `phase.test.ts` verdi, tutto il resto invariato).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/phase.ts packages/engine/src/phase.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): modulo FSM di fase phase.ts (PHASES/canTransition) (SP4)"
```

---

## Task 2: `GameState` acquisisce `phase` (engine + shared + ripple)

**Files:**
- Modify: `packages/engine/src/events.ts` (GameState, initialState)
- Modify: `packages/shared/src/domain-schema.ts` (phaseSchema, gameStateSchema)
- Modify: `packages/engine/src/events.test.ts` (test initialState.phase)
- Modify: `packages/shared/src/domain-schema.test.ts` (ripple + round-trip phase)
- Modify: `packages/shared/src/ipc.test.ts` (ripple)
- Modify: `packages/host/src/campaign-service.test.ts` (ripple)
- Modify: `packages/memory/src/context-assembler.test.ts` (ripple HERO_STATE)

- [ ] **Step 1: Write the failing tests**

In `packages/engine/src/events.test.ts`, dentro `describe('applyEvent', …)`, dopo il test `it('initialState ha quests vuoto', …)`, aggiungi:

```ts
  it('initialState parte in fase exploration', () => {
    expect(initialState.phase).toBe('exploration');
  });
```

In `packages/shared/src/domain-schema.test.ts`, dentro `describe('gameStateSchema', …)`, dopo il test `it('fa round-trip di uno stato con quests non vuoto', …)`, aggiungi:

```ts
  it('fa round-trip di uno stato con fase non-default e rifiuta una fase ignota', () => {
    const s = { version: 5, actors: { eroe: fullActor }, encounter: null, quests: {}, phase: 'combat' as const };
    expect(gameStateSchema.parse(s)).toEqual(s);
    expect(() => gameStateSchema.parse({ ...s, phase: 'sognante' })).toThrow();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `initialState.phase` non esiste (typecheck) e `gameStateSchema` non ha `phase` (il round-trip e il reject falliscono); inoltre i drift guard di `memory` (`sqlite-event-store.ts`) e i letterali `GameState` esistenti diventano red. È atteso: si sistema tutto nello Step 3.

- [ ] **Step 3: Implement — campo `phase` + schema + ripple**

In `packages/engine/src/events.ts`:

1. Aggiungi l'import in cima (accanto agli altri `import type`):
```ts
import type { Phase } from './phase';
```
2. Nel tipo `GameState`, aggiungi il campo dopo `quests`:
```ts
export interface GameState {
  version: number;
  actors: Record<string, Actor>;
  encounter: Encounter | null;
  quests: Record<string, Quest>;
  phase: Phase;
}
```
3. Aggiorna `initialState`:
```ts
export const initialState: GameState = { version: 0, actors: {}, encounter: null, quests: {}, phase: 'exploration' };
```
(`applyEvent` non cambia: `const bumped = { ...state, version: state.version + 1 }` propaga già `phase`.)

In `packages/shared/src/domain-schema.ts`:

1. Dopo la riga di `questOutcomeSchema` (`const questOutcomeSchema = z.enum(['completed', 'failed']);`), aggiungi:
```ts
// Fasi di gioco (§5.5): shared e FOGLIA (non importa engine) -> rispecchia i literal di Phase
// dell engine. Il drift guard bidirezionale (sqlite-event-store) verifica l allineamento 1:1.
const phaseSchema = z.enum(['exploration', 'dialogue', 'combat', 'downtime']);
```
2. In `gameStateSchema`, aggiungi il campo `phase`:
```ts
export const gameStateSchema = z.object({
  version: z.number(),
  actors: z.record(z.string(), actorSchema),
  encounter: encounterSchema.nullable(),
  quests: z.record(z.string(), questSchema),
  phase: phaseSchema,
});
```

**Ripple dei letterali `GameState`** (aggiungi `phase: 'exploration'`; usa `as const` dove serve per l'inferenza):

- `packages/shared/src/domain-schema.test.ts`:
  - riga ~179 (`s1`): `const s1 = { version: 2, actors: { eroe: fullActor }, encounter: null, quests: {}, phase: 'exploration' as const };`
  - riga ~181 (`s2`): aggiungi `phase: 'exploration' as const,` dopo `quests: {},`
  - riga ~191 (`s`): aggiungi `phase: 'exploration' as const,` dopo la riga `quests: { q1: … },`
- `packages/shared/src/ipc.test.ts` (riga ~113): nel letterale `state`, aggiungi `phase: 'exploration'`:
  `readModelPushSchema.parse({ version: 0, state: { version: 0, actors: {}, encounter: null, quests: {}, phase: 'exploration' } })`
- `packages/host/src/campaign-service.test.ts` (riga ~92): nel `toEqual`, aggiungi `phase: 'exploration'` allo `state`:
  `expect(service.getReadModel()).toEqual({ version: 0, state: { version: 0, actors: {}, encounter: null, quests: {}, phase: 'exploration' } });`
- `packages/memory/src/context-assembler.test.ts` (HERO_STATE, righe ~19-27): aggiungi `phase: 'exploration',` (es. dopo `quests: {},`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS — tutti i pacchetti verdi (drift guard di `memory` ristabilito perché engine e shared hanno entrambi `phase`).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/events.ts packages/engine/src/events.test.ts packages/shared/src/domain-schema.ts packages/shared/src/domain-schema.test.ts packages/shared/src/ipc.test.ts packages/host/src/campaign-service.test.ts packages/memory/src/context-assembler.test.ts
git commit -m "feat(engine,shared): GameState acquisisce il campo phase (default exploration) (SP4)"
```

---

## Task 3: Eventi `PhaseChanged` e `EncounterEnded`

**Files:**
- Modify: `packages/engine/src/events.ts` (DomainEvent + applyEvent)
- Modify: `packages/engine/src/events.test.ts`
- Modify: `packages/shared/src/domain-schema.ts` (domainEventSchema)
- Modify: `packages/shared/src/domain-schema.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/src/events.test.ts`, dentro `describe('applyEvent', …)` (dopo i test quest), aggiungi:

```ts
  it('PhaseChanged imposta la fase e incrementa la versione, senza toccare il resto', () => {
    const base = withActors(actor('eroe'));
    const s = applyEvent(base, { type: 'PhaseChanged', from: 'exploration', to: 'dialogue' });
    expect(s.phase).toBe('dialogue');
    expect(s.actors).toEqual(base.actors);
    expect(s.encounter).toEqual(base.encounter);
    expect(s.quests).toEqual(base.quests);
    expect(s.version).toBe(base.version + 1);
  });

  it('EncounterEnded azzera lo scontro e incrementa la versione', () => {
    const enc = createEncounter('e', [{ actorId: 'eroe', zone: 'a', initiative: 10 }]);
    const base = applyEvent(withActors(actor('eroe')), { type: 'EncounterStarted', encounter: enc });
    const s = applyEvent(base, { type: 'EncounterEnded', encounterId: 'e' });
    expect(s.encounter).toBeNull();
    expect(s.version).toBe(base.version + 1);
  });
```

In `packages/shared/src/domain-schema.test.ts`, dentro il `describe` che fa round-trip degli eventi in `domainEventSchema` (lo stesso che ha i test `QuestStarted`/`QuestAdvanced`), aggiungi:

```ts
  it('fa round-trip di PhaseChanged', () => {
    const ev = { type: 'PhaseChanged' as const, from: 'exploration' as const, to: 'combat' as const };
    expect(domainEventSchema.parse(ev)).toEqual(ev);
  });
  it('fa round-trip di EncounterEnded', () => {
    const ev = { type: 'EncounterEnded' as const, encounterId: 'e1' };
    expect(domainEventSchema.parse(ev)).toEqual(ev);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — i tipi evento non esistono (engine typecheck / `applyEvent` non esaustivo) e `domainEventSchema` non riconosce le due varianti.

- [ ] **Step 3: Implement**

In `packages/engine/src/events.ts`:

1. Aggiungi l'import (estendi la riga `import type { Phase } from './phase';` se vuoi, o lasciala):
```ts
import type { Phase } from './phase';
```
(già presente da Task 2.)
2. Nel tipo `DomainEvent`, aggiungi due varianti (dopo `QuestAdvanced`):
```ts
  | { type: 'PhaseChanged'; from: Phase; to: Phase }
  | { type: 'EncounterEnded'; encounterId: string };
```
3. In `applyEvent`, aggiungi due casi prima del `default`:
```ts
    case 'PhaseChanged':
      // 'from' e provenienza (narrazione / confini di scena, item 6): non serve al proiettore.
      return { ...bumped, phase: event.to };
    case 'EncounterEnded':
      // chiude lo scontro; la fase torna non-combat con il PhaseChanged emesso in coppia da decide.
      return { ...bumped, encounter: null };
```

In `packages/shared/src/domain-schema.ts`, dentro la `z.discriminatedUnion('type', […])` interna di `domainEventSchema` (accanto a `QuestStarted`/`QuestAdvanced`), aggiungi due membri:

```ts
    z.object({ type: z.literal('PhaseChanged'), from: phaseSchema, to: phaseSchema }),
    z.object({ type: z.literal('EncounterEnded'), encounterId: z.string() }),
```

(Nessun campo opzionale top-level → entrano direttamente nella `discriminatedUnion` interna; nessun arm `z.union` con `.transform()`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS — tutti verdi; drift guard `_EventInfer` verde (engine e shared allineati).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/events.ts packages/engine/src/events.test.ts packages/shared/src/domain-schema.ts packages/shared/src/domain-schema.test.ts
git commit -m "feat(engine,shared): eventi PhaseChanged e EncounterEnded (SP4)"
```

---

## Task 4: Command, gate uniforme e transizioni (`commands.ts`)

**Files:**
- Modify: `packages/engine/src/commands.ts`
- Modify: `packages/engine/src/commands.test.ts`

- [ ] **Step 1: Write the failing/updated tests**

In `packages/engine/src/commands.test.ts`:

**(a)** Aggiorna l'import per includere `isCommandLegalInPhase`:
```ts
import { decide, isCommandLegalInPhase } from './commands';
```

**(b)** Aggiungi un helper `inCombat` dopo `withActors` (riga ~27):
```ts
function inCombat(s: GameState): GameState {
  const participants = Object.keys(s.actors).map((actorId, i) => ({ actorId, zone: 'a', initiative: 10 - i, actedThisRound: false }));
  const withEnc = applyEvent(s, { type: 'EncounterStarted', encounter: { id: 'e', participants, round: 1, turnIndex: 0 } });
  return applyEvent(withEnc, { type: 'PhaseChanged', from: withEnc.phase, to: 'combat' });
}
```

**(c)** Aggiorna `describe('decide StartEncounter', …)`: il test `emette EncounterStarted …` ora attende **2 eventi** (la coppia atomica). Sostituisci il corpo delle asserzioni:
```ts
    expect(events).toHaveLength(2);
    const ev = events[0]!;
    expect(ev.type).toBe('EncounterStarted');
    if (ev.type === 'EncounterStarted') {
      expect(ev.encounter.participants.map((p) => p.actorId)).toEqual(['eroe', 'goblin']);
    }
    expect(events[1]).toEqual({ type: 'PhaseChanged', from: 'exploration', to: 'combat' });
```

**(d)** In `describe('decide EndTurn e NextRound', …)`: aggiorna `withEncounter()` per entrare DAVVERO in combat (aggiungi il `PhaseChanged`):
```ts
  function withEncounter(): GameState {
    let s = withActors(actor('eroe'));
    s = applyEvent(s, {
      type: 'EncounterStarted',
      encounter: { id: 'e', participants: [{ actorId: 'eroe', zone: 'a', initiative: 10, actedThisRound: false }], round: 1, turnIndex: 0 },
    });
    s = applyEvent(s, { type: 'PhaseChanged', from: s.phase, to: 'combat' });
    return s;
  }
```
e aggiorna i due test "lancia senza scontro" al nuovo messaggio del gate:
```ts
  it('EndTurn lancia fuori dalla fase combat', () => {
    expect(() => decide(initialState, { type: 'EndTurn' }, rng)).toThrow('non disponibile in fase exploration');
  });
  …
  it('NextRound lancia fuori dalla fase combat', () => {
    expect(() => decide(initialState, { type: 'NextRound' }, rng)).toThrow('non disponibile in fase exploration');
  });
```

**(e)** In `describe('decide Attack', …)`: avvolgi gli stati in `inCombat` e il test degli sconosciuti pure:
- `emette AttackResolved, DamageApplied e ActorDowned`: `const s = inCombat(withActors(hero(), actor('goblin')));`
- `colpo mancato`: `const s = inCombat(withActors(hero(), actor('goblin')));`
- `lancia se attaccante o bersaglio sono sconosciuti`: `decide(inCombat(initialState), { type: 'Attack', … }, …)` (con `inCombat(initialState)`, fase combat, scontro vuoto → il gate passa, scatta lo "sconosciuto").
- `colpo a segno senza atterramento`: `const s = inCombat(withActors(hero(), tank));`
- `ciclo decide->apply`: `let s = inCombat(withActors(hero(), actor('goblin')));`

**(f)** Aggiungi tre nuovi `describe`:

```ts
describe('isCommandLegalInPhase', () => {
  it('i comandi combat-only sono legali solo in combat', () => {
    for (const t of ['Attack', 'EndTurn', 'NextRound', 'EndEncounter'] as const) {
      expect(isCommandLegalInPhase('combat', t)).toBe(true);
      expect(isCommandLegalInPhase('exploration', t)).toBe(false);
    }
  });
  it('i comandi di ingresso sono legali in ogni fase tranne combat', () => {
    for (const t of ['StartEncounter', 'EnterPhase'] as const) {
      expect(isCommandLegalInPhase('exploration', t)).toBe(true);
      expect(isCommandLegalInPhase('dialogue', t)).toBe(true);
      expect(isCommandLegalInPhase('combat', t)).toBe(false);
    }
  });
  it('i comandi phase-agnostic sono legali ovunque', () => {
    for (const t of ['AddActor', 'RequestCheck', 'ApplyEffect', 'StartQuest', 'AdvanceQuest'] as const) {
      expect(isCommandLegalInPhase('exploration', t)).toBe(true);
      expect(isCommandLegalInPhase('combat', t)).toBe(true);
      expect(isCommandLegalInPhase('downtime', t)).toBe(true);
    }
  });
});

describe('decide gate di fase, EnterPhase, EndEncounter', () => {
  it('StartEncounter in combat e rifiutato (niente doppio scontro)', () => {
    const s = inCombat(withActors(actor('eroe')));
    expect(() =>
      decide(s, { type: 'StartEncounter', encounterId: 'e2', participants: [{ actorId: 'eroe', zone: 'a', initiative: 5 }] }, rng),
    ).toThrow('non disponibile in fase combat');
  });

  it('EndEncounter in combat emette EncounterEnded e PhaseChanged verso exploration', () => {
    const s = inCombat(withActors(actor('eroe')));
    expect(decide(s, { type: 'EndEncounter' }, rng)).toEqual([
      { type: 'EncounterEnded', encounterId: 'e' },
      { type: 'PhaseChanged', from: 'combat', to: 'exploration' },
    ]);
  });

  it('EndEncounter fuori combat e rifiutato dal gate', () => {
    expect(() => decide(initialState, { type: 'EndEncounter' }, rng)).toThrow('non disponibile in fase exploration');
  });

  it('EnterPhase tra fasi soft emette PhaseChanged', () => {
    expect(decide(initialState, { type: 'EnterPhase', to: 'dialogue' }, rng)).toEqual([
      { type: 'PhaseChanged', from: 'exploration', to: 'dialogue' },
    ]);
  });

  it('EnterPhase verso la stessa fase e rifiutato', () => {
    expect(() => decide(initialState, { type: 'EnterPhase', to: 'exploration' }, rng)).toThrow('Transizione di fase non valida');
  });

  it('EnterPhase in combat e rifiutato dal gate', () => {
    const s = inCombat(withActors(actor('eroe')));
    expect(() => decide(s, { type: 'EnterPhase', to: 'downtime' }, rng)).toThrow('non disponibile in fase combat');
  });
});

describe('invariante phase=combat <=> encounter!=null', () => {
  function holds(s: GameState): boolean {
    return (s.phase === 'combat') === (s.encounter !== null);
  }
  it('vale su initialState e lungo il ciclo di vita di uno scontro', () => {
    let s: GameState = withActors(actor('eroe'));
    expect(holds(s)).toBe(true); // exploration, nessuno scontro
    for (const e of decide(s, { type: 'StartEncounter', encounterId: 'e', participants: [{ actorId: 'eroe', zone: 'a', initiative: 5 }] }, rng)) s = applyEvent(s, e);
    expect(s.phase).toBe('combat');
    expect(holds(s)).toBe(true);
    for (const e of decide(s, { type: 'EndEncounter' }, rng)) s = applyEvent(s, e);
    expect(s.phase).toBe('exploration');
    expect(s.encounter).toBeNull();
    expect(holds(s)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `isCommandLegalInPhase`/`EnterPhase`/`EndEncounter` non esistono; i test aggiornati di Attack/EndTurn/StartEncounter falliscono perché il gate e la coppia atomica non ci sono ancora.

- [ ] **Step 3: Implement `commands.ts`**

In `packages/engine/src/commands.ts`:

1. Aggiungi gli import:
```ts
import type { Phase } from './phase';
import { canTransition, type SoftPhase } from './phase';
```
2. Estendi il tipo `Command` (dopo `AdvanceQuest`):
```ts
  | { type: 'EnterPhase'; to: SoftPhase }
  | { type: 'EndEncounter' };
```
3. Subito prima di `export function decide(…)`, aggiungi il predicato di legalità e gli insiemi:
```ts
// Action-set per fase (spec §5.5). Co-locato con Command/decide: la legalita di fase e una
// proprieta del vocabolario di comandi. phase.ts resta puro (stati + archi).
const COMBAT_ONLY = new Set<Command['type']>(['Attack', 'EndTurn', 'NextRound', 'EndEncounter']);
const NON_COMBAT_ONLY = new Set<Command['type']>(['StartEncounter', 'EnterPhase']);

/** Un comando e legale nella fase data? combat-only solo in combat; i comandi di ingresso in
 *  ogni fase tranne combat (combat e modale); tutto il resto e phase-agnostic. */
export function isCommandLegalInPhase(phase: Phase, type: Command['type']): boolean {
  if (COMBAT_ONLY.has(type)) return phase === 'combat';
  if (NON_COMBAT_ONLY.has(type)) return phase !== 'combat';
  return true;
}
```
4. In cima al corpo di `decide`, prima dello `switch`, aggiungi il gate uniforme:
```ts
export function decide(state: GameState, command: Command, rng: RandomSource): DomainEvent[] {
  if (!isCommandLegalInPhase(state.phase, command.type)) {
    throw new Error(`Azione ${command.type} non disponibile in fase ${state.phase}`);
  }
  switch (command.type) {
```
5. Aggiorna il caso `StartEncounter` perché emetta la coppia atomica:
```ts
    case 'StartEncounter': {
      for (const p of command.participants) {
        if (state.actors[p.actorId] === undefined) {
          throw new Error(`Attore sconosciuto: ${p.actorId}`);
        }
      }
      return [
        { type: 'EncounterStarted', encounter: createEncounter(command.encounterId, command.participants) },
        { type: 'PhaseChanged', from: state.phase, to: 'combat' },
      ];
    }
```
6. Sostituisci i casi `EndTurn`/`NextRound` (rimuovi i guard `encounter === null`: il gate li copre):
```ts
    case 'EndTurn':
      return [{ type: 'TurnEnded' }];
    case 'NextRound':
      return [{ type: 'RoundAdvanced' }];
```
7. Aggiungi due nuovi casi (es. dopo `AdvanceQuest`, prima del `default`):
```ts
    case 'EnterPhase': {
      if (!canTransition(state.phase, command.to)) {
        throw new Error(`Transizione di fase non valida: ${state.phase} -> ${command.to}`);
      }
      return [{ type: 'PhaseChanged', from: state.phase, to: command.to }];
    }
    case 'EndEncounter': {
      const enc = state.encounter; // il gate garantisce phase==='combat' => enc!==null
      if (enc === null) {
        throw new Error('Nessuno scontro attivo'); // difesa in profondita (invariante mai violata)
      }
      return [
        { type: 'EncounterEnded', encounterId: enc.id },
        { type: 'PhaseChanged', from: 'combat', to: 'exploration' },
      ];
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS — engine verde (gate, transizioni, invariante) e nessuna regressione altrove.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/commands.ts packages/engine/src/commands.test.ts
git commit -m "feat(engine): gate di fase in decide + EnterPhase/EndEncounter, attack combat-only (SP4)"
```

---

## Task 5: Tool per fase in `ai` (`master-tools.ts`)

**Files:**
- Modify: `packages/ai/src/master-tools.ts`
- Modify: `packages/ai/src/master-turn.ts` (solo il call-site di `masterToolDefs`, per tenere `ai` compilante)
- Modify: `packages/ai/src/master-tools.test.ts`

- [ ] **Step 1: Write the failing/updated tests**

In `packages/ai/src/master-tools.test.ts`:

**(a)** Sostituisci il primo test (`espone i 9 strumenti …`, righe ~5-17) con due test per fase:
```ts
  it('in combat espone i 9 strumenti di combat con schemi JSON inline (niente ref)', () => {
    const defs = masterToolDefs('combat');
    const names = defs.map((d) => d.name).sort();
    expect(names).toEqual([
      'advance_quest', 'apply_effect', 'attack', 'end_encounter', 'end_turn',
      'next_round', 'request_check', 'spawn_npc', 'start_quest',
    ]);
    for (const d of defs) {
      expect(typeof d.description).toBe('string');
      expect((d.parameters as { type?: string }).type).toBe('object');
      expect(JSON.stringify(d.parameters)).not.toContain('$ref');
    }
  });

  it('in una fase soft espone i 7 strumenti non-combat (start_encounter/enter_phase, niente attack)', () => {
    const names = masterToolDefs('exploration').map((d) => d.name).sort();
    expect(names).toEqual([
      'advance_quest', 'apply_effect', 'enter_phase', 'request_check',
      'spawn_npc', 'start_encounter', 'start_quest',
    ]);
  });
```

**(b)** Nel test "mostra participants come array …" (riga ~22), passa una fase a `masterToolDefs`:
```ts
    const se = masterToolDefs('exploration').find((d) => d.name === 'start_encounter');
```

**(c)** Aggiorna gli altri call-site di `masterToolDefs()` nel file a una fase che espone quel tool:
- il test che cerca `apply_effect` (riga ~384): `masterToolDefs('exploration')` (phase-agnostic, presente).
- il test che cerca `advance_quest` (riga ~443): `masterToolDefs('exploration')`.

**(d)** Aggiungi un `describe` per i due nuovi tool:
```ts
describe('tool di fase enter_phase / end_encounter', () => {
  it('enter_phase mappa a EnterPhase con la fase richiesta', () => {
    const r = resolveToolCall('enter_phase', '{"to":"dialogue"}');
    expect(r).toEqual({ ok: true, toolName: 'enter_phase', command: { type: 'EnterPhase', to: 'dialogue' } });
  });
  it('enter_phase rifiuta una fase fuori enum (anche combat)', () => {
    expect(resolveToolCall('enter_phase', '{"to":"combat"}').ok).toBe(false);
    expect(resolveToolCall('enter_phase', '{"to":"sognante"}').ok).toBe(false);
  });
  it('end_encounter mappa a EndEncounter', () => {
    const r = resolveToolCall('end_encounter', '{}');
    expect(r).toEqual({ ok: true, toolName: 'end_encounter', command: { type: 'EndEncounter' } });
  });
  it('lo schema di enter_phase mostra solo le fasi soft', () => {
    const ep = masterToolDefs('exploration').find((d) => d.name === 'enter_phase');
    if (ep === undefined) throw new Error('atteso enter_phase');
    const to = (ep.parameters as { properties: Record<string, { enum?: string[] }> }).properties.to;
    expect(to?.enum).toEqual(['exploration', 'dialogue', 'downtime']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `masterToolDefs` non accetta un argomento; `enter_phase`/`end_encounter` non esistono.

- [ ] **Step 3: Implement `master-tools.ts`**

In `packages/ai/src/master-tools.ts`:

1. Estendi gli import da `@loomn/engine`:
```ts
import type { Command, Phase } from '@loomn/engine';
import { DIFFICULTIES, QUEST_OUTCOMES, SOFT_PHASES, isCommandLegalInPhase } from '@loomn/engine';
```
2. Aggiungi i due schemi (vicino agli altri, es. dopo `advanceQuestSchema`):
```ts
const enterPhaseSchema = z.object({
  to: z.enum(SOFT_PHASES), // enum auto-validante: niente 'combat', niente fasi inventate
});
const endEncounterSchema = z.object({});
```
3. Aggiungi `commandType` all'interfaccia `ToolEntry`:
```ts
interface ToolEntry {
  description: string;
  jsonSchema: Record<string, unknown>;
  commandType: Command['type'];
  resolve(json: unknown): { ok: true; command: Command } | { ok: false; error: string };
}
```
4. Aggiungi il parametro `commandType` a `makeEntry`:
```ts
function makeEntry<S extends z.ZodTypeAny>(
  description: string,
  commandType: Command['type'],
  schema: S,
  toCommand: (args: z.infer<S>) => Command,
): ToolEntry {
  return {
    description,
    commandType,
    jsonSchema: zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' }) as Record<string, unknown>,
    resolve(json) {
      const v = schema.safeParse(json);
      if (!v.success) return { ok: false, error: issuesOf(v.error) };
      return { ok: true, command: toCommand(v.data) };
    },
  };
}
```
5. In ogni voce di `TOOLS`, inserisci il `commandType` come **secondo** argomento di `makeEntry` (dopo la description). Mappa esatta:

| tool | commandType |
|---|---|
| `spawn_npc` | `'AddActor'` |
| `request_check` | `'RequestCheck'` |
| `apply_effect` | `'ApplyEffect'` |
| `start_quest` | `'StartQuest'` |
| `advance_quest` | `'AdvanceQuest'` |
| `attack` | `'Attack'` |
| `start_encounter` | `'StartEncounter'` |
| `end_turn` | `'EndTurn'` |
| `next_round` | `'NextRound'` |

Esempio (spawn_npc):
```ts
  spawn_npc: makeEntry(
    'Crea e aggiunge un nuovo PNG al mondo (diventa canone). Usa id univoci.',
    'AddActor',
    spawnNpcSchema,
    (a) => ({ /* invariato */ }),
  ),
```
(applica lo stesso pattern a tutte e 9 le voci esistenti.)

6. Aggiungi le due nuove voci a `TOOLS`:
```ts
  enter_phase: makeEntry(
    'Cambia la fase narrativa di gioco: exploration (esplorazione), dialogue (dialogo) o downtime (tempo libero). Per iniziare un combattimento usa invece start_encounter.',
    'EnterPhase',
    enterPhaseSchema,
    (a) => ({ type: 'EnterPhase', to: a.to }),
  ),
  end_encounter: makeEntry(
    'Termina lo scontro attivo e torna alla fase di esplorazione. Usalo quando il combattimento e risolto.',
    'EndEncounter',
    endEncounterSchema,
    () => ({ type: 'EndEncounter' }),
  ),
```
7. Cambia la firma di `masterToolDefs` perché filtri per fase:
```ts
/** Definizioni degli strumenti ABILITATI nella fase corrente: consuma lo stesso
 *  isCommandLegalInPhase dell engine (single source of truth, niente mappa duplicata). */
export function masterToolDefs(phase: Phase): LlmToolDef[] {
  return Object.entries(TOOLS)
    .filter(([, t]) => isCommandLegalInPhase(phase, t.commandType))
    .map(([name, t]) => ({ name, description: t.description, parameters: t.jsonSchema }));
}
```
(`resolveToolCall` resta invariato.)

In `packages/ai/src/master-turn.ts`, aggiorna il call-site (riga ~80) perché passi la fase di inizio turno — tenendo `ai` compilante (Task 6 lo sposterà nel loop):
```ts
  const toolDefs = masterToolDefs(request.state.phase);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS — i tool sono filtrati per fase; `enter_phase`/`end_encounter` risolvono ai Command corretti.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/master-tools.ts packages/ai/src/master-turn.ts packages/ai/src/master-tools.test.ts
git commit -m "feat(ai): tool enter_phase/end_encounter + masterToolDefs filtrato per fase (SP4)"
```

---

## Task 6: Filtro per-iterazione + prompt per fase (`master-turn.ts`)

**Files:**
- Modify: `packages/ai/src/master-turn.ts`
- Modify: `packages/ai/src/master-turn.test.ts`

- [ ] **Step 1: Write the failing/updated tests**

In `packages/ai/src/master-turn.test.ts`:

**(a)** Aggiorna l'import per includere le nuove funzioni:
```ts
import { runMasterTurn, assembleContextStub, buildMasterMessages, phaseGuidance } from './master-turn';
```

**(b)** Dopo `const baseState = replay(setupEvents);` (riga ~66), aggiungi uno stato di combat per i test basati su `attack`:
```ts
const combatSetupEvents: DomainEvent[] = [
  ...setupEvents,
  {
    type: 'EncounterStarted',
    encounter: {
      id: 'e',
      participants: [
        { actorId: 'pc1', zone: 'a', initiative: 10, actedThisRound: false },
        { actorId: 'g1', zone: 'a', initiative: 5, actedThisRound: false },
      ],
      round: 1,
      turnIndex: 0,
    },
  },
  { type: 'PhaseChanged', from: 'exploration', to: 'combat' },
];
const combatState = replay(combatSetupEvents);
```

**(c)** Nei test basati su `attack`, sostituisci `state: baseState` con `state: combatState`:
- `pipeline completa: tool-call attack …` (riga ~81)
- `e deterministico a parita di seed …` (righe ~95-96, entrambe le `runMasterTurn`)
- `gli eventi del turno sono canone replayabile` (riga ~102) e cambia anche l'asserzione finale in `expect(replay([...combatSetupEvents, ...res.events])).toEqual(res.state);`
- `argomenti non validi …` (riga ~121)
- `comando rifiutato dal motore …` (riga ~131)

(Restano su `baseState`: `spawn_npc crea canone`, `nessuna tool-call`, e i due test di iniezione del Context Assembler — sono phase-agnostic.)

**(d)** Aggiungi due nuovi `describe`:
```ts
describe('phaseGuidance e buildMasterMessages', () => {
  it('phaseGuidance ritorna una linea non vuota per ogni fase', () => {
    for (const p of ['exploration', 'dialogue', 'combat', 'downtime'] as const) {
      expect(phaseGuidance(p).length).toBeGreaterThan(0);
    }
  });
  it('buildMasterMessages inietta il frammento della fase nel system prompt', () => {
    const msgs = buildMasterMessages('CTX', 'azione', 'combat');
    expect(msgs[0]?.role).toBe('system');
    expect(msgs[0]?.content).toContain(phaseGuidance('combat'));
    expect(msgs[1]?.content).toBe('CTX');
    expect(msgs[2]?.content).toBe('azione');
  });
});

describe('filtro tool per-iterazione', () => {
  it('flusso start_encounter -> attack: i tool di combat compaiono dopo la transizione', async () => {
    const seen: string[][] = [];
    const model = fakeModel((req, i) => {
      seen.push((req.tools ?? []).map((t) => t.name));
      if (i === 0) {
        return toolCall(
          'start_encounter',
          '{"encounterId":"e","participants":[{"actorId":"pc1","zone":"a","initiative":10},{"actorId":"g1","zone":"a","initiative":5}]}',
        );
      }
      if (i === 1) return toolCall('attack', ATTACK_ARGS);
      return text('Lo scontro infuria.');
    });
    const res = await runMasterTurn({ model, rng: createSeededRandom(42), state: baseState, playerAction: 'Sorprendo il goblin!' });
    expect(seen[0]).toContain('start_encounter');
    expect(seen[0]).not.toContain('attack');
    expect(seen[1]).toContain('attack');
    expect(seen[1]).not.toContain('start_encounter');
    expect(res.events.some((e) => e.type === 'PhaseChanged' && e.to === 'combat')).toBe(true);
    expect(res.events.some((e) => e.type === 'AttackResolved')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `phaseGuidance` non esiste; `buildMasterMessages` ha ancora 2 parametri; il flusso per-iterazione non offre `attack` dopo la transizione (toolDefs è calcolato una sola volta).

- [ ] **Step 3: Implement `master-turn.ts`**

In `packages/ai/src/master-turn.ts`:

1. Estendi l'import da `@loomn/engine` con `type Phase`:
```ts
import { decide, applyEvent, type Command, type DomainEvent, type GameState, type Phase, type RandomSource } from '@loomn/engine';
```
2. Dopo `SYSTEM_PROMPT`, aggiungi le linee-guida per fase e la funzione pura:
```ts
const PHASE_GUIDANCE: Record<Phase, string> = {
  exploration: 'Fase: esplorazione. Descrivi luoghi e dettagli sensoriali; per iniziare uno scontro usa start_encounter.',
  dialogue: 'Fase: dialogo. Interpreta i PNG in prima persona; dai peso alle scelte sociali.',
  combat: 'Fase: combattimento. Sii tattico e conciso; usa attack/end_turn/next_round e chiudi con end_encounter quando lo scontro e risolto.',
  downtime: 'Fase: tempo libero. Ritmo riflessivo: recupero, preparativi, relazioni.',
};

/** Linea-guida di strategia per la fase data (spec §5.5). Unita pura, riusabile. */
export function phaseGuidance(phase: Phase): string {
  return PHASE_GUIDANCE[phase];
}
```
3. Cambia `buildMasterMessages` perché accetti la fase e inietti il frammento:
```ts
export function buildMasterMessages(context: string, playerAction: string, phase: Phase): LlmMessage[] {
  return [
    { role: 'system', content: `${SYSTEM_PROMPT}\n${phaseGuidance(phase)}` },
    { role: 'system', content: context },
    { role: 'user', content: playerAction },
  ];
}
```
4. In `runMasterTurn`:
   - **rimuovi** la riga `const toolDefs = masterToolDefs(request.state.phase);` (era prima del loop, aggiunta in Task 5).
   - aggiorna la costruzione dei messaggi iniziali (usa la fase di inizio turno):
```ts
  const messages: LlmMessage[] = buildMasterMessages(assemble(state), request.playerAction, state.phase);
```
   - **dentro** il `for (let iter …)`, come prima riga del corpo, calcola i tool per la fase corrente:
```ts
  for (let iter = 0; iter < maxIterations; iter++) {
    const toolDefs = masterToolDefs(state.phase);
    const res = await collectResponse(request.model.stream({ messages, tools: toolDefs, toolChoice: 'auto' }));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS — il frammento di fase è iniettato, il flusso start_encounter→attack funziona per-iterazione, i test attack (combat) verdi.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/master-turn.ts packages/ai/src/master-turn.test.ts
git commit -m "feat(ai): filtro tool per-iterazione + frammento di prompt per fase (SP4)"
```

---

## Verifica finale

- [ ] **Step 1: Suite completa**

Run: `pnpm test`
Expected: PASS — tutti i pacchetti verdi (atteso ~360 + i nuovi test SP4).

- [ ] **Step 2: Typecheck di tutti i progetti**

Run: `pnpm -r typecheck`
Expected: exit 0 (6 progetti, incluso `app/desktop` via `vue-tsc`).

- [ ] **Step 3: Guardia bug apostrofo**

Run: `git grep -nE "(it|describe)\('[^']*'[A-Za-zàèéìòù]" -- 'packages/**/*.test.ts'`
Expected: no matches.

---

## Self-Review (writing-plans)

**Spec coverage:**
- §2 phase primario + invariante → Task 2 (campo) + Task 4 (invariante testata). ✓
- §3 `phase.ts` (PHASES/canTransition) → Task 1; `isCommandLegalInPhase` → Task 4. ✓
- §4 EnterPhase/EndEncounter, gate uniforme, StartEncounter pair, EndTurn/NextRound cleanup, attack combat-only, eventi PhaseChanged/EncounterEnded → Task 3 (eventi) + Task 4 (command/decide). ✓
- §5 tool enter_phase/end_encounter, masterToolDefs(phase), filtro per-iterazione, phaseGuidance/buildMasterMessages → Task 5 + Task 6. ✓
- §6 phaseSchema, gameStateSchema.phase, eventi in domainEventSchema → Task 2 + Task 3. ✓
- §7 confini di scena (substrato) → coperto dagli eventi PhaseChanged (Task 3); segmentazione = item 6, fuori scope (nessun task, corretto). ✓
- §9 strategia di test → distribuita Task 1-6. ✓
- §10 file toccati / ripple → mappati nei file-list dei task. ✓

**Placeholder scan:** nessun TBD/TODO; ogni step ha codice/comando concreto. ✓

**Type consistency:** `Phase`/`SoftPhase`/`PHASES`/`SOFT_PHASES`/`canTransition`/`INITIAL_PHASE` (Task 1) usati coerentemente in Task 2-6; `isCommandLegalInPhase(phase, Command['type'])` definita Task 4, consumata Task 5; `PhaseChanged{from,to}`/`EncounterEnded{encounterId}` coerenti tra engine (Task 3), shared (Task 3), test (Task 4/6); `masterToolDefs(phase)` (Task 5) e call-site spostato nel loop (Task 6); `buildMasterMessages(context, playerAction, phase)`/`phaseGuidance(phase)` coerenti (Task 6). ✓
