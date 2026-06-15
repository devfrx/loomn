# Piano 7c — AI Master pipeline + tool schemas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dare a `@loomn/ai` il **turno agentico del Master AI** (spec §5.4): gli **schemi Zod degli strumenti** del Master (`spawn_npc`, `attack`, `start_encounter`, `end_turn`, `next_round`), la **mappatura tool-call → `Command`** dell'engine, e l'orchestratore `runMasterTurn` che fa `contesto (stub) → prompt → LanguageModel.stream → tool-call → Zod → Command → decide (RNG seedato) → reinietta gli Event reali → narra` in un **singolo turno agentico**.

**Architecture:** Gli strumenti sono il **contratto LLM↔engine del bounded context AI** → vivono in `@loomn/ai` (NON in `shared`). Ogni strumento = `{ description, schema Zod, toCommand(args) → Command }`; un registro omogeneo espone `masterToolDefs()` (per il modello) e `resolveToolCall(name, rawArgs)` (parse+Zod+map). L'orchestratore costruisce sopra la porta `LanguageModel` di 7a (`collectResponse`) e l'engine (`decide`/`applyEvent`): un ciclo che, finché il modello chiama strumenti, risolve ogni tool-call con l'**RNG seedato** dell'engine e **reinietta gli Event reali** come messaggio utente, fino a quando il modello produce la **narrazione** in prosa. Qui `@loomn/ai` acquisisce la dipendenza `@loomn/engine` (smette di essere foglia); rispetta la regola `ai → engine → shared`. Test con **fake `LanguageModel`** + RNG seedato: nessuna rete reale.

**Tech Stack:** TypeScript strict (`tsconfig.base.json`), Vitest (config root), `zod@^3.23.8`, `zod-to-json-schema@~3.23.5` (già presente da 7b), **`@loomn/engine@workspace:*` (nuova dipendenza)**. Nessuna dipendenza di rete: costruito sulla porta `LanguageModel` (7a) e sull'engine puro.

---

## Dove sta il Piano 7c — e cosa esiste già (7a + 7b)

Il Piano 7 è splittato in **7a (fatto) / 7b (fatto) / 7c (questo)**. Mergiati in `main`:

- **7a — Provider Layer**: porta `LanguageModel` async/streaming (`stream(req): AsyncIterable<LlmStreamEvent>`, `collectResponse(stream) → {text,toolCalls,finishReason}`), adapter OpenAI-compatibile, `HttpTransport` iniettabile, `TracingPort` (`TraceEvent`/`noopTracer`/`createRecordingTracer`), contract `runLanguageModelContract`.
- **7b — `StructuredOutputPort`**: `createStructuredOutput(model, {tracer?, strategies?})` con i 3 livelli (function-call → json_schema → repair+retry), Zod come gate; `json-repair.ts` interno (`parseJson`/`extractJsonCandidate`/`repairJson`); `TraceEvent` esteso con `validation-failure`/`retry`.

**7c NON tocca l'adapter, il transport, `LanguageModel`, `StructuredOutputPort`, né l'engine.** Li **consuma**: importa l'engine (`Command`/`decide`/`applyEvent`/`replay`/`GameState`/`DomainEvent`/`RandomSource`/`createSeededRandom`/tipi `Actor`/`Item`) e la porta `LanguageModel` (`collectResponse`) + `TracingPort`. Riusa `parseJson` da `json-repair.ts` (interno al pacchetto).

### Decisioni risolte (e perché)

1. **Schemi degli strumenti in `@loomn/ai`, NON in `shared`.** Sono il contratto fra il modello e l'engine, di proprietà del contesto AI (spec §3 «AI/Conversation» è un bounded context a sé). `shared` resta foglia (validazione dei confini di persistenza, Piano 6).
2. **`@loomn/ai` dipende da `@loomn/engine`, NON da `@loomn/shared`.** L'handoff §7 ipotizzava entrambe; empiricamente **`shared` non serve in 7c**: gli `Command`/`DomainEvent` vengono e restano tipati dall'engine (`decide` li produce già tipati, come in Piano 6 la validazione Zod è solo in *lettura* al confine di persistenza). Aggiungeremo `shared` quando servirà serializzare/validare eventi verso un confine esterno (Piano 8/9). YAGNI + disciplina di scope: si aggiunge solo ciò che si usa.
3. **Singolo turno agentico in streaming (spec §5.4), non due chiamate "risolvi→narra".** `runMasterTurn` è un ciclo: il modello chiama strumenti con `toolChoice: 'auto'`; quando smette e produce testo, quel testo è la narrazione. Gli Event reali sono reiniettati nello *stesso* turno. Non si codifica un rigido "prima risolvi, poi narra".
4. **`toolChoice: 'auto'` + terminazione su testo libero.** Niente strumento `narrate`: la narrazione è il testo finale del modello (un `narrate` esplicito sarebbe ridondante col testo libero e aggiungerebbe superficie). Termina anche su `maxIterations` (default 6) come guardia anti-loop.
5. **Reiniezione degli Event reali come messaggio `role: 'user'`, NON `role: 'tool'`.** L'adapter 7a (`toWireMessage`) non fa round-trip dei `tool_calls` sull'assistant, quindi un `role:'tool'` con `tool_call_id` verrebbe rifiutato da un provider OpenAI reale. Un messaggio utente con gli eventi in JSON è **provider-agnostico** (cruciale per i modelli locali) e non richiede di toccare l'adapter (fuori ambito). Fedele a «l'AI riceve gli Event REALI».
6. **Strumenti = il sottoinsieme già coperto dall'engine.** Mappano 1:1 ai 5 `Command` esistenti: `spawn_npc → AddActor`, `attack → Attack`, `start_encounter → StartEncounter`, `end_turn → EndTurn`, `next_round → NextRound`. `attack` è il veicolo del principio «il codice è l'arbitro»: il motore tira la prova (RNG seedato) e applica il danno; l'AI narra. `request_check` (standalone), `apply_effect` (condizione/risorsa) e `advance_quest` (contesto quest = L1, Piano 8) **richiedono nuovi `Command`/`Event` dell'engine o un nuovo contesto** → fuori ambito (vedi sotto): 7c **consuma** l'engine, non lo estende.
7. **FSM di fase (spec §5.5) rimandata.** Le fasi (esplorazione/dialogo/combattimento/downtime) come macchina a stati con transizioni esplicite e testabili sono un sottosistema a sé (abilitano `Command` e strategie di prompt diverse). Includerla qui gonfierebbe 7c. In 7c: prompt di sistema generico + set di strumenti completo per il combattimento. La FSM è un piano dedicato successivo.
8. **Validazione dei tool-call con Zod inline (lo stesso gate di 7b), NON ri-eseguendo lo `StructuredOutputPort`.** Nel ciclo agentico gli argomenti arrivano già come stringa JSON dentro l'evento `tool-call`; `resolveToolCall` fa `parseJson` + `schema.safeParse`. Riusare i 3 livelli di fallback di 7b per ogni tool-call in-loop sarebbe una chiamata-modello annidata, fuori posto. Lo `StructuredOutputPort` resta disponibile per i casi che forzano un singolo oggetto strutturato (es. Reflection, Piano 8).
9. **`@loomn/ai` resta sotto la regola di dipendenza.** `ai → engine → shared`: nessun ciclo. L'engine **non** importa `ai`.

### Splitting: 7c resta un solo piano, 2 task

Valutato lo split in piani separati (handoff §7): un piano "soli schemi" avrebbe come "software funzionante" solo schemi senza consumatore (sottile). Il **turno del Master** è un sottosistema coerente; si decompone naturalmente in **2 task** — il contratto degli strumenti e l'orchestratore — esattamente come 7a/7b (un modulo + i suoi test per task). Gli strumenti estesi (che richiedono nuovi `Command`) e la FSM sono piani futuri.

### Verifica empirica già svolta (sandbox, prima della stesura — HANDOFF §5.3)

Tutto il codice e i test di 7c sono stati **eseguiti verdi** in una sandbox pnpm-workspace esterna al repo, con la toolchain reale (Node v24.9.0, pnpm 9.12.0, TS strict identico via `tsconfig.base.json`, Vitest 2.1.9) e copie reali di `@loomn/engine` + `@loomn/ai` (7a/7b). In particolare:

- **Risoluzione cross-package + typecheck**: con `"@loomn/engine": "workspace:*"` in `packages/ai/package.json`, `@loomn/ai` importa l'engine e `tsc --noEmit` passa **senza toccare alcun `tsconfig`** (il `tsconfig` di `ai` è identico a quello di `memory`, che già importa l'engine; `main`/`types` puntano a `src/index.ts`, risolto via il symlink pnpm + `moduleResolution: Bundler`).
- **Attrito `exactOptionalPropertyTypes` risolto**: `z.record(...).default({})` con `schema: z.ZodType<A>` infila `| undefined` in `A` (unifica Input/Output). **Soluzione provata**: campi `.optional()` + default nel mapper (`?? {}`). Bonus: i campi opzionali NON finiscono in `required` nello schema JSON esposto al modello.
- **`zodToJsonSchema(schema, { target:'openApi3', $refStrategy:'none' })`** sui 5 schemi → schemi **inline** (`type:'object'`, nessun `$ref`), incluso `z.object({})` (end_turn/next_round).
- **Registro omogeneo type-safe**: `makeEntry<A>(...)` cattura `A` concreto e ritorna `ToolEntry` type-erased → `Record<string,ToolEntry>` senza cast non sicuri.
- **Ciclo agentico completo** con fake model + RNG seedato: pipeline `attack` (con seed 42: prova `1d20(13)+5=18` vs CD 10 → successo, danno `1d6=3`, hp goblin 8→5); **determinismo** (stesso seed → stessi eventi); **canone replayabile** (`replay([...setup, ...turn.events]) === state` finale); `spawn_npc` → `ActorAdded`; argomenti non validi → `validation-failure` tracciata + nessun evento; comando rifiutato da `decide` → `error` tracciato + nessun evento; nessuna tool-call → narrazione pura con una sola chiamata al modello.
- **Risultato sandbox**: `pnpm -r typecheck` pulito su `engine`+`ai`; **14/14 nuovi test verdi** (7 `master-tools` + 7 `master-turn`); l'intera suite copiata resta verde.

> La sandbox di verifica è esterna al repo (`C:\Users\zagor\loomn-p7c-sandbox`) e va rimossa a fine lavoro; non fa parte del repository.

---

## Disciplina di scope (vale per OGNI task — incollala nel prompt di ogni subagent)

> **Regole rigide (HANDOFF §5).** Modifica **SOLO** i file elencati nel task. **MAI** toccare `package.json`/`tsconfig*.json`/`vitest.config.ts` (di root o di qualunque pacchetto, **incluso `packages/ai/package.json`**: l'aggiunta della dipendenza `@loomn/engine` è un passo dell'orchestratore, vedi Setup). **MAI** creare un `tsconfig.json` di root né `composite`/project references. Crea i file con lo strumento Write (non `New-Item -Force`). Prima di committare esegui `git status --short` e verifica che siano cambiati solo i file previsti. Stringhe dei test in apici singoli **senza apostrofi** (`l'`, `un'`, `dell'`, `c'è`) — usa forme senza apostrofo (`è`/`é` vanno bene). Il typecheck di pacchetto è `tsc --noEmit`; il typecheck root è `pnpm -r typecheck` (**mai** `tsc -b`). L'engine resta puro: nessun `Math.random`/`Date.now`; l'RNG è iniettato.

---

## Setup (passo dell'ORCHESTRATORE, prima del Task 1)

La dipendenza nuova va aggiunta a `packages/ai/package.json` (file **esistente** → lo fa l'orchestratore, non un subagent). Dalla root:

```bash
pnpm -C packages/ai add @loomn/engine@workspace:*
```

Risultato atteso in `packages/ai/package.json` (sezione `dependencies`, ordine alfabetico):
```json
"dependencies": {
  "@loomn/engine": "workspace:*",
  "jsonrepair": "^3.8.0",
  "zod": "^3.23.8",
  "zod-to-json-schema": "~3.23.5"
}
```
`pnpm` crea il symlink `node_modules/@loomn/engine` (workspace) e aggiorna `pnpm-lock.yaml` (atteso). **Nessuna** modifica a `tsconfig*`/`vitest.config.ts`. Verifica con `pnpm -C packages/ai typecheck` (deve restare pulito col solo cambio di dipendenza).

---

## File structure — modifiche a `packages/ai/`

| File | Stato | Responsabilità |
|---|---|---|
| `package.json` | MODIFY (orchestratore, Setup) | + `@loomn/engine@workspace:*`. |
| `src/master-tools.ts` | CREATE (Task 1) | Schemi Zod degli strumenti + registro + `masterToolDefs()` + `resolveToolCall()` + tipo `ToolResolution`. Mappa tool-call → `Command`. |
| `src/master-turn.ts` | CREATE (Task 2) | `assembleContextStub`, `buildMasterMessages`, `runMasterTurn` (ciclo agentico) + tipi `MasterTurnRequest`/`Result`/`ToolInvocation`. |
| `src/index.ts` | MODIFY (Task 1 e Task 2) | + `export * from './master-tools';` (Task 1) e `+ './master-turn';` (Task 2). |
| `src/master-tools.test.ts` | CREATE (Task 1) | 7 test. |
| `src/master-turn.test.ts` | CREATE (Task 2) | 7 test (fake `LanguageModel` + RNG seedato). |

**Conteggi test attesi (cumulativi, baseline 160):** Task 1 → **167** (+7), Task 2 → **174** (+7).

---

### Task 1: Strumenti del Master + mappatura tool→Command (`master-tools.ts`)

**Files:**
- Create: `packages/ai/src/master-tools.ts`
- Modify: `packages/ai/src/index.ts` (aggiungi `export * from './master-tools';`)
- Test: `packages/ai/src/master-tools.test.ts`

- [ ] **Step 1: Scrivi i test che falliscono**

`packages/ai/src/master-tools.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { masterToolDefs, resolveToolCall } from './master-tools';

describe('masterToolDefs', () => {
  it('espone i 5 strumenti con schemi JSON inline (niente ref)', () => {
    const defs = masterToolDefs();
    const names = defs.map((d) => d.name).sort();
    expect(names).toEqual(['attack', 'end_turn', 'next_round', 'spawn_npc', 'start_encounter']);
    for (const d of defs) {
      expect(typeof d.description).toBe('string');
      expect((d.parameters as { type?: string }).type).toBe('object');
      expect(JSON.stringify(d.parameters)).not.toContain('$ref');
    }
  });
});

describe('resolveToolCall', () => {
  it('mappa attack valido a un Command Attack, senza chiavi opzionali assenti', () => {
    const r = resolveToolCall(
      'attack',
      '{"attackerId":"pc1","targetId":"g1","defense":"riflessi","defenseBase":10,"damageResource":"hp"}',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    expect(r.command.type).toBe('Attack');
    expect('attribute' in r.command).toBe(false);
    expect('skill' in r.command).toBe(false);
  });

  it('include le chiavi opzionali quando presenti', () => {
    const r = resolveToolCall(
      'attack',
      '{"attackerId":"pc1","targetId":"g1","attribute":"forza","defense":"riflessi","defenseBase":10,"damageResource":"hp"}',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    expect(r.command).toMatchObject({ type: 'Attack', attribute: 'forza' });
  });

  it('mappa spawn_npc riempiendo i default (conditions/items/progression)', () => {
    const r = resolveToolCall('spawn_npc', '{"id":"g1","name":"Goblin"}');
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    expect(r.command).toEqual({
      type: 'AddActor',
      actor: {
        id: 'g1',
        name: 'Goblin',
        kind: 'npc',
        attributes: {},
        skills: {},
        resources: {},
        conditions: [],
        items: [],
        progression: { xp: 0, level: 0 },
      },
    });
  });

  it('rifiuta argomenti che non rispettano lo schema', () => {
    const r = resolveToolCall('attack', '{"attackerId":"pc1"}');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error.length).toBeGreaterThan(0);
  });

  it('rifiuta uno strumento sconosciuto', () => {
    const r = resolveToolCall('teletrasporta', '{}');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('sconosciuto');
  });

  it('rifiuta argomenti non JSON', () => {
    const r = resolveToolCall('end_turn', 'non-json');
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui i test per vederli fallire**

Run: `pnpm test packages/ai/src/master-tools.test.ts`
Expected: FAIL — `Cannot find module './master-tools'`.

- [ ] **Step 3: Implementa `master-tools.ts`**

`packages/ai/src/master-tools.ts`:
```ts
// Strumenti del Master AI: il contratto LLM<->engine del bounded context AI (spec 5.4).
// Ogni strumento ha un nome, una descrizione, uno schema Zod degli argomenti e un mapper
// PURO da argomenti validati a un Command dell engine. Gli schemi vivono qui (NON in
// shared): sono il contratto fra il modello e l engine, di proprieta del contesto AI.
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Command } from '@loomn/engine';
import type { LlmToolDef } from './language-model';
import { parseJson } from './json-repair';

// --- schemi degli argomenti (Zod) ---

const resourcePoolSchema = z.object({ current: z.number(), max: z.number() });

const spawnNpcSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  attributes: z.record(z.number()).optional(),
  skills: z.record(z.number()).optional(),
  resources: z.record(resourcePoolSchema).optional(),
});

const attackSchema = z.object({
  attackerId: z.string().min(1),
  targetId: z.string().min(1),
  attribute: z.string().min(1).optional(),
  skill: z.string().min(1).optional(),
  defense: z.string().min(1),
  defenseBase: z.number(),
  damageResource: z.string().min(1),
});

const startEncounterSchema = z.object({
  encounterId: z.string().min(1),
  participants: z
    .array(z.object({ actorId: z.string().min(1), zone: z.string().min(1), initiative: z.number() }))
    .min(1),
});

const endTurnSchema = z.object({});
const nextRoundSchema = z.object({});

// --- registro: ogni voce e gia type-erased ma costruita su uno schema concreto ---

interface ToolEntry {
  description: string;
  jsonSchema: Record<string, unknown>;
  resolve(json: unknown): { ok: true; command: Command } | { ok: false; error: string };
}

function issuesOf(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}

// Cattura il tipo concreto A dello schema; il registro resta omogeneo (Record<string,ToolEntry>).
function makeEntry<A>(description: string, schema: z.ZodType<A>, toCommand: (args: A) => Command): ToolEntry {
  return {
    description,
    jsonSchema: zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' }) as Record<string, unknown>,
    resolve(json) {
      const v = schema.safeParse(json);
      if (!v.success) return { ok: false, error: issuesOf(v.error) };
      return { ok: true, command: toCommand(v.data) };
    },
  };
}

const TOOLS: Record<string, ToolEntry> = {
  spawn_npc: makeEntry(
    'Crea e aggiunge un nuovo PNG al mondo (diventa canone). Usa id univoci.',
    spawnNpcSchema,
    (a) => ({
      type: 'AddActor',
      actor: {
        id: a.id,
        name: a.name,
        kind: 'npc',
        attributes: a.attributes ?? {},
        skills: a.skills ?? {},
        resources: a.resources ?? {},
        conditions: [],
        items: [],
        progression: { xp: 0, level: 0 },
      },
    }),
  ),
  attack: makeEntry(
    'Dichiara un attacco: il motore tira la prova e applica il danno in modo deterministico.',
    attackSchema,
    (a) => ({
      type: 'Attack',
      attackerId: a.attackerId,
      targetId: a.targetId,
      defense: a.defense,
      defenseBase: a.defenseBase,
      damageResource: a.damageResource,
      ...(a.attribute !== undefined ? { attribute: a.attribute } : {}),
      ...(a.skill !== undefined ? { skill: a.skill } : {}),
    }),
  ),
  start_encounter: makeEntry(
    'Avvia uno scontro con i partecipanti indicati (devono gia esistere come attori).',
    startEncounterSchema,
    (a) => ({ type: 'StartEncounter', encounterId: a.encounterId, participants: a.participants }),
  ),
  end_turn: makeEntry('Termina il turno corrente nello scontro attivo.', endTurnSchema, () => ({ type: 'EndTurn' })),
  next_round: makeEntry('Avanza al round successivo dello scontro attivo.', nextRoundSchema, () => ({
    type: 'NextRound',
  })),
};

export type ToolResolution =
  | { ok: true; toolName: string; command: Command }
  | { ok: false; toolName: string; error: string };

/** Definizioni degli strumenti da passare al modello (LlmToolDef[]). */
export function masterToolDefs(): LlmToolDef[] {
  return Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, parameters: t.jsonSchema }));
}

/** Parsa+valida gli argomenti grezzi di una tool-call e li mappa a un Command, oppure spiega l errore. */
export function resolveToolCall(name: string, rawArgs: string): ToolResolution {
  const tool = TOOLS[name];
  if (tool === undefined) return { ok: false, toolName: name, error: `strumento sconosciuto: ${name}` };
  const parsed = parseJson(rawArgs);
  if (!parsed.ok) return { ok: false, toolName: name, error: parsed.error };
  const r = tool.resolve(parsed.json);
  if (!r.ok) return { ok: false, toolName: name, error: r.error };
  return { ok: true, toolName: name, command: r.command };
}
```

- [ ] **Step 4: Aggiorna il barrel**

`packages/ai/src/index.ts` (aggiungi la riga, mantieni le altre):
```ts
export * from './language-model';
export * from './tracing';
export * from './transport';
export * from './openai-adapter';
export * from './structured-output';
export * from './master-tools';
```

- [ ] **Step 5: Esegui test + typecheck**

Run: `pnpm test`
Expected: PASS — **167** test (160 + 7).
Run: `pnpm -C packages/ai typecheck`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add packages/ai/src/master-tools.ts packages/ai/src/master-tools.test.ts packages/ai/src/index.ts
git commit -m "feat(ai): strumenti del Master + mappatura tool-call -> Command engine"
```

---

### Task 2: Turno agentico del Master (`master-turn.ts`)

**Files:**
- Create: `packages/ai/src/master-turn.ts`
- Modify: `packages/ai/src/index.ts` (aggiungi `export * from './master-turn';`)
- Test: `packages/ai/src/master-turn.test.ts`

- [ ] **Step 1: Scrivi i test che falliscono** (fake `LanguageModel` + RNG seedato)

`packages/ai/src/master-turn.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { replay, createSeededRandom, type Actor, type DomainEvent, type Item } from '@loomn/engine';
import { runMasterTurn } from './master-turn';
import type { LanguageModel, LlmRequest, LlmStreamEvent } from './language-model';
import { createRecordingTracer } from './tracing';

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

function toolCall(name: string, args: string): LlmStreamEvent[] {
  return [
    { type: 'tool-call', id: 'c1', name, arguments: args },
    { type: 'finish', reason: 'tool_calls' },
  ];
}
function text(t: string): LlmStreamEvent[] {
  return [
    { type: 'text', delta: t },
    { type: 'finish', reason: 'stop' },
  ];
}

const weapon: Item = {
  id: 'spada',
  name: 'Spada',
  equipped: true,
  effects: [{ kind: 'contributeDice', dice: [{ count: 1, sides: 6 }], mode: 'effect' }],
};
const attacker: Actor = {
  id: 'pc1',
  name: 'Eroe',
  kind: 'pc',
  attributes: { forza: 5 },
  skills: {},
  resources: {},
  conditions: [],
  items: [weapon],
  progression: { xp: 0, level: 0 },
};
const target: Actor = {
  id: 'g1',
  name: 'Goblin',
  kind: 'npc',
  attributes: {},
  skills: {},
  resources: { hp: { current: 8, max: 8 } },
  conditions: [],
  items: [],
  progression: { xp: 0, level: 0 },
};
const setupEvents: DomainEvent[] = [
  { type: 'ActorAdded', actor: attacker },
  { type: 'ActorAdded', actor: target },
];
const baseState = replay(setupEvents);

const ATTACK_ARGS =
  '{"attackerId":"pc1","targetId":"g1","attribute":"forza","defense":"riflessi","defenseBase":10,"damageResource":"hp"}';

describe('runMasterTurn', () => {
  it('pipeline completa: tool-call attack -> engine risolve -> narrazione', async () => {
    const model = fakeModel((req, i) => {
      if (i === 0) {
        expect(req.toolChoice).toBe('auto');
        expect(req.tools?.some((t) => t.name === 'attack')).toBe(true);
        return toolCall('attack', ATTACK_ARGS);
      }
      return text('La spada cala e il goblin barcolla.');
    });
    const res = await runMasterTurn({ model, rng: createSeededRandom(42), state: baseState, playerAction: 'Attacco il goblin.' });
    expect(res.events.some((e) => e.type === 'AttackResolved')).toBe(true);
    // Il codice e l arbitro: con seed 42 la prova e 1d20(13)+5 = 18 vs CD 10 (successo), danno 1d6 = 3.
    expect(res.events.some((e) => e.type === 'DamageApplied' && e.amount === 3)).toBe(true);
    expect(res.state.actors['g1']?.resources['hp']?.current).toBe(5);
    expect(res.narration).toBe('La spada cala e il goblin barcolla.');
    expect(res.invocations[0]?.toolName).toBe('attack');
  });

  it('e deterministico a parita di seed (stessi eventi)', async () => {
    const script = (req: LlmRequest, i: number): LlmStreamEvent[] =>
      i === 0 ? toolCall('attack', ATTACK_ARGS) : text('fine');
    const run1 = await runMasterTurn({ model: fakeModel(script), rng: createSeededRandom(7), state: baseState, playerAction: 'Attacco.' });
    const run2 = await runMasterTurn({ model: fakeModel(script), rng: createSeededRandom(7), state: baseState, playerAction: 'Attacco.' });
    expect(run1.events).toEqual(run2.events);
  });

  it('gli eventi del turno sono canone replayabile', async () => {
    const model = fakeModel((req, i) => (i === 0 ? toolCall('attack', ATTACK_ARGS) : text('fine')));
    const res = await runMasterTurn({ model, rng: createSeededRandom(7), state: baseState, playerAction: 'Attacco.' });
    expect(replay([...setupEvents, ...res.events])).toEqual(res.state);
  });

  it('spawn_npc crea canone (ActorAdded)', async () => {
    const model = fakeModel((req, i) =>
      i === 0 ? toolCall('spawn_npc', '{"id":"orco1","name":"Orco","resources":{"hp":{"current":12,"max":12}}}') : text('Un orco appare.'),
    );
    const res = await runMasterTurn({ model, rng: createSeededRandom(1), state: baseState, playerAction: 'Chi entra?' });
    expect(res.events.some((e) => e.type === 'ActorAdded')).toBe(true);
    expect(res.state.actors['orco1']?.name).toBe('Orco');
    expect(res.invocations[0]?.toolName).toBe('spawn_npc');
  });

  it('argomenti non validi: nessun evento, validation-failure tracciata, poi narra', async () => {
    const tracer = createRecordingTracer();
    const model = fakeModel((req, i) =>
      i === 0 ? toolCall('attack', '{"attackerId":"pc1"}') : text('Esito incerto.'),
    );
    const res = await runMasterTurn({ model, rng: createSeededRandom(1), state: baseState, playerAction: 'Attacco a caso.', tracer });
    expect(res.events).toEqual([]);
    expect(res.narration).toBe('Esito incerto.');
    expect(tracer.events.some((e) => e.kind === 'validation-failure' && e.strategy === 'tool:attack')).toBe(true);
  });

  it('comando rifiutato dal motore: nessun evento, error tracciato', async () => {
    const tracer = createRecordingTracer();
    const badArgs = '{"attackerId":"ignoto","targetId":"g1","defense":"riflessi","defenseBase":10,"damageResource":"hp"}';
    const model = fakeModel((req, i) => (i === 0 ? toolCall('attack', badArgs) : text('Niente accade.')));
    const res = await runMasterTurn({ model, rng: createSeededRandom(1), state: baseState, playerAction: 'Attacco un fantasma.', tracer });
    expect(res.events).toEqual([]);
    expect(res.narration).toBe('Niente accade.');
    expect(tracer.events.some((e) => e.kind === 'error')).toBe(true);
  });

  it('nessuna tool-call: narrazione pura, nessun evento, una sola chiamata al modello', async () => {
    let calls = 0;
    const model = fakeModel(() => {
      calls++;
      return text('Il vento soffia tra le rovine.');
    });
    const res = await runMasterTurn({ model, rng: createSeededRandom(1), state: baseState, playerAction: 'Mi guardo intorno.' });
    expect(res.events).toEqual([]);
    expect(res.narration).toBe('Il vento soffia tra le rovine.');
    expect(calls).toBe(1);
  });
});
```

- [ ] **Step 2: Esegui i test per vederli fallire**

Run: `pnpm test packages/ai/src/master-turn.test.ts`
Expected: FAIL — `Cannot find module './master-turn'`.

- [ ] **Step 3: Implementa `master-turn.ts`**

`packages/ai/src/master-turn.ts`:
```ts
// Turno agentico del Master AI (spec 5.4): assembla contesto (stub) -> prompt ->
// LanguageModel.stream -> tool-call -> Zod -> Command -> decide (RNG seedato) -> reinietta
// gli Event REALI nello stesso turno -> il modello narra. Singolo turno agentico in
// streaming (non due chiamate "risolvi->narra"). Il codice e l arbitro, l AI il narratore.
import { decide, applyEvent, type Command, type DomainEvent, type GameState, type RandomSource } from '@loomn/engine';
import { collectResponse, type LanguageModel, type LlmMessage } from './language-model';
import { noopTracer, type TracingPort } from './tracing';
import { masterToolDefs, resolveToolCall } from './master-tools';

const SYSTEM_PROMPT =
  'Sei il Master di un gioco di ruolo. Proponi le azioni chiamando gli strumenti forniti: ' +
  'il motore di gioco le risolve in modo deterministico e ti restituisce gli eventi reali. ' +
  'Non inventare numeri, tiri o esiti: usa gli strumenti, poi narra gli eventi reali che ricevi. ' +
  'Quando non servono altre azioni, rispondi con la narrazione finale in prosa, senza chiamare strumenti.';

/** Stub del Context Assembler (il vero, con budget di token, arriva nel Piano 8). Riassume in
 *  prosa lo stato L1 rilevante: attori (nome, tipo, risorse) e stato dello scontro. */
export function assembleContextStub(state: GameState): string {
  const actors = Object.values(state.actors).map((a) => {
    const res = Object.entries(a.resources)
      .map(([k, p]) => `${k} ${p.current}/${p.max}`)
      .join(', ');
    return `- ${a.name} (${a.kind}, id=${a.id})${res.length > 0 ? `: ${res}` : ''}`;
  });
  const list = actors.length > 0 ? actors.join('\n') : '- (nessun attore)';
  const enc =
    state.encounter === null
      ? 'Nessuno scontro attivo.'
      : `Scontro ${state.encounter.id}: round ${state.encounter.round}, turno ${state.encounter.turnIndex}.`;
  return `Stato attuale (L1):\n${list}\n${enc}`;
}

/** Costruisce i messaggi iniziali del turno: ruolo/regole + contesto + azione del giocatore. */
export function buildMasterMessages(context: string, playerAction: string): LlmMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: context },
    { role: 'user', content: playerAction },
  ];
}

export interface MasterTurnRequest {
  model: LanguageModel;
  rng: RandomSource;
  state: GameState;
  playerAction: string;
  tracer?: TracingPort;
  /** numero massimo di iterazioni del ciclo agentico (default 6). */
  maxIterations?: number;
}

export interface ToolInvocation {
  toolName: string;
  command: Command;
  events: DomainEvent[];
}

export interface MasterTurnResult {
  state: GameState;
  events: DomainEvent[];
  narration: string;
  invocations: ToolInvocation[];
  transcript: LlmMessage[];
}

function summarizeCalls(names: string[]): string {
  return `Azioni proposte: ${names.join(', ')}`;
}

export async function runMasterTurn(request: MasterTurnRequest): Promise<MasterTurnResult> {
  const tracer = request.tracer ?? noopTracer;
  const maxIterations = request.maxIterations ?? 6;
  const toolDefs = masterToolDefs();

  let state = request.state;
  const events: DomainEvent[] = [];
  const invocations: ToolInvocation[] = [];
  const messages: LlmMessage[] = buildMasterMessages(assembleContextStub(state), request.playerAction);
  let narration = '';

  for (let iter = 0; iter < maxIterations; iter++) {
    const res = await collectResponse(request.model.stream({ messages, tools: toolDefs, toolChoice: 'auto' }));
    tracer.record({
      kind: 'response',
      finishReason: res.finishReason,
      textLength: res.text.length,
      toolCallCount: res.toolCalls.length,
    });

    if (res.toolCalls.length === 0) {
      narration = res.text;
      break;
    }

    messages.push({
      role: 'assistant',
      content: res.text.length > 0 ? res.text : summarizeCalls(res.toolCalls.map((c) => c.name)),
    });

    const resultLines: string[] = [];
    for (const call of res.toolCalls) {
      const resolution = resolveToolCall(call.name, call.arguments);
      if (!resolution.ok) {
        tracer.record({ kind: 'validation-failure', strategy: `tool:${call.name}`, issues: resolution.error });
        resultLines.push(`${call.name}: ARGOMENTI NON VALIDI (${resolution.error}).`);
        continue;
      }
      let produced: DomainEvent[];
      try {
        // Il codice e l arbitro: decide consuma l RNG seedato e produce gli eventi reali.
        produced = decide(state, resolution.command, request.rng);
      } catch (e) {
        tracer.record({ kind: 'error', message: `decide(${call.name}): ${(e as Error).message}` });
        resultLines.push(`${call.name}: RIFIUTATO dal motore (${(e as Error).message}).`);
        continue;
      }
      for (const ev of produced) state = applyEvent(state, ev);
      events.push(...produced);
      invocations.push({ toolName: call.name, command: resolution.command, events: produced });
      resultLines.push(`${call.name}: ${JSON.stringify(produced)}`);
    }

    // L AI riceve gli Event REALI (reiniettati come messaggio utente: provider-agnostico,
    // non richiede l accoppiamento tool_call_id che l adapter 7a non fa round-trip).
    messages.push({
      role: 'user',
      content: `Eventi reali dal motore:\n${resultLines.join('\n')}\nNarra questi esiti oppure proponi altre azioni.`,
    });
  }

  return { state, events, narration, invocations, transcript: messages };
}
```

- [ ] **Step 4: Aggiorna il barrel**

`packages/ai/src/index.ts` (aggiungi la riga, mantieni le altre):
```ts
export * from './language-model';
export * from './tracing';
export * from './transport';
export * from './openai-adapter';
export * from './structured-output';
export * from './master-tools';
export * from './master-turn';
```

- [ ] **Step 5: Esegui test + typecheck**

Run: `pnpm test`
Expected: PASS — **174** test (167 + 7).
Run: `pnpm -C packages/ai typecheck` e `pnpm typecheck`
Expected: nessun errore (engine/shared/memory/ai puliti).

- [ ] **Step 6: Commit**

```bash
git add packages/ai/src/master-turn.ts packages/ai/src/master-turn.test.ts packages/ai/src/index.ts
git commit -m "feat(ai): turno agentico runMasterTurn (tool-call -> decide -> reiniezione eventi -> narra)"
```

---

## Fuori ambito (esplicito)

- **Strumenti `request_check` (standalone), `apply_effect`, `advance_quest`.** Richiedono nuovi `Command`/`Event` dell'engine (una prova autonoma che produca un evento; applicazione di condizioni/risorse) o un nuovo contesto (quest = stato L1, Piano 8). 7c **consuma** l'engine, non lo estende → piano dedicato successivo (es. "Comandi Master estesi") o dentro il Piano 8.
- **FSM di fase (spec §5.5).** Macchina a stati esplicita (esplorazione/dialogo/combattimento/downtime) con transizioni testabili e set di `Command`/prompt per fase → piano dedicato.
- **Modifiche all'adapter OpenAI / al transport / a `LanguageModel` / a `StructuredOutputPort` / all'engine.** 7c ci costruisce sopra senza toccarli. In particolare la reiniezione degli eventi è `role:'user'` per non dipendere dal round-trip dei `tool_calls` (assente nell'adapter 7a).
- **Dipendenza da `@loomn/shared`.** Non usata in 7c (vedi Decisione 2); si aggiungerà quando servirà davvero.
- **Context Assembler reale con budget di token (spec §6.2), memoria L1.5/L2.** Qui solo `assembleContextStub`. → Piano 8.
- **Adapter dedicati Anthropic/Gemini, embeddings/L3, UI, Electron.** → Fase 1 successiva / Fase 2.
- **Chiamate di rete reali nei test.** Mai: solo fake `LanguageModel` + RNG seedato.

## Self-review (svolta sul piano vs spec)

- **Spec §5.4 «AI Master come pipeline esplicita: contesto → prompt → LLM(stream) → tool-call → Zod → Command → engine valida/esegue (rng seedato) → l'AI riceve gli Event REALI e narra»** → Task 2 `runMasterTurn` realizza ogni freccia; Task 1 fornisce tool-call→Zod→Command. ✓
- **Spec §5.4 «L'AI propone Command, non tocca il DB; il tiro lo fa l'engine; Command che violano le invarianti → rifiutati»** → `decide`/`applyEvent` sono l'unico mutatore; test "comando rifiutato dal motore" copre il rifiuto. ✓
- **Spec §5.4 «Fatti narrativi canonici (nuovo PNG) passano da Command→Event → canone replayabile»** → `spawn_npc → AddActor`; test "canone replayabile" asserisce `replay([...setup, ...turn.events]) === state`. ✓
- **Spec §5.4 «singolo turno agentico in streaming invece di due chiamate risolvi→narra»** → ciclo con `toolChoice:'auto'`, reiniezione nello stesso turno, terminazione su testo libero (Decisioni 3/4/5). ✓
- **Spec §5.4 «strumenti esposti con schema Zod (request_check, apply_effect, spawn_npc, advance_quest, narrate)»** → sottoinsieme coperto dall'engine implementato (spawn_npc + combat/flow); il resto motivatamente fuori ambito (Decisione 6, Fuori ambito). ✓ (deviazione documentata)
- **Spec §4 «Validazione Zod ai confini, output dell'LLM; non fidarsi del modello»** → `resolveToolCall` valida ogni tool-call con Zod prima di mappare; `decide` rifiuta comandi invalidi. ✓
- **Spec §3/§4 «dependency rule ai → engine → shared; engine puro, rng iniettato»** → `ai` importa `engine` (non il contrario); `runMasterTurn` riceve `RandomSource`; nessun `Math.random`/`Date.now`. ✓
- **Spec §7 «TracingPort: tool-call, fallimenti di validazione»** → `runMasterTurn` registra `response`/`validation-failure`/`error`. ✓
- **Spec §9 «test deterministici via random seedato»** → test "deterministico a parita di seed". ✓
- **Placeholder scan:** nessun TODO/TBD; ogni step ha codice/comando completo. ✓
- **Type consistency:** `masterToolDefs`/`resolveToolCall`/`ToolResolution`/`ToolEntry`/`makeEntry` (Task 1) e `runMasterTurn`/`MasterTurnRequest`/`MasterTurnResult`/`ToolInvocation`/`assembleContextStub`/`buildMasterMessages` (Task 2) coerenti; `Command`/`DomainEvent`/`GameState`/`RandomSource`/`Actor`/`Item`/`replay`/`createSeededRandom` dall'engine; `LanguageModel`/`LlmMessage`/`LlmToolDef`/`collectResponse` da 7a; `TracingPort`/`noopTracer`/`createRecordingTracer` da 7a/7b; `parseJson` da `json-repair`. ✓
- **Bug-apostrofo:** tutte le stringhe `it()/describe()` in apici singoli sono senza apostrofi. Grep: `(it|describe)\('[^']*'[A-Za-zàèéìòù]` → atteso *no matches* (verificato in sandbox). ✓
- **Disciplina di scope:** Task 1/2 toccano solo file sotto `packages/ai/src/`; `package.json` lo modifica l'orchestratore nel Setup; `pnpm-lock.yaml` è l'unico file di root cambiato (atteso). ✓
- **Conteggi test:** 167 → 174 (cumulativi). ✓ (verificati in sandbox: 14 nuovi test verdi.)

## Roadmap (Fase 1, aggiornata)

- **Piano 6 — Persistenza** ✅ fatto
- **Piano 7a — Provider Layer** ✅ fatto
- **Piano 7b — StructuredOutputPort + 3 livelli di fallback** ✅ fatto
- **Piano 7c — AI Master pipeline + tool schemas** ← *questo*
- **Piano 8 — Memoria L1.5 (canon ledger) + L2 (riassunti) + Context Assembler** (rimpiazza `assembleContextStub`; qui rientrano probabilmente i `Command`/`Event` per `apply_effect`/`request_check` e il contesto quest per `advance_quest`)
- **Piano (FSM) — Fasi di gioco come State Machine** (spec §5.5)
- **Piano 9 — Shell Electron** (main/preload/renderer, sicurezza, IPC tipizzato, Clock)
- **Piano 10 — UI Vue** (chat, scheda PG, dadi 3D, journal, provider) (grande, probabile split)
- **Piano 11 — Moduli a tema** (formato dati Zod + import/export + 1 modulo curato)

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-15-loomn-fase1-piano7c-ai-master-pipeline.md`. Two execution options:**

**1. Subagent-Driven (consigliato)** — Setup orchestratore (dipendenza `@loomn/engine`), poi un subagent fresco per task (model sonnet), spec review + code-quality review per task (sonnet), final review dell'intero branch (opus), poi `finishing-a-development-branch` → merge locale in main. **Non far leggere il file di piano al subagent: incolla il testo completo del task + la disciplina di scope.** Branch dedicato `feat/fase1-piano7c-ai-master-pipeline`.

**2. Inline Execution** — esecuzione dei task in questa sessione con `executing-plans`, checkpoint di review fra i batch.

**Quale approccio?**
