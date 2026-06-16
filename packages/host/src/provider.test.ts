import { describe, it, expect } from 'vitest';
import {
  collectResponse,
  type HttpRequest,
  type HttpResponse,
  type HttpTransport,
} from '@loomn/ai';
import { createLanguageProvider } from './provider';

/** Transport fake: ignora il body della richiesta e riproduce un corpo SSE prefissato (nessuna rete). */
function fakeTransport(sseLines: string[]): { transport: HttpTransport; seen: () => HttpRequest[] } {
  const seen: HttpRequest[] = [];
  const encoder = new TextEncoder();
  const transport: HttpTransport = async (request) => {
    seen.push(request);
    const res: HttpResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      body: async function* () {
        for (const line of sseLines) yield encoder.encode(line);
      },
      text: async () => '',
    };
    return res;
  };
  return { transport, seen: () => seen };
}

const TEXT_SSE = [
  'data: {"choices":[{"delta":{"content":"Ciao"}}]}\n\n',
  'data: {"choices":[{"delta":{"content":" mondo"},"finish_reason":"stop"}]}\n\n',
  'data: [DONE]\n\n',
];

describe('createLanguageProvider', () => {
  it('espone un model con l id del modello configurato e uno structured port', () => {
    const { transport } = fakeTransport(TEXT_SSE);
    const provider = createLanguageProvider({ baseUrl: 'http://x/v1', model: 'm-test', transport });
    expect(provider.model.id).toBe('m-test');
    expect(typeof provider.structured.generate).toBe('function');
  });

  it('il model fa streaming via il transport iniettato (nessuna rete reale)', async () => {
    const { transport, seen } = fakeTransport(TEXT_SSE);
    const provider = createLanguageProvider({ baseUrl: 'http://x/v1', model: 'm-test', transport });
    const res = await collectResponse(provider.model.stream({ messages: [{ role: 'user', content: 'ehi' }] }));
    expect(res.text).toBe('Ciao mondo');
    expect(seen()).toHaveLength(1);
    expect(seen()[0]?.url).toBe('http://x/v1/chat/completions');
  });

  it('inietta l header Authorization quando apiKey e presente', async () => {
    const { transport, seen } = fakeTransport(TEXT_SSE);
    const provider = createLanguageProvider({ baseUrl: 'http://x/v1', model: 'm', apiKey: 'sk-secret', transport });
    await collectResponse(provider.model.stream({ messages: [{ role: 'user', content: 'x' }] }));
    expect(seen()[0]?.headers['authorization']).toBe('Bearer sk-secret');
  });

  it('senza apiKey non manda Authorization (path LM Studio locale)', async () => {
    const { transport, seen } = fakeTransport(TEXT_SSE);
    const provider = createLanguageProvider({ baseUrl: 'http://x/v1', model: 'm', transport });
    await collectResponse(provider.model.stream({ messages: [{ role: 'user', content: 'x' }] }));
    expect(seen()[0]?.headers['authorization']).toBeUndefined();
  });
});
