import { describe, it, expect } from 'vitest';
import {
  initialState,
  applyEvent,
  createSeededRandom,
  type Actor,
  type DomainEvent,
  type StoredEvent,
} from '@loomn/engine';
import {
  runMasterTurn,
  type LanguageModel,
  type LlmMessage,
  type LlmStreamEvent,
  type StructuredOutputPort,
  type StructuredOutputRequest,
  type StructuredOutputResult,
} from '@loomn/ai';
import { runReflection } from '@loomn/memory';
import { createMemorySystem } from './memory-system';
import { reflectionDepsFor } from './reflection-ports';

function actor(id: string, name: string): Actor {
  return {
    id,
    name,
    kind: 'npc',
    attributes: {},
    skills: {},
    resources: { hp: { current: 10, max: 10 } },
    conditions: [],
    items: [],
    progression: { xp: 0, level: 1 },
  };
}

/** Fake LanguageModel che cattura i messaggi ricevuti e riproduce uno stream prefissato. */
function recordingModel(streamEvents: LlmStreamEvent[]): { model: LanguageModel; captured: () => LlmMessage[] } {
  let messages: LlmMessage[] = [];
  const model: LanguageModel = {
    id: 'rec',
    async *stream(request) {
      messages = request.messages;
      for (const e of streamEvents) yield e;
    },
  };
  return { model, captured: () => messages };
}

describe('wiring - assembler reale iniettato in runMasterTurn', () => {
  it('runMasterTurn riceve il contesto reale (L1 + L1.5) prodotto dal MemorySystem, non lo stub', async () => {
    const sys = createMemorySystem(':memory:', { clock: { now: () => 1000 } });
    try {
      sys.ledger.record({ id: 'f1', subject: 'goblin', predicate: 'impugna', object: 'pugnale', eventSeq: 1 });
      const state = applyEvent(initialState, { type: 'ActorAdded', actor: actor('goblin', 'Goblin') });
      const { model, captured } = recordingModel([
        { type: 'text', delta: 'Il goblin ti osserva guardingo.' },
        { type: 'finish', reason: 'stop' },
      ]);
      const result = await runMasterTurn({
        model,
        rng: createSeededRandom(1),
        state,
        playerAction: 'Osservo il goblin.',
        assembleContext: sys.assembleContext,
      });
      const systemContext = captured()
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n');
      expect(systemContext).toContain('Goblin');
      expect(systemContext).toContain('impugna');
      expect(result.narration).toBe('Il goblin ti osserva guardingo.');
    } finally {
      sys.close();
    }
  });
});

describe('wiring - Reflection write -> Context Assembler read sullo stesso DB', () => {
  it('cio che la Reflection scrive in L1.5/L2 viene poi recuperato dal Context Assembler', async () => {
    const sys = createMemorySystem(':memory:', { clock: { now: () => 5000 }, tokenBudget: 2000 });
    try {
      const port: StructuredOutputPort = {
        generate: async <T>(request: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> => {
          if (request.schemaName === 'extract_facts') {
            const value = {
              facts: [{ subject: 'Goblin', predicate: 'ha_rubato', object: 'la gemma', functional: false, importance: 8 }],
            };
            return { value: value as T, strategy: 'function-call' };
          }
          const draft = { text: 'Il goblin ha rubato la gemma ed e fuggito nel bosco.', importance: 8 };
          return { value: draft as T, strategy: 'function-call' };
        },
      };
      const deps = reflectionDepsFor(sys, port);
      const sceneEvents: StoredEvent[] = [
        { seq: 1, event: { type: 'ActorAdded', actor: actor('goblin', 'Goblin') } as DomainEvent },
      ];
      const reflected = await runReflection(deps, { events: sceneEvents, scope: 'sess-1' });
      expect(reflected.facts.map((f) => f.predicate)).toContain('ha_rubato');
      expect(reflected.summary?.text).toContain('ha rubato la gemma');

      const state = applyEvent(initialState, { type: 'ActorAdded', actor: actor('goblin', 'Goblin') });
      const ctx = sys.assembleContext(state);
      expect(ctx).toContain('ha_rubato');
      expect(ctx).toContain('Il goblin ha rubato la gemma');
    } finally {
      sys.close();
    }
  });
});
