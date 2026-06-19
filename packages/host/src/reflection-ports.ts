// Impl LLM-backed delle porte di SCRITTURA della memoria (spec 6.1). E l UNICO punto in cui
// ai (StructuredOutputPort di 7b) e memory (FactExtractor/Summarizer/ScenesReflectionDeps) si
// compongono per il write path: FactExtractor/Summarizer pilotano lo StructuredOutputPort con
// uno schema Zod; reflectionDepsFor li monta su ledger/summaries/clock/cursor del MemorySystem,
// pronto per runScenesReflection. (Il read path e gia composto da MemorySystem.assembleContext.)
import { z } from 'zod';
import { llmArray, coerceNumericString } from '@loomn/ai';
import type { LlmMessage, StructuredOutputPort } from '@loomn/ai';
import type { StoredEvent } from '@loomn/engine';
import type {
  FactExtractor,
  Summarizer,
  ReflectionInput,
  ExtractedFact,
  SceneSummaryDraft,
  ScenesReflectionDeps,
} from '@loomn/memory';
import type { MemorySystem } from './memory-system';

// importance: intero 1..10 coerciuto (G1, pattern numeri-come-stringhe). Una sola definizione,
// due usi (DRY). coerceNumericString resta STRICT: "abc"/vuoto/null -> rifiutato, niente 0 silenzioso.
// Cast esplicito: z.preprocess produce ZodEffects<ZodNumber, number, unknown>; il tipo di output e
// number, ma TypeScript non riesce a inferirlo attraverso z.object e StructuredOutputPort<T> con
// exactOptionalPropertyTypes. Il cast e sicuro: la validazione Zod avviene a runtime.
const importanceSchema = z.preprocess(coerceNumericString, z.number().int().min(1).max(10)) as z.ZodType<number>;

const extractedFactSchema = z.object({
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.string().min(1),
  functional: z.boolean(), // boolean puro: i booleani-come-stringhe non sono mai stati osservati (YAGNI)
  importance: importanceSchema,
});

// facts: il modello debole lo stringifica ("[{...}]") -> llmArray lo JSON.parse-a prima di validare
// (G6 portato sul write-path, F3/G5). Strict: stringa-non-JSON / JSON-non-array -> rifiutato.
// Cast: llmArray produce ZodEffects con tipo output corretto ma TypeScript perde l inferenza
// attraverso port.generate<T>. Cast sicuro: Zod valida a runtime.
const factsResultSchema = z.object({ facts: llmArray(z.array(extractedFactSchema)) }) as z.ZodType<{ facts: ExtractedFact[] }>;

// Nessun cast qui: importanceSchema e gia z.ZodType<number> e text e una stringa pura, quindi
// l oggetto resta input=output (a differenza di factsResultSchema, dove llmArray reintroduce il
// preprocess a livello top e impone il cast).
const sceneDraftSchema = z.object({
  text: z.string().min(1),
  importance: importanceSchema,
});

const EXTRACT_SYSTEM =
  'Sei un analista narrativo. Dalla scena (eventi del motore e narrazione del Master) estrai i ' +
  'fatti canonici NARRATIVI e DISCRETI come terne (subject, predicate, object): relazioni, ' +
  'alleanze, segreti, moventi, luoghi, promesse, tradimenti. functional=true se il predicato ' +
  'ammette un solo valore per soggetto (es. si_trova_a, alleato_di), cosi il valore precedente va ' +
  'sostituito. importance da 1 (effimero) a 10 (permanente). NON estrarre statistiche meccaniche ' +
  'gia tracciate dal motore (hp, attributi, danni, singoli tiri): quelle sono gia in L1. Ometti i ' +
  'dettagli effimeri.';

const SUMMARIZE_SYSTEM =
  'Sei un cronista. Riassumi la scena in 1-3 frasi di prosa per la continuita narrativa. ' +
  'importance da 1 (effimero) a 10 (svolta permanente).';

/** Rende gli eventi della scena in testo per il prompt. I NarrationRecorded diventano PROSA
 *  (azione del giocatore + narrazione del Master) cosi l estrattore vede la storia; gli eventi
 *  meccanici restano una riga per evento (deterministico). */
export function renderEventsForReflection(events: StoredEvent[]): string {
  return events
    .map((e) => {
      if (e.event.type === 'NarrationRecorded') {
        return `#${e.seq} Scena (prosa)\nGiocatore: ${e.event.playerAction}\nMaster: ${e.event.narration}`;
      }
      return `#${e.seq} ${e.event.type} ${JSON.stringify(e.event)}`;
    })
    .join('\n');
}

function reflectionMessages(system: string, input: ReflectionInput): LlmMessage[] {
  return [
    { role: 'system', content: system },
    { role: 'user', content: `Scena ${input.scope} (eventi del motore e narrazione del Master):\n${renderEventsForReflection(input.events)}` },
  ];
}

/** FactExtractor LLM-backed: pilota lo StructuredOutputPort (7b) con uno schema Zod. */
export function createLlmFactExtractor(port: StructuredOutputPort): FactExtractor {
  return {
    async extract(input: ReflectionInput): Promise<ExtractedFact[]> {
      const res = await port.generate({
        messages: reflectionMessages(EXTRACT_SYSTEM, input),
        schema: factsResultSchema,
        schemaName: 'extract_facts',
        schemaDescription: 'Fatti canonici discreti estratti dalla scena.',
      });
      return res.value.facts;
    },
  };
}

/** Summarizer LLM-backed: pilota lo StructuredOutputPort (7b) con uno schema Zod. */
export function createLlmSummarizer(port: StructuredOutputPort): Summarizer {
  return {
    async summarize(input: ReflectionInput): Promise<SceneSummaryDraft> {
      const res = await port.generate({
        messages: reflectionMessages(SUMMARIZE_SYSTEM, input),
        schema: sceneDraftSchema,
        schemaName: 'summarize_scene',
        schemaDescription: 'Riassunto in prosa della scena.',
      });
      return res.value;
    },
  };
}

/** Compone le ScenesReflectionDeps (porte di scrittura + cursor, Piano 8b/item 6) da un
 *  MemorySystem (ledger+summaries+clock+cursor sullo STESSO DB) e da uno StructuredOutputPort
 *  (impl LLM di extractor/summarizer). */
export function reflectionDepsFor(system: MemorySystem, port: StructuredOutputPort): ScenesReflectionDeps {
  return {
    ledger: system.ledger,
    summaries: system.summaries,
    extractor: createLlmFactExtractor(port),
    summarizer: createLlmSummarizer(port),
    clock: system.clock,
    cursor: system.cursor,
    runInTransaction: system.runInTransaction,
  };
}
