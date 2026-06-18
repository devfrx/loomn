# Piano 10g — Vocabolario di gioco su IPC (`get-ruleset`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Esporre via IPC il **vocabolario di gioco** (il `Ruleset` iniettato nel main: attributi/abilita/risorse/difese + `defaultResources`) + gli **enum statici di comando** del motore + le **regole di legalita-per-fase**, cosi che i pannelli UI **data-driven** di 10f (creazione PG, controlli GM) e 10d (Scheda) conoscano gli id legali e disabilitino i comandi illegali nella fase corrente.

**Architecture:** Lavoro additivo, cast-free, stile Piano 0 (read-side). Il `Ruleset` (host, `devRuleset`) e iniettato in `createCampaignService` ma **non attraversa l IPC**: il read-model push e `{version, state}` — il vocabolario e la *lente*, non lo stato (decisione G3/G4: `applyEvent`/`rebuild` non prendono il ruleset). Si aggiunge un canale read **`get-ruleset`** che ritorna un DTO `{vocabulary, difficulties, softPhases, questOutcomes, directions, commandPhaseRules}`. Sorgente: `deps.ruleset.vocabulary` (host) + gli enum statici del motore (`DIFFICULTIES`/`SOFT_PHASES`/`QUEST_OUTCOMES`/`RESOURCE_DIRECTIONS`) + `isCommandLegalInPhase` (per `commandPhaseRules`). Metodo **sincrono** `getRuleset()` su `CampaignService` (come i read del Piano 0, FUORI dalla coda FIFO) + handler IPC sottile + bridge preload. `@loomn/shared` resta **foglia**: i DTO rispecchiano i tipi engine/Ruleset, l assegnabilita host->DTO e imposta a compile-time dall handler del main (drift guard read, come canon/summary del Piano 0). Gli enum statici sono **anche** esportati come const da `@loomn/shared` (il renderer importa solo `@loomn/shared`, mai engine).

**Tech Stack:** TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), Zod 3.25.76, Vitest, Electron 42 (`ipcMain.handle` / `contextBridge`), monorepo pnpm. Nessuna nuova dipendenza, nessuna modifica a `package.json`/`tsconfig`/`vitest.config`/`vitest.workspace`/`electron.vite.config`.

---

## Contesto e riferimenti

- **Spec autorita del Piano 10g:** `docs/superpowers/specs/2026-06-17-piano10-ui-design.md` §8 (lacuna 10g: il vocabolario del `Ruleset` non attraversa l IPC), §7 (audit di binding, righe "Vocabolario di gioco" / "Legalita comandi per fase"), §10 (riga 10g nella decomposizione). **HANDOFF:** §0-sexdecies (Piano 0 fatto + dettaglio della lacuna 10g), §0-septdecies (Piano 10a fatto), §4 (processo), §5 (house rules). **Spec autorita generale:** `docs/superpowers/specs/2026-06-15-simulatore-campagne-ai-design.md` §4 (sicurezza/IPC), §5.2 (CQRS), §5.3 (Ruleset), §5.5 (FSM di fase).
- **Piano di riferimento per lo STILE (read channel del Piano 0):** `docs/superpowers/plans/2026-06-17-loomn-piano0-ipc-cqrs-completeness.md` — metodo sincrono su `CampaignService` + handler IPC sottile + bridge + self-test; assegnabilita memory->DTO imposta dall handler.

- **Verita di codice gia verificate (vedi i file — niente da indovinare):**
  - `Ruleset = { vocabulary: Vocabulary; dcForDifficulty }` e `Vocabulary = { attributes: ReadonlySet<string>; skills: ReadonlySet<string>; resources: ReadonlySet<string>; defenses: ReadonlySet<string>; defaultResources: Readonly<Record<string, ResourcePool>> }` (engine `ruleset.ts:8-21`). `ResourcePool = { current: number; max: number }` (engine `actor.ts`).
  - `DIFFICULTIES` e esportato (engine `difficulty.ts:6`). `SOFT_PHASES` e esportato (engine `phase.ts:8`). `QUEST_OUTCOMES` e esportato (engine `quest.ts:8`). **`RESOURCE_DIRECTIONS` NON esiste** (le direzioni sono inline `'restore' | 'drain'` in `commands.ts:31`) → la crea il Task 1. **`COMMAND_TYPES` (lista runtime dei tipi di Command) NON esiste** → la crea il Task 1.
  - `isCommandLegalInPhase(phase, type)` e esportato (engine `commands.ts:55`). Verita verificate del comportamento: combat-only = `['Attack','EndTurn','NextRound','EndEncounter']`; non-combat-only = `['StartEncounter','EnterPhase']`; tutto il resto e phase-agnostic (engine `commands.ts:50-59`).
  - `CampaignService` espone gia `getReadModel/dispatch/runTurn/reflect/getNarrationHistory/getCanon/getSummaries`; `deps.ruleset: Ruleset` e gia nelle deps (host `campaign-service.ts:33-34`). I read on-demand sono **sincroni e fuori dalla coda FIFO** (la coda serializza solo le mutazioni).
  - `devRuleset` (host `dev-vocabulary.ts`): attributi `forza/destrezza/costituzione/intelligenza/saggezza/carisma`, abilita `atletica/furtivita/persuasione/intuito/arcano/percezione`, risorse `hp/mana/stamina`, difese `difesa/tempra/riflessi/volonta`, `defaultResources { hp: {current:10,max:10} }`. E quello iniettato nel main.
  - `SERVICE_RULESET` (host `campaign-service.test.ts:17-24`): stesso fantasy, **`defaultResources` VUOTO** (`{}`). E quello usato da `makeService()` (host `campaign-service.test.ts:85-98`).
  - **Zod 3.25.76 `z.enum` accetta tuple `readonly` (`as const`)** — overload `createZodEnum<U, T extends Readonly<[U, ...U[]]>>(values: T): ZodEnum<Writeable<T>>` (verificato in `zod/v3/types.d.ts:760`). Quindi `z.enum(DIFFICULTIES)` con `DIFFICULTIES = [...] as const` compila e ha `.options`/`z.infer` identici al literal precedente (refactor type-preserving).
  - `@loomn/shared` e FOGLIA (importa solo `zod` + i suoi schemi). `@loomn/host` importa `@loomn/engine` (dependency) e `@loomn/shared` (devDependency, gia presente per `command-schema.test.ts`). `app/desktop` dipende da `@loomn/shared`/`@loomn/host`/`@loomn/engine`. Il drift guard di compile-time engine<->shared per gli enum dentro eventi/stato vive gia in `packages/memory/src/sqlite-event-store.ts:83-94`.

## Decisione di design (presa, niente domande aperte)

10g **non ha decisioni di design aperte** (e stile-Piano-0, additivo). Una scelta tecnica e stata risolta scrivendo il piano e va dichiarata:

- **Gli array di enum del DTO (`difficulties`/`softPhases`/`questOutcomes`/`directions`) sono `string[]`, non literal-union tipizzati.** Il DTO e *trasporto* delle liste di valori legali; l accesso **tipizzato** del renderer agli enum e dato dai **const esportati** da `@loomn/shared` (`DIFFICULTIES` ecc.) — esattamente cio che la lacuna §8 chiede ("export degli enum statici di comando da @loomn/shared per i form GM"). Tipizzare gli array del DTO come union (es. `z.array(z.enum(DIFFICULTIES))`) accoppierebbe la vista host a cinque tipi enum del motore e farebbe dipendere l assegnazione dell handler dall identita strutturale di union dichiarate in modo indipendente — piu macchinario per una precisione che il renderer ottiene gia dai const. `commandPhaseRules` e `string[]` comunque (sono sottoinsiemi DERIVATI, non un enum chiuso), quindi tenere anche le liste di enum a `string[]` e internamente consistente. Il drift engine<->shared e catturato esplicitamente da un test runtime in host (Task 4) piu i guard di compile-time gia esistenti. *(Alternativa "DTO tipizzato" considerata e scartata per accoppiamento non necessario.)*

## Disciplina di scope (CRITICO — vale per ogni task, house rule §5.1)

- Ogni subagent modifica **SOLO** i file elencati nel suo task. **MAI** toccare `package.json`, `tsconfig*.json`, `vitest.config.ts`, `vitest.workspace.ts`, `electron.vite.config.ts`. **Non esiste alcun passo orchestratore di manifesto in questo piano:** tutte le dipendenze necessarie esistono gia (engine e dependency di host; shared e foglia; shared e devDependency di host; app/desktop dipende da shared/host/engine; gli script `rebuild:electron`/`rebuild:node` esistono in root).
- `git status --short` prima di ogni commit: devono comparire SOLO i file del task.
- Niente apostrofi nelle stringhe `it('...')`/`describe('...')` **in apici singoli** e nelle label `check('...')` del self-test (house rule §5.4): scrivi `all avvio`, `l esito`, `c e`, `legalita-per-fase`. Le lettere accentate (`e`, `a`) vanno bene; gli apostrofi (`'`) spezzano la stringa.
- TS strict (house rule §5.6): `exactOptionalPropertyTypes` → niente `campo: undefined`; usa spread condizionali. `noUncheckedIndexedAccess` → accesso array/record e `T | undefined`. Switch su union → esaustivi. I guard di compile-time inutilizzati si silenziano con `void _x` (idioma del codebase, vedi `sqlite-event-store.ts:91-94`).

## Fuori ambito (esplicito)

- **Nessun nuovo `Command`/`Event`/tabella/migrazione.** Il Task 1 aggiunge solo due *const di vocabolario* (`RESOURCE_DIRECTIONS`, `COMMAND_TYPES`) e un alias di tipo behaviour-preserving su `ApplyEffect.direction`.
- **Config provider (`baseUrl`/`model`) NON in `get-ruleset`.** E config dell app, non game-ruleset → estensione di `get-status` o `get-provider`, pianificata in **10f** (spec §8).
- **Streaming, delta read-model** (spec generale §13): deferiti. `get-ruleset` e un read on-demand stateless, non gonfia il push.
- **Master-tools (`@loomn/ai`).** L enum `z.enum(['restore','drain'])` inline in `packages/ai/src/master-tools.ts` resta com e (e una superficie di validazione separata, non importa il tipo del motore). Riconciliarlo a `RESOURCE_DIRECTIONS` e fuori ambito (eviterebbe duplicazione ma allargherebbe lo scope in `@loomn/ai` senza necessita; YAGNI/dichiarato).
- **Tassonomia slot inventario nel Ruleset** (feature Inventario, spec §11 / HANDOFF §8): futura; `Vocabulary` oggi non ha `slots`/`itemCatalog`.
- **Esportare `PHASES`/`QUEST_STATUSES` da shared:** non richiesto dai form GM (servono `SOFT_PHASES`/`QUEST_OUTCOMES`, gli unici *proponibili*); YAGNI.

---

## File da creare / modificare

| File | Azione | Responsabilita |
|---|---|---|
| `packages/engine/src/commands.ts` | Modify | +`RESOURCE_DIRECTIONS`/`ResourceDirection` (e usarlo in `ApplyEffect.direction`); +`COMMAND_TYPES`/`CommandType` + guard di esaustivita |
| `packages/engine/src/commands.test.ts` | Modify | Test dei due nuovi const (valori, no-dup) |
| `packages/shared/src/domain-schema.ts` | Modify | +export `DIFFICULTIES`/`SOFT_PHASES`/`QUEST_OUTCOMES`/`RESOURCE_DIRECTIONS`; refactor degli schemi privati a derivare dai const (behaviour-preserving) |
| `packages/shared/src/command-schema.test.ts` | Modify | Test dei const esportati (valori) |
| `packages/shared/src/ipc.ts` | Modify | +canale `getRuleset`; +`rulesetResultSchema`/`RulesetResult`; +`getRuleset()` su `LoomnBridge` |
| `packages/shared/src/ipc.test.ts` | Modify | Test del canale + schema DTO (ok/errore/rifiuto) |
| `packages/host/src/campaign-service.ts` | Modify | +`RulesetView`; +`getRuleset()` (sincrono, fuori dalla coda) |
| `packages/host/src/campaign-service.test.ts` | Modify | Test di `getRuleset` (vocabolario / enum / regole di fase) |
| `packages/host/src/command-schema.test.ts` | Modify | Drift guard runtime: enum statici shared <-> engine allineati |
| `app/desktop/src/main/index.ts` | Modify | +handler `getRuleset` (drift guard read host->DTO via `vue-tsc`) |
| `app/desktop/src/preload/index.ts` | Modify | +metodo bridge `getRuleset` |
| `app/desktop/src/renderer/src/renderer.ts` | Modify | Self-test fase 1: esercita `get-ruleset` end-to-end |

---

## Task 1: Engine — `RESOURCE_DIRECTIONS` + `COMMAND_TYPES` (vocabolario statico di comando)

**Files:**
- Modify: `packages/engine/src/commands.ts`
- Test: `packages/engine/src/commands.test.ts`

Il motore possiede gia i const `DIFFICULTIES`/`SOFT_PHASES`/`QUEST_OUTCOMES`; mancano la lista delle **direzioni di effetto** (oggi inline in `ApplyEffect`) e la lista runtime dei **tipi di Command** (serve a host per derivare `commandPhaseRules` iterando con `isCommandLegalInPhase`). Entrambe sono additive; il cambio su `ApplyEffect.direction` e puramente type-level (`'restore' | 'drain'` ≡ `ResourceDirection`), behaviour-preserving (il `decide(ApplyEffect)` confronta `command.direction === 'restore'`, invariato). Un guard di esaustivita bidirezionale tiene `COMMAND_TYPES` allineato all unione `Command`.

- [ ] **Step 1: Scrivi i test che falliscono**

In `packages/engine/src/commands.test.ts`, modifica la riga di import (riga 4):

```typescript
import { decide, isCommandLegalInPhase, RESOURCE_DIRECTIONS, COMMAND_TYPES } from './commands';
```

Aggiungi un nuovo `describe` in fondo al file (dopo l ultimo `describe`, prima della fine del file):

```typescript
describe('vocabolario statico di comando (RESOURCE_DIRECTIONS / COMMAND_TYPES)', () => {
  it('RESOURCE_DIRECTIONS elenca restore e drain', () => {
    expect([...RESOURCE_DIRECTIONS]).toEqual(['restore', 'drain']);
  });

  it('COMMAND_TYPES elenca tutti e 11 i tipi di Command', () => {
    expect([...COMMAND_TYPES]).toEqual([
      'AddActor',
      'StartEncounter',
      'EndTurn',
      'NextRound',
      'Attack',
      'RequestCheck',
      'ApplyEffect',
      'StartQuest',
      'AdvanceQuest',
      'EnterPhase',
      'EndEncounter',
    ]);
  });

  it('COMMAND_TYPES non ha duplicati', () => {
    expect(new Set(COMMAND_TYPES).size).toBe(COMMAND_TYPES.length);
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscono**

Run: `pnpm exec vitest run packages/engine/src/commands.test.ts`
Expected: FAIL — `RESOURCE_DIRECTIONS`/`COMMAND_TYPES` non sono esportati (import error / il file non typechecka in vitest).

- [ ] **Step 3: Aggiungi `RESOURCE_DIRECTIONS`/`ResourceDirection` prima dell unione `Command`**

In `packages/engine/src/commands.ts`, subito DOPO l ultima riga di import (riga 12, `import { canTransition, type SoftPhase } from './phase';`) e PRIMA di `export type Command =`, aggiungi:

```typescript

/** Direzioni di un effetto su risorsa (ApplyEffect): vocabolario STATICO di comando, sorella di
 *  DIFFICULTIES (difficulty.ts) / SOFT_PHASES (phase.ts) / QUEST_OUTCOMES (quest.ts). Sorgente unica:
 *  il tipo ApplyEffect.direction la referenzia (sotto). */
export const RESOURCE_DIRECTIONS = ['restore', 'drain'] as const;
export type ResourceDirection = (typeof RESOURCE_DIRECTIONS)[number];
```

- [ ] **Step 4: Usa `ResourceDirection` nel tipo `ApplyEffect`**

In `packages/engine/src/commands.ts`, sostituisci la variante `ApplyEffect` dell unione `Command` (riga ~31):

```typescript
  | { type: 'ApplyEffect'; targetId: string; resource: string; direction: ResourceDirection; dice: DieGroup[]; bonus?: number }
```

- [ ] **Step 5: Aggiungi `COMMAND_TYPES`/`CommandType` + guard di esaustivita**

In `packages/engine/src/commands.ts`, subito DOPO la funzione `isCommandLegalInPhase` (la sua `}` di chiusura, riga ~59) e PRIMA del commento `/** Valida un comando ... */` di `decide`, aggiungi:

```typescript

/** Vocabolario runtime dei tipi di Command (i discriminant dell unione Command). Single-source per
 *  chi deve ITERARE sui comandi a runtime (es. host getRuleset -> commandPhaseRules). Il guard di
 *  esaustivita bidirezionale sotto fa fallire il typecheck se l unione Command e questa lista divergono. */
export const COMMAND_TYPES = [
  'AddActor',
  'StartEncounter',
  'EndTurn',
  'NextRound',
  'Attack',
  'RequestCheck',
  'ApplyEffect',
  'StartQuest',
  'AdvanceQuest',
  'EnterPhase',
  'EndEncounter',
] as const;
export type CommandType = (typeof COMMAND_TYPES)[number];

// Esaustivita a compile-time: se un Command nuovo non e in COMMAND_TYPES -> Exclude non e never ->
// il tipo a sinistra e `never` e `= true` non compila; se COMMAND_TYPES ha un tipo spurio -> idem
// nell altra direzione. Tiene COMMAND_TYPES e l unione Command allineati senza duplicare la verita.
const _commandTypesComplete: Exclude<Command['type'], CommandType> extends never ? true : never = true;
const _commandTypesSound: Exclude<CommandType, Command['type']> extends never ? true : never = true;
void _commandTypesComplete;
void _commandTypesSound;
```

- [ ] **Step 6: Esegui i test e verifica che passano**

Run: `pnpm exec vitest run packages/engine/src/commands.test.ts`
Expected: PASS (i 3 nuovi + tutti i pre-esistenti).

- [ ] **Step 7: Typecheck del pacchetto**

Run: `pnpm -C packages/engine typecheck`
Expected: `Done`. (Se `COMMAND_TYPES` divergesse dall unione `Command`, i guard `_commandTypesComplete`/`_commandTypesSound` fallirebbero qui.)

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/commands.ts packages/engine/src/commands.test.ts
git commit -m "feat(engine): RESOURCE_DIRECTIONS e COMMAND_TYPES (vocabolario statico di comando)"
```

---

## Task 2: Shared — esporta gli enum statici di comando (const)

**Files:**
- Modify: `packages/shared/src/domain-schema.ts`
- Test: `packages/shared/src/command-schema.test.ts`

`@loomn/shared` e FOGLIA: NON puo importare engine, quindi rispecchia i suoi const con copie proprie, esportate per i form GM del renderer (che importa solo `@loomn/shared`). Oggi questi enum esistono come schemi **privati** (`difficultySchema`, `softPhaseSchema`, `questOutcomeSchema`) e come literal inline (`z.enum(['restore','drain'])`). Si promuovono a **const esportati** e si rifa derivare gli schemi dai const — refactor behaviour-preserving (Zod 3.25 accetta tuple `readonly`, verificato: `z.enum(DIFFICULTIES)` ha `.options`/`z.infer` identici). L allineamento engine<->shared e verificato dal Task 4 (runtime) e, per gli enum dentro eventi/stato, dal guard gia esistente in `sqlite-event-store.ts`.

- [ ] **Step 1: Scrivi i test che falliscono**

In `packages/shared/src/command-schema.test.ts`, aggiungi alla riga di import da `@loomn/shared` (la prima del file) i quattro const, e aggiungi un nuovo `describe` in fondo al file:

```typescript
import { DIFFICULTIES, SOFT_PHASES, QUEST_OUTCOMES, RESOURCE_DIRECTIONS } from '@loomn/shared';
```

```typescript
describe('enum statici di comando esportati (per i form GM)', () => {
  it('DIFFICULTIES elenca le sei band di difficolta', () => {
    expect([...DIFFICULTIES]).toEqual(['trivial', 'easy', 'moderate', 'hard', 'formidable', 'legendary']);
  });

  it('SOFT_PHASES elenca le fasi proponibili con EnterPhase', () => {
    expect([...SOFT_PHASES]).toEqual(['exploration', 'dialogue', 'downtime']);
  });

  it('QUEST_OUTCOMES elenca gli esiti terminali di quest', () => {
    expect([...QUEST_OUTCOMES]).toEqual(['completed', 'failed']);
  });

  it('RESOURCE_DIRECTIONS elenca le direzioni di effetto', () => {
    expect([...RESOURCE_DIRECTIONS]).toEqual(['restore', 'drain']);
  });
});
```

> Nota: se `command-schema.test.ts` importa gia `commandSchema` da `@loomn/shared`, aggiungi i quattro const a quella stessa riga di import invece di crearne una seconda.

- [ ] **Step 2: Esegui i test e verifica che falliscono**

Run: `pnpm exec vitest run packages/shared/src/command-schema.test.ts`
Expected: FAIL — i const non sono esportati (import error).

- [ ] **Step 3: Aggiungi i const esportati**

In `packages/shared/src/domain-schema.ts`, subito PRIMA del commento `// difficulty: shared e FOGLIA ...` (riga ~128, sopra `const difficultySchema = ...`), aggiungi:

```typescript
// Enum statici di comando: shared e FOGLIA (non importa engine) -> rispecchia i const dell engine
// (DIFFICULTIES/SOFT_PHASES/QUEST_OUTCOMES/RESOURCE_DIRECTIONS di @loomn/engine). Esportati come const
// per i form GM del renderer (che importa SOLO @loomn/shared, mai engine). L allineamento engine<->shared
// e verificato a runtime in @loomn/host (drift guard, dove engine e shared coesistono); gli enum dentro
// eventi/stato hanno gia il guard di compile-time in sqlite-event-store. Gli schemi privati sotto
// derivano da questi const (single-source nel pacchetto).
export const DIFFICULTIES = ['trivial', 'easy', 'moderate', 'hard', 'formidable', 'legendary'] as const;
export const SOFT_PHASES = ['exploration', 'dialogue', 'downtime'] as const;
export const QUEST_OUTCOMES = ['completed', 'failed'] as const;
export const RESOURCE_DIRECTIONS = ['restore', 'drain'] as const;
```

- [ ] **Step 4: Rifai derivare gli schemi privati dai const (behaviour-preserving)**

In `packages/shared/src/domain-schema.ts`:

(a) Sostituisci `const difficultySchema = z.enum([...]);` (riga ~130) con:

```typescript
const difficultySchema = z.enum(DIFFICULTIES);
```

(b) Sostituisci `const questOutcomeSchema = z.enum(['completed', 'failed']);` (riga ~135) con:

```typescript
const questOutcomeSchema = z.enum(QUEST_OUTCOMES);
```

> Lascia `questStatusSchema` (riga ~134, `['active','completed','failed']`) e `phaseSchema` (riga ~139, `['exploration','dialogue','combat','downtime']`) **invariati**: `QUEST_STATUSES`/`PHASES` non sono esportati (fuori ambito).

(c) Sostituisci `const softPhaseSchema = z.enum(['exploration', 'dialogue', 'downtime']);` (riga ~143) con:

```typescript
const softPhaseSchema = z.enum(SOFT_PHASES);
```

(d) Nell `applyEffectCommandSchema`, sostituisci `direction: z.enum(['restore', 'drain']),` (riga ~294) con:

```typescript
    direction: z.enum(RESOURCE_DIRECTIONS),
```

- [ ] **Step 5: Esegui i test e verifica che passano**

Run: `pnpm exec vitest run packages/shared/src/command-schema.test.ts packages/shared/src/ipc.test.ts`
Expected: PASS (i 4 nuovi + tutti i pre-esistenti di `commandSchema`/`domainEventSchema`; il refactor degli schemi e behaviour-preserving).

- [ ] **Step 6: Typecheck del pacchetto**

Run: `pnpm -C packages/shared typecheck`
Expected: `Done`. (`z.enum(DIFFICULTIES)` con `DIFFICULTIES` `readonly` ritorna `ZodEnum<Writeable<...>>` → infer identico al literal; nessuna regressione su `checkResolvedEventSchema`/`requestCheckCommandSchema`/`commandSchema`.)

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/domain-schema.ts packages/shared/src/command-schema.test.ts
git commit -m "feat(shared): esporta gli enum statici di comando (DIFFICULTIES/SOFT_PHASES/QUEST_OUTCOMES/RESOURCE_DIRECTIONS)"
```

---

## Task 3: Shared — canale IPC `get-ruleset` + DTO

**Files:**
- Modify: `packages/shared/src/ipc.ts`
- Test: `packages/shared/src/ipc.test.ts`

Un canale `invoke/handle` `get-ruleset` (senza payload, come `getStatus`) ritorna un DTO union `{ok:true,...}|{ok:false,error}`. Il DTO porta il vocabolario di modulo (attributi/abilita/risorse/difese + `defaultResources`), gli array di enum statici (`string[]`, vedi Decisione di design) e `commandPhaseRules` (`combatOnly`/`nonCombatOnly`, `string[]`). L assegnabilita host->DTO e imposta a compile-time dall handler del main (Task 5), come per i DTO canon/summary del Piano 0.

- [ ] **Step 1: Scrivi i test che falliscono**

In `packages/shared/src/ipc.test.ts`:

(a) Aggiungi `rulesetResultSchema` all import da `./ipc` (la lista di import in testa al file):

```typescript
  rulesetResultSchema,
```

(b) Nel `describe('IPC_CHANNELS', ...)`, aggiungi un nuovo `it` (dopo quello dei canali read del Piano 0, prima della `})` di chiusura del describe):

```typescript
  it('espone il canale get-ruleset del Piano 10g', () => {
    expect(IPC_CHANNELS.getRuleset).toBe('loomn:get-ruleset');
  });
```

(c) Aggiungi in fondo al file un nuovo describe:

```typescript
describe('rulesetResultSchema (vocabolario + enum + regole di fase)', () => {
  it('accetta un esito ok completo', () => {
    const ok = {
      ok: true,
      vocabulary: {
        attributes: ['forza'],
        skills: ['atletica'],
        resources: ['hp'],
        defenses: ['difesa'],
        defaultResources: { hp: { current: 10, max: 10 } },
      },
      difficulties: ['moderate'],
      softPhases: ['exploration'],
      questOutcomes: ['completed'],
      directions: ['restore'],
      commandPhaseRules: { combatOnly: ['Attack'], nonCombatOnly: ['StartEncounter'] },
    };
    expect(rulesetResultSchema.parse(ok)).toEqual(ok);
  });

  it('accetta l esito di errore', () => {
    expect(rulesetResultSchema.parse({ ok: false, error: 'boom' })).toEqual({ ok: false, error: 'boom' });
  });

  it('rifiuta ok senza commandPhaseRules', () => {
    expect(() =>
      rulesetResultSchema.parse({
        ok: true,
        vocabulary: { attributes: [], skills: [], resources: [], defenses: [], defaultResources: {} },
        difficulties: [],
        softPhases: [],
        questOutcomes: [],
        directions: [],
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscono**

Run: `pnpm exec vitest run packages/shared/src/ipc.test.ts`
Expected: FAIL — `rulesetResultSchema` non esiste (import error) e `IPC_CHANNELS.getRuleset` e `undefined`.

- [ ] **Step 3: Aggiungi il canale a `IPC_CHANNELS`**

In `packages/shared/src/ipc.ts`, dentro l oggetto `IPC_CHANNELS`, subito DOPO `summaries: 'loomn:summaries',` (riga ~26) e PRIMA di `readModelPush`, aggiungi:

```typescript
  /** invoke/handle: vocabolario di gioco + enum statici + regole di fase (Ruleset, read-side 10g). */
  getRuleset: 'loomn:get-ruleset',
```

- [ ] **Step 4: Aggiungi lo schema DTO**

In `packages/shared/src/ipc.ts`, subito DOPO il blocco `summaries` (cioe dopo `export type SummariesResult = ...;`, riga ~175) e PRIMA del blocco `// --- read-model push ...`, aggiungi:

```typescript
// --- getRuleset (vocabolario di gioco + enum statici + regole di fase, read-side per i form GM) ---
/** DTO del Ruleset (10g): il vocabolario di modulo (attributi/abilita/risorse/difese/defaultResources)
 *  iniettato nel main e NON presente nel read-model {version,state} (e la LENTE, non lo stato) + gli
 *  enum statici di comando + le regole di legalita-per-fase dei comandi (da isCommandLegalInPhase, per
 *  disabilitare i comandi GM illegali nella fase corrente). Gli array di enum sono trasporto di liste
 *  di valori (string[]); il renderer ha gli stessi enum TIPIZZATI come const esportati da @loomn/shared.
 *  L assegnabilita host->DTO e imposta a compile-time dall handler del main (drift guard read, come
 *  canon/summary del Piano 0). */
export const rulesetResultSchema = z.union([
  z.object({
    ok: z.literal(true),
    vocabulary: z.object({
      attributes: z.array(z.string()),
      skills: z.array(z.string()),
      resources: z.array(z.string()),
      defenses: z.array(z.string()),
      defaultResources: z.record(z.string(), z.object({ current: z.number(), max: z.number() })),
    }),
    difficulties: z.array(z.string()),
    softPhases: z.array(z.string()),
    questOutcomes: z.array(z.string()),
    directions: z.array(z.string()),
    commandPhaseRules: z.object({
      combatOnly: z.array(z.string()),
      nonCombatOnly: z.array(z.string()),
    }),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type RulesetResult = z.infer<typeof rulesetResultSchema>;
```

- [ ] **Step 5: Aggiungi `getRuleset` a `LoomnBridge`**

In `packages/shared/src/ipc.ts`, dentro `interface LoomnBridge`, subito DOPO il metodo `getSummaries(request: SummariesRequest): Promise<SummariesResult>;` (riga ~203) e PRIMA di `onReadModelPush`, aggiungi:

```typescript
  /** Vocabolario di gioco + enum statici + regole di fase (Ruleset, read-side 10g). Nessun payload. */
  getRuleset(): Promise<RulesetResult>;
```

- [ ] **Step 6: Esegui i test e verifica che passano**

Run: `pnpm exec vitest run packages/shared/src/ipc.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck del pacchetto**

Run: `pnpm -C packages/shared typecheck`
Expected: `Done`.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/ipc.ts packages/shared/src/ipc.test.ts
git commit -m "feat(shared): canale IPC get-ruleset e DTO del vocabolario di gioco"
```

---

## Task 4: Host — `getRuleset()` su `CampaignService` + drift guard enum

**Files:**
- Modify: `packages/host/src/campaign-service.ts`
- Test: `packages/host/src/campaign-service.test.ts`
- Modify: `packages/host/src/command-schema.test.ts`

`CampaignService` resta l unico accesso a `deps.ruleset` (il main resta sottile). `getRuleset()` e **sincrono** e **fuori dalla coda FIFO**: non legge mai `state` (la coda serializza solo le mutazioni); proietta la config STATICA iniettata + gli enum del motore + le regole di fase derivate da `isCommandLegalInPhase` iterando `COMMAND_TYPES`. La vista `RulesetView` (host-owned) e quella che il main assegna al DTO. Il test in `command-schema.test.ts` aggiunge il drift guard runtime engine<->shared dei quattro enum (in quel file gia coesistono engine e shared).

- [ ] **Step 1: Scrivi i test che falliscono (getRuleset)**

In `packages/host/src/campaign-service.test.ts`, aggiungi un nuovo `describe` in fondo al file (usa l helper `makeService` gia presente, che inietta `SERVICE_RULESET`):

```typescript
describe('createCampaignService - getRuleset (vocabolario + enum + regole di fase)', () => {
  it('espone il vocabolario iniettato', () => {
    const { service, memory } = makeService();
    try {
      const rs = service.getRuleset();
      expect(rs.vocabulary.attributes).toEqual(['forza', 'destrezza', 'costituzione', 'intelligenza', 'saggezza', 'carisma']);
      expect(rs.vocabulary.skills).toEqual(['atletica', 'furtivita', 'persuasione', 'intuito', 'arcano', 'percezione']);
      expect(rs.vocabulary.resources).toEqual(['hp', 'mana', 'stamina']);
      expect(rs.vocabulary.defenses).toEqual(['difesa', 'tempra', 'riflessi', 'volonta']);
      expect(rs.vocabulary.defaultResources).toEqual({});
    } finally {
      memory.close();
    }
  });

  it('espone gli enum statici di comando del motore', () => {
    const { service, memory } = makeService();
    try {
      const rs = service.getRuleset();
      expect(rs.difficulties).toEqual(['trivial', 'easy', 'moderate', 'hard', 'formidable', 'legendary']);
      expect(rs.softPhases).toEqual(['exploration', 'dialogue', 'downtime']);
      expect(rs.questOutcomes).toEqual(['completed', 'failed']);
      expect(rs.directions).toEqual(['restore', 'drain']);
    } finally {
      memory.close();
    }
  });

  it('deriva le regole di legalita-per-fase da isCommandLegalInPhase', () => {
    const { service, memory } = makeService();
    try {
      const rs = service.getRuleset();
      expect(rs.commandPhaseRules.combatOnly).toEqual(['Attack', 'EndTurn', 'NextRound', 'EndEncounter']);
      expect(rs.commandPhaseRules.nonCombatOnly).toEqual(['StartEncounter', 'EnterPhase']);
    } finally {
      memory.close();
    }
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscono**

Run: `pnpm exec vitest run packages/host/src/campaign-service.test.ts`
Expected: FAIL — `service.getRuleset` non esiste (TypeError / il file non typechecka in vitest).

- [ ] **Step 3: Estendi l import da `@loomn/engine`**

In `packages/host/src/campaign-service.ts`, sostituisci il blocco di import da `@loomn/engine` (righe 8-17) con:

```typescript
import {
  decide,
  applyEvent,
  rebuild,
  isCommandLegalInPhase,
  COMMAND_TYPES,
  DIFFICULTIES,
  SOFT_PHASES,
  QUEST_OUTCOMES,
  RESOURCE_DIRECTIONS,
  type Command,
  type DomainEvent,
  type GameState,
  type RandomSource,
  type Ruleset,
} from '@loomn/engine';
```

- [ ] **Step 4: Aggiungi il tipo `RulesetView`**

In `packages/host/src/campaign-service.ts`, subito DOPO l interfaccia `CanonQuery` (riga ~87, la sua `}` di chiusura) e PRIMA di `export interface CampaignService`, aggiungi:

```typescript
/** Vista read-side del Ruleset (10g): vocabolario di modulo iniettato + enum statici di comando +
 *  regole di legalita-per-fase. Config STATICA (deps.ruleset), non play-state -> read sincrono fuori
 *  dalla coda. Gli array di enum sono trasporto di valori (string[]); i tipi precisi vivono come const
 *  esportati da @loomn/shared (renderer) e come const di @loomn/engine (qui). */
export interface RulesetView {
  vocabulary: {
    attributes: string[];
    skills: string[];
    resources: string[];
    defenses: string[];
    defaultResources: Record<string, { current: number; max: number }>;
  };
  difficulties: string[];
  softPhases: string[];
  questOutcomes: string[];
  directions: string[];
  commandPhaseRules: { combatOnly: string[]; nonCombatOnly: string[] };
}
```

- [ ] **Step 5: Estendi l interfaccia `CampaignService`**

In `packages/host/src/campaign-service.ts`, dentro `export interface CampaignService`, subito DOPO il metodo `getSummaries(filter?: SummaryFilter): Summary[];` (riga ~106) e PRIMA della `}` di chiusura dell interfaccia, aggiungi:

```typescript
  /** Vocabolario di gioco + enum statici + regole di fase (read-side per i form data-driven di
   *  10f/10d). Read puro su config iniettata (non accodato): non legge mai `state`. */
  getRuleset(): RulesetView;
```

- [ ] **Step 6: Implementa `getRuleset`**

In `packages/host/src/campaign-service.ts`, dentro l oggetto ritornato da `createCampaignService`, subito DOPO il metodo `getSummaries(...)` (la sua `},` di chiusura, riga ~211) e PRIMA della `}` che chiude il `return { ... }`, aggiungi:

```typescript
    // Ruleset read-side (10g): proiezione della config STATICA iniettata (deps.ruleset) + enum di
    // comando del motore + regole di legalita-per-fase derivate da isCommandLegalInPhase. NON accodato
    // (non legge mai `state`): e la LENTE del gioco, non play-state.
    getRuleset(): RulesetView {
      const v = deps.ruleset.vocabulary;
      const combatOnly = COMMAND_TYPES.filter(
        (t) => isCommandLegalInPhase('combat', t) && !isCommandLegalInPhase('exploration', t),
      );
      const nonCombatOnly = COMMAND_TYPES.filter(
        (t) => !isCommandLegalInPhase('combat', t) && isCommandLegalInPhase('exploration', t),
      );
      return {
        vocabulary: {
          attributes: [...v.attributes],
          skills: [...v.skills],
          resources: [...v.resources],
          defenses: [...v.defenses],
          defaultResources: Object.fromEntries(
            Object.entries(v.defaultResources).map(([k, pool]) => [k, { current: pool.current, max: pool.max }]),
          ),
        },
        difficulties: [...DIFFICULTIES],
        softPhases: [...SOFT_PHASES],
        questOutcomes: [...QUEST_OUTCOMES],
        directions: [...RESOURCE_DIRECTIONS],
        commandPhaseRules: { combatOnly: [...combatOnly], nonCombatOnly: [...nonCombatOnly] },
      };
    },
```

- [ ] **Step 7: Esegui i test e verifica che passano**

Run: `pnpm exec vitest run packages/host/src/campaign-service.test.ts`
Expected: PASS.

- [ ] **Step 8: Scrivi il drift guard runtime enum (file di guard esistente)**

In `packages/host/src/command-schema.test.ts`, aggiungi gli import dei const da entrambi i pacchetti (alias per evitare la collisione di nomi engine<->shared) e un nuovo `describe` in fondo al file:

```typescript
import {
  DIFFICULTIES as ENGINE_DIFFICULTIES,
  SOFT_PHASES as ENGINE_SOFT_PHASES,
  QUEST_OUTCOMES as ENGINE_QUEST_OUTCOMES,
  RESOURCE_DIRECTIONS as ENGINE_RESOURCE_DIRECTIONS,
} from '@loomn/engine';
import { DIFFICULTIES, SOFT_PHASES, QUEST_OUTCOMES, RESOURCE_DIRECTIONS } from '@loomn/shared';
```

```typescript
// Drift guard runtime: gli enum statici di comando di @loomn/shared (foglia, copie proprie) devono
// coincidere con i const di @loomn/engine. shared NON puo importare engine -> questo guard vive in host,
// dove entrambi coesistono (come il guard wire->motore sopra).
describe('enum statici di comando shared <-> engine (allineati)', () => {
  it('DIFFICULTIES coincide', () => {
    expect([...DIFFICULTIES]).toEqual([...ENGINE_DIFFICULTIES]);
  });

  it('SOFT_PHASES coincide', () => {
    expect([...SOFT_PHASES]).toEqual([...ENGINE_SOFT_PHASES]);
  });

  it('QUEST_OUTCOMES coincide', () => {
    expect([...QUEST_OUTCOMES]).toEqual([...ENGINE_QUEST_OUTCOMES]);
  });

  it('RESOURCE_DIRECTIONS coincide', () => {
    expect([...RESOURCE_DIRECTIONS]).toEqual([...ENGINE_RESOURCE_DIRECTIONS]);
  });
});
```

- [ ] **Step 9: Esegui i test e verifica che passano**

Run: `pnpm exec vitest run packages/host/src/command-schema.test.ts packages/host/src/campaign-service.test.ts`
Expected: PASS.

- [ ] **Step 10: Typecheck del pacchetto**

Run: `pnpm -C packages/host typecheck`
Expected: `Done`. (`COMMAND_TYPES.filter(...)` ritorna `CommandType[]` → `string[]`; `Object.fromEntries(...)` ritorna `Record<string, {current,max}>`; entrambi assegnabili a `RulesetView`.)

- [ ] **Step 11: Commit**

```bash
git add packages/host/src/campaign-service.ts packages/host/src/campaign-service.test.ts packages/host/src/command-schema.test.ts
git commit -m "feat(host): getRuleset su CampaignService + drift guard enum shared<->engine"
```

---

## Task 5: Wiring Electron — handler IPC + bridge + self-test

**Files:**
- Modify: `app/desktop/src/main/index.ts`
- Modify: `app/desktop/src/preload/index.ts`
- Modify: `app/desktop/src/renderer/src/renderer.ts`

Glue sottile (stile 9c-ii / Piano 0): l handler chiama il read sincrono `service.getRuleset()` e lo avvolge nel DTO. L assegnabilita `RulesetView` -> arm ok di `RulesetResult` e **il drift guard read**, imposta a compile-time da `vue-tsc` su questo file. Il self-test esercita il canale end-to-end nello stack Electron reale (con `devRuleset` iniettato dal main).

- [ ] **Step 1: Estendi l import in `main/index.ts`**

In `app/desktop/src/main/index.ts`, dentro l import da `@loomn/shared` (righe 12-30), aggiungi `type RulesetResult` (es. dopo `type SummariesResult,`):

```typescript
  type RulesetResult,
```

- [ ] **Step 2: Aggiungi l handler `get-ruleset`**

In `app/desktop/src/main/index.ts`, dentro `function registerHandlers(service)`, subito DOPO l handler `IPC_CHANNELS.summaries` (la sua `});` di chiusura, riga ~177) e PRIMA della `}` che chiude `registerHandlers`, aggiungi:

```typescript

  ipcMain.handle(IPC_CHANNELS.getRuleset, (): RulesetResult => {
    try {
      // Spread della vista host nell arm ok: se RulesetView divergesse dal DTO, vue-tsc fallirebbe
      // qui (drift guard read, come canon/summary del Piano 0). Nessun payload da validare.
      return { ok: true, ...service.getRuleset() };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });
```

- [ ] **Step 3: Estendi il preload bridge**

In `app/desktop/src/preload/index.ts`, dentro l import da `@loomn/shared` (righe 2-21), aggiungi `type RulesetResult` (es. dopo `type SummariesResult,`):

```typescript
  type RulesetResult,
```

E dentro l oggetto `const bridge: LoomnBridge = { ... }`, subito DOPO `getSummaries: (request: SummariesRequest): Promise<SummariesResult> => ipcRenderer.invoke(IPC_CHANNELS.summaries, request),` (riga ~40) e PRIMA di `onReadModelPush`, aggiungi:

```typescript
  getRuleset: (): Promise<RulesetResult> => ipcRenderer.invoke(IPC_CHANNELS.getRuleset),
```

- [ ] **Step 4: Estendi il self-test (fase 1)**

In `app/desktop/src/renderer/src/renderer.ts`, dentro `runSelfTest`, nel ramo `if (phase === '1')`, subito DOPO il blocco dei summaries (`const sums = await window.loomn.getSummaries({}); check(...)`, riga ~95) e PRIMA del blocco `set-provider`, aggiungi:

```typescript

      const rs = await window.loomn.getRuleset();
      check(rs.ok && rs.vocabulary.attributes.includes('forza'), 'get-ruleset espone gli attributi del vocabolario');
      check(rs.ok && rs.vocabulary.resources.includes('hp'), 'get-ruleset espone le risorse del vocabolario');
      check(rs.ok && rs.difficulties.includes('moderate'), 'get-ruleset espone le difficolta');
      check(
        rs.ok &&
          rs.commandPhaseRules.combatOnly.includes('Attack') &&
          rs.commandPhaseRules.nonCombatOnly.includes('StartEncounter'),
        'get-ruleset espone le regole di legalita-per-fase',
      );
```

- [ ] **Step 5: Typecheck dell app (drift guard read incluso)**

Run: `pnpm -C app/desktop typecheck`
Expected: `Done`. (Se `RulesetView` (host) divergesse dall arm ok di `RulesetResult` (shared) — es. un campo mancante o un tipo incompatibile — `return { ok: true, ...service.getRuleset() }` fallirebbe qui.)

- [ ] **Step 6: Build dell app (bundle su ABI Node, nativa esternalizzata)**

Run: `pnpm -C app/desktop build`
Expected: build OK (main/preload/renderer bundlati; la nativa better-sqlite3 non viene caricata in build, vedi HANDOFF §7-quinquies).

- [ ] **Step 7: Commit**

```bash
git add app/desktop/src/main/index.ts app/desktop/src/preload/index.ts app/desktop/src/renderer/src/renderer.ts
git commit -m "feat(desktop): handler IPC get-ruleset + bridge + self-test esteso"
```

---

## Verifica finale del branch (orchestratore)

- [ ] **Suite completa (ABI Node), DALLA ROOT:**

Run: `pnpm test`
Expected: tutti verdi (≈ **533**: 515 base + 3 Task 1 + 4 Task 2 + 4 Task 3 + 7 Task 4; Task 5 e self-test/gate, non conta nel Vitest). **⚠️ Dalla ROOT** (la `vitest.workspace.ts` compone packages + renderer; da `app/desktop` gira solo il renderer). Se SQLite fallisce con `NODE_MODULE_VERSION 146 ... requires 137` → `pnpm -r rebuild better-sqlite3` (la nativa e rimasta su ABI Electron da un gate precedente, §7-quinquies — NON la forma root).

- [ ] **Typecheck completo:**

Run: `pnpm -r typecheck`
Expected: `Done` su tutti e 6 i progetti (incluso `app/desktop` via `vue-tsc`).

- [ ] **Gate "esegui l app" (ABI Electron, passo orchestratore — flip ABI confinato):**

```bash
pnpm rebuild:electron
# Lancia electron come nel gate 9c-ii/Piano 0, con LOOMN_SELFTEST e LOOMN_USERDATA su una dir temporanea:
#   Fase 1 (DB fresco): VERDICT atteso PASS (include i nuovi check get-ruleset)
#   Fase 2 (stesso DB): VERDICT atteso PASS (durabilita invariata; get-ruleset e stateless)
pnpm rebuild:node   # ripristina l ABI Node (DEVE essere `pnpm -r rebuild better-sqlite3`, §7-quinquies)
```
Expected: due `VERDICT: PASS`; poi `pnpm test` di nuovo verde (ABI Node ripristinato). **NB:** non eseguire `pnpm test` (ABI Node) in un subagent mentre `rebuild:electron` (ABI Electron) e in corso → serializzali (§0-sexdecies / §7-quinquies).

- [ ] **Final review (subagent, opus)** dell intero branch (BASE = punto di branch, HEAD = ultimo commit), poi **finishing-a-development-branch** (merge ff in main locale + `pnpm test` + `git branch -d`) + **`git push origin main`** (house rule §5.8: remote configurato).

---

## Self-review (eseguita sullo spec con occhi freschi)

**1. Copertura spec (Piano 10 §8 lacuna 10g + §7 audit):**
- Vocabolario di gioco (attributi/abilita/risorse/difese + `defaultResources`) sull IPC → Task 3 (DTO) + Task 4 (`getRuleset` da `deps.ruleset.vocabulary`) + Task 5 (handler/bridge/self-test). ✅
- Enum statici di comando (`DIFFICULTIES`/`SOFT_PHASES`/`QUEST_OUTCOMES`/`restore|drain`) → Task 1 (engine: `RESOURCE_DIRECTIONS`/`COMMAND_TYPES`; gli altri tre gia esistono) + Task 2 (export da shared per i form GM) + Task 3/4 (nel DTO). ✅
- Regole di legalita-per-fase (`commandPhaseRules` da `isCommandLegalInPhase`, per disabilitare i comandi GM illegali) → Task 4 (derivazione iterando `COMMAND_TYPES`) + Task 3 (DTO) + Task 5 (self-test). ✅
- `@loomn/shared` resta foglia; assegnabilita imposta dall handler del main → Task 5 Step 5 (drift guard read via `vue-tsc`) + Task 4 Step 8 (drift guard runtime enum). ✅
- Metodo sincrono su `CampaignService`, fuori dalla coda FIFO (stile Piano 0) → Task 4 (Step 6: `getRuleset` non chiama `enqueue`, non legge `state`). ✅
- Fuori ambito rispettato: nessun nuovo Command/Event/tabella; provider config NON in get-ruleset (10f); master-tools non toccato; streaming/delta deferiti. ✅

**2. Scansione placeholder:** nessun TODO/TBD; ogni step porta codice completo, comando e output atteso. ✅

**3. Consistenza dei tipi (cross-task):**
- `RESOURCE_DIRECTIONS`/`COMMAND_TYPES`/`ResourceDirection`/`CommandType` (Task 1, engine) ↔ usati in `campaign-service.ts` (Task 4, import + `getRuleset`). ✅
- `DIFFICULTIES`/`SOFT_PHASES`/`QUEST_OUTCOMES`/`RESOURCE_DIRECTIONS` esportati da shared (Task 2) ↔ importati nel drift guard host (Task 4 Step 8) e usati per i form dal renderer (10f). ✅
- `rulesetResultSchema`/`RulesetResult` (Task 3, shared) ↔ `RulesetView` (Task 4, host) ↔ assegnati nell handler (Task 5): l assegnabilita `RulesetView` -> arm ok e imposta da `vue-tsc` (Task 5 Step 5). Campi 1:1: `vocabulary{attributes,skills,resources,defenses,defaultResources}`, `difficulties`, `softPhases`, `questOutcomes`, `directions`, `commandPhaseRules{combatOnly,nonCombatOnly}`. ✅
- `getRuleset` su `LoomnBridge` (Task 3) ↔ bridge preload (Task 5 Step 3) ↔ usato nel self-test (Task 5 Step 4). Nessun payload (come `getStatus`). ✅
- `commandPhaseRules` valori attesi (`combatOnly=['Attack','EndTurn','NextRound','EndEncounter']`, `nonCombatOnly=['StartEncounter','EnterPhase']`) coerenti tra il test host (Task 4 Step 1) e il self-test (Task 5 Step 4, sottoinsieme). ✅

**4. Grep anti-apostrofo (house rule §5.4):** verificare PRIMA del commit di ogni task:
`grep -rnE "(it|describe|check)\('[^']*'[A-Za-zaeiou]" packages/engine/src packages/shared/src packages/host/src app/desktop/src` → atteso *no matches*. Tutte le stringhe `it/describe/check` sono scritte senza apostrofi (`all avvio`, `l esito`, `legalita-per-fase`).

**5. Comportamento preservato (refactor):**
- `ApplyEffect.direction: ResourceDirection` ≡ `'restore' | 'drain'` (Task 1): `decide(ApplyEffect)` confronta `command.direction === 'restore'`, invariato. ✅
- `z.enum(DIFFICULTIES)`/`z.enum(SOFT_PHASES)`/`z.enum(QUEST_OUTCOMES)`/`z.enum(RESOURCE_DIRECTIONS)` (Task 2): Zod 3.25 accetta `readonly` tuple, `.options`/`z.infer` identici al literal precedente (verificato in `zod/v3/types.d.ts:760`). `checkResolvedEventSchema`/`requestCheckCommandSchema`/`applyEffectCommandSchema`/`commandSchema` e il drift guard di `sqlite-event-store.ts` restano verdi. ✅

---

## Roadmap dopo il Piano 10g

Sblocca **10f** (Impostazioni/provider + first-run + creazione PG + controlli GM, **form data-driven dal vocabolario+regole di 10g**), poi `10b → 10c → 10d → 10e` (spec Piano 10 §10). Ogni piano segue il flusso §4 dell HANDOFF (writing-plans → commit doc su main → branch → subagent-driven → finishing-a-development-branch merge ff → **`git push origin main`** → aggiorna HANDOFF/memoria). Follow-up minori ancora aperti (HANDOFF §7-quinquies): seed RNG per-campagna persistito; delta read-model (spec generale §13, deferito).

---

## Execution Handoff

Vedi l header: REQUIRED SUB-SKILL `superpowers:subagent-driven-development` (un implementer + spec-review + code-quality-review per task; final review opus dell intero branch prima del merge). I task hanno tutti logica reale → nessuna code-quality review saltata. Procedere in autonomia fino al merge, tenendo l utente aggiornato con una tabellina di stato dei task.
