# FASE 7 — Operatività, gate & CI (M‑11 + D‑06 + estensione self-test del path reload) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere il gate Electron a 2 fasi riproducibile e ripetibile con uno script (`pnpm gate:selftest`), aggregare la verifica (`pnpm verify`), automatizzare il kill delle sessioni Electron fantasma che tengono il lock su `better_sqlite3.node`, documentare l'hazard ABI, e chiudere la lacuna che fece sfuggire I‑02 al gate estendendo il self-test al path **reload in-finestra** (Ctrl+R) — l'ULTIMA fase della campagna di remediation (28/28 finding a causa radice).

**Architecture:** F7 è **ops/config**, non logica di prodotto. Gli script di gate sono orchestratori **Node `.mjs`** in `scripts/` (Node è già la toolchain del monorepo → cross-shell robusto, niente fragile concatenazione `&&` cross-shell, gestione nativa di temp-dir/env/exit-code che una one-liner di `package.json` non regge). Riusano i comandi già documentati (`pnpm rebuild:electron`/`pnpm rebuild:node`, la sequenza a 2 lanci con `LOOMN_SELFTEST`/`LOOMN_USERDATA`, il pattern kill-ghost `Get-CimInstance`) come **single-source** invocandoli, non re-implementandoli. L'estensione del self-test vive interamente nella **fase 2** (riavvio: già read-only e idempotente) come reload one-shot guidato da `sessionStorage` → ogni asserzione di persistenza della fase 2 diventa post-reload, **senza** introdurre la complessità non-idempotente di un reload in fase 1.

**Tech Stack:** Node ESM (`.mjs`), `node:child_process`/`node:fs`/`node:os`, PowerShell (`Get-CimInstance`/`Stop-Process`) per il kill-ghost su Windows, pnpm scripts, GitHub Actions (CI opzionale verify-only), Electron self-test in `renderer.ts` (vue-tsc, DOM `sessionStorage`/`location.reload`).

---

## Contesto invariante (leggi prima di iniziare)

- **Baseline:** HEAD `e6ce91b` su `main` (ultimo commit di **codice** = `75169bb`, fix dadi 3D resize, post-F6; gli HEAD successivi sono doc). `pnpm test` = **777 verdi** (565 packages + 212 renderer, 90 file), `pnpm -r typecheck` pulito (6 progetti), ABI **Node**, tree pulito (solo `.claude/` untracked — **MAI** committarlo).
- **F1–F6 fatte e mergiate** (motore `582fb7a`, memoria/host `fe14646`, AI `a413ab8`, IPC/main `cce7432`, renderer-logica `79ffcff`, renderer-UI `d6ba863`). F7 è l'ultima fase: dopo, la remediation è **completa (28/28)**.
- **F7 chiude:** **M‑11** (gate senza script/CI), **D‑06** (hazard ABI / DX del gate), e la **lacuna di copertura del reload** che fece sfuggire I‑02 al gate (il gate copre il riavvio-processo, non il reload-in-finestra).

### Disciplina di scope (CRITICO — vale per OGNI task)

F7 è **L'UNICA** fase autorizzata a toccare la config, e SOLO `package.json` (sezione `scripts`). Ogni task tocca SOLO i file elencati. Verifica `git status --short` prima di ogni commit.

- ✅ **Consentito:** `package.json` (root — sezione `scripts`); nuovi file ops in `scripts/*.mjs`; `app/desktop/src/renderer/src/renderer.ts` (SOLO il self-test, e SOLO per il check reload); `.github/workflows/*.yml`; `README.md` (root, nuovo).
- ❌ **VIETATO (fuori scope, NON toccare):** `tsconfig*.json`, `vitest.config.*`, `vitest.workspace.ts`, `electron.vite.config.*`, `app/desktop/package.json` (non serve — vedi Task 1 nota), qualsiasi file in `packages/{engine,ai,memory,host,shared}`, qualsiasi file in `app/desktop/src/{main,preload}` e in `app/desktop/src/renderer/src/{views,components,stores,composables,lib,styles,router,...}` tranne `renderer.ts`. La remediation di questi layer è **chiusa** in F1–F6.
- ❌ **MAI** creare un `tsconfig.json` di root o aggiungere `composite`/project references (incidente storico Piano 2).

### Vincolo debt-free (lezione F1–F6)

Mai restringere uno schema di **lettura**. F7 non tocca schemi: è ops puro. L'unico cambio di logica (il check reload in `renderer.ts`) è **read-only** → la versione persistita attesa **resta 8** (il reload non emette dispatch). Motivazione in Task 4.

### Nota sui conteggi test

F7 **non aggiunge test vitest**: `renderer.ts` è il bootstrap del renderer, caricato solo da `index.html`, **mai importato da un test** (verificato: grep `renderer.ts`/`runSelfTest` → solo `index.html` + il file stesso). Gli script `.mjs` non sono coperti da vitest (spawnano processi). Quindi **`pnpm test` resta 777 in ogni task**. La "verifica TDD" di F7 è l'esecuzione osservabile degli script (`pnpm verify`, `pnpm gate:selftest` → `VERDICT: PASS`), non nuovi `it()`. Questa è la forma corretta per una fase ops (vedi piano-campagna §F7 "Verifica F7").

### Bug apostrofo (vale anche per le label `check(...)` del self-test)

Le stringhe in apici singoli **non** devono contenere apostrofi (`l'`, `un'`, `dell'`, `c'è`) — spezzano la stringa JS. Riguarda `it()`/`describe()` MA anche le label di `check(cond, '...')` nel self-test. Scrivi senza apostrofo (`l app`, `c e`); `è/é` (lettere) vanno bene. Grep di verifica del piano: `(it|describe)\('[^']*'[A-Za-zàèéìòù]` → **no match** (F7 non ha `it()/describe()`); inoltre verifica a mano che le nuove label `check(...)` e i nuovi commenti in `renderer.ts` siano apostrofo-free (il file segue già questa convenzione anche nei commenti).

### Fuori ambito (esplicito)

- D‑01 (incipit), D‑02 (redesign UI), D‑03 (multi-campagna): iniziative **design-first DOPO** la remediation (`superpowers:brainstorming`).
- Inventario & Equipaggiamento, movimento/topologia di zona: feature **deferite design-first DOPO**.
- Flag residui (NON F7, solo annotati): `rulesetResultSchema.defaultResources` `z.number()` nudo (shared); journal store sovrascrive il 1° errore se entrambi i canali read falliscono (store); `provider-status.error` non surfacciato; factory `nextRound` usata solo dal suo test (lib). Se emergono ALTRI flag durante F7: **annotali, non implementarli**.

---

## File Structure

| File | Responsabilità | Task |
| --- | --- | --- |
| `package.json` (root) | Aggiunge `verify`, `gate:kill-ghost`, `gate:selftest` agli scripts; `test`/`typecheck`/`rebuild:electron`/`rebuild:node` invariati (riusati come single-source dagli script) | 1, 2, 3 |
| `README.md` (root, nuovo) | Documenta i comandi dev/ops e **l'hazard ABI** (Node vs Electron, `rebuild:node` dopo il gate, sintomo `NODE_MODULE_VERSION`) | 1 (+ CI in 5) |
| `scripts/kill-ghost.mjs` (nuovo) | Rileva/uccide i processi **electron.exe** fantasma di Loomn che tengono il lock su `better_sqlite3.node`; export `killGhosts()` + esecuzione diretta | 2 |
| `scripts/gate-selftest.mjs` (nuovo) | Orchestratore del gate 2 fasi: kill-ghost → build → rebuild:electron → 2 lanci self-test su userData temp → rebuild:node (in `finally`) → exit 0/1 | 3 |
| `app/desktop/src/renderer/src/renderer.ts` (modifica) | Estende il self-test fase 2 col path **reload** (one-shot via `sessionStorage`) per coprire il self-healing read-side di I‑02 | 4 |
| `.github/workflows/verify.yml` (nuovo, opzionale) | CI: `pnpm verify` (typecheck + test su ABI Node); il gate Electron resta **local-only** (documentato) | 5 |

**Nota `app/desktop/package.json`:** la campagna elenca "root + @loomn/desktop" come scope consentito, ma F7 **non** ha bisogno di nuovi script in `app/desktop/package.json`: il gate usa `pnpm --filter @loomn/desktop build` e `pnpm --filter @loomn/desktop exec electron .` (script `build` esistente + `exec`), e l'orchestrazione (build+rebuild+temp+2 lanci) è inerentemente root-level. YAGNI → `app/desktop/package.json` resta **invariato** (meno superficie, debt-free).

---

## Task 1: Script `verify` aggregato + README con l'hazard ABI

**Files:**
- Modify: `package.json` (root) — sezione `scripts`
- Create: `README.md` (root)

Chiude la metà "verify aggregato + documentazione" di M‑11/D‑06. `verify` è la rete anti-regressione portabile (typecheck + test su ABI Node); il README dà una casa all'hazard ABI e ai comandi del gate (gli script `gate:*` arrivano in Task 2/3 — il README descrive lo **stato finale** delle ops, è documentazione del target).

- [ ] **Step 1: Aggiungi lo script `verify` al `package.json` di root**

Sostituisci l'oggetto `scripts` corrente:

```json
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "pnpm -r typecheck",
    "rebuild:electron": "pnpm --filter @loomn/desktop exec electron-rebuild -f -w better-sqlite3",
    "rebuild:node": "pnpm -r rebuild better-sqlite3"
  },
```

con (aggiunge SOLO `verify`; gli altri restano identici, ordine preservato):

```json
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "pnpm -r typecheck",
    "verify": "pnpm -r typecheck && pnpm test",
    "rebuild:electron": "pnpm --filter @loomn/desktop exec electron-rebuild -f -w better-sqlite3",
    "rebuild:node": "pnpm -r rebuild better-sqlite3"
  },
```

- [ ] **Step 2: Crea il `README.md` di root**

Crea `README.md` (root) con questo contenuto esatto:

````markdown
# Loomn

Simulatore di campagne di ruolo con un **Master AI**. Monorepo pnpm (Electron + Vue 3).
Principio architetturale: **"il codice è l'arbitro, l'AI è il narratore"** — il motore (`packages/engine`) è puro e deterministico (RNG iniettato, funzioni `(stato) → nuovo stato`); l'AI propone, il motore decide.

## Struttura

- `packages/engine` — motore di gioco puro (Command/Event, FSM di fase, dadi).
- `packages/shared` — contratti Zod condivisi (IPC, schemi di dominio).
- `packages/memory` — persistenza event-sourced (SQLite/Drizzle), canon ledger, reflection/L2.
- `packages/ai` — provider LLM, tool-calling, pipeline del Master.
- `packages/host` — wiring memoria+AI (`createCampaignService`, `createMemorySystem`).
- `app/desktop` — shell Electron + UI Vue (renderer dietro IPC tipizzato).

## Prerequisiti

Node v24.x, pnpm 9.12.x (su PATH). `pnpm install` alla prima checkout.

## Comandi

| Comando | Cosa fa |
| --- | --- |
| `pnpm test` | Tutta la suite Vitest (engine/shared/memory/ai/host + renderer), **ABI Node**. |
| `pnpm typecheck` | `tsc --noEmit` sui packages + `vue-tsc --noEmit` su `app/desktop`. |
| `pnpm verify` | `typecheck` + `test` aggregati (rete anti-regressione; è ciò che gira in CI). |
| `pnpm gate:selftest` | Gate d'integrazione Electron a 2 fasi (IPC/DB/safeStorage reali). **Local-only.** Vedi sotto. |
| `pnpm gate:kill-ghost` | Termina i processi Electron fantasma di Loomn che tengono il lock su `better_sqlite3.node`. |
| `pnpm --filter @loomn/desktop dev` | Avvia l'app in sviluppo (richiede ABI Electron — vedi sotto). |

## ⚠️ Hazard ABI nativa (Node ↔ Electron)

`better-sqlite3` è un modulo **nativo**: il binario `better_sqlite3.node` è compilato per **una** ABI alla volta.

- **I test (`pnpm test`/`pnpm verify`) girano sotto Node** → richiedono l'**ABI Node**.
- **L'app e il gate Electron girano sotto Electron** → richiedono l'**ABI Electron**.

Due script di root fanno il flip:

- `pnpm rebuild:electron` → ricompila `better-sqlite3` per l'ABI Electron (serve per `dev`/gate).
- `pnpm rebuild:node` → ripristina l'ABI Node (serve per i test).

**Sintomo del mismatch:** `pnpm test` fallisce con `Error: ... was compiled against a different Node.js version using NODE_MODULE_VERSION 146 ... requires 137` (146 = Electron, 137 = Node). **Rimedio:** `pnpm rebuild:node`.

`pnpm gate:selftest` fa il flip e lo **ripristina automaticamente** (`rebuild:node` in `finally`); se viene interrotto a metà, esegui `pnpm rebuild:node` a mano prima dei test.

### Processi fantasma e il lock

La causa #1 di `rebuild:electron`/`rebuild:node` falliti (`EBUSY`/`EPERM` su `better_sqlite3.node`) è una sessione Electron **fantasma** di Loomn (es. un `electron-vite dev` di una sessione precedente) che tiene il lock sul `.node`. `pnpm gate:kill-ghost` (eseguito automaticamente da `gate:selftest`) termina **solo** i processi `electron.exe` di Loomn (matcha `electron.exe` con il path del progetto nella command line) — **non** tocca VS Code (`Code.exe`), Claude, Slack né altri Electron, né il processo `node` del gate.

## Il gate `gate:selftest`

`pnpm gate:selftest` automatizza il gate d'integrazione: kill-ghost → build di produzione → `rebuild:electron` → due lanci sequenziali del self-test (`LOOMN_SELFTEST=1` costruisce lo stato, `LOOMN_SELFTEST=2` verifica la persistenza dopo riavvio **e reload in-finestra**) su uno `userData` temporaneo → `rebuild:node` (sempre). Esce **0** solo se entrambe le fasi loggano `VERDICT: PASS`.

**Perché local-only (non in CI):** il gate flippa l'ABI nativa e lancia Electron headless con accesso a `safeStorage`/filesystem — fragile e non portabile sui runner CI. La CI gira `pnpm verify` (typecheck + test su ABI Node), che copre il grosso delle regressioni; l'integrazione Electron si verifica in locale col gate.
````

- [ ] **Step 3: Verifica `verify` (typecheck + test, ABI Node)**

Run: `pnpm verify`
Expected: `pnpm -r typecheck` Done su 6 progetti, poi Vitest `Test Files 90 passed (90)` / `Tests 777 passed (777)`. Exit 0.

> Se fallisce con `NODE_MODULE_VERSION 146 ... requires 137`: l'ABI è su Electron → `pnpm rebuild:node`, poi ri-esegui `pnpm verify`.

- [ ] **Step 4: Verifica nessun file fuori scope toccato**

Run: `git status --short`
Expected: solo `package.json` (modificato), `README.md` (nuovo), `?? .claude/` (untracked, NON committare). Nessun `tsconfig`/`vitest.config`/altro.

- [ ] **Step 5: Commit**

```bash
git add package.json README.md
git commit -m "chore(ops): aggiungi pnpm verify aggregato + README con hazard ABI [F7/M-11/D-06]"
```

---

## Task 2: Script `kill-ghost` (rileva/uccide gli Electron fantasma)

**Files:**
- Create: `scripts/kill-ghost.mjs`
- Modify: `package.json` (root) — `scripts`

Chiude la metà "kill-ghost" di D‑06/M‑11: la causa #1 di rebuild falliti. È un modulo riusabile (`export killGhosts()`) — Task 3 lo importerà come single-source.

- [ ] **Step 1: Crea `scripts/kill-ghost.mjs`**

```js
#!/usr/bin/env node
// F7 / M-11 + D-06: rileva e termina le sessioni Electron FANTASMA di Loomn (un `electron-vite dev` o
// `electron .` rimasto appeso da una sessione precedente) che tengono il lock su `better_sqlite3.node`
// e fanno fallire `rebuild:electron`/`rebuild:node` con EBUSY/EPERM (causa #1 di gate falliti).
//
// Sicurezza del targeting (decisione consapevole, vedi piano F7):
//   - Matcha SOLO `electron.exe` (il binario di node_modules usato da dev/app/gate). NON matcha `node`
//     (a differenza del pattern documentato `electron|node`): il processo del gate E `pnpm` SONO node →
//     matchare `node` si auto-ucciderebbe. E i lock-holder dell ABI Electron sono SEMPRE electron.exe
//     (e il processo che ha caricato il .node sotto Electron), mai un node nudo.
//   - Filtra per command line contenente il path del progetto (`tabl`/`loomn`) → scoping al solo Loomn.
//   - Esclude comunque il PID corrente per sicurezza.
//   - `electron.exe` (node_modules) NON e `Code.exe`/`Claude.exe`/`slack.exe` → VS Code/Claude/Slack
//     restano intatti anche se hanno la cartella `tabl` aperta.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Termina gli Electron fantasma di Loomn. No-op fuori da Windows. Best-effort: non lancia mai. */
export function killGhosts() {
  if (process.platform !== 'win32') {
    console.log('[kill-ghost] non-Windows: nessun ghost da gestire, skip.');
    return;
  }
  const ps = [
    `$me = ${process.pid}`,
    `Get-CimInstance Win32_Process |`,
    `  Where-Object { $_.ProcessId -ne $me -and $_.Name -match 'electron' -and $_.CommandLine -match 'tabl|loomn' } |`,
    `  ForEach-Object {`,
    `    Write-Output ('[kill-ghost] termino {0} (pid {1})' -f $_.Name, $_.ProcessId)`,
    `    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop }`,
    `    catch { Write-Output ('[kill-ghost] impossibile terminare pid {0}: {1}' -f $_.ProcessId, $_.Exception.Message) }`,
    `  }`,
  ].join('\n');
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'inherit' });
  if (r.error !== undefined) {
    console.log(`[kill-ghost] PowerShell non avviabile (${r.error.message}): continuo comunque.`);
  }
  console.log('[kill-ghost] completato.');
}

// Esecuzione diretta (`pnpm gate:kill-ghost`): pathToFileURL gestisce i path Windows (backslash/drive).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  killGhosts();
}
```

- [ ] **Step 2: Aggiungi `gate:kill-ghost` al `package.json` di root**

Aggiungi la riga `gate:kill-ghost` dopo `verify` (gli altri script invariati):

```json
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "pnpm -r typecheck",
    "verify": "pnpm -r typecheck && pnpm test",
    "gate:kill-ghost": "node scripts/kill-ghost.mjs",
    "rebuild:electron": "pnpm --filter @loomn/desktop exec electron-rebuild -f -w better-sqlite3",
    "rebuild:node": "pnpm -r rebuild better-sqlite3"
  },
```

- [ ] **Step 3: Verifica che lo script giri ed escluda se stesso (non si auto-uccide)**

Run: `pnpm gate:kill-ghost`
Expected (macchina senza ghost): stampa `[kill-ghost] completato.` ed esce 0. **Il comando NON deve terminare se stesso** (è un processo `node`, non matchato da `electron`) né alcun Electron non-Loomn. Se ci sono ghost Loomn, li elenca (`termino electron.exe (pid ...)`) e li termina, poi `completato.`.

- [ ] **Step 4: Verifica scope e commit**

Run: `git status --short`
Expected: `package.json` (modificato), `scripts/kill-ghost.mjs` (nuovo), `?? .claude/`. Nient'altro.

```bash
git add package.json scripts/kill-ghost.mjs
git commit -m "chore(ops): script gate:kill-ghost per gli Electron fantasma sul lock sqlite [F7/D-06]"
```

---

## Task 3: Orchestratore `gate:selftest` (gate Electron 2 fasi automatizzato)

**Files:**
- Create: `scripts/gate-selftest.mjs`
- Modify: `package.json` (root) — `scripts`

Chiude il cuore di M‑11: automatizza la sequenza manuale documentata (HANDOFF §6/§9) come single-source. **Verifica più pesante del piano** — esegue il vero gate Electron.

- [ ] **Step 1: Crea `scripts/gate-selftest.mjs`**

```js
#!/usr/bin/env node
// F7 / M-11 + D-06: automazione del gate Electron a 2 fasi (l unica copertura dell integrazione reale
// IPC/DB/safeStorage). Riproduce la sequenza manuale documentata (HANDOFF §6/§9) come SINGLE-SOURCE,
// invocando gli script gia esistenti invece di re-implementarli:
//   kill-ghost -> build -> rebuild:electron -> 2 lanci self-test (LOOMN_SELFTEST 1 e 2 sullo STESSO
//   userData temp) -> rebuild:node (SEMPRE, in finally: ripristina l ABI Node per `pnpm test`).
// Esce 0 SOLO se entrambe le fasi loggano `VERDICT: PASS` (il main Electron esce 0/1 sul VERDICT;
// spawnSync ne cattura lo status). Il temp userData isola il gate dal DB di sviluppo.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { killGhosts } from './kill-ghost.mjs';

/** Esegue un comando via shell (cross-platform per le pnpm script), stdio ereditato. Ritorna l exit code. */
function sh(label, cmd, extraEnv) {
  console.log(`\n[gate] ${label}: ${cmd}`);
  const r = spawnSync(cmd, {
    stdio: 'inherit',
    shell: true,
    env: extraEnv === undefined ? process.env : { ...process.env, ...extraEnv },
  });
  return r.status ?? 1;
}

// 1) Libera il lock su better_sqlite3.node da eventuali ghost PRIMA del rebuild (causa #1 di fallimenti).
killGhosts();

// 2) Build di produzione (out/main + out/renderer): il gate lancia `electron .` sul build, non sul dev.
if (sh('build', 'pnpm --filter @loomn/desktop build') !== 0) {
  console.log('\n[gate] RISULTATO: FAIL (build fallita)');
  process.exit(1);
}

// 3) Flip ABI -> Electron (better-sqlite3 ricompilato per l ABI di Electron).
if (sh('rebuild:electron', 'pnpm rebuild:electron') !== 0) {
  console.log('\n[gate] RISULTATO: FAIL (rebuild:electron fallito — un ghost tiene il lock? `pnpm gate:kill-ghost`)');
  process.exit(1);
}

const userData = mkdtempSync(join(tmpdir(), 'loomn-gate-'));
let phase1 = 1;
let phase2 = 1;
try {
  // 4) Due lanci sequenziali sullo STESSO userData temp: fase 1 costruisce lo stato, fase 2 verifica la
  //    persistenza dopo il riavvio + il reload in-finestra (I-02). Il main esce 0/1 sul VERDICT loggato.
  phase1 = sh('self-test fase 1', 'pnpm --filter @loomn/desktop exec electron .', {
    LOOMN_SELFTEST: '1',
    LOOMN_USERDATA: userData,
  });
  phase2 = sh('self-test fase 2', 'pnpm --filter @loomn/desktop exec electron .', {
    LOOMN_SELFTEST: '2',
    LOOMN_USERDATA: userData,
  });
} finally {
  // 5) Ripristina SEMPRE l ABI Node (altrimenti `pnpm test` fallisce con NODE_MODULE_VERSION 146/137).
  if (sh('rebuild:node', 'pnpm rebuild:node') !== 0) {
    console.log('\n[gate] ATTENZIONE: rebuild:node FALLITO. L ABI nativa e rimasta su Electron — esegui `pnpm rebuild:node` a mano prima di `pnpm test`.');
  }
  try {
    rmSync(userData, { recursive: true, force: true });
  } catch {
    // best-effort: un temp userData residuo non e fatale.
  }
}

const ok = phase1 === 0 && phase2 === 0;
console.log(`\n[gate] RISULTATO: ${ok ? 'PASS' : 'FAIL'} (fase1=${phase1 === 0 ? 'PASS' : 'FAIL'}, fase2=${phase2 === 0 ? 'PASS' : 'FAIL'})`);
process.exit(ok ? 0 : 1);
```

- [ ] **Step 2: Aggiungi `gate:selftest` al `package.json` di root**

```json
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "pnpm -r typecheck",
    "verify": "pnpm -r typecheck && pnpm test",
    "gate:kill-ghost": "node scripts/kill-ghost.mjs",
    "gate:selftest": "node scripts/gate-selftest.mjs",
    "rebuild:electron": "pnpm --filter @loomn/desktop exec electron-rebuild -f -w better-sqlite3",
    "rebuild:node": "pnpm -r rebuild better-sqlite3"
  },
```

- [ ] **Step 3: Esegui il gate (verifica pesante — il vero gate Electron 2 fasi automatizzato)**

Run: `pnpm gate:selftest`
Expected:
- `[gate] kill-ghost`, `[gate] build` (electron-vite build OK), `[gate] rebuild:electron` (Done).
- `[gate] self-test fase 1` → riga `[MAIN] VERDICT: PASS fase=1 [...]`, lo script electron esce 0.
- `[gate] self-test fase 2` → riga `[MAIN] VERDICT: PASS fase=2 [...]`, esce 0.
- `[gate] rebuild:node` (Done).
- Riga finale `[gate] RISULTATO: PASS (fase1=PASS, fase2=PASS)`, exit 0.

> Questo è il gate sull'**attuale** self-test (versione 8, senza il check reload). Task 4 estende il self-test e ri-esegue il gate per confermare che resti PASS.
>
> Se `rebuild:electron`/`rebuild:node` falliscono con EBUSY/EPERM: un ghost tiene il lock → `pnpm gate:kill-ghost`, poi ri-esegui. Se il gate viene interrotto: `pnpm rebuild:node` a mano.

- [ ] **Step 4: Verifica che l'ABI sia tornata Node (i test girano)**

Run: `pnpm test`
Expected: `Tests 777 passed (777)` — l'ABI è stata ripristinata a Node dal `finally` del gate. (Se fallisce `NODE_MODULE_VERSION`: `pnpm rebuild:node`.)

- [ ] **Step 5: Verifica scope e commit**

Run: `git status --short`
Expected: `package.json` (modificato), `scripts/gate-selftest.mjs` (nuovo), `?? .claude/`. Nient'altro (NB: il temp userData è in `os.tmpdir()`, fuori dal repo, e viene rimosso dal gate).

```bash
git add package.json scripts/gate-selftest.mjs
git commit -m "feat(ops): script gate:selftest — gate Electron 2 fasi automatizzato single-source [F7/M-11]"
```

---

## Task 4: Estendi il self-test al path RELOAD (chiude la lacuna di I‑02 al gate)

**Files:**
- Modify: `app/desktop/src/renderer/src/renderer.ts` — SOLO la funzione `runSelfTest` (ramo fase 2)

Chiude la lacuna che fece sfuggire I‑02 al gate: il gate copre il **riavvio-processo** (finestra nuova → primo push regolare), mai il **reload-in-finestra** (Ctrl+R → `did-finish-load` rifira). La fase 2 è già read-only e idempotente → forzando un reload **one-shot** all'ingresso, ogni asserzione di persistenza della fase 2 diventa post-reload, e aggiungiamo un'asserzione esplicita che lo store si ri-popola **senza dispatch** (self-healing read-side: pull-on-mount + `.on did-finish-load` di F4).

**Perché la versione resta 8:** il reload non emette alcun dispatch (è read-only) → nessun nuovo evento → la versione persistita resta **8**. La fase 2 già si aspetta 8; il reload-first non la cambia. (Per contro, NON mettiamo il reload in fase 1: lì la sequenza è non-idempotente — `AddActor goblin`, `StartEncounter`, ecc. — e un reload ri-eseguirebbe i dispatch o fallirebbe su id duplicato. Il meccanismo di I‑02 — pull-on-mount + `.on` push — è identico che lo stato venga costruito-in-sessione o caricato-da-disco, quindi la fase 2 lo esercita pienamente con complessità minima.)

- [ ] **Step 1: Aggiungi la costante del flag reload in `runSelfTest`**

In `app/desktop/src/renderer/src/renderer.ts`, dentro `runSelfTest`, subito dopo `const lines: string[] = [];` (riga 42):

Vecchio:
```ts
  const lines: string[] = [];
  const check = (cond: boolean, label: string): void => {
```

Nuovo:
```ts
  const lines: string[] = [];
  // I-02 (copertura reload): chiave sessionStorage che sopravvive a un location.reload() ma non a un
  // riavvio-processo -> ci permette di forzare UN solo reload in fase 2 senza loop infinito.
  const RELOAD_FLAG = 'loomn-selftest-reloaded';
  const check = (cond: boolean, label: string): void => {
```

- [ ] **Step 2: Sostituisci il ramo `else` (fase 2) col reload one-shot**

Sostituisci l'intero blocco `} else { ... }` (righe 198–219, dal `} else {` fino alla `}` che chiude il ramo, esclusa la `}` di chiusura del `try` successivo):

Vecchio:
```ts
    } else {
      const s0 = await window.loomn.getStatus();
      check(s0.ok && s0.version === 8, 'versione 8 PERSISTITA dopo il riavvio (durabilita: incluso lo slice combat 10c + RoundAdvanced di I-01)');
      check(s0.ok && s0.providerConfigured, 'provider ricostruito da settings.json (chiave decifrata)');
      check(s0.ok && s0.provider?.hasApiKey === true, 'read-back provider con chiave persistito dopo riavvio');

      const push = await Promise.race([
        firstPush,
        new Promise<ReadModelPush>((_resolve, reject) =>
          setTimeout(() => reject(new Error('nessun read-model push')), 5000),
        ),
      ]);
      check(push.state.actors['goblin']?.name === 'Goblin', 'attore goblin sopravvissuto al riavvio');
      check(readModel.actors.some((a) => a.id === 'goblin'), 'store Pinia riflette lo stato persistito');

      // I-02: dopo il riavvio il pull ri-idrata lo stato persistito senza dipendere dal push.
      const rmPull = await window.loomn.getReadModel();
      check(
        rmPull.version === 8 && rmPull.state.actors['goblin']?.name === 'Goblin',
        'get-read-model pull ri-idrata dopo il riavvio (canale I-02)',
      );
    }
```

Nuovo:
```ts
    } else {
      // I-02 (copertura del path RELOAD): la fase 2 (riavvio) e read-only e idempotente. Forziamo UN
      // solo location.reload() (equivalente a Ctrl+R) PRIMA delle verifiche, cosi OGNI asserzione di
      // persistenza qui sotto vale dopo un reload in-finestra. Chiude la lacuna che fece sfuggire I-02
      // al gate: il gate copriva solo il riavvio-processo (finestra nuova -> primo push regolare), MAI
      // il reload-in-finestra (did-finish-load rifira). Il reload non dispatcha -> la versione resta 8.
      if (sessionStorage.getItem(RELOAD_FLAG) !== '1') {
        sessionStorage.setItem(RELOAD_FLAG, '1');
        location.reload();
        return; // niente VERDICT sul passaggio pre-reload: lo logghera il passaggio post-reload.
      }
      sessionStorage.removeItem(RELOAD_FLAG);

      const s0 = await window.loomn.getStatus();
      check(s0.ok && s0.version === 8, 'versione 8 PERSISTITA dopo riavvio + reload (durabilita: slice combat 10c + RoundAdvanced di I-01)');
      check(s0.ok && s0.providerConfigured, 'provider ricostruito da settings.json (chiave decifrata)');
      check(s0.ok && s0.provider?.hasApiKey === true, 'read-back provider con chiave persistito dopo riavvio');

      const push = await Promise.race([
        firstPush,
        new Promise<ReadModelPush>((_resolve, reject) =>
          setTimeout(() => reject(new Error('nessun read-model push')), 5000),
        ),
      ]);
      check(push.state.actors['goblin']?.name === 'Goblin', 'attore goblin sopravvissuto al riavvio');
      check(readModel.actors.some((a) => a.id === 'goblin'), 'store Pinia riflette lo stato persistito');

      // I-02: dopo il riavvio il pull ri-idrata lo stato persistito senza dipendere dal push.
      const rmPull = await window.loomn.getReadModel();
      check(
        rmPull.version === 8 && rmPull.state.actors['goblin']?.name === 'Goblin',
        'get-read-model pull ri-idrata dopo il riavvio (canale I-02)',
      );

      // I-02 (reload): in QUESTO passaggio post-reload NON e stato emesso alcun dispatch, eppure lo store
      // e a versione 8 col goblin -> dimostra il self-healing read-side dopo un Ctrl+R (pull-on-mount +
      // .on did-finish-load di F4). E esattamente la copertura che mancava al gate quando I-02 sfuggi.
      check(
        readModel.version === 8 && readModel.actors.some((a) => a.id === 'goblin'),
        'dopo il reload lo store si ri-popola SENZA dispatch (I-02 pull-on-mount + .on did-finish-load)',
      );
    }
```

- [ ] **Step 3: Verifica apostrofi e typecheck**

- Controlla a mano che le nuove label `check(...)` e i nuovi commenti siano **apostrofo-free** (nessun `l'`/`un'`/`dell'`/`c'è` in apici singoli o commenti): le label sono "versione 8 PERSISTITA dopo riavvio + reload ...", "dopo il reload lo store si ri-popola SENZA dispatch ...". OK.

Run: `pnpm -C app/desktop typecheck`
Expected: `vue-tsc --noEmit` Done, 0 errori. (`sessionStorage`/`location.reload` sono nella lib DOM; `RELOAD_FLAG` è una `const string`.)

- [ ] **Step 4: Verifica che la suite resti 777 (renderer.ts non è unit-testato)**

Run: `pnpm test`
Expected: `Tests 777 passed (777)` — invariato (`renderer.ts` non è importato da alcun test).

- [ ] **Step 5: Ri-esegui il gate — deve restare PASS, ora esercitando il reload**

Run: `pnpm gate:selftest`
Expected: `[gate] RISULTATO: PASS (fase1=PASS, fase2=PASS)`, exit 0. La fase 2 ora:
1. al primo load setta `loomn-selftest-reloaded` e fa `location.reload()` (nessun VERDICT);
2. al re-load rimuove il flag, esegue tutte le verifiche di persistenza **post-reload** + l'asserzione `dopo il reload lo store si ri-popola SENZA dispatch ...`, e logga il singolo `VERDICT: PASS fase=2`.

La versione resta **8** (il reload è read-only). Se il check reload fallisse (regressione di I‑02), la fase 2 darebbe `VERDICT: FAIL` → il gate esce 1 → **la lacuna è chiusa**.

> Dopo il gate l'ABI è Node (ripristinata dal `finally`). Se servono altri test: `pnpm test`.

- [ ] **Step 6: Verifica scope e commit**

Run: `git status --short`
Expected: SOLO `app/desktop/src/renderer/src/renderer.ts` (modificato), `?? .claude/`. Nient'altro.

```bash
git add app/desktop/src/renderer/src/renderer.ts
git commit -m "test(gate): self-test copre il path reload in-finestra (Ctrl+R) per I-02 [F7]"
```

---

## Task 5 (opzionale): CI verify-only + nota local-only del gate

**Files:**
- Create: `.github/workflows/verify.yml`

Risponde alla parte "CI opzionale" di M‑11: la CI gira `pnpm verify` (typecheck + test su ABI Node, portabile); il gate Electron resta **local-only** (flip ABI + Electron headless non affidabili in CI), già documentato nel README (Task 1). Il comando CI (`pnpm verify`) è **identico** a quello validato in locale → l'unico ignoto è l'ambiente runner (basso rischio per un monorepo pnpm standard). Task isolato: facile da rimuovere se indesiderato.

- [ ] **Step 1: Crea `.github/workflows/verify.yml`**

```yaml
name: verify
on:
  push:
    branches: [main]
  pull_request:
jobs:
  verify:
    # ABI Node, portabile. Il gate d integrazione Electron (pnpm gate:selftest) NON gira in CI:
    # flippa l ABI nativa e lancia Electron headless con safeStorage/filesystem -> local-only.
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.12.0
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm verify
```

- [ ] **Step 2: Valida localmente il comando CI**

La CI non è eseguibile da qui; valida che il comando che gira (`pnpm verify`) sia verde in locale (mirror esatto del job).

Run: `pnpm verify`
Expected: typecheck Done (6 progetti) + `Tests 777 passed (777)`, exit 0.

- [ ] **Step 3: Sanity YAML**

Rileggi `.github/workflows/verify.yml`: indentazione a 2 spazi coerente, chiavi `on`/`jobs`/`steps` corrette, nessun tab. (Se disponibile `python`, opzionale: `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/verify.yml')); print('yaml ok')"`.)

- [ ] **Step 4: Verifica scope e commit**

Run: `git status --short`
Expected: `.github/workflows/verify.yml` (nuovo), `?? .claude/`. Nient'altro.

```bash
git add .github/workflows/verify.yml
git commit -m "ci: verify (typecheck + test, ABI Node) su push/PR; gate Electron local-only [F7/M-11]"
```

---

## Self-Review

**1. Copertura spec (piano-campagna §F7 + audit M‑11/D‑06 + lacuna reload I‑02):**

| Requisito F7 | Task | Note |
| --- | --- | --- |
| Script `gate:selftest` (2 lanci + userData temp + rebuild:electron→rebuild:node) | Task 3 | Orchestratore Node; temp via `mkdtempSync`; `rebuild:node` in `finally` |
| Script `verify` aggregato (`pnpm -r typecheck && pnpm test`) | Task 1 | |
| Script kill-ghost (rileva/uccide le sessioni dev fantasma sul lock) PRIMA del rebuild | Task 2 + Task 3 | `gate:kill-ghost` standalone + chiamato da `gate:selftest` |
| Documentare il flip ABI (package.json/README) | Task 1 | Sezione "Hazard ABI" nel README |
| CI opzionale (valutare fattibilità; documentare se local-only) | Task 5 | `verify`-only in CI; gate local-only documentato |
| Estensione self-test del path reload (chiude la lacuna I‑02) | Task 4 | Reload one-shot in fase 2; versione resta 8 |

Tutti i requisiti hanno un task. ✅

**2. Scansione placeholder:** nessun "TBD"/"come sopra"/"gestisci gli edge case". Ogni step ha codice/comando completo + output atteso. ✅

**3. Coerenza dei tipi/nomi:**
- `killGhosts()` esportato in Task 2, importato come `{ killGhosts }` in Task 3. ✅
- `RELOAD_FLAG` (`'loomn-selftest-reloaded'`) definito e usato solo in `runSelfTest` (Task 4). ✅
- Gli script `package.json` sono additivi e cumulativi: Task 1 aggiunge `verify`; Task 2 aggiunge `gate:kill-ghost`; Task 3 aggiunge `gate:selftest`; `test`/`typecheck`/`rebuild:electron`/`rebuild:node` restano invariati e vengono **riusati** (single-source) da `verify`/`gate-selftest.mjs`. ✅
- `gate-selftest.mjs` invoca `pnpm --filter @loomn/desktop build`/`exec electron .`, `pnpm rebuild:electron`, `pnpm rebuild:node` — tutti script/comandi esistenti. ✅

**4. Conteggi test:** **777 invariato** in ogni task (F7 è ops; `renderer.ts` non è unit-testato — verificato via grep). La verifica è l'esecuzione degli script (`pnpm verify`, `pnpm gate:selftest` → `VERDICT: PASS`), non nuovi `it()`. ✅

**5. Anti-apostrofo:** F7 non ha `it()/describe()` → grep `(it|describe)\('[^']*'[A-Za-zàèéìòù]` no-match per costruzione. Le nuove label `check(...)` e i commenti di `renderer.ts` sono apostrofo-free (verifica manuale in Task 4 Step 3). ✅

**6. Disciplina di scope:** ogni task elenca i file esatti + uno step `git status --short` prima del commit. Nessun task tocca `tsconfig`/`vitest.config`/`vitest.workspace`/`electron.vite.config`/`app/desktop/package.json` né il codice di prodotto di F1–F6. ✅

**7. Debt-free / decisioni motivate:**
- kill-ghost matcha SOLO `electron.exe` (non `node`) — deviazione consapevole dal pattern documentato `electron|node`, motivata (auto-kill del gate node + i lock-holder Electron-ABI sono sempre electron.exe; VS Code/Claude/Slack hanno binari `*.exe` diversi). ✅
- Reload SOLO in fase 2 (read-only/idempotente), non in fase 1 (non-idempotente) — meccanismo I‑02 identico, complessità minima. ✅
- Versione persistita resta **8** (reload read-only) — confermato, nessun aggiustamento necessario. ✅
- `app/desktop/package.json` invariato (YAGNI; l'orchestrazione è root-level). ✅

---

## Roadmap dei task

1. **Task 1** — `verify` + README (hazard ABI). Verifica: `pnpm verify` (777).
2. **Task 2** — `scripts/kill-ghost.mjs` + `gate:kill-ghost`. Verifica: `pnpm gate:kill-ghost` (no auto-kill).
3. **Task 3** — `scripts/gate-selftest.mjs` + `gate:selftest`. Verifica: `pnpm gate:selftest` → `RISULTATO: PASS` + `pnpm test` 777 (ABI ripristinata).
4. **Task 4** — `renderer.ts` reload coverage. Verifica: typecheck + `pnpm test` 777 + `pnpm gate:selftest` PASS (ora esercita il reload).
5. **Task 5** (opzionale) — `.github/workflows/verify.yml`. Verifica: `pnpm verify` (mirror del job).

**Gate finale prima del merge (HANDOFF §4):** `pnpm gate:selftest` → `RISULTATO: PASS` su entrambe le fasi (incluso il check reload), poi `pnpm test` 777 + `pnpm -r typecheck` puliti su ABI Node.

---

## Execution Handoff

Piano salvato in `docs/superpowers/plans/2026-06-23-loomn-fix-remediation-f7-ops-gate.md`. **Prossimo passo:** verifica anti-apostrofo del piano, commit del doc su `main` (`docs:` con Co-Authored-By), poi branch `fix/remediation-f7-ops-gate` ed esecuzione **subagent-driven** (flusso HANDOFF §4): per ogni task implementer → spec-review → code-quality-review; final review opus del branch; gate Electron 2 fasi `VERDICT: PASS` (ora via `pnpm gate:selftest`); `finishing-a-development-branch` → merge ff in `main` → `pnpm test` full verde → `git push origin main` → cancella il branch. Poi aggiorna HANDOFF + memoria: **F7 fatto → REMEDIATION COMPLETA (28/28)** e fermati (le prossime tracce sono design-first).
