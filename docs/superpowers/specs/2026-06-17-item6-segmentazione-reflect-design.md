# Item 6 — segmentazione `reflect` per scena (design)

> **Data:** 2026-06-17 · **Tipo:** design/spec · **Traccia:** backlog pre-Piano 10 (item 6 di HANDOFF §0-quinquies, **ULTIMO**) · **Taglia:** media (engine/memory + wiring host).
> **Autorità:** spec di design `2026-06-15-simulatore-campagne-ai-design.md` (§6 memoria a strati, §6.1 Reflection write-path, §6.2 Context Assembler; ES solo nel contesto Campaign/World). Questo doc è subordinato a quello.
> **Lega a:** SP4 (`50c6060`, FSM di fase §5.5 — i `PhaseChanged` sono il *substrato dei confini di scena*, §0-undecies 4b) e Piano 8b (`runReflection`, l'attuale primitivo single-scene).

## 0. Contesto: il bug e perché ora si può risolvere bene

`reflect(scope)` (in `packages/host/src/campaign-service.ts`) carica **l'intero stream** e lo passa a `runReflection`, che calcola `from = min(seq)` / `to = max(seq)` sull'intero stream e conia id **deterministici globali**: `f-<from>-<to>-<i>` (fatti, PK di `canon_facts`) e `s-scene-<from>-<to>` (riassunto, PK di `summaries`). Una seconda `reflect` su un range sovrapposto → `UNIQUE constraint failed` (riprodotto nello spike, `findings-slice-llm.md` §4).

La radice non è la collisione in sé: è che `reflect` **non ha alcuna nozione di "cosa è già stato riflesso" né di "dove finisce una scena"**. Tratta sempre l'intero stream come un'unica scena. SP4 ha reso i `PhaseChanged` i confini di scena naturali → ora c'è il substrato per segmentare.

**Osservazione che alza l'asticella oltre il "non crashare":** segmentare per scena **corregge anche la granularità di L2**. Oggi un solo riassunto copre l'intero stream — semanticamente sbagliato per i summary `level:'scene'` (spec §6: scena → sessione → arco → campagna). Un riassunto per scena è il comportamento *corretto*, non solo l'antidoto alla collisione.

## 1. Decisione comportamentale: `reflect` = "rifletti tutto da dove ero rimasto"

`reflect(scope)` diventa **incrementale e idempotente-per-progresso**:
1. legge un **watermark** (fino a che `seq` lo stream è stato riflesso);
2. prende solo gli eventi `seq > watermark`;
3. li **segmenta in scene ai confini `PhaseChanged`**;
4. riflette ogni scena (range `[from,to]` per-scena → id globalmente unici → niente collisione);
5. **avanza il watermark** (per scena, vedi §4 — crash-safety).

**Scena aperta = flush (deciso con l'utente).** La coda dopo l'ultimo `PhaseChanged` (fase non ancora cambiata) **viene riflessa** come scena finale. Una chiamata = "rifletti tutto adesso". Conseguenze:
- Regge gli stream **senza alcun `PhaseChanged`** (sessione mono-fase, o lo scenario dello spike pre-SP4): una sola scena, mai collisione.
- Una fase continua spezzata su due `reflect` dà riassunti più granulari del "naturale" — **accettabile** e **senza overlap** grazie al watermark (la seconda chiamata parte da dove la prima si è fermata).

## 2. Decisione di persistenza: cursor esplicito (il fork che evita debiti)

Come si traccia il watermark? Tre opzioni soppesate:

- **(A) Cursor esplicito — SCELTO.** Una tabella-proiezione `reflection_cursor` (riga singleton) che registra il `seq` riflesso. Modella il *progresso di riflessione* come **stato di prima classe, disaccoppiato dalle proiezioni di contenuto**. Costo: una migrazione minuscola + uno store gemello di `canon-ledger`/`summary-store`. Robusto a qualunque evoluzione futura di L1.5/L2.
- **(B) Derivare da `summaries`** (`max(eventSeqTo)` dei summary di scena). Nessuna tabella nuova, ma **debito latente**: quando la roadmap introdurrà il *rollup L2* (scena→sessione→arco) e i riassunti di scena verranno compattati/ritirati, il watermark **regredisce** → ri-riflessione → collisione. Accoppia il controllo-di-flusso al contenuto. Scartato.
- **(C) Niente cursor: id unici-per-costruzione + skip idempotente** (ri-segmenta tutto lo stream, salta le scene il cui id summary esiste già). **Si auto-confuta**: la scena *aperta* cresce a ogni chiamata → non è mai "già fatta" → ri-riflessa con range crescente → fatti/summary orfani si accumulano. Per essere corretta serve comunque un cursor → collassa su A. Scartato.

*Decisione presa con l'utente ("la strada più professionale, modulare, priva di debiti e meno pigra").*

**Il cursor è SINGLETON (uno per stream), non per-scope.** Gli id `f-…`/`s-scene-…` sono **globali** (non prefissati dallo scope). Un cursor per-scope, cambiando l'etichetta di scope tra una sessione e l'altra, si resetterebbe a 0 → ri-riflessione di tutto lo stream sotto la nuova etichetta → collisione sugli id globali. Lo `scope` resta solo l'etichetta dei summary (campo `Summary.scope`). C'è **una sola frontiera di riflessione per stream**, coerente con lo spazio degli id. → **Gli id NON si toccano**: il watermark garantisce che nessun range venga mai ri-coperto, quindi restano unici così come sono (la logica deterministica collaudata di `runReflection` resta intatta).

## 3. Decisioni di layering (dichiarate — nessun debito nascosto)

- **Il watermark vive nello strato di proiezione `memory`, NON come evento di dominio.** La Reflection è write-path di memoria, **asincrono e fuori dal turno** (header di `reflection.ts`; ES solo nel contesto Campaign/World, spec). Un evento `ReflectionAdvanced` nello stream di dominio inquinerebbe il dominio con un concern di processo della memoria. Il cursor è una proiezione, coerente con `canon_facts`/`summaries` — tutte ricostruibili ri-riflettendo da `seq` 0.
- **Niente entità `Scene` di dominio.** SP4 ha già reso i `PhaseChanged` i confini di scena; introdurre una `Scene` separata duplicherebbe la sorgente di verità dei confini = debito di sync. Derivare dai `PhaseChanged` è il non-duplicato.
- **Blast radius contenuto a `memory` + `host`.** Tenendo `ReflectOutcome = {factCount, summarized}` (aggregato sulle scene), `@loomn/shared` (`ipc.ts`/`commandSchema`), `app/desktop`/UI, `@loomn/engine` e `@loomn/ai` **non si toccano**.

## 4. Decomposizione modulare (il "least lazy"): 3 responsabilità isolate

Invece di gonfiare `runReflection` con segmentazione + cursor, tre unità separate, ognuna testabile da sola.

### 4.1 `packages/memory/src/scene-segmentation.ts` — NUOVO (funzione pura foglia)

```ts
import type { StoredEvent } from '@loomn/engine';

/** Spezza una sequenza di eventi (in ordine di seq) in scene ai confini PhaseChanged.
 *  Regola: un PhaseChanged TERMINA la scena corrente (è l'ultimo evento di quella scena);
 *  l'evento successivo apre una scena nuova. La coda dopo l'ultimo PhaseChanged (fase non
 *  cambiata) e una scena APERTA e viene comunque restituita (flush, vedi spec §1).
 *  Niente PhaseChanged -> una sola scena (regge spike/sessione mono-fase). Input vuoto -> [].
 *  Le scene risultanti sono contigue e NON sovrapposte (gli id derivati restano unici). */
export function segmentScenes(events: StoredEvent[]): StoredEvent[][] {
  const scenes: StoredEvent[][] = [];
  let current: StoredEvent[] = [];
  for (const e of events) {
    current.push(e);
    if (e.event.type === 'PhaseChanged') {
      scenes.push(current);
      current = [];
    }
  }
  if (current.length > 0) scenes.push(current);
  return scenes;
}
```

Pura, deterministica, zero IO — come `phase.ts`/`difficulty.ts`. Dipende solo dai tipi evento di `@loomn/engine` (già dep di `memory`). Casi limite testati in isolamento: nessun `PhaseChanged`; `PhaseChanged` come ultimo evento (nessuna scena vuota in coda); più `PhaseChanged`; vuoto.

> *Nota su `EncounterStarted`/`EncounterEnded`:* `start_encounter` emette `EncounterStarted` **poi** `PhaseChanged(→combat)`; l'`EncounterStarted` cade quindi nella scena che chiude (l'esplorazione). È un'attribuzione meccanica innocua: l'estrattore ignora gli eventi meccanici (`EXTRACT_SYSTEM`), conta solo la prosa (`NarrationRecorded`). Nessun trattamento speciale (YAGNI).

### 4.2 `packages/memory/src/reflection-cursor.ts` — NUOVO (porta + impl SQLite)

```ts
export interface ReflectionCursor {
  /** seq fino a cui lo stream e stato riflesso (0 = niente ancora). */
  get(): number;
  /** Avanza il watermark al seq dato. */
  set(seq: number): void;
}
export function createReflectionCursor(db: BetterSQLite3Database): ReflectionCursor { /* ... */ }
```

Specchio esatto di `createCanonLedger`/`createSummaryStore` (handle Drizzle condiviso, lettura validata Zod come gli altri store). Riga singleton: `get()` legge la riga `id=0` (la migrazione la semina a 0, quindi è sempre presente → niente ramo "assente"); `set(seq)` fa `UPDATE`. Porta iniettabile → fake in-memory nei test dell'orchestratore.

### 4.3 `packages/memory/src/schema.ts` + migrazione `0004_reflection_cursor.sql` — NUOVO

```ts
// schema.ts — riga singleton: id sempre 0, una sola frontiera di riflessione per stream.
export const reflectionCursor = sqliteTable('reflection_cursor', {
  id: integer('id').primaryKey(),                          // sempre 0 (singleton)
  reflectedThroughSeq: integer('reflected_through_seq').notNull(),
});
```

```sql
-- migrations/0004_reflection_cursor.sql (scritta a mano, convenzione esistente)
CREATE TABLE `reflection_cursor` (
	`id` integer PRIMARY KEY NOT NULL,
	`reflected_through_seq` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `reflection_cursor` (`id`, `reflected_through_seq`) VALUES (0, 0);
```

Journal `meta/_journal.json` → 5ª entry (`idx:4`, `tag:"0004_reflection_cursor"`, `when:1750000000004`, congelato, coerente con la convenzione 0000–0003). drizzle-kit resta rimandato (§3-bis di HANDOFF): migrazione **a mano**.

> *Seed a 0 su DB esistente:* nessun DB persistito reale ha riflessioni (lo spike è throwaway; il self-test del 9c-ii non chiama `reflect`) → seminare a 0 è sicuro (una eventuale prima `reflect` parte da capo, comportamento corretto per un'installazione fresca).

### 4.4 `packages/memory/src/reflection.ts` — orchestratore `runScenesReflection` + reorder crash-safe di `runReflection`

**`runReflection` (primitivo single-scene) — riordino interno minimo, behaviour-preserving:** oggi fa `extract → scrivi fatti → summarize → scrivi summary`. Le due chiamate LLM (`extract`/`summarize`) sono `await` **separati da scritture**: se `summarize` fallisce *dopo* aver scritto i fatti, un retry collide sugli id dei fatti. Si **riordina** a `extract → summarize → (scrivi fatti + scrivi summary)`: entrambe le `await` prima di qualunque scrittura → la scena diventa **atomica contro il fallimento LLM** (il caso realistico). L'output è **identico** (stessi fatti, stesso summary, stessi id; lo snapshot di ricorrenza resta calcolato prima delle scritture) → i 6 test esistenti di `reflection.test.ts` restano verdi. È un raffinamento di robustezza, non una riscrittura: la logica di salienza/ricorrenza/supersede/id deterministici è invariata.

**`runScenesReflection` (NUOVO orchestratore):**

```ts
export interface ScenesReflectionDeps extends ReflectionDeps {
  cursor: ReflectionCursor;
}

/** Riflette tutte le scene non ancora riflesse (seq > cursor), segmentate ai confini di fase.
 *  Avanza il cursor DOPO ogni scena riuscita (crash-safety: un fallimento a meta lascia il
 *  cursor all'ultima scena committata -> il retry riprende da li, niente collisione). */
export async function runScenesReflection(
  deps: ScenesReflectionDeps,
  input: ReflectionInput,
): Promise<ReflectionResult[]> {
  const through = deps.cursor.get();
  const fresh = input.events.filter((e) => e.seq > through);
  const scenes = segmentScenes(fresh);
  const results: ReflectionResult[] = [];
  for (const scene of scenes) {
    const res = await runReflection(deps, { events: scene, scope: input.scope });
    results.push(res);
    deps.cursor.set(scene[scene.length - 1]!.seq); // avanza al seq finale della scena committata
  }
  return results;
}
```

- `deps` estende `ReflectionDeps` con `cursor` → il primitivo `runReflection` accetta comunque le `deps` più larghe (typing strutturale, ignora `cursor`). Nessun cambio alla firma di `runReflection`.
- **Cursor avanzato per scena** (non a fine pass): se la scena *N+1* fallisce, il cursor è all'ultima scena committata → retry riprende da `N+1`, le scene `≤N` non vengono ri-riflesse (niente collisione). Avanzare a fine pass sarebbe **sbagliato** (un fallimento ri-coprirebbe le scene già scritte).
- Nessun evento nuovo (`fresh` vuoto) → `scenes = []` → ritorna `[]` (no-op, niente scrittura, cursor invariato).
- **Ricorrenza cross-scena preservata:** ogni scena calcola il proprio snapshot di ricorrenza da `ledger.active()` al suo turno → un fatto che ricorre nella scena 2 vede il fatto della scena 1 già scritto → salienza più alta (comportamento *voluto* della salienza-per-ricorrenza).

`runReflection` resta esportato e usato come prima dai test single-scene; `runScenesReflection`, `segmentScenes`, `createReflectionCursor`, `ReflectionCursor`, `reflectionCursor` (schema) entrano nel barrel `index.ts`.

## 5. Cosa cambia — wiring `@loomn/host` (resta sottile)

- **`memory-system.ts`:** monta `createReflectionCursor(db)` sullo stesso handle; aggiunge `cursor: ReflectionCursor` a `MemorySystem`.
- **`reflection-ports.ts`:** `reflectionDepsFor(system, port)` aggiunge `cursor: system.cursor` → ora restituisce `ScenesReflectionDeps`.
- **`campaign-service.ts`:** `reflect(scope)` chiama `runScenesReflection` invece di `runReflection`; aggrega l'array di risultati in `ReflectOutcome`:
  - `factCount` = somma di `res.facts.length` su tutte le scene;
  - `summarized` = almeno una scena ha prodotto un summary (`res.summary !== null`).
  - **`ReflectOutcome` invariato** (`{factCount, summarized}`) → `ipc.ts` e l'handler di `app/desktop` **non si toccano**.

## 6. Fuori ambito (dichiarato — nessun debito silenzioso)

- **Atomicità intra-scena oltre il riordino LLM** (es. transazione DB che avvolge `record` fatti + `record` summary): il riordino di §4.4 chiude il caso realistico (fallimento LLM); un fallimento *sincrono* tra le scritture SQLite è catastrofico, non un caso di retry. Una transazione per-scena che avvolga entrambe le scritture è un raffinamento additivo, non necessario all'acceptance.
- **Filtro semantico delle scene** (saltare una scena "solo meccanica" senza prosa per non sprecare chiamate LLM su scene degeneri, es. due `PhaseChanged` consecutivi): è territorio F3/G5 (giudizio di contenuto), non strutturale. La segmentazione resta puramente strutturale; una scena meta-only produce un summary sottile (innocuo). Deferral.
- **Compattazione/rollup L2** (scena→sessione→arco→campagna) e la sua interazione col cursor: feature futura; il cursor esplicito (vs derivato) è scelto **proprio** per non accoppiarvisi (§2).
- **`sceneCount` nell'esito** (`ReflectOutcome`/IPC): additivo, non richiesto dall'acceptance; lo si aggiunge quando la UI (Piano 10) ne avrà bisogno, tenendo ora il contratto IPC invariato.
- **Re-nudge del prompt per-iterazione sui confini di fase** (deferral di SP4): non pertinente al write-path.

## 7. Strategia di test (TDD)

- **memory — `scene-segmentation.test.ts` (NUOVO):** funzione pura, casi isolati — nessun `PhaseChanged` → 1 scena; un `PhaseChanged` in mezzo → 2 scene contigue; `PhaseChanged` come ultimo evento → nessuna scena vuota in coda; due `PhaseChanged` consecutivi → scena intermedia mono-evento; input vuoto → `[]`. Asserire **contiguità + non-sovrapposizione** dei range.
- **memory — `reflection-cursor.test.ts` (NUOVO, su `openDatabase(':memory:')`):** `get()` di default = 0 (riga seminata); `set(n)` poi `get()` = `n`; idempotenza di `set` ripetuto.
- **memory — `reflection.test.ts` (esteso):** i 6 test esistenti di `runReflection` **restano verdi** (rete del riordino). Nuovi test di `runScenesReflection` con fake (extractor/summarizer/clock + **fake cursor in-memory**):
  - **acceptance centrale:** due `runScenesReflection` su uno stream che cresce (con un `PhaseChanged` in mezzo) → **nessuna collisione**; la seconda riflette solo le scene nuove.
  - segmentazione: uno stream con un `PhaseChanged` → due scene riflesse, due summary con range disgiunti.
  - flush scena aperta: stream senza `PhaseChanged` → una scena; seconda chiamata dopo nuovi eventi → seconda scena, niente collisione.
  - no-op: `fresh` vuoto → `[]`, niente scrittura, cursor invariato.
  - crash-safety: cursor avanzato per scena (un summarizer che lancia alla 2ª scena lascia la 1ª committata e il cursor alla 1ª → un retry non collide). *(test con fake che lancia in modo controllato.)*
- **host — `campaign-service.test.ts` / `reflection-ports.test.ts` (estesi):** `reflect` chiamato due volte (con eventi aggiunti tra le due, incluso un `PhaseChanged`) **non lancia** e aggrega `factCount`/`summarized` correttamente; `reflectionDepsFor` include il `cursor` del MemorySystem (giro reale su `createMemorySystem(':memory:')`).

## 8. File toccati (orientativo per il piano)

- `packages/memory/src/`: **nuovi** `scene-segmentation.ts`(+test), `reflection-cursor.ts`(+test); `reflection.ts` (+`runScenesReflection`, riordino di `runReflection`) + `reflection.test.ts`; `schema.ts` (tabella `reflectionCursor`); `index.ts` (re-export). **Nuova** migrazione `migrations/0004_reflection_cursor.sql` + `migrations/meta/_journal.json` (5ª entry).
- `packages/host/src/`: `memory-system.ts`(+test), `reflection-ports.ts`, `campaign-service.ts`(+test).
- **Due pacchetti** (`@loomn/memory` + `@loomn/host`). **Niente** modifiche a `@loomn/shared` (`ipc.ts`/`commandSchema`/`domain-schema`), `@loomn/engine`, `@loomn/ai`, `app/desktop`/UI. **MAI** toccare `package.json`/`tsconfig*`/`vitest.config` (house rule §5.1).

## 9. Acceptance

- Riflessioni ripetute su scene successive **non collidono** (`reflect` chiamato più volte, con eventi aggiunti tra l'una e l'altra: nessun `UNIQUE constraint failed`).
- `reflect` è **incrementale**: ogni chiamata riflette solo gli eventi oltre il watermark, segmentati per scena ai confini `PhaseChanged`; il watermark avanza (per scena) e persiste.
- Regge gli stream **senza `PhaseChanged`** (una sola scena) e la **scena aperta** (flush).
- **Crash-safety:** un fallimento a metà pass lascia le scene già committate + il cursor avanzato fino a esse → il retry riprende senza ri-riflettere né collidere.
- L1 invariato; L2 ottiene **un riassunto per scena** (granularità corretta) invece di uno per l'intero stream.
- `runReflection` resta behaviour-preserving (6 test verdi); blast radius confinato a `memory`+`host` (`ipc.ts`/`engine`/`ai`/`shared`/UI intatti); totale verde (427 + nuovi), typecheck pulito (6 progetti).
- Deferral dichiarati e assegnati (atomicità intra-scena oltre il riordino; filtro semantico scene; rollup L2; `sceneCount`). Nessun nuovo debito silenzioso.
