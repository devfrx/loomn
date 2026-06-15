# Loomn — Fase 1 / Piano 5: Event Sourcing (Campaign/World)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introdurre l'Event Sourcing per il contesto Campaign/World: comandi che producono eventi immutabili, una proiezione (`GameState`) ricostruita applicando gli eventi, e uno store append-only con concorrenza ottimistica e snapshot — avvolgendo le funzioni pure dei Piani 2-4.

**Architecture:** Tre nuovi moduli in `@loomn/engine`. `events.ts`: tipi `DomainEvent`/`GameState` + reducer `applyEvent` (deterministico, **niente RNG**) + `replay`. `commands.ts`: tipi `Command` + `decide(state, command, rng)` che valida e produce eventi (qui si consuma l'RNG, riusando le funzioni pure del dominio). `event-store.ts`: porta `EventStore` + implementazione in-memory con concorrenza ottimistica (`expectedVersion`) + `takeSnapshot`/`rebuild`. **Separazione chiave:** `decide` usa l'RNG e registra i *fatti* negli eventi; `applyEvent` riapplica i fatti senza RNG → replay deterministico. Lo store è l'unico pezzo con stato mutabile (è un adapter, non dominio puro). TDD rigoroso.

**Tech Stack:** TypeScript (strict: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Vitest. Nessuna nuova dipendenza.

---

## Riferimenti allo spec

Implementa, dello spec [2026-06-15-simulatore-campagne-ai-design.md](../specs/2026-06-15-simulatore-campagne-ai-design.md):
- §5.1 Event Sourcing + CQRS (Command → Event; eventi unica fonte di verità; stato = proiezione);
- §5.3c schema event sourcing (evento, proiezione, snapshot);
- §6 (L1) lo stream eventi come base dello stato strutturato;
- §5.6 concorrenza ottimistica (`expectedVersion`) — predisposizione multiplayer.

**Fuori ambito (piani successivi):** persistenza SQLite della porta `EventStore` (§4, Piano 6 — implementerà la *stessa* interfaccia `EventStore`); upcasting/versionamento payload (rimandato; qui gli eventi sono in-process); meta degli eventi con timestamp/cause (richiede un `Clock` iniettato — lo aggiungerà il layer app, Piano 9, per non introdurre `Date.now` nell'engine puro). Il wrapper ES del **movimento** è rimandato (è meccanico; il dominio è già nel Piano 4).

**Prerequisito:** Piani 1-4 mergiati in `main` (`@loomn/engine`; `pnpm test` → 69 verdi). Lavorare su un branch dedicato, non su `main`.

---

## Struttura dei file (questo piano)

```
packages/engine/src/
├─ events.ts         ← NUOVO: DomainEvent, GameState, initialState, applyEvent (reducer), replay
├─ commands.ts       ← NUOVO: Command, decide (validazione + produzione eventi)
├─ event-store.ts    ← NUOVO: EventStore, createInMemoryEventStore, ConcurrencyError, snapshot/rebuild
├─ index.ts          ← MODIFICA: aggiunge ./events, ./commands, ./event-store
└─ *.test.ts         ← un file di test per ciascun modulo
```

**Disciplina di scope (obbligatoria):** modificare SOLO i file elencati in ciascun task. NON toccare `package.json`, `tsconfig.json` (root o package), `vitest.config.ts`, né creare un `tsconfig.json` di root o aggiungere `composite`/project references. Se sembra servire un cambio di build-config, FERMARSI e segnalarlo. `git status --short` deve mostrare solo i file previsti prima di ogni commit.

**Grafo dipendenze (aciclico):** `events` → actor/resource/condition/encounter/check. `commands` → events + encounter/combat/dice/actor. `event-store` → events. Nessun modulo del dominio importa events/commands/event-store.

---

## Task 1: Eventi, `GameState`, reducer `applyEvent` e `replay`

Il cuore: i tipi degli eventi, lo stato proiettato e la funzione pura che applica un evento allo stato (deterministica, senza RNG). `version` = numero di eventi applicati (serve alla concorrenza ottimistica).

**Files:**
- Create: `packages/engine/src/events.ts`
- Test: `packages/engine/src/events.test.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Scrivi il test che fallisce `packages/engine/src/events.test.ts`:**
```ts
import { describe, it, expect } from 'vitest';
import type { Actor } from './actor';
import type { CheckResult } from './check';
import { createEncounter } from './encounter';
import { applyEvent, replay, initialState, type DomainEvent, type GameState } from './events';

function actor(id: string, hp = 10): Actor {
  return {
    id,
    name: id,
    kind: 'npc',
    attributes: {},
    skills: {},
    resources: { hp: { current: hp, max: 10 } },
    conditions: [],
    items: [],
    progression: { xp: 0, level: 1 },
  };
}

function withActors(...as: Actor[]): GameState {
  let s = initialState;
  for (const a of as) {
    s = applyEvent(s, { type: 'ActorAdded', actor: a });
  }
  return s;
}

describe('applyEvent', () => {
  it('ActorAdded registra l attore e incrementa la versione', () => {
    const s = applyEvent(initialState, { type: 'ActorAdded', actor: actor('eroe') });
    expect(s.actors['eroe']?.id).toBe('eroe');
    expect(s.version).toBe(1);
  });

  it('EncounterStarted imposta lo scontro', () => {
    const enc = createEncounter('e', [{ actorId: 'eroe', zone: 'a', initiative: 10 }]);
    const s = applyEvent(withActors(actor('eroe')), { type: 'EncounterStarted', encounter: enc });
    expect(s.encounter?.id).toBe('e');
  });

  it('TurnEnded avanza il turno', () => {
    const enc = createEncounter('e', [
      { actorId: 'a1', zone: 'a', initiative: 10 },
      { actorId: 'a2', zone: 'a', initiative: 5 },
    ]);
    let s = applyEvent(withActors(actor('a1'), actor('a2')), { type: 'EncounterStarted', encounter: enc });
    s = applyEvent(s, { type: 'TurnEnded' });
    expect(s.encounter?.turnIndex).toBe(1);
  });

  it('RoundAdvanced incrementa il round e riparte', () => {
    const enc = createEncounter('e', [{ actorId: 'a1', zone: 'a', initiative: 10 }]);
    let s = applyEvent(withActors(actor('a1')), { type: 'EncounterStarted', encounter: enc });
    s = applyEvent(s, { type: 'RoundAdvanced' });
    expect(s.encounter?.round).toBe(2);
    expect(s.encounter?.turnIndex).toBe(0);
  });

  it('DamageApplied riduce la risorsa del bersaglio', () => {
    const s = applyEvent(withActors(actor('goblin')), {
      type: 'DamageApplied',
      targetId: 'goblin',
      resource: 'hp',
      amount: 4,
    });
    expect(s.actors['goblin']?.resources['hp']?.current).toBe(6);
  });

  it('ActorDowned aggiunge morente una sola volta', () => {
    let s = withActors(actor('goblin'));
    s = applyEvent(s, { type: 'ActorDowned', actorId: 'goblin' });
    s = applyEvent(s, { type: 'ActorDowned', actorId: 'goblin' });
    const morente = s.actors['goblin']?.conditions.filter((c) => c.key === 'morente') ?? [];
    expect(morente).toHaveLength(1);
  });

  it('AttackResolved non cambia lo stato ma incrementa la versione', () => {
    const base = withActors(actor('eroe'), actor('goblin'));
    const check: CheckResult = {
      dice: [{ sides: 20, value: 15 }],
      modifierTotal: 0,
      total: 15,
      mode: 'check',
      dc: 10,
      margin: 5,
      outcome: 'success',
    };
    const s = applyEvent(base, { type: 'AttackResolved', attackerId: 'eroe', targetId: 'goblin', check, hit: true });
    expect(s.actors).toEqual(base.actors);
    expect(s.version).toBe(base.version + 1);
  });

  it('lancia per DamageApplied su attore sconosciuto', () => {
    expect(() =>
      applyEvent(initialState, { type: 'DamageApplied', targetId: 'ignoto', resource: 'hp', amount: 1 }),
    ).toThrow('Attore sconosciuto: ignoto');
  });

  it('lancia per TurnEnded senza scontro', () => {
    expect(() => applyEvent(initialState, { type: 'TurnEnded' })).toThrow('Nessuno scontro attivo');
  });
});

describe('replay', () => {
  it('ricostruisce lo stato applicando la sequenza di eventi', () => {
    const events: DomainEvent[] = [
      { type: 'ActorAdded', actor: actor('goblin') },
      { type: 'DamageApplied', targetId: 'goblin', resource: 'hp', amount: 10 },
      { type: 'ActorDowned', actorId: 'goblin' },
    ];
    const s = replay(events);
    expect(s.version).toBe(3);
    expect(s.actors['goblin']?.resources['hp']?.current).toBe(0);
    expect(s.actors['goblin']?.conditions.some((c) => c.key === 'morente')).toBe(true);
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import './events'`.

- [ ] **Step 3: Scrivi `packages/engine/src/events.ts`:**
```ts
import type { Actor } from './actor';
import type { CheckResult } from './check';
import { adjustResource } from './resource';
import { addCondition } from './condition';
import { endTurn, nextRound, type Encounter } from './encounter';

export type DomainEvent =
  | { type: 'ActorAdded'; actor: Actor }
  | { type: 'EncounterStarted'; encounter: Encounter }
  | { type: 'TurnEnded' }
  | { type: 'RoundAdvanced' }
  | { type: 'AttackResolved'; attackerId: string; targetId: string; check: CheckResult; hit: boolean }
  | { type: 'DamageApplied'; targetId: string; resource: string; amount: number }
  | { type: 'ActorDowned'; actorId: string };

export interface GameState {
  version: number;
  actors: Record<string, Actor>;
  encounter: Encounter | null;
}

export const initialState: GameState = { version: 0, actors: {}, encounter: null };

function requireActor(state: GameState, id: string): Actor {
  const a = state.actors[id];
  if (a === undefined) {
    throw new Error(`Attore sconosciuto: ${id}`);
  }
  return a;
}

function requireEncounter(state: GameState): Encounter {
  if (state.encounter === null) {
    throw new Error('Nessuno scontro attivo');
  }
  return state.encounter;
}

/** Proietta un evento sullo stato. Deterministico, niente RNG: i fatti casuali sono
 *  già risolti dentro l'evento. Funzione pura. La versione è sempre incrementata. */
export function applyEvent(state: GameState, event: DomainEvent): GameState {
  const bumped: GameState = { ...state, version: state.version + 1 };
  switch (event.type) {
    case 'ActorAdded':
      return { ...bumped, actors: { ...state.actors, [event.actor.id]: event.actor } };
    case 'EncounterStarted':
      return { ...bumped, encounter: event.encounter };
    case 'TurnEnded':
      return { ...bumped, encounter: endTurn(requireEncounter(state)) };
    case 'RoundAdvanced':
      return { ...bumped, encounter: nextRound(requireEncounter(state)) };
    case 'AttackResolved':
      return bumped; // record narrativo: nessuna modifica di stato
    case 'DamageApplied': {
      const target = adjustResource(requireActor(state, event.targetId), event.resource, -event.amount);
      return { ...bumped, actors: { ...state.actors, [event.targetId]: target } };
    }
    case 'ActorDowned': {
      const actor = requireActor(state, event.actorId);
      if (actor.conditions.some((c) => c.key === 'morente')) {
        return bumped;
      }
      const downed = addCondition(actor, {
        key: 'morente',
        source: 'combat',
        effects: [],
        duration: { kind: 'permanent' },
      });
      return { ...bumped, actors: { ...state.actors, [event.actorId]: downed } };
    }
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

/** Ricostruisce lo stato applicando una sequenza di eventi dallo stato iniziale. */
export function replay(events: DomainEvent[]): GameState {
  return events.reduce(applyEvent, initialState);
}
```

- [ ] **Step 4: Esegui il test per verificare che passi**

Run: `pnpm test`
Expected: PASS — **79 test** (69 + 10 nuovi).

- [ ] **Step 5: Aggiungi al barrel** — in fondo a `packages/engine/src/index.ts`:
```ts
export * from './events';
```

- [ ] **Step 6: Verifica typecheck + test**

Run: `pnpm -C packages/engine typecheck && pnpm test`
Expected: nessun errore di tipo; tutti i test PASS.

- [ ] **Step 7: Verifica scope e commit**

Run: `git status --short` (solo i 3 file previsti).
```bash
git add packages/engine/src/events.ts packages/engine/src/events.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): event sourcing - eventi, GameState, applyEvent e replay"
```

---

## Task 2: Comandi semplici — `decide`

`decide(state, command, rng)` valida un comando contro lo stato e produce gli eventi. Qui i comandi semplici: aggiunta attore, avvio scontro, fine turno, round successivo.

**Files:**
- Create: `packages/engine/src/commands.ts`
- Test: `packages/engine/src/commands.test.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Scrivi il test che fallisce `packages/engine/src/commands.test.ts`:**
```ts
import { describe, it, expect } from 'vitest';
import type { Actor } from './actor';
import type { RandomSource } from './random';
import { decide } from './commands';
import { applyEvent, initialState, type GameState } from './events';

function actor(id: string): Actor {
  return {
    id,
    name: id,
    kind: 'npc',
    attributes: {},
    skills: {},
    resources: { hp: { current: 10, max: 10 } },
    conditions: [],
    items: [],
    progression: { xp: 0, level: 1 },
  };
}

function withActors(...as: Actor[]): GameState {
  let s = initialState;
  for (const a of as) {
    s = applyEvent(s, { type: 'ActorAdded', actor: a });
  }
  return s;
}

const rng: RandomSource = { next: () => 0.5 };

describe('decide AddActor', () => {
  it('emette ActorAdded', () => {
    const events = decide(initialState, { type: 'AddActor', actor: actor('eroe') }, rng);
    expect(events).toEqual([{ type: 'ActorAdded', actor: actor('eroe') }]);
  });
  it('lancia se l attore è già presente', () => {
    const s = withActors(actor('eroe'));
    expect(() => decide(s, { type: 'AddActor', actor: actor('eroe') }, rng)).toThrow('già presente');
  });
});

describe('decide StartEncounter', () => {
  it('emette EncounterStarted con i partecipanti ordinati per iniziativa', () => {
    const s = withActors(actor('eroe'), actor('goblin'));
    const events = decide(
      s,
      {
        type: 'StartEncounter',
        encounterId: 'e',
        participants: [
          { actorId: 'goblin', zone: 'a', initiative: 5 },
          { actorId: 'eroe', zone: 'a', initiative: 10 },
        ],
      },
      rng,
    );
    expect(events).toHaveLength(1);
    const ev = events[0]!;
    expect(ev.type).toBe('EncounterStarted');
    if (ev.type === 'EncounterStarted') {
      expect(ev.encounter.participants.map((p) => p.actorId)).toEqual(['eroe', 'goblin']);
    }
  });
  it('lancia se un partecipante non esiste', () => {
    const s = withActors(actor('eroe'));
    expect(() =>
      decide(s, { type: 'StartEncounter', encounterId: 'e', participants: [{ actorId: 'ignoto', zone: 'a', initiative: 5 }] }, rng),
    ).toThrow('Attore sconosciuto');
  });
});

describe('decide EndTurn e NextRound', () => {
  function withEncounter(): GameState {
    let s = withActors(actor('eroe'));
    s = applyEvent(s, {
      type: 'EncounterStarted',
      encounter: { id: 'e', participants: [{ actorId: 'eroe', zone: 'a', initiative: 10, actedThisRound: false }], round: 1, turnIndex: 0 },
    });
    return s;
  }
  it('EndTurn emette TurnEnded quando c è uno scontro', () => {
    expect(decide(withEncounter(), { type: 'EndTurn' }, rng)).toEqual([{ type: 'TurnEnded' }]);
  });
  it('EndTurn lancia senza scontro', () => {
    expect(() => decide(initialState, { type: 'EndTurn' }, rng)).toThrow('Nessuno scontro attivo');
  });
  it('NextRound emette RoundAdvanced', () => {
    expect(decide(withEncounter(), { type: 'NextRound' }, rng)).toEqual([{ type: 'RoundAdvanced' }]);
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import './commands'`.

- [ ] **Step 3: Scrivi `packages/engine/src/commands.ts`:**
```ts
import type { RandomSource } from './random';
import type { Actor } from './actor';
import { createEncounter, type ParticipantInput } from './encounter';
import type { GameState, DomainEvent } from './events';

export type Command =
  | { type: 'AddActor'; actor: Actor }
  | { type: 'StartEncounter'; encounterId: string; participants: ParticipantInput[] }
  | { type: 'EndTurn' }
  | { type: 'NextRound' };

/** Valida un comando contro lo stato e produce gli eventi risultanti.
 *  L'RNG è disponibile per i comandi che lo richiedono (qui nessuno). Funzione pura. */
export function decide(state: GameState, command: Command, rng: RandomSource): DomainEvent[] {
  switch (command.type) {
    case 'AddActor':
      if (state.actors[command.actor.id] !== undefined) {
        throw new Error(`Attore già presente: ${command.actor.id}`);
      }
      return [{ type: 'ActorAdded', actor: command.actor }];
    case 'StartEncounter': {
      for (const p of command.participants) {
        if (state.actors[p.actorId] === undefined) {
          throw new Error(`Attore sconosciuto: ${p.actorId}`);
        }
      }
      return [{ type: 'EncounterStarted', encounter: createEncounter(command.encounterId, command.participants) }];
    }
    case 'EndTurn':
      if (state.encounter === null) {
        throw new Error('Nessuno scontro attivo');
      }
      return [{ type: 'TurnEnded' }];
    case 'NextRound':
      if (state.encounter === null) {
        throw new Error('Nessuno scontro attivo');
      }
      return [{ type: 'RoundAdvanced' }];
    default: {
      const _exhaustive: never = command;
      return _exhaustive;
    }
  }
}
```
> Nota: il parametro `rng` non è usato dai comandi di questo task ma fa parte della firma (il Task 3 lo userà per `Attack`). Il tsconfig non ha `noUnusedParameters`, quindi non è un errore.

- [ ] **Step 4: Esegui il test per verificare che passi**

Run: `pnpm test`
Expected: PASS — **86 test** (79 + 7 nuovi).

- [ ] **Step 5: Aggiungi al barrel** — in fondo a `packages/engine/src/index.ts`:
```ts
export * from './commands';
```

- [ ] **Step 6: Verifica typecheck + test**

Run: `pnpm -C packages/engine typecheck && pnpm test`
Expected: nessun errore di tipo; tutti i test PASS.

- [ ] **Step 7: Verifica scope e commit**

Run: `git status --short` (solo i 3 file previsti).
```bash
git add packages/engine/src/commands.ts packages/engine/src/commands.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): decide per i comandi base (AddActor, StartEncounter, EndTurn, NextRound)"
```

---

## Task 3: Comando `Attack` — decisione che consuma RNG e produce eventi-fatto

L'integrazione: `decide(Attack)` esegue `performAttack` (consumando l'RNG) e traduce il risultato in eventi-fatto deterministici (`AttackResolved` + eventuali `DamageApplied`/`ActorDowned`). Il replay non rieseguirà mai l'RNG.

**Files:**
- Modify: `packages/engine/src/commands.ts`
- Modify: `packages/engine/src/commands.test.ts`

- [ ] **Step 1: Scrivi i test che falliscono.** In `packages/engine/src/commands.test.ts`, aggiorna gli import in cima aggiungendo `Item`:
```ts
import type { Actor, Item } from './actor';
```
e aggiungi in fondo al file:
```ts
function stub(values: number[]): RandomSource {
  let i = 0;
  return { next: () => values[i++ % values.length]! };
}

const weapon: Item = {
  id: 'sword',
  name: 'Spadone',
  equipped: true,
  effects: [{ kind: 'contributeDice', dice: [{ count: 2, sides: 6 }], mode: 'effect' }],
};

function hero(): Actor {
  return {
    id: 'eroe',
    name: 'Eroe',
    kind: 'pc',
    attributes: { forza: 3 },
    skills: {},
    resources: { hp: { current: 10, max: 10 } },
    conditions: [],
    items: [weapon],
    progression: { xp: 0, level: 1 },
  };
}

describe('decide Attack', () => {
  it('colpo a segno: emette AttackResolved, DamageApplied e ActorDowned', () => {
    const s = withActors(hero(), actor('goblin'));
    // d20=0.95 -> 20 (+3 forza = 23 vs CD 10, critico) ; danno 2d6=4+4=8 ; +2 = 10 -> goblin a 0
    const events = decide(
      s,
      {
        type: 'Attack',
        attackerId: 'eroe',
        targetId: 'goblin',
        attribute: 'forza',
        defense: 'difesa',
        defenseBase: 10,
        damageResource: 'hp',
        damageModifiers: [{ value: 2, source: 'forza' }],
      },
      stub([0.95, 0.5, 0.5]),
    );
    expect(events.map((e) => e.type)).toEqual(['AttackResolved', 'DamageApplied', 'ActorDowned']);
  });

  it('colpo mancato: emette solo AttackResolved', () => {
    const s = withActors(hero(), actor('goblin'));
    const events = decide(
      s,
      { type: 'Attack', attackerId: 'eroe', targetId: 'goblin', attribute: 'forza', defense: 'difesa', defenseBase: 10, damageResource: 'hp' },
      stub([0]),
    );
    expect(events.map((e) => e.type)).toEqual(['AttackResolved']);
  });

  it('lancia se attaccante o bersaglio sono sconosciuti', () => {
    expect(() =>
      decide(initialState, { type: 'Attack', attackerId: 'x', targetId: 'y', defense: 'difesa', defenseBase: 10, damageResource: 'hp' }, stub([0.5])),
    ).toThrow('sconosciuto');
  });

  it('ciclo decide->apply: l attacco riduce gli HP nello stato', () => {
    let s = withActors(hero(), actor('goblin'));
    const events = decide(
      s,
      { type: 'Attack', attackerId: 'eroe', targetId: 'goblin', attribute: 'forza', defense: 'difesa', defenseBase: 10, damageResource: 'hp' },
      stub([0.95, 0.5, 0.5]),
    );
    for (const e of events) {
      s = applyEvent(s, e);
    }
    expect(s.actors['goblin']?.resources['hp']?.current).toBe(2); // 10 - 8 (2d6, nessun modificatore)
  });
});
```

- [ ] **Step 2: Esegui i test per verificare che falliscano**

Run: `pnpm test`
Expected: FAIL — il tipo `Command` non ammette `'Attack'` / il caso non è gestito.

- [ ] **Step 3: Estendi `packages/engine/src/commands.ts`.** Cambia gli import in cima aggiungendo `Modifier` e `performAttack`:
```ts
import type { RandomSource } from './random';
import type { Actor } from './actor';
import type { Modifier } from './dice';
import { createEncounter, type ParticipantInput } from './encounter';
import { performAttack } from './combat';
import type { GameState, DomainEvent } from './events';
```
Aggiungi la variante `Attack` all'unione `Command` (come ultimo membro):
```ts
  | {
      type: 'Attack';
      attackerId: string;
      targetId: string;
      attribute?: string;
      skill?: string;
      defense: string;
      defenseBase: number;
      damageResource: string;
      damageModifiers?: Modifier[];
    };
```
e aggiungi il caso nello `switch` di `decide`, PRIMA del `default`:
```ts
    case 'Attack': {
      const attacker = state.actors[command.attackerId];
      const target = state.actors[command.targetId];
      if (attacker === undefined || target === undefined) {
        throw new Error('Attaccante o bersaglio sconosciuto');
      }
      const result = performAttack(
        {
          attacker,
          target,
          defense: command.defense,
          defenseBase: command.defenseBase,
          damageResource: command.damageResource,
          ...(command.attribute !== undefined ? { attribute: command.attribute } : {}),
          ...(command.skill !== undefined ? { skill: command.skill } : {}),
          ...(command.damageModifiers !== undefined ? { damageModifiers: command.damageModifiers } : {}),
        },
        rng,
      );
      const events: DomainEvent[] = [
        { type: 'AttackResolved', attackerId: command.attackerId, targetId: command.targetId, check: result.check, hit: result.hit },
      ];
      if (result.hit) {
        events.push({ type: 'DamageApplied', targetId: command.targetId, resource: command.damageResource, amount: result.damage });
        if (result.downed) {
          events.push({ type: 'ActorDowned', actorId: command.targetId });
        }
      }
      return events;
    }
```

- [ ] **Step 4: Esegui il test per verificare che passi**

Run: `pnpm test`
Expected: PASS — **90 test** (86 + 4 nuovi).

- [ ] **Step 5: Verifica typecheck + test**

Run: `pnpm -C packages/engine typecheck && pnpm test`
Expected: nessun errore di tipo; tutti i test PASS.

- [ ] **Step 6: Verifica scope e commit**

Run: `git status --short` (solo i 2 file previsti).
```bash
git add packages/engine/src/commands.ts packages/engine/src/commands.test.ts
git commit -m "feat(engine): comando Attack (decide consuma RNG, eventi-fatto deterministici)"
```

---

## Task 4: `EventStore` con concorrenza ottimistica + snapshot/rebuild

La porta `EventStore` (append-only) e la sua implementazione in-memory. `append` rispetta `expectedVersion` (concorrenza ottimistica, predisposizione multiplayer). `takeSnapshot`/`rebuild` permettono di ricostruire lo stato da uno snapshot più gli eventi successivi (performance).

**Files:**
- Create: `packages/engine/src/event-store.ts`
- Test: `packages/engine/src/event-store.test.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Scrivi il test che fallisce `packages/engine/src/event-store.test.ts`:**
```ts
import { describe, it, expect } from 'vitest';
import type { Actor } from './actor';
import type { DomainEvent } from './events';
import { createInMemoryEventStore, takeSnapshot, rebuild, ConcurrencyError } from './event-store';

function actor(id: string): Actor {
  return {
    id,
    name: id,
    kind: 'npc',
    attributes: {},
    skills: {},
    resources: { hp: { current: 10, max: 10 } },
    conditions: [],
    items: [],
    progression: { xp: 0, level: 1 },
  };
}

const evs: DomainEvent[] = [
  { type: 'ActorAdded', actor: actor('goblin') },
  { type: 'DamageApplied', targetId: 'goblin', resource: 'hp', amount: 3 },
  { type: 'DamageApplied', targetId: 'goblin', resource: 'hp', amount: 3 },
];

describe('createInMemoryEventStore', () => {
  it('appende eventi, traccia la versione e li ricarica con seq progressivo', () => {
    const store = createInMemoryEventStore();
    expect(store.version()).toBe(0);
    const v = store.append(evs, 0);
    expect(v).toBe(3);
    expect(store.version()).toBe(3);
    expect(store.load().map((s) => s.seq)).toEqual([1, 2, 3]);
  });

  it('lancia ConcurrencyError se expectedVersion non coincide', () => {
    const store = createInMemoryEventStore();
    store.append(evs, 0);
    expect(() => store.append([{ type: 'TurnEnded' }], 0)).toThrow(ConcurrencyError);
  });
});

describe('snapshot e rebuild', () => {
  it('rebuild senza snapshot equivale al replay completo', () => {
    const store = createInMemoryEventStore();
    store.append(evs, 0);
    const s = rebuild(store.load());
    expect(s.version).toBe(3);
    expect(s.actors['goblin']?.resources['hp']?.current).toBe(4);
  });

  it('rebuild da snapshot applica solo gli eventi successivi e dà lo stesso stato', () => {
    const store = createInMemoryEventStore();
    store.append(evs, 0);
    const snap = takeSnapshot(rebuild(store.load()));
    store.append([{ type: 'DamageApplied', targetId: 'goblin', resource: 'hp', amount: 2 }], 3);
    const full = rebuild(store.load());
    const fromSnap = rebuild(store.load(), snap);
    expect(fromSnap).toEqual(full);
    expect(fromSnap.actors['goblin']?.resources['hp']?.current).toBe(2);
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import './event-store'`.

- [ ] **Step 3: Scrivi `packages/engine/src/event-store.ts`:**
```ts
import type { DomainEvent, GameState } from './events';
import { applyEvent, replay } from './events';

export interface StoredEvent {
  seq: number;
  event: DomainEvent;
}

/** Errore di concorrenza ottimistica: la versione attesa non coincide con quella attuale. */
export class ConcurrencyError extends Error {
  constructor(expected: number, actual: number) {
    super(`Conflitto di concorrenza: atteso ${expected}, attuale ${actual}`);
    this.name = 'ConcurrencyError';
  }
}

export interface EventStore {
  /** Versione corrente = numero di eventi nello stream. */
  version(): number;
  /** Aggiunge eventi se `expectedVersion` coincide con la versione corrente; ritorna la nuova
   *  versione. Lancia `ConcurrencyError` in caso di conflitto (concorrenza ottimistica). */
  append(events: DomainEvent[], expectedVersion: number): number;
  /** Tutti gli eventi memorizzati, in ordine, con il loro seq (1-based). */
  load(): StoredEvent[];
}

/** Implementazione in-memory della porta EventStore. La persistenza (SQLite) implementerà
 *  la stessa interfaccia in un piano successivo. */
export function createInMemoryEventStore(): EventStore {
  const stored: StoredEvent[] = [];
  return {
    version() {
      return stored.length;
    },
    append(events, expectedVersion) {
      if (expectedVersion !== stored.length) {
        throw new ConcurrencyError(expectedVersion, stored.length);
      }
      for (const event of events) {
        stored.push({ seq: stored.length + 1, event });
      }
      return stored.length;
    },
    load() {
      return [...stored];
    },
  };
}

export interface Snapshot {
  state: GameState;
  version: number;
}

/** Crea uno snapshot dallo stato corrente (la sua `version`). */
export function takeSnapshot(state: GameState): Snapshot {
  return { state, version: state.version };
}

/** Ricostruisce lo stato: da uno snapshot applica solo gli eventi con seq successivo alla sua
 *  versione; senza snapshot riapplica tutti gli eventi dallo stato iniziale. */
export function rebuild(stored: StoredEvent[], snapshot?: Snapshot): GameState {
  if (snapshot === undefined) {
    return replay(stored.map((s) => s.event));
  }
  const tail = stored.filter((s) => s.seq > snapshot.version).map((s) => s.event);
  return tail.reduce(applyEvent, snapshot.state);
}
```

- [ ] **Step 4: Esegui il test per verificare che passi**

Run: `pnpm test`
Expected: PASS — **94 test** (90 + 4 nuovi).

- [ ] **Step 5: Aggiungi al barrel** — in fondo a `packages/engine/src/index.ts`. Il file finale deve contenere, in ordine:
```ts
export * from './random';
export * from './dice';
export * from './check';
export * from './actor';
export * from './resource';
export * from './condition';
export * from './actor-check';
export * from './item';
export * from './progression';
export * from './zone';
export * from './encounter';
export * from './combat';
export * from './events';
export * from './commands';
export * from './event-store';
```

- [ ] **Step 6: Verifica finale typecheck + test**

Run: `pnpm -C packages/engine typecheck && pnpm test`
Expected: nessun errore di tipo; tutti i test PASS (94).

- [ ] **Step 7: Verifica scope e commit**

Run: `git status --short` (solo i 3 file previsti).
```bash
git add packages/engine/src/event-store.ts packages/engine/src/event-store.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): EventStore in-memory (concorrenza ottimistica) e snapshot/rebuild"
```

---

## Self-Review (eseguita)

**1. Copertura spec (per i confini di questo piano):**
- §5.1 Command → Event, eventi unica fonte di verità, stato = proiezione → Task 1 (`applyEvent`/`replay`) + Task 2-3 (`decide`). ✔
- §5.3c evento/proiezione/snapshot → Task 1 (`DomainEvent`/`GameState`) + Task 4 (`takeSnapshot`/`rebuild`). ✔
- §6 (L1) stream eventi → stato strutturato → `GameState` ricostruito via `replay`. ✔
- §5.6 concorrenza ottimistica (`expectedVersion`) → Task 4 (`append`/`ConcurrencyError`). ✔
- Persistenza SQLite, upcasting, meta/clock, wrapper ES del movimento → **fuori ambito** (dichiarato). Nessun requisito *di questo piano* scoperto.

**2. Scan placeholder:** nessun TBD/TODO; ogni step ha codice/comando concreto. Le descrizioni dei test sono prive di apostrofi dentro stringhe in apici singoli.

**3. Coerenza dei tipi e separazione decide/apply:**
- `DomainEvent`/`GameState`/`initialState`/`applyEvent`/`replay` (events.ts) usati in commands.ts ed event-store.ts. `Command`/`decide` (commands.ts). `EventStore`/`StoredEvent`/`ConcurrencyError`/`createInMemoryEventStore`/`Snapshot`/`takeSnapshot`/`rebuild` (event-store.ts). Nessuna collisione con gli export esistenti.
- **Determinismo del replay:** `decide(Attack)` consuma l'RNG e registra `result.damage`/`result.downed` negli eventi; `applyEvent` riapplica `DamageApplied`/`ActorDowned` senza RNG. `decide` scarta il `target` mutato da `performAttack` (usa solo i *fatti*): la mutazione di stato avviene solo via `applyEvent`. Coerente. ✔
- `version` incrementato a ogni evento applicato → è la versione per `expectedVersion`. ✔
- Strict: `state.actors[id]` (Record) gestito con `requireActor`/controlli `!== undefined`; spread condizionali per i campi opzionali del comando `Attack` (no `undefined` esplicito); switch esaustivi con guardia `never`. Conteggi test attesi: Task 1 → 79, Task 2 → 86, Task 3 → 90, Task 4 → 94. ✔

---

## Roadmap aggiornata dei piani successivi (Fase 1)

- **Piano 6 — Persistenza:** SQLite + Drizzle (pacchetto `memory`) che implementa la porta `EventStore` di questo piano; persistenza di snapshot; contract test condivisi (la stessa suite verde su in-memory e SQLite).
- **Piano 7 — Provider AI + AI Master + StructuredOutputPort + TracingPort.**
- **Piano 8 — Memoria L1.5 (canon ledger) + L2 (riassunti) + Context Assembler.**
- **Piano 9 — Shell Electron (main/preload/renderer, sicurezza, IPC, Clock per i meta degli eventi).**
- **Piano 10 — UI Vue (chat, scheda PG, pannello dadi 3D, journal, provider).**
- **Piano 11 — Moduli a tema: formato dati Zod + import/export + 1 modulo curato.**

(Estensioni post-Fase 1: wrapper ES del movimento e di altre azioni di combattimento; upcasting versionato degli eventi; undo/redo basato sullo stream.)

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-15-loomn-fase1-piano5-event-sourcing.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch di un subagent fresco per task, review (spec + qualità) tra un task e l'altro.

**2. Inline Execution** — esecuzione dei task in questa sessione con checkpoint.

**Quale approccio preferisci?**
