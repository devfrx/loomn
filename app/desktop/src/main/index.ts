import { app, BrowserWindow, dialog, ipcMain, safeStorage } from 'electron';
import { join } from 'node:path';
import { createSeededRandom } from '@loomn/engine';
import {
  createMemorySystem,
  createCampaignService,
  createLanguageProvider,
  devRuleset,
  campaignDbPath,
  DEFAULT_CAMPAIGN_ID,
  type CampaignService,
  type MemorySystem,
} from '@loomn/host';
import {
  IPC_CHANNELS,
  dispatchRequestSchema,
  runTurnRequestSchema,
  providerConfigSchema,
  reflectRequestSchema,
  narrationHistoryRequestSchema,
  canonRequestSchema,
  summariesRequestSchema,
  generateSeedRequestSchema,
  seedCampaignRequestSchema,
  type DispatchResult,
  type RunTurnResult,
  type ProviderResult,
  type ReflectResult,
  type StatusResult,
  type ReadModelPush,
  type NarrationHistoryResult,
  type CanonResult,
  type SummariesResult,
  type RulesetResult,
  type GenerateSeedResult,
  type SeedCampaignResult,
} from '@loomn/shared';
import { createProviderHolder, type ProviderHolder } from './provider-holder';
import { loadProviderConfig, loadProviderMeta, saveProviderConfig } from './settings';
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

/** Costruisce lo snapshot read-side {version, state} (spec 5.2). structuredClone difensivo del
 *  riferimento read-only di ReadModel.state (auto-documenta il contratto; send/IPC clona comunque). */
function buildReadModelPush(service: CampaignService): ReadModelPush {
  const rm = service.getReadModel();
  return { version: rm.version, state: structuredClone(rm.state) };
}

/** Read side (spec 5.2): spinge lo snapshot {version, state} al renderer (push). */
function pushReadModel(service: CampaignService): void {
  if (mainWindow === undefined) return;
  mainWindow.webContents.send(IPC_CHANNELS.readModelPush, buildReadModelPush(service));
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
      return { ok: true, version: out.readModel.version, events: out.events };
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
      return { ok: true, narration: out.narration, version: out.readModel.version, events: out.events };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.setProvider, async (_e, raw): Promise<ProviderResult> => {
    const parsed = providerConfigSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: `Config provider non valida: ${parsed.error.message}` };
    try {
      saveProviderConfig(parsed.data);
      const effective = loadProviderConfig(); // config unita: include la chiave mantenuta
      if (effective === undefined) return { ok: false, error: 'Config provider non leggibile dopo il salvataggio' };
      holder.configure(createLanguageProvider(toLanguageProviderConfig(effective)));
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

  ipcMain.handle(IPC_CHANNELS.getStatus, (): StatusResult => {
    try {
      const meta = loadProviderMeta();
      return {
        ok: true,
        version: service.getReadModel().version,
        safeStorageAvailable: safeStorage.isEncryptionAvailable(),
        providerConfigured: holder.isConfigured(),
        ...(meta !== undefined ? { provider: meta } : {}),
      };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.narrationHistory, (_e, raw): NarrationHistoryResult => {
    const parsed = narrationHistoryRequestSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: `Richiesta non valida: ${parsed.error.message}` };
    try {
      const { before, limit } = parsed.data;
      const h = service.getNarrationHistory({
        ...(before !== undefined ? { before } : {}),
        ...(limit !== undefined ? { limit } : {}),
      });
      return { ok: true, entries: h.entries, hasMore: h.hasMore };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.canon, (_e, raw): CanonResult => {
    const parsed = canonRequestSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: `Richiesta non valida: ${parsed.error.message}` };
    try {
      const { includeRetracted, subject, predicate, object: obj } = parsed.data;
      return {
        ok: true,
        facts: service.getCanon({
          ...(includeRetracted !== undefined ? { includeRetracted } : {}),
          ...(subject !== undefined ? { subject } : {}),
          ...(predicate !== undefined ? { predicate } : {}),
          ...(obj !== undefined ? { object: obj } : {}),
        }),
      };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.summaries, (_e, raw): SummariesResult => {
    const parsed = summariesRequestSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: `Richiesta non valida: ${parsed.error.message}` };
    try {
      const { level, scope } = parsed.data;
      return {
        ok: true,
        summaries: service.getSummaries({
          ...(level !== undefined ? { level } : {}),
          ...(scope !== undefined ? { scope } : {}),
        }),
      };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.getRuleset, (): RulesetResult => {
    try {
      // Spread della vista host nell arm ok: se RulesetView divergesse dal DTO, vue-tsc fallirebbe
      // qui (drift guard read, come canon/summary del Piano 0). Nessun payload da validare.
      return { ok: true, ...service.getRuleset() };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.getReadModel, (): ReadModelPush => buildReadModelPush(service));

  ipcMain.handle(IPC_CHANNELS.generateSeed, async (_e, raw): Promise<GenerateSeedResult> => {
    const parsed = generateSeedRequestSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: `Brief non valido: ${parsed.error.message}` };
    // Pre-check deterministico: niente string-sniffing del sentinel NO_PROVIDER del provider-holder.
    if (!holder.isConfigured()) {
      return { ok: false, error: 'Nessun provider AI configurato. Configuralo in Impostazioni.' };
    }
    try {
      const seed = await service.generateSeed(parsed.data);
      return { ok: true, seed };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.seedCampaign, async (_e, raw): Promise<SeedCampaignResult> => {
    const parsed = seedCampaignRequestSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: `Seed non valido: ${parsed.error.message}` };
    try {
      const out = await service.seedCampaign(parsed.data.seed);
      pushReadModel(service); // la board si popola di campaignFrame + attori
      return {
        ok: true,
        version: out.readModel.version,
        ...(out.narration !== undefined ? { narration: out.narration } : {}),
      };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });
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
        // startsWith('VERDICT: PASS') e robusto: la decisione del gate non dipende dal contenuto
        // delle label o del messaggio di eccezione interpolati nel resto della riga.
        app.exit(details.message.startsWith('VERDICT: PASS') ? 0 : 1);
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

  // I-02: .on (non .once) -> ogni did-finish-load, incluso un reload (Ctrl+R), ri-spinge il read-model.
  win.webContents.on('did-finish-load', () => pushReadModel(service));
  return win;
}

// userData override per il gate (due lanci sequenziali sullo stesso DB temp); in produzione: default OS.
// Va impostata PRIMA del lock (per-userData) e prima di whenReady (Electron lo esige per userData).
const userDataOverride = process.env['LOOMN_USERDATA'];
if (userDataOverride !== undefined) app.setPath('userData', userDataOverride);

// I-11: una rejection non gestita nel main viene loggata (diagnostica). NON killa il processo: nel gate
// una rejection benigna non deve far fallire il self-test.
process.on('unhandledRejection', (reason) => {
  console.error('[MAIN] unhandledRejection:', reason instanceof Error ? reason.message : reason);
});

// I-11: una sola istanza per userData (la seconda divergerebbe sullo stesso loomn.db -> ConcurrencyError).
if (!app.requestSingleInstanceLock()) {
  // Seconda istanza: cedi il passo (la prima riceve 'second-instance' e si rifocalizza) ed esci.
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow === undefined) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void app.whenReady().then(() => {
    try {
      // Persistenza reale dentro Electron: UNA connessione (event store + ledger + summaries + assembler).
      memory = createMemorySystem(campaignDbPath(app.getPath('userData'), DEFAULT_CAMPAIGN_ID));
      const service = createCampaignService({
        memory,
        model: holder.model,
        structured: holder.structured,
        rng: createSeededRandom(DEV_SEED),
        ruleset: devRuleset,
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
    } catch (err) {
      // Avvio fallito (DB lockato, migrazione rotta, ...): mostra un messaggio invece della finestra nera.
      dialog.showErrorBox('Loomn non può avviarsi', errorMessage(err));
      app.exit(1);
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Rilascia la connessione SQLite solo all uscita reale (su macOS window-all-closed NON chiude l app:
// un successivo activate riusa lo stesso service e la connessione deve restare aperta).
app.on('will-quit', () => {
  memory?.close();
});
