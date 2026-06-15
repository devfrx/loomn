# Piano 7a — Provider Layer (LanguageModel + OpenAI-compat + TracingPort) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creare il pacchetto `@loomn/ai` con la porta **`LanguageModel`** (async, streaming), un **adapter OpenAI-compatibile** (LM Studio + cloud) costruito su un **transport HTTP iniettabile**, la **`TracingPort`** trasversale dal giorno 1, e una **suite di conformità condivisa** per i provider.

**Architecture:** Esagonale (porte & adapter), come l'engine. Il dominio AI definisce porte; gli adapter vivono al confine IO. A differenza dell'`EventStore` (sincrono, better-sqlite3), la porta `LanguageModel` è **async + streaming** perché incapsula rete/SSE. L'adapter non chiama mai `fetch` direttamente: riceve un `HttpTransport` iniettato, così i test usano doppi e **non fanno chiamate di rete reali** (spec §3, §10). La frammentazione delle tool-call (gli `arguments` arrivano spezzati su più delta) è **nascosta nell'adapter**: la porta emette tool-call intere.

**Tech Stack:** TypeScript strict (`tsconfig.base.json`), Vitest (config root, include `packages/**/*.test.ts`), `zod@^3.23.8` (validazione difensiva del wire LLM), Node 24 globals (`TextDecoder`/`ReadableStream`/`fetch`) via `@types/node@^22`. pnpm workspaces.

---

## Piano 7 nel suo insieme — split in 7a / 7b / 7c

Il Piano 7 della spec (§5.4 pipeline AI Master, §7 Provider Layer + StructuredOutputPort + TracingPort) è grande. Come previsto nel HANDOFF §7, lo dividiamo in **tre sotto-piani**, ciascuno consegna software funzionante e testabile da solo, in sequenza:

- **Piano 7a — Provider Layer (QUESTO DOCUMENTO).** Porta `LanguageModel` (async/stream), `HttpTransport` iniettabile, adapter OpenAI-compatibile (SSE + accumulo tool-call), `TracingPort`, suite di conformità condivisa. Dipendenza nuova: `zod`.
- **Piano 7b — StructuredOutputPort + 3 livelli di fallback** *(da scrivere dopo il merge di 7a)*. Porta `StructuredOutputPort` che, data una richiesta + uno schema Zod, ottiene output strutturato validato, con i 3 livelli della spec §7: **(1) function-calling nativo → (2) constrained decoding / JSON-schema (`response_format: json_schema`) → (3) parse + repair + 1 retry**. Generazione JSON-Schema da Zod e riparazione del JSON malformato. Estende `TraceEvent` con `validation-failure`/`retry`. Costruito **sopra** `LanguageModel` di 7a (usa `collectResponse`).
- **Piano 7c — AI Master pipeline + tool schemas** *(da scrivere dopo il merge di 7b)*. Schemi Zod degli strumenti del Master (`request_check`, `apply_effect`, …) + il turno agentico: assembla contesto (stub; il Context Assembler vero è Piano 8) → prompt → `LanguageModel.stream` → tool-call → validazione Zod → **`Command`** dell'engine → `decide()` esegue (RNG seedato) → reinietta gli **Event reali** nello stesso turno → narra (spec §5.4, singolo turno agentico). Dipendenze nuove: `@loomn/engine`, `@loomn/shared`.

### Decisioni aperte risolte (HANDOFF §7) — e perché

1. **`LanguageModel` è async + streaming.** `stream(req): AsyncIterable<LlmStreamEvent>`. Motivazione: incapsula rete/SSE; l'`EventStore` resta sincrono perché better-sqlite3 lo è, ma qui la sincronia sarebbe una bugia.
2. **Confine dello streaming.** La porta emette eventi tipizzati: `{type:'text',delta}`, `{type:'tool-call',id,name,arguments}` (tool-call **intera**, già riassemblata), `{type:'finish',reason}`. L'accumulo dei frammenti `tool_calls[].function.arguments` su più delta avviene **dentro l'adapter**, non lo vede il chiamante. Un helper `collectResponse(stream)` aggrega lo stream in `{text, toolCalls, finishReason}` per i consumatori non-streaming (7b lo usa).
3. **Dove vivono gli schemi Zod degli strumenti → in `@loomn/ai` (Piano 7c), non in `shared`.** Gli strumenti sono il **contratto LLM↔engine** del bounded context AI/Conversation (spec §3); `@loomn/shared` resta la fonte unica degli schemi del **confine di persistenza** (DomainEvent/GameState). Tenere i tool-schema in `ai` evita di accoppiare `shared` all'evoluzione degli strumenti AI. (In 7a non servono ancora: l'adapter passa i `parameters` JSON-Schema già formati che riceve.)
4. **Validazione Zod al confine del wire LLM (spec §4/§7).** L'adapter valida ogni chunk SSE con uno schema Zod permissivo (`safeParse` + skip del rumore/heartbeat), così non si fida del JSON del provider.
5. **Transport iniettato.** L'adapter riceve `HttpTransport`; i test iniettano fake; in produzione `createFetchTransport()` avvolge `fetch` globale. **Nessuna rete reale nei test** (HANDOFF: «niente chiamate di rete reali nei test»).

### Verifica empirica già svolta (sandbox, prima della stesura — HANDOFF §5.3)

Tutto il codice e i test di 7a sono già stati **eseguiti verdi** in sandbox sotto la stessa toolchain (Node v24.9.0, pnpm 9.12.0, `tsc` strict identico a `tsconfig.base.json`, Vitest 2.1.9): `tsc --noEmit` pulito + **17/17 test verdi**. In particolare:

- **Parsing SSE robusto ai confini di chunk**: provato corretto con chunk da **1, 3, 7, 13, 64 byte e blocco intero**, inclusi split a metà di un carattere UTF-8 multibyte (`…`, `⚔️`) e fra i due `\n` del delimitatore. Il `TextDecoder({stream:true})` gestisce i caratteri spezzati; il buffer accumula fino al delimitatore `\n\n`.
- **Accumulo tool-call**: `arguments` spezzati su 3 delta riassemblati in `{"attribute":"str","dc":12}`; `id`/`name` catturati al primo frammento utile.
- **Seam del transport**: `ReadableStream` web **è** async-iterable in Node 24 (path `fetch().body`); un fake con body come async-generator itera in modo identico → test senza rete.
- **Pin dipendenze per 7b/7c (lezione pnpm/peer)**: con `zod@3.23.8`, `zod-to-json-schema` **deve** essere `~3.23.5` (peer `^3.23.3`). Le versioni 3.24+ richiedono `zod>=3.24.1`; la 3.25+ importa `zod/v3` e **crasha a runtime** con la nostra zod (`ERR_PACKAGE_PATH_NOT_EXPORTED`). Verificato installando ed eseguendo. (Riguarda 7b, non 7a.)
- **Repair JSON per il livello 3 (7b)**: `jsonrepair@^3.8.0` corregge fence markdown, virgole finali, apici singoli, chiavi non quotate; **non** estrae il JSON da prosa circostante → serve un passo «slice dal primo `{` all'ultimo `}`» prima del repair (provato). (Riguarda 7b.)

> La sandbox di verifica è esterna al repo (`C:\Users\zagor\loomn-p7-sandbox`) e va rimossa a fine lavoro; **non** fa parte del repository.

---

## Disciplina di scope (vale per OGNI task — incollala nel prompt di ogni subagent)

> **Regole rigide (HANDOFF §5).** Modifica **SOLO** i file elencati nel task. **MAI** toccare `package.json`/`tsconfig*.json`/`vitest.config.ts` **esistenti** (di root o di altri pacchetti). **MAI** creare un `tsconfig.json` di root né aggiungere `composite`/project references. Creare i file **nuovi** di `packages/ai/` (incluso il suo `package.json`/`tsconfig.json`) è **in ambito**. Crea i file con lo strumento Write (non `New-Item -Force`, che tronca). Prima di committare esegui `git status --short` e verifica che siano cambiati solo i file previsti. Stringhe dei test in apici singoli **senza apostrofi** (`l'`, `un'`, `dell'`, `c'è`) — spezzano la stringa JS; usa forme senza apostrofo (`è`/`é` vanno bene). Engine puro: nessun `Math.random`/`Date.now`. Il typecheck di pacchetto è `tsc --noEmit`; il typecheck root è `pnpm -r typecheck` (**mai** `tsc -b`).

> **Nota install (passo dell'orchestratore, non del subagent):** dopo che il Task 1 ha creato `packages/ai/package.json`, esegui `pnpm install` dalla root per registrare il workspace e linkare `zod` (già nel monorepo: nessun download). Questo aggiorna `pnpm-lock.yaml` (atteso). **Nessuna** modifica a `vitest.config.ts` (globba già `packages/**/*.test.ts`) né al typecheck root (`pnpm -r typecheck` esegue lo script `typecheck` del nuovo pacchetto).

---

## File structure — `packages/ai/`

| File | Responsabilità |
|---|---|
| `package.json` | `@loomn/ai`, `type: module`, `main/types: src/index.ts`, script `typecheck: tsc --noEmit`. Dep: `zod@^3.23.8`. devDep: `@types/node@^22.10.5`. |
| `tsconfig.json` | Estende `../../tsconfig.base.json`; `rootDir: src`, `noEmit`, `include: ["src"]`. Identico agli altri pacchetti. |
| `src/index.ts` | Barrel: ri-esporta `language-model`, `transport`, `tracing`, `openai-adapter`. (Il contract NON è nel barrel: è un'utility di test.) |
| `src/language-model.ts` | Porta `LanguageModel` + tipi (`LlmMessage`, `LlmToolDef`, `LlmRequest`, `LlmStreamEvent`, `LlmFinishReason`, `LlmResponse`, `LlmToolCall`) + `collectResponse`. Zero IO. |
| `src/tracing.ts` | `TracingPort`, `TraceEvent` (union), `noopTracer`, `createRecordingTracer`. Niente tempo/IO nei TraceEvent (purezza dei chiamanti). |
| `src/transport.ts` | `HttpRequest`/`HttpResponse`/`HttpTransport` + `createFetchTransport(fetchImpl=fetch)`. |
| `src/openai-adapter.ts` | `createOpenAiCompatibleModel(config)` + `LanguageModelError`. Internamente: `buildBody`, `parseSse`, `streamChatCompletion` (accumulo + schema Zod del chunk). |
| `src/language-model-contract.ts` | `runLanguageModelContract(label, makeModel)`: suite di conformità condivisa (spec §9), riusabile dai futuri adapter (Anthropic/Gemini, Fase 2). |
| `src/*.test.ts` | `collect-response.test.ts`, `tracing.test.ts`, `transport.test.ts`, `openai-adapter.test.ts`, `language-model-contract.test.ts`. |

**Conteggi test attesi (cumulativi, baseline 125):** Task 1 → **130** (+5), Task 2 → **133** (+3), Task 3 → **138** (+5), Task 4 → **142** (+4).

---

### Task 1: Scaffold `@loomn/ai` + porta `LanguageModel` + `TracingPort`

**Files:**
- Create: `packages/ai/package.json`
- Create: `packages/ai/tsconfig.json`
- Create: `packages/ai/src/index.ts`
- Create: `packages/ai/src/language-model.ts`
- Create: `packages/ai/src/tracing.ts`
- Test: `packages/ai/src/collect-response.test.ts`
- Test: `packages/ai/src/tracing.test.ts`

- [ ] **Step 1: Crea lo scaffold del pacchetto**

`packages/ai/package.json`:
```json
{
  "name": "@loomn/ai",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.10.5"
  }
}
```

`packages/ai/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "noEmit": true
  },
  "include": ["src"]
}
```

`packages/ai/src/index.ts` (il barrel cresce con i task; per ora porta + tracing):
```ts
export * from './language-model';
export * from './tracing';
```

- [ ] **Step 2: Scrivi i test che falliscono** (`collectResponse` + recording tracer)

`packages/ai/src/collect-response.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { collectResponse, type LlmStreamEvent } from './language-model';

async function* events(...es: LlmStreamEvent[]): AsyncGenerator<LlmStreamEvent> {
  for (const e of es) yield e;
}

describe('collectResponse', () => {
  it('concatena i delta di testo', async () => {
    const res = await collectResponse(
      events({ type: 'text', delta: 'Il ' }, { type: 'text', delta: 'goblin' }, { type: 'finish', reason: 'stop' }),
    );
    expect(res.text).toBe('Il goblin');
    expect(res.toolCalls).toEqual([]);
    expect(res.finishReason).toBe('stop');
  });

  it('raccoglie le tool-call intere', async () => {
    const res = await collectResponse(
      events(
        { type: 'tool-call', id: 'c1', name: 'request_check', arguments: '{"dc":12}' },
        { type: 'finish', reason: 'tool_calls' },
      ),
    );
    expect(res.toolCalls).toEqual([{ id: 'c1', name: 'request_check', arguments: '{"dc":12}' }]);
    expect(res.finishReason).toBe('tool_calls');
  });

  it('finishReason vale unknown se nessun evento finish arriva', async () => {
    const res = await collectResponse(events({ type: 'text', delta: 'x' }));
    expect(res.finishReason).toBe('unknown');
  });
});
```

`packages/ai/src/tracing.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createRecordingTracer, noopTracer } from './tracing';

describe('tracing', () => {
  it('il recording tracer accumula gli eventi in ordine', () => {
    const t = createRecordingTracer();
    t.record({ kind: 'request', model: 'm', messageCount: 2, hasTools: false });
    t.record({ kind: 'error', message: 'boom' });
    expect(t.events.map((e) => e.kind)).toEqual(['request', 'error']);
  });

  it('il noop tracer non lancia e non registra nulla', () => {
    expect(() => noopTracer.record({ kind: 'error', message: 'x' })).not.toThrow();
  });
});
```

- [ ] **Step 3: Esegui i test per vederli fallire**

Run: `pnpm test`
Expected: FAIL — `Cannot find module './language-model'` / `'./tracing'`.

- [ ] **Step 4: Implementa `language-model.ts`**

`packages/ai/src/language-model.ts`:
```ts
// Porta LanguageModel (async, streaming). Tipi agnostici dal provider.

export type LlmRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LlmMessage {
  role: LlmRole;
  content: string;
  /** presente solo sui messaggi role:'tool' (il risultato di una tool-call) */
  toolCallId?: string;
  /** presente solo sui messaggi role:'tool' */
  name?: string;
}

/** Strumento esposto al modello. `parameters` e un oggetto JSON Schema (in 7b lo
 *  genera lo StructuredOutputPort da uno schema Zod). */
export interface LlmToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type LlmResponseFormat =
  | { type: 'text' }
  | { type: 'json_schema'; name: string; schema: Record<string, unknown> };

export interface LlmRequest {
  messages: LlmMessage[];
  tools?: LlmToolDef[];
  toolChoice?: 'auto' | 'required' | 'none';
  responseFormat?: LlmResponseFormat;
  temperature?: number;
}

export type LlmFinishReason = 'stop' | 'tool_calls' | 'length' | 'content_filter' | 'unknown';

export type LlmStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool-call'; id: string; name: string; arguments: string }
  | { type: 'finish'; reason: LlmFinishReason };

/** La porta async/streaming. Gli adapter (OpenAI-compat, Anthropic, …) la implementano. */
export interface LanguageModel {
  readonly id: string;
  stream(request: LlmRequest): AsyncIterable<LlmStreamEvent>;
}

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface LlmResponse {
  text: string;
  toolCalls: LlmToolCall[];
  finishReason: LlmFinishReason;
}

/** Aggrega uno stream nella risposta completa (comodita non-streaming). */
export async function collectResponse(stream: AsyncIterable<LlmStreamEvent>): Promise<LlmResponse> {
  let text = '';
  const toolCalls: LlmToolCall[] = [];
  let finishReason: LlmFinishReason = 'unknown';
  for await (const e of stream) {
    if (e.type === 'text') text += e.delta;
    else if (e.type === 'tool-call') toolCalls.push({ id: e.id, name: e.name, arguments: e.arguments });
    else finishReason = e.reason;
  }
  return { text, toolCalls, finishReason };
}
```

- [ ] **Step 5: Implementa `tracing.ts`**

`packages/ai/src/tracing.ts`:
```ts
// TracingPort, trasversale dal giorno 1 (spec §7). Tempo/IO vivono nell'implementazione
// del tracer, NON nei TraceEvent che i chiamanti costruiscono (mantiene puri i chiamanti).
// In 7b la union verra estesa con 'validation-failure' e 'retry'.

export type TraceEvent =
  | { kind: 'request'; model: string; messageCount: number; hasTools: boolean }
  | { kind: 'response'; finishReason: string; textLength: number; toolCallCount: number }
  | { kind: 'error'; message: string };

export interface TracingPort {
  record(event: TraceEvent): void;
}

/** Tracer no-op di default (cosi il wiring e sempre presente, spec §7). */
export const noopTracer: TracingPort = { record() {} };

/** Tracer in-memory per test/asserzioni. */
export interface RecordingTracer extends TracingPort {
  readonly events: readonly TraceEvent[];
}

export function createRecordingTracer(): RecordingTracer {
  const events: TraceEvent[] = [];
  return {
    events,
    record(event) {
      events.push(event);
    },
  };
}
```

- [ ] **Step 6: Registra il workspace e linka le dipendenze** *(passo orchestratore)*

Run (dalla root): `pnpm install`
Expected: `@loomn/ai` registrato; `zod` linkato (già nel monorepo, nessun download); `pnpm-lock.yaml` aggiornato. Nessun'altra modifica.

- [ ] **Step 7: Esegui test + typecheck**

Run: `pnpm test`
Expected: PASS — **130** test (125 + 5).
Run: `pnpm -C packages/ai typecheck`
Expected: nessun errore.

- [ ] **Step 8: Commit**

```bash
git add packages/ai pnpm-lock.yaml
git commit -m "feat(ai): scaffold @loomn/ai con porta LanguageModel e TracingPort"
```

---

### Task 2: Transport HTTP iniettabile (`createFetchTransport`)

**Files:**
- Create: `packages/ai/src/transport.ts`
- Modify: `packages/ai/src/index.ts` (aggiungi `export * from './transport';`)
- Test: `packages/ai/src/transport.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

`packages/ai/src/transport.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createFetchTransport } from './transport';

function streamResponse(body: string, init: { status?: number; statusText?: string } = {}): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, { status: init.status ?? 200, statusText: init.statusText ?? 'OK' });
}

describe('createFetchTransport', () => {
  it('mappa la Response e itera il body a chunk', async () => {
    const fakeFetch = (async () => streamResponse('data: hello\n\n')) as unknown as typeof fetch;
    const transport = createFetchTransport(fakeFetch);
    const res = await transport({ url: 'http://x/v1/chat/completions', headers: {}, body: '{}' });
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    let text = '';
    const dec = new TextDecoder();
    for await (const chunk of res.body()) text += dec.decode(chunk, { stream: true });
    expect(text).toBe('data: hello\n\n');
  });

  it('espone status e text su risposta non ok', async () => {
    const fakeFetch = (async () => new Response('nope', { status: 401, statusText: 'Unauthorized' })) as unknown as typeof fetch;
    const transport = createFetchTransport(fakeFetch);
    const res = await transport({ url: 'http://x', headers: {}, body: '{}' });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('nope');
  });

  it('body vuoto quando la Response non ha corpo', async () => {
    const fakeFetch = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    const transport = createFetchTransport(fakeFetch);
    const res = await transport({ url: 'http://x', headers: {}, body: '{}' });
    const chunks: Uint8Array[] = [];
    for await (const c of res.body()) chunks.push(c);
    expect(chunks).toEqual([]);
  });
});
```

- [ ] **Step 2: Esegui il test per vederlo fallire**

Run: `pnpm test packages/ai/src/transport.test.ts`
Expected: FAIL — `Cannot find module './transport'`.

- [ ] **Step 3: Implementa `transport.ts`**

`packages/ai/src/transport.ts`:
```ts
// Transport HTTP iniettabile. L'adapter non chiama mai fetch direttamente: riceve un
// transport, cosi i test iniettano un fake (nessuna rete reale).

export interface HttpRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText: string;
  /** Corpo SSE come async-iterable di chunk di byte. */
  body(): AsyncIterable<Uint8Array>;
  /** Corpo completo come testo (usato per le risposte di errore). */
  text(): Promise<string>;
}

export type HttpTransport = (request: HttpRequest) => Promise<HttpResponse>;

/** Transport di produzione: avvolge fetch globale. L'adapter resta disaccoppiato da esso. */
export function createFetchTransport(fetchImpl: typeof fetch = fetch): HttpTransport {
  return async (request) => {
    const res = await fetchImpl(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
    });
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      body(): AsyncIterable<Uint8Array> {
        const stream = res.body;
        if (stream === null) {
          return (async function* (): AsyncGenerator<Uint8Array> {})();
        }
        // Il ReadableStream di Node e async-iterable a runtime (verificato empiricamente);
        // il tipo della lib non dichiara Symbol.asyncIterator, da cui il cast-ponte.
        return stream as unknown as AsyncIterable<Uint8Array>;
      },
      async text() {
        return res.text();
      },
    };
  };
}
```

- [ ] **Step 4: Aggiorna il barrel**

`packages/ai/src/index.ts`:
```ts
export * from './language-model';
export * from './tracing';
export * from './transport';
```

- [ ] **Step 5: Esegui test + typecheck**

Run: `pnpm test`
Expected: PASS — **133** test (130 + 3).
Run: `pnpm -C packages/ai typecheck`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add packages/ai/src/transport.ts packages/ai/src/transport.test.ts packages/ai/src/index.ts
git commit -m "feat(ai): transport HTTP iniettabile con createFetchTransport"
```

---

### Task 3: Adapter OpenAI-compatibile (SSE + accumulo tool-call + tracing)

**Files:**
- Create: `packages/ai/src/openai-adapter.ts`
- Modify: `packages/ai/src/index.ts` (aggiungi `export * from './openai-adapter';`)
- Test: `packages/ai/src/openai-adapter.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce** (round-trip streaming, body, omissione opzionali, errore, tracing)

`packages/ai/src/openai-adapter.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createOpenAiCompatibleModel, LanguageModelError } from './openai-adapter';
import { collectResponse, type LlmRequest } from './language-model';
import { createRecordingTracer } from './tracing';
import type { HttpTransport, HttpResponse } from './transport';

// Fake transport: cattura la richiesta, rigioca SSE predefinito (a chunk piccoli).
function fakeTransport(
  sse: string,
  opts: { ok?: boolean; status?: number; errorText?: string } = {},
): { transport: HttpTransport; lastBody: () => unknown } {
  let captured: unknown;
  const transport: HttpTransport = async (req) => {
    captured = JSON.parse(req.body) as unknown;
    const res: HttpResponse = {
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      statusText: 'OK',
      async *body() {
        const bytes = new TextEncoder().encode(sse);
        for (let i = 0; i < bytes.length; i += 5) yield bytes.slice(i, i + 5);
      },
      async text() {
        return opts.errorText ?? sse;
      },
    };
    return res;
  };
  return { transport, lastBody: () => captured };
}

const SSE = [
  'data: {"choices":[{"delta":{"content":"Il goblin "}}]}\n\n',
  'data: {"choices":[{"delta":{"content":"attacca."}}]}\n\n',
  'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"request_check","arguments":"{\\"dc\\":"}}]}}]}\n\n',
  'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"12}"}}]}}]}\n\n',
  'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
  'data: [DONE]\n\n',
].join('');

describe('adapter OpenAI-compatibile', () => {
  it('trasmette i delta di testo e accumula una tool-call frammentata', async () => {
    const { transport } = fakeTransport(SSE);
    const model = createOpenAiCompatibleModel({ baseUrl: 'http://x/v1', model: 'm', transport });
    const res = await collectResponse(model.stream({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.text).toBe('Il goblin attacca.');
    expect(res.finishReason).toBe('tool_calls');
    expect(res.toolCalls).toEqual([{ id: 'call_1', name: 'request_check', arguments: '{"dc":12}' }]);
  });

  it('costruisce un body OpenAI-compatibile con tools, tool_choice e json_schema', async () => {
    const { transport, lastBody } = fakeTransport('data: [DONE]\n\n');
    const model = createOpenAiCompatibleModel({ baseUrl: 'http://x/v1', model: 'gpt', transport, apiKey: 'k' });
    const req: LlmRequest = {
      messages: [{ role: 'system', content: 'be a master' }],
      tools: [{ name: 'request_check', description: 'roll a check', parameters: { type: 'object' } }],
      toolChoice: 'auto',
      responseFormat: { type: 'json_schema', name: 'check', schema: { type: 'object' } },
      temperature: 0.7,
    };
    await collectResponse(model.stream(req));
    const body = lastBody() as Record<string, unknown>;
    expect(body['model']).toBe('gpt');
    expect(body['stream']).toBe(true);
    expect(body['tool_choice']).toBe('auto');
    expect(body['temperature']).toBe(0.7);
    expect(Array.isArray(body['tools'])).toBe(true);
    expect(body['response_format']).toEqual({
      type: 'json_schema',
      json_schema: { name: 'check', schema: { type: 'object' }, strict: true },
    });
  });

  it('omette i campi opzionali assenti dal body', async () => {
    const { transport, lastBody } = fakeTransport('data: [DONE]\n\n');
    const model = createOpenAiCompatibleModel({ baseUrl: 'http://x/v1', model: 'm', transport });
    await collectResponse(model.stream({ messages: [{ role: 'user', content: 'hi' }] }));
    const body = lastBody() as Record<string, unknown>;
    expect('tools' in body).toBe(false);
    expect('tool_choice' in body).toBe(false);
    expect('temperature' in body).toBe(false);
    expect('response_format' in body).toBe(false);
  });

  it('lancia LanguageModelError su risposta non ok', async () => {
    const { transport } = fakeTransport('boom', { ok: false, status: 401, errorText: 'unauthorized' });
    const model = createOpenAiCompatibleModel({ baseUrl: 'http://x/v1', model: 'm', transport });
    await expect(collectResponse(model.stream({ messages: [] }))).rejects.toBeInstanceOf(LanguageModelError);
  });

  it('registra le trace di richiesta e risposta', async () => {
    const tracer = createRecordingTracer();
    const { transport } = fakeTransport(SSE);
    const model = createOpenAiCompatibleModel({ baseUrl: 'http://x/v1', model: 'm', transport, tracer });
    await collectResponse(model.stream({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(tracer.events.map((e) => e.kind)).toEqual(['request', 'response']);
    const response = tracer.events.find((e) => e.kind === 'response');
    expect(response).toMatchObject({ finishReason: 'tool_calls', toolCallCount: 1 });
  });
});
```

- [ ] **Step 2: Esegui il test per vederlo fallire**

Run: `pnpm test packages/ai/src/openai-adapter.test.ts`
Expected: FAIL — `Cannot find module './openai-adapter'`.

- [ ] **Step 3: Implementa `openai-adapter.ts`**

`packages/ai/src/openai-adapter.ts`:
```ts
// Adapter OpenAI-compatibile (LM Studio, OpenAI, OpenRouter, Groq, …). Costruisce la
// richiesta chat-completions, fa streaming SSE, accumula i delta delle tool-call.
import { z } from 'zod';
import type {
  LanguageModel,
  LlmRequest,
  LlmStreamEvent,
  LlmFinishReason,
  LlmMessage,
  LlmToolDef,
} from './language-model';
import type { HttpTransport } from './transport';
import { noopTracer, type TracingPort } from './tracing';

export class LanguageModelError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly body: string,
  ) {
    super(`LanguageModel HTTP ${status} ${statusText}: ${body}`);
    this.name = 'LanguageModelError';
  }
}

export interface OpenAiCompatibleConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  transport: HttpTransport;
  tracer?: TracingPort;
}

// --- costruzione della richiesta (spread condizionali per exactOptionalPropertyTypes) ---

function toWireMessage(m: LlmMessage): Record<string, unknown> {
  return {
    role: m.role,
    content: m.content,
    ...(m.toolCallId !== undefined ? { tool_call_id: m.toolCallId } : {}),
    ...(m.name !== undefined ? { name: m.name } : {}),
  };
}

function toWireTool(t: LlmToolDef): Record<string, unknown> {
  return { type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } };
}

function buildBody(model: string, req: LlmRequest): Record<string, unknown> {
  const responseFormat =
    req.responseFormat === undefined
      ? {}
      : req.responseFormat.type === 'json_schema'
        ? {
            response_format: {
              type: 'json_schema',
              json_schema: { name: req.responseFormat.name, schema: req.responseFormat.schema, strict: true },
            },
          }
        : { response_format: { type: 'text' } };
  return {
    model,
    messages: req.messages.map(toWireMessage),
    stream: true,
    ...(req.tools !== undefined ? { tools: req.tools.map(toWireTool) } : {}),
    ...(req.toolChoice !== undefined ? { tool_choice: req.toolChoice } : {}),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...responseFormat,
  };
}

// --- parsing SSE (verificato robusto agli split di chunk di byte) ---

async function* parseSse(byteChunks: AsyncIterable<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  for await (const chunk of byteChunks) {
    buffer += decoder.decode(chunk, { stream: true });
    let idx = buffer.indexOf('\n\n');
    while (idx !== -1) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const data = sseDataPayload(rawEvent);
      if (data !== undefined) yield data;
      idx = buffer.indexOf('\n\n');
    }
  }
  buffer += decoder.decode();
  const tail = sseDataPayload(buffer);
  if (tail !== undefined) yield tail;
}

function sseDataPayload(rawEvent: string): string | undefined {
  const dataLines: string[] = [];
  for (const line of rawEvent.split('\n')) {
    if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
  }
  return dataLines.length > 0 ? dataLines.join('\n') : undefined;
}

// --- schema del chunk (Zod al confine del wire LLM, spec §4/§7); permissivo sugli extra ---

const chunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z
          .object({
            content: z.string().nullish(),
            tool_calls: z
              .array(
                z.object({
                  index: z.number().optional(),
                  id: z.string().optional(),
                  function: z.object({ name: z.string().optional(), arguments: z.string().optional() }).optional(),
                }),
              )
              .optional(),
          })
          .optional(),
        finish_reason: z.string().nullish(),
      }),
    )
    .optional(),
});

function mapFinishReason(raw: string | null | undefined): LlmFinishReason {
  switch (raw) {
    case 'stop':
      return 'stop';
    case 'tool_calls':
      return 'tool_calls';
    case 'length':
      return 'length';
    case 'content_filter':
      return 'content_filter';
    default:
      return 'unknown';
  }
}

interface ToolAcc {
  id: string;
  name: string;
  args: string;
}

async function* streamChatCompletion(byteChunks: AsyncIterable<Uint8Array>): AsyncGenerator<LlmStreamEvent> {
  const toolAcc = new Map<number, ToolAcc>();
  let finishReason: LlmFinishReason = 'unknown';
  for await (const payload of parseSse(byteChunks)) {
    if (payload === '[DONE]') break;
    const parsed = chunkSchema.safeParse(JSON.parse(payload) as unknown);
    if (!parsed.success) continue; // skip difensivo di rumore/heartbeat del provider
    const choice = parsed.data.choices?.[0];
    if (choice === undefined) continue;
    const delta = choice.delta;
    if (delta !== undefined) {
      if (typeof delta.content === 'string' && delta.content.length > 0) {
        yield { type: 'text', delta: delta.content };
      }
      if (delta.tool_calls !== undefined) {
        for (const tc of delta.tool_calls) {
          const i = tc.index ?? 0;
          const cur = toolAcc.get(i) ?? { id: '', name: '', args: '' };
          if (tc.id !== undefined) cur.id = tc.id;
          if (tc.function?.name !== undefined) cur.name = tc.function.name;
          if (tc.function?.arguments !== undefined) cur.args += tc.function.arguments;
          toolAcc.set(i, cur);
        }
      }
    }
    if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
      finishReason = mapFinishReason(choice.finish_reason);
    }
  }
  for (const i of [...toolAcc.keys()].sort((a, b) => a - b)) {
    const tc = toolAcc.get(i);
    if (tc !== undefined) yield { type: 'tool-call', id: tc.id, name: tc.name, arguments: tc.args };
  }
  yield { type: 'finish', reason: finishReason };
}

export function createOpenAiCompatibleModel(config: OpenAiCompatibleConfig): LanguageModel {
  const tracer = config.tracer ?? noopTracer;
  return {
    id: config.model,
    async *stream(request: LlmRequest): AsyncGenerator<LlmStreamEvent> {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (config.apiKey !== undefined) headers['authorization'] = `Bearer ${config.apiKey}`;
      tracer.record({
        kind: 'request',
        model: config.model,
        messageCount: request.messages.length,
        hasTools: request.tools !== undefined && request.tools.length > 0,
      });
      const res = await config.transport({
        url: `${config.baseUrl}/chat/completions`,
        headers,
        body: JSON.stringify(buildBody(config.model, request)),
      });
      if (!res.ok) {
        const errText = await res.text();
        tracer.record({ kind: 'error', message: `HTTP ${res.status}` });
        throw new LanguageModelError(res.status, res.statusText, errText);
      }
      let textLength = 0;
      let toolCallCount = 0;
      let finishReason = 'unknown';
      for await (const event of streamChatCompletion(res.body())) {
        if (event.type === 'text') textLength += event.delta.length;
        else if (event.type === 'tool-call') toolCallCount += 1;
        else finishReason = event.reason;
        yield event;
      }
      tracer.record({ kind: 'response', finishReason, textLength, toolCallCount });
    },
  };
}
```

- [ ] **Step 4: Aggiorna il barrel**

`packages/ai/src/index.ts`:
```ts
export * from './language-model';
export * from './tracing';
export * from './transport';
export * from './openai-adapter';
```

- [ ] **Step 5: Esegui test + typecheck**

Run: `pnpm test`
Expected: PASS — **138** test (133 + 5).
Run: `pnpm -C packages/ai typecheck`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add packages/ai/src/openai-adapter.ts packages/ai/src/openai-adapter.test.ts packages/ai/src/index.ts
git commit -m "feat(ai): adapter OpenAI-compatibile con streaming SSE e accumulo tool-call"
```

---

### Task 4: Suite di conformità condivisa `LanguageModel` (spec §9)

**Files:**
- Create: `packages/ai/src/language-model-contract.ts`
- Test: `packages/ai/src/language-model-contract.test.ts`

> Mirror del pattern di `packages/memory/src/event-store-contract.ts` (`runEventStoreContract`): una suite unica che ogni adapter `LanguageModel` deve passare identica. Oggi gira sull'adapter OpenAI-compatibile; in Fase 2 la riuseranno gli adapter Anthropic/Gemini. **Non** va nel barrel (è utility di test).

- [ ] **Step 1: Scrivi la suite di conformità**

`packages/ai/src/language-model-contract.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { collectResponse, type LanguageModel } from './language-model';

// Suite di conformita condivisa: ogni adapter LanguageModel deve passarla identica
// (spec §9). makeModel ritorna un modello il cui transport sottostante rigioca uno
// stream canonico: testo "pronto", poi una tool-call request_check({"dc":10})
// frammentata, poi finish_reason tool_calls.
export function runLanguageModelContract(label: string, makeModel: () => LanguageModel): void {
  describe(`LanguageModel contract: ${label}`, () => {
    it('espone un id stringa', () => {
      expect(typeof makeModel().id).toBe('string');
    });

    it('trasmette i delta di testo', async () => {
      const res = await collectResponse(makeModel().stream({ messages: [{ role: 'user', content: 'hi' }] }));
      expect(res.text).toBe('pronto');
    });

    it('accumula una tool-call frammentata in un evento intero', async () => {
      const res = await collectResponse(makeModel().stream({ messages: [{ role: 'user', content: 'hi' }] }));
      expect(res.toolCalls).toEqual([{ id: 'call_x', name: 'request_check', arguments: '{"dc":10}' }]);
    });

    it('riporta il finish reason', async () => {
      const res = await collectResponse(makeModel().stream({ messages: [{ role: 'user', content: 'hi' }] }));
      expect(res.finishReason).toBe('tool_calls');
    });
  });
}
```

- [ ] **Step 2: Scrivi il test che esegue la suite sull'adapter OpenAI**

`packages/ai/src/language-model-contract.test.ts`:
```ts
import { runLanguageModelContract } from './language-model-contract';
import { createOpenAiCompatibleModel } from './openai-adapter';
import type { HttpTransport } from './transport';

const CANON_SSE = [
  'data: {"choices":[{"delta":{"content":"pronto"}}]}\n\n',
  'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_x","function":{"name":"request_check","arguments":"{\\"dc\\":"}}]}}]}\n\n',
  'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"10}"}}]}}]}\n\n',
  'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
  'data: [DONE]\n\n',
].join('');

function cannedTransport(sse: string): HttpTransport {
  return async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    async *body() {
      yield new TextEncoder().encode(sse);
    },
    async text() {
      return sse;
    },
  });
}

runLanguageModelContract('openai-compatible', () =>
  createOpenAiCompatibleModel({ baseUrl: 'http://x/v1', model: 'test', transport: cannedTransport(CANON_SSE) }),
);
```

- [ ] **Step 3: Esegui test + typecheck**

Run: `pnpm test`
Expected: PASS — **142** test (138 + 4). Vedrai il gruppo `LanguageModel contract: openai-compatible`.
Run: `pnpm -C packages/ai typecheck` e `pnpm typecheck`
Expected: nessun errore (root: engine/shared/memory/ai puliti).

- [ ] **Step 4: Commit**

```bash
git add packages/ai/src/language-model-contract.ts packages/ai/src/language-model-contract.test.ts
git commit -m "test(ai): suite di conformita condivisa LanguageModel"
```

---

## Fuori ambito (esplicito)

- **`StructuredOutputPort` e i 3 livelli di fallback** (function-call → JSON-schema/grammar → parse+repair+retry), generazione JSON-Schema da Zod, `jsonrepair`. → **Piano 7b.**
- **Schemi Zod degli strumenti** (`request_check`, `apply_effect`, …), pipeline AI Master, mappatura tool-call → `Command`, turno agentico con reiniezione degli Event, FSM di fase. → **Piano 7c.**
- **Adapter dedicati Anthropic/Gemini** e i loro contract test concreti. → **Fase 2** (la suite di conformità di 7a li accoglierà senza modifiche).
- **Context Assembler / memoria a strati / salienza.** → **Piano 8.**
- **Persistenza delle trace, costi/latenza/token reali, retry di rete.** Qui la `TracingPort` cattura solo eventi semantici in-memory; un tracer persistente arriva con la shell Electron. La `TraceEvent` union verrà estesa in 7b (`validation-failure`, `retry`).
- **Chiamate di rete reali nei test.** Mai: solo transport fake / SSE predefinito.
- **Embeddings / RAG / L3.** → Fase 2.

## Self-review (svolta sul piano vs spec)

- **Spec §7 «client unificato OpenAI-compatibile»** → Task 3 `createOpenAiCompatibleModel` (baseUrl/model/apiKey configurabili: copre LM Studio e cloud). ✓
- **Spec §7 «TracingPort dal giorno 1»** → Task 1 `TracingPort`/`noopTracer`, Task 3 wiring (request/response/error). I campi avanzati (token/costo/latenza, validation-failure, retry) sono dichiarati fuori ambito e arrivano in 7b/shell. ✓
- **Spec §5.4 «LLM (streaming) via porta LanguageModel»** → Task 1 porta async/stream; Task 3 streaming SSE reale. La mappatura tool-call→Command e la narrazione sono 7c (dichiarato). ✓
- **Spec §9 «contract test condivisi per ogni adapter AI»** → Task 4 `runLanguageModelContract`. ✓
- **Spec §4 «validazione Zod ai confini, output LLM»** → Task 3 `chunkSchema.safeParse` su ogni chunk. ✓
- **Spec §3/§10 «porte iniettate + doppi, niente rete reale, testabile in isolamento»** → `HttpTransport` iniettato; tutti i test con fake. ✓
- **Placeholder scan:** nessun TODO/TBD; ogni step ha codice/comando completo. ✓
- **Type consistency:** `LlmStreamEvent`/`LlmFinishReason`/`LlmRequest`/`HttpTransport`/`HttpResponse`/`TraceEvent`/`OpenAiCompatibleConfig` usati coerentemente fra task; `collectResponse`, `createFetchTransport`, `createOpenAiCompatibleModel`, `runLanguageModelContract`, `LanguageModelError` con firme identiche dove referenziati. ✓
- **Bug-apostrofo:** tutte le stringhe `it()/describe()` in apici singoli sono senza apostrofi. Grep di verifica: `(it|describe)\('[^']*'[A-Za-zàèéìòù]` → atteso *no matches*. ✓
- **Disciplina di scope:** nessun task tocca `package.json`/`tsconfig*`/`vitest.config.ts` esistenti; solo file nuovi sotto `packages/ai/`; l'unico file di root modificato è `pnpm-lock.yaml` (via `pnpm install`, atteso). ✓
- **Conteggi test:** 130 → 133 → 138 → 142 (cumulativi). ✓ (verificati in sandbox: 17 nuovi test verdi.)

## Roadmap (Fase 1, aggiornata)

- **Piano 6 — Persistenza** ✅ fatto
- **Piano 7a — Provider Layer (LanguageModel + OpenAI-compat + TracingPort)** ← *questo*
- **Piano 7b — StructuredOutputPort + 3 livelli di fallback** (da scrivere dopo 7a)
- **Piano 7c — AI Master pipeline + tool schemas** (da scrivere dopo 7b)
- **Piano 8 — Memoria L1.5 (canon ledger) + L2 (riassunti) + Context Assembler**
- **Piano 9 — Shell Electron** (main/preload/renderer, sicurezza, IPC tipizzato, Clock)
- **Piano 10 — UI Vue** (chat, scheda PG, dadi 3D, journal, provider) (grande, probabile split)
- **Piano 11 — Moduli a tema** (formato dati Zod + import/export + 1 modulo curato)

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-15-loomn-fase1-piano7a-provider-layer.md`. Two execution options:**

**1. Subagent-Driven (consigliato)** — un subagent fresco per task (model sonnet), spec review + code-quality review per task (sonnet), final review dell'intero branch (opus), poi `finishing-a-development-branch` → merge locale in main. **Non far leggere il file di piano al subagent: incolla il testo completo del task + la disciplina di scope.** Branch dedicato `feat/fase1-piano7a-provider-layer`.

**2. Inline Execution** — esecuzione dei task in questa sessione con `executing-plans`, checkpoint di review fra i batch.

**Quale approccio?**
