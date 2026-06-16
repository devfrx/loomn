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
  /** Sottoscrive i push read-side; ritorna una funzione che annulla la sottoscrizione. */
  onReadModelPush(listener: (push: ReadModelPush) => void): () => void;
}
