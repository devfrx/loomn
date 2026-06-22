# Fase 6 — Remediation Renderer: UI & layout (I‑03, I‑07‑UI, M‑09, M‑10, M‑15) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chiudere a causa radice, debt-free, i 5 finding renderer-UI della Fase 6 (I‑03 scroll/overflow, I‑07‑UI barriera input dadi, M‑09 drift colore errore, M‑10 LoomnDialog morto, M‑15 Regia ungated) + il flag cross-fase del bottone "Round successivo" ridondante, senza regressioni e mantenendo la versione self-test persistita a **8**.

**Architecture:** Lavoro SOLO sul renderer (`app/desktop/src/renderer/src/{views,components,styles}` + `App.vue`). Niente modifiche a engine/ai/memory/host/shared (oltre il consumo dei contratti gia esistenti), niente modifiche a `package.json`/`tsconfig*`/`vitest.config*`/`electron.vite.config*`. I fix sono CSS/markup/Vue + due barriere logiche minori (clamp dadi UI, dev-gate). Si riusa il vocabolario di token (`var(--bad)`), il componente accessibile gia scritto `LoomnDialog.vue` (Reka), e i pattern esistenti (`PanelError`, `use-dispatch`). I‑03 e verificato **visivamente** coi preview tools (NON sulla sessione live dell utente); gli altri finding hanno test jsdom.

**Tech Stack:** Vue 3.5 (SFC `<script setup>`), Pinia, vue-router, reka-ui ^2.9.10 (Dialog accessibile), grid-layout-plus ^1.1.1, Vitest ^2.1 + @vue/test-utils ^2.4 (jsdom), TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`). Build/gate: electron-vite (gate Electron 2 fasi).

---

## Contesto e decisioni gia bloccate (NON ri-litigare)

- **Ambito:** SOLO i 28 bug dell audit. D‑01/D‑02/D‑03 (incipit, redesign UI, multi-campagna) sono iniziative design-first DOPO la remediation. Se emergono ALTRI flag, **annotali**, non implementarli.
- **M‑15 (Regia):** decisione = **dev-gate** dietro `import.meta.env.DEV` (invisibile in produzione).
- **M‑10 (LoomnDialog):** decisione = **adottare** `LoomnDialog` (Reka: Escape + focus-trap) per il creator di `CompanyView` e per la Regia, rimuovendo lo scrim hand-rolled.
- **I‑07:** la difesa **autorevole** vive nel motore (F1 `assertDieGroup`) e nel tool AI (F3 `llmInt`); F6 aggiunge solo la **barriera UI** (prima linea).
- **Vincolo debt-free (lezione F1-F5):** mai restringere uno schema di LETTURA. F6 e renderer-UI; tienilo a mente nel consumare i contratti.
- **Self-test:** la versione persistita attesa resta **8**. Le modifiche F6 sono UI/display; il self-test non interagisce con la Regia ne apre il creator (verificato: `renderer.ts` dispaccia via `window.loomn.dispatch` e naviga le route, mai monta/usa `GmConsole` ne il dialog del creator). Il dev-gate M‑15 nasconde la Regia nella build di produzione del gate (DEV=false) → nessun impatto. I dialog M‑10 sono chiusi all avvio (`open=false`, `Presence` non monta il contenuto) → nessun impatto.

---

## Disciplina di scope (vale per OGNI task — CRITICO, §5 house rules)

- Modifica SOLO i file elencati nel task. **MAI** toccare `package.json`, `tsconfig*.json`, `vitest.config.*`, `vitest.workspace.ts`, `electron.vite.config.*`, ne creare tsconfig di root.
- **MAI** toccare `packages/*` (engine/ai/memory/host/shared) ne `app/desktop/src/main`/`preload`. F6 e renderer-UI puro.
- Esegui `git status --short` PRIMA di ogni commit: devono comparire SOLO i file del task.
- TS strict: spread condizionali per gli opzionali (`...(x !== undefined ? { campo: x } : {})`), accessi indicizzati guardati (`?? default`).
- **Bug apostrofo (§5):** le stringhe `it('...')`/`describe('...')` in apici singoli NON devono contenere apostrofi (`l'`, `un'`, `dell'`, `c'è`). Usa forme senza apostrofo (`l attore`, `c e`). `è/é` vanno bene. Verifica del piano gia eseguita: `(it|describe)\('[^']*'[A-Za-zàèéìòù]` → nessun match.

## File coinvolti (mappa)

| File | Task | Responsabilita |
|---|---|---|
| `src/renderer/src/no-color-drift.test.ts` (Create) | 1 | Guard test: nessun `.vue` hardcoda `#d98b6b` |
| `src/renderer/src/views/SettingsView.vue` | 1 | `#d98b6b` → `var(--bad)` |
| `src/renderer/src/views/CompanyView.vue` | 1, 5 | `#d98b6b` → `var(--bad)`; creator → `LoomnDialog` |
| `src/renderer/src/components/GmConsole.vue` | 1, 2, 5 | `#d98b6b` → `var(--bad)`; barriera dadi; Regia → `LoomnDialog` drawer |
| `src/renderer/src/components/GmConsole.test.ts` | 2 | Test barriera dadi |
| `src/renderer/src/components/EncounterPanel.vue` | 3 | Rimuovi bottone "Round successivo" + import `nextRound` |
| `src/renderer/src/components/EncounterPanel.test.ts` | 3 | Rimuovi il test del bottone rimosso |
| `src/renderer/src/App.vue` | 4, 6 | Dev-gate Regia; catena di altezza + wrapper scroll route |
| `src/renderer/src/App.test.ts` | 4 | Test dev-gate (DEV=false → Regia non montata) |
| `src/renderer/src/components/LoomnDialog.vue` | 5 | Estendi: controllato `v-model:open`, trigger opzionale, variante drawer/center, inline (no Teleport) |
| `src/renderer/src/components/LoomnDialog.test.ts` | 5 | Test controllato + Escape |
| `src/renderer/src/views/GameView.vue` | 6 (condizionale) | Re-measure grid all init SOLO se la riproduzione lo richiede |

> **NON toccati di proposito:** `styles/base.css` (`body { overflow:hidden }` e INTENZIONALE — shell a viewport fisso; il fallback di scroll va al livello route, non al documento — vedi Task 6), `styles/tokens.css` (`--bad` esiste gia; nessun `--bad-2` necessario — M‑09 unifica su `var(--bad)`), `lib/combat-commands.ts` (il factory `nextRound` resta: e un Command valido ancora coperto dal suo unit test; fuori scope F6).

---

### Task 1: M‑09 — drift colore errore `#d98b6b` → `var(--bad)`

**Razionale:** tre file hardcodano `#d98b6b` (rosso piu chiaro, inesistente in `tokens.css`) per "errore", mentre `EncounterPanel`/`NarrativePanel` usano correttamente `var(--bad)` (`#c5635b`). Drift fuori dal single-source dei token + bypassa l override `[data-phase]`. Fix: unificare su `var(--bad)` (la decisione del piano-campagna; nessun `--bad-2` perche la tinta chiara non e voluta — e proprio il drift da eliminare). Un guard test istituzionalizza il "grep" della scheda d audit cosi il drift non rientri.

**Files:**
- Create: `app/desktop/src/renderer/src/no-color-drift.test.ts`
- Modify: `app/desktop/src/renderer/src/views/SettingsView.vue:123`
- Modify: `app/desktop/src/renderer/src/views/CompanyView.vue:205`
- Modify: `app/desktop/src/renderer/src/components/GmConsole.vue:201`

- [ ] **Step 1: Scrivi il guard test (deve fallire — i 3 file contengono ancora `#d98b6b`)**

Create `app/desktop/src/renderer/src/no-color-drift.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

// M-09: importa il sorgente GREZZO di tutti i componenti/viste e verifica che il colore d errore
// hardcoded #d98b6b (drift fuori dal token --bad) non ricompaia in nessun .vue. Istituzionalizza il
// grep della scheda d audit: 3 file lo avevano reintrodotto, questo guard impedisce il quarto.
const sources = import.meta.glob('./**/*.vue', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('coerenza colore errore (M-09)', () => {
  it('nessun .vue hardcoda il colore drift #d98b6b', () => {
    const offenders = Object.entries(sources)
      .filter(([, src]) => src.includes('#d98b6b'))
      .map(([path]) => path)
      .sort();
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che FALLISCE**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/no-color-drift.test.ts`
Atteso: FAIL — `offenders` contiene i 3 path (`./components/GmConsole.vue`, `./views/CompanyView.vue`, `./views/SettingsView.vue`).

- [ ] **Step 3: Sostituisci `#d98b6b` con `var(--bad)` nei 3 file**

In `app/desktop/src/renderer/src/views/SettingsView.vue` (regola `.feedback--error`):

```css
.feedback--error { color: var(--bad); }
```

In `app/desktop/src/renderer/src/views/CompanyView.vue` (regola `.feedback`):

```css
.feedback { font-size: 12px; color: var(--bad); }
```

In `app/desktop/src/renderer/src/components/GmConsole.vue` (regola `.gm__feedback--error`):

```css
.gm__feedback--error { color: var(--bad); }
```

- [ ] **Step 4: Esegui il guard test e verifica che PASSA**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/no-color-drift.test.ts`
Atteso: PASS (1 test).

- [ ] **Step 5: Verifica scope e committa**

Run: `git status --short` → solo i 4 file del task.

```bash
git add app/desktop/src/renderer/src/no-color-drift.test.ts \
  app/desktop/src/renderer/src/views/SettingsView.vue \
  app/desktop/src/renderer/src/views/CompanyView.vue \
  app/desktop/src/renderer/src/components/GmConsole.vue
git commit -m "fix(renderer): unifica il colore d errore su var(--bad) [M-09]"
```

**Conteggio test atteso dopo il Task 1: 770** (769 + 1).

---

### Task 2: I‑07‑UI — barriera input dadi nella Regia (ApplyEffect)

**Razionale:** gli input `count`/`sides` di ApplyEffect in `GmConsole` sono `<input v-model.number type="number">` senza `min`/`step`; l unica guardia e la truthiness `!ae.count || !ae.sides` (blocca solo 0/""). Frazionari (`1.5`/`2.5`) o negativi passano e raggiungono `rollExpression` producendo un tiro garbage event-sourced. F1 ha gia messo l arbitro autorevole nel motore (`assertDieGroup`: count 1..100, sides 2..1000, interi) → un valore fuori range ora viene **rifiutato** dal motore (niente freeze). F6 aggiunge la **prima barriera UI**: `min`/`step` sugli input + clamp a intero positivo nel builder, cosi un input frazionario non raggiunge mai un dispatch invalido.
**NB:** `EncounterPanel` non ha input `count`/`sides` (i dadi d attacco li tira il motore da `actorCheck`; `defenseBase`/`initiative` non sono count/sides di un dado) → nessuna modifica li per I‑07.

**Files:**
- Modify: `app/desktop/src/renderer/src/components/GmConsole.vue` (helper clamp + `submitApplyEffect` + attributi `min`/`step` sugli input count/sides)
- Test: `app/desktop/src/renderer/src/components/GmConsole.test.ts`

- [ ] **Step 1: Scrivi il test (deve fallire — oggi i frazionari passano cosi come sono)**

Aggiungi in `app/desktop/src/renderer/src/components/GmConsole.test.ts`, dentro `describe('GmConsole', ...)`:

```ts
  it('ApplyEffect tronca count e sides frazionari a interi positivi', async () => {
    useReadModelStore().applyPush(pushState('exploration', { a: actor('a', 'Alfa') }));
    const w = mount(GmConsole);
    await flushPromises();
    await w.find('button').trigger('click'); // apre la Regia
    const ae = w.findAll('.cmd').find((f) => f.text().includes('Applica effetto'))!;
    const selects = ae.findAll('select');
    await selects[0]!.setValue('a'); // bersaglio
    await selects[1]!.setValue('hp'); // risorsa (RULESET.vocabulary.resources)
    await selects[2]!.setValue('drain'); // direzione (RULESET.directions)
    await ae.find('input[aria-label="count"]').setValue(1.5);
    await ae.find('input[aria-label="sides"]').setValue(2.5);
    const applica = ae.findAll('button').find((b) => b.text() === 'Applica')!;
    await applica.trigger('click');
    await flushPromises();
    expect(dispatch).toHaveBeenCalledWith({
      type: 'ApplyEffect',
      targetId: 'a',
      resource: 'hp',
      direction: 'drain',
      dice: [{ count: 1, sides: 2 }],
    });
  });
```

- [ ] **Step 2: Esegui e verifica che FALLISCE**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/components/GmConsole.test.ts`
Atteso: FAIL — il dispatch riceve `dice: [{ count: 1.5, sides: 2.5 }]` invece di `{ count: 1, sides: 2 }`.

- [ ] **Step 3: Aggiungi l helper di clamp e usalo in `submitApplyEffect`**

In `app/desktop/src/renderer/src/components/GmConsole.vue`, nello `<script setup>`, aggiungi un helper di modulo (es. subito dopo gli import, sopra `const store = ...`):

```ts
/** Barriera UI I-07: forza un intero >= min (l arbitro autorevole resta assertDieGroup nel motore,
 *  F1). Non finito / frazionario / negativo collassa al minimo. */
function intAtLeast(value: number, min: number): number {
  const n = Math.trunc(value);
  return Number.isFinite(n) ? Math.max(min, n) : min;
}
```

Sostituisci `submitApplyEffect` (attualmente costruisce `dice: [{ count: ae.count, sides: ae.sides }]`):

```ts
function submitApplyEffect(): void {
  // Barriera UI I-07: count intero >= 1, sides intero >= 2 (un dado ha almeno 2 facce). Il motore
  // (F1 assertDieGroup) resta l arbitro autorevole sui bound superiori.
  const count = intAtLeast(ae.count, 1);
  const sides = intAtLeast(ae.sides, 2);
  void send({
    type: 'ApplyEffect',
    targetId: ae.targetId,
    resource: ae.resource,
    direction: ae.direction as ApplyEffectCmd['direction'],
    dice: [{ count, sides }],
    ...(ae.bonus ? { bonus: ae.bonus } : {}),
  });
}
```

- [ ] **Step 4: Aggiungi `min`/`step` agli input count/sides (prima linea UX)**

In `app/desktop/src/renderer/src/components/GmConsole.vue`, nel blocco `template v-else-if="type === 'ApplyEffect'"`, sostituisci gli input `count` e `sides` (lascia `bonus` invariato — e un modificatore piatto, non un conteggio di dadi):

```html
              <input v-model.number="ae.count" class="inp" type="number" min="1" step="1" aria-label="count" />
              <input v-model.number="ae.sides" class="inp" type="number" min="2" step="1" aria-label="sides" />
```

- [ ] **Step 5: Esegui i test di GmConsole e verifica che PASSANO**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/components/GmConsole.test.ts`
Atteso: PASS (tutti i test di GmConsole, incluso il nuovo).

- [ ] **Step 6: typecheck + scope + commit**

Run: `pnpm -C app/desktop typecheck` → nessun errore.
Run: `git status --short` → solo `GmConsole.vue` + `GmConsole.test.ts`.

```bash
git add app/desktop/src/renderer/src/components/GmConsole.vue \
  app/desktop/src/renderer/src/components/GmConsole.test.ts
git commit -m "fix(renderer): barriera UI sugli input dadi della Regia (interi positivi) [I-07-UI]"
```

**Conteggio test atteso dopo il Task 2: 771** (770 + 1).

---

### Task 3: Flag cross-fase — rimuovi il bottone "Round successivo" ridondante

**Razionale:** dopo I‑01/F1 il motore possiede la FSM round/turno: `decide(EndTurn)` auto-avanza il round quando l ultimo turno lo chiude, e `decide(NextRound)` esige `roundComplete` che il flusso normale non raggiunge mai → `NextRound` puo solo essere **rifiutato**. Il bottone "Round successivo" del cockpit dispaccia `NextRound` → puo solo fallire. Si rimuove il bottone (+ il suo unico uso/import di `nextRound`) e il test associato. Il factory `nextRound()` in `lib/combat-commands.ts` **resta** (Command valido, ancora coperto dal suo unit test in `combat-commands.test.ts`; fuori dallo scope F6 = `{views,components,styles}`+`App.vue`).

**Files:**
- Modify: `app/desktop/src/renderer/src/components/EncounterPanel.vue` (import riga 10 + bottone riga ~87)
- Modify: `app/desktop/src/renderer/src/components/EncounterPanel.test.ts` (rimuovi il test del bottone)

- [ ] **Step 1: Rimuovi il test del bottone in `EncounterPanel.test.ts`**

Elimina interamente questo blocco (attualmente intorno alle righe 89-94):

```ts
  it('Round successivo dispaccia NextRound', async () => {
    const w = mountPanel();
    await flushPromises();
    await clickByText(w, 'Round successivo');
    expect(dispatch).toHaveBeenCalledWith({ type: 'NextRound' });
  });
```

- [ ] **Step 2: Esegui i test di EncounterPanel — il test del bottone non esiste piu, gli altri restano verdi (il bottone c e ancora ma non e piu testato)**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/components/EncounterPanel.test.ts`
Atteso: PASS (un test in meno; il bottone esiste ancora nel template — verra rimosso allo Step 3).

- [ ] **Step 3: Rimuovi il bottone e l import di `nextRound` in `EncounterPanel.vue`**

In `app/desktop/src/renderer/src/components/EncounterPanel.vue`, riga di import (riga 10), togli `nextRound`:

```ts
import { buildAttack, endTurn, endEncounter } from '../lib/combat-commands';
```

Nel `template`, nel blocco `.actions`, rimuovi la riga del bottone "Round successivo" (lascia "Fine turno" e "Termina scontro"):

```html
      <div class="actions">
        <LoomnButton variant="solid" @click="send(endTurn())">Fine turno</LoomnButton>
        <LoomnButton variant="ghost" @click="send(endEncounter())">Termina scontro</LoomnButton>
      </div>
```

- [ ] **Step 4: Esegui i test di EncounterPanel + typecheck e verifica che PASSANO**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/components/EncounterPanel.test.ts`
Atteso: PASS.
Run: `pnpm -C app/desktop typecheck` → nessun errore (`nextRound` non e piu importato/usato; il factory resta esportato in `lib/` e usato dal suo test).

- [ ] **Step 5: Scope + commit**

Run: `git status --short` → solo `EncounterPanel.vue` + `EncounterPanel.test.ts`.

```bash
git add app/desktop/src/renderer/src/components/EncounterPanel.vue \
  app/desktop/src/renderer/src/components/EncounterPanel.test.ts
git commit -m "fix(renderer): rimuovi il bottone Round successivo ridondante (NextRound sempre rifiutato post-FSM I-01)"
```

**Conteggio test atteso dopo il Task 3: 770** (771 - 1).

---

### Task 4: M‑15 — dev-gate della Regia dietro `import.meta.env.DEV`

**Razionale:** `App.vue` monta `<GmConsole />` incondizionatamente: la Regia espone i 6 Command non-narrativi con input liberi (override manuale del Master). Decisione bloccata = dev-tool da nascondere in produzione. Gate dietro `import.meta.env.DEV`. In vitest `import.meta.env.DEV === true` (modo test) → i test esistenti continuano a montare GmConsole (lo stub `getRuleset` di `App.test` resta necessario); nella build di produzione del gate Electron `DEV === false` → la Regia non e montata (il self-test non la usa → versione 8 invariata).

**Files:**
- Modify: `app/desktop/src/renderer/src/App.vue` (espone `isDev`; `v-if` su `GmConsole`)
- Test: `app/desktop/src/renderer/src/App.test.ts`

- [ ] **Step 1: Scrivi il test (deve fallire — oggi GmConsole e sempre montata)**

In `app/desktop/src/renderer/src/App.test.ts`:

Aggiorna la riga di import di vitest per includere `vi`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
```

Aggiungi l import del componente in cima (dopo `import App from './App.vue';`):

```ts
import GmConsole from './components/GmConsole.vue';
```

Aggiungi il test dentro `describe('App shell', ...)`:

```ts
  it('non monta la Regia quando non e in DEV (dev-gate M-15)', async () => {
    vi.stubEnv('DEV', false);
    try {
      const { wrapper } = await mountApp();
      expect(wrapper.findComponent(GmConsole).exists()).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });
```

- [ ] **Step 2: Esegui e verifica che FALLISCE**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/App.test.ts`
Atteso: FAIL — `findComponent(GmConsole).exists()` e `true` (la Regia e ancora montata incondizionatamente).

- [ ] **Step 3: Applica il dev-gate in `App.vue`**

In `app/desktop/src/renderer/src/App.vue`, nello `<script setup>`, aggiungi (es. dopo `const phaseLabel = ...`):

```ts
// M-15: la Regia (override manuale del Master) e un dev-tool → montata solo in sviluppo.
const isDev = import.meta.env.DEV;
```

Nel `template`, nella `<header class="topbar">`, sostituisci `<GmConsole />` con:

```html
        <GmConsole v-if="isDev" />
```

- [ ] **Step 4: Esegui i test di App + typecheck e verifica che PASSANO**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/App.test.ts`
Atteso: PASS (tutti, incluso il nuovo; gli altri test montano in DEV=true → GmConsole montata → lo stub `getRuleset` del `beforeEach` resta necessario e usato).
Run: `pnpm -C app/desktop typecheck` → nessun errore.

- [ ] **Step 5: Scope + commit**

Run: `git status --short` → solo `App.vue` + `App.test.ts`.

```bash
git add app/desktop/src/renderer/src/App.vue app/desktop/src/renderer/src/App.test.ts
git commit -m "fix(renderer): dev-gate della Regia dietro import.meta.env.DEV [M-15]"
```

**Conteggio test atteso dopo il Task 4: 771** (770 + 1).

---

### Task 5: M‑10 — adotta `LoomnDialog` (Reka, accessibile) per Regia e creator

**Razionale:** `LoomnDialog.vue` (wrapper Reka completo: overlay + focus-trap + Escape) e importato SOLO dal suo test (dead code), mentre `GmConsole` reimplementa a mano uno scrim/dialog **senza Escape ne focus trap** e `CompanyView` espande un creator inline. Decisione bloccata = **adottare** `LoomnDialog` per entrambi, rimuovendo lo scrim hand-rolled.

**Vincolo chiave (decisione 10f):** `GmConsole` fu costruito **senza Teleport** per testabilita (i test interrogano il DOM del wrapper). Per rispettarlo, `LoomnDialog` viene reso **inline** (niente `DialogPortal`/Teleport): `DialogContent` di Reka richiede solo un `DialogRoot` antenato (verificato dal sorgente `reka-ui@2.9.10`) e fornisce Escape + focus-trap a prescindere dal portal; il contenuto e `position: fixed` → non viene clippato da nessun overflow d antenato (nessun antenato ha `transform`/`filter`). Cosi i test restano sul DOM del wrapper e l accessibilita c e.

**Sotto-passi:** 5a estende `LoomnDialog` (TDD), 5b lo adotta in `GmConsole`, 5c in `CompanyView`. Gli unit test esistenti di `GmConsole`/`CompanyView` restano verdi perche il rendering e inline (nessun Teleport): le selezioni `.cmd`/`input`/`button` restano nel wrapper.

**Files:**
- Modify: `app/desktop/src/renderer/src/components/LoomnDialog.vue`
- Test: `app/desktop/src/renderer/src/components/LoomnDialog.test.ts`
- Modify: `app/desktop/src/renderer/src/components/GmConsole.vue`
- Modify: `app/desktop/src/renderer/src/views/CompanyView.vue`

#### 5a — Estendi `LoomnDialog` (controllato, trigger opzionale, varianti, inline)

- [ ] **Step 1: Scrivi i test nuovi (devono fallire — l API controllata/Escape non esiste ancora)**

In `app/desktop/src/renderer/src/components/LoomnDialog.test.ts`, aggiungi `nextTick` e i test (mantieni il test esistente del trigger):

```ts
import { describe, it, expect } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import LoomnDialog from './LoomnDialog.vue';

describe('LoomnDialog', () => {
  it('monta e rende il contenuto dello slot trigger (Reka integra)', () => {
    const w = mount(LoomnDialog, { props: { title: 'Conferma' }, slots: { trigger: 'Apri' } });
    expect(w.text()).toContain('Apri');
  });

  it('in modalita controllata rende il contenuto quando open e true', () => {
    const w = mount(LoomnDialog, { props: { title: 'Conferma', open: true }, slots: { default: 'Corpo del dialog' } });
    expect(w.text()).toContain('Corpo del dialog');
  });

  it('in modalita controllata non rende il contenuto quando open e false', () => {
    const w = mount(LoomnDialog, { props: { title: 'Conferma', open: false }, slots: { default: 'Corpo del dialog' } });
    expect(w.text()).not.toContain('Corpo del dialog');
  });

  it('chiude via Escape emettendo update:open false', async () => {
    const w = mount(LoomnDialog, {
      props: { title: 'Conferma', open: true },
      slots: { default: 'Corpo del dialog' },
      attachTo: document.body,
    });
    await nextTick();
    await w.find('.loomn-dialog__content').trigger('keydown', { key: 'Escape' });
    await nextTick();
    expect(w.emitted('update:open')?.at(-1)).toEqual([false]);
    w.unmount();
  });
});
```

> **Nota per l implementer (Escape in jsdom):** Reka aggancia l ascolto `keydown` Escape sull `ownerDocument` via `DismissableLayer`; con `attachTo: document.body` il `keydown` triggerato su `.loomn-dialog__content` **bubbla** fino a `document` e chiude. Se nel tuo ambiente non scatta, dispaccia direttamente sul documento: `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))` dopo `await nextTick()`. L asserzione resta `emitted('update:open').at(-1)` === `[false]`.

- [ ] **Step 2: Esegui e verifica che FALLISCONO i nuovi test**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/components/LoomnDialog.test.ts`
Atteso: il primo test PASSA; i 3 nuovi FALLISCONO (la prop `open` non e controllata e il contenuto non e reso in modo controllato).

- [ ] **Step 3: Riscrivi `LoomnDialog.vue` (controllato, trigger opzionale, varianti, NO DialogPortal)**

Sostituisci interamente `app/desktop/src/renderer/src/components/LoomnDialog.vue`:

```vue
<script setup lang="ts">
import {
  DialogRoot,
  DialogTrigger,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogClose,
} from 'reka-ui';

// open omesso => Reka in modalita non-controllata (passive), il trigger gestisce lo stato interno.
// open presente => controllato via v-model:open dal genitore.
withDefaults(defineProps<{ title: string; open?: boolean; variant?: 'center' | 'drawer' }>(), {
  variant: 'center',
});
defineEmits<{ 'update:open': [value: boolean] }>();
</script>

<template>
  <DialogRoot :open="open" @update:open="$emit('update:open', $event)">
    <DialogTrigger v-if="$slots.trigger" class="loomn-dialog__trigger"><slot name="trigger" /></DialogTrigger>
    <DialogOverlay class="loomn-dialog__overlay" />
    <DialogContent class="loomn-dialog__content" :class="`loomn-dialog__content--${variant}`">
      <DialogTitle class="loomn-dialog__title">{{ title }}</DialogTitle>
      <div class="loomn-dialog__body"><slot /></div>
      <DialogClose class="loomn-dialog__close" aria-label="chiudi">&#x2715;</DialogClose>
    </DialogContent>
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
  z-index: 50;
}
.loomn-dialog__content {
  position: fixed;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: 1px solid var(--line-2);
  box-shadow: 0 30px 70px -30px rgba(0, 0, 0, 0.8);
  z-index: 51;
}
.loomn-dialog__content--center {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(560px, 92vw);
  max-height: 86vh;
  overflow: auto;
  border-radius: var(--r);
  padding: 20px 22px;
}
.loomn-dialog__content--drawer {
  top: 0;
  right: 0;
  height: 100%;
  width: 380px;
  max-width: 92vw;
  overflow: auto;
  border-left: 1px solid var(--line-2);
  border-radius: 0;
  padding: 18px 20px;
}
.loomn-dialog__title {
  font-family: var(--f-display);
  font-size: 18px;
  color: var(--text);
  margin-bottom: 12px;
}
.loomn-dialog__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.loomn-dialog__close {
  position: absolute;
  top: 14px;
  right: 14px;
  background: none;
  border: none;
  color: var(--text-3);
  cursor: pointer;
  line-height: 1;
  padding: 4px 6px;
}
</style>
```

- [ ] **Step 4: Esegui i test di LoomnDialog e verifica che PASSANO**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/components/LoomnDialog.test.ts`
Atteso: PASS (4 test).

> Una `console.warn` dev-only di Reka su "Missing Description" puo comparire (DEV=true in vitest): e rumore di sviluppo, NON un fallimento, e nella build di produzione del gate (DEV=false) non esiste. Non aggiungere una description (eviti verbosita): accettata come minore.

#### 5b — Adotta `LoomnDialog` (drawer) in `GmConsole`

- [ ] **Step 5: Sostituisci lo scrim hand-rolled con `LoomnDialog`**

In `app/desktop/src/renderer/src/components/GmConsole.vue`:

Import — aggiungi `LoomnDialog` (subito sotto l import di `LoomnButton`):

```ts
import LoomnDialog from './LoomnDialog.vue';
```

Template — sostituisci dall apertura `<div class="gm__scrim" ...>` fino alla sua chiusura `</div>` (lo scrim + `gm__panel` + `gm__head`) con un `LoomnDialog` drawer controllato. Il blocco `<div class="gm">` finale risultante:

```html
<template>
  <div class="gm">
    <LoomnButton variant="ghost" @click="open = true; feedback = null">Regia</LoomnButton>
    <LoomnDialog v-model:open="open" variant="drawer" title="Regia">
      <p v-if="feedback" class="gm__feedback" :class="`gm__feedback--${feedback.kind}`">{{ feedback.msg }}</p>
      <PanelError :error="ruleset.error" />

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
            <input v-model.number="ae.count" class="inp" type="number" min="1" step="1" aria-label="count" />
            <input v-model.number="ae.sides" class="inp" type="number" min="2" step="1" aria-label="sides" />
            <input v-model.number="ae.bonus" class="inp" type="number" aria-label="bonus" />
            <LoomnButton variant="solid" :disabled="!ae.targetId || !ae.resource || !ae.direction || !ae.count || !ae.sides" @click="submitApplyEffect">Applica</LoomnButton>
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

          <template v-else-if="type === 'StartEncounter'">
            <p v-if="!seRows.length" class="cmd__hint">Nessun attore: crealo in Compagnia.</p>
            <div v-for="row in seRows" :key="row.actorId" class="se-row">
              <label class="se-row__inc"><input v-model="row.include" type="checkbox" /> {{ row.name }}</label>
              <input v-model.number="row.initiative" class="inp" type="number" aria-label="iniziativa" />
              <input v-model="row.zone" class="inp" aria-label="zona" />
            </div>
            <LoomnButton variant="solid" :disabled="!anyIncluded" @click="submitStartEncounter">Avvia scontro</LoomnButton>
          </template>
        </fieldset>
      </section>
    </LoomnDialog>
  </div>
</template>
```

Style — rimuovi le regole ora morte (`.gm__scrim`, `.gm__panel`, `.gm__head`, `.gm__title`, `.gm__close`). MANTIENI: `.gm`, `.gm__feedback`, `.gm__feedback--ok`, `.gm__feedback--error` (gia `var(--bad)` dal Task 1), `.cmd`, `.cmd--disabled`, `.cmd__title`, `.cmd__body`, `.inp`, `.inp[type='number']`, `.cmd__hint`, `.se-row`, `.se-row__inc`. Il blocco `<style scoped>` risultante:

```css
<style scoped>
.gm { display: inline-flex; }
.gm__feedback { font-size: 12px; }
.gm__feedback--ok { color: var(--accent); }
.gm__feedback--error { color: var(--bad); }
.cmd { padding: 12px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--well); }
.cmd--disabled { opacity: 0.45; }
.cmd__title { font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-2); margin: 0 0 10px; }
.cmd__body { border: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.inp { font: inherit; font-family: var(--f-mono); font-size: 12px; color: var(--text); background: var(--panel); border: 1px solid var(--line-2); border-radius: 8px; padding: 6px 9px; }
.inp[type='number'] { width: 64px; }
.cmd__hint { font-size: 11px; color: var(--text-3); margin: 0; }
.se-row { display: flex; align-items: center; gap: 8px; width: 100%; }
.se-row__inc { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text); flex: 1; }
</style>
```

- [ ] **Step 6: Esegui i test di GmConsole e verifica che PASSANO (invariati: rendering inline)**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/components/GmConsole.test.ts`
Atteso: PASS — il primo `<button>` resta "Regia" (il LoomnButton trigger); aperto `open=true`, `.cmd`/checkbox/bottoni e `PanelError` sono nel wrapper (nessun Teleport). Se un test fallisse per timing del `Presence` di Reka, aggiungi un `await nextTick()` dopo il click di apertura (NON cambiare le asserzioni).

#### 5c — Adotta `LoomnDialog` (center) per il creator di `CompanyView`

- [ ] **Step 7: Sostituisci il creator inline con `LoomnDialog`**

In `app/desktop/src/renderer/src/views/CompanyView.vue`:

Import — aggiungi `LoomnDialog` (sotto `LoomnButton`):

```ts
import LoomnDialog from '../components/LoomnDialog.vue';
```

Template — sostituisci il blocco `<div v-if="open" class="creator"> ... </div>` con un `LoomnDialog` controllato. Il contenuto del form resta identico (solo spostato nel body del dialog; rimuovi il wrapper `.creator` e il titolo hand-rolled `.creator__title`, che ora e `DialogTitle`):

```html
      <LoomnDialog v-model:open="open" title="Nuovo attore">
        <div class="form">
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
        </div>
      </LoomnDialog>
```

Style — rimuovi le regole morte `.creator` e `.creator__title` (il resto: `.form`, `.field`, `.field__label`, `.field__input`, `.grid`, `.num`, `.num__label`, `.pool`, `.actions`, `.feedback` resta — `.feedback` e gia `var(--bad)` dal Task 1).

- [ ] **Step 8: Esegui i test di CompanyView e verifica che PASSANO (invariati: rendering inline)**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/views/CompanyView.test.ts`
Atteso: PASS — "Aggiungi" apre il dialog (`open=true`), `input[type="text"]` (Nome) e il bottone "Crea" sono nel wrapper. Se serve, aggiungi `await nextTick()` dopo il click di apertura (NON cambiare le asserzioni).

- [ ] **Step 9: Suite renderer completa + typecheck**

Run: `pnpm -C app/desktop test`
Atteso: tutti verdi.
Run: `pnpm -C app/desktop typecheck`
Atteso: nessun errore.

- [ ] **Step 10: Scope + commit**

Run: `git status --short` → solo `LoomnDialog.vue`, `LoomnDialog.test.ts`, `GmConsole.vue`, `CompanyView.vue`.

```bash
git add app/desktop/src/renderer/src/components/LoomnDialog.vue \
  app/desktop/src/renderer/src/components/LoomnDialog.test.ts \
  app/desktop/src/renderer/src/components/GmConsole.vue \
  app/desktop/src/renderer/src/views/CompanyView.vue
git commit -m "fix(renderer): adotta LoomnDialog (Reka, Escape+focus-trap) per Regia e creator [M-10]"
```

**Conteggio test atteso dopo il Task 5: 774** (dopo T4 = 771; T5 aggiunge **3** test a `LoomnDialog.test.ts` e NON tocca il numero di test di GmConsole/CompanyView, che restano invariati grazie al rendering inline).

---

### Task 6: I‑03 — scroll/overflow in tutta l app (catena di altezza + fallback route)

**Razionale (causa radice, da inchiodare con la riproduzione):** `.app-shell` e `display:grid; grid-template-columns:66px 1fr; height:100vh` ma SENZA `grid-template-rows` → la riga implicita e `auto` (dimensionata sul contenuto) → `.stage` cresce col contenuto, **non vincolata al viewport**. `.stage` e flex-column con `min-width:0` ma SENZA `min-height:0` → come grid item con `min-height:auto` puo eccedere la traccia. `body { overflow:hidden }` (base.css:17, INTENZIONALE per la shell a viewport fisso) → quando il contenuto eccede, viene clippato senza scrollbar. Gli scroller interni (`LoomnPanel.__body { overflow:auto }`, `.game-view/.route-view { flex:1; min-height:0 }`) non ricevono mai un altezza vincolata perche l antenato `.stage` non e vincolato → `flex:1` si risolve contro un genitore illimitato → crescono invece di scrollare. Sintomo "si sblocca col resize" = misura iniziale instabile (grid-layout-plus) sopra una catena rotta.

**Fix (definitivo):** vincolare la riga del grid (`grid-template-rows: minmax(0, 1fr)`) + `min-height:0` su `.stage` + un **wrapper di route scrollabile** (`.stage__view`) attorno a `<RouterView />` (un singolo punto che da a OGNI route un contenitore con altezza vincolata e `overflow:auto` — il fallback che l audit chiede, al livello giusto, non al documento). Le viste restano `<main class="route-view/game-view">` invariate (zero churn; `SheetView.test` continua a trovare `.route-view`).

**Re-measure grid (CONDIZIONALE):** SOLO se la riproduzione, dopo il fix di catena, mostra ancora celle troppo basse nel Gioco che "si sbloccano col resize", aggiungi un re-measure in `GameView` (Step 6f).

**Files:**
- Modify: `app/desktop/src/renderer/src/App.vue` (template wrapper + 3 regole CSS)
- (Condizionale) Modify: `app/desktop/src/renderer/src/views/GameView.vue`

> **NON ci sono unit test jsdom per I‑03:** il layout/overflow non e osservabile in jsdom. La verifica e **visiva** coi preview tools (Step 6b/6e). Gli unit test esistenti (`App.test`, `GameView.test` con grid stubbato, `SheetView.test`) restano verdi.

- [ ] **Step 6a: Riproduci il bug in-browser PRIMA del fix (preview tools, NON la sessione live dell utente)**

Avvia il dev server del renderer e aprilo coi preview tools (browser). `window.loomn` (bridge preload) NON esiste nel browser: lo shell e il layout si rendono comunque (i componenti rendono il template anche se le chiamate IPC `onMounted` rifiutano — I‑03 e layout, non dati). Se necessario, stub minimale via `preview_eval` prima del load per silenziare gli errori.

- Avvia: `preview_start` sul renderer (electron-vite dev espone il vite server del renderer; in alternativa servi il renderer in un browser). Naviga alle route `/`, `/diario`, `/scheda`, `/compagnia`, `/impostazioni`.
- Cattura `preview_snapshot`/`preview_screenshot` su ciascuna route + il Gioco con contenuto che sborda (es. la Scheda con molti attributi, o riduci la finestra). Conferma: il contenuto e clippato e NON scrolla (replica del sintomo dell utente). Annota il locus osservato (catena di altezza vs grid measure).

- [ ] **Step 6b: Applica il fix di catena di altezza + wrapper di route in `App.vue`**

In `app/desktop/src/renderer/src/App.vue`, nel `template`, avvolgi `<RouterView />` in un contenitore scrollabile (lascia `FirstRunBanner` fuori, come banner superiore):

```html
    <div class="stage">
      <header class="topbar">
        <div class="wordmark">Loomn<span class="dot">.</span></div>
        <div class="phase-badge">{{ phaseLabel }}</div>
        <GmConsole v-if="isDev" />
      </header>
      <FirstRunBanner />
      <div class="stage__view">
        <RouterView />
      </div>
    </div>
```

Nel `<style scoped>`, aggiorna `.app-shell` (aggiungi `grid-template-rows`), `.stage` (aggiungi `min-height: 0`) e aggiungi `.stage__view`:

```css
.app-shell {
  display: grid;
  grid-template-columns: 66px 1fr;
  grid-template-rows: minmax(0, 1fr);
  height: 100vh;
  padding: 14px;
  gap: 14px;
}
```

```css
.stage {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  min-height: 0;
}
```

Aggiungi (es. dopo `.stage`):

```css
.stage__view {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: auto;
}
```

- [ ] **Step 6c: Esegui i test jsdom impattati + typecheck (devono restare verdi)**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/App.test.ts app/desktop/src/renderer/src/views/GameView.test.ts app/desktop/src/renderer/src/views/SheetView.test.ts`
Atteso: PASS (il wrapper non cambia struttura testata: `.nav-btn`, `data-phase`, `.route-view`, grid stub restano).
Run: `pnpm -C app/desktop typecheck`
Atteso: nessun errore.

- [ ] **Step 6d: Ricarica in-browser e verifica visivamente che ora scrolla (preview tools)**

Ricarica il dev server (HMR o `preview_eval: window.location.reload()`). Ripeti gli screenshot su `/`, `/diario`, `/scheda`, `/compagnia`, `/impostazioni` + il Gioco con contenuto che sborda. Atteso: il contenuto eccedente ora **scrolla** (pannello interno o fallback `.stage__view`), niente clip silenzioso. Cattura `preview_screenshot` come prova.

- [ ] **Step 6e: (CONDIZIONALE) Re-measure del grid in `GameView` SOLO se persiste il clip iniziale nel Gioco**

Se al 6d il Gioco mostra ancora celle del grid troppo basse al primo paint (che "si sbloccano col resize"), aggiungi in `app/desktop/src/renderer/src/views/GameView.vue` un re-measure dopo il primo paint. Nello `<script setup>` aggiorna l import di vue e aggiungi `onMounted`:

```ts
import { computed, onMounted, nextTick } from 'vue';
```

```ts
// I-03: dopo il primo paint forza grid-layout-plus a ri-misurare il container (la libreria ascolta
// l evento window 'resize'). Evita celle troppo basse al mount prima che il layout si assesti;
// idempotente (no-op se la misura era gia corretta).
onMounted(async () => {
  await nextTick();
  window.dispatchEvent(new Event('resize'));
});
```

Riesegui `pnpm exec vitest run app/desktop/src/renderer/src/views/GameView.test.ts` (PASS) e ri-verifica visivamente (6d). Se NON serve, **non** applicare questo step e annotalo nel commit.

- [ ] **Step 6f: Suite renderer completa + typecheck + scope + commit**

Run: `pnpm -C app/desktop test`
Atteso: tutti verdi.
Run: `pnpm -C app/desktop typecheck`
Atteso: nessun errore.
Run: `git status --short` → solo `App.vue` (+ `GameView.vue` se 6e applicato).

```bash
git add app/desktop/src/renderer/src/App.vue
# (+ app/desktop/src/renderer/src/views/GameView.vue se lo Step 6e e stato applicato)
git commit -m "fix(renderer): vincola la catena di altezza + fallback scroll a livello route [I-03]"
```

**Conteggio test atteso dopo il Task 6: 774** (nessun unit test nuovo; verifica visiva).

---

## Verifica finale di fase (prima del merge)

- [ ] **Suite completa dalla root:** `pnpm test` → atteso **774 verdi** (565 packages invariati + 209 renderer; era 769 = 565 + 204).
- [ ] **Typecheck completo:** `pnpm -r typecheck` (6 progetti, incluso `app/desktop` via `vue-tsc`) → pulito.
- [ ] **Verifica visiva I‑03 (preview tools):** screenshot che mostrano contenuto scrollabile su TUTTE le route (`/`, `/diario`, `/scheda`, `/compagnia`, `/impostazioni`) + il Gioco con overflow. NON sulla sessione live dell utente.
- [ ] **Anti-apostrofo:** `(it|describe)\('[^']*'[A-Za-zàèéìòù]` sui file di test toccati → nessun match.
- [ ] **Final review opus** dell intero branch (BASE = punto di branch, HEAD = ultimo commit): scope rispettato, debt-free, nessuna regressione di lettura, M‑10 accessibile e inline (no Teleport), self-test non perturbato.
- [ ] **Gate Electron 2 fasi** (riproducibile, §9 HANDOFF):
  1. `pnpm --filter @loomn/desktop build`
  2. `pnpm rebuild:electron`
  3. ``GATE=$(mktemp -d); WIN_GATE=$(cygpath -m "$GATE")``
  4. `LOOMN_SELFTEST=1 LOOMN_USERDATA="$WIN_GATE" pnpm --filter @loomn/desktop exec electron .` → atteso `VERDICT: PASS`, exit 0
  5. `LOOMN_SELFTEST=2 LOOMN_USERDATA="$WIN_GATE" pnpm --filter @loomn/desktop exec electron .` → atteso `VERDICT: PASS`, exit 0 (versione persistita **8**)
  6. `pnpm rebuild:node` (ripristina l ABI Node per i test)
  - Se un rebuild fallisce con EBUSY/EPERM su `better_sqlite3.node`: killa SOLO i processi Loomn (`Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'tabl|loomn' -and $_.Name -match 'electron|node' }` + `Stop-Process -Force`), poi rebuild. Se `pnpm test` da `NODE_MODULE_VERSION 146 ... requires 137` → `pnpm rebuild:node`.
- [ ] **finishing-a-development-branch:** merge ff in `main` → `pnpm test` (verifica ABI Node) → `git push origin main` → `git branch -d fix/remediation-f6-renderer-ui`.

---

## Self-review (copertura dello spec = F6 del piano-campagna + schede d audit)

**Copertura finding:**
- **I‑03** (scroll/overflow) → Task 6 (catena altezza + wrapper route + grid re-measure condizionale; verifica visiva). ✅
- **I‑07‑UI** (input dadi) → Task 2 (`min`/`step` + clamp intero positivo in `submitApplyEffect`; arbitro autorevole resta nel motore). ✅
- **M‑09** (drift colore) → Task 1 (`#d98b6b` → `var(--bad)` nei 3 file + guard test). ✅
- **M‑10** (LoomnDialog morto) → Task 5 (adottato inline/controllato per Regia drawer + creator center, Escape+focus-trap). ✅
- **M‑15** (Regia ungated) → Task 4 (`v-if="isDev"` dietro `import.meta.env.DEV`). ✅
- **Flag cross-fase** (bottone Round successivo) → Task 3 (rimosso bottone + import + test; factory `nextRound` lasciato in `lib/`, fuori scope, ancora testato). ✅

**Placeholder scan:** nessun TBD/TODO; tutto il codice e completo.

**Type/identifier consistency:** `intAtLeast(value, min)` (Task 2); `isDev` (Task 4); LoomnDialog props `{ title, open?, variant? }` + emit `update:open` + classi `loomn-dialog__content--center|drawer` (Task 5); wrapper `.stage__view` + `grid-template-rows: minmax(0, 1fr)` + `.stage { min-height:0 }` (Task 6). Coerenti tra i task.

**Conteggi test (cumulativi, baseline 769):** T1 → 770 · T2 → 771 · T3 → 770 · T4 → 771 · T5 → 774 · T6 → 774. Delta renderer netto **+5** (204 → 209). Packages invariato (565).

**Self-test versione persistita:** resta **8** (F6 non tocca engine/IPC; il self-test non monta/usa la Regia ne apre il creator; dev-gate e dialog non interferiscono). Da confermare al gate.

**Disciplina di scope:** ogni task tocca SOLO file renderer-UI elencati; nessun `package.json`/`tsconfig`/`vitest.config`/`electron.vite.config`; nessun `packages/*`/`main`/`preload`. `base.css`/`tokens.css`/`lib/combat-commands.ts` lasciati di proposito con rationale.

**Flag residui annotati (NON in F6):** `rulesetResultSchema.vocabulary.defaultResources` `z.number()` nudo (consistenza minore, shared, fuori scope); il `journal` store sovrascrive il 1o errore se entrambi i canali (getSummaries+getCanon) falliscono insieme (store, fuori scope F6); `provider-status.error` non surfacciato (non nel set I‑08); factory `nextRound` ora usato solo dal suo test (lib, fuori scope). → eventuali follow-up, non implementati qui.

---

## Execution Handoff

Piano salvato in `docs/superpowers/plans/2026-06-22-loomn-fix-remediation-f6-renderer-ui.md`. Esecuzione **subagent-driven** (flusso §4 HANDOFF): branch `fix/remediation-f6-renderer-ui` (MAI su main); per ogni task implementer (testo completo del task) → spec-review → code-quality-review (solo dopo spec ✅; saltabile sui task banali con dichiarazione); verifica visiva I‑03 coi preview tools; final review opus dell intero branch; gate Electron 2 fasi `VERDICT: PASS`; `finishing-a-development-branch` (merge ff → `pnpm test` → push → cancella branch); poi aggiorna HANDOFF + memoria (F6 fatto, conteggio test, prossimo = F7) e FERMATI prima di F7 per il check dell utente.
