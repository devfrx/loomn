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
}

export interface ReflectionResult {
  /** Fatti registrati nel Canon Ledger (gia attivi). */
  facts: CanonFact[];
  /** Riassunto di scena registrato in L2, o null se non c erano eventi. */
  summary: Summary | null;
}

/** Esegue la Reflection di una scena. Id deterministici dal range di seq della scena
 *  (`f-<from>-<to>-<i>`, `s-scene-<from>-<to>`) -> precondizione: una sola Reflection per
 *  range (i call site 8a lanciano su id duplicato). Non fa rete: usa le porte iniettate. */
export async function runReflection(deps: ReflectionDeps, input: ReflectionInput): Promise<ReflectionResult> {
  if (input.events.length === 0) {
    return { facts: [], summary: null };
  }
  const seqs = input.events.map((e) => e.seq);
  const from = Math.min(...seqs);
  const to = Math.max(...seqs);

  // Entrambe le chiamate LLM PRIMA di qualunque scrittura: la scena diventa ATOMICA contro un
  // fallimento di extract/summarize (niente fatti scritti senza summary -> niente collisione su
  // un retry, item 6). L output e identico: lo snapshot di ricorrenza resta calcolato sul ledger
  // PRIMA delle scritture di questa scena.
  const extracted = await deps.extractor.extract(input);
  const draft = await deps.summarizer.summarize(input);

  // Ricorrenza = fatti attivi del soggetto PRIMA di questa Reflection, presa come SNAPSHOT
  // (un solo conteggio per soggetto, prima di ogni scrittura): cosi piu fatti dello stesso
  // soggetto nello stesso batch condividono la stessa baseline e la salienza NON dipende
  // dall ordine nel batch (coerente con la purezza/determinismo del progetto).
  const recurrenceBySubject = new Map<string, number>();
  for (const ef of extracted) {
    if (!recurrenceBySubject.has(ef.subject)) {
      recurrenceBySubject.set(ef.subject, deps.ledger.active({ subject: ef.subject }).length);
    }
  }
  const facts: CanonFact[] = [];
  extracted.forEach((ef, i) => {
    const recurrence = recurrenceBySubject.get(ef.subject) ?? 0;
    const salience = scoreSalience({ importance: ef.importance, recurrence });
    const factInput = {
      id: `f-${from}-${to}-${i}`,
      subject: ef.subject,
      predicate: ef.predicate,
      object: ef.object,
      eventSeq: to,
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
    id: `s-scene-${from}-${to}`,
    level: 'scene',
    scope: input.scope,
    text: draft.text,
    importance: draft.importance,
    salience: scoreSalience({ importance: draft.importance, recurrence: 0 }),
    createdAt: deps.clock.now(),
    eventSeqFrom: from,
    eventSeqTo: to,
  };
  deps.summaries.record(summary);

  return { facts, summary };
}

/** Deps della riflessione multi-scena: le ReflectionDeps single-scene + il cursor (watermark).
 *  runReflection accetta comunque queste deps piu larghe (ignora `cursor`). */
export interface ScenesReflectionDeps extends ReflectionDeps {
  cursor: ReflectionCursor;
}

/** Riflette tutte le scene non ancora riflesse (seq > cursor), segmentate ai confini PhaseChanged
 *  (item 6). Riusa runReflection per ogni scena (range [from,to] per-scena -> id globalmente unici
 *  -> niente collisione su chiamate ripetute). Avanza il cursor DOPO ogni scena riuscita: un
 *  fallimento a meta lascia il cursor all ultima scena committata, cosi il retry riprende da li
 *  senza ri-riflettere ne collidere. La coda aperta (oltre l ultimo PhaseChanged) viene riflessa
 *  (flush). Nessun evento nuovo -> []. */
export async function runScenesReflection(
  deps: ScenesReflectionDeps,
  input: ReflectionInput,
): Promise<ReflectionResult[]> {
  const through = deps.cursor.get();
  const fresh = input.events.filter((e) => e.seq > through);
  const scenes = segmentScenes(fresh);
  const results: ReflectionResult[] = [];
  for (const scene of scenes) {
    const res = await runReflection(deps, { events: scene, scope: input.scope });
    results.push(res);
    const lastSeq = scene[scene.length - 1]?.seq;
    if (lastSeq !== undefined) deps.cursor.set(lastSeq); // avanza per scena (crash-safe)
  }
  return results;
}
