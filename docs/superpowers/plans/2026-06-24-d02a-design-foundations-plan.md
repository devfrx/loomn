# D‑02a — Fondamenta del design system — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire il tema "dark atelier" con un design system token‑first warm‑neutral, light+dark con toggle, all‑sans, accento terracotta statico — centralizzato in `tokens.css`, senza cambiare struttura/IX.

**Architecture:** Si riscrive `tokens.css` con un set semantico (light/dark via `[data-theme]` + `prefers-color-scheme`), tenendo i nomi token molto usati (`--text*`, `--line*`, `--well`, `--accent`, `--bad`, `--r*`, `--f-mono`) con valori nuovi e introducendo i nuovi (`--bg`, `--surface`, `--surface-2`, `--accent-press/-soft`, `--on-accent`, `--f-sans`, scala spacing/type/elevation/motion). Un **alias-bridge** (`--ink:var(--bg)`, `--panel:var(--surface)`, `--accent-dim:var(--accent-soft)`, `--f-display/-read/-ui:var(--f-sans)`) tiene verdi i consumatori finche non vengono migrati a batch e gli alias rimossi. Un composable `useTheme` gestisce il toggle persistito. Renderer-only.

**Tech Stack:** CSS custom properties, Vue 3 + Pinia, Vitest + @vue/test-utils (jsdom), @fontsource-variable.

**Baseline (a inizio D‑02a):** `main` a `e0bfbf3` (spec D‑02a). 843 test, `pnpm -r typecheck` pulito (6 progetti), tree pulito (solo `.claude/`). Spec autorita: `docs/superpowers/specs/2026-06-24-d02a-design-foundations-design.md`.

---

## Vincoli trasversali (ogni task)

- **Scope discipline:** tocca SOLO i file elencati. MAI `tsconfig*`, `vitest.config*`, `vitest.workspace.ts`, `electron.vite.config*`, `package.json` (eccezione dichiarata: in T4 si rimuovono 2 *import* di font in `styles/index.ts`, che NON e config di build — e codice renderer). `git status --short` prima di ogni commit; stage per path esplicito; `.claude/` MAI committato.
- **No hex hardcoded nei `.vue`:** il guard `no-color-drift.test.ts` deve restare verde. Tutti i colori via `var(--token)`.
- **Renderer-only, ABI jsdom, NIENTE gate Electron** (non tocca main/IPC; il self-test del gate verifica route/read-model, non il theming).
- **Anti-apostrofo** nelle `it()/describe()` in apici singoli e nelle label.
- **TS strict** (exactOptionalPropertyTypes): spread condizionali, niente `field: undefined`.
- Comando test singolo (dalla root): `pnpm exec vitest run <path>`. Suite: `pnpm test`. Typecheck: `pnpm -r typecheck`.

---

## File Structure

| File | Responsabilita | Task |
|---|---|---|
| `app/desktop/src/renderer/src/styles/tokens.css` | nuovo sistema di token (light/dark) + alias-bridge; rimozione phase/atelier | T1, T3, T4 |
| `app/desktop/src/renderer/src/composables/use-theme.ts` (nuovo) | stato tema (system/light/dark) + persistenza + applica `data-theme` | T2 |
| `app/desktop/src/renderer/src/composables/use-theme.test.ts` (nuovo) | test useTheme | T2 |
| `app/desktop/src/renderer/src/renderer.ts` | init tema prima del mount (1 blocco) | T2 |
| `app/desktop/src/renderer/src/styles/base.css` | bg flat `--bg`, migrazione token | T3 |
| `App.vue` + componenti/viste (consumatori surface) | rename `--panel/--panel-hi/--raise`→`--surface*` | T3 |
| componenti/viste (consumatori accent-dim + font) | rename `--accent-dim`→`--accent-soft`, `--f-display/-read/-ui/-serif`→`--f-sans` | T4 |
| `app/desktop/src/renderer/src/styles/index.ts` | rimuove import serif (Fraunces/Newsreader) | T4 |
| `app/desktop/src/renderer/src/views/SettingsView.vue` (+ test) | toggle tema minimale (system/light/dark) | T5 |

---

## Task 1: nuovo `tokens.css` (sistema + alias-bridge, de-tematizzazione)

**Files:**
- Modify (rewrite): `app/desktop/src/renderer/src/styles/tokens.css`

> **Verifica (TDD-N/A per CSS puro):** non c'e harness unit per il CSS; questo task e verificato da `pnpm test` che resta verde (i test componenti non asseriscono colori), dal guard `no-color-drift.test.ts`, e da `pnpm -r typecheck`. Gli alias garantiscono che ogni consumatore esistente continui a risolvere.

- [ ] **Step 1: Riscrivi `tokens.css`** con questo contenuto completo:

```css
/* Design system D-02a: warm-neutral, light + dark, accento terracotta statico.
   Single source of truth. I non-cromatici stanno in :root; i cromatici hanno una
   palette light (default) e una dark, via prefers-color-scheme + override [data-theme]. */
:root {
  color-scheme: light dark;

  /* forma */
  --r: 14px;
  --r-sm: 10px;
  --r-xs: 8px;
  --r-pill: 999px;

  /* spazio (scala 4px) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;

  /* tipografia */
  --f-sans: 'Archivo Variable', system-ui, 'Helvetica Neue', sans-serif;
  --f-mono: 'JetBrains Mono Variable', ui-monospace, monospace;
  --fs-display: 1.75rem;
  --fs-h1: 1.375rem;
  --fs-h2: 1.125rem;
  --fs-h3: 1rem;
  --fs-body: 0.9375rem;
  --fs-sm: 0.8125rem;
  --fs-xs: 0.6875rem;
  --fw-regular: 400;
  --fw-medium: 500;
  --fw-semibold: 600;
  --lh-body: 1.6;

  /* elevation + motion */
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.06);
  --shadow-2: 0 6px 20px rgba(0, 0, 0, 0.10);
  --dur-fast: 120ms;
  --dur: 200ms;
  --ease: cubic-bezier(0.2, 0, 0, 1);

  /* palette LIGHT (default) */
  --bg: #F3EFE7;
  --surface: #FBF9F4;
  --surface-2: #F7F4EC;
  --well: #EEE9DF;
  --text: #2B2824;
  --text-2: #6E6A61;
  --text-3: #9A958A;
  --line: rgba(43, 40, 34, 0.10);
  --line-2: rgba(43, 40, 34, 0.16);
  --accent: #BD6A4C;
  --accent-press: #A8552F;
  --accent-soft: rgba(189, 106, 76, 0.13);
  --on-accent: #FFFFFF;
  --ok: #5E8C61;
  --bad: #C2403A;
  --warn: #B7791F;

  /* alias-bridge (rimossi a fine migrazione, T3/T4) */
  --ink: var(--bg);
  --ink-edge: var(--bg);
  --panel: var(--surface);
  --panel-hi: var(--surface-2);
  --raise: var(--surface-2);
  --accent-dim: var(--accent-soft);
  --f-display: var(--f-sans);
  --f-read: var(--f-sans);
  --f-ui: var(--f-sans);
}

/* palette DARK: applicata se l OS preferisce scuro e l utente non ha forzato light */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --bg: #181613;
    --surface: #232019;
    --surface-2: #2A261F;
    --well: #14110F;
    --text: #ECE7DE;
    --text-2: #A8A399;
    --text-3: #75716A;
    --line: rgba(236, 231, 222, 0.10);
    --line-2: rgba(236, 231, 222, 0.18);
    --accent: #D98A6A;
    --accent-press: #E0A084;
    --accent-soft: rgba(217, 138, 106, 0.18);
    --on-accent: #1B1916;
    --ok: #8FBF93;
    --bad: #E08079;
    --warn: #E0A84E;
  }
}

/* override esplicito dell utente (toggle, T2): batte il media query */
[data-theme='dark'] {
  --bg: #181613;
  --surface: #232019;
  --surface-2: #2A261F;
  --well: #14110F;
  --text: #ECE7DE;
  --text-2: #A8A399;
  --text-3: #75716A;
  --line: rgba(236, 231, 222, 0.10);
  --line-2: rgba(236, 231, 222, 0.18);
  --accent: #D98A6A;
  --accent-press: #E0A084;
  --accent-soft: rgba(217, 138, 106, 0.18);
  --on-accent: #1B1916;
  --ok: #8FBF93;
  --bad: #E08079;
  --warn: #E0A84E;
}
```

(La palette dark compare due volte — nel media query e in `[data-theme='dark']`: e il pattern canonico di theming in CSS puro per "default segue OS + override utente". I valori devono essere identici nei due blocchi. Niente `[data-phase]`, niente `--brass*/--clay/--sage/--steel`: rimossi.)

- [ ] **Step 2: Suite + guard + typecheck**

Run: `pnpm test`
Expected: 843 verdi (nessuna regressione; i consumatori risolvono via i token rinominati o gli alias). Se fallisce con `NODE_MODULE_VERSION 146 ... requires 137` → `pnpm rebuild:node`, poi ripeti.
Run: `pnpm exec vitest run app/desktop/src/renderer/src/no-color-drift.test.ts`
Expected: PASS.
Run: `pnpm -r typecheck`
Expected: 6 progetti, nessun errore.

- [ ] **Step 3: Commit**

```bash
git status --short
git add app/desktop/src/renderer/src/styles/tokens.css
git commit -m "feat(renderer): nuovo design system token warm-neutral light/dark + alias-bridge (D-02a T1)"
```

---

## Task 2: `useTheme` composable + wiring bootstrap

**Files:**
- Create: `app/desktop/src/renderer/src/composables/use-theme.ts`
- Create: `app/desktop/src/renderer/src/composables/use-theme.test.ts`
- Modify: `app/desktop/src/renderer/src/renderer.ts` (init prima del mount)

- [ ] **Step 1: Scrivi il test (fallira)** — `app/desktop/src/renderer/src/composables/use-theme.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useTheme, THEME_KEY } from './use-theme';

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('default e system e non imposta data-theme', () => {
    const t = useTheme();
    t.init();
    expect(t.theme.value).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('set light applica data-theme=light e persiste', () => {
    const t = useTheme();
    t.set('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    expect(t.theme.value).toBe('light');
  });

  it('set dark applica data-theme=dark e persiste', () => {
    const t = useTheme();
    t.set('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
  });

  it('set system rimuove data-theme e persiste system', () => {
    const t = useTheme();
    t.set('dark');
    t.set('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem(THEME_KEY)).toBe('system');
  });

  it('init ripristina la preferenza persistita', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    const t = useTheme();
    t.init();
    expect(t.theme.value).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
```

- [ ] **Step 2: Run, verifica FAIL**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/composables/use-theme.test.ts`
Expected: FAIL (`./use-theme` non esiste).

- [ ] **Step 3: Crea `composables/use-theme.ts`**

```ts
import { ref } from 'vue';

export type ThemeChoice = 'system' | 'light' | 'dark';
export const THEME_KEY = 'loomn-theme';

const theme = ref<ThemeChoice>('system');

function apply(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

/** Tema light/dark renderer-only (D-02a): 'system' segue prefers-color-scheme (nessun data-theme),
 *  'light'/'dark' forzano via data-theme sul root e persistono in localStorage. */
export function useTheme(): {
  theme: typeof theme;
  set: (choice: ThemeChoice) => void;
  init: () => void;
} {
  function set(choice: ThemeChoice): void {
    theme.value = choice;
    localStorage.setItem(THEME_KEY, choice);
    apply(choice);
  }
  function init(): void {
    const saved = localStorage.getItem(THEME_KEY);
    const choice: ThemeChoice = saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
    theme.value = choice;
    apply(choice);
  }
  return { theme, set, init };
}
```

- [ ] **Step 4: Run, verifica PASS**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/composables/use-theme.test.ts`
Expected: PASS (5 test).

- [ ] **Step 5: Init nel bootstrap** — in `renderer.ts`, dopo l'import degli stili e prima di `app.mount('#app')`, aggiungi:

```ts
import { useTheme } from './composables/use-theme';
```
e prima del mount:
```ts
useTheme().init();
```
(Posiziona `useTheme().init()` subito prima di `app.mount('#app')` per evitare flash di tema. NON toccare il ramo self-test ne `runFirstRun`.)

- [ ] **Step 6: Typecheck + suite**

Run: `pnpm -r typecheck` → nessun errore.
Run: `pnpm test` → ~848 verdi (843 + 5).

- [ ] **Step 7: Commit**

```bash
git status --short
git add app/desktop/src/renderer/src/composables/use-theme.ts app/desktop/src/renderer/src/composables/use-theme.test.ts app/desktop/src/renderer/src/renderer.ts
git commit -m "feat(renderer): useTheme (system/light/dark) persistito + init al boot (D-02a T2)"
```

---

## Task 3: migra i token di superficie + bg flat, rimuovi gli alias surface

**Files (rename `var(--panel)`→`var(--surface)`, `var(--panel-hi)`/`var(--raise)`→`var(--surface-2)`, `var(--ink)`/`var(--ink-edge)`→`var(--bg)`):**
- `app/desktop/src/renderer/src/styles/base.css` (`--ink`/`--ink-edge` al gradiente riga 14 → bg flat; `--raise` riga 30; `--panel` riga 32)
- `App.vue` (`--panel` 76,137; `--panel-hi` 110; `--raise` 92)
- `components/EncounterPanel.vue` (`--panel` 130,137)
- `components/GmConsole.vue` (`--panel` 206)
- `components/LoomnPanel.vue` (`--panel` 21)
- `components/LoomnDialog.vue` (`--panel` 54)
- `views/JournalView.vue` (`--panel` 101)
- Modify: `app/desktop/src/renderer/src/styles/tokens.css` (rimuovi gli alias `--ink`, `--ink-edge`, `--panel`, `--panel-hi`, `--raise`)

- [ ] **Step 1: base.css — bg flat + rename**

In `base.css` riga ~14, sostituisci lo sfondo a `radial-gradient(... var(--ink) ... var(--ink-edge) ...)` del body con un fondo **piatto**: `background: var(--bg);` (cozy = superfici piatte). Rinomina `var(--raise)` (riga ~30, scrollbar thumb) → `var(--surface-2)` e `var(--panel)` (riga ~32, scrollbar border) → `var(--surface)`.

- [ ] **Step 2: Rename nei `.vue`**

In ciascun file elencato, sostituisci `var(--panel)`→`var(--surface)`, `var(--panel-hi)`→`var(--surface-2)`, `var(--raise)`→`var(--surface-2)`. (Sono i `<style scoped>`; nessun cambiamento di logica.)

- [ ] **Step 3: Rimuovi gli alias surface da `tokens.css`**

Cancella le righe alias `--ink: var(--bg);`, `--ink-edge: var(--bg);`, `--panel: var(--surface);`, `--panel-hi: var(--surface-2);`, `--raise: var(--surface-2);`. (Restano gli alias `--accent-dim`, `--f-display`, `--f-read`, `--f-ui` per T4.)

- [ ] **Step 4: Verifica nessun riferimento orfano**

Run (Bash): `grep -rnE "var\(--(panel|panel-hi|raise|ink|ink-edge)\)" app/desktop/src/renderer/src/ || echo "no match"`
Expected: `no match`.

- [ ] **Step 5: Suite + guard + typecheck**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/no-color-drift.test.ts` → PASS.
Run: `pnpm test` → ~848 verdi.
Run: `pnpm -r typecheck` → nessun errore.

- [ ] **Step 6: Commit**

```bash
git status --short
git add app/desktop/src/renderer/src/styles/base.css app/desktop/src/renderer/src/styles/tokens.css app/desktop/src/renderer/src/App.vue app/desktop/src/renderer/src/components/EncounterPanel.vue app/desktop/src/renderer/src/components/GmConsole.vue app/desktop/src/renderer/src/components/LoomnPanel.vue app/desktop/src/renderer/src/components/LoomnDialog.vue app/desktop/src/renderer/src/views/JournalView.vue
git commit -m "refactor(renderer): migra token superficie a --bg/--surface/--surface-2 + bg flat (D-02a T3)"
```

---

## Task 4: consolida i font in `--f-sans`, rinomina `--accent-dim`→`--accent-soft`, rimuovi i serif

**Files (rename `var(--f-display)`/`var(--f-read)`/`var(--f-ui)`/`var(--f-serif, serif)`→`var(--f-sans)`):**
- `App.vue` (81,105,142 `--f-display`; `--accent-dim` 115,155)
- `components/EncounterPanel.vue` (119 `--f-display`; 122 `--accent-dim`)
- `components/LoomnDialog.vue` (81 `--f-display`)
- `components/LoomnPanel.vue` (46 `--f-display`)
- `views/CompanyView.vue` (181,185 `--f-display`; 191 `--f-ui`)
- `components/NarrativePanel.vue` (68 `--f-read`)
- `views/JournalView.vue` (107,113 `--f-read`; 106,117 `--f-ui`)
- `components/LoomnButton.vue` (24 `--f-ui`; 43 `--accent-dim`)
- `components/onboarding/BriefStep.vue` (52,72 `--f-ui`)
- `components/onboarding/OpeningStep.vue` (29 `--f-ui`; **25 `var(--f-serif, serif)`→`var(--f-sans)`**)
- `components/onboarding/ReviewStep.vue` (62,76 `--f-ui`; 86 `--accent-dim`)
- `components/SheetPanel.vue` (103 `--f-ui`; 128 `--accent-dim`)
- `components/FirstRunBanner.vue` (26 `--accent-dim`)
- Modify: `app/desktop/src/renderer/src/styles/index.ts` (rimuovi import serif)
- Modify: `app/desktop/src/renderer/src/styles/tokens.css` (rimuovi alias `--accent-dim`, `--f-display`, `--f-read`, `--f-ui`)

- [ ] **Step 1: Rename font nei `.vue`**

In ogni file, sostituisci `var(--f-display)`→`var(--f-sans)`, `var(--f-read)`→`var(--f-sans)`, `var(--f-ui)`→`var(--f-sans)`, e in `OpeningStep.vue:25` `var(--f-serif, serif)`→`var(--f-sans)`.

- [ ] **Step 2: Rename accent-dim nei `.vue`**

Sostituisci `var(--accent-dim)`→`var(--accent-soft)` in: `App.vue`, `EncounterPanel.vue`, `LoomnButton.vue`, `ReviewStep.vue`, `SheetPanel.vue`, `FirstRunBanner.vue`.

- [ ] **Step 3: Rimuovi gli import serif** — in `styles/index.ts` cancella:

```ts
import '@fontsource-variable/fraunces';
import '@fontsource-variable/newsreader';
```
(Lascia gli import di `archivo` e `jetbrains-mono`. NON toccare `package.json`: lasciare le dipendenze inutilizzate e fuori scope/safe; rimuoverle e un follow-up.)

- [ ] **Step 4: Rimuovi gli alias rimasti da `tokens.css`**

Cancella `--accent-dim: var(--accent-soft);`, `--f-display: var(--f-sans);`, `--f-read: var(--f-sans);`, `--f-ui: var(--f-sans);`. A questo punto `tokens.css` non ha piu alias.

- [ ] **Step 5: Verifica nessun riferimento orfano**

Run (Bash): `grep -rnE "var\(--(accent-dim|f-display|f-read|f-ui|f-serif)\)" app/desktop/src/renderer/src/ || echo "no match"`
Expected: `no match`.

- [ ] **Step 6: Suite + guard + typecheck**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/no-color-drift.test.ts` → PASS.
Run: `pnpm test` → ~848 verdi.
Run: `pnpm -r typecheck` → nessun errore.

- [ ] **Step 7: Commit**

```bash
git status --short
git add app/desktop/src/renderer/src/styles/tokens.css app/desktop/src/renderer/src/styles/index.ts app/desktop/src/renderer/src/App.vue app/desktop/src/renderer/src/components/ app/desktop/src/renderer/src/views/
git commit -m "refactor(renderer): consolida font in --f-sans (no serif) + --accent-dim->--accent-soft (D-02a T4)"
```

---

## Task 5: toggle tema minimale in Impostazioni + verifica finale

**Files:**
- Modify: `app/desktop/src/renderer/src/views/SettingsView.vue` (selettore tema)
- Modify: `app/desktop/src/renderer/src/views/SettingsView.test.ts` (test del selettore)

> La collocazione/polish definitiva del controllo tema e D‑02c; qui un selettore minimale in Impostazioni rende D‑02a usabile end-to-end e testabile.

- [ ] **Step 1: Aggiungi il test (fallira)** — in `SettingsView.test.ts` aggiungi (lo stub e il mount sono gia presenti dai test D-01c; riusa `mountView()` e `setActivePinia`):

```ts
  it('il selettore tema imposta data-theme e persiste', async () => {
    stub({ ok: true, version: 1, safeStorageAvailable: true, providerConfigured: true, provider: { baseUrl: 'http://x/v1', model: 'm', hasApiKey: true } });
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    const { w } = mountView();
    await flushPromises();
    await w.find('[data-test="theme-dark"]').trigger('click');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('loomn-theme')).toBe('dark');
  });
```

- [ ] **Step 2: Run, verifica FAIL**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/views/SettingsView.test.ts`
Expected: FAIL (nessun elemento `[data-test="theme-dark"]`).

- [ ] **Step 3: Aggiungi il selettore in `SettingsView.vue`**

Nel `<script setup>` aggiungi `import { useTheme } from '../composables/use-theme';` e `const themeCtl = useTheme();`. Nel template, dentro il `LoomnPanel`, aggiungi una sezione:

```vue
      <fieldset class="field">
        <legend class="field__label">Tema</legend>
        <div class="key-modes">
          <label><input type="radio" :checked="themeCtl.theme.value === 'system'" @change="themeCtl.set('system')" /> Sistema</label>
          <label><input data-test="theme-light" type="radio" :checked="themeCtl.theme.value === 'light'" @change="themeCtl.set('light')" /> Chiaro</label>
          <label><input data-test="theme-dark" type="radio" :checked="themeCtl.theme.value === 'dark'" @change="themeCtl.set('dark')" /> Scuro</label>
        </div>
      </fieldset>
```
(Riusa le classi `field`/`field__label`/`key-modes` gia presenti in SettingsView. Niente nuovo CSS.)

- [ ] **Step 4: Run, verifica PASS**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/views/SettingsView.test.ts`
Expected: PASS (i test esistenti + il nuovo).

- [ ] **Step 5: Verifica finale aggregata**

Run: `pnpm -r typecheck` → nessun errore.
Run: `pnpm test` → ~849 verdi (848 + 1).
Run: `pnpm exec vitest run app/desktop/src/renderer/src/no-color-drift.test.ts` → PASS.

- [ ] **Step 6: Verifica VISIVA (preview tools, raccomandata per un redesign)**

Build del renderer e ispezione in browser headless (pattern F6): conferma che le superfici rendano warm-neutral, che il toggle `data-theme` cambi light/dark, e che nessun testo risulti su sfondo sbagliato. Screenshot light + dark da mostrare all'utente. (Step di verifica dell'orchestratore, non un test vitest.)

- [ ] **Step 7: Commit**

```bash
git status --short
git add app/desktop/src/renderer/src/views/SettingsView.vue app/desktop/src/renderer/src/views/SettingsView.test.ts
git commit -m "feat(renderer): selettore tema in Impostazioni (system/light/dark) (D-02a T5)"
```

---

## Self-Review (eseguita contro lo spec)

**1. Copertura spec:**
- §4 sistema di token (superfici/testo/linee/accento/stato/forma/spacing/type/elevation/motion) → T1 (definizione) + T3/T4 (migrazione consumatori). ✓
- §4.7 mappa di migrazione vecchio→nuovo → T1 (alias) + T3 (surface) + T4 (accent-dim/font). ✓
- §5 theming `[data-theme]` + prefers-color-scheme + `useTheme` (default OS, persistito) → T1 (CSS) + T2 (composable + init). ✓
- §6 tipografia (Archivo unico sans + JetBrains Mono, serif rimossi) → T4 (consolidamento + rimozione import). ✓
- §7 de-tematizzazione (rimozione brass/clay/sage/steel + phase-accent) → T1 (tokens + niente `[data-phase]`). App.vue mantiene `data-phase` (test App.test invariato) ma non ricolora. ✓
- §8 testing (useTheme + no-color-drift, ABI jsdom, niente gate) → T2/T5 + guard in ogni task. ✓
- Toggle usabile → T5 (selettore in Impostazioni; placement definitivo in D-02c). ✓

**2. Placeholder scan:** nessun TBD/TODO; ogni step ha CSS/codice/comando concreto. I rename sono meccanici con file:line dalla mappa consumatori.

**3. Type/nomi consistency:** `--bg/--surface/--surface-2/--accent-soft/--f-sans` usati in modo identico fra T1 (definizione) e T3/T4 (consumo); `THEME_KEY`/`ThemeChoice`/`useTheme` coerenti fra T2 e T5; `data-theme`/`loomn-theme` coerenti fra useTheme, tokens.css e il test SettingsView.

**Nota su App.test.ts:** asserisce che `data-phase` sia impostato dal read-model — resta vero (non rimuoviamo l'attributo, solo l'effetto cromatico). Se per qualche motivo App.vue dovesse togliere `data-phase`, andrebbe aggiornato anche quel test; il piano NON lo rimuove.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-24-d02a-design-foundations-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — un subagent fresco per task, review a due stadi (spec + code-quality), final review opus; come per D-01c. Branch `feat/d02a-design-foundations`.
2. **Inline Execution** — i task in questa sessione con checkpoint.

Which approach?
