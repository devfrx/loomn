# D‑01b — Generazione AI‑da‑brief del Campaign Seed — Design

> **Data:** 2026-06-23 · **Traccia:** D‑01 (incipit/campagna progettata, "il problema enorme") · **Slice:** D‑01b (dopo D‑01a, prima di D‑01c/D‑01d) · **Stato:** design da approvare → poi `superpowers:writing-plans`.

## 1. Problema

D‑01a ha consegnato il **motore + contesto** del seed: il Command `SeedCampaign`, l'evento `CampaignFramed`, `GameState.campaignFrame` event‑sourced, il blocco campaign‑frame nel Context Assembler, e l'host `seedCampaign(seed)` atomico ([campaign-service.ts:134](../../../packages/host/src/campaign-service.ts)). Resta scoperta la **prima sorgente** del `CampaignSeed`: oggi un seed esiste solo come `devCampaignSeed` scritto a mano ([dev-campaign-seed.ts:6](../../../packages/host/src/dev-campaign-seed.ts)).

D‑01b colma questa lacuna: **generare un `CampaignSeed` validato a partire da un brief dell'utente**, via l'LLM, sfruttando lo `StructuredOutputPort` di 7b ([structured-output.ts:56](../../../packages/ai/src/structured-output.ts)). È la sorgente "AI‑da‑brief" decisa nel brainstorming di D‑01 (seed source‑agnostic ibrido). Il risultato è una **bozza** che l'utente rivedrà/editerà/confermerà nell'onboarding (D‑01c); la conferma è il già‑pronto `seedCampaign(seed)`.

## 2. Decisioni prese (con l'utente, via brainstorming)

1. **Brief ibrido (Q1).** L'input è `{ text, overrides? }`: un brief testuale libero (il cuore) + pochi campi opzionali (genere, tono, n. PNG, vincoli di contenuto) che guidano senza ingabbiare. Coerente col "seed source‑agnostic ibrido" di D‑01.
2. **Confine: generazione + metodo host (Q2).** D‑01b vive in `@loomn/ai` (generazione) + `@loomn/host` (metodo `generateSeed`). **Nessun IPC, nessuna UI, nessun gate Electron** (coperto da unit test con fake model su ABI Node). IPC + UI di review/edit + onboarding → D‑01c.
3. **Stat PNG riempite dal codice (Q3).** La generazione **non** inietta il vocabolario nel prompt (l'AI resta vocabulary‑agnostica) e **non** lascia che l'AI proponga stat libere. È il **codice** a riempire attributi/abilità leggendo le chiavi dal `Ruleset` → chiavi sempre valide, il confirm non può mai fallire per stat fuori‑vocabolario.
4. **Ricchezza: codice + livello AI (Q3b).** L'AI emette per ogni PNG un `tier` astratto e vocabulary‑agnostico (`comune`/`esperto`/`eccezionale`); il codice mappa il `tier` a un valore di base su **tutti** gli attributi e abilità del vocabolario → PNG riempiti **e** differenziati. Le risorse restano all'auto‑fill di `decide` (hp ecc.).
5. **Genera‑e‑valida, bozza sempre confermabile (Q4).** Il codice deriva ids validi/unici (slugify dei nomi), riempie le stat dal Ruleset, e i fatti restano triple **libere** (il Canon Ledger non ha vincoli FK → sempre validi). Gli **unici** errori veri sono *provider non configurato* e `StructuredOutputError` (tutti i fallback falliti); risalgono come reject del metodo host. Nessuna incoerenza può rompere il confirm.

## 3. Scope

**IN (D‑01b):**
- `CampaignBrief` (tipo input) + `rawSeedSchema` (Zod, output grezzo dell'AI) in `@loomn/ai`.
- `generateCampaignSeed(brief, { structured, ruleset }): Promise<CampaignSeed>` (orchestratore) + `rawToCampaignSeed(raw, ruleset): CampaignSeed` (transform **puro**) + `slugify` puro in `@loomn/ai`.
- Metodo `generateSeed(brief): Promise<CampaignSeed>` su `CampaignService` (`@loomn/host`) + re‑export di `CampaignBrief`.

**DIFFERITO (NON D‑01b):**
- Canale IPC `generate-seed` (+ `campaignSeedSchema` come gate IPC estratta in `@loomn/shared`) → **D‑01c**.
- UI di review/edit della bozza + onboarding (brief → genera → review/edit → conferma → apertura) → **D‑01c**.
- Rigenera / rigenera‑parziale; coerenza best‑effort dei fatti (riconciliazione name→id, Q4 opzione B declinata); scaling delle risorse per `tier`; generazione vocabulary‑aware (Q3 opzione 2) → enhancement futuri.
- Moduli/Piano 11 come sorgente di `CampaignSeed` (stesso tipo) → **D‑01d**.
- Unicità **cross‑campagna** di `frame.id` → registro **D‑03**.

## 4. Architettura e layering

D‑01b tocca **due pacchetti**; **non** tocca `@loomn/shared`, `@loomn/engine`, `app/desktop`.

- **`@loomn/ai`** — nuovo `packages/ai/src/campaign-generation.ts`, esportato dal barrel ([index.ts](../../../packages/ai/src/index.ts), pattern `export * from './…'`). `@loomn/ai` dipende già da `@loomn/engine` + `zod` + `zod-to-json-schema` ([package.json](../../../packages/ai/package.json)) → può importare i tipi `CampaignSeed`/`CampaignFrame`/`SeedNpc`/`SeedPlace`/`SeedFact` ([engine index:19](../../../packages/engine/src/index.ts)) e `Ruleset`/`Vocabulary`, e definire schemi Zod (pattern già stabilito in `master-tools.ts`). **Nessuna nuova dipendenza.**
- **`@loomn/host`** — `campaign-service.ts`: nuovo metodo `generateSeed` sull'interfaccia `CampaignService` + impl che inietta `deps.structured` ([campaign-service.ts:38](../../../packages/host/src/campaign-service.ts)) e `deps.ruleset`. Re‑export di `CampaignBrief` dal barrel di host.

**Niente nuovo `Command`/`Event`** → **niente drift‑guard engine/shared** (D‑01b aggiunge un *metodo* di servizio, non un comando; il typecheck su interfaccia+impl basta). `generateSeed` è **non‑enqueued**: non legge né muta `state` (usa solo `ruleset` statico + LLM), come `getRuleset`/`getNarrationHistory`. La conferma resta `seedCampaign(seed)` (enqueued, atomico, D‑01a).

> **Debt‑free.** `rawSeedSchema` è un *gate di generazione* (valida l'output fresco dell'AI), **non** un read‑path né un command schema: i bound sono ammessi qui (come gli schemi di tool in `master-tools.ts`). Nessuno schema di **lettura** viene ristretto. La `campaignSeedSchema` come gate IPC è di D‑01c.

## 5. Data model

### 5.1 `CampaignBrief` (input — `@loomn/ai`)

```ts
interface CampaignBrief {
  text: string;                  // il brief libero: il cuore della richiesta
  name?: string;                 // nome campagna desiderato; se assente, lo propone l'AI
  overrides?: {
    genres?: string[];
    tone?: string;
    npcCount?: number;           // quanti PNG chiave (hint, non vincolo rigido)
    contentGuidance?: string;    // lines & veils / safety; precedenza su quanto propone l'AI
  };
}
```

Nessuno schema Zod in D‑01b: è in‑process e tipato. D‑01c aggiungerà lo schema al confine IPC.

### 5.2 `RawSeed` (output grezzo dell'AI — `rawSeedSchema`, `@loomn/ai`)

```ts
// Zod, transform-free (il transform vive nel codice, non nello schema): zodToJsonSchema
// guida l'LLM; i bound leggeri (.min(1) su name/premise, enum su tier) sono ammessi (gate di generazione).
const rawSeedSchema = z.object({
  name: z.string().min(1),
  premise: z.string().min(1),
  setting: z.object({
    place: z.string(),
    era: z.string(),
    genres: z.array(z.string()),
    worldRules: z.string().optional(),
  }),
  tone: z.string(),
  openingScene: z.string(),
  hooks: z.array(z.string()),
  contentGuidance: z.string().optional(),
  npcs: z.array(z.object({
    name: z.string().min(1),
    description: z.string(),
    tier: z.enum(['comune', 'esperto', 'eccezionale']), // enum auto-validante (pattern master-tools.ts:21)
  })),
  places: z.array(z.object({ name: z.string().min(1), description: z.string() })),
  facts: z.array(z.object({ subject: z.string(), predicate: z.string(), object: z.string() })),
});
```

L'AI cita le entità **per nome** nei fatti (non assegna ids né numeri di gioco). Nota: niente `z.record(z.enum)` per le stat — è esattamente l'anti‑pattern documentato in [master-tools.ts:15-18](../../../packages/ai/src/master-tools.ts) (renderebbe tutte le chiavi `required`); le stat le mette il codice.

## 6. Generazione (`generateCampaignSeed`)

Una sola chiamata strutturata (single‑shot; gli stadi multipli sono YAGNI per la prima slice):

```ts
async function generateCampaignSeed(
  brief: CampaignBrief,
  deps: { structured: StructuredOutputPort; ruleset: Ruleset },
): Promise<CampaignSeed> {
  const messages = buildMessages(brief);                 // system + user (vedi sotto)
  const { value: raw } = await deps.structured.generate({
    messages,
    schema: rawSeedSchema,
    schemaName: 'campaign_seed',
    schemaDescription: 'Scenario di campagna espanso da un brief',
    temperature: 0.9,                                     // creativita; costante (non in brief)
  });
  return rawToCampaignSeed(raw, deps.ruleset);
}
```

`buildMessages(brief)`:
- **system**: ruolo (game‑designer che espande un brief in uno scenario), output in **italiano** (come `devCampaignSeed`), istruzioni: citare le entità **per nome** nei fatti, assegnare un `tier` per PNG, **non** inventare ids/numeri di gioco.
- **user**: `brief.text` + gli `overrides` tessuti (genere/tono/n. PNG/contentGuidance) quando presenti.

Riusa i 3 livelli di fallback dello `StructuredOutputPort` (function‑call → json‑schema → repair); nessuna logica di retry nuova.

## 7. Transform `rawToCampaignSeed(raw, ruleset)` (puro)

1. **ids deterministici:** `slugify(name)` (minuscolo, accenti rimossi, spazi→`-`, non‑alfanumerici tolti) con **dedup** (collisione → `nome`, `nome-2`, …). `frame.id = slugify(raw.name)`.
2. **stat PNG (dal Ruleset):** per ogni PNG, il codice assegna a **ogni** chiave di `ruleset.vocabulary.attributes` e `…skills` il valore derivato dal `tier`:
   `comune→1, esperto→2, eccezionale→3` (interi piccoli, coerenti con la scala osservata, es. `forza: 3` in [actor.test.ts](../../../packages/engine/src/actor.test.ts)). Le **risorse** non vengono toccate → `decide(SeedCampaign)`/`buildActorAddedEvent` le auto‑riempie dai `defaultResources` ([commands.ts:104](../../../packages/engine/src/commands.ts)). Poiché le chiavi vengono dal vocabolario, `requireMember` ([commands.ts:99](../../../packages/engine/src/commands.ts)) passa sempre.
3. **fatti:** copiati verbatim da `raw.facts` in `initialFacts` (triple libere; il Canon Ledger non vincola).
4. **frame:** `{ id, name, premise, setting, tone, openingScene, hooks, contentGuidance? }` da `raw`, con `contentGuidance = brief.overrides?.contentGuidance ?? raw.contentGuidance` (precedenza all'utente; chiave omessa se entrambi assenti, per `exactOptionalPropertyTypes`).
5. Ritorna un `CampaignSeed` ([campaign.ts:41](../../../packages/engine/src/campaign.ts)) tipizzato a compile‑time (niente cast).

`slugify` è puro e isolato → unit‑testabile da solo. Il transform è puro → testabile senza LLM.

## 8. Host — `generateSeed`

`packages/host/src/campaign-service.ts`, nuovo metodo **non‑enqueued**:

```ts
generateSeed(brief: CampaignBrief): Promise<CampaignSeed> {
  return generateCampaignSeed(brief, { structured: deps.structured, ruleset: deps.ruleset });
}
```

Read‑side rispetto allo stato (non tocca event store né `state`): non passa per la coda FIFO. Ritorna la **bozza**; la conferma è una chiamata separata a `seedCampaign(seed)` (D‑01a). `CampaignBrief` re‑esportato dal barrel di host (utile a D‑01c).

## 9. Error handling

Solo due fallimenti **veri** (Q4), propagati come reject del metodo (D‑01c li impacchetterà `{ok:false,error}` all'IPC, come gli altri canali):
1. **Provider non configurato** → `deps.structured.generate` lancia (il provider‑holder di app/desktop dà già un errore chiaro quando non configurato).
2. **`StructuredOutputError`** (tutti e 3 i fallback falliti) → propagato ([structured-output.ts:26](../../../packages/ai/src/structured-output.ts)).

Nessuna "incoerenza" è un errore: la bozza è **garantita confermabile** (ids validi/unici, stat dal vocabolario, fatti liberi). Garanzia dimostrata da un test end‑to‑end *generate → seedCampaign riesce*.

## 10. Testing (TDD, ABI Node, fake model, fuori dal gate)

- **`slugify` (puro):** minuscolo/accenti/spazi/non‑alfanumerici; dedup `nome`/`nome-2`.
- **`rawToCampaignSeed` (puro):** mappa `tier`→stat su un ruleset fake (ogni attributo/abilità = valore atteso per tier); risorse non toccate (auto‑fill a valle); fatti verbatim; assembly frame; precedenza `contentGuidance` (override > raw > omesso).
- **`generateCampaignSeed`:** fake `StructuredOutputPort` che ritorna un `raw` canned → verifica il wiring del transform; fake che **cattura** `request.messages` → verifica che `brief.text`/overrides raggiungano il prompt; fake che lancia `StructuredOutputError` → propagazione.
- **host `generateSeed`:** fake structured + ruleset → ritorna un `CampaignSeed`; **test‑chiave (garanzia Q4):** il seed generato passato a `seedCampaign` su un service in‑memory (`createMemorySystem(':memory:')`) **riesce** (CampaignFramed + ActorAdded per ogni PNG + canon); provider che lancia → `generateSeed` rigetta.

Conteggio atteso: **805 → ~825‑835** (il piano fisserà i numeri cumulativi per task).

## 11. Coerenza con l'architettura esistente (verificata)

- Barrel `@loomn/ai` `export * from` → estensione 1:1 ([index.ts](../../../packages/ai/src/index.ts)).
- Nessun `slugify` preesistente in `packages/` (grep) → crearlo non duplica nulla.
- Tipi seed/ruleset esportati da `@loomn/engine` ([index.ts:19](../../../packages/engine/src/index.ts)); `@loomn/ai` già dipende da engine.
- Schemi Zod in `@loomn/ai` = pattern stabilito (`master-tools.ts`); `tier: z.enum` = stesso pattern auto‑validante (`:21`); evitato l'anti‑pattern `z.record(z.enum)` (`:15-18`).
- `deps.structured`/`deps.ruleset` già disponibili nel servizio ([campaign-service.ts:38](../../../packages/host/src/campaign-service.ts)).
- Auto‑fill risorse + `requireMember` confermano che stat con chiavi dal vocabolario non falliscono mai ([commands.ts:99-104](../../../packages/engine/src/commands.ts)).

## 12. Foresight (slice future — D‑01b le abilita)

- **D‑01c (UX):** canale IPC `generate-seed` (`CampaignBrief` → `CampaignSeed`, Zod‑validato; serve estrarre `campaignSeedSchema` in `@loomn/shared` come gate di risposta — finora esiste solo `seedCampaignCommandSchema` bounded, [domain-schema.ts:459](../../../packages/shared/src/domain-schema.ts)); route onboarding brief → genera → review/edit della bozza → `seedCampaign` → mostra la narrazione d'apertura.
- **D‑01d / Piano 11:** un modulo curato è un'altra sorgente di `CampaignSeed` (stesso tipo) → `seedCampaign`.
- **D‑03:** il registro multi‑campagna garantisce l'unicità **cross‑campagna** di `frame.id` (qui è solo la proposta della bozza).

## 13. Fuori ambito (esplicito)

IPC + UI (D‑01c), moduli (D‑01d/Piano 11), gestione multi‑campagna (D‑03), generazione vocabulary‑aware delle stat (Q3 opz. 2), riconciliazione name→id dei fatti (Q4 opz. B), scaling risorse per `tier`, rigenera/rigenera‑parziale. La narrazione d'apertura è già gestita da `seedCampaign` (D‑01a), non da D‑01b.
