// Turno agentico del Master AI (spec 5.4): assembla contesto (stub) -> prompt ->
// LanguageModel.stream -> tool-call -> Zod -> Command -> decide (RNG seedato) -> reinietta
// gli Event REALI nello stesso turno -> il modello narra. Singolo turno agentico in
// streaming (non due chiamate "risolvi->narra"). Il codice e l arbitro, l AI il narratore.
import { decide, applyEvent, type Command, type DomainEvent, type GameState, type Phase, type RandomSource, type Ruleset } from '@loomn/engine';
import { collectResponse, type LanguageModel, type LlmMessage } from './language-model';
import { noopTracer, type TracingPort } from './tracing';
import { masterToolDefs, resolveToolCall } from './master-tools';

const SYSTEM_PROMPT =
  'Sei il Master di un gioco di ruolo. Proponi le azioni chiamando gli strumenti forniti: ' +
  'il motore di gioco le risolve in modo deterministico e ti restituisce gli eventi reali. ' +
  'Non inventare numeri, tiri o esiti: usa gli strumenti, poi narra gli eventi reali che ricevi. ' +
  'Quando non servono altre azioni, rispondi con la narrazione finale in prosa, senza chiamare strumenti.';

/** Stub del Context Assembler (il vero, con budget di token, arriva nel Piano 8). Riassume in
 *  prosa lo stato L1 rilevante: attori (nome, tipo, risorse) e stato dello scontro. */
export function assembleContextStub(state: GameState): string {
  const actors = Object.values(state.actors).map((a) => {
    const res = Object.entries(a.resources)
      .map(([k, p]) => `${k} ${p.current}/${p.max}`)
      .join(', ');
    return `- ${a.name} (${a.kind}, id=${a.id})${res.length > 0 ? `: ${res}` : ''}`;
  });
  const list = actors.length > 0 ? actors.join('\n') : '- (nessun attore)';
  const enc =
    state.encounter === null
      ? 'Nessuno scontro attivo.'
      : `Scontro ${state.encounter.id}: round ${state.encounter.round}, turno ${state.encounter.turnIndex}.`;
  return `Stato attuale (L1):\n${list}\n${enc}`;
}

/** Punto di iniezione del Context Assembler (Piano 8c). `ai` NON importa `memory`: l app
 *  fornisce l impl reale (creata in `memory`) iniettandola in runMasterTurn. La firma
 *  coincide con quella di assembleContextStub, che resta il default. */
export type AssembleContext = (state: GameState) => string;

const PHASE_GUIDANCE: Record<Phase, string> = {
  exploration: 'Fase: esplorazione. Descrivi luoghi e dettagli sensoriali; per iniziare uno scontro usa start_encounter.',
  dialogue: 'Fase: dialogo. Interpreta i PNG in prima persona; dai peso alle scelte sociali.',
  combat: 'Fase: combattimento. Sii tattico e conciso; usa attack/end_turn/next_round e chiudi con end_encounter quando lo scontro e risolto.',
  downtime: 'Fase: tempo libero. Ritmo riflessivo: recupero, preparativi, relazioni.',
};

/** Linea-guida di strategia per la fase data (spec §5.5). Unita pura, riusabile. */
export function phaseGuidance(phase: Phase): string {
  return PHASE_GUIDANCE[phase];
}

/** Costruisce i messaggi iniziali del turno: ruolo/regole + frammento di fase + contesto + azione del giocatore. */
export function buildMasterMessages(context: string, playerAction: string, phase: Phase): LlmMessage[] {
  return [
    { role: 'system', content: `${SYSTEM_PROMPT}\n${phaseGuidance(phase)}` },
    { role: 'system', content: context },
    { role: 'user', content: playerAction },
  ];
}

export interface MasterTurnRequest {
  model: LanguageModel;
  rng: RandomSource;
  /** Ruleset iniettato (vocabolario + dcForDifficulty), spec 5.3. Passato a decide. */
  ruleset: Ruleset;
  state: GameState;
  playerAction: string;
  tracer?: TracingPort;
  /** numero massimo di iterazioni del ciclo agentico (default 6). */
  maxIterations?: number;
  /** Context Assembler iniettato (Piano 8c). Default: assembleContextStub (stub L1 di 7c). */
  assembleContext?: AssembleContext;
}

export interface ToolInvocation {
  toolName: string;
  command: Command;
  events: DomainEvent[];
}

export interface MasterTurnResult {
  state: GameState;
  events: DomainEvent[];
  narration: string;
  invocations: ToolInvocation[];
  transcript: LlmMessage[];
}

function summarizeCalls(names: string[]): string {
  return `Azioni proposte: ${names.join(', ')}`;
}

export async function runMasterTurn(request: MasterTurnRequest): Promise<MasterTurnResult> {
  const tracer = request.tracer ?? noopTracer;
  const maxIterations = request.maxIterations ?? 6;

  let state = request.state;
  const events: DomainEvent[] = [];
  const invocations: ToolInvocation[] = [];
  const assemble = request.assembleContext ?? assembleContextStub;
  const messages: LlmMessage[] = buildMasterMessages(assemble(state), request.playerAction, state.phase);
  let narration = '';

  for (let iter = 0; iter < maxIterations; iter++) {
    const toolDefs = masterToolDefs(state.phase, request.ruleset.vocabulary);
    const res = await collectResponse(request.model.stream({ messages, tools: toolDefs, toolChoice: 'auto' }));
    tracer.record({
      kind: 'response',
      finishReason: res.finishReason,
      textLength: res.text.length,
      toolCallCount: res.toolCalls.length,
    });

    if (res.toolCalls.length === 0) {
      narration = res.text;
      break;
    }

    messages.push({
      role: 'assistant',
      content: res.text.length > 0 ? res.text : summarizeCalls(res.toolCalls.map((c) => c.name)),
    });

    const resultLines: string[] = [];
    for (const call of res.toolCalls) {
      const resolution = resolveToolCall(call.name, call.arguments, request.ruleset.vocabulary);
      if (!resolution.ok) {
        tracer.record({ kind: 'validation-failure', strategy: `tool:${call.name}`, issues: resolution.error });
        resultLines.push(`${call.name}: ARGOMENTI NON VALIDI (${resolution.error}).`);
        continue;
      }
      let produced: DomainEvent[];
      try {
        // Il codice e l arbitro: decide consuma l RNG seedato e produce gli eventi reali.
        produced = decide(state, resolution.command, request.rng, request.ruleset);
      } catch (e) {
        tracer.record({ kind: 'error', message: `decide(${call.name}): ${(e as Error).message}` });
        resultLines.push(`${call.name}: RIFIUTATO dal motore (${(e as Error).message}).`);
        continue;
      }
      for (const ev of produced) state = applyEvent(state, ev);
      events.push(...produced);
      invocations.push({ toolName: call.name, command: resolution.command, events: produced });
      resultLines.push(`${call.name}: ${JSON.stringify(produced)}`);
    }

    // L AI riceve gli Event REALI (reiniettati come messaggio utente: provider-agnostico,
    // non richiede l accoppiamento tool_call_id che l adapter 7a non fa round-trip).
    messages.push({
      role: 'user',
      content: `Eventi reali dal motore:\n${resultLines.join('\n')}\nNarra questi esiti oppure proponi altre azioni.`,
    });
  }

  return { state, events, narration, invocations, transcript: messages };
}
