// Porta LanguageModel (async, streaming). Tipi agnostici dal provider.

export type LlmRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LlmMessage {
  role: LlmRole;
  content: string;
  /** presente solo sui messaggi role:'tool' (il risultato di una tool-call) */
  toolCallId?: string;
  /** presente solo sui messaggi role:'tool' */
  name?: string;
}

/** Strumento esposto al modello. `parameters` e un oggetto JSON Schema (in 7b lo
 *  genera lo StructuredOutputPort da uno schema Zod). */
export interface LlmToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type LlmResponseFormat =
  | { type: 'text' }
  | { type: 'json_schema'; name: string; schema: Record<string, unknown> };

export interface LlmRequest {
  messages: LlmMessage[];
  tools?: LlmToolDef[];
  toolChoice?: 'auto' | 'required' | 'none';
  responseFormat?: LlmResponseFormat;
  temperature?: number;
}

export type LlmFinishReason = 'stop' | 'tool_calls' | 'length' | 'content_filter' | 'unknown';

export type LlmStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool-call'; id: string; name: string; arguments: string }
  | { type: 'finish'; reason: LlmFinishReason };

/** La porta async/streaming. Gli adapter (OpenAI-compat, Anthropic, ...) la implementano. */
export interface LanguageModel {
  readonly id: string;
  stream(request: LlmRequest): AsyncIterable<LlmStreamEvent>;
}

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface LlmResponse {
  text: string;
  toolCalls: LlmToolCall[];
  finishReason: LlmFinishReason;
}

/** Aggrega uno stream nella risposta completa (comodita non-streaming). */
export async function collectResponse(stream: AsyncIterable<LlmStreamEvent>): Promise<LlmResponse> {
  let text = '';
  const toolCalls: LlmToolCall[] = [];
  let finishReason: LlmFinishReason = 'unknown';
  for await (const e of stream) {
    if (e.type === 'text') text += e.delta;
    else if (e.type === 'tool-call') toolCalls.push({ id: e.id, name: e.name, arguments: e.arguments });
    else finishReason = e.reason;
  }
  return { text, toolCalls, finishReason };
}
