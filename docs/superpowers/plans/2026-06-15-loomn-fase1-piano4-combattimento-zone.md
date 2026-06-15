# Loomn — Fase 1 / Piano 4: Combattimento a zone

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere all'engine il combattimento a zone astratte: posizionamento per zone con gittata, aggregato `Encounter` con iniziativa e turni/round, e l'azione di attacco che integra prova-colpo, danno da arma e applicazione alle risorse.

**Architecture:** Estensione di `@loomn/engine` (TS puro) sopra i Piani 1-3. Posizionamento modellato a **zone** (grafo di adiacenze) come prima implementazione del concetto di `PositionModel` (una griglia tattica potrà innestarsi dopo). `Encounter` è l'aggregato che possiede i partecipanti, l'ordine di iniziativa e lo stato di turno/round, garante delle invarianti (ognuno agisce una volta per round; movimento solo verso zone adiacenti). L'attacco riusa le funzioni pure dei Piani 2-3 (`actorCheck`, `defenseValue`, `collectItemDice('effect')`, `adjustResource`, `addCondition`). Operazioni pure `(stato, …) → nuovo stato`; RNG iniettato. TDD rigoroso. Niente eventi ancora (Event Sourcing = Piano 5).

**Tech Stack:** TypeScript (strict: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Vitest. Nessuna nuova dipendenza.

---

## Riferimenti allo spec

Implementa, dello spec [2026-06-15-simulatore-campagne-ai-design.md](../specs/2026-06-15-simulatore-campagne-ai-design.md):
- §11.5 combattimento & posizionamento a zone astratte (`PositionModel`), iniziativa, azioni per turno, aggregato `Encounter` con invarianti.

**Fuori ambito (piani successivi):** Event Sourcing (§5.1, Piano 5), persistenza, AI, UI. Niente griglia tattica (innesto futuro). L'azione di attacco di questo piano NON applica vincoli di gittata (es. "il corpo a corpo richiede ingaggio"): la gittata è calcolabile (`rangeBetween`) ma il suo uso come prerequisito di un'azione è lasciato a un layer successivo (azioni di combattimento / AI).

**Prerequisito:** Piani 1-3 mergiati in `main` (`@loomn/engine`; `pnpm test` → 50 verdi). Lavorare su un branch dedicato, non su `main`.

---

## Struttura dei file (questo piano)

```
packages/engine/src/
├─ zone.ts           ← NUOVO: mappa zone (adiacenze), areAdjacent, zoneDistance (BFS), rangeBand
├─ encounter.ts      ← NUOVO: aggregato Encounter, iniziativa, rangeBetween, turni/round, movimento
├─ combat.ts         ← NUOVO: performAttack (prova-colpo → danno → applicazione → morente)
├─ index.ts          ← MODIFICA: aggiunge ./zone, ./encounter, ./combat
└─ *.test.ts         ← un file di test per ciascun modulo
```

**Disciplina di scope (obbligatoria):** modificare SOLO i file elencati in ciascun task. NON toccare `package.json`, `tsconfig.json` (root o package), `vitest.config.ts`, né creare un `tsconfig.json` di root o aggiungere `composite`/project references. Se sembra servire un cambio di build-config, FERMARSI e segnalarlo come concern. `git status --short` deve mostrare solo i file previsti prima di ogni commit.

**Grafo delle dipendenze (aciclico):** `zone` (nessuna dipendenza interna) ← `encounter`. `combat` → `random, dice, actor, check, actor-check, resource, condition, item`. Nessun modulo importa `encounter`/`combat`.

---

## Task 1: Modello a zone (`zone.ts`)

Posizionamento astratto: una mappa di adiacenze tra zone. Distanza minima via BFS; classificazione in bande di gittata (ingaggio / vicino / lontano).

**Files:**
- Create: `packages/engine/src/zone.ts`
- Test: `packages/engine/src/zone.test.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Scrivi il test che fallisce `packages/engine/src/zone.test.ts`:**
```ts
import { describe, it, expect } from 'vitest';
import { areAdjacent, zoneDistance, rangeBand, type ZoneMap } from './zone';

// a — b — c   (catena lineare; d isolata)
const map: ZoneMap = {
  a: ['b'],
  b: ['a', 'c'],
  c: ['b'],
  d: [],
};

describe('areAdjacent', () => {
  it('riconosce le zone adiacenti dalla mappa', () => {
    expect(areAdjacent(map, 'a', 'b')).toBe(true);
    expect(areAdjacent(map, 'a', 'c')).toBe(false);
    expect(areAdjacent(map, 'a', 'a')).toBe(false);
  });
});

describe('zoneDistance', () => {
  it('calcola la distanza minima via BFS', () => {
    expect(zoneDistance(map, 'a', 'a')).toBe(0);
    expect(zoneDistance(map, 'a', 'b')).toBe(1);
    expect(zoneDistance(map, 'a', 'c')).toBe(2);
    expect(zoneDistance(map, 'a', 'd')).toBe(Infinity);
    expect(zoneDistance(map, 'a', 'z')).toBe(Infinity);
  });
});

describe('rangeBand', () => {
  it('classifica la distanza in banda di gittata', () => {
    expect(rangeBand(0)).toBe('engaged');
    expect(rangeBand(1)).toBe('near');
    expect(rangeBand(2)).toBe('far');
    expect(rangeBand(5)).toBe('far');
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import './zone'`.

- [ ] **Step 3: Scrivi `packages/engine/src/zone.ts`:**
```ts
/** Mappa delle zone: per ogni zona, l'elenco delle zone adiacenti.
 *  Per un grafo non orientato, elencare l'adiacenza in entrambe le direzioni. */
export type ZoneMap = Record<string, string[]>;

export type RangeBand = 'engaged' | 'near' | 'far';

/** True se `b` è una zona adiacente ad `a` secondo la mappa (la stessa zona non è "adiacente"). */
export function areAdjacent(map: ZoneMap, a: string, b: string): boolean {
  return (map[a] ?? []).includes(b);
}

/** Distanza minima (numero di passi) tra due zone via BFS. Stessa zona = 0.
 *  Ritorna Infinity se non raggiungibile o se una delle due zone non è nella mappa. */
export function zoneDistance(map: ZoneMap, from: string, to: string): number {
  if (from === to) {
    return from in map ? 0 : Infinity;
  }
  if (!(from in map) || !(to in map)) {
    return Infinity;
  }
  const visited = new Set<string>([from]);
  let frontier: string[] = [from];
  let dist = 0;
  while (frontier.length > 0) {
    dist += 1;
    const next: string[] = [];
    for (const zone of frontier) {
      for (const adj of map[zone] ?? []) {
        if (adj === to) {
          return dist;
        }
        if (!visited.has(adj)) {
          visited.add(adj);
          next.push(adj);
        }
      }
    }
    frontier = next;
  }
  return Infinity;
}

/** Classifica una distanza in banda di gittata: 0 = ingaggio, 1 = vicino, >=2 = lontano. */
export function rangeBand(distance: number): RangeBand {
  if (distance <= 0) {
    return 'engaged';
  }
  if (distance === 1) {
    return 'near';
  }
  return 'far';
}
```

- [ ] **Step 4: Esegui il test per verificare che passi**

Run: `pnpm test`
Expected: PASS — **53 test** (50 + 3 nuovi).

- [ ] **Step 5: Aggiungi al barrel** — in fondo a `packages/engine/src/index.ts`:
```ts
export * from './zone';
```

- [ ] **Step 6: Verifica typecheck + test**

Run: `pnpm -C packages/engine typecheck && pnpm test`
Expected: nessun errore di tipo; tutti i test PASS.

- [ ] **Step 7: Verifica scope e commit**

Run: `git status --short` (solo i 3 file previsti).
```bash
git add packages/engine/src/zone.ts packages/engine/src/zone.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): modello a zone (adiacenze, distanza BFS, bande di gittata)"
```

---

## Task 2: Aggregato `Encounter` + iniziativa + gittata

L'aggregato dello scontro: partecipanti (con zona e iniziativa), ordinati per iniziativa decrescente; round 1, turno al primo. Query di gittata tra due partecipanti.

**Files:**
- Create: `packages/engine/src/encounter.ts`
- Test: `packages/engine/src/encounter.test.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Scrivi il test che fallisce `packages/engine/src/encounter.test.ts`:**
```ts
import { describe, it, expect } from 'vitest';
import { createEncounter, rangeBetween, type ParticipantInput } from './encounter';
import type { ZoneMap } from './zone';

const map: ZoneMap = { a: ['b'], b: ['a', 'c'], c: ['b'] };

const inputs: ParticipantInput[] = [
  { actorId: 'goblin', zone: 'c', initiative: 8 },
  { actorId: 'eroe', zone: 'a', initiative: 15 },
  { actorId: 'alleato', zone: 'a', initiative: 12 },
];

describe('createEncounter', () => {
  it('ordina i partecipanti per iniziativa e inizializza round e turno', () => {
    const enc = createEncounter('enc-1', inputs);
    expect(enc.participants.map((p) => p.actorId)).toEqual(['eroe', 'alleato', 'goblin']);
    expect(enc.round).toBe(1);
    expect(enc.turnIndex).toBe(0);
    expect(enc.participants.every((p) => p.actedThisRound === false)).toBe(true);
  });
});

describe('rangeBetween', () => {
  it('ritorna la banda di gittata tra due partecipanti', () => {
    const enc = createEncounter('enc-1', inputs);
    expect(rangeBetween(enc, map, 'eroe', 'alleato')).toBe('engaged'); // stessa zona 'a'
    expect(rangeBetween(enc, map, 'eroe', 'goblin')).toBe('far'); // a -> c = 2
  });
  it('lancia per un partecipante sconosciuto', () => {
    const enc = createEncounter('enc-1', inputs);
    expect(() => rangeBetween(enc, map, 'eroe', 'ignoto')).toThrow(
      'Partecipante sconosciuto nello scontro',
    );
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import './encounter'`.

- [ ] **Step 3: Scrivi `packages/engine/src/encounter.ts`:**
```ts
import { zoneDistance, rangeBand, type ZoneMap, type RangeBand } from './zone';

export interface Participant {
  actorId: string;
  zone: string;
  initiative: number;
  actedThisRound: boolean;
}

export interface Encounter {
  id: string;
  participants: Participant[]; // ordinati per iniziativa decrescente (ordine di turno)
  round: number;
  turnIndex: number;
}

export interface ParticipantInput {
  actorId: string;
  zone: string;
  initiative: number;
}

/** Crea uno scontro: ordina i partecipanti per iniziativa decrescente (a parità,
 *  ordine d'ingresso, perché Array.sort è stabile), round 1, turno al primo. Funzione pura. */
export function createEncounter(id: string, participants: ParticipantInput[]): Encounter {
  const ordered: Participant[] = [...participants]
    .sort((a, b) => b.initiative - a.initiative)
    .map((p) => ({
      actorId: p.actorId,
      zone: p.zone,
      initiative: p.initiative,
      actedThisRound: false,
    }));
  return { id, participants: ordered, round: 1, turnIndex: 0 };
}

/** Banda di gittata tra due partecipanti secondo la mappa delle zone.
 *  Lancia se uno dei due non è nello scontro. */
export function rangeBetween(
  enc: Encounter,
  map: ZoneMap,
  actorIdA: string,
  actorIdB: string,
): RangeBand {
  const a = enc.participants.find((p) => p.actorId === actorIdA);
  const b = enc.participants.find((p) => p.actorId === actorIdB);
  if (a === undefined || b === undefined) {
    throw new Error('Partecipante sconosciuto nello scontro');
  }
  return rangeBand(zoneDistance(map, a.zone, b.zone));
}
```

- [ ] **Step 4: Esegui il test per verificare che passi**

Run: `pnpm test`
Expected: PASS — **56 test** (53 + 3 nuovi).

- [ ] **Step 5: Aggiungi al barrel** — in fondo a `packages/engine/src/index.ts`:
```ts
export * from './encounter';
```

- [ ] **Step 6: Verifica typecheck + test**

Run: `pnpm -C packages/engine typecheck && pnpm test`
Expected: nessun errore di tipo; tutti i test PASS.

- [ ] **Step 7: Verifica scope e commit**

Run: `git status --short` (solo i 3 file previsti).
```bash
git add packages/engine/src/encounter.ts packages/engine/src/encounter.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): aggregato Encounter con iniziativa e gittata"
```

---

## Task 3: Turni, round e movimento

Gestione del flusso di combattimento: partecipante di turno, fine turno (invariante: ognuno agisce una volta per round), round completo, round successivo, e movimento verso una zona adiacente.

**Files:**
- Modify: `packages/engine/src/encounter.ts`
- Modify: `packages/engine/src/encounter.test.ts`

- [ ] **Step 1: Scrivi i test che falliscono.** In `packages/engine/src/encounter.test.ts`, aggiorna l'import in cima da:
```ts
import { createEncounter, rangeBetween, type ParticipantInput } from './encounter';
```
a:
```ts
import {
  createEncounter,
  rangeBetween,
  currentParticipant,
  endTurn,
  roundComplete,
  nextRound,
  moveParticipant,
  type ParticipantInput,
} from './encounter';
```
e aggiungi in fondo al file:
```ts
describe('currentParticipant', () => {
  it('ritorna il partecipante del turno corrente', () => {
    const enc = createEncounter('e', inputs);
    expect(currentParticipant(enc).actorId).toBe('eroe');
  });
});

describe('endTurn', () => {
  it('marca chi ha agito e avanza il turno', () => {
    const enc = endTurn(createEncounter('e', inputs));
    expect(enc.turnIndex).toBe(1);
    expect(enc.participants[0]!.actedThisRound).toBe(true);
    expect(enc.participants[1]!.actedThisRound).toBe(false);
  });
});

describe('roundComplete', () => {
  it('è vero quando tutti hanno agito', () => {
    let enc = createEncounter('e', inputs);
    expect(roundComplete(enc)).toBe(false);
    enc = endTurn(endTurn(endTurn(enc)));
    expect(roundComplete(enc)).toBe(true);
  });
});

describe('nextRound', () => {
  it('azzera gli stati, incrementa il round e riparte dal primo', () => {
    let enc = endTurn(endTurn(endTurn(createEncounter('e', inputs))));
    enc = nextRound(enc);
    expect(enc.round).toBe(2);
    expect(enc.turnIndex).toBe(0);
    expect(enc.participants.every((p) => p.actedThisRound === false)).toBe(true);
  });
});

describe('moveParticipant', () => {
  it('muove in una zona adiacente', () => {
    const enc = moveParticipant(createEncounter('e', inputs), map, 'eroe', 'b');
    expect(enc.participants.find((p) => p.actorId === 'eroe')?.zone).toBe('b');
  });
  it('lancia se la zona non è adiacente', () => {
    expect(() => moveParticipant(createEncounter('e', inputs), map, 'eroe', 'c')).toThrow(
      'Mossa non valida',
    );
  });
});
```

- [ ] **Step 2: Esegui i test per verificare che falliscano**

Run: `pnpm test`
Expected: FAIL — `currentParticipant`/`endTurn`/`roundComplete`/`nextRound`/`moveParticipant` non esportati.

- [ ] **Step 3: Estendi `packages/engine/src/encounter.ts`.** Aggiungi `areAdjacent` all'import esistente da './zone' (la prima riga diventa):
```ts
import { zoneDistance, rangeBand, areAdjacent, type ZoneMap, type RangeBand } from './zone';
```
e aggiungi in fondo al file:
```ts
/** Il partecipante di turno corrente. Lancia se il turno è oltre la fine del round. */
export function currentParticipant(enc: Encounter): Participant {
  const p = enc.participants[enc.turnIndex];
  if (p === undefined) {
    throw new Error('Nessun partecipante per il turno corrente (round completo)');
  }
  return p;
}

/** Termina il turno corrente: marca il partecipante come "ha agito" e avanza l'indice.
 *  Funzione pura. */
export function endTurn(enc: Encounter): Encounter {
  const participants = enc.participants.map((p, i) =>
    i === enc.turnIndex ? { ...p, actedThisRound: true } : p,
  );
  return { ...enc, participants, turnIndex: enc.turnIndex + 1 };
}

/** True se tutti i partecipanti hanno avuto il loro turno in questo round. */
export function roundComplete(enc: Encounter): boolean {
  return enc.turnIndex >= enc.participants.length;
}

/** Avvia il round successivo: azzera "ha agito", incrementa il round, riparte dal primo.
 *  Funzione pura. */
export function nextRound(enc: Encounter): Encounter {
  const participants = enc.participants.map((p) => ({ ...p, actedThisRound: false }));
  return { ...enc, participants, round: enc.round + 1, turnIndex: 0 };
}

/** Muove un partecipante in una zona adiacente. Lancia se il partecipante non esiste
 *  o se la zona di destinazione non è adiacente a quella attuale. Funzione pura. */
export function moveParticipant(
  enc: Encounter,
  map: ZoneMap,
  actorId: string,
  toZone: string,
): Encounter {
  const p = enc.participants.find((x) => x.actorId === actorId);
  if (p === undefined) {
    throw new Error('Partecipante sconosciuto nello scontro');
  }
  if (!areAdjacent(map, p.zone, toZone)) {
    throw new Error(`Mossa non valida: ${p.zone} -> ${toZone} non sono adiacenti`);
  }
  const participants = enc.participants.map((x) =>
    x.actorId === actorId ? { ...x, zone: toZone } : x,
  );
  return { ...enc, participants };
}
```

- [ ] **Step 4: Esegui il test per verificare che passi**

Run: `pnpm test`
Expected: PASS — **62 test** (56 + 6 nuovi).

- [ ] **Step 5: Verifica typecheck + test**

Run: `pnpm -C packages/engine typecheck && pnpm test`
Expected: nessun errore di tipo; tutti i test PASS.

- [ ] **Step 6: Verifica scope e commit**

Run: `git status --short` (solo i 2 file previsti).
```bash
git add packages/engine/src/encounter.ts packages/engine/src/encounter.test.ts
git commit -m "feat(engine): turni, round e movimento nello scontro"
```

---

## Task 4: Azione di attacco (`combat.ts`)

L'integrazione che lega tutto: prova-colpo dell'attaccante contro la CD = difesa del bersaglio (`defenseValue`), e in caso di successo tira i dadi-effetto dell'arma equipaggiata (`collectItemDice('effect')`), applica il danno alla risorsa indicata (`adjustResource`) e segna la condizione `morente` se la risorsa arriva a 0 (invariante: niente HP sotto 0 senza marcare il morente).

**Files:**
- Create: `packages/engine/src/combat.ts`
- Test: `packages/engine/src/combat.test.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Scrivi il test che fallisce `packages/engine/src/combat.test.ts`:**
```ts
import { describe, it, expect } from 'vitest';
import type { RandomSource } from './random';
import type { Actor, Item } from './actor';
import { performAttack, type AttackInput } from './combat';

function stubRandom(values: number[]): RandomSource {
  let i = 0;
  return { next: () => values[i++ % values.length]! };
}

const weapon: Item = {
  id: 'sword',
  name: 'Spadone',
  equipped: true,
  effects: [{ kind: 'contributeDice', dice: [{ count: 2, sides: 6 }], mode: 'effect' }],
};

const armor: Item = {
  id: 'plate',
  name: 'Armatura',
  equipped: true,
  effects: [{ kind: 'defenseModifier', defense: 'difesa', value: 5 }],
};

function attacker(): Actor {
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

function target(extraItems: Item[] = []): Actor {
  return {
    id: 'goblin',
    name: 'Goblin',
    kind: 'npc',
    attributes: {},
    skills: {},
    resources: { hp: { current: 10, max: 10 } },
    conditions: [],
    items: extraItems,
    progression: { xp: 0, level: 1 },
  };
}

describe('performAttack', () => {
  it('colpo riuscito: applica il danno e segna morente a 0 HP', () => {
    // rng: d20=0.95 -> faccia 20 ; danno 2d6 con 0.5,0.5 -> 4+4=8 ; +2 (forza) = 10
    const rng = stubRandom([0.95, 0.5, 0.5]);
    const res = performAttack(
      {
        attacker: attacker(),
        target: target(),
        attribute: 'forza',
        defense: 'difesa',
        defenseBase: 10,
        damageResource: 'hp',
        damageModifiers: [{ value: 2, source: 'forza' }],
      },
      rng,
    );
    expect(res.hit).toBe(true);
    expect(res.check.outcome).toBe('critical'); // 20 + 3 = 23 vs CD 10 -> margine 13
    expect(res.damage).toBe(10);
    expect(res.target.resources['hp']!.current).toBe(0);
    expect(res.downed).toBe(true);
    expect(res.target.conditions.some((c) => c.key === 'morente')).toBe(true);
  });

  it('colpo mancato: nessun danno e bersaglio invariato', () => {
    const rng = stubRandom([0]); // d20 -> faccia 1 ; 1 + 3 = 4 vs CD 10 -> fallimento
    const t = target();
    const res = performAttack(
      {
        attacker: attacker(),
        target: t,
        attribute: 'forza',
        defense: 'difesa',
        defenseBase: 10,
        damageResource: 'hp',
      },
      rng,
    );
    expect(res.hit).toBe(false);
    expect(res.damage).toBe(0);
    expect(res.target.resources['hp']!.current).toBe(10);
    expect(res.downed).toBe(false);
  });

  it('la difesa del bersaglio alza la CD e fa mancare il colpo', () => {
    // d20=0.3 -> faccia 7 ; 7 + 3 = 10. Senza armatura CD 10 (colpo). Con armatura CD 15 -> manca.
    const rng = stubRandom([0.3]);
    const res = performAttack(
      {
        attacker: attacker(),
        target: target([armor]),
        attribute: 'forza',
        defense: 'difesa',
        defenseBase: 10,
        damageResource: 'hp',
      },
      rng,
    );
    expect(res.hit).toBe(false);
    expect(res.target.resources['hp']!.current).toBe(10);
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import './combat'`.

- [ ] **Step 3: Scrivi `packages/engine/src/combat.ts`:**
```ts
import type { RandomSource } from './random';
import type { Modifier } from './dice';
import { rollExpression } from './dice';
import type { Actor } from './actor';
import type { CheckResult } from './check';
import { actorCheck, type CheckRequest } from './actor-check';
import { adjustResource, isDepleted } from './resource';
import { addCondition } from './condition';
import { equippedItems, collectItemDice, defenseValue } from './item';

export interface AttackInput {
  attacker: Actor;
  target: Actor;
  attribute?: string;
  skill?: string;
  defense: string; // chiave della difesa del bersaglio (per la CD)
  defenseBase: number; // valore base della difesa
  damageResource: string; // risorsa danneggiata (es. 'hp')
  damageModifiers?: Modifier[];
}

export interface AttackResult {
  check: CheckResult;
  hit: boolean;
  damage: number;
  target: Actor; // bersaglio aggiornato
  downed: boolean;
}

/** Esegue un attacco. Prova-colpo dell'attaccante (con oggetti equipaggiati) contro la
 *  CD = difesa del bersaglio; in caso di colpo, tira i dadi-effetto dell'arma equipaggiata,
 *  applica il danno alla risorsa indicata e segna 'morente' se la risorsa arriva a 0.
 *  Funzione pura; ogni casualità passa per `rng`. */
export function performAttack(input: AttackInput, rng: RandomSource): AttackResult {
  const dc = defenseValue(input.target, input.defense, input.defenseBase);

  const req: CheckRequest = {
    actor: input.attacker,
    includeEquipped: true,
    dc,
    ...(input.attribute !== undefined ? { attribute: input.attribute } : {}),
    ...(input.skill !== undefined ? { skill: input.skill } : {}),
  };
  const check = actorCheck(req, rng);
  const hit =
    check.outcome === 'critical' ||
    check.outcome === 'success' ||
    check.outcome === 'success_at_cost';

  if (!hit) {
    return { check, hit: false, damage: 0, target: input.target, downed: false };
  }

  const damageDice = collectItemDice(equippedItems(input.attacker), 'effect');
  const damageRoll = rollExpression(
    { dice: damageDice, modifiers: input.damageModifiers ?? [], mode: 'effect' },
    rng,
  );
  const damage = damageRoll.total;

  let target = adjustResource(input.target, input.damageResource, -damage);
  const downed = isDepleted(target, input.damageResource);
  if (downed && !target.conditions.some((c) => c.key === 'morente')) {
    target = addCondition(target, {
      key: 'morente',
      source: 'combat',
      effects: [],
      duration: { kind: 'permanent' },
    });
  }

  return { check, hit: true, damage, target, downed };
}
```

- [ ] **Step 4: Esegui il test per verificare che passi**

Run: `pnpm test`
Expected: PASS — **65 test** (62 + 3 nuovi).

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
```

- [ ] **Step 6: Verifica finale typecheck + test**

Run: `pnpm -C packages/engine typecheck && pnpm test`
Expected: nessun errore di tipo; tutti i test PASS (65).

- [ ] **Step 7: Verifica scope e commit**

Run: `git status --short` (solo i 3 file previsti).
```bash
git add packages/engine/src/combat.ts packages/engine/src/combat.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): azione di attacco (prova-colpo, danno, morente)"
```

---

## Self-Review (eseguita)

**1. Copertura spec (per i confini di questo piano):**
- §11.5 posizionamento a zone (`PositionModel` come zone) → Task 1 (`zone.ts`). ✔
- §11.5 aggregato `Encounter` + iniziativa → Task 2. ✔
- §11.5 azioni per turno + invariante "una azione per round" + movimento → Task 3. ✔
- §11.5 invariante "HP non sotto 0 senza morente" + azione d'attacco che integra il combattimento → Task 4. ✔
- Vincoli di gittata come prerequisito di azione, griglia tattica, ES → **fuori ambito** (dichiarato sopra). Nessun requisito *di questo piano* scoperto.

**2. Scan placeholder:** nessun TBD/TODO; ogni step ha codice/comando concreto. Le descrizioni dei test sono prive di apostrofi dentro stringhe in apici singoli (è/é sono lettere, non apici).

**3. Coerenza dei tipi:** `ZoneMap`/`RangeBand` (zone.ts) usati in encounter.ts. `Participant`/`Encounter`/`ParticipantInput` (Task 2) usati in Task 3. `areAdjacent` aggiunto all'import in Task 3. `combat.ts` riusa `Actor`/`Item` (actor.ts), `Modifier`/`rollExpression` (dice.ts), `CheckResult` (check.ts), `actorCheck`/`CheckRequest` (actor-check.ts), `adjustResource`/`isDepleted` (resource.ts), `addCondition` (condition.ts), `equippedItems`/`collectItemDice`/`defenseValue` (item.ts) — tutte firme esistenti dei Piani 1-3. Conteggi test attesi: Task 1 → 53, Task 2 → 56, Task 3 → 62, Task 4 → 65. ✔
- Strict: il `CheckRequest` in `performAttack` usa spread condizionali per `attribute`/`skill` (evita `attribute: undefined` vietato da `exactOptionalPropertyTypes`); accessi `Record`/array gestiti con `?? []`, `in`, e `!` solo nei test dove l'esistenza è garantita. ✔

---

## Roadmap aggiornata dei piani successivi (Fase 1)

- **Piano 5 — Event Sourcing (Campaign/World):** Command/Event, proiezioni (L1), snapshot, replay; avvolge le funzioni pure dei Piani 2-4 §5.1.
- **Piano 6 — Persistenza:** SQLite + Drizzle dietro `Repository`, contract test.
- **Piano 7 — Provider AI + AI Master + StructuredOutputPort + TracingPort.**
- **Piano 8 — Memoria L1.5 + L2 + Context Assembler.**
- **Piano 9 — Shell Electron (main/preload/renderer, sicurezza, IPC).**
- **Piano 10 — UI Vue (chat, scheda PG, pannello dadi 3D, journal, provider).**
- **Piano 11 — Moduli a tema: formato dati Zod + import/export + 1 modulo curato.**

(Le azioni di combattimento di alto livello — gittata come prerequisito, azioni multiple per turno, reazioni — e la griglia tattica restano possibili estensioni post-Fase 1.)

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-15-loomn-fase1-piano4-combattimento-zone.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch di un subagent fresco per task, review (spec + qualità) tra un task e l'altro.

**2. Inline Execution** — esecuzione dei task in questa sessione con checkpoint.

**Quale approccio preferisci?**
