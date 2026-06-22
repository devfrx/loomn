// Contratto IPC (spec 4): UNICA fonte di nomi canale, schemi Zod dei payload e tipi inferiti,
// condivisa dai tre processi Electron. `shared` resta foglia: importa solo `zod` e gli schemi di
// ./domain-schema (stesso pacchetto), mai electron ne altri @loomn/*. La validazione Zod ai confini
// IPC (payload non fidati renderer->main) usa questi schemi; il read side e una proiezione di sola
// lettura {version, state} spinta dal main (spec 5.2).
import { z } from 'zod';
import { commandSchema, domainEventSchema, gameStateSchema } from './domain-schema';

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
  /** invoke/handle: storia di narrazione (eventi NarrationRecorded) paginata cursor-by-seq. */
  narrationHistory: 'loomn:narration-history',
  /** invoke/handle: canon ledger L1.5 (fatti attivi o tutti) filtrabile. */
  canon: 'loomn:canon',
  /** invoke/handle: riassunti narrativi L2 filtrabili per livello/scope. */
  summaries: 'loomn:summaries',
  /** invoke/handle: vocabolario di gioco + enum statici + regole di fase (Ruleset, read-side 10g). */
  getRuleset: 'loomn:get-ruleset',
  /** send/on (push main->renderer): proiezione read-side {version, state} (spec 5.2). */
  readModelPush: 'loomn:read-model-push',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

// --- dispatch (write side) ---
/** Il payload di dispatch e un Command: lo valida commandSchema al confine non fidato (spec 4). */
export const dispatchRequestSchema = commandSchema;
/** Forma del Command lato chiamante (input dello schema, prima del .transform di Attack). */
export type DispatchCommand = z.input<typeof commandSchema>;

/** Esito tipizzato del dispatch: union ok/errore -> il main non propaga stack trace grezzi.
 *  `events` (coi RollResult) sono additivi: gia ritornati da CampaignService, ora esposti (read). */
export const dispatchResultSchema = z.union([
  z.object({
    ok: z.literal(true),
    version: z.number().int().nonnegative(),
    events: z.array(domainEventSchema),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type DispatchResult = z.infer<typeof dispatchResultSchema>;

// --- runTurn (turno agentico) ---
export const runTurnRequestSchema = z.object({ playerAction: z.string() });
export type RunTurnRequest = z.infer<typeof runTurnRequestSchema>;

export const runTurnResultSchema = z.union([
  z.object({
    ok: z.literal(true),
    narration: z.string(),
    version: z.number().int().nonnegative(),
    events: z.array(domainEventSchema),
  }),
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

// --- getStatus (diagnostica + read-back config provider) ---
/** provider e il read-back della config persistita per pre-compilare Impostazioni (10f): baseUrl/model
 *  + hasApiKey (la chiave non attraversa MAI l IPC). Opzionale-assente quando nessun provider e salvato. */
export const statusResultSchema = z.object({
  version: z.number().int().nonnegative(),
  safeStorageAvailable: z.boolean(),
  providerConfigured: z.boolean(),
  provider: z
    .object({ baseUrl: z.string(), model: z.string(), hasApiKey: z.boolean() })
    .optional(),
});
export type StatusResult = z.infer<typeof statusResultSchema>;

// --- narrationHistory (storia di narrazione, cursor-by-seq) ---
/** Cursor-by-seq: `before` legge le voci con seq < before (paginazione "carica piu vecchie");
 *  `limit` (default lato host) limita la finestra. Stabile sotto append (lo stream non slitta). */
export const narrationHistoryRequestSchema = z.object({
  before: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(200).optional(),
});
export type NarrationHistoryRequest = z.infer<typeof narrationHistoryRequestSchema>;

export const narrationEntrySchema = z.object({
  seq: z.number().int().positive(),
  playerAction: z.string(),
  narration: z.string(),
});
export type NarrationEntryDto = z.infer<typeof narrationEntrySchema>;

/** entries e newest-first; hasMore = esistono voci piu vecchie oltre la finestra. */
export const narrationHistoryResultSchema = z.union([
  z.object({ ok: z.literal(true), entries: z.array(narrationEntrySchema), hasMore: z.boolean() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type NarrationHistoryResult = z.infer<typeof narrationHistoryResultSchema>;

// --- canon (L1.5 canon ledger) ---
/** Filtro opzionale + includeRetracted: false (default) -> solo attivi; true -> attivi e ritirati. */
export const canonRequestSchema = z.object({
  includeRetracted: z.boolean().optional(),
  subject: z.string().optional(),
  predicate: z.string().optional(),
  object: z.string().optional(),
});
export type CanonRequest = z.infer<typeof canonRequestSchema>;

/** DTO del fatto canon (rispecchia CanonFact di @loomn/memory; l assegnabilita memory->DTO e
 *  imposta a compile-time dall handler IPC del main, vedi Task 5). */
export const canonFactSchema = z.object({
  id: z.string(),
  subject: z.string(),
  predicate: z.string(),
  object: z.string(),
  eventSeq: z.number().int().nonnegative(),
  salience: z.number().finite(),
  status: z.enum(['active', 'retracted']),
});
export type CanonFactDto = z.infer<typeof canonFactSchema>;

export const canonResultSchema = z.union([
  z.object({ ok: z.literal(true), facts: z.array(canonFactSchema) }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type CanonResult = z.infer<typeof canonResultSchema>;

// --- summaries (L2 memoria narrativa) ---
export const summariesRequestSchema = z.object({
  level: z.enum(['scene', 'session', 'arc', 'campaign']).optional(),
  scope: z.string().optional(),
});
export type SummariesRequest = z.infer<typeof summariesRequestSchema>;

/** DTO del riassunto L2 (rispecchia Summary di @loomn/memory; assegnabilita imposta dall handler). */
export const summarySchema = z.object({
  id: z.string(),
  level: z.enum(['scene', 'session', 'arc', 'campaign']),
  scope: z.string(),
  text: z.string(),
  importance: z.number().finite(),
  salience: z.number().finite(),
  createdAt: z.number().int().nonnegative(),
  eventSeqFrom: z.number().int().nonnegative(),
  eventSeqTo: z.number().int().nonnegative(),
});
export type SummaryDto = z.infer<typeof summarySchema>;

export const summariesResultSchema = z.union([
  z.object({ ok: z.literal(true), summaries: z.array(summarySchema) }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type SummariesResult = z.infer<typeof summariesResultSchema>;

// --- getRuleset (vocabolario di gioco + enum statici + regole di fase, read-side per i form GM) ---
/** DTO del Ruleset (10g): il vocabolario di modulo (attributi/abilita/risorse/difese/defaultResources)
 *  iniettato nel main e NON presente nel read-model {version,state} (e la LENTE, non lo stato) + gli
 *  enum statici di comando + le regole di legalita-per-fase dei comandi (da isCommandLegalInPhase, per
 *  disabilitare i comandi GM illegali nella fase corrente). Gli array di enum sono trasporto di liste
 *  di valori (string[]); il renderer ha gli stessi enum TIPIZZATI come const esportati da @loomn/shared.
 *  L assegnabilita host->DTO e imposta a compile-time dall handler del main (drift guard read, come
 *  canon/summary del Piano 0). */
export const rulesetResultSchema = z.union([
  z.object({
    ok: z.literal(true),
    vocabulary: z.object({
      attributes: z.array(z.string()),
      skills: z.array(z.string()),
      resources: z.array(z.string()),
      defenses: z.array(z.string()),
      defaultResources: z.record(z.string(), z.object({ current: z.number(), max: z.number() })),
    }),
    difficulties: z.array(z.string()),
    softPhases: z.array(z.string()),
    questOutcomes: z.array(z.string()),
    directions: z.array(z.string()),
    commandPhaseRules: z.object({
      combatOnly: z.array(z.string()),
      nonCombatOnly: z.array(z.string()),
    }),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type RulesetResult = z.infer<typeof rulesetResultSchema>;

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
  /** Storia di narrazione paginata (cursor-by-seq), newest-first. */
  getNarrationHistory(request: NarrationHistoryRequest): Promise<NarrationHistoryResult>;
  /** Canon ledger L1.5 (attivi o tutti) filtrabile. */
  getCanon(request: CanonRequest): Promise<CanonResult>;
  /** Riassunti L2 filtrabili per livello/scope. */
  getSummaries(request: SummariesRequest): Promise<SummariesResult>;
  /** Vocabolario di gioco + enum statici + regole di fase (Ruleset, read-side 10g). Nessun payload. */
  getRuleset(): Promise<RulesetResult>;
  /** Sottoscrive i push read-side; ritorna una funzione che annulla la sottoscrizione. */
  onReadModelPush(listener: (push: ReadModelPush) => void): () => void;
}
