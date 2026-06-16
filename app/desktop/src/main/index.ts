import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import { join } from 'node:path';
import { createSeededRandom } from '@loomn/engine';
import {
  createMemorySystem,
  createCampaignService,
  createLanguageProvider,
  type CampaignService,
  type MemorySystem,
} from '@loomn/host';
import {
  IPC_CHANNELS,
  dispatchRequestSchema,
  runTurnRequestSchema,
  providerConfigSchema,
  reflectRequestSchema,
  type DispatchResult,
  type RunTurnResult,
  type ProviderResult,
  type ReflectResult,
  type StatusResult,
  type ReadModelPush,
} from '@loomn/shared';
import { createProviderHolder, type ProviderHolder } from './provider-holder';
import { loadProviderConfig, saveProviderConfig } from './settings';
import type { LanguageProviderConfig } from '@loomn/host';
import type { ProviderConfig } from '@loomn/shared';

/** Adatta ProviderConfig (Zod: apiKey?: string|undefined) a LanguageProviderConfig
 *  (exactOptionalPropertyTypes: apiKey?: string). Spread condizionale: mai campo:undefined. */
function toLanguageProviderConfig(c: ProviderConfig): LanguageProviderConfig {
  return {
    baseUrl: c.baseUrl,
    model: c.model,
    ...(c.apiKey !== undefined ? { apiKey: c.apiKey } : {}),
  };
}

// Seme RNG di sviluppo costante: niente Date.now fuori da host/clock.ts; decide registra i fatti
// risolti negli Event -> replay deterministico. Seed per-campagna persistito = follow-up.
const DEV_SEED = 1;

// Holder del provider AI (configurabile a runtime via set-provider), creato una sola volta.
const holder: ProviderHolder = createProviderHolder();

let mainWindow: BrowserWindow | undefined;
let memory: MemorySystem | undefined;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Read side (spec 5.2): spinge lo snapshot {version, state} al renderer. structuredClone difensivo
 *  del riferimento read-only di ReadModel.state (auto-documenta il contratto; send() clona comunque). */
function pushReadModel(service: CampaignService): void {
  if (mainWindow === undefined) return;
  const rm = service.getReadModel();
  const push: ReadModelPush = { version: rm.version, state: structuredClone(rm.state) };
  mainWindow.webContents.send(IPC_CHANNELS.readModelPush, push);
}

/** Handler IPC sottili sopra il CampaignService. Payload renderer->main Zod-validato (spec 4); gli
 *  errori del motore/provider diventano {ok:false, error} (niente throw grezzi al renderer). */
function registerHandlers(service: CampaignService): void {
  ipcMain.handle(IPC_CHANNELS.dispatch, async (_e, raw): Promise<DispatchResult> => {
    const parsed = dispatchRequestSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: `Command non valido: ${parsed.error.message}` };
    try {
      const out = await service.dispatch(parsed.data);
      pushReadModel(service);
      return { ok: true, version: out.readModel.version };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.runTurn, async (_e, raw): Promise<RunTurnResult> => {
    const parsed = runTurnRequestSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: `Richiesta non valida: ${parsed.error.message}` };
    try {
      const out = await service.runTurn(parsed.data.playerAction);
      pushReadModel(service);
      return { ok: true, narration: out.narration, version: out.readModel.version };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.setProvider, async (_e, raw): Promise<ProviderResult> => {
    const parsed = providerConfigSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: `Config provider non valida: ${parsed.error.message}` };
    try {
      saveProviderConfig(parsed.data);
      holder.configure(createLanguageProvider(toLanguageProviderConfig(parsed.data)));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.reflect, async (_e, raw): Promise<ReflectResult> => {
    const parsed = reflectRequestSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: `Richiesta non valida: ${parsed.error.message}` };
    try {
      const out = await service.reflect(parsed.data.scope);
      return { ok: true, factCount: out.factCount, summarized: out.summarized };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.getStatus,
    (): StatusResult => ({
      version: service.getReadModel().version,
      safeStorageAvailable: safeStorage.isEncryptionAvailable(),
      providerConfigured: holder.isConfigured(),
    }),
  );
}

function createWindow(service: CampaignService): BrowserWindow {
  const selfTest = process.env['LOOMN_SELFTEST'];
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    show: selfTest === undefined,
    webPreferences: {
      // Sicurezza non negoziabile (spec 4).
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: join(__dirname, '../preload/index.cjs'),
    },
  });

  if (selfTest !== undefined) {
    // Electron 42: console-message passa un oggetto `details` (message/level/...). Cattura il VERDICT
    // loggato dal renderer ed esce con codice scriptabile (0 PASS / 1 FAIL).
    win.webContents.on('console-message', (details) => {
      if (details.message.startsWith('VERDICT:')) {
        console.log(`[MAIN] ${details.message}`);
        app.exit(details.message.includes('PASS') ? 0 : 1);
      }
    });
    // Rete di sicurezza: se il renderer non emette mai un VERDICT, non lasciare il gate appeso.
    setTimeout(() => {
      console.log('VERDICT: FAIL timeout self-test');
      app.exit(1);
    }, 15000);
  }

  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
  if (rendererUrl !== undefined) {
    const url = selfTest !== undefined ? `${rendererUrl}?selftest=${selfTest}` : rendererUrl;
    void win.loadURL(url);
  } else {
    const file = join(__dirname, '../renderer/index.html');
    void win.loadFile(file, selfTest !== undefined ? { query: { selftest: selfTest } } : {});
  }

  win.webContents.once('did-finish-load', () => pushReadModel(service));
  return win;
}

void app.whenReady().then(() => {
  // userData override per il gate (due lanci sullo stesso DB temporaneo); in produzione: default OS.
  const userDataOverride = process.env['LOOMN_USERDATA'];
  if (userDataOverride !== undefined) app.setPath('userData', userDataOverride);

  // Persistenza reale dentro Electron: UNA connessione (event store + ledger + summaries + assembler).
  memory = createMemorySystem(join(app.getPath('userData'), 'loomn.db'));
  const service = createCampaignService({
    memory,
    model: holder.model,
    structured: holder.structured,
    rng: createSeededRandom(DEV_SEED),
  });

  // Provider persistito (settings.json) -> ricostruisci all avvio (decifra la chiave con safeStorage).
  const savedProvider = loadProviderConfig();
  if (savedProvider !== undefined) holder.configure(createLanguageProvider(toLanguageProviderConfig(savedProvider)));

  registerHandlers(service);
  mainWindow = createWindow(service);
  console.log('[MAIN] Loomn pronto');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow(service);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Rilascia la connessione SQLite solo all uscita reale (su macOS window-all-closed NON chiude l app:
// un successivo activate riusa lo stesso service e la connessione deve restare aperta).
app.on('will-quit', () => {
  memory?.close();
});
