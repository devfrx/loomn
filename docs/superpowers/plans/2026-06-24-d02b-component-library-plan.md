# D‑02b — Libreria componenti — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ricostruire i componenti condivisi sui token di D‑02a, aggiungere i token di supporto mancanti (scrim, ombre per‑tema, sfondi di stato) e introdurre 4 primitivi riusabili (`LoomnCard`, `LoomnField`, `LoomnTextInput`, `LoomnTag`), adottando ognuno in 1 punto ovvio.

**Architecture:** Renderer‑only. I componenti vivono in `app/desktop/src/renderer/src/components/`, `<script setup lang="ts">`, e usano SOLO `var(--token)` (il guard `no-color-drift.test.ts` resta verde). I token di supporto sono cromatici → vanno nei blocchi per‑tema di `tokens.css` (light default in `:root`, dark nei due blocchi dark). Ogni componente ha un test Vitest in isolamento (jsdom). Adozione mirata: 1 swap pulito per primitivo, behaviour‑preserving.

**Tech Stack:** Vue 3 (`<script setup>`), CSS custom properties, Vitest + @vue/test-utils (jsdom), reka-ui (solo `LoomnDialog`).

**Baseline (a inizio D‑02b):** `main` a `4e92c24` (spec D‑02b). **850 test**, `pnpm -r typecheck` pulito (6 progetti), tree pulito (`.claude/`/`.superpowers/` ignorati). Spec autorita: `docs/superpowers/specs/2026-06-24-d02b-component-library-design.md`.

---

## Vincoli trasversali (ogni task)

- **Scope discipline:** tocca SOLO i file elencati nel task. MAI `tsconfig*`, `vitest.config*`, `vitest.workspace.ts`, `electron.vite.config*`, `package.json`. Nessuna nuova dipendenza. `git status --short` prima di ogni commit; stage per path esplicito; `.claude/`/`.superpowers/` MAI committati.
- **No hex hardcoded nei `.vue`:** il guard `no-color-drift.test.ts` deve restare verde. Tutti i colori via `var(--token)`.
- **Renderer-only, ABI jsdom, NIENTE gate Electron** (non tocca main/IPC).
- **Anti-apostrofo** nelle `it()/describe()` in apici singoli (no `l'`, `un'`, `c'è` → usa `l attore`, `c e`).
- **TS strict** (`exactOptionalPropertyTypes`): spread condizionali, niente `field: undefined`.
- Comando test singolo (dalla root): `pnpm exec vitest run <path>`. Suite: `pnpm test`. Typecheck: `pnpm -r typecheck`.
- **⚠️ ABI:** se `pnpm test` da `NODE_MODULE_VERSION 146 ... requires 137` → `pnpm rebuild:node`; se EPERM, killa i processi Loomn fantasma (electron/electron-vite) che tengono `better_sqlite3.node` poi rebuild.

---

## File Structure

| File | Responsabilita | Task |
|---|---|---|
| `styles/tokens.css` | token di supporto (scrim, ombre per‑tema, *-soft) | T1 |
| `components/LoomnButton.vue` (+ `.test.ts`) | varianti solid/ghost/danger, focus, disabled, solid→terracotta | T2 |
| `components/onboarding/{BriefStep,OpeningStep,ReviewStep}.vue` | adotta `LoomnButton --solid` nei CTA | T2 |
| `components/LoomnPanel.vue` | ombre→token | T3 |
| `components/LoomnDialog.vue` | scrim/ombra→token, focus close | T3 |
| `components/PanelError.vue` | tokenizza dimensione testo | T3 |
| `components/LoomnCard.vue` (+ `.test.ts`) | nuovo primitivo card | T4 |
| `components/LoomnTag.vue` (+ `.test.ts`) | nuovo primitivo tag | T4 |
| `views/CompanyView.vue` | adotta `LoomnCard` (carta attore) | T4 |
| `components/SheetPanel.vue` (+ `.test.ts` se serve) | adotta `LoomnTag` (badge) | T4 |
| `components/LoomnField.vue` (+ `.test.ts`) | nuovo primitivo field | T5 |
| `components/LoomnTextInput.vue` (+ `.test.ts`) | nuovo primitivo input (+mono) | T5 |
| `views/SettingsView.vue` | adotta `LoomnField`/`LoomnTextInput` | T5 |

---

## Task 1: Token di supporto in `tokens.css`

**Files:**
- Modify: `app/desktop/src/renderer/src/styles/tokens.css`

> **Verifica (TDD‑N/A per CSS puro):** verificato da `pnpm test` verde (i test non asseriscono i valori delle ombre), dal guard `no-color-drift.test.ts`, e da `pnpm -r typecheck`.

- [ ] **Step 1: Rimuovi `--shadow-1`/`--shadow-2` dal blocco condiviso `:root`**

In `tokens.css`, nel blocco `/* elevation + motion */` di `:root`, CANCELLA le due righe:
```css
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.06);
  --shadow-2: 0 6px 20px rgba(0, 0, 0, 0.10);
```
(Lascia `--dur-fast`, `--dur`, `--ease`.)

- [ ] **Step 2: Aggiungi i token di supporto al blocco LIGHT (`:root`)**

Dentro `:root`, subito dopo la riga `--warn: #B7791F;` (fine della palette LIGHT), aggiungi:
```css

  /* elevazione per-tema + scrim + sfondi di stato (D-02b) */
  --shadow-1: 0 1px 2px rgba(43, 40, 34, 0.06);
  --shadow-2: 0 14px 34px -16px rgba(43, 40, 34, 0.22);
  --scrim: rgba(43, 40, 34, 0.38);
  --ok-soft: rgba(94, 140, 97, 0.14);
  --warn-soft: rgba(183, 121, 31, 0.14);
  --bad-soft: rgba(194, 64, 58, 0.12);
```

- [ ] **Step 3: Aggiungi i valori DARK in entrambi i blocchi dark**

In `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { ... } }`, dopo `--warn: #E0A84E;`, aggiungi:
```css
    --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.35);
    --shadow-2: 0 22px 50px -22px rgba(0, 0, 0, 0.66);
    --scrim: rgba(0, 0, 0, 0.62);
    --ok-soft: rgba(143, 191, 147, 0.16);
    --warn-soft: rgba(224, 168, 78, 0.16);
    --bad-soft: rgba(224, 128, 121, 0.16);
```
E IDENTICAMENTE in `[data-theme='dark'] { ... }`, dopo `--warn: #E0A84E;`, aggiungi le stesse 6 righe (con indentazione a 2 spazi):
```css
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.35);
  --shadow-2: 0 22px 50px -22px rgba(0, 0, 0, 0.66);
  --scrim: rgba(0, 0, 0, 0.62);
  --ok-soft: rgba(143, 191, 147, 0.16);
  --warn-soft: rgba(224, 168, 78, 0.16);
  --bad-soft: rgba(224, 128, 121, 0.16);
```
(I valori dark devono essere identici nei due blocchi — stesso pattern di D‑02a.)

- [ ] **Step 4: Suite + guard + typecheck**

Run: `pnpm test` → 850 verdi.
Run: `pnpm exec vitest run app/desktop/src/renderer/src/no-color-drift.test.ts` → PASS.
Run: `pnpm -r typecheck` → nessun errore.

- [ ] **Step 5: Commit**
```bash
git status --short
git add app/desktop/src/renderer/src/styles/tokens.css
git commit -m "feat(renderer): token di supporto componenti (scrim, ombre per-tema, *-soft) (D-02b T1)"
```

---

## Task 2: `LoomnButton` (solid/ghost/danger) + adozione CTA onboarding

**Files:**
- Modify: `app/desktop/src/renderer/src/components/LoomnButton.vue`
- Modify: `app/desktop/src/renderer/src/components/LoomnButton.test.ts`
- Modify: `app/desktop/src/renderer/src/components/onboarding/BriefStep.vue`
- Modify: `app/desktop/src/renderer/src/components/onboarding/OpeningStep.vue`
- Modify: `app/desktop/src/renderer/src/components/onboarding/ReviewStep.vue`

- [ ] **Step 1: Aggiungi i test (falliranno)** — in `LoomnButton.test.ts`, dentro il `describe('LoomnButton', ...)` aggiungi:
```ts
  it('applica la classe della variant danger', () => {
    const w = mount(LoomnButton, { props: { variant: 'danger' } });
    expect(w.find('button').classes()).toContain('loomn-btn--danger');
  });

  it('default e ghost', () => {
    const w = mount(LoomnButton);
    expect(w.find('button').classes()).toContain('loomn-btn--ghost');
  });
```

- [ ] **Step 2: Run, verifica esito** — `pnpm exec vitest run app/desktop/src/renderer/src/components/LoomnButton.test.ts`. Il test `default e ghost` passa gia (default attuale = ghost); `danger` passa gia anche lui perche la classe e interpolata da `variant` — MA il TIPO non ammette `'danger'` finche non lo aggiungi: `pnpm -r typecheck` deve FALLIRE (props.variant non accetta `'danger'`). Quello e il fallimento guida.

- [ ] **Step 3: Riscrivi `LoomnButton.vue`** con questo contenuto completo:
```vue
<script setup lang="ts">
const props = withDefaults(defineProps<{ variant?: 'solid' | 'ghost' | 'danger'; disabled?: boolean }>(), {
  variant: 'ghost',
  disabled: false,
});
const emit = defineEmits<{ click: [ev: MouseEvent] }>();

function onClick(ev: MouseEvent): void {
  // Belt-and-suspenders: il browser sopprime click su :disabled, ma la guardia tiene i test
  // deterministici (trigger click in jsdom bypassa il gate nativo).
  if (props.disabled) return;
  emit('click', ev);
}
</script>

<template>
  <button class="loomn-btn" :class="`loomn-btn--${variant}`" :disabled="disabled" @click="onClick">
    <slot />
  </button>
</template>

<style scoped>
.loomn-btn {
  font-family: var(--f-sans);
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  padding: 8px 15px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}
.loomn-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.loomn-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.loomn-btn--solid {
  color: var(--on-accent);
  background: var(--accent);
}
.loomn-btn--solid:hover:not(:disabled) {
  background: var(--accent-press);
}
.loomn-btn--ghost {
  color: var(--text);
  border-color: var(--line-2);
  background: var(--well);
}
.loomn-btn--ghost:hover:not(:disabled) {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.loomn-btn--danger {
  color: var(--bad);
  border-color: var(--bad);
  background: transparent;
}
.loomn-btn--danger:hover:not(:disabled) {
  background: var(--bad-soft);
}
</style>
```

- [ ] **Step 4: Run, verifica PASS** — `pnpm exec vitest run app/desktop/src/renderer/src/components/LoomnButton.test.ts` → PASS (6 test). `pnpm -r typecheck` → pulito.

- [ ] **Step 5: Adotta `LoomnButton --solid` nei 3 CTA onboarding**

In ciascuno dei 3 file, sostituisci il bottone CTA accento one‑off con `<LoomnButton variant="solid">`, preservando handler/`:disabled`/testo, e RIMUOVI la regola di stile one‑off corrispondente. Aggiungi l'import se assente: `import LoomnButton from '../LoomnButton.vue';`.
  - `OpeningStep.vue`: il bottone `class="enter"` → `<LoomnButton variant="solid" @click="...">...testo...</LoomnButton>`; cancella la regola `.enter { ... }` e `.enter:hover { ... }`.
  - `BriefStep.vue`: il bottone `class="generate"` → `<LoomnButton variant="solid" :disabled="..." @click="...">...</LoomnButton>`; cancella `.generate { ... }`, `.generate:hover:not(:disabled) { ... }`, `.generate:disabled { ... }`.
  - `ReviewStep.vue`: il bottone `class="confirm"` → `<LoomnButton variant="solid" :disabled="..." @click="...">...</LoomnButton>`; cancella `.confirm { ... }`, `.confirm:hover:not(:disabled) { ... }`, `.confirm:disabled { ... }`.
(NON toccare gli altri bottoni/stili di questi file — es. `.secondary` resta. Verifica che `LoomnButton` non sia gia importato per evitare doppioni.)

- [ ] **Step 6: Verifica orfani CSS + suite + typecheck**

Run (Bash): `grep -rnE "\.(enter|generate|confirm)\b" app/desktop/src/renderer/src/components/onboarding/ || echo "no match"` → deve dare `no match` (le classi one‑off rimosse).
Run: `pnpm exec vitest run app/desktop/src/renderer/src/no-color-drift.test.ts` → PASS.
Run: `pnpm test` → ~851 verdi (850 + 1 nuovo test danger). Lo swap e behaviour‑preserving, MA se un test onboarding (`BriefStep.test.ts`/`OpeningStep.test.ts`/`ReviewStep.test.ts`) seleziona il CTA per la classe one‑off (`.generate`/`.enter`/`.confirm`), aggiorna quel selettore a `.loomn-btn` (o al testo del bottone) — il bottone ora rende `<button class="loomn-btn loomn-btn--solid">`. Mantieni l asserzione di comportamento (click → handler) invariata.
Run: `pnpm -r typecheck` → nessun errore.

- [ ] **Step 7: Commit**
```bash
git status --short
git add app/desktop/src/renderer/src/components/LoomnButton.vue app/desktop/src/renderer/src/components/LoomnButton.test.ts app/desktop/src/renderer/src/components/onboarding/BriefStep.vue app/desktop/src/renderer/src/components/onboarding/OpeningStep.vue app/desktop/src/renderer/src/components/onboarding/ReviewStep.vue
git commit -m "feat(renderer): LoomnButton solid/ghost/danger su token + adozione CTA onboarding (D-02b T2)"
```

---

## Task 3: Rifinitura `LoomnPanel` / `LoomnDialog` / `PanelError` su token

**Files:**
- Modify: `app/desktop/src/renderer/src/components/LoomnPanel.vue`
- Modify: `app/desktop/src/renderer/src/components/LoomnDialog.vue`
- Modify: `app/desktop/src/renderer/src/components/PanelError.vue`

> API invariate → i test esistenti (`LoomnPanel.test.ts`, `LoomnDialog.test.ts`, `PanelError.test.ts`) restano verdi senza modifiche. Solo CSS/token.

- [ ] **Step 1: `LoomnPanel.vue` — ombra hardcoded → token**

Nella regola `.loomn-panel`, sostituisci:
```css
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.03) inset, 0 22px 48px -26px rgba(0, 0, 0, 0.75);
```
con:
```css
  box-shadow: var(--shadow-2);
```
(Lascia il resto invariato: `background: var(--surface)`, `border: 1px solid var(--line)`, `border-radius: var(--r)`, ecc.)

- [ ] **Step 2: `LoomnDialog.vue` — scrim e ombra hardcoded → token + focus close**

Nella regola `.loomn-dialog__overlay`, sostituisci `background: rgba(7, 8, 9, 0.6);` con `background: var(--scrim);`.
Nella regola `.loomn-dialog__content`, sostituisci `box-shadow: 0 30px 70px -30px rgba(0, 0, 0, 0.8);` con `box-shadow: var(--shadow-2);`.
Aggiungi, dopo la regola `.loomn-dialog__close { ... }`, una regola di focus:
```css
.loomn-dialog__close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--r-xs);
}
```

- [ ] **Step 3: `PanelError.vue` — tokenizza la dimensione**

Nella regola `.panel-error`, sostituisci `font-size: 13px;` con `font-size: var(--fs-sm);`. (Lascia `color: var(--bad)`, `margin: 0`.)

- [ ] **Step 4: Suite + guard + typecheck**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/components/LoomnPanel.test.ts app/desktop/src/renderer/src/components/LoomnDialog.test.ts app/desktop/src/renderer/src/components/PanelError.test.ts` → PASS (invariati).
Run: `pnpm exec vitest run app/desktop/src/renderer/src/no-color-drift.test.ts` → PASS.
Run: `pnpm test` → ~851 verdi (invariato rispetto a T2).
Run: `pnpm -r typecheck` → nessun errore.

- [ ] **Step 5: Commit**
```bash
git status --short
git add app/desktop/src/renderer/src/components/LoomnPanel.vue app/desktop/src/renderer/src/components/LoomnDialog.vue app/desktop/src/renderer/src/components/PanelError.vue
git commit -m "refactor(renderer): ombre/scrim di Panel/Dialog su token + focus close + PanelError tokenizzato (D-02b T3)"
```

---

## Task 4: `LoomnCard` + `LoomnTag` (display) + adozione

**Files:**
- Create: `app/desktop/src/renderer/src/components/LoomnCard.vue`
- Create: `app/desktop/src/renderer/src/components/LoomnCard.test.ts`
- Create: `app/desktop/src/renderer/src/components/LoomnTag.vue`
- Create: `app/desktop/src/renderer/src/components/LoomnTag.test.ts`
- Modify: `app/desktop/src/renderer/src/views/CompanyView.vue`
- Modify: `app/desktop/src/renderer/src/components/SheetPanel.vue`

- [ ] **Step 1: Scrivi `LoomnCard.test.ts` (fallira)**:
```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LoomnCard from './LoomnCard.vue';

describe('LoomnCard', () => {
  it('rende lo slot del corpo', () => {
    const w = mount(LoomnCard, { slots: { default: 'corpo' } });
    expect(w.text()).toContain('corpo');
  });

  it('rende l header solo se title o eyebrow o meta', () => {
    const senza = mount(LoomnCard, { slots: { default: 'x' } });
    expect(senza.find('.loomn-card__head').exists()).toBe(false);
    const con = mount(LoomnCard, { props: { title: 'Titolo' }, slots: { default: 'x' } });
    expect(con.find('.loomn-card__head').exists()).toBe(true);
    expect(con.text()).toContain('Titolo');
  });

  it('applica la classe raised', () => {
    const w = mount(LoomnCard, { props: { raised: true }, slots: { default: 'x' } });
    expect(w.find('.loomn-card').classes()).toContain('is-raised');
  });
});
```

- [ ] **Step 2: Run, verifica FAIL** — `pnpm exec vitest run app/desktop/src/renderer/src/components/LoomnCard.test.ts` → FAIL (`./LoomnCard.vue` non esiste).

- [ ] **Step 3: Crea `LoomnCard.vue`**:
```vue
<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{ eyebrow?: string; title?: string; meta?: string; raised?: boolean }>(),
  { raised: false },
);
const hasHead = computed(() => Boolean(props.eyebrow ?? props.title ?? props.meta));
</script>

<template>
  <div class="loomn-card" :class="{ 'is-raised': raised }">
    <div v-if="hasHead" class="loomn-card__head">
      <span v-if="eyebrow" class="loomn-card__eyebrow">{{ eyebrow }}</span>
      <span v-if="title" class="loomn-card__title">{{ title }}</span>
      <span v-if="meta" class="loomn-card__meta">{{ meta }}</span>
    </div>
    <div class="loomn-card__body"><slot /></div>
  </div>
</template>

<style scoped>
.loomn-card {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 12px 14px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  box-shadow: var(--shadow-1);
}
.loomn-card.is-raised {
  border-color: var(--line-2);
  box-shadow: var(--shadow-2);
}
.loomn-card__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.loomn-card__eyebrow {
  font-size: var(--fs-xs);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-3);
  font-weight: var(--fw-semibold);
}
.loomn-card__title {
  font-family: var(--f-sans);
  font-size: var(--fs-h3);
  font-weight: var(--fw-medium);
  color: var(--text);
}
.loomn-card__meta {
  margin-left: auto;
  font-family: var(--f-mono);
  font-size: var(--fs-xs);
  color: var(--text-3);
}
.loomn-card__body {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
</style>
```

- [ ] **Step 4: Run, verifica PASS** — `pnpm exec vitest run app/desktop/src/renderer/src/components/LoomnCard.test.ts` → PASS (3 test).

- [ ] **Step 5: Scrivi `LoomnTag.test.ts` (fallira)**:
```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LoomnTag from './LoomnTag.vue';

describe('LoomnTag', () => {
  it('rende lo slot', () => {
    const w = mount(LoomnTag, { slots: { default: 'attivo' } });
    expect(w.text()).toContain('attivo');
  });

  it('default e neutral', () => {
    const w = mount(LoomnTag, { slots: { default: 'x' } });
    expect(w.find('.loomn-tag').classes()).toContain('loomn-tag--neutral');
  });

  it('applica la variant accent', () => {
    const w = mount(LoomnTag, { props: { variant: 'accent' }, slots: { default: 'x' } });
    expect(w.find('.loomn-tag').classes()).toContain('loomn-tag--accent');
  });
});
```

- [ ] **Step 6: Run, verifica FAIL** — `pnpm exec vitest run app/desktop/src/renderer/src/components/LoomnTag.test.ts` → FAIL.

- [ ] **Step 7: Crea `LoomnTag.vue`**:
```vue
<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'neutral' | 'accent' | 'ok' | 'warn' | 'bad' }>(), {
  variant: 'neutral',
});
</script>

<template>
  <span class="loomn-tag" :class="`loomn-tag--${variant}`"><slot /></span>
</template>

<style scoped>
.loomn-tag {
  display: inline-block;
  font-size: var(--fs-xs);
  letter-spacing: 0.04em;
  padding: 3px 9px;
  border: 1px solid transparent;
  border-radius: var(--r-pill);
}
.loomn-tag--neutral {
  background: var(--surface-2);
  border-color: var(--line);
  color: var(--text-2);
}
.loomn-tag--accent {
  background: var(--accent-soft);
  color: var(--accent-press);
}
.loomn-tag--ok {
  background: var(--ok-soft);
  color: var(--ok);
}
.loomn-tag--warn {
  background: var(--warn-soft);
  color: var(--warn);
}
.loomn-tag--bad {
  background: var(--bad-soft);
  color: var(--bad);
}
</style>
```

- [ ] **Step 8: Run, verifica PASS** — `pnpm exec vitest run app/desktop/src/renderer/src/components/LoomnTag.test.ts` → PASS (3 test).

- [ ] **Step 9: Adotta `LoomnCard` in `CompanyView.vue`**

Importa: `import LoomnCard from '../components/LoomnCard.vue';`.
In ENTRAMBE le sezioni roster (`pcCards` e `npcCards`), sostituisci il contenitore lista e l'elemento card:
- cambia `<ul class="cards">` → `<div class="cards">` e `</ul>` → `</div>`;
- cambia ogni `<li ... class="card">...</li>` → `<LoomnCard ... >...</LoomnCard>` mantenendo `:key` e tutto il contenuto interno (`card__head`, `card__res`, `card__meta`, `rel`) invariato.
Nel `<style scoped>` CANCELLA la regola `.card { ... }` (LoomnCard fornisce ora superficie/bordo/ombra). LASCIA le regole del contenuto (`.card__head`, `.card__name`, `.card__lvl`, `.card__res`, `.res`, `.card__meta`, `.rel`, `.rel__row`) e `.cards`.

- [ ] **Step 10: Adotta `LoomnTag` in `SheetPanel.vue`**

Importa: `import LoomnTag from './LoomnTag.vue';`.
Sostituisci `<span v-if="it.equipped" class="item__badge">equipaggiato</span>` con `<LoomnTag v-if="it.equipped" variant="accent">equipaggiato</LoomnTag>`.
Nel `<style scoped>` CANCELLA la regola `.item__badge { ... }`.

- [ ] **Step 11: Verifica orfani + suite + guard + typecheck**

Run (Bash): `grep -rnE "class=\"card\"|item__badge" app/desktop/src/renderer/src/views/CompanyView.vue app/desktop/src/renderer/src/components/SheetPanel.vue || echo "no match"` → `no match`.
Run: `pnpm exec vitest run app/desktop/src/renderer/src/no-color-drift.test.ts` → PASS.
Run: `pnpm test` → ~857 verdi (851 + 6 nuovi test; CompanyView.test/SheetPanel.test esistenti restano verdi — gli swap sono behaviour‑preserving). Se `SheetPanel.test.ts` asserisse `.item__badge`, aggiorna il selettore a `.loomn-tag` (ma di norma asserisce il testo `equipaggiato`).
Run: `pnpm -r typecheck` → nessun errore.

- [ ] **Step 12: Commit**
```bash
git status --short
git add app/desktop/src/renderer/src/components/LoomnCard.vue app/desktop/src/renderer/src/components/LoomnCard.test.ts app/desktop/src/renderer/src/components/LoomnTag.vue app/desktop/src/renderer/src/components/LoomnTag.test.ts app/desktop/src/renderer/src/views/CompanyView.vue app/desktop/src/renderer/src/components/SheetPanel.vue
git commit -m "feat(renderer): LoomnCard + LoomnTag su token + adozione Compagnia/Scheda (D-02b T4)"
```

---

## Task 5: `LoomnField` + `LoomnTextInput` (form) + adozione + verifica finale

**Files:**
- Create: `app/desktop/src/renderer/src/components/LoomnField.vue`
- Create: `app/desktop/src/renderer/src/components/LoomnField.test.ts`
- Create: `app/desktop/src/renderer/src/components/LoomnTextInput.vue`
- Create: `app/desktop/src/renderer/src/components/LoomnTextInput.test.ts`
- Modify: `app/desktop/src/renderer/src/views/SettingsView.vue`

- [ ] **Step 1: Scrivi `LoomnField.test.ts` (fallira)**:
```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LoomnField from './LoomnField.vue';

describe('LoomnField', () => {
  it('rende label e slot del controllo', () => {
    const w = mount(LoomnField, { props: { label: 'Nome' }, slots: { default: '<input>' } });
    expect(w.find('.loomn-field__label').text()).toBe('Nome');
    expect(w.find('input').exists()).toBe(true);
  });

  it('mostra hint quando non c e errore', () => {
    const w = mount(LoomnField, { props: { hint: 'aiuto' } });
    expect(w.find('.loomn-field__hint').text()).toBe('aiuto');
    expect(w.find('.loomn-field__hint--error').exists()).toBe(false);
  });

  it('mostra error e nasconde hint quando error e valorizzato', () => {
    const w = mount(LoomnField, { props: { hint: 'aiuto', error: 'obbligatorio' } });
    const msg = w.find('.loomn-field__hint');
    expect(msg.text()).toBe('obbligatorio');
    expect(msg.classes()).toContain('loomn-field__hint--error');
  });
});
```

- [ ] **Step 2: Run, verifica FAIL** — `pnpm exec vitest run app/desktop/src/renderer/src/components/LoomnField.test.ts` → FAIL.

- [ ] **Step 3: Crea `LoomnField.vue`**:
```vue
<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ label?: string; hint?: string; error?: string | null }>();
const message = computed(() => (props.error != null && props.error !== '' ? props.error : props.hint));
const isError = computed(() => props.error != null && props.error !== '');
</script>

<template>
  <div class="loomn-field">
    <span v-if="label" class="loomn-field__label">{{ label }}</span>
    <slot />
    <span v-if="message" class="loomn-field__hint" :class="{ 'loomn-field__hint--error': isError }">{{ message }}</span>
  </div>
</template>

<style scoped>
.loomn-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.loomn-field__label {
  font-size: var(--fs-xs);
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: var(--text-3);
  font-weight: var(--fw-semibold);
}
.loomn-field__hint {
  font-size: var(--fs-sm);
  color: var(--text-3);
}
.loomn-field__hint--error {
  color: var(--bad);
}
</style>
```

- [ ] **Step 4: Run, verifica PASS** — `pnpm exec vitest run app/desktop/src/renderer/src/components/LoomnField.test.ts` → PASS (3 test).

- [ ] **Step 5: Scrivi `LoomnTextInput.test.ts` (fallira)**:
```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LoomnTextInput from './LoomnTextInput.vue';

describe('LoomnTextInput', () => {
  it('riflette modelValue nel valore dell input', () => {
    const w = mount(LoomnTextInput, { props: { modelValue: 'ciao' } });
    expect((w.find('input').element as HTMLInputElement).value).toBe('ciao');
  });

  it('emette update:modelValue sull input', async () => {
    const w = mount(LoomnTextInput, { props: { modelValue: '' } });
    await w.find('input').setValue('x');
    expect(w.emitted('update:modelValue')).toEqual([['x']]);
  });

  it('applica la classe mono', () => {
    const w = mount(LoomnTextInput, { props: { modelValue: '', mono: true } });
    expect(w.find('input').classes()).toContain('is-mono');
  });

  it('applica la classe invalid', () => {
    const w = mount(LoomnTextInput, { props: { modelValue: '', invalid: true } });
    expect(w.find('input').classes()).toContain('is-invalid');
  });
});
```

- [ ] **Step 6: Run, verifica FAIL** — `pnpm exec vitest run app/desktop/src/renderer/src/components/LoomnTextInput.test.ts` → FAIL.

- [ ] **Step 7: Crea `LoomnTextInput.vue`**:
```vue
<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string;
    type?: string;
    placeholder?: string;
    mono?: boolean;
    invalid?: boolean;
    disabled?: boolean;
  }>(),
  { type: 'text', mono: false, invalid: false, disabled: false },
);
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <input
    class="loomn-input"
    :class="{ 'is-mono': mono, 'is-invalid': invalid }"
    :type="type"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>

<style scoped>
.loomn-input {
  font-family: var(--f-sans);
  font-size: var(--fs-sm);
  color: var(--text);
  background: var(--well);
  border: 1px solid var(--line-2);
  border-radius: var(--r-sm);
  padding: 9px 12px;
  transition: border-color var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
}
.loomn-input.is-mono {
  font-family: var(--f-mono);
}
.loomn-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.loomn-input.is-invalid {
  border-color: var(--bad);
}
.loomn-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
```

- [ ] **Step 8: Run, verifica PASS** — `pnpm exec vitest run app/desktop/src/renderer/src/components/LoomnTextInput.test.ts` → PASS (4 test).

- [ ] **Step 9: Adotta in `SettingsView.vue` (campi Base URL e Model)**

Importa: `import LoomnField from '../components/LoomnField.vue';` e `import LoomnTextInput from '../components/LoomnTextInput.vue';`.
Sostituisci i due `<label class="field">` di Base URL e Model con `LoomnField` + `LoomnTextInput`:
```vue
        <LoomnField label="Base URL">
          <LoomnTextInput v-model="form.baseUrl" mono placeholder="http://localhost:1234/v1" />
        </LoomnField>
        <LoomnField label="Model">
          <LoomnTextInput v-model="form.model" placeholder="local-model" />
        </LoomnField>
```
(Lascia INVARIATI il `<fieldset class="field">` della Chiave API e il `<fieldset class="field">` del Tema — usano radio/`<legend>`, fuori dallo scope di questo swap.) Nel `<style scoped>`, lascia `.field`/`.field__label`/`.field__input` finche sono ancora usati dai fieldset rimasti; il `.field__input` standalone dei due input rimossi non serve piu ma e condiviso → NON cancellarlo (lo usano i fieldset/altri input). Verifica che i test esistenti di `SettingsView.test.ts` restino verdi: usano `w.findAll('input[type="text"]')` → `LoomnTextInput` rende `<input type="text">`, quindi i selettori e l ordine (baseUrl poi model) restano validi.

- [ ] **Step 10: Suite + guard + typecheck**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/views/SettingsView.test.ts` → PASS (i 4 test esistenti restano verdi).
Run: `pnpm exec vitest run app/desktop/src/renderer/src/no-color-drift.test.ts` → PASS.
Run: `pnpm test` → ~864 verdi (857 + 7 nuovi test Field/TextInput).
Run: `pnpm -r typecheck` → nessun errore.

- [ ] **Step 11: Verifica VISIVA (preview tools, light/dark) — step dell orchestratore**

Build del renderer + ispezione headless (pattern D‑02a T5): stub `window.loomn` (getStatus providerConfigured:false → `/impostazioni`), poi naviga le superfici toccate (Impostazioni, Compagnia, Scheda, onboarding) e conferma in light+dark: bottoni terracotta (solid) / contorno (danger), card con ombra morbida, field/input con focus a alone, tag accent, dialog con scrim tokenizzato. Niente hex hardcoded a video. (Lo screenshot del preview-tool puo andare in timeout: il `getComputedStyle` + lo snapshot a11y sono prova sufficiente, come in D‑02a.)

- [ ] **Step 12: Commit**
```bash
git status --short
git add app/desktop/src/renderer/src/components/LoomnField.vue app/desktop/src/renderer/src/components/LoomnField.test.ts app/desktop/src/renderer/src/components/LoomnTextInput.vue app/desktop/src/renderer/src/components/LoomnTextInput.test.ts app/desktop/src/renderer/src/views/SettingsView.vue
git commit -m "feat(renderer): LoomnField + LoomnTextInput su token + adozione form Impostazioni (D-02b T5)"
```

---

## Self-Review (eseguita contro lo spec)

**1. Copertura spec:**
- §4 token di supporto (scrim, ombre per‑tema, *-soft) → T1. ✓
- §5.1 componenti rifiniti (LoomnButton solid→terracotta + danger + focus; LoomnPanel ombre→token; LoomnDialog scrim/ombra→token + focus close; PanelError tokenizzato) → T2 (button) + T3 (panel/dialog/panelerror). ✓
- §5.2 primitivi nuovi (LoomnCard, LoomnField, LoomnTextInput, LoomnTag) → T4 (Card/Tag) + T5 (Field/TextInput). ✓
- §6 adozione mirata (CTA onboarding → LoomnButton; SettingsView → Field/TextInput; SheetPanel badge → Tag; CompanyView card → Card) → T2 + T5 + T4. ✓
- §4.4 focus/disabled convenzioni (bottoni outline; input bordo+alone; disabled opacity) → LoomnButton/LoomnTextInput. ✓
- §7 testing (test per componente, guard verde, no gate Electron, verifica visiva) → ogni task + T5 step 11. ✓

**2. Placeholder scan:** nessun TBD/TODO; ogni componente ha codice completo; le adozioni elencano file, import, swap e regole da cancellare.

**3. Type/nomi consistency:** `variant` di LoomnButton (`solid|ghost|danger`) coerente fra .vue e test; `LoomnCard` usa `is-raised`/`loomn-card__head` coerenti fra .vue e test; `LoomnTag` `loomn-tag--{variant}` coerente; `LoomnTextInput` emette `update:modelValue` (v-model) e classi `is-mono`/`is-invalid` coerenti fra .vue, test e adozione; `LoomnField` `loomn-field__hint--error` coerente. I token `--scrim`/`--shadow-1`/`--shadow-2`/`--ok-soft`/`--warn-soft`/`--bad-soft` definiti in T1 e consumati in T3 (Panel/Dialog), T4 (Card/Tag) e T5 (TextInput). 

**Nota su `--fs-sm`/`--r-sm` ecc.:** sono token gia esistenti da D‑02a (`tokens.css`); i componenti li riusano (nessuna nuova definizione).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-24-d02b-component-library-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — un subagent fresco per task, review a due stadi (spec + code-quality), final review opus; branch `feat/d02b-component-library`.
2. **Inline Execution** — i task in questa sessione con checkpoint.

Which approach?
