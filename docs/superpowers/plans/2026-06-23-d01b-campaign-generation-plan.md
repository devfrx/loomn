# D‑01b — Generazione AI‑da‑brief del Campaign Seed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generare un `CampaignSeed` validato a partire da un brief dell'utente (testo libero + override opzionali), via LLM, restituendo una bozza sempre confermabile da `seedCampaign` (già pronto da D‑01a).

**Architecture:** Single-shot `StructuredOutputPort.generate` produce una struttura *grezza* (`rawSeedSchema`: frame narrativo + PNG `{nome, descrizione, tier}` + luoghi + fatti); una funzione **pura** `rawToCampaignSeed(raw, ruleset, brief?)` deriva ids (slugify), mappa `tier`→stat leggendo le chiavi dal `Ruleset` (AI vocabulary‑agnostica, confirm mai fallibile), e assembla il `CampaignSeed`. Il metodo host `generateSeed(brief)` (non‑enqueued) inietta `deps.structured`+`deps.ruleset`.

**Tech Stack:** TypeScript strict, Zod, `@loomn/ai` (StructuredOutputPort/LanguageModel di 7a/7b), `@loomn/engine` (tipi `CampaignSeed`/`Ruleset`), `@loomn/host` (CampaignService), Vitest (ABI Node, fake model — **nessun gate Electron, nessun IPC, nessun tocco a `@loomn/shared`/`@loomn/engine`/`app/desktop`**).

**Spec di riferimento:** `docs/superpowers/specs/2026-06-23-d01b-campaign-generation-design.md`.

---

## Disciplina di scope (vale per OGNI task)

- Tocca **solo** i file elencati nel task. **MAI** `package.json`, `tsconfig*.json`, `vitest.config.*`, `vitest.workspace.ts`, `electron.vite.config.*`. **MAI** creare un tsconfig di root o `composite`/project references.
- Verifica `git status --short` **prima** di ogni commit: devono comparire solo i file del task (più `.claude/` untracked, che **NON** va mai committato).
- Crea i file con lo strumento **Write** (NON `New-Item -Force`).
- Nessun nuovo `Command`/`Event` engine → **nessun drift-guard** engine/shared in questo piano. Ogni task chiude con `pnpm -C packages/<pkg> typecheck` verde.
- **Anti-apostrofo:** le descrizioni `it('...')`/`describe('...')` in apici singoli non devono contenere apostrofi (`l'`, `un'`, `c'è`). Usa `l errore`, `c e`; `è/é/à` vanno bene.

## File Structure

- **Create** `packages/ai/src/campaign-generation.ts` — modulo di generazione: `CampaignBrief`, `rawSeedSchema`/`RawSeed`, `slugify`, `rawToCampaignSeed` (puro), `generateCampaignSeed` (orchestratore).
- **Create** `packages/ai/src/campaign-generation.test.ts` — test del modulo (slugify, transform, orchestratore con fake port).
- **Modify** `packages/ai/src/index.ts` — aggiunge `export * from './campaign-generation'`.
- **Modify** `packages/host/src/campaign-service.ts` — aggiunge `generateSeed` all'interfaccia `CampaignService` + impl (non‑enqueued); importa `generateCampaignSeed`/`CampaignBrief` da `@loomn/ai`.
- **Modify** `packages/host/src/campaign-service.test.ts` — nuovo `describe` per `generateSeed` (bozza + end‑to‑end `generateSeed → seedCampaign` + errore provider).
- **Modify** `packages/host/src/index.ts` — re‑export `type { CampaignBrief }` da `@loomn/ai`.

**Conteggio test:** baseline **805** → atteso **~817** a fine piano (T1 +2, T2 +4, T3 +3, T4 +3).

---

## Task 1: `slugify` puro

**Files:**
- Create: `packages/ai/src/campaign-generation.ts`
- Test: `packages/ai/src/campaign-generation.test.ts`

- [ ] **Step 1: Write the failing test**

Crea `packages/ai/src/campaign-generation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { slugify } from './campaign-generation';

describe('slugify', () => {
  it('minuscola, accenti rimossi, spazi e simboli in trattini', () => {
    expect(slugify('Maestra Orsa')).toBe('maestra-orsa');
    expect(slugify('Città di Vetro!')).toBe('citta-di-vetro');
    expect(slugify('  Loy lo Sgherro  ')).toBe('loy-lo-sgherro');
    expect(slugify('Porto   Vetraio')).toBe('porto-vetraio');
  });

  it('una stringa senza alfanumerici diventa vuota', () => {
    expect(slugify('!!!')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/ai/src/campaign-generation.test.ts`
Expected: FAIL — `Failed to resolve import "./campaign-generation"` (il file non esiste ancora).

- [ ] **Step 3: Write minimal implementation**

Crea `packages/ai/src/campaign-generation.ts`:

```ts
// Generazione AI-da-brief del Campaign Seed (D-01b): brief -> RawSeed (LLM) -> CampaignSeed.
// L AI resta vocabulary-agnostica; il codice deriva ids e riempie le stat dal Ruleset.

/** Slug deterministico per gli id: minuscolo, accenti rimossi, non-alfanumerici -> trattino. */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/ai/src/campaign-generation.test.ts`
Expected: PASS (2 test).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm -C packages/ai typecheck`
Expected: nessun errore.

```bash
git add packages/ai/src/campaign-generation.ts packages/ai/src/campaign-generation.test.ts
git commit -m "feat(ai): slugify puro per gli id del campaign seed [D-01b]"
```

---

## Task 2: `rawSeedSchema` + `rawToCampaignSeed` (transform puro)

**Files:**
- Modify: `packages/ai/src/campaign-generation.ts`
- Test: `packages/ai/src/campaign-generation.test.ts`

- [ ] **Step 1: Write the failing test**

Aggiungi in cima al test (dopo l'import esistente) gli import e un ruleset/raw di prova, poi il nuovo `describe`. Il file diventa:

```ts
import { describe, it, expect } from 'vitest';
import { createRuleset, createVocabulary, type Ruleset } from '@loomn/engine';
import { slugify, rawToCampaignSeed, type RawSeed } from './campaign-generation';

const RULESET: Ruleset = createRuleset({
  vocabulary: createVocabulary({
    attributes: ['forza', 'destrezza'],
    skills: ['atletica', 'furtivita'],
    resources: ['hp'],
    defenses: ['difesa'],
  }),
});

function baseRaw(): RawSeed {
  return {
    name: 'La Cripta',
    premise: 'Indagine notturna.',
    setting: { place: 'Porto', era: 'bronzo', genres: ['mistero'], worldRules: 'il vetro parla' },
    tone: 'cupo',
    openingScene: 'Notte ai moli.',
    hooks: ['marinai scomparsi'],
    npcs: [
      { name: 'Maestra Orsa', description: 'vetraia', tier: 'eccezionale' },
      { name: 'Maestra Orsa', description: 'omonima', tier: 'comune' },
    ],
    places: [{ name: 'Molo Vecchio', description: 'assi marce' }],
    facts: [{ subject: 'Maestra Orsa', predicate: 'lavora-a', object: 'Molo Vecchio' }],
  };
}

describe('slugify', () => {
  it('minuscola, accenti rimossi, spazi e simboli in trattini', () => {
    expect(slugify('Maestra Orsa')).toBe('maestra-orsa');
    expect(slugify('Città di Vetro!')).toBe('citta-di-vetro');
    expect(slugify('  Loy lo Sgherro  ')).toBe('loy-lo-sgherro');
    expect(slugify('Porto   Vetraio')).toBe('porto-vetraio');
  });

  it('una stringa senza alfanumerici diventa vuota', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('rawToCampaignSeed', () => {
  it('assembla frame, mappa tier in stat dal vocabolario, copia i fatti', () => {
    const seed = rawToCampaignSeed(baseRaw(), RULESET);
    expect(seed.frame.id).toBe('la-cripta');
    expect(seed.frame.name).toBe('La Cripta');
    expect(seed.frame.setting.worldRules).toBe('il vetro parla');
    expect(seed.keyNpcs[0]?.attributes).toEqual({ forza: 3, destrezza: 3 });
    expect(seed.keyNpcs[0]?.skills).toEqual({ atletica: 3, furtivita: 3 });
    expect(seed.keyNpcs[1]?.attributes).toEqual({ forza: 1, destrezza: 1 });
    expect(seed.keyPlaces[0]?.id).toBe('molo-vecchio');
    expect(seed.initialFacts).toEqual([{ subject: 'Maestra Orsa', predicate: 'lavora-a', object: 'Molo Vecchio' }]);
  });

  it('deduplica gli id derivati da nomi uguali', () => {
    const seed = rawToCampaignSeed(baseRaw(), RULESET);
    expect(seed.keyNpcs[0]?.id).toBe('maestra-orsa');
    expect(seed.keyNpcs[1]?.id).toBe('maestra-orsa-2');
  });

  it('omette worldRules quando assente nel raw', () => {
    const raw = baseRaw();
    raw.setting = { place: 'Porto', era: 'bronzo', genres: ['mistero'] };
    const seed = rawToCampaignSeed(raw, RULESET);
    expect('worldRules' in seed.frame.setting).toBe(false);
  });

  it('contentGuidance: override del brief ha precedenza sul raw', () => {
    const raw = baseRaw();
    raw.contentGuidance = 'no gore';
    const conOverride = rawToCampaignSeed(raw, RULESET, { text: 'x', overrides: { contentGuidance: 'niente violenza su minori' } });
    expect(conOverride.frame.contentGuidance).toBe('niente violenza su minori');
    const senzaOverride = rawToCampaignSeed(raw, RULESET);
    expect(senzaOverride.frame.contentGuidance).toBe('no gore');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/ai/src/campaign-generation.test.ts`
Expected: FAIL — `rawToCampaignSeed`/`RawSeed` non esportati (`is not a function` / import non risolto).

- [ ] **Step 3: Write minimal implementation**

Aggiungi a `packages/ai/src/campaign-generation.ts` (sopra `slugify` per gli import, e sotto per il resto):

```ts
import { z } from 'zod';
import type { CampaignSeed, CampaignFrame, SeedNpc, SeedPlace, SeedFact, Ruleset } from '@loomn/engine';
```

```ts
/** Brief in ingresso (ibrido): testo libero + override opzionali. In-process, tipato (no Zod:
 *  il confine IPC con lo schema arriva in D-01c). */
export interface CampaignBrief {
  text: string;
  name?: string;
  overrides?: {
    genres?: string[];
    tone?: string;
    npcCount?: number;
    contentGuidance?: string;
  };
}

const TIERS = ['comune', 'esperto', 'eccezionale'] as const;
type Tier = (typeof TIERS)[number];

/** Output grezzo dell AI: gate di generazione (NON read-path, NON command). zodToJsonSchema lo usa
 *  per guidare l LLM. Transform-free: la trasformazione vive nel codice. */
export const rawSeedSchema = z.object({
  name: z.string().min(1),
  premise: z.string().min(1),
  setting: z.object({
    place: z.string(),
    era: z.string(),
    genres: z.array(z.string()),
    worldRules: z.string().optional(),
  }),
  tone: z.string(),
  openingScene: z.string(),
  hooks: z.array(z.string()),
  contentGuidance: z.string().optional(),
  npcs: z.array(z.object({ name: z.string().min(1), description: z.string(), tier: z.enum(TIERS) })),
  places: z.array(z.object({ name: z.string().min(1), description: z.string() })),
  facts: z.array(z.object({ subject: z.string(), predicate: z.string(), object: z.string() })),
});

export type RawSeed = z.infer<typeof rawSeedSchema>;

const TIER_VALUE: Record<Tier, number> = { comune: 1, esperto: 2, eccezionale: 3 };

/** Riempie un Record con ogni chiave del vocabolario al valore dato (chiavi sempre valide). */
function statsFromVocab(keys: ReadonlySet<string>, value: number): Record<string, number> {
  return Object.fromEntries([...keys].map((k) => [k, value]));
}

/** Genera id slug unici (dedup con suffisso -2, -3, ...). Fallback 'entita' per nomi senza alfanumerici. */
function makeUniquifier(): (name: string) => string {
  const used = new Set<string>();
  return (name: string) => {
    const base = slugify(name) || 'entita';
    let id = base;
    let n = 2;
    while (used.has(id)) {
      id = `${base}-${n}`;
      n += 1;
    }
    used.add(id);
    return id;
  };
}

/** Transform PURO raw -> CampaignSeed: deriva ids, mappa tier in stat dal Ruleset, fatti verbatim. */
export function rawToCampaignSeed(raw: RawSeed, ruleset: Ruleset, brief?: CampaignBrief): CampaignSeed {
  const uid = makeUniquifier();
  const vocab = ruleset.vocabulary;

  const keyNpcs: SeedNpc[] = raw.npcs.map((npc) => {
    const value = TIER_VALUE[npc.tier];
    return {
      id: uid(npc.name),
      name: npc.name,
      description: npc.description,
      attributes: statsFromVocab(vocab.attributes, value),
      skills: statsFromVocab(vocab.skills, value),
    };
  });

  const keyPlaces: SeedPlace[] = raw.places.map((p) => ({ id: uid(p.name), name: p.name, description: p.description }));

  const initialFacts: SeedFact[] = raw.facts.map((f) => ({ subject: f.subject, predicate: f.predicate, object: f.object }));

  const contentGuidance = brief?.overrides?.contentGuidance ?? raw.contentGuidance;
  const frame: CampaignFrame = {
    id: slugify(raw.name) || 'campagna',
    name: raw.name,
    premise: raw.premise,
    setting: {
      place: raw.setting.place,
      era: raw.setting.era,
      genres: raw.setting.genres,
      ...(raw.setting.worldRules !== undefined ? { worldRules: raw.setting.worldRules } : {}),
    },
    tone: raw.tone,
    openingScene: raw.openingScene,
    hooks: raw.hooks,
    ...(contentGuidance !== undefined ? { contentGuidance } : {}),
  };

  return { frame, keyNpcs, keyPlaces, initialFacts };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/ai/src/campaign-generation.test.ts`
Expected: PASS (6 test: 2 slugify + 4 transform).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm -C packages/ai typecheck`
Expected: nessun errore.

```bash
git add packages/ai/src/campaign-generation.ts packages/ai/src/campaign-generation.test.ts
git commit -m "feat(ai): rawSeedSchema + rawToCampaignSeed (tier->stat dal Ruleset, ids slug) [D-01b]"
```

---

## Task 3: `generateCampaignSeed` (orchestratore) + export dal barrel

**Files:**
- Modify: `packages/ai/src/campaign-generation.ts`
- Modify: `packages/ai/src/index.ts`
- Test: `packages/ai/src/campaign-generation.test.ts`

- [ ] **Step 1: Write the failing test**

Aggiungi al test gli import per l'orchestratore (in cima, accanto agli altri) e un nuovo `describe` in fondo:

Import da aggiungere in cima al file di test:

```ts
import { generateCampaignSeed, type CampaignBrief } from './campaign-generation';
import { StructuredOutputError, type StructuredOutputPort, type StructuredOutputRequest, type StructuredOutputResult } from './structured-output';
```

Nuovo `describe` in fondo:

```ts
function fakePort(raw: RawSeed, capture?: (req: StructuredOutputRequest<unknown>) => void): StructuredOutputPort {
  return {
    generate: async <T>(req: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> => {
      capture?.(req as unknown as StructuredOutputRequest<unknown>);
      return { value: raw as unknown as T, strategy: 'function-call' };
    },
  };
}

describe('generateCampaignSeed', () => {
  it('genera un CampaignSeed dalla porta structured', async () => {
    const seed = await generateCampaignSeed({ text: 'voglio un horror' }, { structured: fakePort(baseRaw()), ruleset: RULESET });
    expect(seed.frame.name).toBe('La Cripta');
    expect(seed.keyNpcs[0]?.id).toBe('maestra-orsa');
  });

  it('il brief e gli override raggiungono il prompt e lo schemaName e corretto', async () => {
    let captured: StructuredOutputRequest<unknown> | undefined;
    const brief: CampaignBrief = { text: 'una citta sommersa', overrides: { genres: ['horror'], tone: 'teso', npcCount: 3 } };
    await generateCampaignSeed(brief, { structured: fakePort(baseRaw(), (r) => { captured = r; }), ruleset: RULESET });
    const user = captured?.messages.find((m) => m.role === 'user')?.content ?? '';
    expect(user).toContain('una citta sommersa');
    expect(user).toContain('horror');
    expect(user).toContain('teso');
    expect(captured?.schemaName).toBe('campaign_seed');
  });

  it('propaga StructuredOutputError se la generazione fallisce', async () => {
    const port: StructuredOutputPort = {
      generate: async () => {
        throw new StructuredOutputError('fallito', '');
      },
    };
    await expect(generateCampaignSeed({ text: 'x' }, { structured: port, ruleset: RULESET })).rejects.toThrow(StructuredOutputError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/ai/src/campaign-generation.test.ts`
Expected: FAIL — `generateCampaignSeed` non esportato.

- [ ] **Step 3: Write minimal implementation**

Aggiungi a `packages/ai/src/campaign-generation.ts` l'import dei tipi LLM (in cima, con gli altri import) e l'orchestratore (in fondo):

Import da aggiungere in cima:

```ts
import type { LlmMessage } from './language-model';
import type { StructuredOutputPort } from './structured-output';
```

In fondo al file:

```ts
const SYSTEM_PROMPT = [
  'Sei un game-designer esperto. Espandi il brief dell utente in uno scenario di campagna coerente e giocabile.',
  'Rispondi in italiano. Produci una premessa, un setting, un tono, una scena di apertura, alcuni ganci narrativi,',
  'i PNG chiave (con un livello di competenza tier: comune, esperto o eccezionale), i luoghi chiave e alcuni fatti iniziali.',
  'Nei fatti cita le entita per NOME. NON inventare identificatori tecnici ne numeri di gioco (attributi, abilita, punti vita):',
  'quelli li assegna il sistema. Mantieni nomi brevi e descrizioni concise.',
].join(' ');

/** Tesse il brief libero e gli override in un singolo messaggio utente. */
function buildMessages(brief: CampaignBrief): LlmMessage[] {
  const parts: string[] = [brief.text.trim()];
  const o = brief.overrides;
  if (brief.name !== undefined) parts.push(`Nome campagna desiderato: ${brief.name}`);
  if (o?.genres !== undefined && o.genres.length > 0) parts.push(`Generi: ${o.genres.join(', ')}`);
  if (o?.tone !== undefined) parts.push(`Tono: ${o.tone}`);
  if (o?.npcCount !== undefined) parts.push(`Numero di PNG chiave desiderato: ${o.npcCount}`);
  if (o?.contentGuidance !== undefined) parts.push(`Vincoli di contenuto: ${o.contentGuidance}`);
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: parts.join('\n\n') },
  ];
}

/** Genera una BOZZA di CampaignSeed dal brief (single-shot). Non semina: la conferma e seedCampaign. */
export async function generateCampaignSeed(
  brief: CampaignBrief,
  deps: { structured: StructuredOutputPort; ruleset: Ruleset },
): Promise<CampaignSeed> {
  const { value: raw } = await deps.structured.generate({
    messages: buildMessages(brief),
    schema: rawSeedSchema,
    schemaName: 'campaign_seed',
    schemaDescription: 'Scenario di campagna espanso da un brief',
    temperature: 0.9,
  });
  return rawToCampaignSeed(raw, deps.ruleset, brief);
}
```

Poi modifica `packages/ai/src/index.ts` aggiungendo in fondo:

```ts
export * from './campaign-generation';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/ai/src/campaign-generation.test.ts`
Expected: PASS (9 test).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm -C packages/ai typecheck`
Expected: nessun errore.

```bash
git add packages/ai/src/campaign-generation.ts packages/ai/src/campaign-generation.test.ts packages/ai/src/index.ts
git commit -m "feat(ai): generateCampaignSeed orchestratore (brief->RawSeed->CampaignSeed) + export [D-01b]"
```

---

## Task 4: host `generateSeed` + re‑export + end‑to‑end

**Files:**
- Modify: `packages/host/src/campaign-service.ts`
- Modify: `packages/host/src/index.ts`
- Test: `packages/host/src/campaign-service.test.ts`

- [ ] **Step 1: Write the failing test**

Aggiungi a `packages/host/src/campaign-service.test.ts`:

1. estendi l'import esistente da `@loomn/ai` (righe ~4-11) aggiungendo `type RawSeed` e `type CampaignBrief`;
2. in fondo al file, un nuovo `describe`:

```ts
const rawForHost: RawSeed = {
  name: 'Mondo Test',
  premise: 'una premessa',
  setting: { place: 'luogo', era: 'era', genres: ['fantasy'] },
  tone: 'epico',
  openingScene: 'apertura',
  hooks: ['gancio'],
  npcs: [{ name: 'Guardiano', description: 'sorveglia la torre', tier: 'esperto' }],
  places: [{ name: 'Torre', description: 'alta e buia' }],
  facts: [{ subject: 'Guardiano', predicate: 'sorveglia', object: 'Torre' }],
};

function fakeSeedPort(raw: RawSeed): StructuredOutputPort {
  return {
    generate: async <T>(_req: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> => ({
      value: raw as unknown as T,
      strategy: 'function-call',
    }),
  };
}

describe('createCampaignService - generateSeed (D-01b)', () => {
  it('genera una bozza di CampaignSeed dal brief con stat riempite dal vocabolario', async () => {
    const { service, memory } = makeService({ structured: fakeSeedPort(rawForHost) });
    try {
      const brief: CampaignBrief = { text: 'una torre maledetta' };
      const seed = await service.generateSeed(brief);
      expect(seed.frame.name).toBe('Mondo Test');
      expect(seed.keyNpcs[0]?.id).toBe('guardiano');
      expect(seed.keyNpcs[0]?.attributes?.['forza']).toBe(2); // esperto -> 2
    } finally {
      memory.close();
    }
  });

  it('la bozza generata e sempre confermabile: generateSeed poi seedCampaign riesce', async () => {
    const { service, memory } = makeService({ structured: fakeSeedPort(rawForHost) });
    try {
      const seed = await service.generateSeed({ text: 'x' });
      const out = await service.seedCampaign(seed);
      expect(out.readModel.state.campaignFrame?.name).toBe('Mondo Test');
      expect(out.readModel.state.actors['guardiano']).toBeDefined();
    } finally {
      memory.close();
    }
  });

  it('propaga l errore quando il provider non e configurato', async () => {
    const failingPort: StructuredOutputPort = {
      generate: async () => {
        throw new Error('provider non configurato');
      },
    };
    const { service, memory } = makeService({ structured: failingPort });
    try {
      await expect(service.generateSeed({ text: 'x' })).rejects.toThrow(/provider/);
    } finally {
      memory.close();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/host/src/campaign-service.test.ts`
Expected: FAIL — `service.generateSeed is not a function` (e/o errore di tipo su `generateSeed`).

- [ ] **Step 3: Write minimal implementation**

In `packages/host/src/campaign-service.ts`:

1. estendi l'import da `@loomn/ai` aggiungendo `generateCampaignSeed` (valore) e `type CampaignBrief`. Esempio (adatta alla riga di import esistente):

```ts
import { runMasterTurn, runReflection, generateCampaignSeed, type CampaignBrief } from '@loomn/ai';
```

> NB: importa `generateCampaignSeed` accanto ai simboli `@loomn/ai` già usati dal file; non duplicare la `import`. Verifica i nomi già importati prima di editare.

2. aggiungi il metodo all'interfaccia `CampaignService` (accanto a `seedCampaign`, ~riga 134):

```ts
  /** Genera una BOZZA di CampaignSeed dal brief via LLM (D-01b). NON semina: la conferma e
   *  seedCampaign(seed). Non accodato (non legge ne muta lo stato: usa solo ruleset + provider).
   *  Rigetta se il provider non e configurato o la generazione strutturata fallisce. */
  generateSeed(brief: CampaignBrief): Promise<CampaignSeed>;
```

3. aggiungi l'impl nell'oggetto ritornato da `createCampaignService` (accanto a `seedCampaign`, dentro il `return { ... }`):

```ts
    generateSeed(brief: CampaignBrief): Promise<CampaignSeed> {
      return generateCampaignSeed(brief, { structured: deps.structured, ruleset: deps.ruleset });
    },
```

> `CampaignSeed` è già importato da `@loomn/engine` in questo file (usato da `seedCampaign`); non ri‑importarlo.

Poi modifica `packages/host/src/index.ts` aggiungendo:

```ts
export type { CampaignBrief } from '@loomn/ai';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/host/src/campaign-service.test.ts`
Expected: PASS (i nuovi 3 test + tutti gli esistenti del file verdi).

- [ ] **Step 5: Typecheck + full suite + commit**

Run: `pnpm -C packages/host typecheck` → nessun errore.
Run (rete completa): `pnpm -r typecheck` → 6 progetti verdi; `pnpm test` → atteso **~817** verdi.

> Se `pnpm test` desse `NODE_MODULE_VERSION 146 ... requires 137`, la nativa è su ABI Electron da un gate → `pnpm rebuild:node`, poi ripeti.

```bash
git add packages/host/src/campaign-service.ts packages/host/src/campaign-service.test.ts packages/host/src/index.ts
git commit -m "feat(host): generateSeed sul CampaignService (bozza AI-da-brief, non-enqueued) [D-01b]"
```

---

## Self-Review (eseguita)

**1. Copertura spec:**
- §2.1 brief ibrido → `CampaignBrief` (T2/T3). ✓
- §2.2 confine gen+host, niente IPC/UI/gate/shared → file structure (solo `packages/ai`+`packages/host`). ✓
- §2.3/§2.4 stat dal codice + tier → `statsFromVocab`+`TIER_VALUE` (T2). ✓
- §2.5 bozza sempre confermabile → test end‑to‑end `generateSeed → seedCampaign` (T4). ✓
- §5.1 `CampaignBrief`, §5.2 `rawSeedSchema` (T2/T3). ✓
- §6 prompt single-shot + temperature → `buildMessages`/`generateCampaignSeed` (T3). ✓
- §7 transform (ids slug+dedup, tier→stat, fatti verbatim, contentGuidance precedence, worldRules omesso) → T2 (4 test). ✓
- §8 host `generateSeed` non‑enqueued + re‑export → T4. ✓
- §9 errori (provider assente / `StructuredOutputError`) → T3 + T4. ✓

**2. Placeholder scan:** nessun TBD/TODO; ogni step ha codice/comando completo. ✓

**3. Coerenza di tipi/nomi:** `RawSeed`, `CampaignBrief`, `rawToCampaignSeed(raw, ruleset, brief?)`, `generateCampaignSeed(brief, {structured, ruleset})`, `slugify`, `statsFromVocab`, `TIER_VALUE`, `makeUniquifier` — usati in modo identico tra T2/T3/T4 e tra `@loomn/ai` e `@loomn/host`. `schemaName: 'campaign_seed'` coerente tra impl e test. `tier` enum `['comune','esperto','eccezionale']` ↔ `TIER_VALUE` 1/2/3. ✓

---

## Roadmap / Execution Handoff

- **DOPO il merge** (flusso §4 HANDOFF): `finishing-a-development-branch` → merge ff in `main` → `pnpm test` full verde → `git push origin main` (porta anche il commit spec `4bdc975`) → cancella branch → aggiorna `HANDOFF.md` + memoria (`loomn-project.md`).
- **Prossima slice (da decidere con l'utente):** D‑01c (IPC `generate-seed` + UI onboarding review/edit) oppure D‑03 (registro multi‑campagna).
- **Gate Electron:** NON richiesto (D‑01b è LLM-backed, coperto da unit test con fake model, non tocca main/renderer). Se mai servisse rieseguirlo per altri motivi, ricorda il flag noto: `pnpm gate:selftest` è rotto in questo ambiente → usa il bin electron diretto (vedi HANDOFF §9 punto 2).
