// Adapter OpenAI-compatibile (LM Studio, OpenAI, OpenRouter, Groq, …). Costruisce la
// richiesta chat-completions, fa streaming SSE, accumula i delta delle tool-call.
import { z } from 'zod';
import type {
  LanguageModel,
  LlmRequest,
  LlmStreamEvent,
  LlmFinishReason,
  LlmMessage,
  LlmToolDef,
} from './language-model';
import type { HttpTransport } from './transport';
import { noopTracer, type TracingPort } from './tracing';

export class LanguageModelError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly body: string,
  ) {
    super(`LanguageModel HTTP ${status} ${statusText}: ${body}`);
    this.name = 'LanguageModelError';
  }
}

export interface OpenAiCompatibleConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  transport: HttpTransport;
  tracer?: TracingPort;
}

// --- costruzione della richiesta (spread condizionali per exactOptionalPropertyTypes) ---

function toWireMessage(m: LlmMessage): Record<string, unknown> {
  return {
    role: m.role,
    content: m.content,
    ...(m.toolCallId !== undefined ? { tool_call_id: m.toolCallId } : {}),
    ...(m.name !== undefined ? { name: m.name } : {}),
  };
}

function toWireTool(t: LlmToolDef): Record<string, unknown> {
  return { type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } };
}

function buildBody(model: string, req: LlmRequest): Record<string, unknown> {
  const responseFormat =
    req.responseFormat === undefined
      ? {}
      : req.responseFormat.type === 'json_schema'
        ? {
            response_format: {
              type: 'json_schema',
              json_schema: { name: req.responseFormat.name, schema: req.responseFormat.schema, strict: true },
            },
          }
        : { response_format: { type: 'text' } };
  return {
    model,
    messages: req.messages.map(toWireMessage),
    stream: true,
    ...(req.tools !== undefined ? { tools: req.tools.map(toWireTool) } : {}),
    ...(req.toolChoice !== undefined ? { tool_choice: req.toolChoice } : {}),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...responseFormat,
  };
}

// --- parsing SSE (verificato robusto agli split di chunk di byte) ---

async function* parseSse(byteChunks: AsyncIterable<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  for await (const chunk of byteChunks) {
    buffer += decoder.decode(chunk, { stream: true });
    let idx = buffer.indexOf('\n\n');
    while (idx !== -1) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const data = sseDataPayload(rawEvent);
      if (data !== undefined) yield data;
      idx = buffer.indexOf('\n\n');
    }
  }
  buffer += decoder.decode();
  const tail = sseDataPayload(buffer);
  if (tail !== undefined) yield tail;
}

function sseDataPayload(rawEvent: string): string | undefined {
  const dataLines: string[] = [];
  for (const line of rawEvent.split('\n')) {
    if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
  }
  return dataLines.length > 0 ? dataLines.join('\n') : undefined;
}

// --- schema del chunk (Zod al confine del wire LLM, spec §4/§7); permissivo sugli extra ---

const chunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z
          .object({
            content: z.string().nullish(),
            tool_calls: z
              .array(
                z.object({
                  index: z.number().optional(),
                  id: z.string().optional(),
                  function: z.object({ name: z.string().optional(), arguments: z.string().optional() }).optional(),
                }),
              )
              .optional(),
          })
          .optional(),
        finish_reason: z.string().nullish(),
      }),
    )
    .optional(),
});

// Alcuni provider OpenAI-compat (LM Studio in primis, sui fallimenti di rendering del template
// Jinja per i tool) rispondono HTTP 200 ma emettono l errore IN-BAND come frame SSE
// { "error": ... } invece di un chunk con choices. Senza questo riconoscimento il frame
// passerebbe chunkSchema (choices opzionale) e verrebbe saltato -> stream vuoto silenzioso ->
// turno vuoto senza diagnostica (finding F2, corroborato dal sibling alice: if "error" in chunk).
// Ritorna il messaggio se il frame e un errore, altrimenti undefined (un chunk di successo con
// "error": null NON e un errore). Estrazione gemella di alice: err.message se oggetto, altrimenti
// la stringa/JSON grezzo.
function streamErrorMessage(json: unknown): string | undefined {
  if (typeof json !== 'object' || json === null) return undefined;
  const err = (json as Record<string, unknown>)['error'];
  if (err === undefined || err === null) return undefined;
  if (typeof err === 'string') return err;
  if (typeof err === 'object') {
    const message = (err as Record<string, unknown>)['message'];
    if (typeof message === 'string') return message;
  }
  return JSON.stringify(err);
}

function mapFinishReason(raw: string | null | undefined): LlmFinishReason {
  switch (raw) {
    case 'stop':
      return 'stop';
    case 'tool_calls':
      return 'tool_calls';
    case 'length':
      return 'length';
    case 'content_filter':
      return 'content_filter';
    default:
      return 'unknown';
  }
}

interface ToolAcc {
  id: string;
  name: string;
  args: string;
}

async function* streamChatCompletion(
  byteChunks: AsyncIterable<Uint8Array>,
  status: number,
  statusText: string,
): AsyncGenerator<LlmStreamEvent> {
  const toolAcc = new Map<number, ToolAcc>();
  let finishReason: LlmFinishReason = 'unknown';
  for await (const payload of parseSse(byteChunks)) {
    if (payload === '[DONE]') break;
    let json: unknown;
    try {
      json = JSON.parse(payload);
    } catch {
      continue; // data: non-JSON (rumore/troncamento del provider): skip difensivo
    }
    // F2: errore in-band del provider su HTTP 200 -> sollevalo invece di inghiottirlo. Lo status
    // riportato e quello HTTP reale (200): l errore vive nel body, non nella riga di stato.
    const streamError = streamErrorMessage(json);
    if (streamError !== undefined) throw new LanguageModelError(status, statusText, streamError);
    const parsed = chunkSchema.safeParse(json);
    if (!parsed.success) continue; // skip difensivo di shape inattesa (heartbeat/extra)
    const choice = parsed.data.choices?.[0];
    if (choice === undefined) continue;
    const delta = choice.delta;
    if (delta !== undefined) {
      if (typeof delta.content === 'string' && delta.content.length > 0) {
        yield { type: 'text', delta: delta.content };
      }
      if (delta.tool_calls !== undefined) {
        for (const tc of delta.tool_calls) {
          const i = tc.index ?? 0;
          const cur = toolAcc.get(i) ?? { id: '', name: '', args: '' };
          if (tc.id !== undefined) cur.id = tc.id;
          if (tc.function?.name !== undefined) cur.name = tc.function.name;
          if (tc.function?.arguments !== undefined) cur.args += tc.function.arguments;
          toolAcc.set(i, cur);
        }
      }
    }
    if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
      finishReason = mapFinishReason(choice.finish_reason);
    }
  }
  for (const [, tc] of [...toolAcc.entries()].sort((a, b) => a[0] - b[0])) {
    yield { type: 'tool-call', id: tc.id, name: tc.name, arguments: tc.args };
  }
  yield { type: 'finish', reason: finishReason };
}

export function createOpenAiCompatibleModel(config: OpenAiCompatibleConfig): LanguageModel {
  const tracer = config.tracer ?? noopTracer;
  return {
    id: config.model,
    async *stream(request: LlmRequest): AsyncGenerator<LlmStreamEvent> {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (config.apiKey !== undefined) headers['authorization'] = `Bearer ${config.apiKey}`;
      tracer.record({
        kind: 'request',
        model: config.model,
        messageCount: request.messages.length,
        hasTools: request.tools !== undefined && request.tools.length > 0,
      });
      const res = await config.transport({
        url: `${config.baseUrl}/chat/completions`,
        headers,
        body: JSON.stringify(buildBody(config.model, request)),
      });
      if (!res.ok) {
        const errText = await res.text();
        tracer.record({ kind: 'error', message: `HTTP ${res.status}` });
        throw new LanguageModelError(res.status, res.statusText, errText);
      }
      let textLength = 0;
      let toolCallCount = 0;
      let finishReason = 'unknown';
      try {
        for await (const event of streamChatCompletion(res.body(), res.status, res.statusText)) {
          if (event.type === 'text') textLength += event.delta.length;
          else if (event.type === 'tool-call') toolCallCount += 1;
          else finishReason = event.reason;
          yield event;
        }
      } catch (err) {
        // F2: un errore in-fase-di-stream (es. frame SSE di errore) non deve passare per la
        // trace di response; tracialo come 'error' e rilancia (il chiamante riceve il throw).
        if (err instanceof LanguageModelError) tracer.record({ kind: 'error', message: `SSE error: ${err.body}` });
        throw err;
      }
      tracer.record({ kind: 'response', finishReason, textLength, toolCallCount });
    },
  };
}
