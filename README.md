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
