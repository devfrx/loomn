# Piano 7b — StructuredOutputPort + 3 livelli di fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere a `@loomn/ai` la porta **`StructuredOutputPort`** che, data una richiesta + uno schema **Zod**, ottiene un oggetto **validato** dall'LLM con i **3 livelli di fallback** della spec §7: (1) function-calling nativo → (2) constrained decoding / JSON-schema → (3) parse + repair + 1 retry.

**Architecture:** La porta è costruita **sopra** la porta `LanguageModel` di 7a (usa `collectResponse`), non sull'adapter né sulla rete: i test usano un **fake `LanguageModel`** che scripta le risposte per livello → nessun IO reale. La generazione dello schema JSON dagli schemi Zod usa `zod-to-json-schema`; il livello 3 estrae+ripara il JSON con `jsonrepair`. **La validazione Zod è il vero filtro** in ogni livello: ogni strategia produce un candidato che viene validato contro lo schema, e qualunque fallimento (errore del provider O validazione fallita) **cascata** al livello successivo.

**Tech Stack:** TypeScript strict (`tsconfig.base.json`), Vitest (config root), `zod@^3.23.8`, **`zod-to-json-schema@~3.23.5`** (pin obbligatorio — vedi sotto), **`jsonrepair@^3.8.0`**. Nessuna dipendenza da rete: costruito sulla porta `LanguageModel`.

---

## Dove sta il Piano 7b — e cosa esiste già (7a)

Il Piano 7 è splittato in **7a (fatto) / 7b (questo) / 7c**. Il **7a — Provider Layer** è mergiato in `main`: pacchetto `@loomn/ai` con la porta `LanguageModel` (async/streaming), l'adapter OpenAI-compatibile, `HttpTransport` iniettabile, `TracingPort`, e la suite `runLanguageModelContract`. Vedi `docs/superpowers/plans/2026-06-15-loomn-fase1-piano7a-provider-layer.md` e HANDOFF §3-ter.

**7b NON tocca l'adapter né il transport.** Aggiunge lo `StructuredOutputPort` sopra la porta `LanguageModel`. **7c** (dopo 7b) userà questa porta per la pipeline AI Master (tool-call → `Command` → engine → narra).

### Decisioni risolte (e perché)

1. **Costruito su `LanguageModel`, testato con fake.** `createStructuredOutput(model, options)` riceve una `LanguageModel` (la porta di 7a). I test iniettano un fake model che scripta le risposte → **nessuna rete, nessun adapter** nei test. (Coerente con la regola: porte iniettate + doppi.)
2. **3 livelli tentati in ordine; Zod è il gate.** Ogni livello produce un candidato → `schema.safeParse`. Successo → ritorna `{value, strategy}`. Fallimento (errore provider catturato O validazione fallita) → cascata al livello successivo. Opzione `strategies` per limitare/riordinare i livelli (es. saltare `function-call` su provider che non lo supportano).
3. **Livello 2 usa `response_format: json_schema` come lo manda 7a (`strict: true`). Non modifichiamo 7a.** Razionale: i provider capaci (OpenAI) riescono già al **livello 1** (function-call) e non arrivano al 2; il livello 2 serve ai **modelli locali** (LM Studio/llama.cpp) che vincolano l'output alla grammatica dello schema **a prescindere** dal flag `strict`; se un provider strict rifiutasse lo schema con campi opzionali → `LanguageModelError` → cascata al livello 3. Rendere `strict` configurabile sarebbe una raffinazione non testabile ora (nessun provider reale nei test) → YAGNI; sarà un ritocco di 1 riga se il test con provider reale (7c+) lo richiederà.
4. **`zod-to-json-schema(schema, { target: 'openApi3', $refStrategy: 'none' })`.** Verificato: produce uno schema **inline** (niente `$ref`/`definitions`) anche per oggetti/array annidati — quello che i provider vogliono per `tools[].function.parameters` e `response_format.json_schema.schema`.
5. **`jsonrepair` è LENIENT (scoperta empirica).** Coerce il testo nudo a una **stringa JSON** (`'solo prosa'` → `"solo prosa"`); ripara frammenti strutturali (`{` → `{}`); lancia `JSONRepairError` solo su input vuoto/whitespace. **Non estrae** il JSON dalla prosa: per questo `extractJsonCandidate` toglie i fence ```` ```json ``` ```` e fa lo slice dal primo `{` all'ultimo `}` **prima** del repair. Conseguenza di design: al livello 3 è **la validazione Zod** a respingere l'output non conforme (es. una stringa al posto di un oggetto), non il fallimento del repair.
6. **`strategy` nei `TraceEvent` è `string`, non il tipo union.** Così `tracing.ts` resta **foglia** (nessun import da `structured-output.ts` → niente ciclo).
7. **Helper di salvataggio JSON in un modulo dedicato** (`json-repair.ts`), testato in isolamento (è la parte più fragile). **Non** nel barrel (utility interna, come `language-model-contract.ts`).
8. **`StructuredOutputError`** (con `lastText`) lanciato quando tutti i livelli falliscono.

### Verifica empirica già svolta (sandbox, prima della stesura — HANDOFF §5.3)

Tutto il codice e i test di 7b sono stati **eseguiti verdi** in sandbox sotto la toolchain reale (Node v24.9.0, pnpm 9.12.0, `tsc` strict identico, Vitest 2.1.9): `tsc --noEmit` pulito + **15/15 test verdi** (8 `json-repair` + 7 `structured-output`). In particolare:

- **Pin `zod-to-json-schema`**: con `zod@3.23.8` va usato **`~3.23.5`** (peer `^3.23.3`). **NON** `^3.23.5`: la 3.24+ richiede `zod>=3.24.1` e la 3.25+ importa `zod/v3` → **crash a runtime** (`ERR_PACKAGE_PATH_NOT_EXPORTED`). Verificato installando ed eseguendo.
- **`{ target: 'openApi3', $refStrategy: 'none' }`** → schema inline (no `$ref`/`definitions`) su schema annidato (oggetto con array di oggetti + campo opzionale): `required` esclude gli opzionali, `additionalProperties: false`.
- **`jsonrepair` leniente**: provato `''`/`'   '` → throw; `'solo prosa'` → `"solo prosa"`; `'{'` → `'{}'`; `'output: {a:1,b:2} ok'` (con `extractJsonCandidate`) → `{a:1,b:2}`.
- **Cascata completa** provata con fake model: L1 ok; L1→L2 (function-call invalida → json-schema ok); L1+L2→L3 (repair di fence + virgola finale); L3 con **retry** che poi riesce; tutti falliti → `StructuredOutputError`; errore del provider al L1 → cascata senza interruzione; `strategies: ['repair']` salta L1/L2.

> La sandbox di verifica è esterna al repo (`C:\Users\zagor\loomn-p7b-sandbox`) e va rimossa a fine lavoro; non fa parte del repository.

---

## Disciplina di scope (vale per OGNI task — incollala nel prompt di ogni subagent)

> **Regole rigide (HANDOFF §5).** Modifica **SOLO** i file elencati nel task. **MAI** toccare `package.json`/`tsconfig*.json`/`vitest.config.ts` (di root o di qualunque pacchetto, **incluso `packages/ai/package.json`**: l'aggiunta delle dipendenze è un passo dell'orchestratore, vedi Setup). **MAI** creare un `tsconfig.json` di root né `composite`/project references. Crea i file con lo strumento Write (non `New-Item -Force`). Prima di committare esegui `git status --short` e verifica che siano cambiati solo i file previsti. Stringhe dei test in apici singoli **senza apostrofi** (`l'`, `un'`, `dell'`, `c'è`) — usa forme senza apostrofo (`è`/`é` vanno bene). Il typecheck di pacchetto è `tsc --noEmit`; il typecheck root è `pnpm -r typecheck` (**mai** `tsc -b`).

---

## Setup (passo dell'ORCHESTRATORE, prima del Task 1)

Le dipendenze nuove vanno aggiunte a `packages/ai/package.json` (file **esistente** → lo fa l'orchestratore, non un subagent). Dalla root:

```bash
pnpm -C packages/ai add zod-to-json-schema@~3.23.5 jsonrepair@^3.8.0
```

Risultato atteso in `packages/ai/package.json` (sezione `dependencies`):
```json
"dependencies": {
  "jsonrepair": "^3.8.0",
  "zod": "^3.23.8",
  "zod-to-json-schema": "~3.23.5"
}
```
Esegui poi `pnpm install` se necessario (il comando `add` già installa) e verifica **nessun warning di peer** (se compare un peer non soddisfatto su `zod-to-json-schema`, hai il pin sbagliato — deve essere `~3.23.5`). Questo aggiorna `pnpm-lock.yaml` (atteso). **Nessuna** modifica a `tsconfig*`/`vitest.config.ts`.

---

## File structure — modifiche a `packages/ai/`

| File | Stato | Responsabilità |
|---|---|---|
| `package.json` | MODIFY (orchestratore, Setup) | + `zod-to-json-schema@~3.23.5`, `jsonrepair@^3.8.0`. |
| `src/json-repair.ts` | CREATE (Task 1) | `parseJson`, `extractJsonCandidate`, `repairJson` (`JsonParse`). Utility di salvataggio JSON per il livello 3. **Non** nel barrel. |
| `src/tracing.ts` | MODIFY (Task 2) | Estende `TraceEvent` con `validation-failure` e `retry`. |
| `src/structured-output.ts` | CREATE (Task 2) | `StructuredOutputPort`, `createStructuredOutput`, `StructuredOutputRequest`/`Result`/`Options`/`Strategy`, `StructuredOutputError`. |
| `src/index.ts` | MODIFY (Task 2) | + `export * from './structured-output';` (NON json-repair: interno). |
| `src/json-repair.test.ts` | CREATE (Task 1) | 8 test. |
| `src/structured-output.test.ts` | CREATE (Task 2) | 7 test (fake `LanguageModel`). |

**Conteggi test attesi (cumulativi, baseline 144):** Task 1 → **152** (+8), Task 2 → **159** (+7). La modifica a `tracing.ts` non aggiunge test propri: le 2 nuove varianti sono esercitate dai test di `structured-output` (asserzioni sul `RecordingTracer`).

---

### Task 1: Utility di salvataggio JSON (`json-repair.ts`)

**Files:**
- Create: `packages/ai/src/json-repair.ts`
- Test: `packages/ai/src/json-repair.test.ts`

- [ ] **Step 1: Scrivi i test che falliscono**

`packages/ai/src/json-repair.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseJson, extractJsonCandidate, repairJson } from './json-repair';

describe('parseJson', () => {
  it('parsa JSON valido', () => {
    expect(parseJson('{"a":1}')).toEqual({ ok: true, json: { a: 1 } });
  });
  it('riporta errore su JSON non valido', () => {
    const r = parseJson('{a:1}');
    expect(r.ok).toBe(false);
  });
});

describe('extractJsonCandidate', () => {
  it('rimuove il fence markdown', () => {
    expect(extractJsonCandidate('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it('estrae lo span oggetto dalla prosa', () => {
    expect(extractJsonCandidate('Ecco: {"a":1} fine.')).toBe('{"a":1}');
  });
});

describe('repairJson', () => {
  it('ripara virgola finale dentro un fence', () => {
    expect(repairJson('```json\n{"a":1,}\n```')).toEqual({ ok: true, json: { a: 1 } });
  });
  it('ripara chiavi non quotate e prosa attorno', () => {
    expect(repairJson('output: {a:1, b:2} ok')).toEqual({ ok: true, json: { a: 1, b: 2 } });
  });
  it('e lenient: testo nudo viene coerciato a stringa JSON (la validazione Zod e il vero filtro)', () => {
    expect(repairJson('solo prosa')).toEqual({ ok: true, json: 'solo prosa' });
  });
  it('riporta errore se non resta nulla da riparare', () => {
    expect(repairJson('   ').ok).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui i test per vederli fallire**

Run: `pnpm test packages/ai/src/json-repair.test.ts`
Expected: FAIL — `Cannot find module './json-repair'`.

- [ ] **Step 3: Implementa `json-repair.ts`**

`packages/ai/src/json-repair.ts`:
```ts
// Utility di salvataggio JSON per il livello 3 dello StructuredOutputPort (spec 7).
import { jsonrepair } from 'jsonrepair';

export type JsonParse = { ok: true; json: unknown } | { ok: false; error: string };

export function parseJson(raw: string): JsonParse {
  try {
    return { ok: true, json: JSON.parse(raw) as unknown };
  } catch (e) {
    return { ok: false, error: `JSON non valido: ${(e as Error).message}` };
  }
}

// Strip fence ```json...``` poi slice dal primo { all ultimo } (toglie la prosa attorno).
// jsonrepair NON estrae il JSON dalla prosa, quindi l estrazione va fatta prima.
export function extractJsonCandidate(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const inner = fence?.[1];
  if (inner !== undefined) s = inner.trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last > first) s = s.slice(first, last + 1);
  return s;
}

export function repairJson(raw: string): JsonParse {
  let repaired: string;
  try {
    repaired = jsonrepair(extractJsonCandidate(raw));
  } catch (e) {
    return { ok: false, error: `repair fallita: ${(e as Error).message}` };
  }
  return parseJson(repaired);
}
```

- [ ] **Step 4: Esegui test + typecheck**

Run: `pnpm test`
Expected: PASS — **152** test (144 + 8).
Run: `pnpm -C packages/ai typecheck`
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/json-repair.ts packages/ai/src/json-repair.test.ts
git commit -m "feat(ai): utility di salvataggio JSON (extract + repair) per il fallback"
```

---

### Task 2: `StructuredOutputPort` + estensione `TraceEvent`

**Files:**
- Modify: `packages/ai/src/tracing.ts` (aggiungi le varianti `validation-failure` e `retry` a `TraceEvent`)
- Create: `packages/ai/src/structured-output.ts`
- Modify: `packages/ai/src/index.ts` (aggiungi `export * from './structured-output';`)
- Test: `packages/ai/src/structured-output.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce** (fake `LanguageModel` che scripta i livelli)

`packages/ai/src/structured-output.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createStructuredOutput, StructuredOutputError } from './structured-output';
import type { LanguageModel, LlmRequest, LlmStreamEvent } from './language-model';
import { createRecordingTracer } from './tracing';

const schema = z.object({ actorId: z.string(), dc: z.number().int() });

// Fake model: handler mappa (richiesta, indice di chiamata) -> eventi da streammare.
// Chiamate in ordine: 0 = function-call, 1 = json-schema, 2 = repair#1, 3 = repair#2.
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

function toolCall(args: string): LlmStreamEvent[] {
  return [{ type: 'tool-call', id: 'c1', name: 'make_check', arguments: args }, { type: 'finish', reason: 'tool_calls' }];
}
function textResp(text: string): LlmStreamEvent[] {
  return [{ type: 'text', delta: text }, { type: 'finish', reason: 'stop' }];
}

const messages = [{ role: 'user' as const, content: 'go' }];

describe('createStructuredOutput', () => {
  it('livello 1: function-call valida', async () => {
    const model = fakeModel((req) => {
      expect(req.tools?.[0]?.name).toBe('make_check');
      expect(req.toolChoice).toBe('required');
      return toolCall('{"actorId":"pc1","dc":12}');
    });
    const so = createStructuredOutput(model);
    const res = await so.generate({ messages, schema, schemaName: 'make_check' });
    expect(res.strategy).toBe('function-call');
    expect(res.value).toEqual({ actorId: 'pc1', dc: 12 });
  });

  it('cade a json-schema se la function-call e invalida', async () => {
    const tracer = createRecordingTracer();
    const model = fakeModel((req) => {
      if (req.tools !== undefined) return toolCall('{"actorId":"pc1"}'); // manca dc -> invalido
      if (req.responseFormat !== undefined) return textResp('{"actorId":"pc1","dc":7}');
      return textResp('no');
    });
    const so = createStructuredOutput(model, { tracer });
    const res = await so.generate({ messages, schema, schemaName: 'make_check' });
    expect(res.strategy).toBe('json-schema');
    expect(res.value).toEqual({ actorId: 'pc1', dc: 7 });
    expect(tracer.events.some((e) => e.kind === 'validation-failure' && e.strategy === 'function-call')).toBe(true);
  });

  it('cade a repair con JSON in fence + virgola finale', async () => {
    const model = fakeModel((req) => {
      if (req.tools !== undefined) return toolCall('non-json');
      if (req.responseFormat !== undefined) return textResp('anche-non-json');
      return textResp('Ecco la risposta:\n```json\n{"actorId":"pc1","dc":5,}\n```');
    });
    const so = createStructuredOutput(model);
    const res = await so.generate({ messages, schema, schemaName: 'make_check' });
    expect(res.strategy).toBe('repair');
    expect(res.value).toEqual({ actorId: 'pc1', dc: 5 });
  });

  it('repair fa un retry e poi riesce', async () => {
    const tracer = createRecordingTracer();
    const model = fakeModel((req, i) => {
      if (req.tools !== undefined) return toolCall('x');
      if (req.responseFormat !== undefined) return textResp('y');
      return i < 3 ? textResp('{"actorId":"pc1"}') : textResp('{"actorId":"pc1","dc":9}');
    });
    const so = createStructuredOutput(model, { tracer });
    const res = await so.generate({ messages, schema, schemaName: 'make_check' });
    expect(res.strategy).toBe('repair');
    expect(res.value).toEqual({ actorId: 'pc1', dc: 9 });
    expect(tracer.events.some((e) => e.kind === 'retry' && e.attempt === 1)).toBe(true);
  });

  it('strategies puo limitarsi a repair, senza tentare function-call', async () => {
    let toolsSeen = false;
    const model = fakeModel((req) => {
      if (req.tools !== undefined) toolsSeen = true;
      return textResp('{"actorId":"pc1","dc":3}');
    });
    const so = createStructuredOutput(model, { strategies: ['repair'] });
    const res = await so.generate({ messages, schema, schemaName: 'make_check' });
    expect(res.strategy).toBe('repair');
    expect(toolsSeen).toBe(false);
  });

  it('lancia StructuredOutputError se tutti i livelli falliscono', async () => {
    const model = fakeModel(() => textResp('mai un json valido'));
    const so = createStructuredOutput(model);
    await expect(so.generate({ messages, schema, schemaName: 'make_check' })).rejects.toBeInstanceOf(StructuredOutputError);
  });

  it('un errore di provider al livello 1 non interrompe il fallback', async () => {
    const model = fakeModel((req) => {
      if (req.tools !== undefined) throw new Error('tools non supportati');
      if (req.responseFormat !== undefined) return textResp('{"actorId":"pc1","dc":4}');
      return textResp('no');
    });
    const so = createStructuredOutput(model);
    const res = await so.generate({ messages, schema, schemaName: 'make_check' });
    expect(res.strategy).toBe('json-schema');
    expect(res.value).toEqual({ actorId: 'pc1', dc: 4 });
  });
});
```

- [ ] **Step 2: Esegui il test per vederlo fallire**

Run: `pnpm test packages/ai/src/structured-output.test.ts`
Expected: FAIL — `Cannot find module './structured-output'`.

- [ ] **Step 3: Estendi `TraceEvent` in `tracing.ts`**

Sostituisci il tipo `TraceEvent` esistente con (aggiunte le ultime 2 varianti prima di `error`):
```ts
// 7a + estensione 7b: 'validation-failure' e 'retry'. `strategy` resta string
// (NON il tipo union di structured-output) per tenere tracing.ts foglia (zero import).
export type TraceEvent =
  | { kind: 'request'; model: string; messageCount: number; hasTools: boolean }
  | { kind: 'response'; finishReason: string; textLength: number; toolCallCount: number }
  | { kind: 'validation-failure'; strategy: string; issues: string }
  | { kind: 'retry'; attempt: number; reason: string }
  | { kind: 'error'; message: string };
```
(Il resto di `tracing.ts` — `TracingPort`, `noopTracer`, `RecordingTracer`, `createRecordingTracer` — resta invariato.)

- [ ] **Step 4: Implementa `structured-output.ts`**

`packages/ai/src/structured-output.ts`:
```ts
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
```

- [ ] **Step 5: Aggiorna il barrel**

`packages/ai/src/index.ts` (aggiungi la riga, mantieni le altre):
```ts
export * from './language-model';
export * from './tracing';
export * from './transport';
export * from './openai-adapter';
export * from './structured-output';
```

- [ ] **Step 6: Esegui test + typecheck**

Run: `pnpm test`
Expected: PASS — **159** test (152 + 7). I test esistenti di `tracing.test.ts` restano verdi (le 2 nuove varianti sono additive).
Run: `pnpm -C packages/ai typecheck` e `pnpm typecheck`
Expected: nessun errore (engine/shared/memory/ai puliti).

- [ ] **Step 7: Commit**

```bash
git add packages/ai/src/tracing.ts packages/ai/src/structured-output.ts packages/ai/src/structured-output.test.ts packages/ai/src/index.ts
git commit -m "feat(ai): StructuredOutputPort con 3 livelli di fallback e TraceEvent estesi"
```

---

## Fuori ambito (esplicito)

- **AI Master pipeline, schemi Zod degli strumenti del Master, mappatura tool-call → `Command`, turno agentico, FSM di fase.** → **Piano 7c.**
- **Modifiche all'adapter OpenAI / al transport / a `LanguageModel`.** 7b ci costruisce sopra senza toccarli. In particolare NON si rende `strict` configurabile in 7a (vedi Decisione 3).
- **Adapter dedicati Anthropic/Gemini** e structured-output specifico per loro. → Fase 2.
- **Persistenza/aggregazione delle trace** (costi/latenza/token reali). Qui `TracingPort` resta in-memory; un tracer persistente arriva con la shell Electron.
- **Contract test condiviso per `StructuredOutputPort`.** C'è una sola implementazione (nessuna variante per-provider, a differenza di `LanguageModel`): i test la coprono direttamente. YAGNI.
- **Chiamate di rete reali nei test.** Mai: solo fake `LanguageModel`.

## Self-review (svolta sul piano vs spec)

- **Spec §7 «StructuredOutputPort con 3 livelli di fallback (function-call → grammar/JSON-schema → parse+repair)»** → Task 2 `createStructuredOutput`, 3 livelli con cascata. ✓
- **Spec §7 «critico per i modelli locali»** → il livello 2 (constrained decoding) e il livello 3 (repair+retry) sono pensati per i modelli deboli; `jsonrepair` + estrazione + validazione Zod come rete di sicurezza. ✓
- **Spec §4 «validazione Zod ai confini, output dell'LLM»** → ogni livello valida con `schema.safeParse`; Zod è il gate. ✓
- **Spec §7 «TracingPort: fallimenti di validazione, retry»** → Task 2 estende `TraceEvent` con `validation-failure`/`retry`, emessi a ogni cascata/ritentativo. ✓
- **Spec §3/§10 «porte iniettate + doppi, niente rete reale»** → costruito su `LanguageModel`; test con fake model. ✓
- **Placeholder scan:** nessun TODO/TBD; ogni step ha codice/comando completo. ✓
- **Type consistency:** `StructuredOutputStrategy`/`StructuredOutputRequest`/`Result`/`Options`/`Port`/`StructuredOutputError` e gli helper `parseJson`/`repairJson`/`extractJsonCandidate`/`JsonParse` usati coerentemente; `createStructuredOutput`, `validate` con firme identiche dove referenziate; `TraceEvent.strategy` è `string` (no ciclo). ✓
- **Bug-apostrofo:** tutte le stringhe `it()/describe()` in apici singoli sono senza apostrofi. Grep: `(it|describe)\('[^']*'[A-Za-zàèéìòù]` → atteso *no matches*. ✓
- **Disciplina di scope:** Task 1/2 toccano solo file sotto `packages/ai/src/`; `package.json` lo modifica l'orchestratore nel Setup; `pnpm-lock.yaml` è l'unico file di root cambiato (atteso). ✓
- **Conteggi test:** 152 → 159 (cumulativi). ✓ (verificati in sandbox: 15 nuovi test verdi.)

## Roadmap (Fase 1, aggiornata)

- **Piano 6 — Persistenza** ✅ fatto
- **Piano 7a — Provider Layer** ✅ fatto
- **Piano 7b — StructuredOutputPort + 3 livelli di fallback** ← *questo*
- **Piano 7c — AI Master pipeline + tool schemas** (da scrivere dopo 7b)
- **Piano 8 — Memoria L1.5 (canon ledger) + L2 (riassunti) + Context Assembler**
- **Piano 9 — Shell Electron** (main/preload/renderer, sicurezza, IPC tipizzato, Clock)
- **Piano 10 — UI Vue** (chat, scheda PG, dadi 3D, journal, provider) (grande, probabile split)
- **Piano 11 — Moduli a tema** (formato dati Zod + import/export + 1 modulo curato)

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-15-loomn-fase1-piano7b-structured-output.md`. Two execution options:**

**1. Subagent-Driven (consigliato)** — Setup orchestratore (deps), poi un subagent fresco per task (model sonnet), spec review + code-quality review per task (sonnet), final review dell'intero branch (opus), poi `finishing-a-development-branch` → merge locale in main. **Non far leggere il file di piano al subagent: incolla il testo completo del task + la disciplina di scope.** Branch dedicato `feat/fase1-piano7b-structured-output`.

**2. Inline Execution** — esecuzione dei task in questa sessione con `executing-plans`, checkpoint di review fra i batch.

**Quale approccio?**
