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
