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
  type Command,
  type DomainEvent,
  type GameState,
  type RandomSource,
} from '@loomn/engine';
import { runMasterTurn, type LanguageModel, type StructuredOutputPort } from '@loomn/ai';
import { runReflection } from '@loomn/memory';
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
}

/** Proiezione di sola lettura (read side, spec 5.2). Snapshot completo (delta rimandato, spec 13).
 *  Il 9c-ii la spinge al renderer via IPC. */
export interface ReadModel {
  version: number;
  state: GameState;
}

export interface DispatchOutcome {
  events: DomainEvent[];
  readModel: ReadModel;
}

export interface TurnOutcome {
  narration: string;
  events: DomainEvent[];
  readModel: ReadModel;
}

export interface ReflectOutcome {
  factCount: number;
  summarized: boolean;
}

export interface CampaignService {
  /** Proiezione corrente (in-memory, sempre allineata all event store). */
  getReadModel(): ReadModel;
  /** Write side: valida il Command (decide), persiste gli Event (concorrenza ottimistica),
   *  avanza la proiezione. La Promise rigetta se il Command viola le invarianti (decide lancia). */
  dispatch(command: Command): Promise<DispatchOutcome>;
  /** Turno agentico (spec 5.4) dietro il servizio: assembler reale iniettato, Event reali persistiti. */
  runTurn(playerAction: string): Promise<TurnOutcome>;
  /** Reflection (spec 6.1) sull intero stream corrente come una scena (scope). */
  reflect(scope: string): Promise<ReflectOutcome>;
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
        const events = decide(state, command, deps.rng);
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
          state,
          playerAction,
          assembleContext: deps.memory.assembleContext,
        });
        if (result.events.length > 0) {
          deps.memory.eventStore.append(result.events, startVersion);
          state = result.state;
        }
        return { narration: result.narration, events: result.events, readModel: readModel() };
      });
    },

    reflect(scope: string): Promise<ReflectOutcome> {
      return enqueue(async () => {
        const stored = deps.memory.eventStore.load();
        const res = await runReflection(reflectionDepsFor(deps.memory, deps.structured), {
          events: stored,
          scope,
        });
        return { factCount: res.facts.length, summarized: res.summary !== null };
      });
    },
  };
}
