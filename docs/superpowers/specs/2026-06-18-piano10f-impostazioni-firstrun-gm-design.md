# Loomn — Piano 10f (Impostazioni + first-run + creazione PG + controlli GM): spec di design

> **Data:** 2026-06-18 · **Stato:** studio design-first **chiuso** (deciso con l'utente via `superpowers:brainstorming` + `AskUserQuestion`) · **Prossimo:** `superpowers:writing-plans`.
>
> Questo documento è l'**autorità di design** del Piano 10f (sotto-piano di Piano 10). Non è un piano d'implementazione (quello viene dopo, in `docs/superpowers/plans/`). Cattura le decisioni prese con l'utente, il design backend+renderer, la strategia di verifica e la decomposizione in task.

---

## 1. Scopo e contesto

Il **Piano 10f** consegna le superfici UI **non-narrative** di Loomn, tutte costruite sul backend esistente: **Impostazioni provider**, **first-run guidato**, **creazione PG** e **controlli GM/manuali**. È il primo sotto-piano dopo le fondamenta (10a) e il vocabolario su IPC (10g), perché il turno reale (`run-turn`) richiede un provider configurato.

Principi vincolanti (dallo spec autorità Piano 10):
- **Il codice è l'arbitro, l'AI è il narratore.** La UI è **read-side** (proiezioni di sola lettura) + **dispatch di Command**; non muta mai lo stato direttamente. Solo le azioni che richiedono l'AI (il turno) dipendono dal provider — tutto il resto (creazione PG, controlli GM) è puro engine e funziona senza provider.
- **Ogni elemento UI lega a un substrato esistente:** Impostazioni → `set-provider`/`get-status`; first-run → `get-status.providerConfigured`; creazione PG → `dispatch(AddActor)`; controlli GM → `dispatch` dei Command estesi del Piano 0; tutti i form data-driven dal `get-ruleset` (10g).
- **Qualità "strumento notturno":** si costruisce sul design system bespoke + i componenti `Loomn*`/Reka già consegnati da 10a (`docs/superpowers/specs/2026-06-17-piano10-ui-design.md` §3). Niente estetica "AI-slop".

Stato backend verificato sul codice (2026-06-18), pronto per 10f:
- `loadProviderConfig()` (`app/desktop/src/main/settings.ts`) rilegge `{baseUrl, model, apiKey?}` decifrando la chiave **solo nel main**; la chiave non lascia mai il processo fidato.
- `get-status` (`packages/shared/src/ipc.ts` → `statusResultSchema`; handler in `app/desktop/src/main/index.ts`) ritorna oggi `{version, safeStorageAvailable, providerConfigured}`.
- `AddActor` (`commandSchema` in `packages/shared/src/domain-schema.ts`) richiede un `actor` **completo** (`id, name, kind, attributes, skills, resources, conditions, items, progression`).
- I 6 Command non-combat estesi dal Piano 0 sono nello schema: `RequestCheck`, `ApplyEffect`, `StartQuest`, `AdvanceQuest`, `EnterPhase`, `EndEncounter`.
- `get-ruleset` (10g) espone `{vocabulary:{attributes,skills,resources,defenses,defaultResources}, difficulties, softPhases, questOutcomes, directions, commandPhaseRules:{combatOnly,nonCombatOnly}}`.
- Scaffold renderer (10a): 5 route (Gioco/Diario/Scheda/Compagnia/Impostazioni), `SettingsView`/`CompanyView` skeleton, store Pinia read-side con selettori (`phase`/`actors`/`pcs`/`npcs`/`quests`/`encounter`/`inCombat`), design system, `LoomnPanel`/`LoomnButton`/`LoomnDialog`, `vitest.workspace.ts` (packages + renderer jsdom).

---

## 2. Decisioni di design (bloccate con l'utente)

1. **(A) Read-back config provider = estensione di `get-status`** (non un canale `get-provider` dedicato). `get-status` ritorna anche `provider?: {baseUrl, model, hasApiKey}` (assente quando nessun provider è persistito). Razionale: il provider-status vive già in `get-status` (`providerConfigured`); un solo canale e un solo round-trip (Impostazioni e first-run chiamano già `get-status`); separare `baseUrl/model` su un secondo canale sparpaglierebbe l'info-provider su due superfici — *quello* sarebbe il debito. Stile Piano 0: additivo, `shared` resta foglia, drift guard imposto dal tipo `StatusResult` nell'handler. **La chiave API non attraversa mai l'IPC.**

2. **(B) First-run = soft gate guidato** (non hard gate né banner passivo). Al boot, se `providerConfigured === false`: auto-navigazione **una sola volta** a Impostazioni (framing di benvenuto) + banner globale dismissibile con CTA finché non configurato. **Non intrappola:** navigazione, creazione PG e controlli GM restano usabili (non richiedono AI). Il segnale "turno disabilitato finché non configurato" è **fornito** da 10f (store reattivo) ma **consumato** da 10b (dove vive l'input del turno) — vedi §3.1. Razionale: solo l'azione AI-dipendente va gated; coerente col principio codice-arbitro/AI-narratore.

3. **(C) IA = Regia overlay + creazione PG in Compagnia** (non route dedicata, non tutto in Impostazioni). I controlli GM vivono in uno **slide-over "Regia"** con trigger globale nella topbar; la creazione PG/PNG vive nella route **Compagnia** (che già mostra il roster). Razionale: il rail resta a 5 voci (nessun clutter), i controlli GM restano contestuali e non sovra-pesati, Impostazioni non conflate config-app con azioni-di-gioco.

4. **(Sotto-decisione A) UX chiave API tri-stato (anti-footgun).** Il read-back non restituisce mai la chiave → il campo chiave è sempre vuoto al caricamento. Con le attuali semantiche full-replace di `set-provider`, ri-salvare per cambiare solo il `model` cancellerebbe **silenziosamente** la chiave (e romperebbe il turno AI). Si adotta il comportamento standard dei form-credenziali, reso esplicito a livello backend: in `saveProviderConfig` `apiKey` diventa **tri-stato** — `undefined` (campo lasciato vuoto) = *mantieni* la chiave esistente; `''` (azione esplicita "rimuovi chiave") = *cancella*; stringa non vuota = *sostituisci*. `hasApiKey` nel read-back fa comunicare lo stato onestamente alla UI. *(Deciso con l'utente: incluso come raccomandato, non backend strettamente minimo.)*

---

## 3. Design — backend (estensione IPC sottile, stile Piano 0)

Tutto additivo e cast-free; `@loomn/shared` resta **foglia** (importa solo `zod` + `./domain-schema`). Nessun nuovo Command/Event/tabella/migrazione. Nessuna modifica a `package.json`/`tsconfig`/`vitest.config`/`vitest.workspace`/`electron.vite.config`.

### 3.0 `get-status` esteso (`packages/shared/src/ipc.ts`)

```ts
export const statusResultSchema = z.object({
  version: z.number().int().nonnegative(),
  safeStorageAvailable: z.boolean(),
  providerConfigured: z.boolean(),
  // Read-back della config persistita (mai la chiave). Assente se nessun provider salvato.
  provider: z
    .object({ baseUrl: z.string(), model: z.string(), hasApiKey: z.boolean() })
    .optional(),
});
```

`provider` è **opzionale-assente** (idioma del repo: omettere quando assente, niente `campo: undefined` sotto `exactOptionalPropertyTypes`). `hasApiKey` è un **booleano**, mai la chiave.

### 3.1 `settings.ts` — read-back senza decifratura + tri-stato

Nuovo helper di **sola metadata** (NON decifra la chiave → meno esposizione del segreto, e `get-status` può essere chiamato di frequente):

```ts
export interface ProviderMeta { baseUrl: string; model: string; hasApiKey: boolean; }

/** Metadata della config persistita SENZA decifrare la chiave (hasApiKey = ciphertext presente). */
export function loadProviderMeta(): ProviderMeta | undefined {
  const path = settingsPath();
  if (!existsSync(path)) return undefined;
  const stored = readStored(path);
  if (stored === undefined) return undefined;
  return { baseUrl: stored.baseUrl, model: stored.model, hasApiKey: stored.apiKeyEnc !== undefined };
}
```

`saveProviderConfig` diventa **tri-stato** su `apiKey` (preserva/cancella/sostituisce):

```ts
export function saveProviderConfig(config: ProviderConfig): void {
  const stored: StoredSettings = { baseUrl: config.baseUrl, model: config.model };
  if (config.apiKey === undefined) {
    // mantieni: riporta avanti il ciphertext esistente, se presente
    const prior = readStored(settingsPath());
    if (prior?.apiKeyEnc !== undefined) stored.apiKeyEnc = prior.apiKeyEnc;
  } else if (config.apiKey !== '') {
    if (!safeStorage.isEncryptionAvailable())
      throw new Error('safeStorage non disponibile: impossibile cifrare la chiave API');
    stored.apiKeyEnc = safeStorage.encryptString(config.apiKey).toString('base64');
  }
  // config.apiKey === '' -> cancella: apiKeyEnc resta assente
  writeFileSync(settingsPath(), JSON.stringify(stored), 'utf8');
}
```

`loadProviderConfig` (decifratura) resta invariato; è il percorso usato **al boot** e **da set-provider** per configurare l'holder.

> **Nota di sicurezza:** `get-status` usa `loadProviderMeta` (nessuna decifratura); la chiave si decifra solo in `loadProviderConfig`, chiamato deliberatamente al boot e su `set-provider`. La superficie di esposizione della chiave non cresce.

### 3.2 Handler `set-provider` — riconfigura dalla config effettiva (merge)

Dopo `saveProviderConfig` (che può aver **preservato** la chiave), l'holder va configurato con la config **effettiva** (chiave inclusa), rileggendo da disco:

```ts
ipcMain.handle(IPC_CHANNELS.setProvider, async (_e, raw): Promise<ProviderResult> => {
  const parsed = providerConfigSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: `Config provider non valida: ${parsed.error.message}` };
  try {
    saveProviderConfig(parsed.data);
    const effective = loadProviderConfig(); // config unita: include la chiave preservata
    if (effective === undefined) return { ok: false, error: 'Config provider non leggibile dopo il salvataggio' };
    holder.configure(createLanguageProvider(toLanguageProviderConfig(effective)));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
});
```

### 3.3 Handler `get-status` — include il read-back

```ts
ipcMain.handle(IPC_CHANNELS.getStatus, (): StatusResult => {
  const meta = loadProviderMeta();
  return {
    version: service.getReadModel().version,
    safeStorageAvailable: safeStorage.isEncryptionAvailable(),
    providerConfigured: holder.isConfigured(),
    ...(meta !== undefined ? { provider: meta } : {}),
  };
});
```

Il tipo `StatusResult` impone la forma del DTO (se `ProviderMeta` divergesse, `vue-tsc`/`tsc` fallirebbe qui — drift guard read, come canon/summary del Piano 0).

### 3.4 Self-test `LOOMN_SELFTEST` esteso

Estendere il flusso non-GUI (fase 1) per esercitare end-to-end: `set-provider` con stub deterministico → `get-status` ritorna `provider:{baseUrl,model,hasApiKey}` corretto; `dispatch(AddActor)` di un PG → read-model aggiornato con l'attore; un comando GM (es. `EnterPhase`) → fase cambiata. Il gate deve restare `VERDICT: PASS`.

---

## 4. Design — renderer (read-side, TDD)

Solo `app/desktop/src/renderer/src/**`; `@loomn/shared`/engine/host **intatti**; nessun nuovo Command/Event/IPC. Importa **solo** `@loomn/shared` (mai `@loomn/engine`).

### 4.1 Fonti di verità reattive

- **`stores/provider-status.ts` (`useProviderStatusStore`):** tiene `{providerConfigured, provider?, safeStorageAvailable}` da `get-status`; espone `refresh()` (richiama `get-status`). Chiamato al boot e dopo ogni `set-provider` ok. **Unica sorgente** per: gating first-run, pre-fill Impostazioni, indicatore `hasApiKey`, e il segnale `canRunTurn` (= `providerConfigured`) che 10b consumerà per abilitare/disabilitare il turno.
- **`stores/ruleset.ts` (`useRulesetStore`):** fetch-once di `get-ruleset` (statico per sessione); espone `vocabulary`, `difficulties`, `softPhases`, `questOutcomes`, `directions`, `commandPhaseRules`. Consumato dai form PG e Regia. Gestisce lo stato di errore (DTO `{ok:false}`).

### 4.2 Impostazioni (`views/SettingsView.vue`)

Form provider:
- **baseUrl**, **model**: pre-compilati dal read-back (`store.provider`).
- **apiKey** (campo password, tri-stato):
  - `hasApiKey === false` (nessuna chiave, es. first-run o LM Studio locale): input opzionale; vuoto = nessuna chiave, digitato = imposta.
  - `hasApiKey === true` (chiave configurata): indicatore "chiave configurata"; **vuoto = mantieni** (il renderer **omette** `apiKey` dal payload), **digitato = sostituisci**, azione esplicita "Rimuovi chiave" = invia `apiKey: ''`.
- **Salva** → `setProvider({baseUrl, model, apiKey?})` → su `ok` chiama `providerStatus.refresh()` + feedback; su errore mostra il messaggio tipizzato.
- **Diagnostica**: `providerConfigured`, `safeStorageAvailable` da `get-status` (utile per capire perché una chiave non si salva).

La logica di costruzione del payload (`buildProviderPayload(form, hasApiKey)`) è una **funzione pura testabile** (omette/imposta/cancella `apiKey` secondo lo stato del form).

### 4.3 First-run (in `App.vue` + bootstrap `renderer.ts`)

- Al boot, dopo l'idratazione dello store, se `providerConfigured === false`: `router.replace('/impostazioni')` **una sola volta** (flag one-shot a livello di modulo/app → non è un hard gate; l'utente può poi navigare via).
- **Banner globale** (componente in `App.vue`, es. `components/FirstRunBanner.vue`): mostrato quando `!providerConfigured`, **dismissibile** (stato locale di dismiss), CTA → `/impostazioni`. Sparisce reattivamente quando `set-provider` riesce (lo store si aggiorna).
- Framing di benvenuto in Impostazioni quando `!providerConfigured` (testo introduttivo "configura un provider AI per dare voce al Master").

### 4.4 Creazione PG (`views/CompanyView.vue`)

- Azione "Aggiungi PG/PNG" → form (in un `LoomnDialog`) **data-driven** dal `useRulesetStore`:
  - **name** (string), **kind** (`pc`/`npc`), un input numerico per ogni `vocabulary.attributes`, uno per ogni `vocabulary.skills`, le **risorse** pre-compilate da `vocabulary.defaultResources` (pool `{current,max}` editabili), `conditions: []`, `items: []`, `progression: {xp:0, level:1}`.
  - **id**: generato lato renderer da `buildActorId(name, existingIds)` (slug del nome + disambiguatore controllato contro gli id già nello store → unicità garantita).
- Submit → costruisce l'`Actor` completo con `buildActor(form, ruleset, existingIds)` (**funzione pura testabile** che mappa il vocabolario → i record `attributes`/`skills`/`resources`) → `dispatch(AddActor)`; su `ok` chiude e il read-model push aggiorna il roster, su errore mostra il messaggio.

### 4.5 Controlli GM — Regia slide-over

- **Trigger** globale nella topbar di `App.vue` (es. bottone "Regia") → apre uno slide-over (su `LoomnDialog`/Reka o un pannello laterale bespoke sul design system).
- **I 6 Command non-combat** (i combat — StartEncounter/Attack/EndTurn/NextRound — sono **fuori ambito**, vanno a 10c):
  - `RequestCheck`: `actorId` (da `store.actors`), `attribute`/`skill` (da `vocabulary`), `difficulty` (da `DIFFICULTIES`/`ruleset.difficulties`).
  - `ApplyEffect`: `targetId`, `resource` (da `vocabulary.resources`), `direction` (`RESOURCE_DIRECTIONS`), `dice` (lista di `DieGroup` count/sides), `bonus?`.
  - `StartQuest`: `id`, `title`, `description?`.
  - `AdvanceQuest`: `questId` (da `store.quests`), `status` (`QUEST_OUTCOMES`).
  - `EnterPhase`: `to` (`SOFT_PHASES`).
  - `EndEncounter`: nessun campo.
- **Disabilitazione proattiva per fase:** funzione pura `isGmCommandEnabled(type, phase, commandPhaseRules)` (**testabile**): un comando è disabilitato se è `combatOnly` e la fase non è `combat`, oppure è `nonCombatOnly` e si è in combat. La sorgente è `get-ruleset.commandPhaseRules` (non liste hardcoded) + `store.phase`.
- Submit di un comando → `dispatch(command)` → feedback `ok`/errore. Il read-model push aggiorna lo stato.

---

## 5. Strategia di verifica (mix a strati, spec Piano 10 §9)

- **Layer logico (TDD vero):** funzioni pure e store/selector — `buildProviderPayload`, `buildActorId`, `buildActor`, `isGmCommandEnabled`, reattività di `useProviderStatusStore`/`useRulesetStore`, gating first-run → **Vitest + Vue Test Utils (jsdom)**, già configurati da 10a (`vitest.workspace.ts` dalla **root**).
- **Component test selettivi:** dove c'è logica/stato reale (form provider tri-stato, form PG data-driven, enablement Regia), non per i puramente presentazionali.
- **Self-test `LOOMN_SELFTEST` esteso (gate "esegui l'app"):** §3.4 — `set-provider` → read-back; `AddActor`; comando GM. `VERDICT: PASS` su Electron reale (2 fasi).
- **Prova visiva:** screenshot degli stati chiave (Impostazioni con read-back, banner first-run, form creazione PG, Regia con comandi disabilitati per fase) allegati alla verifica.
- **Fuori:** Playwright E2E (YAGNI).

**Disciplina di config (house rule §5.1):** la config test del renderer esiste già da 10a → **non si tocca**. Se per assurdo servisse (non previsto), è un **passo orchestratore dichiarato**, mai dai subagent.

---

## 6. Fuori ambito / deferiti (esplicito)

- **Input del turno / chat narrazione** → **10b** (10f fornisce il segnale `canRunTurn`, non l'input).
- **Controlli GM di combattimento** (StartEncounter/Attack/EndTurn/NextRound) → **10c** (cockpit scontro).
- **Inventario profondo / equip / movimento in zona** → display-only/feature deferite (la creazione PG parte con `items: []`).
- **Streaming del turno**, **multi-campagna**, **delta read-model (§13)** → deferiti.
- **Canale `get-provider` dedicato** → scartato (decisione A): il read-back vive in `get-status`.

---

## 7. Decomposizione in task (sketch — il piano la rifinirà)

| Task | Cosa consegna | File principali | Test |
|---|---|---|---|
| **1 · Backend read-back + tri-stato** | `get-status` esteso (`provider?:{baseUrl,model,hasApiKey}`), `loadProviderMeta`, `saveProviderConfig` tri-stato, `set-provider` riconfigura da config effettiva, self-test esteso | `shared/ipc.ts` (+test), `main/settings.ts`, `main/index.ts`, `renderer.ts` (self-test) | schema shared + settings (Node ABI) |
| **2 · Store reattivi** | `useProviderStatusStore` + `useRulesetStore` (fetch-once, refresh, errore) | `stores/provider-status.ts`, `stores/ruleset.ts` | Vitest jsdom |
| **3 · Impostazioni** | form provider (read-back prefill, tri-stato chiave, set-provider, diagnostica), `buildProviderPayload` | `views/SettingsView.vue`, helper | pura + component |
| **4 · First-run** | auto-navigate one-shot + banner globale dismissibile + framing benvenuto | `App.vue`, `components/FirstRunBanner.vue`, `renderer.ts` | gating logic |
| **5 · Creazione PG** | form data-driven in Compagnia, `buildActorId`, `buildActor`, dispatch AddActor | `views/CompanyView.vue`, helper | pura + component |
| **6 · Regia GM** | slide-over (trigger topbar) coi 6 Command non-combat, `isGmCommandEnabled`, dispatch | `App.vue` (trigger), `components/GmConsole.vue` (o `views`), helper | pura + component |

Conteggi test attesi (cumulativi) li fissa il piano. Ogni task: file esatti, codice completo (no placeholder), comandi con output atteso, un commit, disciplina di scope. Grep anti-apostrofo (`(it|describe)\('[^']*'[A-Za-zàèéìòù]` → no matches) prima del commit del doc.

---

## 8. Riferimenti

- **Autorità Piano 10:** `docs/superpowers/specs/2026-06-17-piano10-ui-design.md` (§3 design language, §4 IA, §8 lacune, §10 decomposizione — riga 10f).
- **HANDOFF:** `docs/superpowers/HANDOFF.md` §0-octodecies (10g fatto + lacune 10f), §0-sexdecies (Piano 0 + lacuna provider punto A), §0-septdecies (10a), §4 processo, §5 house rules.
- **Contratto IPC:** `packages/shared/src/ipc.ts` (`statusResultSchema`, `providerConfigSchema`, `rulesetResultSchema`). **Command:** `packages/shared/src/domain-schema.ts` (`commandSchema`, enum const). **Settings/provider:** `app/desktop/src/main/settings.ts`, `provider-holder.ts`, `index.ts`. **Renderer:** `app/desktop/src/renderer/src/**` (10a).
- **Memoria:** [[loomn-project]], [[loomn-piano10-design]], [[loomn-working-style]].
