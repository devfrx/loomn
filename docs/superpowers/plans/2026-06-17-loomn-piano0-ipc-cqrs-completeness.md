# Piano 0 — IPC/CQRS completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completare il confine IPC/CQRS (spec autorita §4/§5.2) cosi che la UV del Piano 10 possa emettere **tutti** i Command del motore e leggere **tutto** il backend gia esistente — senza streaming, senza delta read-model, senza nuove feature di dominio.

**Architecture:** Lavoro additivo e cast-free sul confine renderer↔main. **WRITE side:** `commandSchema` (`@loomn/shared`) passa da 5 a tutte e 11 le varianti `Command` del motore (le 6 mancanti — RequestCheck/ApplyEffect/StartQuest/AdvanceQuest/EnterPhase/EndEncounter — esistono in engine ma non attraversano l IPC). **READ side:** gli `events` (coi `RollResult`) gia ritornati da `CampaignService.dispatch/runTurn` smettono di essere scartati dall handler IPC; nuovi canali read on-demand espongono la storia di narrazione (`NarrationRecorded`, paginata cursor-by-seq), il canon ledger (`ledger.active/all`) e i riassunti L2 (`summaries.list`). `CampaignService` resta l application layer (unico accesso a `memory`); `app/desktop` resta un adapter IPC sottile. Il read-model push resta lo snapshot `{version, state}` (i canali read non lo gonfiano).

**Tech Stack:** TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Zod 3.25, Vitest, Electron 42 (`ipcMain.handle` / `contextBridge`), monorepo pnpm. Nessuna nuova dipendenza, nessuna modifica a `package.json`/`tsconfig`/`vitest.config`/`electron.vite.config`.

---

## Contesto e riferimenti

- **Spec autorita del Piano 0:** `docs/superpowers/specs/2026-06-17-piano10-ui-design.md` §7 (audit di binding), §8 (lacune → Piano 0), §10 (decomposizione: Piano 0 e il primo). **Spec autorita generale:** `docs/superpowers/specs/2026-06-15-simulatore-campagne-ai-design.md` §4 (sicurezza/IPC), §5.2 (CQRS), §13 (delta read-model = deferito).
- **Decisione di design presa con l utente (2026-06-17):** la paginazione dei canali read e **cursor-by-seq** (`{ before?, limit? }` → `{ entries, hasMore }`, newest-first), stabile sotto append. Canon e L2 restano interrogati per filtro (sono limitati).
- **File del confine (gia esistenti, da modificare):**
  - `packages/shared/src/domain-schema.ts` — `commandSchema` (5 varianti oggi), `domainEventSchema`, building block (`difficultySchema`, `questOutcomeSchema`, `phaseSchema`, `dieGroupSchema`).
  - `packages/shared/src/ipc.ts` — `IPC_CHANNELS`, schemi richiesta/esito, `LoomnBridge`.
  - `packages/host/src/campaign-service.ts` — `CampaignService` (`getReadModel/dispatch/runTurn/reflect`; `DispatchOutcome`/`TurnOutcome` ritornano gia `events`).
  - `app/desktop/src/main/index.ts` — handler IPC sottili (oggi scartano gli `events`).
  - `app/desktop/src/preload/index.ts` — bridge tipizzato.
  - `app/desktop/src/renderer/src/renderer.ts` — self-test `LOOMN_SELFTEST` (gate "esegui l app").
- **Verita di tipo gia verificate (vedi i file):** `Command` union (engine `commands.ts:14-35`); `SoftPhase = 'exploration'|'dialogue'|'downtime'` (engine `phase.ts:8-9`); `DieGroup = {count,sides,tag?}` (engine `dice.ts:5-9`); `CanonFact`/`CanonFactFilter`/`Summary`/`SummaryFilter` esportati da `@loomn/memory`; `StoredEvent = {seq, event: DomainEvent}` (engine `event-store.ts:4-7`); `NarrationRecorded = {playerAction, narration}` (variante di `DomainEvent`).

## Disciplina di scope (CRITICO — vale per ogni task, house rule §5.1)

- Ogni subagent modifica **SOLO** i file elencati nel suo task. **MAI** toccare `package.json`, `tsconfig*.json`, `vitest.config.ts`, `electron.vite.config.ts`. Non esiste alcun passo orchestratore di manifesto in questo piano: tutte le dipendenze necessarie esistono gia (`@loomn/shared` e gia devDependency di `@loomn/host`; `domainEventSchema` e gia in `@loomn/shared`; `@loomn/memory` e gia dependency di `@loomn/host`; `app/desktop` dipende gia da `@loomn/shared`/`@loomn/host`/`@loomn/engine`; gli script `rebuild:electron`/`rebuild:node` esistono gia in root).
- `git status --short` prima di ogni commit: devono comparire SOLO i file del task.
- Niente apostrofi nelle stringhe `it('...')`/`describe('...')` in apici singoli (house rule §5.4): scrivi `all avvio`, `l esito`, `c e`. Le lettere accentate (`e`, `a`) vanno bene; gli apostrofi (`'`) spezzano la stringa.
- TS strict (house rule §5.6): `exactOptionalPropertyTypes` → niente `campo: undefined`; usa spread condizionali `...(x !== undefined ? { campo: x } : {})`. `noUncheckedIndexedAccess` → accesso array/record e `T | undefined`.

## Fuori ambito (esplicito)

- **Streaming del turno** (token-by-token / canale progress): deferito (spec Piano 10 §11), la UI gira su request/response.
- **Delta read-model** (spec generale §13): deferito; il push resta lo snapshot completo `{version, state}`.
- **Feature di dominio nuove:** equip/movimento come Command/Event, slot inventario profondi, relazioni strutturate (spec Piano 10 §11). Nessun nuovo `Command`/`Event`/tabella: il motore ha gia tutte e 11 le varianti `Command`.
- **Persistenza del cursor di narrazione:** non serve. La storia di narrazione e ricavata leggendo lo stream esistente (`eventStore.load()`), nessun nuovo stato.
- **Query SQL paginata nativa per la narrazione:** Task 4 carica lo stream e affetta in memoria (stesso pattern di `rebuild`/`reflect`). Il **contratto** cursor-by-seq e forward-compatible con una futura impl SQL — nessun debito di contratto, solo una nota di efficienza (vedi Task 4).

---

## File da creare / modificare

| File | Azione | Responsabilita |
|---|---|---|
| `packages/shared/src/domain-schema.ts` | Modify | +`softPhaseSchema`; +6 sotto-schemi Command; estendere l unione `commandSchema` |
| `packages/shared/src/command-schema.test.ts` | Modify | Test di parsing dei 6 nuovi Command (valido / omit opzionali / rifiuto) |
| `packages/host/src/command-schema.test.ts` | **Create** | Drift guard cast-free: i 6 nuovi `commandSchema.parse(...)` assegnabili a `Command` del motore |
| `packages/shared/src/ipc.ts` | Modify | +`events` nei result dispatch/run-turn; +3 canali read (schemi richiesta/esito) + 3 metodi su `LoomnBridge` |
| `packages/shared/src/ipc.test.ts` | Modify | Test dei nuovi schemi + aggiornamento dei 2 test result esistenti (ripple `events`) |
| `packages/host/src/campaign-service.ts` | Modify | +`getNarrationHistory`/`getCanon`/`getSummaries` (read on-demand, sincroni, fuori dalla coda FIFO) |
| `packages/host/src/campaign-service.test.ts` | Modify | Test dei tre read method (paginazione/filtri) |
| `app/desktop/src/main/index.ts` | Modify | +`events` nei result; +3 handler read |
| `app/desktop/src/preload/index.ts` | Modify | +3 metodi bridge |
| `app/desktop/src/renderer/src/renderer.ts` | Modify | Estendere il self-test fase 1: events nel result + i 3 canali read |

---

## Task 1: WRITE side — `commandSchema` = unione `Command` completa

**Files:**
- Modify: `packages/shared/src/domain-schema.ts`
- Test: `packages/shared/src/command-schema.test.ts`

`@loomn/shared` e FOGLIA (non importa engine): i building block riusati (`difficultySchema` riga 130, `questOutcomeSchema` riga 135, `phaseSchema` riga 139, `dieGroupSchema` riga 9) esistono gia. I 3 nuovi Command con campi opzionali (RequestCheck, ApplyEffect, StartQuest) usano `.transform()` per OMETTERE gli opzionali assenti (cast-free sotto `exactOptionalPropertyTypes`, identico ad `attackCommandSchema` riga 240). `z.union` accetta i `ZodEffects` del transform (per questo `commandSchema` e gia un `z.union`, non `discriminatedUnion`).

- [ ] **Step 1: Scrivi i test che falliscono**

In `packages/shared/src/command-schema.test.ts`, aggiungi questi test DENTRO il `describe('commandSchema', () => { ... })` esistente (dopo l ultimo `it(...)`, prima della `})` di chiusura del describe):

```typescript
  it('valida RequestCheck minimale e OMETTE attribute e skill assenti', () => {
    const parsed = commandSchema.parse({ type: 'RequestCheck', actorId: 'a', difficulty: 'moderate' });
    expect(parsed).toEqual({ type: 'RequestCheck', actorId: 'a', difficulty: 'moderate' });
    expect('attribute' in parsed).toBe(false);
    expect('skill' in parsed).toBe(false);
  });

  it('valida RequestCheck completo con attribute e skill', () => {
    const parsed = commandSchema.parse({
      type: 'RequestCheck',
      actorId: 'a',
      attribute: 'destrezza',
      skill: 'furtivita',
      difficulty: 'hard',
    });
    expect(parsed).toEqual({
      type: 'RequestCheck',
      actorId: 'a',
      attribute: 'destrezza',
      skill: 'furtivita',
      difficulty: 'hard',
    });
  });

  it('rifiuta RequestCheck con difficulty fuori vocabolario', () => {
    expect(() => commandSchema.parse({ type: 'RequestCheck', actorId: 'a', difficulty: 'impossibile' })).toThrow();
  });

  it('valida ApplyEffect e OMETTE bonus assente', () => {
    const parsed = commandSchema.parse({
      type: 'ApplyEffect',
      targetId: 'b',
      resource: 'hp',
      direction: 'restore',
      dice: [{ count: 1, sides: 6 }],
    });
    expect(parsed).toEqual({
      type: 'ApplyEffect',
      targetId: 'b',
      resource: 'hp',
      direction: 'restore',
      dice: [{ count: 1, sides: 6 }],
    });
    expect('bonus' in parsed).toBe(false);
  });

  it('valida ApplyEffect con bonus e direction drain', () => {
    const parsed = commandSchema.parse({
      type: 'ApplyEffect',
      targetId: 'b',
      resource: 'mana',
      direction: 'drain',
      dice: [{ count: 2, sides: 8, tag: 'fuoco' }],
      bonus: 3,
    });
    expect(parsed).toEqual({
      type: 'ApplyEffect',
      targetId: 'b',
      resource: 'mana',
      direction: 'drain',
      dice: [{ count: 2, sides: 8, tag: 'fuoco' }],
      bonus: 3,
    });
  });

  it('rifiuta ApplyEffect con direction sconosciuta', () => {
    expect(() =>
      commandSchema.parse({ type: 'ApplyEffect', targetId: 'b', resource: 'hp', direction: 'boost', dice: [] }),
    ).toThrow();
  });

  it('valida StartQuest e OMETTE description assente', () => {
    const parsed = commandSchema.parse({ type: 'StartQuest', id: 'q1', title: 'La gemma perduta' });
    expect(parsed).toEqual({ type: 'StartQuest', id: 'q1', title: 'La gemma perduta' });
    expect('description' in parsed).toBe(false);
  });

  it('valida AdvanceQuest con status terminale', () => {
    expect(commandSchema.parse({ type: 'AdvanceQuest', questId: 'q1', status: 'completed' })).toEqual({
      type: 'AdvanceQuest',
      questId: 'q1',
      status: 'completed',
    });
  });

  it('rifiuta AdvanceQuest con status non terminale', () => {
    expect(() => commandSchema.parse({ type: 'AdvanceQuest', questId: 'q1', status: 'active' })).toThrow();
  });

  it('valida EnterPhase verso una fase soft', () => {
    expect(commandSchema.parse({ type: 'EnterPhase', to: 'dialogue' })).toEqual({ type: 'EnterPhase', to: 'dialogue' });
  });

  it('rifiuta EnterPhase verso combat (non e una fase soft)', () => {
    expect(() => commandSchema.parse({ type: 'EnterPhase', to: 'combat' })).toThrow();
  });

  it('valida EndEncounter', () => {
    expect(commandSchema.parse({ type: 'EndEncounter' })).toEqual({ type: 'EndEncounter' });
  });
```

- [ ] **Step 2: Esegui i test e verifica che falliscono**

Run: `pnpm exec vitest run packages/shared/src/command-schema.test.ts`
Expected: FAIL — i nuovi Command non sono nell unione (`commandSchema.parse({type:'RequestCheck',...})` lancia "Invalid input").

- [ ] **Step 3: Aggiungi `softPhaseSchema`**

In `packages/shared/src/domain-schema.ts`, subito DOPO la definizione di `phaseSchema` (riga 139, `const phaseSchema = z.enum([...]);`), aggiungi:

```typescript
// Fasi soft (§5.5): le uniche proponibili con EnterPhase (combat e modale, vi si entra con
// StartEncounter). shared e FOGLIA -> rispecchia i literal di SoftPhase dell engine.
const softPhaseSchema = z.enum(['exploration', 'dialogue', 'downtime']);
```

- [ ] **Step 4: Aggiungi i 6 sotto-schemi Command**

In `packages/shared/src/domain-schema.ts`, subito DOPO `attackCommandSchema` (cioe dopo la sua `});` di chiusura, ~riga 262) e PRIMA del commento `/** Schema Zod dell unione Command ... */` di `commandSchema`, aggiungi:

```typescript
// I 3 Command con opzionali (RequestCheck/ApplyEffect/StartQuest) usano .transform() per OMETTERE
// gli opzionali assenti -> tipo inferito assegnabile 1:1 a Command sotto exactOptionalPropertyTypes
// (pattern di attackCommandSchema). z.union accetta i ZodEffects del transform. Le difficolta/esiti/
// fasi sono enum auto-validanti (l untrusted renderer non puo emettere un valore fuori vocabolario).

const requestCheckCommandSchema = z
  .object({
    type: z.literal('RequestCheck'),
    actorId: z.string(),
    attribute: z.string().optional(),
    skill: z.string().optional(),
    difficulty: difficultySchema,
  })
  .transform((o) => ({
    type: o.type,
    actorId: o.actorId,
    difficulty: o.difficulty,
    ...(o.attribute !== undefined ? { attribute: o.attribute } : {}),
    ...(o.skill !== undefined ? { skill: o.skill } : {}),
  }));

const applyEffectCommandSchema = z
  .object({
    type: z.literal('ApplyEffect'),
    targetId: z.string(),
    resource: z.string(),
    direction: z.enum(['restore', 'drain']),
    dice: z.array(dieGroupSchema),
    bonus: z.number().optional(),
  })
  .transform((o) => ({
    type: o.type,
    targetId: o.targetId,
    resource: o.resource,
    direction: o.direction,
    dice: o.dice,
    ...(o.bonus !== undefined ? { bonus: o.bonus } : {}),
  }));

const startQuestCommandSchema = z
  .object({
    type: z.literal('StartQuest'),
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
  })
  .transform((o) => ({
    type: o.type,
    id: o.id,
    title: o.title,
    ...(o.description !== undefined ? { description: o.description } : {}),
  }));
```

- [ ] **Step 5: Estendi l unione `commandSchema`**

In `packages/shared/src/domain-schema.ts`, sostituisci l intero blocco `export const commandSchema = z.union([ ... ]);` (righe ~266-276) con:

```typescript
export const commandSchema = z.union([
  z.object({ type: z.literal('AddActor'), actor: actorSchema }),
  z.object({
    type: z.literal('StartEncounter'),
    encounterId: z.string(),
    participants: z.array(participantInputSchema),
  }),
  z.object({ type: z.literal('EndTurn') }),
  z.object({ type: z.literal('NextRound') }),
  attackCommandSchema,
  requestCheckCommandSchema,
  applyEffectCommandSchema,
  startQuestCommandSchema,
  z.object({ type: z.literal('AdvanceQuest'), questId: z.string(), status: questOutcomeSchema }),
  z.object({ type: z.literal('EnterPhase'), to: softPhaseSchema }),
  z.object({ type: z.literal('EndEncounter') }),
]);
```

- [ ] **Step 6: Esegui i test e verifica che passano**

Run: `pnpm exec vitest run packages/shared/src/command-schema.test.ts`
Expected: PASS (tutti, inclusi i pre-esistenti).

- [ ] **Step 7: Typecheck del pacchetto**

Run: `pnpm -C packages/shared typecheck`
Expected: `Done` (nessun errore: `z.input<typeof commandSchema>` resta il tipo del bridge).

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/domain-schema.ts packages/shared/src/command-schema.test.ts
git commit -m "feat(shared): estendi commandSchema all unione Command completa"
```

---

## Task 2: WRITE side — drift guard cast-free (host)

**Files:**
- Create: `packages/host/src/command-schema.test.ts`

`@loomn/shared` e foglia: NON puo verificare l assegnabilita a `Command` del motore (non importa engine). Il drift guard wire→motore vive in `@loomn/host`, che importa entrambi (`@loomn/engine` come dependency, `@loomn/shared` come devDependency — gia presenti). Questo replica per i 6 nuovi Command il guard esistente in `campaign-service.test.ts:123-132` (oggi solo AddActor). Il valore e **compile-time**: `const c: Command = commandSchema.parse(...)` fallisce il typecheck se l inferenza di Zod diverge dal tipo del motore. Task test-only → la code-quality review e saltata (dichiarato).

- [ ] **Step 1: Scrivi il test che fallisce (file nuovo)**

Crea `packages/host/src/command-schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { Command } from '@loomn/engine';
import { commandSchema } from '@loomn/shared';

// Drift guard cast-free wire->motore: ogni commandSchema.parse(...) deve essere assegnabile a
// Command SENZA cast (la `: Command` e il vero guard; l expect documenta la forma). shared e foglia
// -> questo guard puo vivere solo dove engine e shared coesistono (host).
describe('commandSchema -> Command del motore (cast-free)', () => {
  it('RequestCheck e assegnabile a Command', () => {
    const c: Command = commandSchema.parse({ type: 'RequestCheck', actorId: 'a', difficulty: 'moderate' });
    expect(c.type).toBe('RequestCheck');
  });

  it('ApplyEffect e assegnabile a Command', () => {
    const c: Command = commandSchema.parse({
      type: 'ApplyEffect',
      targetId: 'b',
      resource: 'hp',
      direction: 'restore',
      dice: [{ count: 1, sides: 6 }],
    });
    expect(c.type).toBe('ApplyEffect');
  });

  it('StartQuest e assegnabile a Command', () => {
    const c: Command = commandSchema.parse({ type: 'StartQuest', id: 'q1', title: 'La gemma' });
    expect(c.type).toBe('StartQuest');
  });

  it('AdvanceQuest e assegnabile a Command', () => {
    const c: Command = commandSchema.parse({ type: 'AdvanceQuest', questId: 'q1', status: 'completed' });
    expect(c.type).toBe('AdvanceQuest');
  });

  it('EnterPhase e assegnabile a Command', () => {
    const c: Command = commandSchema.parse({ type: 'EnterPhase', to: 'dialogue' });
    expect(c.type).toBe('EnterPhase');
  });

  it('EndEncounter e assegnabile a Command', () => {
    const c: Command = commandSchema.parse({ type: 'EndEncounter' });
    expect(c.type).toBe('EndEncounter');
  });
});
```

- [ ] **Step 2: Esegui il test**

Run: `pnpm exec vitest run packages/host/src/command-schema.test.ts`
Expected: PASS a runtime. Il guard vero e il typecheck (Step 3) — se la `: Command` non compilasse, il file non typecheckerebbe.

- [ ] **Step 3: Typecheck del pacchetto (il guard vero)**

Run: `pnpm -C packages/host typecheck`
Expected: `Done`. (Se un sotto-schema del Task 1 divergesse dal tipo del motore — es. `difficulty` non assegnabile a `Difficulty` — questo step fallirebbe.)

- [ ] **Step 4: Commit**

```bash
git add packages/host/src/command-schema.test.ts
git commit -m "test(host): drift guard cast-free dei nuovi Command wire->motore"
```

---

## Task 3: READ side — contratto IPC (`events` nei result + 3 canali read)

**Files:**
- Modify: `packages/shared/src/ipc.ts`
- Test: `packages/shared/src/ipc.test.ts`

Gli `events` (coi `RollResult` dentro `AttackResolved`/`CheckResolved`/`ResourceEffectApplied`) sono gia in `DispatchOutcome`/`TurnOutcome`: il contratto IPC li espone come campo **richiesto** del result ok (sempre presente lato main). I 3 canali read sono `invoke/handle` separati e tipizzati (stile dei canali esistenti). Paginazione narrazione = cursor-by-seq (decisione utente). Canon/L2 = filtro. Gli esiti sono union `{ok:true,...}|{ok:false,error}` (il main non propaga throw grezzi).

- [ ] **Step 1: Scrivi i test che falliscono**

In `packages/shared/src/ipc.test.ts`:

(a) Sostituisci il `describe('dispatchResultSchema (union ok/errore)', ...)` esistente (righe ~56-68) con (i 2 `it` esistenti aggiornati col campo `events` + 1 nuovo):

```typescript
describe('dispatchResultSchema (union ok/errore)', () => {
  it('accetta l esito ok con versione ed events', () => {
    expect(dispatchResultSchema.parse({ ok: true, version: 3, events: [] })).toEqual({
      ok: true,
      version: 3,
      events: [],
    });
  });

  it('accetta l esito di errore', () => {
    expect(dispatchResultSchema.parse({ ok: false, error: 'boom' })).toEqual({ ok: false, error: 'boom' });
  });

  it('rifiuta ok senza versione', () => {
    expect(() => dispatchResultSchema.parse({ ok: true, events: [] })).toThrow();
  });

  it('rifiuta ok senza events', () => {
    expect(() => dispatchResultSchema.parse({ ok: true, version: 3 })).toThrow();
  });
});
```

(b) Sostituisci il test `it('runTurnResult ok porta narration e versione', ...)` (righe ~76-82) con:

```typescript
  it('runTurnResult ok porta narration, versione ed events', () => {
    expect(runTurnResultSchema.parse({ ok: true, narration: 'x', version: 1, events: [] })).toEqual({
      ok: true,
      narration: 'x',
      version: 1,
      events: [],
    });
  });
```

(c) Nel `describe('IPC_CHANNELS', ...)`, aggiungi un nuovo `it` (dopo quello esistente, prima della `})` del describe):

```typescript
  it('espone i canali read on-demand del Piano 0', () => {
    expect(IPC_CHANNELS.narrationHistory).toBe('loomn:narration-history');
    expect(IPC_CHANNELS.canon).toBe('loomn:canon');
    expect(IPC_CHANNELS.summaries).toBe('loomn:summaries');
  });
```

(d) In testa al file, aggiungi gli import dei nuovi schemi (estendendo l import esistente da `./ipc`):

```typescript
import {
  IPC_CHANNELS,
  dispatchRequestSchema,
  dispatchResultSchema,
  runTurnRequestSchema,
  runTurnResultSchema,
  providerConfigSchema,
  providerResultSchema,
  reflectRequestSchema,
  reflectResultSchema,
  statusResultSchema,
  readModelPushSchema,
  narrationHistoryRequestSchema,
  narrationHistoryResultSchema,
  canonRequestSchema,
  canonResultSchema,
  summariesRequestSchema,
  summariesResultSchema,
} from './ipc';
```

(e) Aggiungi in fondo al file un nuovo describe con i test dei canali read:

```typescript
describe('canali read on-demand (narrazione / canon / L2)', () => {
  it('narrationHistoryRequest accetta before e limit opzionali', () => {
    expect(narrationHistoryRequestSchema.parse({})).toEqual({});
    expect(narrationHistoryRequestSchema.parse({ before: 10, limit: 20 })).toEqual({ before: 10, limit: 20 });
  });

  it('narrationHistoryResult ok porta entries e hasMore', () => {
    const parsed = narrationHistoryResultSchema.parse({
      ok: true,
      entries: [{ seq: 2, playerAction: 'apro', narration: 'la porta cigola' }],
      hasMore: true,
    });
    expect(parsed).toEqual({
      ok: true,
      entries: [{ seq: 2, playerAction: 'apro', narration: 'la porta cigola' }],
      hasMore: true,
    });
  });

  it('canonRequest accetta filtri e includeRetracted opzionali', () => {
    expect(canonRequestSchema.parse({})).toEqual({});
    expect(canonRequestSchema.parse({ subject: 'krix', includeRetracted: true })).toEqual({
      subject: 'krix',
      includeRetracted: true,
    });
  });

  it('canonResult ok porta i facts', () => {
    const fact = { id: 'f1', subject: 'krix', predicate: 'serve', object: 'vhalmar', eventSeq: 1, salience: 0.5, status: 'active' };
    expect(canonResultSchema.parse({ ok: true, facts: [fact] })).toEqual({ ok: true, facts: [fact] });
  });

  it('summariesRequest accetta level e scope opzionali', () => {
    expect(summariesRequestSchema.parse({})).toEqual({});
    expect(summariesRequestSchema.parse({ level: 'scene', scope: 'sess-1' })).toEqual({ level: 'scene', scope: 'sess-1' });
  });

  it('summariesResult ok porta i summaries', () => {
    const s = { id: 's1', level: 'scene', scope: 'sess-1', text: 'riassunto', importance: 5, salience: 0.5, createdAt: 1000, eventSeqFrom: 1, eventSeqTo: 3 };
    expect(summariesResultSchema.parse({ ok: true, summaries: [s] })).toEqual({ ok: true, summaries: [s] });
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscono**

Run: `pnpm exec vitest run packages/shared/src/ipc.test.ts`
Expected: FAIL — gli schemi `narrationHistoryRequestSchema` ecc. non esistono ancora (import error), e `events` non e nel result.

- [ ] **Step 3: Aggiungi `domainEventSchema` all import di `ipc.ts`**

In `packages/shared/src/ipc.ts`, sostituisci l import da `./domain-schema` (riga 7):

```typescript
import { commandSchema, domainEventSchema, gameStateSchema } from './domain-schema';
```

- [ ] **Step 4: Aggiungi i 3 canali a `IPC_CHANNELS`**

In `packages/shared/src/ipc.ts`, dentro l oggetto `IPC_CHANNELS`, dopo `getStatus: 'loomn:get-status',` (riga ~20) aggiungi:

```typescript
  /** invoke/handle: storia di narrazione (eventi NarrationRecorded) paginata cursor-by-seq. */
  narrationHistory: 'loomn:narration-history',
  /** invoke/handle: canon ledger L1.5 (fatti attivi o tutti) filtrabile. */
  canon: 'loomn:canon',
  /** invoke/handle: riassunti narrativi L2 filtrabili per livello/scope. */
  summaries: 'loomn:summaries',
```

- [ ] **Step 5: Aggiungi `events` ai result dispatch/run-turn**

In `packages/shared/src/ipc.ts`, sostituisci `dispatchResultSchema` (righe ~34-38) con:

```typescript
/** Esito tipizzato del dispatch: union ok/errore -> il main non propaga stack trace grezzi.
 *  `events` (coi RollResult) sono additivi: gia ritornati da CampaignService, ora esposti (read). */
export const dispatchResultSchema = z.union([
  z.object({
    ok: z.literal(true),
    version: z.number().int().nonnegative(),
    events: z.array(domainEventSchema),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type DispatchResult = z.infer<typeof dispatchResultSchema>;
```

E sostituisci `runTurnResultSchema` (righe ~44-48) con:

```typescript
export const runTurnResultSchema = z.union([
  z.object({
    ok: z.literal(true),
    narration: z.string(),
    version: z.number().int().nonnegative(),
    events: z.array(domainEventSchema),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type RunTurnResult = z.infer<typeof runTurnResultSchema>;
```

- [ ] **Step 6: Aggiungi gli schemi dei 3 canali read**

In `packages/shared/src/ipc.ts`, subito DOPO il blocco `getStatus` (cioe dopo `export type StatusResult = ...;`, riga ~80) e PRIMA del blocco `read-model push`, aggiungi:

```typescript
// --- narrationHistory (storia di narrazione, cursor-by-seq) ---
/** Cursor-by-seq: `before` legge le voci con seq < before (paginazione "carica piu vecchie");
 *  `limit` (default lato host) limita la finestra. Stabile sotto append (lo stream non slitta). */
export const narrationHistoryRequestSchema = z.object({
  before: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(200).optional(),
});
export type NarrationHistoryRequest = z.infer<typeof narrationHistoryRequestSchema>;

export const narrationEntrySchema = z.object({
  seq: z.number().int().positive(),
  playerAction: z.string(),
  narration: z.string(),
});
export type NarrationEntryDto = z.infer<typeof narrationEntrySchema>;

/** entries e newest-first; hasMore = esistono voci piu vecchie oltre la finestra. */
export const narrationHistoryResultSchema = z.union([
  z.object({ ok: z.literal(true), entries: z.array(narrationEntrySchema), hasMore: z.boolean() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type NarrationHistoryResult = z.infer<typeof narrationHistoryResultSchema>;

// --- canon (L1.5 canon ledger) ---
/** Filtro opzionale + includeRetracted: false (default) -> solo attivi; true -> attivi e ritirati. */
export const canonRequestSchema = z.object({
  includeRetracted: z.boolean().optional(),
  subject: z.string().optional(),
  predicate: z.string().optional(),
  object: z.string().optional(),
});
export type CanonRequest = z.infer<typeof canonRequestSchema>;

/** DTO del fatto canon (rispecchia CanonFact di @loomn/memory; l assegnabilita memory->DTO e
 *  imposta a compile-time dall handler IPC del main, vedi Task 5). */
export const canonFactSchema = z.object({
  id: z.string(),
  subject: z.string(),
  predicate: z.string(),
  object: z.string(),
  eventSeq: z.number().int().nonnegative(),
  salience: z.number(),
  status: z.enum(['active', 'retracted']),
});
export type CanonFactDto = z.infer<typeof canonFactSchema>;

export const canonResultSchema = z.union([
  z.object({ ok: z.literal(true), facts: z.array(canonFactSchema) }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type CanonResult = z.infer<typeof canonResultSchema>;

// --- summaries (L2 memoria narrativa) ---
export const summariesRequestSchema = z.object({
  level: z.enum(['scene', 'session', 'arc', 'campaign']).optional(),
  scope: z.string().optional(),
});
export type SummariesRequest = z.infer<typeof summariesRequestSchema>;

/** DTO del riassunto L2 (rispecchia Summary di @loomn/memory; assegnabilita imposta dall handler). */
export const summarySchema = z.object({
  id: z.string(),
  level: z.enum(['scene', 'session', 'arc', 'campaign']),
  scope: z.string(),
  text: z.string(),
  importance: z.number(),
  salience: z.number(),
  createdAt: z.number(),
  eventSeqFrom: z.number(),
  eventSeqTo: z.number(),
});
export type SummaryDto = z.infer<typeof summarySchema>;

export const summariesResultSchema = z.union([
  z.object({ ok: z.literal(true), summaries: z.array(summarySchema) }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type SummariesResult = z.infer<typeof summariesResultSchema>;
```

- [ ] **Step 7: Estendi `LoomnBridge` coi 3 metodi read**

In `packages/shared/src/ipc.ts`, dentro `interface LoomnBridge`, dopo il metodo `getStatus(): Promise<StatusResult>;` (riga ~102) aggiungi:

```typescript
  /** Storia di narrazione paginata (cursor-by-seq), newest-first. */
  getNarrationHistory(request: NarrationHistoryRequest): Promise<NarrationHistoryResult>;
  /** Canon ledger L1.5 (attivi o tutti) filtrabile. */
  getCanon(request: CanonRequest): Promise<CanonResult>;
  /** Riassunti L2 filtrabili per livello/scope. */
  getSummaries(request: SummariesRequest): Promise<SummariesResult>;
```

- [ ] **Step 8: Esegui i test e verifica che passano**

Run: `pnpm exec vitest run packages/shared/src/ipc.test.ts`
Expected: PASS.

- [ ] **Step 9: Typecheck del pacchetto**

Run: `pnpm -C packages/shared typecheck`
Expected: `Done`.

- [ ] **Step 10: Commit**

```bash
git add packages/shared/src/ipc.ts packages/shared/src/ipc.test.ts
git commit -m "feat(shared): events nei result IPC e canali read narrazione/canon/L2"
```

---

## Task 4: READ side — read method su `CampaignService` (host)

**Files:**
- Modify: `packages/host/src/campaign-service.ts`
- Test: `packages/host/src/campaign-service.test.ts`

`CampaignService` resta l unico accesso a `memory` (il main resta sottile). I tre read sono **sincroni** e **fuori dalla coda FIFO**: la coda serializza solo le mutazioni (dispatch/runTurn/reflect); i read sono letture pure su stato SQLite gia committato (vista coerente anche durante un turno async). `getReadModel` e gia sincrono — stesso contratto. `getNarrationHistory` legge lo stream (`eventStore.load()`) e affetta in memoria: O(n) per chiamata, accettabile come `rebuild`/`reflect`; il contratto cursor-by-seq e forward-compatible con una futura query SQL paginata (deferito, nessun debito di contratto).

- [ ] **Step 1: Scrivi i test che falliscono**

In `packages/host/src/campaign-service.test.ts`, aggiungi un nuovo `describe` in fondo al file (dopo l ultimo describe, prima della fine del file). Usa gli helper gia presenti (`makeService`, `scriptedModel`, `actor`):

```typescript
describe('createCampaignService - read on-demand (narrazione / canon / L2)', () => {
  it('getNarrationHistory ritorna le voci newest-first', async () => {
    const model = scriptedModel([
      [{ type: 'text', delta: 'Entri nella locanda.' }, { type: 'finish', reason: 'stop' }],
      [{ type: 'text', delta: 'Il locandiere ti saluta.' }, { type: 'finish', reason: 'stop' }],
    ]);
    const { service, memory } = makeService({ model });
    try {
      await service.runTurn('Entro.');
      await service.runTurn('Saluto.');
      const h = service.getNarrationHistory();
      expect(h.entries.map((e) => e.seq)).toEqual([2, 1]);
      expect(h.entries[0]?.narration).toBe('Il locandiere ti saluta.');
      expect(h.entries[0]?.playerAction).toBe('Saluto.');
      expect(h.hasMore).toBe(false);
    } finally {
      memory.close();
    }
  });

  it('getNarrationHistory rispetta limit e segnala hasMore, e pagina con before', async () => {
    const model = scriptedModel([
      [{ type: 'text', delta: 'Prima.' }, { type: 'finish', reason: 'stop' }],
      [{ type: 'text', delta: 'Seconda.' }, { type: 'finish', reason: 'stop' }],
    ]);
    const { service, memory } = makeService({ model });
    try {
      await service.runTurn('a1.');
      await service.runTurn('a2.');
      const page1 = service.getNarrationHistory({ limit: 1 });
      expect(page1.entries.map((e) => e.seq)).toEqual([2]);
      expect(page1.hasMore).toBe(true);
      const page2 = service.getNarrationHistory({ before: 2 });
      expect(page2.entries.map((e) => e.seq)).toEqual([1]);
      expect(page2.hasMore).toBe(false);
    } finally {
      memory.close();
    }
  });

  it('getNarrationHistory su stream senza narrazione e vuota', async () => {
    const { service, memory } = makeService();
    try {
      await service.dispatch({ type: 'AddActor', actor: actor('goblin', 'Goblin') });
      const h = service.getNarrationHistory();
      expect(h.entries).toEqual([]);
      expect(h.hasMore).toBe(false);
    } finally {
      memory.close();
    }
  });

  it('getCanon ritorna i fatti attivi di default e tutti con includeRetracted', () => {
    const { service, memory } = makeService();
    try {
      memory.ledger.record({ id: 'f1', subject: 'krix', predicate: 'serve', object: 'vhalmar', eventSeq: 1 });
      memory.ledger.record({ id: 'f2', subject: 'porta', predicate: 'e', object: 'chiusa', eventSeq: 2 });
      memory.ledger.retract('f2');
      expect(service.getCanon().map((f) => f.id)).toEqual(['f1']);
      expect(service.getCanon({ includeRetracted: true }).map((f) => f.id)).toEqual(['f1', 'f2']);
      expect(service.getCanon({ subject: 'krix' }).map((f) => f.id)).toEqual(['f1']);
    } finally {
      memory.close();
    }
  });

  it('getSummaries ritorna tutti i riassunti e filtra per level', () => {
    const { service, memory } = makeService();
    try {
      memory.summaries.record({ id: 's1', level: 'scene', scope: 'sess-1', text: 'scena', importance: 5, salience: 0.5, createdAt: 1000, eventSeqFrom: 1, eventSeqTo: 3 });
      memory.summaries.record({ id: 's2', level: 'session', scope: 'sess-1', text: 'sessione', importance: 7, salience: 0.6, createdAt: 1001, eventSeqFrom: 4, eventSeqTo: 9 });
      expect(service.getSummaries().map((s) => s.id)).toEqual(['s1', 's2']);
      expect(service.getSummaries({ level: 'scene' }).map((s) => s.id)).toEqual(['s1']);
    } finally {
      memory.close();
    }
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscono**

Run: `pnpm exec vitest run packages/host/src/campaign-service.test.ts`
Expected: FAIL — `service.getNarrationHistory`/`getCanon`/`getSummaries` non esistono (TypeError / il file non typechecka in vitest).

- [ ] **Step 3: Aggiungi gli import dei tipi memory e i tipi read**

In `packages/host/src/campaign-service.ts`, aggiungi dopo l import esistente da `@loomn/memory` (riga 19, `import { runScenesReflection } from '@loomn/memory';`):

```typescript
import type { CanonFact, CanonFactFilter, Summary, SummaryFilter } from '@loomn/memory';
```

E aggiungi i tipi read DOPO `export interface ReflectOutcome { ... }` (riga ~62) e PRIMA di `export interface CampaignService`:

```typescript
/** Una voce della storia di narrazione (evento NarrationRecorded col suo seq di stream). */
export interface NarrationEntry {
  seq: number;
  playerAction: string;
  narration: string;
}

/** Pagina di storia di narrazione, newest-first (cursor-by-seq). */
export interface NarrationHistory {
  entries: NarrationEntry[];
  hasMore: boolean;
}

/** Cursor-by-seq: `before` -> voci con seq < before; `limit` (default 50) limita la finestra. */
export interface NarrationHistoryQuery {
  before?: number;
  limit?: number;
}

/** Filtro canon + includeRetracted (default false = solo attivi). */
export interface CanonQuery extends CanonFactFilter {
  includeRetracted?: boolean;
}
```

- [ ] **Step 4: Estendi l interfaccia `CampaignService`**

In `packages/host/src/campaign-service.ts`, dentro `export interface CampaignService`, dopo il metodo `reflect(...)` (riga ~74) aggiungi:

```typescript
  /** Storia di narrazione (eventi NarrationRecorded) paginata cursor-by-seq, newest-first.
   *  Read puro (non accodato): legge lo stream committato. */
  getNarrationHistory(query?: NarrationHistoryQuery): NarrationHistory;
  /** Canon ledger L1.5: fatti attivi (default) o tutti (includeRetracted), filtrabili. */
  getCanon(query?: CanonQuery): CanonFact[];
  /** Riassunti L2 filtrabili per livello/scope. */
  getSummaries(filter?: SummaryFilter): Summary[];
```

- [ ] **Step 5: Implementa i tre read method**

In `packages/host/src/campaign-service.ts`, dentro l oggetto ritornato da `createCampaignService` (il `return { ... }`), dopo il metodo `reflect(scope) { ... }` (chiusura `},` riga ~154) aggiungi:

```typescript
    // Read on-demand (spec 5.2). NON accodati: la coda FIFO serializza solo le mutazioni; questi
    // leggono stato SQLite gia committato (vista coerente anche durante un turno async).
    getNarrationHistory(query: NarrationHistoryQuery = {}): NarrationHistory {
      const limit = query.limit ?? 50;
      const before = query.before;
      const all: NarrationEntry[] = [];
      for (const s of deps.memory.eventStore.load()) {
        if (s.event.type === 'NarrationRecorded') {
          all.push({ seq: s.seq, playerAction: s.event.playerAction, narration: s.event.narration });
        }
      }
      const eligible = before !== undefined ? all.filter((e) => e.seq < before) : all;
      const window = eligible.slice(-limit); // le `limit` piu recenti (ancora ascendenti)
      return { entries: window.reverse(), hasMore: eligible.length > window.length };
    },

    getCanon(query: CanonQuery = {}): CanonFact[] {
      const { includeRetracted, ...filter } = query;
      return includeRetracted ? deps.memory.ledger.all(filter) : deps.memory.ledger.active(filter);
    },

    getSummaries(filter: SummaryFilter = {}): Summary[] {
      return deps.memory.summaries.list(filter);
    },
```

- [ ] **Step 6: Esegui i test e verifica che passano**

Run: `pnpm exec vitest run packages/host/src/campaign-service.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck del pacchetto**

Run: `pnpm -C packages/host typecheck`
Expected: `Done`. (Dentro `if (s.event.type === 'NarrationRecorded')` TS restringe `s.event` alla variante, quindi `playerAction`/`narration` sono accessibili cast-free.)

- [ ] **Step 8: Commit**

```bash
git add packages/host/src/campaign-service.ts packages/host/src/campaign-service.test.ts
git commit -m "feat(host): read on-demand getNarrationHistory/getCanon/getSummaries su CampaignService"
```

---

## Task 5: Wiring Electron — handler IPC + bridge + self-test

**Files:**
- Modify: `app/desktop/src/main/index.ts`
- Modify: `app/desktop/src/preload/index.ts`
- Modify: `app/desktop/src/renderer/src/renderer.ts`

Glue sottile (stile 9c-ii): i nuovi handler chiamano i read method sincroni del service; gli handler dispatch/runTurn aggiungono `events: out.events`. L assegnabilita `CanonFact[]`/`Summary[]`/`NarrationEntry[]` ai DTO del result (`CanonFactDto[]` ecc.) e **il drift guard read** — imposta a compile-time da `vue-tsc` su questo file. Il self-test esercita i nuovi canali end-to-end nello stack Electron reale.

- [ ] **Step 1: Estendi gli import in `main/index.ts`**

In `app/desktop/src/main/index.ts`, sostituisci l import da `@loomn/shared` (righe 12-24) con:

```typescript
import {
  IPC_CHANNELS,
  dispatchRequestSchema,
  runTurnRequestSchema,
  providerConfigSchema,
  reflectRequestSchema,
  narrationHistoryRequestSchema,
  canonRequestSchema,
  summariesRequestSchema,
  type DispatchResult,
  type RunTurnResult,
  type ProviderResult,
  type ReflectResult,
  type StatusResult,
  type ReadModelPush,
  type NarrationHistoryResult,
  type CanonResult,
  type SummariesResult,
} from '@loomn/shared';
```

- [ ] **Step 2: Aggiungi `events` ai result dispatch/run-turn**

In `app/desktop/src/main/index.ts`, nell handler `IPC_CHANNELS.dispatch`, sostituisci la riga del return ok (riga ~72):

```typescript
      return { ok: true, version: out.readModel.version, events: out.events };
```

Nell handler `IPC_CHANNELS.runTurn`, sostituisci la riga del return ok (riga ~84):

```typescript
      return { ok: true, narration: out.narration, version: out.readModel.version, events: out.events };
```

- [ ] **Step 3: Aggiungi i 3 handler read**

In `app/desktop/src/main/index.ts`, dentro `function registerHandlers(service)`, dopo l handler `IPC_CHANNELS.getStatus` (chiusura `);` riga ~120) aggiungi:

```typescript
  ipcMain.handle(IPC_CHANNELS.narrationHistory, (_e, raw): NarrationHistoryResult => {
    const parsed = narrationHistoryRequestSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: `Richiesta non valida: ${parsed.error.message}` };
    try {
      const h = service.getNarrationHistory(parsed.data);
      return { ok: true, entries: h.entries, hasMore: h.hasMore };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.canon, (_e, raw): CanonResult => {
    const parsed = canonRequestSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: `Richiesta non valida: ${parsed.error.message}` };
    try {
      return { ok: true, facts: service.getCanon(parsed.data) };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.summaries, (_e, raw): SummariesResult => {
    const parsed = summariesRequestSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: `Richiesta non valida: ${parsed.error.message}` };
    try {
      return { ok: true, summaries: service.getSummaries(parsed.data) };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });
```

- [ ] **Step 4: Estendi il preload bridge**

In `app/desktop/src/preload/index.ts`, sostituisci l import da `@loomn/shared` (righe 2-15) con:

```typescript
import {
  IPC_CHANNELS,
  type LoomnBridge,
  type DispatchCommand,
  type DispatchResult,
  type RunTurnRequest,
  type RunTurnResult,
  type ProviderConfig,
  type ProviderResult,
  type ReflectRequest,
  type ReflectResult,
  type StatusResult,
  type ReadModelPush,
  type NarrationHistoryRequest,
  type NarrationHistoryResult,
  type CanonRequest,
  type CanonResult,
  type SummariesRequest,
  type SummariesResult,
} from '@loomn/shared';
```

E dentro l oggetto `const bridge: LoomnBridge = { ... }`, dopo `getStatus: (): Promise<StatusResult> => ipcRenderer.invoke(IPC_CHANNELS.getStatus),` (riga ~28) aggiungi:

```typescript
  getNarrationHistory: (request: NarrationHistoryRequest): Promise<NarrationHistoryResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.narrationHistory, request),
  getCanon: (request: CanonRequest): Promise<CanonResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.canon, request),
  getSummaries: (request: SummariesRequest): Promise<SummariesResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.summaries, request),
```

- [ ] **Step 5: Estendi il self-test (fase 1)**

In `app/desktop/src/renderer/src/renderer.ts`, dentro `runSelfTest`, nel ramo `if (phase === '1')`, subito DOPO la riga `check(d.ok && d.version === 1, 'dispatch AddActor porta a versione 1');` (riga ~50) aggiungi:

```typescript
      check(d.ok && d.events.some((e) => e.type === 'ActorAdded'), 'dispatch espone gli events (ActorAdded)');

      const hist = await window.loomn.getNarrationHistory({});
      check(hist.ok && hist.entries.length === 0 && hist.hasMore === false, 'narration history vuota a inizio');

      const canon = await window.loomn.getCanon({});
      check(canon.ok && canon.facts.length === 0, 'canon vuoto a inizio');

      const sums = await window.loomn.getSummaries({});
      check(sums.ok && sums.summaries.length === 0, 'summaries vuoti a inizio');
```

- [ ] **Step 6: Typecheck dell app (drift guard read incluso)**

Run: `pnpm -C app/desktop typecheck`
Expected: `Done`. (Se un DTO del Task 3 divergesse dal tipo memory — es. `canonFactSchema` richiedesse un campo assente in `CanonFact` — l assegnazione `facts: service.getCanon(...)` qui fallirebbe.)

- [ ] **Step 7: Build dell app (bundle su ABI Node, nativa esternalizzata)**

Run: `pnpm -C app/desktop build`
Expected: build OK (main/preload/renderer bundlati; la nativa better-sqlite3 non viene caricata in build, vedi §7-quinquies).

- [ ] **Step 8: Commit**

```bash
git add app/desktop/src/main/index.ts app/desktop/src/preload/index.ts app/desktop/src/renderer/src/renderer.ts
git commit -m "feat(desktop): handler IPC read + events nei result + self-test esteso"
```

---

## Verifica finale del branch (orchestratore)

- [ ] **Suite completa (ABI Node):**

Run: `pnpm test`
Expected: tutti verdi (≈ **478**: 444 base + ~10 Task 1 + 6 Task 2 + ~9 Task 3 + ~9 Task 4). Se SQLite fallisce con `NODE_MODULE_VERSION 146 ... requires 137` → `pnpm -r rebuild better-sqlite3` (la nativa e rimasta su ABI Electron da un gate precedente, §7-quinquies).

- [ ] **Typecheck completo:**

Run: `pnpm -r typecheck`
Expected: `Done` su tutti e 6 i progetti (incluso `app/desktop` via `vue-tsc`).

- [ ] **Gate "esegui l app" (ABI Electron, passo orchestratore — flip ABI confinato):**

```bash
pnpm rebuild:electron
# Fase 1 (DB fresco temporaneo): VERDICT atteso PASS (include i nuovi check: events nel dispatch + 3 canali read vuoti)
# Fase 2 (stesso DB): VERDICT atteso PASS (durabilita invariata)
# (lancia electron come nel gate 9c-ii, con LOOMN_SELFTEST e LOOMN_USERDATA su una dir temporanea)
pnpm rebuild:node   # ripristina l ABI Node (DEVE essere `pnpm -r rebuild better-sqlite3`, vedi §7-quinquies)
```
Expected: due `VERDICT: PASS`; poi `pnpm test` di nuovo verde (ABI Node ripristinato).

- [ ] **Final review (subagent, opus)** dell intero branch (BASE = punto di branch, HEAD = ultimo commit), poi **finishing-a-development-branch** (merge ff in main locale + `pnpm test` + `git branch -d`).

---

## Self-review (eseguita sullo spec con occhi freschi)

**1. Copertura spec (Piano 10 §8 lacune → Piano 0):**
- WRITE: `commandSchema` = unione `Command` completa → Task 1 (+ guard Task 2). ✅
- READ: `events`/tiri nei result dispatch/turn → Task 3 (contratto) + Task 4 non serve (gli events vengono dal service, gia presenti) + Task 5 (esposizione handler). ✅
- READ: storia narrazione (`NarrationRecorded`, paginata) → Task 3 (schema) + Task 4 (`getNarrationHistory`) + Task 5 (handler/bridge). ✅
- READ: canon ledger (`active/all`) → Task 3 + Task 4 (`getCanon`) + Task 5. ✅
- READ: riassunti L2 (`summaries.list`) → Task 3 + Task 4 (`getSummaries`) + Task 5. ✅
- Paginazione cursor-by-seq (decisione utente) → Task 3 (schema `{before,limit}`/`{entries,hasMore}`) + Task 4 (impl). ✅
- Fuori ambito rispettato: niente streaming, niente delta read-model, nessun nuovo Command/Event/tabella, niente equip/movimento. ✅

**2. Scansione placeholder:** nessun TODO/TBD; ogni step porta codice completo, comando e output atteso. ✅

**3. Consistenza dei tipi (cross-task):**
- `commandSchema` (Task 1) — i nomi dei sotto-schemi (`requestCheckCommandSchema`, `applyEffectCommandSchema`, `startQuestCommandSchema`) sono coerenti tra Step 4 e Step 5; le varianti inline (AdvanceQuest/EnterPhase/EndEncounter) usano `questOutcomeSchema`/`softPhaseSchema` definiti prima di `commandSchema`. ✅
- `domainEventSchema` importato in `ipc.ts` (Task 3 Step 3) prima dell uso in `dispatchResultSchema`/`runTurnResultSchema`. ✅
- DTO read (`CanonFactDto`/`SummaryDto`/`NarrationEntryDto`, Task 3) ↔ tipi service (`CanonFact`/`Summary`/`NarrationEntry`, Task 4) ↔ assegnati negli handler (Task 5): l assegnabilita e imposta da `vue-tsc` (Task 5 Step 6). ✅
- `NarrationHistoryQuery.before`/`limit` (Task 4) coincide con `narrationHistoryRequestSchema` (Task 3). ✅
- `CanonQuery` (Task 4) = `CanonFactFilter & {includeRetracted?}` coincide con `canonRequestSchema` (Task 3). ✅

**4. Grep anti-apostrofo (house rule §5.4):** verificare PRIMA del commit di ogni task con i test:
`grep -rnE "(it|describe)\('[^']*'[A-Za-zaeiou]" packages/shared/src packages/host/src` → atteso *no matches*. (Tutte le stringhe `it/describe` sono state scritte senza apostrofi: `all avvio`, `l esito`, `a inizio`.)

---

## Roadmap dopo il Piano 0

Sblocca i sotto-piani UI nell ordine `10a → 10f → 10b → 10c → 10d → 10e` (spec Piano 10 §10). Ogni piano segue il flusso §4 dell HANDOFF (writing-plans → commit doc su main → branch → subagent-driven → finishing-a-development-branch → aggiorna HANDOFF/memoria). Follow-up minori ancora aperti (HANDOFF §7-quinquies): seed RNG per-campagna persistito; delta read-model (spec generale §13, deferito).

---

## Execution Handoff

Vedi l header: REQUIRED SUB-SKILL `superpowers:subagent-driven-development` (un implementer + spec-review + code-quality-review per task; final review opus dell intero branch prima del merge). Task 2 e test-only → code-quality review saltata (dichiarato). Procedere in autonomia fino al merge, tenendo l utente aggiornato con una tabellina di stato dei task.
