# Loomn — Findings: slice giocabile (validazione memoria+AI con LLM reale)

> **Data:** 2026-06-16 · **Branch:** `spike/slice-llm` · **Traccia B** (rafforzamento, doc `2026-06-16-rafforzamento-ci-validazione.md`).
> Spike di **validazione**, non codice di produzione. Substrato: **LM Studio** locale. Output = questo documento.
> Run valido: **`meta-llama-3.1-8b-instruct`** (3 turni reali + Reflection). Vedi anche §Substrato per il percorso (gemma bloccato).

## Metodo

- **Driver:** test Vitest guardato (`LOOMN_SPIKE=1`) in `packages/host/src/slice-llm.spike.test.ts` + harness riusabile `packages/host/src/slice-harness.ts`. Pilota `createCampaignService` su **DB SQLite reale** (file temp), con provider OpenAI-compat reale (`createLanguageProvider`) verso LM Studio e RNG seedato `createSeededRandom(1)`. Una **spia** avvolge il `LanguageModel` (cattura prompt inviato + stream emesso); un **recording tracer** registra request/response/validation-failure/error. Stesso wiring dell'app del 9c-ii, ma su ABI Node (niente Electron).
- **Scenario:** seed deterministico del PG Eldra (hp 20/20) via `dispatch`; 3 `runTurn` (spawn PNG → attacco → fatto narrato); `reflect('scena-1')`; snapshot memoria; seconda `reflect` (follow-up noto).

## Esito in una riga

Con un modello dal template tool sano (**Llama-3.1-8B**), il path completo — il Master propone tool → l'engine valida/risolve → la memoria riflette/assembla — **gira end-to-end**, e il principio "il codice è l'arbitro" **regge sotto stress**. Emergono frizioni concrete e azionabili su (a) coercizione degli argomenti, (b) vocabolario di gioco assente dal contesto, (c) **la memoria che ricorda le statistiche ma dimentica la storia**.

## Cosa è stato VALIDATO ✅

1. **Tool-calling end-to-end (Piano 7c).** Il modello propone tool-call → l'adapter le emette intere → `resolveToolCall` valida con Zod → `decide` consuma l'RNG seedato e produce gli Event reali → reiniezione come messaggio utente → il modello narra. La pipeline agentica è sana e completa.
2. **Il "codice è l'arbitro" REGGE sotto stress (la prova più importante).** Ogni guardrail ha scattato sui dati reali del modello:
   - spawn duplicato di `npc-krix` → `decide` rifiuta (`Attore già presente: npc-krix`), nessun Event;
   - `attack` con `defenseBase` stringa o campi vuoti → Zod rifiuta, nessun Event;
   - l'AI non ha **mai** mutato lo stato direttamente — solo Command validati → Event.
3. **Memoria write→read con LLM vero.** `reflect('scena-1')` → `factCount=8, summarized=true`; il Context Assembler ha poi ricomposto L1 (3 attori) + L1.5 (8 fatti, filtrati ai soggetti in scena) + L2 (riassunto) **entro budget**.
4. **Follow-up noto riprodotto.** Seconda `reflect('scena-1')` → `UNIQUE constraint failed: canon_facts.id` (collisione id deterministici).

## Findings azionabili (l'output di valore)

- **G1 — `defenseBase` stringa-vs-numero (alto valore, fix cheap).** Il modello emette i numeri come **stringhe** (`"defenseBase": "10"`) e **continua a sbagliarlo** anche dopo 3 reinjection dell'errore Zod (`Expected number, received string`). Questo ha **bloccato l'intero combattimento** (turno 2: nessun attacco risolto). *Fix:* rendere **coercivi** gli schemi degli argomenti tool in `master-tools.ts` (`z.coerce.number()` per i campi numerici) — gli LLM stringificano di routine. Cheap, ad alto ritorno, primo candidato della traccia engine/ai.
- **G2 — il modello ri-propone azioni già riuscite.** Dopo aver creato `npc-krix` con successo, alle iterazioni successive lo **ricrea** (rifiutato dall'engine), sprecando giri. Il messaggio di reinjection (`Narra questi esiti oppure proponi altre azioni`) invita a ri-proporre. *Fix:* il loop/prompt deve segnalare chiaramente che l'azione è **conclusa** (narra, a meno di un'azione NUOVA).
- **G3 — il modello inventa identificatori di gioco inesistenti.** `damageResource: "danno fisico"`/`"ferita"`/`"danno"`, `skill: "spada"`/`"colpo veloce"`, `defense: "difesa"` — **nessuno** esiste nell'engine; anche con un `defenseBase` numerico l'attacco fallirebbe a `adjustResource` ("risorsa ignota"). *Implicazione:* il contesto (o lo schema dei tool) deve **esporre/vincolare il vocabolario valido** (risorse/skill/defense effettivi degli attori in scena), altrimenti l'AI allucina gli identificatori. Lega alla traccia engine e a Piano 11 (i moduli definiscono il vocabolario di stat).
- **G4 — `spawn_npc` lascia inventare attributi/risorse a piacere.** Krix è nato con `attributes:{intelligenza}`, `skills:{negoziazione}`, `resources:{" oro"}` (**con uno spazio iniziale nel nome chiave!**) e **senza `hp`** → non combattibile. *Implicazione:* o `spawn_npc` applica un set di risorse di default (es. `hp`), o il modulo/mondo definisce lo schema di stat (Piano 11). Serve anche igiene sulle chiavi (trim).
- **G5 — qualità di estrazione della Reflection scadente con questo modello.** I fatti escono **malformati**: il campo `object` contiene blob (`pc-eldra ha forza {"importance": 8, "value": 3}`) invece di un valore pulito; la strategia `function-call` fallisce (`facts: Expected array, received string`) e ripiega su `repair`. *Implicazione:* schema/prompt di estrazione più robusti, o un modello più forte per la Reflection (è un compito structured-output, non solo tool).

## I due finding STRUTTURALI (i più importanti per il prodotto)

- **F3 — L1.5 inquinato da meccanica (riconfermato, forte).** Gli 8 fatti canonici sono **tutti** statistiche già presenti in L1 (`pc-eldra ha forza 3`, `... ha hp 20`, `npc-baronevhalmar ha intelligenza 15`, …). L1.5 dovrebbe contenere fatti **narrativi** che l'engine non traccia (relazioni, segreti, luoghi), non statistiche già in L1. *Fix:* raffinare `EXTRACT_SYSTEM` (in `reflection-ports.ts`) per escludere lo stato meccanico già in L1.
- **F4 — la memoria ricorda le STATISTICHE e DIMENTICA la STORIA (IL finding centrale).** La Reflection consuma **solo gli `Event`** (`renderEventsForReflection` serializza i `DomainEvent`), **mai la narrazione**. Risultato concreto di questo run: la scena ha narrato l'offerta losca di Krix, l'attacco fallito, Krix che **serve il Barone Vhalmar**, la supplica — e **niente** di tutto questo è entrato in canone (L1.5) o nel riassunto (L2). Ciò che è entrato sono solo le statistiche degli `ActorAdded`. Anche il riassunto L2 è una recitazione meccanica del seed (`...forza di 3, destrezza di 2...`), non un riassunto narrativo. Per un simulatore **narrativo** è rovesciato. *Fix di design (da decidere prima del Piano 10):* (a) dare anche la **narrazione** in pasto alla Reflection, e/o (b) un nuovo `Command`/tool **`record_fact`** perché il Master promuova esplicitamente i fatti narrativi a canone (lega alla traccia engine). Nota: in questo run il Barone *è* entrato in canone solo perché il modello l'ha reso un `ActorAdded` (`spawn_npc`) — non perché narrato.

## Substrato e robustezza dell'adapter

Il run valido è stato preceduto da un'indagine sul substrato che ha prodotto due findings a sé:

- **F1 — template tool del GGUF (bloccante, lato modello).** `gemma-4-26b-a4b-it-qat` (e `gemma-4-12b-qat`) falliscono **ogni** richiesta con `tools` via OpenAI-compat: `Error rendering prompt with jinja template: "Cannot call something that is not a function"`. Deterministico e **indipendente dal client**. *Mitigazione:* modello con template tool corretto (Llama-3.1, Qwen2.5, build `lmstudio-community`) o override del Prompt Template. **Niente da cambiare in Loomn.** Il flag LM Studio "trained for tool use" riguarda l'addestramento del modello, non se *questa build* sappia renderizzare i tool.
- **F2 — robustezza adapter (reale, azionabile).** In streaming l'adapter (`openai-adapter.ts`) controlla solo `res.ok` (HTTP). LM Studio segnala l'errore Jinja con **HTTP 200 + SSE `event: error`**; `parseSse` ignora il campo `event:` e il payload `{error:...}` passa `chunkSchema.safeParse` (z.object non-strict) → `continue` → **stream vuoto silenzioso** che `runMasterTurn` legge come "nessuna tool-call → narra" → turno vuoto senza diagnostica. *Raccomandazione:* riconoscere un frame SSE di errore (o un `data:` con `error` top-level) e sollevarlo come `LanguageModelError`/trace `error`. **Conferma esterna:** il progetto sibling `alice` (`C:\Users\zagor\Desktop\omnia\backend\services\llm_service.py`) usa lo **stesso** path OpenAI-compat+`tools` e implementa **esattamente** questo (`if "error" in chunk` → emette errore), col commento che cita le "Jinja template rendering failures in LM Studio". Inoltre conferma la nostra scelta architetturale: alice manda i tool **solo** sull'endpoint OpenAI-compat (l'API nativa LM Studio `/api/v1/chat` la usa solo per i turni *senza* tool).

## Raccomandazioni / prossimi passi (per priorità)

1. **G1 — schemi tool coercivi** (`z.coerce.number()` in `master-tools.ts`): cheap, sblocca il combattimento. Primo candidato di un piccolo intervento di hardening AI.
2. **F4 — come la STORIA entra in canone**: la decisione di design più importante per il prodotto (narration→Reflection e/o tool `record_fact`). Da affrontare con la **traccia engine** e prima del Piano 10.
3. **F2 — adapter rileva gli errori SSE** (corroborato da alice): follow-up piccolo per `@loomn/ai`.
4. **G3/G4 — vocabolario di gioco nel contesto + combat-readiness di `spawn_npc`**: lega alla traccia engine e a Piano 11.
5. **F3/G5 — qualità di estrazione L1.5** (prompt più robusto; L1.5 narrativo non meccanico).

## Note di metodo

Lo spike (harness + test guardato) vive sul branch `spike/slice-llm`, è **throwaway**: non tocca manifest/config né la suite (`pnpm test` resta **266 verdi, +1 skip**). Su `main` andrà **solo questo documento**.
