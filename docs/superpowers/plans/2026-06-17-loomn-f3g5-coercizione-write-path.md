# F3/G5 — Coercizione strutturale sul write-path della Reflection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estendere la coercizione di tipo G1/G6 (numeri/array stringificati dall'LLM) anche al write-path della Reflection, così l'estrazione dei fatti riesce al livello function-call su modelli deboli invece di degradare a repair.

**Architecture:** Estrai gli helper coercivi (`coerceNumericString`/`llmNumber`/`llmArray`/`llmInt`) da `master-tools.ts` in un modulo condiviso `coercion.ts` di `@loomn/ai` (refactor behaviour-preserving), esportali dal barrel, poi riusali in `reflection-ports.ts` (`@loomn/host`): `llmArray` su `factsResultSchema.facts` e coercizione numerica su `importance`. `functional` (booleano) resta invariato (pattern mai osservato, YAGNI). Lo schema JSON mostrato al modello non cambia (il `preprocess` è trasparente a `zodToJsonSchema`).

**Tech Stack:** TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Zod 3.25 (`z.preprocess`), Vitest. Monorepo pnpm: pacchetti `@loomn/ai` e `@loomn/host`.

**Spec di riferimento:** `docs/superpowers/specs/2026-06-17-f3g5-coercizione-write-path-design.md`.

**Stato di partenza atteso:** `main` pulito, **422 test verdi**, typecheck pulito (6 progetti). Se i test SQLite falliscono con `NODE_MODULE_VERSION 146 ... requires 137` → `pnpm -r rebuild better-sqlite3` (HANDOFF §7-quinquies).

**Fuori ambito (tutto il piano):** qualità semantica dell'estrazione (G5b, già smussato da F4); `llmBool`/coercizione booleana; toccare `structured-output.ts`/`master-turn.ts`/`commandSchema`/`@loomn/shared`/`@loomn/engine`/`@loomn/memory`/`app/desktop`/migrazioni; ri-validazione empirica con LM Studio (follow-up opzionale, non blocca il merge). **MAI** toccare `package.json`/`tsconfig*`/`vitest.config` (house rule §5.1).

**Disciplina di scope (CRITICO, in ogni task):** ogni subagent modifica SOLO i file elencati nel suo task. Verifica `git status --short` prima di ogni commit. Niente apostrofi dentro le stringhe in apici singoli di `it('…')`/`describe('…')` (house rule §5.4): scrivi `l estrattore`, `c e`, non `l'estrattore`. Non far leggere questo file di piano al subagent: incolla il testo completo del task.

---

## File Structure

- **Create:** `packages/ai/src/coercion.ts` — modulo condiviso degli helper di rescue-di-stringificazione (G1/G6). Unica responsabilità: coercire numeri/array stringificati dall'LLM verso lo schema reale a valle, restando STRICT. Esporta `coerceNumericString`, `llmNumber`, `llmArray`, `llmInt`.
- **Modify:** `packages/ai/src/master-tools.ts` — rimuove le definizioni locali dei 4 helper, le re-importa da `./coercion`. `enumOrString` (vincolo-vocabolario, non rescue) **resta** qui. Comportamento invariato.
- **Modify:** `packages/ai/src/index.ts` — aggiunge `export * from './coercion';` al barrel.
- **Modify:** `packages/host/src/reflection-ports.ts` — importa `llmArray`/`coerceNumericString` da `@loomn/ai`; applica `llmArray` a `facts` e la coercizione numerica a `importance` (in `extractedFactSchema` e `sceneDraftSchema`).
- **Test:** `packages/host/src/reflection-ports.test.ts` — nuovi test di coercizione (positivi + strict). I 52 test esistenti di `packages/ai/src/master-tools.test.ts` sono la rete del refactor (NON si toccano).

---

## Task 1: Estrai gli helper coercivi in `@loomn/ai/coercion.ts` (refactor behaviour-preserving)

**Files:**
- Create: `packages/ai/src/coercion.ts`
- Modify: `packages/ai/src/master-tools.ts` (rimuove def locali helper, aggiunge import)
- Modify: `packages/ai/src/index.ts` (aggiunge re-export)

**Natura del task:** refactor puro, **nessun nuovo comportamento**. Non si scrive un nuovo test: i **52 test esistenti di `master-tools.test.ts` sono il test** e devono restare verdi (esercitano `llmArray`/`llmNumber`/`llmInt` attraverso le tool-call, inclusa la guardia di trasparenza di G6). Niente `coercion.test.ts` nuovo (duplicherebbe la copertura — YAGNI, spec §7).

- [ ] **Step 1: Crea `packages/ai/src/coercion.ts`** (helper spostati 1:1 da `master-tools.ts`, ora `export`)

```ts
// coercion.ts — politica di coercizione condivisa per gli argomenti emessi dagli LLM (G1/G6).
// Gli LLM stringificano di routine i numeri ("10") e gli array ("[{...}]"); questi helper
// coerciscono SOLO quelle due forme e restano STRICT: la stringa coerciuta viene passata allo
// schema reale a valle, che rifiuta tutto il resto (niente 0/array silenzioso). Estratti da
// master-tools.ts (tool-path) per essere riusati anche sul write-path della Reflection (F3/G5).
import { z } from 'zod';

// Coerce SOLO una stringa numerica trimmata a numero; lascia tutto il resto invariato (lo schema
// numerico a valle rifiuta vuoto/non-numerico/null/mancante). Politica condivisa da llmNumber e
// llmInt e dagli schemi che compongono coerceNumericString direttamente (es. importance del
// write-path): la regola vive in un solo posto (G1). Resta STRICT: niente 0/garbage silenzioso.
export function coerceNumericString(v: unknown): unknown {
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed === '') return v; // resta stringa -> lo schema numerico la rifiuta
    const n = Number(trimmed);
    return Number.isNaN(n) ? v : n; // numerica -> numero; non-numerica -> resta stringa (rifiutata)
  }
  return v; // number passa; null/undefined arrivano allo schema e sono rifiutati
}

// Gli LLM stringificano i numeri di routine ("defenseBase":"10") e cosi avevano bloccato il
// combattimento nella slice (finding G1). Coerciamo le stringhe numeriche a numero, ma restiamo
// STRICT: stringa vuota/whitespace/non-numerica/null/mancante e RIFIUTATA (niente 0 silenzioso).
// .finite() chiude anche "Infinity"/"-Infinity".
export const llmNumber = z.preprocess(coerceNumericString, z.number().finite());

// Gli LLM stringificano anche gli argomenti ARRAY ("participants":"[{...}]") e cosi avevano
// impedito l avvio dello scontro nella slice (finding G6) e degradato la Reflection (F3/G5).
// Coerciamo una stringa JSON-array ad array delegando poi allo schema reale, ma restiamo STRICT
// come llmNumber: una stringa non-JSON o un JSON che non e un array resta com e e lo schema array
// sottostante la rifiuta (niente array silenzioso). Il vincolo .min(1) vive nello schema avvolto.
export function llmArray<S extends z.ZodTypeAny>(schema: S) {
  return z.preprocess((v) => {
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed === '') return v; // resta stringa -> lo schema array la rifiuta
      try {
        return JSON.parse(trimmed) as unknown; // array -> validato; oggetto/numero -> rifiutato a valle
      } catch {
        return v; // non-JSON -> resta stringa (rifiutata)
      }
    }
    return v; // array passa; null/undefined arrivano allo schema e sono rifiutati
  }, schema);
}

// Coercivo-intero: gemello di llmNumber per i campi che DEVONO essere interi (count/sides dei
// dadi). z.number().int() rifiuta gia decimali, Infinity e NaN; .min(min) il sotto-minimo. Factory
// perche il minimo varia per campo e va dentro lo schema avvolto dal preprocess (un ZodEffects non
// concatena .int()).
export function llmInt(min: number) {
  return z.preprocess(coerceNumericString, z.number().int().min(min));
}
```

- [ ] **Step 2: In `packages/ai/src/master-tools.ts`, aggiungi l'import degli helper estratti**

Dopo la riga `import { parseJson } from './json-repair';` (riga 10), aggiungi:

```ts
import { llmNumber, llmArray, llmInt } from './coercion';
```

- [ ] **Step 3: In `packages/ai/src/master-tools.ts`, rimuovi le definizioni locali dei 4 helper**

Elimina il blocco che va dal commento `// Coerce SOLO una stringa numerica trimmata a numero; ...` (sopra `function coerceNumericString`) fino alla fine di `function llmInt(min: number) { ... }` inclusa (le definizioni di `coerceNumericString`, `llmNumber`, `llmArray`, `llmInt` con i loro commenti). **MANTIENI** il commento di sezione `// --- schemi degli argomenti (Zod) ---` e **MANTIENI** `enumOrString` (è un vincolo-vocabolario, non un rescue, e resta privato in questo file). Risultato: subito sotto il commento di sezione resta `enumOrString`, poi `const resourcePoolSchema = ...`. Le occorrenze di `llmNumber`/`llmArray`/`llmInt` nel resto del file ora puntano all'import dello Step 2.

- [ ] **Step 4: In `packages/ai/src/index.ts`, aggiungi il re-export del barrel**

Dopo `export * from './structured-output';` aggiungi:

```ts
export * from './coercion';
```

(`master-tools.ts` importa gli helper ma non li `export`a → `export * from './master-tools'` non li ri-esporta: nessuna collisione, gli helper escono dal barrel solo via `coercion`.)

- [ ] **Step 5: Verifica che i test esistenti di `@loomn/ai` restino verdi (rete del refactor)**

Run: `pnpm exec vitest run packages/ai/src/master-tools.test.ts`
Expected: **52 passed** (incluse le coercizioni G1/G6 e la guardia di trasparenza), 0 failed.

- [ ] **Step 6: Verifica suite completa + typecheck**

Run: `pnpm test`
Expected: **422 passed** (invariato: refactor behaviour-preserving).

Run: `pnpm -r typecheck`
Expected: pulito, 6 progetti.

- [ ] **Step 7: Verifica scope e committa**

Run: `git status --short`
Expected: SOLO `packages/ai/src/coercion.ts` (nuovo), `packages/ai/src/master-tools.ts`, `packages/ai/src/index.ts`. Nessun altro file (nessun `package.json`/`tsconfig`/`vitest.config`).

```bash
git add packages/ai/src/coercion.ts packages/ai/src/master-tools.ts packages/ai/src/index.ts
git commit -m "refactor(ai): estrai gli helper coercivi G1/G6 in coercion.ts condiviso"
```

---

## Task 2: Applica la coercizione al write-path della Reflection (`@loomn/host`)

**Files:**
- Modify: `packages/host/src/reflection-ports.ts`
- Test: `packages/host/src/reflection-ports.test.ts`

**Dipende da Task 1** (importa `llmArray`/`coerceNumericString` dal barrel `@loomn/ai`). TDD: prima i test che falliscono, poi l'implementazione.

- [ ] **Step 1: Scrivi i test che falliscono in `packages/host/src/reflection-ports.test.ts`**

Aggiungi questi 5 test. Il fake `fakeModel(streamEvents)` e l'import di `createStructuredOutput`/`createLlmFactExtractor`/`createLlmSummarizer` esistono già nel file (righe 1-27, 78-114). Aggiungi un nuovo blocco `describe` in fondo al file (prima della chiusura), e assicurati che `createStructuredOutput` sia tra gli import da `@loomn/ai` (lo è già, riga 3):

```ts
describe('coercizione del write-path (F3/G5)', () => {
  it('coerce facts stringificato (array JSON come stringa) e ritorna i fatti', async () => {
    // Il modello debole stringifica l array: facts arriva come stringa JSON, non come array.
    const args = JSON.stringify({
      facts: JSON.stringify([
        { subject: 'Krix', predicate: 'serve', object: 'Barone Vhalmar', functional: true, importance: 8 },
      ]),
    });
    const model = fakeModel([
      { type: 'tool-call', id: 't1', name: 'extract_facts', arguments: args },
      { type: 'finish', reason: 'tool_calls' },
    ]);
    const extractor = createLlmFactExtractor(createStructuredOutput(model));
    const facts = await extractor.extract({ events: sceneEvents, scope: 'sess-1' });
    expect(facts).toEqual([
      { subject: 'Krix', predicate: 'serve', object: 'Barone Vhalmar', functional: true, importance: 8 },
    ]);
  });

  it('coerce importance stringa numerica a intero nell estrazione', async () => {
    const args = JSON.stringify({
      facts: [{ subject: 'Krix', predicate: 'serve', object: 'Barone', functional: true, importance: '8' }],
    });
    const model = fakeModel([
      { type: 'tool-call', id: 't1', name: 'extract_facts', arguments: args },
      { type: 'finish', reason: 'tool_calls' },
    ]);
    const extractor = createLlmFactExtractor(createStructuredOutput(model));
    const facts = await extractor.extract({ events: sceneEvents, scope: 'sess-1' });
    expect(facts[0]?.importance).toBe(8);
  });

  it('coerce importance stringa numerica nel riassunto', async () => {
    const args = JSON.stringify({ text: 'Krix serve il Barone.', importance: '6' });
    const model = fakeModel([
      { type: 'tool-call', id: 't1', name: 'summarize_scene', arguments: args },
      { type: 'finish', reason: 'tool_calls' },
    ]);
    const summarizer = createLlmSummarizer(createStructuredOutput(model));
    const draft = await summarizer.summarize({ events: sceneEvents, scope: 'sess-1' });
    expect(draft).toEqual({ text: 'Krix serve il Barone.', importance: 6 });
  });

  it('rifiuta facts stringa non-JSON (niente array silenzioso): strict come G6', async () => {
    const args = JSON.stringify({ facts: 'non sono un array' });
    const model = fakeModel([
      { type: 'tool-call', id: 't1', name: 'extract_facts', arguments: args },
      { type: 'finish', reason: 'tool_calls' },
    ]);
    // strategies:[function-call] pinna il gate dello schema (niente fallback che maschera il rifiuto).
    const extractor = createLlmFactExtractor(createStructuredOutput(model, { strategies: ['function-call'] }));
    await expect(extractor.extract({ events: sceneEvents, scope: 'sess-1' })).rejects.toThrow();
  });

  it('rifiuta importance stringa non-numerica (niente intero silenzioso): strict come G1', async () => {
    const args = JSON.stringify({
      facts: [{ subject: 'Krix', predicate: 'serve', object: 'Barone', functional: true, importance: 'abc' }],
    });
    const model = fakeModel([
      { type: 'tool-call', id: 't1', name: 'extract_facts', arguments: args },
      { type: 'finish', reason: 'tool_calls' },
    ]);
    const extractor = createLlmFactExtractor(createStructuredOutput(model, { strategies: ['function-call'] }));
    await expect(extractor.extract({ events: sceneEvents, scope: 'sess-1' })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Esegui i nuovi test e verifica che FALLISCANO**

Run: `pnpm exec vitest run packages/host/src/reflection-ports.test.ts`
Expected: i 3 test positivi **FAIL** (lo schema attuale `facts: z.array(...)` rifiuta la stringa → `extract`/`summarize` lanciano `StructuredOutputError`; `importance: z.number()` rifiuta `"8"`). I 2 test strict potrebbero già passare (il rifiuto avviene comunque) — non è un problema: confermano che la strictness resta dopo il fix. I test pre-esistenti restano verdi.

- [ ] **Step 3: Implementa la coercizione in `packages/host/src/reflection-ports.ts`**

In cima al file, dopo `import { z } from 'zod';` (riga 6) aggiungi un import di valore (gli helper sono runtime, non type):

```ts
import { llmArray, coerceNumericString } from '@loomn/ai';
```

Poi modifica gli schemi. Sostituisci il blocco attuale:

```ts
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
```

con:

```ts
// importance: intero 1..10 coerciuto (G1, pattern numeri-come-stringhe). Una sola definizione,
// due usi (DRY). coerceNumericString resta STRICT: "abc"/vuoto/null -> rifiutato, niente 0 silenzioso.
const importanceSchema = z.preprocess(coerceNumericString, z.number().int().min(1).max(10));

const extractedFactSchema = z.object({
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.string().min(1),
  functional: z.boolean(), // boolean puro: i booleani-come-stringhe non sono mai stati osservati (YAGNI)
  importance: importanceSchema,
});

// facts: il modello debole lo stringifica ("[{...}]") -> llmArray lo JSON.parse-a prima di validare
// (G6 portato sul write-path, F3/G5). Strict: stringa-non-JSON / JSON-non-array -> rifiutato.
const factsResultSchema = z.object({ facts: llmArray(z.array(extractedFactSchema)) });

const sceneDraftSchema = z.object({
  text: z.string().min(1),
  importance: importanceSchema,
});
```

- [ ] **Step 4: Esegui i test e verifica che PASSINO**

Run: `pnpm exec vitest run packages/host/src/reflection-ports.test.ts`
Expected: **tutti verdi**, inclusi i 5 nuovi e i pre-esistenti (i due positivi con `importance` numerico restano verdi: `coerceNumericString` lascia passare un numero invariato).

- [ ] **Step 5: Verifica suite completa + typecheck**

Run: `pnpm test`
Expected: **427 passed** (422 + 5 nuovi).

Run: `pnpm -r typecheck`
Expected: pulito, 6 progetti.

- [ ] **Step 6: Verifica scope e committa**

Run: `git status --short`
Expected: SOLO `packages/host/src/reflection-ports.ts` e `packages/host/src/reflection-ports.test.ts`. Nessun altro file.

```bash
git add packages/host/src/reflection-ports.ts packages/host/src/reflection-ports.test.ts
git commit -m "feat(host): coercizione array/numero sul write-path della Reflection (F3/G5)"
```

---

## Self-Review (orchestratore)

**1. Spec coverage** (spec `2026-06-17-f3g5-coercizione-write-path-design.md`):
- §2 scope (A) + arch (ii): Task 1 (estrazione condivisa in `@loomn/ai`) + Task 2 (applicazione write-path). ✅
- §3 estrazione `coercion.ts` behaviour-preserving + barrel + `enumOrString` resta: Task 1 Step 1-4. ✅
- §4 `llmArray` su `facts` + `importanceSchema` su entrambi gli `importance` + `functional` invariato + schema JSON invariato: Task 2 Step 3. ✅
- §5(a) coercio importance, NON functional: Task 2 Step 3 (commento esplicito). ✅ §5(b) acceptance via unit-test: Task 2 Step 1-2; spike fuori-banda non nel piano. ✅
- §7 test: ai = 52 esistenti verdi (Task 1 Step 5), niente coercion.test.ts; host = 3 positivi + 2 strict (Task 2 Step 1); trasparenza ereditata (non re-testata). ✅
- §8 file (2 pacchetti, niente shared/engine/memory/structured-output/master-turn/UI/migrazioni): rispettato; verifica scope in entrambi i Step di commit. ✅
- §9 acceptance: coperta dai test positivi (coercizione) + strict (strictness) + suite verde + typecheck. ✅

**2. Placeholder scan:** nessun TBD/TODO/"add validation"/"similar to". Ogni step ha codice o comando completo con output atteso. ✅

**3. Type/nome consistency:** `coerceNumericString`/`llmNumber`/`llmArray`/`llmInt` identici fra Task 1 (definizione/export) e Task 2 (import/uso). `importanceSchema` definito e usato due volte in Task 2. `extract_facts`/`summarize_scene` corrispondono ai `schemaName` reali di `reflection-ports.ts`. Il conteggio test 422 → 422 (Task 1, refactor) → 427 (Task 2, +5) è coerente. ✅

**Nota di processo / lacune di scope:** Task 1 è un refactor cross-nessun-package (tutto in `@loomn/ai`) e behaviour-preserving → nessun ripple su altri pacchetti. Task 2 è additivo (nuovi campi coercivi + nuovi test) → la suite resta verde a ogni task. Nessuna lacuna di scope (lezione SP4/G3-G4): il taglio ai-poi-host non rompe test in pacchetti terzi (l'unico consumatore degli helper, oltre a master-tools, è host che li riceve in Task 2).

---

## Execution Handoff

Rito proporzionato (item piccolo, come G1/G6/F2): un implementer per task + spec-review + code-quality-review per task, poi **final review opus** dell'intero branch prima del merge. Branch dedicato `feat/f3g5-coercizione-write-path` (MAI su main). A fine branch: `superpowers:finishing-a-development-branch` → merge ff locale in main → `pnpm test` → cancella il branch → aggiorna HANDOFF (nuovo §0-…) + memoria.
