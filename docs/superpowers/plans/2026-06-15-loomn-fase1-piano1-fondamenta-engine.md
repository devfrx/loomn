# Loomn — Fase 1 / Piano 1: Fondamenta + Nucleo di risoluzione dell'engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creare il monorepo di Loomn e il nucleo deterministico dell'engine che risolve un tiro (espressione di dadi componibile) e ne calcola l'esito a gradi di successo.

**Architecture:** Monorepo pnpm. Il pacchetto `@loomn/engine` è TS puro, senza IO né dipendenze da Electron/Vue. Il caso non-determinismo (random) è iniettato tramite la porta `RandomSource`: in produzione un PRNG seedato, nei test uno stub a sequenza fissa → risultati riproducibili e test stabili. Tutto in TDD.

**Tech Stack:** TypeScript (strict), pnpm workspaces, Vitest. Nessun'altra dipendenza in questo piano.

---

## Riferimenti allo spec

Questo piano implementa, dello spec [2026-06-15-simulatore-campagne-ai-design.md](../specs/2026-06-15-simulatore-campagne-ai-design.md):
- §4 struttura monorepo (qui solo `packages/engine`, lo scheletro);
- §5.3 regole come funzioni pure, random iniettato/seedato;
- §11.1 espressione di dadi componibile (modi `check`/`effect`);
- §11.2 esito a gradi di successo.

Fuori ambito (piani successivi): modello personaggio, combattimento, event sourcing, AI, memoria, Electron, UI, moduli.

---

## Struttura dei file (questo piano)

```
repo/
├─ package.json              ← root, private, script comuni
├─ pnpm-workspace.yaml       ← workspace globber
├─ tsconfig.base.json        ← config TS strict condivisa
├─ vitest.config.ts          ← runner test su tutti i package
├─ .gitignore
└─ packages/
   └─ engine/
      ├─ package.json
      ├─ tsconfig.json
      └─ src/
         ├─ random.ts        ← porta RandomSource + PRNG seedato (mulberry32)
         ├─ dice.ts          ← tipi RollExpr + rollExpression()
         ├─ check.ts         ← Outcome + resolveCheck() (gradi di successo)
         ├─ index.ts         ← barrel pubblico del package
         ├─ random.test.ts
         ├─ dice.test.ts
         └─ check.test.ts
```

Responsabilità: `random.ts` = unica fonte di casualità (iniettabile). `dice.ts` = come un'espressione di dadi diventa risultato numerico. `check.ts` = come un risultato diventa esito narrativo (gradi). File piccoli e a singola responsabilità.

---

## Task 1: Scaffold del monorepo

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `packages/engine/package.json`
- Create: `packages/engine/tsconfig.json`
- Create: `packages/engine/src/index.ts`

- [ ] **Step 1: Crea `.gitignore`**

```gitignore
node_modules/
dist/
*.tsbuildinfo
.DS_Store
```

- [ ] **Step 2: Crea `pnpm-workspace.yaml`**

```yaml
packages:
  - 'packages/*'
  - 'app/*'
```

- [ ] **Step 3: Crea `package.json` (root)**

```json
{
  "name": "loomn",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 4: Crea `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 5: Crea `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 6: Crea `packages/engine/package.json`**

```json
{
  "name": "@loomn/engine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 7: Crea `packages/engine/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 8: Crea il barrel iniziale `packages/engine/src/index.ts`**

```ts
// Barrel pubblico di @loomn/engine. I moduli verranno ri-esportati man mano.
export {};
```

- [ ] **Step 9: Installa le dipendenze**

Run: `pnpm install`
Expected: crea `node_modules/` e `pnpm-lock.yaml` senza errori.

- [ ] **Step 10: Verifica che il runner test parta (a vuoto)**

Run: `pnpm test`
Expected: Vitest gira e riporta "No test files found" (nessun `.test.ts` ancora). Nessun errore di configurazione.

- [ ] **Step 11: Commit**

```bash
git add .gitignore pnpm-workspace.yaml package.json tsconfig.base.json vitest.config.ts pnpm-lock.yaml packages/engine
git commit -m "chore: scaffold monorepo pnpm + pacchetto @loomn/engine"
```

---

## Task 2: Porta `RandomSource` + PRNG seedato

Sorgente di casualità iniettabile. Seed uguale → sequenza uguale (riproducibilità). Implementazione: mulberry32 (PRNG a 32 bit, compatto e deterministico).

**Files:**
- Create: `packages/engine/src/random.ts`
- Test: `packages/engine/src/random.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

`packages/engine/src/random.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createSeededRandom } from './random';

describe('createSeededRandom', () => {
  it('produce valori in [0, 1)', () => {
    const rng = createSeededRandom(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('è deterministico: stesso seed → stessa sequenza', () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(42);
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
  });

  it('seed diversi → sequenze diverse', () => {
    const a = createSeededRandom(1);
    const b = createSeededRandom(2);
    expect(a.next()).not.toEqual(b.next());
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import './random'` / `createSeededRandom is not defined`.

- [ ] **Step 3: Scrivi l'implementazione minima**

`packages/engine/src/random.ts`:
```ts
/** Sorgente di casualità iniettabile. `next()` ritorna un float in [0, 1). */
export interface RandomSource {
  next(): number;
}

/** PRNG deterministico seedato (mulberry32). Stesso seed → stessa sequenza. */
export function createSeededRandom(seed: number): RandomSource {
  let a = seed >>> 0;
  return {
    next(): number {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}
```

- [ ] **Step 4: Esegui il test per verificare che passi**

Run: `pnpm test`
Expected: PASS (3 test verdi).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/random.ts packages/engine/src/random.test.ts
git commit -m "feat(engine): porta RandomSource con PRNG seedato"
```

---

## Task 3: Espressione di dadi e `rollExpression`

Un tiro è un'espressione componibile: più gruppi di dadi (`count` × `sides`, con `tag` per la fonte) più modificatori, e un `mode` (`check` o `effect`). La risoluzione è una funzione pura che usa la `RandomSource` iniettata.

**Files:**
- Create: `packages/engine/src/dice.ts`
- Test: `packages/engine/src/dice.test.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

`packages/engine/src/dice.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { RandomSource } from './random';
import { rollExpression, type RollExpr } from './dice';

/** Stub: restituisce in ordine i valori forniti, ciclando se servono di più. */
function stubRandom(values: number[]): RandomSource {
  let i = 0;
  return { next: () => values[i++ % values.length]! };
}

describe('rollExpression', () => {
  it('tira ogni dado del gruppo e somma con i modificatori', () => {
    // next()=0 → faccia 1 ; next()=0.99 → faccia max
    const rng = stubRandom([0, 0.99]); // 1d6 → 1, poi 1d6 → 6
    const expr: RollExpr = {
      dice: [{ count: 2, sides: 6, tag: 'spadone' }],
      modifiers: [{ value: 2, source: 'forza' }],
      mode: 'effect',
    };
    const res = rollExpression(expr, rng);
    expect(res.dice).toEqual([
      { sides: 6, value: 1, tag: 'spadone' },
      { sides: 6, value: 6, tag: 'spadone' },
    ]);
    expect(res.modifierTotal).toBe(2);
    expect(res.total).toBe(1 + 6 + 2);
    expect(res.mode).toBe('effect');
  });

  it('gestisce più gruppi di dadi e nessun modificatore', () => {
    const rng = stubRandom([0]); // ogni dado → faccia 1
    const expr: RollExpr = {
      dice: [
        { count: 1, sides: 20 },
        { count: 1, sides: 4 },
      ],
      modifiers: [],
      mode: 'check',
    };
    const res = rollExpression(expr, rng);
    expect(res.dice.map((d) => d.value)).toEqual([1, 1]);
    expect(res.modifierTotal).toBe(0);
    expect(res.total).toBe(2);
  });

  it('mappa next() sulla faccia corretta: floor(next*sides)+1', () => {
    const rng = stubRandom([0.5]); // 0.5 * 20 = 10 → faccia 11
    const res = rollExpression(
      { dice: [{ count: 1, sides: 20 }], modifiers: [], mode: 'check' },
      rng,
    );
    expect(res.dice[0]!.value).toBe(11);
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import './dice'`.

- [ ] **Step 3: Scrivi l'implementazione minima**

`packages/engine/src/dice.ts`:
```ts
import type { RandomSource } from './random';

export type RollMode = 'check' | 'effect';

export interface DieGroup {
  count: number;
  sides: number;
  tag?: string;
}

export interface Modifier {
  value: number;
  source: string;
}

export interface RollExpr {
  dice: DieGroup[];
  modifiers: Modifier[];
  mode: RollMode;
}

export interface DieResult {
  sides: number;
  value: number;
  tag?: string;
}

export interface RollResult {
  dice: DieResult[];
  modifierTotal: number;
  total: number;
  mode: RollMode;
}

/** Risolve un'espressione di dadi in modo deterministico data una RandomSource. */
export function rollExpression(expr: RollExpr, rng: RandomSource): RollResult {
  const dice: DieResult[] = [];
  for (const group of expr.dice) {
    for (let i = 0; i < group.count; i++) {
      const value = 1 + Math.floor(rng.next() * group.sides);
      dice.push(
        group.tag === undefined
          ? { sides: group.sides, value }
          : { sides: group.sides, value, tag: group.tag },
      );
    }
  }
  const diceTotal = dice.reduce((sum, d) => sum + d.value, 0);
  const modifierTotal = expr.modifiers.reduce((sum, m) => sum + m.value, 0);
  return { dice, modifierTotal, total: diceTotal + modifierTotal, mode: expr.mode };
}
```

- [ ] **Step 4: Esegui il test per verificare che passi**

Run: `pnpm test`
Expected: PASS (test di `dice` verdi, oltre a quelli di `random`).

- [ ] **Step 5: Ri-esporta dal barrel**

Sostituisci il contenuto di `packages/engine/src/index.ts`:
```ts
export * from './random';
export * from './dice';
```

- [ ] **Step 6: Verifica typecheck e test**

Run: `pnpm -C packages/engine typecheck && pnpm test`
Expected: nessun errore di tipo; tutti i test PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/dice.ts packages/engine/src/dice.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): espressione di dadi componibile e rollExpression"
```

---

## Task 4: Esito a gradi di successo (`resolveCheck`)

Un tiro in modo `check` va confrontato con una difficoltà (`dc`). Il margine (`total - dc`) determina l'esito su 5 gradi. Soglie di default (regolabili in futuro dai moduli — vedi §13 spec):

| Margine            | Esito             |
|--------------------|-------------------|
| ≥ +10              | `critical`        |
| da +5 a +9         | `success`         |
| da 0 a +4          | `success_at_cost` |
| da −1 a −9         | `failure`         |
| ≤ −10              | `disaster`        |

**Files:**
- Create: `packages/engine/src/check.ts`
- Test: `packages/engine/src/check.test.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

`packages/engine/src/check.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { RandomSource } from './random';
import type { RollExpr } from './dice';
import { outcomeFromMargin, resolveCheck } from './check';

function stubRandom(values: number[]): RandomSource {
  let i = 0;
  return { next: () => values[i++ % values.length]! };
}

describe('outcomeFromMargin', () => {
  it('mappa ogni banda al grado corretto', () => {
    expect(outcomeFromMargin(10)).toBe('critical');
    expect(outcomeFromMargin(15)).toBe('critical');
    expect(outcomeFromMargin(9)).toBe('success');
    expect(outcomeFromMargin(5)).toBe('success');
    expect(outcomeFromMargin(4)).toBe('success_at_cost');
    expect(outcomeFromMargin(0)).toBe('success_at_cost');
    expect(outcomeFromMargin(-1)).toBe('failure');
    expect(outcomeFromMargin(-9)).toBe('failure');
    expect(outcomeFromMargin(-10)).toBe('disaster');
    expect(outcomeFromMargin(-20)).toBe('disaster');
  });
});

describe('resolveCheck', () => {
  it('calcola margine ed esito da un tiro vs dc', () => {
    // 1d20 con next()=0.95 → faccia 20 ; +3 mod → total 23 ; dc 15 → margine 8 → success
    const rng = stubRandom([0.95]);
    const expr: RollExpr = {
      dice: [{ count: 1, sides: 20 }],
      modifiers: [{ value: 3, source: 'abilità' }],
      mode: 'check',
    };
    const res = resolveCheck(expr, 15, rng);
    expect(res.total).toBe(23);
    expect(res.dc).toBe(15);
    expect(res.margin).toBe(8);
    expect(res.outcome).toBe('success');
  });

  it('riporta i singoli dadi nel risultato (per il pannello 3D)', () => {
    const rng = stubRandom([0]); // faccia 1
    const res = resolveCheck(
      { dice: [{ count: 1, sides: 20 }], modifiers: [], mode: 'check' },
      10,
      rng,
    );
    expect(res.dice).toEqual([{ sides: 20, value: 1 }]);
    expect(res.margin).toBe(-9);
    expect(res.outcome).toBe('failure');
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import './check'`.

- [ ] **Step 3: Scrivi l'implementazione minima**

`packages/engine/src/check.ts`:
```ts
import type { RandomSource } from './random';
import { rollExpression, type RollExpr, type RollResult } from './dice';

export type Outcome =
  | 'critical'
  | 'success'
  | 'success_at_cost'
  | 'failure'
  | 'disaster';

export interface CheckResult extends RollResult {
  dc: number;
  margin: number;
  outcome: Outcome;
}

/** Mappa il margine (total - dc) sul grado di successo. Soglie di default. */
export function outcomeFromMargin(margin: number): Outcome {
  if (margin >= 10) return 'critical';
  if (margin >= 5) return 'success';
  if (margin >= 0) return 'success_at_cost';
  if (margin > -10) return 'failure';
  return 'disaster';
}

/** Risolve una prova: tira l'espressione, confronta con dc, calcola l'esito. */
export function resolveCheck(
  expr: RollExpr,
  dc: number,
  rng: RandomSource,
): CheckResult {
  const roll = rollExpression(expr, rng);
  const margin = roll.total - dc;
  return { ...roll, dc, margin, outcome: outcomeFromMargin(margin) };
}
```

- [ ] **Step 4: Esegui il test per verificare che passi**

Run: `pnpm test`
Expected: PASS (tutti i test dei tre file verdi).

- [ ] **Step 5: Ri-esporta dal barrel**

Sostituisci il contenuto di `packages/engine/src/index.ts`:
```ts
export * from './random';
export * from './dice';
export * from './check';
```

- [ ] **Step 6: Verifica finale typecheck + test**

Run: `pnpm -C packages/engine typecheck && pnpm test`
Expected: nessun errore di tipo; tutti i test PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/check.ts packages/engine/src/check.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): risoluzione prove con gradi di successo"
```

---

## Self-Review (eseguita)

**1. Copertura spec (per i confini di questo piano):**
- §4 scheletro monorepo + `packages/engine` → Task 1. ✔
- §5.3 funzioni pure + random iniettato/seedato → Task 2 + Task 3/4 (funzioni pure). ✔
- §11.1 espressione di dadi componibile, modi `check`/`effect` → Task 3. ✔
- §11.2 gradi di successo → Task 4. ✔
- Pezzi §11.3–11.9, AI, memoria, ES, Electron, UI, moduli → **fuori ambito**, coperti dai piani successivi (roadmap sotto). Nessun requisito *di questo piano* scoperto.

**2. Scan placeholder:** nessun TBD/TODO; ogni step ha codice/comando concreto. ✔

**3. Coerenza dei tipi:** `RandomSource.next`, `RollExpr`/`DieGroup`/`Modifier`/`RollResult`/`DieResult`, `RollMode` (`'check'|'effect'`), `Outcome`, `CheckResult`, `rollExpression`, `outcomeFromMargin`, `resolveCheck` — i nomi usati nei test di Task 3/4 coincidono con le firme implementate. `CheckResult extends RollResult` → i campi `dice/modifierTotal/total/mode` sono coerenti. ✔

---

## Roadmap dei piani successivi (Fase 1)

Ogni voce diventerà un piano dedicato, scritto quando si arriva ad essa:

- **Piano 2 — Modello di dominio dell'engine:** `Character` (PG/PNG), risorse (§11.6), condizioni (§11.7), inventario (§11.9), progressione (§11.8); combattimento a zone con `PositionModel` e iniziativa (§11.5). Regole come funzioni pure.
- **Piano 3 — Event Sourcing (Campaign/World):** Command/Event, proiezioni (read model L1), snapshot, replay deterministico (§5.1, §6 L1).
- **Piano 4 — Persistenza:** SQLite + Drizzle nel processo main dietro la porta `Repository`, contract test (§4, §9).
- **Piano 5 — Provider AI + AI Master:** client OpenAI-compatibile + LM Studio, `StructuredOutputPort` (function-call → grammar → repair), pipeline del Master, `TracingPort` (§5.4, §7).
- **Piano 6 — Memoria L1.5 + L2 + Context Assembler:** canon ledger, riassunti gerarchici, allocatore di budget token (§6).
- **Piano 7 — Shell Electron:** `app/main` + `app/preload` + sicurezza (contextIsolation/sandbox/safeStorage), contratto IPC tipizzato, CQRS cross-processo (§4, §5.2).
- **Piano 8 — UI Vue:** chat narrativa, scheda PG, **pannello dadi 3D** (`@3d-dice/dice-box`, risultati predeterminati, §11.3), log/journal, gestione provider.
- **Piano 9 — Moduli a tema:** formato dati validato Zod + import/export + **1 modulo curato a mano** per giocare (§8, §11-bis).

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-15-loomn-fase1-piano1-fondamenta-engine.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch di un subagent fresco per task, review tra un task e l'altro, iterazione veloce.

**2. Inline Execution** — esecuzione dei task in questa sessione con checkpoint di review.

**Quale approccio preferisci?**
