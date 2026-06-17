# SP1 — `request_check`: il Master chiede un tiro, l'engine lo risolve (design)

> **Data:** 2026-06-17 · **Tipo:** design/spec · **Traccia:** engine/AI (item 3 di HANDOFF §0-quinquies) · **Sotto-progetto:** SP1 di 4.
> **Autorità:** spec di design `2026-06-15-simulatore-campagne-ai-design.md` (§5.4 AI Master, §5.5 FSM di fase, §6 memoria a strati). Questo doc è subordinato a quello.

## 0. Contesto e decomposizione della traccia engine

La traccia engine (item 3 del backlog pre-Piano 10) realizza gli strumenti del Master rimandati dal Piano 7c — `request_check`, `apply_effect`, `advance_quest` (spec §5.4) — più il **contesto quest** in L1 e la **FSM di fase** (§5.5). È troppo grande per un solo spec: la decomponiamo in **4 sotto-progetti indipendenti**, ognuno col proprio ciclo spec → piano → merge, nell'ordine piccolo→grande:

- **SP1 — `request_check`** *(questo doc)*: Command/Event per le prove di abilità. Engine puro, nessun nuovo stato. Sblocca il primo tool rimandato.
- **SP2 — `apply_effect`**: Command/Event per applicare conseguenze meccaniche (delta di risorse, condizioni) sopra `adjustResource`/`addCondition`. Si accoppia a SP1 (check → conseguenza), ma resta separato: **l'engine non auto-applica le conseguenze di un check** — è l'AI che, visto l'esito, propone l'effetto (principio §5.4).
- **SP3 — Quest in L1 + `advance_quest`**: nuova entità `Quest` nel `GameState`, eventi del ciclo di vita quest, e il contesto quest che entra in L1 (schema `@loomn/shared` + reso in prosa nel Context Assembler di `@loomn/memory`). Cross-package.
- **SP4 — FSM di fase (§5.5)**: macchina a stati dichiarata (esplorazione/dialogo/combattimento/downtime) che vincola quali Command/tool sono abilitati per fase. Definisce anche i **confini di scena** → si salda con l'item 6 del backlog (segmentazione `reflect`). Per ultima, così vincola un vocabolario di Command già completo.

La FSM è per ultima di proposito: ha senso vincolare un vocabolario completo, e i suoi confini di scena servono all'item 6.

## 1. Principio

> *Il codice è l'arbitro, l'AI è il narratore.* (spec, principio sacro)

Per una prova di abilità questo significa: l'AI propone **chi tira, con quale attributo/abilità e quanto è difficile** — ma **in termini qualitativi**. È il codice a possedere i numeri (la difficoltà → CD, il tiro, i gradi di successo) e a risolvere in modo deterministico con l'RNG seedato. L'AI riceve poi l'esito **reale** e lo narra (o propone un `apply_effect` in SP2).

`request_check` è il gemello strutturale di `Attack` (già esistente), con una differenza deliberata e centrale: **la CD non è un numero inventato dall'AI** (come lo è oggi `defenseBase` di `Attack`, un debito noto — vedi §5), ma deriva da una **band di difficoltà** posseduta dal codice.

## 2. Dove vivono i numeri: il band model (decisione architetturale)

L'AI non propone una CD numerica. Propone una **difficoltà qualitativa** scelta da un insieme chiuso; una funzione pura dell'engine traduce la band in CD. Questo chiude il debito "l'AI inventa il numero della difficoltà" senza introdurre, già ora, l'astrazione completa del `Ruleset`.

**Nuovo modulo engine `difficulty.ts`** (single-purpose, isolato → unità di migrazione verso un futuro `Ruleset`):

```ts
export const DIFFICULTIES = ['trivial', 'easy', 'moderate', 'hard', 'formidable', 'legendary'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

const DC_BY_DIFFICULTY: Record<Difficulty, number> = {
  trivial: 5, easy: 10, moderate: 15, hard: 20, formidable: 25, legendary: 30,
};

/** CD per una band di difficoltà. Tabella di default dell engine; un modulo (Piano 11)
 *  potra' sostituirla via Ruleset iniettato (spec §5.3) senza toccare i call site. */
export function dcForDifficulty(d: Difficulty): number {
  return DC_BY_DIFFICULTY[d];
}
```

La scala 5–30 a passi di 5 è adatta ai tiri 1d20 + modificatori (un PG con `attributo+abilità ≈ +5` ha total ~6–26: `moderate` 15 è una prova reale, `legendary` 30 quasi impossibile senza grandi modificatori).

**Perché band model in-engine ora, e non `Ruleset` injection (§5.3) subito.** Entrambe chiudono lo *stesso* debito (il numero vive nel codice, non nell'AI). La differenza è solo *se* la tabella sta dietro un seam iniettato. Introdurre il port `Ruleset` ora significherebbe progettarne l'**interfaccia** da un solo caso d'uso (la CD), prima che SP2/SP3/Piano 11 rivelino cosa deve contenere (vocabolario, difese, regole degli effetti, definizioni di condizione) → astrazione speculativa a una-sola-implementazione, da rimodellare a ogni SP. Le astrazioni giuste si estraggono dai casi concreti in mano (Rule of Three / YAGNI). `dcForDifficulty` come funzione pura è trivialmente migrabile dopo, in un refactor unico e bounded, *con conoscenza* di tutte le tabelle accumulate. Il `Ruleset` resta un item deliberato successivo. (Decisione presa con l'utente.)

## 3. Command, Event, risoluzione

**Command** (`packages/engine/src/commands.ts`):
```ts
| { type: 'RequestCheck'; actorId: string; attribute?: string; skill?: string; difficulty: Difficulty }
```

`decide()` (puro, RNG iniettato):
```ts
case 'RequestCheck': {
  const actor = state.actors[command.actorId];
  if (actor === undefined) throw new Error(`Attore sconosciuto: ${command.actorId}`);
  const dc = dcForDifficulty(command.difficulty);
  const result = actorCheck(
    {
      actor,
      includeEquipped: true,
      dc,
      ...(command.attribute !== undefined ? { attribute: command.attribute } : {}),
      ...(command.skill !== undefined ? { skill: command.skill } : {}),
    },
    rng,
  );
  return [{
    type: 'CheckResolved',
    actorId: command.actorId,
    difficulty: command.difficulty,
    result,
    ...(command.attribute !== undefined ? { attribute: command.attribute } : {}),
    ...(command.skill !== undefined ? { skill: command.skill } : {}),
  }];
}
```
`attribute`/`skill` sono entrambi opzionali, come in `Attack`. L'engine gestisce "nessuno dei due" (1d20 piatto vs CD) — nessun vincolo artificiale. `includeEquipped: true` rispecchia `performAttack`.

**Event** (`packages/engine/src/events.ts`):
```ts
| { type: 'CheckResolved'; actorId: string; attribute?: string; skill?: string; difficulty: Difficulty; result: CheckResult }
```
`applyEvent`: **no-op di stato** (solo `version++`), esattamente come `AttackResolved` — il fatto è già risolto nell'evento (replay-safe, niente RNG nel proiettore). L'evento porta sia la **band** (l'intento qualitativo, più naturale per narrazione/memoria del `result.dc` grezzo) sia il `CheckResult` completo (`dice`, `modifierTotal`, `total`, `mode`, `dc`, `margin`, `outcome`).

## 4. Confine AI, flusso del turno, memoria

**Tool** (`packages/ai/src/master-tools.ts`): `request_check` → `RequestCheck`. Schema Zod:
```ts
z.object({
  actorId: z.string().min(1),
  attribute: z.string().min(1).optional(),
  skill: z.string().min(1).optional(),
  difficulty: z.enum(DIFFICULTIES), // DIFFICULTIES importato dall engine (ai dipende da engine): singola fonte, niente drift
})
```
L'enum è **auto-validante**: l'AI non può inventare una difficoltà (Zod la rifiuta) — a differenza di un `dc` numerico libero. È il rovescio coercitivo-ma-strict di G1/G6. `masterToolDefs()` espone ora **6 tool**. È l'**unico** tocco in `@loomn/ai`.

**Flusso del turno** (`master-turn.ts`): **nessuna modifica.** Gli Event reali sono reiniettati nel turno con un `JSON.stringify` generico (`master-turn.ts:128`, `${call.name}: ${JSON.stringify(produced)}`), non con un render per-tipo. `CheckResolved` ci passa **automaticamente**, come `AttackResolved` oggi: il modello legge il JSON (con `outcome`/`total`/`margin`/`dc`) e narra. Introdurre un render prosa per-tipo cambierebbe il comportamento di *tutti* gli eventi → fuori scope di SP1.

**Memoria** (`reflection-ports.ts`): **nessuna modifica.** `renderEventsForReflection` non è uno switch esaustivo: gli eventi diversi da `NarrationRecorded` cadono nel ramo generico (`#seq <type> <json>`) — `CheckResolved` incluso. E `EXTRACT_SYSTEM` istruisce di **non** estrarre le statistiche meccaniche già tracciate dal motore (singoli tiri compresi): la storia di cosa la prova ottiene la porta `NarrationRecorded`. Comportamento già corretto, niente da aggiungere.

**Confine non fidato** (`packages/shared/src/domain-schema.ts`): variante `CheckResolved` in `domainEventSchema`, **riusando lo schema `checkResultSchema` già presente** (lo usa `AttackResolved`, `domain-schema.ts:40`). Per l'enum delle difficoltà, `shared` è **foglia** (NON importa engine) → **rispecchia i literal** con un proprio `z.enum([...])`, esattamente come `outcomeSchema` rispecchia `Outcome`; l'assegnabilità cast-free del tipo inferito a `Difficulty` (drift guard, come per F4/Outcome) tiene le due liste allineate. La duplicazione engine↔shared dei literal è il pattern esistente per tutti gli enum del dominio, non un debito nuovo.

## 5. Fuori ambito (dichiarato — nessun debito silenzioso)

- **Validazione del vocabolario.** `getAttribute`/`getSkill` fanno `?? 0`: un `skill` inesistente dà contributo 0 silenzioso. È il debito G3/G4, **di competenza dell'item 4** del backlog (esporre/vincolare il vocabolario valido attraverso *tutti* i tool, cross-cutting). SP1 non lo duplica e non introduce nuovi fallimenti silenziosi oltre a quello già esistente nell'engine.
- **`Ruleset` injection (§5.3).** Item deliberato successivo (vedi §2). `dcForDifficulty` è la prima tabella che ci migrerà.
- **`defenseBase` grezzo di `Attack`.** Oggi l'AI lo inventa (stesso debito che SP1 evita per i check). Riconciliarlo al band model (o farlo derivare dalle stat del bersaglio) è un follow-up annotato, non toccato in SP1 (scope).
- **Check contrapposti** (attore vs attore): YAGNI — l'AI può chiedere due check separati e confrontarli narrando; nessun debito.
- **Modificatori situazionali espliciti**: la capacità engine (`CheckRequest.situationalModifiers`) resta, ma non esposta al tool in v1; la difficoltà qualitativa cattura già la circostanza.

## 6. Strategia di test (TDD)

- **engine** (`difficulty.test.ts`, `commands.test.ts`, `events.test.ts`): `dcForDifficulty` mappa ogni band al valore atteso (tabella) ed è esaustiva su `DIFFICULTIES`; `decide(RequestCheck)` con RNG seedato produce un `CheckResolved` con l'outcome atteso; attore sconosciuto → throw, **0 eventi**; `applyEvent(CheckResolved)` è **no-op di stato** (solo `version++`, attori/encounter invariati); replay deterministico (stesso seed → stesso esito).
- **ai** (`master-tools.test.ts`): `request_check` mappa al Command con/senza `attribute`/`skill`; difficoltà **invalida** rifiutata da Zod; `masterToolDefs()` espone 6 tool e lo schema di `request_check` mostra l'enum delle difficoltà.
- **shared** (`domain-schema.test.ts`): round-trip di `CheckResolved` in `domainEventSchema` (incluso l'enum delle difficoltà e il `CheckResult` annidato); il tipo inferito resta assegnabile a `DomainEvent` (drift guard).

## 7. File toccati (orientativo per il piano)

`packages/engine/src/`: **nuovo** `difficulty.ts` (+ test), `commands.ts` (+ test), `events.ts` (+ test), `index.ts` (re-export di `difficulty`). `packages/shared/src/domain-schema.ts` (+ test). `packages/ai/src/master-tools.ts` (+ test). **Tre pacchetti** (engine + shared + ai), tocchi piccoli per pacchetto. **Niente** modifiche a `master-turn.ts`, `reflection-ports.ts`/`host`, `commandSchema`, `app/desktop`/UI, migrazioni (il self-review ha confermato che il flusso turno e la reflection gestiscono `CheckResolved` per via generica — vedi §4).

## 8. Acceptance

- L'AI può chiedere un tiro scegliendo una **difficoltà qualitativa**; l'engine possiede la CD e risolve deterministicamente; l'esito reale rientra nel turno e finisce in memoria.
- Una difficoltà inventata o fuori band è **rifiutata** (Zod), non interpretata.
- `decide`/`applyEvent` restano puri e replay-safe; il `CheckResolved` non muta lo stato.
- Nessun nuovo debito silenzioso introdotto; i deferral sono dichiarati e assegnati (item 4, Ruleset, follow-up Attack).
