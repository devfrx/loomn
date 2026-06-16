import { describe, it, expect } from 'vitest';
import { createOpenAiCompatibleModel, LanguageModelError } from './openai-adapter';
import { collectResponse, type LlmRequest } from './language-model';
import { createRecordingTracer } from './tracing';
import type { HttpTransport, HttpResponse } from './transport';

// Fake transport: cattura la richiesta, rigioca SSE predefinito (a chunk piccoli).
function fakeTransport(
  sse: string,
  opts: { ok?: boolean; status?: number; errorText?: string } = {},
): { transport: HttpTransport; lastBody: () => unknown } {
  let captured: unknown;
  const transport: HttpTransport = async (req) => {
    captured = JSON.parse(req.body) as unknown;
    const res: HttpResponse = {
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      statusText: 'OK',
      async *body() {
        const bytes = new TextEncoder().encode(sse);
        for (let i = 0; i < bytes.length; i += 5) yield bytes.slice(i, i + 5);
      },
      async text() {
        return opts.errorText ?? sse;
      },
    };
    return res;
  };
  return { transport, lastBody: () => captured };
}

const SSE = [
  'data: {"choices":[{"delta":{"content":"Il goblin "}}]}\n\n',
  'data: {"choices":[{"delta":{"content":"attacca."}}]}\n\n',
  'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"request_check","arguments":"{\\"dc\\":"}}]}}]}\n\n',
  'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"12}"}}]}}]}\n\n',
  'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
  'data: [DONE]\n\n',
].join('');

// Due tool-call parallele, frammentate; index 1 introdotta PRIMA della 0 per
// esercitare l ordinamento per index in fase di emissione.
const SSE_PARALLEL = [
  'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_b","function":{"name":"apply_effect","arguments":"{\\"key\\":"}}]}}]}\n\n',
  'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_a","function":{"name":"request_check","arguments":"{\\"dc\\":"}}]}}]}\n\n',
  'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"function":{"arguments":"\\"poison\\"}"}}]}}]}\n\n',
  'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"10}"}}]}}]}\n\n',
  'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
  'data: [DONE]\n\n',
].join('');

describe('adapter OpenAI-compatibile', () => {
  it('trasmette i delta di testo e accumula una tool-call frammentata', async () => {
    const { transport } = fakeTransport(SSE);
    const model = createOpenAiCompatibleModel({ baseUrl: 'http://x/v1', model: 'm', transport });
    const res = await collectResponse(model.stream({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.text).toBe('Il goblin attacca.');
    expect(res.finishReason).toBe('tool_calls');
    expect(res.toolCalls).toEqual([{ id: 'call_1', name: 'request_check', arguments: '{"dc":12}' }]);
  });

  it('costruisce un body OpenAI-compatibile con tools, tool_choice e json_schema', async () => {
    const { transport, lastBody } = fakeTransport('data: [DONE]\n\n');
    const model = createOpenAiCompatibleModel({ baseUrl: 'http://x/v1', model: 'gpt', transport, apiKey: 'k' });
    const req: LlmRequest = {
      messages: [{ role: 'system', content: 'be a master' }],
      tools: [{ name: 'request_check', description: 'roll a check', parameters: { type: 'object' } }],
      toolChoice: 'auto',
      responseFormat: { type: 'json_schema', name: 'check', schema: { type: 'object' } },
      temperature: 0.7,
    };
    await collectResponse(model.stream(req));
    const body = lastBody() as Record<string, unknown>;
    expect(body['model']).toBe('gpt');
    expect(body['stream']).toBe(true);
    expect(body['tool_choice']).toBe('auto');
    expect(body['temperature']).toBe(0.7);
    expect(Array.isArray(body['tools'])).toBe(true);
    expect(body['response_format']).toEqual({
      type: 'json_schema',
      json_schema: { name: 'check', schema: { type: 'object' }, strict: true },
    });
  });

  it('omette i campi opzionali assenti dal body', async () => {
    const { transport, lastBody } = fakeTransport('data: [DONE]\n\n');
    const model = createOpenAiCompatibleModel({ baseUrl: 'http://x/v1', model: 'm', transport });
    await collectResponse(model.stream({ messages: [{ role: 'user', content: 'hi' }] }));
    const body = lastBody() as Record<string, unknown>;
    expect('tools' in body).toBe(false);
    expect('tool_choice' in body).toBe(false);
    expect('temperature' in body).toBe(false);
    expect('response_format' in body).toBe(false);
  });

  it('lancia LanguageModelError su risposta non ok', async () => {
    const { transport } = fakeTransport('boom', { ok: false, status: 401, errorText: 'unauthorized' });
    const model = createOpenAiCompatibleModel({ baseUrl: 'http://x/v1', model: 'm', transport });
    await expect(collectResponse(model.stream({ messages: [] }))).rejects.toBeInstanceOf(LanguageModelError);
  });

  it('registra le trace di richiesta e risposta', async () => {
    const tracer = createRecordingTracer();
    const { transport } = fakeTransport(SSE);
    const model = createOpenAiCompatibleModel({ baseUrl: 'http://x/v1', model: 'm', transport, tracer });
    await collectResponse(model.stream({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(tracer.events.map((e) => e.kind)).toEqual(['request', 'response']);
    const response = tracer.events.find((e) => e.kind === 'response');
    expect(response).toMatchObject({ finishReason: 'tool_calls', toolCallCount: 1 });
  });

  it('accumula tool-call parallele e le emette ordinate per index', async () => {
    const { transport } = fakeTransport(SSE_PARALLEL);
    const model = createOpenAiCompatibleModel({ baseUrl: 'http://x/v1', model: 'm', transport });
    const res = await collectResponse(model.stream({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.toolCalls).toEqual([
      { id: 'call_a', name: 'request_check', arguments: '{"dc":10}' },
      { id: 'call_b', name: 'apply_effect', arguments: '{"key":"poison"}' },
    ]);
  });

  it('ignora una riga data malformata senza abortire lo stream', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"ciao"}}]}\n\n',
      'data: questo non e json valido\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    const { transport } = fakeTransport(sse);
    const model = createOpenAiCompatibleModel({ baseUrl: 'http://x/v1', model: 'm', transport });
    const res = await collectResponse(model.stream({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.text).toBe('ciao');
    expect(res.finishReason).toBe('stop');
  });
});

// F2: alcuni provider OpenAI-compat (LM Studio sui fallimenti di rendering del template
// Jinja per i tool) rispondono HTTP 200 ma emettono l errore IN-BAND come frame SSE
// { "error": ... }. Senza riconoscimento il frame passerebbe lo schema (choices opzionale)
// e verrebbe saltato -> stream vuoto silenzioso -> turno vuoto senza diagnostica. Corroborato
// dal sibling alice (if "error" in chunk). Va sollevato come LanguageModelError, non inghiottito.
describe('rilevamento errori SSE in-band (F2)', () => {
  it('lancia LanguageModelError su un frame SSE di errore con HTTP 200', async () => {
    const sse = 'event: error\ndata: {"error":{"message":"Error rendering prompt with jinja template"}}\n\n';
    const { transport } = fakeTransport(sse); // ok:true, status:200 di default
    const model = createOpenAiCompatibleModel({ baseUrl: 'http://x/v1', model: 'm', transport });
    await expect(collectResponse(model.stream({ messages: [] }))).rejects.toBeInstanceOf(LanguageModelError);
  });

  it('include il messaggio del provider nell errore sollevato', async () => {
    const sse = 'data: {"error":{"message":"Error rendering prompt with jinja template"}}\n\n';
    const { transport } = fakeTransport(sse);
    const model = createOpenAiCompatibleModel({ baseUrl: 'http://x/v1', model: 'm', transport });
    await expect(collectResponse(model.stream({ messages: [] }))).rejects.toThrow('jinja template');
  });

  it('gestisce error come stringa top-level', async () => {
    const sse = 'data: {"error":"boom dal provider"}\n\n';
    const { transport } = fakeTransport(sse);
    const model = createOpenAiCompatibleModel({ baseUrl: 'http://x/v1', model: 'm', transport });
    await expect(collectResponse(model.stream({ messages: [] }))).rejects.toThrow('boom dal provider');
  });

  it('non tratta error null su un chunk di successo come un errore', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"ok"}}],"error":null}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    const { transport } = fakeTransport(sse);
    const model = createOpenAiCompatibleModel({ baseUrl: 'http://x/v1', model: 'm', transport });
    const res = await collectResponse(model.stream({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.text).toBe('ok');
    expect(res.finishReason).toBe('stop');
  });

  it('registra una trace error sul frame SSE di errore', async () => {
    const tracer = createRecordingTracer();
    const sse = 'event: error\ndata: {"error":{"message":"boom"}}\n\n';
    const { transport } = fakeTransport(sse);
    const model = createOpenAiCompatibleModel({ baseUrl: 'http://x/v1', model: 'm', transport, tracer });
    await expect(collectResponse(model.stream({ messages: [] }))).rejects.toBeInstanceOf(LanguageModelError);
    expect(tracer.events.map((e) => e.kind)).toContain('error');
  });
});
