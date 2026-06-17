# SP2 — `apply_effect` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere lo strumento del Master `apply_effect`: l'AI propone *su chi / quale risorsa / in che direzione (`restore`|`drain`) / con quale espressione di dadi*; l'engine **tira** (RNG seedato), calcola il `delta` netto e **clampa** la risorsa, producendo un evento `ResourceEffectApplied`.

**Architecture:** Gemello strutturale di `Attack`/`RequestCheck`, ma **il codice possiede i numeri della conseguenza**: l'AI dichiara l'intento (direzione + forma della randomness), l'engine riusa `rollExpression` per tirare e `adjustResource` per clampare in `[0, max]`. Nuovo Command `ApplyEffect` → evento `ResourceEffectApplied` (che muta lo stato via `adjustResource`, come `DamageApplied`). Confine validato in `@loomn/shared`; tool esposto in `@loomn/ai`. Nessun nuovo modulo engine, nessun nuovo stato di dominio.

**Tech Stack:** TypeScript strict (monorepo pnpm), Zod (confine), Vitest (TDD), RNG seedato mulberry32 dell'engine.

**Spec di riferimento:** `docs/superpowers/specs/2026-06-17-sp2-apply-effect-design.md` (autorità). Spec di design generale: `2026-06-15-...-design.md` §5.4 (AI Master), principio "il codice è l'arbitro". Predecessore: SP1 (`2026-06-17-sp1-request-check-design.md`).

**Fuori ambito (NON toccare):** `master-turn.ts` e `host/reflection-ports.ts` (gestiscono `ResourceEffectApplied` per via generica — reiniezione `JSON.stringify`, ramo generico in `renderEventsForReflection`, `EXTRACT_SYSTEM` ignora le statistiche meccaniche — vedi spec §3); `commandSchema` (ApplyEffect è interno all'AI, non un dispatch IPC del renderer — il drift guard wire→motore è unidirezionale; confermato da SP1 con `RequestCheck`); `app/desktop`/UI/migrazioni; **condizioni/status** (entangled col vocabolario → item 4/Piano 11); **auto-downing** quando un drain esaurisce la risorsa; **effetti flat senza dadi**; validazione del vocabolario `resource` (oggi `adjustResource` lancia su risorsa ignota = comportamento voluto qui; il fallimento silenzioso `?? 0` di `attribute`/`skill` non riguarda SP2); `Ruleset` injection.

**Disciplina di scope (CRITICO, house rule §5.1):** ogni task modifica SOLO i file elencati nel task. MAI toccare `package.json`, `tsconfig*.json`, `vitest.config.ts`. Verifica `git status --short` prima di ogni commit. Bug apostrofo (§5.4): niente apostrofi (`l'`, `un'`, `c'è`, `dell'`) dentro le stringhe in apici singoli di `it('...')`/`describe('...')` — scrivi `l attore`, `un effetto`, `c e` (le lettere accentate `è/é` dentro la stringa vanno bene; il problema è solo l'apostrofo che chiude l'apice).

**Conteggio test atteso (cumulativo):** baseline **305** → Task 1 **309** → Task 2 **315** → Task 3 **325**.

---

## File Structure

- **Modify** `packages/engine/src/events.ts` — variante `ResourceEffectApplied` di `DomainEvent` + caso `applyEvent` (muta via `adjustResource`, come `DamageApplied`). Importa `RollResult` da `./dice`.
- **Modify** `packages/engine/src/events.test.ts` — test del clamp `[0, max]` (restore oltre max, drain sotto 0).
- **Modify** `packages/shared/src/domain-schema.ts` — variante `ResourceEffectApplied` dentro la `z.discriminatedUnion` interna (nessun campo opzionale top-level → NON serve un arm `z.union`; `roll` riusa `rollResultFields`).
- **Modify** `packages/shared/src/domain-schema.test.ts` — round-trip di `ResourceEffectApplied` con `roll` annidato + rifiuto campo obbligatorio mancante.
- **Modify** `packages/engine/src/commands.ts` — variante `ApplyEffect` di `Command` + caso `decide` (tira con `rollExpression`, magnitudine clampata `≥0`, segno dalla direzione). Importa `rollExpression`/`RollExpr`/`DieGroup` da `./dice`.
- **Modify** `packages/engine/src/commands.test.ts` — test della risoluzione (restore/drain/bonus/clamp/attore-risorsa sconosciuti).
- **Modify** `packages/ai/src/master-tools.ts` — nuovo helper coercivo-intero `llmInt(min)` (gemello di `llmNumber`) + schema `applyEffectSchema` + tool `apply_effect` → `ApplyEffect`.
- **Modify** `packages/ai/src/master-tools.test.ts` — test del tool (coercizioni G1/G6 + intero) + aggiorna l'asserzione "6 strumenti"→"7 strumenti".

---

## Task 1: evento `ResourceEffectApplied` (engine + shared, accoppiati dal drift guard)

> **Perché due pacchetti in un task:** il drift guard a compile-time in `packages/memory/src/sqlite-event-store.ts:85-90` verifica `DomainEvent` ↔ `z.infer<domainEventSchema>` in **entrambe le direzioni**, e `load()` fa `domainEventSchema.parse` su ogni evento. Aggiungere `ResourceEffectApplied` solo all'engine (o solo allo schema) rompe `pnpm -r typecheck` e la load. Vanno insieme. (Stesso accoppiamento del Task 2 di SP1.)

**Files:**
- Modify: `packages/engine/src/events.ts`
- Modify: `packages/engine/src/events.test.ts`
- Modify: `packages/shared/src/domain-schema.ts`
- Modify: `packages/shared/src/domain-schema.test.ts`

- [ ] **Step 1: Write the failing test (engine clamp)**

In `packages/engine/src/events.test.ts`, aggiungi questi due test dentro il `describe('applyEvent', ...)`, subito DOPO il test `CheckResolved non cambia lo stato ...` (riga ~121). Usano l'helper `actor(id, hp)` esistente (risorsa `hp` con `max: 10`). Il `roll` annidato è solo provenienza: `applyEvent` usa il `delta`, non rigioca i dadi.
```ts
  it('ResourceEffectApplied con delta positivo ripristina la risorsa clampando a max', () => {
    const base = withActors(actor('eroe', 4)); // hp 4/10
    const roll: RollResult = { dice: [{ sides: 6, value: 6 }], modifierTotal: 0, total: 6, mode: 'effect' };
    const s = applyEvent(base, { type: 'ResourceEffectApplied', targetId: 'eroe', resource: 'hp', delta: 8, roll });
    expect(s.actors['eroe']?.resources['hp']?.current).toBe(10); // 4 + 8 = 12 -> clamp a max 10
    expect(s.version).toBe(base.version + 1);
  });

  it('ResourceEffectApplied con delta negativo prosciuga la risorsa clampando a 0', () => {
    const base = withActors(actor('eroe', 3)); // hp 3/10
    const roll: RollResult = { dice: [{ sides: 6, value: 5 }], modifierTotal: 0, total: 5, mode: 'effect' };
    const s = applyEvent(base, { type: 'ResourceEffectApplied', targetId: 'eroe', resource: 'hp', delta: -5, roll });
    expect(s.actors['eroe']?.resources['hp']?.current).toBe(0); // 3 - 5 = -2 -> clamp a 0
  });
```
Aggiungi l'import del tipo `RollResult` in cima al file, sulla riga dell'import di `CheckResult` (riga 3). Sostituisci:
```ts
import type { CheckResult } from './check';
```
con:
```ts
import type { CheckResult } from './check';
import type { RollResult } from './dice';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/engine/src/events.test.ts`
Expected: FAIL — `ResourceEffectApplied` non è una variante valida di `DomainEvent` (errore di tipo) o il caso non esiste in `applyEvent`.

- [ ] **Step 3: Implement engine event**

In `packages/engine/src/events.ts`:

(a) aggiungi l'import del tipo `RollResult` da `./dice`. Sostituisci la riga 2 (`import type { CheckResult } from './check';`) con:
```ts
import type { CheckResult } from './check';
import type { RollResult } from './dice';
```

(b) aggiungi la variante alla union `DomainEvent`, subito DOPO `CheckResolved` (riga 17). Ricorda di spostare il `;` finale: la variante `CheckResolved` chiude la union, quindi togli il `;` da lì e mettilo dopo la nuova variante:
```ts
  | { type: 'CheckResolved'; actorId: string; attribute?: string; skill?: string; difficulty: Difficulty; result: CheckResult }
  | { type: 'ResourceEffectApplied'; targetId: string; resource: string; delta: number; roll: RollResult };
```

(c) in `applyEvent`, aggiungi il caso subito DOPO il caso `DamageApplied` (riga 66-69). Riusa `adjustResource`/`requireActor` come `DamageApplied` (il `delta` è già firmato: restore positivo, drain negativo):
```ts
    case 'ResourceEffectApplied': {
      // Il delta e gia risolto e firmato nell evento (replay-safe, niente RNG nel proiettore).
      // adjustResource clampa current in [0, max], come DamageApplied. Il roll e provenienza,
      // non viene rigiocato.
      const target = adjustResource(requireActor(state, event.targetId), event.resource, event.delta);
      return { ...bumped, actors: { ...state.actors, [event.targetId]: target } };
    }
```

- [ ] **Step 4: Run engine test to verify it passes**

Run: `pnpm exec vitest run packages/engine/src/events.test.ts`
Expected: PASS.
Run: `pnpm -C packages/engine typecheck`
Expected: pulito.

> Nota: a questo punto `pnpm -r typecheck` (intero monorepo) **fallisce di proposito** sul drift guard di `memory` — lo schema shared non ha ancora `ResourceEffectApplied`. Lo si chiude negli step seguenti. Non committare ancora.

- [ ] **Step 5: Write the failing test (shared schema)**

In `packages/shared/src/domain-schema.test.ts`, aggiungi questi due test dentro il `describe('domainEventSchema', ...)`, subito DOPO il test `rifiuta una difficolta fuori band in CheckResolved` (riga ~117):
```ts
  it('valida e fa round-trip di ResourceEffectApplied con roll annidato', () => {
    const event = {
      type: 'ResourceEffectApplied' as const,
      targetId: 'pc-eldra',
      resource: 'hp',
      delta: 7,
      roll: {
        dice: [{ sides: 6, value: 4 }, { sides: 6, value: 2 }],
        modifierTotal: 1,
        total: 7,
        mode: 'effect' as const,
      },
    };
    expect(domainEventSchema.parse(event)).toEqual(event);
  });

  it('rifiuta ResourceEffectApplied con un campo obbligatorio mancante (delta)', () => {
    expect(() =>
      domainEventSchema.parse({
        type: 'ResourceEffectApplied',
        targetId: 'pc-eldra',
        resource: 'hp',
        roll: { dice: [{ sides: 6, value: 4 }], modifierTotal: 0, total: 4, mode: 'effect' },
      }),
    ).toThrow();
  });
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm exec vitest run packages/shared/src/domain-schema.test.ts`
Expected: FAIL — `domainEventSchema` non riconosce `ResourceEffectApplied` (il parse del round-trip fallisce).

- [ ] **Step 7: Implement shared schema**

In `packages/shared/src/domain-schema.ts`, aggiungi la variante `ResourceEffectApplied` come **9° membro della `z.discriminatedUnion` interna**, subito DOPO il membro `NarrationRecorded` (riga 173). Nessun campo opzionale top-level → entra direttamente nella `discriminatedUnion` (NON serve un arm `z.union` con `.transform()` come `CheckResolved`). `roll` riusa `rollResultFields` (gli stessi campi che `checkResultSchema` riusa per `AttackResolved`):
```ts
    z.object({ type: z.literal('NarrationRecorded'), playerAction: z.string(), narration: z.string() }),
    z.object({
      type: z.literal('ResourceEffectApplied'),
      targetId: z.string(),
      resource: z.string(),
      delta: z.number(),
      roll: z.object({ ...rollResultFields }),
    }),
```
> Il blocco `checkResolvedEventSchema` (arm separato di `z.union`) resta INVARIATO: `ResourceEffectApplied` non ha opzionali top-level e quindi non ha bisogno di stare lì.

- [ ] **Step 8: Run tests + full typecheck to verify green**

Run: `pnpm exec vitest run packages/shared/src/domain-schema.test.ts packages/engine/src/events.test.ts`
Expected: PASS.
Run: `pnpm -r typecheck`
Expected: pulito su tutti i progetti (il drift guard bidirezionale di `memory` ora è soddisfatto: engine e shared hanno entrambi `ResourceEffectApplied` allineati; `roll: RollResult` ↔ `z.object({ ...rollResultFields })`).

- [ ] **Step 9: Commit**

```bash
git add packages/engine/src/events.ts packages/engine/src/events.test.ts packages/shared/src/domain-schema.ts packages/shared/src/domain-schema.test.ts
git commit -m "feat(engine,shared): evento ResourceEffectApplied (clamp via adjustResource) per apply_effect (SP2)"
```

---

## Task 2: Command `ApplyEffect` + `decide`

**Files:**
- Modify: `packages/engine/src/commands.ts`
- Modify: `packages/engine/src/commands.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/engine/src/commands.test.ts`, aggiungi un nuovo blocco in fondo al file (usa gli helper esistenti `actor()`, `withActors()`, `stub()`, `initialState`). Nota sul tiro: `stub([v])` mappa un d6 con `floor(v*6)+1`, quindi `stub([0.5])` su un `d6` dà `floor(3)+1 = 4`. Per `2d6` con `stub([0.5])` (ciclico) entrambi i dadi danno 4 → totale 8.
```ts
describe('decide ApplyEffect', () => {
  it('restore: emette ResourceEffectApplied con delta positivo e roll registrato', () => {
    const s = withActors(actor('eroe'));
    const events = decide(
      s,
      { type: 'ApplyEffect', targetId: 'eroe', resource: 'hp', direction: 'restore', dice: [{ count: 2, sides: 6 }] },
      stub([0.5]), // ogni d6 = 4 -> 2d6 = 8
    );
    expect(events).toHaveLength(1);
    const ev = events[0]!;
    expect(ev.type).toBe('ResourceEffectApplied');
    if (ev.type === 'ResourceEffectApplied') {
      expect(ev.targetId).toBe('eroe');
      expect(ev.resource).toBe('hp');
      expect(ev.delta).toBe(8); // +8 (restore)
      expect(ev.roll.total).toBe(8);
      expect(ev.roll.mode).toBe('effect');
    }
  });

  it('drain: emette ResourceEffectApplied con delta negativo', () => {
    const s = withActors(actor('eroe'));
    const ev = decide(
      s,
      { type: 'ApplyEffect', targetId: 'eroe', resource: 'hp', direction: 'drain', dice: [{ count: 2, sides: 6 }] },
      stub([0.5]),
    )[0]!;
    expect(ev.type).toBe('ResourceEffectApplied');
    if (ev.type === 'ResourceEffectApplied') {
      expect(ev.delta).toBe(-8); // -8 (drain)
    }
  });

  it('il bonus piatto entra nel roll e nel delta', () => {
    const s = withActors(actor('eroe'));
    const ev = decide(
      s,
      { type: 'ApplyEffect', targetId: 'eroe', resource: 'hp', direction: 'restore', dice: [{ count: 1, sides: 6 }], bonus: 3 },
      stub([0.5]), // 1d6 = 4, + bonus 3 = 7
    )[0]!;
    if (ev.type !== 'ResourceEffectApplied') throw new Error('atteso ResourceEffectApplied');
    expect(ev.roll.modifierTotal).toBe(3);
    expect(ev.roll.total).toBe(7);
    expect(ev.delta).toBe(7);
  });

  it('magnitudine clampata a >=0: un bonus molto negativo non inverte la direzione del restore', () => {
    const s = withActors(actor('eroe'));
    const ev = decide(
      s,
      { type: 'ApplyEffect', targetId: 'eroe', resource: 'hp', direction: 'restore', dice: [{ count: 1, sides: 6 }], bonus: -100 },
      stub([0.5]), // 1d6 = 4, + (-100) = -96 -> magnitudine max(0, -96) = 0
    )[0]!;
    if (ev.type !== 'ResourceEffectApplied') throw new Error('atteso ResourceEffectApplied');
    expect(ev.delta).toBe(0); // restore non drena mai
  });

  it('lancia se l attore e sconosciuto, senza eventi', () => {
    expect(() =>
      decide(initialState, { type: 'ApplyEffect', targetId: 'ignoto', resource: 'hp', direction: 'restore', dice: [{ count: 1, sides: 6 }] }, stub([0.5])),
    ).toThrow('Attore sconosciuto: ignoto');
  });

  it('lancia se la risorsa e sconosciuta, senza eventi', () => {
    const s = withActors(actor('eroe'));
    expect(() =>
      decide(s, { type: 'ApplyEffect', targetId: 'eroe', resource: 'mana', direction: 'restore', dice: [{ count: 1, sides: 6 }] }, stub([0.5])),
    ).toThrow('Risorsa sconosciuta: mana');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/engine/src/commands.test.ts`
Expected: FAIL — `ApplyEffect` non è una variante valida di `Command` / il caso non esiste in `decide`.

- [ ] **Step 3: Implement command + decide**

In `packages/engine/src/commands.ts`:

(a) estendi l'import da `./dice` (riga 3, oggi `import type { Modifier } from './dice';`) per portare anche il valore `rollExpression` e i tipi `DieGroup`/`RollExpr`. Sostituisci la riga 3 con:
```ts
import { rollExpression, type Modifier, type DieGroup, type RollExpr } from './dice';
```

(b) aggiungi la variante alla union `Command`, subito DOPO `RequestCheck` (riga 26). Sposta il `;` finale: togli il `;` da `RequestCheck` e mettilo dopo la nuova variante:
```ts
  | { type: 'RequestCheck'; actorId: string; attribute?: string; skill?: string; difficulty: Difficulty }
  | { type: 'ApplyEffect'; targetId: string; resource: string; direction: 'restore' | 'drain'; dice: DieGroup[]; bonus?: number };
```

(c) in `decide`, aggiungi il caso subito PRIMA del `default:` (riga 111). L'engine possiede segno e magnitudine: tira con `rollExpression` (mode `effect`), clampa la magnitudine a `≥0` e applica il segno dalla `direction`. Rifiuta attore/risorsa sconosciuti PRIMA di tirare (niente evento non proiettabile):
```ts
    case 'ApplyEffect': {
      const target = state.actors[command.targetId];
      if (target === undefined) {
        throw new Error(`Attore sconosciuto: ${command.targetId}`);
      }
      if (target.resources[command.resource] === undefined) {
        throw new Error(`Risorsa sconosciuta: ${command.resource}`);
      }
      const expr: RollExpr = {
        dice: command.dice,
        modifiers: command.bonus !== undefined ? [{ value: command.bonus, source: 'effect' }] : [],
        mode: 'effect',
      };
      const roll = rollExpression(expr, rng);
      const magnitude = Math.max(0, roll.total); // restore non drena mai, e viceversa
      const delta = command.direction === 'restore' ? magnitude : -magnitude;
      return [{ type: 'ResourceEffectApplied', targetId: command.targetId, resource: command.resource, delta, roll }];
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/engine/src/commands.test.ts`
Expected: PASS.
Run: `pnpm -C packages/engine typecheck`
Expected: pulito (il `default: never` di `decide` resta esaustivo perché abbiamo gestito `ApplyEffect`).

> Nota: `commandSchema` (shared) NON viene toccato. Il drift guard del payload IPC è unidirezionale (wire→motore): aggiungere una variante a `Command` non rompe `z.infer<commandSchema>` assegnabile a `Command` (SP1 lo ha già dimostrato con `RequestCheck`). `pnpm -r typecheck` resta verde.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/commands.ts packages/engine/src/commands.test.ts
git commit -m "feat(engine): Command ApplyEffect -> decide tira e emette ResourceEffectApplied (SP2)"
```

---

## Task 3: helper `llmInt` + tool `apply_effect` (ai)

**Files:**
- Modify: `packages/ai/src/master-tools.ts`
- Modify: `packages/ai/src/master-tools.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/ai/src/master-tools.test.ts`:

(a) aggiorna il test `espone i 6 strumenti ...` (riga ~5-8): l'array atteso passa da 6 a 7 nomi (aggiungi `'apply_effect'`, mantieni l'ordine alfabetico di `.sort()` — `apply_effect` precede `attack`). Sostituisci:
```ts
  it('espone i 6 strumenti con schemi JSON inline (niente ref)', () => {
    const defs = masterToolDefs();
    const names = defs.map((d) => d.name).sort();
    expect(names).toEqual(['attack', 'end_turn', 'next_round', 'request_check', 'spawn_npc', 'start_encounter']);
```
con:
```ts
  it('espone i 7 strumenti con schemi JSON inline (niente ref)', () => {
    const defs = masterToolDefs();
    const names = defs.map((d) => d.name).sort();
    expect(names).toEqual(['apply_effect', 'attack', 'end_turn', 'next_round', 'request_check', 'spawn_npc', 'start_encounter']);
```

(b) aggiungi un nuovo blocco in fondo al file. Copre: mapping valido restore con bonus; bonus omesso quando assente; coercizione `dice` stringificato (G6); coercizione `count`/`sides` stringa→intero (llmInt + G1); coercizione `bonus` stringa (G1); `direction` fuori enum rifiutata; `dice` vuoto rifiutato (`.min(1)`); `sides` non intero (decimale) rifiutato (llmInt strict); `count` sotto il minimo rifiutato; più una guardia che lo schema JSON mostra `dice` come array e `direction` come enum (la coercizione resta trasparente al modello):
```ts
describe('resolveToolCall apply_effect', () => {
  it('mappa apply_effect valido a ApplyEffect (restore) con bonus', () => {
    const r = resolveToolCall(
      'apply_effect',
      '{"targetId":"pc1","resource":"hp","direction":"restore","dice":[{"count":2,"sides":6}],"bonus":1}',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    expect(r.command).toEqual({
      type: 'ApplyEffect',
      targetId: 'pc1',
      resource: 'hp',
      direction: 'restore',
      dice: [{ count: 2, sides: 6 }],
      bonus: 1,
    });
  });

  it('omette bonus quando assente', () => {
    const r = resolveToolCall(
      'apply_effect',
      '{"targetId":"pc1","resource":"hp","direction":"drain","dice":[{"count":1,"sides":8}]}',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    expect(r.command).toEqual({
      type: 'ApplyEffect',
      targetId: 'pc1',
      resource: 'hp',
      direction: 'drain',
      dice: [{ count: 1, sides: 8 }],
    });
    expect('bonus' in r.command).toBe(false);
  });

  it('coerce dice stringificato a array (G6)', () => {
    const r = resolveToolCall(
      'apply_effect',
      '{"targetId":"pc1","resource":"hp","direction":"restore","dice":"[{\\"count\\":2,\\"sides\\":6}]"}',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    if (r.command.type !== 'ApplyEffect') throw new Error('atteso ApplyEffect');
    expect(r.command.dice).toEqual([{ count: 2, sides: 6 }]);
  });

  it('coerce count e sides stringa numerica a intero (llmInt + G1)', () => {
    const r = resolveToolCall(
      'apply_effect',
      '{"targetId":"pc1","resource":"hp","direction":"restore","dice":[{"count":"2","sides":"6"}]}',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    if (r.command.type !== 'ApplyEffect') throw new Error('atteso ApplyEffect');
    expect(r.command.dice).toEqual([{ count: 2, sides: 6 }]);
  });

  it('coerce bonus stringa numerica (G1)', () => {
    const r = resolveToolCall(
      'apply_effect',
      '{"targetId":"pc1","resource":"hp","direction":"restore","dice":[{"count":1,"sides":6}],"bonus":"2"}',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    if (r.command.type !== 'ApplyEffect') throw new Error('atteso ApplyEffect');
    expect(r.command.bonus).toBe(2);
  });

  it('rifiuta direction fuori enum', () => {
    const r = resolveToolCall(
      'apply_effect',
      '{"targetId":"pc1","resource":"hp","direction":"heal","dice":[{"count":1,"sides":6}]}',
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('direction');
  });

  it('rifiuta dice vuoto (.min(1) sopravvive)', () => {
    const r = resolveToolCall(
      'apply_effect',
      '{"targetId":"pc1","resource":"hp","direction":"restore","dice":[]}',
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('dice');
  });

  it('rifiuta sides non intero (decimale): llmInt e strict', () => {
    const r = resolveToolCall(
      'apply_effect',
      '{"targetId":"pc1","resource":"hp","direction":"restore","dice":[{"count":1,"sides":6.5}]}',
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('sides');
  });

  it('rifiuta count sotto il minimo (count >= 1)', () => {
    const r = resolveToolCall(
      'apply_effect',
      '{"targetId":"pc1","resource":"hp","direction":"restore","dice":[{"count":0,"sides":6}]}',
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('count');
  });

  it('mostra dice come array e direction come enum nello schema (coercizione trasparente)', () => {
    const ae = masterToolDefs().find((d) => d.name === 'apply_effect');
    if (ae === undefined) throw new Error('atteso apply_effect');
    const props = (ae.parameters as { properties: Record<string, { type?: string; enum?: string[]; minItems?: number }> }).properties;
    expect(props.dice?.type).toBe('array');
    expect(props.dice?.minItems).toBe(1);
    expect(props.direction?.enum).toEqual(['restore', 'drain']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/ai/src/master-tools.test.ts`
Expected: FAIL — `apply_effect` non è un tool registrato (mapping assente; l'asserzione dei 7 nomi fallisce).

- [ ] **Step 3: Implement the helper + tool**

In `packages/ai/src/master-tools.ts`:

(a) **nessun nuovo import da `@loomn/engine`.** `ApplyEffect` è una variante di `Command`, già importato come tipo (riga 7, `import type { Command } from '@loomn/engine';`); il mapper costruisce un literal `Command` e non referenzia `DieGroup` direttamente.

(b) aggiungi l'helper `llmInt(min)` subito DOPO la funzione `llmArray` (riga 46), prima di `resourcePoolSchema`. Gemello coercivo-intero di `llmNumber`, stessa politica STRICT: coerce SOLO stringhe numeriche, poi valida come intero `>= min`. Stringa vuota/non-numerica/decimale/`null`/mancante/non-finita → RIFIUTATA (`z.number().int()` rifiuta già `Infinity`/`NaN` e i decimali). Factory perché il minimo cambia per campo (count≥1, sides≥2) e il vincolo deve vivere nello schema avvolto dal preprocess (un `z.preprocess` produce un `ZodEffects` su cui non si possono concatenare `.int()/.min()`):
```ts
// Coercivo-intero: gemello di llmNumber per i campi che DEVONO essere interi (count/sides dei
// dadi). Stessa politica strict: coerce SOLO stringhe numeriche, poi valida come intero >= min.
// Stringa vuota/whitespace/non-numerica/decimale/null/mancante/non-finita -> RIFIUTATA
// (z.number().int() rifiuta gia decimali, Infinity e NaN). Niente intero silenzioso: il codice
// resta l arbitro. Factory perche il minimo varia per campo e va dentro lo schema avvolto.
function llmInt(min: number) {
  return z.preprocess((v) => {
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed === '') return v; // resta stringa -> z.number la rifiuta
      const n = Number(trimmed);
      return Number.isNaN(n) ? v : n; // numerica -> numero; non-numerica -> resta stringa (rifiutata)
    }
    return v; // number passa; null/undefined arrivano a z.number e sono rifiutati
  }, z.number().int().min(min));
}
```

(c) aggiungi lo schema degli argomenti del dado e del tool, subito DOPO `requestCheckSchema` (riga ~82) e PRIMA di `endTurnSchema`. `dieGroupArgSchema` produce `{ count, sides }` (assegnabile a `DieGroup`, il cui `tag` è opzionale); `dice` usa `llmArray` (G6) attorno a `z.array(...).min(1)`; `bonus` usa `llmNumber.optional()` (G1); `direction` è un enum auto-validante:
```ts
const dieGroupArgSchema = z.object({
  count: llmInt(1), // almeno 1 dado
  sides: llmInt(2), // almeno un d2
});

const applyEffectSchema = z.object({
  targetId: z.string().min(1),
  resource: z.string().min(1),
  direction: z.enum(['restore', 'drain']), // enum auto-validante: l AI dichiara l intento, non il segno
  dice: llmArray(z.array(dieGroupArgSchema).min(1)), // G6: accetta anche un array stringificato
  bonus: llmNumber.optional(), // G1: accetta "2" oltre a 2
});
```

(d) aggiungi la voce al registro `TOOLS`, subito DOPO `request_check` (riga ~148). Il mapper omette `bonus` quando assente (spread condizionale, come `attribute`/`skill` altrove):
```ts
  apply_effect: makeEntry(
    'Applica una conseguenza su una risorsa di un attore: il motore tira l espressione di dadi e clampa la risorsa in modo deterministico. direction e restore (ripristina) o drain (prosciuga); i dadi sono {count,sides}.',
    applyEffectSchema,
    (a) => ({
      type: 'ApplyEffect',
      targetId: a.targetId,
      resource: a.resource,
      direction: a.direction,
      dice: a.dice,
      ...(a.bonus !== undefined ? { bonus: a.bonus } : {}),
    }),
  ),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/ai/src/master-tools.test.ts`
Expected: PASS.
Run: `pnpm -C packages/ai typecheck`
Expected: pulito (l'output di `applyEffectSchema.dice` = `{count:number;sides:number}[]` è assegnabile a `DieGroup[]`; `bonus?` cast-free via spread).

- [ ] **Step 5: Full verification**

Run: `pnpm test`
Expected: **325 passed** (baseline 305 + 4 + 6 + 10).
Run: `pnpm -r typecheck`
Expected: pulito su 6 progetti.
Run (guard apostrofo sui test toccati): `grep -nE "(it|describe)\('[^']*'[A-Za-zàèéìòù]" packages/ai/src/master-tools.test.ts packages/engine/src/commands.test.ts packages/engine/src/events.test.ts packages/shared/src/domain-schema.test.ts`
Expected: nessun match.

- [ ] **Step 6: Commit**

```bash
git add packages/ai/src/master-tools.ts packages/ai/src/master-tools.test.ts
git commit -m "feat(ai): tool apply_effect -> ApplyEffect (llmInt per count/sides, direction enum auto-validante) (SP2)"
```

---

## Self-review (eseguito in fase di scrittura del piano)

**1. Copertura dello spec:**
- §1 "dove vivono i numeri" (l'engine tira, l'AI dichiara direzione + forma dei dadi) → Task 2 (`decide` usa `rollExpression`, `direction` possiede il segno). ✓
- §2 Command/Event/risoluzione → Task 2 (`ApplyEffect`+`decide`, magnitudine `≥0`), Task 1 (`ResourceEffectApplied`+`applyEvent` clamp `[0,max]`, registra `roll`). ✓
- §3 confine AI (tool + coercizioni G1/G6 + helper intero), `master-turn`/`reflection` NON toccati, confine shared (`roll` riusa `rollResultFields`, nessun opzionale top-level → nella discriminatedUnion) → Task 3 (tool + `llmInt`), Task 1 (schema shared). ✓
- §4 deferral (condizioni/status, auto-downing, flat, Ruleset) → documentati in "Fuori ambito"; nessun task li implementa. ✓
- §5 test → coperti per pacchetto (engine clamp + risoluzione, ai coercizioni, shared round-trip). ✓
- §6 file toccati → 3 pacchetti (engine+shared+ai); niente nuovo modulo engine, niente `master-turn`/`reflection`/`commandSchema`/UI/migrazioni. ✓

**2. Placeholder scan:** nessun TBD/TODO; ogni step ha codice completo e comandi con output atteso. ✓

**3. Type consistency:** `ResourceEffectApplied { targetId, resource, delta, roll: RollResult }` identico in engine (Task 1), schema shared (Task 1), prodotto da `decide` (Task 2). `ApplyEffect { targetId, resource, direction, dice: DieGroup[], bonus? }` identico in `Command` (Task 2) e prodotto dal mapper del tool (Task 3). `rollExpression`/`RollExpr`/`DieGroup`/`RollResult` usati come da `dice.ts` reale. `adjustResource` come da `resource.ts` (clamp `[0,max]`, throw su risorsa ignota). `llmInt(min)` gemello di `llmNumber`. ✓

**4. Ordine/accoppiamenti:** Task 1→2→3. Task 1 accoppia engine+shared per il drift guard bidirezionale (documentato). Task 2 dipende dall'evento di Task 1 (lo produce). Task 3 dipende dal Command di Task 2 (lo mappa). `commandSchema` non toccato (guard unidirezionale wire→motore, confermato da SP1). ✓

## Roadmap

SP2 è il sotto-progetto 2 di 4 della traccia engine (HANDOFF §0-octies/§0-quinquies item 3). Successivi: **SP3** quest in L1 + `advance_quest` (DESIGN-FIRST → brainstorming), **SP4** FSM di fase §5.5 (DESIGN-FIRST → brainstorming). Poi gli altri item del backlog (G3/G4 vocabolario, F3/G5 estrazione, segmentazione reflect) e infine Piano 10 (UI).

## Execution handoff

Esegui con `superpowers:subagent-driven-development` (un subagent per task + review spec/qualità), oppure `superpowers:executing-plans` (inline a checkpoint). Branch dedicato `feat/sp2-apply-effect`. Al termine: `superpowers:finishing-a-development-branch` (merge ff locale) + aggiorna HANDOFF/memoria.
