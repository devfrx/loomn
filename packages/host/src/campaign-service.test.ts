import { describe, it, expect } from 'vitest';
import { createSeededRandom, createRuleset, createVocabulary, type Actor, type Command } from '@loomn/engine';
import { devRuleset } from './dev-vocabulary';
import {
  type LanguageModel,
  type LlmMessage,
  type LlmStreamEvent,
  type StructuredOutputPort,
  type StructuredOutputRequest,
  type StructuredOutputResult,
} from '@loomn/ai';
import { commandSchema } from '@loomn/shared';
import { createMemorySystem } from './memory-system';
import { createCampaignService, type CampaignServiceDeps } from './campaign-service';

// Vocabolario di test: ampio fantasy, defaultResources VUOTO (non perturba i test di auto-fill del Task 4).
const SERVICE_RULESET = createRuleset({
  vocabulary: createVocabulary({
    attributes: ['forza', 'destrezza', 'costituzione', 'intelligenza', 'saggezza', 'carisma'],
    skills: ['atletica', 'furtivita', 'persuasione', 'intuito', 'arcano', 'percezione'],
    resources: ['hp', 'mana', 'stamina'],
    defenses: ['difesa', 'tempra', 'riflessi', 'volonta'],
  }),
});

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

/** Fake model che rigioca SEMPRE la stessa sequenza di stream (per i turni a singola iterazione). */
function fakeModel(streamEvents: LlmStreamEvent[]): LanguageModel {
  return {
    id: 'fake',
    async *stream() {
      for (const e of streamEvents) yield e;
    },
  };
}

/** Fake model che riproduce uno stream diverso a ogni chiamata (per i turni multi-iterazione). */
function scriptedModel(perCall: LlmStreamEvent[][]): LanguageModel {
  let i = 0;
  return {
    id: 'scripted',
    async *stream() {
      const events = perCall[i] ?? perCall[perCall.length - 1] ?? [];
      i += 1;
      for (const e of events) yield e;
    },
  };
}

/** Fake model che cattura i messaggi ricevuti e poi narra (per verificare l assembler iniettato). */
function recordingModel(streamEvents: LlmStreamEvent[]): { model: LanguageModel; captured: () => LlmMessage[] } {
  let messages: LlmMessage[] = [];
  return {
    model: {
      id: 'rec',
      async *stream(request) {
        messages = request.messages;
        for (const e of streamEvents) yield e;
      },
    },
    captured: () => messages,
  };
}

/** Porta structured che non viene mai chiamata (per i test che non esercitano la Reflection). */
const idlePort: StructuredOutputPort = {
  generate: async <T>(_request: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> => {
    throw new Error('structured port non previsto in questo test');
  },
};

function makeService(over: Partial<CampaignServiceDeps> = {}): {
  service: ReturnType<typeof createCampaignService>;
  memory: ReturnType<typeof createMemorySystem>;
} {
  const memory = over.memory ?? createMemorySystem(':memory:', { clock: { now: () => 1000 } });
  const service = createCampaignService({
    memory,
    model: over.model ?? fakeModel([{ type: 'finish', reason: 'stop' }]),
    structured: over.structured ?? idlePort,
    rng: over.rng ?? createSeededRandom(1),
    ruleset: SERVICE_RULESET,
  });
  return { service, memory };
}

describe('createCampaignService - dispatch (write side)', () => {
  it('all avvio la proiezione e vuota (versione 0)', () => {
    const { service, memory } = makeService();
    try {
      expect(service.getReadModel()).toEqual({ version: 0, state: { version: 0, actors: {}, encounter: null, quests: {}, phase: 'exploration' } });
    } finally {
      memory.close();
    }
  });

  it('dispatch(AddActor) persiste l Event, avanza la versione e la proiezione', async () => {
    const { service, memory } = makeService();
    try {
      const out = await service.dispatch({ type: 'AddActor', actor: actor('goblin', 'Goblin') });
      expect(out.events).toEqual([{ type: 'ActorAdded', actor: actor('goblin', 'Goblin') }]);
      expect(out.readModel.version).toBe(1);
      expect(out.readModel.state.actors['goblin']?.name).toBe('Goblin');
      expect(memory.eventStore.version()).toBe(1);
    } finally {
      memory.close();
    }
  });

  it('accetta un Command validato da commandSchema (confine IPC al motore, cast-free)', async () => {
    const { service, memory } = makeService();
    try {
      const wire: Command = commandSchema.parse({ type: 'AddActor', actor: actor('orc', 'Orc') });
      const out = await service.dispatch(wire);
      expect(out.readModel.state.actors['orc']?.name).toBe('Orc');
    } finally {
      memory.close();
    }
  });

  it('un Command che viola le invarianti viene rifiutato e non lascia Event', async () => {
    const { service, memory } = makeService();
    try {
      await service.dispatch({ type: 'AddActor', actor: actor('goblin', 'Goblin') });
      await expect(service.dispatch({ type: 'AddActor', actor: actor('goblin', 'Goblin') })).rejects.toThrow();
      expect(memory.eventStore.version()).toBe(1);
    } finally {
      memory.close();
    }
  });

  it('ricostruisce la proiezione dallo stream persistito a una nuova costruzione', async () => {
    const memory = createMemorySystem(':memory:', { clock: { now: () => 1000 } });
    try {
      const s1 = createCampaignService({
        memory,
        model: fakeModel([{ type: 'finish', reason: 'stop' }]),
        structured: idlePort,
        rng: createSeededRandom(1),
        ruleset: SERVICE_RULESET,
      });
      await s1.dispatch({ type: 'AddActor', actor: actor('goblin', 'Goblin') });
      const s2 = createCampaignService({
        memory,
        model: fakeModel([{ type: 'finish', reason: 'stop' }]),
        structured: idlePort,
        rng: createSeededRandom(1),
        ruleset: SERVICE_RULESET,
      });
      expect(s2.getReadModel().version).toBe(1);
      expect(s2.getReadModel().state.actors['goblin']?.name).toBe('Goblin');
    } finally {
      memory.close();
    }
  });

  it('la coda non si blocca dopo un dispatch rifiutato: il dispatch successivo procede', async () => {
    const { service, memory } = makeService();
    try {
      await service.dispatch({ type: 'AddActor', actor: actor('goblin', 'Goblin') });
      await expect(service.dispatch({ type: 'AddActor', actor: actor('goblin', 'Goblin') })).rejects.toThrow();
      const out = await service.dispatch({ type: 'AddActor', actor: actor('orc', 'Orc') });
      expect(out.readModel.version).toBe(2);
      expect(out.readModel.state.actors['orc']?.name).toBe('Orc');
      expect(memory.eventStore.version()).toBe(2);
    } finally {
      memory.close();
    }
  });

  it('spawn_npc via devRuleset rende il PNG combat-ready (hp auto-fill)', async () => {
    const memory = createMemorySystem(':memory:', { clock: { now: () => 1000 } });
    const service = createCampaignService({
      memory,
      model: fakeModel([{ type: 'finish', reason: 'stop' }]),
      structured: idlePort,
      rng: createSeededRandom(1),
      ruleset: devRuleset,
    });
    try {
      await service.dispatch({ type: 'AddActor', actor: { id: 'png1', name: 'Locandiere', kind: 'npc', attributes: {}, skills: {}, resources: {}, conditions: [], items: [], progression: { xp: 0, level: 0 } } });
      const actor = service.getReadModel().state.actors['png1'];
      expect(actor?.resources['hp']).toEqual({ current: 10, max: 10 });
    } finally {
      memory.close();
    }
  });
});

describe('createCampaignService - runTurn (AI dietro il servizio)', () => {
  it('runTurn inietta l assembler reale: il contesto include L1 e L1.5 dal MemorySystem', async () => {
    const { model, captured } = recordingModel([
      { type: 'text', delta: 'Il goblin ti osserva.' },
      { type: 'finish', reason: 'stop' },
    ]);
    const { service, memory } = makeService({ model });
    try {
      memory.ledger.record({ id: 'f1', subject: 'goblin', predicate: 'impugna', object: 'pugnale', eventSeq: 1 });
      await service.dispatch({ type: 'AddActor', actor: actor('goblin', 'Goblin') });
      const out = await service.runTurn('Osservo il goblin.');
      const systemContext = captured()
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n');
      expect(systemContext).toContain('Goblin'); // L1 (attore in scena)
      expect(systemContext).toContain('impugna'); // L1.5 (mai presente nello stub)
      expect(out.narration).toBe('Il goblin ti osserva.');
      expect(out.events).toEqual([]);
    } finally {
      memory.close();
    }
  });

  it('runTurn di puro dialogo persiste un NarrationRecorded nello stream (la storia lascia traccia)', async () => {
    const model = fakeModel([
      { type: 'text', delta: 'Krix rivela di servire il Barone Vhalmar.' },
      { type: 'finish', reason: 'stop' },
    ]);
    const { service, memory } = makeService({ model });
    try {
      const out = await service.runTurn('Chiedo a Krix per chi lavora.');
      expect(out.events).toEqual([]); // TurnOutcome.events resta meccanica (niente NarrationRecorded)
      expect(out.readModel.version).toBe(1); // lo stream e cresciuto: il NarrationRecorded e persistito
      expect(memory.eventStore.version()).toBe(1);
      const stored = memory.eventStore.load();
      expect(stored).toHaveLength(1);
      expect(stored[0]?.event).toEqual({
        type: 'NarrationRecorded',
        playerAction: 'Chiedo a Krix per chi lavora.',
        narration: 'Krix rivela di servire il Barone Vhalmar.',
      });
    } finally {
      memory.close();
    }
  });

  it('runTurn non persiste nulla se la narrazione e vuota e non ci sono Event', async () => {
    const model = fakeModel([{ type: 'finish', reason: 'stop' }]); // niente testo, niente tool-call
    const { service, memory } = makeService({ model });
    try {
      const out = await service.runTurn('Resto in silenzio.');
      expect(out.narration).toBe('');
      expect(out.readModel.version).toBe(0);
      expect(memory.eventStore.version()).toBe(0);
    } finally {
      memory.close();
    }
  });

  it('runTurn con Event meccanici ma narrazione vuota: persiste solo gli Event, niente NarrationRecorded', async () => {
    const model = scriptedModel([
      [
        { type: 'tool-call', id: 't1', name: 'spawn_npc', arguments: JSON.stringify({ id: 'png1', name: 'Locandiere' }) },
        { type: 'finish', reason: 'tool_calls' },
      ],
      [{ type: 'finish', reason: 'stop' }], // nessun testo -> narrazione vuota
    ]);
    const { service, memory } = makeService({ model });
    try {
      const out = await service.runTurn('Entro nella taverna.');
      expect(out.narration).toBe('');
      expect(out.events.some((e) => e.type === 'ActorAdded')).toBe(true);
      expect(out.readModel.version).toBe(1); // solo ActorAdded (v1), nessun NarrationRecorded
      expect(memory.eventStore.version()).toBe(1);
      const stored = memory.eventStore.load();
      expect(stored).toHaveLength(1);
      expect(stored[0]?.event.type).toBe('ActorAdded');
    } finally {
      memory.close();
    }
  });

  it('persiste gli Event prodotti dal turno (tool-call -> decide -> append)', async () => {
    const spawnArgs = JSON.stringify({ id: 'png1', name: 'Locandiere' });
    const model = scriptedModel([
      [
        { type: 'tool-call', id: 't1', name: 'spawn_npc', arguments: spawnArgs },
        { type: 'finish', reason: 'tool_calls' },
      ],
      [
        { type: 'text', delta: 'Un locandiere appare.' },
        { type: 'finish', reason: 'stop' },
      ],
    ]);
    const { service, memory } = makeService({ model });
    try {
      const out = await service.runTurn('Entro nella taverna.');
      expect(out.events.some((e) => e.type === 'ActorAdded')).toBe(true);
      expect(out.narration).toBe('Un locandiere appare.');
      expect(out.readModel.version).toBe(2); // ActorAdded (v1) + NarrationRecorded (v2)
      expect(out.readModel.state.actors['png1']?.name).toBe('Locandiere');
      expect(memory.eventStore.version()).toBe(2);
    } finally {
      memory.close();
    }
  });
});

describe('createCampaignService - reflect e serializzazione', () => {
  it('reflect estrae fatti e riassunto, e il read path li recupera', async () => {
    const port: StructuredOutputPort = {
      generate: async <T>(request: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> => {
        if (request.schemaName === 'extract_facts') {
          const value = {
            facts: [{ subject: 'Goblin', predicate: 'ha_rubato', object: 'la gemma', functional: false, importance: 8 }],
          };
          return { value: value as T, strategy: 'function-call' };
        }
        const draft = { text: 'Il goblin ha rubato la gemma.', importance: 8 };
        return { value: draft as T, strategy: 'function-call' };
      },
    };
    const { service, memory } = makeService({ structured: port });
    try {
      await service.dispatch({ type: 'AddActor', actor: actor('goblin', 'Goblin') });
      const out = await service.reflect('sess-1');
      expect(out.factCount).toBe(1);
      expect(out.summarized).toBe(true);
      const ctx = memory.assembleContext(service.getReadModel().state);
      expect(ctx).toContain('ha_rubato'); // L1.5 affiorato in lettura
      expect(ctx).toContain('Il goblin ha rubato la gemma'); // L2 affiorato in lettura
    } finally {
      memory.close();
    }
  });

  it('runTurn poi reflect: la narrazione raggiunge l estrattore e il fatto narrativo entra in L1.5', async () => {
    const model = fakeModel([
      { type: 'text', delta: 'Krix rivela di servire il Barone Vhalmar di Pietranera.' },
      { type: 'finish', reason: 'stop' },
    ]);
    const extractPrompts: string[] = [];
    const port: StructuredOutputPort = {
      generate: async <T>(request: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> => {
        const joined = request.messages.map((m) => m.content).join('\n');
        if (request.schemaName === 'extract_facts') {
          extractPrompts.push(joined);
          const value = {
            facts: [{ subject: 'Krix', predicate: 'serve', object: 'Barone Vhalmar', functional: false, importance: 8 }],
          };
          return { value: value as T, strategy: 'function-call' };
        }
        const draft = { text: 'Krix confessa di servire il Barone Vhalmar.', importance: 8 };
        return { value: draft as T, strategy: 'function-call' };
      },
    };
    const { service, memory } = makeService({ model, structured: port });
    try {
      await service.runTurn('Chiedo a Krix per chi lavora.');
      const out = await service.reflect('scena-1');
      // La narrazione ha raggiunto l estrattore come prosa (asserzione non-vacua):
      expect(extractPrompts[0]).toContain('Barone Vhalmar di Pietranera');
      // Il fatto narrativo e entrato in L1.5:
      expect(out.factCount).toBe(1);
      const facts = memory.ledger.active();
      expect(facts.some((f) => f.subject === 'Krix' && f.predicate === 'serve')).toBe(true);
    } finally {
      memory.close();
    }
  });

  it('reflect ripetuto sullo stesso stream non collide: la seconda e un no-op, una terza riflette solo il nuovo', async () => {
    const port: StructuredOutputPort = {
      generate: async <T>(request: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> => {
        if (request.schemaName === 'extract_facts') {
          const value = { facts: [{ subject: 'Goblin', predicate: 'minaccia', object: 'il villaggio', functional: false, importance: 6 }] };
          return { value: value as T, strategy: 'function-call' };
        }
        const draft = { text: 'Il goblin minaccia il villaggio.', importance: 6 };
        return { value: draft as T, strategy: 'function-call' };
      },
    };
    const { service, memory } = makeService({ structured: port });
    try {
      await service.dispatch({ type: 'AddActor', actor: actor('goblin', 'Goblin') });
      const first = await service.reflect('sess-1');
      expect(first.factCount).toBe(1);
      expect(first.summarized).toBe(true);
      // Seconda reflect SENZA nuovi eventi: col vecchio codice ri-coprirebbe lo stesso range di seq
      // (UNIQUE constraint failed sugli id deterministici). Ora il watermark e gia oltre lo stream
      // -> no-op, niente throw.
      const second = await service.reflect('sess-1');
      expect(second.factCount).toBe(0);
      expect(second.summarized).toBe(false);
      // Aggiunti eventi nuovi (incluso un PhaseChanged via start_encounter): una terza reflect
      // riflette SOLO la scena nuova, senza collidere con le precedenti.
      await service.dispatch({ type: 'StartEncounter', encounterId: 'enc1', participants: [{ actorId: 'goblin', zone: 'z1', initiative: 10 }] });
      const third = await service.reflect('sess-1');
      expect(third.summarized).toBe(true);
    } finally {
      memory.close();
    }
  });

  it('serializza turno e dispatch concorrenti: nessun ConcurrencyError, ordine FIFO', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let firstCall = true;
    const model: LanguageModel = {
      id: 'gated',
      async *stream() {
        if (firstCall) {
          firstCall = false;
          await gate;
          yield { type: 'tool-call', id: 't1', name: 'spawn_npc', arguments: JSON.stringify({ id: 'png1', name: 'Locandiere' }) };
          yield { type: 'finish', reason: 'tool_calls' };
          return;
        }
        yield { type: 'text', delta: 'Il locandiere saluta.' };
        yield { type: 'finish', reason: 'stop' };
      },
    };
    const { service, memory } = makeService({ model });
    try {
      const turn = service.runTurn('Entro.'); // si accoda e si blocca sul gate
      const disp = service.dispatch({ type: 'AddActor', actor: actor('goblin', 'Goblin') }); // accodato DOPO
      release();
      const [turnOut, dispOut] = await Promise.all([turn, disp]);
      expect(turnOut.events.some((e) => e.type === 'ActorAdded')).toBe(true);
      expect(dispOut.readModel.version).toBe(3); // turno (ActorAdded v1 + NarrationRecorded v2) poi dispatch (v3)
      expect(memory.eventStore.version()).toBe(3);
      const finalState = service.getReadModel().state;
      expect(finalState.actors['png1']?.name).toBe('Locandiere');
      expect(finalState.actors['goblin']?.name).toBe('Goblin');
    } finally {
      memory.close();
    }
  });
});
