import { describe, it, expect, afterEach } from 'vitest';
import { openDatabase, type OpenDb } from './db';
import { createCanonLedger } from './canon-ledger';
import { createSummaryStore, type SummaryStore } from './summary-store';
import {
  runReflection,
  runScenesReflection,
  type ExtractedFact,
  type FactExtractor,
  type SceneSummaryDraft,
  type Summarizer,
  type ReflectionInput,
  type ReflectionDeps,
  type ScenesReflectionDeps,
} from './reflection';
import type { Clock } from './clock';
import type { StoredEvent } from '@loomn/engine';
import type { ReflectionCursor } from './reflection-cursor';

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

  it('se il summarizer lancia, nessun fatto viene scritto (atomicita della scena)', async () => {
    const facts: ExtractedFact[] = [{ subject: 'pc1', predicate: 'ha_ucciso', object: 'Oste', functional: false, importance: 9 }];
    const { d, ledger } = setup(facts, { text: 'x', importance: 5 }, 1);
    const throwingSummarizer: Summarizer = { summarize: () => Promise.reject(new Error('summarize fallita')) };
    const deps = { ...d, summarizer: throwingSummarizer };
    await expect(runReflection(deps, { events, scope: 'sess1' })).rejects.toThrow('summarize fallita');
    // Atomicita: il summarizer lancia DOPO extract ma PRIMA di scrivere i fatti -> ledger vuoto.
    expect(ledger.active()).toEqual([]);
  });

  it('le scritture di scena sono atomiche dietro runInTransaction: fallimento a meta-scrittura -> rollback (M-13)', async () => {
    open = openDatabase(':memory:');
    const ledger = createCanonLedger(open.db);
    const realSummaries = createSummaryStore(open.db);
    // Summaries che lancia DOPO che i fatti sono gia stati scritti nel ledger (dentro lo stesso writeScene).
    const throwingSummaries: SummaryStore = {
      record: () => {
        throw new Error('disco pieno a meta scrittura');
      },
      list: (filter) => realSummaries.list(filter),
    };
    const facts: ExtractedFact[] = [{ subject: 'pc1', predicate: 'trova', object: 'gemma', functional: false, importance: 7 }];
    const deps: ReflectionDeps = {
      ledger,
      summaries: throwingSummaries,
      extractor: fakeExtractor(facts),
      summarizer: fakeSummarizer({ text: 'scena', importance: 7 }),
      clock: fixedClock(1),
      runInTransaction: <T>(fn: () => T): T => open!.db.transaction(() => fn()),
    };
    await expect(runReflection(deps, { events, scope: 'sess1' })).rejects.toThrow('disco pieno');
    // Senza transazione i fatti resterebbero (auto-commit) -> al retry UNIQUE collision. Con la
    // transazione il ledger e VUOTO: il retry puo ri-riflettere senza collidere.
    expect(ledger.active()).toEqual([]);
  });
});

function fakeCursor(initial = 0): ReflectionCursor {
  let seq = initial;
  return { get: () => seq, set: (s) => { seq = s; } };
}
const added = (seq: number): StoredEvent => ({
  seq,
  event: { type: 'ActorAdded', actor: { id: `a${seq}`, name: `A${seq}`, kind: 'npc', attributes: {}, skills: {}, resources: {}, conditions: [], items: [], progression: { xp: 0, level: 1 } } },
});
const phaseEv = (seq: number): StoredEvent => ({ seq, event: { type: 'PhaseChanged', from: 'exploration', to: 'combat' } });

describe('runScenesReflection', () => {
  it('riflessioni ripetute su scene successive non collidono sugli id deterministici', async () => {
    const facts: ExtractedFact[] = [{ subject: 'pc1', predicate: 'incontra', object: 'Oste', functional: false, importance: 5 }];
    const { d, summaries } = setup(facts, { text: 'scena', importance: 5 }, 1);
    const cursor = fakeCursor();
    const deps: ScenesReflectionDeps = { ...d, cursor };
    // 1a chiamata: eventi 1..3 con un PhaseChanged@2 -> due scene [1,2] e [3].
    await runScenesReflection(deps, { events: [added(1), phaseEv(2), added(3)], scope: 'sess1' });
    // 2a chiamata: stream cresciuto (4,5 con PhaseChanged@5) -> solo la scena nuova [4,5].
    await runScenesReflection(deps, { events: [added(1), phaseEv(2), added(3), added(4), phaseEv(5)], scope: 'sess1' });
    // Nessun throw (niente UNIQUE constraint): summary con range disgiunti.
    expect(summaries.list().map((s) => s.id)).toEqual(['s-scene-1-2', 's-scene-3-3', 's-scene-4-5']);
    expect(cursor.get()).toBe(5);
  });

  it('un PhaseChanged segmenta lo stream in due scene riflesse separatamente', async () => {
    const facts: ExtractedFact[] = [{ subject: 'pc1', predicate: 'vede', object: 'Oste', functional: false, importance: 5 }];
    const { d, ledger } = setup(facts, { text: 'scena', importance: 5 }, 1);
    const deps: ScenesReflectionDeps = { ...d, cursor: fakeCursor() };
    const results = await runScenesReflection(deps, { events: [added(1), phaseEv(2), added(3)], scope: 'sess1' });
    expect(results).toHaveLength(2);
    expect(ledger.active().map((f) => f.id)).toEqual(['f-1-2-0', 'f-3-3-0']);
  });

  it('la scena aperta viene riflessa (flush) e una seconda chiamata non collide', async () => {
    const facts: ExtractedFact[] = [{ subject: 'pc1', predicate: 'esplora', object: 'Bosco', functional: false, importance: 4 }];
    const { d, summaries } = setup(facts, { text: 'scena', importance: 4 }, 1);
    const cursor = fakeCursor();
    const deps: ScenesReflectionDeps = { ...d, cursor };
    // Nessun PhaseChanged: una sola scena aperta [1,2] -> flush.
    await runScenesReflection(deps, { events: [added(1), added(2)], scope: 'sess1' });
    // Cresce ancora (sempre senza PhaseChanged): la seconda scena aperta e [3].
    await runScenesReflection(deps, { events: [added(1), added(2), added(3)], scope: 'sess1' });
    expect(summaries.list().map((s) => s.id)).toEqual(['s-scene-1-2', 's-scene-3-3']);
    expect(cursor.get()).toBe(3);
  });

  it('senza eventi nuovi e un no-op e non avanza il cursor', async () => {
    const facts: ExtractedFact[] = [{ subject: 'pc1', predicate: 'vede', object: 'Oste', functional: false, importance: 5 }];
    const { d, summaries } = setup(facts, { text: 'scena', importance: 5 }, 1);
    const cursor = fakeCursor(3); // gia riflesso fino a 3
    const deps: ScenesReflectionDeps = { ...d, cursor };
    const results = await runScenesReflection(deps, { events: [added(1), added(2), added(3)], scope: 'sess1' });
    expect(results).toEqual([]);
    expect(summaries.list()).toEqual([]);
    expect(cursor.get()).toBe(3);
  });

  it('il cursor avanza per scena: un fallimento a meta lascia le scene committate e riprende senza collidere', async () => {
    const facts: ExtractedFact[] = [{ subject: 'pc1', predicate: 'agisce', object: 'X', functional: false, importance: 5 }];
    const { d, summaries } = setup(facts, { text: 'scena', importance: 5 }, 1);
    const cursor = fakeCursor();
    // Summarizer che lancia SOLO alla seconda chiamata (la 2a scena del primo pass).
    let calls = 0;
    const flaky: Summarizer = {
      summarize: () => {
        calls += 1;
        if (calls === 2) return Promise.reject(new Error('summarize fallita'));
        return Promise.resolve({ text: 'scena', importance: 5 });
      },
    };
    const deps: ScenesReflectionDeps = { ...d, summarizer: flaky, cursor };
    // Pass 1: scene [1,2] e [3]; la 2a (scena [3]) fallisce.
    await expect(runScenesReflection(deps, { events: [added(1), phaseEv(2), added(3)], scope: 'sess1' })).rejects.toThrow('summarize fallita');
    // La 1a scena e committata, il cursor e avanzato fino al suo ultimo seq (2).
    expect(summaries.list().map((s) => s.id)).toEqual(['s-scene-1-2']);
    expect(cursor.get()).toBe(2);
    // Retry: ora summarize non lancia piu -> riflette SOLO la scena [3], niente collisione.
    await runScenesReflection(deps, { events: [added(1), phaseEv(2), added(3)], scope: 'sess1' });
    expect(summaries.list().map((s) => s.id)).toEqual(['s-scene-1-2', 's-scene-3-3']);
    expect(cursor.get()).toBe(3);
  });

  it('la ricorrenza cross-scena alza la salienza del fatto ripetuto', async () => {
    const facts: ExtractedFact[] = [{ subject: 'pc1', predicate: 'possiede', object: 'Spada', functional: false, importance: 5 }];
    const { d, ledger } = setup(facts, { text: 'scena', importance: 5 }, 1);
    const deps: ScenesReflectionDeps = { ...d, cursor: fakeCursor() };
    // Due scene (PhaseChanged@2): lo stesso fatto ricorre -> la 2a scena vede la 1a nel ledger.
    await runScenesReflection(deps, { events: [added(1), phaseEv(2), added(3)], scope: 'sess1' });
    const sal = ledger.active().map((f) => f.salience);
    expect(sal).toHaveLength(2);
    expect(sal[1]!).toBeGreaterThan(sal[0]!); // recurrence 1 > recurrence 0
  });
});
