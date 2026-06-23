# D‑01a — Campaign Seed (motore + contesto) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dare alla campagna un **inizio progettato** — un `CampaignSeed` strutturato che, applicato, semina lo stato del motore (frame narrativo event‑sourced + PNG come attori) e i fatti canon, lo inietta nel contesto del Master, e produce una narrazione d'apertura — così il Master smette di narrare nel vuoto (audit D‑01). Prima slice (D‑01a) di D‑01, con le fondamenta multi‑campagna (isolamento per‑DB + identità) decise ora.

**Architecture:** Approccio A (deciso con l'utente): un Command `SeedCampaign` che il motore espande in `[CampaignFramed, ...ActorAdded]` (i PNG via la stessa logica di `AddActor`); il host semina i fatti canon (id deterministici) in una transazione, poi lancia una narrazione d'apertura best‑effort; il Context Assembler guadagna un blocco "campaign frame" never‑cut. `campaignFrame` vive event‑sourced su `GameState` (legittimato dal precedente `Quest`). Isolamento = un DB per campagna (`userData/campaigns/<id>/loomn.db`), identità `id`+`name` nel frame.

**Tech Stack:** TypeScript strict (monorepo pnpm), Zod (`@loomn/shared`, foglia), event sourcing (`@loomn/engine`/`@loomn/memory`), better‑sqlite3/Drizzle, Vitest (ABI Node). Spec autorità: `docs/superpowers/specs/2026-06-23-d01a-campaign-seed-design.md`.

---

## Contesto invariante (leggi prima di iniziare)

- **Baseline:** HEAD su `main` dopo lo spec D‑01a. `pnpm test` = **777 verdi**, `pnpm -r typecheck` pulito (6 progetti), ABI **Node**, tree pulito (solo `.claude/` untracked — **MAI** committarlo). Comandi ops disponibili (F7): `pnpm verify`, `pnpm gate:selftest`, `pnpm gate:kill-ghost` (vedi `README.md`).
- **Principio del progetto:** "il codice è l'arbitro, l'AI è il narratore". Il motore è puro (RNG iniettato, niente `Date.now`/`Math.random`), event‑sourced; l'AI propone, `decide` arbitra.
- **Spec:** ogni decisione qui sotto deriva dallo spec `2026-06-23-d01a-campaign-seed-design.md`. Leggi lo spec prima.

### Disciplina di scope (CRITICO — ogni task)

Ogni task tocca SOLO i file elencati. Verifica `git status --short` prima di ogni commit. **MAI** toccare `tsconfig*`, `vitest.config*`, `vitest.workspace.ts`, `electron.vite.config*`. **MAI** creare un `tsconfig` di root o aggiungere `composite`/project references. I subagent creano file con lo strumento **Write** (NON `New-Item -Force`).

### Regole dure (house rules §5 HANDOFF)

1. **Bug apostrofo:** le stringhe `it('...')`/`describe('...')` in **apici singoli** NON devono contenere apostrofi (`l'`, `un'`, `dell'`, `c'è`) — spezzano la stringa JS. Scrivi senza apostrofo (`l attore`, `c e`); `è/é` (lettere) vanno bene. Grep di verifica: `(it|describe)\('[^']*'[A-Za-zàèéìòù]` → **no match**.
2. **TS strict:** `exactOptionalPropertyTypes` → niente `campo: undefined`; usa **spread condizionali** `...(x !== undefined ? { campo: x } : {})`. `noUncheckedIndexedAccess` → accesso a `Record`/array è `T | undefined` (usa `?? default`/guardie). Switch su union → **esaustivi** con `default: { const _exhaustive: never = x; ... }`.
3. **Purezza engine:** niente `Math.random`/`Date.now`/stato globale nel motore.
4. **Debt-free read schema (CRITICO):** mai restringere uno schema di **lettura** (parsa dati storici a ogni replay/load). `campaignSeedSchema`/`campaignFrameSchema` e `gameStateSchema.campaignFrame` sono **permissivi**; i bound vanno **solo** su `seedCampaignCommandSchema`. Modello: `dieGroupSchema` (`domain-schema.ts:23`) vs `dieGroupCommandSchema` (`:38`).
5. **Drift guard:** aggiungere un Command/evento **rompe il typecheck** finché non allinei TUTTI i siti (engine union+`COMMAND_TYPES`+`decide`/`applyEvent`; shared schemi; le guard in `sqlite-event-store.ts:107-118` e `host/command-schema.test.ts:18-22`). È una rete, non una trappola.

### Conteggi test (cumulativi, a partire da 777)

Stime per task; l'implementer **conferma** il numero reale e lo riporta. Task 1 → ~783, Task 2 → ~795, Task 3 → ~799, Task 4 → ~808, Task 5 → ~811. (ABI Node; il **gate Electron** entra SOLO in Task 5 per il cambio di path del `main`.)

### Fuori ambito (esplicito)

- Generazione AI del seed (D‑01b), UX onboarding (D‑01c), moduli/Piano 11 (D‑01d).
- **Gestione** multi‑campagna (registro lista/crea/seleziona/switch/elimina + UX) → **D‑03** (additiva; le fondamenta isolamento+identità sono qui).
- Zone con topologia/movimento (i luoghi sono **solo canon**).
- Se emergono ALTRI flag fuori scope: **annotali, non implementarli**.

---

## File Structure

| File | Responsabilità | Task |
| --- | --- | --- |
| `packages/engine/src/campaign.ts` (nuovo) | Tipi puri `CampaignFrame`, `SeedNpc`, `SeedPlace`, `SeedFact`, `CampaignSeed` | 1, 2 |
| `packages/engine/src/events.ts` | `GameState.campaignFrame?` + evento `CampaignFramed` + `applyEvent` case | 1 |
| `packages/engine/src/commands.ts` | Command `SeedCampaign` + `COMMAND_TYPES` + `decide` arm + helper `buildActorAddedEvent` estratto | 2 |
| `packages/engine/src/index.ts` | Re-export dei nuovi tipi `campaign.ts` | 1 |
| `packages/shared/src/domain-schema.ts` | `campaignFrameSchema`/`campaignSeedSchema`; arm `CampaignFramed`; `gameStateSchema.campaignFrame`; `seedCampaignCommandSchema` in `commandSchema` | 1, 2 |
| `packages/memory/src/context-assembler.ts` | `renderCampaignFrame(frame)` + blocco never‑cut anteposto a L1 | 3 |
| `packages/host/src/campaign-service.ts` | `seedCampaign(seed)` (tx atomica + canon `seed-<i>` + narrazione d'apertura best‑effort); estrazione di `_runTurn` | 4 |
| `packages/host/src/dev-campaign-seed.ts` (nuovo) | `devCampaignSeed` (mini‑scenario concreto) | 5 |
| `packages/host/src/campaign-path.ts` (nuovo) | `campaignDbPath(userDataDir, campaignId)` (puro) | 5 |
| `packages/host/src/index.ts` | Re-export `devCampaignSeed`, `campaignDbPath` | 5 |
| `app/desktop/src/main/index.ts` | Apertura della campagna attiva al path per‑campagna | 5 |

Test accanto ai sorgenti (`*.test.ts`), come da convenzione del repo.

---

## Task 1: `CampaignFrame` + evento `CampaignFramed` + `GameState.campaignFrame`

**Files:**
- Create: `packages/engine/src/campaign.ts`
- Modify: `packages/engine/src/events.ts`, `packages/engine/src/index.ts`
- Modify: `packages/shared/src/domain-schema.ts`
- Test: `packages/engine/src/events.test.ts` (o un nuovo `campaign-events.test.ts`), `packages/shared/src/domain-schema.test.ts`

Foundazione "frame + stato + evento". Engine e shared cambiano **insieme** (le guard struct in `sqlite-event-store.ts:107-118` lo esigono).

- [ ] **Step 1: Crea i tipi puri `packages/engine/src/campaign.ts`**

```ts
import type { ResourcePool } from './resource';

/** Cornice narrativa della campagna (sottoinsieme del CampaignSeed): cio che il Master legge.
 *  Event-sourced in GameState.campaignFrame (precedente: Quest porta gia title/description). */
export interface CampaignFrame {
  id: string;
  name: string;
  premise: string;
  setting: { place: string; era: string; genres: string[]; worldRules?: string };
  tone: string;
  contentGuidance?: string;
  openingScene: string;
  hooks: string[];
}

/** Un PNG seminato -> diventa un Actor via la logica di AddActor (auto-fill risorse dal Ruleset). */
export interface SeedNpc {
  id: string;
  name: string;
  description: string;
  attributes?: Record<string, number>;
  skills?: Record<string, number>;
  resources?: Record<string, ResourcePool>;
}

/** Un luogo seminato -> fatto canon (no topologia/movimento in D-01a). */
export interface SeedPlace {
  id: string;
  name: string;
  description: string;
}

/** Un fatto seminato -> riga del Canon Ledger (1:1). */
export interface SeedFact {
  subject: string;
  predicate: string;
  object: string;
}

/** L input di SeedCampaign: il frame + cio che semina lo stato/canon. */
export interface CampaignSeed {
  frame: CampaignFrame;
  keyNpcs: SeedNpc[];
  keyPlaces: SeedPlace[];
  initialFacts: SeedFact[];
}
```

> Verifica il nome esatto del tipo risorsa: leggi `packages/engine/src/resource.ts` e usa l export corretto (`ResourcePool` secondo il recon; se diverso, adegua l import).

- [ ] **Step 2: Aggiungi `campaignFrame?` a `GameState`, l evento `CampaignFramed`, e il case di `applyEvent`** in `packages/engine/src/events.ts`

Import in cima al file (accanto agli altri tipi importati):
```ts
import type { CampaignFrame } from './campaign';
```
In `interface GameState` (dopo `phase: Phase;`):
```ts
  campaignFrame?: CampaignFrame;
```
Nell union `DomainEvent`, aggiungi una arm (es. in fondo all union):
```ts
  | { type: 'CampaignFramed'; frame: CampaignFrame }
```
In `applyEvent`, aggiungi il `case` (immutabile, come `ActorAdded`; `bumped` è lo stato con `version` incrementata già usato dagli altri case):
```ts
    case 'CampaignFramed':
      return { ...bumped, campaignFrame: event.frame };
```
La guard di esaustività (`events.ts:110-113`, `const _exhaustive: never = event`) **costringe** ad aggiungere il case: se manca, il typecheck del motore fallisce.

- [ ] **Step 3: Re-export i tipi** in `packages/engine/src/index.ts`

Aggiungi (accanto agli altri `export type`/`export *`):
```ts
export type { CampaignFrame, CampaignSeed, SeedNpc, SeedPlace, SeedFact } from './campaign';
```

- [ ] **Step 4: Scrivi i test del motore (red)** in `packages/engine/src/campaign-events.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { applyEvent, replay, initialState, type DomainEvent, type CampaignFrame } from './index';

const frame: CampaignFrame = {
  id: 'c1',
  name: 'La Cripta di Vetro',
  premise: 'Un party indaga sparizioni in una citta sul mare.',
  setting: { place: 'Porto Vetraio', era: 'eta del bronzo alternativa', genres: ['fantasy', 'mistero'] },
  tone: 'cupo ma avventuroso',
  openingScene: 'Notte, moli deserti, una lanterna si spegne.',
  hooks: ['Tre marinai scomparsi', 'Una moneta che non dovrebbe esistere'],
};

describe('CampaignFramed', () => {
  it('applyEvent setta campaignFrame e incrementa la versione', () => {
    const e: DomainEvent = { type: 'CampaignFramed', frame };
    const s = applyEvent(initialState, e);
    expect(s.campaignFrame?.name).toBe('La Cripta di Vetro');
    expect(s.version).toBe(initialState.version + 1);
  });

  it('replay ricostruisce campaignFrame deterministicamente', () => {
    const events: DomainEvent[] = [{ type: 'CampaignFramed', frame }];
    const s = replay(events);
    expect(s.campaignFrame?.premise).toContain('sparizioni');
  });

  it('initialState non ha campaignFrame', () => {
    expect(initialState.campaignFrame).toBeUndefined();
  });
});
```
Run: `pnpm exec vitest run packages/engine/src/campaign-events.test.ts`
Expected (red): fallisce alla compilazione/import finché Step 1-3 non sono fatti. (Se scrivi i test dopo l implementazione, verifica comunque che diventino verdi.)

- [ ] **Step 5: Allinea `@loomn/shared`** in `packages/shared/src/domain-schema.ts`

Aggiungi gli schemi (permissivi, read-path) accanto a `questSchema`. Modello: `questSchema` (`:194`) usa `.transform()` per i campi opzionali sotto `exactOptionalPropertyTypes`.
```ts
// Permissivo (read/event path): NESSUN bound. I bound vivono su seedCampaignCommandSchema (Task 2).
const campaignSettingSchema = z
  .object({
    place: z.string(),
    era: z.string(),
    genres: z.array(z.string()),
    worldRules: z.string().optional(),
  })
  .transform((s) => ({
    place: s.place,
    era: s.era,
    genres: s.genres,
    ...(s.worldRules !== undefined ? { worldRules: s.worldRules } : {}),
  }));

export const campaignFrameSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    premise: z.string(),
    setting: campaignSettingSchema,
    tone: z.string(),
    contentGuidance: z.string().optional(),
    openingScene: z.string(),
    hooks: z.array(z.string()),
  })
  .transform((f) => ({
    id: f.id,
    name: f.name,
    premise: f.premise,
    setting: f.setting,
    tone: f.tone,
    ...(f.contentGuidance !== undefined ? { contentGuidance: f.contentGuidance } : {}),
    openingScene: f.openingScene,
    hooks: f.hooks,
  }));
```
Aggiungi l arm dell evento. Poiché `campaignFrameSchema` è un `ZodEffects` (per via di `.transform()`), l arm `CampaignFramed` **non** può stare nel `discriminatedUnion`: va appeso al `z.union` esterno, come `checkResolvedEventSchema` (`:233`). Definisci:
```ts
const campaignFramedEventSchema = z
  .object({ type: z.literal('CampaignFramed'), frame: campaignFrameSchema })
  .strict();
```
e aggiungilo come arm del `z.union` esterno di `domainEventSchema` (accanto a `checkResolvedEventSchema`).

Aggiungi `campaignFrame` opzionale a `gameStateSchema` (`:272`), **sicuro** (lo schema NON è `.strict()` → vecchi snapshot parsano):
```ts
  campaignFrame: campaignFrameSchema.optional(),
```

- [ ] **Step 6: Scrivi i test shared (red→green)** in `packages/shared/src/domain-schema.test.ts`

```ts
it('domainEventSchema accetta CampaignFramed', () => {
  const parsed = domainEventSchema.parse({
    type: 'CampaignFramed',
    frame: {
      id: 'c1', name: 'X', premise: 'p',
      setting: { place: 'a', era: 'b', genres: ['c'] },
      tone: 't', openingScene: 'o', hooks: ['h'],
    },
  });
  expect(parsed.type).toBe('CampaignFramed');
});

it('gameStateSchema parsa uno snapshot SENZA campaignFrame (debt-free)', () => {
  const s = gameStateSchema.parse({
    version: 0, actors: {}, encounter: null, quests: {}, phase: 'exploration',
  });
  expect(s.campaignFrame).toBeUndefined();
});
```
> Usa gli import gia presenti nel file di test (`domainEventSchema`, `gameStateSchema`). Le stringhe `it('...')` sono apostrofo-free.

- [ ] **Step 7: Typecheck + test (verde) + drift guard**

Run: `pnpm -r typecheck` → Done su 6 progetti (le guard `sqlite-event-store.ts:107-118` ora richiedono che `gameStateSchema`/`domainEventSchema` combacino con `GameState`/`DomainEvent`: devono essere già allineati).
Run: `pnpm exec vitest run packages/engine/src/campaign-events.test.ts packages/shared/src/domain-schema.test.ts` → PASS.
Run: `pnpm test` → atteso **~783** (777 + i nuovi).

- [ ] **Step 8: Verifica scope + commit**

Run: `git status --short` → solo `packages/engine/src/campaign.ts`, `events.ts`, `index.ts`, `packages/shared/src/domain-schema.ts` + i test toccati + `?? .claude/`.
```bash
git add packages/engine/src/campaign.ts packages/engine/src/events.ts packages/engine/src/index.ts packages/engine/src/campaign-events.test.ts packages/shared/src/domain-schema.ts packages/shared/src/domain-schema.test.ts
git commit -m "feat(engine): CampaignFrame + evento CampaignFramed + GameState.campaignFrame [D-01a]"
```

---

## Task 2: Command `SeedCampaign` (decide espande in `[CampaignFramed, ...ActorAdded]`)

**Files:**
- Modify: `packages/engine/src/commands.ts`
- Modify: `packages/shared/src/domain-schema.ts`
- Test: `packages/engine/src/commands.test.ts` (o `seed-campaign.test.ts`), `packages/host/src/command-schema.test.ts`

- [ ] **Step 1: Estrai un helper riusabile dalla logica di `AddActor`** in `packages/engine/src/commands.ts`

L arm `AddActor` (`commands.ts:101-116`) fa: (a) guard id duplicato, (b) validazione vocabolario via `requireMember`, (c) auto-fill `defaultResources` + `clampPool`, (d) ritorna `ActorAdded`. **Estrai (b)+(c)+(d)** in un helper privato (la guard duplicato (a) resta nei chiamanti, perché `SeedCampaign` fa un controllo di batch):
```ts
/** Valida l attore contro il vocabolario, auto-fill delle risorse mancanti dal Ruleset, clamp,
 *  e ritorna l evento ActorAdded. NON controlla i duplicati (lo fa il chiamante). */
function buildActorAddedEvent(actor: Actor, ruleset: Ruleset): DomainEvent {
  const vocab = ruleset.vocabulary;
  for (const k of Object.keys(actor.attributes)) requireMember(vocab.attributes, k, 'Attributo');
  for (const k of Object.keys(actor.skills)) requireMember(vocab.skills, k, 'Abilita');
  for (const k of Object.keys(actor.resources)) requireMember(vocab.resources, k, 'Risorsa');
  const merged = { ...vocab.defaultResources, ...actor.resources };
  const resources = Object.fromEntries(Object.entries(merged).map(([k, pool]) => [k, clampPool(pool)]));
  return { type: 'ActorAdded', actor: { ...actor, resources } };
}
```
> Adatta i nomi (`vocab.attributes`/`skills`/`resources`, le label di `requireMember`) ai valori esatti già presenti nell arm `AddActor` corrente — **copia la logica esistente verbatim**, non reinventarla. Poi riscrivi l arm `AddActor` per riusare l helper:
```ts
    case 'AddActor': {
      if (state.actors[command.actor.id] !== undefined) {
        throw new Error(`Attore gia presente: ${command.actor.id}`);
      }
      return [buildActorAddedEvent(command.actor, ruleset)];
    }
```
> Mantieni il messaggio d errore duplicato **identico** a quello attuale (verifica `commands.ts:102-104`). Esegui `pnpm exec vitest run packages/engine/src/commands.test.ts` per confermare che i test AddActor esistenti restano verdi dopo l estrazione (refactor behaviour-preserving).

- [ ] **Step 2: Aggiungi il Command `SeedCampaign`** (union + `COMMAND_TYPES` + arm `decide`)

Import in cima a `commands.ts`:
```ts
import type { CampaignSeed, SeedNpc } from './campaign';
```
Nell union `Command` (`:21-42`), aggiungi:
```ts
  | { type: 'SeedCampaign'; seed: CampaignSeed }
```
Nell array `COMMAND_TYPES` (`:71-83`), aggiungi `'SeedCampaign'` (le guard `:89-92` lo esigono).

Helper di conversione PNG→Actor (mirror del mapper `spawn_npc`, `master-tools.ts:135-153`):
```ts
function seedNpcToActor(npc: SeedNpc): Actor {
  return {
    id: npc.id,
    name: npc.name,
    kind: 'npc',
    attributes: npc.attributes ?? {},
    skills: npc.skills ?? {},
    resources: npc.resources ?? {},
    conditions: [],
    items: [],
    progression: { xp: 0, level: 0 },
  };
}
```
> Verifica i campi esatti di `Actor` (leggi `packages/engine/src/actor.ts`) e allinea (`kind`, `progression`, eventuali campi obbligatori). Se `Actor` richiede altri campi, riusa i default del mapper `spawn_npc`.

Arm `decide(SeedCampaign)`:
```ts
    case 'SeedCampaign': {
      if (state.campaignFrame !== undefined) {
        throw new Error('Campagna gia seminata');
      }
      const events: DomainEvent[] = [{ type: 'CampaignFramed', frame: command.seed.frame }];
      const seen = new Set<string>();
      for (const npc of command.seed.keyNpcs) {
        if (state.actors[npc.id] !== undefined || seen.has(npc.id)) {
          throw new Error(`PNG seminato duplicato: ${npc.id}`);
        }
        seen.add(npc.id);
        events.push(buildActorAddedEvent(seedNpcToActor(npc), ruleset));
      }
      return events;
    }
```
> `SeedCampaign` resta **phase-agnostico** (non aggiungerlo a `COMBAT_ONLY`/`NON_COMBAT_ONLY`): il once-guard `campaignFrame !== undefined` è la barriera. I `keyPlaces`/`initialFacts` NON generano eventi engine (diventano canon nel host, Task 4).

- [ ] **Step 3: Aggiungi `seedCampaignCommandSchema` a `commandSchema`** in `packages/shared/src/domain-schema.ts`

Schema **di comando** coi bound (difesa-in-profondità IPC; permissivo `campaignFrameSchema` riusato per il frame, bound sulle liste):
```ts
const seedNpcCommandSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  attributes: z.record(z.string(), z.number()).optional(),
  skills: z.record(z.string(), z.number()).optional(),
  resources: z.record(z.string(), resourcePoolSchema).optional(),
});
const seedPlaceCommandSchema = z.object({ id: z.string().min(1), name: z.string().min(1), description: z.string() });
const seedFactCommandSchema = z.object({ subject: z.string().min(1), predicate: z.string().min(1), object: z.string() });

const seedCampaignCommandSchema = z.object({
  type: z.literal('SeedCampaign'),
  seed: z.object({
    frame: campaignFrameSchema,
    keyNpcs: z.array(seedNpcCommandSchema),
    keyPlaces: z.array(seedPlaceCommandSchema),
    initialFacts: z.array(seedFactCommandSchema),
  }),
});
```
> Usa lo schema risorsa già presente nel file (cerca come `actorSchema` valida `resources`: probabilmente `resourcePoolSchema` o equivalente — riusa quello esistente, non ridefinirlo). Aggiungi `seedCampaignCommandSchema` come arm del `z.union` di `commandSchema` (`:375-391`).

- [ ] **Step 4: Test del motore (TDD)** in `packages/engine/src/seed-campaign.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { decide, applyEvent, replay, initialState, createSeededRandom, type CampaignSeed } from './index';
import { devRuleset } from '../../host/src/dev-vocabulary'; // se non importabile cross-package, costruisci un ruleset minimale qui

const seed: CampaignSeed = {
  frame: {
    id: 'c1', name: 'Demo', premise: 'p',
    setting: { place: 'a', era: 'b', genres: ['fantasy'] },
    tone: 't', openingScene: 'o', hooks: ['h'],
  },
  keyNpcs: [{ id: 'npc-1', name: 'Vendor', description: 'un mercante' }],
  keyPlaces: [{ id: 'p-1', name: 'Mercato', description: 'affollato' }],
  initialFacts: [{ subject: 'npc-1', predicate: 'lavora-a', object: 'p-1' }],
};
const rng = createSeededRandom(1);

describe('decide(SeedCampaign)', () => {
  it('emette CampaignFramed seguito da un ActorAdded per ogni PNG', () => {
    const events = decide(initialState, { type: 'SeedCampaign', seed }, rng, devRuleset);
    expect(events[0]?.type).toBe('CampaignFramed');
    expect(events.filter((e) => e.type === 'ActorAdded')).toHaveLength(1);
  });

  it('auto-fill delle risorse del PNG dai default del Ruleset', () => {
    const events = decide(initialState, { type: 'SeedCampaign', seed }, rng, devRuleset);
    const s = replay(events);
    expect(s.actors['npc-1']?.resources['hp']).toBeDefined(); // dal defaultResources del devRuleset
  });

  it('rifiuta una seconda semina (once-guard)', () => {
    const s = replay(decide(initialState, { type: 'SeedCampaign', seed }, rng, devRuleset));
    expect(() => decide(s, { type: 'SeedCampaign', seed }, rng, devRuleset)).toThrow(/gia seminata/);
  });

  it('rifiuta PNG seminati con id duplicato', () => {
    const dup: CampaignSeed = { ...seed, keyNpcs: [seed.keyNpcs[0]!, seed.keyNpcs[0]!] };
    expect(() => decide(initialState, { type: 'SeedCampaign', seed: dup }, rng, devRuleset)).toThrow(/duplicato/);
  });
});
```
> Se `devRuleset` non è importabile da engine (dipendenza host→engine è a senso unico), costruisci nel test un `Ruleset` minimale con `createRuleset`/`createVocabulary` (vedi `packages/engine/src/ruleset.ts`) con `defaultResources: { hp: { current: 10, max: 10 } }`. **Non** introdurre una dipendenza engine→host.

Run: `pnpm exec vitest run packages/engine/src/seed-campaign.test.ts` → PASS.

- [ ] **Step 5: Test del drift guard Command** in `packages/host/src/command-schema.test.ts`

Aggiungi un runtime test (il drift guard compile-time `:18-22` scatta già da sé):
```ts
it('SeedCampaign passa commandSchema', () => {
  const parsed = commandSchema.parse({
    type: 'SeedCampaign',
    seed: {
      frame: { id: 'c1', name: 'X', premise: 'p', setting: { place: 'a', era: 'b', genres: ['c'] }, tone: 't', openingScene: 'o', hooks: ['h'] },
      keyNpcs: [], keyPlaces: [], initialFacts: [],
    },
  });
  expect(parsed.type).toBe('SeedCampaign');
});
```

- [ ] **Step 6: Typecheck + test + apostrofi**

Run: `pnpm -r typecheck` → Done (i drift guard engine/shared/host ora richiedono SeedCampaign ovunque: devono essere allineati).
Run: `grep -nE "(it|describe)\('[^']*'[A-Za-zàèéìòù]" packages/engine/src/seed-campaign.test.ts packages/host/src/command-schema.test.ts` → no match.
Run: `pnpm test` → atteso **~795**.

- [ ] **Step 7: Verifica scope + commit**

```bash
git add packages/engine/src/commands.ts packages/engine/src/seed-campaign.test.ts packages/shared/src/domain-schema.ts packages/host/src/command-schema.test.ts
git commit -m "feat(engine): Command SeedCampaign espande in CampaignFramed + ActorAdded (riusa AddActor) [D-01a]"
```

---

## Task 3: Blocco "campaign frame" nel Context Assembler

**Files:**
- Modify: `packages/memory/src/context-assembler.ts`
- Test: `packages/memory/src/context-assembler.test.ts`

- [ ] **Step 1: Aggiungi `renderCampaignFrame` e anteponi il blocco** in `packages/memory/src/context-assembler.ts`

`assembleContext(state)` riceve già lo `GameState` completo; il join finale è `[l1, l15, l2].filter(b => b.length > 0).join('\n\n')` (`:151`). Aggiungi un helper e anteponi il blocco:
```ts
/** Blocco never-cut della cornice di campagna (priorita massima). Vuoto se non seminata. */
function renderCampaignFrame(state: GameState): string {
  const f = state.campaignFrame;
  if (f === undefined) return '';
  const lines = [
    `# Campagna: ${f.name}`,
    `Premessa: ${f.premise}`,
    `Ambientazione: ${f.setting.place}, ${f.setting.era} (${f.setting.genres.join(', ')}).`,
    ...(f.setting.worldRules !== undefined ? [`Regole del mondo: ${f.setting.worldRules}`] : []),
    `Tono: ${f.tone}`,
    ...(f.contentGuidance !== undefined ? [`Limiti: ${f.contentGuidance}`] : []),
    `Scena d apertura: ${f.openingScene}`,
    ...(f.hooks.length > 0 ? [`Hook: ${f.hooks.join('; ')}`] : []),
  ];
  return lines.join('\n');
}
```
Nel corpo di `assembleContext`, calcola `const frameBlock = renderCampaignFrame(state);` e modifica il join finale anteponendolo:
```ts
  return [frameBlock, l1, l15, l2].filter((b) => b.length > 0).join('\n\n');
```
> Il blocco è never-cut (non conta nel budget L2 che taglia dal basso): NON aggiungerlo al calcolo del costo L2. Se il budget fisso (L1+L1.5) ha un controllo, lascialo invariato — il frame è priorità massima come L1.

- [ ] **Step 2: Test (TDD)** in `packages/memory/src/context-assembler.test.ts`

```ts
it('include il blocco campaign frame quando campaignFrame e settato', () => {
  const state = { ...baseState, campaignFrame: {
    id: 'c1', name: 'La Cripta', premise: 'indagine', setting: { place: 'Porto', era: 'bronzo', genres: ['mistero'] }, tone: 'cupo', openingScene: 'moli deserti', hooks: ['marinai scomparsi'],
  } };
  const ctx = assembleContext(state);
  expect(ctx).toContain('Campagna: La Cripta');
  expect(ctx).toContain('moli deserti');
});

it('non include il blocco campaign frame quando campaignFrame e undefined', () => {
  const ctx = assembleContext(baseState);
  expect(ctx).not.toContain('Campagna:');
});
```
> Usa il pattern di costruzione `GameState` già presente nel file di test (`baseState`/helper). Se non esiste, costruisci uno stato minimale come fanno gli altri test del file.

Run: `pnpm exec vitest run packages/memory/src/context-assembler.test.ts` → PASS.

- [ ] **Step 3: Typecheck + test + commit**

Run: `pnpm -r typecheck` → Done. Run: `pnpm test` → atteso **~799**.
```bash
git add packages/memory/src/context-assembler.ts packages/memory/src/context-assembler.test.ts
git commit -m "feat(memory): blocco campaign frame never-cut nel Context Assembler [D-01a]"
```

---

## Task 4: `seedCampaign(seed)` sul CampaignService (tx atomica + canon + apertura)

**Files:**
- Modify: `packages/host/src/campaign-service.ts`
- Test: `packages/host/src/campaign-service.test.ts`

- [ ] **Step 1: Estrai il corpo di `runTurn` in `_runTurn` (non accodato)**

`runTurn(playerAction)` è oggi `enqueue(async () => { /* corpo */ })` (`campaign-service.ts:185-219`). Estrai il **corpo** in una funzione interna non accodata `async function _runTurn(playerAction: string): Promise<TurnOutcome>` e fai sì che `runTurn` la richiami dentro `enqueue`:
```ts
async function _runTurn(playerAction: string): Promise<TurnOutcome> {
  /* ...esattamente il corpo attuale di runTurn... */
}
// nella creazione del servizio:
runTurn: (playerAction) => enqueue(() => _runTurn(playerAction)),
```
> Refactor behaviour-preserving: `pnpm exec vitest run packages/host/src/campaign-service.test.ts` deve restare verde dopo l estrazione, **prima** di aggiungere seedCampaign.

- [ ] **Step 2: Aggiungi `seedCampaign(seed)`** (tx atomica + canon `seed-<i>` + apertura best-effort)

Tipo dell esito (accanto a `TurnOutcome`/`DispatchOutcome`):
```ts
export interface SeedOutcome { readModel: ReadModel; narration?: string }
```
Metodo (accodato una sola volta; la tx è sync, la narrazione è async dopo):
```ts
function _seedCampaign(seed: CampaignSeed): { framedSeq: number } {
  // Atomico: eventi seed + canon nella stessa transazione SQLite.
  return memory.runInTransaction(() => {
    const events = decide(state, { type: 'SeedCampaign', seed }, rng, ruleset); // throw se gia seminata / invalido
    const versionBefore = state.version;
    memory.eventStore.append(events, versionBefore);
    let s = state;
    for (const e of events) s = applyEvent(s, e);
    state = s;
    const framedSeq = versionBefore + 1; // CampaignFramed e il primo evento appeso
    let i = 0;
    for (const place of seed.keyPlaces) {
      memory.ledger.record({ id: `seed-${i++}`, subject: place.id, predicate: 'e-il-luogo', object: place.description, eventSeq: framedSeq });
    }
    for (const f of seed.initialFacts) {
      memory.ledger.record({ id: `seed-${i++}`, subject: f.subject, predicate: f.predicate, object: f.object, eventSeq: framedSeq });
    }
    maybeSnapshot();
    return { framedSeq };
  });
}

// pubblico:
seedCampaign: (seed) =>
  enqueue(async (): Promise<SeedOutcome> => {
    _seedCampaign(seed);
    // Narrazione d apertura best-effort: se il provider non e configurato, runMasterTurn lancia -> swallow.
    let narration: string | undefined;
    try {
      const turn = await _runTurn('(apertura)');
      narration = turn.narration;
    } catch {
      // seed gia committato e durevole; l apertura slittera al primo turno reale.
    }
    return { readModel: { version: state.version, state }, ...(narration !== undefined ? { narration } : {}) };
  }),
```
> Verifica i nomi esatti: `memory.eventStore.append(events, expectedVersion)` (firma reale in `sqlite-event-store`), `memory.ledger.record(...)`, `maybeSnapshot()`, la forma di `ReadModel` (`{ version, state }`) e come `dispatch` costruisce il suo ritorno — **riusa gli stessi helper** di `dispatch`/`runTurn`. Aggiungi `seedCampaign` all interfaccia pubblica `CampaignService` e import `CampaignSeed`/`decide`/`applyEvent` se non già presenti.
> Se `append` ritorna la seq assegnata, usa **quella** per `framedSeq` invece di `versionBefore + 1` (più robusto). Il commento spiega l assunzione.

- [ ] **Step 3: Test (TDD) col fake model** in `packages/host/src/campaign-service.test.ts`

```ts
it('seedCampaign semina frame, attori e canon atomicamente', async () => {
  const svc = makeService(/* fake model che produce narrazione, vedi gli altri test */);
  const out = await svc.seedCampaign(demoSeed);
  expect(out.readModel.state.campaignFrame?.name).toBe('Demo');
  expect(out.readModel.state.actors['npc-1']).toBeDefined();
  const canon = svc.getCanon({});
  expect(canon.some((f) => f.id === 'seed-0')).toBe(true);
});

it('seedCampaign rifiuta una seconda semina (once-guard end-to-end)', async () => {
  const svc = makeService();
  await svc.seedCampaign(demoSeed);
  await expect(svc.seedCampaign(demoSeed)).rejects.toThrow(/gia seminata/);
});

it('seedCampaign senza provider: il seed riesce, niente narrazione', async () => {
  const svc = makeService(/* model che lancia / non configurato */);
  const out = await svc.seedCampaign(demoSeed);
  expect(out.readModel.state.campaignFrame).toBeDefined();
  expect(out.narration).toBeUndefined();
});
```
> Riusa l helper `makeService`/il fake model già nel file di test (gli altri test di `runTurn` ne hanno uno). `demoSeed` = un `CampaignSeed` minimale come nei test del Task 2.

Run: `pnpm exec vitest run packages/host/src/campaign-service.test.ts` → PASS.

- [ ] **Step 4: Typecheck + test + apostrofi + commit**

Run: `pnpm -r typecheck` → Done. `grep -nE "(it|describe)\('[^']*'[A-Za-zàèéìòù]" packages/host/src/campaign-service.test.ts` → no match. `pnpm test` → atteso **~808**.
```bash
git add packages/host/src/campaign-service.ts packages/host/src/campaign-service.test.ts
git commit -m "feat(host): seedCampaign atomico (frame+attori+canon) + narrazione d apertura best-effort [D-01a]"
```

---

## Task 5: `devCampaignSeed` + path per‑campagna + wiring `main` (gate Electron)

**Files:**
- Create: `packages/host/src/dev-campaign-seed.ts`, `packages/host/src/campaign-path.ts`
- Modify: `packages/host/src/index.ts`, `app/desktop/src/main/index.ts`
- Test: `packages/host/src/campaign-path.test.ts`

- [ ] **Step 1: `campaignDbPath` puro** in `packages/host/src/campaign-path.ts`

```ts
import { join } from 'node:path';

/** Path del DB di UNA campagna: userData/campaigns/<id>/loomn.db. Isolamento by-file (fondamenta
 *  multi-campagna D-01a; il registro D-03 gestira piu id). */
export function campaignDbPath(userDataDir: string, campaignId: string): string {
  return join(userDataDir, 'campaigns', campaignId, 'loomn.db');
}

/** Id della campagna attiva di default finche non c e il registro (D-03). */
export const DEFAULT_CAMPAIGN_ID = 'default';
```

- [ ] **Step 2: Test puro** in `packages/host/src/campaign-path.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { campaignDbPath, DEFAULT_CAMPAIGN_ID } from './campaign-path';

describe('campaignDbPath', () => {
  it('compone userData/campaigns/<id>/loomn.db', () => {
    const p = campaignDbPath('/u', 'c1');
    expect(p.replace(/\\/g, '/')).toBe('/u/campaigns/c1/loomn.db');
  });
  it('DEFAULT_CAMPAIGN_ID e default', () => {
    expect(DEFAULT_CAMPAIGN_ID).toBe('default');
  });
});
```
Run: `pnpm exec vitest run packages/host/src/campaign-path.test.ts` → PASS.

- [ ] **Step 3: `devCampaignSeed`** (mini‑scenario concreto) in `packages/host/src/dev-campaign-seed.ts`

```ts
import type { CampaignSeed } from '@loomn/engine';
import { DEFAULT_CAMPAIGN_ID } from './campaign-path';

/** Seme di sviluppo concreto (come devRuleset): un mini-scenario per provare il flusso end-to-end
 *  senza AI/UX. PNG senza stat espliciti -> auto-fill risorse dal devRuleset (hp). */
export const devCampaignSeed: CampaignSeed = {
  frame: {
    id: DEFAULT_CAMPAIGN_ID,
    name: 'La Cripta di Vetro',
    premise: 'Un piccolo gruppo indaga sparizioni notturne in una citta portuale di vetrai.',
    setting: {
      place: 'Porto Vetraio',
      era: 'una eta del bronzo alternativa',
      genres: ['fantasy', 'mistero'],
      worldRules: 'Il vetro soffiato a Porto Vetraio puo trattenere le voci dei morti.',
    },
    tone: 'cupo ma avventuroso',
    openingScene: 'Notte. I moli sono deserti, una lanterna si spegne da sola e un rintocco viene da sottacqua.',
    hooks: ['Tre marinai scomparsi in tre notti', 'Una moneta di vetro che non dovrebbe esistere'],
  },
  keyNpcs: [
    { id: 'maestra-orsa', name: 'Maestra Orsa', description: 'Anziana vetraia, custodisce un segreto sul porto.' },
    { id: 'sgherro-loy', name: 'Loy lo Sgherro', description: 'Contrabbandiere nervoso, sa piu di quel che dice.' },
  ],
  keyPlaces: [
    { id: 'molo-vecchio', name: 'Il Molo Vecchio', description: 'Assi marce e reti, dove sono sparite le persone.' },
    { id: 'fornace', name: 'La Grande Fornace', description: 'Il cuore rovente della corporazione dei vetrai.' },
  ],
  initialFacts: [
    { subject: 'maestra-orsa', predicate: 'lavora-a', object: 'fornace' },
    { subject: 'sgherro-loy', predicate: 'frequenta', object: 'molo-vecchio' },
    { subject: 'porto-vetraio', predicate: 'minacciato-da', object: 'sparizioni notturne' },
  ],
};
```
> Verifica che gli `id` dei PNG/luoghi non collidano e che i PNG senza `attributes`/`skills` ottengano l auto-fill risorse dal `devRuleset` (Task 2 lo garantisce via `defaultResources`).

- [ ] **Step 4: Re-export** in `packages/host/src/index.ts`

```ts
export { devCampaignSeed } from './dev-campaign-seed';
export { campaignDbPath, DEFAULT_CAMPAIGN_ID } from './campaign-path';
```

- [ ] **Step 5: Wiring `main` — apri la campagna attiva al path per‑campagna** in `app/desktop/src/main/index.ts`

Aggiorna l import da `@loomn/host` per includere `campaignDbPath`, `DEFAULT_CAMPAIGN_ID`. Cambia l apertura del DB (`main/index.ts:277`):
```ts
// PRIMA: createMemorySystem(join(app.getPath('userData'), 'loomn.db'))
memory = createMemorySystem(campaignDbPath(app.getPath('userData'), DEFAULT_CAMPAIGN_ID));
```
> Solo questa riga cambia il path. Niente migrazione di DB esistenti (pre-release dev; vengono ricreati). Il self-test del gate usa `LOOMN_USERDATA` temp → aprira `temp/campaigns/default/loomn.db` (fresco). **Non** seminare nel self-test (decisione: il seeding è coperto dagli unit test ABI Node; il gate verifica solo che l app apra il nuovo path) → la **versione attesa del self-test resta 8** (`renderer.ts` INTATTO).

- [ ] **Step 6: Typecheck + test (ABI Node)**

Run: `pnpm -r typecheck` → Done (incluso `app/desktop` via vue-tsc). Run: `pnpm test` → atteso **~811**.

- [ ] **Step 7: Gate Electron 2 fasi (il path del main è cambiato → va verificato)**

Run: `pnpm gate:selftest`
Expected: `[gate] RISULTATO: PASS (fase1=PASS, fase2=PASS)`, exit 0; entrambe le fasi `VERDICT: PASS` con **versione 8** invariata (il self-test non semina). La fase 2 (riavvio + reload) conferma che la persistenza al nuovo path `campaigns/default/loomn.db` regge. Dopo il gate, `pnpm test` → 811 (ABI Node ripristinata dal `finally` del gate).
> Se EBUSY/EPERM al rebuild: `pnpm gate:kill-ghost` poi ri-esegui. Se `pnpm test` desse `NODE_MODULE_VERSION`: `pnpm rebuild:node`.

- [ ] **Step 8: Verifica scope + commit**

Run: `git status --short` → solo i file di questo task + `?? .claude/`.
```bash
git add packages/host/src/dev-campaign-seed.ts packages/host/src/campaign-path.ts packages/host/src/campaign-path.test.ts packages/host/src/index.ts app/desktop/src/main/index.ts
git commit -m "feat(host): devCampaignSeed + path per-campagna (campaigns/<id>/loomn.db), main apre la campagna attiva [D-01a]"
```

---

## Self-Review

**1. Copertura spec** (`2026-06-23-d01a-campaign-seed-design.md`):

| Requisito spec | Task |
| --- | --- |
| `CampaignSeed`/`CampaignFrame` con identità id+name (§4.1/4.2) | 1, 2 |
| `GameState.campaignFrame` event-sourced + `CampaignFramed` (§5.1/5.2) | 1 |
| Command `SeedCampaign` espande in `[CampaignFramed, ...ActorAdded]`, once-guard, riusa AddActor (§5.3) | 2 |
| Schemi shared permissivi (read) + bound solo sul command (§4.3/§6) | 1, 2 |
| Canon seeding `seed-<i>` con eventSeq della framing (§7) | 4 |
| Blocco campaign frame never-cut nel Context Assembler (§8) | 3 |
| `seedCampaign` atomico (tx) + narrazione d apertura best-effort (§9) | 4 |
| `devCampaignSeed` di default (§9) | 5 |
| Fondamenta multi-campagna: isolamento per-DB + identità (§4.4) | 5 (path) + 1/2 (identità) |
| Testing ABI Node; gate solo per il path del main; self-test v8 invariato (§11) | 1-4 (ABI) + 5 (gate) |
| Drift-guard checklist (§12) | 1, 2 |

Nessun requisito di D‑01a senza task. (D‑01b/c/d e la gestione D‑03 sono fuori ambito, §13/§14.)

**2. Placeholder scan:** nessun "TBD"/"come Task N"/"gestisci gli edge case". Le istruzioni "verifica i nomi esatti / copia la logica esistente verbatim" sono **refactor/estensione su codice esistente** con file:line — l implementer ha il file; non sono placeholder di logica nuova.

**3. Coerenza tipi/nomi:**
- `CampaignFrame`/`CampaignSeed`/`SeedNpc`/`SeedPlace`/`SeedFact` definiti in Task 1 (campaign.ts), usati in Task 2/4/5 con gli stessi nomi/campi.
- `buildActorAddedEvent(actor, ruleset)` (Task 2) riusato da `AddActor` e `SeedCampaign`.
- `campaignFrameSchema` (Task 1) riusato da `CampaignFramed`, `gameStateSchema`, `seedCampaignCommandSchema` (Task 2).
- `campaignDbPath`/`DEFAULT_CAMPAIGN_ID` (Task 5) usati da `devCampaignSeed` e `main`.
- `_runTurn` estratto (Task 4) riusato da `runTurn` e `seedCampaign`.

**4. Anti-apostrofo:** le stringhe `it('...')` di questo piano sono apostrofo-free (verifica col grep §regole nei task). Le label `decide`/canon (`'e-il-luogo'`, `'gia seminata'`) sono apostrofo-free.

**5. Drift-guard discipline:** Task 1 e Task 2 toccano engine+shared **insieme** perché le guard compile-time lo esigono; ogni task chiude con `pnpm -r typecheck` verde (la prova che gli allineamenti sono completi).

---

## Roadmap dei task

1. **Task 1** — frame + evento + stato (engine+shared). ~783.
2. **Task 2** — Command SeedCampaign + decide (engine+shared). ~795.
3. **Task 3** — blocco campaign frame (memory). ~799.
4. **Task 4** — seedCampaign host (tx + canon + apertura). ~808.
5. **Task 5** — devCampaignSeed + path per-campagna + main (gate Electron). ~811.

**Gate finale prima del merge:** `pnpm gate:selftest` → `RISULTATO: PASS` (versione 8 invariata), poi `pnpm test` (~811) + `pnpm -r typecheck` puliti su ABI Node.

---

## Execution Handoff

Piano salvato in `docs/superpowers/plans/2026-06-23-d01a-campaign-seed-plan.md`. **Prossimo passo:** grep anti-apostrofo del piano, commit del doc su `main` (`docs:` con Co-Authored-By), poi branch `feat/d01a-campaign-seed` ed esecuzione **subagent-driven** (flusso HANDOFF §4): per ogni task implementer → spec-review → code-quality-review; final review opus del branch; gate Electron 2 fasi `VERDICT: PASS` (Task 5) prima del merge; `finishing-a-development-branch` → merge ff in `main` → `pnpm test` full verde → `git push origin main` → cancella il branch. Poi aggiorna HANDOFF + memoria: D‑01a fatto → prossimo D‑01b (generazione AI‑da‑brief) o D‑03 (registro multi‑campagna), da decidere con l utente.
