import { describe, it, expect } from 'vitest';
import { replay, createSeededRandom, PHASES, type Actor, type DomainEvent, type Item } from '@loomn/engine';
import { createRuleset, createVocabulary } from '@loomn/engine';
import { runMasterTurn, assembleContextStub, buildMasterMessages, phaseGuidance } from './master-turn';
import type { LanguageModel, LlmRequest, LlmStreamEvent } from './language-model';
import { createRecordingTracer } from './tracing';

const TURN_RULESET = createRuleset({
  vocabulary: createVocabulary({
    attributes: ['forza', 'destrezza', 'costituzione', 'intelligenza', 'saggezza', 'carisma'],
    skills: ['atletica', 'furtivita', 'persuasione', 'intuito', 'arcano', 'percezione'],
    resources: ['hp', 'mana', 'stamina'],
    defenses: ['difesa', 'tempra', 'riflessi', 'volonta'],
  }),
});

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

function toolCall(name: string, args: string): LlmStreamEvent[] {
  return [
    { type: 'tool-call', id: 'c1', name, arguments: args },
    { type: 'finish', reason: 'tool_calls' },
  ];
}
function text(t: string): LlmStreamEvent[] {
  return [
    { type: 'text', delta: t },
    { type: 'finish', reason: 'stop' },
  ];
}

const weapon: Item = {
  id: 'spada',
  name: 'Spada',
  equipped: true,
  effects: [{ kind: 'contributeDice', dice: [{ count: 1, sides: 6 }], mode: 'effect' }],
};
const attacker: Actor = {
  id: 'pc1',
  name: 'Eroe',
  kind: 'pc',
  attributes: { forza: 5 },
  skills: {},
  resources: {},
  conditions: [],
  items: [weapon],
  progression: { xp: 0, level: 0 },
};
const target: Actor = {
  id: 'g1',
  name: 'Goblin',
  kind: 'npc',
  attributes: {},
  skills: {},
  resources: { hp: { current: 8, max: 8 } },
  conditions: [],
  items: [],
  progression: { xp: 0, level: 0 },
};
const setupEvents: DomainEvent[] = [
  { type: 'ActorAdded', actor: attacker },
  { type: 'ActorAdded', actor: target },
];
const baseState = replay(setupEvents);

// SP4: attack e combat-only. I test basati su attack partono da uno stato gia in combat
// (la coppia atomica EncounterStarted + PhaseChanged porta phase a combat).
const combatSetupEvents: DomainEvent[] = [
  ...setupEvents,
  {
    type: 'EncounterStarted',
    encounter: {
      id: 'e',
      participants: [
        { actorId: 'pc1', zone: 'a', initiative: 10, actedThisRound: false },
        { actorId: 'g1', zone: 'a', initiative: 5, actedThisRound: false },
      ],
      round: 1,
      turnIndex: 0,
    },
  },
  { type: 'PhaseChanged', from: 'exploration', to: 'combat' },
];
const combatState = replay(combatSetupEvents);

const ATTACK_ARGS =
  '{"attackerId":"pc1","targetId":"g1","attribute":"forza","defense":"riflessi","defenseBase":10,"damageResource":"hp"}';

describe('runMasterTurn', () => {
  it('pipeline completa: tool-call attack -> engine risolve -> narrazione', async () => {
    const model = fakeModel((req, i) => {
      if (i === 0) {
        expect(req.toolChoice).toBe('auto');
        expect(req.tools?.some((t) => t.name === 'attack')).toBe(true);
        return toolCall('attack', ATTACK_ARGS);
      }
      return text('La spada cala e il goblin barcolla.');
    });
    const res = await runMasterTurn({ model, rng: createSeededRandom(42), ruleset: TURN_RULESET, state: combatState, playerAction: 'Attacco il goblin.' });
    expect(res.events.some((e) => e.type === 'AttackResolved')).toBe(true);
    // Il codice e l arbitro: con seed 42 la prova e 1d20(13)+5 = 18 vs CD 10 (successo), danno 1d6 = 3.
    expect(res.events.some((e) => e.type === 'DamageApplied' && e.amount === 3)).toBe(true);
    expect(res.state.actors['g1']?.resources['hp']?.current).toBe(5);
    expect(res.narration).toBe('La spada cala e il goblin barcolla.');
    expect(res.invocations[0]?.toolName).toBe('attack');
    expect(res.transcript[0]?.role).toBe('system');
    expect(res.transcript.length).toBeGreaterThan(3);
  });

  it('e deterministico a parita di seed (stessi eventi)', async () => {
    const script = (req: LlmRequest, i: number): LlmStreamEvent[] =>
      i === 0 ? toolCall('attack', ATTACK_ARGS) : text('fine');
    const run1 = await runMasterTurn({ model: fakeModel(script), rng: createSeededRandom(7), ruleset: TURN_RULESET, state: combatState, playerAction: 'Attacco.' });
    const run2 = await runMasterTurn({ model: fakeModel(script), rng: createSeededRandom(7), ruleset: TURN_RULESET, state: combatState, playerAction: 'Attacco.' });
    expect(run1.events).toEqual(run2.events);
  });

  it('gli eventi del turno sono canone replayabile', async () => {
    const model = fakeModel((req, i) => (i === 0 ? toolCall('attack', ATTACK_ARGS) : text('fine')));
    const res = await runMasterTurn({ model, rng: createSeededRandom(7), ruleset: TURN_RULESET, state: combatState, playerAction: 'Attacco.' });
    expect(replay([...combatSetupEvents, ...res.events])).toEqual(res.state);
  });

  it('spawn_npc crea canone (ActorAdded)', async () => {
    const model = fakeModel((req, i) =>
      i === 0 ? toolCall('spawn_npc', '{"id":"orco1","name":"Orco","resources":{"hp":{"current":12,"max":12}}}') : text('Un orco appare.'),
    );
    const res = await runMasterTurn({ model, rng: createSeededRandom(1), ruleset: TURN_RULESET, state: baseState, playerAction: 'Chi entra?' });
    expect(res.events.some((e) => e.type === 'ActorAdded')).toBe(true);
    expect(res.state.actors['orco1']?.name).toBe('Orco');
    expect(res.invocations[0]?.toolName).toBe('spawn_npc');
  });

  it('argomenti non validi: nessun evento, validation-failure tracciata, poi narra', async () => {
    const tracer = createRecordingTracer();
    const model = fakeModel((req, i) =>
      i === 0 ? toolCall('attack', '{"attackerId":"pc1"}') : text('Esito incerto.'),
    );
    const res = await runMasterTurn({ model, rng: createSeededRandom(1), ruleset: TURN_RULESET, state: combatState, playerAction: 'Attacco a caso.', tracer });
    expect(res.events).toEqual([]);
    expect(res.narration).toBe('Esito incerto.');
    expect(tracer.events.some((e) => e.kind === 'validation-failure' && e.strategy === 'tool:attack')).toBe(true);
  });

  it('comando rifiutato dal motore: nessun evento, error tracciato', async () => {
    const tracer = createRecordingTracer();
    const badArgs = '{"attackerId":"ignoto","targetId":"g1","defense":"riflessi","defenseBase":10,"damageResource":"hp"}';
    const model = fakeModel((req, i) => (i === 0 ? toolCall('attack', badArgs) : text('Niente accade.')));
    const res = await runMasterTurn({ model, rng: createSeededRandom(1), ruleset: TURN_RULESET, state: combatState, playerAction: 'Attacco un fantasma.', tracer });
    expect(res.events).toEqual([]);
    expect(res.narration).toBe('Niente accade.');
    expect(tracer.events.some((e) => e.kind === 'error')).toBe(true);
  });

  it('nessuna tool-call: narrazione pura, nessun evento, una sola chiamata al modello', async () => {
    let calls = 0;
    const model = fakeModel(() => {
      calls++;
      return text('Il vento soffia tra le rovine.');
    });
    const res = await runMasterTurn({ model, rng: createSeededRandom(1), ruleset: TURN_RULESET, state: baseState, playerAction: 'Mi guardo intorno.' });
    expect(res.events).toEqual([]);
    expect(res.narration).toBe('Il vento soffia tra le rovine.');
    expect(calls).toBe(1);
  });
});

describe('iniezione del Context Assembler', () => {
  it('usa l assembler iniettato per il messaggio di contesto', async () => {
    const model = fakeModel(() => text('ok'));
    const res = await runMasterTurn({
      model,
      rng: createSeededRandom(1),
      ruleset: TURN_RULESET,
      state: baseState,
      playerAction: 'Guardo intorno.',
      assembleContext: () => 'CONTESTO-INIETTATO',
    });
    // transcript: [system(prompt), system(contesto), user(azione)] -> indice 1 e il contesto.
    expect(res.transcript[1]?.content).toBe('CONTESTO-INIETTATO');
  });

  it('senza iniezione usa assembleContextStub (default invariato)', async () => {
    const model = fakeModel(() => text('ok'));
    const res = await runMasterTurn({ model, rng: createSeededRandom(1), ruleset: TURN_RULESET, state: baseState, playerAction: 'Guardo intorno.' });
    expect(res.transcript[1]?.content).toBe(assembleContextStub(baseState));
  });
});

describe('phaseGuidance e buildMasterMessages', () => {
  it('phaseGuidance ritorna una linea non vuota per ogni fase', () => {
    for (const p of PHASES) {
      expect(phaseGuidance(p).length).toBeGreaterThan(0);
    }
  });
  it('buildMasterMessages inietta il frammento della fase nel system prompt', () => {
    const msgs = buildMasterMessages('CTX', 'azione', 'combat');
    expect(msgs[0]?.role).toBe('system');
    expect(msgs[0]?.content).toContain(phaseGuidance('combat'));
    expect(msgs[1]?.content).toBe('CTX');
    expect(msgs[2]?.content).toBe('azione');
  });
});

describe('filtro tool per-iterazione', () => {
  it('flusso start_encounter -> attack: i tool di combat compaiono dopo la transizione', async () => {
    const seen: string[][] = [];
    const model = fakeModel((req, i) => {
      seen.push((req.tools ?? []).map((t) => t.name));
      if (i === 0) {
        return toolCall(
          'start_encounter',
          '{"encounterId":"e","participants":[{"actorId":"pc1","zone":"a","initiative":10},{"actorId":"g1","zone":"a","initiative":5}]}',
        );
      }
      if (i === 1) return toolCall('attack', ATTACK_ARGS);
      return text('Lo scontro infuria.');
    });
    const res = await runMasterTurn({ model, rng: createSeededRandom(42), ruleset: TURN_RULESET, state: baseState, playerAction: 'Sorprendo il goblin!' });
    expect(seen[0]).toContain('start_encounter');
    expect(seen[0]).not.toContain('attack');
    expect(seen[1]).toContain('attack');
    expect(seen[1]).not.toContain('start_encounter');
    expect(res.events.some((e) => e.type === 'PhaseChanged' && e.to === 'combat')).toBe(true);
    expect(res.events.some((e) => e.type === 'AttackResolved')).toBe(true);
  });
});
