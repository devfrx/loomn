# Piano 10f — Impostazioni + first-run + creazione PG + controlli GM (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consegnare le superfici UI non-narrative di Loomn — Impostazioni provider (con read-back + UX chiave tri-stato), first-run guidato, creazione PG e controlli GM/manuali — tutte legate al backend esistente e ai form data-driven dal vocabolario di `get-ruleset`.

**Architecture:** Estensione IPC sottile additiva (stile Piano 0): `get-status` espone anche `provider?:{baseUrl,model,hasApiKey}` (mai la chiave); `saveProviderConfig` diventa tri-stato (mantieni/rimuovi/sostituisci). Renderer read-side TDD: store reattivi (`provider-status`, `ruleset`), helper puri (`provider-form`, `actor-form`, `gm-commands`, `use-first-run`) testati, viste/componenti sottili sul design system "strumento notturno" di 10a. La UI muta lo stato solo via `dispatch`; il provider gate solo l azione AI (il turno, fornito a 10b come segnale).

**Tech Stack:** TypeScript strict, Zod (shared, foglia), Electron main (settings/safeStorage), Vue 3 + Pinia + Vue Router + Reka UI (renderer), Vitest + Vue Test Utils (jsdom). Self-test `LOOMN_SELFTEST` per il gate Electron.

**Autorità di design:** `docs/superpowers/specs/2026-06-18-piano10f-impostazioni-firstrun-gm-design.md`.

---

## File Structure

**Backend (additivo, `@loomn/shared` resta foglia):**
- `packages/shared/src/ipc.ts` — *modifica*: `statusResultSchema` += `provider?:{baseUrl,model,hasApiKey}`.
- `packages/shared/src/ipc.test.ts` — *modifica*: test del read-back.
- `app/desktop/src/main/provider-config.ts` — *nuovo, PURO (no electron import)*: `resolveStoredKey` (tri-stato). Testabile su jsdom.
- `app/desktop/src/main/provider-config.test.ts` — *nuovo*.
- `app/desktop/src/main/settings.ts` — *modifica*: `loadProviderMeta` (read-back senza decifrare) + `saveProviderConfig` tri-stato (usa `resolveStoredKey`).
- `app/desktop/src/main/index.ts` — *modifica*: handler `get-status` (read-back) + `set-provider` (riconfigura da config effettiva).
- `app/desktop/src/renderer/src/renderer.ts` — *modifica*: self-test esteso (read-back + comando GM) + bootstrap first-run.

**Renderer (solo `app/desktop/src/renderer/src/**`; importa solo `@loomn/shared`):**
- `stores/provider-status.ts` (+test) — `useProviderStatusStore`: `get-status` reattivo, `canRunTurn`.
- `stores/ruleset.ts` (+test) — `useRulesetStore`: `get-ruleset` fetch-once.
- `lib/provider-form.ts` (+test) — `buildProviderPayload` (tri-stato chiave).
- `lib/actor-form.ts` (+test) — `buildActorId`, `buildActor`.
- `lib/gm-commands.ts` (+test) — `GM_COMMANDS`, `isGmCommandEnabled`.
- `composables/use-first-run.ts` (+test) — `runFirstRun` (redirect one-shot).
- `components/FirstRunBanner.vue` (+test) — banner globale dismissibile.
- `components/GmConsole.vue` (+test) — slide-over Regia (6 Command).
- `views/SettingsView.vue` (+test) — *riscrittura*: form provider.
- `views/CompanyView.vue` (+test) — *modifica*: roster + creazione PG.
- `App.vue` — *modifica*: include `FirstRunBanner` + trigger Regia in topbar.

**Disciplina di scope (CRITICO, house rule §5.1):** ogni task tocca SOLO i file elencati. MAI `package.json`/`tsconfig*`/`vitest.config.ts`/`vitest.workspace.ts`/`electron.vite.config.ts`. `git status --short` prima di ogni commit. La config test del renderer esiste già (10a) → non si tocca.

**Verifica per-task:** `pnpm exec vitest run <file>` (singolo file, dalla ROOT) + `pnpm -r typecheck`. Il **gate Electron** (`LOOMN_SELFTEST`, 2 fasi `VERDICT: PASS`) è la **verifica finale del branch** (richiede `rebuild:electron`/`rebuild:node` serializzati — vedi §Execution). I conteggi test sono indicativi (il reviewer verifica l attuale). Base: **533 test** (494 packages + 39 renderer).

**Nota apostrofo (house rule §5.4):** nelle stringhe `it('...')`/`describe('...')`/`check(...)` in apici singoli NON usare apostrofi (`l'`, `un'`, `dell'`, `c'è`). Usa `l attore`, `c e`, `senza chiave`. `è/é` vanno bene.

---

### Task 1: Read-back provider nello schema `get-status` (shared, foglia)

**Files:**
- Modify: `packages/shared/src/ipc.ts` (`statusResultSchema`)
- Test: `packages/shared/src/ipc.test.ts`

- [ ] **Step 1: Scrivi i test che falliscono**

In `packages/shared/src/ipc.test.ts`, dentro il `describe('schemi run-turn / provider / reflect / status', ...)`, AGGIUNGI dopo il test `statusResult richiede i tre flag diagnostici`:

```ts
  it('statusResult accetta il read-back provider opzionale (baseUrl/model/hasApiKey)', () => {
    const withProvider = statusResultSchema.parse({
      version: 2,
      safeStorageAvailable: true,
      providerConfigured: true,
      provider: { baseUrl: 'http://localhost:1234/v1', model: 'local', hasApiKey: true },
    });
    expect(withProvider.provider).toEqual({
      baseUrl: 'http://localhost:1234/v1',
      model: 'local',
      hasApiKey: true,
    });
  });

  it('statusResult resta valido senza provider (nessuna config persistita)', () => {
    const noProvider = statusResultSchema.parse({
      version: 0,
      safeStorageAvailable: true,
      providerConfigured: false,
    });
    expect(noProvider.provider).toBeUndefined();
  });

  it('statusResult con provider rifiuta hasApiKey mancante', () => {
    expect(() =>
      statusResultSchema.parse({
        version: 0,
        safeStorageAvailable: true,
        providerConfigured: true,
        provider: { baseUrl: 'http://x/v1', model: 'm' },
      }),
    ).toThrow();
  });
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `pnpm exec vitest run packages/shared/src/ipc.test.ts`
Expected: FAIL — i due `parse` con `provider` passano comunque (campo ignorato) ma `expect(...provider).toEqual(...)` fallisce perché `provider` non è nello schema (viene strippato).

- [ ] **Step 3: Estendi lo schema**

In `packages/shared/src/ipc.ts`, sostituisci `statusResultSchema`:

```ts
// --- getStatus (diagnostica + read-back config provider) ---
/** provider e il read-back della config persistita per pre-compilare Impostazioni (10f): baseUrl/model
 *  + hasApiKey (la chiave non attraversa MAI l IPC). Opzionale-assente quando nessun provider e salvato. */
export const statusResultSchema = z.object({
  version: z.number().int().nonnegative(),
  safeStorageAvailable: z.boolean(),
  providerConfigured: z.boolean(),
  provider: z
    .object({ baseUrl: z.string(), model: z.string(), hasApiKey: z.boolean() })
    .optional(),
});
export type StatusResult = z.infer<typeof statusResultSchema>;
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `pnpm exec vitest run packages/shared/src/ipc.test.ts`
Expected: PASS (tutti, +3 nuovi).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm -r typecheck`
Expected: clean (6 progetti).

```bash
git add packages/shared/src/ipc.ts packages/shared/src/ipc.test.ts
git commit -m "feat(shared): get-status espone il read-back provider (baseUrl/model/hasApiKey, mai la chiave)"
```

**Test attesi (cumulativi):** ~496 packages + 39 renderer = ~535.

---

### Task 2: Tri-stato chiave + read-back nel main + self-test

**Files:**
- Create: `app/desktop/src/main/provider-config.ts`
- Test: `app/desktop/src/main/provider-config.test.ts`
- Modify: `app/desktop/src/main/settings.ts`
- Modify: `app/desktop/src/main/index.ts`
- Modify: `app/desktop/src/renderer/src/renderer.ts` (self-test)

- [ ] **Step 1: Scrivi il test puro che fallisce**

Create `app/desktop/src/main/provider-config.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { resolveStoredKey } from './provider-config';

describe('resolveStoredKey (tri-stato della chiave provider)', () => {
  const encrypt = (plain: string): string => `ENC(${plain})`;

  it('apiKey undefined mantiene il ciphertext esistente', () => {
    expect(resolveStoredKey(undefined, 'PRIOR', encrypt)).toBe('PRIOR');
  });

  it('apiKey undefined senza ciphertext precedente resta senza chiave', () => {
    expect(resolveStoredKey(undefined, undefined, encrypt)).toBeUndefined();
  });

  it('apiKey stringa vuota rimuove la chiave esistente', () => {
    expect(resolveStoredKey('', 'PRIOR', encrypt)).toBeUndefined();
  });

  it('apiKey non vuota sostituisce cifrando', () => {
    expect(resolveStoredKey('sk-new', 'PRIOR', encrypt)).toBe('ENC(sk-new)');
  });

  it('non cifra quando la chiave va mantenuta o rimossa', () => {
    const spy = vi.fn((plain: string) => `ENC(${plain})`);
    resolveStoredKey(undefined, 'PRIOR', spy);
    resolveStoredKey('', 'PRIOR', spy);
    expect(spy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verifica che fallisca**

Run: `pnpm exec vitest run app/desktop/src/main/provider-config.test.ts`
Expected: FAIL — `Cannot find module './provider-config'`.

- [ ] **Step 3: Implementa il modulo puro**

Create `app/desktop/src/main/provider-config.ts`:

```ts
// Logica PURA della config provider (nessun import electron): testabile su ABI Node/jsdom. La
// cifratura (safeStorage) e iniettata, cosi settings.ts la cabla e questo modulo resta verificabile.

/** Tri-stato della chiave nel salvataggio (anti-footgun, spec 10f §2.4): apiKey undefined (campo
 *  lasciato vuoto) = MANTIENI il ciphertext esistente; '' (azione esplicita rimuovi) = RIMUOVI;
 *  stringa non vuota = SOSTITUISCI (cifra). Ritorna il ciphertext da persistere, o undefined. */
export function resolveStoredKey(
  apiKey: string | undefined,
  priorEnc: string | undefined,
  encrypt: (plain: string) => string,
): string | undefined {
  if (apiKey === undefined) return priorEnc;
  if (apiKey === '') return undefined;
  return encrypt(apiKey);
}
```

- [ ] **Step 4: Verifica che passi**

Run: `pnpm exec vitest run app/desktop/src/main/provider-config.test.ts`
Expected: PASS (+5).

- [ ] **Step 5: Cabla `settings.ts` (read-back + tri-stato)**

In `app/desktop/src/main/settings.ts`: aggiungi l import in testa e sostituisci `saveProviderConfig`, poi aggiungi `ProviderMeta`/`loadProviderMeta`. Lascia `loadProviderConfig` invariato.

Import (aggiungi sotto gli import esistenti):
```ts
import { resolveStoredKey } from './provider-config';
```

Sostituisci `saveProviderConfig`:
```ts
/** Salva la config provider. La chiave e tri-stato (resolveStoredKey): campo vuoto -> mantieni la
 *  esistente; '' -> rimuovi; stringa -> cifra e sostituisci (safeStorage). */
export function saveProviderConfig(config: ProviderConfig): void {
  if (config.apiKey !== undefined && config.apiKey !== '' && !safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage non disponibile: impossibile cifrare la chiave API');
  }
  const prior = readStored(settingsPath());
  const apiKeyEnc = resolveStoredKey(config.apiKey, prior?.apiKeyEnc, (plain) =>
    safeStorage.encryptString(plain).toString('base64'),
  );
  const stored: StoredSettings = { baseUrl: config.baseUrl, model: config.model };
  if (apiKeyEnc !== undefined) stored.apiKeyEnc = apiKeyEnc;
  writeFileSync(settingsPath(), JSON.stringify(stored), 'utf8');
}
```

Aggiungi in fondo al file:
```ts
/** Metadata della config persistita SENZA decifrare la chiave (hasApiKey = ciphertext presente).
 *  Usato da get-status per il read-back: la chiave non viene mai decifrata ne esposta. */
export interface ProviderMeta {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
}

export function loadProviderMeta(): ProviderMeta | undefined {
  const path = settingsPath();
  if (!existsSync(path)) return undefined;
  const stored = readStored(path);
  if (stored === undefined) return undefined;
  return { baseUrl: stored.baseUrl, model: stored.model, hasApiKey: stored.apiKeyEnc !== undefined };
}
```

- [ ] **Step 6: Cabla gli handler in `index.ts`**

In `app/desktop/src/main/index.ts`:

(a) aggiorna l import da `./settings`:
```ts
import { loadProviderConfig, loadProviderMeta, saveProviderConfig } from './settings';
```

(b) sostituisci l handler `set-provider` (riconfigura l holder dalla config EFFETTIVA, cosi la chiave mantenuta entra nel provider):
```ts
  ipcMain.handle(IPC_CHANNELS.setProvider, async (_e, raw): Promise<ProviderResult> => {
    const parsed = providerConfigSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: `Config provider non valida: ${parsed.error.message}` };
    try {
      saveProviderConfig(parsed.data);
      const effective = loadProviderConfig(); // config unita: include la chiave mantenuta
      if (effective === undefined) return { ok: false, error: 'Config provider non leggibile dopo il salvataggio' };
      holder.configure(createLanguageProvider(toLanguageProviderConfig(effective)));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });
```

(c) sostituisci l handler `get-status` (aggiunge il read-back; `StatusResult` impone la forma = drift guard):
```ts
  ipcMain.handle(IPC_CHANNELS.getStatus, (): StatusResult => {
    const meta = loadProviderMeta();
    return {
      version: service.getReadModel().version,
      safeStorageAvailable: safeStorage.isEncryptionAvailable(),
      providerConfigured: holder.isConfigured(),
      ...(meta !== undefined ? { provider: meta } : {}),
    };
  });
```

- [ ] **Step 7: Estendi il self-test (read-back + comando GM)**

In `app/desktop/src/renderer/src/renderer.ts`, nel ramo `if (phase === '1')`:

(a) dopo `check(s0.safeStorageAvailable, 'safeStorage disponibile');` aggiungi:
```ts
      check(s0.provider === undefined, 'nessun provider persistito a DB fresco');
```

(b) sostituisci il blocco finale di fase 1 (da `const sp = await window.loomn.setProvider({...})` fino a `check(s1.providerConfigured, ...)`) con:
```ts
      const sp = await window.loomn.setProvider({
        baseUrl: 'http://localhost:1234/v1',
        model: 'local',
        apiKey: 'sk-selftest',
      });
      check(sp.ok, 'set-provider ok (chiave cifrata con safeStorage)');

      const s1 = await window.loomn.getStatus();
      check(s1.providerConfigured, 'provider configurato dopo set-provider');
      check(
        s1.provider?.baseUrl === 'http://localhost:1234/v1' &&
          s1.provider?.model === 'local' &&
          s1.provider?.hasApiKey === true,
        'get-status espone il read-back provider dopo set-provider',
      );

      // Ri-salva cambiando solo il model, campo chiave OMESSO -> la chiave deve restare (tri-stato).
      const sp2 = await window.loomn.setProvider({ baseUrl: 'http://localhost:1234/v1', model: 'local-2' });
      check(sp2.ok, 'set-provider ri-salva senza chiave');
      const s2 = await window.loomn.getStatus();
      check(s2.provider?.model === 'local-2' && s2.provider?.hasApiKey === true, 'chiave mantenuta ri-salvando senza chiave');

      // Comando GM via IPC (EnterPhase, non-combat): la fase passa da exploration a dialogue.
      const gm = await window.loomn.dispatch({ type: 'EnterPhase', to: 'dialogue' });
      check(gm.ok && gm.events.some((e) => e.type === 'PhaseChanged'), 'comando GM EnterPhase cambia fase');
```

(c) nel ramo `else` (fase 2), dopo `check(s0.providerConfigured, ...)` aggiungi:
```ts
      check(s0.provider?.hasApiKey === true, 'read-back provider con chiave persistito dopo riavvio');
```

> Nota: la fase 2 verifica `s0.version === 1` PERSISTITA. La fase 1 ora aggiunge un dispatch (EnterPhase) DOPO l AddActor → al riavvio la versione persistita sara 2, non 1. **Aggiorna** in fase 2 `check(s0.version === 1, ...)` a `check(s0.version === 2, 'versione 2 PERSISTITA dopo il riavvio (durabilita su disco)')`. Lascia invariati i check su `goblin` (l attore sopravvive).

- [ ] **Step 8: Typecheck + verifica i test puri + commit**

Run: `pnpm -r typecheck`
Expected: clean.
Run: `pnpm exec vitest run app/desktop/src/main/provider-config.test.ts`
Expected: PASS.

> Il comportamento electron (settings/handler/self-test) è verificato dal **gate finale** del branch; qui basta typecheck + test puro.

```bash
git add app/desktop/src/main/provider-config.ts app/desktop/src/main/provider-config.test.ts app/desktop/src/main/settings.ts app/desktop/src/main/index.ts app/desktop/src/renderer/src/renderer.ts
git commit -m "feat(desktop): read-back provider in get-status + chiave tri-stato (mantieni/rimuovi/sostituisci) + self-test esteso"
```

**Test attesi (cumulativi):** ~496 packages + ~44 renderer = ~540.

---

### Task 3: Store reattivi `provider-status` + `ruleset`

**Files:**
- Create: `app/desktop/src/renderer/src/stores/provider-status.ts` (+test)
- Create: `app/desktop/src/renderer/src/stores/ruleset.ts` (+test)

- [ ] **Step 1: Test `provider-status` che fallisce**

Create `app/desktop/src/renderer/src/stores/provider-status.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { StatusResult } from '@loomn/shared';
import { useProviderStatusStore } from './provider-status';

function stubStatus(status: StatusResult): void {
  window.loomn = { getStatus: () => Promise.resolve(status) } as unknown as typeof window.loomn;
}

describe('useProviderStatusStore', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('parte non caricato e non configurato', () => {
    const s = useProviderStatusStore();
    expect(s.loaded).toBe(false);
    expect(s.providerConfigured).toBe(false);
    expect(s.canRunTurn).toBe(false);
    expect(s.provider).toBeNull();
  });

  it('refresh popola lo status e il read-back provider', async () => {
    stubStatus({
      version: 1,
      safeStorageAvailable: true,
      providerConfigured: true,
      provider: { baseUrl: 'http://x/v1', model: 'm', hasApiKey: true },
    });
    const s = useProviderStatusStore();
    await s.refresh();
    expect(s.loaded).toBe(true);
    expect(s.providerConfigured).toBe(true);
    expect(s.canRunTurn).toBe(true);
    expect(s.provider?.model).toBe('m');
    expect(s.safeStorageAvailable).toBe(true);
  });

  it('canRunTurn e false quando il provider non e configurato', async () => {
    stubStatus({ version: 0, safeStorageAvailable: true, providerConfigured: false });
    const s = useProviderStatusStore();
    await s.refresh();
    expect(s.canRunTurn).toBe(false);
    expect(s.provider).toBeNull();
  });
});
```

- [ ] **Step 2: Verifica fallimento**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/stores/provider-status.test.ts`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Implementa lo store**

Create `app/desktop/src/renderer/src/stores/provider-status.ts`:

```ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { StatusResult } from '@loomn/shared';

/** Stato del provider AI (read-side, 10f): get-status reattivo. Unica sorgente per gating first-run,
 *  pre-fill di Impostazioni e il segnale canRunTurn (il turno, AI-dipendente, lo consumera 10b). */
export const useProviderStatusStore = defineStore('providerStatus', () => {
  const status = ref<StatusResult | null>(null);

  /** Rilegge get-status (al boot e dopo ogni set-provider ok). */
  async function refresh(): Promise<void> {
    status.value = await window.loomn.getStatus();
  }

  const loaded = computed<boolean>(() => status.value !== null);
  const providerConfigured = computed<boolean>(() => status.value?.providerConfigured ?? false);
  const provider = computed(() => status.value?.provider ?? null);
  const safeStorageAvailable = computed<boolean>(() => status.value?.safeStorageAvailable ?? false);
  const canRunTurn = computed<boolean>(() => providerConfigured.value);

  return { refresh, loaded, providerConfigured, provider, safeStorageAvailable, canRunTurn };
});
```

- [ ] **Step 4: Verifica passaggio**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/stores/provider-status.test.ts`
Expected: PASS (+3).

- [ ] **Step 5: Test `ruleset` che fallisce**

Create `app/desktop/src/renderer/src/stores/ruleset.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { RulesetResult } from '@loomn/shared';
import { useRulesetStore } from './ruleset';

const OK: Extract<RulesetResult, { ok: true }> = {
  ok: true,
  vocabulary: {
    attributes: ['forza', 'destrezza'],
    skills: ['atletica'],
    resources: ['hp', 'mana'],
    defenses: ['difesa'],
    defaultResources: { hp: { current: 10, max: 10 } },
  },
  difficulties: ['moderate'],
  softPhases: ['exploration', 'dialogue', 'downtime'],
  questOutcomes: ['completed', 'failed'],
  directions: ['restore', 'drain'],
  commandPhaseRules: { combatOnly: ['Attack', 'EndEncounter'], nonCombatOnly: ['StartEncounter', 'EnterPhase'] },
};

describe('useRulesetStore', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('load popola il vocabolario e gli enum', async () => {
    window.loomn = { getRuleset: () => Promise.resolve(OK) } as unknown as typeof window.loomn;
    const s = useRulesetStore();
    await s.load();
    expect(s.loaded).toBe(true);
    expect(s.vocabulary?.attributes).toContain('forza');
    expect(s.difficulties).toEqual(['moderate']);
    expect(s.commandPhaseRules.combatOnly).toContain('EndEncounter');
  });

  it('load e fetch-once (non rilegge se gia caricato)', async () => {
    const spy = vi.fn(() => Promise.resolve(OK));
    window.loomn = { getRuleset: spy } as unknown as typeof window.loomn;
    const s = useRulesetStore();
    await s.load();
    await s.load();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('cattura l errore di un esito non ok', async () => {
    window.loomn = { getRuleset: () => Promise.resolve({ ok: false, error: 'boom' }) } as unknown as typeof window.loomn;
    const s = useRulesetStore();
    await s.load();
    expect(s.loaded).toBe(false);
    expect(s.error).toBe('boom');
  });
});
```

- [ ] **Step 6: Verifica fallimento**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/stores/ruleset.test.ts`
Expected: FAIL — modulo inesistente.

- [ ] **Step 7: Implementa lo store**

Create `app/desktop/src/renderer/src/stores/ruleset.ts`:

```ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { RulesetResult } from '@loomn/shared';

type RulesetOk = Extract<RulesetResult, { ok: true }>;

/** Vocabolario di gioco + enum + regole di fase (read-side 10g): fetch-once (statico per sessione).
 *  Consumato dai form data-driven (creazione PG, Regia GM). */
export const useRulesetStore = defineStore('ruleset', () => {
  const data = ref<RulesetOk | null>(null);
  const error = ref<string | null>(null);

  async function load(): Promise<void> {
    if (data.value !== null) return; // fetch-once
    const res = await window.loomn.getRuleset();
    if (res.ok) {
      data.value = res;
      error.value = null;
    } else {
      error.value = res.error;
    }
  }

  const loaded = computed<boolean>(() => data.value !== null);
  const vocabulary = computed(() => data.value?.vocabulary ?? null);
  const difficulties = computed<string[]>(() => data.value?.difficulties ?? []);
  const softPhases = computed<string[]>(() => data.value?.softPhases ?? []);
  const questOutcomes = computed<string[]>(() => data.value?.questOutcomes ?? []);
  const directions = computed<string[]>(() => data.value?.directions ?? []);
  const commandPhaseRules = computed(() => data.value?.commandPhaseRules ?? { combatOnly: [], nonCombatOnly: [] });

  return { load, loaded, error, vocabulary, difficulties, softPhases, questOutcomes, directions, commandPhaseRules };
});
```

- [ ] **Step 8: Verifica + typecheck + commit**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/stores/ruleset.test.ts`
Expected: PASS (+3).
Run: `pnpm -r typecheck`
Expected: clean.

```bash
git add app/desktop/src/renderer/src/stores/provider-status.ts app/desktop/src/renderer/src/stores/provider-status.test.ts app/desktop/src/renderer/src/stores/ruleset.ts app/desktop/src/renderer/src/stores/ruleset.test.ts
git commit -m "feat(renderer): store reattivi provider-status (canRunTurn) e ruleset (fetch-once)"
```

**Test attesi (cumulativi):** ~496 packages + ~50 renderer = ~546.

---

### Task 4: Impostazioni — form provider (read-back prefill + chiave tri-stato)

**Files:**
- Create: `app/desktop/src/renderer/src/lib/provider-form.ts` (+test)
- Modify (riscrittura): `app/desktop/src/renderer/src/views/SettingsView.vue` (+test)

- [ ] **Step 1: Test `provider-form` che fallisce**

Create `app/desktop/src/renderer/src/lib/provider-form.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildProviderPayload } from './provider-form';

describe('buildProviderPayload (tri-stato chiave per set-provider)', () => {
  it('keep OMETTE apiKey (il main mantiene la chiave esistente)', () => {
    const p = buildProviderPayload({ baseUrl: ' http://x/v1 ', model: ' m ', keyAction: 'keep', keyInput: '' });
    expect(p).toEqual({ baseUrl: 'http://x/v1', model: 'm' });
    expect('apiKey' in p).toBe(false);
  });

  it('set passa la chiave digitata', () => {
    const p = buildProviderPayload({ baseUrl: 'http://x/v1', model: 'm', keyAction: 'set', keyInput: 'sk-123' });
    expect(p).toEqual({ baseUrl: 'http://x/v1', model: 'm', apiKey: 'sk-123' });
  });

  it('remove invia apiKey vuota (il main cancella)', () => {
    const p = buildProviderPayload({ baseUrl: 'http://x/v1', model: 'm', keyAction: 'remove', keyInput: 'ignorata' });
    expect(p).toEqual({ baseUrl: 'http://x/v1', model: 'm', apiKey: '' });
  });
});
```

- [ ] **Step 2: Verifica fallimento**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/lib/provider-form.test.ts`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Implementa l helper**

Create `app/desktop/src/renderer/src/lib/provider-form.ts`:

```ts
import type { ProviderConfig } from '@loomn/shared';

/** Stato del form provider. keyAction modella la UX tri-stato della chiave (spec 10f §4.2):
 *  keep = mantieni la chiave esistente, set = sostituisci con keyInput, remove = cancella. */
export interface ProviderFormState {
  baseUrl: string;
  model: string;
  keyAction: 'keep' | 'set' | 'remove';
  keyInput: string;
}

/** Costruisce il payload set-provider applicando la semantica tri-stato: keep -> apiKey OMESSO;
 *  set -> apiKey = keyInput; remove -> apiKey = '' (il main, resolveStoredKey, interpreta). */
export function buildProviderPayload(form: ProviderFormState): ProviderConfig {
  const base = { baseUrl: form.baseUrl.trim(), model: form.model.trim() };
  if (form.keyAction === 'set') return { ...base, apiKey: form.keyInput };
  if (form.keyAction === 'remove') return { ...base, apiKey: '' };
  return base;
}
```

- [ ] **Step 4: Verifica passaggio**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/lib/provider-form.test.ts`
Expected: PASS (+3).

- [ ] **Step 5: Riscrivi `SettingsView.vue`**

Replace `app/desktop/src/renderer/src/views/SettingsView.vue`:

```vue
<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import LoomnPanel from '../components/LoomnPanel.vue';
import LoomnButton from '../components/LoomnButton.vue';
import { useProviderStatusStore } from '../stores/provider-status';
import { buildProviderPayload, type ProviderFormState } from '../lib/provider-form';

const status = useProviderStatusStore();

const form = reactive<ProviderFormState>({ baseUrl: '', model: '', keyAction: 'keep', keyInput: '' });
const feedback = ref<{ kind: 'ok' | 'error'; msg: string } | null>(null);
const saving = ref(false);

const hasApiKey = computed<boolean>(() => status.provider?.hasApiKey ?? false);

/** Pre-compila il form dal read-back; keyAction default = keep se c e una chiave, altrimenti set. */
function hydrateFromStatus(): void {
  form.baseUrl = status.provider?.baseUrl ?? '';
  form.model = status.provider?.model ?? '';
  form.keyAction = hasApiKey.value ? 'keep' : 'set';
  form.keyInput = '';
}

onMounted(async () => {
  if (!status.loaded) await status.refresh();
  hydrateFromStatus();
});
watch(() => status.provider, hydrateFromStatus);

const canSave = computed<boolean>(
  () => form.baseUrl.trim() !== '' && form.model.trim() !== '' && !(form.keyAction === 'set' && form.keyInput === '' && !hasApiKey.value && false),
);

async function save(): Promise<void> {
  feedback.value = null;
  saving.value = true;
  try {
    const res = await window.loomn.setProvider(buildProviderPayload(form));
    if (res.ok) {
      await status.refresh();
      feedback.value = { kind: 'ok', msg: 'Provider salvato.' };
    } else {
      feedback.value = { kind: 'error', msg: res.error };
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <main class="route-view">
    <LoomnPanel eyebrow="impostazioni" title="Provider AI">
      <p v-if="!status.providerConfigured" class="intro">
        Configura un provider AI per dare voce al Master: senza, il gioco resta giocabile (creazione
        PG, regia) ma il turno narrativo e disabilitato.
      </p>

      <form class="form" @submit.prevent="save">
        <label class="field">
          <span class="field__label">Base URL</span>
          <input v-model="form.baseUrl" class="field__input" type="text" placeholder="http://localhost:1234/v1" />
        </label>

        <label class="field">
          <span class="field__label">Model</span>
          <input v-model="form.model" class="field__input" type="text" placeholder="local-model" />
        </label>

        <fieldset class="field">
          <span class="field__label">Chiave API</span>
          <template v-if="hasApiKey">
            <div class="key-modes">
              <label><input v-model="form.keyAction" type="radio" value="keep" /> Mantieni</label>
              <label><input v-model="form.keyAction" type="radio" value="set" /> Sostituisci</label>
              <label><input v-model="form.keyAction" type="radio" value="remove" /> Rimuovi</label>
            </div>
            <span class="key-hint">Chiave configurata. Lascia mantieni per non toccarla.</span>
          </template>
          <input
            v-if="form.keyAction === 'set'"
            v-model="form.keyInput"
            class="field__input"
            type="password"
            autocomplete="off"
            placeholder="sk-... (vuoto = nessuna chiave)"
          />
        </fieldset>

        <div class="actions">
          <LoomnButton variant="solid" :disabled="!canSave || saving" @click="save">Salva</LoomnButton>
          <span v-if="feedback" class="feedback" :class="`feedback--${feedback.kind}`">{{ feedback.msg }}</span>
        </div>
      </form>

      <dl class="diag">
        <div><dt>safeStorage</dt><dd>{{ status.safeStorageAvailable ? 'disponibile' : 'non disponibile' }}</dd></div>
        <div><dt>provider</dt><dd>{{ status.providerConfigured ? 'configurato' : 'non configurato' }}</dd></div>
      </dl>
    </LoomnPanel>
  </main>
</template>

<style scoped>
.route-view { flex: 1; min-height: 0; }
.intro { color: var(--text-2); margin-bottom: 16px; max-width: 60ch; }
.form { display: flex; flex-direction: column; gap: 14px; max-width: 480px; }
.field { display: flex; flex-direction: column; gap: 6px; border: none; padding: 0; margin: 0; }
.field__label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-3); }
.field__input {
  font: inherit; font-family: var(--f-mono); font-size: 13px; color: var(--text);
  background: var(--well); border: 1px solid var(--line-2); border-radius: 10px; padding: 9px 12px;
}
.field__input:focus { outline: none; border-color: var(--accent); }
.key-modes { display: flex; gap: 16px; font-size: 12px; color: var(--text-2); }
.key-hint { font-size: 11px; color: var(--text-3); }
.actions { display: flex; align-items: center; gap: 14px; margin-top: 4px; }
.feedback { font-size: 12px; }
.feedback--ok { color: var(--accent); }
.feedback--error { color: #d98b6b; }
.diag { margin-top: 22px; display: flex; gap: 22px; font-size: 12px; color: var(--text-3); }
.diag dt { text-transform: uppercase; letter-spacing: 0.08em; font-size: 10px; }
.diag dd { font-family: var(--f-mono); color: var(--text-2); margin: 2px 0 0; }
</style>
```

> Nota: `canSave` resta semplice (baseUrl+model non vuoti). La condizione `set` con input vuoto e ammessa quando NON c e chiave (significa "nessuna chiave"); quando c e chiave, "Mantieni" e il default sicuro.

- [ ] **Step 6: Test componente `SettingsView`**

Create `app/desktop/src/renderer/src/views/SettingsView.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import type { StatusResult } from '@loomn/shared';
import SettingsView from './SettingsView.vue';

function stub(status: StatusResult, setProvider = vi.fn(() => Promise.resolve({ ok: true as const }))): { setProvider: ReturnType<typeof vi.fn> } {
  window.loomn = {
    getStatus: () => Promise.resolve(status),
    setProvider,
  } as unknown as typeof window.loomn;
  return { setProvider };
}

describe('SettingsView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('pre-compila baseUrl e model dal read-back', async () => {
    stub({
      version: 1,
      safeStorageAvailable: true,
      providerConfigured: true,
      provider: { baseUrl: 'http://x/v1', model: 'm', hasApiKey: true },
    });
    const w = mount(SettingsView);
    await flushPromises();
    const inputs = w.findAll('input[type="text"]');
    expect((inputs[0].element as HTMLInputElement).value).toBe('http://x/v1');
    expect((inputs[1].element as HTMLInputElement).value).toBe('m');
  });

  it('salvando con keyAction keep OMETTE apiKey nel payload', async () => {
    const { setProvider } = stub({
      version: 1,
      safeStorageAvailable: true,
      providerConfigured: true,
      provider: { baseUrl: 'http://x/v1', model: 'm', hasApiKey: true },
    });
    const w = mount(SettingsView);
    await flushPromises();
    await w.find('form').trigger('submit');
    await flushPromises();
    expect(setProvider).toHaveBeenCalledWith({ baseUrl: 'http://x/v1', model: 'm' });
  });
});
```

- [ ] **Step 7: Verifica + typecheck + commit**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/views/SettingsView.test.ts app/desktop/src/renderer/src/lib/provider-form.test.ts`
Expected: PASS.
Run: `pnpm -r typecheck`
Expected: clean.

```bash
git add app/desktop/src/renderer/src/lib/provider-form.ts app/desktop/src/renderer/src/lib/provider-form.test.ts app/desktop/src/renderer/src/views/SettingsView.vue app/desktop/src/renderer/src/views/SettingsView.test.ts
git commit -m "feat(renderer): Impostazioni provider con read-back prefill e chiave tri-stato"
```

**Test attesi (cumulativi):** ~496 packages + ~55 renderer = ~551.

---

### Task 5: First-run guidato (redirect one-shot + banner)

**Files:**
- Create: `app/desktop/src/renderer/src/composables/use-first-run.ts` (+test)
- Create: `app/desktop/src/renderer/src/components/FirstRunBanner.vue` (+test)
- Modify: `app/desktop/src/renderer/src/App.vue` (include banner)
- Modify: `app/desktop/src/renderer/src/renderer.ts` (chiama runFirstRun)

- [ ] **Step 1: Test `use-first-run` che fallisce**

Create `app/desktop/src/renderer/src/composables/use-first-run.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import type { StatusResult } from '@loomn/shared';
import { routes } from '../router';
import { useProviderStatusStore } from '../stores/provider-status';
import { runFirstRun } from './use-first-run';

function router() {
  return createRouter({ history: createMemoryHistory(), routes });
}
function stubStatus(status: StatusResult): void {
  window.loomn = { getStatus: () => Promise.resolve(status) } as unknown as typeof window.loomn;
}

describe('runFirstRun', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('guida a Impostazioni quando nessun provider e configurato', async () => {
    stubStatus({ version: 0, safeStorageAvailable: true, providerConfigured: false });
    const r = router();
    await r.push('/');
    await runFirstRun(r, useProviderStatusStore());
    expect(r.currentRoute.value.name).toBe('settings');
  });

  it('resta dove e quando il provider e gia configurato', async () => {
    stubStatus({
      version: 1,
      safeStorageAvailable: true,
      providerConfigured: true,
      provider: { baseUrl: 'http://x/v1', model: 'm', hasApiKey: true },
    });
    const r = router();
    await r.push('/');
    await runFirstRun(r, useProviderStatusStore());
    expect(r.currentRoute.value.name).toBe('game');
  });
});
```

- [ ] **Step 2: Verifica fallimento**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/composables/use-first-run.test.ts`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Implementa il composable**

Create `app/desktop/src/renderer/src/composables/use-first-run.ts`:

```ts
import type { Router } from 'vue-router';
import { useProviderStatusStore } from '../stores/provider-status';

/** First-run (spec 10f §4.3): idrata lo status e, se nessun provider e configurato, guida a
 *  Impostazioni UNA volta (chiamato al boot). NON e un hard gate: dopo, l utente naviga libero. */
export async function runFirstRun(
  router: Router,
  store: ReturnType<typeof useProviderStatusStore> = useProviderStatusStore(),
): Promise<void> {
  await store.refresh();
  if (!store.providerConfigured) await router.push('/impostazioni');
}
```

- [ ] **Step 4: Verifica passaggio**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/composables/use-first-run.test.ts`
Expected: PASS (+2).

- [ ] **Step 5: Test `FirstRunBanner` che fallisce**

Create `app/desktop/src/renderer/src/components/FirstRunBanner.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { RouterLinkStub } from '@vue/test-utils';
import { useProviderStatusStore } from '../stores/provider-status';
import FirstRunBanner from './FirstRunBanner.vue';

function mountBanner() {
  return mount(FirstRunBanner, { global: { stubs: { RouterLink: RouterLinkStub } } });
}

describe('FirstRunBanner', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.loomn = { getStatus: () => Promise.resolve({ version: 0, safeStorageAvailable: true, providerConfigured: false }) } as unknown as typeof window.loomn;
  });

  it('non mostra nulla finche lo status non e caricato', () => {
    const w = mountBanner();
    expect(w.find('.first-run').exists()).toBe(false);
  });

  it('mostra il banner quando il provider non e configurato', async () => {
    const store = useProviderStatusStore();
    await store.refresh();
    const w = mountBanner();
    expect(w.find('.first-run').exists()).toBe(true);
  });

  it('si nasconde dopo il dismiss', async () => {
    const store = useProviderStatusStore();
    await store.refresh();
    const w = mountBanner();
    await w.find('.first-run__dismiss').trigger('click');
    expect(w.find('.first-run').exists()).toBe(false);
  });

  it('non mostra il banner quando il provider e configurato', async () => {
    window.loomn = { getStatus: () => Promise.resolve({ version: 1, safeStorageAvailable: true, providerConfigured: true, provider: { baseUrl: 'http://x/v1', model: 'm', hasApiKey: true } }) } as unknown as typeof window.loomn;
    const store = useProviderStatusStore();
    await store.refresh();
    const w = mountBanner();
    expect(w.find('.first-run').exists()).toBe(false);
  });
});
```

- [ ] **Step 6: Implementa il banner**

Create `app/desktop/src/renderer/src/components/FirstRunBanner.vue`:

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useProviderStatusStore } from '../stores/provider-status';

const status = useProviderStatusStore();
const dismissed = ref(false);

// Mostra solo quando lo status e caricato, nessun provider e configurato, e non e stato dismesso.
const visible = computed<boolean>(() => status.loaded && !status.providerConfigured && !dismissed.value);
</script>

<template>
  <div v-if="visible" class="first-run" role="status">
    <span class="first-run__text">Nessun provider AI configurato. Il turno narrativo e disabilitato finche non ne configuri uno.</span>
    <RouterLink to="/impostazioni" class="first-run__cta">Vai a Impostazioni</RouterLink>
    <button class="first-run__dismiss" type="button" aria-label="ignora" @click="dismissed = true">&#x2715;</button>
  </div>
</template>

<style scoped>
.first-run {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  background: var(--accent-dim);
  border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
  border-radius: var(--r);
  color: var(--text);
  font-size: 13px;
}
.first-run__text { flex: 1; }
.first-run__cta {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
  white-space: nowrap;
}
.first-run__dismiss { background: none; border: none; color: var(--text-3); cursor: pointer; }
</style>
```

- [ ] **Step 7: Verifica banner**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/components/FirstRunBanner.test.ts`
Expected: PASS (+4).

- [ ] **Step 8: Includi il banner in `App.vue`**

In `app/desktop/src/renderer/src/App.vue`:

(a) aggiungi l import nello `<script setup>`:
```ts
import FirstRunBanner from './components/FirstRunBanner.vue';
```

(b) nel `<template>`, dentro `.stage`, tra `</header>` e `<RouterView />`, inserisci:
```vue
      <FirstRunBanner />
```

- [ ] **Step 9: Chiama `runFirstRun` al boot in `renderer.ts`**

In `app/desktop/src/renderer/src/renderer.ts`:

(a) aggiungi gli import:
```ts
import { useProviderStatusStore } from './stores/provider-status';
import { runFirstRun } from './composables/use-first-run';
```

(b) sostituisci il blocco che lancia il self-test:
```ts
const selfTest = new URLSearchParams(location.search).get('selftest');
if (selfTest !== null) {
  void runSelfTest(selfTest, store, router);
} else {
  // First-run (spec 10f): idrata lo status e guida a Impostazioni una volta se non configurato.
  void runFirstRun(router, useProviderStatusStore(pinia));
}
```

- [ ] **Step 10: Verifica + typecheck + commit**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/composables/use-first-run.test.ts app/desktop/src/renderer/src/components/FirstRunBanner.test.ts`
Expected: PASS.
Run: `pnpm -r typecheck`
Expected: clean.

```bash
git add app/desktop/src/renderer/src/composables/use-first-run.ts app/desktop/src/renderer/src/composables/use-first-run.test.ts app/desktop/src/renderer/src/components/FirstRunBanner.vue app/desktop/src/renderer/src/components/FirstRunBanner.test.ts app/desktop/src/renderer/src/App.vue app/desktop/src/renderer/src/renderer.ts
git commit -m "feat(renderer): first-run guidato (redirect one-shot a Impostazioni + banner dismissibile)"
```

**Test attesi (cumulativi):** ~496 packages + ~61 renderer = ~557.

---

### Task 6: Creazione PG (Compagnia, data-driven dal vocabolario)

**Files:**
- Create: `app/desktop/src/renderer/src/lib/actor-form.ts` (+test)
- Modify: `app/desktop/src/renderer/src/views/CompanyView.vue` (+test)

- [ ] **Step 1: Test `actor-form` che fallisce**

Create `app/desktop/src/renderer/src/lib/actor-form.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildActorId, buildActor } from './actor-form';

describe('buildActorId (slug unico contro gli id esistenti)', () => {
  it('slugifica il nome', () => {
    expect(buildActorId('Kaelen il Rosso', [])).toBe('kaelen-il-rosso');
  });

  it('disambigua con suffisso numerico al collidere', () => {
    expect(buildActorId('Goblin', ['goblin'])).toBe('goblin-2');
    expect(buildActorId('Goblin', ['goblin', 'goblin-2'])).toBe('goblin-3');
  });

  it('ripiega su attore per un nome senza caratteri validi', () => {
    expect(buildActorId('!!!', [])).toBe('attore');
  });
});

describe('buildActor (Actor completo per AddActor)', () => {
  it('costruisce un Actor con id generato, conditions/items vuoti, progressione di base', () => {
    const a = buildActor(
      {
        name: 'Kaelen',
        kind: 'pc',
        attributes: { forza: 12 },
        skills: { atletica: 2 },
        resources: { hp: { current: 10, max: 10 } },
      },
      [],
    );
    expect(a.id).toBe('kaelen');
    expect(a.name).toBe('Kaelen');
    expect(a.kind).toBe('pc');
    expect(a.attributes).toEqual({ forza: 12 });
    expect(a.resources).toEqual({ hp: { current: 10, max: 10 } });
    expect(a.conditions).toEqual([]);
    expect(a.items).toEqual([]);
    expect(a.progression).toEqual({ xp: 0, level: 1 });
  });
});
```

- [ ] **Step 2: Verifica fallimento**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/lib/actor-form.test.ts`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Implementa l helper**

Create `app/desktop/src/renderer/src/lib/actor-form.ts`:

```ts
import type { DispatchCommand } from '@loomn/shared';

// L Actor e la forma richiesta da AddActor (commandSchema): lo deriviamo dal Command per restare
// legati al contratto IPC, senza ridichiarare il tipo nel renderer.
type AddActorCommand = Extract<DispatchCommand, { type: 'AddActor' }>;
export type ActorInput = AddActorCommand['actor'];

export interface ActorFormState {
  name: string;
  kind: 'pc' | 'npc';
  attributes: Record<string, number>;
  skills: Record<string, number>;
  resources: Record<string, { current: number; max: number }>;
}

/** Id slug-based unico contro gli id gia presenti (AddActor lancia su id duplicato). */
export function buildActorId(name: string, existingIds: readonly string[]): string {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'attore';
  const taken = new Set(existingIds);
  if (!taken.has(slug)) return slug;
  let n = 2;
  while (taken.has(`${slug}-${n}`)) n++;
  return `${slug}-${n}`;
}

/** Costruisce l Actor completo per dispatch(AddActor). conditions/items vuoti (inventario profondo
 *  e feature deferita); progressione di base. Le risorse mancanti le auto-fila il motore da
 *  defaultResources. */
export function buildActor(form: ActorFormState, existingIds: readonly string[]): ActorInput {
  return {
    id: buildActorId(form.name, existingIds),
    name: form.name.trim(),
    kind: form.kind,
    attributes: form.attributes,
    skills: form.skills,
    resources: form.resources,
    conditions: [],
    items: [],
    progression: { xp: 0, level: 1 },
  };
}
```

- [ ] **Step 4: Verifica passaggio**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/lib/actor-form.test.ts`
Expected: PASS (+4).

- [ ] **Step 5: Aggiorna `CompanyView.vue` (roster + creazione)**

Replace `app/desktop/src/renderer/src/views/CompanyView.vue`:

```vue
<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import LoomnPanel from '../components/LoomnPanel.vue';
import LoomnButton from '../components/LoomnButton.vue';
import { useReadModelStore } from '../stores/read-model';
import { useRulesetStore } from '../stores/ruleset';
import { buildActor, type ActorFormState } from '../lib/actor-form';

const store = useReadModelStore();
const ruleset = useRulesetStore();

const open = ref(false);
const feedback = ref<string | null>(null);
const form = reactive<ActorFormState>({ name: '', kind: 'pc', attributes: {}, skills: {}, resources: {} });

/** Inizializza il form dal vocabolario: attributi/abilita a 0, risorse pre-compilate da
 *  defaultResources (o {0,0}). */
function resetForm(): void {
  const v = ruleset.vocabulary;
  form.name = '';
  form.kind = 'pc';
  form.attributes = Object.fromEntries((v?.attributes ?? []).map((a) => [a, 0]));
  form.skills = Object.fromEntries((v?.skills ?? []).map((s) => [s, 0]));
  form.resources = Object.fromEntries(
    (v?.resources ?? []).map((r) => [r, { ...(v?.defaultResources[r] ?? { current: 0, max: 0 }) }]),
  );
}

onMounted(async () => {
  await ruleset.load();
  resetForm();
});
watch(() => ruleset.vocabulary, resetForm);

const canSubmit = computed<boolean>(() => form.name.trim() !== '' && ruleset.loaded);

async function submit(): Promise<void> {
  feedback.value = null;
  const actor = buildActor(form, store.actors.map((a) => a.id));
  const res = await window.loomn.dispatch({ type: 'AddActor', actor });
  if (res.ok) {
    open.value = false;
    resetForm();
  } else {
    feedback.value = res.error;
  }
}
</script>

<template>
  <main class="route-view">
    <LoomnPanel eyebrow="compagnia" title="Compagnia" :meta="`${store.actors.length} attori`">
      <div class="head-actions">
        <LoomnButton variant="solid" @click="open = true">Aggiungi PG/PNG</LoomnButton>
      </div>

      <ul v-if="store.actors.length" class="roster">
        <li v-for="a in store.actors" :key="a.id" class="roster__row">
          <span class="roster__name">{{ a.name }}</span>
          <span class="roster__kind">{{ a.kind }}</span>
        </li>
      </ul>
      <p v-else>Nessun attore ancora. Relazioni e dettagli arrivano nel Piano 10e.</p>

      <div v-if="open" class="creator">
        <h3 class="creator__title">Nuovo attore</h3>
        <form class="form" @submit.prevent="submit">
          <label class="field">
            <span class="field__label">Nome</span>
            <input v-model="form.name" class="field__input" type="text" />
          </label>
          <label class="field">
            <span class="field__label">Tipo</span>
            <select v-model="form.kind" class="field__input">
              <option value="pc">PG</option>
              <option value="npc">PNG</option>
            </select>
          </label>

          <div class="grid">
            <div v-for="(_, attr) in form.attributes" :key="`a-${attr}`" class="num">
              <span class="num__label">{{ attr }}</span>
              <input v-model.number="form.attributes[attr]" class="field__input" type="number" />
            </div>
          </div>
          <div class="grid">
            <div v-for="(_, sk) in form.skills" :key="`s-${sk}`" class="num">
              <span class="num__label">{{ sk }}</span>
              <input v-model.number="form.skills[sk]" class="field__input" type="number" />
            </div>
          </div>
          <div class="grid">
            <div v-for="(pool, res) in form.resources" :key="`r-${res}`" class="num">
              <span class="num__label">{{ res }}</span>
              <div class="pool">
                <input v-model.number="pool.current" class="field__input" type="number" aria-label="current" />
                <span>/</span>
                <input v-model.number="pool.max" class="field__input" type="number" aria-label="max" />
              </div>
            </div>
          </div>

          <div class="actions">
            <LoomnButton variant="solid" :disabled="!canSubmit" @click="submit">Crea</LoomnButton>
            <LoomnButton variant="ghost" @click="open = false">Annulla</LoomnButton>
            <span v-if="feedback" class="feedback">{{ feedback }}</span>
          </div>
        </form>
      </div>
    </LoomnPanel>
  </main>
</template>

<style scoped>
.route-view { flex: 1; min-height: 0; }
.head-actions { margin-bottom: 14px; }
.roster { list-style: none; display: flex; flex-direction: column; gap: 8px; padding: 0; }
.roster__row { display: flex; justify-content: space-between; padding: 9px 12px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--well); }
.roster__name { color: var(--text); }
.roster__kind { font-family: var(--f-mono); font-size: 11px; color: var(--text-3); }
.creator { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line); }
.creator__title { font-family: var(--f-display); font-size: 16px; margin: 0 0 12px; }
.form { display: flex; flex-direction: column; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field__label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-3); }
.field__input { font: inherit; font-family: var(--f-mono); font-size: 13px; color: var(--text); background: var(--well); border: 1px solid var(--line-2); border-radius: 10px; padding: 8px 11px; }
.field__input:focus { outline: none; border-color: var(--accent); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
.num { display: flex; flex-direction: column; gap: 4px; }
.num__label { font-size: 11px; color: var(--text-3); }
.pool { display: flex; align-items: center; gap: 6px; }
.pool .field__input { width: 64px; }
.actions { display: flex; align-items: center; gap: 12px; margin-top: 6px; }
.feedback { font-size: 12px; color: #d98b6b; }
</style>
```

- [ ] **Step 6: Test componente `CompanyView`**

Create `app/desktop/src/renderer/src/views/CompanyView.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import type { RulesetResult } from '@loomn/shared';
import CompanyView from './CompanyView.vue';

const RULESET: Extract<RulesetResult, { ok: true }> = {
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
  commandPhaseRules: { combatOnly: [], nonCombatOnly: [] },
};

describe('CompanyView', () => {
  let dispatch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    setActivePinia(createPinia());
    dispatch = vi.fn(() => Promise.resolve({ ok: true as const, version: 1, events: [] }));
    window.loomn = {
      getRuleset: () => Promise.resolve(RULESET),
      dispatch,
    } as unknown as typeof window.loomn;
  });

  it('apre il creatore e dispatcha AddActor col nome e id slug', async () => {
    const w = mount(CompanyView);
    await flushPromises();
    await w.findAll('button').find((b) => b.text().includes('Aggiungi'))!.trigger('click');
    await w.find('input[type="text"]').setValue('Kaelen');
    await w.find('form').trigger('submit');
    await flushPromises();
    expect(dispatch).toHaveBeenCalledTimes(1);
    const arg = dispatch.mock.calls[0][0];
    expect(arg.type).toBe('AddActor');
    expect(arg.actor.name).toBe('Kaelen');
    expect(arg.actor.id).toBe('kaelen');
    expect(arg.actor.progression).toEqual({ xp: 0, level: 1 });
  });
});
```

- [ ] **Step 7: Verifica + typecheck + commit**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/lib/actor-form.test.ts app/desktop/src/renderer/src/views/CompanyView.test.ts`
Expected: PASS.
Run: `pnpm -r typecheck`
Expected: clean.

```bash
git add app/desktop/src/renderer/src/lib/actor-form.ts app/desktop/src/renderer/src/lib/actor-form.test.ts app/desktop/src/renderer/src/views/CompanyView.vue app/desktop/src/renderer/src/views/CompanyView.test.ts
git commit -m "feat(renderer): creazione PG data-driven dal vocabolario in Compagnia (dispatch AddActor)"
```

**Test attesi (cumulativi):** ~496 packages + ~66 renderer = ~562.

---

### Task 7: Controlli GM — slide-over Regia

**Files:**
- Create: `app/desktop/src/renderer/src/lib/gm-commands.ts` (+test)
- Create: `app/desktop/src/renderer/src/components/GmConsole.vue` (+test)
- Modify: `app/desktop/src/renderer/src/App.vue` (trigger Regia in topbar)

- [ ] **Step 1: Test `gm-commands` che fallisce**

Create `app/desktop/src/renderer/src/lib/gm-commands.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GM_COMMANDS, isGmCommandEnabled } from './gm-commands';

const RULES = { combatOnly: ['Attack', 'EndEncounter'], nonCombatOnly: ['StartEncounter', 'EnterPhase'] };

describe('GM_COMMANDS', () => {
  it('elenca i 6 comandi non-combat di 10f', () => {
    expect(GM_COMMANDS).toEqual([
      'RequestCheck',
      'ApplyEffect',
      'StartQuest',
      'AdvanceQuest',
      'EnterPhase',
      'EndEncounter',
    ]);
  });
});

describe('isGmCommandEnabled (legalita per fase da commandPhaseRules)', () => {
  it('EnterPhase (nonCombatOnly) abilitato fuori combat, disabilitato in combat', () => {
    expect(isGmCommandEnabled('EnterPhase', 'exploration', RULES)).toBe(true);
    expect(isGmCommandEnabled('EnterPhase', 'combat', RULES)).toBe(false);
  });

  it('EndEncounter (combatOnly) abilitato solo in combat', () => {
    expect(isGmCommandEnabled('EndEncounter', 'combat', RULES)).toBe(true);
    expect(isGmCommandEnabled('EndEncounter', 'exploration', RULES)).toBe(false);
  });

  it('RequestCheck (in nessuna lista) abilitato in ogni fase', () => {
    expect(isGmCommandEnabled('RequestCheck', 'combat', RULES)).toBe(true);
    expect(isGmCommandEnabled('RequestCheck', 'downtime', RULES)).toBe(true);
  });
});
```

- [ ] **Step 2: Verifica fallimento**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/lib/gm-commands.test.ts`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Implementa l helper**

Create `app/desktop/src/renderer/src/lib/gm-commands.ts`:

```ts
/** I 6 Command GM/manuali non-combat esposti da 10f (i combat — StartEncounter/Attack/EndTurn/
 *  NextRound — sono di 10c). */
export const GM_COMMANDS = [
  'RequestCheck',
  'ApplyEffect',
  'StartQuest',
  'AdvanceQuest',
  'EnterPhase',
  'EndEncounter',
] as const;
export type GmCommandType = (typeof GM_COMMANDS)[number];

export interface CommandPhaseRules {
  combatOnly: string[];
  nonCombatOnly: string[];
}

/** Un comando e abilitato nella fase corrente secondo le commandPhaseRules di get-ruleset:
 *  disabilitato se combatOnly e non si e in combat, o nonCombatOnly e si e in combat (single-source:
 *  niente classificazione hardcoded nel renderer). */
export function isGmCommandEnabled(type: string, phase: string, rules: CommandPhaseRules): boolean {
  const inCombat = phase === 'combat';
  if (rules.combatOnly.includes(type)) return inCombat;
  if (rules.nonCombatOnly.includes(type)) return !inCombat;
  return true;
}
```

- [ ] **Step 4: Verifica passaggio**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/lib/gm-commands.test.ts`
Expected: PASS (+3).

- [ ] **Step 5: Implementa `GmConsole.vue`**

Create `app/desktop/src/renderer/src/components/GmConsole.vue`. Espone i 6 comandi con form data-driven; i comandi illegali nella fase corrente sono disabilitati. Per contenere lo scope, ogni comando ha un form essenziale; il dispatch e via `window.loomn.dispatch`.

```vue
<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import LoomnButton from './LoomnButton.vue';
import { useReadModelStore } from '../stores/read-model';
import { useRulesetStore } from '../stores/ruleset';
import { GM_COMMANDS, isGmCommandEnabled, type GmCommandType } from '../lib/gm-commands';
import type { DispatchCommand } from '@loomn/shared';

const store = useReadModelStore();
const ruleset = useRulesetStore();
const open = ref(false);
const feedback = ref<{ kind: 'ok' | 'error'; msg: string } | null>(null);

onMounted(() => void ruleset.load());

const labels: Record<GmCommandType, string> = {
  RequestCheck: 'Richiedi prova',
  ApplyEffect: 'Applica effetto',
  StartQuest: 'Avvia quest',
  AdvanceQuest: 'Avanza quest',
  EnterPhase: 'Cambia fase',
  EndEncounter: 'Termina scontro',
};

function enabled(type: GmCommandType): boolean {
  return isGmCommandEnabled(type, store.phase, ruleset.commandPhaseRules);
}

// Stato dei form (semplice, un campo per parametro).
const rc = reactive({ actorId: '', attribute: '', skill: '', difficulty: '' });
const ae = reactive({ targetId: '', resource: '', direction: '', count: 1, sides: 6, bonus: 0 });
const sq = reactive({ id: '', title: '', description: '' });
const aq = reactive({ questId: '', status: '' });
const ep = reactive({ to: '' });

async function send(command: DispatchCommand): Promise<void> {
  feedback.value = null;
  const res = await window.loomn.dispatch(command);
  feedback.value = res.ok ? { kind: 'ok', msg: 'Comando applicato.' } : { kind: 'error', msg: res.error };
}

function submitRequestCheck(): void {
  void send({
    type: 'RequestCheck',
    actorId: rc.actorId,
    difficulty: rc.difficulty as never,
    ...(rc.attribute ? { attribute: rc.attribute } : {}),
    ...(rc.skill ? { skill: rc.skill } : {}),
  });
}
function submitApplyEffect(): void {
  void send({
    type: 'ApplyEffect',
    targetId: ae.targetId,
    resource: ae.resource,
    direction: ae.direction as never,
    dice: [{ count: ae.count, sides: ae.sides }],
    ...(ae.bonus ? { bonus: ae.bonus } : {}),
  });
}
function submitStartQuest(): void {
  void send({ type: 'StartQuest', id: sq.id, title: sq.title, ...(sq.description ? { description: sq.description } : {}) });
}
function submitAdvanceQuest(): void {
  void send({ type: 'AdvanceQuest', questId: aq.questId, status: aq.status as never });
}
function submitEnterPhase(): void {
  void send({ type: 'EnterPhase', to: ep.to as never });
}
function submitEndEncounter(): void {
  void send({ type: 'EndEncounter' });
}

const v = computed(() => ruleset.vocabulary);
</script>

<template>
  <div class="gm">
    <LoomnButton variant="ghost" @click="open = true">Regia</LoomnButton>
    <Teleport to="body">
      <div v-if="open" class="gm__scrim" @click.self="open = false">
        <aside class="gm__panel" role="dialog" aria-label="Regia">
          <header class="gm__head">
            <span class="gm__title">Regia</span>
            <button class="gm__close" type="button" aria-label="chiudi" @click="open = false">&#x2715;</button>
          </header>

          <p v-if="feedback" class="gm__feedback" :class="`gm__feedback--${feedback.kind}`">{{ feedback.msg }}</p>

          <section v-for="type in GM_COMMANDS" :key="type" class="cmd" :class="{ 'cmd--disabled': !enabled(type) }">
            <h4 class="cmd__title">{{ labels[type] }}</h4>
            <fieldset :disabled="!enabled(type)" class="cmd__body">
              <template v-if="type === 'RequestCheck'">
                <select v-model="rc.actorId" class="inp"><option value="">attore</option><option v-for="a in store.actors" :key="a.id" :value="a.id">{{ a.name }}</option></select>
                <select v-model="rc.attribute" class="inp"><option value="">attributo</option><option v-for="x in v?.attributes ?? []" :key="x" :value="x">{{ x }}</option></select>
                <select v-model="rc.skill" class="inp"><option value="">abilita</option><option v-for="x in v?.skills ?? []" :key="x" :value="x">{{ x }}</option></select>
                <select v-model="rc.difficulty" class="inp"><option value="">difficolta</option><option v-for="d in ruleset.difficulties" :key="d" :value="d">{{ d }}</option></select>
                <LoomnButton variant="solid" :disabled="!rc.actorId || !rc.difficulty" @click="submitRequestCheck">Esegui</LoomnButton>
              </template>

              <template v-else-if="type === 'ApplyEffect'">
                <select v-model="ae.targetId" class="inp"><option value="">bersaglio</option><option v-for="a in store.actors" :key="a.id" :value="a.id">{{ a.name }}</option></select>
                <select v-model="ae.resource" class="inp"><option value="">risorsa</option><option v-for="r in v?.resources ?? []" :key="r" :value="r">{{ r }}</option></select>
                <select v-model="ae.direction" class="inp"><option value="">direzione</option><option v-for="d in ruleset.directions" :key="d" :value="d">{{ d }}</option></select>
                <input v-model.number="ae.count" class="inp" type="number" aria-label="count" />
                <input v-model.number="ae.sides" class="inp" type="number" aria-label="sides" />
                <input v-model.number="ae.bonus" class="inp" type="number" aria-label="bonus" />
                <LoomnButton variant="solid" :disabled="!ae.targetId || !ae.resource || !ae.direction" @click="submitApplyEffect">Applica</LoomnButton>
              </template>

              <template v-else-if="type === 'StartQuest'">
                <input v-model="sq.id" class="inp" placeholder="id" />
                <input v-model="sq.title" class="inp" placeholder="titolo" />
                <input v-model="sq.description" class="inp" placeholder="descrizione (opz)" />
                <LoomnButton variant="solid" :disabled="!sq.id || !sq.title" @click="submitStartQuest">Avvia</LoomnButton>
              </template>

              <template v-else-if="type === 'AdvanceQuest'">
                <select v-model="aq.questId" class="inp"><option value="">quest</option><option v-for="q in store.quests" :key="q.id" :value="q.id">{{ q.title }}</option></select>
                <select v-model="aq.status" class="inp"><option value="">esito</option><option v-for="o in ruleset.questOutcomes" :key="o" :value="o">{{ o }}</option></select>
                <LoomnButton variant="solid" :disabled="!aq.questId || !aq.status" @click="submitAdvanceQuest">Avanza</LoomnButton>
              </template>

              <template v-else-if="type === 'EnterPhase'">
                <select v-model="ep.to" class="inp"><option value="">fase</option><option v-for="p in ruleset.softPhases" :key="p" :value="p">{{ p }}</option></select>
                <LoomnButton variant="solid" :disabled="!ep.to" @click="submitEnterPhase">Cambia</LoomnButton>
              </template>

              <template v-else-if="type === 'EndEncounter'">
                <LoomnButton variant="solid" @click="submitEndEncounter">Termina</LoomnButton>
              </template>
            </fieldset>
          </section>
        </aside>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.gm { display: inline-flex; }
.gm__scrim { position: fixed; inset: 0; background: rgba(7, 8, 9, 0.6); display: flex; justify-content: flex-end; z-index: 50; }
.gm__panel { width: 380px; max-width: 92vw; height: 100%; overflow: auto; background: var(--panel); border-left: 1px solid var(--line-2); padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
.gm__head { display: flex; align-items: center; justify-content: space-between; }
.gm__title { font-family: var(--f-display); font-size: 18px; color: var(--text); }
.gm__close { background: none; border: none; color: var(--text-3); cursor: pointer; }
.gm__feedback { font-size: 12px; }
.gm__feedback--ok { color: var(--accent); }
.gm__feedback--error { color: #d98b6b; }
.cmd { padding: 12px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--well); }
.cmd--disabled { opacity: 0.45; }
.cmd__title { font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-2); margin: 0 0 10px; }
.cmd__body { border: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.inp { font: inherit; font-family: var(--f-mono); font-size: 12px; color: var(--text); background: var(--panel); border: 1px solid var(--line-2); border-radius: 8px; padding: 6px 9px; }
.inp[type='number'] { width: 64px; }
</style>
```

> Nota tipi: i campi enum (`difficulty`/`direction`/`status`/`to`) sono `string` nel form ma i Command richiedono i literal; il valore arriva dagli enum di `get-ruleset` (sempre legali) → il `as never` nel ramo di submit e una coercizione locale al confine del dispatch (il main rivalida comunque con `commandSchema`). Mantiene il renderer disaccoppiato dai literal del motore.

- [ ] **Step 6: Test componente `GmConsole`**

Create `app/desktop/src/renderer/src/components/GmConsole.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import type { RulesetResult, ReadModelPush } from '@loomn/shared';
import GmConsole from './GmConsole.vue';
import { useReadModelStore } from '../stores/read-model';

const RULESET: Extract<RulesetResult, { ok: true }> = {
  ok: true,
  vocabulary: { attributes: ['forza'], skills: ['atletica'], resources: ['hp'], defenses: ['difesa'], defaultResources: {} },
  difficulties: ['moderate'],
  softPhases: ['exploration', 'dialogue', 'downtime'],
  questOutcomes: ['completed', 'failed'],
  directions: ['restore', 'drain'],
  commandPhaseRules: { combatOnly: ['EndEncounter'], nonCombatOnly: ['EnterPhase'] },
};

function pushState(phase: ReadModelPush['state']['phase']): ReadModelPush {
  return { version: 1, state: { version: 1, actors: {}, encounter: null, quests: {}, phase } };
}

describe('GmConsole', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.loomn = { getRuleset: () => Promise.resolve(RULESET), dispatch: vi.fn(() => Promise.resolve({ ok: true as const, version: 1, events: [] })) } as unknown as typeof window.loomn;
  });

  it('in exploration EnterPhase e abilitato e EndEncounter disabilitato', async () => {
    useReadModelStore().applyPush(pushState('exploration'));
    const w = mount(GmConsole);
    await flushPromises();
    await w.find('button').trigger('click'); // apre Regia
    const fieldsets = w.findAll('.cmd');
    const enterPhase = fieldsets.find((f) => f.text().includes('Cambia fase'))!;
    const endEncounter = fieldsets.find((f) => f.text().includes('Termina scontro'))!;
    expect(enterPhase.find('fieldset').attributes('disabled')).toBeUndefined();
    expect(endEncounter.find('fieldset').attributes('disabled')).toBeDefined();
  });

  it('in combat EndEncounter e abilitato e EnterPhase disabilitato', async () => {
    useReadModelStore().applyPush(pushState('combat'));
    const w = mount(GmConsole);
    await flushPromises();
    await w.find('button').trigger('click');
    const fieldsets = w.findAll('.cmd');
    const enterPhase = fieldsets.find((f) => f.text().includes('Cambia fase'))!;
    const endEncounter = fieldsets.find((f) => f.text().includes('Termina scontro'))!;
    expect(endEncounter.find('fieldset').attributes('disabled')).toBeUndefined();
    expect(enterPhase.find('fieldset').attributes('disabled')).toBeDefined();
  });
});
```

- [ ] **Step 7: Aggiungi il trigger Regia in `App.vue`**

In `app/desktop/src/renderer/src/App.vue`:

(a) aggiungi l import:
```ts
import GmConsole from './components/GmConsole.vue';
```

(b) nel `<template>`, dentro `.topbar`, dopo `<div class="phase-badge">{{ phaseLabel }}</div>`, inserisci:
```vue
        <GmConsole class="topbar__gm" />
```

(c) aggiungi al `<style scoped>`:
```css
.topbar__gm { margin-left: 12px; }
```

- [ ] **Step 8: Verifica + typecheck + commit**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/lib/gm-commands.test.ts app/desktop/src/renderer/src/components/GmConsole.test.ts`
Expected: PASS.
Run: `pnpm -r typecheck`
Expected: clean.

```bash
git add app/desktop/src/renderer/src/lib/gm-commands.ts app/desktop/src/renderer/src/lib/gm-commands.test.ts app/desktop/src/renderer/src/components/GmConsole.vue app/desktop/src/renderer/src/components/GmConsole.test.ts app/desktop/src/renderer/src/App.vue
git commit -m "feat(renderer): slide-over Regia coi 6 Command GM, disabilitati per fase via commandPhaseRules"
```

**Test attesi (cumulativi):** ~496 packages + ~71 renderer = ~567.

---

## Verifica finale del branch (gate "esegui l app")

Prima del merge, dopo l ultimo task (passo orchestratore, NON subagent):

1. `pnpm test` (dalla ROOT) → tutti verdi (~567).
2. `pnpm -r typecheck` → clean (6 progetti).
3. **Gate Electron** (serializza gli ABI, vedi HANDOFF §0-sexdecies): `pnpm rebuild:electron` → due lanci `LOOMN_SELFTEST` (fase 1 e 2, stesso `LOOMN_USERDATA` temporaneo) → entrambi `VERDICT: PASS` (coi nuovi check read-back/tri-stato/GM) → `pnpm rebuild:node` → `pnpm test` (ri-verifica su ABI Node). **Non** lanciare `pnpm test` mentre `rebuild:electron` e in corso.
4. **Screenshot** degli stati chiave (Impostazioni con read-back, banner first-run, creatore PG, Regia coi comandi disabilitati per fase) via harness throwaway (Vite standalone + Claude Preview MCP, NON committato) — come 10a.

---

## Self-Review (eseguita)

**1. Spec coverage:**
- Decisione A (read-back `get-status`) → Task 1 (schema) + Task 2 (handler). ✅
- Sotto-decisione tri-stato chiave → Task 2 (`resolveStoredKey` + `saveProviderConfig` + `set-provider` re-read). ✅
- Decisione B (first-run soft gate) → Task 5 (`runFirstRun` redirect + `FirstRunBanner`); segnale `canRunTurn` → Task 3 (store). ✅
- Decisione C (Regia overlay + PG in Compagnia) → Task 7 (GmConsole, trigger topbar) + Task 6 (CompanyView). ✅
- Form data-driven dal vocabolario (10g) → `useRulesetStore` (Task 3) consumato da Task 6/7. ✅
- Disabilitazione GM per fase via `commandPhaseRules` → `isGmCommandEnabled` (Task 7). ✅
- Self-test esteso → Task 2 (read-back + EnterPhase). ✅
- Verifica a strati (TDD + self-test + screenshot) → tutti i task + gate finale. ✅

**2. Placeholder scan:** nessun TBD/TODO; codice completo in ogni step. ✅

**3. Type consistency:** `ProviderFormState`/`buildProviderPayload` (Task 4), `ActorFormState`/`buildActor`/`ActorInput` (Task 6), `GmCommandType`/`isGmCommandEnabled`/`CommandPhaseRules` (Task 7), `useProviderStatusStore`/`useRulesetStore` (Task 3) usati coerentemente. `StatusResult` (Task 1) consumato da store/handler/self-test con la stessa forma `provider?:{baseUrl,model,hasApiKey}`. ✅

**4. Apostrofo:** stringhe `it`/`describe`/`check` in apici singoli senza apostrofi (`l attore`, `c e`, `senza chiave`). Verifica col grep `(it|describe)\('[^']*'[A-Za-zàèéìòù]` → atteso no matches (eseguire prima del commit del doc). ✅

---

## Execution Handoff

**Ordine task:** 1 → 2 → 3 → 4 → 5 → 6 → 7 (Task 4-7 dipendono dagli store di Task 3; Task 2 dipende dallo schema di Task 1).

Flusso §4 dell HANDOFF: branch `feat/piano10f-impostazioni-firstrun-gm` → subagent-driven (implementer + spec-review + code-quality-review per task; final review opus sull intero branch) → gate Electron → `finishing-a-development-branch` (merge ff in main) → `git push origin main` (house rule §5.8) → aggiorna HANDOFF (§0-novodecies) + memoria.
