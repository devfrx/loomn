import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { IPC_CHANNELS, pingRequestSchema, type PingResponse, type ReadModelPush } from '@loomn/shared';

// Write side (spec 5.2): il main e l unico processo fidato. In 9a l handler `ping` e un
// handshake diagnostico (i Command reali, decide/persisti, arrivano in 9c). Validazione Zod del
// payload non fidato al confine IPC. I log del main sono visibili a terminale (prova di runtime).
ipcMain.handle(IPC_CHANNELS.ping, (_event, raw): PingResponse => {
  const req = pingRequestSchema.parse(raw);
  console.log(`[MAIN] ping ok: ${req.text}`);
  return { ok: true, echo: req.text, upper: req.text.toUpperCase() };
});

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
  // Read side (spec 5.2): proiezione di sola lettura spinta al renderer dopo il caricamento.
  // In 9a e una sintesi placeholder; in 9c portera lo stato proiettato dagli Event.
  win.webContents.once('did-finish-load', () => {
    const push: ReadModelPush = { version: 0, summary: 'Nessuno stato (scaffold 9a).' };
    win.webContents.send(IPC_CHANNELS.readModelPush, push);
    console.log(`[MAIN] read-model push inviato v${push.version}`);
  });
  return win;
}

void app.whenReady().then(() => {
  console.log('[MAIN] Loomn shell pronto');
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
