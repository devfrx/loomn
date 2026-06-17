import { describe, it, expect } from 'vitest';
import {
  createStructuredOutput,
  type LanguageModel,
  type LlmStreamEvent,
  type StructuredOutputPort,
  type StructuredOutputRequest,
  type StructuredOutputResult,
} from '@loomn/ai';
import type { StoredEvent } from '@loomn/engine';
import {
  createLlmFactExtractor,
  createLlmSummarizer,
  renderEventsForReflection,
  reflectionDepsFor,
} from './reflection-ports';
import { createMemorySystem } from './memory-system';

/** Fake LanguageModel che ignora la richiesta e riproduce una sequenza di eventi di stream. */
function fakeModel(streamEvents: LlmStreamEvent[]): LanguageModel {
  return {
    id: 'fake',
    async *stream() {
      for (const e of streamEvents) yield e;
    },
  };
}

/** Fake StructuredOutputPort che cattura le richieste e ritorna un valore prefissato. */
function capturingPort(value: unknown): {
  port: StructuredOutputPort;
  calls: StructuredOutputRequest<unknown>[];
} {
  const calls: StructuredOutputRequest<unknown>[] = [];
  const port: StructuredOutputPort = {
    generate: async <T>(request: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> => {
      calls.push(request as StructuredOutputRequest<unknown>);
      return { value: value as T, strategy: 'function-call' };
    },
  };
  return { port, calls };
}

const sceneEvents: StoredEvent[] = [
  { seq: 1, event: { type: 'ActorAdded', actor: { id: 'goblin', name: 'Goblin', kind: 'npc', attributes: {}, skills: {}, resources: { hp: { current: 10, max: 10 } }, conditions: [], items: [], progression: { xp: 0, level: 1 } } } },
  { seq: 2, event: { type: 'DamageApplied', targetId: 'goblin', resource: 'hp', amount: 4 } },
];

describe('renderEventsForReflection', () => {
  it('rende una riga per evento in ordine di seq', () => {
    const text = renderEventsForReflection(sceneEvents);
    const lines = text.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('#1 ActorAdded');
    expect(lines[1]).toContain('#2 DamageApplied');
  });

  it('rende un NarrationRecorded come prosa (azione del giocatore e narrazione del Master)', () => {
    const events: StoredEvent[] = [
      {
        seq: 5,
        event: {
          type: 'NarrationRecorded',
          playerAction: 'Chiedo a Krix per chi lavora.',
          narration: 'Krix rivela di servire il Barone Vhalmar.',
        },
      },
    ];
    const text = renderEventsForReflection(events);
    expect(text).toContain('Chiedo a Krix per chi lavora.');
    expect(text).toContain('Krix rivela di servire il Barone Vhalmar.');
    expect(text).toContain('#5 Scena (prosa)');
    expect(text).not.toContain('NarrationRecorded'); // prosa, non il tipo grezzo
    expect(text).not.toContain('{"type"'); // niente dump JSON
  });
});

describe('createLlmFactExtractor', () => {
  it('ritorna i fatti validati ottenuti dallo StructuredOutputPort (via createStructuredOutput reale)', async () => {
    const args = JSON.stringify({
      facts: [{ subject: 'Goblin', predicate: 'si_trova_a', object: 'Caverna', functional: true, importance: 7 }],
    });
    const model = fakeModel([
      { type: 'tool-call', id: 't1', name: 'extract_facts', arguments: args },
      { type: 'finish', reason: 'tool_calls' },
    ]);
    const extractor = createLlmFactExtractor(createStructuredOutput(model));
    const facts = await extractor.extract({ events: sceneEvents, scope: 'sess-1' });
    expect(facts).toEqual([
      { subject: 'Goblin', predicate: 'si_trova_a', object: 'Caverna', functional: true, importance: 7 },
    ]);
  });

  it('mette gli eventi resi e il nome schema corretto nella richiesta al port', async () => {
    const { port, calls } = capturingPort({ facts: [] });
    const extractor = createLlmFactExtractor(port);
    await extractor.extract({ events: sceneEvents, scope: 'sess-1' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.schemaName).toBe('extract_facts');
    const joined = calls[0]?.messages.map((m) => m.content).join('\n') ?? '';
    expect(joined).toContain('#1 ActorAdded');
    expect(joined).toContain('#2 DamageApplied');
  });
});

describe('createLlmSummarizer', () => {
  it('ritorna la bozza di riassunto validata dallo StructuredOutputPort', async () => {
    const { port, calls } = capturingPort({ text: 'Il goblin viene ferito.', importance: 6 });
    const summarizer = createLlmSummarizer(port);
    const draft = await summarizer.summarize({ events: sceneEvents, scope: 'sess-1' });
    expect(draft).toEqual({ text: 'Il goblin viene ferito.', importance: 6 });
    expect(calls[0]?.schemaName).toBe('summarize_scene');
  });
});

describe('reflectionDepsFor', () => {
  it('compone ledger, summaries e clock del MemorySystem con le porte LLM-backed', () => {
    const sys = createMemorySystem(':memory:', { clock: { now: () => 42 } });
    try {
      const { port } = capturingPort({ facts: [] });
      const deps = reflectionDepsFor(sys, port);
      expect(deps.ledger).toBe(sys.ledger);
      expect(deps.summaries).toBe(sys.summaries);
      expect(deps.clock).toBe(sys.clock);
      expect(typeof deps.extractor.extract).toBe('function');
      expect(typeof deps.summarizer.summarize).toBe('function');
    } finally {
      sys.close();
    }
  });
});

describe('coercizione del write-path (F3/G5)', () => {
  it('coerce facts stringificato (array JSON come stringa) e ritorna i fatti', async () => {
    // Il modello debole stringifica l array: facts arriva come stringa JSON, non come array.
    const args = JSON.stringify({
      facts: JSON.stringify([
        { subject: 'Krix', predicate: 'serve', object: 'Barone Vhalmar', functional: true, importance: 8 },
      ]),
    });
    const model = fakeModel([
      { type: 'tool-call', id: 't1', name: 'extract_facts', arguments: args },
      { type: 'finish', reason: 'tool_calls' },
    ]);
    const extractor = createLlmFactExtractor(createStructuredOutput(model));
    const facts = await extractor.extract({ events: sceneEvents, scope: 'sess-1' });
    expect(facts).toEqual([
      { subject: 'Krix', predicate: 'serve', object: 'Barone Vhalmar', functional: true, importance: 8 },
    ]);
  });

  it('coerce importance stringa numerica a intero nell estrazione', async () => {
    const args = JSON.stringify({
      facts: [{ subject: 'Krix', predicate: 'serve', object: 'Barone', functional: true, importance: '8' }],
    });
    const model = fakeModel([
      { type: 'tool-call', id: 't1', name: 'extract_facts', arguments: args },
      { type: 'finish', reason: 'tool_calls' },
    ]);
    const extractor = createLlmFactExtractor(createStructuredOutput(model));
    const facts = await extractor.extract({ events: sceneEvents, scope: 'sess-1' });
    expect(facts[0]?.importance).toBe(8);
  });

  it('coerce importance stringa numerica nel riassunto', async () => {
    const args = JSON.stringify({ text: 'Krix serve il Barone.', importance: '6' });
    const model = fakeModel([
      { type: 'tool-call', id: 't1', name: 'summarize_scene', arguments: args },
      { type: 'finish', reason: 'tool_calls' },
    ]);
    const summarizer = createLlmSummarizer(createStructuredOutput(model));
    const draft = await summarizer.summarize({ events: sceneEvents, scope: 'sess-1' });
    expect(draft).toEqual({ text: 'Krix serve il Barone.', importance: 6 });
  });

  it('rifiuta facts stringa non-JSON (niente array silenzioso): strict come G6', async () => {
    const args = JSON.stringify({ facts: 'non sono un array' });
    const model = fakeModel([
      { type: 'tool-call', id: 't1', name: 'extract_facts', arguments: args },
      { type: 'finish', reason: 'tool_calls' },
    ]);
    // strategies:[function-call] pinna il gate dello schema (niente fallback che maschera il rifiuto).
    const extractor = createLlmFactExtractor(createStructuredOutput(model, { strategies: ['function-call'] }));
    await expect(extractor.extract({ events: sceneEvents, scope: 'sess-1' })).rejects.toThrow();
  });

  it('rifiuta importance stringa non-numerica (niente intero silenzioso): strict come G1', async () => {
    const args = JSON.stringify({
      facts: [{ subject: 'Krix', predicate: 'serve', object: 'Barone', functional: true, importance: 'abc' }],
    });
    const model = fakeModel([
      { type: 'tool-call', id: 't1', name: 'extract_facts', arguments: args },
      { type: 'finish', reason: 'tool_calls' },
    ]);
    const extractor = createLlmFactExtractor(createStructuredOutput(model, { strategies: ['function-call'] }));
    await expect(extractor.extract({ events: sceneEvents, scope: 'sess-1' })).rejects.toThrow();
  });
});
