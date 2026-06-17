# SP1 — `request_check` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere lo strumento del Master `request_check`: l'AI propone *chi tira / con quale attributo·abilità / con quale difficoltà qualitativa*; l'engine possiede la CD e risolve in modo deterministico, producendo un evento `CheckResolved`.

**Architecture:** Specchio strutturale di `Attack`, ma **il codice possiede il numero della difficoltà**: l'AI sceglie una band qualitativa (`trivial..legendary`), una funzione pura dell'engine (`dcForDifficulty`) la traduce in CD. Nuovo Command `RequestCheck` → evento `CheckResolved` (no-op di stato come `AttackResolved`). Confine validato in `@loomn/shared`; tool esposto in `@loomn/ai`. Nessun nuovo stato di dominio.

**Tech Stack:** TypeScript strict (monorepo pnpm), Zod (confine), Vitest (TDD), RNG seedato mulberry32 dell'engine.

**Spec di riferimento:** `docs/superpowers/specs/2026-06-17-sp1-request-check-design.md` (autorità). Spec di design generale: `2026-06-15-...-design.md` §5.4 (AI Master), principio "il codice è l'arbitro".

**Fuori ambito (NON toccare):** `master-turn.ts` e `host/reflection-ports.ts` (gestiscono `CheckResolved` per via generica — vedi spec §4); `commandSchema` (RequestCheck è interno all'AI, non un dispatch IPC del renderer — il drift guard wire→motore è unidirezionale); `app/desktop`/UI/migrazioni; validazione del vocabolario `attribute`/`skill` (debito G3/G4 → item 4 del backlog); modificatori situazionali; check contrapposti; `Ruleset` injection (item deliberato successivo).

**Disciplina di scope (CRITICO, house rule §5.1):** ogni task modifica SOLO i file elencati nel task. MAI toccare `package.json`, `tsconfig*.json`, `vitest.config.ts`. Verifica `git status --short` prima di ogni commit. Bug apostrofo (§5.4): niente apostrofi (`l'`, `un'`, `c'è`) dentro le stringhe in apici singoli di `it('...')`/`describe('...')` — scrivi `l attore`, `c e` (le lettere accentate `è/é` vanno bene).

**Conteggio test atteso (cumulativo):** baseline **292** → Task 1 **294** → Task 2 **297** → Task 3 **300** → Task 4 **304**.

---

## File Structure

- **Create** `packages/engine/src/difficulty.ts` — band di difficoltà + tabella band→CD (funzione pura `dcForDifficulty`). Unica responsabilità; migrabile in un futuro `Ruleset`.
- **Create** `packages/engine/src/difficulty.test.ts`
- **Modify** `packages/engine/src/index.ts` — re-export di `difficulty`.
- **Modify** `packages/engine/src/events.ts` — variante `CheckResolved` di `DomainEvent` + caso `applyEvent` (no-op di stato).
- **Modify** `packages/engine/src/events.test.ts` — test del no-op.
- **Modify** `packages/shared/src/domain-schema.ts` — variante `CheckResolved` in `domainEventSchema` (arm `z.union` con `.transform()`; enum difficoltà rispecchiato).
- **Modify** `packages/shared/src/domain-schema.test.ts` — round-trip + rifiuto difficoltà fuori band.
- **Modify** `packages/engine/src/commands.ts` — variante `RequestCheck` di `Command` + caso `decide`.
- **Modify** `packages/engine/src/commands.test.ts` — test della risoluzione.
- **Modify** `packages/ai/src/master-tools.ts` — tool `request_check` → `RequestCheck`.
- **Modify** `packages/ai/src/master-tools.test.ts` — test del tool + aggiorna l'asserzione "5 tool"→"6 tool".

---

## Task 1: modulo `difficulty.ts` (band → CD)

**Files:**
- Create: `packages/engine/src/difficulty.ts`
- Create: `packages/engine/src/difficulty.test.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/difficulty.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { DIFFICULTIES, dcForDifficulty } from './difficulty';

describe('dcForDifficulty', () => {
  it('mappa ogni band alla CD attesa', () => {
    expect(dcForDifficulty('trivial')).toBe(5);
    expect(dcForDifficulty('easy')).toBe(10);
    expect(dcForDifficulty('moderate')).toBe(15);
    expect(dcForDifficulty('hard')).toBe(20);
    expect(dcForDifficulty('formidable')).toBe(25);
    expect(dcForDifficulty('legendary')).toBe(30);
  });

  it('copre tutte le band di DIFFICULTIES con CD finita e crescente', () => {
    let prev = 0;
    for (const d of DIFFICULTIES) {
      const dc = dcForDifficulty(d);
      expect(Number.isFinite(dc)).toBe(true);
      expect(dc).toBeGreaterThan(prev);
      prev = dc;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/engine/src/difficulty.test.ts`
Expected: FAIL — impossibile risolvere `./difficulty`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/engine/src/difficulty.ts`:
```ts
// Difficolta qualitativa di una prova. L AI propone la band; il CODICE possiede la CD
// (il codice e l arbitro). Tabella di default dell engine: un modulo (Piano 11) potra'
// sostituirla via Ruleset iniettato (spec 5.3) senza toccare i call site. Tenuta come
// funzione pura, isolata, proprio per essere migrabile in un Ruleset in un secondo momento.

export const DIFFICULTIES = ['trivial', 'easy', 'moderate', 'hard', 'formidable', 'legendary'] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];

const DC_BY_DIFFICULTY: Record<Difficulty, number> = {
  trivial: 5,
  easy: 10,
  moderate: 15,
  hard: 20,
  formidable: 25,
  legendary: 30,
};

/** CD per una band di difficolta. */
export function dcForDifficulty(d: Difficulty): number {
  return DC_BY_DIFFICULTY[d];
}
```

- [ ] **Step 4: Re-export dal barrel**

In `packages/engine/src/index.ts`, aggiungi la riga `export * from './difficulty';` subito DOPO `export * from './check';` (riga 3). Risultato delle prime righe:
```ts
export * from './random';
export * from './dice';
export * from './check';
export * from './difficulty';
export * from './actor';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run packages/engine/src/difficulty.test.ts`
Expected: PASS (2 test).
Run: `pnpm -C packages/engine typecheck`
Expected: pulito.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/difficulty.ts packages/engine/src/difficulty.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): difficulty band -> CD (dcForDifficulty) per request_check (SP1)"
```

---

## Task 2: evento `CheckResolved` (engine + shared, accoppiati dal drift guard)

> **Perché due pacchetti in un task:** il drift guard a compile-time in `packages/memory/src/sqlite-event-store.ts:85-90` verifica `DomainEvent` ↔ `z.infer<domainEventSchema>` in **entrambe le direzioni**, e `load()` fa `domainEventSchema.parse` su ogni evento. Aggiungere `CheckResolved` solo all'engine (o solo allo schema) rompe `pnpm -r typecheck` e la load. Vanno insieme.

**Files:**
- Modify: `packages/engine/src/events.ts`
- Modify: `packages/engine/src/events.test.ts`
- Modify: `packages/shared/src/domain-schema.ts`
- Modify: `packages/shared/src/domain-schema.test.ts`

- [ ] **Step 1: Write the failing test (engine no-op)**

In `packages/engine/src/events.test.ts`, aggiungi questo test dentro il `describe('applyEvent', ...)`, subito DOPO il test `NarrationRecorded non cambia lo stato ...` (riga ~104):
```ts
  it('CheckResolved non cambia lo stato ma incrementa la versione', () => {
    const base = withActors(actor('eroe'));
    const result: CheckResult = {
      dice: [{ sides: 20, value: 18 }],
      modifierTotal: 3,
      total: 21,
      mode: 'check',
      dc: 15,
      margin: 6,
      outcome: 'success',
    };
    const s = applyEvent(base, { type: 'CheckResolved', actorId: 'eroe', attribute: 'forza', difficulty: 'moderate', result });
    expect(s.actors).toEqual(base.actors);
    expect(s.encounter).toEqual(base.encounter);
    expect(s.version).toBe(base.version + 1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/engine/src/events.test.ts`
Expected: FAIL — `CheckResolved` non è una variante valida di `DomainEvent` (errore di tipo/compilazione) oppure il caso non esiste.

- [ ] **Step 3: Implement engine event**

In `packages/engine/src/events.ts`:

(a) aggiungi l'import del tipo `Difficulty` (l'import di `CheckResult` da `./check` esiste già alla riga 2):
```ts
import type { Difficulty } from './difficulty';
```

(b) aggiungi la variante alla union `DomainEvent` (dopo `NarrationRecorded`, riga 15):
```ts
  | { type: 'CheckResolved'; actorId: string; attribute?: string; skill?: string; difficulty: Difficulty; result: CheckResult };
```

(c) in `applyEvent`, aggiungi il caso no-op subito DOPO il caso `AttackResolved` (riga 53-54):
```ts
    case 'CheckResolved':
      // Evento informativo: il fatto e gia risolto nel CheckResult (replay-safe, niente RNG).
      // No-op di stato come AttackResolved: non muta actors/encounter, solo version++.
      return bumped;
```

- [ ] **Step 4: Run engine test to verify it passes**

Run: `pnpm exec vitest run packages/engine/src/events.test.ts`
Expected: PASS.
Run: `pnpm -C packages/engine typecheck`
Expected: pulito.

> Nota: a questo punto `pnpm -r typecheck` (intero monorepo) **fallisce di proposito** sul drift guard di `memory` — lo schema shared non ha ancora `CheckResolved`. Lo si chiude negli step seguenti. Non committare ancora.

- [ ] **Step 5: Write the failing test (shared schema)**

In `packages/shared/src/domain-schema.test.ts`, aggiungi (in fondo al file, o vicino agli altri test di `domainEventSchema`):
```ts
  it('valida e fa round-trip di CheckResolved con enum difficolta e CheckResult annidato', () => {
    const event = {
      type: 'CheckResolved' as const,
      actorId: 'pc-eldra',
      attribute: 'forza',
      difficulty: 'hard' as const,
      result: {
        dice: [{ sides: 20, value: 14 }],
        modifierTotal: 3,
        total: 17,
        mode: 'check' as const,
        dc: 20,
        margin: -3,
        outcome: 'failure' as const,
      },
    };
    expect(domainEventSchema.parse(event)).toEqual(event);
  });

  it('omette attribute/skill assenti in CheckResolved (cast-free)', () => {
    const event = {
      type: 'CheckResolved' as const,
      actorId: 'pc-eldra',
      difficulty: 'easy' as const,
      result: { dice: [{ sides: 20, value: 8 }], modifierTotal: 0, total: 8, mode: 'check' as const, dc: 10, margin: -2, outcome: 'failure' as const },
    };
    const parsed = domainEventSchema.parse(event);
    expect('attribute' in parsed).toBe(false);
    expect('skill' in parsed).toBe(false);
  });

  it('rifiuta una difficolta fuori band in CheckResolved', () => {
    expect(() =>
      domainEventSchema.parse({
        type: 'CheckResolved',
        actorId: 'pc-eldra',
        difficulty: 'impossibile',
        result: { dice: [], modifierTotal: 0, total: 0, mode: 'check', dc: 10, margin: -10, outcome: 'disaster' },
      }),
    ).toThrow();
  });
```
> Verifica che il file importi già `domainEventSchema` da `./domain-schema`; se l'import non c'è, aggiungilo in cima al file (`import { domainEventSchema } from './domain-schema';`) — NON toccare altri import.

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm exec vitest run packages/shared/src/domain-schema.test.ts`
Expected: FAIL — `domainEventSchema` non riconosce `CheckResolved` (parse fallisce / round-trip diverso).

- [ ] **Step 7: Implement shared schema**

In `packages/shared/src/domain-schema.ts`, subito PRIMA della definizione `export const domainEventSchema = ...` (riga ~128-130), aggiungi:
```ts
// difficulty: shared e FOGLIA (non importa engine) -> rispecchia i literal di Difficulty
// dell engine. Il drift guard bidirezionale (sqlite-event-store) verifica l allineamento 1:1.
const difficultySchema = z.enum(['trivial', 'easy', 'moderate', 'hard', 'formidable', 'legendary']);

// CheckResolved ha campi opzionali TOP-LEVEL (attribute, skill): il .transform() li OMETTE
// quando assenti, cosi il tipo inferito e assegnabile 1:1 a DomainEvent sotto
// exactOptionalPropertyTypes. Ma .transform() produce un ZodEffects, e z.discriminatedUnion
// accetta solo ZodObject -> questa variante vive come arm separato di z.union (stesso motivo
// di commandSchema). Gli altri 8 eventi restano nella discriminatedUnion (errori precisi,
// comportamento invariato).
const checkResolvedEventSchema = z
  .object({
    type: z.literal('CheckResolved'),
    actorId: z.string(),
    attribute: z.string().optional(),
    skill: z.string().optional(),
    difficulty: difficultySchema,
    result: checkResultSchema,
  })
  .transform((o) => ({
    type: o.type,
    actorId: o.actorId,
    difficulty: o.difficulty,
    result: o.result,
    ...(o.attribute !== undefined ? { attribute: o.attribute } : {}),
    ...(o.skill !== undefined ? { skill: o.skill } : {}),
  }));
```

Poi sostituisci la definizione esistente di `domainEventSchema` (la `z.discriminatedUnion('type', [...])` attuale, righe ~130-145) con la versione avvolta in `z.union` — i 7 membri originali restano IDENTICI dentro la discriminatedUnion, si aggiunge solo l'arm `checkResolvedEventSchema`:
```ts
export const domainEventSchema = z.union([
  z.discriminatedUnion('type', [
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
    z.object({ type: z.literal('NarrationRecorded'), playerAction: z.string(), narration: z.string() }),
  ]),
  checkResolvedEventSchema,
]);
```

- [ ] **Step 8: Run tests + full typecheck to verify green**

Run: `pnpm exec vitest run packages/shared/src/domain-schema.test.ts packages/engine/src/events.test.ts`
Expected: PASS.
Run: `pnpm -r typecheck`
Expected: pulito su tutti i progetti (il drift guard bidirezionale di `memory` ora è soddisfatto: engine e shared hanno entrambi `CheckResolved` allineati).

- [ ] **Step 9: Commit**

```bash
git add packages/engine/src/events.ts packages/engine/src/events.test.ts packages/shared/src/domain-schema.ts packages/shared/src/domain-schema.test.ts
git commit -m "feat(engine,shared): evento CheckResolved (no-op di stato) per request_check (SP1)"
```

---

## Task 3: Command `RequestCheck` + `decide`

**Files:**
- Modify: `packages/engine/src/commands.ts`
- Modify: `packages/engine/src/commands.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/engine/src/commands.test.ts`, aggiungi un nuovo blocco in fondo al file (usa gli helper esistenti `hero()`, `stub()`, `withActors()`, `actor()`, `initialState`). Nota sul tiro: `hero()` ha `forza:3` e un'arma `contributeDice` in modalità `effect` (NON contribuisce ai tiri `check`), quindi un check usa `1d20 + forza`. Con `stub([0.95])` il d20 vale 20 (la mappa è `floor(next*sides)+1`):
```ts
describe('decide RequestCheck', () => {
  it('risolve una prova: emette CheckResolved con la CD dalla band e l outcome corretto', () => {
    const s = withActors(hero());
    const events = decide(
      s,
      { type: 'RequestCheck', actorId: 'eroe', attribute: 'forza', difficulty: 'moderate' },
      stub([0.95]), // d20 = 20
    );
    expect(events).toHaveLength(1);
    const ev = events[0]!;
    expect(ev.type).toBe('CheckResolved');
    if (ev.type === 'CheckResolved') {
      expect(ev.actorId).toBe('eroe');
      expect(ev.attribute).toBe('forza');
      expect(ev.difficulty).toBe('moderate');
      expect(ev.result.dc).toBe(15); // dcForDifficulty('moderate')
      expect(ev.result.total).toBe(23); // 20 (d20) + 3 (forza)
      expect(ev.result.margin).toBe(8); // 23 - 15
      expect(ev.result.outcome).toBe('success'); // margin >= 5
    }
  });

  it('omette attribute e skill quando assenti', () => {
    const s = withActors(hero());
    const ev = decide(s, { type: 'RequestCheck', actorId: 'eroe', difficulty: 'easy' }, stub([0.5]))[0]!;
    expect(ev.type).toBe('CheckResolved');
    expect('attribute' in ev).toBe(false);
    expect('skill' in ev).toBe(false);
  });

  it('lancia se l attore e sconosciuto, senza eventi', () => {
    expect(() =>
      decide(initialState, { type: 'RequestCheck', actorId: 'ignoto', difficulty: 'hard' }, stub([0.5])),
    ).toThrow('Attore sconosciuto: ignoto');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/engine/src/commands.test.ts`
Expected: FAIL — `RequestCheck` non è una variante valida di `Command` / il caso non esiste in `decide`.

- [ ] **Step 3: Implement command + decide**

In `packages/engine/src/commands.ts`:

(a) aggiungi gli import necessari. Gli import esistenti includono già `actorCheck`? NO — vanno aggiunti. In cima, accanto agli altri import dell'engine:
```ts
import { actorCheck } from './actor-check';
import { dcForDifficulty, type Difficulty } from './difficulty';
```

(b) aggiungi la variante alla union `Command` (dopo la variante `Attack`, riga ~13-23):
```ts
  | { type: 'RequestCheck'; actorId: string; attribute?: string; skill?: string; difficulty: Difficulty };
```

(c) in `decide`, aggiungi il caso subito PRIMA del `default:` (riga ~82). Rispecchia la costruzione del `CheckRequest` di `performAttack` (`includeEquipped: true`, attribute/skill con spread condizionali):
```ts
    case 'RequestCheck': {
      const actor = state.actors[command.actorId];
      if (actor === undefined) {
        throw new Error(`Attore sconosciuto: ${command.actorId}`);
      }
      const result = actorCheck(
        {
          actor,
          includeEquipped: true,
          dc: dcForDifficulty(command.difficulty),
          ...(command.attribute !== undefined ? { attribute: command.attribute } : {}),
          ...(command.skill !== undefined ? { skill: command.skill } : {}),
        },
        rng,
      );
      return [
        {
          type: 'CheckResolved',
          actorId: command.actorId,
          difficulty: command.difficulty,
          result,
          ...(command.attribute !== undefined ? { attribute: command.attribute } : {}),
          ...(command.skill !== undefined ? { skill: command.skill } : {}),
        },
      ];
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/engine/src/commands.test.ts`
Expected: PASS.
Run: `pnpm -C packages/engine typecheck`
Expected: pulito (il `default: never` di `decide` resta esaustivo perché abbiamo gestito `RequestCheck`).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/commands.ts packages/engine/src/commands.test.ts
git commit -m "feat(engine): Command RequestCheck -> decide risolve e emette CheckResolved (SP1)"
```

---

## Task 4: tool `request_check` (ai)

**Files:**
- Modify: `packages/ai/src/master-tools.ts`
- Modify: `packages/ai/src/master-tools.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/ai/src/master-tools.test.ts`:

(a) aggiorna l'asserzione dei nomi nel test `espone i 5 strumenti ...` (riga ~5-8): l'array atteso passa da 5 a 6 nomi (aggiungi `'request_check'`, mantieni l'ordine alfabetico di `.sort()`):
```ts
    expect(names).toEqual(['attack', 'end_turn', 'next_round', 'request_check', 'spawn_npc', 'start_encounter']);
```
(Opzionale: rinomina la descrizione del test da "5 strumenti" a "6 strumenti" — è una stringa con apostrofo-free, vedi §5.4.)

(b) aggiungi un nuovo blocco in fondo al file:
```ts
describe('resolveToolCall request_check', () => {
  it('mappa request_check valido a RequestCheck', () => {
    const r = resolveToolCall('request_check', '{"actorId":"pc1","attribute":"forza","difficulty":"hard"}');
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    expect(r.command).toEqual({ type: 'RequestCheck', actorId: 'pc1', attribute: 'forza', difficulty: 'hard' });
  });

  it('omette attribute e skill quando assenti', () => {
    const r = resolveToolCall('request_check', '{"actorId":"pc1","difficulty":"easy"}');
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    expect(r.command).toEqual({ type: 'RequestCheck', actorId: 'pc1', difficulty: 'easy' });
    expect('attribute' in r.command).toBe(false);
    expect('skill' in r.command).toBe(false);
  });

  it('rifiuta una difficolta fuori band', () => {
    const r = resolveToolCall('request_check', '{"actorId":"pc1","difficulty":"impossibile"}');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('difficulty');
  });

  it('rifiuta difficulty mancante', () => {
    const r = resolveToolCall('request_check', '{"actorId":"pc1"}');
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/ai/src/master-tools.test.ts`
Expected: FAIL — `request_check` non è un tool registrato (mapping assente; l'asserzione dei 6 nomi fallisce).

- [ ] **Step 3: Implement the tool**

In `packages/ai/src/master-tools.ts`:

(a) estendi l'import da `@loomn/engine` per portare il valore `DIFFICULTIES` (oltre al tipo `Command` già importato alla riga 7):
```ts
import type { Command } from '@loomn/engine';
import { DIFFICULTIES } from '@loomn/engine';
```

(b) aggiungi lo schema degli argomenti accanto agli altri schemi (es. dopo `startEncounterSchema`, riga ~52):
```ts
const requestCheckSchema = z.object({
  actorId: z.string().min(1),
  attribute: z.string().min(1).optional(),
  skill: z.string().min(1).optional(),
  difficulty: z.enum(DIFFICULTIES), // enum auto-validante: l AI non puo inventare una difficolta
});
```

(c) aggiungi la voce al registro `TOOLS` (es. dopo `attack`, riga ~121):
```ts
  request_check: makeEntry(
    'Chiede una prova di abilita: il motore tira e applica i gradi di successo in modo deterministico. La difficolta e qualitativa (trivial..legendary), non un numero.',
    requestCheckSchema,
    (a) => ({
      type: 'RequestCheck',
      actorId: a.actorId,
      difficulty: a.difficulty,
      ...(a.attribute !== undefined ? { attribute: a.attribute } : {}),
      ...(a.skill !== undefined ? { skill: a.skill } : {}),
    }),
  ),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/ai/src/master-tools.test.ts`
Expected: PASS.
Run: `pnpm -C packages/ai typecheck`
Expected: pulito.

- [ ] **Step 5: Full verification**

Run: `pnpm test`
Expected: **~304 passed** (baseline 292 + 2 + 3 + 3 + 4).
Run: `pnpm -r typecheck`
Expected: pulito su 6 progetti.
Run (guard apostrofo sui test toccati): `grep -nE "(it|describe)\('[^']*'[A-Za-zàèéìòù]" packages/ai/src/master-tools.test.ts packages/engine/src/commands.test.ts packages/engine/src/events.test.ts packages/engine/src/difficulty.test.ts packages/shared/src/domain-schema.test.ts`
Expected: nessun match.

- [ ] **Step 6: Commit**

```bash
git add packages/ai/src/master-tools.ts packages/ai/src/master-tools.test.ts
git commit -m "feat(ai): tool request_check -> RequestCheck (difficolta come enum auto-validante) (SP1)"
```

---

## Self-review (eseguito in fase di scrittura del piano)

**1. Copertura dello spec:**
- §2 band model → Task 1 (`difficulty.ts`, `DIFFICULTIES`/`dcForDifficulty`). ✓
- §3 Command/Event → Task 3 (`RequestCheck`+`decide`), Task 2 (`CheckResolved`+`applyEvent` no-op). ✓
- §4 tool + enum auto-validante → Task 4. Confine shared (riuso `checkResultSchema`, enum rispecchiato, drift guard) → Task 2. master-turn/reflection NON toccati (confermato). ✓
- §5 deferral → documentati in "Fuori ambito"; nessun task li implementa (corretto). ✓
- §6 test → coperti per pacchetto. ✓

**2. Placeholder scan:** nessun TBD/TODO; ogni step ha codice completo e comandi con output atteso. ✓

**3. Coerenza dei tipi:** `Difficulty`/`DIFFICULTIES` (Task 1) usati identici in events.ts (Task 2), commands.ts (Task 3), master-tools.ts (Task 4). `CheckResolved` shape identica in engine (Task 2), schema shared (Task 2), prodotta da `decide` (Task 3). `dcForDifficulty` firma coerente. `actorCheck`/`CheckRequest` usati come da `actor-check.ts` reale. ✓

**4. Ordine/accoppiamenti:** Task 1→2→3→4. Task 2 accoppia engine+shared per il drift guard bidirezionale (documentato). `commandSchema` non toccato (guard unidirezionale wire→motore). ✓

## Roadmap

SP1 è il sotto-progetto 1 di 4 della traccia engine (HANDOFF §0-septies/§0-quinquies item 3). Successivi: **SP2** `apply_effect`, **SP3** quest in L1 + `advance_quest`, **SP4** FSM di fase (§5.5). Poi gli altri item del backlog (G3/G4, F3/G5, segmentazione reflect) e infine Piano 10 (UI).

## Execution handoff

Esegui con `superpowers:subagent-driven-development` (un subagent per task + review spec/qualità), oppure `superpowers:executing-plans` (inline a checkpoint). Branch dedicato `feat/sp1-request-check`. Al termine: `superpowers:finishing-a-development-branch` (merge ff locale) + aggiorna HANDOFF/memoria.
