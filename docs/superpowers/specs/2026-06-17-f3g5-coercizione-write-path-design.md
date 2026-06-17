# F3/G5 — coercizione strutturale sul write-path della Reflection (design)

> **Data:** 2026-06-17 · **Tipo:** design/spec · **Traccia:** engine/AI (item 5 di HANDOFF §0-quinquies) · **Taglia:** piccola (≈ G6/F2).
> **Autorità:** spec di design `2026-06-15-simulatore-campagne-ai-design.md` (§6 memoria a strati, §6.1 Reflection write-path, §7 livelli di structured output). Questo doc è subordinato a quello.
> **Lega a:** G6 (`b9e3614`, coercizione array sul tool-path — qui se ne chiude il deferral sul write-path) e F4 (`9e143aa`, la storia entra in canone + `EXTRACT_SYSTEM` raffinato).

## 0. Contesto: cos'è F3/G5 e cosa resta dopo F4

La slice di validazione con LLM reale (`findings-slice-llm.md`) ha trovato due frizioni sulla **Reflection** (il write-path della memoria, spec §6.1): l'estrazione dei fatti canonici (`createLlmFactExtractor`) e il riassunto di scena (`createLlmSummarizer`) in `packages/host/src/reflection-ports.ts`, costruiti sopra lo `StructuredOutputPort` di 7b.

- **F3** (L1.5 inquinato da statistiche meccaniche già in L1) è **già chiuso da F4**: la riscrittura di `EXTRACT_SYSTEM` istruisce di estrarre solo fatti narrativi ed escludere lo stato meccanico (hp/attributi/danni/singoli tiri). La ri-validazione post-G1 lo conferma (terne pulite, non più blob meccanici).
- **G5** (qualità dell'estrazione su modelli deboli) resta. La ri-validazione post-G1 ha confermato **un solo fallimento ancora vivo**: il modello debole emette `facts` come **array JSON stringificato** (`"facts": "[{...}]"`) → la strategia function-call fallisce con `facts: Expected array, received string` → ripiega su repair (degrado morbido). È **lo stesso vizio di G6** (`participants` stringificato sul tool-path), ma la coercizione `llmArray` di G6 fu applicata **deliberatamente solo al tool-path**, lasciando il write-path scoperto (deferral dichiarato in HANDOFF §0-sexies).

Questo spec chiude quel buco. È un intervento di **robustezza strutturale**, non di correttezza: niente si rompe oggi (la Reflection degrada a repair, non crasha), ma su un modello locale debole la qualità della memoria ne soffre — proprio dove non c'è il fallback di un modello cloud forte.

## 1. Diagnosi: perché i 3 livelli di 7b non bastano sul write-path

Lo `StructuredOutputPort` (7b) ha 3 livelli (function-call → constrained `json_schema` → parse+repair+retry, vedi `structured-output.ts`). Nessuno copre il fallimento osservato, perché sono progettati per *altri* problemi:

- **Livello 1 (function-call):** `z.array()` rifiuta `Expected array, received string` (JSON **valido del tipo sbagliato**) → cade.
- **Livello 2 (constrained `json_schema`):** *forzerebbe* un array vero, ma solo se il server locale impone davvero la grammatica per il modello debole (provider-dipendente, non garantito su LM Studio + modello piccolo).
- **Livello 3 (repair):** `jsonrepair` (`json-repair.ts`) aggiusta la **sintassi**, non i **tipi**: non de-stringifica un array annidato. "Riesce" a fare il parse ma il valore resta una stringa → rifiutato a valle, o peggio degradato.

**Il punto:** i 3 livelli danno *robustezza sintattica* + *fallback di capacità del provider*. NON danno *coercizione di tipo* — è ciò che fanno gli helper G1/G6 (`llmNumber`/`llmArray`), che però vivono **solo sul tool-path**. Il write-path ne è privo. Il fix è portarli anche lì.

(La qualità *semantica* — es. il vecchio blob `object: "forza {...}"` — è un terzo problema, di prompt/modello, **non** di tipo; è già stato smussato da F4 ed è esplicitamente fuori scope, §6.)

## 2. Decisione: scope (A) + architettura (ii)

**Scope (A) — solo strutturale.** Si chiude il fallimento empiricamente-vivo (la coercizione array sul write-path) così il function-call *riesce* invece di degradare. La qualità semantica resta follow-up tracciato (§6). Scartati: (B) prompt-tuning semantico (bounded, soft, non verificabile in CI → over-engineering); (C) modello più forte per il write-path (contraddice l'acceptance "estrazione robusta su un modello locale debole"). *Decisione presa con l'utente.*

**Architettura (ii) — helper coercivi condivisi in `@loomn/ai`.** Gli helper `coerceNumericString`/`llmNumber`/`llmArray`/`llmInt` sono oggi **privati dentro `master-tools.ts`** (in `@loomn/ai`). Il write-path è in `reflection-ports.ts` (in `@loomn/host`, che già dipende da `@loomn/ai`). Tre modi valutati:

- **(i) duplicare `llmArray` in `host`** → due copie di un helper collaudato, debito di drift. Scartato.
- **(ii) estrarre gli helper in un modulo condiviso di `@loomn/ai`**, esportarli dal barrel, riusarli su entrambi i path → un solo posto, un solo collaudo; chiude il deferral di G6 in modo pulito. **Scelto.**
- **(iii) cuocere la coercizione dentro lo `StructuredOutputPort`** → lo Port riceve uno `z.ZodType<T>` arbitrario, dovrebbe fare coercizione ricorsiva generica = magia che viola "lo schema è il gate" (G1/G6: coercizione *opt-in* per campo, mai automatica). Scartato.

*Decisione presa con l'utente.*

## 3. Cosa cambia — estrazione condivisa (`@loomn/ai`)

**Nuovo modulo `packages/ai/src/coercion.ts`**: gli helper di **rescue-di-stringificazione** spostati **1:1** da `master-tools.ts` (behaviour-preserving, stessi commenti/politica):

```ts
// coercion.ts — politica di coercizione condivisa per gli argomenti LLM (G1/G6).
// Gli LLM stringificano di routine numeri ("10") e array ("[{...}]"); questi helper
// coerciscono SOLO quelle due forme, restando STRICT (niente 0/array silenzioso):
// la stringa coerciuta passa allo schema reale a valle, che rifiuta tutto il resto.
export function coerceNumericString(v: unknown): unknown { /* invariato da master-tools */ }
export const llmNumber = z.preprocess(coerceNumericString, z.number().finite());
export function llmArray<S extends z.ZodTypeAny>(schema: S) { /* invariato */ }
export function llmInt(min: number) { /* invariato */ }
```

- `master-tools.ts` **rimuove le definizioni locali** e re-importa da `./coercion` (o dal barrel). Comportamento invariato → i **52 test esistenti di `master-tools` sono la rete del refactor**.
- `enumOrString` **resta** in `master-tools.ts`: è un vincolo-vocabolario (G3/G4), non un rescue-di-stringificazione, e il write-path non ne ha bisogno. Confine concettuale netto: `coercion.ts` = "raddrizza ciò che l'LLM stringifica", non "vincola al vocabolario".
- `packages/ai/src/index.ts` (barrel) re-esporta `coercion.ts`.

## 4. Cosa cambia — applicazione al write-path (`@loomn/host/reflection-ports.ts`)

```ts
import { llmArray, coerceNumericString } from '@loomn/ai';

// importance: numero 1..10 coerciuto (pattern G1). Una sola definizione, due usi (DRY).
const importanceSchema = z.preprocess(coerceNumericString, z.number().int().min(1).max(10));

const extractedFactSchema = z.object({
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.string().min(1),
  functional: z.boolean(),        // INVARIATO — vedi §5(a)
  importance: importanceSchema,   // era z.number().int().min(1).max(10)
});

const factsResultSchema = z.object({
  facts: llmArray(z.array(extractedFactSchema)),  // era z.array(...) — fix G5a
});

const sceneDraftSchema = z.object({
  text: z.string().min(1),
  importance: importanceSchema,   // stesso pattern, simmetria
});
```

- **`facts`**: `z.array(...)` → `llmArray(z.array(extractedFactSchema))`. Una stringa JSON-array (`"[{...}]"`) viene `JSON.parse`-ata e poi validata dallo schema array reale; il function-call ora riesce. STRICT: stringa-non-JSON / vuota / JSON-non-array (oggetto/numero/null) → rifiutata dallo schema array sottostante (niente array silenzioso).
- **`importance`** (in entrambi gli schemi): coercizione numerica via `coerceNumericString` condiviso. STRICT: `"abc"`/vuoto/null → rifiutato (niente intero silenzioso); fuori `[1,10]` → rifiutato.
- **Lo schema JSON mostrato al modello resta invariato** (`{type:array}` / `{type:integer}`): il `preprocess` è trasparente a `zodToJsonSchema` (usa lo schema di OUTPUT). Non advertizziamo che le stringhe vanno bene — è solo rete di sicurezza, filosofia G1/G6. La trasparenza di `llmArray`/`z.preprocess` è già pinnata da una guardia dedicata in `master-tools.test.ts` (G6); poiché il write-path riusa l'helper **identico** (estratto in `coercion.ts`), la proprietà è **ereditata** → niente test host ridondante né nuova dipendenza `zod-to-json-schema` su `@loomn/host`.

## 5. I due giudizi (decisi con l'utente — "hardening solo su rami reali / YAGNI")

- **(a) Coercizione scalare selettiva.** Si coercia `importance` (numeri-come-stringhe = pattern G1 **osservato**, helper già collaudato) ma **NON** `functional: z.boolean()`. Booleani-come-stringhe (`"true"`) è un **terzo pattern senza alcuna evidenza empirica** sul write-path → niente nuovo helper `llmBool`. Si coerciscono i due pattern visti (array via `llmArray`, numeri via `coerceNumericString`); si rimanda quello mai osservato. Deferral dichiarato (§6).
- **(b) Acceptance via unit-test, spike opzionale.** Il fix si pinna con **test unit** che alimentano gli schemi con le forme malformate (come G1/G6/F2). La **ri-validazione empirica con LM Studio** (harness su `spike/slice-llm`) resta **opzionale/fuori-banda** (serve il server attivo, non gira in CI, ballerina da riprodurre) → follow-up, non blocco al merge.

## 6. Fuori ambito (dichiarato — nessun debito silenzioso)

- **G5b — qualità semantica dell'estrazione** (blob nei campi, terne mal-comprese): problema di prompt/modello, **già smussato da F4** (`EXTRACT_SYSTEM`). Resta follow-up tracciato; lo si aggredirebbe con few-shot o un modello più capace, non con la coercizione di tipo.
- **`llmBool` / coercizione booleana** (§5a): nessuna evidenza empirica → YAGNI. Additivo se mai osservato.
- **Forzare/riordinare il constrained-decoding (`json_schema`) per la Reflection:** inutile se la coercizione fa riuscire il livello function-call; l'ordine `function → json → repair` resta il fallback invariato. Nessun tocco a `structured-output.ts`.
- **Modello più forte per il write-path** (scope C): scartato, contraddice l'acceptance.
- **Coercizione dei campi stringa** (`subject`/`predicate`/`object`/`text`): sono stringhe, nessuna stringificazione possibile, nessuna coercizione necessaria.

## 7. Strategia di test (TDD)

- **ai** — refactor behaviour-preserving: i **52 test esistenti di `master-tools.test.ts` restano verdi** (rete del refactor; esercitano già `llmArray`/`llmNumber`/`llmInt` *e* la guardia di trasparenza di G6 — ora puntano agli helper estratti). **Niente nuovo `coercion.test.ts`**: duplicherebbe la copertura esistente (YAGNI). La disciplina di scope vieta di toccare i test non pertinenti.
- **host** (`reflection-ports.test.ts`, con fake `StructuredOutputPort`/`LanguageModel`, via `createStructuredOutput` reale):
  - `facts` come stringa JSON-array → coerciuto, l'estrattore restituisce i fatti (prima: function-call falliva → repair).
  - `importance` come stringa `"8"` → coerciuto a `8` (in `extract` e in `summarize`).
  - **strict** (con `strategies:['function-call']` per pinnare il gate dello schema): `facts` stringa-non-JSON → rifiutato; `importance` `"abc"` → rifiutato (niente array/intero silenzioso).
  - *(La trasparenza dello schema JSON è ereditata dalla guardia ai, vedi §4 — non re-testata in host per non aggiungere una dipendenza.)*

## 8. File toccati (orientativo per il piano)

- `packages/ai/src/`: **nuovo** `coercion.ts` (+ eventuale `coercion.test.ts`), `master-tools.ts` (rimuove def locali, re-importa), `index.ts` (re-export).
- `packages/host/src/`: `reflection-ports.ts`, `reflection-ports.test.ts`.
- **Due pacchetti** (`@loomn/ai` + `@loomn/host`). **Niente** modifiche a `@loomn/shared`, `@loomn/engine`, `@loomn/memory`, `structured-output.ts`, `master-turn.ts`, `commandSchema`, `app/desktop`/UI, migrazioni. **MAI** toccare `package.json`/`tsconfig*`/`vitest.config` (house rule §5.1).

## 9. Acceptance

- Sul write-path della Reflection, un `facts` stringificato (`"[{...}]"`) viene coerciuto e validato: il function-call riesce invece di degradare a repair.
- Un `importance` stringa numerica viene coerciuto; le forme garbage (stringa non-numerica/vuota, array non-JSON, JSON non-array) restano **rifiutate** (niente valore silenzioso) — la strictness G1/G6 è preservata e test-guarded.
- Lo schema JSON mostrato al modello è invariato (coercizione solo come rete di sicurezza).
- Il refactor di estrazione in `@loomn/ai` è behaviour-preserving (52 test master-tools verdi); il totale resta verde (422 + nuovi), typecheck pulito (6 progetti).
- Deferral dichiarati e assegnati (G5b semantico → follow-up F4-adiacente; `llmBool` → additivo; ri-validazione spike → fuori-banda opzionale). Nessun nuovo debito silenzioso.
