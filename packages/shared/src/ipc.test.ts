import { describe, it, expect } from 'vitest';
import {
  IPC_CHANNELS,
  dispatchRequestSchema,
  dispatchResultSchema,
  runTurnRequestSchema,
  runTurnResultSchema,
  providerConfigSchema,
  providerResultSchema,
  reflectRequestSchema,
  reflectResultSchema,
  statusResultSchema,
  readModelPushSchema,
  narrationHistoryRequestSchema,
  narrationHistoryResultSchema,
  canonRequestSchema,
  canonResultSchema,
  summariesRequestSchema,
  summariesResultSchema,
} from './ipc';

function sampleActor(id: string): unknown {
  return {
    id,
    name: id,
    kind: 'npc',
    attributes: {},
    skills: {},
    resources: { hp: { current: 10, max: 10 } },
    conditions: [],
    items: [],
    progression: { xp: 0, level: 1 },
  };
}

describe('IPC_CHANNELS', () => {
  it('non espone piu il canale ping (rimosso in 9c-ii)', () => {
    expect((IPC_CHANNELS as Record<string, string>)['ping']).toBeUndefined();
  });

  it('espone i canali write e read del 9c-ii', () => {
    expect(IPC_CHANNELS.dispatch).toBe('loomn:dispatch');
    expect(IPC_CHANNELS.runTurn).toBe('loomn:run-turn');
    expect(IPC_CHANNELS.setProvider).toBe('loomn:set-provider');
    expect(IPC_CHANNELS.reflect).toBe('loomn:reflect');
    expect(IPC_CHANNELS.getStatus).toBe('loomn:get-status');
    expect(IPC_CHANNELS.readModelPush).toBe('loomn:read-model-push');
  });

  it('espone i canali read on-demand del Piano 0', () => {
    expect(IPC_CHANNELS.narrationHistory).toBe('loomn:narration-history');
    expect(IPC_CHANNELS.canon).toBe('loomn:canon');
    expect(IPC_CHANNELS.summaries).toBe('loomn:summaries');
  });
});

describe('dispatchRequestSchema (= commandSchema al confine)', () => {
  it('valida un Command ben formato (AddActor)', () => {
    const parsed = dispatchRequestSchema.parse({ type: 'AddActor', actor: sampleActor('goblin') });
    expect(parsed.type).toBe('AddActor');
  });

  it('rifiuta un payload che non e un Command', () => {
    expect(() => dispatchRequestSchema.parse({ type: 'Teleport' })).toThrow();
  });
});

describe('dispatchResultSchema (union ok/errore)', () => {
  it('accetta l esito ok con versione ed events', () => {
    expect(dispatchResultSchema.parse({ ok: true, version: 3, events: [] })).toEqual({
      ok: true,
      version: 3,
      events: [],
    });
  });

  it('accetta l esito di errore', () => {
    expect(dispatchResultSchema.parse({ ok: false, error: 'boom' })).toEqual({ ok: false, error: 'boom' });
  });

  it('rifiuta ok senza versione', () => {
    expect(() => dispatchResultSchema.parse({ ok: true, events: [] })).toThrow();
  });

  it('rifiuta ok senza events', () => {
    expect(() => dispatchResultSchema.parse({ ok: true, version: 3 })).toThrow();
  });
});

describe('schemi run-turn / provider / reflect / status', () => {
  it('runTurnRequest richiede playerAction stringa', () => {
    expect(runTurnRequestSchema.parse({ playerAction: 'apro la porta' })).toEqual({ playerAction: 'apro la porta' });
    expect(() => runTurnRequestSchema.parse({})).toThrow();
  });

  it('runTurnResult ok porta narration, versione ed events', () => {
    expect(runTurnResultSchema.parse({ ok: true, narration: 'x', version: 1, events: [] })).toEqual({
      ok: true,
      narration: 'x',
      version: 1,
      events: [],
    });
  });

  it('providerConfig accetta apiKey opzionale (path LM Studio locale senza chiave)', () => {
    expect(providerConfigSchema.parse({ baseUrl: 'http://x/v1', model: 'm' })).toEqual({
      baseUrl: 'http://x/v1',
      model: 'm',
    });
    expect(providerConfigSchema.parse({ baseUrl: 'http://x/v1', model: 'm', apiKey: 'sk' }).apiKey).toBe('sk');
  });

  it('providerResult e reflectResult validano le union ok/errore', () => {
    expect(providerResultSchema.parse({ ok: true })).toEqual({ ok: true });
    expect(reflectResultSchema.parse({ ok: true, factCount: 2, summarized: true })).toEqual({
      ok: true,
      factCount: 2,
      summarized: true,
    });
    expect(() => reflectResultSchema.parse({ ok: true })).toThrow();
  });

  it('statusResult richiede i tre flag diagnostici', () => {
    expect(statusResultSchema.parse({ version: 0, safeStorageAvailable: true, providerConfigured: false })).toEqual({
      version: 0,
      safeStorageAvailable: true,
      providerConfigured: false,
    });
  });
});

describe('readModelPushSchema (snapshot read-side version e state)', () => {
  it('valida uno snapshot con stato vuoto', () => {
    const push = readModelPushSchema.parse({ version: 0, state: { version: 0, actors: {}, encounter: null, quests: {}, phase: 'exploration' } });
    expect(push.version).toBe(0);
    expect(push.state.actors).toEqual({});
  });

  it('rifiuta uno snapshot senza state', () => {
    expect(() => readModelPushSchema.parse({ version: 0 })).toThrow();
  });
});

describe('canali read on-demand (narrazione / canon / L2)', () => {
  it('narrationHistoryRequest accetta before e limit opzionali', () => {
    expect(narrationHistoryRequestSchema.parse({})).toEqual({});
    expect(narrationHistoryRequestSchema.parse({ before: 10, limit: 20 })).toEqual({ before: 10, limit: 20 });
  });

  it('narrationHistoryResult ok porta entries e hasMore', () => {
    const parsed = narrationHistoryResultSchema.parse({
      ok: true,
      entries: [{ seq: 2, playerAction: 'apro', narration: 'la porta cigola' }],
      hasMore: true,
    });
    expect(parsed).toEqual({
      ok: true,
      entries: [{ seq: 2, playerAction: 'apro', narration: 'la porta cigola' }],
      hasMore: true,
    });
  });

  it('canonRequest accetta filtri e includeRetracted opzionali', () => {
    expect(canonRequestSchema.parse({})).toEqual({});
    expect(canonRequestSchema.parse({ subject: 'krix', includeRetracted: true })).toEqual({
      subject: 'krix',
      includeRetracted: true,
    });
  });

  it('canonResult ok porta i facts', () => {
    const fact = { id: 'f1', subject: 'krix', predicate: 'serve', object: 'vhalmar', eventSeq: 1, salience: 0.5, status: 'active' };
    expect(canonResultSchema.parse({ ok: true, facts: [fact] })).toEqual({ ok: true, facts: [fact] });
  });

  it('summariesRequest accetta level e scope opzionali', () => {
    expect(summariesRequestSchema.parse({})).toEqual({});
    expect(summariesRequestSchema.parse({ level: 'scene', scope: 'sess-1' })).toEqual({ level: 'scene', scope: 'sess-1' });
  });

  it('summariesResult ok porta i summaries', () => {
    const s = { id: 's1', level: 'scene', scope: 'sess-1', text: 'riassunto', importance: 5, salience: 0.5, createdAt: 1000, eventSeqFrom: 1, eventSeqTo: 3 };
    expect(summariesResultSchema.parse({ ok: true, summaries: [s] })).toEqual({ ok: true, summaries: [s] });
  });
});
