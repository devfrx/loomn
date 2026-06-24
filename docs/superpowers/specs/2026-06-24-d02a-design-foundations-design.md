# D‑02a — Fondamenta del design system (token + theming) — Design

> **Data:** 2026‑06‑24 · **Traccia:** D‑02 (ripensamento UI/UX completo), slice a (fondamenta) · **Stato:** design approvato, pronto per `writing-plans`.
> D‑02 e decomposta token‑first: **D‑02a fondamenta** (questo) → D‑02b libreria componenti → D‑02c shell & navigazione → D‑02d re‑skin delle superfici. Ogni slice ha il suo ciclo spec → piano → implementazione.

## 1. Problema / contesto

L'utente vuole un **ripensamento completo** della UI. La UI attuale (Piano 10) e un tema "dark literary atelier" con palette brass/clay/sage/steel, serif (Fraunces/Newsreader) + Archivo, e **accento reattivo alla fase** (`[data-phase]`: combat→clay, dialogue→oro, downtime→acciaio). Il problema: quel tema **impone uno stile specifico** mentre le campagne sono di *ogni genere* (fantasy, sci‑fi, horror, moderno, cozy). Serve un linguaggio visivo **neutro rispetto al genere**, caldo e accogliente, con il *contenuto* (la campagna) a portare il sapore — non la chrome.

D‑02a posa la **fondazione**: il sistema di token centralizzato (single source of truth), il theming light/dark, la tipografia. Tutto il resto (componenti, shell, superfici) eredita da qui.

## 2. Decisioni prese (con l'utente, via brainstorming + mockup approvati)

1. **Feeling = literary + cozy, genre‑neutral.** Calore via palette/spazio/forma, non via stile di genere. Confermato da mockup approvato.
2. **Chrome neutro statico.** Una sola skin per tutte le campagne; il genere vive nei contenuti. Niente tinta derivata dal seed.
3. **Canvas = warm light + warm dark**, dallo stesso set di token, con toggle utente. Palette approvata (valori in §4).
4. **Accento unico statico** (terracotta). **Rimosso il ricolore di fase**: la modalita si comunica con etichette/icone/layout, non ricolorando la shell.
5. **Tipografia: tutto sans + mono per i valori tecnici.** Si **tiene Archivo** (gia nel bundle) come unico sans UI+lettura e **JetBrains Mono** per i numeri (dadi/stat); si **rimuovono i serif** Fraunces/Newsreader. (Sostituibile: e un token.)
6. **Game IX = dashboard a pannelli raffinato** (grid‑layout‑plus mantenuto; il polish e D‑02b/D‑02d).
7. **Architettura token‑first, single source of truth, componenti riusabili, zero one‑off.** Vincolo forte dell'utente.

## 3. Scope

**Dentro D‑02a (renderer-only):**
- `tokens.css`: nuovo set semantico (light/dark), valori warm‑neutral, accento terracotta, scala type/spacing/radius/elevation/motion.
- `base.css`: reset/elementi base allineati ai nuovi token + font.
- Meccanismo theming: `[data-theme]` sul root + composable `useTheme` (default = segue OS; toggle persistito in localStorage).
- De‑tematizzazione: rimozione token atelier‑specifici + del ricolore `[data-phase]` dell'accento (aggiornare `App.vue`).
- **Migrazione dei riferimenti**: rinominare i token consumati dai `.vue`/`.css` esistenti dai nomi dark‑baked/atelier (`--ink`, `--panel`, `--brass`, …) ai nomi semantici nuovi (`--bg`, `--surface`, `--accent`, …), cosi l'app rende coerente nella nuova palette a livello base.
- Font: rimuovere il caricamento dei serif non piu usati (Fraunces/Newsreader), tenere Archivo + JetBrains Mono.

**Fuori (esplicito):** polish per‑componente (D‑02b), shell & navigazione (D‑02c), re‑skin per‑superficie (D‑02d). **Nessun cambiamento** a `@loomn/engine`/`ai`/`host`/`shared` ne al processo `main`/preload/IPC. Nessuna logica di prodotto. La generazione/seed non si toccano.

> **Nota di realismo sullo scope.** D‑02a stabilisce il sistema e fa la **migrazione base** dei riferimenti token (rename + valori), NON il redesign visivo di ogni componente/schermo. Dopo il rename, l'app sara coerente nella nuova palette ma il polish fine arriva in D‑02b/D‑02d. Il piano decomporra la migrazione in batch bite‑sized (per cartella/superficie) per tenere i diff piccoli e i test verdi.

## 4. Sistema di token (`tokens.css`)

**Token NON cromatici in `:root`** (condivisi light/dark): radius, spacing, type, elevation, motion.
**Token cromatici** definiti per dark (default) e light, con override `[data-theme]` (§5).

Nomi semantici (rimpiazzano i nomi dark‑baked/atelier attuali). Valori anchor approvati dal mockup; le tinte secondarie sono razionalizzate in ramp coerenti.

### 4.1 Superfici
| Token | Light | Dark | Uso |
|---|---|---|---|
| `--bg` | `#F3EFE7` | `#181613` | sfondo pagina |
| `--surface` | `#FBF9F4` | `#232019` | pannelli, card |
| `--surface-2` | `#F7F4EC` | `#2A261F` | raised/hover |
| `--well` | `#EEE9DF` | `#14110F` | incassi, input |

### 4.2 Testo
| Token | Light | Dark |
|---|---|---|
| `--text` | `#2B2824` | `#ECE7DE` |
| `--text-2` | `#6E6A61` | `#A8A399` |
| `--text-3` | `#9A958A` | `#75716A` |

### 4.3 Linee
| Token | Light | Dark |
|---|---|---|
| `--line` | `rgba(43,40,34,0.10)` | `rgba(236,231,222,0.10)` |
| `--line-2` | `rgba(43,40,34,0.16)` | `rgba(236,231,222,0.18)` |

### 4.4 Accento (terracotta, unico, statico)
| Token | Light | Dark | Uso |
|---|---|---|---|
| `--accent` | `#BD6A4C` | `#D98A6A` | bottoni primari, link, stati attivi |
| `--accent-press` | `#A8552F` | `#E0A084` | hover/active e testo‑accento su superficie |
| `--accent-soft` | `rgba(189,106,76,0.13)` | `rgba(217,138,106,0.18)` | sfondo tenue (chip attive, hover) |
| `--on-accent` | `#FFFFFF` | `#1B1916` | testo/icone su `--accent` |

### 4.5 Stato (warm‑compatibili, distinti dall'accento)
| Token | Light | Dark |
|---|---|---|
| `--ok` | `#5E8C61` | `#8FBF93` |
| `--bad` | `#C2403A` | `#E08079` |
| `--warn` | `#B7791F` | `#E0A84E` |

> `--bad` resta il token usato da `PanelError`/feedback errori; ora e un rosso chiaro distinto dal terracotta dell'accento.

### 4.6 Forma, spazio, type, elevation, motion (non cromatici, `:root`)
- Radius: `--r: 14px`, `--r-sm: 10px`, `--r-xs: 8px`, `--r-pill: 999px`.
- Spacing (scala 4px): `--space-1: 4px` … `--space-2: 8px`, `--space-3: 12px`, `--space-4: 16px`, `--space-5: 24px`, `--space-6: 32px`.
- Type famiglie: `--f-sans: 'Archivo Variable', system-ui, sans-serif`; `--f-mono: 'JetBrains Mono Variable', ui-monospace, monospace`.
- Type scala (rem): `--fs-display`, `--fs-h1`, `--fs-h2`, `--fs-h3`, `--fs-body`, `--fs-sm`, `--fs-xs`; pesi `--fw-regular: 400`, `--fw-medium: 500`, `--fw-semibold: 600`; line-height di lettura comodo per il corpo.
- Elevation: `--shadow-1`, `--shadow-2` (ombre morbide e calde, basse; cozy = soft, mai dure).
- Motion: `--dur-fast: 120ms`, `--dur: 200ms`, `--ease: cubic-bezier(0.2, 0, 0, 1)`.

> I valori cromatici e l'accento (sopra) sono gli anchor approvati dall'utente nel mockup. I valori esatti della **scala type (rem)** e delle **ombre** sono lasciati al piano d'implementazione (codice completo li, non vincoli di prodotto aperti): qui conta l'API dei token e la palette.

### 4.7 Mappa di migrazione (vecchio → nuovo)
`--ink`→`--bg`; `--panel`/`--panel-hi`→`--surface`; `--raise`→`--surface-2`; `--well`→`--well` (valore nuovo); `--text`/`--text-2`/`--text-3`→invariati di nome (valori nuovi); `--line`/`--line-2`→invariati di nome; `--brass`/`--brass-hi`/`--clay`/`--sage`/`--steel`→**rimossi**; `--accent`→invariato di nome (valore terracotta); `--accent-dim`→`--accent-soft`; `--ok`/`--bad`→invariati di nome (valori nuovi); `--f-display`/`--f-read`/`--f-ui`→**rimossi**, sostituiti da `--f-sans`; `--f-mono`→invariato; `--r`/`--r-sm`/`--r-xs`→invariati di nome (valori ritarati). Il piano enumera ogni riferimento e migra a batch.

## 5. Theming light/dark

- I token cromatici dark sono il default in `:root`; i token light sotto `[data-theme="light"]`; i dark espliciti sotto `[data-theme="dark"]`. Quando **non** c'e `[data-theme]`, `@media (prefers-color-scheme: light)` applica i light → **default = segue l'OS**. `color-scheme` impostato per i form nativi.
- **`useTheme` composable** (`composables/use-theme.ts`): stato `'system' | 'light' | 'dark'` persistito in `localStorage` (chiave `loomn-theme`); applica/rimuove `data-theme` su `document.documentElement` (per `'system'` rimuove l'attributo e lascia decidere il media query); espone lo stato corrente e un setter/ciclo. Renderer-only, nessun IPC.
- Inizializzazione nel bootstrap renderer (`renderer.ts`), prima del mount, per evitare flash di tema.

## 6. Tipografia

- **Un solo sans** (`--f-sans` = Archivo) per display, heading, UI, lettura/narrazione (a dimensione/line-height comodi). **Mono** (`--f-mono` = JetBrains Mono) per i valori tecnici (dadi, stat). **Serif rimossi** (Fraunces/Newsreader): si toglie anche il loro import/asset.
- La narrazione (oggi serif Newsreader) diventa sans a `--fs-body` con line-height di lettura.

## 7. De‑tematizzazione

- Rimuovere i token atelier‑palette (`--brass*`, `--clay`, `--sage`, `--steel`) e i blocchi `[data-phase]` che ridefiniscono `--accent`/`--accent-dim`.
- `App.vue`: l'attributo `[data-phase]` puo restare per altri scopi semantici, ma **non guida piu il colore** (l'accento e statico). Rimuovere la logica che lega l'accento alla fase.
- Mantenere il guard `no-color-drift.test.ts` (scandisce i `.vue` per hex hardcoded) — anzi e la rete che garantisce che la migrazione usi i token.

## 8. Testing & gate

- **Renderer-only, ABI jsdom. NESSUN gate Electron** (non tocca main/IPC; il self‑test del gate non riguarda il theming — verifica route/read-model). Allineato alla Fase 5 (renderer‑logica) che non eseguiva il gate.
- Test `composables/use-theme.test.ts` (jsdom): default segue OS quando nessuna preferenza; `set('light'|'dark')` applica `data-theme` su `documentElement` e persiste in localStorage; `set('system')` rimuove l'attributo; rilettura allo start ripristina la preferenza persistita.
- Guard `no-color-drift.test.ts` resta verde dopo la migrazione (nessun hex hardcoded nei `.vue`); estenderlo se necessario per coprire `.css` di componente.
- `pnpm -r typecheck` verde; `pnpm test` verde (il conteggio cambia solo per i test nuovi di `useTheme`).

## 9. Drift‑guard / disciplina

- Niente modifiche a `tsconfig*`/`vitest.config*`/`vitest.workspace.ts`/`electron.vite.config*`/`package.json` **a meno che** la rimozione dei font serif non richieda di togliere asset importati — in tal caso si tocca SOLO l'import dei font lato renderer (non la config di build). Il piano lo isola e lo dichiara.
- Migrazione a batch piccoli, ogni task chiude con `pnpm -r typecheck` + i test renderer verdi.
- `.claude/` mai committato.

## 10. Foresight (slice successive)

- **D‑02b — Libreria componenti**: ricostruire `LoomnButton`/`LoomnPanel`/`LoomnDialog`/`PanelError` + nuovi primitivi (Field, Card, Tag, Tabs) sui token, consolidando gli stili one‑off.
- **D‑02c — Shell & navigazione**: topbar/nav, posizionamento del toggle tema, transizioni, empty states.
- **D‑02d — Re‑skin superfici**: Gioco (dashboard raffinato), Diario, Scheda, Compagnia, Impostazioni, Onboarding.

## 11. Fuori ambito (esplicito)

Redesign visivo per‑componente e per‑superficie (D‑02b/D‑02d), navigazione/shell (D‑02c), qualsiasi cambiamento a logica/engine/AI/host/shared/main/IPC, tinta per‑campagna (decisa contro: chrome statico), scelta di un sans diverso da Archivo (resta un token sostituibile).
