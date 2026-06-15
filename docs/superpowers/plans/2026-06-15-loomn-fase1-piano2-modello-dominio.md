# Loomn — Fase 1 / Piano 2: Modello di dominio dell'engine (scheda attore, risorse, condizioni, prove)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modellare l'attore di gioco (PG/PNG) con risorse e condizioni generiche definite dai dati, e collegarlo al motore di dadi del Piano 1 per eseguire prove deterministiche di un personaggio.

**Architecture:** Tutto in `@loomn/engine` come TS puro: entità e value object immutabili, operazioni come funzioni pure `(stato, …) → nuovo stato`. Nessun IO, nessun evento ancora (l'Event Sourcing arriverà in un piano successivo e chiamerà queste funzioni pure). Si costruisce sopra `dice.ts`/`check.ts` del Piano 1. TDD rigoroso, RNG iniettato.

**Tech Stack:** TypeScript (strict, già con `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`), Vitest. Nessuna nuova dipendenza.

---

## Riferimenti allo spec

Implementa, dello spec [2026-06-15-simulatore-campagne-ai-design.md](../specs/2026-06-15-simulatore-campagne-ai-design.md):
- §5.3 modello di dominio (Entity/Value Object) e regole come funzioni pure;
- §11.4 attributi & abilità definiti dai dati (l'engine sa solo *come* alimentano i tiri);
- §11.6 risorse generiche (current/max, soglie, esaurimento);
- §11.7 condizioni/stati con effetti dichiarativi e durata.

**Fuori ambito (piani successivi):** inventario & oggetti (§11.9), progressione (§11.8), combattimento a zone / `PositionModel` (§11.5), Event Sourcing (§5.1). La numerazione della roadmap del Piano 1 scala di +1 da qui in poi.

**Prerequisito:** il Piano 1 è mergiato in `main` (`@loomn/engine` con `random.ts`, `dice.ts`, `check.ts`; `pnpm test` → 11 verdi). Lavorare su un branch dedicato, non su `main`.

---

## Struttura dei file (questo piano)

```
packages/engine/src/
├─ actor.ts          ← Attore (PG/PNG), tipi Condition/ResourcePool/Duration + getter attributi/abilità
├─ resource.ts       ← adjustResource (clamp), isDepleted
├─ condition.ts      ← addCondition, checkModifierFrom, tickConditions
├─ actor-check.ts    ← buildCheckExpr + actorCheck (attore → RollExpr → CheckResult)
├─ index.ts          ← barrel: aggiunge i 4 nuovi moduli
└─ *.test.ts         ← un file di test per ciascun modulo sopra
```

Responsabilità: `actor.ts` = forma dei dati dell'attore + accesso sicuro. `resource.ts` = mutazioni di risorse con clamp. `condition.ts` = ciclo di vita ed effetti delle condizioni. `actor-check.ts` = ponte tra attore e motore di tiro. File piccoli, una responsabilità ciascuno.

**Principio dati-driven:** l'engine non hardcoda *quali* attributi/risorse/condizioni esistono. Opera in modo generico su qualunque chiave l'attore contenga (le definirà il modulo a tema).

---

## Task 1: Tipi dell'attore e accesso sicuro

**Files:**
- Create: `packages/engine/src/actor.ts`
- Test: `packages/engine/src/actor.test.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

`packages/engine/src/actor.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { getAttribute, getSkill, type Actor } from './actor';

function sampleActor(): Actor {
  return {
    id: 'pg-1',
    name: 'Kael',
    kind: 'pc',
    attributes: { forza: 3, mente: 1 },
    skills: { atletica: 2 },
    resources: { hp: { current: 10, max: 10 } },
    conditions: [],
  };
}

describe('getAttribute', () => {
  it('ritorna il valore di un attributo presente', () => {
    expect(getAttribute(sampleActor(), 'forza')).toBe(3);
  });
  it('ritorna 0 per un attributo assente (default)', () => {
    expect(getAttribute(sampleActor(), 'destrezza')).toBe(0);
  });
});

describe('getSkill', () => {
  it('ritorna il valore di una abilità presente', () => {
    expect(getSkill(sampleActor(), 'atletica')).toBe(2);
  });
  it('ritorna 0 per una abilità assente (default)', () => {
    expect(getSkill(sampleActor(), 'furtività')).toBe(0);
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import './actor'`.

- [ ] **Step 3: Scrivi l'implementazione minima**

`packages/engine/src/actor.ts`:
```ts
export type ActorKind = 'pc' | 'npc';

export interface ResourcePool {
  current: number;
  max: number;
}

export type ConditionEffect =
  | { kind: 'checkModifier'; value: number; appliesTo?: string }
  | { kind: 'resourcePerTurn'; resource: string; delta: number };

export type Duration =
  | { kind: 'turns'; remaining: number }
  | { kind: 'scenes'; remaining: number }
  | { kind: 'permanent' };

export interface Condition {
  key: string;
  source: string;
  effects: ConditionEffect[];
  duration: Duration;
}

export interface Actor {
  id: string;
  name: string;
  kind: ActorKind;
  attributes: Record<string, number>;
  skills: Record<string, number>;
  resources: Record<string, ResourcePool>;
  conditions: Condition[];
}

/** Valore di un attributo, 0 se assente (i dati definiscono quali esistono). */
export function getAttribute(actor: Actor, key: string): number {
  return actor.attributes[key] ?? 0;
}

/** Valore di un'abilità, 0 se assente. */
export function getSkill(actor: Actor, key: string): number {
  return actor.skills[key] ?? 0;
}
```

- [ ] **Step 4: Esegui il test per verificare che passi**

Run: `pnpm test`
Expected: PASS (4 nuovi test verdi + gli 11 del Piano 1).

- [ ] **Step 5: Aggiungi al barrel**

Modifica `packages/engine/src/index.ts` aggiungendo in fondo la riga:
```ts
export * from './actor';
```
Il file deve diventare:
```ts
export * from './random';
export * from './dice';
export * from './check';
export * from './actor';
```

- [ ] **Step 6: Verifica typecheck + test**

Run: `pnpm -C packages/engine typecheck && pnpm test`
Expected: nessun errore di tipo; tutti i test PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/actor.ts packages/engine/src/actor.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): modello Attore (PG/PNG) con accesso sicuro ad attributi/abilità"
```

---

## Task 2: Risorse — `adjustResource` e `isDepleted`

Mutazioni pure di una risorsa con clamp in `[0, max]`. La risorsa deve esistere (precondizione): chiave sconosciuta → errore esplicito.

**Files:**
- Create: `packages/engine/src/resource.ts`
- Test: `packages/engine/src/resource.test.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

`packages/engine/src/resource.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { Actor } from './actor';
import { adjustResource, isDepleted } from './resource';

function actorWith(current: number, max: number): Actor {
  return {
    id: 'a',
    name: 'A',
    kind: 'npc',
    attributes: {},
    skills: {},
    resources: { hp: { current, max } },
    conditions: [],
  };
}

describe('adjustResource', () => {
  it('applica un delta negativo (danno)', () => {
    const out = adjustResource(actorWith(10, 10), 'hp', -3);
    expect(out.resources['hp']).toEqual({ current: 7, max: 10 });
  });

  it('clampa a 0 (non scende sotto)', () => {
    const out = adjustResource(actorWith(2, 10), 'hp', -5);
    expect(out.resources['hp']!.current).toBe(0);
  });

  it('clampa a max (la cura non supera il massimo)', () => {
    const out = adjustResource(actorWith(8, 10), 'hp', +5);
    expect(out.resources['hp']!.current).toBe(10);
  });

  it('non muta lo stato originale (purezza)', () => {
    const original = actorWith(10, 10);
    adjustResource(original, 'hp', -3);
    expect(original.resources['hp']!.current).toBe(10);
  });

  it('lancia un errore per una risorsa sconosciuta', () => {
    expect(() => adjustResource(actorWith(10, 10), 'mana', -1)).toThrow(
      'Risorsa sconosciuta: mana',
    );
  });
});

describe('isDepleted', () => {
  it('è true quando current <= 0', () => {
    expect(isDepleted(actorWith(0, 10), 'hp')).toBe(true);
  });
  it('è false quando current > 0', () => {
    expect(isDepleted(actorWith(1, 10), 'hp')).toBe(false);
  });
  it('lancia per risorsa sconosciuta', () => {
    expect(() => isDepleted(actorWith(1, 10), 'mana')).toThrow(
      'Risorsa sconosciuta: mana',
    );
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import './resource'`.

- [ ] **Step 3: Scrivi l'implementazione minima**

`packages/engine/src/resource.ts`:
```ts
import type { Actor } from './actor';

/** Aggiusta una risorsa di `delta`, clampando `current` in [0, max].
 *  Lancia se la risorsa non esiste (precondizione violata). Funzione pura. */
export function adjustResource(actor: Actor, resource: string, delta: number): Actor {
  const pool = actor.resources[resource];
  if (pool === undefined) {
    throw new Error(`Risorsa sconosciuta: ${resource}`);
  }
  const next = Math.max(0, Math.min(pool.max, pool.current + delta));
  return {
    ...actor,
    resources: { ...actor.resources, [resource]: { current: next, max: pool.max } },
  };
}

/** True se la risorsa è esaurita (current <= 0). Lancia se la risorsa non esiste. */
export function isDepleted(actor: Actor, resource: string): boolean {
  const pool = actor.resources[resource];
  if (pool === undefined) {
    throw new Error(`Risorsa sconosciuta: ${resource}`);
  }
  return pool.current <= 0;
}
```

- [ ] **Step 4: Esegui il test per verificare che passi**

Run: `pnpm test`
Expected: PASS (i nuovi test di `resource` + tutti i precedenti).

- [ ] **Step 5: Aggiungi al barrel**

`packages/engine/src/index.ts` — aggiungi in fondo:
```ts
export * from './resource';
```

- [ ] **Step 6: Verifica typecheck + test**

Run: `pnpm -C packages/engine typecheck && pnpm test`
Expected: nessun errore di tipo; tutti i test PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/resource.ts packages/engine/src/resource.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): risorse con clamp (adjustResource, isDepleted)"
```

---

## Task 3: Condizioni — aggiunta, modificatori, avanzamento turno

Le condizioni hanno effetti dichiarativi e durata. `tickConditions` avanza di un turno: applica gli effetti `resourcePerTurn`, decrementa le durate `turns`, rimuove le scadute.

**Files:**
- Create: `packages/engine/src/condition.ts`
- Test: `packages/engine/src/condition.test.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

`packages/engine/src/condition.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { Actor, Condition } from './actor';
import { addCondition, checkModifierFrom, tickConditions } from './condition';

function baseActor(): Actor {
  return {
    id: 'a',
    name: 'A',
    kind: 'npc',
    attributes: {},
    skills: {},
    resources: { hp: { current: 10, max: 10 } },
    conditions: [],
  };
}

const inspired: Condition = {
  key: 'inspired',
  source: 'bardo',
  effects: [{ kind: 'checkModifier', value: 2 }],
  duration: { kind: 'scenes', remaining: 1 },
};

const focusedAtletica: Condition = {
  key: 'focused',
  source: 'self',
  effects: [{ kind: 'checkModifier', value: 1, appliesTo: 'atletica' }],
  duration: { kind: 'permanent' },
};

const poisoned: Condition = {
  key: 'poisoned',
  source: 'trappola',
  effects: [{ kind: 'resourcePerTurn', resource: 'hp', delta: -2 }],
  duration: { kind: 'turns', remaining: 2 },
};

describe('addCondition', () => {
  it('aggiunge la condizione restituendo un nuovo attore', () => {
    const original = baseActor();
    const out = addCondition(original, inspired);
    expect(out.conditions).toHaveLength(1);
    expect(original.conditions).toHaveLength(0);
  });
});

describe('checkModifierFrom', () => {
  it('somma i modificatori globali (appliesTo assente)', () => {
    expect(checkModifierFrom([inspired])).toBe(2);
  });
  it('include i modificatori specifici quando il target coincide', () => {
    expect(checkModifierFrom([inspired, focusedAtletica], 'atletica')).toBe(3);
  });
  it('esclude i modificatori specifici quando il target non coincide', () => {
    expect(checkModifierFrom([inspired, focusedAtletica], 'furtività')).toBe(2);
  });
  it('è 0 senza condizioni', () => {
    expect(checkModifierFrom([])).toBe(0);
  });
});

describe('tickConditions', () => {
  it('applica gli effetti per-turno e decrementa la durata', () => {
    const out = tickConditions(addCondition(baseActor(), poisoned));
    expect(out.resources['hp']!.current).toBe(8); // -2 da veleno
    const stillPoisoned = out.conditions.find((c) => c.key === 'poisoned');
    expect(stillPoisoned?.duration).toEqual({ kind: 'turns', remaining: 1 });
  });

  it('rimuove la condizione quando la durata a turni arriva a 0', () => {
    let actor = addCondition(baseActor(), {
      ...poisoned,
      duration: { kind: 'turns', remaining: 1 },
    });
    actor = tickConditions(actor);
    expect(actor.resources['hp']!.current).toBe(8); // effetto applicato in questo turno
    expect(actor.conditions.find((c) => c.key === 'poisoned')).toBeUndefined();
  });

  it('non decrementa le durate non-a-turni (scenes/permanent)', () => {
    const out = tickConditions(addCondition(baseActor(), inspired));
    expect(out.conditions[0]!.duration).toEqual({ kind: 'scenes', remaining: 1 });
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import './condition'`.

- [ ] **Step 3: Scrivi l'implementazione minima**

`packages/engine/src/condition.ts`:
```ts
import type { Actor, Condition } from './actor';
import { adjustResource } from './resource';

/** Aggiunge una condizione all'attore. Funzione pura. */
export function addCondition(actor: Actor, condition: Condition): Actor {
  return { ...actor, conditions: [...actor.conditions, condition] };
}

/** Somma i modificatori 'checkModifier' applicabili: globali (appliesTo assente)
 *  più quelli il cui `appliesTo` coincide con `target`. */
export function checkModifierFrom(conditions: Condition[], target?: string): number {
  let total = 0;
  for (const c of conditions) {
    for (const e of c.effects) {
      if (e.kind === 'checkModifier' && (e.appliesTo === undefined || e.appliesTo === target)) {
        total += e.value;
      }
    }
  }
  return total;
}

/** Avanza di un turno: applica gli effetti 'resourcePerTurn', decrementa le durate
 *  'turns' e rimuove le condizioni scadute. Le durate 'scenes'/'permanent' restano.
 *  Funzione pura. */
export function tickConditions(actor: Actor): Actor {
  let next = actor;
  for (const c of actor.conditions) {
    for (const e of c.effects) {
      if (e.kind === 'resourcePerTurn') {
        next = adjustResource(next, e.resource, e.delta);
      }
    }
  }

  const remaining: Condition[] = [];
  for (const c of next.conditions) {
    if (c.duration.kind === 'turns') {
      const left = c.duration.remaining - 1;
      if (left > 0) {
        remaining.push({ ...c, duration: { kind: 'turns', remaining: left } });
      }
    } else {
      remaining.push(c);
    }
  }
  return { ...next, conditions: remaining };
}
```

- [ ] **Step 4: Esegui il test per verificare che passi**

Run: `pnpm test`
Expected: PASS (i nuovi test di `condition` + tutti i precedenti).

- [ ] **Step 5: Aggiungi al barrel**

`packages/engine/src/index.ts` — aggiungi in fondo:
```ts
export * from './condition';
```

- [ ] **Step 6: Verifica typecheck + test**

Run: `pnpm -C packages/engine typecheck && pnpm test`
Expected: nessun errore di tipo; tutti i test PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/condition.ts packages/engine/src/condition.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): condizioni con effetti dichiarativi e avanzamento turno"
```

---

## Task 4: Prova dell'attore — `buildCheckExpr` e `actorCheck`

Il ponte col Piano 1: comporre l'espressione di tiro di una prova a partire dall'attore (dadi base + attributo + abilità + modificatori da condizioni + situazionali) e risolverla con `resolveCheck`.

**Files:**
- Create: `packages/engine/src/actor-check.ts`
- Test: `packages/engine/src/actor-check.test.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

`packages/engine/src/actor-check.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { RandomSource } from './random';
import type { Actor } from './actor';
import { buildCheckExpr, actorCheck, type CheckRequest } from './actor-check';

function stubRandom(values: number[]): RandomSource {
  let i = 0;
  return { next: () => values[i++ % values.length]! };
}

function hero(): Actor {
  return {
    id: 'pg-1',
    name: 'Kael',
    kind: 'pc',
    attributes: { forza: 3 },
    skills: { atletica: 2 },
    resources: { hp: { current: 10, max: 10 } },
    conditions: [
      { key: 'inspired', source: 'bardo', effects: [{ kind: 'checkModifier', value: 1 }], duration: { kind: 'permanent' } },
    ],
  };
}

describe('buildCheckExpr', () => {
  it('usa 1d20 di default e somma attributo, abilità e condizioni come modificatori', () => {
    const req: CheckRequest = { actor: hero(), attribute: 'forza', skill: 'atletica', dc: 10 };
    const expr = buildCheckExpr(req);
    expect(expr.dice).toEqual([{ count: 1, sides: 20 }]);
    expect(expr.mode).toBe('check');
    // 3 (forza) + 2 (atletica) + 1 (inspired)
    const total = expr.modifiers.reduce((s, m) => s + m.value, 0);
    expect(total).toBe(6);
  });

  it('include i modificatori situazionali e i dadi base personalizzati', () => {
    const req: CheckRequest = {
      actor: hero(),
      attribute: 'forza',
      baseDice: [{ count: 2, sides: 6 }],
      situationalModifiers: [{ value: -2, source: 'buio' }],
      dc: 8,
    };
    const expr = buildCheckExpr(req);
    expect(expr.dice).toEqual([{ count: 2, sides: 6 }]);
    // 3 (forza) + 1 (inspired globale) + (-2) situazionale
    const total = expr.modifiers.reduce((s, m) => s + m.value, 0);
    expect(total).toBe(2);
  });
});

describe('actorCheck', () => {
  it('risolve la prova in modo deterministico col motore di tiro', () => {
    const rng = stubRandom([0.95]); // 1d20 → faccia 20
    const req: CheckRequest = { actor: hero(), attribute: 'forza', skill: 'atletica', dc: 10 };
    const res = actorCheck(req, rng);
    expect(res.total).toBe(26); // 20 + 6
    expect(res.dc).toBe(10);
    expect(res.margin).toBe(16);
    expect(res.outcome).toBe('critical');
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import './actor-check'`.

- [ ] **Step 3: Scrivi l'implementazione minima**

`packages/engine/src/actor-check.ts`:
```ts
import type { RandomSource } from './random';
import type { DieGroup, Modifier, RollExpr } from './dice';
import { resolveCheck, type CheckResult } from './check';
import { getAttribute, getSkill, type Actor } from './actor';
import { checkModifierFrom } from './condition';

export interface CheckRequest {
  actor: Actor;
  attribute?: string;
  skill?: string;
  baseDice?: DieGroup[];
  situationalModifiers?: Modifier[];
  dc: number;
}

/** Compone l'espressione di tiro di una prova a partire dall'attore:
 *  dadi base (default 1d20) + attributo + abilità + modificatori da condizioni
 *  + modificatori situazionali. Funzione pura. */
export function buildCheckExpr(req: CheckRequest): RollExpr {
  const modifiers: Modifier[] = [];

  if (req.attribute !== undefined) {
    modifiers.push({ value: getAttribute(req.actor, req.attribute), source: `attr:${req.attribute}` });
  }
  if (req.skill !== undefined) {
    modifiers.push({ value: getSkill(req.actor, req.skill), source: `skill:${req.skill}` });
  }

  const condTarget = req.skill ?? req.attribute;
  const condMod = checkModifierFrom(req.actor.conditions, condTarget);
  if (condMod !== 0) {
    modifiers.push({ value: condMod, source: 'conditions' });
  }

  if (req.situationalModifiers !== undefined) {
    modifiers.push(...req.situationalModifiers);
  }

  return {
    dice: req.baseDice ?? [{ count: 1, sides: 20 }],
    modifiers,
    mode: 'check',
  };
}

/** Esegue una prova dell'attore: costruisce l'espressione e la risolve
 *  in modo deterministico data una RandomSource. */
export function actorCheck(req: CheckRequest, rng: RandomSource): CheckResult {
  return resolveCheck(buildCheckExpr(req), req.dc, rng);
}
```

- [ ] **Step 4: Esegui il test per verificare che passi**

Run: `pnpm test`
Expected: PASS (i nuovi test di `actor-check` + tutti i precedenti).

- [ ] **Step 5: Aggiungi al barrel**

`packages/engine/src/index.ts` — aggiungi in fondo:
```ts
export * from './actor-check';
```
Il file finale deve essere:
```ts
export * from './random';
export * from './dice';
export * from './check';
export * from './actor';
export * from './resource';
export * from './condition';
export * from './actor-check';
```

- [ ] **Step 6: Verifica finale typecheck + test**

Run: `pnpm -C packages/engine typecheck && pnpm test`
Expected: nessun errore di tipo; tutti i test PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/actor-check.ts packages/engine/src/actor-check.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): prova dell'attore (buildCheckExpr, actorCheck)"
```

---

## Self-Review (eseguita)

**1. Copertura spec (per i confini di questo piano):**
- §5.3 modello di dominio + funzioni pure → Task 1–4 (entità `Actor`, value object `ResourcePool`/`Condition`, operazioni pure). ✔
- §11.4 attributi/abilità data-driven (engine generico) → Task 1 (`Record<string, number>`, getter con default 0; nessuna chiave hardcoded). ✔
- §11.6 risorse generiche (current/max, esaurimento) → Task 2 (`adjustResource` con clamp, `isDepleted`). ✔
- §11.7 condizioni con effetti dichiarativi e durata → Task 3 (`ConditionEffect`, `Duration`, `tickConditions`). ✔
- Ponte col motore di tiro del Piano 1 → Task 4 (`buildCheckExpr`/`actorCheck`). ✔
- §11.9 inventario, §11.8 progressione, §11.5 combattimento/`PositionModel`, §5.1 ES → **fuori ambito**, piani successivi. Nessun requisito *di questo piano* scoperto.

**2. Scan placeholder:** nessun TBD/TODO; ogni step ha codice/comando concreto.

**3. Coerenza dei tipi:** `Actor`/`ActorKind`/`ResourcePool`/`Condition`/`ConditionEffect`/`Duration` definiti in Task 1 e usati invariati in Task 2–4. `getAttribute`/`getSkill` (Task 1) usati in Task 4. `adjustResource` (Task 2) usato in Task 3 (`tickConditions`). `checkModifierFrom` (Task 3) usato in Task 4. `RollExpr`/`DieGroup`/`Modifier`/`CheckResult`/`resolveCheck` provengono dal Piano 1 (`dice.ts`/`check.ts`) e sono usati coerentemente. ✔
- Attenzione strict: accessi a `Record` usano `?? 0` (Task 1) o controllo `undefined` con throw (Task 2); campi opzionali di `CheckRequest`/`ConditionEffect` gestiti con `=== undefined` (compatibile con `exactOptionalPropertyTypes`). ✔

---

## Roadmap aggiornata dei piani successivi (Fase 1)

- **Piano 3 — Inventario, oggetti e progressione:** oggetti come dati con effetti dichiarativi (un'arma contribuisce dadi all'espressione di tiro; un'armatura modifica una difesa) §11.9; progressione XP/livelli o milestone §11.8.
- **Piano 4 — Combattimento a zone:** `PositionModel` (zone astratte), iniziativa, azioni per turno, aggregate `Encounter` con invarianti §11.5.
- **Piano 5 — Event Sourcing (Campaign/World):** Command/Event, proiezioni (L1), snapshot, replay; avvolge le funzioni pure dei piani 2–4 §5.1.
- **Piano 6 — Persistenza:** SQLite + Drizzle dietro `Repository`, contract test.
- **Piano 7 — Provider AI + AI Master + StructuredOutputPort + TracingPort.**
- **Piano 8 — Memoria L1.5 + L2 + Context Assembler.**
- **Piano 9 — Shell Electron (main/preload/renderer, sicurezza, IPC).**
- **Piano 10 — UI Vue (chat, scheda PG, pannello dadi 3D, journal, provider).**
- **Piano 11 — Moduli a tema: formato dati Zod + import/export + 1 modulo curato.**

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-15-loomn-fase1-piano2-modello-dominio.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch di un subagent fresco per task, review (spec + qualità) tra un task e l'altro.

**2. Inline Execution** — esecuzione dei task in questa sessione con checkpoint.

**Quale approccio preferisci?**
