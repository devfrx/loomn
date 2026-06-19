// Servizio applicativo della campagna: write side + proiezione read side (spec 5.1/5.2).
// Vive in @loomn/host (composizione): orchestra engine (decide/applyEvent/rebuild) + memoria
// (MemorySystem, UNA connessione) + AI (runMasterTurn con assembler reale iniettato; Reflection
// con porte LLM-backed). Tutto a porte INIETTATE -> testabile su ABI Node (createMemorySystem
// ':memory:' + fake model/port). Electron (9c-ii) ne sara solo l adapter IPC sottile.
// Le operazioni mutanti (dispatch/runTurn/reflect) sono SERIALIZZATE (coda FIFO): il turno
// agentico e asincrono e non deve interfogliarsi con i dispatch (concorrenza ottimistica, 5.6).
import {
  decide,
  applyEvent,
  rebuild,
  isCommandLegalInPhase,
  COMMAND_TYPES,
  DIFFICULTIES,
  SOFT_PHASES,
  QUEST_OUTCOMES,
  RESOURCE_DIRECTIONS,
  type Command,
  type DomainEvent,
  type GameState,
  type RandomSource,
  type Ruleset,
} from '@loomn/engine';
import { runMasterTurn, type LanguageModel, type StructuredOutputPort } from '@loomn/ai';
import { runScenesReflection } from '@loomn/memory';
import type { CanonFact, CanonFactFilter, NarrationWindow, Summary, SummaryFilter } from '@loomn/memory';
import type { MemorySystem } from './memory-system';
import { reflectionDepsFor } from './reflection-ports';

export interface CampaignServiceDeps {
  /** Sottosistema di memoria su UNA connessione (event store + ledger + summaries + assembler). */
  memory: MemorySystem;
  /** Modello reale per il turno agentico (runMasterTurn). */
  model: LanguageModel;
  /** Porta structured output per la Reflection (extract/summarize). */
  structured: StructuredOutputPort;
  /** RNG seedato: decide lo consuma e registra i fatti risolti negli Event (replay senza RNG). */
  rng: RandomSource;
  /** Ruleset iniettato (vocabolario + dcForDifficulty): passato a decide e runMasterTurn. */
  ruleset: Ruleset;
}

/** Proiezione di sola lettura (read side, spec 5.2). Snapshot completo (delta rimandato, spec 13).
 *  Il 9c-ii la spinge al renderer via IPC. */
export interface ReadModel {
  version: number;
  /** Riferimento PUNTUALE alla proiezione interna: trattarlo come SOLA LETTURA (non mutarlo).
   *  Gli aggiornamenti del motore sono immutabili e il confine IPC del 9c-ii fa structured-clone. */
  state: GameState;
}

export interface DispatchOutcome {
  events: DomainEvent[];
  readModel: ReadModel;
}

export interface TurnOutcome {
  narration: string;
  /** Event MECCANICI prodotti dal turno (tool-call risolte da decide). NON include il
   *  NarrationRecorded: quello e persistenza di stream (spec F4). Quindi readModel.version
   *  avanza di events.length + (narration.length > 0 ? 1 : 0). */
  events: DomainEvent[];
  readModel: ReadModel;
}

export interface ReflectOutcome {
  factCount: number;
  summarized: boolean;
}

/** Una voce della storia di narrazione (evento NarrationRecorded col suo seq di stream). */
export interface NarrationEntry {
  seq: number;
  playerAction: string;
  narration: string;
}

/** Pagina di storia di narrazione, newest-first (cursor-by-seq). */
export interface NarrationHistory {
  entries: NarrationEntry[];
  hasMore: boolean;
}

/** Cursor-by-seq: `before` -> voci con seq < before; `limit` (default 50) limita la finestra. */
export interface NarrationHistoryQuery {
  before?: number;
  limit?: number;
}

/** Filtro canon + includeRetracted (default false = solo attivi). */
export interface CanonQuery extends CanonFactFilter {
  includeRetracted?: boolean;
}

/** Vista read-side del Ruleset (10g): vocabolario di modulo iniettato + enum statici di comando +
 *  regole di legalita-per-fase. Config STATICA (deps.ruleset), non play-state -> read sincrono fuori
 *  dalla coda. Gli array di enum sono trasporto di valori (string[]); i tipi precisi vivono come const
 *  esportati da @loomn/shared (renderer) e come const di @loomn/engine (qui). */
export interface RulesetView {
  vocabulary: {
    attributes: string[];
    skills: string[];
    resources: string[];
    defenses: string[];
    defaultResources: Record<string, { current: number; max: number }>;
  };
  difficulties: string[];
  softPhases: string[];
  questOutcomes: string[];
  directions: string[];
  commandPhaseRules: { combatOnly: string[]; nonCombatOnly: string[] };
}

export interface CampaignService {
  /** Proiezione corrente (in-memory, sempre allineata all event store). */
  getReadModel(): ReadModel;
  /** Write side: valida il Command (decide), persiste gli Event (concorrenza ottimistica),
   *  avanza la proiezione. La Promise rigetta se il Command viola le invarianti (decide lancia). */
  dispatch(command: Command): Promise<DispatchOutcome>;
  /** Turno agentico (spec 5.4) dietro il servizio: assembler reale iniettato, Event reali persistiti. */
  runTurn(playerAction: string): Promise<TurnOutcome>;
  /** Reflection (spec 6.1, item 6): riflette in modo incrementale le scene non ancora riflesse
   *  (segmentate ai confini di fase), avanzando il watermark; lo `scope` etichetta i riassunti. */
  reflect(scope: string): Promise<ReflectOutcome>;
  /** Storia di narrazione (eventi NarrationRecorded) paginata cursor-by-seq, newest-first.
   *  Read puro (non accodato): legge lo stream committato. */
  getNarrationHistory(query?: NarrationHistoryQuery): NarrationHistory;
  /** Canon ledger L1.5: fatti attivi (default) o tutti (includeRetracted), filtrabili. */
  getCanon(query?: CanonQuery): CanonFact[];
  /** Riassunti L2 filtrabili per livello/scope. */
  getSummaries(filter?: SummaryFilter): Summary[];
  /** Vocabolario di gioco + enum statici + regole di fase (read-side per i form data-driven di
   *  10f/10d). Read puro su config iniettata (non accodato): non legge mai `state`. */
  getRuleset(): RulesetView;
}

export function createCampaignService(deps: CampaignServiceDeps): CampaignService {
  // Proiezione in-memory ricostruita dallo stream all avvio (spec 9: proiezioni in-memory + snapshot).
  let state: GameState = rebuild(deps.memory.eventStore.load());

  // Coda FIFO: serializza le operazioni mutanti (niente interfogliamento del turno async col dispatch).
  let tail: Promise<unknown> = Promise.resolve();
  function enqueue<T>(op: () => T | Promise<T>): Promise<T> {
    const run = tail.then(op, op);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  const readModel = (): ReadModel => ({ version: state.version, state });

  return {
    getReadModel: readModel,

    dispatch(command: Command): Promise<DispatchOutcome> {
      return enqueue(() => {
        const expected = state.version;
        const events = decide(state, command, deps.rng, deps.ruleset);
        deps.memory.eventStore.append(events, expected);
        for (const ev of events) state = applyEvent(state, ev);
        return { events, readModel: readModel() };
      });
    },

    runTurn(playerAction: string): Promise<TurnOutcome> {
      return enqueue(async () => {
        const startVersion = state.version;
        const result = await runMasterTurn({
          model: deps.model,
          rng: deps.rng,
          ruleset: deps.ruleset,
          state,
          playerAction,
          assembleContext: deps.memory.assembleContext,
        });
        // La narrazione del Master entra nello stream come NarrationRecorded (spec F4): cosi la
        // storia e rebuild-safe e la Reflection puo spogliarla. e l unico evento non prodotto da
        // decide (registra l output dell AI: nessun RNG ne validazione meccanica). result.state
        // ha gia applicato result.events; applichiamo SOLO la narrazione sopra.
        const toStore: DomainEvent[] = [...result.events];
        let nextState = result.state;
        if (result.narration.length > 0) {
          const narrationEvent: DomainEvent = {
            type: 'NarrationRecorded',
            playerAction,
            narration: result.narration,
          };
          toStore.push(narrationEvent);
          nextState = applyEvent(nextState, narrationEvent);
        }
        if (toStore.length > 0) {
          deps.memory.eventStore.append(toStore, startVersion);
          state = nextState;
        }
        // TurnOutcome.events resta la lista MECCANICA: il NarrationRecorded e persistenza di stream,
        // non un esito meccanico del turno. La version del read model riflette comunque il bump.
        return { narration: result.narration, events: result.events, readModel: readModel() };
      });
    },

    reflect(scope: string): Promise<ReflectOutcome> {
      return enqueue(async () => {
        // Legge SOLO gli eventi freschi (seq > watermark): evita di Zod-parsare l intero stream a ogni
        // reflect (I-05). runScenesReflection ri-filtra sullo STESSO cursore (no-op) e avanza il watermark.
        const fresh = deps.memory.eventStore.loadSince(deps.memory.cursor.get());
        const results = await runScenesReflection(reflectionDepsFor(deps.memory, deps.structured), {
          events: fresh,
          scope,
        });
        const factCount = results.reduce((n, r) => n + r.facts.length, 0);
        const summarized = results.some((r) => r.summary !== null);
        return { factCount, summarized };
      });
    },

    // Read on-demand (spec 5.2). NON accodati: la coda FIFO serializza solo le mutazioni; questi
    // leggono stato SQLite gia committato (vista coerente anche durante un turno async).
    getNarrationHistory(query: NarrationHistoryQuery = {}): NarrationHistory {
      // Clamp difensivo: limit<=0 o frazionario ritornerebbe garbage (M-05). Il confine IPC gia impone
      // .int().positive().max(200), ma CampaignService e chiamabile direttamente (difesa in profondita).
      // `|| 1` mappa anche NaN (Math.trunc(NaN)=NaN) a 1 prima del clamp: un limit non-finito da un
      // chiamante diretto su ABI Node non deve diventare LIMIT NaN (SQLite lo tratterebbe come "tutto").
      const limit = Math.max(1, Math.trunc(query.limit ?? 50) || 1);
      // Finestra DB-side: chiediamo limit+1 righe per sapere se c e un altra pagina (hasMore), senza
      // contare/caricare l intero stream (I-05).
      const window: NarrationWindow = {
        limit: limit + 1,
        ...(query.before !== undefined ? { before: query.before } : {}),
      };
      const rows = deps.memory.eventStore.loadNarration(window); // gia newest-first
      const hasMore = rows.length > limit;
      const entries: NarrationEntry[] = rows.slice(0, limit).map((s) => {
        // loadNarration filtra type='NarrationRecorded' DB-side; il narrowing rende esplicito il tipo.
        if (s.event.type !== 'NarrationRecorded') {
          throw new Error('loadNarration ha restituito un evento non-narrazione');
        }
        return { seq: s.seq, playerAction: s.event.playerAction, narration: s.event.narration };
      });
      return { entries, hasMore };
    },

    getCanon(query: CanonQuery = {}): CanonFact[] {
      const { includeRetracted, ...filter } = query;
      return includeRetracted ? deps.memory.ledger.all(filter) : deps.memory.ledger.active(filter);
    },

    getSummaries(filter: SummaryFilter = {}): Summary[] {
      return deps.memory.summaries.list(filter);
    },

    // Ruleset read-side (10g): proiezione della config STATICA iniettata (deps.ruleset) + enum di
    // comando del motore + regole di legalita-per-fase derivate da isCommandLegalInPhase. NON accodato
    // (non legge mai `state`): e la LENTE del gioco, non play-state.
    // MEMBERSHIP e ORDINE derivano entrambi da COMMAND_TYPES filtrato con isCommandLegalInPhase (unica
    // fonte di verita): un comando combat-only aggiunto al motore compare qui automaticamente. Il
    // renderer usa membership (.includes), non la posizione, quindi l ordine resta cosmetico.
    getRuleset(): RulesetView {
      const v = deps.ruleset.vocabulary;
      // MEMBERSHIP e ORDINE derivano entrambi da COMMAND_TYPES (vocabolario del motore, guardato
      // esaustivo a compile-time) filtrato con isCommandLegalInPhase: una sola fonte di verita. Un
      // comando combat-only aggiunto in futuro al motore compare qui automaticamente. L ordine e
      // quello (deterministico) di COMMAND_TYPES; il renderer usa membership (.includes), non la posizione.
      const combatOnly = COMMAND_TYPES.filter(
        (t) => isCommandLegalInPhase('combat', t) && !isCommandLegalInPhase('exploration', t),
      );
      const nonCombatOnly = COMMAND_TYPES.filter(
        (t) => !isCommandLegalInPhase('combat', t) && isCommandLegalInPhase('exploration', t),
      );
      return {
        vocabulary: {
          attributes: [...v.attributes],
          skills: [...v.skills],
          resources: [...v.resources],
          defenses: [...v.defenses],
          defaultResources: Object.fromEntries(
            Object.entries(v.defaultResources).map(([k, pool]) => [k, { current: pool.current, max: pool.max }]),
          ),
        },
        difficulties: [...DIFFICULTIES],
        softPhases: [...SOFT_PHASES],
        questOutcomes: [...QUEST_OUTCOMES],
        directions: [...RESOURCE_DIRECTIONS],
        commandPhaseRules: { combatOnly: [...combatOnly], nonCombatOnly: [...nonCombatOnly] },
      };
    },
  };
}
