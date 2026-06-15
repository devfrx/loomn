# Loomn — Fase 1 / Piano 6: Persistenza (EventStore SQLite + schemi Zod)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistere lo stream di eventi del contesto Campaign/World su SQLite implementando la **stessa porta `EventStore`** del Piano 5, con validazione Zod al confine di lettura (pacchetto `@loomn/shared`), snapshot persistiti, e una **suite di conformità condivisa** che gira verde sia su `createInMemoryEventStore` (engine) sia su `createSqliteEventStore` (memory).

**Architecture:** Due nuovi pacchetti. `@loomn/shared`: schemi Zod del grafo `DomainEvent`/`GameState` (unica fonte di validazione, spec §4/§12). `@loomn/memory`: adapter SQLite via **Drizzle ORM + better-sqlite3** (driver **sincrono**, perché la porta `EventStore` del Piano 5 è sincrona — nessuna modifica alla porta). `append` in transazione con concorrenza ottimistica (`ConcurrencyError` riusata dall engine); `load` deserializza e **valida con Zod** (il DB su disco è un confine non fidato). Snapshot su tabella dedicata. La conformità in-memory↔SQLite è il *contract test* dello spec §9. **Dipendenze:** `memory → engine`, `memory → shared`, `engine → shared` (shared resta foglia, non importa engine). TDD rigoroso.

**Tech Stack:** TypeScript (strict: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), Vitest, Zod 3, Drizzle ORM (`drizzle-orm/better-sqlite3`), better-sqlite3 11 (binario prebuilt), migrazioni Drizzle (file SQL deterministici + `migrate()`).

---

## Riferimenti allo spec

Implementa, dello spec [2026-06-15-simulatore-campagne-ai-design.md](../specs/2026-06-15-simulatore-campagne-ai-design.md):
- §4 pacchetto `memory` (Drizzle + SQLite) e pacchetto `shared` (schemi Zod = unica fonte);
- §4 regola di dipendenza unidirezionale `ai/memory/content → engine → shared`;
- §4 / §12 **validazione Zod ai confini** (non fidarsi di JSON esterni / persistiti);
- §5.1 / §5.6 event sourcing + concorrenza ottimistica (`expectedVersion`), già introdotti nel Piano 5: qui si persiste lo stream;
- §6.3 persistenza offline-first SQLite + snapshot rigenerabili dallo stream;
- §9 **contract test condivisi**: la stessa suite verde su ogni adattatore `Repository` (qui: in-memory ↔ SQLite).

**Fuori ambito (piani successivi):**
- Proiezioni a strati L1/L1.5/L2 e Context Assembler → **Piano 8** (lì entra anche `drizzle-kit` con le migrazioni *generate* per gli schemi relazionali che evolvono).
- `drizzle-kit` come tooling di migrazione: qui la migrazione è **una sola, frozen** (2 tabelle append-only), quindi è scritta a mano in modo deterministico e applicata con `migrate()`; introdurre `drizzle-kit generate`/`diff` ora sarebbe tooling non ripagato (verificato: `drizzle-kit@0.30` è incompatibile con `drizzle-orm@0.38` e fallisce — un motivo in più per rimandarlo a quando serve davvero).
- Upcasting/versionamento dei payload degli eventi (rimandato; gli eventi sono ancora a versione singola).
- Meta degli eventi (timestamp/cause) → richiede un `Clock` iniettato, lo aggiunge il layer app (**Piano 9**); l engine e la persistenza restano puri.
- Hardening della copia difensiva di `load()` dello store **in-memory** (engine): è un concern dell engine, non di questo piano (gli eventi sono immutabili per contratto). La proprietà di isolamento viene invece **garantita e testata per lo store SQLite** (Task 5), che ri-deserializza a ogni `load()`.

**Prerequisito:** Piani 1-5 mergiati in `main` (`@loomn/engine`; `pnpm test` → **98 verdi**, `pnpm typecheck` pulito). Lavorare su un **branch dedicato**, non su `main`. Toolchain: Node v24.9.0, pnpm 9.12.0 (già installati). **`better-sqlite3@^12.10.1`** si installa con binario prebuilt su Windows/Node 24 sotto pnpm (NB as-built: la 11.x NON ha prebuilt per Node 24 ABI 137 → il build da sorgente fallisce senza ClangCL; la 12.x ha il prebuilt, API identica).

---

## Struttura dei file (questo piano)

```
packages/
├─ shared/                         ← NUOVO pacchetto @loomn/shared
│  ├─ package.json                 ← name @loomn/shared, dep: zod
│  ├─ tsconfig.json                ← estende ../../tsconfig.base.json
│  └─ src/
│     ├─ domain-schema.ts          ← schemi Zod di DomainEvent + GameState (cast-free)
│     ├─ index.ts                  ← barrel
│     └─ domain-schema.test.ts
│
└─ memory/                         ← NUOVO pacchetto @loomn/memory
   ├─ package.json                 ← deps: @loomn/engine, @loomn/shared, better-sqlite3, drizzle-orm, zod
   ├─ tsconfig.json
   ├─ migrations/
   │  ├─ 0000_init.sql             ← CREATE TABLE events + snapshots (deterministico)
   │  └─ meta/_journal.json        ← journal del migratore Drizzle
   └─ src/
      ├─ schema.ts                 ← tabelle Drizzle (events, snapshots)
      ├─ db.ts                     ← openDatabase(path): apre + migra + drizzle
      ├─ db.test.ts
      ├─ event-store-contract.ts   ← runEventStoreContract(label, makeStore): suite condivisa
      ├─ event-store-contract.test.ts ← gira la suite su in-memory e SQLite
      ├─ sqlite-event-store.ts     ← createSqliteEventStore (porta EventStore + snapshot + close)
      ├─ sqlite-event-store.test.ts ← test specifici SQLite (persistenza, isolamento, snapshot, Zod)
      └─ index.ts                  ← barrel
```

**Disciplina di scope (OBBLIGATORIA, house rule #1):**
- Ogni task modifica/crea SOLO i file elencati in quel task.
- **Creare** i `package.json`/`tsconfig.json` dei **nuovi** pacchetti (`shared`, `memory`) è in-ambito e necessario.
- **NON modificare** `package.json` di root, `tsconfig.base.json`, `vitest.config.ts`, né `packages/engine/**`. **NON** creare un `tsconfig.json` di root, **NON** aggiungere `composite`/project references. `pnpm-workspace.yaml` globba già `packages/*` → **non va toccato**.
- `pnpm-lock.yaml` **cambierà** a seguito di `pnpm install` (aggiunta delle dipendenze): è atteso e va incluso nel commit del task che lo modifica.
- `git status --short` prima di ogni commit deve mostrare **solo** i file previsti (più `pnpm-lock.yaml` nei task con install). Se sembra servire un cambio di build-config oltre a questo, **FERMARSI** e segnalarlo.

**Grafo dipendenze (aciclico):** `shared` (foglia, solo zod) ← `memory`; `engine` ← `memory`. `shared` **non** importa `engine`. Nessun modulo dell engine importa `memory`/`shared`. La suite di conformità vive in `memory` e importa `createInMemoryEventStore` (riferimento) da `@loomn/engine` + `createSqliteEventStore` da sé: l engine resta intatto.

---

## Decisioni di design (punti aperti del HANDOFF §7, risolti) + evidenze empiriche

Le tre decisioni aperte sono state risolte verso la **soluzione più professionale e priva di debiti** (scelta esplicita dell utente), cioè l architettura dichiarata nello spec, e ogni scelta tecnica è stata **verificata empiricamente** (house rule #3) prima di scrivere il piano.

1. **EventStore sincrono.** La porta del Piano 5 è sincrona ed è già mergiata: renderla async romperebbe codice esistente e l idea stessa del contract test. Driver **better-sqlite3@^12.10.1** (sincrono; la 11.x non ha prebuilt per Node 24 sotto pnpm → si è usata la 12.x, API identica). *Verificato:* installa con binario prebuilt su Win/Node 24; transazione sincrona Drizzle esegue **rollback e rilancia** l errore (così `ConcurrencyError` si propaga e l append in conflitto non lascia scritture parziali).
2. **`@loomn/shared` + Zod ora** (non rimandato). Lo spec vuole gli schemi Zod come unica fonte di validazione ai confini; il DB su disco letto a runtime è un confine non fidato. *Verificato:* gli schemi sono **cast-free** — usando `.transform()` sui (soli 4) campi opzionali del grafo (`DieGroup.tag`, `DieResult.tag`, `ConditionEffect.appliesTo`, `ItemEffect.appliesTo`) l output type è exact-optional e `z.infer<typeof domainEventSchema>`/`gameStateSchema` risultano **bidirezionalmente assegnabili** ai tipi reali dell engine sotto `exactOptionalPropertyTypes` (senza i `.transform`, `z.optional()` produce `| undefined` → TS2375). Un *drift guard* a compile-time in `memory` impedisce divergenze future schema↔engine.
3. **Drizzle + better-sqlite3 ora** (non SQL grezzo da retrofittare). *Verificato:* query builder + transazioni Drizzle funzionano; `migrate()` applica una migrazione **deterministica scritta a mano** (2 tabelle) ed è idempotente alla riapertura; vitest carica il modulo nativo better-sqlite3 **senza alcuna modifica a `vitest.config.ts`** (quando le dipendenze sono dichiarate nei package.json dei pacchetti); la cartella `migrations` si risolve via `import.meta.url` **indipendentemente dalla cwd** (i test girano da root).

---

## Task 1: Pacchetto `@loomn/shared` con gli schemi Zod del grafo `DomainEvent`

Schemi Zod, unica fonte di validazione al confine di persistenza. Cast-free: i `.transform()` sui campi opzionali producono tipi exact-optional. Esporta `domainEventSchema` e `gameStateSchema`.

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/domain-schema.ts`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/src/domain-schema.test.ts`

- [ ] **Step 1: Crea lo scaffold del pacchetto.**

`packages/shared/package.json`:
```json
{
  "name": "@loomn/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.8"
  }
}
```

`packages/shared/tsconfig.json`:
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

- [ ] **Step 2: Installa le dipendenze.**

Run: `pnpm install`
Expected: installa `zod`, linka il workspace; `pnpm-lock.yaml` aggiornato. Nessun errore.

- [ ] **Step 3: Scrivi il barrel `packages/shared/src/index.ts`:**
```ts
export * from './domain-schema';
```

- [ ] **Step 4: Scrivi il test che fallisce `packages/shared/src/domain-schema.test.ts`:**
```ts
import { describe, it, expect } from 'vitest';
import { domainEventSchema, gameStateSchema } from './index';

const fullActor = {
  id: 'eroe',
  name: 'Eroe',
  kind: 'pc',
  attributes: { forza: 3 },
  skills: { atletica: 1 },
  resources: { hp: { current: 10, max: 10 } },
  conditions: [
    { key: 'ispirato', source: 'bardo', effects: [{ kind: 'checkModifier', value: 1 }], duration: { kind: 'turns', remaining: 2 } },
  ],
  items: [
    { id: 'sword', name: 'Spadone', equipped: true, effects: [{ kind: 'contributeDice', dice: [{ count: 2, sides: 6 }], mode: 'effect' }] },
  ],
  progression: { xp: 0, level: 1 },
};

describe('domainEventSchema', () => {
  it('valida ActorAdded e fa round-trip di un attore senza campi opzionali', () => {
    const ev = { type: 'ActorAdded', actor: fullActor };
    expect(domainEventSchema.parse(ev)).toEqual(ev);
  });

  it('preserva i campi opzionali presenti (tag, appliesTo)', () => {
    const ev = {
      type: 'ActorAdded',
      actor: {
        ...fullActor,
        conditions: [
          { key: 'maledetto', source: 'strega', effects: [{ kind: 'checkModifier', value: -1, appliesTo: 'forza' }], duration: { kind: 'permanent' } },
        ],
        items: [
          { id: 'ascia', name: 'Ascia', equipped: true, effects: [{ kind: 'contributeDice', dice: [{ count: 1, sides: 8, tag: 'arma' }], mode: 'effect' }] },
        ],
      },
    };
    expect(domainEventSchema.parse(ev)).toEqual(ev);
  });

  it('valida AttackResolved con CheckResult e DieResult con tag', () => {
    const ev = {
      type: 'AttackResolved',
      attackerId: 'eroe',
      targetId: 'goblin',
      check: { dice: [{ sides: 20, value: 15, tag: 'd20' }], modifierTotal: 3, total: 18, mode: 'check', dc: 10, margin: 8, outcome: 'success' },
      hit: true,
    };
    expect(domainEventSchema.parse(ev)).toEqual(ev);
  });

  it('valida gli eventi semplici DamageApplied, ActorDowned, TurnEnded', () => {
    expect(domainEventSchema.parse({ type: 'DamageApplied', targetId: 'goblin', resource: 'hp', amount: 4 })).toEqual({ type: 'DamageApplied', targetId: 'goblin', resource: 'hp', amount: 4 });
    expect(domainEventSchema.parse({ type: 'ActorDowned', actorId: 'goblin' })).toEqual({ type: 'ActorDowned', actorId: 'goblin' });
    expect(domainEventSchema.parse({ type: 'TurnEnded' })).toEqual({ type: 'TurnEnded' });
  });

  it('rifiuta un discriminante di tipo sconosciuto', () => {
    expect(() => domainEventSchema.parse({ type: 'Boom' })).toThrow();
  });

  it('rifiuta un evento con un campo obbligatorio mancante', () => {
    expect(() => domainEventSchema.parse({ type: 'DamageApplied', targetId: 'goblin', resource: 'hp' })).toThrow();
  });
});

describe('gameStateSchema', () => {
  it('fa round-trip di uno stato con encounter null e non null', () => {
    const s1 = { version: 2, actors: { eroe: fullActor }, encounter: null };
    expect(gameStateSchema.parse(s1)).toEqual(s1);
    const s2 = {
      version: 3,
      actors: { eroe: fullActor },
      encounter: { id: 'e', participants: [{ actorId: 'eroe', zone: 'a', initiative: 10, actedThisRound: false }], round: 1, turnIndex: 0 },
    };
    expect(gameStateSchema.parse(s2)).toEqual(s2);
  });
});
```

- [ ] **Step 5: Esegui il test per verificare che fallisca**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import './domain-schema'`.

- [ ] **Step 6: Scrivi `packages/shared/src/domain-schema.ts`:**
```ts
import { z } from 'zod';

// I .transform() sui campi opzionali (tag, appliesTo) eliminano il `| undefined` che
// z.optional() introdurrebbe, rendendo i tipi inferiti assegnabili 1:1 ai tipi engine
// sotto exactOptionalPropertyTypes (verificato: nessun cast necessario).

const rollModeSchema = z.union([z.literal('check'), z.literal('effect')]);

const dieGroupSchema = z
  .object({ count: z.number(), sides: z.number(), tag: z.string().optional() })
  .transform((o) =>
    o.tag === undefined
      ? { count: o.count, sides: o.sides }
      : { count: o.count, sides: o.sides, tag: o.tag },
  );

const dieResultSchema = z
  .object({ sides: z.number(), value: z.number(), tag: z.string().optional() })
  .transform((o) =>
    o.tag === undefined
      ? { sides: o.sides, value: o.value }
      : { sides: o.sides, value: o.value, tag: o.tag },
  );

const rollResultFields = {
  dice: z.array(dieResultSchema),
  modifierTotal: z.number(),
  total: z.number(),
  mode: rollModeSchema,
};

const outcomeSchema = z.union([
  z.literal('critical'),
  z.literal('success'),
  z.literal('success_at_cost'),
  z.literal('failure'),
  z.literal('disaster'),
]);

const checkResultSchema = z.object({
  ...rollResultFields,
  dc: z.number(),
  margin: z.number(),
  outcome: outcomeSchema,
});

const resourcePoolSchema = z.object({ current: z.number(), max: z.number() });

const conditionEffectSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('checkModifier'), value: z.number(), appliesTo: z.string().optional() }),
    z.object({ kind: z.literal('resourcePerTurn'), resource: z.string(), delta: z.number() }),
  ])
  .transform((o) =>
    o.kind === 'checkModifier'
      ? o.appliesTo === undefined
        ? { kind: o.kind, value: o.value }
        : { kind: o.kind, value: o.value, appliesTo: o.appliesTo }
      : { kind: o.kind, resource: o.resource, delta: o.delta },
  );

const durationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('turns'), remaining: z.number() }),
  z.object({ kind: z.literal('scenes'), remaining: z.number() }),
  z.object({ kind: z.literal('permanent') }),
]);

const conditionSchema = z.object({
  key: z.string(),
  source: z.string(),
  effects: z.array(conditionEffectSchema),
  duration: durationSchema,
});

const itemEffectSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('contributeDice'), dice: z.array(dieGroupSchema), mode: rollModeSchema }),
    z.object({ kind: z.literal('checkModifier'), value: z.number(), appliesTo: z.string().optional() }),
    z.object({ kind: z.literal('defenseModifier'), defense: z.string(), value: z.number() }),
  ])
  .transform((o) =>
    o.kind === 'checkModifier'
      ? o.appliesTo === undefined
        ? { kind: o.kind, value: o.value }
        : { kind: o.kind, value: o.value, appliesTo: o.appliesTo }
      : o,
  );

const itemSchema = z.object({
  id: z.string(),
  name: z.string(),
  equipped: z.boolean(),
  effects: z.array(itemEffectSchema),
});

const progressionSchema = z.object({ xp: z.number(), level: z.number() });

const actorKindSchema = z.union([z.literal('pc'), z.literal('npc')]);

const actorSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: actorKindSchema,
  attributes: z.record(z.string(), z.number()),
  skills: z.record(z.string(), z.number()),
  resources: z.record(z.string(), resourcePoolSchema),
  conditions: z.array(conditionSchema),
  items: z.array(itemSchema),
  progression: progressionSchema,
});

const participantSchema = z.object({
  actorId: z.string(),
  zone: z.string(),
  initiative: z.number(),
  actedThisRound: z.boolean(),
});

const encounterSchema = z.object({
  id: z.string(),
  participants: z.array(participantSchema),
  round: z.number(),
  turnIndex: z.number(),
});

/** Schema Zod dell unione DomainEvent del motore. Unica fonte di validazione al confine
 *  di persistenza (spec 4/12). */
export const domainEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ActorAdded'), actor: actorSchema }),
  z.object({ type: z.literal('EncounterStarted'), encounter: encounterSchema }),
  z.object({ type: z.literal('TurnEnded') }),
  z.object({ type: z.literal('RoundAdvanced') }),
  z.object({
    type: z.literal('AttackResolved'),
    attackerId: z.string(),
    targetId: z.string(),
    check: checkResultSchema,
    hit: z.boolean(),
  }),
  z.object({ type: z.literal('DamageApplied'), targetId: z.string(), resource: z.string(), amount: z.number() }),
  z.object({ type: z.literal('ActorDowned'), actorId: z.string() }),
]);

/** Schema Zod di GameState, per validare gli snapshot persistiti. */
export const gameStateSchema = z.object({
  version: z.number(),
  actors: z.record(z.string(), actorSchema),
  encounter: encounterSchema.nullable(),
});
```

- [ ] **Step 7: Esegui i test per verificare che passino**

Run: `pnpm test`
Expected: PASS — **105 test** (98 engine + 7 nuovi).

- [ ] **Step 8: Verifica typecheck**

Run: `pnpm -C packages/shared typecheck`
Expected: nessun errore di tipo.

- [ ] **Step 9: Verifica scope e commit**

Run: `git status --short` (solo i file di `packages/shared/` + `pnpm-lock.yaml`).
```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat(shared): pacchetto @loomn/shared con schemi Zod di DomainEvent e GameState"
```

---

## Task 2: Pacchetto `@loomn/memory` — scaffold, schema Drizzle, migrazione e `openDatabase`

Scaffold del pacchetto persistenza: tabelle Drizzle, migrazione deterministica, e `openDatabase(path)` che apre better-sqlite3, applica la migrazione e restituisce l istanza Drizzle. Verificato da un test che usa le tabelle dopo la migrazione.

**Files:**
- Create: `packages/memory/package.json`
- Create: `packages/memory/tsconfig.json`
- Create: `packages/memory/src/schema.ts`
- Create: `packages/memory/migrations/0000_init.sql`
- Create: `packages/memory/migrations/meta/_journal.json`
- Create: `packages/memory/src/db.ts`
- Create: `packages/memory/src/index.ts`
- Test: `packages/memory/src/db.test.ts`

- [ ] **Step 1: Crea lo scaffold del pacchetto.**

`packages/memory/package.json`:
```json
{
  "name": "@loomn/memory",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@loomn/engine": "workspace:*",
    "@loomn/shared": "workspace:*",
    "better-sqlite3": "^12.10.1",
    "drizzle-orm": "^0.38.4",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.10.5"
  }
}
```

`packages/memory/tsconfig.json`:
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

- [ ] **Step 2: Installa le dipendenze.**

Run: `pnpm install`
Expected: installa `better-sqlite3` (binario prebuilt), `drizzle-orm`, `@types/*`, linka `@loomn/engine`/`@loomn/shared`; `pnpm-lock.yaml` aggiornato. Nessun errore di build nativo.

- [ ] **Step 3: Scrivi lo schema Drizzle `packages/memory/src/schema.ts`:**
```ts
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const events = sqliteTable('events', {
  seq: integer('seq').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),
  payload: text('payload').notNull(),
});

export const snapshots = sqliteTable('snapshots', {
  version: integer('version').primaryKey(),
  state: text('state').notNull(),
});
```

- [ ] **Step 4: Scrivi la migrazione `packages/memory/migrations/0000_init.sql`** (formato del migratore Drizzle: identificatori tra backtick, separatore `--> statement-breakpoint`):
```sql
CREATE TABLE `events` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`version` integer PRIMARY KEY NOT NULL,
	`state` text NOT NULL
);
```

- [ ] **Step 5: Scrivi il journal `packages/memory/migrations/meta/_journal.json`:**
```json
{
  "version": "7",
  "dialect": "sqlite",
  "entries": [
    { "idx": 0, "version": "6", "when": 1750000000000, "tag": "0000_init", "breakpoints": true }
  ]
}
```

- [ ] **Step 6: Scrivi `packages/memory/src/db.ts`:**
```ts
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';

/** Cartella delle migrazioni, risolta relativamente al sorgente (indipendente dalla cwd). */
export const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

export interface OpenDb {
  db: BetterSQLite3Database;
  close(): void;
}

/** Apre il database SQLite al percorso dato (':memory:' per i test), applica le migrazioni
 *  (idempotente) e restituisce l istanza Drizzle e una funzione di chiusura. */
export function openDatabase(dbPath: string): OpenDb {
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder });
  return { db, close: () => sqlite.close() };
}
```

- [ ] **Step 7: Scrivi il barrel `packages/memory/src/index.ts`:**
```ts
export { openDatabase, type OpenDb } from './db';
```

- [ ] **Step 8: Scrivi il test che fallisce `packages/memory/src/db.test.ts`:**
```ts
import { describe, it, expect } from 'vitest';
import { openDatabase } from './db';
import { events, snapshots } from './schema';

describe('openDatabase', () => {
  it('crea la tabella events utilizzabile dopo la migrazione', () => {
    const { db, close } = openDatabase(':memory:');
    db.insert(events).values({ type: 'TurnEnded', payload: '{}' }).run();
    expect(db.select().from(events).all()).toEqual([{ seq: 1, type: 'TurnEnded', payload: '{}' }]);
    close();
  });

  it('crea la tabella snapshots utilizzabile dopo la migrazione', () => {
    const { db, close } = openDatabase(':memory:');
    db.insert(snapshots).values({ version: 5, state: '{}' }).run();
    expect(db.select().from(snapshots).all()).toEqual([{ version: 5, state: '{}' }]);
    close();
  });
});
```

- [ ] **Step 9: Esegui i test (rosso poi verde).**

Run: `pnpm test`
Expected (prima dell esistenza di `db.ts`/`schema.ts` se eseguito a metà): FAIL su import irrisolti. Dopo gli step 3-6: PASS — **107 test** (105 + 2 nuovi).

- [ ] **Step 10: Verifica typecheck**

Run: `pnpm -C packages/memory typecheck`
Expected: nessun errore di tipo.

- [ ] **Step 11: Verifica scope e commit**

Run: `git status --short` (solo `packages/memory/` + `pnpm-lock.yaml`).
```bash
git add packages/memory pnpm-lock.yaml
git commit -m "feat(memory): scaffold @loomn/memory, schema Drizzle, migrazione e openDatabase"
```

---

## Task 3: Suite di conformità condivisa `EventStore` (braccio di riferimento in-memory)

La suite riutilizzabile che ogni implementazione della porta `EventStore` deve passare (spec §9). In questo task gira sul **riferimento** `createInMemoryEventStore` dell engine, dimostrando che la suite è corretta.

**Files:**
- Create: `packages/memory/src/event-store-contract.ts`
- Test: `packages/memory/src/event-store-contract.test.ts`

- [ ] **Step 1: Scrivi la suite `packages/memory/src/event-store-contract.ts`:**
```ts
import { describe, it, expect } from 'vitest';
import { ConcurrencyError, takeSnapshot, rebuild, type Actor, type DomainEvent, type EventStore } from '@loomn/engine';

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

/** Suite di conformita condivisa: ogni implementazione della porta EventStore deve passarla
 *  identica (spec 9). makeStore crea uno store fresco per ogni caso di test. */
export function runEventStoreContract(label: string, makeStore: () => EventStore): void {
  describe(`EventStore contract: ${label}`, () => {
    it('parte da versione 0', () => {
      expect(makeStore().version()).toBe(0);
    });

    it('appende eventi, traccia la versione e li ricarica con seq progressivo', () => {
      const store = makeStore();
      const v = store.append(evs, 0);
      expect(v).toBe(3);
      expect(store.version()).toBe(3);
      expect(store.load().map((s) => s.seq)).toEqual([1, 2, 3]);
    });

    it('lancia ConcurrencyError se expectedVersion non coincide', () => {
      const store = makeStore();
      store.append(evs, 0);
      expect(() => store.append([{ type: 'TurnEnded' }], 0)).toThrow(ConcurrencyError);
    });

    it('ConcurrencyError espone expected e actual', () => {
      const store = makeStore();
      store.append(evs, 0);
      let err: unknown;
      try {
        store.append([{ type: 'TurnEnded' }], 1);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(ConcurrencyError);
      expect((err as ConcurrencyError).expected).toBe(1);
      expect((err as ConcurrencyError).actual).toBe(3);
    });

    it('rebuild senza snapshot equivale al replay completo', () => {
      const store = makeStore();
      store.append(evs, 0);
      const s = rebuild(store.load());
      expect(s.version).toBe(3);
      expect(s.actors['goblin']?.resources['hp']?.current).toBe(4);
    });

    it('rebuild da snapshot applica solo gli eventi successivi', () => {
      const store = makeStore();
      store.append(evs, 0);
      const snap = takeSnapshot(rebuild(store.load()));
      store.append([{ type: 'DamageApplied', targetId: 'goblin', resource: 'hp', amount: 2 }], 3);
      const full = rebuild(store.load());
      const fromSnap = rebuild(store.load(), snap);
      expect(fromSnap).toEqual(full);
      expect(fromSnap.actors['goblin']?.resources['hp']?.current).toBe(2);
    });
  });
}
```

- [ ] **Step 2: Scrivi `packages/memory/src/event-store-contract.test.ts`:**
```ts
import { createInMemoryEventStore } from '@loomn/engine';
import { runEventStoreContract } from './event-store-contract';

runEventStoreContract('in-memory', () => createInMemoryEventStore());
```

- [ ] **Step 3: Esegui i test**

Run: `pnpm test`
Expected: PASS — **113 test** (107 + 6 della suite sul riferimento in-memory).

- [ ] **Step 4: Verifica typecheck**

Run: `pnpm -C packages/memory typecheck`
Expected: nessun errore di tipo.

- [ ] **Step 5: Verifica scope e commit**

Run: `git status --short` (solo i 2 file previsti).
```bash
git add packages/memory/src/event-store-contract.ts packages/memory/src/event-store-contract.test.ts
git commit -m "test(memory): suite di conformita EventStore sul riferimento in-memory"
```

---

## Task 4: `createSqliteEventStore` — porta `EventStore` su SQLite + conformità

L adapter SQLite che implementa la **stessa porta `EventStore`** del Piano 5: `version`/`append` (transazione + concorrenza ottimistica)/`load` (con validazione Zod al confine di lettura) e `close`. La suite condivisa del Task 3 viene fatta girare **anche** su SQLite (contract test, spec §9).

**Files:**
- Create: `packages/memory/src/sqlite-event-store.ts`
- Modify: `packages/memory/src/event-store-contract.test.ts`
- Modify: `packages/memory/src/index.ts`

- [ ] **Step 1: Aggiorna il test di conformità `packages/memory/src/event-store-contract.test.ts`** (aggiunge il braccio SQLite):
```ts
import { createInMemoryEventStore } from '@loomn/engine';
import { createSqliteEventStore } from './sqlite-event-store';
import { runEventStoreContract } from './event-store-contract';

runEventStoreContract('in-memory', () => createInMemoryEventStore());
runEventStoreContract('sqlite (:memory:)', () => createSqliteEventStore(':memory:'));
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import './sqlite-event-store'`.

- [ ] **Step 3: Scrivi `packages/memory/src/sqlite-event-store.ts`:**
```ts
import { sql } from 'drizzle-orm';
import { ConcurrencyError, type DomainEvent, type StoredEvent, type EventStore } from '@loomn/engine';
import type { z } from 'zod';
import { domainEventSchema } from '@loomn/shared';
import { openDatabase } from './db';
import { events } from './schema';

export interface SqliteEventStore extends EventStore {
  /** Rilascia la connessione SQLite sottostante. */
  close(): void;
}

/** Adapter SQLite della porta EventStore (Piano 5). dbPath = ':memory:' o un percorso file.
 *  Concorrenza ottimistica via MAX(seq) in transazione; load valida con Zod (confine non fidato). */
export function createSqliteEventStore(dbPath: string): SqliteEventStore {
  const { db, close } = openDatabase(dbPath);

  const currentVersion = (): number => {
    const row = db.select({ v: sql<number>`COALESCE(MAX(${events.seq}), 0)` }).from(events).get();
    return row?.v ?? 0;
  };

  return {
    version: currentVersion,
    append(toAppend: DomainEvent[], expectedVersion: number): number {
      return db.transaction((tx): number => {
        const row = tx.select({ v: sql<number>`COALESCE(MAX(${events.seq}), 0)` }).from(events).get();
        const actual = row?.v ?? 0;
        if (actual !== expectedVersion) {
          throw new ConcurrencyError(expectedVersion, actual);
        }
        for (const event of toAppend) {
          tx.insert(events).values({ type: event.type, payload: JSON.stringify(event) }).run();
        }
        return expectedVersion + toAppend.length;
      });
    },
    load(): StoredEvent[] {
      const rows = db.select().from(events).orderBy(events.seq).all();
      return rows.map((r) => ({ seq: r.seq, event: domainEventSchema.parse(JSON.parse(r.payload)) }));
    },
    close,
  };
}

// Drift guard a compile-time: lo schema Zod deve restare allineato a DomainEvent del motore
// in entrambe le direzioni. Se i tipi divergono, queste righe falliscono il typecheck.
type _EventInfer = z.infer<typeof domainEventSchema>;
const _eventForward: DomainEvent = null as unknown as _EventInfer;
const _eventBackward: _EventInfer = null as unknown as DomainEvent;
void _eventForward;
void _eventBackward;
```

- [ ] **Step 4: Aggiorna il barrel `packages/memory/src/index.ts`:**
```ts
export { openDatabase, type OpenDb } from './db';
export { createSqliteEventStore, type SqliteEventStore } from './sqlite-event-store';
```

- [ ] **Step 5: Esegui i test per verificare che passino**

Run: `pnpm test`
Expected: PASS — **119 test** (113 + 6: la suite ora gira anche su SQLite). La stessa suite verde su entrambe le implementazioni = contract test dello spec §9.

- [ ] **Step 6: Verifica typecheck**

Run: `pnpm -C packages/memory typecheck`
Expected: nessun errore di tipo (incluso il drift guard).

- [ ] **Step 7: Verifica scope e commit**

Run: `git status --short` (solo i 3 file previsti).
```bash
git add packages/memory/src/sqlite-event-store.ts packages/memory/src/event-store-contract.test.ts packages/memory/src/index.ts
git commit -m "feat(memory): createSqliteEventStore implementa la porta EventStore (contract verde in-memory e SQLite)"
```

---

## Task 5: Persistenza degli snapshot + test specifici SQLite (persistenza su file, isolamento, validazione)

Estende lo store con la persistenza degli snapshot (`saveSnapshot`/`latestSnapshot`) e aggiunge i test che dimostrano le proprietà *specifiche* di SQLite che la suite condivisa non copre: persistenza tra riaperture su file, isolamento (oggetti freschi a ogni `load`, affronta il deferral del Piano 5), round-trip degli snapshot, e rifiuto Zod di payload corrotti.

**Files:**
- Modify: `packages/memory/src/sqlite-event-store.ts`
- Test: `packages/memory/src/sqlite-event-store.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce `packages/memory/src/sqlite-event-store.test.ts`:**
```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { takeSnapshot, rebuild, type Actor, type DomainEvent } from '@loomn/engine';
import { openDatabase } from './db';
import { events } from './schema';
import { createSqliteEventStore } from './sqlite-event-store';

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

describe('createSqliteEventStore - persistenza su file', () => {
  it('persiste gli eventi tra riaperture dello stesso file (migrazione idempotente)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loomn-mem-'));
    const path = join(dir, 'campaign.db');
    try {
      const a = createSqliteEventStore(path);
      a.append(evs, 0);
      a.close();
      const b = createSqliteEventStore(path);
      expect(b.version()).toBe(3);
      expect(b.load().map((s) => s.seq)).toEqual([1, 2, 3]);
      b.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('createSqliteEventStore - isolamento e validazione', () => {
  it('load restituisce oggetti freschi: mutare un evento caricato non altera un load successivo', () => {
    const store = createSqliteEventStore(':memory:');
    store.append([{ type: 'ActorAdded', actor: actor('goblin') }], 0);
    const first = store.load()[0];
    if (first !== undefined && first.event.type === 'ActorAdded') {
      first.event.actor.name = 'MUTATO';
    }
    const second = store.load()[0];
    const name = second !== undefined && second.event.type === 'ActorAdded' ? second.event.actor.name : '';
    expect(name).toBe('goblin');
    store.close();
  });

  it('load lancia se un payload memorizzato e malformato (validazione Zod al confine)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loomn-mem-'));
    const path = join(dir, 'corrupt.db');
    try {
      const inject = openDatabase(path);
      inject.db.insert(events).values({ type: 'DamageApplied', payload: '{"type":"DamageApplied"}' }).run();
      inject.close();
      const store = createSqliteEventStore(path);
      expect(() => store.load()).toThrow();
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('createSqliteEventStore - snapshot', () => {
  it('latestSnapshot e undefined quando non ci sono snapshot', () => {
    const store = createSqliteEventStore(':memory:');
    expect(store.latestSnapshot()).toBeUndefined();
    store.close();
  });

  it('saveSnapshot e latestSnapshot fanno round-trip dello stato attraverso il DB', () => {
    const store = createSqliteEventStore(':memory:');
    store.append(evs, 0);
    const snap = takeSnapshot(rebuild(store.load()));
    store.saveSnapshot(snap);
    expect(store.latestSnapshot()).toEqual(snap);
    store.close();
  });
});
```

- [ ] **Step 2: Esegui i test per verificare che falliscano**

Run: `pnpm test`
Expected: FAIL — `saveSnapshot`/`latestSnapshot` non esistono su `SqliteEventStore`.

- [ ] **Step 3: Sostituisci il contenuto di `packages/memory/src/sqlite-event-store.ts` con la versione completa (aggiunge snapshot + relativo drift guard):**
```ts
import { sql, desc } from 'drizzle-orm';
import {
  ConcurrencyError,
  type DomainEvent,
  type StoredEvent,
  type Snapshot,
  type GameState,
  type EventStore,
} from '@loomn/engine';
import type { z } from 'zod';
import { domainEventSchema, gameStateSchema } from '@loomn/shared';
import { openDatabase } from './db';
import { events, snapshots } from './schema';

export interface SqliteEventStore extends EventStore {
  /** Persiste uno snapshot (sovrascrive quello con la stessa versione). */
  saveSnapshot(snapshot: Snapshot): void;
  /** Lo snapshot a versione massima, o undefined se non ce ne sono. */
  latestSnapshot(): Snapshot | undefined;
  /** Rilascia la connessione SQLite sottostante. */
  close(): void;
}

/** Adapter SQLite della porta EventStore (Piano 5) + persistenza degli snapshot.
 *  dbPath = ':memory:' o un percorso file. Concorrenza ottimistica via MAX(seq) in
 *  transazione; load/latestSnapshot validano con Zod (confine non fidato). */
export function createSqliteEventStore(dbPath: string): SqliteEventStore {
  const { db, close } = openDatabase(dbPath);

  const currentVersion = (): number => {
    const row = db.select({ v: sql<number>`COALESCE(MAX(${events.seq}), 0)` }).from(events).get();
    return row?.v ?? 0;
  };

  return {
    version: currentVersion,
    append(toAppend: DomainEvent[], expectedVersion: number): number {
      return db.transaction((tx): number => {
        const row = tx.select({ v: sql<number>`COALESCE(MAX(${events.seq}), 0)` }).from(events).get();
        const actual = row?.v ?? 0;
        if (actual !== expectedVersion) {
          throw new ConcurrencyError(expectedVersion, actual);
        }
        for (const event of toAppend) {
          tx.insert(events).values({ type: event.type, payload: JSON.stringify(event) }).run();
        }
        return expectedVersion + toAppend.length;
      });
    },
    load(): StoredEvent[] {
      const rows = db.select().from(events).orderBy(events.seq).all();
      return rows.map((r) => ({ seq: r.seq, event: domainEventSchema.parse(JSON.parse(r.payload)) }));
    },
    saveSnapshot(snapshot: Snapshot): void {
      const state = JSON.stringify(snapshot.state);
      db.insert(snapshots)
        .values({ version: snapshot.version, state })
        .onConflictDoUpdate({ target: snapshots.version, set: { state } })
        .run();
    },
    latestSnapshot(): Snapshot | undefined {
      const row = db.select().from(snapshots).orderBy(desc(snapshots.version)).limit(1).get();
      if (row === undefined) {
        return undefined;
      }
      return { version: row.version, state: gameStateSchema.parse(JSON.parse(row.state)) };
    },
    close,
  };
}

// Drift guard a compile-time: gli schemi Zod devono restare allineati ai tipi del motore
// in entrambe le direzioni. Se i tipi divergono, queste righe falliscono il typecheck.
type _EventInfer = z.infer<typeof domainEventSchema>;
type _StateInfer = z.infer<typeof gameStateSchema>;
const _eventForward: DomainEvent = null as unknown as _EventInfer;
const _eventBackward: _EventInfer = null as unknown as DomainEvent;
const _stateForward: GameState = null as unknown as _StateInfer;
const _stateBackward: _StateInfer = null as unknown as GameState;
void _eventForward;
void _eventBackward;
void _stateForward;
void _stateBackward;
```

- [ ] **Step 4: Esegui i test per verificare che passino**

Run: `pnpm test`
Expected: PASS — **124 test** (119 + 5 nuovi).

- [ ] **Step 5: Verifica finale typecheck + test**

Run: `pnpm -C packages/memory typecheck && pnpm test`
Expected: nessun errore di tipo; tutti i test PASS (124).

- [ ] **Step 6: Verifica scope e commit**

Run: `git status --short` (solo i 2 file previsti).
```bash
git add packages/memory/src/sqlite-event-store.ts packages/memory/src/sqlite-event-store.test.ts
git commit -m "feat(memory): persistenza snapshot + test SQLite (persistenza su file, isolamento, validazione Zod)"
```

---

## Self-Review (eseguita)

**1. Copertura spec (per i confini di questo piano):**
- §4 pacchetto `memory` (Drizzle+SQLite) → Task 2-5. ✔
- §4 pacchetto `shared` con schemi Zod (unica fonte) → Task 1. ✔
- §4 regola di dipendenza `memory → engine → shared`, `shared` foglia → rispettata (shared dipende solo da zod; memory da engine+shared; engine intatto). ✔
- §4/§12 validazione Zod ai confini → `load()`/`latestSnapshot()` validano i dati letti dal DB; test del payload corrotto (Task 5). ✔
- §5.1/§5.6 event sourcing + concorrenza ottimistica (`expectedVersion`/`ConcurrencyError`) → `append` in transazione (Task 4); `ConcurrencyError` riusata dall engine. ✔
- §6.3 persistenza offline-first + snapshot → tabelle SQLite, snapshot rigenerabili (Task 5); persistenza su file verificata (Task 5). ✔
- §9 contract test condivisi → `runEventStoreContract` verde su in-memory **e** SQLite (Task 3-4). ✔
- Fuori ambito (L1/L1.5/L2, drizzle-kit, upcasting, Clock/meta, hardening load in-memory) → dichiarato; nessun requisito *di questo piano* scoperto.

**2. Scan placeholder:** nessun TBD/TODO; ogni step ha codice/comando concreto. Tutto il codice (schemi Zod cast-free, store, migrazione, `openDatabase`, suite) è stato **verificato a compilare/eseguire empiricamente** prima della stesura. Le descrizioni dei test in apici singoli sono prive di apostrofi.

**3. Coerenza dei tipi:**
- `createSqliteEventStore` implementa `EventStore` (`version`/`append`/`load`) della stessa porta del Piano 5; `StoredEvent`/`Snapshot`/`ConcurrencyError`/`GameState` importati da `@loomn/engine`. ✔
- `domainEventSchema`/`gameStateSchema` (shared) → `z.infer` **bidirezionalmente assegnabile** a `DomainEvent`/`GameState` (verificato; drift guard a compile-time in `sqlite-event-store.ts`). ✔
- `append` ritorna `expectedVersion + toAppend.length`; `version()` = `COALESCE(MAX(seq),0)` = numero eventi (append-only, gapless) → coerente con la semantica in-memory (`stored.length`). ✔
- Strict: `.get()` gestito con `?? 0`/guardia `row === undefined`; spread condizionali non necessari (i `.transform` Zod evitano `undefined` espliciti); `import type`/`type` per `verbatimModuleSyntax`. ✔
- Conteggi test attesi (cumulativi): Task 1 → 105, Task 2 → 107, Task 3 → 113, Task 4 → 119, Task 5 → 124. ✔

**4. Note di duplicazione giustificata (per i reviewer):**
- La suite di conformità gira anche sullo store **in-memory** (riferimento): non è ridondante con i test dell engine: è il *braccio di riferimento* del contract test (riferimento vs adattatore) e prova che la suite stessa è corretta.
- Il fixture `actor`/`evs` è ripetuto in `event-store-contract.ts` e in `sqlite-event-store.test.ts` (file con scopi diversi): duplicazione minima e locale, preferita a un export di test-utils.

---

## Roadmap aggiornata dei piani successivi (Fase 1)

- **Piano 7 — Provider AI + AI Master + StructuredOutputPort + TracingPort** (grande, probabile split). Qui `@loomn/shared` cresce con gli schemi degli strumenti/structured-output (riuso del pattern Zod introdotto in questo piano).
- **Piano 8 — Memoria L1.5 (canon ledger) + L2 (riassunti) + Context Assembler.** Qui entrano le **proiezioni relazionali** (molte tabelle che evolvono) e quindi `drizzle-kit` con migrazioni *generate*; le tabelle `events`/`snapshots` di questo piano vi confluiscono.
- **Piano 9 — Shell Electron** (main/preload/renderer; sicurezza; IPC tipizzato; **Clock** per i meta degli eventi; `electron-rebuild` del modulo nativo better-sqlite3 per l ABI di Electron).
- **Piano 10 — UI Vue** (chat, scheda PG, pannello dadi 3D, journal, provider) (grande, probabile split).
- **Piano 11 — Moduli a tema:** formato dati Zod + import/export + 1 modulo curato (riuso degli schemi `shared`).

(Estensioni post-Fase 1: upcasting versionato degli eventi; undo/redo basato sullo stream; store vettoriale L3.)

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-15-loomn-fase1-piano6-persistenza.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch di un subagent fresco per task, review (spec + qualità) tra un task e l altro.

**2. Inline Execution** — esecuzione dei task in questa sessione con checkpoint.

**Quale approccio preferisci?**
