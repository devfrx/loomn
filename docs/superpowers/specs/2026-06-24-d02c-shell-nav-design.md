# D‑02c — Shell & navigazione — Design

> **Data:** 2026‑06‑24 · **Traccia:** D‑02 (ripensamento UI/UX completo), slice c (shell & navigazione) · **Stato:** design approvato (brainstorming con visual companion, mockup approvati), pronto per `writing-plans`.
> D‑02 e decomposta token‑first: D‑02a fondamenta (FATTA) → D‑02b libreria componenti (FATTA) → **D‑02c shell & navigazione** (questo) → D‑02d re‑skin delle superfici. Ogni slice ha il suo ciclo spec → piano → implementazione.

## 1. Problema / contesto

D‑02a ha posato i token (warm‑neutral light/dark, `useTheme`, tipografia all‑sans); D‑02b ha ricostruito i componenti condivisi e introdotto i primitivi `Loomn*` sui token. Resta da rifinire **la shell** — il telaio che racchiude tutte le superfici (`App.vue`):

- **Rail di navigazione criptico:** mostra solo la prima lettera di ogni destinazione (G/D/S/C/I), con i nomi relegati al `title`/tooltip. Poco leggibile, poco "literary".
- **Il toggle tema non ha una casa nel chrome:** vive solo dentro `SettingsView` (D‑02a T5). Cambiare tema richiede di entrare in Impostazioni.
- **One‑off hardcoded nella shell:** `App.vue` usa dimensioni/raggi/larghezze letterali (`font-size: 20/15/21/12px`, `border-radius: 12/11/9px`, rail 66px) invece dei token — contro il principio token‑first single‑source.
- **Nessuna transizione:** il cambio vista e secco; manca il tono cozy ("mai brusco").
- **Topbar generica:** wordmark + phase badge, senza un titolo della superficie corrente che dia orientamento (utile soprattutto con un rail compresso a sole icone).

D‑02c ripensa il modello di navigazione e rifinisce la shell sui token, consumando i primitivi di D‑02b dove utile. Il re‑skin completo delle singole superfici resta a D‑02d.

## 2. Decisioni prese (con l'utente, via brainstorming + mockup approvati)

1. **Ambizione = ripensare il modello di navigazione** (non solo rifinire). Scelta esplicita dell'utente.
2. **Modello di nav = rail a icone espandibile** (opzione C dei mockup). Un solo rail con due stati: **compresso** (sole icone + tooltip) ed **espanso** (icona + etichetta). Le destinazioni usano **vere icone** (non lettere).
3. **Espansione = pin con toggle, persistito.** Un controllo nel rail espande/comprime; lo stato e ricordato tra le sessioni in `localStorage` (stesso pattern di `useTheme` di D‑02a). Niente hover‑flyout (scelta esplicita: piu prevedibile e accessibile, niente moto a sorpresa).
4. **Brand nel rail.** Il marchio vive in cima al rail ("L" compresso → "Loomn." espanso) e **esce dalla topbar**.
5. **Topbar slim contestuale.** La topbar resta ma alleggerita: **titolo della superficie corrente** (derivato dalla route) + **phase badge** a destra. La `GmConsole` dev‑only resta dov'e (montata solo in `import.meta.env.DEV`).
6. **Toggle tema nel rail** (accesso rapido; i 3 radio in `SettingsView` restano il controllo esplicito, INVARIATI). Compresso: bottone‑icona che **cicla** auto → light → dark (icona = modo corrente, tooltip). Espanso: piccolo segmentato a 3 (auto/light/dark). Richiama `useTheme().set`.
7. **Icone = SVG inline disegnate a mano.** Vincolo LOCKED: niente nuove dipendenze → nessuna libreria di icone. Set piccolo e coerente (5 nav + tema + chevron espandi/comprimi).
8. **Transizioni sottili** sul cambio vista e sull'espansione del rail, **che rispettano `prefers-reduced-motion`** (nessun moto se l'utente lo disattiva). Cozy, mai brusco.
9. **Tokenizzare la shell.** I one‑off di `App.vue` passano ai token; nessun hex (il guard `no-color-drift.test.ts` resta verde).
10. **Empty states & `LoomnTabs` FUORI da D‑02c** → D‑02d (gli empty‑state sono parte del re‑skin per‑superficie; `LoomnTabs` non ha consumatori, come deciso in D‑02b).

## 3. Scope

**Dentro D‑02c (renderer‑only):**
- **`LoomnRail`** (nuovo componente): nav a icone con stato compresso/espanso persistito, brand in cima, voce attiva in accento, toggle tema in fondo, controllo comprimi/espandi. Estratto da `App.vue`.
- **`LoomnThemeToggle`** (nuovo componente): accesso rapido al tema nel rail (ciclo compresso / segmentato espanso), su `useTheme`.
- **Persistenza stato rail**: composable dedicato (mirror di `use-theme.ts`) o stato interno a `LoomnRail` con `localStorage` — la forma esatta la fissa il piano; deve essere testabile in isolamento.
- **Icone SVG inline**: set coerente per nav + tema + chevron (autorate a mano, nessuna dipendenza).
- **Topbar slim**: titolo della superficie corrente (da una mappa route→etichetta single‑source, condivisa col rail) + phase badge; wordmark rimosso dalla topbar.
- **Transizioni**: `<Transition>` sul `<RouterView>` + sull'espansione del rail, con `prefers-reduced-motion`.
- **Tokenizzazione di `App.vue`**: dimensioni/raggi/larghezze → token (eventuali nuovi token di shell definiti in `tokens.css`, non‑cromatici in `:root`).
- **`App.vue` ricomposto**: orchestratore della shell (rail + topbar slim + `FirstRunBanner` + `RouterView` con transizione), piu magro.

**Fuori (esplicito):** empty‑states unificati e re‑skin completo per‑superficie (D‑02d); `LoomnTabs` (nessun consumatore); qualsiasi cambiamento a logica/engine/AI/host/shared, al processo `main`/preload/IPC, alle route o alla CSP; nuove dipendenze (incluse librerie di icone); tinta per‑campagna o ricolore di fase (chrome statico, LOCKED).

> **Nota di realismo sullo scope.** D‑02c ridisegna il telaio (rail + topbar + transizioni) e lo tokenizza; non re‑skinna il contenuto delle superfici. Gli swap restano piccoli e behaviour‑preserving per tenere i diff contenuti e i test verdi.

## 4. Componenti & comportamento

Tutti in `app/desktop/src/renderer/src/`, `<script setup lang="ts">`, TDD, **solo token** (nessun hex → il guard resta verde). API piccole e chiare.

### 4.1 `LoomnRail`
- **Navigazione**: itera una lista single‑source di destinazioni `{ to, label, icon }` (Gioco `/`, Diario `/diario`, Scheda `/scheda`, Compagnia `/compagnia`, Impostazioni `/impostazioni`). Usa `RouterLink` con `exact-active-class` per la voce attiva (accento `--accent`/`--accent-soft`, come oggi). Ogni voce ha `:title`/`:aria-label` (tooltip quando compressa).
- **Stati**: compresso (sole icone) / espanso (icona + etichetta). Lo stato e un booleano persistito (vedi 4.3). Larghezze da token.
- **Brand** in cima ("L" compresso → "Loomn." espanso). **Toggle tema** + **controllo comprimi/espandi** in fondo.
- **Accessibilita**: `<nav aria-label="navigazione">`; il controllo espandi/comprimi e un `<button>` con `aria-expanded` + `aria-label`.

### 4.2 `LoomnThemeToggle`
- Richiama `useTheme()` (stato `system | light | dark`). Compresso: un `<button>` che **cicla** auto → light → dark (icona = modo corrente; `:title`/`:aria-label` col modo). Espanso: un piccolo gruppo a 3 (auto/light/dark) con il modo corrente evidenziato. Nessuno stato proprio (la sorgente e `useTheme`).

### 4.3 Persistenza stato rail
- Composable dedicato (es. `composables/use-rail.ts`, mirror di `use-theme.ts`: `ref` module‑level, `init` legge/valida da `localStorage['loomn-rail']`, `set`/`toggle` persistono) **oppure** stato interno a `LoomnRail` con lettura in setup + watch che persiste — la forma esatta la fissa il piano. Requisito: testabile in isolamento; default = compresso se assente/invalido.

### 4.4 Topbar slim (in `App.vue`)
- Mostra il **titolo della superficie corrente** (dalla mappa route→etichetta single‑source, riusata dal rail; la route corrente via `useRoute().name`/`path`) + il **phase badge** (invariato nella sostanza, sui token). Nessun wordmark. `GmConsole` dev‑only invariata. Onboarding (`/nuova-campagna`): titolo "Nuova campagna" (la shell resta visibile, cosi durante il first‑run si puo navigare a Impostazioni).

### 4.5 Transizioni
- `<RouterView v-slot>` avvolto in `<Transition name="...">` con una **dissolvenza sottile** (durata dai token `--dur`/`--ease`). Espansione del rail: transizione su larghezza/opacita delle etichette. **`@media (prefers-reduced-motion: reduce)`**: durata 0 / nessun moto.

### 4.6 Icone
- File SVG inline (componenti o `<svg>` inline nel rail), `currentColor` per ereditare il colore della voce (accento/neutro). Nessuna dipendenza. Set: 5 nav + tema(auto/sun/moon) + chevron.

## 5. Token (in `tokens.css`)
- Eventuali **token di shell non‑cromatici** in `:root` (es. larghezza rail compresso/espanso, altezza topbar) per eliminare i one‑off di `App.vue`. Valori esatti nel piano, ancorati ai mockup. Riuso dei token esistenti (`--r`, `--space-*`, `--surface`, `--line`, `--accent`, `--accent-soft`, `--text*`, `--dur`, `--ease`). **Nessun nuovo token cromatico** previsto (la nav usa accento/neutri esistenti). Il guard resta verde (tutto via `var(--token)`).

## 6. Testing & gate
- **Renderer‑only, ABI jsdom. NESSUN gate Electron** (non tocca main/IPC; come D‑02a/b).
- **Test per componente** (Vitest + @vue/test-utils, jsdom): `LoomnRail` (render voci, voce attiva per route, stato compresso/espanso + persistenza, emit/azione del toggle espandi, aria), `LoomnThemeToggle` (ciclo dei modi, chiama `useTheme().set`, modo corrente evidenziato), composable di persistenza del rail (init/validazione/persist), topbar (titolo della superficie per route).
- **`App.test.ts` aggiornato** alla nuova struttura (rail estratto, topbar slim, transizione) — mantenendo le asserzioni di comportamento.
- **Guard `no-color-drift.test.ts`** resta verde (nessun hex nei `.vue`).
- `pnpm -r typecheck` verde; `pnpm test` verde (il conteggio cresce coi nuovi test).
- **Verifica visiva** (livello artefatto + browser headless come D‑02a/b, light/dark): rail compresso/espanso, persistenza, voce attiva, toggle tema, titolo superficie, transizioni; nessun hex a video. ⚠️ Promemoria ABI: la `electron-vite build` della verifica visiva ricompila `better-sqlite3` per l'ABI Electron → dopo serve `pnpm rebuild:node` (e killare eventuali processi Loomn fantasma se EPERM).

## 7. Disciplina / drift‑guard
- Niente modifiche a `tsconfig*`/`vitest.config*`/`vitest.workspace.ts`/`electron.vite.config*`/`package.json`. **Nessuna nuova dipendenza** (icone = SVG inline).
- Migrazione/estrazione a batch piccoli; ogni task chiude con `pnpm -r typecheck` + i test renderer verdi.
- TS strict (`exactOptionalPropertyTypes`): spread condizionali, niente `campo: undefined`.
- Anti‑apostrofo nelle stringhe dei test in apici singoli.
- `.claude/`/`.superpowers/` mai committati (gia gitignorati).
- **Promemoria del debt annotato in D‑02b** (NON obbligo di D‑02c, ma da tenere presente): `no-color-drift.test.ts` guarda solo `#d98b6b`, non e un guard no‑hex generico → la verifica "niente hex" resta su review+grep.

## 8. Foresight (slice successiva)
- **D‑02d — Re‑skin superfici:** adozione completa dei componenti su Gioco (dashboard raffinato), Diario, Scheda, Compagnia, Impostazioni, Onboarding; **empty‑states unificati** (eventuale `LoomnEmptyState`); eventuale `LoomnTabs` se una superficie lo richiede; risoluzione del follow‑up a11y di `LoomnField` (label `<span>` → `<label for>`).

## 9. Fuori ambito (esplicito)
Empty‑states e re‑skin per‑superficie (D‑02d); `LoomnTabs`; hover‑flyout per il rail (scartato a favore del pin persistito); libreria di icone o qualsiasi nuova dipendenza; cambi a route/logica/engine/AI/host/shared/main/IPC/CSP; tinta per‑campagna o ricolore di fase (chrome statico, LOCKED).
