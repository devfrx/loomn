# D‑02d‑i — Primitivi form/display (seconda ondata) + rifiniture a11y — Design

> **Data:** 2026‑06‑24 · **Traccia:** D‑02 (ripensamento UI/UX completo), slice d (re‑skin superfici), **sotto‑slice i** (primitivi mancanti) · **Stato:** design approvato (brainstorming, con mappa delle superfici via agente esplorativo), pronto per `writing-plans`.
> D‑02 e decomposta token‑first: D‑02a fondamenta (FATTA) → D‑02b libreria componenti (FATTA) → D‑02c shell & navigazione (FATTA) → **D‑02d re‑skin superfici**. D‑02d e a sua volta decomposta (scelta dell'utente): **D‑02d‑i** (questo — seconda ondata di primitivi, 1 punto di adozione ciascuno, come D‑02b) → **D‑02d‑ii…** (ondate di re‑skin per gruppi di superfici che adottano il set completo).

## 1. Problema / contesto

D‑02b ha introdotto i primitivi `Loomn*` (Button/Panel/Dialog/Card/Tag/Field/TextInput) e D‑02c ha rifatto la shell. La mappatura delle superfici (16 viste/pannelli) mostra che il **re‑skin completo e ancora bloccato da pezzi mancanti della libreria**, non da debito cromatico (zero hex hardcoded gia oggi):

- **~72+ controlli form raw** (`<select>`, `<textarea>`, alcuni `<input>`) sparsi su 7 superfici (`GmConsole` ~20, `CompanyView` ~18, `ReviewStep` ~15, `BriefStep` ~6, `EncounterPanel` ~5, `SettingsView`, `NarrativePanel`) — mancano i wrapper `LoomnSelect`/`LoomnTextArea` gemelli di `LoomnTextInput`.
- **~8 stati vuoti ad‑hoc** ("Nessun…", "Zaino vuoto.", "Nessuno scontro attivo.") ripetuti come `<p class="*__empty">` su `JournalView`/`DicePanel`/`SheetPanel`/`EncounterPanel`/`GameView` — manca un `LoomnEmptyState`.
- **Follow‑up a11y annotati** in D‑02b/D‑02c: `LoomnField` rende l'etichetta come `<span>` (nessuna associazione col controllo); `LoomnThemeToggle` usa `aria-pressed` su una scelta singola fra 3 (semantica da radiogroup).
- **Placeholder di drag rosso** in `GameView`: `grid-layout-plus` disegna il segnaposto di drop con `--vgl-placeholder-bg: red` (al 20% di opacita) — un colore fuori palette, stridente, l'unico residuo cromatico non tokenizzato della superficie Gioco.

D‑02d‑i chiude questi pezzi: aggiunge i primitivi mancanti **essenziali**, rifinisce i due primitivi esistenti per l'a11y, e tokenizza il placeholder della griglia. Ogni nuovo primitivo viene **provato in 1 punto ovvio** (come D‑02b), per dimostrarlo ed evitare codice morto; l'adozione completa per‑superficie resta alle ondate D‑02d‑ii…

## 2. Decisioni prese (con l'utente, via brainstorming)

1. **Decomposizione token‑first di D‑02d** (scelta esplicita): prima i primitivi mancanti (questa sotto‑slice), poi le ondate di re‑skin per‑superficie.
2. **Scope D‑02d‑i** (selezione esplicita dell'utente): `LoomnSelect` + `LoomnTextArea`; `LoomnEmptyState`; rifiniture a11y di `LoomnField` e `LoomnThemeToggle`. **FUORI da D‑02d‑i** (rinviati alle ondate di re‑skin, dove la loro forma reale e chiara): `LoomnFeedback`, `LoomnSectionHeader`, `LoomnListRow`/row‑card generica, `LoomnRadioGroup`, `LoomnResourceBar`.
3. **Aggiunta in corso d'opera (richiesta utente):** tokenizzare il placeholder di drag rosso di `grid-layout-plus` in `GameView` (cambio colore → token). Incluso in D‑02d‑i come piccola correzione CSS‑only, coerente col token‑first.
4. **Form primitives gemelli di `LoomnTextInput`:** stessa convenzione di focus (bordo `--accent` + alone `--accent-soft`), `invalid` (bordo `--bad`), `disabled` (opacita), `v-model`. Niente stato proprio.
5. **Adozione = 1 punto per primitivo** (behaviour‑preserving), come D‑02b.

## 3. Scope

**Dentro D‑02d‑i (renderer‑only):**
- **`LoomnSelect`** (nuovo) + adozione 1 punto.
- **`LoomnTextArea`** (nuovo) + adozione 1 punto.
- **`LoomnEmptyState`** (nuovo) + adozione 1 punto.
- **Rifinitura a11y `LoomnField`** (prop `id` → `<label for>`) + **`LoomnTextInput`** (prop `id` inoltrata) + adozione in `SettingsView`.
- **Rifinitura a11y `LoomnThemeToggle`** (segmenti → `role="radiogroup"`/`role="radio"`/`aria-checked`).
- **Tokenizzazione del placeholder di drag** in `GameView` (variabili `--vgl-placeholder-*` → token).

**Fuori (esplicito):** gli altri primitivi candidati (vedi §2.2); il re‑skin per‑superficie completo (D‑02d‑ii…); qualsiasi cambiamento a logica/engine/AI/host/shared, a main/preload/IPC, alle route, alla CSP; nuove dipendenze; tinta per‑campagna o ricolore di fase (chrome statico, LOCKED).

> **Nota di realismo sullo scope.** D‑02d‑i costruisce e prova i pezzi mancanti della libreria; NON re‑skinna le superfici. L'adozione e 1 swap pulito per primitivo. Il polish per‑superficie e D‑02d‑ii…

## 4. Componenti & comportamento

Tutti in `app/desktop/src/renderer/src/components/`, `<script setup lang="ts">`, TDD, **solo token** (guard `no-color-drift.test.ts` verde). API piccola e chiara.

### 4.1 `LoomnSelect` (nuovo)
- Wrapper su `<select>`. Props: `modelValue: string` (`v-model`), `invalid?: boolean`, `disabled?: boolean`, `id?: string`. Emette `update:modelValue` su `change` (`($event.target as HTMLSelectElement).value`). Le `<option>` arrivano via `<slot>`. Classe `loomn-select` con `is-invalid`. Stile da token come `LoomnTextInput` (`--well`/`--line-2`/`--r-sm`/`--fs-sm`/`--text`, `:focus` bordo `--accent` + `box-shadow: 0 0 0 3px var(--accent-soft)`, `.is-invalid` bordo `--bad`, `:disabled` opacita).
- **Adozione:** il `<select>` selettore‑attore in `SheetPanel` (`.sheet__select`, v‑model all'id attore selezionato), behaviour‑preserving; rimuove la regola `.sheet__select`.

### 4.2 `LoomnTextArea` (nuovo)
- Wrapper su `<textarea>`. Props: `modelValue: string` (`v-model`), `rows?: number` (default 4), `placeholder?: string`, `invalid?: boolean`, `disabled?: boolean`, `mono?: boolean`, `id?: string`. Emette `update:modelValue` su `input`. Classe `loomn-textarea` con `is-mono`/`is-invalid`. Stesso stile a alone di `LoomnTextInput`; `resize: vertical`.
- **Adozione:** la `<textarea>` compose in `NarrativePanel` (`.narr__input`, v‑model `draft`), behaviour‑preserving; rimuove la regola `.narr__input`.

### 4.3 `LoomnEmptyState` (nuovo)
- Blocco presentazionale per stati vuoti. Prop `message?: string` + `<slot>` (lo slot ha precedenza se presente; altrimenti rende `message`). Rende `<p class="loomn-empty" role="status">` (o `<div>`), testo centrato `--text-3`, `--fs-sm`, padding calmo. Nessuna logica.
- **Adozione:** `DicePanel` ("Nessun tiro ancora.", `.dice__empty`) — il punto piu semplice; rimuove la regola `.dice__empty`. Gli altri ~7 stati vuoti si adottano nelle ondate D‑02d‑ii…

### 4.4 Rifinitura a11y `LoomnField` + `LoomnTextInput`
- **`LoomnField`**: nuova prop opzionale `id?: string`. Se valorizzata, l'etichetta si rende come `<label :for="id">` (associazione esplicita); altrimenti resta `<span>` (retro‑compatibile, nessun consumatore rotto). Markup/classi invariati per il resto.
- **`LoomnTextInput`**: nuova prop opzionale `id?: string` inoltrata all'`<input :id>`. (Stessa prop si potra aggiungere a `LoomnSelect`/`LoomnTextArea` per simmetria; nello scope di D‑02d‑i serve almeno su `LoomnTextInput` per l'adozione.)
- **Adozione:** in `SettingsView` i campi Base URL e Model passano un `id` combaciante a `LoomnField` e `LoomnTextInput` (es. `id="set-base-url"`/`id="set-model"`), chiudendo il follow‑up a11y.

### 4.5 Rifinitura a11y `LoomnThemeToggle`
- I 3 segmenti in stato espanso passano da bottoni `aria-pressed` a un gruppo `role="radiogroup"` con bottoni `role="radio"` + `aria-checked` (semantica corretta per la scelta singola fra `system`/`light`/`dark`). Il bottone compresso (ciclo) resta invariato. I test esistenti si aggiornano alla nuova semantica mantenendo le asserzioni di comportamento (click → `useTheme().set`, evidenza del modo corrente).

### 4.6 Placeholder di drag in `GameView` (token)
- `grid-layout-plus` 1.1.1 colora il segnaposto di drop via custom properties: `--vgl-placeholder-bg: red` e `--vgl-placeholder-opacity: 20%` (default). Le custom properties si ereditano oltre il confine `scoped`, quindi si ridefiniscono sul contenitore `.game-view` in `GameView.vue` (niente `:deep()`, niente patch alla libreria):
  - `--vgl-placeholder-bg: var(--accent);`
  - `--vgl-placeholder-opacity: 16%;` (soffuso, calmo)
- Risultato: la zona di drop diventa un terracotta soffuso on‑brand al posto del rosso. Nessun hex (tutto via token); il guard resta verde.

## 5. Token
- Nessun nuovo token previsto: i primitivi riusano quelli esistenti (`--well`/`--line-2`/`--r-sm`/`--fs-sm`/`--text`/`--text-3`/`--accent`/`--accent-soft`/`--bad`/`--f-mono`/`--f-sans`/`--dur-fast`/`--ease`). Il placeholder usa `var(--accent)`.

## 6. Testing & gate
- **Renderer‑only, ABI jsdom. NESSUN gate Electron** (non tocca main/IPC; come D‑02a/b/c).
- **Test per nuovo componente** (Vitest + @vue/test-utils, jsdom): `LoomnSelect` (riflette modelValue, emette update:modelValue su change, classi invalid/disabled, slot option), `LoomnTextArea` (idem + mono + rows), `LoomnEmptyState` (rende message e slot, slot ha precedenza).
- **Test esistenti toccati dalle adozioni** aggiornati mantenendo le asserzioni di comportamento: `SheetPanel.test` (select), `NarrativePanel.test` (textarea/compose), `DicePanel.test` (empty), `SettingsView.test` (i selettori `input[type=text]` restano validi; eventuale assert su `for`/`id`), `LoomnThemeToggle.test` (radiogroup/aria‑checked al posto di aria‑pressed). `LoomnField.test` aggiunge un caso per la prop `id` → `<label for>`.
- **Guard `no-color-drift.test.ts`** verde (nessun hex; il placeholder usa `var(--accent)`).
- `pnpm -r typecheck` verde; `pnpm test` verde (conteggio cresce coi nuovi test).
- **Verifica visiva** (livello artefatto come D‑02b/c, light/dark): focus a alone su select/textarea, stato vuoto, e — soprattutto — il **placeholder di drag terracotta** invece del rosso (drag manuale o ispezione del bundle: `--vgl-placeholder-bg: var(--accent)` presente; il drag in jsdom non e testabile, quindi la prova e artefatto + visiva, come per i task token). ⚠️ Promemoria ABI: la `electron-vite build` della verifica visiva riflippa l'ABI a Electron → dopo serve `pnpm rebuild:node` (e killare eventuali processi Loomn fantasma se EPERM).

## 7. Disciplina / drift‑guard
- Niente modifiche a `tsconfig*`/`vitest.config*`/`vitest.workspace.ts`/`electron.vite.config*`/`package.json`. **Nessuna nuova dipendenza.**
- Migrazione/adozione a batch piccoli; ogni task chiude con `pnpm -r typecheck` + i test renderer verdi.
- TS strict (`exactOptionalPropertyTypes`): spread condizionali / props opzionali via `?`, niente `campo: undefined`.
- Anti‑apostrofo nelle stringhe dei test in apici singoli.
- `.claude/`/`.superpowers/` mai committati (gia gitignorati).
- **Promemoria (debt annotato):** `no-color-drift.test.ts` guarda solo `#d98b6b`, non e un guard no‑hex generico → la verifica "niente hex" resta su review+grep (candidato a estendere il guard in una sotto‑slice futura).

## 8. Foresight (slice successive)
- **D‑02d‑ii… — Re‑skin per‑superficie:** adozione completa dei primitivi (inclusi `LoomnSelect`/`LoomnTextArea`/`LoomnEmptyState`) sulle superfici HEAVY (`CompanyView`, `SheetPanel`, `EncounterPanel`, `GmConsole`, `ReviewStep`) e MEDIUM (`JournalView`, `SettingsView`, `NarrativePanel`, `BriefStep`); empty‑state unificati ovunque; eventuali nuovi primitivi quando la forma reale e chiara (`LoomnFeedback`, `LoomnSectionHeader`, `LoomnRadioGroup`, `LoomnResourceBar`, row‑card). Raggruppamento delle superfici da decidere all'inizio di D‑02d‑ii.

## 9. Fuori ambito (esplicito)
`LoomnFeedback`/`LoomnSectionHeader`/`LoomnListRow`/`LoomnRadioGroup`/`LoomnResourceBar` (rinviati); re‑skin per‑superficie (D‑02d‑ii…); cambi a route/logica/engine/AI/host/shared/main/IPC/CSP; nuove dipendenze; patch alla libreria `grid-layout-plus` (il placeholder si tokenizza via le sue custom properties, senza toccare il pacchetto).
