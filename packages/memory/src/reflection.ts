// Reflection (spec 6.1): percorso di SCRITTURA della memoria, asincrono e fuori dal turno.
// fine scena -> estrae fatti (FactExtractor) -> Canon Ledger 8a (supersede se funzionale,
// altrimenti record) -> genera riassunto scena (Summarizer) -> L2 -> assegna salienza.
// memory NON dipende da ai: FactExtractor/Summarizer/Clock sono PORTE iniettate; le impl
// LLM-backed (StructuredOutputPort di 7b) vivono nell app (Piano 9), che compone ai+memory.
import type { StoredEvent } from '@loomn/engine';
import type { CanonFact, CanonLedger } from './canon-ledger';
import type { Summary, SummaryStore } from './summary-store';
import type { Clock } from './clock';
import { scoreSalience } from './salience';
import { segmentScenes } from './scene-segmentation';
import type { ReflectionCursor } from './reflection-cursor';

/** Un fatto narrativo estratto dalla scena. `functional` = predicato funzionale (es.
 *  si_trova_a): la Reflection usa `supersede` (anti-contraddizione); altrimenti `record`.
 *  La POLITICA di cosa sia funzionale e dell estrattore (informato dal modulo, app-wired). */
export interface ExtractedFact {
  subject: string;
  predicate: string;
  object: string;
  functional: boolean;
  /** Importanza 1..10 (alimenta la salienza). */
  importance: number;
}

/** Bozza di riassunto della scena prodotta dal Summarizer. */
export interface SceneSummaryDraft {
  text: string;
  /** Importanza 1..10 (alimenta la salienza del riassunto). */
  importance: number;
}

export interface ReflectionInput {
  /** Eventi della scena (con seq), in ordine. Se vuoto, la Reflection e un no-op. */
  events: StoredEvent[];
  /** Chiave di raggruppamento del riassunto (es. id sessione). */
  scope: string;
}

/** Porta: estrae fatti discreti dalla scena. Impl LLM-backed iniettata (app). */
export interface FactExtractor {
  extract(input: ReflectionInput): Promise<ExtractedFact[]>;
}

/** Porta: riassume la scena in prosa. Impl LLM-backed iniettata (app). */
export interface Summarizer {
  summarize(input: ReflectionInput): Promise<SceneSummaryDraft>;
}

export interface ReflectionDeps {
  ledger: CanonLedger;
  summaries: SummaryStore;
  extractor: FactExtractor;
  summarizer: Summarizer;
  clock: Clock;
  /** Confine transazionale opzionale per le SCRITTURE di scena (fatti + riassunto; in
   *  runScenesReflection anche il cursor): committano o falliscono insieme (M-13). Default
   *  pass-through (le impl a fake / senza db non transazionano). Lo fornisce il MemorySystem (host). */
  runInTransaction?: <T>(fn: () => T) => T;
}

export interface ReflectionResult {
  /** Fatti registrati nel Canon Ledger (gia attivi). */
  facts: CanonFact[];
  /** Riassunto di scena registrato in L2, o null se non c erano eventi. */
  summary: Summary | null;
}

/** Esito della fase async (LLM) di una scena: i dati da scrivere, ancora NON scritti. */
interface SceneComputation {
  from: number;
  to: number;
  extracted: ExtractedFact[];
  draft: SceneSummaryDraft;
}

/** Fase ASYNC: estrae fatti e riassunto (chiamate LLM). FUORI da qualunque transazione
 *  (better-sqlite3 e sincrono). Ritorna null se la scena e vuota. */
async function computeScene(deps: ReflectionDeps, input: ReflectionInput): Promise<SceneComputation | null> {
  if (input.events.length === 0) {
    return null;
  }
  const seqs = input.events.map((e) => e.seq);
  const from = Math.min(...seqs);
  const to = Math.max(...seqs);
  // Entrambe le chiamate LLM PRIMA di qualunque scrittura: la scena e atomica anche contro un
  // fallimento di extract/summarize (niente fatti scritti senza summary).
  const extracted = await deps.extractor.extract(input);
  const draft = await deps.summarizer.summarize(input);
  return { from, to, extracted, draft };
}

/** Fase SYNC: scrive fatti + riassunto nel DB. Da invocare dentro runInTransaction quando fornito,
 *  cosi le scritture sono atomiche (M-13). La ricorrenza e uno SNAPSHOT calcolato PRIMA delle scritture
 *  di questa scena (un conteggio per soggetto), cosi la salienza NON dipende dall ordine nel batch. */
function writeScene(deps: ReflectionDeps, input: ReflectionInput, c: SceneComputation): ReflectionResult {
  const recurrenceBySubject = new Map<string, number>();
  for (const ef of c.extracted) {
    if (!recurrenceBySubject.has(ef.subject)) {
      recurrenceBySubject.set(ef.subject, deps.ledger.active({ subject: ef.subject }).length);
    }
  }
  const facts: CanonFact[] = [];
  c.extracted.forEach((ef, i) => {
    const recurrence = recurrenceBySubject.get(ef.subject) ?? 0;
    const salience = scoreSalience({ importance: ef.importance, recurrence });
    const factInput = {
      id: `f-${c.from}-${c.to}-${i}`,
      subject: ef.subject,
      predicate: ef.predicate,
      object: ef.object,
      eventSeq: c.to,
      salience,
    };
    if (ef.functional) {
      deps.ledger.supersede(factInput);
    } else {
      deps.ledger.record(factInput);
    }
    facts.push({ ...factInput, status: 'active' });
  });

  const summary: Summary = {
    id: `s-scene-${c.from}-${c.to}`,
    level: 'scene',
    scope: input.scope,
    text: c.draft.text,
    importance: c.draft.importance,
    salience: scoreSalience({ importance: c.draft.importance, recurrence: 0 }),
    createdAt: deps.clock.now(),
    eventSeqFrom: c.from,
    eventSeqTo: c.to,
  };
  deps.summaries.record(summary);

  return { facts, summary };
}

/** Esegue la Reflection di una scena. Id deterministici dal range di seq della scena
 *  (`f-<from>-<to>-<i>`, `s-scene-<from>-<to>`) -> precondizione: una sola Reflection per range
 *  (i call site 8a lanciano su id duplicato). Non fa rete: usa le porte iniettate. Le scritture
 *  sono avvolte in runInTransaction quando fornito (atomicita, M-13). */
export async function runReflection(deps: ReflectionDeps, input: ReflectionInput): Promise<ReflectionResult> {
  const c = await computeScene(deps, input);
  if (c === null) {
    return { facts: [], summary: null };
  }
  const run = deps.runInTransaction ?? (<T>(fn: () => T): T => fn());
  return run(() => writeScene(deps, input, c));
}

/** Deps della riflessione multi-scena: le ReflectionDeps single-scene + il cursor (watermark).
 *  runReflection accetta comunque queste deps piu larghe (ignora `cursor`). */
export interface ScenesReflectionDeps extends ReflectionDeps {
  cursor: ReflectionCursor;
}

/** Riflette tutte le scene non ancora riflesse (seq > cursor), segmentate ai confini PhaseChanged
 *  (item 6). Per ogni scena: fase LLM async FUORI dalla transazione, poi {scritture + avanzamento
 *  cursor} in UNA transazione (quando runInTransaction e fornito) -> la scena e atomica (M-13): un
 *  crash o committa tutto (cursor avanzato, retry salta) o rolla-back tutto (cursor fermo, nessun
 *  fatto, retry ri-riflette pulito). La coda aperta (oltre l ultimo PhaseChanged) viene riflessa
 *  (flush). Nessun evento nuovo -> []. */
export async function runScenesReflection(
  deps: ScenesReflectionDeps,
  input: ReflectionInput,
): Promise<ReflectionResult[]> {
  const through = deps.cursor.get();
  const fresh = input.events.filter((e) => e.seq > through);
  const scenes = segmentScenes(fresh);
  const run = deps.runInTransaction ?? (<T>(fn: () => T): T => fn());
  const results: ReflectionResult[] = [];
  for (const scene of scenes) {
    const sceneInput: ReflectionInput = { events: scene, scope: input.scope };
    // Fase async (LLM) FUORI dalla transazione.
    const c = await computeScene(deps, sceneInput);
    if (c === null) continue; // segmentScenes non produce scene vuote; guardia difensiva.
    // Fase sync atomica: scritture + avanzamento cursor insieme.
    const res = run(() => {
      const r = writeScene(deps, sceneInput, c);
      const lastSeq = scene[scene.length - 1]?.seq;
      if (lastSeq !== undefined) deps.cursor.set(lastSeq);
      return r;
    });
    results.push(res);
  }
  return results;
}
