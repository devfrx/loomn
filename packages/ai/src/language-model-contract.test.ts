import { runLanguageModelContract } from './language-model-contract';
import { createOpenAiCompatibleModel } from './openai-adapter';
import type { HttpTransport } from './transport';

// Stream canonico: testo "pronto", tool-call request_check({"dc":10}) frammentata su due
// chunk, poi finish_reason tool_calls. Ogni elemento dell'array e un evento SSE.
const CANON_SSE = [
  'data: {"choices":[{"delta":{"content":"pronto"}}]}\n\n',
  'data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_x', function: { name: 'request_check', arguments: '{"dc":' } }] } }] }) + '\n\n',
  'data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '10}' } }] } }] }) + '\n\n',
  'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
  'data: [DONE]\n\n',
].join('');

function cannedTransport(sse: string): HttpTransport {
  return async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    async *body() {
      yield new TextEncoder().encode(sse);
    },
    async text() {
      return sse;
    },
  });
}

runLanguageModelContract('openai-compatible', () =>
  createOpenAiCompatibleModel({ baseUrl: 'http://x/v1', model: 'test', transport: cannedTransport(CANON_SSE) }),
);
