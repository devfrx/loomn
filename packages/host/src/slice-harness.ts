// slice-harness.ts — THROWAWAY (branch spike/slice-llm). Wiring + osservazione riusabili per lo
// spike di validazione memoria+AI con un LLM reale (LM Studio). NON e codice di produzione: non
// e nel barrel index.ts, lo usa solo il test guardato slice-llm.spike.test.ts (LOOMN_SPIKE=1).
// Pilota @loomn/host (createCampaignService) ESATTAMENTE come fa l app, ma cattura cosa il
// modello VEDE (prompt assemblato) e cosa PROPONE (tool-call grezze), per i findings.
import {
  createRecordingTracer,
  resolveToolCall,
  type LanguageModel,
  type LlmMessage,
  type LlmRequest,
  type LlmStreamEvent,
  type RecordingTracer,
  type ToolResolution,
} from '@loomn/ai';
import { createSeededRandom, type GameState } from '@loomn/engine';
import type { CanonFact, Summary } from '@loomn/memory';
import { createMemorySystem, type MemorySystem } from './memory-system';
import { createLanguageProvider } from './provider';
import { createCampaignService, type CampaignService } from './campaign-service';

/** Una chiamata HTTP al modello, catturata: i messaggi inviati (snapshot) e gli eventi di stream. */
export interface SpyCall {
  messages: LlmMessage[];
  events: LlmStreamEvent[];
}

/** Avvolge un LanguageModel registrando ogni stream(): prompt inviato + eventi emessi. */
export function createSpyModel(inner: LanguageModel): { model: LanguageModel; calls: SpyCall[] } {
  const calls: SpyCall[] = [];
  const model: LanguageModel = {
    id: inner.id,
    async *stream(request: LlmRequest): AsyncIterable<LlmStreamEvent> {
      // runMasterTurn passa lo STESSO array `messages` a ogni iterazione (lo muta con push) ->
      // snapshot con slice() per fotografare il prompt di QUESTA chiamata (i LlmMessage non
      // vengono mutati dopo la creazione, basta copiare l array).
      const events: LlmStreamEvent[] = [];
      calls.push({ messages: request.messages.slice(), events });
      for await (const ev of inner.stream(request)) {
        events.push(ev);
        yield ev;
      }
    },
  };
  return { model, calls };
}

export interface SessionConfig {
  baseUrl: string;
  model: string;
  dbPath: string;
}

export interface Session {
  service: CampaignService;
  memory: MemorySystem;
  tracer: RecordingTracer;
  spy: { model: LanguageModel; calls: SpyCall[] };
  close(): void;
}

/** Monta la sessione reale: DB su file + provider LLM (con tracer) + spia sul modello + service.
 *  RNG seedato (1) -> esiti deterministici dell engine, come l app di dev (9c-ii). */
export function buildSession(config: SessionConfig): Session {
  const memory = createMemorySystem(config.dbPath);
  const tracer = createRecordingTracer();
  const provider = createLanguageProvider({ baseUrl: config.baseUrl, model: config.model, tracer });
  const spy = createSpyModel(provider.model);
  const service = createCampaignService({
    memory,
    model: spy.model,
    structured: provider.structured,
    rng: createSeededRandom(1),
  });
  return { service, memory, tracer, spy, close: () => memory.close() };
}

// --- osservazione ---

export interface ToolCallObservation {
  name: string;
  rawArgs: string;
  resolution: ToolResolution;
}

/** Estrae le tool-call grezze emesse in una chiamata e le riclassifica con resolveToolCall
 *  (valida -> Command, invalida -> motivo Zod): mostra se gli argomenti del modello erano validi. */
export function observeToolCalls(call: SpyCall): ToolCallObservation[] {
  const out: ToolCallObservation[] = [];
  for (const ev of call.events) {
    if (ev.type === 'tool-call') {
      out.push({ name: ev.name, rawArgs: ev.arguments, resolution: resolveToolCall(ev.name, ev.arguments) });
    }
  }
  return out;
}

export interface MemorySnapshot {
  context: string;
  facts: CanonFact[];
  summaries: Summary[];
}

/** Cosa vedrebbe il prossimo turno: contesto assemblato (L1+L1.5+L2), L1.5 attivo, L2. */
export function snapshotMemory(memory: MemorySystem, state: GameState): MemorySnapshot {
  return {
    context: memory.assembleContext(state),
    facts: memory.ledger.active(),
    summaries: memory.summaries.list(),
  };
}

// --- rendering markdown (reporter) ---

function fence(s: string): string {
  return '```\n' + s + '\n```';
}

export function renderPrompt(call: SpyCall): string {
  return call.messages.map((m) => `**[${m.role}]**\n${fence(m.content)}`).join('\n');
}

export function renderStream(call: SpyCall): string {
  const parts: string[] = [];
  for (const ev of call.events) {
    if (ev.type === 'text') parts.push(`text: ${JSON.stringify(ev.delta)}`);
    else if (ev.type === 'tool-call') parts.push(`tool-call ${ev.name}(${ev.arguments})`);
    else parts.push(`finish: ${ev.reason}`);
  }
  return fence(parts.length > 0 ? parts.join('\n') : '(nessun evento)');
}

export function renderToolObservations(obs: ToolCallObservation[]): string {
  if (obs.length === 0) return '_(nessuna tool-call)_';
  return obs
    .map((o) => {
      const verdict = o.resolution.ok
        ? `VALIDA -> ${JSON.stringify(o.resolution.command)}`
        : `INVALIDA -> ${o.resolution.error}`;
      return `- \`${o.name}\` args=\`${o.rawArgs}\`\n  - ${verdict}`;
    })
    .join('\n');
}

export function renderTracer(tracer: RecordingTracer): string {
  return fence(tracer.events.length > 0 ? tracer.events.map((e) => JSON.stringify(e)).join('\n') : '(vuoto)');
}

export function renderSnapshot(snap: MemorySnapshot): string {
  const facts =
    snap.facts.length > 0
      ? snap.facts
          .map((f) => `- (${f.subject}) ${f.predicate} (${f.object}) [seq=${f.eventSeq}, sal=${f.salience}, ${f.status}]`)
          .join('\n')
      : '_(nessun fatto attivo)_';
  const sums =
    snap.summaries.length > 0
      ? snap.summaries
          .map(
            (s) =>
              `- [${s.level}/${s.scope}] ${s.text} (imp=${s.importance}, sal=${s.salience}, seq ${s.eventSeqFrom}-${s.eventSeqTo})`,
          )
          .join('\n')
      : '_(nessun riassunto)_';
  return `**Context Assembler (cosa vede il prossimo turno):**\n${fence(snap.context)}\n\n**Canon Ledger (L1.5) attivo:**\n${facts}\n\n**Summary Store (L2):**\n${sums}`;
}
