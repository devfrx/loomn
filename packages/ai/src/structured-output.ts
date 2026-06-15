// StructuredOutputPort: dato uno schema Zod, ottiene un oggetto validato dall LLM con 3
// livelli di fallback (spec 7): function-call -> json_schema (constrained) -> parse+repair+retry.
// Costruito sopra la porta LanguageModel di 7a (usa collectResponse).
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { collectResponse, type LanguageModel, type LlmMessage } from './language-model';
import { noopTracer, type TracingPort } from './tracing';
import { parseJson, repairJson } from './json-repair';

export type StructuredOutputStrategy = 'function-call' | 'json-schema' | 'repair';

export interface StructuredOutputRequest<T> {
  messages: LlmMessage[];
  schema: z.ZodType<T>;
  /** nome dello strumento / json_schema; usato anche per matchare la tool-call. */
  schemaName: string;
  schemaDescription?: string;
  temperature?: number;
}

export interface StructuredOutputResult<T> {
  value: T;
  strategy: StructuredOutputStrategy;
}

export class StructuredOutputError extends Error {
  constructor(
    message: string,
    readonly lastText: string,
  ) {
    super(message);
    this.name = 'StructuredOutputError';
  }
}

export interface StructuredOutputOptions {
  tracer?: TracingPort;
  /** quali livelli tentare e in che ordine (default: tutti e tre). */
  strategies?: StructuredOutputStrategy[];
}

export interface StructuredOutputPort {
  generate<T>(request: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>>;
}

const DEFAULT_STRATEGIES: readonly StructuredOutputStrategy[] = ['function-call', 'json-schema', 'repair'];

type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

function validate<T>(schema: z.ZodType<T>, json: unknown): Validated<T> {
  const result = schema.safeParse(json);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, error: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ') };
}

export function createStructuredOutput(model: LanguageModel, options: StructuredOutputOptions = {}): StructuredOutputPort {
  const tracer = options.tracer ?? noopTracer;
  const strategies = options.strategies ?? DEFAULT_STRATEGIES;
  return {
    async generate<T>(request: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> {
      const jsonSchema = zodToJsonSchema(request.schema, { target: 'openApi3', $refStrategy: 'none' }) as Record<string, unknown>;
      const temp = request.temperature !== undefined ? { temperature: request.temperature } : {};
      let lastText = '';

      // Livello 1 — function-call nativo
      if (strategies.includes('function-call')) {
        try {
          const res = await collectResponse(
            model.stream({
              messages: request.messages,
              tools: [
                {
                  name: request.schemaName,
                  description: request.schemaDescription ?? request.schemaName,
                  parameters: jsonSchema,
                },
              ],
              toolChoice: 'required',
              ...temp,
            }),
          );
          const call = res.toolCalls.find((c) => c.name === request.schemaName) ?? res.toolCalls[0];
          if (call !== undefined) {
            lastText = call.arguments;
            const parsed = parseJson(call.arguments);
            if (parsed.ok) {
              const v = validate(request.schema, parsed.json);
              if (v.ok) return { value: v.value, strategy: 'function-call' };
              tracer.record({ kind: 'validation-failure', strategy: 'function-call', issues: v.error });
            } else {
              tracer.record({ kind: 'validation-failure', strategy: 'function-call', issues: parsed.error });
            }
          } else {
            tracer.record({ kind: 'validation-failure', strategy: 'function-call', issues: 'nessuna tool-call restituita' });
          }
        } catch (e) {
          tracer.record({ kind: 'error', message: `function-call: ${(e as Error).message}` });
        }
      }

      // Livello 2 — constrained decoding / JSON-schema
      if (strategies.includes('json-schema')) {
        try {
          const res = await collectResponse(
            model.stream({
              messages: request.messages,
              responseFormat: { type: 'json_schema', name: request.schemaName, schema: jsonSchema },
              ...temp,
            }),
          );
          lastText = res.text;
          const parsed = parseJson(res.text);
          if (parsed.ok) {
            const v = validate(request.schema, parsed.json);
            if (v.ok) return { value: v.value, strategy: 'json-schema' };
            tracer.record({ kind: 'validation-failure', strategy: 'json-schema', issues: v.error });
          } else {
            tracer.record({ kind: 'validation-failure', strategy: 'json-schema', issues: parsed.error });
          }
        } catch (e) {
          tracer.record({ kind: 'error', message: `json-schema: ${(e as Error).message}` });
        }
      }

      // Livello 3 — parse + repair + 1 retry
      if (strategies.includes('repair')) {
        let messages: LlmMessage[] = [
          ...request.messages,
          {
            role: 'system',
            content: `Rispondi SOLO con un oggetto JSON conforme a questo schema, senza testo o markdown extra: ${JSON.stringify(jsonSchema)}`,
          },
        ];
        for (let attempt = 1; attempt <= 2; attempt++) {
          let reason = 'sconosciuto';
          try {
            const res = await collectResponse(model.stream({ messages, ...temp }));
            lastText = res.text;
            const parsed = repairJson(res.text);
            if (parsed.ok) {
              const v = validate(request.schema, parsed.json);
              if (v.ok) return { value: v.value, strategy: 'repair' };
              reason = v.error;
            } else {
              reason = parsed.error;
            }
          } catch (e) {
            tracer.record({ kind: 'error', message: `repair: ${(e as Error).message}` });
            break;
          }
          if (attempt < 2) {
            tracer.record({ kind: 'retry', attempt, reason });
            messages = [
              ...messages,
              { role: 'assistant', content: lastText },
              { role: 'user', content: `Output non valido (${reason}). Rispondi SOLO con JSON valido conforme allo schema.` },
            ];
          } else {
            tracer.record({ kind: 'validation-failure', strategy: 'repair', issues: reason });
          }
        }
      }

      throw new StructuredOutputError('Impossibile ottenere output strutturato valido dopo tutti i fallback', lastText);
    },
  };
}
