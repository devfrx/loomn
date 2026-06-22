# Fase 3 — Pipeline AI (`packages/ai`) · Remediation d'audit · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chiudere a causa radice, debt-free, i 3 finding d'audit della pipeline AI — I‑04 (turno muto senza fallback né diagnostica), I‑07‑tool (dadi proposti dall'AI senza tetto), M‑04 (`buildTools` ricostruito a ogni chiamata) — e rimuovere il tool `next_round` reso ridondante dall'auto-avanzamento del round (I‑01, Fase 1).

**Architecture:** Quattro task TDD additivi, tutti dentro `packages/ai` (ABI Node, nessun DB nativo, nessun gate Electron). La filosofia del progetto guida ogni fix: *il codice è l'arbitro, l'AI è il narratore.* La difesa autorevole sui dadi vive nel motore (`assertDieGroup`, Fase 1); qui aggiungiamo la **barriera lato AI** (argomenti tool non fidati) e tre robustezze: nessun turno resta muto, nessun lavoro puro ripetuto, nessun tool che può solo fallire.

**Tech Stack:** TypeScript strict (`exactOptionalPropertyTypes`/`noUncheckedIndexedAccess`), Zod 3.25, `zod-to-json-schema`, Vitest. Pacchetto `@loomn/ai` (dipende da `@loomn/engine`, NON da `@loomn/shared` né `@loomn/memory`).

---

## Contesto e vincoli (leggere prima di iniziare)

**Stato di partenza:** `main` @ `26ba72e` (doc), ultimo codice `7928bc6` (F2). Fase 1 (`582fb7a`, 719 test) e Fase 2 (`fe14646`, **742 test**) fatte e mergiate. Baseline `packages/ai` = **104 test** (`pnpm exec vitest run packages/ai`). Il piano-campagna è `docs/superpowers/plans/2026-06-19-loomn-remediation-campaign.md` (sezione "F3 — Pipeline AI"); le schede d'audit sono in `docs/superpowers/audits/2026-06-19-loomn-audit-findings.md` (I‑04 Important, I‑07 tool-schema, M‑04 Minor).

**Scope (NON negoziabile):** SOLO `packages/ai/src/`. **MAI** toccare `engine`/`shared`/`memory`/`host`/`app`/`desktop`/`renderer`, **MAI** `package.json`/`tsconfig*`/`vitest.config*`, **MAI** il gate Electron (entra in F4). Ogni task elenca i file esatti; verifica `git status --short` prima di ogni commit.

**Vincolo debt-free (LEZIONE F1/F2, riconfermata):** i bound (`.int()`/`.min()`/`.max()`) vanno SOLO sugli **schemi degli argomenti tool** (input non fidato dall'AID — `master-tools.ts`/`coercion.ts`). MAI su uno schema o percorso di **lettura** (rifiuterebbe dati storici al replay/load). In F3 non esiste alcun read-path: `coercion.ts`/`master-tools.ts` validano esclusivamente le tool-call dell'LLM. La difesa autorevole resta `assertDieGroup` nel motore (F1).

**Decisioni di design (bloccate; default robusti — nessuna domanda all'utente):**
1. **I‑04 — TraceEvent diagnostico:** si **riusa `kind:'error'`** della union `TraceEvent` esistente (NESSUNA estensione della union → `tracing.ts` resta foglia, coerente con come `decide`/SSE errors sono già tracciati). Il `message` riporta `iterazioni` + `azioni risolte` + `max`. Avallato esplicitamente dall'audit ("`kind:'error'`") e dal piano-campagna ("kind dedicato o `kind:'error'`").
2. **I‑04 — narrazione di fallback:** **deterministica** (niente RNG/Date), **non vuota**, **player-facing e neutra**. Il dettaglio diagnostico (conteggi/azioni) vive nel TraceEvent, non nella prosa (separazione: trace = diagnosi, narrazione = giocatore). Testo derivato dal numero di azioni risolte (sober summary) o messaggio neutro se zero azioni.
3. **I‑04 — trigger:** dopo il loop, `narration.trim().length === 0`. È il **sintomo reale** (nessuna narrazione → `NarrationRecorded` saltato a valle → giocatore nel vuoto) e copre ENTRAMBI i casi muti: (a) cap di iterazioni esaurito con tool-call a ogni giro, (b) modello che restituisce zero tool-call e testo vuoto/whitespace.
4. **I‑07‑tool — forma:** estendere `llmInt(min, max?)` con `.max()` opzionale (retro-compatibile: `llmInt(min)` invariato). `dieGroupArgSchema` usa `llmInt(1, MAX_DICE_COUNT)`/`llmInt(2, MAX_DICE_SIDES)` importando le **costanti del motore** (`MAX_DICE_COUNT=100`, `MAX_DICE_SIDES=1000`, già esportate dal barrel `@loomn/engine`) → la barriera AI rispecchia l'arbitro, single-source, niente magic number. Il `maximum` finisce nel JSON schema mostrato al modello: è un vincolo legittimo (a differenza della coercizione, che NON advertizziamo).
5. **M‑04 — memoizzazione:** `WeakMap<Vocabulary, Record<string,ToolEntry>>` (chiave = oggetto `Vocabulary` dato-only; niente leak, GC quando il vocab è irraggiungibile). Behaviour-preserving: stesso `Vocabulary` → stesso registro; vocaboli diversi → registri diversi. Test osservabile **senza allargare l'API**: `masterToolDefs(...)[i].parameters` è la STESSA referenza di `t.jsonSchema` → memoizzato ⟹ referenza stabile, non memoizzato ⟹ ricostruita.
6. **next_round (flag cross-fase da F1):** **RIMOSSO** come tool AI. Post-F1 `decide(EndTurn)` auto-emette `[TurnEnded, RoundAdvanced]` quando il turno chiude il round (`commands.ts:140-146`) → il round non resta MAI in stato "completo"; `decide(NextRound)` esige `roundComplete===true` (`commands.ts:153-156`) → nella FSM normale post-F1 **non si verifica mai** → una tool-call AI `next_round` può solo essere rifiutata dal motore (iterazione sprecata). Coerente con "il motore possiede la FSM" (decisione I‑01): l'avanzamento di round è meccanica del motore, non un giudizio narrativo dell'AI. Il **Command** `NextRound`, il `commandSchema`, i drift guard e il **bottone GM "Round successivo"** restano intatti (il bottone è concern di **F6**; l'escape-hatch umano per eventuali campagne pre-F1 bloccate in `roundComplete` resta disponibile). Rimozione confinata a `packages/ai`.

**Flag cross-fase:**
- **GESTITO in F3:** `next_round` tool (Task 2).
- **NON toccare in F3** (restano per le loro fasi): self-test versione 7→8 (**F4**), `ipc.ts` `salience`/`importance` senza `.finite()` sui read-DTO host→renderer (**F4**), bottone "Round successivo" ridondante (**F6**).
- **Nuovi flag emersi in F3:** annotarli qui e nell'HANDOFF, NON implementarli.

**Casa (house rules §5):** TS strict (spread condizionali, no `campo: undefined`); niente over-engineering (hardening solo su rami reali); **bug apostrofo**: le stringhe `it('...')`/`describe('...')` in apici singoli NON devono contenere apostrofi (`l'`, `un'`, `c'è`) — scrivi `l AI`, `c e`; `è/é` vanno bene. Le stringhe di codice non-test (narrazione, prompt) possono avere apostrofi ma il codebase le evita per stile: niente apostrofi anche lì.

---

## Mappa dei file

| File | Responsabilità | Task |
|---|---|---|
| `packages/ai/src/coercion.ts` | Helper coercivi tool-path. `llmInt(min, max?)` guadagna `.max()` opzionale. | 1 |
| `packages/ai/src/master-tools.ts` | Registro tool. `dieGroupArgSchema` bound (T1); rimozione `next_round` (T2); memoizzazione registro (T3). | 1, 2, 3 |
| `packages/ai/src/master-turn.ts` | Ciclo agentico. `PHASE_GUIDANCE` combat senza `next_round` (T2); fallback narrazione + TraceEvent post-loop (T4). | 2, 4 |
| `packages/ai/src/master-tools.test.ts` | Test del registro (T1, T2, T3). | 1, 2, 3 |
| `packages/ai/src/master-turn.test.ts` | Test del ciclo (T4). | 4 |

`tracing.ts` NON cambia (si riusa `kind:'error'`). Il barrel `index.ts` NON cambia (nessun nuovo export).

---

### Task 1: I‑07‑tool — barriera dadi lato AI (`llmInt` con tetto + bound da motore)

**Finding:** I‑07 (tool-schema) — `ai/coercion.ts:52-54`, `ai/master-tools.ts:43-46`. Un `count` allucinato (es. `1e8`) supera oggi lo schema tool (`llmInt(1)`/`llmInt(2)` hanno solo `.min()`) e diventa un comando che SOLO il motore ferma. Barriera lato AI: bound `[1..100]`/`[2..1000]` (mirror di `assertDieGroup`) → argomenti non validi reiniettati, non un freeze.

**Files:**
- Modify: `packages/ai/src/coercion.ts:52-54`
- Modify: `packages/ai/src/master-tools.ts:7-8` (import), `:43-46` (`dieGroupArgSchema`)
- Test: `packages/ai/src/master-tools.test.ts` (describe `resolveToolCall apply_effect`)

- [ ] **Step 1: Scrivi i test che falliscono**

In `master-tools.test.ts`, dentro `describe('resolveToolCall apply_effect', ...)`, aggiungi due nuovi test (dopo `rifiuta sides sotto il minimo`):

```ts
  it('rifiuta count oltre il massimo (count allucinato 1e8)', () => {
    const r = resolveToolCall(
      'apply_effect',
      '{"targetId":"pc1","resource":"hp","direction":"restore","dice":[{"count":100000000,"sides":6}]}',
      VOCAB,
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('count');
  });

  it('rifiuta sides oltre il massimo', () => {
    const r = resolveToolCall(
      'apply_effect',
      '{"targetId":"pc1","resource":"hp","direction":"restore","dice":[{"count":1,"sides":100000000}]}',
      VOCAB,
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('sides');
  });
```

E **sostituisci** il test esistente `mostra dice come array di interi e direction come enum nello schema (coercizione trasparente)` con questa versione estesa (aggiunge `maximum` al tipo e alle asserzioni):

```ts
  it('mostra dice come array di interi e direction come enum nello schema (coercizione trasparente)', () => {
    const ae = masterToolDefs('exploration', VOCAB).find((d) => d.name === 'apply_effect');
    if (ae === undefined) throw new Error('atteso apply_effect');
    const props = (ae.parameters as {
      properties: Record<string, {
        type?: string;
        enum?: string[];
        minItems?: number;
        items?: { properties?: Record<string, { type?: string; minimum?: number; maximum?: number }> };
      }>;
    }).properties;
    expect(props.dice?.type).toBe('array');
    expect(props.dice?.minItems).toBe(1);
    expect(props.direction?.enum).toEqual(['restore', 'drain']);
    const item = props.dice?.items?.properties;
    expect(item?.count?.type).toBe('integer');
    expect(item?.count?.minimum).toBe(1);
    expect(item?.count?.maximum).toBe(100);
    expect(item?.sides?.type).toBe('integer');
    expect(item?.sides?.minimum).toBe(2);
    expect(item?.sides?.maximum).toBe(1000);
  });
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `pnpm exec vitest run packages/ai/src/master-tools.test.ts`
Atteso: FAIL — i due nuovi test passano `r.ok === true` (oggi `count`/`sides` enormi sono accettati); il test esteso fallisce su `item?.count?.maximum` (oggi `undefined`, atteso `100`).

- [ ] **Step 3: Estendi `llmInt` con `.max()` opzionale**

In `coercion.ts`, sostituisci la funzione `llmInt` (righe ~52-54):

```ts
// Coercivo-intero: gemello di llmNumber per i campi che DEVONO essere interi (count/sides dei
// dadi). z.number().int() rifiuta gia decimali, Infinity e NaN; .min(min) il sotto-minimo;
// .max(max) il sopra-massimo (opzionale: la barriera dadi lato AI rispecchia assertDieGroup del
// motore). Factory perche min/max variano per campo e vanno dentro lo schema avvolto dal
// preprocess (un ZodEffects non concatena .int()/.max()).
export function llmInt(min: number, max?: number) {
  const bounded = max !== undefined ? z.number().int().min(min).max(max) : z.number().int().min(min);
  return z.preprocess(coerceNumericString, bounded);
}
```

- [ ] **Step 4: Applica i bound del motore a `dieGroupArgSchema`**

In `master-tools.ts`, estendi l'import da `@loomn/engine` (riga ~8) aggiungendo `MAX_DICE_COUNT, MAX_DICE_SIDES`:

```ts
import { DIFFICULTIES, MAX_DICE_COUNT, MAX_DICE_SIDES, QUEST_OUTCOMES, SOFT_PHASES, isCommandLegalInPhase } from '@loomn/engine';
```

E sostituisci `dieGroupArgSchema` (righe ~43-46):

```ts
const dieGroupArgSchema = z.object({
  count: llmInt(1, MAX_DICE_COUNT), // intero 1..100: mirror della barriera AI su assertDieGroup del motore
  sides: llmInt(2, MAX_DICE_SIDES), // intero 2..1000: idem (un count/sides allucinato e ARGOMENTI NON VALIDI, non un freeze)
});
```

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `pnpm exec vitest run packages/ai/src/master-tools.test.ts`
Atteso: PASS (tutti). I bound `count`/`sides` oltre il tetto sono rifiutati; il JSON schema espone `maximum: 100`/`maximum: 1000`.

- [ ] **Step 6: Typecheck e commit**

Run: `pnpm -C packages/ai typecheck`
Atteso: nessun errore.
Run: `git status --short` (solo `coercion.ts`, `master-tools.ts`, `master-tools.test.ts`).

```bash
git add packages/ai/src/coercion.ts packages/ai/src/master-tools.ts packages/ai/src/master-tools.test.ts
git commit -m "fix(ai): barriera dadi lato AI [I-07-tool] — llmInt(min,max) con tetto, dieGroupArgSchema usa MAX_DICE_COUNT/SIDES del motore"
```

**Conteggio test atteso (cumulativo):** `packages/ai` 104 → **106** (+2 nuovi; il test dello schema è modificato, non aggiunto).

**Fuori ambito Task 1:** nessuna modifica a `llmNumber`/`llmArray`; nessun bound su altri campi numerici (gli altri restano `llmNumber` come da contratto); nessun read-path toccato (non esiste in `ai`).

---

### Task 2: Rimozione del tool `next_round` (flag cross-fase F1)

**Motivazione:** vedi Contesto, decisione 6. Post-F1 il motore avanza il round automaticamente; il tool `next_round` può solo produrre un rifiuto del motore. Lo rimuoviamo dalla superficie AI (Command/schema/bottone GM restano). Rimozione confinata a `packages/ai`.

**Files:**
- Modify: `packages/ai/src/master-tools.ts` (rimozione `nextRoundSchema` ~riga 60 e voce `next_round` ~righe 219-221)
- Modify: `packages/ai/src/master-turn.ts:41` (`PHASE_GUIDANCE.combat`)
- Test: `packages/ai/src/master-tools.test.ts` (describe `masterToolDefs`)

- [ ] **Step 1: Aggiorna/aggiungi i test (RED)**

In `master-tools.test.ts`, **sostituisci** il primo test del describe `masterToolDefs` (`in combat espone i 9 strumenti...`) con la versione a 8 strumenti, senza `next_round`:

```ts
  it('in combat espone gli 8 strumenti di combat con schemi JSON inline (niente ref)', () => {
    const defs = masterToolDefs('combat', VOCAB);
    const names = defs.map((d) => d.name).sort();
    expect(names).toEqual([
      'advance_quest', 'apply_effect', 'attack', 'end_encounter', 'end_turn',
      'request_check', 'spawn_npc', 'start_quest',
    ]);
    for (const d of defs) {
      expect(typeof d.description).toBe('string');
      expect((d.parameters as { type?: string }).type).toBe('object');
      expect(JSON.stringify(d.parameters)).not.toContain('$ref');
    }
  });
```

Aggiungi (nello stesso describe `masterToolDefs`) un test esplicito di assenza; estendi l'import di testa del file aggiungendo `PHASES`:

```ts
import { createVocabulary, PHASES } from '@loomn/engine';
```

```ts
  it('next_round non e piu esposto come strumento in nessuna fase (il motore avanza il round)', () => {
    for (const phase of PHASES) {
      expect(masterToolDefs(phase, VOCAB).map((d) => d.name)).not.toContain('next_round');
    }
    const r = resolveToolCall('next_round', '{}', VOCAB);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('sconosciuto');
  });
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `pnpm exec vitest run packages/ai/src/master-tools.test.ts`
Atteso: FAIL — la lista combat contiene ancora `next_round` (9 elementi); `resolveToolCall('next_round', ...)` oggi risolve `ok:true`.

- [ ] **Step 3: Rimuovi il tool `next_round`**

In `master-tools.ts`:
- Elimina la riga `const nextRoundSchema = z.object({});` (~riga 60). Lascia `const endTurnSchema = z.object({});` (resta usato da `end_turn`).
- Elimina la voce dal registro in `buildTools` (~righe 219-221):

```ts
    next_round: makeEntry('Avanza al round successivo dello scontro attivo.', 'NextRound', nextRoundSchema, () => ({
      type: 'NextRound',
    })),
```

(Lascia invariate tutte le altre voci, incluse `end_turn` e `end_encounter`.)

- [ ] **Step 4: Aggiorna la guida di fase combat**

In `master-turn.ts`, sostituisci la riga `combat` di `PHASE_GUIDANCE` (~riga 41):

```ts
  combat: 'Fase: combattimento. Sii tattico e conciso; usa attack/end_turn e chiudi con end_encounter quando lo scontro e risolto. Il motore avanza il round automaticamente quando tutti hanno agito.',
```

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `pnpm exec vitest run packages/ai`
Atteso: PASS (tutti, inclusi `master-turn.test.ts` — il flusso combat dei test usa `start_encounter`→`attack`→testo, non `next_round`).

- [ ] **Step 6: Typecheck e commit**

Run: `pnpm -C packages/ai typecheck`
Atteso: nessun errore (il Command `NextRound` resta nel motore: `makeEntry` non è più chiamato con `'NextRound'`, ma il tipo `Command` lo contiene ancora — nessun problema di esaustività).
Run: `git status --short` (solo `master-tools.ts`, `master-turn.ts`, `master-tools.test.ts`).

```bash
git add packages/ai/src/master-tools.ts packages/ai/src/master-turn.ts packages/ai/src/master-tools.test.ts
git commit -m "fix(ai): rimuovi il tool next_round ridondante [flag F1] — il motore auto-avanza il round (I-01); Command/commandSchema/bottone GM intatti"
```

**Conteggio test atteso (cumulativo):** `packages/ai` 106 → **107** (+1 nuovo; la lista combat è modificata, non aggiunta).

**Fuori ambito Task 2:** NON toccare il Command `NextRound`, `commandSchema`, i drift guard, né il bottone GM "Round successivo" (renderer, flag F6). NON toccare `COMBAT_ONLY`/`isCommandLegalInPhase` nel motore.

---

### Task 3: M‑04 — memoizzazione del registro tool per identità del `Vocabulary`

**Finding:** M‑04 — `master-tools.ts:109-260`. `buildTools(vocab)` (con `zodToJsonSchema` su ~10 schemi) è chiamato da `masterToolDefs` (per-iterazione) E `resolveToolCall` (per-call): in un turno ~`6 + 6·N` ricostruzioni, lavoro puro gettato via. Memoizziamo per identità del `Vocabulary` (dato-only stabile per ruleset).

**Files:**
- Modify: `packages/ai/src/master-tools.ts` (cache + `getTools`; `masterToolDefs`/`resolveToolCall` la usano)
- Test: `packages/ai/src/master-tools.test.ts` (nuovo describe)

- [ ] **Step 1: Scrivi i test che falliscono (RED)**

In `master-tools.test.ts`, aggiungi un nuovo describe in fondo:

```ts
// M-04: buildTools (zodToJsonSchema su ~10 schemi) e chiamato da masterToolDefs E resolveToolCall.
// Memoizzato per identita del Vocabulary: stesso vocab -> stesso registro (e quindi la STESSA
// referenza di jsonSchema, osservabile da parameters); vocaboli diversi -> registri distinti.
describe('memoizzazione del registro tool (M-04)', () => {
  it('stesso Vocabulary: lo schema JSON e la stessa referenza tra chiamate (registro memoizzato)', () => {
    const a = masterToolDefs('combat', VOCAB).find((d) => d.name === 'attack');
    const b = masterToolDefs('combat', VOCAB).find((d) => d.name === 'attack');
    expect(a?.parameters).toBe(b?.parameters); // stessa referenza => buildTools NON ri-eseguito
  });

  it('Vocabulary diversi: schemi JSON con referenze distinte (cache miss -> rebuild)', () => {
    const other = createVocabulary({ attributes: ['mente'], skills: ['logica'], resources: ['psiche'], defenses: ['guardia'] });
    const a = masterToolDefs('combat', VOCAB).find((d) => d.name === 'attack');
    const b = masterToolDefs('combat', other).find((d) => d.name === 'attack');
    expect(a?.parameters).not.toBe(b?.parameters);
  });

  it('behaviour-preserving: stesso output per valore e resolveToolCall continua a funzionare', () => {
    expect(masterToolDefs('combat', VOCAB)).toEqual(masterToolDefs('combat', VOCAB));
    const r = resolveToolCall('end_turn', '{}', VOCAB);
    expect(r).toEqual({ ok: true, toolName: 'end_turn', command: { type: 'EndTurn' } });
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `pnpm exec vitest run packages/ai/src/master-tools.test.ts`
Atteso: FAIL sul primo test (`a?.parameters` ≠ `b?.parameters` oggi, perché `buildTools` ricostruisce un nuovo `jsonSchema` a ogni chiamata). Il secondo e il terzo già passano (referenze diverse / output uguale per valore) — restano come guardie.

- [ ] **Step 3: Aggiungi la cache memoizzata e instradaci `masterToolDefs`/`resolveToolCall`**

In `master-tools.ts`, dopo la definizione di `buildTools` (subito prima di `export type ToolResolution`), aggiungi:

```ts
// M-04: buildTools ricostruisce l intero registro (zodToJsonSchema su ~10 schemi) a ogni chiamata,
// mentre masterToolDefs (per-iterazione) e resolveToolCall (per-call) lo invocano di continuo. Il
// Vocabulary e dato-only stabile per ruleset -> memoizziamo il registro per identita del Vocabulary.
// WeakMap: nessun leak (GC del registro quando il vocab e irraggiungibile). Behaviour-preserving:
// stesso Vocabulary -> stesso registro; vocaboli diversi -> cache miss -> rebuild. buildTools resta puro.
const toolRegistryCache = new WeakMap<Vocabulary, Record<string, ToolEntry>>();

function getTools(vocab: Vocabulary): Record<string, ToolEntry> {
  let tools = toolRegistryCache.get(vocab);
  if (tools === undefined) {
    tools = buildTools(vocab);
    toolRegistryCache.set(vocab, tools);
  }
  return tools;
}
```

In `masterToolDefs`, sostituisci `const tools = buildTools(vocabulary);` con `const tools = getTools(vocabulary);`.
In `resolveToolCall`, sostituisci `const tools = buildTools(vocabulary);` con `const tools = getTools(vocabulary);`.

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `pnpm exec vitest run packages/ai/src/master-tools.test.ts`
Atteso: PASS (tutti).

- [ ] **Step 5: Typecheck e commit**

Run: `pnpm -C packages/ai typecheck`
Atteso: nessun errore (`Vocabulary` è un'interfaccia oggetto → chiave WeakMap valida).
Run: `git status --short` (solo `master-tools.ts`, `master-tools.test.ts`).

```bash
git add packages/ai/src/master-tools.ts packages/ai/src/master-tools.test.ts
git commit -m "perf(ai): memoizza il registro tool per identita del Vocabulary [M-04] — WeakMap, behaviour-preserving"
```

**Conteggio test atteso (cumulativo):** `packages/ai` 107 → **110** (+3).

**Fuori ambito Task 3:** nessun nuovo export dal modulo (il barrel fa `export * from './master-tools'`: NON esporre `getTools`/`toolRegistryCache`/`ToolEntry`). La memoizzazione è interna; il test la osserva via `parameters` (referenza di `jsonSchema`), non via API.

---

### Task 4: I‑04 — narrazione di fallback + TraceEvent diagnostico al turno muto

**Finding:** I‑04 (Important) — `master-turn.ts:102-153`, `tracing.ts`. Se il loop cade in fondo (cap esaurito) o il modello non narra né agisce, `narration` resta `''` e nessun TraceEvent terminale: a valle `campaign-service.runTurn` salta `NarrationRecorded` ma persiste gli eventi meccanici → giocatore nel vuoto, stato mutato, zero tracciabilità. Fix additivo: dopo il loop, se nessuna narrazione → TraceEvent diagnostico (`kind:'error'`) + narrazione di fallback deterministica non vuota.

**Files:**
- Modify: `packages/ai/src/master-turn.ts` (helper `fallbackNarration`; `iter` fuori dal loop; blocco post-loop)
- Test: `packages/ai/src/master-turn.test.ts` (nuovo describe)

- [ ] **Step 1: Scrivi i test che falliscono (RED)**

In `master-turn.test.ts`, aggiungi un nuovo describe in fondo al file:

```ts
describe('I-04: turno senza narrazione (fallback + diagnostica)', () => {
  it('maxIterations esaurito: narrazione di fallback non vuota e TraceEvent diagnostico', async () => {
    const tracer = createRecordingTracer();
    // Il modello chiama un tool valido a OGNI iterazione e non narra mai -> esaurisce il cap.
    const model = fakeModel(() => toolCall('request_check', '{"actorId":"pc1","difficulty":"easy"}'));
    const res = await runMasterTurn({
      model, rng: createSeededRandom(1), ruleset: TURN_RULESET, state: baseState,
      playerAction: 'Continuo a tentare.', tracer, maxIterations: 3,
    });
    expect(res.invocations.length).toBe(3); // ha risolto azioni a ogni iterazione
    expect(res.narration.trim().length).toBeGreaterThan(0); // niente vuoto per il giocatore
    expect(tracer.events.some((e) => e.kind === 'error' && e.message.includes('fallback'))).toBe(true);
  });

  it('modello che non narra ne agisce: fallback non vuoto e diagnostica', async () => {
    const tracer = createRecordingTracer();
    const model = fakeModel(() => text('')); // zero tool-call e testo vuoto
    const res = await runMasterTurn({
      model, rng: createSeededRandom(1), ruleset: TURN_RULESET, state: baseState,
      playerAction: 'Resto in silenzio.', tracer,
    });
    expect(res.invocations).toEqual([]);
    expect(res.narration.trim().length).toBeGreaterThan(0);
    expect(tracer.events.some((e) => e.kind === 'error')).toBe(true);
  });

  it('quando il modello narra: nessun fallback ne TraceEvent error (nessuna regressione)', async () => {
    const tracer = createRecordingTracer();
    const model = fakeModel(() => text('Il sole tramonta sulle rovine.'));
    const res = await runMasterTurn({
      model, rng: createSeededRandom(1), ruleset: TURN_RULESET, state: baseState,
      playerAction: 'Mi guardo intorno.', tracer,
    });
    expect(res.narration).toBe('Il sole tramonta sulle rovine.');
    expect(tracer.events.some((e) => e.kind === 'error')).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `pnpm exec vitest run packages/ai/src/master-turn.test.ts`
Atteso: FAIL sui primi due (oggi `res.narration === ''` → `trim().length` è 0, e nessun TraceEvent `error`). Il terzo (no-regressione) già passa — resta come guardia.

- [ ] **Step 3: Aggiungi l'helper di fallback**

In `master-turn.ts`, aggiungi dopo `summarizeCalls` (prima di `runMasterTurn`):

```ts
/** Narrazione di fallback DETERMINISTICA (niente RNG/Date) per quando il turno termina senza
 *  prosa: cap di iterazioni esaurito, oppure il modello non narra ne agisce (I-04). Non vuota: a
 *  valle NarrationRecorded viene persistito e il giocatore non resta nel vuoto. Neutra e
 *  player-facing; il dettaglio diagnostico (conteggi) vive nel TraceEvent, non qui. */
function fallbackNarration(invocations: ToolInvocation[]): string {
  if (invocations.length === 0) {
    return 'Il Master non ha prodotto una narrazione per questo turno. Riprova o riformula la tua azione.';
  }
  const n = invocations.length;
  const noun = n === 1 ? 'azione' : 'azioni';
  return `Il Master ha risolto ${n} ${noun} ma non ha concluso con una narrazione. Gli effetti restano validi; prosegui pure.`;
}
```

- [ ] **Step 4: Porta `iter` fuori dal loop e aggiungi il blocco post-loop**

In `runMasterTurn`, cambia l'intestazione del loop da:

```ts
  for (let iter = 0; iter < maxIterations; iter++) {
```

a:

```ts
  let iter = 0;
  for (; iter < maxIterations; iter++) {
```

(Il corpo del loop resta identico.) Poi, **subito prima** di `return { state, events, narration, invocations, transcript: messages };`, inserisci:

```ts
  if (narration.trim().length === 0) {
    // I-04: il turno e terminato senza narrazione (cap esaurito o modello muto). Diagnostica
    // RUMOROSA (il bug non sparisce in silenzio) + fallback non vuoto (il giocatore non resta nel
    // vuoto e NarrationRecorded viene persistito a valle). Additivo: non tocca gli eventi meccanici.
    tracer.record({
      kind: 'error',
      message: `runMasterTurn: nessuna narrazione dopo ${iter} iterazioni (max ${maxIterations}), ${invocations.length} azioni risolte; applicata narrazione di fallback`,
    });
    narration = fallbackNarration(invocations);
  }
```

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `pnpm exec vitest run packages/ai`
Atteso: PASS (tutti, inclusi i test esistenti di `runMasterTurn` che asseriscono narrazioni non vuote — il fallback NON scatta quando c'è prosa).

- [ ] **Step 6: Typecheck e commit**

Run: `pnpm -C packages/ai typecheck`
Atteso: nessun errore.
Run: `git status --short` (solo `master-turn.ts`, `master-turn.test.ts`).

```bash
git add packages/ai/src/master-turn.ts packages/ai/src/master-turn.test.ts
git commit -m "fix(ai): turno muto -> narrazione di fallback deterministica + TraceEvent diagnostico [I-04]"
```

**Conteggio test atteso (cumulativo):** `packages/ai` 110 → **113** (+3).

**Fuori ambito Task 4:** NON estendere la union `TraceEvent` (si riusa `kind:'error'`); NON toccare `campaign-service` (host, fuori scope — il fix è additivo a monte e a valle `NarrationRecorded` verrà persistito perché `narration.length > 0`); NON cambiare la firma di `MasterTurnResult`.

---

## Verifica finale di fase

- [ ] `pnpm exec vitest run packages/ai` → **verde, ~113 test** (104 baseline + 9).
- [ ] `pnpm -C packages/ai typecheck` → pulito.
- [ ] `git status --short` → solo file in `packages/ai/src/` toccati.
- [ ] NESSUN gate Electron in F3 (entra in F4).
- [ ] `pnpm test` (full, ABI Node) verde solo al passo `finishing-a-development-branch` (merge): atteso **742 → ~751**. ⚠️ Se i test SQLite (memory/host) falliscono con `NODE_MODULE_VERSION 146 ... requires 137`, la nativa è rimasta su ABI Electron → `pnpm rebuild:node` (vedi HANDOFF §6/§9; se EBUSY/EPERM, chiudi i processi Loomn con `Get-CimInstance ... -match 'tabl|loomn'` e rebuild).

---

## Self-review (piano vs spec/campagna)

**1. Copertura dei finding F3:**
- I‑04 (turno muto) → **Task 4** (fallback deterministico non vuoto + `kind:'error'`). ✅
- I‑07 (tool-schema dadi) → **Task 1** (`llmInt(min,max)` + `dieGroupArgSchema` con `MAX_DICE_COUNT/SIDES`). ✅
- M‑04 (`buildTools` non memoizzato) → **Task 3** (WeakMap, behaviour-preserving). ✅
- Flag F1 `next_round` → **Task 2** (rimosso, con motivazione e blast-radius confinato). ✅

**2. Scan placeholder:** nessun TBD/TODO; ogni step di codice mostra il codice completo; comandi con output atteso. ✅

**3. Consistenza dei tipi/nomi:** `llmInt(min, max?)` (T1) usato da `dieGroupArgSchema` (T1); `getTools`/`toolRegistryCache` (T3) coerenti; `fallbackNarration(invocations: ToolInvocation[])` usa il tipo `ToolInvocation` già esportato; `iter` dichiarato fuori dal loop (T4) e referenziato nel blocco post-loop. `MAX_DICE_COUNT`/`MAX_DICE_SIDES` importati dal barrel `@loomn/engine` (verificato: `export * from './dice'`). `PHASES` importato in `master-tools.test.ts` (T2). ✅

**4. Vincolo debt-free:** tutti i bound (`.max()`) vivono su schemi di argomento tool (input AI non fidato); zero read-path in `ai`; `tracing.ts` non esteso; nessun file `engine`/`shared`/`memory`/`host` toccato. ✅

**5. Scope discipline:** ogni task elenca i file esatti, tutti in `packages/ai/src/`; nessun `package.json`/`tsconfig`/`vitest.config`; nessun gate Electron. ✅

---

## Flag cross-fase (stato dopo F3)

- **GESTITO in F3:** `next_round` tool rimosso (Task 2).
- **APERTI per le fasi successive (NON toccati in F3):**
  - self-test versione attesa 7→8 → **F4**.
  - `ipc.ts` `canonFactSchema.salience` / `summarySchema.importance`+`salience` senza `.finite()` (read-DTO host→renderer) → **F4**.
  - bottone "Round successivo" ridondante (renderer) → **F6**.
- **Nuovi flag da F3:** *(da compilare in esecuzione se emergono; default atteso: nessuno.)*

---

## Execution Handoff

Flusso §4 (HANDOFF): branch dedicato `fix/remediation-f3-ai` (MAI su `main`) → per ogni task: **implementer** (testo completo del task, NON fargli leggere questo file) → **spec-review** (verifica leggendo i file e rieseguendo i test) → **code-quality-review** (dopo spec ✅). Hardening solo su rami reali, verifica empirica del feedback. **Final review opus** dell'intero branch (BASE = punto di branch, HEAD = ultimo commit). Poi `superpowers:finishing-a-development-branch`: merge ff in `main` → `pnpm test` (full, ABI Node, verde) → `git push origin main` → cancella il branch. Aggiorna HANDOFF + memoria (F3 fatto, conteggio test, prossimo = F4). Poi **FERMATI** prima di F4 per il check dell'utente.
