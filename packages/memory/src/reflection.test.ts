import { describe, it, expect, afterEach } from 'vitest';
import { openDatabase, type OpenDb } from './db';
import { createCanonLedger } from './canon-ledger';
import { createSummaryStore } from './summary-store';
import {
  runReflection,
  type ExtractedFact,
  type FactExtractor,
  type SceneSummaryDraft,
  type Summarizer,
  type ReflectionInput,
  type ReflectionDeps,
} from './reflection';
import type { Clock } from './clock';
import type { StoredEvent } from '@loomn/engine';

let open: OpenDb | undefined;
afterEach(() => {
  open?.close();
  open = undefined;
});

function fakeExtractor(facts: ExtractedFact[]): FactExtractor {
  return { extract: (_input: ReflectionInput) => Promise.resolve(facts) };
}
function fakeSummarizer(draft: SceneSummaryDraft): Summarizer {
  return { summarize: (_input: ReflectionInput) => Promise.resolve(draft) };
}
function fixedClock(ms: number): Clock {
  return { now: () => ms };
}

function setup(facts: ExtractedFact[], draft: SceneSummaryDraft, clockMs: number) {
  open = openDatabase(':memory:');
  const ledger = createCanonLedger(open.db);
  const summaries = createSummaryStore(open.db);
  const d: ReflectionDeps = {
    ledger,
    summaries,
    extractor: fakeExtractor(facts),
    summarizer: fakeSummarizer(draft),
    clock: fixedClock(clockMs),
  };
  return { d, ledger, summaries };
}

const events: StoredEvent[] = [
  { seq: 5, event: { type: 'ActorAdded', actor: { id: 'npc1', name: 'Oste', kind: 'npc', attributes: {}, skills: {}, resources: {}, conditions: [], items: [], progression: { xp: 0, level: 1 } } } },
  { seq: 7, event: { type: 'ActorDowned', actorId: 'npc1' } },
];

describe('runReflection', () => {
  it('e un no-op senza eventi', async () => {
    const { d, summaries } = setup([], { text: 't', importance: 5 }, 1000);
    const res = await runReflection(d, { events: [], scope: 'sess1' });
    expect(res).toEqual({ facts: [], summary: null });
    expect(summaries.list()).toEqual([]);
  });

  it('registra i fatti additivi nel ledger con id deterministici e salienza', async () => {
    const facts: ExtractedFact[] = [{ subject: 'pc1', predicate: 'ha_ucciso', object: 'Oste', functional: false, importance: 9 }];
    const { d, ledger } = setup(facts, { text: 'scena', importance: 6 }, 2000);
    const res = await runReflection(d, { events, scope: 'sess1' });
    expect(ledger.active()).toEqual([
      { id: 'f-5-7-0', subject: 'pc1', predicate: 'ha_ucciso', object: 'Oste', eventSeq: 7, salience: 0.9, status: 'active' },
    ]);
    expect(res.facts.map((f) => f.id)).toEqual(['f-5-7-0']);
  });

  it('usa supersede per i fatti funzionali (anti-contraddizione)', async () => {
    const facts: ExtractedFact[] = [{ subject: 'pc1', predicate: 'si_trova_a', object: 'Foresta', functional: true, importance: 4 }];
    const { d, ledger } = setup(facts, { text: 'x', importance: 5 }, 1);
    ledger.record({ id: 'loc0', subject: 'pc1', predicate: 'si_trova_a', object: 'Taverna', eventSeq: 1 });
    await runReflection(d, { events, scope: 'sess1' });
    expect(ledger.active({ subject: 'pc1', predicate: 'si_trova_a' }).map((f) => f.object)).toEqual(['Foresta']);
    expect(ledger.all({ subject: 'pc1', predicate: 'si_trova_a' }).map((f) => ({ id: f.id, status: f.status }))).toEqual([
      { id: 'loc0', status: 'retracted' },
      { id: 'f-5-7-0', status: 'active' },
    ]);
  });

  it('scrive il riassunto di scena in L2 con livello, scope, range e timestamp del Clock', async () => {
    const { d, summaries } = setup([], { text: 'la taverna brucia', importance: 8 }, 4242);
    const res = await runReflection(d, { events, scope: 'sess1' });
    expect(summaries.list()).toEqual([
      { id: 's-scene-5-7', level: 'scene', scope: 'sess1', text: 'la taverna brucia', importance: 8, salience: 0.8, createdAt: 4242, eventSeqFrom: 5, eventSeqTo: 7 },
    ]);
    expect(res.summary?.id).toBe('s-scene-5-7');
  });

  it('la ricorrenza di un soggetto gia presente aumenta la salienza del fatto', async () => {
    const facts: ExtractedFact[] = [{ subject: 'pc1', predicate: 'possiede', object: 'Spada', functional: false, importance: 5 }];
    const { d, ledger } = setup(facts, { text: 'x', importance: 5 }, 1);
    ledger.record({ id: 'pre1', subject: 'pc1', predicate: 'alleato_di', object: 'Re', eventSeq: 1 });
    ledger.record({ id: 'pre2', subject: 'pc1', predicate: 'teme', object: 'Drago', eventSeq: 2 });
    await runReflection(d, { events, scope: 'sess1' });
    expect(ledger.active({ predicate: 'possiede' })[0]?.salience).toBe(0.6);
  });

  it('piu fatti dello stesso batch: id indicizzati e ricorrenza condivisa (niente inflazione da ordine)', async () => {
    const facts: ExtractedFact[] = [
      { subject: 'pc1', predicate: 'possiede', object: 'Spada', functional: false, importance: 5 },
      { subject: 'pc1', predicate: 'possiede', object: 'Scudo', functional: false, importance: 5 },
    ];
    const { d, ledger } = setup(facts, { text: 'x', importance: 5 }, 1);
    const res = await runReflection(d, { events, scope: 'sess1' });
    expect(res.facts.map((f) => f.id)).toEqual(['f-5-7-0', 'f-5-7-1']);
    expect(ledger.active({ predicate: 'possiede' }).map((f) => f.salience)).toEqual([0.5, 0.5]);
  });
});
