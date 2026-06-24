# D‑02c — Shell & navigazione — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ripensare la shell del renderer in un rail di navigazione a icone espandibile (stato persistito), con topbar slim contestuale, toggle tema nel rail, icone SVG inline, transizioni sottili, e la shell tokenizzata.

**Architecture:** Renderer‑only. La navigazione esce da `App.vue` in un componente isolato `LoomnRail` che compone `LoomnIcon` (SVG inline) + `LoomnThemeToggle` (su `useTheme`) e una lista single‑source `lib/shell-nav.ts`. `App.vue` diventa l'orchestratore della shell (rail + topbar slim col titolo della superficie + `RouterView` con transizione). Tutto su `var(--token)` (il guard `no-color-drift.test.ts` resta verde). Nessuna nuova dipendenza: le icone sono SVG disegnate a mano.

**Tech Stack:** Vue 3 (`<script setup lang="ts">`), Vue Router (hash history), CSS custom properties, Vitest + @vue/test-utils (jsdom).

**Baseline (a inizio D‑02c):** `main` a `1f6383a` (spec D‑02c). **865 test**, `pnpm -r typecheck` pulito (6 progetti), tree pulito (`.claude/`/`.superpowers/` ignorati). Spec autorita: `docs/superpowers/specs/2026-06-24-d02c-shell-nav-design.md`.

---

## Vincoli trasversali (ogni task)

- **Scope discipline:** tocca SOLO i file elencati nel task. MAI `tsconfig*`, `vitest.config*`, `vitest.workspace.ts`, `electron.vite.config*`, `package.json`. Nessuna nuova dipendenza (icone = SVG inline). `git status --short` prima di ogni commit; stage per path esplicito; `.claude/`/`.superpowers/` MAI committati.
- **No hex hardcoded nei `.vue`/`.ts`:** il guard `no-color-drift.test.ts` deve restare verde. Tutti i colori via `var(--token)`. Le icone usano `currentColor` (ereditano il colore della voce), nessun colore proprio.
- **Renderer-only, ABI jsdom, NIENTE gate Electron** (non tocca main/IPC/route/engine/AI/host/shared).
- **Anti-apostrofo** nelle `it()/describe()` in apici singoli (no `l'`, `un'`, `c'è` → usa `l attore`, `c e`). `è/é` vanno bene.
- **TS strict** (`exactOptionalPropertyTypes`): spread condizionali, niente `campo: undefined`.
- Comando test singolo (dalla root): `pnpm exec vitest run <path>`. Suite: `pnpm test`. Typecheck: `pnpm -r typecheck`.
- **⚠️ ABI:** se `pnpm test` da `NODE_MODULE_VERSION 146 ... requires 137` → `pnpm rebuild:node`; se EPERM, ci sono processi Loomn fantasma (electron/electron-vite) che tengono `better_sqlite3.node` → killali (`Stop-Process`, filtro `tabl|loomn`, NON VS Code/Claude/Slack) poi rebuild. **Nota:** la `electron-vite build` della verifica visiva (T6) riflippa l ABI a Electron → dopo la build serve `pnpm rebuild:node`.

---

## File Structure

| File | Responsabilita | Task |
|---|---|---|
| `styles/tokens.css` | token di shell non‑cromatici (larghezze rail, altezza topbar, dimensione icona) | T1 |
| `lib/shell-nav.ts` (+ `.test.ts`) | tipo `IconName`, lista `navItems` single‑source, `ROUTE_TITLES`, `routeTitle()` | T2 |
| `components/LoomnIcon.vue` (+ `.test.ts`) | set di icone SVG inline (`currentColor`), `name` prop | T3 |
| `components/LoomnThemeToggle.vue` (+ `.test.ts`) | accesso rapido al tema (ciclo compresso / segmentato espanso), su `useTheme` | T4 |
| `components/LoomnRail.vue` (+ `.test.ts`) | rail a icone compresso/espanso (stato persistito), brand, nav, toggle, comprimi/espandi | T5 |
| `App.vue` | orchestratore shell: rail + topbar slim (titolo superficie) + `RouterView` con transizione + tokenizzazione | T6 |

> **Nota su `App.test.ts`:** le asserzioni esistenti puntano a `.nav-btn`/`.nav-btn--active` (resi da `LoomnRail` con gli stessi nomi di classe), a `.app-shell[data-phase]` (mantenuto), alla `GmConsole` dev‑gate (mantenuta) e al testo `Diario` (ora garantito dal titolo della topbar). Il refactor e behaviour‑preserving → `App.test.ts` resta verde SENZA modifiche. Se un selettore si rompe per un motivo reale, aggiornalo minimamente mantenendo l asserzione di comportamento.

---

## Task 1: Token di shell in `tokens.css`

**Files:**
- Modify: `app/desktop/src/renderer/src/styles/tokens.css`

> **Verifica (TDD‑N/A per CSS puro):** verificato da `pnpm test` verde, dal guard `no-color-drift.test.ts`, e da `pnpm -r typecheck`. I token sono NON‑cromatici → stanno nel blocco condiviso `:root`.

- [ ] **Step 1: Aggiungi i token di shell nel blocco `:root`**

In `tokens.css`, dentro `:root`, subito dopo il blocco `/* elevation + motion */` (cioe dopo la riga `  --ease: cubic-bezier(0.2, 0, 0, 1);`), aggiungi:
```css

  /* shell (D-02c): geometria non-cromatica della navigazione */
  --rail-w: 56px;
  --rail-w-expanded: 176px;
  --topbar-h: 54px;
  --icon-size: 20px;
```
(NON toccare altro. Questi sono non‑cromatici → restano in `:root`, NON nei blocchi per‑tema.)

- [ ] **Step 2: Suite + guard + typecheck**

Run: `pnpm test` → 865 verdi (nessun test asserisce questi token).
Run: `pnpm exec vitest run app/desktop/src/renderer/src/no-color-drift.test.ts` → PASS.
Run: `pnpm -r typecheck` → nessun errore.

- [ ] **Step 3: Commit**
```bash
git status --short
git add app/desktop/src/renderer/src/styles/tokens.css
git commit -m "feat(renderer): token di shell (rail/topbar/icona) (D-02c T1)"
```

---

## Task 2: `lib/shell-nav.ts` — navigazione single‑source

**Files:**
- Create: `app/desktop/src/renderer/src/lib/shell-nav.ts`
- Create: `app/desktop/src/renderer/src/lib/shell-nav.test.ts`

- [ ] **Step 1: Scrivi `shell-nav.test.ts` (fallira)**:
```ts
import { describe, it, expect } from 'vitest';
import { navItems, routeTitle, type IconName } from './shell-nav';

describe('shell-nav', () => {
  it('espone le 5 destinazioni con path unici', () => {
    expect(navItems).toHaveLength(5);
    const paths = navItems.map((i) => i.to);
    expect(new Set(paths).size).toBe(5);
    expect(paths).toContain('/');
    expect(paths).toContain('/diario');
  });

  it('routeTitle mappa i nomi di route noti', () => {
    expect(routeTitle('game')).toBe('Gioco');
    expect(routeTitle('journal')).toBe('Diario');
    expect(routeTitle('onboarding')).toBe('Nuova campagna');
  });

  it('routeTitle ritorna stringa vuota per nomi sconosciuti o nulli', () => {
    expect(routeTitle('boh')).toBe('');
    expect(routeTitle(null)).toBe('');
    expect(routeTitle(undefined)).toBe('');
  });

  it('ogni nav item usa un IconName valido del sottoinsieme nav', () => {
    const navIcons: IconName[] = ['game', 'journal', 'sheet', 'company', 'settings'];
    for (const it of navItems) expect(navIcons).toContain(it.icon);
  });
});
```

- [ ] **Step 2: Run, verifica FAIL** — `pnpm exec vitest run app/desktop/src/renderer/src/lib/shell-nav.test.ts` → FAIL (`./shell-nav` non esiste).

- [ ] **Step 3: Crea `shell-nav.ts`**:
```ts
// Vocabolario di navigazione della shell (D-02c): single source per rail + topbar.
export type IconName =
  | 'game'
  | 'journal'
  | 'sheet'
  | 'company'
  | 'settings'
  | 'theme-system'
  | 'theme-light'
  | 'theme-dark'
  | 'chevron';

export interface NavItem {
  readonly name: string;
  readonly to: string;
  readonly label: string;
  readonly icon: IconName;
}

export const navItems: readonly NavItem[] = [
  { name: 'game', to: '/', label: 'Gioco', icon: 'game' },
  { name: 'journal', to: '/diario', label: 'Diario', icon: 'journal' },
  { name: 'sheet', to: '/scheda', label: 'Scheda', icon: 'sheet' },
  { name: 'company', to: '/compagnia', label: 'Compagnia', icon: 'company' },
  { name: 'settings', to: '/impostazioni', label: 'Impostazioni', icon: 'settings' },
];

// Titolo della superficie per nome di route. Deriva le 5 destinazioni da navItems (DRY) e
// aggiunge l onboarding, che non e una voce del rail ma ha un titolo nella topbar.
const ROUTE_TITLES: Record<string, string> = {
  ...Object.fromEntries(navItems.map((i) => [i.name, i.label])),
  onboarding: 'Nuova campagna',
};

export function routeTitle(name: string | null | undefined): string {
  if (name == null) return '';
  return ROUTE_TITLES[name] ?? '';
}
```

- [ ] **Step 4: Run, verifica PASS** — `pnpm exec vitest run app/desktop/src/renderer/src/lib/shell-nav.test.ts` → PASS (4 test).
Run: `pnpm -r typecheck` → pulito.

- [ ] **Step 5: Commit**
```bash
git status --short
git add app/desktop/src/renderer/src/lib/shell-nav.ts app/desktop/src/renderer/src/lib/shell-nav.test.ts
git commit -m "feat(renderer): shell-nav single-source (navItems + routeTitle) (D-02c T2)"
```

---

## Task 3: `LoomnIcon` — set di icone SVG inline

**Files:**
- Create: `app/desktop/src/renderer/src/components/LoomnIcon.vue`
- Create: `app/desktop/src/renderer/src/components/LoomnIcon.test.ts`

> Icone stroke‑based 24x24, `currentColor`, nessuna dipendenza. `data-icon` per testabilita.

- [ ] **Step 1: Scrivi `LoomnIcon.test.ts` (fallira)**:
```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LoomnIcon from './LoomnIcon.vue';

describe('LoomnIcon', () => {
  it('rende un svg col data-icon del nome', () => {
    const w = mount(LoomnIcon, { props: { name: 'journal' } });
    const svg = w.find('svg');
    expect(svg.exists()).toBe(true);
    expect(svg.attributes('data-icon')).toBe('journal');
  });

  it('usa currentColor per lo stroke (eredita il colore)', () => {
    const w = mount(LoomnIcon, { props: { name: 'game' } });
    expect(w.find('svg').attributes('stroke')).toBe('currentColor');
  });

  it('rende icone diverse per nomi diversi', () => {
    const a = mount(LoomnIcon, { props: { name: 'theme-dark' } });
    const b = mount(LoomnIcon, { props: { name: 'chevron' } });
    expect(a.find('svg').attributes('data-icon')).toBe('theme-dark');
    expect(b.find('svg').attributes('data-icon')).toBe('chevron');
  });
});
```

- [ ] **Step 2: Run, verifica FAIL** — `pnpm exec vitest run app/desktop/src/renderer/src/components/LoomnIcon.test.ts` → FAIL.

- [ ] **Step 3: Crea `LoomnIcon.vue`**:
```vue
<script setup lang="ts">
import type { IconName } from '../lib/shell-nav';

defineProps<{ name: IconName }>();
</script>

<template>
  <svg
    class="loomn-icon"
    :data-icon="name"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <template v-if="name === 'game'">
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </template>
    <template v-else-if="name === 'journal'">
      <path d="M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4z" />
      <path d="M20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z" />
    </template>
    <template v-else-if="name === 'sheet'">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </template>
    <template v-else-if="name === 'company'">
      <circle cx="9" cy="8" r="3" />
      <path d="M4 19a5 5 0 0 1 10 0" />
      <path d="M15.5 5.5a3 3 0 0 1 0 5" />
      <path d="M16 14.5a5 5 0 0 1 4 4.5" />
    </template>
    <template v-else-if="name === 'settings'">
      <path d="M4 8h10M18 8h2M4 16h2M10 16h10" />
      <circle cx="16" cy="8" r="2" />
      <circle cx="8" cy="16" r="2" />
    </template>
    <template v-else-if="name === 'theme-system'">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'theme-light'">
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"
      />
    </template>
    <template v-else-if="name === 'theme-dark'">
      <path d="M20 13a7.5 7.5 0 1 1-9-9 6 6 0 0 0 9 9z" />
    </template>
    <template v-else-if="name === 'chevron'">
      <path d="M9 6l6 6-6 6" />
    </template>
  </svg>
</template>

<style scoped>
.loomn-icon {
  width: var(--icon-size);
  height: var(--icon-size);
  display: block;
  flex: none;
}
</style>
```

- [ ] **Step 4: Run, verifica PASS** — `pnpm exec vitest run app/desktop/src/renderer/src/components/LoomnIcon.test.ts` → PASS (3 test).
Run: `pnpm exec vitest run app/desktop/src/renderer/src/no-color-drift.test.ts` → PASS.
Run: `pnpm -r typecheck` → pulito.

- [ ] **Step 5: Commit**
```bash
git status --short
git add app/desktop/src/renderer/src/components/LoomnIcon.vue app/desktop/src/renderer/src/components/LoomnIcon.test.ts
git commit -m "feat(renderer): LoomnIcon set SVG inline su currentColor (D-02c T3)"
```

---

## Task 4: `LoomnThemeToggle` — toggle tema nel rail

**Files:**
- Create: `app/desktop/src/renderer/src/components/LoomnThemeToggle.vue`
- Create: `app/desktop/src/renderer/src/components/LoomnThemeToggle.test.ts`

> Su `useTheme()` (D‑02a): `theme` (ref `system|light|dark`), `set(choice)`. Compresso: bottone che cicla. Espanso: segmentato a 3. Nessuno stato proprio.

- [ ] **Step 1: Scrivi `LoomnThemeToggle.test.ts` (fallira)**:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import LoomnThemeToggle from './LoomnThemeToggle.vue';
import { useTheme } from '../composables/use-theme';

describe('LoomnThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    useTheme().set('system');
  });

  it('compresso: un bottone che cicla system -> light -> dark -> system', async () => {
    const { theme } = useTheme();
    const w = mount(LoomnThemeToggle, { props: { expanded: false } });
    const btn = w.find('.theme-cycle');
    expect(btn.exists()).toBe(true);
    await btn.trigger('click');
    expect(theme.value).toBe('light');
    await btn.trigger('click');
    expect(theme.value).toBe('dark');
    await btn.trigger('click');
    expect(theme.value).toBe('system');
  });

  it('espanso: tre segmenti, click su scuro imposta dark', async () => {
    const { theme } = useTheme();
    const w = mount(LoomnThemeToggle, { props: { expanded: true } });
    const segs = w.findAll('.theme-seg__btn');
    expect(segs).toHaveLength(3);
    await segs[2]!.trigger('click');
    expect(theme.value).toBe('dark');
    expect(segs[2]!.classes()).toContain('is-active');
  });
});
```

- [ ] **Step 2: Run, verifica FAIL** — `pnpm exec vitest run app/desktop/src/renderer/src/components/LoomnThemeToggle.test.ts` → FAIL.

- [ ] **Step 3: Crea `LoomnThemeToggle.vue`**:
```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useTheme, type ThemeChoice } from '../composables/use-theme';
import LoomnIcon from './LoomnIcon.vue';
import type { IconName } from '../lib/shell-nav';

defineProps<{ expanded?: boolean }>();
const { theme, set } = useTheme();

const CYCLE: ThemeChoice[] = ['system', 'light', 'dark'];
const ICON: Record<ThemeChoice, IconName> = {
  system: 'theme-system',
  light: 'theme-light',
  dark: 'theme-dark',
};
const LABEL: Record<ThemeChoice, string> = { system: 'auto', light: 'chiaro', dark: 'scuro' };
const current = computed<ThemeChoice>(() => theme.value);

function cycle(): void {
  const i = CYCLE.indexOf(current.value);
  const next = CYCLE[(i + 1) % CYCLE.length];
  if (next) set(next);
}
</script>

<template>
  <div v-if="expanded" class="theme-seg" role="group" aria-label="tema">
    <button
      v-for="c in CYCLE"
      :key="c"
      type="button"
      class="theme-seg__btn"
      :class="{ 'is-active': current === c }"
      :aria-pressed="current === c"
      :title="LABEL[c]"
      :aria-label="LABEL[c]"
      @click="set(c)"
    >
      <LoomnIcon :name="ICON[c]" />
    </button>
  </div>
  <button
    v-else
    type="button"
    class="theme-cycle"
    :title="`Tema: ${LABEL[current]}`"
    :aria-label="`Tema: ${LABEL[current]}`"
    @click="cycle"
  >
    <LoomnIcon :name="ICON[current]" />
  </button>
</template>

<style scoped>
.theme-cycle,
.theme-seg__btn {
  display: grid;
  place-items: center;
  color: var(--text-3);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--r-xs);
  cursor: pointer;
  padding: 7px;
  transition: color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease);
}
.theme-cycle:hover,
.theme-seg__btn:hover {
  color: var(--text-2);
  background: var(--surface-2);
}
.theme-cycle:focus-visible,
.theme-seg__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.theme-seg {
  display: flex;
  gap: 2px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  padding: 2px;
}
.theme-seg__btn.is-active {
  color: var(--accent);
  background: var(--accent-soft);
}
</style>
```

- [ ] **Step 4: Run, verifica PASS** — `pnpm exec vitest run app/desktop/src/renderer/src/components/LoomnThemeToggle.test.ts` → PASS (2 test).
Run: `pnpm exec vitest run app/desktop/src/renderer/src/no-color-drift.test.ts` → PASS.
Run: `pnpm -r typecheck` → pulito.

- [ ] **Step 5: Commit**
```bash
git status --short
git add app/desktop/src/renderer/src/components/LoomnThemeToggle.vue app/desktop/src/renderer/src/components/LoomnThemeToggle.test.ts
git commit -m "feat(renderer): LoomnThemeToggle (ciclo/segmentato) su useTheme (D-02c T4)"
```

---

## Task 5: `LoomnRail` — rail a icone espandibile

**Files:**
- Create: `app/desktop/src/renderer/src/components/LoomnRail.vue`
- Create: `app/desktop/src/renderer/src/components/LoomnRail.test.ts`

> Stato compresso/espanso persistito in `localStorage['loomn-rail']` (letto in setup → niente flash; default compresso). Usa `navItems`, `LoomnIcon`, `LoomnThemeToggle`. Mantiene i nomi di classe `nav-btn`/`nav-btn--active` (cosi `App.test.ts` resta verde).

- [ ] **Step 1: Scrivi `LoomnRail.test.ts` (fallira)**:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { routes } from '../router';
import LoomnRail from './LoomnRail.vue';

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes });
}

async function mountRail() {
  const router = makeRouter();
  router.push('/');
  await router.isReady();
  const wrapper = mount(LoomnRail, { global: { plugins: [router] } });
  return { wrapper, router };
}

describe('LoomnRail', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('rende le 5 voci di navigazione', async () => {
    const { wrapper } = await mountRail();
    expect(wrapper.findAll('.nav-btn')).toHaveLength(5);
  });

  it('parte compresso (niente etichette) quando localStorage e vuoto', async () => {
    const { wrapper } = await mountRail();
    expect(wrapper.find('.rail--expanded').exists()).toBe(false);
    expect(wrapper.findAll('.nav-btn__label')).toHaveLength(0);
  });

  it('il toggle espande, mostra le etichette e persiste lo stato', async () => {
    const { wrapper } = await mountRail();
    await wrapper.find('.rail__collapse').trigger('click');
    expect(wrapper.find('.rail--expanded').exists()).toBe(true);
    expect(wrapper.findAll('.nav-btn__label')).toHaveLength(5);
    expect(localStorage.getItem('loomn-rail')).toBe('expanded');
  });

  it('parte espanso se localStorage e expanded', async () => {
    localStorage.setItem('loomn-rail', 'expanded');
    const { wrapper } = await mountRail();
    expect(wrapper.find('.rail--expanded').exists()).toBe(true);
  });

  it('solo la voce corrente ha nav-btn--active', async () => {
    const { wrapper, router } = await mountRail();
    await router.push('/diario');
    await wrapper.vm.$nextTick();
    const active = wrapper.findAll('.nav-btn--active');
    expect(active).toHaveLength(1);
    expect(active[0]!.attributes('href')).toContain('diario');
  });
});
```

- [ ] **Step 2: Run, verifica FAIL** — `pnpm exec vitest run app/desktop/src/renderer/src/components/LoomnRail.test.ts` → FAIL.

- [ ] **Step 3: Crea `LoomnRail.vue`**:
```vue
<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { navItems } from '../lib/shell-nav';
import LoomnIcon from './LoomnIcon.vue';
import LoomnThemeToggle from './LoomnThemeToggle.vue';

const RAIL_KEY = 'loomn-rail';
// Letto in setup -> il primo render usa gia il valore persistito (niente flash). Default: compresso.
const expanded = ref<boolean>(localStorage.getItem(RAIL_KEY) === 'expanded');

function toggle(): void {
  expanded.value = !expanded.value;
  localStorage.setItem(RAIL_KEY, expanded.value ? 'expanded' : 'collapsed');
}
</script>

<template>
  <nav class="rail" :class="{ 'rail--expanded': expanded }" aria-label="navigazione">
    <div class="rail__brand">
      <span class="rail__brand-mark">L</span>
      <span v-if="expanded" class="rail__brand-word">Loomn<span class="rail__brand-dot">.</span></span>
    </div>

    <RouterLink
      v-for="it in navItems"
      :key="it.to"
      :to="it.to"
      class="nav-btn"
      exact-active-class="nav-btn--active"
      :title="it.label"
      :aria-label="it.label"
    >
      <LoomnIcon :name="it.icon" class="nav-btn__icon" />
      <span v-if="expanded" class="nav-btn__label">{{ it.label }}</span>
    </RouterLink>

    <div class="rail__foot">
      <LoomnThemeToggle :expanded="expanded" />
      <button
        type="button"
        class="rail__collapse"
        :aria-expanded="expanded"
        :aria-label="expanded ? 'Comprimi navigazione' : 'Espandi navigazione'"
        @click="toggle"
      >
        <LoomnIcon name="chevron" class="rail__collapse-icon" :class="{ 'is-flipped': expanded }" />
      </button>
    </div>
  </nav>
</template>

<style scoped>
.rail {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  width: var(--rail-w);
  padding: 14px 8px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r);
  overflow: hidden;
  transition: width var(--dur) var(--ease);
}
.rail--expanded {
  width: var(--rail-w-expanded);
}
.rail__brand {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 4px;
  margin-bottom: 10px;
  height: 40px;
}
.rail__brand-mark {
  flex: none;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line-2);
  border-radius: var(--r-sm);
  background: var(--surface-2);
  color: var(--text);
  font-family: var(--f-sans);
  font-weight: var(--fw-semibold);
  font-size: var(--fs-h2);
}
.rail__brand-word {
  font-family: var(--f-sans);
  font-weight: var(--fw-semibold);
  font-size: var(--fs-h2);
  color: var(--text);
  white-space: nowrap;
}
.rail__brand-dot {
  color: var(--accent);
}
.nav-btn {
  display: flex;
  align-items: center;
  gap: 11px;
  height: 40px;
  padding: 0 9px;
  border-radius: var(--r-sm);
  color: var(--text-3);
  border: 1px solid transparent;
  text-decoration: none;
  font-family: var(--f-sans);
  font-size: var(--fs-sm);
  white-space: nowrap;
  transition: color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease);
}
.nav-btn:hover {
  color: var(--text-2);
  background: var(--surface-2);
  border-color: var(--line);
}
.nav-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.nav-btn--active {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: var(--accent-soft);
}
.rail__foot {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  padding-top: 10px;
}
.rail__collapse {
  margin-left: auto;
  display: grid;
  place-items: center;
  color: var(--text-3);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--r-xs);
  cursor: pointer;
  padding: 7px;
  transition: color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease);
}
.rail__collapse:hover {
  color: var(--text-2);
  background: var(--surface-2);
}
.rail__collapse:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.rail__collapse-icon {
  transition: transform var(--dur) var(--ease);
}
.rail__collapse-icon.is-flipped {
  transform: scaleX(-1);
}
@media (prefers-reduced-motion: reduce) {
  .rail,
  .rail__collapse-icon {
    transition: none;
  }
}
</style>
```

- [ ] **Step 4: Run, verifica PASS** — `pnpm exec vitest run app/desktop/src/renderer/src/components/LoomnRail.test.ts` → PASS (5 test).
Run: `pnpm exec vitest run app/desktop/src/renderer/src/no-color-drift.test.ts` → PASS.
Run: `pnpm -r typecheck` → pulito.

- [ ] **Step 5: Commit**
```bash
git status --short
git add app/desktop/src/renderer/src/components/LoomnRail.vue app/desktop/src/renderer/src/components/LoomnRail.test.ts
git commit -m "feat(renderer): LoomnRail a icone espandibile (stato persistito) (D-02c T5)"
```

---

## Task 6: Ricomponi `App.vue` (rail + topbar slim + transizione) + verifica

**Files:**
- Modify: `app/desktop/src/renderer/src/App.vue`

> `App.test.ts` NON va modificato (asserzioni preservate: `.nav-btn` x5 dal rail, `.nav-btn--active`, `.app-shell[data-phase]`, GmConsole dev‑gate, testo `Diario` dal titolo topbar). Se davvero si rompe, aggiorna minimamente mantenendo il comportamento.

- [ ] **Step 1: Riscrivi `App.vue`** con questo contenuto completo:
```vue
<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import { useReadModelStore } from './stores/read-model';
import type { PhaseView } from './stores/read-model';
import { routeTitle } from './lib/shell-nav';
import FirstRunBanner from './components/FirstRunBanner.vue';
import GmConsole from './components/GmConsole.vue';
import LoomnRail from './components/LoomnRail.vue';

const store = useReadModelStore();
const route = useRoute();
const phase = computed<PhaseView>(() => store.phase);
const surfaceTitle = computed<string>(() => {
  const n = route.name;
  return typeof n === 'string' ? routeTitle(n) : '';
});

const phaseLabels: Record<PhaseView, string> = {
  exploration: 'esplorazione',
  dialogue: 'dialogo',
  combat: 'combattimento',
  downtime: 'quiete',
};
const phaseLabel = computed(() => phaseLabels[phase.value]);

// M-15: la Regia (override manuale del Master) e un dev-tool -> montata solo in sviluppo.
const isDev = import.meta.env.DEV;
</script>

<template>
  <div class="app-shell" :data-phase="phase">
    <LoomnRail />
    <div class="stage">
      <header class="topbar">
        <h1 class="topbar__title">{{ surfaceTitle }}</h1>
        <div class="phase-badge">{{ phaseLabel }}</div>
        <GmConsole v-if="isDev" />
      </header>
      <FirstRunBanner />
      <div class="stage__view">
        <RouterView v-slot="{ Component }">
          <Transition name="view" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  height: 100vh;
  padding: 14px;
  gap: 14px;
}
.stage {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  min-height: 0;
}
.stage__view {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: auto;
}
.topbar {
  display: flex;
  align-items: center;
  gap: 18px;
  height: var(--topbar-h);
  padding: 0 18px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r);
}
.topbar__title {
  margin: 0;
  font-family: var(--f-sans);
  font-size: var(--fs-h2);
  font-weight: var(--fw-semibold);
  color: var(--text);
  letter-spacing: 0.01em;
}
.phase-badge {
  margin-left: auto;
  font-size: var(--fs-xs);
  letter-spacing: 0.02em;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--accent-soft);
  padding: 6px 12px;
  border-radius: var(--r-xs);
}
.view-enter-active,
.view-leave-active {
  transition: opacity var(--dur) var(--ease);
}
.view-enter-from,
.view-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .view-enter-active,
  .view-leave-active {
    transition: none;
  }
}
</style>
```

> **Note di migrazione:** rimossi dalla vecchia `App.vue`: la `<aside class="rail">` inline (ora `LoomnRail`), il `.wordmark` nella topbar (il brand vive nel rail), e i relativi stili one‑off (`.rail`, `.brand-mark`, `.nav-btn*`, `.wordmark`, `.wordmark .dot`). Il `data-phase` su `.app-shell` resta (attributo inerte per D‑02, non colora). I `color-mix(... var(--accent) ...)` del vecchio phase-badge sono sostituiti da `var(--accent-soft)` (gia un token). Il `navItems` inline e `phaseLabels` non‑usati altrove: `navItems` ora vive in `lib/shell-nav.ts` (importato dal rail), `phaseLabels` resta in `App.vue`.

- [ ] **Step 2: Verifica orfani + guard + suite + typecheck**

Run (Bash): `grep -nE "class=\"(rail|wordmark|brand-mark)\"|\.wordmark|\.brand-mark" app/desktop/src/renderer/src/App.vue || echo "no match"` → `no match` (gli stili/markup one‑off della vecchia shell rimossi; il rail e ora un componente).
Run: `pnpm exec vitest run app/desktop/src/renderer/src/App.test.ts` → PASS (5 test, invariati). Se un selettore fallisce per un motivo reale, aggiorna SOLO quel selettore mantenendo l asserzione di comportamento e dichiaralo.
Run: `pnpm exec vitest run app/desktop/src/renderer/src/no-color-drift.test.ts` → PASS.
Run: `pnpm test` → ~879 verdi (865 + 14 nuovi: 4 shell-nav + 3 LoomnIcon + 2 LoomnThemeToggle + 5 LoomnRail).
Run: `pnpm -r typecheck` → nessun errore.

- [ ] **Step 3: Verifica VISIVA (preview tools, light/dark) — step dell orchestratore**

Pattern D‑02a/b: `electron-vite build` (compila tutte le SFC) + ispezione del bundle CSS prodotto (`app/desktop/out/renderer/assets/index-*.css`): conferma che `.rail`, `.nav-btn`, `.topbar__title`, `.theme-cycle/.theme-seg`, `.loomn-icon` rendano via `var(--token)` (zero hex). Opzionale: server headless con stub `window.loomn` per snapshot a11y light/dark del rail compresso/espanso, voce attiva, toggle, titolo superficie. **⚠️ ABI:** dopo la `electron-vite build` lancia `pnpm rebuild:node` (la build riflippa l ABI a Electron) e killa eventuali processi Loomn fantasma se `rebuild:node` da EPERM, poi rilancia `pnpm test` full per confermare verde.

- [ ] **Step 4: Commit**
```bash
git status --short
git add app/desktop/src/renderer/src/App.vue
git commit -m "feat(renderer): shell ricomposta (LoomnRail + topbar slim + transizione vista) (D-02c T6)"
```

---

## Self-Review (eseguita contro lo spec)

**1. Copertura spec:**
- §2.2/§4.1 rail a icone espandibile (stato persistito, brand, voce attiva, aria) → T5 (su T2 nav-items + T3 icone). ✓
- §2.3 espansione pin persistito (`localStorage`, default compresso, niente flash) → T5 (stato letto in setup). ✓
- §2.4 brand nel rail (L → Loomn.) → T5; rimosso il wordmark dalla topbar → T6. ✓
- §2.5/§4.4 topbar slim (titolo superficie + phase badge) → T6 (usa `routeTitle` di T2). ✓
- §2.6/§4.2 toggle tema (ciclo compresso / segmentato espanso, su `useTheme`) → T4. ✓
- §2.7/§4.6 icone SVG inline (`currentColor`, niente dipendenze) → T3. ✓
- §2.8/§4.5 transizioni sottili (vista + espansione rail) + `prefers-reduced-motion` → T5 (rail) + T6 (vista). ✓
- §2.9/§5 tokenizzazione shell (token non‑cromatici in `:root`, niente hex) → T1 + T6. ✓
- §2.10 empty‑states/Tabs fuori → non implementati (rinviati a D‑02d). ✓
- §6 testing per componente, guard verde, no gate Electron, verifica visiva → ogni task + T6 step 3. ✓

**2. Placeholder scan:** nessun TBD/TODO; ogni file ha codice completo; T6 elenca i rimossi e i selettori orfani da verificare.

**3. Type/nomi consistency:** `IconName` definito in `shell-nav.ts` (T2), consumato da `LoomnIcon` (T3 prop `name`), `LoomnThemeToggle` (T4 mappa `ICON`) e `LoomnRail` (T5 `it.icon` + `name="chevron"`). `navItems`/`routeTitle` (T2) usati da `LoomnRail` (T5) e `App.vue` (T6). Token `--rail-w`/`--rail-w-expanded`/`--topbar-h`/`--icon-size` definiti in T1 e consumati in T5 (`LoomnRail`) e T6 (`App`, `LoomnIcon` via `--icon-size`). Classi `nav-btn`/`nav-btn--active` rese da `LoomnRail` (T5) → asserzioni di `App.test.ts` invariate (T6). `useTheme()` API (`theme`/`set`) coerente fra T4 e use-theme.ts esistente.

**Nota su `--fs-h2`/`--r-xs`/`--accent-soft` ecc.:** token gia esistenti da D‑02a; i componenti li riusano.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-24-d02c-shell-nav-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — un subagent fresco per task, review a due stadi (spec + code-quality), final review opus; branch `feat/d02c-shell-nav`. Crux (code-quality opus): T3 `LoomnIcon`, T4 `LoomnThemeToggle`, T5 `LoomnRail`, T6 ricomposizione `App.vue`. Meccanici (code-quality leggera/saltata-e-dichiarata): T1 token, T2 lib single-source. Baseline 865 → ~879 test. NIENTE gate Electron (renderer-only).
2. **Inline Execution** — i task in questa sessione con checkpoint.

Which approach?
