import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createStructuredOutput, StructuredOutputError } from './structured-output';
import type { LanguageModel, LlmRequest, LlmStreamEvent } from './language-model';
import { createRecordingTracer } from './tracing';

const schema = z.object({ actorId: z.string(), dc: z.number().int() });

// Fake model: handler mappa (richiesta, indice di chiamata) -> eventi da streammare.
// Chiamate in ordine: 0 = function-call, 1 = json-schema, 2 = repair#1, 3 = repair#2.
function fakeModel(handler: (req: LlmRequest, i: number) => LlmStreamEvent[]): LanguageModel {
  let i = 0;
  return {
    id: 'fake',
    stream(req) {
      const events = handler(req, i++);
      async function* gen(): AsyncGenerator<LlmStreamEvent> {
        for (const e of events) yield e;
      }
      return gen();
    },
  };
}

function toolCall(args: string): LlmStreamEvent[] {
  return [{ type: 'tool-call', id: 'c1', name: 'make_check', arguments: args }, { type: 'finish', reason: 'tool_calls' }];
}
function textResp(text: string): LlmStreamEvent[] {
  return [{ type: 'text', delta: text }, { type: 'finish', reason: 'stop' }];
}

const messages = [{ role: 'user' as const, content: 'go' }];

describe('createStructuredOutput', () => {
  it('livello 1: function-call valida', async () => {
    const model = fakeModel((req) => {
      expect(req.tools?.[0]?.name).toBe('make_check');
      expect(req.toolChoice).toBe('required');
      return toolCall('{"actorId":"pc1","dc":12}');
    });
    const so = createStructuredOutput(model);
    const res = await so.generate({ messages, schema, schemaName: 'make_check' });
    expect(res.strategy).toBe('function-call');
    expect(res.value).toEqual({ actorId: 'pc1', dc: 12 });
  });

  it('cade a json-schema se la function-call e invalida', async () => {
    const tracer = createRecordingTracer();
    const model = fakeModel((req) => {
      if (req.tools !== undefined) return toolCall('{"actorId":"pc1"}'); // manca dc -> invalido
      if (req.responseFormat !== undefined) return textResp('{"actorId":"pc1","dc":7}');
      return textResp('no');
    });
    const so = createStructuredOutput(model, { tracer });
    const res = await so.generate({ messages, schema, schemaName: 'make_check' });
    expect(res.strategy).toBe('json-schema');
    expect(res.value).toEqual({ actorId: 'pc1', dc: 7 });
    expect(tracer.events.some((e) => e.kind === 'validation-failure' && e.strategy === 'function-call')).toBe(true);
  });

  it('cade a repair con JSON in fence + virgola finale', async () => {
    const model = fakeModel((req) => {
      if (req.tools !== undefined) return toolCall('non-json');
      if (req.responseFormat !== undefined) return textResp('anche-non-json');
      return textResp('Ecco la risposta:\n```json\n{"actorId":"pc1","dc":5,}\n```');
    });
    const so = createStructuredOutput(model);
    const res = await so.generate({ messages, schema, schemaName: 'make_check' });
    expect(res.strategy).toBe('repair');
    expect(res.value).toEqual({ actorId: 'pc1', dc: 5 });
  });

  it('repair fa un retry e poi riesce', async () => {
    const tracer = createRecordingTracer();
    const model = fakeModel((req, i) => {
      if (req.tools !== undefined) return toolCall('x');
      if (req.responseFormat !== undefined) return textResp('y');
      return i < 3 ? textResp('{"actorId":"pc1"}') : textResp('{"actorId":"pc1","dc":9}');
    });
    const so = createStructuredOutput(model, { tracer });
    const res = await so.generate({ messages, schema, schemaName: 'make_check' });
    expect(res.strategy).toBe('repair');
    expect(res.value).toEqual({ actorId: 'pc1', dc: 9 });
    expect(tracer.events.some((e) => e.kind === 'retry' && e.attempt === 1)).toBe(true);
  });

  it('strategies puo limitarsi a repair, senza tentare function-call', async () => {
    let toolsSeen = false;
    const model = fakeModel((req) => {
      if (req.tools !== undefined) toolsSeen = true;
      return textResp('{"actorId":"pc1","dc":3}');
    });
    const so = createStructuredOutput(model, { strategies: ['repair'] });
    const res = await so.generate({ messages, schema, schemaName: 'make_check' });
    expect(res.strategy).toBe('repair');
    expect(toolsSeen).toBe(false);
  });

  it('lancia StructuredOutputError se tutti i livelli falliscono', async () => {
    const model = fakeModel(() => textResp('mai un json valido'));
    const so = createStructuredOutput(model);
    await expect(so.generate({ messages, schema, schemaName: 'make_check' })).rejects.toBeInstanceOf(StructuredOutputError);
  });

  it('un errore di provider al livello 1 non interrompe il fallback', async () => {
    const model = fakeModel((req) => {
      if (req.tools !== undefined) throw new Error('tools non supportati');
      if (req.responseFormat !== undefined) return textResp('{"actorId":"pc1","dc":4}');
      return textResp('no');
    });
    const so = createStructuredOutput(model);
    const res = await so.generate({ messages, schema, schemaName: 'make_check' });
    expect(res.strategy).toBe('json-schema');
    expect(res.value).toEqual({ actorId: 'pc1', dc: 4 });
  });
});
