# SP2 — `apply_effect`: il Master applica una conseguenza, l'engine la tira e la vincola (design)

> **Data:** 2026-06-17 · **Tipo:** design/spec · **Traccia:** engine/AI (item 3 di HANDOFF §0-quinquies) · **Sotto-progetto:** SP2 di 4.
> **Autorità:** spec di design `2026-06-15-simulatore-campagne-ai-design.md` (§5.4 AI Master, principio "il codice è l'arbitro"). Predecessore: SP1 (`2026-06-17-sp1-request-check-design.md`, `request_check`). Questo doc è subordinato allo spec generale.

## 0. Contesto e posizione nella traccia engine

La traccia engine (item 3) è decomposta in 4 sotto-progetti: **SP1** `request_check` (✅ fatto, `c04d9a3`), **SP2** `apply_effect` *(questo doc)*, **SP3** quest in L1 + `advance_quest`, **SP4** FSM di fase §5.5. `apply_effect` è la leva con cui il Master applica **conseguenze meccaniche** dopo una prova o nella narrazione. Si accoppia a SP1 (prova → conseguenza), ma resta **separato**: l'engine **non** auto-applica le conseguenze di un check — è l'AI che, visto l'esito, propone l'effetto (principio §5.4).

## 1. Principio e decisione "dove vivono i numeri"

> *Il codice è l'arbitro, l'AI è il narratore.*

Coerente con SP1: **l'AI esprime un intento strutturale, l'engine possiede la risoluzione.** Per un effetto su risorsa l'AI propone *su chi, quale risorsa, in che direzione (restore/drain), e con quale espressione di dadi*; l'**engine tira** i dadi (RNG seedato), calcola il delta netto, e **arbitra l'applicazione**: clamp della risorsa in `[0, max]`, rifiuto di risorsa/attore sconosciuti, event-sourcing (niente mutazione diretta).

**Perché i dadi tirati dall'engine** (decisione presa con l'utente, valutate le alternative): un'espressione di dadi tira la randomness DENTRO l'engine (replay-safe, l'evento registra il risultato), riusa il sistema di dadi esistente (`rollExpression`), ed è coerente col combattimento (l'engine tira il danno dell'arma). L'AI propone la *forma* della randomness (es. `2d6+1`), non un numero magico — analogo alla band di difficoltà di SP1. È **forward-compatible**: quando arriveranno item/spell (Piano 11) definiranno loro i dadi, stesso meccanismo. Scartate: il numero intero proposto dall'AI (nessuna calibrazione, l'AI sceglie il valore esatto) e la band qualitativa (i delta di risorsa dipendono dalla scala — un `major` su 10 hp vs 1000 hp — una tabella fissa non si adatta come per la DC).

## 2. Command, Event, risoluzione

**Command** (`packages/engine/src/commands.ts`):
```ts
| { type: 'ApplyEffect'; targetId: string; resource: string; direction: 'restore' | 'drain'; dice: DieGroup[]; bonus?: number }
```
- `direction` esplicita (l'AI dichiara l'intento; l'engine possiede segno e magnitudine), non un delta con segno proposto dall'AI.
- `dice: DieGroup[]` (riusa il tipo engine `{ count, sides, tag? }`); l'AI fornisce `{ count, sides }` (count≥1, sides≥2, interi). `bonus?` = modificatore piatto opzionale (es. il `+1` di `2d6+1`).

`decide()` (puro, RNG iniettato):
```ts
case 'ApplyEffect': {
  const target = state.actors[command.targetId];
  if (target === undefined) throw new Error(`Attore sconosciuto: ${command.targetId}`);
  if (target.resources[command.resource] === undefined) {
    throw new Error(`Risorsa sconosciuta: ${command.resource}`); // non appendere un evento non proiettabile
  }
  const expr: RollExpr = {
    dice: command.dice,
    modifiers: command.bonus !== undefined ? [{ value: command.bonus, source: 'effect' }] : [],
    mode: 'effect',
  };
  const roll = rollExpression(expr, rng);
  const magnitude = Math.max(0, roll.total); // restore non drena mai, e viceversa
  const delta = command.direction === 'restore' ? magnitude : -magnitude;
  return [{ type: 'ResourceEffectApplied', targetId: command.targetId, resource: command.resource, delta, roll }];
}
```

**Event** (`packages/engine/src/events.ts`):
```ts
| { type: 'ResourceEffectApplied'; targetId: string; resource: string; delta: number; roll: RollResult }
```
`applyEvent`:
```ts
case 'ResourceEffectApplied': {
  const target = adjustResource(requireActor(state, event.targetId), event.resource, event.delta);
  return { ...bumped, actors: { ...state.actors, [event.targetId]: target } };
}
```
- **Replay-safe:** `delta` è già risolto nell'evento; `applyEvent` clampa senza RNG (come `DamageApplied`).
- **Registra il `roll`** (la `RollResult` dell'effetto, `mode:'effect'`): scelta *forward-looking* — alimenta il **pannello dadi 3D deterministico** dello spec (oggi il danno di `Attack` NON registra il suo roll = gap noto; SP2 stabilisce il precedente migliore) e rende l'evento auto-descrittivo per la narrazione. `delta` è il netto applicato (autorevole), `roll` la provenienza (analogo a `AttackResolved` che porta `check` + `hit`).
- **Nessun auto-downing:** un drain che esaurisce la risorsa NON emette `ActorDowned` (vedi §4).

## 3. Confine AI, flusso del turno, memoria

**Tool** (`packages/ai/src/master-tools.ts`): `apply_effect` → `ApplyEffect`. Schema con le coercizioni esistenti (G1 numeri, G6 array):
```ts
z.object({
  targetId: z.string().min(1),
  resource: z.string().min(1),
  direction: z.enum(['restore', 'drain']), // auto-validante
  dice: llmArray(z.array(dieGroupArg).min(1)),  // G6: accetta anche un array stringificato
  bonus: llmNumber.optional(),                   // G1: accetta "2" oltre a 2
})
```
dove `dieGroupArg` = `{ count: <intero positivo coerciuto>, sides: <intero >=2 coerciuto> }`. count/sides vanno validati come **interi positivi** al confine (count≥1, sides≥2): serve una variante coerciva-ma-intera di `llmNumber` (un `z.preprocess` che coerce le stringhe numeriche e poi valida `z.number().int().min(...)`) — il piano ne fissa la forma esatta (gemella di `llmNumber`, riusabile). `masterToolDefs()` espone ora **7 tool**.

**Flusso del turno** (`master-turn.ts`): **nessuna modifica.** L'evento è reiniettato con `JSON.stringify` generico (come `CheckResolved`/`AttackResolved`); il modello legge `delta`/`roll` e narra.

**Memoria** (`reflection-ports.ts`): **nessuna modifica.** `ResourceEffectApplied` cade nel ramo generico di `renderEventsForReflection`; `EXTRACT_SYSTEM` ignora le statistiche meccaniche — la storia la porta `NarrationRecorded`.

**Confine non fidato** (`packages/shared/src/domain-schema.ts`): variante `ResourceEffectApplied` in `domainEventSchema`. **Nessun campo opzionale top-level** → entra direttamente nella `z.discriminatedUnion` interna (NON serve un arm `z.union` con `.transform()` come per `CheckResolved` di SP1). `roll` riusa i `rollResultFields` già presenti (`z.object({ ...rollResultFields })`). Il drift guard bidirezionale di `memory` (`sqlite-event-store.ts:85-90`) deve restare verde.

## 4. Fuori ambito (dichiarato — nessun debito silenzioso)

- **Condizioni / status** (stordito, benedetto, avvelenato): l'altra famiglia di "effetto". Rimandata a un sotto-progetto successivo, **entangled col vocabolario di status** — una `Condition` porta mecaniche proprie (`checkModifier.value`, `resourcePerTurn.delta`) e una `Duration`; se l'AI le definisce a piacere si reintroduce il debito "l'AI inventa le regole" in forma peggiore. Vincolarle a un vocabolario definito (modificatori/durate posseduti dal codice/modulo) è territorio item 4 / Piano 11.
- **Auto-downing** quando un drain esaurisce la risorsa: resta concern di combattimento (quale risorsa è "vita" è una regola/modulo); l'AI può narrarlo, formalizzazione in un item successivo.
- **Effetti flat senza dadi** (restore esatto di N senza tiro): è un gioco a dadi → YAGNI; aggiungibile dopo se serve.
- **`Ruleset` injection (§5.3)**: item deliberato successivo (come per SP1). `defenseBase` grezzo di `Attack`: follow-up già noto.

## 5. Strategia di test (TDD)

- **engine** (`commands.test.ts`, `events.test.ts`): `decide(ApplyEffect)` con RNG seedato — `restore` produce `delta` positivo, `drain` negativo, `roll` registrato col `total` atteso; magnitudine clampata `≥0`; attore sconosciuto → throw, **0 eventi**; risorsa sconosciuta → throw, **0 eventi**; `applyEvent(ResourceEffectApplied)` clampa a `[0, max]` (restore oltre `max` si ferma a `max`; drain sotto 0 si ferma a 0); replay deterministico.
- **ai** (`master-tools.test.ts`): `apply_effect` mappa al Command con/senza `bonus`; `dice` stringificato coerciuto (G6); `bonus` stringa coerciuto (G1); `direction` invalida rifiutata da Zod; `dice` vuoto/`sides` non valido rifiutato; `masterToolDefs()` espone 7 tool.
- **shared** (`domain-schema.test.ts`): round-trip di `ResourceEffectApplied` (con `roll` annidato); il tipo inferito resta assegnabile a `DomainEvent` (drift guard).

## 6. File toccati (orientativo per il piano)

`packages/engine/src/`: `commands.ts` (+ test), `events.ts` (+ test). `packages/shared/src/domain-schema.ts` (+ test). `packages/ai/src/master-tools.ts` (+ test) — qui anche il nuovo helper coercivo-intero per `count`/`sides` (gemello di `llmNumber`). **Tre pacchetti** (engine + shared + ai). **Niente** `master-turn.ts`, `reflection-ports.ts`/`host`, `commandSchema` (ApplyEffect è interno all'AI, non un dispatch IPC — guard wire→motore unidirezionale), UI/migrazioni. Niente nuovo modulo engine (riusa `rollExpression`/`adjustResource`).

## 7. Acceptance

- Il Master può applicare un effetto su risorsa con un'**espressione di dadi**; l'**engine tira** (deterministico, RNG seedato), calcola il delta e **clampa** la risorsa; l'evento registra `delta` + `roll`.
- Attore o risorsa sconosciuti → **rifiutati** (throw, 0 eventi); `direction` fuori enum → rifiutata (Zod).
- `restore` non drena mai e `drain` non ripristina mai (magnitudine `≥0`).
- `decide`/`applyEvent` restano puri e replay-safe.
- Deferral dichiarati e assegnati (condizioni→sotto-progetto status/vocabolario, auto-downing, flat, Ruleset).
