# D-01c — UX onboarding nuova campagna — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cablare la UX di creazione campagna (brief → genera bozza → review/edit → conferma → narrazione d'apertura) e il contratto IPC che mancava (`generate-seed`, `seed-campaign`), riusando gli agganci host gia pronti (`generateSeed`/`seedCampaign`).

**Architettura:** Due nuovi canali IPC sopra `CampaignService`; estrazione di `campaignSeedSchema` (refactor puro) + nuovo `campaignBriefSchema` in `@loomn/shared`; una route `/nuova-campagna` con `useOnboardingStore` e un gate di boot dentro `runFirstRun` (NON un guard globale, per non perturbare il self-test). Riferimento: spec `docs/superpowers/specs/2026-06-23-d01c-onboarding-design.md`.

**Tech Stack:** TypeScript strict (exactOptionalPropertyTypes), Zod, Electron (main/preload/renderer), Vue 3 + Pinia + vue-router, Vitest + @vue/test-utils. Monorepo pnpm.

**Baseline:** 817 test verdi, `pnpm -r typecheck` pulito (6 progetti), tree pulito (solo `.claude/`). HEAD codice `d92b480`, doc `df1f6bb` (spec D-01c).

---

## Vincoli trasversali (valgono per OGNI task)

- **Disciplina di scope:** tocca SOLO i file elencati nel task. MAI `tsconfig*`, `vitest.config*`, `vitest.workspace.ts`, `electron.vite.config*`, `package.json`. Verifica `git status --short` prima di ogni commit. `.claude/` NON si committa MAI. Crea file con lo strumento Write (non `New-Item -Force`).
- **Anti-apostrofo:** nelle descrizioni `it('...')`/`describe('...')` in apici singoli e nelle label UI NIENTE apostrofi (`l'`, `un'`, `dell'`, `c'è`). Scrivi `l attore`, `d apertura`, `c e`. `è/é` vanno bene. Grep di verifica: `(it|describe)\('[^']*'[A-Za-zàèéìòù]` → no match.
- **TS strict:** `exactOptionalPropertyTypes` → mai `campo: undefined`; usa spread condizionali `...(x !== undefined ? { campo: x } : {})`. Accessi indicizzati guardati.
- **Drift-guard IPC:** per ogni canale nuovo, allinea NELLO STESSO task `IPC_CHANNELS` + schema request + schema response + metodo su `LoomnBridge` + metodo nel preload + handler nel main. Ogni task chiude con `pnpm -r typecheck` verde.
- **Payload plain:** ogni oggetto inviato su IPC dal renderer deve essere un plain object, mai un proxy reactive di Vue (lezione 10b: "An object could not be cloned").
- **Comando test singolo file (dalla root):** `pnpm exec vitest run <path>` (NON `pnpm -C <pkg> exec vitest`, che non risolve la config di root).

---

## Struttura dei file

| File | Responsabilita | Task |
|---|---|---|
| `packages/shared/src/domain-schema.ts` | estrai `campaignSeedSchema`, aggiungi `campaignBriefSchema` | T1 |
| `packages/shared/src/ipc.ts` | 2 canali + schemi request/response + 2 metodi `LoomnBridge` | T1 |
| `packages/shared/src/onboarding-ipc.test.ts` (nuovo) | test schemi | T1 |
| `app/desktop/src/preload/index.ts` | 2 metodi bridge | T2 |
| `app/desktop/src/main/index.ts` | 2 handler | T2 |
| `app/desktop/src/renderer/src/stores/read-model.ts` | getter `hasCampaign` | T3 |
| `app/desktop/src/renderer/src/stores/onboarding.ts` (nuovo) | stato del wizard + chiamate IPC | T3 |
| `app/desktop/src/renderer/src/stores/onboarding.test.ts` (nuovo) | test store | T3 |
| `app/desktop/src/renderer/src/stores/read-model.test.ts` | test `hasCampaign` (append) | T3 |
| `app/desktop/src/renderer/src/views/OnboardingView.vue` (nuovo) | shell + stepper | T4 |
| `app/desktop/src/renderer/src/components/onboarding/BriefStep.vue` (nuovo) | form brief | T4 |
| `app/desktop/src/renderer/src/components/onboarding/ReviewStep.vue` (nuovo) | bozza editabile | T4 |
| `app/desktop/src/renderer/src/components/onboarding/OpeningStep.vue` (nuovo) | reveal apertura | T4 |
| `app/desktop/src/renderer/src/router/index.ts` | registra route `/nuova-campagna` | T4 |
| `app/desktop/src/renderer/src/views/OnboardingView.test.ts` (nuovo) | test routing per step | T4 |
| `app/desktop/src/renderer/src/components/onboarding/BriefStep.test.ts` (nuovo) | test brief | T4 |
| `app/desktop/src/renderer/src/components/onboarding/OpeningStep.test.ts` (nuovo) | test apertura | T4 |
| `app/desktop/src/renderer/src/composables/use-first-run.ts` | gate onboarding | T5 |
| `app/desktop/src/renderer/src/composables/use-first-run.test.ts` | aggiorna + test gate | T5 |
| `app/desktop/src/renderer/src/renderer.ts` | SOLO la riga 34 (chiamata `runFirstRun`) | T5 |
| `app/desktop/src/renderer/src/views/SettingsView.vue` | hop post-save → onboarding | T5 |
| `app/desktop/src/renderer/src/views/SettingsView.test.ts` | aggiorna stub (router + getReadModel) | T5 |

---

## Task 1: `@loomn/shared` — schemi e canali IPC

**Files:**
- Modify: `packages/shared/src/domain-schema.ts:459-467` (estrazione) + aggiungi `campaignBriefSchema`
- Modify: `packages/shared/src/ipc.ts` (import + 2 canali + 4 schemi + 2 metodi bridge)
- Test: `packages/shared/src/onboarding-ipc.test.ts` (nuovo)

- [ ] **Step 1: Scrivi i test (falliranno)**

Crea `packages/shared/src/onboarding-ipc.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  campaignSeedSchema,
  campaignBriefSchema,
  generateSeedResultSchema,
  seedCampaignResultSchema,
} from './domain-schema';
import { generateSeedRequestSchema, seedCampaignRequestSchema } from './ipc';

const VALID_SEED = {
  frame: {
    id: 'la-cripta',
    name: 'La Cripta',
    premise: 'premessa',
    setting: { place: 'Porto', era: 'eta del bronzo', genres: ['fantasy'] },
    tone: 'cupo',
    openingScene: 'Notte sul molo.',
    hooks: ['un gancio'],
  },
  keyNpcs: [{ id: 'orsa', name: 'Orsa', description: 'vetraia' }],
  keyPlaces: [{ id: 'molo', name: 'Molo', description: 'assi marce' }],
  initialFacts: [{ subject: 'orsa', predicate: 'lavora-a', object: 'molo' }],
};

describe('campaignSeedSchema', () => {
  it('parsa un seed valido (gate estratto, behaviour-preserving)', () => {
    const r = campaignSeedSchema.safeParse(VALID_SEED);
    expect(r.success).toBe(true);
  });

  it('rifiuta un seed con id PNG vuoto', () => {
    const bad = { ...VALID_SEED, keyNpcs: [{ id: '', name: 'X', description: 'd' }] };
    expect(campaignSeedSchema.safeParse(bad).success).toBe(false);
  });
});

describe('campaignBriefSchema', () => {
  it('parsa un brief minimo (solo text)', () => {
    const r = campaignBriefSchema.safeParse({ text: 'una storia di pirati' });
    expect(r.success).toBe(true);
    expect(r.success && r.data.text).toBe('una storia di pirati');
  });

  it('parsa overrides e OMETTE le chiavi assenti (exactOptional)', () => {
    const r = campaignBriefSchema.safeParse({ text: 't', overrides: { tone: 'epico' } });
    expect(r.success).toBe(true);
    expect(r.success && r.data.overrides).toEqual({ tone: 'epico' });
  });

  it('rifiuta text vuoto', () => {
    expect(campaignBriefSchema.safeParse({ text: '' }).success).toBe(false);
  });
});

describe('schemi dei canali onboarding', () => {
  it('generateSeedRequestSchema accetta un brief', () => {
    expect(generateSeedRequestSchema.safeParse({ text: 't' }).success).toBe(true);
  });

  it('generateSeedResultSchema parsa l arm ok con seed', () => {
    expect(generateSeedResultSchema.safeParse({ ok: true, seed: VALID_SEED }).success).toBe(true);
  });

  it('seedCampaignRequestSchema richiede seed valido', () => {
    expect(seedCampaignRequestSchema.safeParse({ seed: VALID_SEED }).success).toBe(true);
  });

  it('seedCampaignResultSchema parsa ok con version e narration opzionale', () => {
    expect(seedCampaignResultSchema.safeParse({ ok: true, version: 3 }).success).toBe(true);
    expect(seedCampaignResultSchema.safeParse({ ok: true, version: 3, narration: 'apertura' }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `pnpm exec vitest run packages/shared/src/onboarding-ipc.test.ts`
Expected: FAIL (export `campaignSeedSchema`/`campaignBriefSchema`/`generateSeedRequestSchema`/... non esistono).

- [ ] **Step 3: Estrai `campaignSeedSchema` in `domain-schema.ts`**

Sostituisci il blocco `seedCampaignCommandSchema` ([domain-schema.ts:459-467](../../../packages/shared/src/domain-schema.ts:459)) con:

```ts
/** Gate di confine IPC del CampaignSeed (estratto da seedCampaignCommandSchema; behaviour-preserving).
 *  Bound ammessi (riusa i componenti gia bounded come seedNpcCommandSchema con finiteNumber): e un
 *  confine, NON un read-path di replay. Usato dai canali generate-seed/seed-campaign (D-01c). */
export const campaignSeedSchema = z.object({
  frame: campaignFrameSchema,
  keyNpcs: z.array(seedNpcCommandSchema),
  keyPlaces: z.array(seedPlaceCommandSchema),
  initialFacts: z.array(seedFactCommandSchema),
});

const seedCampaignCommandSchema = z.object({
  type: z.literal('SeedCampaign'),
  seed: campaignSeedSchema,
});
```

Poi aggiungi `campaignBriefSchema` subito dopo (mirror del tipo `CampaignBrief` di `@loomn/ai`; `.transform()` per OMETTERE le chiavi assenti → tipo assegnabile a `CampaignBrief` sotto exactOptional, stesso pattern di `campaignFrameSchema`/`seedNpcCommandSchema`). `finiteNumber` e gia definito nel file ([:6](../../../packages/shared/src/domain-schema.ts:6)):

```ts
/** Brief di campagna al confine IPC (D-01c): mirror Zod di CampaignBrief (@loomn/ai). Il .transform
 *  omette le chiavi opzionali assenti -> z.infer assegnabile a CampaignBrief (exactOptional). */
export const campaignBriefSchema = z
  .object({
    text: z.string().min(1),
    name: z.string().optional(),
    overrides: z
      .object({
        genres: z.array(z.string()).optional(),
        tone: z.string().optional(),
        npcCount: finiteNumber.int().nonnegative().optional(),
        contentGuidance: z.string().optional(),
      })
      .transform((o) => ({
        ...(o.genres !== undefined ? { genres: o.genres } : {}),
        ...(o.tone !== undefined ? { tone: o.tone } : {}),
        ...(o.npcCount !== undefined ? { npcCount: o.npcCount } : {}),
        ...(o.contentGuidance !== undefined ? { contentGuidance: o.contentGuidance } : {}),
      }))
      .optional(),
  })
  .transform((b) => ({
    text: b.text,
    ...(b.name !== undefined ? { name: b.name } : {}),
    ...(b.overrides !== undefined ? { overrides: b.overrides } : {}),
  }));
```

- [ ] **Step 4: Aggiungi i canali e gli schemi in `ipc.ts`**

In `ipc.ts` aggiorna l'import da `./domain-schema` ([:7](../../../packages/shared/src/ipc.ts:7)) aggiungendo `campaignBriefSchema, campaignSeedSchema`:

```ts
import { campaignBriefSchema, campaignSeedSchema, commandSchema, domainEventSchema, gameStateSchema } from './domain-schema';
```

Aggiungi in `IPC_CHANNELS` ([:33](../../../packages/shared/src/ipc.ts:33), prima della chiusura `} as const`):

```ts
  /** invoke/handle: genera una bozza di CampaignSeed da un brief (read-side, richiede provider). */
  generateSeed: 'loomn:generate-seed',
  /** invoke/handle: conferma e semina la campagna; ritorna versione + narrazione d apertura. */
  seedCampaign: 'loomn:seed-campaign',
```

Aggiungi le sezioni schemi (dopo `readModelPushSchema`, prima di `LoomnBridge` [:231](../../../packages/shared/src/ipc.ts:231)):

```ts
// --- generateSeed (bozza AI-da-brief; read-side, richiede provider) ---
export const generateSeedRequestSchema = campaignBriefSchema;
/** Forma del brief lato chiamante (input pre-transform). */
export type GenerateSeedRequest = z.input<typeof campaignBriefSchema>;

export const generateSeedResultSchema = z.union([
  z.object({ ok: z.literal(true), seed: campaignSeedSchema }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type GenerateSeedResult = z.infer<typeof generateSeedResultSchema>;

// --- seedCampaign (conferma: semina la campagna, atomico nel host) ---
export const seedCampaignRequestSchema = z.object({ seed: campaignSeedSchema });
export type SeedCampaignRequest = z.input<typeof seedCampaignRequestSchema>;

export const seedCampaignResultSchema = z.union([
  z.object({
    ok: z.literal(true),
    version: z.number().int().nonnegative(),
    narration: z.string().optional(),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type SeedCampaignResult = z.infer<typeof seedCampaignResultSchema>;
```

Aggiungi in `LoomnBridge` (dopo `getReadModel` [:253](../../../packages/shared/src/ipc.ts:253)):

```ts
  /** Genera una bozza di CampaignSeed da un brief (richiede provider configurato). */
  generateSeed(brief: GenerateSeedRequest): Promise<GenerateSeedResult>;
  /** Conferma e semina la campagna (atomico); ritorna versione + narrazione d apertura. */
  seedCampaign(request: SeedCampaignRequest): Promise<SeedCampaignResult>;
```

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `pnpm exec vitest run packages/shared/src/onboarding-ipc.test.ts`
Expected: PASS (tutti i test verdi).

- [ ] **Step 6: Typecheck**

Run: `pnpm -r typecheck`
Expected: 6 progetti, nessun errore (l'estrazione e behaviour-preserving; nessun consumatore di `seedCampaignCommandSchema` cambia forma).

- [ ] **Step 7: Commit**

```bash
git status --short
git add packages/shared/src/domain-schema.ts packages/shared/src/ipc.ts packages/shared/src/onboarding-ipc.test.ts
git commit -m "feat(shared): estrai campaignSeedSchema + campaignBriefSchema + canali generate-seed/seed-campaign"
```

Conteggio test atteso: ~824 (817 + 7).

---

## Task 2: main + preload — handler e bridge

**Files:**
- Modify: `app/desktop/src/preload/index.ts` (import + 2 metodi)
- Modify: `app/desktop/src/main/index.ts` (import + 2 handler in `registerHandlers`)

> **Nota TDD/convenzione:** gli handler IPC del main NON hanno test unit nel repo (convenzione: verificati dal gate Electron + typecheck; vedi F4/Piano 0). Questo task e quindi verificato da `pnpm -r typecheck` (i drift-guard vivono AI SITI DI CHIAMATA: `parsed.data` assegnabile a `CampaignBrief`, `parsed.data.seed` a `CampaignSeed`, e `seed`/`version` di ritorno agli schemi response) e dal gate del Task 6. Nessun nuovo file di test qui.

- [ ] **Step 1: Aggiungi i due metodi al bridge preload**

In `preload/index.ts` aggiungi all'import da `@loomn/shared` ([:2-22](../../../app/desktop/src/preload/index.ts:2)):

```ts
  type GenerateSeedRequest,
  type GenerateSeedResult,
  type SeedCampaignRequest,
  type SeedCampaignResult,
```

Aggiungi nel `bridge` (dopo `getReadModel` [:43](../../../app/desktop/src/preload/index.ts:43)):

```ts
  generateSeed: (brief: GenerateSeedRequest): Promise<GenerateSeedResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.generateSeed, brief),
  seedCampaign: (request: SeedCampaignRequest): Promise<SeedCampaignResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.seedCampaign, request),
```

- [ ] **Step 2: Aggiungi i due handler nel main**

In `main/index.ts` aggiungi all'import da `@loomn/shared` ([:14-33](../../../app/desktop/src/main/index.ts:14)):

```ts
  generateSeedRequestSchema,
  seedCampaignRequestSchema,
  type GenerateSeedResult,
  type SeedCampaignResult,
```

Aggiungi in `registerHandlers`, dopo l'handler `getReadModel` ([:204](../../../app/desktop/src/main/index.ts:204)):

```ts
  ipcMain.handle(IPC_CHANNELS.generateSeed, async (_e, raw): Promise<GenerateSeedResult> => {
    const parsed = generateSeedRequestSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: `Brief non valido: ${parsed.error.message}` };
    // Pre-check deterministico: niente string-sniffing del sentinel NO_PROVIDER del provider-holder.
    if (!holder.isConfigured()) {
      return { ok: false, error: 'Nessun provider AI configurato. Configuralo in Impostazioni.' };
    }
    try {
      const seed = await service.generateSeed(parsed.data);
      return { ok: true, seed };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.seedCampaign, async (_e, raw): Promise<SeedCampaignResult> => {
    const parsed = seedCampaignRequestSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: `Seed non valido: ${parsed.error.message}` };
    try {
      const out = await service.seedCampaign(parsed.data.seed);
      pushReadModel(service); // la board si popola di campaignFrame + attori
      return {
        ok: true,
        version: out.readModel.version,
        ...(out.narration !== undefined ? { narration: out.narration } : {}),
      };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });
```

- [ ] **Step 3: Typecheck (verifica drift-guard ai siti di chiamata)**

Run: `pnpm -r typecheck`
Expected: nessun errore. Se `z.infer<campaignBriefSchema>` non fosse assegnabile a `CampaignBrief`, o `seed`/`version` non combaciassero con gli schemi response, vue-tsc/tsc fallirebbe QUI (drift-guard, come `commandSchema`→`Command`).

- [ ] **Step 4: Esegui la suite (nessuna regressione)**

Run: `pnpm test`
Expected: ~824 verdi (invariato rispetto a T1; nessun nuovo test).
Nota: se fallisce con `NODE_MODULE_VERSION 146 ... requires 137` → `pnpm rebuild:node` (ABI rimasta su Electron da un gate precedente).

- [ ] **Step 5: Commit**

```bash
git status --short
git add app/desktop/src/preload/index.ts app/desktop/src/main/index.ts
git commit -m "feat(desktop): handler IPC generate-seed/seed-campaign + metodi bridge"
```

---

## Task 3: renderer — stato (hasCampaign + useOnboardingStore)

**Files:**
- Modify: `app/desktop/src/renderer/src/stores/read-model.ts` (getter `hasCampaign`)
- Modify: `app/desktop/src/renderer/src/stores/read-model.test.ts` (test `hasCampaign`)
- Create: `app/desktop/src/renderer/src/stores/onboarding.ts`
- Create: `app/desktop/src/renderer/src/stores/onboarding.test.ts`

- [ ] **Step 1: Scrivi il test di `hasCampaign` (fallira)**

Aggiungi a `app/desktop/src/renderer/src/stores/read-model.test.ts` (dentro il `describe` esistente; usa lo stesso stile di costruzione push del file):

```ts
  it('hasCampaign e false senza campaignFrame, true con campaignFrame', () => {
    const store = useReadModelStore();
    expect(store.hasCampaign).toBe(false);
    store.applyPush({ version: 1, state: { campaignFrame: { id: 'c1' } } } as unknown as ReadModelPush);
    expect(store.hasCampaign).toBe(true);
  });
```

(Se `ReadModelPush`/`useReadModelStore` non sono gia importati nel file, aggiungili: `import type { ReadModelPush } from '@loomn/shared';` e l'import dello store.)

- [ ] **Step 2: Scrivi il test dello store onboarding (fallira)**

Crea `app/desktop/src/renderer/src/stores/onboarding.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isReactive } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import type { GenerateSeedResult, SeedCampaignResult } from '@loomn/shared';
import { useOnboardingStore } from './onboarding';

const SEED = {
  frame: {
    id: 'la-cripta', name: 'La Cripta', premise: 'p',
    setting: { place: 'Porto', era: 'bronzo', genres: ['fantasy'] },
    tone: 'cupo', openingScene: 'Notte.', hooks: ['gancio'],
  },
  keyNpcs: [{ id: 'orsa', name: 'Orsa', description: 'vetraia' }],
  keyPlaces: [{ id: 'molo', name: 'Molo', description: 'assi' }],
  initialFacts: [{ subject: 'orsa', predicate: 'lavora-a', object: 'molo' }],
};

function stub(over: Partial<Record<'generateSeed' | 'seedCampaign', unknown>>): void {
  window.loomn = {
    generateSeed: vi.fn((): Promise<GenerateSeedResult> => Promise.resolve({ ok: true, seed: SEED })),
    seedCampaign: vi.fn((): Promise<SeedCampaignResult> => Promise.resolve({ ok: true, version: 5, narration: 'apertura' })),
    ...over,
  } as unknown as typeof window.loomn;
}

describe('useOnboardingStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    stub({});
  });

  it('buildBrief tesse text + overrides e omette i campi vuoti', () => {
    const s = useOnboardingStore();
    s.text = '  pirati  ';
    s.genres = 'fantasy, avventura';
    s.tone = '';
    s.npcCount = 3;
    expect(s.buildBrief()).toEqual({ text: 'pirati', overrides: { genres: ['fantasy', 'avventura'], npcCount: 3 } });
  });

  it('generate ok popola draft e passa a review', async () => {
    const s = useOnboardingStore();
    s.text = 'pirati';
    await s.generate();
    expect(s.draft?.frame.name).toBe('La Cripta');
    expect(s.step).toBe('review');
    expect(s.error).toBeNull();
  });

  it('generate con testo vuoto non chiama l IPC', async () => {
    const gen = vi.fn();
    stub({ generateSeed: gen });
    const s = useOnboardingStore();
    s.text = '   ';
    await s.generate();
    expect(gen).not.toHaveBeenCalled();
  });

  it('generate non ok imposta error e resta su brief', async () => {
    stub({ generateSeed: vi.fn((): Promise<GenerateSeedResult> => Promise.resolve({ ok: false, error: 'nessun provider' })) });
    const s = useOnboardingStore();
    s.text = 'x';
    await s.generate();
    expect(s.error).toBe('nessun provider');
    expect(s.step).toBe('brief');
  });

  it('confirm invia un seed PLAIN (non un proxy reactive) e passa a opening', async () => {
    const seedCampaign = vi.fn((): Promise<SeedCampaignResult> => Promise.resolve({ ok: true, version: 5, narration: 'apertura' }));
    stub({ seedCampaign });
    const s = useOnboardingStore();
    s.text = 'x';
    await s.generate();
    await s.confirm();
    const arg = seedCampaign.mock.calls[0]![0] as { seed: unknown };
    expect(isReactive(arg.seed)).toBe(false);
    expect(arg.seed).toEqual(SEED);
    expect(s.opening).toBe('apertura');
    expect(s.step).toBe('opening');
  });

  it('regenerate riporta allo step brief tenendo il brief', async () => {
    const s = useOnboardingStore();
    s.text = 'x';
    await s.generate();
    s.regenerate();
    expect(s.step).toBe('brief');
    expect(s.text).toBe('x');
  });
});
```

- [ ] **Step 3: Esegui i test e verifica che falliscano**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/stores/onboarding.test.ts app/desktop/src/renderer/src/stores/read-model.test.ts`
Expected: FAIL (`./onboarding` non esiste; `hasCampaign` non definito).

- [ ] **Step 4: Aggiungi `hasCampaign` al read-model store**

In `read-model.ts`, dopo `inCombat` ([:39](../../../app/desktop/src/renderer/src/stores/read-model.ts:39)):

```ts
  const hasCampaign = computed<boolean>(() => state.value?.campaignFrame !== undefined);
```

E aggiungilo al return ([:41](../../../app/desktop/src/renderer/src/stores/read-model.ts:41)):

```ts
  return { version, applyPush, loaded, phase, actors, pcs, npcs, quests, encounter, inCombat, hasCampaign };
```

- [ ] **Step 5: Crea `stores/onboarding.ts`**

```ts
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { GenerateSeedRequest, GenerateSeedResult, SeedCampaignResult } from '@loomn/shared';

/** La bozza editabile = il seed dell arm ok di generate-seed (z.infer di campaignSeedSchema). */
type Draft = Extract<GenerateSeedResult, { ok: true }>['seed'];

/** Stato del wizard di onboarding (D-01c). Chiama window.loomn.* direttamente (come journal/narration);
 *  i reject IPC sono avvolti in try/catch (garanzia "mai fallire in silenzio", come use-dispatch). */
export const useOnboardingStore = defineStore('onboarding', () => {
  const text = ref('');
  const name = ref('');
  const genres = ref('');
  const tone = ref('');
  const npcCount = ref<number | null>(null);
  const contentGuidance = ref('');
  const draft = ref<Draft | null>(null);
  const step = ref<'brief' | 'review' | 'opening'>('brief');
  const status = ref<'idle' | 'generating' | 'seeding'>('idle');
  const error = ref<string | null>(null);
  const opening = ref<string | null>(null);

  function buildBrief(): GenerateSeedRequest {
    const g = genres.value.split(',').map((x) => x.trim()).filter((x) => x.length > 0);
    const overrides = {
      ...(g.length > 0 ? { genres: g } : {}),
      ...(tone.value.trim() !== '' ? { tone: tone.value.trim() } : {}),
      ...(typeof npcCount.value === 'number' && Number.isFinite(npcCount.value) ? { npcCount: npcCount.value } : {}),
      ...(contentGuidance.value.trim() !== '' ? { contentGuidance: contentGuidance.value.trim() } : {}),
    };
    return {
      text: text.value.trim(),
      ...(name.value.trim() !== '' ? { name: name.value.trim() } : {}),
      ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
    };
  }

  async function generate(): Promise<void> {
    if (text.value.trim() === '' || status.value === 'generating') return;
    status.value = 'generating';
    error.value = null;
    try {
      const res = await window.loomn.generateSeed(buildBrief());
      if (res.ok) {
        draft.value = res.seed;
        step.value = 'review';
      } else {
        error.value = res.error;
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      status.value = 'idle';
    }
  }

  async function confirm(): Promise<void> {
    if (draft.value === null || status.value === 'seeding') return;
    status.value = 'seeding';
    error.value = null;
    // deep-plain: la bozza e un proxy reactive editato. Il round-trip JSON produce un plain object
    // (anti "An object could not be cloned") e omette gli undefined. Lo schema ri-valida al confine.
    const plainSeed = JSON.parse(JSON.stringify(draft.value)) as Draft;
    try {
      const res: SeedCampaignResult = await window.loomn.seedCampaign({ seed: plainSeed });
      if (res.ok) {
        opening.value = res.narration ?? null;
        step.value = 'opening';
      } else {
        error.value = res.error;
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      status.value = 'idle';
    }
  }

  function regenerate(): void {
    step.value = 'brief';
  }

  return {
    text, name, genres, tone, npcCount, contentGuidance,
    draft, step, status, error, opening,
    buildBrief, generate, confirm, regenerate,
  };
});
```

- [ ] **Step 6: Esegui i test e verifica che passino**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/stores/onboarding.test.ts app/desktop/src/renderer/src/stores/read-model.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `pnpm -r typecheck`
Expected: nessun errore.

- [ ] **Step 8: Commit**

```bash
git status --short
git add app/desktop/src/renderer/src/stores/read-model.ts app/desktop/src/renderer/src/stores/read-model.test.ts app/desktop/src/renderer/src/stores/onboarding.ts app/desktop/src/renderer/src/stores/onboarding.test.ts
git commit -m "feat(renderer): useOnboardingStore + getter hasCampaign"
```

Conteggio test atteso: ~832 (824 + ~7 store + 1 hasCampaign).

---

## Task 4: renderer — UI (OnboardingView + step) + route

**Files:**
- Create: `app/desktop/src/renderer/src/views/OnboardingView.vue`
- Create: `app/desktop/src/renderer/src/components/onboarding/BriefStep.vue`
- Create: `app/desktop/src/renderer/src/components/onboarding/ReviewStep.vue`
- Create: `app/desktop/src/renderer/src/components/onboarding/OpeningStep.vue`
- Modify: `app/desktop/src/renderer/src/router/index.ts` (route `/nuova-campagna`)
- Create: `app/desktop/src/renderer/src/views/OnboardingView.test.ts`
- Create: `app/desktop/src/renderer/src/components/onboarding/BriefStep.test.ts`
- Create: `app/desktop/src/renderer/src/components/onboarding/OpeningStep.test.ts`

> **Nota stile:** le SFC qui sotto sono complete e funzionanti ma con stile minimo. La rifinitura visiva (allineata ai mockup approvati del brainstorming) e responsabilita dell'implementer via `frontend-design`, senza cambiare struttura/binding/test. Le label sono apostrophe-free per convenzione.
>
> **Nota scope divergenza:** in `ReviewStep` si editano i campi scalari stringa (frame: name/premise/tone/openingScene/setting.place/setting.era/hooks; PNG e luoghi: name/description; fatti: tripla). L'edit di `setting.genres` (array) e omesso in questa slice — stesso bucket di "cardinalita liste fissa" (foredit array = follow-up). Le statistiche dei PNG NON sono editabili (chip "stat: da codice").

- [ ] **Step 1: Scrivi i test dei componenti (falliranno)**

Crea `app/desktop/src/renderer/src/views/OnboardingView.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import OnboardingView from './OnboardingView.vue';
import { useOnboardingStore } from '../stores/onboarding';

describe('OnboardingView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('mostra il BriefStep allo step brief', () => {
    const w = mount(OnboardingView, { global: { stubs: { BriefStep: true, ReviewStep: true, OpeningStep: true } } });
    expect(w.findComponent({ name: 'BriefStep' }).exists()).toBe(true);
    expect(w.findComponent({ name: 'ReviewStep' }).exists()).toBe(false);
  });

  it('mostra il ReviewStep allo step review', () => {
    const s = useOnboardingStore();
    s.step = 'review';
    const w = mount(OnboardingView, { global: { stubs: { BriefStep: true, ReviewStep: true, OpeningStep: true } } });
    expect(w.findComponent({ name: 'ReviewStep' }).exists()).toBe(true);
  });

  it('mostra l OpeningStep allo step opening', () => {
    const s = useOnboardingStore();
    s.step = 'opening';
    const w = mount(OnboardingView, { global: { stubs: { BriefStep: true, ReviewStep: true, OpeningStep: true } } });
    expect(w.findComponent({ name: 'OpeningStep' }).exists()).toBe(true);
  });
});
```

Crea `app/desktop/src/renderer/src/components/onboarding/BriefStep.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { setActivePinia, createPinia } from 'pinia';
import { routes } from '../../router';
import BriefStep from './BriefStep.vue';
import { useOnboardingStore } from '../../stores/onboarding';

function mountStep() {
  const router = createRouter({ history: createMemoryHistory(), routes });
  return mount(BriefStep, { global: { plugins: [router] } });
}

describe('BriefStep', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('disabilita Genera bozza quando il testo e vuoto', async () => {
    const w = mountStep();
    expect((w.find('button.generate').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('abilita Genera bozza quando c e del testo', async () => {
    const s = useOnboardingStore();
    s.text = 'una storia';
    const w = mountStep();
    await w.vm.$nextTick();
    expect((w.find('button.generate').element as HTMLButtonElement).disabled).toBe(false);
  });

  it('mostra il PanelError quando lo store ha un errore', async () => {
    const s = useOnboardingStore();
    s.error = 'nessun provider';
    const w = mountStep();
    await w.vm.$nextTick();
    expect(w.find('[role="alert"]').text()).toContain('nessun provider');
  });
});
```

Crea `app/desktop/src/renderer/src/components/onboarding/OpeningStep.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { setActivePinia, createPinia } from 'pinia';
import { routes } from '../../router';
import OpeningStep from './OpeningStep.vue';
import { useOnboardingStore } from '../../stores/onboarding';

function mountStep() {
  const router = createRouter({ history: createMemoryHistory(), routes });
  return mount(OpeningStep, { global: { plugins: [router] } });
}

describe('OpeningStep', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('mostra la narrazione quando presente', () => {
    const s = useOnboardingStore();
    s.opening = 'Notte sul molo.';
    const w = mountStep();
    expect(w.find('.narration').text()).toContain('Notte sul molo.');
  });

  it('degrada alla scena d apertura del frame quando narration e assente', () => {
    const s = useOnboardingStore();
    s.opening = null;
    s.draft = { frame: { openingScene: 'Scena di riserva.' } } as unknown as typeof s.draft;
    const w = mountStep();
    expect(w.find('.narration').text()).toContain('Scena di riserva.');
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/views/OnboardingView.test.ts app/desktop/src/renderer/src/components/onboarding/BriefStep.test.ts app/desktop/src/renderer/src/components/onboarding/OpeningStep.test.ts`
Expected: FAIL (componenti inesistenti).

- [ ] **Step 3: Crea `views/OnboardingView.vue`**

```vue
<script setup lang="ts">
import { useOnboardingStore } from '../stores/onboarding';
import BriefStep from '../components/onboarding/BriefStep.vue';
import ReviewStep from '../components/onboarding/ReviewStep.vue';
import OpeningStep from '../components/onboarding/OpeningStep.vue';

const store = useOnboardingStore();
const steps = ['brief', 'review', 'opening'] as const;
const labels: Record<(typeof steps)[number], string> = { brief: 'Brief', review: 'Revisione', opening: 'Apertura' };
</script>

<template>
  <main class="route-view onboarding">
    <nav class="stepper" aria-label="Passi onboarding">
      <span v-for="(s, i) in steps" :key="s" class="stepper__item" :class="{ 'stepper__item--active': store.step === s }">
        {{ i + 1 }} · {{ labels[s] }}
      </span>
    </nav>
    <BriefStep v-if="store.step === 'brief'" />
    <ReviewStep v-else-if="store.step === 'review'" />
    <OpeningStep v-else />
  </main>
</template>

<style scoped>
.onboarding { flex: 1; min-height: 0; padding: 16px; max-width: 760px; }
.stepper { display: flex; gap: 12px; margin-bottom: 16px; font-size: 12px; color: var(--text-3); }
.stepper__item--active { color: var(--accent); font-weight: 500; }
</style>
```

- [ ] **Step 4: Crea `components/onboarding/BriefStep.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useOnboardingStore } from '../../stores/onboarding';
import PanelError from '../PanelError.vue';

defineOptions({ name: 'BriefStep' });
const store = useOnboardingStore();
const router = useRouter();
const canGenerate = computed<boolean>(() => store.text.trim() !== '' && store.status !== 'generating');
</script>

<template>
  <div class="brief">
    <h2>Nuova campagna</h2>
    <label class="field">Di cosa parla la tua campagna?
      <textarea v-model="store.text" rows="4" placeholder="Es. un equipaggio di contrabbandieri e una reliquia viva..."></textarea>
    </label>
    <label class="field">Nome (opzionale)
      <input v-model="store.name" type="text" placeholder="se lo lasci vuoto, lo propone l AI" />
    </label>
    <details class="advanced">
      <summary>Opzioni avanzate</summary>
      <label class="field">Generi <input v-model="store.genres" type="text" placeholder="fantasy, mistero" /></label>
      <label class="field">Tono <input v-model="store.tone" type="text" /></label>
      <label class="field">N. PNG chiave <input v-model.number="store.npcCount" type="number" min="0" /></label>
      <label class="field">Guida ai contenuti <textarea v-model="store.contentGuidance" rows="2"></textarea></label>
    </details>
    <PanelError :error="store.error" />
    <div class="actions">
      <button v-if="store.error" class="link" type="button" @click="router.push('/impostazioni')">Vai a Impostazioni</button>
      <button class="generate" type="button" :disabled="!canGenerate" @click="store.generate()">
        {{ store.status === 'generating' ? 'Generazione…' : 'Genera bozza' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.brief { display: flex; flex-direction: column; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--text-2); }
.actions { display: flex; justify-content: flex-end; gap: 12px; }
</style>
```

- [ ] **Step 5: Crea `components/onboarding/ReviewStep.vue`**

```vue
<script setup lang="ts">
import { useOnboardingStore } from '../../stores/onboarding';
import PanelError from '../PanelError.vue';

defineOptions({ name: 'ReviewStep' });
const store = useOnboardingStore();
</script>

<template>
  <div v-if="store.draft" class="review">
    <h2>Rivedi e ritocca la bozza</h2>

    <section class="card">
      <label class="field">Nome <input v-model="store.draft.frame.name" type="text" /></label>
      <label class="field">Premessa <textarea v-model="store.draft.frame.premise" rows="2"></textarea></label>
      <label class="field">Tono <input v-model="store.draft.frame.tone" type="text" /></label>
      <label class="field">Luogo <input v-model="store.draft.frame.setting.place" type="text" /></label>
      <label class="field">Epoca <input v-model="store.draft.frame.setting.era" type="text" /></label>
      <label class="field">Scena d apertura <textarea v-model="store.draft.frame.openingScene" rows="2"></textarea></label>
      <label v-for="(_h, i) in store.draft.frame.hooks" :key="i" class="field">Hook
        <input v-model="store.draft.frame.hooks[i]" type="text" />
      </label>
    </section>

    <section v-for="(npc, i) in store.draft.keyNpcs" :key="npc.id" class="card">
      <input v-model="store.draft.keyNpcs[i].name" type="text" />
      <textarea v-model="store.draft.keyNpcs[i].description" rows="2"></textarea>
      <span class="chip">stat: da codice</span>
    </section>

    <section v-for="(place, i) in store.draft.keyPlaces" :key="place.id" class="card">
      <input v-model="store.draft.keyPlaces[i].name" type="text" />
      <textarea v-model="store.draft.keyPlaces[i].description" rows="2"></textarea>
    </section>

    <section v-for="(_f, i) in store.draft.initialFacts" :key="i" class="fact">
      <input v-model="store.draft.initialFacts[i].subject" type="text" />
      <input v-model="store.draft.initialFacts[i].predicate" type="text" />
      <input v-model="store.draft.initialFacts[i].object" type="text" />
    </section>

    <PanelError :error="store.error" />
    <div class="actions">
      <button type="button" @click="store.regenerate()">Rigenera</button>
      <button class="confirm" type="button" :disabled="store.status === 'seeding'" @click="store.confirm()">
        {{ store.status === 'seeding' ? 'Seeding…' : 'Conferma e inizia' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.review { display: flex; flex-direction: column; gap: 12px; }
.card { display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--line-2); border-radius: 10px; padding: 12px; }
.field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--text-2); }
.fact { display: flex; gap: 6px; }
.fact input { flex: 1; min-width: 0; }
.chip { font-size: 11px; color: var(--text-3); }
.actions { display: flex; justify-content: space-between; gap: 12px; }
</style>
```

- [ ] **Step 6: Crea `components/onboarding/OpeningStep.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useOnboardingStore } from '../../stores/onboarding';

defineOptions({ name: 'OpeningStep' });
const store = useOnboardingStore();
const router = useRouter();
const opening = computed<string>(() => store.opening ?? store.draft?.frame.openingScene ?? '');
const name = computed<string>(() => store.draft?.frame.name ?? 'La tua campagna');
</script>

<template>
  <div class="opening">
    <h2>{{ name }} e pronta</h2>
    <p class="narration">{{ opening }}</p>
    <div class="actions">
      <button class="enter" type="button" @click="router.push('/')">Entra nella campagna</button>
    </div>
  </div>
</template>

<style scoped>
.opening { display: flex; flex-direction: column; gap: 16px; }
.narration { font-family: var(--f-serif, serif); line-height: 1.7; color: var(--text); }
.actions { display: flex; justify-content: flex-end; }
</style>
```

- [ ] **Step 7: Registra la route in `router/index.ts`**

Aggiungi l'import ([:8-12](../../../app/desktop/src/renderer/src/router/index.ts:8)):

```ts
import OnboardingView from '../views/OnboardingView.vue';
```

Aggiungi la route all'array `routes` (in coda, [:19](../../../app/desktop/src/renderer/src/router/index.ts:19)):

```ts
  { path: '/nuova-campagna', name: 'onboarding', component: OnboardingView },
```

- [ ] **Step 8: Esegui i test e verifica che passino**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/views/OnboardingView.test.ts app/desktop/src/renderer/src/components/onboarding/BriefStep.test.ts app/desktop/src/renderer/src/components/onboarding/OpeningStep.test.ts`
Expected: PASS.

- [ ] **Step 9: Typecheck**

Run: `pnpm -r typecheck`
Expected: nessun errore (vue-tsc verifica i binding v-model contro il tipo `Draft`).

- [ ] **Step 10: Commit**

```bash
git status --short
git add app/desktop/src/renderer/src/views/OnboardingView.vue app/desktop/src/renderer/src/views/OnboardingView.test.ts app/desktop/src/renderer/src/components/onboarding/ app/desktop/src/renderer/src/router/index.ts
git commit -m "feat(renderer): OnboardingView + step brief/review/opening + route nuova-campagna"
```

Conteggio test atteso: ~840 (832 + ~8).

---

## Task 5: renderer — wiring del gate (runFirstRun + renderer.ts + SettingsView)

**Files:**
- Modify: `app/desktop/src/renderer/src/composables/use-first-run.ts` (gate onboarding)
- Modify: `app/desktop/src/renderer/src/composables/use-first-run.test.ts` (aggiorna + nuovi test)
- Modify: `app/desktop/src/renderer/src/renderer.ts:34` (SOLO la chiamata `runFirstRun`)
- Modify: `app/desktop/src/renderer/src/views/SettingsView.vue` (hop post-save)
- Modify: `app/desktop/src/renderer/src/views/SettingsView.test.ts` (aggiorna stub)

> **Self-test SAFE:** il gate vive in `runFirstRun` (chiamato SOLO nel ramo non-selftest, [renderer.ts:30-35](../../../app/desktop/src/renderer/src/renderer.ts:30)) e l'hop in `SettingsView.save()` (il self-test chiama `setProvider` via IPC diretta, NON monta SettingsView). Nessuno dei due scatta nel self-test → versione 8 invariata. NON introdurre un `router.beforeEach` globale.

- [ ] **Step 1: Aggiorna i test di `use-first-run` (falliranno)**

Riscrivi `app/desktop/src/renderer/src/composables/use-first-run.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import type { ReadModelPush, StatusResult } from '@loomn/shared';
import { routes } from '../router';
import { useProviderStatusStore } from '../stores/provider-status';
import { useReadModelStore } from '../stores/read-model';
import { runFirstRun } from './use-first-run';

function router() {
  return createRouter({ history: createMemoryHistory(), routes });
}
function stub(status: StatusResult, push: ReadModelPush): void {
  window.loomn = {
    getStatus: () => Promise.resolve(status),
    getReadModel: vi.fn(() => Promise.resolve(push)),
  } as unknown as typeof window.loomn;
}
const STATE_NO_CAMPAIGN = { version: 0, state: {} } as unknown as ReadModelPush;
const STATE_WITH_CAMPAIGN = { version: 1, state: { campaignFrame: { id: 'c1' } } } as unknown as ReadModelPush;

describe('runFirstRun', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('guida a Impostazioni quando nessun provider e configurato', async () => {
    stub({ ok: true, version: 0, safeStorageAvailable: true, providerConfigured: false }, STATE_NO_CAMPAIGN);
    const r = router();
    await r.push('/');
    await runFirstRun(r, useProviderStatusStore(), useReadModelStore());
    expect(r.currentRoute.value.name).toBe('settings');
  });

  it('guida a nuova-campagna quando provider ok ma nessuna campagna', async () => {
    stub({ ok: true, version: 0, safeStorageAvailable: true, providerConfigured: true, provider: { baseUrl: 'http://x/v1', model: 'm', hasApiKey: true } }, STATE_NO_CAMPAIGN);
    const r = router();
    await r.push('/');
    await runFirstRun(r, useProviderStatusStore(), useReadModelStore());
    expect(r.currentRoute.value.name).toBe('onboarding');
  });

  it('resta sul Gioco quando provider ok e campagna esiste', async () => {
    stub({ ok: true, version: 1, safeStorageAvailable: true, providerConfigured: true, provider: { baseUrl: 'http://x/v1', model: 'm', hasApiKey: true } }, STATE_WITH_CAMPAIGN);
    const r = router();
    await r.push('/');
    await runFirstRun(r, useProviderStatusStore(), useReadModelStore());
    expect(r.currentRoute.value.name).toBe('game');
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/composables/use-first-run.test.ts`
Expected: FAIL (`runFirstRun` accetta 2 argomenti, non 3; nessun redirect a onboarding).

- [ ] **Step 3: Estendi `runFirstRun`**

Riscrivi `app/desktop/src/renderer/src/composables/use-first-run.ts`:

```ts
import type { Router } from 'vue-router';
import { useProviderStatusStore } from '../stores/provider-status';
import { useReadModelStore } from '../stores/read-model';

/** Gate di boot (spec 10f §4.3 + D-01c): idrata lo status; se nessun provider e configurato guida a
 *  Impostazioni; altrimenti idrata il read-model e, se non esiste una campagna, guida all onboarding.
 *  NON e un hard gate ne un router guard globale: e una rotta one-shot al boot. */
export async function runFirstRun(
  router: Router,
  store: ReturnType<typeof useProviderStatusStore>,
  readModel: ReturnType<typeof useReadModelStore>,
): Promise<void> {
  await store.refresh();
  if (!store.providerConfigured) {
    await router.push('/impostazioni');
    return;
  }
  const push = await window.loomn.getReadModel();
  readModel.applyPush(push);
  if (!readModel.hasCampaign) await router.push('/nuova-campagna');
}
```

- [ ] **Step 4: Aggiorna la chiamata in `renderer.ts` (SOLO la riga 34)**

In `renderer.ts`, aggiungi l'import dello store read-model in cima (accanto agli altri import di store) e aggiorna SOLO la chiamata nel ramo `else` ([:34](../../../app/desktop/src/renderer/src/renderer.ts:34)). NON toccare il ramo `runSelfTest` ne altro.

Import (dopo [:8](../../../app/desktop/src/renderer/src/renderer.ts:8)): la riga `useReadModelStore` e gia importata ([:7](../../../app/desktop/src/renderer/src/renderer.ts:7)) — riusala.

Riga 34, da:
```ts
  void runFirstRun(router, useProviderStatusStore(pinia));
```
a:
```ts
  void runFirstRun(router, useProviderStatusStore(pinia), useReadModelStore(pinia));
```

- [ ] **Step 5: Esegui i test di use-first-run e verifica che passino**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/composables/use-first-run.test.ts`
Expected: PASS.

- [ ] **Step 6: Aggiorna `SettingsView.test.ts` (preparalo per l hop, fallira)**

Riscrivi `app/desktop/src/renderer/src/views/SettingsView.test.ts` per fornire un router e stubbare `getReadModel`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { setActivePinia, createPinia } from 'pinia';
import type { ReadModelPush, StatusResult } from '@loomn/shared';
import { routes } from '../router';
import SettingsView from './SettingsView.vue';

const PUSH_WITH_CAMPAIGN = { version: 1, state: { campaignFrame: { id: 'c1' } } } as unknown as ReadModelPush;
const PUSH_NO_CAMPAIGN = { version: 0, state: {} } as unknown as ReadModelPush;

function stub(
  status: StatusResult,
  opts: { setProvider?: ReturnType<typeof vi.fn>; push?: ReadModelPush } = {},
): { setProvider: ReturnType<typeof vi.fn> } {
  const setProvider = opts.setProvider ?? vi.fn(() => Promise.resolve({ ok: true as const }));
  window.loomn = {
    getStatus: () => Promise.resolve(status),
    setProvider,
    getReadModel: vi.fn(() => Promise.resolve(opts.push ?? PUSH_WITH_CAMPAIGN)),
  } as unknown as typeof window.loomn;
  return { setProvider };
}
function mountView() {
  const router = createRouter({ history: createMemoryHistory(), routes });
  return { w: mount(SettingsView, { global: { plugins: [router] } }), router };
}

describe('SettingsView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('pre-compila baseUrl e model dal read-back', async () => {
    stub({ ok: true, version: 1, safeStorageAvailable: true, providerConfigured: true, provider: { baseUrl: 'http://x/v1', model: 'm', hasApiKey: true } });
    const { w } = mountView();
    await flushPromises();
    const inputs = w.findAll('input[type="text"]');
    expect((inputs[0]!.element as HTMLInputElement).value).toBe('http://x/v1');
    expect((inputs[1]!.element as HTMLInputElement).value).toBe('m');
  });

  it('salvando con keyAction keep OMETTE apiKey nel payload', async () => {
    const { setProvider } = stub({ ok: true, version: 1, safeStorageAvailable: true, providerConfigured: true, provider: { baseUrl: 'http://x/v1', model: 'm', hasApiKey: true } });
    const { w } = mountView();
    await flushPromises();
    await w.find('.loomn-btn').trigger('click');
    await flushPromises();
    expect(setProvider).toHaveBeenCalledWith({ baseUrl: 'http://x/v1', model: 'm' });
  });

  it('dopo un salvataggio ok senza campagna naviga a nuova-campagna', async () => {
    stub({ ok: true, version: 0, safeStorageAvailable: true, providerConfigured: false }, { push: PUSH_NO_CAMPAIGN });
    const { w, router } = mountView();
    await flushPromises();
    // baseUrl e model sono richiesti per abilitare Salva
    const inputs = w.findAll('input[type="text"]');
    await inputs[0]!.setValue('http://x/v1');
    await inputs[1]!.setValue('m');
    await w.find('.loomn-btn').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('onboarding');
  });
});
```

Run: `pnpm exec vitest run app/desktop/src/renderer/src/views/SettingsView.test.ts`
Expected: FAIL sul terzo test (l'hop non esiste ancora).

- [ ] **Step 7: Aggiungi l hop in `SettingsView.vue`**

In `SettingsView.vue` aggiungi gli import ([:5-6](../../../app/desktop/src/renderer/src/views/SettingsView.vue:5)):

```ts
import { useRouter } from 'vue-router';
import { useReadModelStore } from '../stores/read-model';
```

Dopo `const status = useProviderStatusStore();` ([:8](../../../app/desktop/src/renderer/src/views/SettingsView.vue:8)):

```ts
const router = useRouter();
const readModel = useReadModelStore();
```

Nel blocco `if (res.ok)` di `save()` ([:41-43](../../../app/desktop/src/renderer/src/views/SettingsView.vue:41)), dopo `feedback.value = { kind: 'ok', msg: 'Provider salvato.' };` aggiungi:

```ts
      // D-01c: provider appena configurato e nessuna campagna -> porta all onboarding.
      const push = await window.loomn.getReadModel();
      readModel.applyPush(push);
      if (!readModel.hasCampaign) await router.push('/nuova-campagna');
```

- [ ] **Step 8: Esegui i test di SettingsView e verifica che passino**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/views/SettingsView.test.ts`
Expected: PASS (3 test).

- [ ] **Step 9: Typecheck + suite completa**

Run: `pnpm -r typecheck`
Expected: nessun errore.
Run: `pnpm test`
Expected: ~844 verdi.

- [ ] **Step 10: Grep anti-apostrofo**

Run: `pnpm exec vitest --version` (no-op di sicurezza) e poi verifica i test nuovi/modificati:
Run (Bash): `grep -rnE "(it|describe)\('[^']*'[A-Za-zàèéìòù]" app/desktop/src/renderer/src/ packages/shared/src/ || echo "no match"`
Expected: `no match`.

- [ ] **Step 11: Commit**

```bash
git status --short
git add app/desktop/src/renderer/src/composables/use-first-run.ts app/desktop/src/renderer/src/composables/use-first-run.test.ts app/desktop/src/renderer/src/renderer.ts app/desktop/src/renderer/src/views/SettingsView.vue app/desktop/src/renderer/src/views/SettingsView.test.ts
git commit -m "feat(renderer): gate di boot onboarding in runFirstRun + hop post-save in Impostazioni"
```

Conteggio test atteso: ~844 (840 + 1 gate onboarding + 1 settings hop; i 2 test esistenti di use-first-run aggiornati).

---

## Task 6: gate Electron 2 fasi

**Files:** nessuna modifica di codice. Verifica che l'app reale bootta/persista/ricarichi coi nuovi canali e che il self-test sia INVARIATO.

> **Atteso:** versione persistita **8 invariata** (la generazione e fuori dal gate; il gate di onboarding vive in `runFirstRun`, che il self-test bypassa). Se per qualunque ragione il self-test fallisse per via di un redirect, NON far seminare il self-test: verifica che il gate viva in `runFirstRun` e non in un guard globale (regressione di scope).

- [ ] **Step 1: Esegui il gate 2 fasi**

Run: `pnpm gate:selftest`
Expected: entrambe le fasi `[MAIN] VERDICT: PASS`, exit 0. Il gate flippa l'ABI a Electron e la ripristina a Node in `finally` (`rebuild:node`).

- [ ] **Step 2: Se il gate lascia l ABI su Electron (raro), ripristina**

Se un successivo `pnpm test` desse `NODE_MODULE_VERSION 146 ... requires 137`:
Run: `pnpm rebuild:node`

- [ ] **Step 3: Verifica finale aggregata**

Run: `pnpm verify`
Expected: `pnpm -r typecheck` pulito (6 progetti) + `pnpm test` ~844 verdi.

- [ ] **Step 4: (nessun commit di codice)** Il gate non modifica file di prodotto. Se il self-test fosse stato toccato, sarebbe un errore di scope — annullalo.

---

## Self-Review (eseguita su questo piano contro lo spec)

**1. Copertura spec:**
- §5 contratto IPC (campaignSeedSchema estratto, campaignBriefSchema, 2 canali, canale dedicato seed-campaign) → T1 + T2. ✓
- §6 renderer (route, gate in runFirstRun, useOnboardingStore, componenti, hasCampaign) → T3 (stato) + T4 (UI/route) + T5 (gate/wiring). ✓
- §7 UI (brief, review/edit, apertura con fallback) → T4. ✓ (divergenza dichiarata: genres-array non editabile in questa slice).
- §8 errori (provider non configurato + CTA Impostazioni, StructuredOutputError = error nello store, conferma fallita) → T2 (pre-check isConfigured) + T3 (store error path) + T4 (PanelError + link). ✓
- §9 testing per layer → T1 (shared), T3/T4/T5 (renderer); main = typecheck+gate (convenzione repo, dichiarato in T2). ✓
- §10 gate Electron, self-test invariato → T6 + nota self-test-safe in T5. ✓
- §11 drift-guard (canali allineati insieme; typecheck per task) → T1 schemi+bridge, T2 preload+main insieme. ✓

**2. Placeholder scan:** nessun TBD/TODO; ogni step ha codice/comando concreto. ✓

**3. Type consistency:** `campaignSeedSchema`/`campaignBriefSchema` (T1) usati identici in T2/T3; `GenerateSeedResult`/`SeedCampaignResult`/`GenerateSeedRequest`/`SeedCampaignRequest` coerenti fra ipc.ts, preload, main, store; `Draft = Extract<GenerateSeedResult,{ok:true}>['seed']`; `hasCampaign`/`runFirstRun(3 arg)` coerenti fra T3/T5; route name `'onboarding'` coerente fra T4 (registrazione) e T5 (asserzioni gate). ✓

---

## Execution Handoff

Piano completo e salvato in `docs/superpowers/plans/2026-06-23-d01c-onboarding-plan.md`. Flusso §4 dell'HANDOFF: commit del doc su main → branch `feat/d01c-onboarding` → subagent-driven (per task: implementer → spec-review → code-quality-review; final review opus) → `finishing-a-development-branch` (merge ff in main) → `pnpm test` full → `pnpm gate:selftest` PASS → `git push origin main` → cancella branch → aggiorna HANDOFF + memoria.
