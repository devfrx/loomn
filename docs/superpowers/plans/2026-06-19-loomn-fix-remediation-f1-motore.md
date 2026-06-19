# Fix Remediation — Fase 1: Integrità dello stato autorevole del motore — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chiudere ogni percorso in cui un input (AI o utente) fa passare garbage nello stato event-sourced autorevole, e rendere il motore l'unico proprietario della FSM round/turno — risolvendo i finding **I‑01, I‑06, I‑07, I‑12, I‑13, M‑02** a causa radice.

**Architecture:** solo `packages/engine` (logica deterministica) + `packages/shared` (schema Zod al confine IPC). Funzioni pure, TDD classico su ABI Node. **Nessun gate Electron** (engine/shared non caricano la nativa). `@loomn/shared` resta FOGLIA (non importa engine). Principio guida: *il codice è l'arbitro* — la validazione autorevole vive nel motore; lo schema Zod è difesa-in-profondità al confine. Si **riusa** il codice esistente (clamp di `adjustResource`, `roundComplete`/`endTurn` di `encounter.ts`, pattern dei `.transform()` di `domain-schema.ts`) e si segue lo stile vigente.

**Tech stack:** TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Vitest, Zod 3.25. Comandi: `pnpm exec vitest run packages/engine packages/shared` (dalla root), `pnpm -C packages/engine typecheck`, `pnpm -C packages/shared typecheck`. ⚠️ Se i test SQLite (non in questa fase) dessero `NODE_MODULE_VERSION`, `pnpm rebuild:node` — ma engine/shared NON usano better-sqlite3.

---

## Decisioni vincolanti (dal piano-campagna)

- **I‑01:** il motore possiede la FSM. `decide(EndTurn)` **auto-emette `RoundAdvanced`** quando l'ultimo turno chiude il round (coppia atomica `[TurnEnded, RoundAdvanced]`); rifiuta `EndTurn` se il round è già completo e `NextRound` se il round non è completo (throw + 0 eventi).
- **Debt-free / no regressioni di lettura:** le restrizioni che potrebbero rifiutare **dati storici persistiti** NON vanno sul percorso di lettura. Quindi: il clamp `current∈[0,max]` è **solo nel motore** (`decide(AddActor)`, l'arbitro); `.min(1)` su `participants` e i bound dei dadi vanno sullo schema **di comando (input)**, non sull'`encounterSchema`/`itemEffectSchema` di lettura. `.finite()` è sicuro ovunque (JSON non trasporta `Infinity`).

## Conseguenze cross-fase (da gestire nelle fasi indicate — NON in F1)

1. **Self-test / gate (→ F4):** l'auto-advance di I‑01 aggiunge un evento `RoundAdvanced` nello slice EndTurn del self-test (il goblin è l'unico partecipante → EndTurn chiude il round) → la versione finale persistita passa da **7 a 8**. `app/desktop/src/renderer/src/renderer.ts` NON è toccato in F1 (engine+shared) e F1 **non esegue il gate**; la versione attesa (`s0.version === 7` → `=== 8`) va aggiornata nella prima fase che riesegue il gate (**F4**). Annotato qui per non sorprendere.
2. **`next_round` ridondante (→ F3):** con l'auto-advance, il flusso normale non raggiunge mai un round "completo" (EndTurn lo avanza). Il tool AI `next_round` (`packages/ai/src/master-tools.ts:219`) diventa ridondante (resta una capacità di recupero, ma l'AI non ne ha bisogno). **F3** valuti di rimuoverlo (l'AnnotazioneSEED del campaign-plan §10/F3).
3. **"Round successivo" UI ridondante (→ F6):** stessa logica per l'affordance del cockpit e `EncounterPanel.test.ts:89-93`. **F6** rimuova il bottone "Round successivo" (o lo nasconda) e aggiorni quel test.

`NextRound` Command/Event e `RoundAdvanced` **restano** nel motore (l'evento è emesso dall'auto-advance; il Command resta come avanzamento esplicito/recupero). Nessuna rimozione di Command in F1.

---

## File Structure

| File | Responsabilità | Modifica |
|---|---|---|
| `packages/shared/src/domain-schema.ts` | Schema Zod confine IPC/persistenza | `finiteNumber` ovunque (I‑13); bound dadi su `dieGroupSchema` (I‑07 DiD); `.min(1)` su `participants` del **comando** StartEncounter (M‑02) |
| `packages/shared/src/domain-schema.test.ts` | Test schema | nuovi test finite/dadi/participants |
| `packages/engine/src/dice.ts` | `rollExpression` | `MAX_DICE_COUNT`/`MAX_DICE_SIDES` + `assertDieGroup` (I‑07 arbiter) |
| `packages/engine/src/dice.test.ts` | Test dadi | nuovi test di rifiuto |
| `packages/engine/src/resource.ts` | clamp risorse | estrai `clampCurrent`, aggiungi `clampPool` (I‑06) |
| `packages/engine/src/resource.test.ts` | Test risorse | nuovi test `clampPool` |
| `packages/engine/src/condition.ts` | condizioni | `DOWNED_CONDITION_KEY` + `dyingCondition()` (I‑12) |
| `packages/engine/src/condition.test.ts` | Test condizioni | nuovo test factory |
| `packages/engine/src/combat.ts` | `performAttack` | rimuovi blocco `morente` morto (I‑12) |
| `packages/engine/src/combat.test.ts` | Test combat | aggiorna l'asserzione morente |
| `packages/engine/src/events.ts` | `applyEvent` | usa `dyingCondition()` (I‑12) |
| `packages/engine/src/commands.ts` | `decide` | clampPool in AddActor (I‑06); guard StartEncounter vuoto (M‑02); FSM round (I‑01) |
| `packages/engine/src/commands.test.ts` | Test decide | aggiorna EndTurn/NextRound + nuovi test FSM + AddActor clamp + StartEncounter vuoto |

`packages/engine/src/index.ts` ri-esporta già `./resource`/`./condition`/`./dice` con `export *` → i nuovi export (`clampPool`, `DOWNED_CONDITION_KEY`, `dyingCondition`, `MAX_DICE_COUNT`, `MAX_DICE_SIDES`) escono dal barrel automaticamente. **Nessuna modifica al barrel.**

---

## Task 1: I‑13 — `finiteNumber` su tutto `domain-schema` (rifiuta Infinity al confine)

**Files:**
- Modify: `packages/shared/src/domain-schema.ts`
- Test: `packages/shared/src/domain-schema.test.ts`

**Razionale:** `z.number()` accetta `Infinity`/`-Infinity`. Un comando con `Infinity` (la clone strutturata IPC lo trasporta, a differenza di JSON) entra in un evento → `JSON.stringify` lo persiste come `null` → al reload `domainEventSchema.parse` fallisce → stream irreplayabile. `.finite()` chiude il buco al confine. Il tipo inferito resta `number` → i drift guard di compile-time in host restano verdi.

- [ ] **Step 1: Aggiungi i test (falliscono)**

In `packages/shared/src/domain-schema.test.ts`, appendi:

```ts
describe('finiteNumber — i campi numerici rifiutano i non-finiti', () => {
  it('commandSchema rifiuta defenseBase Infinity', () => {
    const res = commandSchema.safeParse({
      type: 'Attack', attackerId: 'a', targetId: 'b',
      defense: 'difesa', defenseBase: Infinity, damageResource: 'hp',
    });
    expect(res.success).toBe(false);
  });

  it('commandSchema rifiuta initiative Infinity in StartEncounter', () => {
    const res = commandSchema.safeParse({
      type: 'StartEncounter', encounterId: 'e',
      participants: [{ actorId: 'a', zone: 'z', initiative: Infinity }],
    });
    expect(res.success).toBe(false);
  });

  it('domainEventSchema rifiuta un amount non-finito', () => {
    const res = domainEventSchema.safeParse({ type: 'DamageApplied', targetId: 'a', resource: 'hp', amount: Infinity });
    expect(res.success).toBe(false);
  });

  it('un valore finito normale resta valido', () => {
    const res = commandSchema.safeParse({
      type: 'Attack', attackerId: 'a', targetId: 'b',
      defense: 'difesa', defenseBase: 12, damageResource: 'hp',
    });
    expect(res.success).toBe(true);
  });
});
```

(Se `commandSchema`/`domainEventSchema` non sono già importati nel file di test, aggiungili all'import esistente da `./domain-schema`.)

- [ ] **Step 2: Esegui — atteso FAIL**

Run: `pnpm exec vitest run packages/shared/src/domain-schema.test.ts`
Atteso: i 3 test di rifiuto FALLISCONO (`z.number()` accetta Infinity), il test "finito" passa.

- [ ] **Step 3: Implementa `finiteNumber` e applicalo**

In `packages/shared/src/domain-schema.ts`, dopo `import { z } from 'zod';` aggiungi:

```ts
/** Numero finito: rifiuta Infinity/-Infinity (e NaN, già rifiutato da z.number()). I campi
 *  numerici di eventi/stato/comandi NON sono mai legittimamente non-finiti; un non-finito al
 *  confine corromperebbe lo stream (JSON.stringify(Infinity) === 'null' -> reparse fallisce). */
const finiteNumber = z.number().finite();
```

Poi sostituisci **ogni** occorrenza di `z.number()` con `finiteNumber` nel file (sono i campi: `dieGroupSchema` count/sides — vedi Task 2 che li stringe ulteriormente —, `dieResultSchema` sides/value, `rollResultFields` modifierTotal/total, `checkResultSchema` dc/margin, `resourcePoolSchema` current/max, `conditionEffectSchema` value/delta, `durationSchema` remaining ×2, `progressionSchema` xp/level, `participantSchema` initiative, `encounterSchema` round/turnIndex, `actorSchema` `z.record(z.string(), z.number())` ×2, `DamageApplied` amount, `ResourceEffectApplied` delta, `modifierSchema` value, `participantInputSchema` initiative, `attackCommandSchema` defenseBase, `applyEffectCommandSchema` bonus). Esempio dei due `z.record`:

```ts
  attributes: z.record(z.string(), finiteNumber),
  skills: z.record(z.string(), finiteNumber),
```

⚠️ NON toccare `z.literal(...)`, `z.string()`, `z.boolean()`, `z.enum(...)`, `z.array(...)`. Solo `z.number()` → `finiteNumber`.

- [ ] **Step 4: Esegui — atteso PASS**

Run: `pnpm exec vitest run packages/shared/src/domain-schema.test.ts`
Atteso: tutti verdi. Poi `pnpm -C packages/shared typecheck` pulito (il tipo inferito resta `number`).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/domain-schema.ts packages/shared/src/domain-schema.test.ts
git commit -m "fix(shared): finiteNumber sui campi numerici di domain-schema (rifiuta Infinity al confine) [I-13]"
```

---

## Task 2: I‑07 — Validazione dadi nel motore (arbiter) + bound nello schema (DiD)

**Files:**
- Modify: `packages/engine/src/dice.ts`
- Test: `packages/engine/src/dice.test.ts`
- Modify: `packages/shared/src/domain-schema.ts` (solo `dieGroupSchema`)
- Test: `packages/shared/src/domain-schema.test.ts`

**Razionale:** `rollExpression` itera `for (i<group.count)` e usa `group.sides` senza vincoli → `count` frazionario/negativo/enorme (es. allucinato dall'AI = `1e8`) produce dadi inesistenti o **freeza il main process**. L'arbitro è il motore: `rollExpression` valida ogni `DieGroup` (interi, count≥1, sides≥2, entro un tetto sano) e lancia (errore reiniettabile, coerente con `requireMember`). Lo schema `dieGroupSchema` aggiunge la stessa barriera al confine IPC.

- [ ] **Step 1: Aggiungi i test del motore (falliscono)**

In `packages/engine/src/dice.test.ts`, appendi dentro `describe('rollExpression', ...)` (o un nuovo describe):

```ts
  it('rifiuta un count non intero', () => {
    expect(() => rollExpression({ dice: [{ count: 1.5, sides: 6 }], modifiers: [], mode: 'effect' }, stubRandom([0.5]))).toThrow(/Numero di dadi/);
  });
  it('rifiuta un count < 1', () => {
    expect(() => rollExpression({ dice: [{ count: 0, sides: 6 }], modifiers: [], mode: 'effect' }, stubRandom([0.5]))).toThrow(/Numero di dadi/);
  });
  it('rifiuta un count oltre il tetto', () => {
    expect(() => rollExpression({ dice: [{ count: 1e8, sides: 6 }], modifiers: [], mode: 'effect' }, stubRandom([0.5]))).toThrow(/Numero di dadi/);
  });
  it('rifiuta sides < 2 e sides non intero', () => {
    expect(() => rollExpression({ dice: [{ count: 1, sides: 1 }], modifiers: [], mode: 'effect' }, stubRandom([0.5]))).toThrow(/Facce/);
    expect(() => rollExpression({ dice: [{ count: 1, sides: 2.5 }], modifiers: [], mode: 'effect' }, stubRandom([0.5]))).toThrow(/Facce/);
  });
  it('un gruppo dadi vuoto (nessun gruppo) resta valido', () => {
    const res = rollExpression({ dice: [], modifiers: [{ value: 3, source: 'x' }], mode: 'effect' }, stubRandom([0.5]));
    expect(res.total).toBe(3);
  });
```

- [ ] **Step 2: Esegui — atteso FAIL**

Run: `pnpm exec vitest run packages/engine/src/dice.test.ts`
Atteso: i test di rifiuto FALLISCONO; i 3 test esistenti + il "vuoto" passano.

- [ ] **Step 3: Implementa la validazione in `dice.ts`**

In `packages/engine/src/dice.ts`, dopo le interface, prima di `rollExpression`, aggiungi:

```ts
/** Tetti sani sui dadi proposti da AI/utente: prevengono il freeze del processo (un count
 *  allucinato = milioni di iterazioni sincrone) e i dadi non-standard. Generosi per qualsiasi
 *  tiro realistico. Lo schema dieGroupSchema (@loomn/shared) li rispecchia come difesa al confine. */
export const MAX_DICE_COUNT = 100;
export const MAX_DICE_SIDES = 1000;

function assertDieGroup(group: DieGroup): void {
  if (!Number.isInteger(group.count) || group.count < 1 || group.count > MAX_DICE_COUNT) {
    throw new Error(`Numero di dadi non valido: ${group.count} (atteso intero 1..${MAX_DICE_COUNT})`);
  }
  if (!Number.isInteger(group.sides) || group.sides < 2 || group.sides > MAX_DICE_SIDES) {
    throw new Error(`Facce del dado non valide: ${group.sides} (atteso intero 2..${MAX_DICE_SIDES})`);
  }
}
```

e in `rollExpression` chiama `assertDieGroup(group)` come prima riga del ciclo:

```ts
  for (const group of expr.dice) {
    assertDieGroup(group);
    for (let i = 0; i < group.count; i++) {
```

- [ ] **Step 4: Aggiungi i test schema (shared)**

In `packages/shared/src/domain-schema.test.ts`, appendi:

```ts
describe('dieGroupSchema — vincoli su count/sides (difesa al confine)', () => {
  it('ApplyEffect rifiuta dadi con count frazionario o sides < 2', () => {
    expect(commandSchema.safeParse({ type: 'ApplyEffect', targetId: 't', resource: 'hp', direction: 'restore', dice: [{ count: 1.5, sides: 6 }] }).success).toBe(false);
    expect(commandSchema.safeParse({ type: 'ApplyEffect', targetId: 't', resource: 'hp', direction: 'restore', dice: [{ count: 1, sides: 1 }] }).success).toBe(false);
  });
  it('ApplyEffect accetta dadi validi', () => {
    expect(commandSchema.safeParse({ type: 'ApplyEffect', targetId: 't', resource: 'hp', direction: 'restore', dice: [{ count: 2, sides: 6 }] }).success).toBe(true);
  });
});
```

- [ ] **Step 5: Stringi `dieGroupSchema` (shared)**

In `packages/shared/src/domain-schema.ts`, dopo `const finiteNumber = ...` aggiungi i bound locali (shared è FOGLIA, non importa engine → rispecchia i tetti del motore, come fa per DIFFICULTIES):

```ts
// Rispecchiano MAX_DICE_COUNT/MAX_DICE_SIDES di @loomn/engine (shared e FOGLIA, non importa engine).
// L arbitro autorevole resta rollExpression nel motore; qui e difesa-in-profondita al confine IPC.
const MAX_DICE_COUNT = 100;
const MAX_DICE_SIDES = 1000;
```

e cambia `dieGroupSchema` (i campi `count`/`sides`; il `.transform()` resta invariato):

```ts
const dieGroupSchema = z
  .object({
    count: finiteNumber.int().min(1).max(MAX_DICE_COUNT),
    sides: finiteNumber.int().min(2).max(MAX_DICE_SIDES),
    tag: z.string().optional(),
  })
  .transform((o) =>
    o.tag === undefined
      ? { count: o.count, sides: o.sides }
      : { count: o.count, sides: o.sides, tag: o.tag },
  );
```

- [ ] **Step 6: Esegui — atteso PASS**

Run: `pnpm exec vitest run packages/engine/src/dice.test.ts packages/shared/src/domain-schema.test.ts`
Atteso: tutti verdi (i tiri esistenti usano count 1-2 / sides 4-20 → passano). Typecheck engine+shared puliti.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/dice.ts packages/engine/src/dice.test.ts packages/shared/src/domain-schema.ts packages/shared/src/domain-schema.test.ts
git commit -m "fix(engine): rollExpression valida i DieGroup (interi, count>=1, sides>=2, tetto); dieGroupSchema rispecchia i bound [I-07]"
```

---

## Task 3: I‑06 — `decide(AddActor)` clampa le risorse nello stato (l'arbitro alla creazione)

**Files:**
- Modify: `packages/engine/src/resource.ts`
- Test: `packages/engine/src/resource.test.ts`
- Modify: `packages/engine/src/commands.ts`
- Test: `packages/engine/src/commands.test.ts`

**Razionale:** l'invariante `current∈[0,max]` è imposto da `adjustResource` su ogni mutazione, ma **non** alla creazione (`decide(AddActor)` fa uno spread nudo). Un `AddActor` con `{current:999,max:10}` entra corrotto nello stato. Fix: estrai `clampCurrent` (DRY con `adjustResource`), aggiungi `clampPool`, applicalo in `decide(AddActor)`. **NON** si tocca lo schema di lettura (`resourcePoolSchema`) per non rifiutare pool storici: l'arbitro è il motore.

- [ ] **Step 1: Test `clampPool` (falliscono)**

In `packages/engine/src/resource.test.ts` (creane uno se assente, con lo stile di `dice.test.ts`), aggiungi:

```ts
import { describe, it, expect } from 'vitest';
import { clampPool } from './resource';

describe('clampPool', () => {
  it('clampa current sopra max', () => {
    expect(clampPool({ current: 999, max: 10 })).toEqual({ current: 10, max: 10 });
  });
  it('clampa current negativo a 0', () => {
    expect(clampPool({ current: -5, max: 10 })).toEqual({ current: 0, max: 10 });
  });
  it('lascia invariato un pool valido', () => {
    expect(clampPool({ current: 7, max: 10 })).toEqual({ current: 7, max: 10 });
  });
  it('lancia su max negativo o non finito', () => {
    expect(() => clampPool({ current: 1, max: -1 })).toThrow(/max/);
    expect(() => clampPool({ current: 1, max: Infinity })).toThrow(/max/);
  });
});
```

(Se `resource.test.ts` esiste già, appendi il `describe('clampPool', ...)` e aggiungi l'import di `clampPool` all'import esistente.)

- [ ] **Step 2: Esegui — atteso FAIL**

Run: `pnpm exec vitest run packages/engine/src/resource.test.ts`
Atteso: FAIL (`clampPool` non esiste).

- [ ] **Step 3: Implementa `clampCurrent` + `clampPool` e DRY in `adjustResource`**

In `packages/engine/src/resource.ts`, sostituisci il corpo con:

```ts
import type { Actor, ResourcePool } from './actor';

/** Clampa un valore corrente nell intervallo [0, max]. Punto unico dell invariante di risorsa. */
function clampCurrent(current: number, max: number): number {
  return Math.max(0, Math.min(max, current));
}

/** Normalizza un pool: current clampato in [0, max]. Lancia se max e negativo o non finito
 *  (garbage che non puo entrare nello stato). Usato alla CREAZIONE dell attore (decide AddActor),
 *  dove lo spread del vocabolario+input non e altrimenti clampato. Funzione pura. */
export function clampPool(pool: ResourcePool): ResourcePool {
  if (!Number.isFinite(pool.max) || pool.max < 0) {
    throw new Error(`Risorsa con max non valido: ${pool.max}`);
  }
  return { current: clampCurrent(pool.current, pool.max), max: pool.max };
}

/** Aggiusta una risorsa di `delta`, clampando `current` in [0, max].
 *  Lancia se la risorsa non esiste (precondizione violata). Funzione pura. */
export function adjustResource(actor: Actor, resource: string, delta: number): Actor {
  const pool = actor.resources[resource];
  if (pool === undefined) {
    throw new Error(`Risorsa sconosciuta: ${resource}`);
  }
  const next = clampCurrent(pool.current + delta, pool.max);
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

- [ ] **Step 4: Applica `clampPool` in `decide(AddActor)`**

In `packages/engine/src/commands.ts`, aggiungi `clampPool` all'import da `./resource` (oggi `commands.ts` non importa `resource` direttamente — aggiungi l'import):

```ts
import { clampPool } from './resource';
```

e nel `case 'AddActor'` sostituisci la riga dello spread (oggi `const resources = { ...vocab.defaultResources, ...command.actor.resources };` seguita dal return) con il clamp di ogni pool:

```ts
      // Auto-fill combat-ready: le risorse mancanti dal template; quelle fornite sovrascrivono.
      // clampPool impone l invariante current in [0,max] anche alla CREAZIONE (l arbitro: nessun
      // garbage nello stato), come adjustResource fa su ogni mutazione successiva.
      const merged = { ...vocab.defaultResources, ...command.actor.resources };
      const resources = Object.fromEntries(
        Object.entries(merged).map(([k, pool]) => [k, clampPool(pool)]),
      );
      return [{ type: 'ActorAdded', actor: { ...command.actor, resources } }];
```

- [ ] **Step 5: Test in `commands.test.ts`**

Nel `describe('decide(AddActor) — vocabolario e auto-fill', ...)` di `packages/engine/src/commands.test.ts`, appendi:

```ts
  it('clampa una risorsa fornita fuori range (current > max)', () => {
    const events = decide(initialState, { type: 'AddActor', actor: npc({ resources: { hp: { current: 999, max: 10 } } }) }, stub([0.5]), VOCAB);
    const added = events[0];
    if (added?.type !== 'ActorAdded') throw new Error('atteso ActorAdded');
    expect(added.actor.resources.hp).toEqual({ current: 10, max: 10 });
  });
  it('clampa una risorsa con current negativo a 0', () => {
    const events = decide(initialState, { type: 'AddActor', actor: npc({ resources: { hp: { current: -5, max: 10 } } }) }, stub([0.5]), VOCAB);
    const added = events[0];
    if (added?.type !== 'ActorAdded') throw new Error('atteso ActorAdded');
    expect(added.actor.resources.hp).toEqual({ current: 0, max: 10 });
  });
```

- [ ] **Step 6: Esegui — atteso PASS**

Run: `pnpm exec vitest run packages/engine/src/resource.test.ts packages/engine/src/commands.test.ts`
Atteso: verdi (i test AddActor esistenti usano pool validi → invariati). Typecheck engine pulito.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/resource.ts packages/engine/src/resource.test.ts packages/engine/src/commands.ts packages/engine/src/commands.test.ts
git commit -m "fix(engine): decide(AddActor) clampa le risorse alla creazione via clampPool (invariante [0,max] anche al boundary di creazione) [I-06]"
```

---

## Task 4: M‑02 — `StartEncounter` rifiuta `participants` vuoto

**Files:**
- Modify: `packages/engine/src/commands.ts`
- Test: `packages/engine/src/commands.test.ts`
- Modify: `packages/shared/src/domain-schema.ts` (solo il `participants` del comando StartEncounter)
- Test: `packages/shared/src/domain-schema.test.ts`

**Razionale:** uno scontro a 0 partecipanti (`roundComplete` subito true, `currentParticipant` lancerebbe) è uno stato incoerente che il motore accetta. Il motore è l'arbitro → rifiuta. `.min(1)` sul **comando** (input) è sicuro; l'`encounterSchema` di **lettura** resta permissivo (non rifiutare scontri storici).

- [ ] **Step 1: Test (falliscono)**

In `packages/engine/src/commands.test.ts`, nel `describe('decide StartEncounter', ...)`, appendi:

```ts
  it('lancia su participants vuoto, senza eventi', () => {
    const s = withActors(actor('eroe'));
    expect(() => decide(s, { type: 'StartEncounter', encounterId: 'e', participants: [] }, rng, TEST_RULESET)).toThrow('almeno un partecipante');
  });
```

In `packages/shared/src/domain-schema.test.ts`, appendi:

```ts
describe('commandSchema — StartEncounter richiede partecipanti', () => {
  it('rifiuta participants vuoto', () => {
    expect(commandSchema.safeParse({ type: 'StartEncounter', encounterId: 'e', participants: [] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui — atteso FAIL**

Run: `pnpm exec vitest run packages/engine/src/commands.test.ts packages/shared/src/domain-schema.test.ts`
Atteso: i 2 nuovi test FALLISCONO.

- [ ] **Step 3: Guard nel motore + `.min(1)` nello schema di comando**

In `packages/engine/src/commands.ts`, nel `case 'StartEncounter'`, aggiungi il guard come PRIMA istruzione (prima del ciclo di validazione attori — rifiuto atomico, 0 eventi):

```ts
    case 'StartEncounter': {
      if (command.participants.length === 0) {
        throw new Error('Uno scontro richiede almeno un partecipante');
      }
      for (const p of command.participants) {
```

In `packages/shared/src/domain-schema.ts`, nel `commandSchema`, l'arm StartEncounter: `participants: z.array(participantInputSchema)` → `participants: z.array(participantInputSchema).min(1)`. **NON** toccare `encounterSchema.participants` (lettura).

- [ ] **Step 4: Esegui — atteso PASS**

Run: `pnpm exec vitest run packages/engine/src/commands.test.ts packages/shared/src/domain-schema.test.ts`
Atteso: verdi.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/commands.ts packages/engine/src/commands.test.ts packages/shared/src/domain-schema.ts packages/shared/src/domain-schema.test.ts
git commit -m "fix(engine): decide(StartEncounter) rifiuta uno scontro senza partecipanti; commandSchema .min(1) [M-02]"
```

---

## Task 5: I‑01 — Il motore possiede la FSM round/turno (auto-advance + rifiuti)

**Files:**
- Modify: `packages/engine/src/commands.ts`
- Test: `packages/engine/src/commands.test.ts` (riscrive i test happy-path EndTurn/NextRound + nuovi)

**Razionale:** `decide(EndTurn)`/`decide(NextRound)` sono incondizionati → `turnIndex` può andare in overflow e il round può avanzare saltando partecipanti. Decisione: il motore possiede la FSM. `EndTurn` auto-avanza il round quando l'ultimo turno lo chiude e rifiuta se il round è già completo; `NextRound` rifiuta se il round non è completo. Si **riusano** `endTurn`/`roundComplete` di `encounter.ts`. `applyEvent` resta invariato (rigioca `[TurnEnded, RoundAdvanced]` correttamente).

- [ ] **Step 1: Riscrivi i test EndTurn/NextRound (falliscono col codice nuovo atteso)**

In `packages/engine/src/commands.test.ts`, **sostituisci** l'intero `describe('decide EndTurn e NextRound', ...)` (righe ~87-109) con:

```ts
describe('decide EndTurn e NextRound — FSM round/turno (il motore e l arbitro)', () => {
  // Scontro a 2 partecipanti, turnIndex pilotabile, in fase combat.
  function enc(turnIndex: number): GameState {
    let s = withActors(actor('eroe'), actor('goblin'));
    s = applyEvent(s, {
      type: 'EncounterStarted',
      encounter: {
        id: 'e',
        participants: [
          { actorId: 'eroe', zone: 'a', initiative: 10, actedThisRound: false },
          { actorId: 'goblin', zone: 'a', initiative: 5, actedThisRound: false },
        ],
        round: 1,
        turnIndex,
      },
    });
    return applyEvent(s, { type: 'PhaseChanged', from: s.phase, to: 'combat' });
  }

  it('EndTurn su un partecipante non-ultimo emette solo TurnEnded', () => {
    expect(decide(enc(0), { type: 'EndTurn' }, rng, TEST_RULESET)).toEqual([{ type: 'TurnEnded' }]);
  });

  it('EndTurn sull ultimo partecipante auto-avanza il round: [TurnEnded, RoundAdvanced]', () => {
    expect(decide(enc(1), { type: 'EndTurn' }, rng, TEST_RULESET)).toEqual([
      { type: 'TurnEnded' },
      { type: 'RoundAdvanced' },
    ]);
  });

  it('ciclo decide->apply sull ultimo turno: round+1, turnIndex 0, actedThisRound azzerati', () => {
    let s = enc(1);
    for (const e of decide(s, { type: 'EndTurn' }, rng, TEST_RULESET)) s = applyEvent(s, e);
    expect(s.encounter?.round).toBe(2);
    expect(s.encounter?.turnIndex).toBe(0);
    expect(s.encounter?.participants.every((p) => p.actedThisRound === false)).toBe(true);
  });

  it('EndTurn quando il round e gia completo e illegale', () => {
    // turnIndex === participants.length (stato raggiungibile solo da dati storici col vecchio bug)
    expect(() => decide(enc(2), { type: 'EndTurn' }, rng, TEST_RULESET)).toThrow('Round gia completo');
  });

  it('NextRound a meta round e illegale (throw, 0 eventi)', () => {
    expect(() => decide(enc(1), { type: 'NextRound' }, rng, TEST_RULESET)).toThrow('Round non ancora completo');
  });

  it('NextRound a round completo emette RoundAdvanced (recupero esplicito)', () => {
    expect(decide(enc(2), { type: 'NextRound' }, rng, TEST_RULESET)).toEqual([{ type: 'RoundAdvanced' }]);
  });

  it('EndTurn lancia fuori dalla fase combat', () => {
    expect(() => decide(initialState, { type: 'EndTurn' }, rng, TEST_RULESET)).toThrow('non disponibile in fase exploration');
  });

  it('NextRound lancia fuori dalla fase combat', () => {
    expect(() => decide(initialState, { type: 'NextRound' }, rng, TEST_RULESET)).toThrow('non disponibile in fase exploration');
  });
});
```

- [ ] **Step 2: Esegui — atteso FAIL**

Run: `pnpm exec vitest run packages/engine/src/commands.test.ts`
Atteso: i test di auto-advance/rifiuto FALLISCONO (il codice attuale emette sempre 1 evento, non rifiuta).

- [ ] **Step 3: Implementa la FSM in `decide`**

In `packages/engine/src/commands.ts`, aggiorna l'import da `./encounter` aggiungendo `endTurn` e `roundComplete`:

```ts
import { createEncounter, endTurn, roundComplete, type ParticipantInput } from './encounter';
```

Sostituisci i due `case` incondizionati (righe ~123-126):

```ts
    case 'EndTurn': {
      const enc = state.encounter; // il gate garantisce phase==='combat' => enc!==null
      if (enc === null) {
        throw new Error('Nessuno scontro attivo'); // difesa in profondita (invariante mai violata)
      }
      if (roundComplete(enc)) {
        throw new Error('Round gia completo: avanza al round successivo');
      }
      // Il motore possiede la FSM: se questo turno chiude il round, auto-emette RoundAdvanced
      // (coppia atomica) cosi il round non resta mai in stato "completo" e nessun partecipante
      // viene saltato. applyEvent rigioca [TurnEnded, RoundAdvanced] in ordine.
      const after = endTurn(enc);
      return roundComplete(after)
        ? [{ type: 'TurnEnded' }, { type: 'RoundAdvanced' }]
        : [{ type: 'TurnEnded' }];
    }
    case 'NextRound': {
      const enc = state.encounter;
      if (enc === null) {
        throw new Error('Nessuno scontro attivo');
      }
      if (!roundComplete(enc)) {
        throw new Error('Round non ancora completo: tutti i partecipanti devono agire prima di avanzare');
      }
      return [{ type: 'RoundAdvanced' }];
    }
```

- [ ] **Step 4: Esegui — atteso PASS**

Run: `pnpm exec vitest run packages/engine/src/commands.test.ts`
Atteso: verdi. Poi l'intera suite engine+shared: `pnpm exec vitest run packages/engine packages/shared` (controlla che nessun altro test del motore regredisca — `events.test.ts` usa `applyEvent` direttamente e resta invariato).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/commands.ts packages/engine/src/commands.test.ts
git commit -m "fix(engine): decide possiede la FSM round/turno (EndTurn auto-avanza, rifiuta EndTurn/NextRound illegali) [I-01]"
```

---

## Task 6: I‑12 — Single-source `DOWNED_CONDITION_KEY` + rimozione del blocco `morente` morto

**Files:**
- Modify: `packages/engine/src/condition.ts`
- Test: `packages/engine/src/condition.test.ts`
- Modify: `packages/engine/src/events.ts`
- Modify: `packages/engine/src/combat.ts`
- Test: `packages/engine/src/combat.test.ts`

**Razionale:** il literal `'morente'` è triplicato (combat.ts, events.ts, renderer). Nel motore: `decide(Attack)` scarta `result.target` di `performAttack` ed emette `ActorDowned` → la condizione è materializzata SOLO da `applyEvent(ActorDowned)`; il blocco in `combat.ts:64-71` è **morto in produzione**. Fix: single-source `DOWNED_CONDITION_KEY`/`dyingCondition()` in `condition.ts` (la casa delle condizioni), usato da `events.ts`; rimozione del blocco morto in `combat.ts` (single-responsibility: combat fa la matematica, l'evento materializza la condizione). La metà cross-package (renderer `encounter-view.ts:5`) è **F6** (consumare la chiave via il DTO `get-ruleset` esteso in F4, o un drift guard).

- [ ] **Step 1: Test della factory (fallisce)**

Crea/appendi `packages/engine/src/condition.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DOWNED_CONDITION_KEY, dyingCondition } from './condition';

describe('dyingCondition / DOWNED_CONDITION_KEY', () => {
  it('la chiave e morente', () => {
    expect(DOWNED_CONDITION_KEY).toBe('morente');
  });
  it('la factory produce la condizione morente permanente', () => {
    expect(dyingCondition()).toEqual({ key: 'morente', source: 'combat', effects: [], duration: { kind: 'permanent' } });
  });
});
```

(Se `condition.test.ts` esiste già, appendi questo `describe` e aggiungi l'import.)

- [ ] **Step 2: Esegui — atteso FAIL**

Run: `pnpm exec vitest run packages/engine/src/condition.test.ts`
Atteso: FAIL (gli export non esistono).

- [ ] **Step 3: Single-source in `condition.ts`**

In `packages/engine/src/condition.ts`, dopo gli import, aggiungi:

```ts
/** Chiave canonica della condizione "a terra" (morente). Single-source nel motore: referenziata
 *  da applyEvent(ActorDowned). Esposta dal barrel; il renderer la consuma via il DTO get-ruleset
 *  (non importa engine per il dominio). Sostituisce i literal sparsi (rischio di drift). */
export const DOWNED_CONDITION_KEY = 'morente';

/** Costruisce la condizione "morente" permanente applicata a chi va a 0 sulla risorsa di combat. */
export function dyingCondition(): Condition {
  return { key: DOWNED_CONDITION_KEY, source: 'combat', effects: [], duration: { kind: 'permanent' } };
}
```

(`Condition` è già importato in `condition.ts` da `./actor`.)

- [ ] **Step 4: Usa il single-source in `events.ts`**

In `packages/engine/src/events.ts`, aggiungi all'import da `./condition`:

```ts
import { addCondition, DOWNED_CONDITION_KEY, dyingCondition } from './condition';
```

e nel `case 'ActorDowned'` sostituisci il literal e l'oggetto inline:

```ts
    case 'ActorDowned': {
      const actor = requireActor(state, event.actorId);
      if (actor.conditions.some((c) => c.key === DOWNED_CONDITION_KEY)) {
        return bumped;
      }
      const downed = addCondition(actor, dyingCondition());
      return { ...bumped, actors: { ...state.actors, [event.actorId]: downed } };
    }
```

- [ ] **Step 5: Rimuovi il blocco morto in `combat.ts`**

In `packages/engine/src/combat.ts`:
1. rimuovi `addCondition` dall'import (riga 8): `import { equippedItems, collectItemDice, defenseValue } from './item';` resta, ma cancella la riga `import { addCondition } from './condition';`.
2. aggiorna il JSDoc (righe 30-34): rimuovi la nota "segna 'morente'" e il segnaposto pre-ES — `performAttack` fa la matematica; la condizione la materializza `applyEvent(ActorDowned)`.
3. sostituisci il corpo dopo il calcolo del danno (righe 62-73) con:

```ts
  const target = adjustResource(input.target, input.damageResource, -damage);
  const downed = isDepleted(target, input.damageResource);

  // La condizione 'morente' NON viene aggiunta qui: decide(Attack) scarta result.target ed emette
  // ActorDowned -> applyEvent(ActorDowned) e l unico punto che materializza la condizione
  // (single-source, single-responsibility). performAttack ritorna il bersaglio col danno applicato.
  return { check, hit: true, damage, target, downed };
```

- [ ] **Step 6: Aggiorna `combat.test.ts`**

In `packages/engine/src/combat.test.ts`, nel test "colpo riuscito: applica il danno e segna morente a 0 HP" (riga ~74), **rimuovi** l'asserzione sulla condizione su `result.target` e documenta il nuovo contratto:

```ts
    expect(res.downed).toBe(true);
    // La condizione 'morente' e materializzata da applyEvent(ActorDowned), non da performAttack
    // (single-source in events.ts; coperto da events.test.ts "ActorDowned aggiunge morente").
    expect(res.target.conditions.some((c) => c.key === 'morente')).toBe(false);
```

(Opzionale: rinomina il titolo del test in "colpo riuscito: applica il danno e segna downed a 0 HP".)

- [ ] **Step 7: Esegui — atteso PASS**

Run: `pnpm exec vitest run packages/engine/src/condition.test.ts packages/engine/src/combat.test.ts packages/engine/src/events.test.ts`
Atteso: verdi. `events.test.ts` "ActorDowned aggiunge morente una sola volta" resta verde (il valore della chiave è ancora `'morente'`). Typecheck engine pulito (l'import `addCondition` rimosso da combat.ts non lascia un simbolo inutilizzato).

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/condition.ts packages/engine/src/condition.test.ts packages/engine/src/events.ts packages/engine/src/combat.ts packages/engine/src/combat.test.ts
git commit -m "fix(engine): single-source DOWNED_CONDITION_KEY/dyingCondition; rimuove il blocco morente morto in combat.ts [I-12]"
```

---

## Verifica finale della fase

- [ ] **Suite engine+shared verde:**

Run: `pnpm exec vitest run packages/engine packages/shared`
Atteso: tutti verdi (i nuovi test + gli esistenti aggiornati).

- [ ] **Typecheck pulito (incluso host, per i drift guard):**

Run: `pnpm -r typecheck`
Atteso: pulito su tutti i 6 progetti. In particolare host (`_eventForward`/`_stateForward`/`commandSchema` drift guard) resta verde perché i tipi inferiti da `finiteNumber`/`.int().min().max()`/`.min(1)` restano `number`/array (nessun cambio di tipo).

- [ ] **Suite completa (sanity cross-package):**

Run: `pnpm test`
Atteso: verde. ⚠️ Se i test SQLite (memory/host) danno `NODE_MODULE_VERSION 146 ... 137`, è il flip ABI (sessione app dell'utente) → `pnpm rebuild:node`, poi ri-lancia. NB: il **self-test/gate Electron NON è in `pnpm test`** → la conseguenza versione 7→8 (vedi sopra) non emerge qui; è gestita in F4.

---

## Self-Review (controllo del piano contro lo spec = report d'audit)

1. **Copertura:** I‑01 (Task 5) · I‑06 (Task 3) · I‑07 (Task 2, arbiter+DiD) · I‑12 (Task 6, metà engine; metà renderer → F6) · I‑13 (Task 1) · M‑02 (Task 4). ✅ Tutti i 6 finding di F1.
2. **Causa radice / no debiti:** la validazione autorevole vive nel motore (`rollExpression`, `clampPool`, FSM in `decide`); lo schema è DiD; nessuna pezza. DRY: `clampCurrent` condiviso, `dyingCondition()` single-source, riuso di `endTurn`/`roundComplete`. ✅
3. **No regressioni di lettura:** clamp solo nel motore; `.min(1)`/bound dadi sul **comando**; `.finite()` sicuro su JSON. `encounterSchema`/`resourcePoolSchema` di lettura NON ristretti → i dati storici si caricano. ✅
4. **Adatto al futuro:** I‑12 single-source de-rischia il combat di movimento-zona; clamp/FSM/dadi sono fondamenta su cui Inventario/multi-campagna costruiscono; `DOWNED_CONDITION_KEY` esportato pronto per il DTO ruleset (F4/F6). ✅
5. **Ripple gestiti:** test EndTurn/NextRound riscritti; `combat.test.ts` aggiornato; conseguenze self-test(→F4)/next_round(→F3)/"Round successivo"(→F6) annotate, NON in F1. ✅
6. **No placeholder:** ogni step ha codice completo, comandi e output atteso. ✅
7. **Stile/architettura esistenti:** guard difensivi `enc === null` come `EndEncounter`; errori reiniettabili come `requireMember`; `Object.fromEntries`/spread idiomatici; commit conventional. `shared` resta FOGLIA. ✅

---

## Execution Handoff

Piano F1 salvato in `docs/superpowers/plans/2026-06-19-loomn-fix-remediation-f1-motore.md`. Due opzioni di esecuzione:

1. **Subagent-Driven (consigliato)** — un subagent per task (1→6), incollando il testo completo del task; spec-review + code-quality-review per task; final review opus del branch `fix/remediation-f1-motore`; poi `finishing-a-development-branch` (merge ff in main, `pnpm test`, push). Mi fermo prima di F2 per il tuo check.
2. **Inline** — eseguo i 6 task in questa sessione a checkpoint.

Quale approccio?
