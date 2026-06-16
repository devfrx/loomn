// Provider AI reale: composizione di 7a (adapter OpenAI-compat) + 7b (StructuredOutputPort).
// Costruisce sia il LanguageModel (per runMasterTurn) sia lo StructuredOutputPort (per la
// Reflection). Il transport e INIETTABILE -> testabile senza rete (default: createFetchTransport(),
// fetch globale, usato dall app reale nel 9c-ii). NON tocca safeStorage/IO: la chiave arriva gia
// in chiaro (decifrata dal main nel 9c-ii); host resta agnostico dal processo Electron.
import {
  createOpenAiCompatibleModel,
  createStructuredOutput,
  createFetchTransport,
  type LanguageModel,
  type StructuredOutputPort,
  type HttpTransport,
  type TracingPort,
} from '@loomn/ai';

export interface LanguageProviderConfig {
  /** URL base OpenAI-compatibile (es. http://localhost:1234/v1 per LM Studio). */
  baseUrl: string;
  /** Nome/id del modello passato al provider. */
  model: string;
  /** Chiave API gia in chiaro (assente per LM Studio locale). */
  apiKey?: string;
  /** Transport HTTP iniettabile (default: createFetchTransport(), fetch globale). */
  transport?: HttpTransport;
  /** Tracer opzionale (osservabilita, spec 7). Default: noopTracer dentro adapter/structured. */
  tracer?: TracingPort;
}

export interface LanguageProvider {
  /** Per runMasterTurn (turno agentico). */
  model: LanguageModel;
  /** Per la Reflection (createLlmFactExtractor/Summarizer via reflectionDepsFor). */
  structured: StructuredOutputPort;
}

/** Costruisce model + structured port da una config risolta. exactOptionalPropertyTypes -> spread
 *  condizionali (mai campo:undefined). */
export function createLanguageProvider(config: LanguageProviderConfig): LanguageProvider {
  const transport = config.transport ?? createFetchTransport();
  const model = createOpenAiCompatibleModel({
    baseUrl: config.baseUrl,
    model: config.model,
    transport,
    ...(config.apiKey !== undefined ? { apiKey: config.apiKey } : {}),
    ...(config.tracer !== undefined ? { tracer: config.tracer } : {}),
  });
  const structured = createStructuredOutput(model, {
    ...(config.tracer !== undefined ? { tracer: config.tracer } : {}),
  });
  return { model, structured };
}
