import { describe, it, expect } from 'vitest';
import { createFetchTransport } from './transport';

function streamResponse(body: string, init: { status?: number; statusText?: string } = {}): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, { status: init.status ?? 200, statusText: init.statusText ?? 'OK' });
}

describe('createFetchTransport', () => {
  it('mappa la Response e itera il body a chunk', async () => {
    const fakeFetch = (async () => streamResponse('data: hello\n\n')) as unknown as typeof fetch;
    const transport = createFetchTransport(fakeFetch);
    const res = await transport({ url: 'http://x/v1/chat/completions', headers: {}, body: '{}' });
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    let text = '';
    const dec = new TextDecoder();
    for await (const chunk of res.body()) text += dec.decode(chunk, { stream: true });
    expect(text).toBe('data: hello\n\n');
  });

  it('espone status e text su risposta non ok', async () => {
    const fakeFetch = (async () => new Response('nope', { status: 401, statusText: 'Unauthorized' })) as unknown as typeof fetch;
    const transport = createFetchTransport(fakeFetch);
    const res = await transport({ url: 'http://x', headers: {}, body: '{}' });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('nope');
  });

  it('body vuoto quando la Response non ha corpo', async () => {
    const fakeFetch = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    const transport = createFetchTransport(fakeFetch);
    const res = await transport({ url: 'http://x', headers: {}, body: '{}' });
    const chunks: Uint8Array[] = [];
    for await (const c of res.body()) chunks.push(c);
    expect(chunks).toEqual([]);
  });
});
