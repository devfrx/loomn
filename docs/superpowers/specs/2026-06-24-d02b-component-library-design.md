# D‑02b — Libreria componenti — Design

> **Data:** 2026‑06‑24 · **Traccia:** D‑02 (ripensamento UI/UX completo), slice b (libreria componenti) · **Stato:** design approvato (brainstorming con visual companion, mockup approvati), pronto per `writing-plans`.
> D‑02 e decomposta token‑first: D‑02a fondamenta (FATTA) → **D‑02b libreria componenti** (questo) → D‑02c shell & navigazione → D‑02d re‑skin delle superfici. Ogni slice ha il suo ciclo spec → piano → implementazione.

## 1. Problema / contesto

D‑02a ha posato le fondamenta: il sistema di token warm‑neutral light/dark (`tokens.css`), il theming (`useTheme`), la tipografia all‑sans. I componenti condivisi esistenti (`LoomnButton`, `LoomnPanel`, `LoomnDialog`, `PanelError`) consumano i token ma portano ancora **residui dark‑baked e stili one‑off**:

- `LoomnButton --solid` usa un **gradiente oro hardcoded** (`#d8b76b`/`#b88f43`, testo `#1a140a`) — relitto del vecchio tema atelier, non l'accento terracotta.
- `LoomnPanel` ha **ombre hardcoded tarate solo per il dark** (`rgba(0,0,0,.75)` + inset bianco).
- `LoomnDialog` ha **scrim hardcoded** (`rgba(7,8,9,.6)`) e ombra hardcoded.
- Mancano i token di supporto ai componenti (focus‑ring, scrim/overlay, ombre per‑tema, sfondi di stato tenui) — minori espressamente rinviati a D‑02b dalla review T1 di D‑02a.
- I form (Impostazioni, onboarding), i badge (Scheda) e le card (Compagnia) sono **stili one‑off** ripetuti, non primitivi.

D‑02b ricostruisce i componenti condivisi sui token, aggiunge i token di supporto mancanti e introduce un piccolo set di **primitivi riusabili**, eliminando i one‑off piu evidenti. E il livello "componenti" del sistema: la shell/navigazione (D‑02c) e il re‑skin completo delle superfici (D‑02d) ereditano da qui.

## 2. Decisioni prese (con l'utente, via brainstorming + mockup approvati)

1. **Scope = core + primitivi essenziali.** Rifinire i 4 componenti condivisi + aggiungere i primitivi piu riusati (Card, Field, TextInput, Tag) + adottarli dove e uno swap pulito. Card/Tabs‑estesi e il re‑skin completo per‑superficie restano a D‑02d.
2. **Bottoni:** set `solid` (primaria, terracotta) / `ghost` (secondaria) / `danger` (distruttiva). La danger e a **contorno** (bordo + testo `--bad`, hover riempie appena) — coerente col tono cozy, non a sfondo pieno. Focus = **outline 2px `--accent`** (offset 2px). Disabled = `opacity .45`.
3. **Superfici & elevazione:** ombre **morbide tokenizzate**, `--shadow-1` sottile (card) e `--shadow-2` per i contenitori/elementi raised — tarate **per‑tema** (soffuse‑calde in light, profonde in dark; oggi sono hardcoded e solo‑dark). Nuovo primitivo **Card** (header opzionale + slot corpo, stato raised).
4. **Form:** primitivo **Field** (etichetta + slot controllo + hint, con stato error) e **TextInput** (testo + variante **mono** per URL/valori). Focus sugli input = **bordo `--accent` + alone `--accent-soft`** (mentre i bottoni usano l'outline). Stato error = bordo `--bad` + hint rosso.
5. **Tag/Badge:** primitivo **Tag** con varianti `neutral` / `accent` / `ok` / `warn` / `bad` (sfondi tenui di stato).
6. **Dialog:** scrim ed elevazione **tokenizzati** — `--scrim` (velo caldo in light, profondo in dark) + `--shadow-2`; le varianti `center` e `drawer` condividono i token. Reka resta il motore (Escape + focus‑trap, inline senza Teleport — decisione 10f invariata).
7. **Naming:** prefisso **`Loomn*`** per i nuovi primitivi (`LoomnCard`, `LoomnField`, `LoomnTextInput`, `LoomnTag`), coerente con `LoomnButton`/`LoomnPanel`/`LoomnDialog`.
8. **Adozione:** ogni nuovo primitivo viene **provato in 1 punto ovvio** (dimostra il componente, evita codice morto): `LoomnButton --solid` → i 3 CTA onboarding; `LoomnField`/`LoomnTextInput` → form Impostazioni; `LoomnTag` → badge in `SheetPanel`; `LoomnCard` → carta attore in `CompanyView`. Il re‑skin completo delle superfici resta a D‑02d.

## 3. Scope

**Dentro D‑02b (renderer-only):**
- **Token di supporto** in `tokens.css` (light + dark): `--scrim`, `--ok-soft`, `--warn-soft`, `--bad-soft`; spostamento di `--shadow-1`/`--shadow-2` dal blocco condiviso `:root` ai blocchi cromatici per‑tema con valori ritarati. Affiancano l'esistente `--accent-soft`.
- **Rifinitura** dei componenti condivisi: `LoomnButton` (varianti solid/ghost/danger + focus + disabled + solid→terracotta), `LoomnPanel` (ombre→token), `LoomnDialog` (scrim/ombra→token + focus close), `PanelError` (tokenizza la dimensione del testo; resta presentazionale).
- **Nuovi primitivi:** `LoomnCard`, `LoomnField`, `LoomnTextInput`, `LoomnTag`.
- **Adozione mirata** (1 punto ciascuno): onboarding CTA, form Impostazioni, badge Scheda, carta Compagnia.

**Fuori (esplicito):** Tabs (nessun consumatore ancora), re‑skin completo per‑superficie (D‑02d), shell & navigazione + posizionamento definitivo del toggle tema (D‑02c). **Nessun cambiamento** a `@loomn/engine`/`ai`/`host`/`shared`, al processo `main`/preload/IPC, ne alla logica di prodotto. Nessuna nuova dipendenza. Nessun cambiamento alla CSP.

> **Nota di realismo sullo scope.** D‑02b costruisce e prova la libreria; non re‑skinna ogni schermo. L'adozione e limitata a 1 swap pulito per primitivo per tenere i diff piccoli e i test verdi. Il polish per‑superficie e D‑02d.

## 4. Token di supporto (`tokens.css`)

Aggiunte/spostamenti, da definire con valori esatti nel piano (ancorati ai mockup approvati). I non‑cromatici restano in `:root`; i cromatici e le ombre **dipendono dal tema**.

### 4.1 Elevazione (spostata da `:root` a per‑tema)
| Token | Uso | Light (ancora) | Dark (ancora) |
|---|---|---|---|
| `--shadow-1` | card, elementi sottili | ombra soffusa bassa, calda | profondita lieve |
| `--shadow-2` | contenitori, raised, dialog | ombra morbida media | profondita marcata |

> Oggi `--shadow-1`/`--shadow-2` stanno nel blocco condiviso `:root` (un solo valore per entrambi i temi). Vanno spostate: valore light nel `:root` (default), valore dark nei due blocchi dark (`@media (prefers-color-scheme: dark) :root:not([data-theme='light'])` e `[data-theme='dark']`), identici fra loro. Mai ombre dure — il tono e cozy.

### 4.2 Scrim
| Token | Uso | Light | Dark |
|---|---|---|---|
| `--scrim` | backdrop dei dialog | velo caldo (es. `rgba(43,40,34,.38)`) | profondo (es. `rgba(0,0,0,.62)`) |

### 4.3 Sfondi di stato tenui (per i Tag)
| Token | Light | Dark |
|---|---|---|
| `--ok-soft` | tenue verde caldo | tenue verde |
| `--warn-soft` | tenue ambra | tenue ambra |
| `--bad-soft` | tenue rosso | tenue rosso |

> Affiancano `--accent-soft` (gia esistente, usato dal tag `accent` e dall'hover ghost). Il guard `no-color-drift.test.ts` resta verde: i nuovi colori sono **token**, non hex nei `.vue`.

### 4.4 Focus & disabled (convenzioni, non nuovi token)
- **Focus bottoni:** `outline: 2px solid var(--accent); outline-offset: 2px;`.
- **Focus input:** `border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft);`.
- **Disabled:** `opacity: .45; cursor: not-allowed;`.
Nessun token dedicato (YAGNI): si compongono dai token accento esistenti.

## 5. Componenti

Tutti in `app/desktop/src/renderer/src/components/`, `<script setup lang="ts">`, TDD, **solo token** (nessun hex hardcoded → il guard resta verde). API piccola e chiara; ogni componente comprensibile e testabile in isolamento.

### 5.1 Rifiniti
- **`LoomnButton`** — props `variant?: 'solid' | 'ghost' | 'danger'` (default `ghost`), `disabled?`. Emette `click`. `solid` = `--accent`/`--on-accent`, hover `--accent-press`; `ghost` = `--well`/`--text`/`--line-2`, hover bordo `--accent` + `--accent-soft`; `danger` = contorno `--bad`, hover `--bad-soft`. Focus outline accento. Rimuove il gradiente oro hardcoded. Token per forma/spazio/type.
- **`LoomnPanel`** — API invariata (`eyebrow?`/`title?`/`meta?` + slot). Ombra `--shadow-2`, niente inset bianco hardcoded; dimensioni testo/padding via token.
- **`LoomnDialog`** — API invariata (`title`, `open?`, `variant?: 'center' | 'drawer'`, `update:open`; Reka inline, controllato/non‑controllato via `rootProps` exactOptional‑safe). Overlay = `--scrim`; contenuto = `--surface` + `--shadow-2`; close con focus visibile.
- **`PanelError`** — presentazionale invariato (`error: string | null`, `role="alert"`, `--bad`); tokenizza la dimensione del testo.

### 5.2 Nuovi primitivi
- **`LoomnCard`** — `eyebrow?`/`title?`/`meta?` opzionali (header) + slot corpo; `raised?: boolean`. Default `--surface-2` (card su pannello) + `--line` + `--shadow-1`; raised → `--shadow-2` + `--line-2`.
- **`LoomnField`** — `label?: string`, `hint?: string`, `error?: string | null`; slot per il controllo. Rende etichetta uppercase (`--text-3`), il controllo, e hint (`--text-3`) o error (`--bad`). Non possiede stato: compone label + controllo + messaggio.
- **`LoomnTextInput`** — wrapper su `<input>`: `modelValue` (`v-model`), `mono?: boolean`, `type?`, `placeholder?`, `disabled?`, `invalid?: boolean`. `--well`/`--line-2`, focus bordo `--accent` + alone `--accent-soft`, invalid bordo `--bad`, mono = `--f-mono`. Emette `update:modelValue`.
- **`LoomnTag`** — `variant?: 'neutral' | 'accent' | 'ok' | 'warn' | 'bad'` (default `neutral`) + slot testo. Pill: neutro = `--surface-2`/`--line`/`--text-2`; accent = `--accent-soft`/`--accent-press`; stato = `*-soft`/colore di stato.

## 6. Adozione mirata (1 punto per primitivo)

Swap puliti, behaviour‑preserving (nessun cambiamento di logica), per provare ogni primitivo ed evitare codice morto:
- **`LoomnButton --solid`** → i 3 CTA accento dell'onboarding (`BriefStep .generate`, `OpeningStep .enter`, `ReviewStep .confirm`) — sostituisce i bottoni one‑off (gia migrati a `--on-accent` in D‑02a).
- **`LoomnField` + `LoomnTextInput`** → form `SettingsView` (Base URL, Model; la chiave resta come scelta dal piano se piu complessa).
- **`LoomnTag`** → badge `SheetPanel` (`.item__badge`).
- **`LoomnCard`** → carta attore `CompanyView`.

Il resto delle superfici (Gioco/Diario/Scheda/Compagnia complete) si adotta in D‑02d.

## 7. Testing & gate

- **Renderer-only, ABI jsdom. NESSUN gate Electron** (non tocca main/IPC; come D‑02a e Fase 5).
- **Test per componente** (Vitest + @vue/test-utils, jsdom): render, varianti, stati (disabled/invalid/raised), slot, eventi emessi (`click`, `update:modelValue`, `update:open`). Per i componenti rifiniti, i test esistenti restano verdi (API invariate) + nuovi test per le varianti aggiunte.
- **Guard `no-color-drift.test.ts`** resta verde dopo l'adozione (nessun hex hardcoded nei `.vue`).
- `pnpm -r typecheck` verde; `pnpm test` verde (conteggio cresce coi nuovi test).
- **Verifica visiva** (preview tools, light/dark) come per D‑02a: conferma varianti/stati e il toggle tema sui componenti reali.

## 8. Disciplina / drift‑guard

- Niente modifiche a `tsconfig*`/`vitest.config*`/`vitest.workspace.ts`/`electron.vite.config*`/`package.json`. Nessuna nuova dipendenza.
- Migrazione/adozione a batch piccoli; ogni task chiude con `pnpm -r typecheck` + i test renderer verdi.
- TS strict (`exactOptionalPropertyTypes`): spread condizionali, niente `field: undefined` (vedi `LoomnDialog.rootProps`).
- Anti‑apostrofo nelle stringhe dei test in apici singoli.
- `.claude/`/`.superpowers/` mai committati.

## 9. Foresight (slice successive)

- **D‑02c — Shell & navigazione:** topbar/nav, posizionamento definitivo del toggle tema, transizioni, empty states, eventuale `LoomnTabs` se una superficie lo richiede.
- **D‑02d — Re‑skin superfici:** adozione completa dei componenti su Gioco (dashboard raffinato), Diario, Scheda, Compagnia, Impostazioni, Onboarding.

## 10. Fuori ambito (esplicito)

`LoomnTabs` e altri primitivi senza consumatore attuale; re‑skin visivo completo per‑superficie (D‑02d); shell/navigazione (D‑02c); qualsiasi cambiamento a logica/engine/AI/host/shared/main/IPC; nuove dipendenze; cambi alla CSP; tinta per‑campagna (decisa contro: chrome statico).
