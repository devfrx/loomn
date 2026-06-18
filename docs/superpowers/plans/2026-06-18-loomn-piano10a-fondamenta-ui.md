# Piano 10a — Fondamenta UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trasformare il renderer-stub di `app/desktop` nella vera app Vue di Loomn: design system bespoke "strumento notturno" (token CSS + componenti base + un primitivo Reka headless), store Pinia read-side alimentato da `read-model-push`, shell Vue Router (rail/topbar + route Gioco/Diario/Scheda/Compagnia/Impostazioni), frame adattivo a `GameState.phase`, e contenitore `grid-layout-plus` per il Gioco con preset per fase + persistenza del layout (localStorage dietro un port). Il gate `LOOMN_SELFTEST` continua a dare `VERDICT: PASS` sull app Vue reale.

**Architecture:** Il renderer diventa un app Vue 3 (`createApp` + `createPinia` + Vue Router). Lo store Pinia `useReadModelStore` si sottoscrive **una volta** a `window.loomn.onReadModelPush` e tiene `{version, state}`; i pannelli leggono **selettori derivati** (`actors`/`encounter`/`quests`/`phase`) — il renderer **non muta** lo stato (CQRS, spec §5.2). Il design system e fatto di **variabili CSS (token)** + font bundlati offline (`@fontsource-variable`, vincolo CSP) + primitivi **Reka UI headless** stilizzati col token set. La shell (`App.vue`) e rail + topbar + `<RouterView>`; il root porta `data-phase` legato a `store.phase` -> re-theming via `[data-phase]` (decisione 1/2 dello spec). Il Gioco usa `grid-layout-plus` con **preset di layout per fase**; il riarrangiamento dell utente **persiste nelle UI settings** (localStorage del renderer, dietro un port `LayoutPersistence` -> migrabile lato main senza toccare i call site). I pannelli del Gioco sono **fondazionali** (set e posizioni reali, legati al read-model); il loro **contenuto profondo** arriva nei sotto-piani (narrazione/dadi 10b, scontro 10c, scheda 10d).

**Tech Stack:** Vue 3.5 + electron-vite 4 + TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`); **Pinia 3** (read-side), **Vue Router 4** (hash history per `file://`), **Reka UI 2** (primitivi headless), **grid-layout-plus 1** (pannelli a griglia), **@fontsource-variable** (font offline); verifica con **Vitest 2 + @vue/test-utils 2 + jsdom** (nuovo progetto di test del renderer, passo orchestratore) + **self-test `LOOMN_SELFTEST`** + screenshot.

---

## Contesto e riferimenti

- **Spec autorita del Piano 10:** `docs/superpowers/specs/2026-06-17-piano10-ui-design.md` — §2 (decisioni bloccate), §3 (design language "strumento notturno"), §4 (layout/IA), §5 (strategia read-side), §9 (verifica), §10 (decomposizione: 10a e la riga "Fondamenta UI"). **Spec autorita generale:** `docs/superpowers/specs/2026-06-15-simulatore-campagne-ai-design.md` §5.2 (CQRS), §9.2 (stack Vue/Pinia/Router), §13 (delta read-model = deferito).
- **HANDOFF:** `docs/superpowers/HANDOFF.md` §0-sexdecies (Piano 0 fatto, lacuna 10g, rischi A/C/D/F), §4 (processo), §5 (house rules), §7-quinquies (9c-ii: main reale + `LOOMN_SELFTEST`).
- **Prototipo design (direzione approvata):** `docs/superpowers/prototypes/piano10/play-shell.html` — i token CSS di Task 3 ne derivano (palette graphite, accento brass per-fase, Fraunces/Newsreader/Archivo/JetBrains Mono, `[data-phase]` re-theme).
- **Verita di codice gia verificate (HEAD `614a6bb`):**
  - `read-model-push` porta `{version, state}` con `state = z.infer<gameStateSchema>` = `{version, actors:Record<id,Actor>, encounter:Encounter|null, quests:Record<id,Quest>, phase}` (`packages/shared/src/domain-schema.ts:220-226`). `phase` e `quests` **attraversano gia** l IPC.
  - `Phase = 'exploration'|'dialogue'|'combat'|'downtime'` (`packages/engine/src/phase.ts:4-5`), `INITIAL_PHASE='exploration'`. Quest `status='active'|'completed'|'failed'` (`packages/shared/src/domain-schema.ts:134`). Actor DTO = `{id,name,kind:'pc'|'npc',attributes,skills,resources,conditions,items,progression}`.
  - `interface LoomnBridge` (`packages/shared/src/ipc.ts:187-206`) ha `onReadModelPush(listener) => unsubscribe` + tutti i canali del Piano 0. `window.loomn:LoomnBridge` e dichiarato in `app/desktop/src/renderer/env.d.ts`.
  - Il renderer **puo importare** i tipi inferiti da `@loomn/shared` (barrel ri-esporta `ipc.ts`): `ReadModelPush` e gia importato in `renderer.ts`/`env.d.ts`. Per il dominio il renderer resta legato a `@loomn/shared` (NON importa `@loomn/engine` per i tipi di vista).
  - Il main (`app/desktop/src/main/index.ts`) spinge `read-model-push` su `did-finish-load` e dopo ogni mutazione; lancia il renderer con `?selftest=<fase>` quando `LOOMN_SELFTEST` e settata, cattura `VERDICT:` da `console-message` ed esce 0/1.
  - CSP attuale del renderer (`app/desktop/src/renderer/index.html:5`): `default-src 'self'; script-src 'self'` — **blocca** font CDN e (in dev/SFC) l iniezione di stili inline -> va estesa (Step 0).

## Disciplina di scope (CRITICO — vale per ogni task, house rule §5.1)

- Ogni subagent modifica **SOLO** i file elencati nel suo task. **MAI** toccare `package.json`, `tsconfig*.json`, `vitest.config.ts`, `vitest.workspace.ts`, `electron.vite.config.ts`, `app/desktop/src/renderer/index.html`. Queste vivono nel **passo orchestratore Step 0** (deps, progetto di test del renderer, CSP) — gia eseguito **prima** dei task: i subagent danno per assodato che le dipendenze e il setup di test esistono.
- `git status --short` prima di ogni commit: devono comparire SOLO i file del task.
- Niente apostrofi nelle stringhe `it('...')`/`describe('...')` in apici singoli (house rule §5.4): scrivi `all avvio`, `l attore`, `a inizio`, `c e`. Le lettere accentate (`è`, `à`) vanno bene; gli apostrofi (`'`) spezzano la stringa JS. **Grep di verifica:** `(it|describe)\('[^']*'[A-Za-zàèéìòù]` -> *no matches*.
- TS strict (house rule §5.6): `exactOptionalPropertyTypes` -> niente `campo: undefined` (spread condizionali); `noUncheckedIndexedAccess` -> accesso array/record e `T | undefined` (usa `?? default`/guardie); `verbatimModuleSyntax` -> `import type` per i soli tipi. Switch su union -> esaustivi.
- I componenti Vue sono SFC `<script setup lang="ts">`. I file di test del renderer stanno **accanto** al sorgente (`*.test.ts`), girano nel progetto Vitest jsdom (Step 0).

## Fuori ambito (esplicito) — display-only / deferito

- **Contenuto profondo dei pannelli:** narrazione + input + dadi 3D (10b), cockpit scontro (10c), scheda+inventario data-driven (10d), Diario+Compagnia (10e), Impostazioni/provider/creazione PG/controlli GM (10f). 10a rende i pannelli **fondazionali** (set/posizioni reali, placeholder di contenuto) e le route profonde come **skeleton**.
- **Vocabolario di gioco su IPC (`get-ruleset`, 10g):** NON in 10a (prerequisito di 10f/10d, non di 10a). I form data-driven arrivano dopo.
- **Dadi 3D (`@3d-dice/dice-box`) + spike CSP/wasm/worker:** 10b. 10a NON aggiunge Three.js ne dice-box; il pannello "Dadi" e un placeholder.
- **Streaming del turno**, **multi-campagna/campaign-picker**, **delta read-model** (spec generale §13): deferiti. Il read side resta lo snapshot `{version,state}`.
- **Persistenza layout lato main / multi-finestra:** fuori ambito; il port `LayoutPersistence` lo rende migrabile senza rilavorazione (decisione presa con l utente: localStorage del renderer).
- **Nessun nuovo Command/Event/canale IPC/schema in `@loomn/shared`:** 10a e tutto renderer. `shared` resta foglia e **intatto**.

---

## File da creare / modificare

| File | Azione | Responsabilita |
|---|---|---|
| `app/desktop/package.json` | **Step 0** (orch.) | +deps UI (pinia/vue-router/reka-ui/grid-layout-plus/4 font) +devDeps test (vitest/@vue/test-utils/jsdom) +script `test` |
| `app/desktop/vitest.config.ts` | **Step 0** (orch., Create) | Progetto di test renderer: env jsdom + plugin-vue + include `src/**/*.test.ts` + `passWithNoTests` |
| `vitest.workspace.ts` | **Step 0** (orch., Create) | Compone i due progetti (`./vitest.config.ts` node-packages + `./app/desktop/vitest.config.ts` jsdom-renderer) cosi `pnpm test` li esegue entrambi |
| `app/desktop/src/renderer/index.html` | **Step 0** (orch.) | CSP estesa (style-src unsafe-inline, font-src self, connect-src dev ws) |
| `app/desktop/src/renderer/src/stores/read-model.ts` | Task 1 (Create) | Store Pinia read-side `{version,state}` + selettori; `applyPush` unica mutazione |
| `app/desktop/src/renderer/src/stores/read-model.test.ts` | Task 1 (Create) | TDD store/selettori |
| `app/desktop/src/renderer/src/layout/presets.ts` | Task 2 (Create) | `LayoutItem`, `PANELS`, `presetFor(phase)` (preset per fase) |
| `app/desktop/src/renderer/src/layout/persistence.ts` | Task 2 (Create) | Port `LayoutPersistence` + adapter localStorage + `resolveLayout` |
| `app/desktop/src/renderer/src/layout/presets.test.ts` | Task 2 (Create) | TDD preset per fase |
| `app/desktop/src/renderer/src/layout/persistence.test.ts` | Task 2 (Create) | TDD persistenza (round-trip/corrotto/fallback) |
| `app/desktop/src/renderer/src/styles/tokens.css` | Task 3 (Create) | Variabili CSS (token) + override `[data-phase]` |
| `app/desktop/src/renderer/src/styles/base.css` | Task 3 (Create) | Reset, superficie graphite, scrollbar, tipografia base |
| `app/desktop/src/renderer/src/styles/index.ts` | Task 3 (Create) | Import font offline + css + css di grid-layout-plus |
| `app/desktop/src/renderer/src/components/LoomnPanel.vue` | Task 3 (Create) | Pannello arrotondato (head eyebrow/title/meta + body slot) |
| `app/desktop/src/renderer/src/components/LoomnButton.vue` | Task 3 (Create) | Bottone token (variant solid/ghost, disabled, emit click) |
| `app/desktop/src/renderer/src/components/LoomnDialog.vue` | Task 3 (Create) | Wrapper Reka headless (DialogRoot...) stilizzato col token set |
| `app/desktop/src/renderer/src/components/LoomnPanel.test.ts` | Task 3 (Create) | Component test (struttura/slot) |
| `app/desktop/src/renderer/src/components/LoomnButton.test.ts` | Task 3 (Create) | Component test (emit/disabled/slot) |
| `app/desktop/src/renderer/src/components/LoomnDialog.test.ts` | Task 3 (Create) | Component test (monta + trigger slot; Reka integra) |
| `app/desktop/src/renderer/src/router/index.ts` | Task 4 (Create) | `routes` + `createAppRouter(history?)` (hash default) |
| `app/desktop/src/renderer/src/views/GameView.vue` | Task 4 (Create stub) -> Task 5 (Modify) | Route Gioco (stub in T4, grid in T5) |
| `app/desktop/src/renderer/src/views/JournalView.vue` | Task 4 (Create) | Skeleton Diario (contenuto 10e) |
| `app/desktop/src/renderer/src/views/SheetView.vue` | Task 4 (Create) | Skeleton Scheda (contenuto 10d) |
| `app/desktop/src/renderer/src/views/CompanyView.vue` | Task 4 (Create) | Skeleton Compagnia (roster minimo dal read-model) |
| `app/desktop/src/renderer/src/views/SettingsView.vue` | Task 4 (Create) | Skeleton Impostazioni (contenuto 10f) |
| `app/desktop/src/renderer/src/App.vue` | Task 4 (Modify) | Shell: rail + topbar + RouterView + `data-phase` |
| `app/desktop/src/renderer/src/App.test.ts` | Task 4 (Create) | Component test shell (nav/route/phase) |
| `app/desktop/src/renderer/src/composables/use-game-layout.ts` | Task 5 (Create) | Logica layout Gioco (risolve per fase, persiste) |
| `app/desktop/src/renderer/src/composables/use-game-layout.test.ts` | Task 5 (Create) | TDD composable layout |
| `app/desktop/src/renderer/src/views/GameView.test.ts` | Task 5 (Create) | Component test (pannelli per fase, GridLayout stubbato) |
| `app/desktop/src/renderer/src/renderer.ts` | Task 6 (Modify) | Bootstrap (createApp+pinia+router+styles) + wiring store + self-test esteso |

---

## Step 0 — Scaffold (PASSO ORCHESTRATORE, non subagent)

> Eseguito **dall orchestratore** prima dei task (house rule §5.1: i manifesti/config non si toccano dai subagent). Versioni risolte empiricamente (npm view, 2026-06-18): `pinia@3.0.4`, `vue-router@4.6.4` (NON 5.x: la 5 richiede Vite 7/8 + `@pinia/colada`, incompatibile con electron-vite 4), `reka-ui@2.9.10`, `grid-layout-plus@1.1.1`, `@fontsource-variable/{fraunces@5.2.9,newsreader@5.2.10,archivo@5.2.8,jetbrains-mono@5.2.8}`, `@vue/test-utils@2.4.11`, `jsdom@29.1.1`, `vitest@2.1.9` (allinea il risolto di root). Tutti peer-accettano Vue 3.5.

- [ ] **Step 0.1: deps in `app/desktop/package.json`**

Aggiungi a `dependencies`:
```json
    "pinia": "^3.0.4",
    "vue-router": "^4.6.4",
    "reka-ui": "^2.9.10",
    "grid-layout-plus": "^1.1.1",
    "@fontsource-variable/fraunces": "^5.2.9",
    "@fontsource-variable/newsreader": "^5.2.10",
    "@fontsource-variable/archivo": "^5.2.8",
    "@fontsource-variable/jetbrains-mono": "^5.2.8"
```
Aggiungi a `devDependencies`:
```json
    "vitest": "^2.1.9",
    "@vue/test-utils": "^2.4.11",
    "jsdom": "^29.1.1"
```
Aggiungi a `scripts`: `"test": "vitest run"`. Poi `pnpm install` dalla root.

- [ ] **Step 0.2: progetto di test del renderer — `app/desktop/vitest.config.ts` (nuovo)**

```typescript
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

// Progetto di test del renderer (logica/componenti Vue): ambiente jsdom + plugin-vue per gli SFC.
// NON tocca better-sqlite3 (i test importano @loomn/shared, foglia zod-only, e Vue) -> resta su ABI
// Node, nessun conflitto col nativo. passWithNoTests: durante lo scaffold non esistono ancora test.
export default defineConfig({
  plugins: [vue()],
  test: {
    name: 'renderer',
    include: ['src/**/*.test.ts'],
    environment: 'jsdom',
    passWithNoTests: true,
  },
});
```

- [ ] **Step 0.3: workspace Vitest — `vitest.workspace.ts` (nuovo, root)**

Cosi `pnpm test` (root, `vitest run`) esegue **entrambi** i progetti (i 476 dei pacchetti su ABI Node + i nuovi del renderer su jsdom):
```typescript
import { defineWorkspace } from 'vitest/config';

// I pacchetti (node) restano in ./vitest.config.ts; il renderer (jsdom+vue) in app/desktop.
export default defineWorkspace(['./vitest.config.ts', './app/desktop/vitest.config.ts']);
```
*(Il root `vitest.config.ts` resta invariato: `include: ['packages/**/*.test.ts']`, env node.)*

- [ ] **Step 0.4: CSP del renderer — `app/desktop/src/renderer/index.html`**

Sostituisci il `<meta http-equiv="Content-Security-Policy" ...>` (riga 5) con:
```html
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws://localhost:* wss://localhost:*"
    />
```
Razionale: `script-src 'self'` invariato (nessuna relax: la sicurezza degli script e non negoziabile). `style-src 'unsafe-inline'` serve all iniezione di stile a runtime di Vue/Reka (gli SFC in dev e i primitivi headless creano `<style>`); `font-src 'self' data:` per i woff2 bundlati offline (`@fontsource`); `connect-src ... ws` per l HMR del dev server (il renderer NON fa rete: `run-turn`/provider passano per l IPC nel main). Verificato che il renderer non ha bisogno di `connect-src` remoto.

- [ ] **Step 0.5: verifica dello scaffold**

```bash
pnpm -r typecheck        # atteso: Done (le nuove deps risolvono i tipi; tsconfig invariato)
pnpm -C app/desktop build # atteso: build OK (Vite bundla le nuove deps; nessun font CDN)
pnpm test                # atteso: 476 passed (progetto packages) + renderer 0 file (passWithNoTests)
```
Se SQLite fallisce con `NODE_MODULE_VERSION 146 ... requires 137` -> `pnpm -r rebuild better-sqlite3` (HANDOFF §7-quinquies). **Non lanciare `pnpm test` mentre un `rebuild:electron` e in corso** (condividono il binario nativo — serializza).

---

## Task 1: Store Pinia read-side (`useReadModelStore`)

**Files:**
- Create: `app/desktop/src/renderer/src/stores/read-model.ts`
- Test: `app/desktop/src/renderer/src/stores/read-model.test.ts`

Lo store e la **sola porta di ingresso** dello stato nel renderer (spec §5.2): tiene `{version, state}` dal `read-model-push`, espone selettori derivati, e **non muta** lo stato (l unica scrittura e `applyPush`, chiamata dal bootstrap su ogni push). I tipi di vista derivano dal contratto IPC (`ReadModelPush` di `@loomn/shared`) -> il renderer NON importa `@loomn/engine` per il dominio.

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `app/desktop/src/renderer/src/stores/read-model.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { ReadModelPush } from '@loomn/shared';
import { useReadModelStore } from './read-model';

function actor(id: string, name: string, kind: 'pc' | 'npc') {
  return {
    id,
    name,
    kind,
    attributes: {},
    skills: {},
    resources: {},
    conditions: [],
    items: [],
    progression: { xp: 0, level: 1 },
  };
}

function push(over: Partial<ReadModelPush['state']> = {}, version = 1): ReadModelPush {
  return {
    version,
    state: { version, actors: {}, encounter: null, quests: {}, phase: 'exploration', ...over },
  };
}

describe('useReadModelStore', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('parte vuoto con fase iniziale exploration', () => {
    const s = useReadModelStore();
    expect(s.loaded).toBe(false);
    expect(s.version).toBe(0);
    expect(s.phase).toBe('exploration');
    expect(s.actors).toEqual([]);
    expect(s.quests).toEqual([]);
    expect(s.encounter).toBeNull();
  });

  it('applyPush popola versione e stato', () => {
    const s = useReadModelStore();
    s.applyPush(push({ actors: { goblin: actor('goblin', 'Goblin', 'npc') } }, 3));
    expect(s.version).toBe(3);
    expect(s.loaded).toBe(true);
    expect(s.actors.map((a) => a.id)).toEqual(['goblin']);
  });

  it('proietta pcs e npcs separati', () => {
    const s = useReadModelStore();
    s.applyPush(push({ actors: { k: actor('k', 'Kaelen', 'pc'), g: actor('g', 'Goblin', 'npc') } }));
    expect(s.pcs.map((a) => a.id)).toEqual(['k']);
    expect(s.npcs.map((a) => a.id)).toEqual(['g']);
  });

  it('riflette la fase e inCombat', () => {
    const s = useReadModelStore();
    s.applyPush(push({ phase: 'combat' }));
    expect(s.phase).toBe('combat');
    expect(s.inCombat).toBe(true);
  });

  it('proietta le quest come array', () => {
    const s = useReadModelStore();
    s.applyPush(push({ quests: { q1: { id: 'q1', title: 'La gemma', status: 'active' } } }));
    expect(s.quests.map((q) => q.id)).toEqual(['q1']);
  });

  it('l ultimo push sostituisce lo stato precedente', () => {
    const s = useReadModelStore();
    s.applyPush(push({ actors: { a: actor('a', 'A', 'pc') } }, 1));
    s.applyPush(push({ actors: {} }, 2));
    expect(s.version).toBe(2);
    expect(s.actors).toEqual([]);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm -C app/desktop exec vitest run src/renderer/src/stores/read-model.test.ts`
Expected: FAIL — `./read-model` non esiste (import error).

- [ ] **Step 3: Implementa lo store**

Crea `app/desktop/src/renderer/src/stores/read-model.ts`:
```typescript
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ReadModelPush } from '@loomn/shared';

// Tipi di vista derivati dal CONTRATTO IPC (shared resta la fonte; il renderer NON importa engine
// per il dominio). state DTO = ReadModelPush['state'] (z.infer di gameStateSchema).
export type GameStateView = ReadModelPush['state'];
export type ActorView = GameStateView['actors'][string];
export type QuestView = GameStateView['quests'][string];
export type EncounterView = GameStateView['encounter'];
export type PhaseView = GameStateView['phase'];

// Mirror del literal engine INITIAL_PHASE (phaseSchema lo include): fase di default prima del 1o push.
const INITIAL_PHASE: PhaseView = 'exploration';

/** Store read-side (spec 5.2): tiene lo snapshot {version, state} spinto da read-model-push.
 *  Il renderer NON muta lo stato: applyPush e l unica scrittura, i getter sono proiezioni. */
export const useReadModelStore = defineStore('readModel', () => {
  const version = ref(0);
  const state = ref<GameStateView | null>(null);

  /** Applica un push read-side (lo chiama il bootstrap su onReadModelPush). */
  function applyPush(push: ReadModelPush): void {
    version.value = push.version;
    state.value = push.state;
  }

  const loaded = computed<boolean>(() => state.value !== null);
  const phase = computed<PhaseView>(() => state.value?.phase ?? INITIAL_PHASE);
  const actors = computed<ActorView[]>(() => (state.value ? Object.values(state.value.actors) : []));
  const pcs = computed<ActorView[]>(() => actors.value.filter((a) => a.kind === 'pc'));
  const npcs = computed<ActorView[]>(() => actors.value.filter((a) => a.kind === 'npc'));
  const quests = computed<QuestView[]>(() => (state.value ? Object.values(state.value.quests) : []));
  const encounter = computed<EncounterView>(() => state.value?.encounter ?? null);
  const inCombat = computed<boolean>(() => phase.value === 'combat');

  return { version, state, applyPush, loaded, phase, actors, pcs, npcs, quests, encounter, inCombat };
});
```

- [ ] **Step 4: Esegui il test e verifica che passa**

Run: `pnpm -C app/desktop exec vitest run src/renderer/src/stores/read-model.test.ts`
Expected: PASS (6 test).

- [ ] **Step 5: Typecheck del pacchetto**

Run: `pnpm -C app/desktop typecheck`
Expected: `Done` (i tipi di vista derivano da `ReadModelPush` senza cast).

- [ ] **Step 6: Commit**

```bash
git add app/desktop/src/renderer/src/stores/read-model.ts app/desktop/src/renderer/src/stores/read-model.test.ts
git commit -m "feat(desktop): store Pinia read-side useReadModelStore con selettori"
```

---

## Task 2: Layout — preset per fase + port di persistenza

**Files:**
- Create: `app/desktop/src/renderer/src/layout/presets.ts`
- Create: `app/desktop/src/renderer/src/layout/persistence.ts`
- Test: `app/desktop/src/renderer/src/layout/presets.test.ts`
- Test: `app/desktop/src/renderer/src/layout/persistence.test.ts`

Logica **pura** (testabile senza grid-layout-plus, che misura il DOM): i preset di layout per fase (decisione 6/4 dello spec — combat = cockpit con lo scontro, le fasi non-combat condividono il preset esplorativo) e il **port** `LayoutPersistence` (preferenza di vista, non stato di dominio) con adapter localStorage **iniettabile** -> migrabile lato main senza toccare i call site.

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `app/desktop/src/renderer/src/layout/presets.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { presetFor, PANELS } from './presets';

describe('presetFor', () => {
  it('in combat include lo scontro e non la scheda', () => {
    const ids = presetFor('combat').map((it) => it.i);
    expect(ids).toContain(PANELS.encounter);
    expect(ids).not.toContain(PANELS.sheet);
    expect(ids).toContain(PANELS.narrative);
    expect(ids).toContain(PANELS.dice);
  });

  it('in exploration include la scheda e non lo scontro', () => {
    const ids = presetFor('exploration').map((it) => it.i);
    expect(ids).toContain(PANELS.sheet);
    expect(ids).not.toContain(PANELS.encounter);
  });

  it('dialogue e downtime condividono il preset non-combat', () => {
    expect(presetFor('dialogue')).toEqual(presetFor('downtime'));
    expect(presetFor('dialogue')).toEqual(presetFor('exploration'));
  });

  it('ritorna una copia (mutare il risultato non altera la chiamata successiva)', () => {
    const first = presetFor('combat');
    const item = first[0];
    if (item) item.x = 999;
    expect(presetFor('combat')[0]?.x).not.toBe(999);
  });
});
```

Crea `app/desktop/src/renderer/src/layout/persistence.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { createLocalStoragePersistence, resolveLayout } from './persistence';
import { presetFor } from './presets';
import type { LayoutItem } from './presets';

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    removeItem: (k: string) => {
      m.delete(k);
    },
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
  };
}

const sample: LayoutItem[] = [{ i: 'narrative', x: 1, y: 2, w: 3, h: 4 }];

describe('createLocalStoragePersistence', () => {
  it('salva e rilegge lo stesso layout (round-trip)', () => {
    const p = createLocalStoragePersistence(fakeStorage());
    p.save('combat', sample);
    expect(p.load('combat')).toEqual(sample);
  });

  it('load di una fase mai salvata e null', () => {
    const p = createLocalStoragePersistence(fakeStorage());
    expect(p.load('exploration')).toBeNull();
  });

  it('load di JSON corrotto e null (resiliente)', () => {
    const storage = fakeStorage();
    storage.setItem('loomn:layout:combat', '{ non json');
    expect(createLocalStoragePersistence(storage).load('combat')).toBeNull();
  });

  it('load di JSON valido ma forma sbagliata e null', () => {
    const storage = fakeStorage();
    storage.setItem('loomn:layout:combat', JSON.stringify([{ i: 'x', x: 'no' }]));
    expect(createLocalStoragePersistence(storage).load('combat')).toBeNull();
  });

  it('le fasi non si calpestano (chiave per fase)', () => {
    const p = createLocalStoragePersistence(fakeStorage());
    p.save('combat', sample);
    expect(p.load('exploration')).toBeNull();
  });
});

describe('resolveLayout', () => {
  it('ricade sul preset quando non c e nulla di persistito', () => {
    const p = createLocalStoragePersistence(fakeStorage());
    expect(resolveLayout('exploration', p)).toEqual(presetFor('exploration'));
  });

  it('usa l override persistito quando presente', () => {
    const p = createLocalStoragePersistence(fakeStorage());
    p.save('combat', sample);
    expect(resolveLayout('combat', p)).toEqual(sample);
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscono**

Run: `pnpm -C app/desktop exec vitest run src/renderer/src/layout/`
Expected: FAIL — `./presets` e `./persistence` non esistono.

- [ ] **Step 3: Implementa i preset**

Crea `app/desktop/src/renderer/src/layout/presets.ts`:
```typescript
import type { PhaseView } from '../stores/read-model';

/** Un item di layout di grid-layout-plus (griglia a colonne; coordinate in celle). */
export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Id dei pannelli del Gioco. Il CONTENUTO profondo arriva nei sotto-piani (narrazione/dadi 10b,
 *  scontro 10c, scheda 10d); 10a fissa il SET e le posizioni per fase. */
export const PANELS = {
  narrative: 'narrative',
  sheet: 'sheet',
  encounter: 'encounter',
  dice: 'dice',
} as const;

const COMBAT: LayoutItem[] = [
  { i: PANELS.narrative, x: 0, y: 0, w: 8, h: 12 },
  { i: PANELS.encounter, x: 8, y: 0, w: 4, h: 7 },
  { i: PANELS.dice, x: 8, y: 7, w: 4, h: 5 },
];

const NON_COMBAT: LayoutItem[] = [
  { i: PANELS.narrative, x: 0, y: 0, w: 8, h: 12 },
  { i: PANELS.sheet, x: 8, y: 0, w: 4, h: 7 },
  { i: PANELS.dice, x: 8, y: 7, w: 4, h: 5 },
];

/** Preset di default per fase (decisione 4/6 dello spec). combat = cockpit (scontro al posto della
 *  scheda); le fasi non-combat condividono il preset esplorativo. Ritorna una COPIA (no aliasing
 *  fra chiamate: il chiamante puo mutare il layout senza toccare i preset condivisi). */
export function presetFor(phase: PhaseView): LayoutItem[] {
  const base = phase === 'combat' ? COMBAT : NON_COMBAT;
  return base.map((it) => ({ ...it }));
}
```

- [ ] **Step 4: Implementa la persistenza**

Crea `app/desktop/src/renderer/src/layout/persistence.ts`:
```typescript
import type { LayoutItem } from './presets';
import { presetFor } from './presets';
import type { PhaseView } from '../stores/read-model';

/** Port di persistenza del layout (preferenza di vista, NON stato di dominio/event store).
 *  Astrazione deliberata: oggi adapter localStorage del renderer; se un domani servisse lato main
 *  (multi-finestra/backup) si scambia l adapter senza toccare i call site (isolato-e-migrabile). */
export interface LayoutPersistence {
  load(phase: PhaseView): LayoutItem[] | null;
  save(phase: PhaseView, layout: LayoutItem[]): void;
}

const KEY_PREFIX = 'loomn:layout:';

/** Adapter localStorage. `storage` iniettabile (default window.localStorage) -> testabile con un
 *  doppio. Letture resilienti: JSON corrotto / forma non valida -> null (si ricade sul preset). */
export function createLocalStoragePersistence(
  storage: Storage = window.localStorage,
): LayoutPersistence {
  return {
    load(phase) {
      const raw = storage.getItem(KEY_PREFIX + phase);
      if (raw === null) return null;
      try {
        const parsed: unknown = JSON.parse(raw);
        return isLayout(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    save(phase, layout) {
      storage.setItem(KEY_PREFIX + phase, JSON.stringify(layout));
    },
  };
}

function isLayout(v: unknown): v is LayoutItem[] {
  return (
    Array.isArray(v) &&
    v.every((it) => {
      if (typeof it !== 'object' || it === null) return false;
      const o = it as Record<string, unknown>;
      return (
        typeof o['i'] === 'string' &&
        typeof o['x'] === 'number' &&
        typeof o['y'] === 'number' &&
        typeof o['w'] === 'number' &&
        typeof o['h'] === 'number'
      );
    })
  );
}

/** Risolve il layout per la fase: override persistito se valido, altrimenti il preset di default. */
export function resolveLayout(phase: PhaseView, persistence: LayoutPersistence): LayoutItem[] {
  return persistence.load(phase) ?? presetFor(phase);
}
```

- [ ] **Step 5: Esegui i test e verifica che passano**

Run: `pnpm -C app/desktop exec vitest run src/renderer/src/layout/`
Expected: PASS (4 presets + 7 persistence = 11 test).

- [ ] **Step 6: Typecheck del pacchetto**

Run: `pnpm -C app/desktop typecheck`
Expected: `Done`.

- [ ] **Step 7: Commit**

```bash
git add app/desktop/src/renderer/src/layout/
git commit -m "feat(desktop): preset di layout per fase + port LayoutPersistence (localStorage)"
```

---

## Task 3: Design system — token CSS + componenti base + primitivo Reka

**Files:**
- Create: `app/desktop/src/renderer/src/styles/tokens.css`
- Create: `app/desktop/src/renderer/src/styles/base.css`
- Create: `app/desktop/src/renderer/src/styles/index.ts`
- Create: `app/desktop/src/renderer/src/components/LoomnPanel.vue`
- Create: `app/desktop/src/renderer/src/components/LoomnButton.vue`
- Create: `app/desktop/src/renderer/src/components/LoomnDialog.vue`
- Test: `app/desktop/src/renderer/src/components/LoomnPanel.test.ts`
- Test: `app/desktop/src/renderer/src/components/LoomnButton.test.ts`
- Test: `app/desktop/src/renderer/src/components/LoomnDialog.test.ts`

Il design system "strumento notturno" = **variabili CSS (token)** dal prototipo + font offline + wrapper riusabili. I token CSS e la tipografia non si unit-testano (jsdom non calcola CSS) -> la prova e screenshot/self-test; i component test coprono solo **comportamento/struttura** (decisione 9: component test selettivi). Reka UI e **headless** -> `LoomnDialog` prova il pattern "primitivo accessibile + token bespoke" (decisione 3).

- [ ] **Step 1: Scrivi i component test che falliscono**

Crea `app/desktop/src/renderer/src/components/LoomnPanel.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LoomnPanel from './LoomnPanel.vue';

describe('LoomnPanel', () => {
  it('rende eyebrow, titolo e meta quando forniti', () => {
    const w = mount(LoomnPanel, { props: { eyebrow: 'scena', title: 'Il mercato', meta: 'turno 14' } });
    expect(w.text()).toContain('scena');
    expect(w.text()).toContain('Il mercato');
    expect(w.text()).toContain('turno 14');
  });

  it('rende il contenuto dello slot di default nel body', () => {
    const w = mount(LoomnPanel, { props: { title: 'X' }, slots: { default: 'corpo del pannello' } });
    expect(w.text()).toContain('corpo del pannello');
  });

  it('omette la testata quando non ci sono eyebrow/title/meta', () => {
    const w = mount(LoomnPanel, { slots: { default: 'solo corpo' } });
    expect(w.find('.loomn-panel__head').exists()).toBe(false);
  });
});
```

Crea `app/desktop/src/renderer/src/components/LoomnButton.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LoomnButton from './LoomnButton.vue';

describe('LoomnButton', () => {
  it('rende il contenuto dello slot', () => {
    const w = mount(LoomnButton, { slots: { default: 'Invia' } });
    expect(w.text()).toContain('Invia');
  });

  it('emette click quando premuto', async () => {
    const w = mount(LoomnButton);
    await w.trigger('click');
    expect(w.emitted('click')).toHaveLength(1);
  });

  it('non emette click quando disabled', async () => {
    const w = mount(LoomnButton, { props: { disabled: true } });
    await w.trigger('click');
    expect(w.emitted('click')).toBeUndefined();
  });

  it('applica la classe della variant', () => {
    const w = mount(LoomnButton, { props: { variant: 'solid' } });
    expect(w.find('button').classes()).toContain('loomn-btn--solid');
  });
});
```

Crea `app/desktop/src/renderer/src/components/LoomnDialog.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LoomnDialog from './LoomnDialog.vue';

describe('LoomnDialog', () => {
  it('monta e rende il contenuto dello slot trigger (Reka integra)', () => {
    const w = mount(LoomnDialog, { props: { title: 'Conferma' }, slots: { trigger: 'Apri' } });
    expect(w.text()).toContain('Apri');
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscono**

Run: `pnpm -C app/desktop exec vitest run src/renderer/src/components/`
Expected: FAIL — i componenti non esistono.

- [ ] **Step 3: Token CSS**

Crea `app/desktop/src/renderer/src/styles/tokens.css` (token dal prototipo approvato + override per fase):
```css
:root {
  --ink: #0c0d10;
  --ink-edge: #070809;
  --panel: #15171c;
  --panel-hi: #191c22;
  --raise: #1f232a;
  --line: rgba(233, 229, 218, 0.08);
  --line-2: rgba(233, 229, 218, 0.14);
  --text: #e9e5da;
  --text-2: #9b988f;
  --text-3: #6b6962;
  --brass: #c8a45c;
  --brass-hi: #e3c684;
  --brass-dim: rgba(200, 164, 92, 0.12);
  --clay: #c0694f;
  --sage: #7fa07e;
  --steel: #6f8fb0;
  --ok: #86b48a;
  --bad: #c5635b;
  --accent: var(--brass);
  --accent-dim: var(--brass-dim);
  --f-display: 'Fraunces Variable', Georgia, serif;
  --f-read: 'Newsreader Variable', Georgia, serif;
  --f-ui: 'Archivo Variable', 'Helvetica Neue', sans-serif;
  --f-mono: 'JetBrains Mono Variable', ui-monospace, monospace;
  --r: 15px;
  --r-sm: 11px;
  --r-xs: 8px;
}

/* Accento per fase (decisione 2): l intera shell comunica la modalita. Lo applica App.vue su
   [data-phase] del root; i pannelli ereditano via var(--accent)/var(--accent-dim). */
[data-phase='combat'] {
  --accent: var(--clay);
  --accent-dim: rgba(192, 105, 79, 0.13);
}
[data-phase='dialogue'] {
  --accent: #cbb07a;
  --accent-dim: rgba(203, 176, 122, 0.12);
}
[data-phase='downtime'] {
  --accent: #8aa0a8;
  --accent-dim: rgba(138, 160, 168, 0.12);
}
```

- [ ] **Step 4: Base CSS**

Crea `app/desktop/src/renderer/src/styles/base.css`:
```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
html,
body,
#app {
  height: 100%;
}
body {
  font-family: var(--f-ui);
  color: var(--text);
  background: radial-gradient(120% 90% at 50% -10%, #16181d 0%, var(--ink) 42%, var(--ink-edge) 100%) fixed;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  overflow: hidden;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
::-webkit-scrollbar {
  width: 10px;
}
::-webkit-scrollbar-thumb {
  background: #23262d;
  border-radius: 8px;
  border: 3px solid var(--panel);
}
```

- [ ] **Step 5: Entry degli stili (font offline + css)**

Crea `app/desktop/src/renderer/src/styles/index.ts`:
```typescript
// Font letterari bundlati OFFLINE (vincolo CSP default-src 'self': niente Google Fonts CDN).
// I @fontsource-variable espongono i family 'Fraunces Variable' ecc. usati nei token.
import '@fontsource-variable/fraunces';
import '@fontsource-variable/newsreader';
import '@fontsource-variable/archivo';
import '@fontsource-variable/jetbrains-mono';
import 'grid-layout-plus/dist/style.css';
import './tokens.css';
import './base.css';
```

- [ ] **Step 6: LoomnPanel**

Crea `app/desktop/src/renderer/src/components/LoomnPanel.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ eyebrow?: string; title?: string; meta?: string }>();
const hasHead = computed(() => Boolean(props.eyebrow ?? props.title ?? props.meta));
</script>

<template>
  <section class="loomn-panel">
    <header v-if="hasHead" class="loomn-panel__head">
      <span v-if="eyebrow" class="loomn-panel__eyebrow">{{ eyebrow }}</span>
      <span v-if="title" class="loomn-panel__title">{{ title }}</span>
      <span v-if="meta" class="loomn-panel__meta">{{ meta }}</span>
    </header>
    <div class="loomn-panel__body"><slot /></div>
  </section>
</template>

<style scoped>
.loomn-panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--r);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.03) inset, 0 22px 48px -26px rgba(0, 0, 0, 0.75);
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}
.loomn-panel__head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px 18px 13px;
  border-bottom: 1px solid var(--line);
}
.loomn-panel__eyebrow {
  font-size: 10.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-3);
  font-weight: 600;
}
.loomn-panel__title {
  font-family: var(--f-display);
  font-size: 17px;
  font-weight: 500;
  color: var(--text);
  line-height: 1.2;
}
.loomn-panel__meta {
  margin-left: auto;
  font-family: var(--f-mono);
  font-size: 11px;
  color: var(--text-3);
}
.loomn-panel__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px 18px;
}
</style>
```

- [ ] **Step 7: LoomnButton**

Crea `app/desktop/src/renderer/src/components/LoomnButton.vue`:
```vue
<script setup lang="ts">
const props = withDefaults(defineProps<{ variant?: 'solid' | 'ghost'; disabled?: boolean }>(), {
  variant: 'ghost',
  disabled: false,
});
const emit = defineEmits<{ (e: 'click', ev: MouseEvent): void }>();

function onClick(ev: MouseEvent): void {
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
  font-family: var(--f-ui);
  font-size: 12px;
  padding: 8px 15px;
  border-radius: 10px;
  cursor: pointer;
  transition: 0.15s;
}
.loomn-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.loomn-btn--ghost {
  color: var(--text);
  border: 1px solid var(--line-2);
  background: #101216;
}
.loomn-btn--ghost:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--brass-hi);
  background: var(--accent-dim);
}
.loomn-btn--solid {
  color: #1a140a;
  border: none;
  background: linear-gradient(180deg, #d8b76b, #b88f43);
}
.loomn-btn--solid:hover:not(:disabled) {
  filter: brightness(1.08);
}
</style>
```

- [ ] **Step 8: LoomnDialog (wrapper Reka headless)**

Crea `app/desktop/src/renderer/src/components/LoomnDialog.vue`:
```vue
<script setup lang="ts">
import {
  DialogRoot,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogClose,
} from 'reka-ui';

defineProps<{ title: string }>();
</script>

<template>
  <DialogRoot>
    <DialogTrigger class="loomn-dialog__trigger"><slot name="trigger" /></DialogTrigger>
    <DialogPortal>
      <DialogOverlay class="loomn-dialog__overlay" />
      <DialogContent class="loomn-dialog__content">
        <DialogTitle class="loomn-dialog__title">{{ title }}</DialogTitle>
        <div class="loomn-dialog__body"><slot /></div>
        <DialogClose class="loomn-dialog__close" aria-label="chiudi">&#x2715;</DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.loomn-dialog__trigger {
  font: inherit;
  cursor: pointer;
  background: none;
  border: none;
  color: inherit;
}
.loomn-dialog__overlay {
  position: fixed;
  inset: 0;
  background: rgba(7, 8, 9, 0.6);
}
.loomn-dialog__content {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  min-width: 320px;
  background: var(--panel);
  border: 1px solid var(--line-2);
  border-radius: var(--r);
  padding: 20px 22px;
  box-shadow: 0 30px 70px -30px rgba(0, 0, 0, 0.8);
}
.loomn-dialog__title {
  font-family: var(--f-display);
  font-size: 18px;
  color: var(--text);
  margin-bottom: 12px;
}
.loomn-dialog__close {
  position: absolute;
  top: 14px;
  right: 14px;
  background: none;
  border: none;
  color: var(--text-3);
  cursor: pointer;
}
</style>
```

- [ ] **Step 9: Esegui i test e verifica che passano**

Run: `pnpm -C app/desktop exec vitest run src/renderer/src/components/`
Expected: PASS (3 panel + 4 button + 1 dialog = 8 test).

- [ ] **Step 10: Typecheck del pacchetto**

Run: `pnpm -C app/desktop typecheck`
Expected: `Done`.

- [ ] **Step 11: Commit**

```bash
git add app/desktop/src/renderer/src/styles/ app/desktop/src/renderer/src/components/
git commit -m "feat(desktop): design system strumento notturno (token + LoomnPanel/Button/Dialog)"
```

---

## Task 4: Shell — Vue Router + viste skeleton + frame adattivo

**Files:**
- Create: `app/desktop/src/renderer/src/router/index.ts`
- Create: `app/desktop/src/renderer/src/views/GameView.vue` (stub; completato in Task 5)
- Create: `app/desktop/src/renderer/src/views/JournalView.vue`
- Create: `app/desktop/src/renderer/src/views/SheetView.vue`
- Create: `app/desktop/src/renderer/src/views/CompanyView.vue`
- Create: `app/desktop/src/renderer/src/views/SettingsView.vue`
- Modify: `app/desktop/src/renderer/src/App.vue`
- Test: `app/desktop/src/renderer/src/App.test.ts`

La shell e rail + topbar + `<RouterView>`; il root porta `data-phase` legato a `store.phase` (re-theming, decisione 1/2). Hash history perche l app gira da `file://` (la web history richiede un server). Le route profonde (Diario/Scheda/Compagnia/Impostazioni) sono **skeleton** (contenuto nei sotto-piani); Compagnia mostra gia il roster minimo dal read-model (lega a qualcosa che esiste).

- [ ] **Step 1: Scrivi il test della shell che fallisce**

Crea `app/desktop/src/renderer/src/App.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';
import type { ReadModelPush } from '@loomn/shared';
import { createAppRouter } from './router';
import { useReadModelStore } from './stores/read-model';
import App from './App.vue';

function push(phase: ReadModelPush['state']['phase']): ReadModelPush {
  return { version: 1, state: { version: 1, actors: {}, encounter: null, quests: {}, phase } };
}

async function mountApp() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createAppRouter(createMemoryHistory());
  router.push('/');
  await router.isReady();
  const wrapper = mount(App, { global: { plugins: [pinia, router] } });
  return { wrapper, router };
}

describe('App shell', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('rende le 5 voci di navigazione', async () => {
    const { wrapper } = await mountApp();
    expect(wrapper.findAll('.nav-btn')).toHaveLength(5);
  });

  it('parte sul Gioco e naviga al Diario', async () => {
    const { wrapper, router } = await mountApp();
    expect(router.currentRoute.value.name).toBe('game');
    await router.push('/diario');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('journal');
    expect(wrapper.text()).toContain('Diario');
  });

  it('riflette la fase del read-model su data-phase', async () => {
    const { wrapper } = await mountApp();
    const store = useReadModelStore();
    store.applyPush(push('combat'));
    await flushPromises();
    expect(wrapper.find('.app-shell').attributes('data-phase')).toBe('combat');
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm -C app/desktop exec vitest run src/renderer/src/App.test.ts`
Expected: FAIL — `./router` e le viste non esistono.

- [ ] **Step 3: Router**

Crea `app/desktop/src/renderer/src/router/index.ts`:
```typescript
import {
  createRouter,
  createWebHashHistory,
  type Router,
  type RouterHistory,
  type RouteRecordRaw,
} from 'vue-router';
import GameView from '../views/GameView.vue';
import JournalView from '../views/JournalView.vue';
import SheetView from '../views/SheetView.vue';
import CompanyView from '../views/CompanyView.vue';
import SettingsView from '../views/SettingsView.vue';

export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'game', component: GameView },
  { path: '/diario', name: 'journal', component: JournalView },
  { path: '/scheda', name: 'sheet', component: SheetView },
  { path: '/compagnia', name: 'company', component: CompanyView },
  { path: '/impostazioni', name: 'settings', component: SettingsView },
];

// Hash history: l app gira da file:// (la web history richiede un server). history iniettabile -> i
// test usano createMemoryHistory.
export function createAppRouter(history: RouterHistory = createWebHashHistory()): Router {
  return createRouter({ history, routes });
}
```

- [ ] **Step 4: Viste skeleton**

Crea `app/desktop/src/renderer/src/views/GameView.vue` (stub; Task 5 lo sostituisce con la griglia):
```vue
<script setup lang="ts">
import LoomnPanel from '../components/LoomnPanel.vue';
</script>

<template>
  <main class="game-view">
    <LoomnPanel eyebrow="gioco" title="Plancia di gioco">
      <p>La plancia a pannelli arriva nel prossimo passo di questo piano.</p>
    </LoomnPanel>
  </main>
</template>

<style scoped>
.game-view {
  flex: 1;
  min-height: 0;
}
</style>
```

Crea `app/desktop/src/renderer/src/views/JournalView.vue`:
```vue
<script setup lang="ts">
import LoomnPanel from '../components/LoomnPanel.vue';
</script>

<template>
  <main class="route-view">
    <LoomnPanel eyebrow="diario" title="Diario">
      <p>Narrativa L2 e canon arrivano nel Piano 10e.</p>
    </LoomnPanel>
  </main>
</template>

<style scoped>
.route-view {
  flex: 1;
  min-height: 0;
}
</style>
```

Crea `app/desktop/src/renderer/src/views/SheetView.vue`:
```vue
<script setup lang="ts">
import LoomnPanel from '../components/LoomnPanel.vue';
</script>

<template>
  <main class="route-view">
    <LoomnPanel eyebrow="scheda" title="Scheda del personaggio">
      <p>Attributi, risorse, condizioni e inventario data-driven arrivano nel Piano 10d.</p>
    </LoomnPanel>
  </main>
</template>

<style scoped>
.route-view {
  flex: 1;
  min-height: 0;
}
</style>
```

Crea `app/desktop/src/renderer/src/views/CompanyView.vue` (roster minimo dal read-model — lega a cio che esiste):
```vue
<script setup lang="ts">
import { useReadModelStore } from '../stores/read-model';
import LoomnPanel from '../components/LoomnPanel.vue';

const store = useReadModelStore();
</script>

<template>
  <main class="route-view">
    <LoomnPanel eyebrow="compagnia" title="Compagnia" :meta="`${store.actors.length} attori`">
      <ul v-if="store.actors.length" class="roster">
        <li v-for="a in store.actors" :key="a.id" class="roster__row">
          <span class="roster__name">{{ a.name }}</span>
          <span class="roster__kind">{{ a.kind }}</span>
        </li>
      </ul>
      <p v-else>Nessun attore ancora. Relazioni e dettagli arrivano nel Piano 10e.</p>
    </LoomnPanel>
  </main>
</template>

<style scoped>
.route-view {
  flex: 1;
  min-height: 0;
}
.roster {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.roster__row {
  display: flex;
  justify-content: space-between;
  padding: 9px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: #101216;
}
.roster__name {
  color: var(--text);
}
.roster__kind {
  font-family: var(--f-mono);
  font-size: 11px;
  color: var(--text-3);
}
</style>
```

Crea `app/desktop/src/renderer/src/views/SettingsView.vue`:
```vue
<script setup lang="ts">
import LoomnPanel from '../components/LoomnPanel.vue';
</script>

<template>
  <main class="route-view">
    <LoomnPanel eyebrow="impostazioni" title="Impostazioni">
      <p>Provider, first-run, creazione PG e controlli GM arrivano nel Piano 10f.</p>
    </LoomnPanel>
  </main>
</template>

<style scoped>
.route-view {
  flex: 1;
  min-height: 0;
}
</style>
```

- [ ] **Step 5: App shell (rewrite)**

Sostituisci INTERAMENTE `app/desktop/src/renderer/src/App.vue` con:
```vue
<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, RouterLink } from 'vue-router';
import { useReadModelStore } from './stores/read-model';
import type { PhaseView } from './stores/read-model';

const store = useReadModelStore();
const phase = computed<PhaseView>(() => store.phase);

const navItems = [
  { to: '/', label: 'Gioco' },
  { to: '/diario', label: 'Diario' },
  { to: '/scheda', label: 'Scheda' },
  { to: '/compagnia', label: 'Compagnia' },
  { to: '/impostazioni', label: 'Impostazioni' },
] as const;

const phaseLabels: Record<PhaseView, string> = {
  exploration: 'esplorazione',
  dialogue: 'dialogo',
  combat: 'combattimento',
  downtime: 'quiete',
};
const phaseLabel = computed(() => phaseLabels[phase.value]);
</script>

<template>
  <div class="app-shell" :data-phase="phase">
    <aside class="rail" aria-label="navigazione">
      <div class="brand-mark">L</div>
      <RouterLink
        v-for="it in navItems"
        :key="it.to"
        :to="it.to"
        class="nav-btn"
        active-class="nav-btn--active"
        :title="it.label"
        :aria-label="it.label"
        >{{ it.label.charAt(0) }}</RouterLink
      >
    </aside>
    <div class="stage">
      <header class="topbar">
        <div class="wordmark">Loomn<span class="dot">.</span></div>
        <div class="phase-badge">{{ phaseLabel }}</div>
      </header>
      <RouterView />
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: 66px 1fr;
  height: 100vh;
  padding: 14px;
  gap: 14px;
}
.rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 0;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--r);
}
.brand-mark {
  font-family: var(--f-display);
  font-weight: 600;
  font-size: 20px;
  color: var(--text);
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  margin-bottom: 10px;
  border: 1px solid var(--line-2);
  border-radius: 12px;
  background: linear-gradient(180deg, #1c1f25, #15171b);
}
.nav-btn {
  width: 42px;
  height: 42px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  color: var(--text-3);
  border: 1px solid transparent;
  cursor: pointer;
  transition: 0.18s;
  text-decoration: none;
  font-family: var(--f-display);
  font-size: 15px;
}
.nav-btn:hover {
  color: var(--text-2);
  background: var(--panel-hi);
  border-color: var(--line);
}
.nav-btn--active {
  color: var(--accent);
  background: var(--accent-dim);
  border-color: rgba(200, 164, 92, 0.25);
}
.stage {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.topbar {
  display: flex;
  align-items: center;
  gap: 18px;
  height: 54px;
  padding: 0 18px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--r);
}
.wordmark {
  font-family: var(--f-display);
  font-size: 21px;
  font-weight: 600;
  letter-spacing: 0.01em;
}
.wordmark .dot {
  color: var(--accent);
}
.phase-badge {
  margin-left: auto;
  font-size: 12px;
  letter-spacing: 0.02em;
  color: var(--accent);
  background: var(--accent-dim);
  border: 1px solid rgba(200, 164, 92, 0.22);
  padding: 6px 12px;
  border-radius: 9px;
}
</style>
```

- [ ] **Step 6: Esegui il test e verifica che passa**

Run: `pnpm -C app/desktop exec vitest run src/renderer/src/App.test.ts`
Expected: PASS (3 test).

- [ ] **Step 7: Typecheck del pacchetto**

Run: `pnpm -C app/desktop typecheck`
Expected: `Done`.

- [ ] **Step 8: Commit**

```bash
git add app/desktop/src/renderer/src/router/ app/desktop/src/renderer/src/views/ app/desktop/src/renderer/src/App.vue app/desktop/src/renderer/src/App.test.ts
git commit -m "feat(desktop): shell Vue Router (rail/topbar/route) + frame adattivo alla fase"
```

---

## Task 5: Gioco — `grid-layout-plus` + composable di layout

**Files:**
- Create: `app/desktop/src/renderer/src/composables/use-game-layout.ts`
- Test: `app/desktop/src/renderer/src/composables/use-game-layout.test.ts`
- Modify: `app/desktop/src/renderer/src/views/GameView.vue`
- Test: `app/desktop/src/renderer/src/views/GameView.test.ts`

La logica del layout (risolvi per fase, ri-risolvi al cambio fase, persisti il riarrangiamento) vive in un **composable** testabile senza grid-layout-plus (che misura il DOM). `GameView` e presentazionale: collega il composable a `<GridLayout>`. Il component test stubba `GridLayout`/`GridItem` per asserire i pannelli per fase senza il layout reale (decisione 9: la resa visiva e validata da screenshot/self-test).

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `app/desktop/src/renderer/src/composables/use-game-layout.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { ref, nextTick } from 'vue';
import { useGameLayout } from './use-game-layout';
import { createLocalStoragePersistence } from '../layout/persistence';
import { presetFor, PANELS } from '../layout/presets';
import type { PhaseView } from '../stores/read-model';

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    removeItem: (k: string) => {
      m.delete(k);
    },
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
  };
}

describe('useGameLayout', () => {
  it('parte col preset della fase quando non c e nulla di persistito', () => {
    const phase = ref<PhaseView>('exploration');
    const { layout } = useGameLayout(phase, createLocalStoragePersistence(fakeStorage()));
    expect(layout.value).toEqual(presetFor('exploration'));
  });

  it('ri-risolve al cambio fase (combat porta il pannello scontro)', async () => {
    const phase = ref<PhaseView>('exploration');
    const { layout } = useGameLayout(phase, createLocalStoragePersistence(fakeStorage()));
    phase.value = 'combat';
    await nextTick();
    expect(layout.value.map((it) => it.i)).toContain(PANELS.encounter);
  });

  it('onLayoutUpdated persiste e aggiorna il layout corrente', () => {
    const phase = ref<PhaseView>('combat');
    const persistence = createLocalStoragePersistence(fakeStorage());
    const { layout, onLayoutUpdated } = useGameLayout(phase, persistence);
    const moved = [{ i: PANELS.narrative, x: 1, y: 1, w: 6, h: 10 }];
    onLayoutUpdated(moved);
    expect(layout.value).toEqual(moved);
    expect(persistence.load('combat')).toEqual(moved);
  });

  it('tornando a una fase con override persistito lo ricarica', async () => {
    const persistence = createLocalStoragePersistence(fakeStorage());
    const phase = ref<PhaseView>('combat');
    const { onLayoutUpdated } = useGameLayout(phase, persistence);
    const moved = [{ i: PANELS.dice, x: 0, y: 0, w: 4, h: 4 }];
    onLayoutUpdated(moved);
    phase.value = 'exploration';
    await nextTick();
    phase.value = 'combat';
    await nextTick();
    expect(persistence.load('combat')).toEqual(moved);
  });
});
```

Crea `app/desktop/src/renderer/src/views/GameView.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { ReadModelPush } from '@loomn/shared';
import { useReadModelStore } from '../stores/read-model';
import GameView from './GameView.vue';

// Stub di grid-layout-plus (in jsdom misurerebbe il DOM): passthrough degli slot.
const GridLayout = { template: '<div class="grid-stub"><slot /></div>' };
const GridItem = {
  props: ['x', 'y', 'w', 'h', 'i'],
  template: '<div class="grid-item-stub"><slot /></div>',
};

function push(phase: ReadModelPush['state']['phase']): ReadModelPush {
  return { version: 1, state: { version: 1, actors: {}, encounter: null, quests: {}, phase } };
}

function mountGame() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(GameView, { global: { plugins: [pinia], stubs: { GridLayout, GridItem } } });
}

describe('GameView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('in exploration rende narrazione, scheda e dadi', () => {
    const w = mountGame();
    const text = w.text();
    expect(w.findAll('.grid-item-stub')).toHaveLength(3);
    expect(text).toContain('Narrazione');
    expect(text).toContain('Scheda');
    expect(text).toContain('Dadi');
  });

  it('passando a combat sostituisce la scheda con lo scontro', async () => {
    const w = mountGame();
    const store = useReadModelStore();
    store.applyPush(push('combat'));
    await flushPromises();
    const text = w.text();
    expect(text).toContain('Scontro');
    expect(text).not.toContain('Scheda');
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscono**

Run: `pnpm -C app/desktop exec vitest run src/renderer/src/composables/ src/renderer/src/views/GameView.test.ts`
Expected: FAIL — `./use-game-layout` non esiste e `GameView` (stub) non rende i pannelli per fase.

- [ ] **Step 3: Implementa il composable**

Crea `app/desktop/src/renderer/src/composables/use-game-layout.ts`:
```typescript
import { ref, watch, type Ref } from 'vue';
import type { LayoutItem } from '../layout/presets';
import { resolveLayout, type LayoutPersistence } from '../layout/persistence';
import type { PhaseView } from '../stores/read-model';

/** Logica del layout del Gioco: risolve il layout per la fase corrente (override persistito o
 *  preset), ri-risolve al cambio fase, e persiste il riarrangiamento dell utente. Estratta dal
 *  componente per essere testabile senza grid-layout-plus (che misura il DOM). */
export function useGameLayout(
  phase: Ref<PhaseView>,
  persistence: LayoutPersistence,
): { layout: Ref<LayoutItem[]>; onLayoutUpdated: (next: LayoutItem[]) => void } {
  const layout = ref<LayoutItem[]>(resolveLayout(phase.value, persistence));

  watch(phase, (next) => {
    layout.value = resolveLayout(next, persistence);
  });

  /** Lo chiama grid-layout-plus su layout-updated: persiste l arrangiamento per la fase corrente. */
  function onLayoutUpdated(next: LayoutItem[]): void {
    layout.value = next;
    persistence.save(phase.value, next);
  }

  return { layout, onLayoutUpdated };
}
```

- [ ] **Step 4: Implementa GameView (sostituisce lo stub del Task 4)**

Sostituisci INTERAMENTE `app/desktop/src/renderer/src/views/GameView.vue` con:
```vue
<script setup lang="ts">
import { computed } from 'vue';
import { GridLayout, GridItem } from 'grid-layout-plus';
import { useReadModelStore } from '../stores/read-model';
import type { PhaseView } from '../stores/read-model';
import { createLocalStoragePersistence } from '../layout/persistence';
import { useGameLayout } from '../composables/use-game-layout';
import LoomnPanel from '../components/LoomnPanel.vue';

const store = useReadModelStore();
const phase = computed<PhaseView>(() => store.phase);
const persistence = createLocalStoragePersistence();
const { layout, onLayoutUpdated } = useGameLayout(phase, persistence);

// Titoli dei pannelli fondazionali. Il contenuto profondo arriva nei sotto-piani.
const titles: Record<string, string> = {
  narrative: 'Narrazione',
  sheet: 'Scheda',
  encounter: 'Scontro',
  dice: 'Dadi',
};
</script>

<template>
  <main class="game-view">
    <GridLayout
      v-model:layout="layout"
      :col-num="12"
      :row-height="30"
      :margin="[14, 14]"
      @layout-updated="onLayoutUpdated"
    >
      <GridItem v-for="item in layout" :key="item.i" :x="item.x" :y="item.y" :w="item.w" :h="item.h" :i="item.i">
        <LoomnPanel :title="titles[item.i] ?? item.i" eyebrow="pannello">
          <p class="game-view__placeholder">Contenuto nel Piano 10b / 10c / 10d.</p>
        </LoomnPanel>
      </GridItem>
    </GridLayout>
  </main>
</template>

<style scoped>
.game-view {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.game-view__placeholder {
  color: var(--text-3);
  font-size: 13px;
}
</style>
```

- [ ] **Step 5: Esegui i test e verifica che passano**

Run: `pnpm -C app/desktop exec vitest run src/renderer/src/composables/ src/renderer/src/views/GameView.test.ts`
Expected: PASS (4 composable + 2 GameView = 6 test).

- [ ] **Step 6: Typecheck del pacchetto**

Run: `pnpm -C app/desktop typecheck`
Expected: `Done`.

- [ ] **Step 7: Commit**

```bash
git add app/desktop/src/renderer/src/composables/ app/desktop/src/renderer/src/views/GameView.vue app/desktop/src/renderer/src/views/GameView.test.ts
git commit -m "feat(desktop): plancia Gioco grid-layout-plus con preset per fase e persistenza"
```

---

## Task 6: Bootstrap del renderer + self-test esteso (gate)

**Files:**
- Modify: `app/desktop/src/renderer/src/renderer.ts`

Il renderer diventa la vera app Vue (createApp + Pinia + Router + stili) e **sottoscrive lo store al push read-side**. Il gate `LOOMN_SELFTEST` (rischio D dell HANDOFF) deve continuare a dare `VERDICT: PASS`: il driver, oltre ai giri IPC esistenti (Piano 0), ora asserisce che lo **store Pinia riceve il push** e che il **router naviga** le route. Nessun unit test nuovo: la prova e l esecuzione dell app (Verifica finale).

- [ ] **Step 1: Riscrivi `renderer.ts`**

Sostituisci INTERAMENTE `app/desktop/src/renderer/src/renderer.ts` con:
```typescript
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import type { Router } from 'vue-router';
import type { ReadModelPush } from '@loomn/shared';
import App from './App.vue';
import { createAppRouter } from './router';
import { useReadModelStore } from './stores/read-model';
import './styles';

const pinia = createPinia();
const router = createAppRouter();
const app = createApp(App);
app.use(pinia);
app.use(router);
app.mount('#app');

// Lo store usa la pinia appena creata. La sottoscrizione al push read-side e l UNICA via per cui lo
// stato entra nel renderer (spec 5.2): il main spinge {version, state}, lo store proietta.
const store = useReadModelStore(pinia);
window.loomn.onReadModelPush((push) => store.applyPush(push));

// Self-test scriptabile (gate, evoluzione del 9c-ii/Piano 0 sull app Vue reale): guidato da
// ?selftest=<fase>, NON-GUI per il resto. Logga un singolo VERDICT che il main cattura (exit 0/1).
const selfTest = new URLSearchParams(location.search).get('selftest');
if (selfTest !== null) void runSelfTest(selfTest, store, router);

async function runSelfTest(
  phase: string,
  readModel: ReturnType<typeof useReadModelStore>,
  appRouter: Router,
): Promise<void> {
  const lines: string[] = [];
  const check = (cond: boolean, label: string): void => {
    lines.push(`${cond ? 'ok' : 'FAIL'} ${label}`);
  };
  // Cattura il primo push read-side (spinto su did-finish-load): serve alla durabilita in fase 2.
  const firstPush = new Promise<ReadModelPush>((resolve) => {
    window.loomn.onReadModelPush((push) => resolve(push));
  });

  try {
    if (phase === '1') {
      const s0 = await window.loomn.getStatus();
      check(s0.version === 0, 'DB fresco a versione 0');
      check(s0.safeStorageAvailable, 'safeStorage disponibile');

      // Attende il push prodotto dal dispatch -> verifica che lo store Pinia lo proietti.
      const pushed = new Promise<ReadModelPush>((resolve) => {
        const off = window.loomn.onReadModelPush((p) => {
          if (p.version >= 1) {
            off();
            resolve(p);
          }
        });
      });

      const d = await window.loomn.dispatch({
        type: 'AddActor',
        actor: {
          id: 'goblin',
          name: 'Goblin',
          kind: 'npc',
          attributes: {},
          skills: {},
          resources: { hp: { current: 10, max: 10 } },
          conditions: [],
          items: [],
          progression: { xp: 0, level: 1 },
        },
      });
      check(d.ok && d.version === 1, 'dispatch AddActor porta a versione 1');
      check(d.ok && d.events.some((e) => e.type === 'ActorAdded'), 'dispatch espone gli events (ActorAdded)');

      const p = await Promise.race([
        pushed,
        new Promise<ReadModelPush>((_r, reject) =>
          setTimeout(() => reject(new Error('nessun push dopo dispatch')), 5000),
        ),
      ]);
      check(p.state.actors['goblin']?.name === 'Goblin', 'read-model push ricevuto dopo dispatch');
      check(readModel.version === 1 && readModel.actors.length === 1, 'store Pinia riflette il push read-side');

      await appRouter.push('/diario');
      check(appRouter.currentRoute.value.name === 'journal', 'router naviga al Diario');
      await appRouter.push('/');
      check(appRouter.currentRoute.value.name === 'game', 'router torna al Gioco');

      const hist = await window.loomn.getNarrationHistory({});
      check(hist.ok && hist.entries.length === 0 && hist.hasMore === false, 'narration history vuota a inizio');

      const canon = await window.loomn.getCanon({});
      check(canon.ok && canon.facts.length === 0, 'canon vuoto a inizio');

      const sums = await window.loomn.getSummaries({});
      check(sums.ok && sums.summaries.length === 0, 'summaries vuoti a inizio');

      const sp = await window.loomn.setProvider({
        baseUrl: 'http://localhost:1234/v1',
        model: 'local',
        apiKey: 'sk-selftest',
      });
      check(sp.ok, 'set-provider ok (chiave cifrata con safeStorage)');

      const s1 = await window.loomn.getStatus();
      check(s1.providerConfigured, 'provider configurato dopo set-provider');
    } else {
      const s0 = await window.loomn.getStatus();
      check(s0.version === 1, 'versione 1 PERSISTITA dopo il riavvio (durabilita su disco)');
      check(s0.providerConfigured, 'provider ricostruito da settings.json (chiave decifrata)');

      const push = await Promise.race([
        firstPush,
        new Promise<ReadModelPush>((_resolve, reject) =>
          setTimeout(() => reject(new Error('nessun read-model push')), 5000),
        ),
      ]);
      check(push.state.actors['goblin']?.name === 'Goblin', 'attore goblin sopravvissuto al riavvio');
      check(readModel.actors.some((a) => a.id === 'goblin'), 'store Pinia riflette lo stato persistito');
    }

    const passed = lines.every((l) => l.startsWith('ok'));
    console.log(`VERDICT: ${passed ? 'PASS' : 'FAIL'} fase=${phase} [${lines.join('; ')}]`);
  } catch (err) {
    console.log(`VERDICT: FAIL fase=${phase} eccezione=${err instanceof Error ? err.message : String(err)}`);
  }
}
```

- [ ] **Step 2: Typecheck del pacchetto**

Run: `pnpm -C app/desktop typecheck`
Expected: `Done`.

- [ ] **Step 3: Build dell app (bundle su ABI Node, nativa esternalizzata)**

Run: `pnpm -C app/desktop build`
Expected: build OK (main/preload/renderer bundlati; font/CSS inclusi; la nativa non viene caricata in build).

- [ ] **Step 4: Commit**

```bash
git add app/desktop/src/renderer/src/renderer.ts
git commit -m "feat(desktop): bootstrap Vue app (pinia+router+stili) e self-test esteso a store/route"
```

---

## Verifica finale del branch (orchestratore)

- [ ] **Suite completa (ABI Node):**

Run: `pnpm test`
Expected: tutti verdi (≈ **509**: 476 base + 6 Task 1 + 11 Task 2 + 8 Task 3 + 3 Task 4 + 6 Task 5; il renderer gira nel progetto jsdom del workspace). Se SQLite fallisce con `NODE_MODULE_VERSION 146 ... requires 137` -> `pnpm -r rebuild better-sqlite3`.

- [ ] **Typecheck completo:**

Run: `pnpm -r typecheck`
Expected: `Done` su tutti e 6 i progetti (incluso `app/desktop` via `vue-tsc`, che ora typechecka anche i `*.test.ts` del renderer).

- [ ] **Grep anti-apostrofo (house rule §5.4):**

Run: `grep -rnE "(it|describe)\('[^']*'[A-Za-zàèéìòù]" app/desktop/src`
Expected: *no matches*.

- [ ] **Gate "esegui l app" (ABI Electron, passo orchestratore — flip ABI confinato):**

```bash
pnpm rebuild:electron
# Fase 1 (DB fresco temporaneo): LOOMN_SELFTEST=1 LOOMN_USERDATA=<tmp> electron . -> VERDICT: PASS
#   (include i nuovi check: store Pinia riflette il push + router naviga le route)
# Fase 2 (stesso DB): LOOMN_SELFTEST=2 LOOMN_USERDATA=<tmp> electron . -> VERDICT: PASS
#   (durabilita: store riflette lo stato persistito dopo il riavvio)
pnpm rebuild:node   # ripristina l ABI Node (DEVE essere `pnpm -r rebuild better-sqlite3`)
```
Expected: due `VERDICT: PASS`; poi `pnpm test` di nuovo verde (ABI Node ripristinato). *(Riusa la procedura del gate 9c-ii/Piano 0: lancia electron col binario ricompilato per ABI Electron, `LOOMN_SELFTEST` + `LOOMN_USERDATA` su una dir temporanea; serializza con eventuali `pnpm test` in corso.)*

- [ ] **Prova visiva (screenshot):** lancia l app (dev o build) e cattura: (a) Gioco in exploration (narrazione+scheda+dadi, accento brass), (b) Gioco in combat (scontro al posto della scheda, re-theme clay), (c) una route profonda (es. Compagnia col roster). Allega alla verifica. *(Niente Playwright — decisione 9.)*

- [ ] **Final review (subagent, opus)** dell intero branch (BASE = punto di branch, HEAD = ultimo commit), poi **finishing-a-development-branch** (merge ff in main locale + `pnpm test` + `git branch -d`).

---

## Self-review (eseguita sullo spec con occhi freschi)

**1. Copertura spec (Piano 10 §10 riga 10a + decisioni §2):**
- Design system "strumento notturno" (token + componenti base + Reka) -> Task 3 (tokens.css/base.css + LoomnPanel/Button + LoomnDialog Reka). ✅ (decisione 2/3)
- Pinia read-side <- `read-model-push` (selettori actors/encounter/quests/phase, renderer non muta) -> Task 1 + wiring Task 6. ✅ (decisione §5)
- Router shell (rail/topbar + route Gioco/Diario/Scheda/Compagnia/Impostazioni) -> Task 4. ✅ (decisione 4)
- Frame adattivo a `GameState.phase` -> Task 4 (`data-phase` + token override). ✅ (decisione 1)
- Contenitore `grid-layout-plus` + preset per fase + persistenza layout (localStorage dietro port, decisione utente) -> Task 2 (preset+port) + Task 5 (composable+GameView). ✅ (decisione 6/7)
- Setup test renderer (Vitest + Vue Test Utils/jsdom) = passo orchestratore dichiarato -> Step 0. ✅ (§9)
- Verifica: TDD layer logico (store/selettori/persistenza/composable) + component test selettivi + self-test esteso + screenshot, NO Playwright -> Task 1/2/5 (logica), Task 3/4/5 (component), Task 6 + Verifica finale (gate + screenshot). ✅ (§9)
- Font offline + CSP (rischio C/font in 10a) -> Step 0.4 + styles/index.ts. ✅
- Self-test scriptabile mantenuto (rischio D) -> Task 6. ✅
- Fuori ambito rispettato: niente dadi 3D/spike (10b), niente `get-ruleset` (10g), niente streaming/delta/multi-campagna, nessun nuovo Command/Event/IPC, `shared` intatto. ✅

**2. Scansione placeholder:** nessun TODO/TBD nei task; ogni step di codice porta il file completo. I "placeholder" testuali dei pannelli/route sono **contenuto fondazionale dichiarato** (set/posizioni reali, contenuto profondo nei sotto-piani citati), non lacune di piano. ✅

**3. Consistenza dei tipi (cross-task):**
- `PhaseView`/`ActorView`/`QuestView` esportati da `stores/read-model.ts` (Task 1) e usati da `layout/presets.ts`/`persistence.ts` (Task 2), `composables/use-game-layout.ts` (Task 5), `App.vue` (Task 4). ✅
- `LayoutItem`/`PANELS`/`presetFor` (Task 2) usati da `persistence.ts` (stesso task), `use-game-layout.ts` e `GameView.vue` (Task 5). ✅
- `LayoutPersistence`/`createLocalStoragePersistence`/`resolveLayout` (Task 2) usati da `use-game-layout.ts`/`GameView.vue` (Task 5). ✅
- `createAppRouter` (Task 4) usato da `renderer.ts` (Task 6); `useReadModelStore` (Task 1) usato da App/views/GameView/renderer. ✅
- `@layout-updated` -> `onLayoutUpdated(next: LayoutItem[])`: il payload di grid-layout-plus e l array di layout (firma coerente Task 5). ✅
- `ReadModelPush['state']` come fonte dei tipi di vista: coerente con `gameStateSchema` (verificato `domain-schema.ts:220-226`). ✅

**4. Rischi di esecuzione noti (mitigati nel piano):**
- grid-layout-plus misura il DOM (jsdom limitato) -> logica nel composable (testata pura), component test con GridLayout/GridItem **stubbati**. ✅
- Reka portali/teleport in jsdom -> LoomnDialog test solo strutturale (monta+trigger); l interazione e validata da self-test/screenshot. ✅
- Hash history per `file://` (no server in produzione). ✅
- vue-router **4** (non 5): la 5 richiede Vite 7/8 + `@pinia/colada`, incompatibile con electron-vite 4 (Step 0). ✅

---

## Roadmap dopo il Piano 10a

Ordine confermato `10a -> 10g -> 10f -> 10b -> 10c -> 10d -> 10e` (spec Piano 10 §10):
- **10g — Metadati di gioco su IPC** (`get-ruleset`, stile Piano 0: vocabolario del `Ruleset` + enum di comando + `commandPhaseRules`; backend testabile su ABI Node, `shared` foglia). Prerequisito dei pannelli data-driven di 10f/10d.
- **10f** Impostazioni/provider + first-run + creazione PG + controlli GM (form data-driven da 10g; read-back config provider).
- **10b** Gioco (run-turn + narrazione + dadi 3D `@3d-dice/dice-box` coi `RollResult` degli `events`, spike CSP/wasm/worker).
- **10c** Combattimento (cockpit) · **10d** Scheda+inventario (data-driven, modello piatto) · **10e** Diario+Compagnia (`getNarrationHistory`/`getCanon`/`getSummaries` + `reflect`).

Ogni piano = flusso §4 dell HANDOFF (writing-plans -> commit doc su main -> branch -> subagent-driven -> finishing-a-development-branch -> aggiorna HANDOFF/memoria). Follow-up minori aperti (HANDOFF §7-quinquies): seed RNG per-campagna persistito; delta read-model (spec generale §13, deferito).

---

## Execution Handoff

Vedi l header: REQUIRED SUB-SKILL `superpowers:subagent-driven-development` (un implementer + spec-review + code-quality-review per task; final review opus dell intero branch prima del merge). **Step 0 e un passo orchestratore** (deps/config/CSP/test setup — non un subagent). Tutti i task hanno logica/stato reale -> code-quality review inclusa. Procedere in autonomia fino al merge, tenendo l utente aggiornato con una tabellina di stato dei task.
