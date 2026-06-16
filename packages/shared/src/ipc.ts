// Contratto IPC (spec 4): UNICA fonte di nomi canale, schemi Zod dei payload e tipi inferiti,
// condivisa dai tre processi Electron. `shared` resta foglia: importa solo `zod` e gli schemi di
// ./domain-schema (stesso pacchetto), mai electron ne altri @loomn/*. La validazione Zod ai confini
// IPC (payload non fidati renderer->main) usa questi schemi; il read side e una proiezione di sola
// lettura {version, state} spinta dal main (spec 5.2).
import { z } from 'zod';
import { commandSchema, gameStateSchema } from './domain-schema';

/** Nomi dei canali IPC (prefisso `loomn:` per evitare collisioni). */
export const IPC_CHANNELS = {
  /** invoke/handle: write side. Renderer->main: un Command (validato con commandSchema). */
  dispatch: 'loomn:dispatch',
  /** invoke/handle: turno agentico (spec 5.4). Richiede un provider configurato. */
  runTurn: 'loomn:run-turn',
  /** invoke/handle: configura il provider AI (chiave cifrata con safeStorage nel main). */
  setProvider: 'loomn:set-provider',
  /** invoke/handle: Reflection (spec 6.1) sullo stream corrente. */
  reflect: 'loomn:reflect',
  /** invoke/handle: stato diagnostico (versione, safeStorage, provider). Nessun side effect. */
  getStatus: 'loomn:get-status',
  /** send/on (push main->renderer): proiezione read-side {version, state} (spec 5.2). */
  readModelPush: 'loomn:read-model-push',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

// --- dispatch (write side) ---
/** Il payload di dispatch e un Command: lo valida commandSchema al confine non fidato (spec 4). */
export const dispatchRequestSchema = commandSchema;
/** Forma del Command lato chiamante (input dello schema, prima del .transform di Attack). */
export type DispatchCommand = z.input<typeof commandSchema>;

/** Esito tipizzato del dispatch: union ok/errore -> il main non propaga stack trace grezzi. */
export const dispatchResultSchema = z.union([
  z.object({ ok: z.literal(true), version: z.number().int().nonnegative() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type DispatchResult = z.infer<typeof dispatchResultSchema>;

// --- runTurn (turno agentico) ---
export const runTurnRequestSchema = z.object({ playerAction: z.string() });
export type RunTurnRequest = z.infer<typeof runTurnRequestSchema>;

export const runTurnResultSchema = z.union([
  z.object({ ok: z.literal(true), narration: z.string(), version: z.number().int().nonnegative() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type RunTurnResult = z.infer<typeof runTurnResultSchema>;

// --- setProvider (config AI) ---
export const providerConfigSchema = z.object({
  baseUrl: z.string(),
  model: z.string(),
  apiKey: z.string().optional(),
});
export type ProviderConfig = z.infer<typeof providerConfigSchema>;

export const providerResultSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type ProviderResult = z.infer<typeof providerResultSchema>;

// --- reflect (Reflection) ---
export const reflectRequestSchema = z.object({ scope: z.string() });
export type ReflectRequest = z.infer<typeof reflectRequestSchema>;

export const reflectResultSchema = z.union([
  z.object({ ok: z.literal(true), factCount: z.number().int().nonnegative(), summarized: z.boolean() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type ReflectResult = z.infer<typeof reflectResultSchema>;

// --- getStatus (diagnostica) ---
export const statusResultSchema = z.object({
  version: z.number().int().nonnegative(),
  safeStorageAvailable: z.boolean(),
  providerConfigured: z.boolean(),
});
export type StatusResult = z.infer<typeof statusResultSchema>;

// --- read-model push (read side) ---
/** Proiezione read-side spinta dal main (spec 5.2): snapshot {version, state}. Il protocollo delta
 *  (spec 13) resta rimandato (YAGNI). `state` e validato con gameStateSchema (riuso del Piano 6). */
export const readModelPushSchema = z.object({
  version: z.number().int().nonnegative(),
  state: gameStateSchema,
});
export type ReadModelPush = z.infer<typeof readModelPushSchema>;

/** Superficie IPC esposta dal preload al renderer (contratto tipizzato del bridge). */
export interface LoomnBridge {
  /** Write side: invia un Command; il main lo valida e risponde con esito tipizzato. */
  dispatch(command: DispatchCommand): Promise<DispatchResult>;
  /** Turno agentico (richiede un provider configurato). */
  runTurn(request: RunTurnRequest): Promise<RunTurnResult>;
  /** Configura il provider AI (la chiave viene cifrata nel main). */
  setProvider(config: ProviderConfig): Promise<ProviderResult>;
  /** Reflection sullo stream corrente. */
  reflect(request: ReflectRequest): Promise<ReflectResult>;
  /** Stato diagnostico (nessun side effect). */
  getStatus(): Promise<StatusResult>;
  /** Sottoscrive i push read-side; ritorna una funzione che annulla la sottoscrizione. */
  onReadModelPush(listener: (push: ReadModelPush) => void): () => void;
}
