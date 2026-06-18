import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IPC_CHANNELS,
  type LoomnBridge,
  type DispatchCommand,
  type DispatchResult,
  type RunTurnRequest,
  type RunTurnResult,
  type ProviderConfig,
  type ProviderResult,
  type ReflectRequest,
  type ReflectResult,
  type StatusResult,
  type ReadModelPush,
  type NarrationHistoryRequest,
  type NarrationHistoryResult,
  type CanonRequest,
  type CanonResult,
  type SummariesRequest,
  type SummariesResult,
  type RulesetResult,
} from '@loomn/shared';

// Superficie IPC minima e tipizzata (spec 4): solo i canali del contratto, nessun accesso Node/DB
// esposto al renderer. Costruito a CJS (electron.vite.config) per sandbox:true.
const bridge: LoomnBridge = {
  dispatch: (command: DispatchCommand): Promise<DispatchResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.dispatch, command),
  runTurn: (request: RunTurnRequest): Promise<RunTurnResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.runTurn, request),
  setProvider: (config: ProviderConfig): Promise<ProviderResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.setProvider, config),
  reflect: (request: ReflectRequest): Promise<ReflectResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.reflect, request),
  getStatus: (): Promise<StatusResult> => ipcRenderer.invoke(IPC_CHANNELS.getStatus),
  getNarrationHistory: (request: NarrationHistoryRequest): Promise<NarrationHistoryResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.narrationHistory, request),
  getCanon: (request: CanonRequest): Promise<CanonResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.canon, request),
  getSummaries: (request: SummariesRequest): Promise<SummariesResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.summaries, request),
  getRuleset: (): Promise<RulesetResult> => ipcRenderer.invoke(IPC_CHANNELS.getRuleset),
  onReadModelPush: (listener: (push: ReadModelPush) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, push: ReadModelPush): void => listener(push);
    ipcRenderer.on(IPC_CHANNELS.readModelPush, handler);
    return () => ipcRenderer.off(IPC_CHANNELS.readModelPush, handler);
  },
};

contextBridge.exposeInMainWorld('loomn', bridge);
