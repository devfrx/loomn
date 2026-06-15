# Loomn — Fase 1 / Piano 3: Inventario & oggetti + progressione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere all'engine gli oggetti con effetti dichiarativi (un'arma contribuisce dadi a un tiro, un'armatura modifica una difesa) e la progressione del personaggio (XP/livelli con soglie, oppure milestone).

**Architecture:** Estensione di `@loomn/engine` (TS puro) sopra il modello di dominio del Piano 2. I tipi (`Item`, `ItemEffect`, `Progression`) vivono in `actor.ts` come gli altri tipi dell'aggregato; le operazioni in moduli dedicati (`item.ts`, `progression.ts`). Operazioni come funzioni pure `(stato, …) → nuovo stato`. Gli oggetti equipaggiati si integrano in `buildCheckExpr` (Plan 2) in modo additivo. Niente IO, niente eventi (Event Sourcing più avanti). TDD rigoroso, RNG iniettato.

**Tech Stack:** TypeScript (strict: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Vitest. Nessuna nuova dipendenza.

---

## Riferimenti allo spec

Implementa, dello spec [2026-06-15-simulatore-campagne-ai-design.md](../specs/2026-06-15-simulatore-campagne-ai-design.md):
- §11.9 inventario & oggetti (oggetti come dati con effetti dichiarativi; arma → dadi; armatura → modifica difesa);
- §11.8 progressione (XP/livelli **oppure** milestone; l'engine traccia e applica gli avanzamenti, il modulo definisce le curve).

**Fuori ambito (piani successivi):** combattimento a zone / `PositionModel` / `Encounter` (§11.5, Piano 4), Event Sourcing (§5.1, Piano 5).

**Prerequisito:** Piano 2 mergiato in `main` (`@loomn/engine` con `actor.ts`, `resource.ts`, `condition.ts`, `actor-check.ts`; `pnpm test` → 34 verdi). Lavorare su un branch dedicato, non su `main`.

---

## Struttura dei file (questo piano)

```
packages/engine/src/
├─ actor.ts          ← MODIFICA: aggiunge tipi Item/ItemEffect/Progression + campi items/progression
├─ item.ts           ← NUOVO: operazioni inventario + contributi degli oggetti (dadi/modificatori/difesa)
├─ progression.ts    ← NUOVO: XP, soglie→livello, milestone
├─ actor-check.ts    ← MODIFICA: integra gli oggetti equipaggiati nel tiro (flag includeEquipped)
├─ index.ts          ← MODIFICA: aggiunge ./item e ./progression
└─ *.test.ts         ← nuovi test + aggiornamento fixture esistenti (nuovi campi obbligatori)
```

**Disciplina di scope (importante):** modificare SOLO i file elencati in ciascun task. NON toccare `package.json`, `tsconfig.json` (root o package), `vitest.config.ts`, né creare un `tsconfig.json` di root o aggiungere `composite`/project references. Se sembra servire un cambio di build-config, FERMARSI e segnalarlo come concern, non cambiarlo. `git status` deve mostrare solo i file previsti prima di ogni commit.

**Decisione di design (anti-debito):** `items` e `progression` sono campi **obbligatori** dell'aggregato `Actor` (non opzionali): l'attore rappresenta pienamente il proprio stato. Questo richiede di aggiornare le fixture dei test del Piano 2 (Task 1).

---

## Task 1: Estendi l'aggregato `Actor` (tipi Item/Progression + campi) e aggiorna le fixture

Estensione di schema interdipendente: il tipo, i nuovi campi e tutte le fixture cambiano insieme (con campi obbligatori non si può compilare a metà). Verifica = l'intera suite ricompila e passa, più un test che documenta i nuovi campi.

**Files:**
- Modify: `packages/engine/src/actor.ts`
- Modify (fixture): `packages/engine/src/actor.test.ts`
- Modify (fixture): `packages/engine/src/resource.test.ts`
- Modify (fixture): `packages/engine/src/condition.test.ts`
- Modify (fixture): `packages/engine/src/actor-check.test.ts`

- [ ] **Step 1: Sostituisci INTERAMENTE `packages/engine/src/actor.ts` con:**

```ts
import type { DieGroup, RollMode } from './dice';

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

export type ItemEffect =
  | { kind: 'contributeDice'; dice: DieGroup[]; mode: RollMode }
  | { kind: 'checkModifier'; value: number; appliesTo?: string }
  | { kind: 'defenseModifier'; defense: string; value: number };

export interface Item {
  id: string;
  name: string;
  equipped: boolean;
  effects: ItemEffect[];
}

export interface Progression {
  xp: number;
  level: number;
}

export interface Actor {
  id: string;
  name: string;
  kind: ActorKind;
  attributes: Record<string, number>;
  skills: Record<string, number>;
  resources: Record<string, ResourcePool>;
  conditions: Condition[];
  items: Item[];
  progression: Progression;
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

- [ ] **Step 2: Aggiorna le fixture nei 4 file di test.**

In ciascuno dei seguenti file, nella funzione factory dell'attore, aggiungi queste due proprietà subito dopo la proprietà `conditions`:
```ts
    items: [],
    progression: { xp: 0, level: 1 },
```
- `packages/engine/src/actor.test.ts` → factory `sampleActor()`
- `packages/engine/src/resource.test.ts` → factory `actorWith(current, max)`
- `packages/engine/src/condition.test.ts` → factory `baseActor()`
- `packages/engine/src/actor-check.test.ts` → factory `hero()`

Esempio (per `sampleActor()` in `actor.test.ts`), il return diventa:
```ts
  return {
    id: 'pg-1',
    name: 'Kael',
    kind: 'pc',
    attributes: { forza: 3, mente: 1 },
    skills: { atletica: 2 },
    resources: { hp: { current: 10, max: 10 } },
    conditions: [],
    items: [],
    progression: { xp: 0, level: 1 },
  };
```

- [ ] **Step 3: Aggiungi un test che documenta lo schema in `packages/engine/src/actor.test.ts`** (in fondo al file, dopo i `describe` esistenti):
```ts
describe('Actor schema', () => {
  it('include inventario e progressione di default', () => {
    const a = sampleActor();
    expect(a.items).toEqual([]);
    expect(a.progression).toEqual({ xp: 0, level: 1 });
  });
});
```

- [ ] **Step 4: Esegui typecheck e test**

Run: `pnpm -C packages/engine typecheck && pnpm test`
Expected: typecheck pulito; **35 test PASS** (34 del Piano 2 + 1 nuovo). Se il typecheck segnala una fixture senza i nuovi campi, completala.

- [ ] **Step 5: Verifica scope e commit**

Run: `git status --short` (deve elencare solo i 5 file sopra).
```bash
git add packages/engine/src/actor.ts packages/engine/src/actor.test.ts packages/engine/src/resource.test.ts packages/engine/src/condition.test.ts packages/engine/src/actor-check.test.ts
git commit -m "feat(engine): estende Actor con inventario e progressione"
```

---

## Task 2: Operazioni di inventario

**Files:**
- Create: `packages/engine/src/item.ts`
- Test: `packages/engine/src/item.test.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Scrivi il test che fallisce `packages/engine/src/item.test.ts`:**
```ts
import { describe, it, expect } from 'vitest';
import type { Actor, Item } from './actor';
import { addItem, removeItem, setEquipped, equippedItems } from './item';

function baseActor(): Actor {
  return {
    id: 'a',
    name: 'A',
    kind: 'npc',
    attributes: {},
    skills: {},
    resources: {},
    conditions: [],
    items: [],
    progression: { xp: 0, level: 1 },
  };
}

const sword: Item = { id: 'sword', name: 'Spadone', equipped: false, effects: [] };
const shield: Item = { id: 'shield', name: 'Scudo', equipped: false, effects: [] };

describe('addItem', () => {
  it('aggiunge un oggetto restituendo un nuovo attore', () => {
    const original = baseActor();
    const out = addItem(original, sword);
    expect(out.items).toHaveLength(1);
    expect(original.items).toHaveLength(0);
  });
});

describe('removeItem', () => {
  it('rimuove un oggetto per id', () => {
    const out = removeItem(addItem(baseActor(), sword), 'sword');
    expect(out.items).toHaveLength(0);
  });
  it('è un no-op se id assente', () => {
    const out = removeItem(addItem(baseActor(), sword), 'inesistente');
    expect(out.items).toHaveLength(1);
  });
});

describe('setEquipped', () => {
  it('imposta equipped solo per id corrispondente', () => {
    let actor = addItem(addItem(baseActor(), sword), shield);
    actor = setEquipped(actor, 'sword', true);
    expect(actor.items.find((i) => i.id === 'sword')?.equipped).toBe(true);
    expect(actor.items.find((i) => i.id === 'shield')?.equipped).toBe(false);
  });
});

describe('equippedItems', () => {
  it('ritorna solo gli oggetti equipaggiati', () => {
    let actor = addItem(addItem(baseActor(), sword), shield);
    actor = setEquipped(actor, 'sword', true);
    expect(equippedItems(actor).map((i) => i.id)).toEqual(['sword']);
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import './item'`.

- [ ] **Step 3: Scrivi `packages/engine/src/item.ts`:**
```ts
import type { Actor, Item } from './actor';

/** Aggiunge un oggetto all'inventario. Funzione pura. */
export function addItem(actor: Actor, item: Item): Actor {
  return { ...actor, items: [...actor.items, item] };
}

/** Rimuove l'oggetto con l'id dato (no-op se assente). Funzione pura. */
export function removeItem(actor: Actor, itemId: string): Actor {
  return { ...actor, items: actor.items.filter((i) => i.id !== itemId) };
}

/** Imposta lo stato 'equipped' dell'oggetto con l'id dato. Funzione pura. */
export function setEquipped(actor: Actor, itemId: string, equipped: boolean): Actor {
  return {
    ...actor,
    items: actor.items.map((i) => (i.id === itemId ? { ...i, equipped } : i)),
  };
}

/** Gli oggetti attualmente equipaggiati. */
export function equippedItems(actor: Actor): Item[] {
  return actor.items.filter((i) => i.equipped);
}
```

- [ ] **Step 4: Esegui il test per verificare che passi**

Run: `pnpm test`
Expected: PASS — **40 test** (35 + 5 nuovi).

- [ ] **Step 5: Aggiungi al barrel** — in fondo a `packages/engine/src/index.ts`:
```ts
export * from './item';
```

- [ ] **Step 6: Verifica typecheck + test**

Run: `pnpm -C packages/engine typecheck && pnpm test`
Expected: nessun errore di tipo; tutti i test PASS.

- [ ] **Step 7: Verifica scope e commit**

Run: `git status --short` (solo i 3 file previsti).
```bash
git add packages/engine/src/item.ts packages/engine/src/item.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): operazioni di inventario (addItem, removeItem, setEquipped, equippedItems)"
```

---

## Task 3: Contributi degli oggetti + integrazione nel tiro

Gli oggetti contribuiscono al gioco: dadi a un tiro (arma), modificatori alle prove, modifiche a una difesa (armatura). Gli oggetti equipaggiati si integrano in `buildCheckExpr` tramite il flag `includeEquipped`.

**Files:**
- Modify: `packages/engine/src/item.ts`
- Modify: `packages/engine/src/item.test.ts`
- Modify: `packages/engine/src/actor-check.ts`
- Modify: `packages/engine/src/actor-check.test.ts`

- [ ] **Step 1: Scrivi i test che falliscono.**

In `packages/engine/src/item.test.ts`, aggiorna l'import in cima al file a:
```ts
import {
  addItem,
  removeItem,
  setEquipped,
  equippedItems,
  collectItemDice,
  collectItemCheckModifier,
  defenseValue,
} from './item';
```
e aggiungi in fondo al file:
```ts
const magicBlade: Item = {
  id: 'magicBlade',
  name: 'Lama magica',
  equipped: true,
  effects: [
    { kind: 'contributeDice', dice: [{ count: 1, sides: 6 }], mode: 'check' },
    { kind: 'contributeDice', dice: [{ count: 2, sides: 6 }], mode: 'effect' },
    { kind: 'checkModifier', value: 1 },
  ],
};

const plate: Item = {
  id: 'plate',
  name: 'Armatura',
  equipped: true,
  effects: [{ kind: 'defenseModifier', defense: 'difesa', value: 3 }],
};

const stowedRing: Item = {
  id: 'ring',
  name: 'Anello',
  equipped: false,
  effects: [{ kind: 'defenseModifier', defense: 'difesa', value: 5 }],
};

describe('collectItemDice', () => {
  it('raccoglie i dadi contributeDice del modo indicato', () => {
    expect(collectItemDice([magicBlade], 'check')).toEqual([{ count: 1, sides: 6 }]);
    expect(collectItemDice([magicBlade], 'effect')).toEqual([{ count: 2, sides: 6 }]);
  });
});

describe('collectItemCheckModifier', () => {
  it('somma i checkModifier globali e quelli sul target', () => {
    expect(collectItemCheckModifier([magicBlade])).toBe(1);
  });
});

describe('defenseValue', () => {
  it('somma i defenseModifier degli oggetti equipaggiati alla base', () => {
    const actor: Actor = { ...baseActor(), items: [plate, stowedRing] };
    // base 10 + 3 (plate equipaggiata); anello non equipaggiato escluso
    expect(defenseValue(actor, 'difesa', 10)).toBe(13);
  });
});
```

In `packages/engine/src/actor-check.test.ts`, aggiungi in fondo al file:
```ts
describe('buildCheckExpr con oggetti equipaggiati', () => {
  it('include dadi e modificatori degli oggetti equipaggiati quando richiesto', () => {
    const actor: Actor = {
      ...hero(),
      items: [
        {
          id: 'blade',
          name: 'Lama',
          equipped: true,
          effects: [
            { kind: 'contributeDice', dice: [{ count: 1, sides: 6 }], mode: 'check' },
            { kind: 'checkModifier', value: 2 },
          ],
        },
        {
          id: 'stowed',
          name: 'Riposto',
          equipped: false,
          effects: [{ kind: 'checkModifier', value: 99 }],
        },
      ],
    };
    const expr = buildCheckExpr({ actor, attribute: 'forza', includeEquipped: true, dc: 10 });
    expect(expr.dice).toEqual([{ count: 1, sides: 20 }, { count: 1, sides: 6 }]);
    // forza 3 + inspired 1 (globale) + items 2 ; lo stowed +99 escluso (non equipaggiato)
    const total = expr.modifiers.reduce((s, m) => s + m.value, 0);
    expect(total).toBe(6);
  });

  it('ignora gli oggetti se includeEquipped è assente', () => {
    const actor: Actor = {
      ...hero(),
      items: [
        {
          id: 'blade',
          name: 'Lama',
          equipped: true,
          effects: [{ kind: 'contributeDice', dice: [{ count: 1, sides: 6 }], mode: 'check' }],
        },
      ],
    };
    const expr = buildCheckExpr({ actor, attribute: 'forza', dc: 10 });
    expect(expr.dice).toEqual([{ count: 1, sides: 20 }]);
  });
});
```

- [ ] **Step 2: Esegui i test per verificare che falliscano**

Run: `pnpm test`
Expected: FAIL — `collectItemDice`/`collectItemCheckModifier`/`defenseValue` non esportati; `includeEquipped` non riconosciuto su `CheckRequest`.

- [ ] **Step 3: Estendi `packages/engine/src/item.ts`.** Sostituisci la riga di import in cima:
```ts
import type { Actor, Item } from './actor';
```
con:
```ts
import type { Actor, Item } from './actor';
import type { DieGroup, RollMode } from './dice';
```
e aggiungi in fondo al file le tre funzioni:
```ts
/** Raccoglie i dadi degli effetti contributeDice del modo indicato. */
export function collectItemDice(items: Item[], mode: RollMode): DieGroup[] {
  const dice: DieGroup[] = [];
  for (const item of items) {
    for (const e of item.effects) {
      if (e.kind === 'contributeDice' && e.mode === mode) {
        dice.push(...e.dice);
      }
    }
  }
  return dice;
}

/** Somma i checkModifier degli oggetti: globali (appliesTo assente) + quelli sul target. */
export function collectItemCheckModifier(items: Item[], target?: string): number {
  let total = 0;
  for (const item of items) {
    for (const e of item.effects) {
      if (e.kind === 'checkModifier' && (e.appliesTo === undefined || e.appliesTo === target)) {
        total += e.value;
      }
    }
  }
  return total;
}

/** Valore di una difesa: base + somma dei defenseModifier degli oggetti EQUIPAGGIATI per quella difesa. */
export function defenseValue(actor: Actor, defense: string, base: number): number {
  let total = base;
  for (const item of equippedItems(actor)) {
    for (const e of item.effects) {
      if (e.kind === 'defenseModifier' && e.defense === defense) {
        total += e.value;
      }
    }
  }
  return total;
}
```

- [ ] **Step 4: Estendi `packages/engine/src/actor-check.ts`.** Sostituisci INTERAMENTE il file con:
```ts
import type { RandomSource } from './random';
import type { DieGroup, Modifier, RollExpr } from './dice';
import { resolveCheck, type CheckResult } from './check';
import { getAttribute, getSkill, type Actor } from './actor';
import { checkModifierFrom } from './condition';
import { equippedItems, collectItemDice, collectItemCheckModifier } from './item';

export interface CheckRequest {
  actor: Actor;
  attribute?: string;
  skill?: string;
  baseDice?: DieGroup[];
  situationalModifiers?: Modifier[];
  includeEquipped?: boolean;
  dc: number;
}

/** Compone l'espressione di tiro di una prova a partire dall'attore:
 *  dadi base (default 1d20) + dadi degli oggetti equipaggiati (se includeEquipped)
 *  + attributo + abilità + modificatori da condizioni + da oggetti + situazionali.
 *  Funzione pura. */
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

  const equipped = req.includeEquipped === true ? equippedItems(req.actor) : [];
  const itemMod = collectItemCheckModifier(equipped, condTarget);
  if (itemMod !== 0) {
    modifiers.push({ value: itemMod, source: 'items' });
  }

  if (req.situationalModifiers !== undefined) {
    modifiers.push(...req.situationalModifiers);
  }

  const baseDice = req.baseDice ?? [{ count: 1, sides: 20 }];
  const dice = [...baseDice, ...collectItemDice(equipped, 'check')];

  return { dice, modifiers, mode: 'check' };
}

/** Esegue una prova dell'attore: costruisce l'espressione e la risolve
 *  in modo deterministico data una RandomSource. */
export function actorCheck(req: CheckRequest, rng: RandomSource): CheckResult {
  return resolveCheck(buildCheckExpr(req), req.dc, rng);
}
```

- [ ] **Step 5: Esegui il test per verificare che passi**

Run: `pnpm test`
Expected: PASS — **45 test** (40 + 3 in item.test + 2 in actor-check.test). I test del Piano 2 su `buildCheckExpr` restano verdi (default `includeEquipped` assente → comportamento invariato).

- [ ] **Step 6: Verifica typecheck + test**

Run: `pnpm -C packages/engine typecheck && pnpm test`
Expected: nessun errore di tipo; tutti i test PASS.

- [ ] **Step 7: Verifica scope e commit**

Run: `git status --short` (solo i 4 file previsti).
```bash
git add packages/engine/src/item.ts packages/engine/src/item.test.ts packages/engine/src/actor-check.ts packages/engine/src/actor-check.test.ts
git commit -m "feat(engine): contributi degli oggetti (dadi, modificatori, difesa) e integrazione nel tiro"
```

---

## Task 4: Progressione (XP, soglie→livello, milestone)

**Files:**
- Create: `packages/engine/src/progression.ts`
- Test: `packages/engine/src/progression.test.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Scrivi il test che fallisce `packages/engine/src/progression.test.ts`:**
```ts
import { describe, it, expect } from 'vitest';
import type { Actor } from './actor';
import { awardXp, levelFor, applyProgression, advanceMilestone } from './progression';

function actorAt(xp: number, level: number): Actor {
  return {
    id: 'a',
    name: 'A',
    kind: 'npc',
    attributes: {},
    skills: {},
    resources: {},
    conditions: [],
    items: [],
    progression: { xp, level },
  };
}

describe('awardXp', () => {
  it('aggiunge XP restituendo un nuovo attore', () => {
    const original = actorAt(10, 1);
    const out = awardXp(original, 5);
    expect(out.progression.xp).toBe(15);
    expect(original.progression.xp).toBe(10);
  });
});

describe('levelFor', () => {
  it('calcola il livello dalle soglie cumulative', () => {
    const t = [100, 300, 600];
    expect(levelFor(0, t)).toBe(1);
    expect(levelFor(99, t)).toBe(1);
    expect(levelFor(100, t)).toBe(2);
    expect(levelFor(299, t)).toBe(2);
    expect(levelFor(300, t)).toBe(3);
    expect(levelFor(1000, t)).toBe(4);
  });
});

describe('applyProgression', () => {
  it('ricalcola il livello in base allo XP corrente', () => {
    const out = applyProgression(actorAt(300, 1), [100, 300, 600]);
    expect(out.progression.level).toBe(3);
    expect(out.progression.xp).toBe(300);
  });
});

describe('advanceMilestone', () => {
  it('incrementa il livello di 1', () => {
    const out = advanceMilestone(actorAt(0, 2));
    expect(out.progression.level).toBe(3);
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import './progression'`.

- [ ] **Step 3: Scrivi `packages/engine/src/progression.ts`:**
```ts
import type { Actor } from './actor';

/** Aggiunge XP all'attore. Funzione pura. */
export function awardXp(actor: Actor, amount: number): Actor {
  return {
    ...actor,
    progression: { ...actor.progression, xp: actor.progression.xp + amount },
  };
}

/** Livello dato l'XP cumulativo e le soglie (XP cumulativo richiesto per liv. 2, 3, …,
 *  in ordine crescente). Livello 1 = 0 XP. */
export function levelFor(xp: number, thresholds: number[]): number {
  let level = 1;
  for (const t of thresholds) {
    if (xp >= t) {
      level += 1;
    } else {
      break;
    }
  }
  return level;
}

/** Ricalcola il livello dell'attore dal suo XP secondo le soglie. Funzione pura. */
export function applyProgression(actor: Actor, thresholds: number[]): Actor {
  const level = levelFor(actor.progression.xp, thresholds);
  return { ...actor, progression: { ...actor.progression, level } };
}

/** Avanzamento a milestone: incrementa il livello di 1 (ignora l'XP). Funzione pura. */
export function advanceMilestone(actor: Actor): Actor {
  return {
    ...actor,
    progression: { ...actor.progression, level: actor.progression.level + 1 },
  };
}
```

- [ ] **Step 4: Esegui il test per verificare che passi**

Run: `pnpm test`
Expected: PASS — **49 test** (45 + 4 nuovi).

- [ ] **Step 5: Aggiungi al barrel** — in fondo a `packages/engine/src/index.ts`:
```ts
export * from './progression';
```
Il file finale `index.ts` deve essere:
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
```

- [ ] **Step 6: Verifica finale typecheck + test**

Run: `pnpm -C packages/engine typecheck && pnpm test`
Expected: nessun errore di tipo; tutti i test PASS (49).

- [ ] **Step 7: Verifica scope e commit**

Run: `git status --short` (solo i 3 file previsti).
```bash
git add packages/engine/src/progression.ts packages/engine/src/progression.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): progressione (awardXp, levelFor, applyProgression, advanceMilestone)"
```

---

## Self-Review (eseguita)

**1. Copertura spec (per i confini di questo piano):**
- §11.9 oggetti come dati con effetti dichiarativi → Task 1 (`Item`/`ItemEffect`), Task 2 (inventario), Task 3 (arma → `contributeDice`; armatura → `defenseModifier`/`defenseValue`; integrazione nel tiro). ✔
- §11.8 progressione XP/livelli e milestone → Task 4 (`awardXp`, `levelFor`, `applyProgression`, `advanceMilestone`). Curve definite dai dati (le `thresholds` sono passate, non hardcoded). ✔
- §11.5 combattimento, §5.1 ES → **fuori ambito** (piani successivi). Nessun requisito *di questo piano* scoperto.

**2. Scan placeholder:** nessun TBD/TODO; ogni step ha codice/comando concreto. Le descrizioni dei test sono prive di apostrofi dentro stringhe in apici singoli (evitato il bug del Piano 2).

**3. Coerenza dei tipi:** `Item`/`ItemEffect`/`Progression` definiti in `actor.ts` (Task 1) e usati in `item.ts`/`progression.ts`/`actor-check.ts`. `ItemEffect.contributeDice` usa `DieGroup`/`RollMode` da `dice.ts` (Plan 1) — `actor.ts` li importa come type; nessun ciclo (dice non importa actor). `equippedItems`/`collectItemDice`/`collectItemCheckModifier` (item.ts) usati in `actor-check.ts` (Task 3) — dipendenza actor-check → item, aciclica (item non importa actor-check). `CheckRequest.includeEquipped` aggiunto in Task 3 e usato nei test dello stesso task. Conteggi test attesi: Task 1 → 35, Task 2 → 40, Task 3 → 45, Task 4 → 49. ✔
- Strict: accessi `Record` con `?? 0`; campi opzionali (`appliesTo?`, `includeEquipped?`) gestiti con `=== undefined`/`=== true`. ✔

---

## Roadmap aggiornata dei piani successivi (Fase 1)

- **Piano 4 — Combattimento a zone:** `PositionModel` (zone astratte), iniziativa, azioni per turno, aggregate `Encounter` con invarianti §11.5. Riuserà `collectItemDice(equipped, 'effect')` per il danno d'arma.
- **Piano 5 — Event Sourcing (Campaign/World):** Command/Event, proiezioni (L1), snapshot, replay; avvolge le funzioni pure dei piani 2–4 §5.1.
- **Piano 6 — Persistenza:** SQLite + Drizzle dietro `Repository`, contract test.
- **Piano 7 — Provider AI + AI Master + StructuredOutputPort + TracingPort.**
- **Piano 8 — Memoria L1.5 + L2 + Context Assembler.**
- **Piano 9 — Shell Electron (main/preload/renderer, sicurezza, IPC).**
- **Piano 10 — UI Vue (chat, scheda PG, pannello dadi 3D, journal, provider).**
- **Piano 11 — Moduli a tema: formato dati Zod + import/export + 1 modulo curato.**

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-15-loomn-fase1-piano3-inventario-progressione.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch di un subagent fresco per task, review (spec + qualità) tra un task e l'altro.

**2. Inline Execution** — esecuzione dei task in questa sessione con checkpoint.

**Quale approccio preferisci?**
