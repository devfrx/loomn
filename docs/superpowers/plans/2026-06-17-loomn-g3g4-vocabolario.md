# G3/G4 — Vocabolario di gioco + `spawn_npc` combat-ready — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vincolare il vocabolario di gioco (attributi/abilità/risorse/difese) tramite un `Ruleset` iniettato (spec §5.3), così che il motore rifiuti gli id inventati prima di tirare, i tool li espongano con `z.enum`, il contesto mostri le stat per-attore, e `spawn_npc` produca PNG combat-ready.

**Architecture:** Si introduce un value object `Vocabulary` dati-only dentro un `Ruleset { vocabulary, dcForDifficulty }` **iniettato** come 4° parametro di `decide(state, cmd, rng, ruleset)` (mai event-sourced: è config statica di modulo). Il motore è l'arbitro (valida + auto-fill); i tool `ai` vincolano i campi-riferimento con `z.enum` dal vocabolario; `memory` espone le stat per-attore; `host` fornisce un seme dev. `@loomn/shared` resta intatto.

**Tech Stack:** TypeScript strict, Zod 3.25, Vitest. Monorepo pnpm (engine/ai/memory/host + app/desktop).

**Spec:** `docs/superpowers/specs/2026-06-17-g3g4-vocabolario-design.md`.

**Base:** `main` @ `e67e98f`+ (spec già committato), 392 test verdi, typecheck pulito (6 progetti).

---

## File structure

| File | Responsabilità | Task |
|---|---|---|
| `packages/engine/src/ruleset.ts` (nuovo) | `Vocabulary`/`Ruleset` types + `createVocabulary`/`createRuleset` | 1 |
| `packages/engine/src/index.ts` | barrel: esporta `./ruleset` | 1 |
| `packages/host/src/dev-vocabulary.ts` (nuovo) | `devRuleset` seme dev (sostituito dal modulo nel Piano 11) | 2 |
| `packages/host/src/index.ts` | barrel: esporta `devRuleset`/`devVocabulary` | 2 |
| `packages/engine/src/commands.ts` | firma `decide(..., ruleset)`; migra `dcForDifficulty`; `requireMember`; validazioni + auto-fill | 3,4,5,6 |
| `packages/ai/src/master-turn.ts` | `MasterTurnRequest.ruleset`; passa a `decide` e (T7) ai tool | 3,7 |
| `packages/host/src/campaign-service.ts` | `CampaignServiceDeps.ruleset`; passa a `decide`/`runMasterTurn` | 3 |
| `app/desktop/src/main/index.ts` | inietta `devRuleset` in `createCampaignService` | 3 |
| `packages/ai/src/master-tools.ts` | `buildTools(vocab)` + `enumOrString` + firme `masterToolDefs`/`resolveToolCall` | 7 |
| `packages/memory/src/context-assembler.ts` | `renderL1` espone attributi/abilità per-attore | 8 |
| Test ripple | `commands.test.ts`, `master-turn.test.ts`, `master-tools.test.ts`, `campaign-service.test.ts`, `wiring.test.ts`, `context-assembler.test.ts` | per-task |

**Disciplina di scope (CRITICO — house rule §5.1):** ogni task tocca SOLO i file elencati. MAI `package.json`/`tsconfig*`/`vitest.config.ts`. Niente accenti/apostrofi nelle stringhe in apici singoli di `it('...')`/`describe('...')`. `git status --short` prima di ogni commit. I subagent creano file con lo strumento Write.

**Comando test (dalla root):** `pnpm exec vitest run <path>` (il `-C packages/<pkg>` NON risolve la config di root). `pnpm -r typecheck` per il typecheck completo; `pnpm -C app/desktop typecheck` per il solo `app/desktop` (vue-tsc, fuori dalla suite Vitest).

---

## Task 1: `engine/ruleset.ts` — `Vocabulary` + `Ruleset` (puro, dati-only)

**Files:**
- Create: `packages/engine/src/ruleset.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/src/ruleset.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/src/ruleset.test.ts
import { describe, it, expect } from 'vitest';
import { createVocabulary, createRuleset } from './ruleset';
import { dcForDifficulty } from './difficulty';

describe('createVocabulary', () => {
  it('espone i set di membership con has()', () => {
    const v = createVocabulary({ attributes: ['forza'], skills: ['arcano'], resources: ['hp'], defenses: ['difesa'] });
    expect(v.attributes.has('forza')).toBe(true);
    expect(v.attributes.has('magia')).toBe(false);
    expect(v.skills.has('arcano')).toBe(true);
    expect(v.resources.has('hp')).toBe(true);
    expect(v.defenses.has('difesa')).toBe(true);
  });

  it('defaultResources e vuoto se non fornito', () => {
    const v = createVocabulary({ attributes: [], skills: [], resources: ['hp'], defenses: [] });
    expect(v.defaultResources).toEqual({});
  });

  it('conserva i defaultResources con chiavi dichiarate', () => {
    const v = createVocabulary({
      attributes: [], skills: [], resources: ['hp'], defenses: [],
      defaultResources: { hp: { current: 10, max: 10 } },
    });
    expect(v.defaultResources).toEqual({ hp: { current: 10, max: 10 } });
  });

  it('rifiuta defaultResources con una risorsa non dichiarata', () => {
    expect(() =>
      createVocabulary({ attributes: [], skills: [], resources: ['hp'], defenses: [], defaultResources: { mana: { current: 5, max: 5 } } }),
    ).toThrow(/mana/);
  });
});

describe('createRuleset', () => {
  it('usa dcForDifficulty del motore come default', () => {
    const v = createVocabulary({ attributes: [], skills: [], resources: [], defenses: [] });
    const r = createRuleset({ vocabulary: v });
    expect(r.dcForDifficulty('moderate')).toBe(dcForDifficulty('moderate'));
    expect(r.vocabulary).toBe(v);
  });

  it('accetta un dcForDifficulty sovrascritto', () => {
    const v = createVocabulary({ attributes: [], skills: [], resources: [], defenses: [] });
    const r = createRuleset({ vocabulary: v, dcForDifficulty: () => 99 });
    expect(r.dcForDifficulty('moderate')).toBe(99);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/engine/src/ruleset.test.ts`
Expected: FAIL — `Cannot find module './ruleset'`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/engine/src/ruleset.ts
// Ruleset iniettato (spec 5.3): (state, cmd, rng, ruleset) -> DomainEvent[]. Contiene il
// vocabolario di gioco (dati di modulo) e la prima regola comportamentale (dcForDifficulty,
// migrata da SP1). E config STATICA di modulo, NON play-state -> iniettata, mai event-sourced.
// Il motore definisce solo il TIPO e le factory; il vocabolario concreto e dato (host/Piano 11).
import type { ResourcePool } from './actor';
import { dcForDifficulty as defaultDcForDifficulty, type Difficulty } from './difficulty';

export interface Vocabulary {
  attributes: ReadonlySet<string>;
  skills: ReadonlySet<string>;
  resources: ReadonlySet<string>;
  defenses: ReadonlySet<string>;
  /** Template combat-ready applicato da decide(AddActor). Chiavi sottoinsieme di resources
   *  (invariante imposta dal factory). Record (non Map): l auto-fill e uno spread con actor.resources. */
  defaultResources: Readonly<Record<string, ResourcePool>>;
}

export interface Ruleset {
  vocabulary: Vocabulary;
  dcForDifficulty: (d: Difficulty) => number;
}

export interface VocabularyInput {
  attributes: string[];
  skills: string[];
  resources: string[];
  defenses: string[];
  defaultResources?: Record<string, ResourcePool>;
}

/** Costruisce un Vocabulary: array in ingresso -> Set per membership O(1). Valida
 *  l invariante defaultResources.keys sottoinsieme di resources. */
export function createVocabulary(input: VocabularyInput): Vocabulary {
  const resources = new Set(input.resources);
  const defaultResources = input.defaultResources ?? {};
  for (const k of Object.keys(defaultResources)) {
    if (!resources.has(k)) {
      throw new Error(`defaultResources contiene una risorsa non dichiarata: ${k}`);
    }
  }
  return {
    attributes: new Set(input.attributes),
    skills: new Set(input.skills),
    resources,
    defenses: new Set(input.defenses),
    defaultResources,
  };
}

/** Assembla un Ruleset; dcForDifficulty default = la funzione del motore (SP1, ora referenziata qui). */
export function createRuleset(input: { vocabulary: Vocabulary; dcForDifficulty?: (d: Difficulty) => number }): Ruleset {
  return {
    vocabulary: input.vocabulary,
    dcForDifficulty: input.dcForDifficulty ?? defaultDcForDifficulty,
  };
}
```

Modify `packages/engine/src/index.ts` — aggiungi dopo la riga `export * from './difficulty';`:

```ts
export * from './ruleset';
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm exec vitest run packages/engine/src/ruleset.test.ts` → PASS (6 test).
Run: `pnpm -C packages/engine typecheck` → nessun errore.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/ruleset.ts packages/engine/src/ruleset.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): Vocabulary + Ruleset iniettabili (dati-only, spec 5.3)"
```

---

## Task 2: `host/dev-vocabulary.ts` — seme dev del vocabolario

**Files:**
- Create: `packages/host/src/dev-vocabulary.ts`
- Modify: `packages/host/src/index.ts`
- Test: `packages/host/src/dev-vocabulary.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/host/src/dev-vocabulary.test.ts
import { describe, it, expect } from 'vitest';
import { devRuleset } from './dev-vocabulary';

describe('devRuleset', () => {
  it('dichiara un vocabolario fantasy minimale', () => {
    expect(devRuleset.vocabulary.attributes.has('forza')).toBe(true);
    expect(devRuleset.vocabulary.resources.has('hp')).toBe(true);
    expect(devRuleset.vocabulary.defenses.has('difesa')).toBe(true);
  });

  it('rende combat-ready via defaultResources (hp)', () => {
    expect(devRuleset.vocabulary.defaultResources.hp).toEqual({ current: 10, max: 10 });
  });

  it('porta dcForDifficulty del motore', () => {
    expect(devRuleset.dcForDifficulty('moderate')).toBe(15);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/host/src/dev-vocabulary.test.ts`
Expected: FAIL — `Cannot find module './dev-vocabulary'`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/host/src/dev-vocabulary.ts
// Seme DEV del vocabolario: un foglio fantasy minimale, stand-in finche non esiste il sistema di
// moduli (Piano 11), che sostituira la SORGENTE (modulo caricato) mantenendo questa forma. NON
// vive nel motore puro (niente vocabolario hardcoded, spec 11.6): host e l adapter di composizione.
import { createRuleset, createVocabulary, type Ruleset } from '@loomn/engine';

export const devRuleset: Ruleset = createRuleset({
  vocabulary: createVocabulary({
    attributes: ['forza', 'destrezza', 'costituzione', 'intelligenza', 'saggezza', 'carisma'],
    skills: ['atletica', 'furtivita', 'persuasione', 'intuito', 'arcano', 'percezione'],
    resources: ['hp', 'mana', 'stamina'],
    defenses: ['difesa', 'tempra', 'riflessi', 'volonta'],
    defaultResources: { hp: { current: 10, max: 10 } },
  }),
});
```

Modify `packages/host/src/index.ts` — aggiungi in fondo:

```ts
export { devRuleset } from './dev-vocabulary';
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm exec vitest run packages/host/src/dev-vocabulary.test.ts` → PASS (3 test).
Run: `pnpm -C packages/host typecheck` → nessun errore.

- [ ] **Step 5: Commit**

```bash
git add packages/host/src/dev-vocabulary.ts packages/host/src/dev-vocabulary.test.ts packages/host/src/index.ts
git commit -m "feat(host): seme dev del vocabolario (devRuleset)"
```

---

## Task 3: thread `ruleset` ovunque + migra `dcForDifficulty` (behavior-preserving)

> **Questo task è atomico e cross-package** (la firma di `decide` cambia → tutti i call-site insieme). NON aggiunge ancora validazioni di vocabolario: deve restare a comportamento invariato (suite verde). **Strategia anti-ripple (CRITICA, lezione SP4):** ogni file di test riceve un `ruleset` il cui **vocabolario copre TUTTI gli id usati in quel file** e con **`defaultResources` vuoto** → così i Task 4-6 (validazioni + auto-fill) diventano puramente additivi e non rompono questi test.

**Files:**
- Modify: `packages/engine/src/commands.ts`
- Modify: `packages/engine/src/commands.test.ts`
- Modify: `packages/ai/src/master-turn.ts`
- Modify: `packages/ai/src/master-turn.test.ts`
- Modify: `packages/host/src/campaign-service.ts`
- Modify: `packages/host/src/campaign-service.test.ts`
- Modify: `packages/host/src/wiring.test.ts`
- Modify: `app/desktop/src/main/index.ts`

- [ ] **Step 1: `engine/commands.ts` — firma + migrazione dcForDifficulty**

In testa al file, sostituisci l import di difficulty:
```ts
// PRIMA: import { dcForDifficulty, type Difficulty } from './difficulty';
import type { Difficulty } from './difficulty';
import type { Ruleset } from './ruleset';
```
Cambia la firma di `decide` e usa `ruleset.dcForDifficulty`:
```ts
export function decide(state: GameState, command: Command, rng: RandomSource, ruleset: Ruleset): DomainEvent[] {
```
Nel caso `RequestCheck`, sostituisci `dc: dcForDifficulty(command.difficulty)` con:
```ts
          dc: ruleset.dcForDifficulty(command.difficulty),
```
(Nessun altra modifica logica in questo task.)

- [ ] **Step 2: `engine/commands.test.ts` — TEST_RULESET + aggiorna i 41 call-site**

In testa al file (dopo gli import), aggiungi:
```ts
import { createRuleset, createVocabulary } from './ruleset';

// Vocabolario di test: copre TUTTI gli id usati nelle fixture di questo file (forza/hp/mana/difesa).
// defaultResources VUOTO: l auto-fill di AddActor (Task 4) non deve perturbare i test esistenti.
const TEST_RULESET = createRuleset({
  vocabulary: createVocabulary({ attributes: ['forza'], skills: [], resources: ['hp', 'mana'], defenses: ['difesa'] }),
});
```
Aggiorna **ogni** chiamata `decide(state, cmd, rng)` aggiungendo `TEST_RULESET` come 4° argomento: `decide(state, cmd, rng, TEST_RULESET)`. (Sono 41 occorrenze — aggiornale tutte; sono meccaniche.) Verifica con `git grep -n "decide(" packages/engine/src/commands.test.ts` che nessuna resti a 3 argomenti.

> Nota: `mana` è nel vocabolario di test apposta — il test "risorsa sconosciuta: mana" verifica il rifiuto a livello di **attore** (l attore non ha `mana`), non a livello di vocabolario. Tenendolo legale nel vocabolario, quel test continua a colpire il check esistente di ApplyEffect/Attack invariato.

- [ ] **Step 3: `ai/master-turn.ts` — MasterTurnRequest.ruleset + passa a decide**

Cambia l import da `@loomn/engine` aggiungendo `Ruleset`:
```ts
import { decide, applyEvent, type Command, type DomainEvent, type GameState, type Phase, type RandomSource, type Ruleset } from '@loomn/engine';
```
Aggiungi il campo a `MasterTurnRequest` (dopo `rng`):
```ts
  /** Ruleset iniettato (vocabolario + dcForDifficulty), spec 5.3. Passato a decide. */
  ruleset: Ruleset;
```
Nel ciclo, cambia la chiamata a decide:
```ts
        produced = decide(state, resolution.command, request.rng, request.ruleset);
```
(`masterToolDefs`/`resolveToolCall` restano invariati in questo task; cambieranno nel Task 7.)

- [ ] **Step 4: `ai/master-turn.test.ts` — passa un ruleset a ogni runMasterTurn**

In testa aggiungi un ruleset di test con vocabolario LARGO (copre tutti gli id dei tool-call del fake model in questo file) e defaultResources vuoto:
```ts
import { createRuleset, createVocabulary } from '@loomn/engine';

const TURN_RULESET = createRuleset({
  vocabulary: createVocabulary({
    attributes: ['forza', 'destrezza', 'costituzione', 'intelligenza', 'saggezza', 'carisma'],
    skills: ['atletica', 'furtivita', 'persuasione', 'intuito', 'arcano', 'percezione'],
    resources: ['hp', 'mana', 'stamina'],
    defenses: ['difesa', 'tempra', 'riflessi', 'volonta'],
  }),
});
```
Aggiungi `ruleset: TURN_RULESET` all oggetto passato a **ogni** `runMasterTurn({...})`. Se qualche test usa un id non coperto (lo scoprirai ai Task 4-6 quando la validazione si accende; ma per sicurezza scansiona ora i tool-call del fake model), aggiungilo al vocabolario.

- [ ] **Step 5: `host/campaign-service.ts` — deps.ruleset + passa a decide/runMasterTurn**

Aggiungi l import di `Ruleset`:
```ts
import {
  decide,
  applyEvent,
  rebuild,
  type Command,
  type DomainEvent,
  type GameState,
  type RandomSource,
  type Ruleset,
} from '@loomn/engine';
```
Aggiungi a `CampaignServiceDeps` (dopo `rng`):
```ts
  /** Ruleset iniettato (vocabolario + dcForDifficulty): passato a decide e runMasterTurn. */
  ruleset: Ruleset;
```
In `dispatch`, cambia:
```ts
        const events = decide(state, command, deps.rng, deps.ruleset);
```
In `runTurn`, aggiungi `ruleset` alla request di runMasterTurn:
```ts
        const result = await runMasterTurn({
          model: deps.model,
          rng: deps.rng,
          ruleset: deps.ruleset,
          state,
          playerAction,
          assembleContext: deps.memory.assembleContext,
        });
```

- [ ] **Step 6: `host/campaign-service.test.ts` + `host/wiring.test.ts` — inietta un ruleset**

In ciascuno, definisci un ruleset di test largo (come `TURN_RULESET` sopra, defaultResources vuoto) e aggiungilo alle deps di **ogni** `createCampaignService({...})` e alla request di ogni `runMasterTurn({...})`. Usa lo stesso vocabolario largo per coprire gli id delle fixture.

- [ ] **Step 7: `app/desktop/src/main/index.ts` — inietta devRuleset**

Aggiungi `devRuleset` all import da `@loomn/host`:
```ts
import {
  createMemorySystem,
  createCampaignService,
  createLanguageProvider,
  devRuleset,
  type CampaignService,
  type MemorySystem,
} from '@loomn/host';
```
Aggiungi alla costruzione del servizio (riga ~175):
```ts
  const service = createCampaignService({
    memory,
    model: holder.model,
    structured: holder.structured,
    rng: createSeededRandom(DEV_SEED),
    ruleset: devRuleset,
  });
```

- [ ] **Step 8: Run tests + typecheck**

Run: `pnpm exec vitest run packages/engine packages/ai packages/host` → tutti verdi (stesso conteggio di prima + i 3 di Task 2, nessuna regressione).
Run: `pnpm -r typecheck` → pulito.
Run: `pnpm -C app/desktop typecheck` → pulito (vue-tsc; `app/desktop` non è nella suite Vitest).

- [ ] **Step 9: Commit**

```bash
git add packages/engine/src/commands.ts packages/engine/src/commands.test.ts packages/ai/src/master-turn.ts packages/ai/src/master-turn.test.ts packages/host/src/campaign-service.ts packages/host/src/campaign-service.test.ts packages/host/src/wiring.test.ts app/desktop/src/main/index.ts
git commit -m "refactor(engine): decide(state,cmd,rng,ruleset) iniettato; migra dcForDifficulty nel Ruleset (no validazione)"
```

---

## Task 4: `decide(AddActor)` — valida le chiavi-stat + auto-fill combat-ready

**Files:**
- Modify: `packages/engine/src/commands.ts`
- Modify: `packages/engine/src/commands.test.ts`

- [ ] **Step 1: Write the failing tests**

Aggiungi a `commands.test.ts` (usa rulesets locali bespoke per asserire accettazione/rifiuto/auto-fill):
```ts
describe('decide(AddActor) — vocabolario e auto-fill', () => {
  const VOCAB = createRuleset({
    vocabulary: createVocabulary({
      attributes: ['forza'], skills: ['arcano'], resources: ['hp'], defenses: [],
      defaultResources: { hp: { current: 10, max: 10 } },
    }),
  });
  const npc = (over: Partial<Actor> = {}): Actor => ({
    id: 'png', name: 'PNG', kind: 'npc', attributes: {}, skills: {}, resources: {}, conditions: [], items: [],
    progression: { xp: 0, level: 0 }, ...over,
  });

  it('rifiuta un attributo fuori vocabolario', () => {
    expect(() => decide(initialState, { type: 'AddActor', actor: npc({ attributes: { magia: 2 } }) }, stub([0.5]), VOCAB)).toThrow(/magia/);
  });

  it('rifiuta una risorsa fuori vocabolario', () => {
    expect(() => decide(initialState, { type: 'AddActor', actor: npc({ resources: { oro: { current: 1, max: 1 } } }) }, stub([0.5]), VOCAB)).toThrow(/oro/);
  });

  it('riempie hp dal template quando il modello non lo fornisce (combat-ready)', () => {
    const events = decide(initialState, { type: 'AddActor', actor: npc({ resources: {} }) }, stub([0.5]), VOCAB);
    const added = events[0];
    if (added?.type !== 'ActorAdded') throw new Error('atteso ActorAdded');
    expect(added.actor.resources.hp).toEqual({ current: 10, max: 10 });
  });

  it('le risorse fornite dal modello sovrascrivono il default', () => {
    const events = decide(initialState, { type: 'AddActor', actor: npc({ resources: { hp: { current: 30, max: 30 } } }) }, stub([0.5]), VOCAB);
    const added = events[0];
    if (added?.type !== 'ActorAdded') throw new Error('atteso ActorAdded');
    expect(added.actor.resources.hp).toEqual({ current: 30, max: 30 });
  });

  it('accetta attributi/abilita/risorse tutti in vocabolario', () => {
    const events = decide(initialState, { type: 'AddActor', actor: npc({ attributes: { forza: 3 }, skills: { arcano: 1 } }) }, stub([0.5]), VOCAB);
    expect(events).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run packages/engine/src/commands.test.ts`
Expected: FAIL (i rifiuti non lanciano; l auto-fill non avviene).

- [ ] **Step 3: Implement in `commands.ts`**

Aggiungi un helper privato (in cima al file, dopo gli import):
```ts
// Lancia se key non e nel set, elencando i valori legali (l errore reiniettato fa auto-correggere
// il loop agentico). Il vocabolario e iniettato: "legale" = membership, non per-attore.
function requireMember(set: ReadonlySet<string>, key: string, kind: string): void {
  if (!set.has(key)) {
    const legal = [...set].join(', ') || '(nessuno)';
    throw new Error(`${kind} sconosciuto: ${key}. Validi: ${legal}`);
  }
}
```
Sostituisci il caso `AddActor`:
```ts
    case 'AddActor': {
      if (state.actors[command.actor.id] !== undefined) {
        throw new Error(`Attore già presente: ${command.actor.id}`);
      }
      const vocab = ruleset.vocabulary;
      for (const k of Object.keys(command.actor.attributes)) requireMember(vocab.attributes, k, 'Attributo');
      for (const k of Object.keys(command.actor.skills)) requireMember(vocab.skills, k, 'Abilita');
      for (const k of Object.keys(command.actor.resources)) requireMember(vocab.resources, k, 'Risorsa');
      // Auto-fill combat-ready: le risorse mancanti dal template; quelle fornite sovrascrivono.
      const resources = { ...vocab.defaultResources, ...command.actor.resources };
      return [{ type: 'ActorAdded', actor: { ...command.actor, resources } }];
    }
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm exec vitest run packages/engine` → tutti verdi (nuovi + esistenti; il `TEST_RULESET` con defaultResources vuoto garantisce che gli AddActor esistenti NON cambino).
Run: `pnpm -C packages/engine typecheck` → pulito.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/commands.ts packages/engine/src/commands.test.ts
git commit -m "feat(engine): decide(AddActor) valida le chiavi-stat e auto-fill combat-ready (G4)"
```

---

## Task 5: `decide(Attack)` — valida attribute/skill/defense/damageResource

**Files:**
- Modify: `packages/engine/src/commands.ts`
- Modify: `packages/engine/src/commands.test.ts`

- [ ] **Step 1: Write the failing tests**

Aggiungi a `commands.test.ts` (riusa l helper `inCombat`/`actor` esistenti; `BVOCAB` copre forza/difesa/hp):
```ts
describe('decide(Attack) — vocabolario', () => {
  const BVOCAB = createRuleset({
    vocabulary: createVocabulary({ attributes: ['forza'], skills: ['arcano'], resources: ['hp'], defenses: ['difesa'] }),
  });
  const base = (over: Record<string, unknown> = {}) => ({
    type: 'Attack' as const, attackerId: 'eroe', targetId: 'goblin', defense: 'difesa', defenseBase: 10, damageResource: 'hp', ...over,
  });
  // Stato in combat con eroe (forza) + goblin (hp). Riusa i fixture del file: actor()/inCombat().

  it('rifiuta una difesa fuori vocabolario', () => {
    expect(() => decide(combatHeroGoblin(), base({ defense: 'parata' }), stub([0.5]), BVOCAB)).toThrow(/parata/);
  });

  it('rifiuta un damageResource fuori vocabolario', () => {
    expect(() => decide(combatHeroGoblin(), base({ damageResource: 'danno' }), stub([0.5]), BVOCAB)).toThrow(/danno/);
  });

  it('rifiuta un attributo fuori vocabolario', () => {
    expect(() => decide(combatHeroGoblin(), base({ attribute: 'magia' }), stub([0.5]), BVOCAB)).toThrow(/magia/);
  });

  it('accetta un attacco interamente in vocabolario', () => {
    const events = decide(combatHeroGoblin(), base({ attribute: 'forza' }), stub([0.99]), BVOCAB);
    expect(events.length).toBeGreaterThanOrEqual(1);
  });
});
```
> `combatHeroGoblin()` = costruisci lo stato in combat con `eroe` (attributes `{forza}`, resources `{hp}`) e `goblin` (resources `{hp}`), riusando gli helper già presenti nel file (`actor`, `inCombat`/`startEncounter`). Se non esiste un helper comodo, costruiscilo localmente nel `describe`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run packages/engine/src/commands.test.ts` → FAIL (oggi `defense`/`attribute` non sono validati; `damageResource:'danno'` lancia tardi da `adjustResource` dopo aver tirato, non con il messaggio del vocabolario).

- [ ] **Step 3: Implement in `commands.ts`**

In cima al caso `Attack`, dopo aver risolto `attacker`/`target` (mantieni il check esistente "Attaccante o bersaglio sconosciuto"), aggiungi le validazioni di vocabolario **prima** di `performAttack`:
```ts
      const vocab = ruleset.vocabulary;
      if (command.attribute !== undefined) requireMember(vocab.attributes, command.attribute, 'Attributo');
      if (command.skill !== undefined) requireMember(vocab.skills, command.skill, 'Abilita');
      requireMember(vocab.defenses, command.defense, 'Difesa');
      requireMember(vocab.resources, command.damageResource, 'Risorsa');
      if (target.resources[command.damageResource] === undefined) {
        throw new Error(`Risorsa sconosciuta: ${command.damageResource}`);
      }
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm exec vitest run packages/engine` → verdi.
Run: `pnpm -C packages/engine typecheck` → pulito.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/commands.ts packages/engine/src/commands.test.ts
git commit -m "feat(engine): decide(Attack) valida attribute/skill/defense/damageResource (G3)"
```

---

## Task 6: `decide(RequestCheck)` + `decide(ApplyEffect)` — valida il vocabolario

**Files:**
- Modify: `packages/engine/src/commands.ts`
- Modify: `packages/engine/src/commands.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe('decide(RequestCheck/ApplyEffect) — vocabolario', () => {
  const RVOCAB = createRuleset({
    vocabulary: createVocabulary({ attributes: ['forza'], skills: ['arcano'], resources: ['hp'], defenses: [] }),
  });
  // stato con `eroe` (attributes {forza}, resources {hp}) — riusa l helper del file.

  it('RequestCheck rifiuta un attributo fuori vocabolario', () => {
    expect(() => decide(heroState(), { type: 'RequestCheck', actorId: 'eroe', attribute: 'magia', difficulty: 'moderate' }, stub([0.5]), RVOCAB)).toThrow(/magia/);
  });

  it('RequestCheck rifiuta una abilita fuori vocabolario', () => {
    expect(() => decide(heroState(), { type: 'RequestCheck', actorId: 'eroe', skill: 'spada', difficulty: 'moderate' }, stub([0.5]), RVOCAB)).toThrow(/spada/);
  });

  it('RequestCheck accetta attributo in vocabolario', () => {
    const events = decide(heroState(), { type: 'RequestCheck', actorId: 'eroe', attribute: 'forza', difficulty: 'moderate' }, stub([0.5]), RVOCAB);
    expect(events[0]?.type).toBe('CheckResolved');
  });

  it('ApplyEffect rifiuta una risorsa fuori vocabolario', () => {
    expect(() => decide(heroState(), { type: 'ApplyEffect', targetId: 'eroe', resource: 'reputazione', direction: 'restore', dice: [{ count: 1, sides: 6 }] }, stub([0.5]), RVOCAB)).toThrow(/reputazione/);
  });
});
```
> `heroState()` = stato (fuori combat) con `eroe` (attributes `{forza}`, resources `{hp}`), riusando gli helper del file.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run packages/engine/src/commands.test.ts` → FAIL (oggi `magia`/`spada` danno 0 silenzioso; `reputazione` lancia col messaggio "Risorsa sconosciuta" a livello attore, non vocabolario).

- [ ] **Step 3: Implement in `commands.ts`**

Nel caso `RequestCheck`, dopo il check `actor === undefined`, aggiungi:
```ts
      if (command.attribute !== undefined) requireMember(ruleset.vocabulary.attributes, command.attribute, 'Attributo');
      if (command.skill !== undefined) requireMember(ruleset.vocabulary.skills, command.skill, 'Abilita');
```
Nel caso `ApplyEffect`, **prima** del check esistente `target.resources[command.resource] === undefined`, aggiungi:
```ts
      requireMember(ruleset.vocabulary.resources, command.resource, 'Risorsa');
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm exec vitest run packages/engine` → verdi.
Run: `pnpm -C packages/engine typecheck` → pulito.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/commands.ts packages/engine/src/commands.test.ts
git commit -m "feat(engine): decide(RequestCheck/ApplyEffect) valida il vocabolario (G3)"
```

---

## Task 7: `ai/master-tools.ts` — `z.enum` dal vocabolario sui campi-riferimento

> I tool diventano funzione del vocabolario. I campi-riferimento (stringa singola) di `attack`/`request_check`/`apply_effect` usano `z.enum` dal vocabolario. **`spawn_npc` resta a record APERTI** (le sue chiavi le valida il motore, Task 4): `z.record(z.enum)` produrrebbe un JSON con tutte le chiavi `required` (verificato empiricamente, ingannevole per il modello).

**Files:**
- Modify: `packages/ai/src/master-tools.ts`
- Modify: `packages/ai/src/master-turn.ts`
- Modify: `packages/ai/src/master-tools.test.ts`

- [ ] **Step 1: Write the failing tests**

Aggiungi a `master-tools.test.ts` (in cima un vocabolario di test, e i nuovi casi):
```ts
import { createVocabulary } from '@loomn/engine';

const VOCAB = createVocabulary({
  attributes: ['forza'], skills: ['arcano'], resources: ['hp'], defenses: ['difesa'],
});

describe('z.enum dal vocabolario', () => {
  it('attack rifiuta un damageResource fuori vocabolario', () => {
    const r = resolveToolCall('attack', JSON.stringify({ attackerId: 'a', targetId: 'b', defense: 'difesa', defenseBase: 10, damageResource: 'danno' }), VOCAB);
    expect(r.ok).toBe(false);
  });

  it('attack accetta un damageResource in vocabolario', () => {
    const r = resolveToolCall('attack', JSON.stringify({ attackerId: 'a', targetId: 'b', defense: 'difesa', defenseBase: 10, damageResource: 'hp' }), VOCAB);
    expect(r.ok).toBe(true);
  });

  it('request_check rifiuta una abilita fuori vocabolario', () => {
    const r = resolveToolCall('request_check', JSON.stringify({ actorId: 'a', skill: 'spada', difficulty: 'moderate' }), VOCAB);
    expect(r.ok).toBe(false);
  });

  it('masterToolDefs mostra l enum di damageResource nel JSON schema', () => {
    const defs = masterToolDefs('combat', VOCAB);
    const attack = defs.find((d) => d.name === 'attack');
    expect(JSON.stringify(attack?.parameters)).toContain('"enum":["hp"]');
  });

  it('con vocabolario vuoto ripiega su stringa (niente z.enum vuoto)', () => {
    const empty = createVocabulary({ attributes: [], skills: [], resources: [], defenses: [] });
    const r = resolveToolCall('apply_effect', JSON.stringify({ targetId: 'a', resource: 'qualsiasi', direction: 'restore', dice: [{ count: 1, sides: 6 }] }), empty);
    expect(r.ok).toBe(true); // fallback z.string(): non blocca prima che un modulo dichiari il vocabolario
  });
});
```
Aggiorna inoltre **ogni** chiamata esistente `resolveToolCall(name, args)` → `resolveToolCall(name, args, VOCAB)` e `masterToolDefs(phase)` → `masterToolDefs(phase, VOCAB)` in questo file (sono ~48; il `VOCAB` sopra copre gli id "validi" usati nelle fixture esistenti — se una fixtura usa un id non coperto, aggiungilo a `VOCAB`).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run packages/ai/src/master-tools.test.ts`
Expected: FAIL — `resolveToolCall`/`masterToolDefs` non accettano un 3° argomento.

- [ ] **Step 3: Implement in `master-tools.ts`**

Importa il tipo e aggiungi l helper di fallback:
```ts
import type { Command, Phase, Vocabulary } from '@loomn/engine';
```
Aggiungi (vicino agli helper di coercizione):
```ts
// Campo-riferimento vincolato al vocabolario: set non vuoto -> z.enum (il modello non puo emettere
// un id fuori-vocabolario, JSON {enum:[...]}); set vuoto -> z.string() (non blocca finche un modulo
// non dichiara il vocabolario). z.record(z.enum) NON si usa: renderebbe il JSON con tutte le chiavi
// required (verificato empiricamente) -> per spawn_npc le chiavi le valida il motore.
function enumOrString(set: ReadonlySet<string>): z.ZodTypeAny {
  const values = [...set];
  return values.length > 0 ? z.enum(values as [string, ...string[]]) : z.string().min(1);
}
```
Trasforma il registro in funzione del vocabolario. Sostituisci gli schemi vocab-dipendenti e la const `TOOLS` con un `buildTools(vocab)`. Gli schemi vocab-dipendenti (`attackSchema`, `requestCheckSchema`, `applyEffectSchema`) vanno costruiti dentro `buildTools`; `spawnNpcSchema`, `startEncounterSchema`, quest/phase/end-* restano come sono (record aperti / invariati). Struttura:
```ts
function buildTools(vocab: Vocabulary): Record<string, ToolEntry> {
  const attribute = enumOrString(vocab.attributes);
  const skill = enumOrString(vocab.skills);
  const resource = enumOrString(vocab.resources);
  const defense = enumOrString(vocab.defenses);

  const attackSchema = z.object({
    attackerId: z.string().min(1),
    targetId: z.string().min(1),
    attribute: attribute.optional(),
    skill: skill.optional(),
    defense,
    defenseBase: llmNumber,
    damageResource: resource,
  });
  const requestCheckSchema = z.object({
    actorId: z.string().min(1),
    attribute: attribute.optional(),
    skill: skill.optional(),
    difficulty: z.enum(DIFFICULTIES),
  });
  const applyEffectSchema = z.object({
    targetId: z.string().min(1),
    resource,
    direction: z.enum(['restore', 'drain']),
    dice: llmArray(z.array(dieGroupArgSchema).min(1)),
    bonus: llmNumber.optional(),
  });

  return {
    spawn_npc: makeEntry(/* descrizione invariata */ 'Crea e aggiunge un nuovo PNG al mondo (diventa canone). Usa id univoci.', 'AddActor', spawnNpcSchema, (a) => ({ /* invariato */ type: 'AddActor', actor: { id: a.id, name: a.name, kind: 'npc', attributes: a.attributes ?? {}, skills: a.skills ?? {}, resources: a.resources ?? {}, conditions: [], items: [], progression: { xp: 0, level: 0 } } })),
    request_check: makeEntry(/* descrizione invariata */ '...', 'RequestCheck', requestCheckSchema, (a) => ({ type: 'RequestCheck', actorId: a.actorId, difficulty: a.difficulty, ...(a.attribute !== undefined ? { attribute: a.attribute } : {}), ...(a.skill !== undefined ? { skill: a.skill } : {}) })),
    apply_effect: makeEntry('...', 'ApplyEffect', applyEffectSchema, (a) => ({ type: 'ApplyEffect', targetId: a.targetId, resource: a.resource, direction: a.direction, dice: a.dice, ...(a.bonus !== undefined ? { bonus: a.bonus } : {}) })),
    // start_quest / advance_quest / attack / start_encounter / end_turn / next_round / enter_phase / end_encounter: identiche a oggi, con attackSchema preso dal locale sopra.
    attack: makeEntry('...', 'Attack', attackSchema, (a) => ({ type: 'Attack', attackerId: a.attackerId, targetId: a.targetId, defense: a.defense, defenseBase: a.defenseBase, damageResource: a.damageResource, ...(a.attribute !== undefined ? { attribute: a.attribute } : {}), ...(a.skill !== undefined ? { skill: a.skill } : {}) })),
    // ...le altre voci invariate (copia le descrizioni e i toCommand esistenti)...
  };
}
```
> Mantieni IDENTICHE le descrizioni e i `toCommand` esistenti delle voci non-vocab; sposta solo dentro `buildTools` ciò che dipende dal vocabolario. `makeEntry`/`ToolEntry`/`issuesOf` restano invariati.

Cambia le firme pubbliche:
```ts
export function masterToolDefs(phase: Phase, vocabulary: Vocabulary): LlmToolDef[] {
  const tools = buildTools(vocabulary);
  return Object.entries(tools)
    .filter(([, t]) => isCommandLegalInPhase(phase, t.commandType))
    .map(([name, t]) => ({ name, description: t.description, parameters: t.jsonSchema }));
}

export function resolveToolCall(name: string, rawArgs: string, vocabulary: Vocabulary): ToolResolution {
  const tools = buildTools(vocabulary);
  const tool = tools[name];
  if (tool === undefined) return { ok: false, toolName: name, error: `strumento sconosciuto: ${name}` };
  const parsed = parseJson(rawArgs);
  if (!parsed.ok) return { ok: false, toolName: name, error: parsed.error };
  const r = tool.resolve(parsed.json);
  if (!r.ok) return { ok: false, toolName: name, error: r.error };
  return { ok: true, toolName: name, command: r.command };
}
```

- [ ] **Step 4: Update `master-turn.ts` to pass the vocabulary**

Nel ciclo, le due chiamate ai tool passano `request.ruleset.vocabulary`:
```ts
    const toolDefs = masterToolDefs(state.phase, request.ruleset.vocabulary);
    // ...
      const resolution = resolveToolCall(call.name, call.arguments, request.ruleset.vocabulary);
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm exec vitest run packages/ai` → verdi (master-tools + master-turn).
Run: `pnpm -C packages/ai typecheck` → pulito.

- [ ] **Step 6: Commit**

```bash
git add packages/ai/src/master-tools.ts packages/ai/src/master-turn.ts packages/ai/src/master-tools.test.ts
git commit -m "feat(ai): tool schema vincolati con z.enum dal vocabolario (G3)"
```

---

## Task 8: `memory/context-assembler.ts` — esponi attributi/abilità per-attore

**Files:**
- Modify: `packages/memory/src/context-assembler.ts`
- Modify: `packages/memory/src/context-assembler.test.ts`

- [ ] **Step 1: Write the failing test**

Aggiungi a `context-assembler.test.ts` un test che crea uno stato con un attore con attributi/abilità e asserisce che `assembleContext(state)` li contenga:
```ts
it('L1 espone attributi e abilita per-attore', () => {
  // costruisci `state` con un attore: attributes { forza: 3 }, skills { arcano: 2 }, resources { hp: {current:20,max:20} }
  const out = assemble(stateConAttore);
  expect(out).toContain('forza 3');
  expect(out).toContain('arcano 2');
  expect(out).toContain('hp 20/20');
});
```
> Riusa il pattern di costruzione `state`/`assemble` già presente nel file (gli altri test creano stati e l assembler con gli store sqlite `:memory:`).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run packages/memory/src/context-assembler.test.ts` → FAIL (oggi `renderL1` rende solo le risorse).

- [ ] **Step 3: Implement in `context-assembler.ts`**

Nella funzione `renderL1`, dentro il `map` sugli attori, estendi la riga dell attore con attributi e abilità (compatto; L1 non è mai tagliato):
```ts
  const actors = Object.values(state.actors).map((a) => {
    const res = Object.entries(a.resources).map(([k, p]) => `${k} ${p.current}/${p.max}`).join(', ');
    const attrs = Object.entries(a.attributes).map(([k, v]) => `${k} ${v}`).join(', ');
    const sk = Object.entries(a.skills).map(([k, v]) => `${k} ${v}`).join(', ');
    const parts = [
      res.length > 0 ? `risorse: ${res}` : '',
      attrs.length > 0 ? `attr: ${attrs}` : '',
      sk.length > 0 ? `abil: ${sk}` : '',
    ].filter((p) => p.length > 0);
    return `- ${a.name} (${a.kind}, id=${a.id})${parts.length > 0 ? `: ${parts.join(' | ')}` : ''}`;
  });
```
> Nota: questo cambia il formato della riga risorse (da `hp 20/20` a `risorse: hp 20/20`). Verifica gli altri test di `context-assembler.test.ts`: se asseriscono la riga risorse vecchia (`": hp 20/20"`), aggiornali al nuovo formato (`risorse: hp 20/20`) — ripple di questo task. Il test budget/L2 che conta i token resta valido (cambia solo la stringa L1, mai tagliata).

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm exec vitest run packages/memory` → verdi.
Run: `pnpm -C packages/memory typecheck` → pulito.

- [ ] **Step 5: Commit**

```bash
git add packages/memory/src/context-assembler.ts packages/memory/src/context-assembler.test.ts
git commit -m "feat(memory): L1 espone attributi/abilita per-attore nel contesto (G3)"
```

---

## Verifica finale del branch

- [ ] `pnpm test` (dalla root) → tutti verdi (392 di base + i nuovi di G3/G4).
- [ ] `pnpm -r typecheck` → pulito (6 progetti, incl. `app/desktop` via vue-tsc).
- [ ] `git status --short` → pulito.
- [ ] Final review opus dell intero branch (BASE = punto di branch, HEAD = ultimo commit).

---

## Self-Review

**1. Spec coverage:**
- §3.1 `Ruleset`/`Vocabulary` + factory → Task 1. ✅
- §3.2 validazione per-Command (AddActor/Attack/RequestCheck/ApplyEffect) + auto-fill + migrazione dcForDifficulty → Task 3 (firma+dc), 4 (AddActor+auto-fill), 5 (Attack), 6 (RequestCheck/ApplyEffect). ✅
- §3.3 `z.enum` sui campi semplici; spawn_npc record aperti validati dal motore → Task 7 (+ Task 4 per le chiavi). ✅
- §3.4 threading `ruleset` in `runMasterTurn` → Task 3 + 7. ✅
- §3.5 `renderL1` esposizione per-attore → Task 8. ✅
- §3.6 seme dev in host + threading app/desktop → Task 2 + 3. ✅
- `shared` intatto → nessun task lo tocca. ✅

**2. Placeholder scan:** Task 7 usa "descrizione invariata"/"..." per le voci NON-vocab: è deliberato (l implementer copia le stringhe/`toCommand` ESISTENTI di `master-tools.ts`, mostrate per intero nel file sorgente già letto) — non è un placeholder di logica nuova, ma un "preserva l esistente". Tutte le parti NUOVE (schemi vocab-dipendenti, `enumOrString`, firme) hanno codice completo. `combatHeroGoblin()`/`heroState()` (Task 5/6) sono helper di test da costruire riusando i fixture del file: il piano indica esattamente la forma degli attori richiesti.

**3. Type consistency:** `createVocabulary`/`createRuleset`/`Vocabulary`/`Ruleset` coerenti fra Task 1, 2, 3, 7. `requireMember(set, key, kind)` introdotto in Task 4 e riusato in 5/6. `enumOrString(set)` (Task 7) coerente. `masterToolDefs(phase, vocabulary)` / `resolveToolCall(name, rawArgs, vocabulary)` coerenti fra master-tools.ts e i call-site in master-turn.ts.

**4. Ripple isolato (lezione SP4):** Task 3 dà a ogni file di test un vocabolario largo con `defaultResources` vuoto → Task 4-6 sono additivi. I ripple cross-package residui (se un id non fosse coperto) sono assegnati al task che li causa: il piano lo segnala in Task 4 (master-turn/campaign tests spawnano attori), 5 (attacchi), 6 (check). Task 8 segnala il ripple del formato-riga in `context-assembler.test.ts`.

**Nota sulla taglia:** 8 task, il più grande della traccia engine (Task 3 è atomico cross-package per la firma). Se in esecuzione il Task 3 risultasse troppo grande, NON si può splittare (firma richiesta) senza un parametro opzionale (debito): tenerlo intero, eseguire con cura, verificare suite+typecheck prima del commit.
