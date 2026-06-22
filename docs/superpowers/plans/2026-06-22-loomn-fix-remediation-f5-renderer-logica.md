# Fase 5 — Renderer: logica & robustezza (Remediation Audit) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chiudere a causa radice, senza debiti, i 4 finding renderer-logica dell'audit (I‑09, I‑08, M‑07, M‑08) + la guardia di monotonia su `applyPush` annotata in F4 — niente fallimento silenzioso lato renderer.

**Architecture:** Tutto vive in `app/desktop/src/renderer/src/{composables,stores,components,views}`. Il pattern del surfacing degli errori esiste gia (`NarrativePanel` mostra `narration.error`): lo si rende un single-source riusabile (`PanelError.vue`) e lo si applica ai pannelli read che oggi tengono l'errore negli store ma non lo mostrano. La robustezza del dispatch (mai un reject IPC silenzioso, readout dadi sempre coerente) diventa single-source nel composable `useDispatch`, allineato al gemello `useRunTurn`. La monotonia del read-side e una guardia di una riga nello store.

**Tech Stack:** Vue 3 (`<script setup>`), Pinia, TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Vitest + `@vue/test-utils` su jsdom (progetto `renderer`). Contratti IPC da `@loomn/shared` (Zod). ABI jsdom — **nessun gate Electron** in questa fase.

---

## Contesto (leggere prima di iniziare)

Questo e il piano dettagliato della **Fase 5** della campagna di remediation (`docs/superpowers/plans/2026-06-19-loomn-remediation-campaign.md`, sezione "F5"). F1 (motore `582fb7a`), F2 (memoria/host `fe14646`), F3 (AI `a413ab8`), F4 (IPC/main `cce7432`) sono FATTE e mergiate; HEAD attuale `ac1bf8f` (solo doc), **757 test** (565 packages + **192 renderer**), tree pulito su `main`.

I 4 finding (schede in `docs/superpowers/audits/2026-06-19-loomn-audit-findings.md`):

- **I‑09 (Important)** — `composables/use-dispatch.ts:10-14`: `useDispatch.dispatch` fa `await window.loomn.dispatch(command)` **senza try/catch**. `window.loomn.dispatch` e `ipcRenderer.invoke`: la promise **rejecta** se l'handler lancia o se l'argomento fallisce la structured-clone ("An object could not be cloned" — bug reale gia accaduto in `buildActor`, lezione 10b). I caller (`GmConsole.send`, `EncounterPanel.send`) leggono `res.ok` senza try/catch → un reject diventa **unhandled rejection**, feedback resta null, l'utente non vede nulla. Il gemello `CompanyView.submit` avvolge gia la stessa dispatch in try/catch col commento "Mai fallire in silenzio". **Fix:** avvolgere la invoke nel composable e ritornare `{ ok: false, error }` sul reject (i caller leggono gia `res.ok`/`res.error` → garanzia single-source).
- **M‑07 (Minor)** — `composables/use-dispatch.ts:11-12`: `useRunTurn` chiama `dice.clear()` prima dell'enqueue (intenzionale: il readout riflette il turno corrente); `useDispatch` no → un Command GM senza tiri (es. `EnterPhase`/`EndTurn`/`StartEncounter`) lascia i dadi del comando precedente (`enqueue([])` e no-op). **Fix:** `dice.clear()` prima dell'enqueue, allineato a `useRunTurn`. *(Stesso file di I‑09 → stesso task.)*
- **M‑08 (Minor)** — `components/NarrativePanel.vue:18-23`: `onSend` svuota `draft.value=''` **prima** dell'await `submit(action)`; se il turno fallisce (`useRunTurn` imposta `narration.error`) nessuno ripristina il testo → l'utente perde l'azione su un percorso d'errore realistico (provider locale che cade a meta). **Fix:** ripristinare il draft sul fallimento (svuotare solo dopo esito ok).
- **I‑08 (Important)** — `views/JournalView.vue`, `views/CompanyView.vue`, `components/SheetPanel.vue`/`EncounterPanel.vue`/`GmConsole.vue`; `stores/journal.ts`, `stores/ruleset.ts`: gli store espongono `error` e lo popolano su esito non-ok di `getSummaries`/`getCanon`/`getRuleset`, ma **nessuna vista lo renderizza**. Se `getCanon`/`getSummaries` falliscono, Diario/Compagnia mostrano "Nessun fatto" — indistinguibile da "vuoto ma ok". Se `getRuleset` fallisce, i dropdown del vocabolario restano vuoti e Regia/Attacco diventano **silenziosamente inoperabili**. **Decisione 5 (bloccata con l'utente):** componente condiviso `<PanelError :error role="alert">` riusato dove `journal.error`/`ruleset.error` sono popolati, allineato a `NarrativePanel`.

**Flag F4 chiuso in F5 (deciso): guardia di monotonia su `applyPush`.** `stores/read-model.ts:23-26`: `applyPush` scrive sempre `version`/`state` senza confronto. Con il pull-on-mount di I‑02 (`renderer.ts:25`, `getReadModel().then(applyPush)`) c'e una race teorica: il pull, emesso prima, potrebbe risolversi **dopo** un push piu fresco e sovrascrivere lo stato con una versione precedente. Reachability quasi-nulla (nel reale post-reload pull e push sono alla stessa versione), ma `read-model.ts` e uno store **in scope F5** e lo stream e monotono (event-sourced, niente multi-campagna oggi) → una versione minore e **sempre** stantia. La chiusura e una riga + un test, debt-free e in-stile col commento esistente ("`applyPush` e l'UNICA scrittura"). **Decisione: chiuderla ora in F5** (Task 5), non rimandarla.

### Decisioni di design (gia bloccate — NON ri-aprire)

- **I‑08 = `PanelError` condiviso** (Decisione 5 della campagna). Un solo componente presentazionale, riusato in tutti i pannelli read. Stile allineato a `NarrativePanel.narr__error` (`color: var(--bad)`).
- **I‑09 = single-source nel composable.** I caller NON cambiano (leggono gia `res.ok`/`res.error`).
- **M‑07 = allineamento a `useRunTurn`** (`dice.clear()` prima dell'enqueue).

### Vincoli forti (non negoziabili)

- **SCOPE F5 = SOLO** `app/desktop/src/renderer/src/{composables,stores,components,views}` (logica/robustezza) + il nuovo `components/PanelError.vue`. **NIENTE** `shared`/`ipc.ts`/`main`/`engine`/`ai`/`memory` (oltre il **consumo** dei contratti gia esistenti). **NIENTE** redesign UI/CSS/layout (e F6). **NIENTE** `package.json`/`tsconfig*`/`vitest.config*`.
- **DEBT-FREE / no regressioni di LETTURA** (lezione F1–F4): mai restringere uno schema di lettura. F5 non tocca schemi, ma il principio resta per ogni contratto consumato.
- **TS strict:** spread condizionali per gli opzionali, accessi indicizzati guardati, switch esaustivi.
- **Bug apostrofo nei test:** nessun apostrofo dentro le stringhe `it('...')`/`describe('...')` in apici singoli (`l'`, `un'`, `c'è`). Scrivere `l errore`, `e null`, `c e`. Grep di verifica del piano: `(it|describe)\('[^']*'[A-Za-zàèéìòù]` → no match.
- **Disciplina di scope per task:** ogni task tocca SOLO i file elencati nel proprio header; `git status --short` prima di ogni commit.

### Fuori ambito (esplicito — NON fare in F5)

- **M‑09** (drift colore `#d98b6b` → `var(--bad)` in `SettingsView`/`CompanyView`/`GmConsole`) → **F6**. Il nuovo `PanelError.vue` usa `var(--bad)` perche e un file nuovo scritto correttamente, **non** perche stiamo fixando M‑09: NON toccare i `#d98b6b` esistenti.
- **M‑10** (adottare `LoomnDialog` per Regia/creator), **M‑15** (dev-gate Regia), **I‑03** (scroll/overflow), **I‑07 (input dadi UI)** → **F6**.
- **Bottone 'Round successivo' ridondante** in `EncounterPanel` (flag cross-fase) → **F6**.
- **`provider-status.error`** (get-status): NON e nel finding I‑08 (che nomina `journal.ts`/`ruleset.ts`). Restare nello scope nominato; eventuale surfacing e follow-up F6.
- Qualunque modifica a `main`/IPC/handler: F5 consuma i contratti, non li cambia.

### File Structure

| File | Responsabilita | Task |
|---|---|---|
| `composables/use-dispatch.ts` | dispatch robusto: `dice.clear()` prima dell'enqueue (M‑07) + try/catch → `{ok:false,error}` sul reject (I‑09) | 1 |
| `composables/use-dispatch.test.ts` | +2 test (M‑07, I‑09) | 1 |
| `components/NarrativePanel.vue` | ripristino draft su fallimento turno (M‑08) | 2 |
| `components/NarrativePanel.test.ts` | +1 test (M‑08) | 2 |
| `components/PanelError.vue` | **(nuovo)** componente presentazionale di surfacing errore read (I‑08) | 3 |
| `components/PanelError.test.ts` | **(nuovo)** +2 test | 3 |
| `views/JournalView.vue` | surface `journal.error` | 4 |
| `views/CompanyView.vue` | surface `journal.error` + `ruleset.error` | 4 |
| `components/GmConsole.vue` | surface `ruleset.error` | 4 |
| `components/EncounterPanel.vue` | surface `ruleset.error` | 4 |
| `components/SheetPanel.vue` | surface `ruleset.error` | 4 |
| `views/JournalView.test.ts` `views/CompanyView.test.ts` `components/GmConsole.test.ts` `components/EncounterPanel.test.ts` `components/SheetPanel.test.ts` | +6 test totali | 4 |
| `stores/read-model.ts` | guardia di monotonia in `applyPush` (flag F4) | 5 |
| `stores/read-model.test.ts` | +1 test | 5 |

**Conteggi test attesi (cumulativi, baseline = 757 = 565 packages + 192 renderer):**

| Dopo Task | +renderer | Totale |
|---|---|---|
| 1 (useDispatch I‑09+M‑07) | +2 | **759** |
| 2 (NarrativePanel M‑08) | +1 | **760** |
| 3 (PanelError nuovo) | +2 | **762** |
| 4 (surfacing 5 pannelli) | +6 | **768** |
| 5 (read-model monotonia) | +1 | **769** |

Fine F5: **769 test** (565 packages + **204 renderer**).

### Verifica di fase (a fine branch, prima del merge)

```bash
pnpm exec vitest run --project renderer   # atteso 204 renderer verdi
pnpm -C app/desktop typecheck             # vue-tsc pulito
pnpm test                                 # full, atteso 769 verdi
```

Se `pnpm test` da `NODE_MODULE_VERSION 146 ... requires 137` (nativa rimasta su ABI Electron da un gate precedente): `pnpm rebuild:node`. Se EBUSY/EPERM su `better_sqlite3.node`: killare SOLO i processi Loomn (`Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'tabl|loomn' -and $_.Name -match 'electron|node' }` + `Stop-Process -Force`), poi `pnpm rebuild:node`. **Nessun gate Electron in F5.**

> **Nota per l'esecutore:** per girare un singolo file di test usa la **root** (attrito noto del monorepo): `pnpm exec vitest run app/desktop/src/renderer/src/<path>.test.ts`. Il typecheck del renderer e `pnpm -C app/desktop typecheck` (vue-tsc).

---

## Task 1: `useDispatch` — readout dadi coerente (M‑07) + reject IPC mai silenzioso (I‑09)

**Files:**
- Modify: `app/desktop/src/renderer/src/composables/use-dispatch.ts`
- Test: `app/desktop/src/renderer/src/composables/use-dispatch.test.ts`

**Disciplina di scope:** toccare SOLO i due file sopra. Non modificare `useRunTurn`, `dice.ts`, ne i caller (`GmConsole`/`EncounterPanel`): leggono gia `res.ok`/`res.error`, il fix e single-source nel composable.

- [ ] **Step 1: Aggiungi i due test (falliranno)**

Aggiungi in coda a `describe('useDispatch', ...)` in `app/desktop/src/renderer/src/composables/use-dispatch.test.ts` (dopo il test `su esito di errore non accoda`, prima della `})` di chiusura del describe):

```typescript
  it('azzera il readout dadi prima di un comando senza tiri (no readout stantio)', async () => {
    const dice = useDiceStore();
    const { dispatch } = useDispatch();
    // 1) un comando che produce un tiro popola la coda dadi
    window.loomn = {
      dispatch: vi.fn(() =>
        Promise.resolve({
          ok: true,
          version: 1,
          events: [
            {
              type: 'CheckResolved',
              actorId: 'eroe',
              difficulty: 'moderate',
              result: { dice: [{ sides: 20, value: 14 }], modifierTotal: 0, total: 14, mode: 'check', dc: 10, margin: 4, outcome: 'success' },
            },
          ],
        }),
      ),
    } as unknown as typeof window.loomn;
    await dispatch({ type: 'RequestCheck', actorId: 'eroe', difficulty: 'moderate' });
    expect(dice.rolls.length).toBe(1);
    // 2) un comando SENZA tiri deve azzerare il readout, non lasciare quello stantio
    window.loomn = {
      dispatch: vi.fn(() => Promise.resolve({ ok: true, version: 2, events: [{ type: 'PhaseChanged', from: 'exploration', to: 'dialogue' }] })),
    } as unknown as typeof window.loomn;
    await dispatch({ type: 'EnterPhase', to: 'dialogue' });
    expect(dice.rolls).toEqual([]);
  });

  it('un reject della invoke IPC diventa un esito ok:false error (mai unhandled)', async () => {
    window.loomn = {
      dispatch: vi.fn(() => Promise.reject(new Error('An object could not be cloned'))),
    } as unknown as typeof window.loomn;
    const { dispatch } = useDispatch();
    const res = await dispatch({ type: 'EndTurn' });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('could not be cloned');
  });
```

- [ ] **Step 2: Esegui i test per vederli fallire**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/composables/use-dispatch.test.ts`
Atteso: FAIL — il primo test fallisce perche oggi `useDispatch` non chiama `dice.clear()` (il readout resta a 1); il secondo fallisce perche il reject NON e catturato (la promise rejecta, `dispatch` lancia invece di ritornare `{ok:false}`).

- [ ] **Step 3: Implementa il fix (file completo)**

Sostituisci INTERAMENTE `app/desktop/src/renderer/src/composables/use-dispatch.ts` con:

```typescript
import { useDiceStore } from '../stores/dice';
import { extractRolls } from '../lib/turn-events';
import type { DispatchCommand, DispatchResult } from '@loomn/shared';

/** Dispatch di un Command + accoda al pannello dadi i tiri prodotti (Attack/RequestCheck/ApplyEffect).
 *  Cosi i comandi manuali della Regia (GM) mostrano i dadi 3D senza un turno AI.
 *  Robustezza (allineata a use-run-turn): il readout dadi riflette SEMPRE il comando corrente
 *  (clear prima dell enqueue, M-07) e un reject IPC (handler che lancia / clone serialization fallita)
 *  diventa un esito {ok:false,error} invece di un unhandled rejection (I-09): i caller
 *  (GmConsole/EncounterPanel) leggono gia res.ok/res.error e mostrano il feedback senza modifiche. */
export function useDispatch(): { dispatch: (command: DispatchCommand) => Promise<DispatchResult> } {
  const dice = useDiceStore();

  async function dispatch(command: DispatchCommand): Promise<DispatchResult> {
    // Il readout dadi riflette il comando CORRENTE: svuota i tiri precedenti (un comando senza tiri,
    // es. EnterPhase/EndTurn, non lascia un readout stantio). enqueue li ripopola se ci sono tiri.
    dice.clear();
    try {
      const res = await window.loomn.dispatch(command);
      if (res.ok) dice.enqueue(extractRolls(res.events));
      return res;
    } catch (err) {
      // Mai fallire in silenzio: un reject diventa un esito tipizzato che il caller mostra.
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return { dispatch };
}
```

- [ ] **Step 4: Esegui i test per vederli passare**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/composables/use-dispatch.test.ts`
Atteso: PASS — 5 test (3 esistenti + 2 nuovi). I 3 esistenti restano verdi: `clear()` su coda gia vuota e no-op; sull'esito di errore `enqueue` non viene chiamato e `nonce` resta 0.

- [ ] **Step 5: Typecheck del renderer**

Run: `pnpm -C app/desktop typecheck`
Atteso: nessun errore (il ramo catch ritorna `{ ok: false, error: string }`, conforme a `DispatchResult`).

- [ ] **Step 6: Commit**

```bash
git add app/desktop/src/renderer/src/composables/use-dispatch.ts app/desktop/src/renderer/src/composables/use-dispatch.test.ts
git commit -m "fix(renderer): useDispatch azzera i dadi e cattura i reject IPC [M-07/I-09]"
```

---

## Task 2: `NarrativePanel` — l'azione non si perde se il turno fallisce (M‑08)

**Files:**
- Modify: `app/desktop/src/renderer/src/components/NarrativePanel.vue` (solo la funzione `onSend`, `:18-23`)
- Test: `app/desktop/src/renderer/src/components/NarrativePanel.test.ts`

**Disciplina di scope:** toccare SOLO `onSend` nel `<script setup>` e il file di test. Non toccare il `<template>`, lo `<style>`, ne `useRunTurn`.

- [ ] **Step 1: Aggiungi il test (fallira)**

Aggiungi in coda a `describe('NarrativePanel', ...)` in `app/desktop/src/renderer/src/components/NarrativePanel.test.ts` (prima della `})` di chiusura del describe):

```typescript
  it('ripristina l azione digitata se il turno fallisce', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const provider = useProviderStatusStore();
    stubLoomn({ runTurn: vi.fn(() => Promise.resolve({ ok: false as const, error: 'provider caduto' })) });
    await provider.refresh();
    const w = mount(NarrativePanel, { global: { plugins: [pinia], stubs } });
    await flushPromises();
    await w.find('textarea').setValue('apro la porta');
    await w.find('button').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('provider caduto');
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('apro la porta');
  });
```

- [ ] **Step 2: Esegui il test per vederlo fallire**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/components/NarrativePanel.test.ts`
Atteso: FAIL — oggi `draft` resta `''` dopo il fallimento (`onSend` lo svuota prima dell'await e non lo ripristina); l'assert sul valore della textarea fallisce.

- [ ] **Step 3: Implementa il fix**

In `app/desktop/src/renderer/src/components/NarrativePanel.vue`, sostituisci la funzione `onSend` (attualmente):

```typescript
async function onSend(): Promise<void> {
  if (!canSend.value) return;
  const action = draft.value;
  draft.value = '';
  await submit(action);
}
```

con:

```typescript
async function onSend(): Promise<void> {
  if (!canSend.value) return;
  const action = draft.value;
  draft.value = '';
  await submit(action);
  // M-08: se il turno fallisce, use-run-turn imposta narration.error (azzerato a inizio submit).
  // Ripristina l azione cosi non va persa su un percorso d errore realistico (provider che cade).
  if (narration.error !== null) draft.value = action;
}
```

*(Nota: `narration` e gia in scope nel `<script setup>` come `const narration = useNarrationStore();`. `useRunTurn.submit` fa `narration.setError(null)` all'inizio, quindi dopo l'await `narration.error !== null` indica un fallimento di QUESTO turno. La textarea e disabilitata durante `pending`, quindi `draft` e `''` al momento del ripristino.)*

- [ ] **Step 4: Esegui i test per vederli passare**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/components/NarrativePanel.test.ts`
Atteso: PASS — 7 test (6 esistenti + 1 nuovo). Il test esistente `invia l azione e la passa a runTurn` (esito ok) resta verde: su ok `narration.error` e null → il draft resta `''`.

- [ ] **Step 5: Commit**

```bash
git add app/desktop/src/renderer/src/components/NarrativePanel.vue app/desktop/src/renderer/src/components/NarrativePanel.test.ts
git commit -m "fix(renderer): NarrativePanel ripristina il draft se il turno fallisce [M-08]"
```

---

## Task 3: `PanelError.vue` — componente condiviso di surfacing errore read (I‑08, parte 1)

**Files:**
- Create: `app/desktop/src/renderer/src/components/PanelError.vue`
- Test: `app/desktop/src/renderer/src/components/PanelError.test.ts`

**Disciplina di scope:** creare SOLO i due file nuovi. Nessun consumer in questo task (il wiring e il Task 4) — il componente e testato in isolamento. Usa `var(--bad)` (token corretto, come `NarrativePanel.narr__error`): NON e un fix di M‑09, e solo un file nuovo scritto in-stile.

- [ ] **Step 1: Scrivi i test (falliranno: il file non esiste)**

Crea `app/desktop/src/renderer/src/components/PanelError.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PanelError from './PanelError.vue';

describe('PanelError', () => {
  it('non rende nulla quando error e null', () => {
    const w = mount(PanelError, { props: { error: null } });
    expect(w.find('[role="alert"]').exists()).toBe(false);
    expect(w.text()).toBe('');
  });

  it('rende il messaggio con role alert quando error e presente', () => {
    const w = mount(PanelError, { props: { error: 'ledger non leggibile' } });
    const alert = w.find('[role="alert"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toBe('ledger non leggibile');
  });
});
```

- [ ] **Step 2: Esegui i test per vederli fallire**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/components/PanelError.test.ts`
Atteso: FAIL — `Failed to resolve import "./PanelError.vue"` (il file non esiste ancora).

- [ ] **Step 3: Crea il componente**

Crea `app/desktop/src/renderer/src/components/PanelError.vue`:

```vue
<script setup lang="ts">
// Surfacing coerente degli errori dei canali read (I-08): un errore di lettura non deve mai restare
// silenzioso (un pannello vuoto e indistinguibile da "tutto ok ma vuoto"). Presentazionale puro:
// nessuno store, nessun dispatch; null = non rende nulla. Allineato a NarrativePanel.narr__error.
defineProps<{ error: string | null }>();
</script>

<template>
  <p v-if="error" class="panel-error" role="alert">{{ error }}</p>
</template>

<style scoped>
.panel-error { color: var(--bad); font-size: 13px; margin: 0; }
</style>
```

- [ ] **Step 4: Esegui i test per vederli passare**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/components/PanelError.test.ts`
Atteso: PASS — 2 test.

- [ ] **Step 5: Typecheck del renderer**

Run: `pnpm -C app/desktop typecheck`
Atteso: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add app/desktop/src/renderer/src/components/PanelError.vue app/desktop/src/renderer/src/components/PanelError.test.ts
git commit -m "feat(renderer): PanelError componente condiviso di surfacing errore read [I-08]"
```

---

## Task 4: Surfacing degli errori read nei pannelli (I‑08, parte 2)

**Files:**
- Modify: `app/desktop/src/renderer/src/views/JournalView.vue`
- Modify: `app/desktop/src/renderer/src/views/CompanyView.vue`
- Modify: `app/desktop/src/renderer/src/components/GmConsole.vue`
- Modify: `app/desktop/src/renderer/src/components/EncounterPanel.vue`
- Modify: `app/desktop/src/renderer/src/components/SheetPanel.vue`
- Test: i 5 file `.test.ts` corrispondenti

**Disciplina di scope:** in ogni file aggiungere SOLO (a) l'import di `PanelError` e (b) il tag `<PanelError :error="..." />`. NON ritoccare logica, stili (incluso lasciare intatti i `#d98b6b` — sono F6), ne i `<template>` oltre l'inserimento del tag. `journal`/`ruleset` sono gia importati e istanziati in tutti i file dove servono.

- [ ] **Step 1: Aggiungi i test (falliranno)**

In `app/desktop/src/renderer/src/views/JournalView.test.ts`, aggiungi in coda al describe:

```typescript
  it('mostra l errore del canale read quando una lettura fallisce', async () => {
    window.loomn = {
      getNarrationHistory: () => Promise.resolve({ ok: true, entries: [], hasMore: false }),
      getSummaries: () => Promise.resolve({ ok: true, summaries: [] }),
      getCanon: () => Promise.resolve({ ok: false, error: 'ledger non leggibile' }),
    } as unknown as typeof window.loomn;
    const w = mount(JournalView, { global: { plugins: [createPinia()] } });
    await flushPromises();
    expect(w.find('[role="alert"]').text()).toContain('ledger non leggibile');
  });
```

In `app/desktop/src/renderer/src/views/CompanyView.test.ts`, aggiungi in coda al describe:

```typescript
  it('mostra l errore del canale canon quando la lettura fallisce', async () => {
    window.loomn = {
      getRuleset: () => Promise.resolve(RULESET),
      getSummaries: () => Promise.resolve({ ok: true, summaries: [] }),
      getCanon: () => Promise.resolve({ ok: false, error: 'canon non leggibile' }),
      dispatch: vi.fn(),
    } as unknown as typeof window.loomn;
    const w = mount(CompanyView, { global: { plugins: [createPinia()] } });
    await flushPromises();
    expect(w.text()).toContain('canon non leggibile');
  });

  it('mostra l errore del vocabolario quando get-ruleset fallisce', async () => {
    window.loomn = {
      getRuleset: () => Promise.resolve({ ok: false, error: 'vocabolario non caricato' }),
      getSummaries: () => Promise.resolve({ ok: true, summaries: [] }),
      getCanon: () => Promise.resolve(CANON),
      dispatch: vi.fn(),
    } as unknown as typeof window.loomn;
    const w = mount(CompanyView, { global: { plugins: [createPinia()] } });
    await flushPromises();
    expect(w.text()).toContain('vocabolario non caricato');
  });
```

In `app/desktop/src/renderer/src/components/GmConsole.test.ts`, aggiungi in coda al describe:

```typescript
  it('mostra l errore del vocabolario quando get-ruleset fallisce', async () => {
    window.loomn = { getRuleset: () => Promise.resolve({ ok: false, error: 'vocabolario non caricato' }), dispatch } as unknown as typeof window.loomn;
    useReadModelStore().applyPush(pushState('exploration'));
    const w = mount(GmConsole);
    await flushPromises();
    await w.find('button').trigger('click'); // apre la Regia
    expect(w.text()).toContain('vocabolario non caricato');
  });
```

In `app/desktop/src/renderer/src/components/EncounterPanel.test.ts`, aggiungi in coda al describe:

```typescript
  it('mostra l errore del vocabolario quando get-ruleset fallisce', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    window.loomn = { getRuleset: () => Promise.resolve({ ok: false, error: 'vocabolario non caricato' }), dispatch } as unknown as typeof window.loomn;
    useReadModelStore().applyPush(combatPush());
    const w = mount(EncounterPanel, { global: { plugins: [pinia], stubs } });
    await flushPromises();
    expect(w.text()).toContain('vocabolario non caricato');
  });
```

In `app/desktop/src/renderer/src/components/SheetPanel.test.ts`, aggiungi in coda al describe:

```typescript
  it('mostra l errore del vocabolario quando get-ruleset fallisce', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    window.loomn = { getRuleset: () => Promise.resolve({ ok: false, error: 'vocabolario non caricato' }) } as unknown as typeof window.loomn;
    useReadModelStore().applyPush(push());
    const w = mount(SheetPanel, { global: { plugins: [pinia], stubs } });
    await flushPromises();
    expect(w.text()).toContain('vocabolario non caricato');
  });
```

- [ ] **Step 2: Esegui i test per vederli fallire**

Run:
```bash
pnpm exec vitest run app/desktop/src/renderer/src/views/JournalView.test.ts app/desktop/src/renderer/src/views/CompanyView.test.ts app/desktop/src/renderer/src/components/GmConsole.test.ts app/desktop/src/renderer/src/components/EncounterPanel.test.ts app/desktop/src/renderer/src/components/SheetPanel.test.ts
```
Atteso: FAIL — nessun pannello renderizza ancora l'errore (il messaggio non compare nel testo).

- [ ] **Step 3a: `JournalView.vue` — surface `journal.error`**

Import: aggiungi sotto gli import esistenti dei componenti (dopo `import LoomnButton from '../components/LoomnButton.vue';`):

```typescript
import PanelError from '../components/PanelError.vue';
```

Template: dentro `<div class="journal">`, come PRIMO figlio (prima di `<section class="block">` della Riflessione):

```html
      <div class="journal">
        <PanelError :error="journal.error" />
        <section class="block">
```

- [ ] **Step 3b: `CompanyView.vue` — surface `ruleset.error` + `journal.error`**

Import: dopo `import LoomnButton from '../components/LoomnButton.vue';`:

```typescript
import PanelError from '../components/PanelError.vue';
```

Template: subito dentro `<LoomnPanel ...>`, PRIMA di `<div class="head-actions">`:

```html
    <LoomnPanel eyebrow="compagnia" title="Compagnia" :meta="`${store.actors.length} attori`">
      <PanelError :error="ruleset.error" />
      <PanelError :error="journal.error" />
      <div class="head-actions">
```

- [ ] **Step 3c: `GmConsole.vue` — surface `ruleset.error`**

Import: dopo `import LoomnButton from './LoomnButton.vue';`:

```typescript
import PanelError from './PanelError.vue';
```

Template: dentro `<aside class="gm__panel" ...>`, subito DOPO la riga del feedback:

```html
        <p v-if="feedback" class="gm__feedback" :class="`gm__feedback--${feedback.kind}`">{{ feedback.msg }}</p>
        <PanelError :error="ruleset.error" />
```

- [ ] **Step 3d: `EncounterPanel.vue` — surface `ruleset.error`**

Import: dopo `import LoomnButton from './LoomnButton.vue';`:

```typescript
import PanelError from './PanelError.vue';
```

Template: subito dentro `<LoomnPanel ...>`, PRIMA di `<div v-if="view" class="cockpit">`:

```html
  <LoomnPanel title="Scontro" eyebrow="combattimento" :meta="view ? `round ${view.round}` : ''">
    <PanelError :error="ruleset.error" />
    <div v-if="view" class="cockpit">
```

- [ ] **Step 3e: `SheetPanel.vue` — surface `ruleset.error`**

Import: dopo `import LoomnPanel from './LoomnPanel.vue';`:

```typescript
import PanelError from './PanelError.vue';
```

Template: subito dentro `<LoomnPanel ...>`, PRIMA di `<div v-if="sheet" class="sheet">`:

```html
  <LoomnPanel eyebrow="scheda" :title="sheet?.name ?? 'Scheda'" :meta="sheet ? `liv. ${sheet.level}` : ''">
    <PanelError :error="ruleset.error" />
    <div v-if="sheet" class="sheet">
```

- [ ] **Step 4: Esegui i 5 file di test per vederli passare**

Run:
```bash
pnpm exec vitest run app/desktop/src/renderer/src/views/JournalView.test.ts app/desktop/src/renderer/src/views/CompanyView.test.ts app/desktop/src/renderer/src/components/GmConsole.test.ts app/desktop/src/renderer/src/components/EncounterPanel.test.ts app/desktop/src/renderer/src/components/SheetPanel.test.ts
```
Atteso: PASS — tutti i test (esistenti + i 6 nuovi). I test esistenti restano verdi: con un esito ok degli store `error` resta null → `<PanelError>` non rende nulla.

- [ ] **Step 5: Typecheck del renderer**

Run: `pnpm -C app/desktop typecheck`
Atteso: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add app/desktop/src/renderer/src/views/JournalView.vue app/desktop/src/renderer/src/views/CompanyView.vue app/desktop/src/renderer/src/components/GmConsole.vue app/desktop/src/renderer/src/components/EncounterPanel.vue app/desktop/src/renderer/src/components/SheetPanel.vue app/desktop/src/renderer/src/views/JournalView.test.ts app/desktop/src/renderer/src/views/CompanyView.test.ts app/desktop/src/renderer/src/components/GmConsole.test.ts app/desktop/src/renderer/src/components/EncounterPanel.test.ts app/desktop/src/renderer/src/components/SheetPanel.test.ts
git commit -m "fix(renderer): surface gli errori read con PanelError nei pannelli [I-08]"
```

---

## Task 5: `read-model` — guardia di monotonia su `applyPush` (flag F4)

**Files:**
- Modify: `app/desktop/src/renderer/src/stores/read-model.ts` (solo la funzione `applyPush`, `:23-26`)
- Test: `app/desktop/src/renderer/src/stores/read-model.test.ts`

**Disciplina di scope:** toccare SOLO `applyPush` e il file di test. Non modificare i getter, i tipi di vista, ne `renderer.ts`.

- [ ] **Step 1: Aggiungi il test (fallira)**

Aggiungi in coda a `describe('useReadModelStore', ...)` in `app/desktop/src/renderer/src/stores/read-model.test.ts` (prima della `})` di chiusura):

```typescript
  it('ignora un push con versione precedente (monotonia anti-clobber pull/push)', () => {
    const s = useReadModelStore();
    s.applyPush(push({ actors: { a: actor('a', 'A', 'pc') } }, 2));
    // un pull stantio (versione 1) non deve sovrascrivere lo stato a versione 2
    s.applyPush(push({ actors: {} }, 1));
    expect(s.version).toBe(2);
    expect(s.actors.map((a) => a.id)).toEqual(['a']);
  });
```

- [ ] **Step 2: Esegui il test per vederlo fallire**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/stores/read-model.test.ts`
Atteso: FAIL — oggi `applyPush` sovrascrive sempre: dopo il secondo push `version` diventa 1 e `actors` vuoto.

- [ ] **Step 3: Implementa la guardia**

In `app/desktop/src/renderer/src/stores/read-model.ts`, sostituisci la funzione `applyPush` (attualmente):

```typescript
  /** Applica un push read-side (lo chiama il bootstrap su onReadModelPush). */
  function applyPush(push: ReadModelPush): void {
    version.value = push.version;
    state.value = push.state;
  }
```

con:

```typescript
  /** Applica un push read-side (lo chiama il bootstrap su onReadModelPush e sul pull-on-mount I-02).
   *  Monotonia: ignora un push/pull con versione PRECEDENTE per non sovrascrivere uno stato piu
   *  recente. Race possibile tra il pull-on-mount (emesso prima) e un push concorrente piu fresco;
   *  lo stream e monotono (event-sourced) -> una versione minore e sempre stantia. */
  function applyPush(push: ReadModelPush): void {
    if (state.value !== null && push.version < version.value) return;
    version.value = push.version;
    state.value = push.state;
  }
```

- [ ] **Step 4: Esegui i test per vederli passare**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/stores/read-model.test.ts`
Atteso: PASS — 8 test (7 esistenti + 1 nuovo). Gli esistenti restano verdi: il primo push (stato null) applica sempre; `l ultimo push sostituisce lo stato precedente` usa versioni crescenti (1→2), la guardia non interviene.

- [ ] **Step 5: Typecheck del renderer**

Run: `pnpm -C app/desktop typecheck`
Atteso: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add app/desktop/src/renderer/src/stores/read-model.ts app/desktop/src/renderer/src/stores/read-model.test.ts
git commit -m "fix(renderer): guardia di monotonia su applyPush (anti-clobber pull/push) [flag F4]"
```

---

## Verifica finale di branch (prima della final review e del merge)

- [ ] **Tutti i test renderer verdi**

Run: `pnpm exec vitest run --project renderer`
Atteso: **204 test** verdi (192 baseline + 12 nuovi).

- [ ] **Typecheck pulito**

Run: `pnpm -C app/desktop typecheck`
Atteso: vue-tsc senza errori.

- [ ] **Suite full verde (ABI Node)**

Run: `pnpm test`
Atteso: **769 test** verdi (565 packages + 204 renderer). Se `NODE_MODULE_VERSION 146 ... requires 137` → `pnpm rebuild:node` e ri-lancia.

- [ ] **Grep anti-apostrofo sui test toccati**

Run: `grep -rnE "(it\|describe)\('[^']*'[A-Za-zàèéìòù]" app/desktop/src/renderer/src`
Atteso: no match.

---

## Self-Review (copertura dello spec = sezione F5 della campagna + schede d'audit)

**1. Copertura dei finding:**
- **I‑09** (reject IPC silenzioso) → Task 1, ramo catch → `{ok:false,error}`. ✅
- **M‑07** (readout dadi stantio) → Task 1, `dice.clear()` prima dell'enqueue. ✅
- **M‑08** (azione persa su errore) → Task 2, ripristino `draft` su `narration.error !== null`. ✅
- **I‑08** (errori read mai mostrati) → Task 3 (`PanelError`) + Task 4 (surfacing in JournalView/CompanyView/GmConsole/EncounterPanel/SheetPanel su `journal.error`/`ruleset.error`). ✅
- **Flag F4** (monotonia `applyPush`) → Task 5. ✅

**2. Scan placeholder:** nessun TBD/TODO; ogni step ha codice completo o comando con output atteso. ✅

**3. Coerenza di tipi/nomi:** `DispatchResult` = `{ok:true,version,events} | {ok:false,error}` (verificato in `shared/ipc.ts:46-54`) → il ramo catch e conforme. `PanelError` prop `error: string | null` usata identica in tutti i consumer. `journal.error`/`ruleset.error` sono `Ref<string|null>` esposti dagli store (verificato). `dice.clear()` esiste in `stores/dice.ts`. `narration.error` e l'`useRunTurn` contract (setError(null) a inizio submit) verificati. ✅

**4. Disciplina di scope:** ogni task elenca i suoi file; nessun task tocca `shared`/`main`/`engine`/`ai`/`memory`/config. M‑09/M‑10/M‑15/I‑03/I‑07-UI esplicitamente rimandati a F6. ✅

**5. Causa radice, no debiti:** I‑09/M‑07 single-source nel composable (i caller invariati); I‑08 componente condiviso riusato (no surfacing ad-hoc duplicato); M‑08 svuota solo dopo ok; monotonia 1 riga in-stile. Nessuna pezza minima. ✅

**6. No regressioni di lettura:** F5 non tocca schemi. I test esistenti restano verdi (verificato ramo per ramo negli step "Atteso PASS"). ✅

---

## Roadmap (dopo F5)

- **F6 — Renderer: UI & layout** (I‑03 scroll/overflow con verifica visiva preview tools, I‑07 input dadi UI, M‑09 token colore, M‑10 LoomnDialog, M‑15 dev-gate Regia, + bottone 'Round successivo' ridondante): jsdom + verifica visiva + **gate Electron 2 fasi**.
- **F7 — Operatività, gate & CI** (M‑11 script `gate:selftest`/`verify`, D‑06 hazard ABI, estensione self-test del path reload di I‑02).

Una fase alla volta, piano just-in-time con `writing-plans`, flusso §4 della campagna. **FERMARSI dopo il merge di F5 per il check dell'utente** (poi F6).

---

## Execution Handoff

Piano salvato in `docs/superpowers/plans/2026-06-22-loomn-fix-remediation-f5-renderer-logica.md`. **Prossimo passo:** commit del doc su `main` (commit `docs: ...` con Co-Authored-By), poi branch `fix/remediation-f5-renderer-logica` ed esecuzione **subagent-driven** (implementer + spec-review + code-quality-review per task; final review opus del branch; `finishing-a-development-branch` merge ff → `pnpm test` → `git push origin main` → cancella il branch; aggiorna HANDOFF + memoria).
