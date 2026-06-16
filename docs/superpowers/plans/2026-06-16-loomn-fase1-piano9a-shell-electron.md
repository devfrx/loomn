# Piano 9a — Shell Electron Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creare il pacchetto `app/desktop` (Electron + Vue 3 + Vite via electron-vite), che boota una finestra con le flag di sicurezza non negoziabili, espone un contratto IPC tipizzato (definito e testato in `@loomn/shared`) e dimostra un giro IPC a due vie main↔renderer — **senza database né AI** (il wiring di memoria/AI e la persistenza arrivano nei Piani 9b/9c).

**Architecture:** Tre processi Electron in un solo pacchetto workspace (`src/main`, `src/preload`, `src/renderer`), orchestrati da electron-vite. Il **write side** vive nel `main` (process fidato: lifecycle, finestra, handler IPC); il **read side** e il `renderer` Vue (proiezioni di sola lettura, non muta lo stato — spec §5.2). Il `preload` espone via `contextBridge` una superficie IPC minima e tipizzata. Il contratto dei canali (nomi + schemi Zod + tipi) e l'**unica fonte** in `@loomn/shared` (spec §4), consumato dai tre processi.

**Tech Stack:** electron 42, electron-vite 4 (Vite 6, esbuild), @vitejs/plugin-vue, Vue 3, TypeScript strict, vue-tsc per il typecheck, Zod (gia in `shared`). Nessun `better-sqlite3`/`@loomn/memory`/`@loomn/ai` in 9a.

---

## Contesto e riferimenti

- **Spec (autorita):** `docs/superpowers/specs/2026-06-15-simulatore-campagne-ai-design.md`. Per 9a contano: **§4** (struttura `app/{main,preload,renderer}`, regole anti-debito, sicurezza Electron by default), **§5.2** (CQRS attraverso i processi: write side nel main, read side proiezioni nel renderer), **§12** (stack), **§13** (protocollo read-model main→renderer ancora da dettagliare — 9a fissa solo lo scaffold IPC, non il protocollo delta/snapshot).
- **HANDOFF:** `docs/superpowers/HANDOFF.md` (§0/§7/§8/§9 per il Piano 9; §5 house rules).
- **Stato di partenza:** `main`, **215 test verdi**, typecheck pulito (engine/shared/memory/ai). Questo piano aggiunge il pacchetto `app/desktop` e qualche test in `@loomn/shared`.

### Verifica empirica gia svolta (sandbox esterna, rimossa a fine lavoro)

Tutto il codice/le scelte qui sotto sono stati **dimostrati empiricamente** prima della stesura (house rule §5), in due sandbox esterne al repo:

- Electron 42.4.0 boota in questo ambiente; **Node ABI 146**, Chrome 148.
- `electron-vite build` + esecuzione: **main ESM** + **preload forzato a CJS** (`format:'cjs'`, `entryFileNames:'[name].cjs'`) funziona sotto `sandbox:true`; il **plugin Vue** compila il renderer.
- Boot sicuro verificato: `contextIsolation:true` + `sandbox:true` + `nodeIntegration:false` → il renderer ha `window.<bridge>` ma **niente `require`/`process`** (isolato), e il giro IPC `invoke`/`handle` + `send`/`on` ritorna i valori attesi.
- `safeStorage.isEncryptionAvailable()` ritorna `true` (rilevante per 9c/keys, non usato in 9a).
- `vue-tsc --noEmit` con **un singolo `tsconfig.json`** (niente project references/composite — house rule §5.1) typecheck-a pulito su main+preload+`.vue`+config.
- Anche `electron-vite dev` boota (dev server + main + IPC) — comando di sviluppo quotidiano.

> Decisioni di confine prese qui (motivate in fondo, §"Decisioni"): **Piano 9 splittato in 9a/9b/9c**; **`better-sqlite3`/AI fuori da 9a** (restano i 215 test verdi e zero conflitti ABI); il **contratto IPC vive in `@loomn/shared`** (spec §4); il renderer di 9a e uno **scheletro diagnostico**, non UI (la UI e il Piano 10).

---

## File Structure

Nuovo pacchetto workspace `app/desktop` (`@loomn/desktop`) — `pnpm-workspace.yaml` globba gia `app/*`, NON va modificato.

| File | Responsabilita |
|---|---|
| `packages/shared/src/ipc.ts` | **Contratto IPC** (unica fonte): nomi canale, schemi Zod dei payload, tipi TS inferiti. Niente import da Electron (resta foglia). |
| `packages/shared/src/ipc.test.ts` | Test del contratto (Zod accetta/rifiuta payload; invarianti dei nomi canale). |
| `packages/shared/src/index.ts` | Barrel: aggiunge l'export di `./ipc`. |
| `app/desktop/package.json` | Manifesto del pacchetto Electron + dipendenze + script (**deps create dall'orchestratore**, vedi §"Pre-step orchestratore"). |
| `app/desktop/electron.vite.config.ts` | Config electron-vite: main/preload/renderer; preload→CJS; `externalizeDepsPlugin({exclude:['@loomn/shared']})` per bundlare il TS di `shared`. |
| `app/desktop/tsconfig.json` | Un solo tsconfig strict (no references/composite), lib DOM+ES2022, `types:['node']`, include src+config. |
| `app/desktop/src/main/index.ts` | Processo main: lifecycle, `BrowserWindow` con flag di sicurezza, handler IPC `ping`, push read-side demo, log di VERDICT diagnostico. |
| `app/desktop/src/preload/index.ts` | `contextBridge`: espone `window.loomn` tipizzato (solo i canali del contratto). |
| `app/desktop/src/renderer/index.html` | Entry HTML del renderer. |
| `app/desktop/src/renderer/src/App.vue` | Componente Vue minimale (scheletro). |
| `app/desktop/src/renderer/src/renderer.ts` | Bootstrap Vue + giro IPC diagnostico + report al main. |
| `app/desktop/src/renderer/env.d.ts` | Shim tipi: `*.vue` + tipo globale `window.loomn` (dal contratto di `shared`). |
| `.gitignore` | Aggiunge `app/desktop/out` e (se assente) `node_modules` agli ignorati. |

**Fuori ambito 9a (esplicito):**
- Nessun `better-sqlite3`, `@loomn/memory`, `@loomn/ai`, nessun DB, nessuna Reflection, nessun Context Assembler, nessun `runMasterTurn` (→ 9b/9c).
- Nessun `@electron/rebuild` operativo / rebuild della nativa (→ 9c, dove l'app apre il DB; vedi §"Decisioni / strategia ABI").
- Nessun componente UI reale (chat/scheda PG/dadi 3D/journal → Piano 10). Il renderer e uno scheletro che prova il flusso IPC.
- Nessun packaging/distribuzione (electron-builder/forge → fase successiva).
- Nessuna definizione del protocollo delta/snapshot read-model (spec §13) oltre allo scaffold del canale di push.

---

## Pre-step orchestratore (PRIMA dei task subagent)

> **House rule §5.1:** aggiungere dipendenze e creare il manifesto di un nuovo pacchetto e **passo dell'orchestratore**, non di un subagent. I subagent NON toccano `package.json`/`tsconfig*`/`vitest.config.ts` di root.

- [ ] **O1. Creare `app/desktop/package.json`** con questo contenuto:

```json
{
  "name": "@loomn/desktop",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "typecheck": "vue-tsc --noEmit"
  },
  "dependencies": {
    "@loomn/shared": "workspace:*"
  },
  "devDependencies": {
    "electron": "^42.4.0",
    "electron-vite": "^4.0.1",
    "@vitejs/plugin-vue": "^5.2.4",
    "vue": "^3.5.18",
    "vue-tsc": "^2.1.10",
    "typescript": "^5.5.4",
    "@types/node": "^22.10.5"
  }
}
```

- [ ] **O2. Installare:** `pnpm install` (linka `@loomn/desktop` e scarica la toolchain; il binario Electron si scarica al primo avvio).
- [ ] **O3. Verifica install:** `pnpm -r exec true` o `pnpm ls --filter @loomn/desktop` → il pacchetto e presente. NON eseguire ancora `electron-vite build` (mancano i sorgenti, arrivano nei task).

> Nota: `app/desktop` aggiunge `typecheck` agli script, quindi `pnpm -r typecheck` (root) lo includera automaticamente (usando `vue-tsc`). `pnpm test` (root) NON cambia: `vitest.config.ts` include solo `packages/**/*.test.ts`, quindi i test di 9a vivono in `@loomn/shared`.

---

## Task 1: Contratto IPC tipizzato in `@loomn/shared`

**Files:**
- Create: `packages/shared/src/ipc.ts`
- Create: `packages/shared/src/ipc.test.ts`
- Modify: `packages/shared/src/index.ts`

**Disciplina di scope:** modifica SOLO i tre file elencati. NON toccare `packages/shared/package.json`, nessun `tsconfig*`, nessun `vitest.config.ts`. `@loomn/shared` resta foglia: NON importare `electron` ne altri pacchetti `@loomn/*`. Verifica `git status --short` prima del commit.

- [ ] **Step 1: Scrivere il test che fallisce**

Crea `packages/shared/src/ipc.test.ts` (attenzione house rule §5.4: niente apostrofi nelle stringhe `it`/`describe` in apici singoli):

```ts
import { describe, it, expect } from 'vitest';
import {
  IPC_CHANNELS,
  pingRequestSchema,
  pingResponseSchema,
  readModelPushSchema,
} from './ipc';

describe('contratto IPC: nomi dei canali', () => {
  it('espone nomi di canale stabili e univoci', () => {
    const names = Object.values(IPC_CHANNELS);
    expect(new Set(names).size).toBe(names.length);
    expect(IPC_CHANNELS.ping).toBe('loomn:ping');
    expect(IPC_CHANNELS.readModelPush).toBe('loomn:read-model-push');
  });
});

describe('contratto IPC: schemi dei payload', () => {
  it('pingRequestSchema accetta un payload valido', () => {
    const parsed = pingRequestSchema.parse({ text: 'ciao' });
    expect(parsed.text).toBe('ciao');
  });

  it('pingRequestSchema rifiuta un payload senza text', () => {
    expect(pingRequestSchema.safeParse({}).success).toBe(false);
  });

  it('pingResponseSchema accetta una risposta valida', () => {
    const parsed = pingResponseSchema.parse({ ok: true, echo: 'ciao', upper: 'CIAO' });
    expect(parsed.ok).toBe(true);
  });

  it('readModelPushSchema accetta una proiezione read-side', () => {
    const parsed = readModelPushSchema.parse({ version: 0, summary: 'nessuno stato' });
    expect(parsed.version).toBe(0);
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `pnpm exec vitest run packages/shared/src/ipc.test.ts`
Expected: FAIL — `Cannot find module './ipc'` (il file non esiste ancora).

- [ ] **Step 3: Implementare il contratto**

Crea `packages/shared/src/ipc.ts`:

```ts
// Contratto IPC (spec 4): UNICA fonte di nomi canale, schemi Zod dei payload e tipi inferiti,
// condivisa dai tre processi Electron. `shared` resta foglia: nessun import da electron ne da
// altri @loomn/*. La validazione Zod ai confini IPC (payload non fidati) usa questi schemi.
import { z } from 'zod';

/** Nomi dei canali IPC (prefisso `loomn:` per evitare collisioni). */
export const IPC_CHANNELS = {
  /** invoke/handle (richiesta->risposta): handshake diagnostico del Piano 9a. */
  ping: 'loomn:ping',
  /** send/on (push main->renderer): proiezione read-side (spec 5.2). Scaffold in 9a. */
  readModelPush: 'loomn:read-model-push',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

/** Handshake diagnostico (Piano 9a). Sostituito dai Command reali in 9c. */
export const pingRequestSchema = z.object({ text: z.string() });
export type PingRequest = z.infer<typeof pingRequestSchema>;

export const pingResponseSchema = z.object({
  ok: z.boolean(),
  echo: z.string(),
  upper: z.string(),
});
export type PingResponse = z.infer<typeof pingResponseSchema>;

/** Proiezione read-side spinta dal main (spec 5.2). In 9a e una sintesi grezza; in 9c portera
 *  lo stato proiettato dagli Event. Il protocollo delta/snapshot (spec 13) resta da dettagliare. */
export const readModelPushSchema = z.object({
  version: z.number().int().nonnegative(),
  summary: z.string(),
});
export type ReadModelPush = z.infer<typeof readModelPushSchema>;

/** Superficie IPC esposta dal preload al renderer (contratto tipizzato del bridge). */
export interface LoomnBridge {
  ping(request: PingRequest): Promise<PingResponse>;
  onReadModelPush(listener: (push: ReadModelPush) => void): void;
}
```

- [ ] **Step 4: Esportare dal barrel**

Modifica `packages/shared/src/index.ts` aggiungendo in fondo:

```ts
export * from './ipc';
```

(Mantieni gli export esistenti invariati.)

- [ ] **Step 5: Eseguire i test e verificare che passino**

Run: `pnpm exec vitest run packages/shared/src/ipc.test.ts`
Expected: PASS (5 test verdi).

- [ ] **Step 6: Typecheck del pacchetto + grep anti-apostrofo**

Run: `pnpm -C packages/shared typecheck`
Expected: nessun errore.

Run (house rule §5.4): `grep -rnE "(it|describe)\('[^']*'[A-Za-zàèéìòù]" packages/shared/src/ipc.test.ts`
Expected: *no matches*.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/ipc.ts packages/shared/src/ipc.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): contratto IPC tipizzato (canali + schemi Zod) per la shell Electron"
```

**Test attesi cumulativi:** 215 → **220** (5 nuovi in `shared`).

---

## Task 2: Scaffold `app/desktop` — config, tsconfig, finestra sicura, scheletro Vue (senza IPC)

**Files:**
- Create: `app/desktop/electron.vite.config.ts`
- Create: `app/desktop/tsconfig.json`
- Create: `app/desktop/src/main/index.ts`
- Create: `app/desktop/src/renderer/index.html`
- Create: `app/desktop/src/renderer/src/App.vue`
- Create: `app/desktop/src/renderer/src/renderer.ts`
- Create: `app/desktop/src/renderer/env.d.ts`
- Modify: `.gitignore`

**Disciplina di scope:** crea SOLO i file elencati (sono file di un nuovo processo/modulo → in ambito). NON modificare `app/desktop/package.json` (gia creato dall'orchestratore), nessun `tsconfig*` di root, nessun `vitest.config.ts`, nessun `pnpm-workspace.yaml`. Verifica `git status --short` prima del commit.

- [ ] **Step 1: Config electron-vite**

Crea `app/desktop/electron.vite.config.ts`:

```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import vue from '@vitejs/plugin-vue';

// Default entry (convenzione electron-vite): src/main/index.ts, src/preload/index.ts,
// src/renderer/index.html. externalizeDepsPlugin esternalizza le deps di package.json (nessuna
// nativa in 9a), ma `exclude` forza il bundling del TS di @loomn/shared (non ha build a JS).
// Il preload e forzato a CJS: un preload sandboxed non puo essere un ES module (verificato).
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@loomn/shared'] })],
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@loomn/shared'] })],
    build: {
      rollupOptions: {
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    plugins: [vue()],
  },
});
```

- [ ] **Step 2: tsconfig (singolo, no references/composite)**

Crea `app/desktop/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "electron.vite.config.ts"]
}
```

- [ ] **Step 3: env.d.ts (shim `.vue` + tipo globale del bridge)**

Crea `app/desktop/src/renderer/env.d.ts`:

```ts
/// <reference types="vite/client" />
import type { LoomnBridge } from '@loomn/shared';

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}

declare global {
  interface Window {
    loomn: LoomnBridge;
  }
}
```

- [ ] **Step 4: main (finestra sicura, senza IPC ancora)**

Crea `app/desktop/src/main/index.ts`:

```ts
import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    show: true,
    webPreferences: {
      // Sicurezza non negoziabile (spec 4).
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: join(__dirname, '../preload/index.cjs'),
    },
  });
  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

void app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 5: renderer HTML + Vue scheletro**

Crea `app/desktop/src/renderer/index.html`:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'" />
    <title>Loomn</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./src/renderer.ts"></script>
  </body>
</html>
```

Crea `app/desktop/src/renderer/src/App.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue';

const status = ref('Shell Electron avviata (Piano 9a)');
</script>

<template>
  <main>
    <h1>Loomn</h1>
    <p>{{ status }}</p>
  </main>
</template>
```

Crea `app/desktop/src/renderer/src/renderer.ts` (in 9a il bootstrap NON usa ancora l'IPC; arriva nel Task 3):

```ts
import { createApp } from 'vue';
import App from './App.vue';

createApp(App).mount('#app');
```

- [ ] **Step 6: .gitignore**

Modifica `.gitignore` (root) aggiungendo, se non gia presenti, le righe:

```
app/desktop/out
```

(`node_modules` e tipicamente gia ignorato; se non lo fosse, aggiungilo. NON rimuovere righe esistenti.)

- [ ] **Step 7: Build + typecheck**

Run: `pnpm --filter @loomn/desktop build`
Expected: 3 bundle prodotti senza errori — `out/main/index.js`, `out/preload/index.cjs` (assente in 9a perche il preload arriva nel Task 3 → vedi nota), `out/renderer/index.html` + assets.

> Nota: in 9a il preload viene aggiunto nel Task 3. Se electron-vite avverte che manca `src/preload/index.ts`, e atteso: il main lo referenzia ma il bundle preload comparira col Task 3. Per evitare il warning, questo step puo essere ri-verificato a valle del Task 3. Il gate duro di questo task e il **typecheck**:

Run: `pnpm --filter @loomn/desktop typecheck`
Expected: nessun errore (`vue-tsc --noEmit`).

- [ ] **Step 8: Commit**

```bash
git add app/desktop/electron.vite.config.ts app/desktop/tsconfig.json app/desktop/src .gitignore
git commit -m "feat(desktop): scaffold app/desktop (electron-vite + Vue) con finestra sicura"
```

**Test attesi cumulativi:** **220** (nessun nuovo test; gate = build + typecheck).

---

## Task 3: Preload tipizzato + IPC main↔renderer (handshake + push read-side)

**Files:**
- Create: `app/desktop/src/preload/index.ts`
- Modify: `app/desktop/src/main/index.ts`
- Modify: `app/desktop/src/renderer/src/renderer.ts`

**Disciplina di scope:** modifica/crea SOLO i tre file elencati. Il contratto IPC e gia in `@loomn/shared` (Task 1): **importa da li**, non ridefinire nomi/schemi. NON toccare `package.json`/`tsconfig*`/config. Verifica `git status --short` prima del commit.

- [ ] **Step 1: Preload (contextBridge tipizzato)**

Crea `app/desktop/src/preload/index.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type LoomnBridge, type PingRequest, type ReadModelPush } from '@loomn/shared';

// Superficie IPC minima e tipizzata (spec 4): solo i canali del contratto, nessun accesso
// Node/DB esposto al renderer. Costruito a CJS (electron.vite.config) per sandbox:true.
const bridge: LoomnBridge = {
  ping: (request: PingRequest) => ipcRenderer.invoke(IPC_CHANNELS.ping, request),
  onReadModelPush: (listener: (push: ReadModelPush) => void) => {
    ipcRenderer.on(IPC_CHANNELS.readModelPush, (_event, push: ReadModelPush) => listener(push));
  },
};

contextBridge.exposeInMainWorld('loomn', bridge);
```

- [ ] **Step 2: Main — registra l'handler `ping` e spinge una proiezione read-side**

Modifica `app/desktop/src/main/index.ts`. Aggiungi gli import e la validazione Zod ai confini (spec 4), e registra l'handler prima di creare la finestra. Sostituisci il contenuto con:

```ts
import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { IPC_CHANNELS, pingRequestSchema, type PingResponse, type ReadModelPush } from '@loomn/shared';

// Write side (spec 5.2): il main e l'unico processo fidato. In 9a l'handler `ping` e un
// handshake diagnostico; i Command reali (decide/persisti) arrivano in 9c. Validazione Zod del
// payload non fidato al confine IPC.
ipcMain.handle(IPC_CHANNELS.ping, (_event, raw): PingResponse => {
  const req = pingRequestSchema.parse(raw);
  return { ok: true, echo: req.text, upper: req.text.toUpperCase() };
});

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    show: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: join(__dirname, '../preload/index.cjs'),
    },
  });
  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  // Read side (spec 5.2): proiezione di sola lettura spinta al renderer dopo il caricamento.
  // In 9a e una sintesi placeholder; in 9c portera lo stato proiettato dagli Event.
  win.webContents.once('did-finish-load', () => {
    const push: ReadModelPush = { version: 0, summary: 'Nessuno stato (scaffold 9a).' };
    win.webContents.send(IPC_CHANNELS.readModelPush, push);
  });
  return win;
}

void app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 3: Renderer — usa il bridge (giro IPC) e mostra il read-side + diagnostica**

Sostituisci `app/desktop/src/renderer/src/renderer.ts`:

```ts
import { createApp } from 'vue';
import App from './App.vue';

createApp(App).mount('#app');

// Diagnostica di boot (Piano 9a): prova il giro IPC e le invarianti di sicurezza, poi logga una
// riga VERDICT (la verifica di accettazione la grep-a). Sara rimossa quando arriva la UrlI reale.
async function bootDiagnostics(): Promise<void> {
  const isolated = typeof window.loomn !== 'undefined';
  const noNode =
    typeof (globalThis as unknown as { require?: unknown }).require === 'undefined' &&
    typeof (globalThis as unknown as { process?: unknown }).process === 'undefined';

  let pushVersion = -1;
  window.loomn.onReadModelPush((push) => {
    pushVersion = push.version;
  });

  let ipcOk = false;
  try {
    const res = await window.loomn.ping({ text: 'hello from renderer' });
    ipcOk = res.ok && res.echo === 'hello from renderer' && res.upper === 'HELLO FROM RENDERER';
  } catch {
    ipcOk = false;
  }
  // Lascia arrivare il push del read-side (did-finish-load).
  setTimeout(() => {
    // eslint-disable-next-line no-console
    console.log(
      `VERDICT ipc=${ipcOk ? 'OK' : 'FAIL'} isolated=${isolated} noNode=${noNode} push=${pushVersion}`,
    );
  }, 300);
}

void bootDiagnostics();
```

- [ ] **Step 4: Build**

Run: `pnpm --filter @loomn/desktop build`
Expected: tre bundle senza errori, incluso `out/preload/index.cjs`.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @loomn/desktop typecheck`
Expected: nessun errore.

- [ ] **Step 6: Verifica di boot + IPC (esecuzione reale, con timeout)**

Run (PowerShell o Bash; il processo boota, logga VERDICT e si chiude alla chiusura finestra — usa un timeout):

```bash
cd app/desktop && timeout 60 pnpm exec electron-vite preview 2>&1 | grep -E "VERDICT"
```

(Se `preview` non trova il binario Electron al primo giro, eseguilo una volta per scaricarlo: `pnpm exec electron --version`, poi ripeti.)

Expected: una riga
`VERDICT ipc=OK isolated=true noNode=true push=0`

Questo dimostra: giro IPC `invoke`/`handle` a due vie (ipc=OK), `contextIsolation` (isolated=true), `nodeIntegration:false`+`sandbox:true` (noNode=true), e il push read-side ricevuto (push=0).

- [ ] **Step 7: Commit**

```bash
git add app/desktop/src/preload/index.ts app/desktop/src/main/index.ts app/desktop/src/renderer/src/renderer.ts
git commit -m "feat(desktop): preload tipizzato + giro IPC main-renderer (handshake + push read-side)"
```

**Test attesi cumulativi:** **220** (gate = build + typecheck + verifica di boot VERDICT).

---

## Task 4: Integrazione root — typecheck e test verdi end-to-end

**Files:** nessun file modificato (task di sola verifica + eventuale fix minimale degli import emerso dal typecheck root).

**Disciplina di scope:** questo task NON aggiunge feature. Se il typecheck/test root rivela un problema, correggilo SOLO nei file gia creati nei Task 1-3 (mai in `package.json`/`tsconfig*`/`vitest.config.ts`/`pnpm-workspace.yaml`).

- [ ] **Step 1: Typecheck di tutto il monorepo**

Run: `pnpm -r typecheck`
Expected: tutti i pacchetti verdi, incluso `@loomn/desktop` (via `vue-tsc`). Se `@loomn/desktop` non comparisse nel typecheck `-r`, verifica che il suo `package.json` (pre-step O1) abbia lo script `typecheck`.

- [ ] **Step 2: Suite di test completa**

Run: `pnpm test`
Expected: **220 test verdi** (215 preesistenti + 5 di `shared/ipc.test.ts`). `app/desktop` non aggiunge test a Vitest (non e in `vitest.config.ts`); il suo gate e build+typecheck+boot.

- [ ] **Step 3: Tree pulito**

Run: `git status --short`
Expected: vuoto (tutto committato; `app/desktop/out` ignorato).

- [ ] **Step 4: Commit (solo se il task ha prodotto fix)**

Se non ci sono modifiche, salta. Altrimenti:

```bash
git add -A
git commit -m "fix(desktop): allinea il typecheck root del pacchetto shell"
```

**Test attesi cumulativi finali:** **220 verdi**, `pnpm -r typecheck` pulito.

---

## Self-Review (eseguita in stesura)

**1. Copertura spec (per 9a):**
- §4 struttura `app/{main,preload,renderer}` → Task 2/3 (un pacchetto, tre processi). ✅
- §4 sicurezza by default (contextIsolation/sandbox/nodeIntegration:false, preload minimo) → Task 2/3, verificato col VERDICT. ✅
- §4 validazione Zod ai confini IPC → Task 3 (`pingRequestSchema.parse` nel main). ✅
- §4 contratti IPC + Zod in `shared` (unica fonte) → Task 1. ✅
- §5.2 CQRS: write side nel main, read side proiezione nel renderer → Task 3 (`ping` write-side stub + `readModelPush`). ✅ (il protocollo delta/snapshot §13 e dichiarato fuori ambito 9a.)
- §12 stack (Electron+Vue+Vite+TS strict+Pinia/Router) → Electron/Vue/Vite/TS presenti; **Pinia/Vue Router non in 9a** (servono con la UI → Piano 10). Dichiarato fuori ambito.
- Persistenza/AI/memoria (§6/§7) → **9b/9c**, fuori ambito 9a esplicito.

**2. Scan placeholder:** nessun "TBD/TODO/implementa dopo"; ogni step ha codice completo e comandi con output atteso. ✅

**3. Coerenza dei tipi:** `IPC_CHANNELS`, `pingRequestSchema/PingRequest`, `pingResponseSchema/PingResponse`, `readModelPushSchema/ReadModelPush`, `LoomnBridge` definiti in Task 1 e usati identici in preload/main/renderer (Task 3) e nello shim `env.d.ts` (Task 2). `window.loomn` coerente fra `exposeInMainWorld('loomn', ...)` e `declare global { interface Window { loomn: LoomnBridge } }`. ✅

**4. House rules:** scope discipline in ogni task; deps/manifesto del nuovo pacchetto come pre-step orchestratore (non subagent); nessun tocco a root `package.json`/`tsconfig*`/`vitest.config.ts`/`pnpm-workspace.yaml`; un solo tsconfig (no references/composite); grep anti-apostrofo nel Task 1; engine/purezza non coinvolti (9a non tocca l'engine). ✅

---

## Decisioni (e perche), per la review dell'utente

- **Piano 9 splittato in 9a/9b/9c** (come 7/8). 9a = shell+sicurezza+IPC; 9b = wiring memoria+AI testabile; 9c = IPC write/read reale + persistenza nell'app. Motivo: ogni sotto-piano produce software verificabile da solo e tiene i task bite-sized.
- **`better-sqlite3`/AI fuori da 9a.** La nativa va ricompilata per l'ABI Electron (146) mentre `pnpm test` gira su ABI Node (137) sulla **stessa copia condivisa** nello store pnpm. Tenendo il DB fuori da 9a/9b (che restano verdi su ABI Node), il conflitto si presenta solo in **9c** (quando l'app apre il DB). Strategia ABI per 9c (gia ragionata): la verifica "app che apre il DB" si fa **eseguendo l'app** con la nativa ricompilata per Electron, mentre i test automatici restano in `@loomn/host`/`memory` su ABI Node; si ricompila per cambiare contesto (pnpm tiene copie native per-versione — verificato). Da fissare empiricamente all'inizio di 9c.
- **Contratto IPC in `@loomn/shared`** (spec §4: "shared = tipi condivisi + contratti IPC + schemi Zod"). E l'unico pezzo di 9a genuinamente unit-testabile, e tiene `shared` foglia (nessun import da electron).
- **Nuovo pacchetto testabile `@loomn/host` (in 9b).** Le impl LLM-backed di `FactExtractor`/`Summarizer` e il wiring degli store compongono `ai`+`memory`: **nessuno dei due puo importarli** (verificato: `@loomn/ai` non risolve da dentro `@loomn/memory`). Un pacchetto `packages/host` che dipende da entrambi e l'unico modo di tenere la composizione **coperta dall'attuale `vitest.config.ts`** (`packages/**`) senza toccarlo. `app/desktop` (Electron) restera una shell sottile sopra `@loomn/host`.
- **Renderer di 9a = scheletro diagnostico**, non UI. La UI (chat/scheda PG/dadi 3D/journal, Pinia, Vue Router) e il Piano 10, preceduto da una fase di studio/design.

---

## Roadmap (Fase 1, aggiornata)

- Piani 1-6, 7a/7b/7c, 8a/8b/8c ✅ fatti e mergiati (215 test).
- **Piano 9a — Shell Electron** ← *questo piano* (app/desktop: electron-vite+Vue, sicurezza, IPC tipizzato in `shared`; no DB/AI). Target: **220 test**, `pnpm -r typecheck` pulito, app che boota con VERDICT ipc=OK.
- **Piano 9b — Wiring memoria+AI (core testabile)** — nuovo pacchetto `@loomn/host` (dipende da engine/memory/ai/shared): `createSqliteEventStoreOn(db)` (event store su handle condiviso — verificato come prototipo), `createMemorySystem(dbPath)` (UNA connessione: event store + Canon Ledger + Summary Store + Context Assembler), `systemClock` (porta `Clock` reale), impl **LLM-backed** di `FactExtractor`/`Summarizer` (su `StructuredOutputPort` — composizione verificata), e l'iniezione dell'assembler in `runMasterTurn`. Tutto unit-testato (Vitest, ABI Node). Richiede una piccola modifica a `@loomn/memory` (event store su handle).
- **Piano 9c — IPC write/read reale + persistenza nell'app** — `app/desktop` apre il DB via `@loomn/host` (qui la nativa per ABI Electron + plugin di copia migrazioni in `out/migrations` — verificato), canale IPC dei Command (write side: `decide`→persisti→proietta), push degli Event al renderer (read side), `runMasterTurn` dietro IPC con l'assembler iniettato. Gestione ABI Node↔Electron formalizzata qui.
- **Traccia engine separata** (da 8c): nuovi Command/Event per gli strumenti rimandati di 7c + FSM di fase (spec §5.5).
- **Piano 10 — UI Vue** (preceduto da studio/design: brainstorming + frontend-design + spike; Pinia per le proiezioni read-side, `@3d-dice/dice-box` a risultati deterministici).
- **Piano 11 — Moduli a tema.**

---

## Execution Handoff

Vedi la skill `superpowers:subagent-driven-development` (consigliata): un implementer + spec review + code-quality review per task, final review dell'intero branch, poi `finishing-a-development-branch` (merge locale fast-forward in `main`), quindi aggiornamento di memoria e HANDOFF. Branch suggerito: `feat/fase1-piano9a-shell-electron`. Pre-step orchestratore (O1-O3: manifesto + `pnpm install`) PRIMA del Task 1.
