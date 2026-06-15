import { describe, it, expect } from 'vitest';
import { collectResponse, type LlmStreamEvent } from './language-model';

async function* events(...es: LlmStreamEvent[]): AsyncGenerator<LlmStreamEvent> {
  for (const e of es) yield e;
}

describe('collectResponse', () => {
  it('concatena i delta di testo', async () => {
    const res = await collectResponse(
      events({ type: 'text', delta: 'Il ' }, { type: 'text', delta: 'goblin' }, { type: 'finish', reason: 'stop' }),
    );
    expect(res.text).toBe('Il goblin');
    expect(res.toolCalls).toEqual([]);
    expect(res.finishReason).toBe('stop');
  });

  it('raccoglie le tool-call intere', async () => {
    const res = await collectResponse(
      events(
        { type: 'tool-call', id: 'c1', name: 'request_check', arguments: '{"dc":12}' },
        { type: 'finish', reason: 'tool_calls' },
      ),
    );
    expect(res.toolCalls).toEqual([{ id: 'c1', name: 'request_check', arguments: '{"dc":12}' }]);
    expect(res.finishReason).toBe('tool_calls');
  });

  it('finishReason vale unknown se nessun evento finish arriva', async () => {
    const res = await collectResponse(events({ type: 'text', delta: 'x' }));
    expect(res.finishReason).toBe('unknown');
  });
});
