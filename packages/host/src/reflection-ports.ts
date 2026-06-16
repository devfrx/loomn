// Impl LLM-backed delle porte di SCRITTURA della memoria (spec 6.1). E l UNICO punto in cui
// ai (StructuredOutputPort di 7b) e memory (FactExtractor/Summarizer/ReflectionDeps) si
// compongono per il write path: FactExtractor/Summarizer pilotano lo StructuredOutputPort con
// uno schema Zod; reflectionDepsFor li monta su ledger/summaries/clock del MemorySystem, pronto
// per runReflection. (Il read path e gia composto da MemorySystem.assembleContext.)
import { z } from 'zod';
import type { LlmMessage, StructuredOutputPort } from '@loomn/ai';
import type { StoredEvent } from '@loomn/engine';
import type {
  FactExtractor,
  Summarizer,
  ReflectionInput,
  ExtractedFact,
  SceneSummaryDraft,
  ReflectionDeps,
} from '@loomn/memory';
import type { MemorySystem } from './memory-system';

const extractedFactSchema = z.object({
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.string().min(1),
  functional: z.boolean(),
  importance: z.number().int().min(1).max(10),
});

const factsResultSchema = z.object({ facts: z.array(extractedFactSchema) });

const sceneDraftSchema = z.object({
  text: z.string().min(1),
  importance: z.number().int().min(1).max(10),
});

const EXTRACT_SYSTEM =
  'Sei un analista narrativo. Dagli eventi del motore estrai i fatti canonici DISCRETI come ' +
  'terne (subject, predicate, object). functional=true se il predicato ammette un solo valore ' +
  'per soggetto (es. si_trova_a, alleato_di), cosi il valore precedente va sostituito. ' +
  'importance da 1 (effimero) a 10 (permanente). Ometti i dettagli effimeri (singoli tiri).';

const SUMMARIZE_SYSTEM =
  'Sei un cronista. Riassumi la scena in 1-3 frasi di prosa per la continuita narrativa. ' +
  'importance da 1 (effimero) a 10 (svolta permanente).';

/** Rende gli eventi della scena in testo deterministico per il prompt (una riga per evento). */
export function renderEventsForReflection(events: StoredEvent[]): string {
  return events.map((e) => `#${e.seq} ${e.event.type} ${JSON.stringify(e.event)}`).join('\n');
}

function reflectionMessages(system: string, input: ReflectionInput): LlmMessage[] {
  return [
    { role: 'system', content: system },
    { role: 'user', content: `Scena ${input.scope} (eventi del motore):\n${renderEventsForReflection(input.events)}` },
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

/** Compone le ReflectionDeps (porte di scrittura, Piano 8b) da un MemorySystem (ledger+summaries+
 *  clock sullo STESSO DB) e da uno StructuredOutputPort (impl LLM di extractor/summarizer). */
export function reflectionDepsFor(system: MemorySystem, port: StructuredOutputPort): ReflectionDeps {
  return {
    ledger: system.ledger,
    summaries: system.summaries,
    extractor: createLlmFactExtractor(port),
    summarizer: createLlmSummarizer(port),
    clock: system.clock,
  };
}
