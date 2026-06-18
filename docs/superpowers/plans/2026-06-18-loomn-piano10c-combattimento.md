# Piano 10c — Combattimento (cockpit scontro + zone display-only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Riempire il pannello Scontro del Gioco con un cockpit di combattimento (iniziativa/round/turni + zone display-only) alimentato dal read-model, e cablare i controlli combat (StartEncounter/Attack/EndTurn/NextRound/EndEncounter) attraverso il seam `use-dispatch` cosi i tiri animano i dadi 3D di 10b.

**Architecture:** Renderer-only sul backend gia pronto. Il read-model `{version, state}` (spinto da `read-model-push`) porta gia `state.encounter` PRE-ORDINATO per iniziativa (`createEncounter`) con `turnIndex` diretto: una funzione PURA mappa l encounter nella vista del cockpit (ordine di turno + raggruppamento per zona + join con gli attori per nome/risorse/stato "a terra"). I controlli combat sono emessi via il composable `composables/use-dispatch.ts` (NON `window.loomn.dispatch` diretto) che accoda i `RollResult` degli `events` alla coda dadi → i dadi 3D di 10b animano i tiri di attacco. Le **zone sono display-only** (label/raggruppamento dalla stringa `participants[].zone`): NIENTE mappa spaziale, NIENTE azione muovi (topologia/movimento = traccia engine deferita post-Piano-10, spec §11). Builder di Command puri (cast-free, PLAIN per la clone IPC). Nessun nuovo Command/Event/IPC/dipendenza/CSP.

**Tech Stack:** Vue 3 + TS strict, Pinia, Vue Test Utils (jsdom), Vitest. Nessuna nuova dipendenza, nessun passo orchestratore su `package.json`/CSP/`electron.vite.config`.

**Spec di riferimento:** `docs/superpowers/specs/2026-06-17-piano10-ui-design.md` (§4 layout adattivo per fase, §5 read-side, §7 audit binding, §10 riga 10c, §11 zone/movimento deferiti). HANDOFF §0-vicies (10b + seam dispatch→dadi), §4 (processo), §5 (house rules), §8 (roadmap: movimento zona deferito).

**Decisioni di design (gia fissate dallo spec autorita + decisioni di placement di questo piano):**
- Il **cockpit (`EncounterPanel`)** e la superficie di combattimento: vive nel pannello `encounter` del preset combat (10a lo mostra al posto della scheda in `[data-phase='combat']`). Ospita il display (round/turno/iniziativa/zone) + i comandi **IN-combat** ad alta frequenza: **Fine turno** (EndTurn), **Round successivo** (NextRound), **Termina scontro** (EndEncounter) e un affordance **Attacco** (attaccante = partecipante di turno). Tutti via `use-dispatch`.
- **StartEncounter** e l ENTRATA in combat (`nonCombatOnly`): il cockpit non e visibile fuori combat, quindi vive nella **Regia (`GmConsole`)** — l unica superficie GM sempre visibile. 10c lo aggiunge ai `GM_COMMANDS` e **rimuove `EndEncounter`** dalla Regia (ora di proprieta del cockpit; in Regia era abilitato solo in combat = quando il cockpit e visibile, quindi ridondante). Net: la porta non-combat→combat vive nella Regia, la porta combat→non-combat nel cockpit (simmetria col modello di fase).
- **Re-theme combat:** l accento `--clay` per `[data-phase='combat']` e gia applicato da 10a su `App.vue` (root `[data-phase]`); i pannelli ereditano `var(--accent)`. Il cockpit usa `var(--accent)` per l evidenziazione del turno corrente → vira clay in combat senza nuovi token.

---

## Fuori ambito (esplicito, deferito)

- **Movimento / topologia di zona** (mappa spaziale, azione muovi): traccia engine DEFERITA post-Piano-10 (spec §11, HANDOFF §8). L engine ha la matematica (`zone.ts`, `encounter.ts:moveParticipant`) ma NON e cablata a `Command`/`Event` e nessuna topologia vive in `GameState`/`Ruleset`. 10c rende le zone **display-only** (label/raggruppamento da `participants[].zone`).
- **Scheda + inventario** (10d), **Diario + Compagnia** (10e).
- **Streaming token-by-token** del turno (spec §11): gia deferito da 10b.
- **Dadi 3D** (rendering WebGL): gia consegnati e validati da 10b/spike; 10c li riusa via il seam `use-dispatch` (gia cablato) — nessuna modifica a `DiceCanvas`/`DicePanel`.
- **Modificatori d attacco avanzati** (`damageModifiers`, check contrapposti, attribute/skill nell affordance Attacco del cockpit): l affordance MVP usa `defense`/`defenseBase`/`damageResource` dal vocabolario (l engine accetta un attacco senza attribute/skill — `actorCheck` usa i dadi base). `damageModifiers`/attribute/skill restano disponibili via l engine ma non esposti nel cockpit (YAGNI; la Regia copre i casi manuali avanzati).
- Nessuna modifica a `@loomn/shared`/engine/host, nessun nuovo Command/Event/IPC/tabella/migrazione/dipendenza/CSP.

---

## File Structure

**Nessun passo orchestratore preliminare** (a differenza di 10b: nessuna nuova dipendenza, nessun asset, nessuna modifica a `package.json`/CSP/`electron.vite.config`). L orchestratore: (a) committa questo doc su `main`, (b) crea il branch `feat/piano10c-combattimento`, (c) a fine branch esegue il **gate Electron** (rebuild:electron + self-test 2 fasi), (d) merge ff + `git push origin main`.

**Subagent tasks (renderer-only, TDD):**
- `app/desktop/src/renderer/src/lib/encounter-view.ts` (+test) — Task 1: mappa PURA `encounter` read-model → vista cockpit (ordine di turno + zone + join attori). **Il cuore testabile.**
- `app/desktop/src/renderer/src/lib/combat-commands.ts` (+test) — Task 2: builder PURI dei Command combat (`buildAttack`, `buildStartEncounter`, `endTurn`/`nextRound`/`endEncounter`).
- `app/desktop/src/renderer/src/components/EncounterPanel.vue` (+test) — Task 3: il cockpit (display + controlli IN-combat via `use-dispatch`).
- `app/desktop/src/renderer/src/lib/gm-commands.ts` (+test) + `app/desktop/src/renderer/src/components/GmConsole.vue` (+test) — Task 4: Regia += StartEncounter (builder partecipanti), −= EndEncounter.
- `app/desktop/src/renderer/src/views/GameView.vue` (+ aggiorna `GameView.test.ts`) + `app/desktop/src/renderer/src/renderer.ts` (self-test) — Task 5: wiring del cockpit nel pannello `encounter` + estensione del gate.

**Disciplina di scope (CRITICO, in OGNI prompt di task):** il subagent modifica SOLO i file elencati nel suo task. MAI toccare `package.json`/`tsconfig*`/`vitest.config`/`vitest.workspace`/`electron.vite.config`/`index.html` (CSP)/`tokens.css`. `git status --short` prima di ogni commit. Niente apostrofi nelle stringhe `it('...')`/`describe('...')` in apici singoli (usa "l ordine", "c e"; `è/é` vanno bene). **Lezioni 10b/10f:** ogni payload verso `dispatch`/IPC deve essere PLAIN (i builder ritornano oggetti literal, mai proxy `reactive`); usa i TOKEN CSS REALI di `styles/tokens.css` (`--text`/`--text-2`/`--text-3`/`--accent`/`--accent-dim`/`--line`/`--line-2`/`--well`/`--panel`/`--f-read`/`--f-ui`/`--f-mono`/`--f-display`/`--bad`/`--ok`/`--clay`/`--r`/`--r-sm`/`--r-xs`) — NON inventare nomi; i componenti usano `<LoomnPanel>` (NON `<form>`: `LoomnButton` renderizza `<button type=submit>`).

---

## Task 1: `lib/encounter-view.ts` — mappa PURA encounter → vista cockpit

**Files:**
- Create: `app/desktop/src/renderer/src/lib/encounter-view.ts`
- Test: `app/desktop/src/renderer/src/lib/encounter-view.test.ts`

La funzione cardine: l engine ha gia ordinato i partecipanti per iniziativa (`createEncounter`) e `turnIndex` e diretto — la UI NON ri-ordina. Qui derivo la vista: ordine di turno (con flag `isCurrent`), raggruppamento per zona (display-only, ordine di prima apparizione), join con gli attori per nome/risorse/stato "a terra" (condizione `morente`, aggiunta dall engine con `ActorDowned`).

- [ ] **Step 1: Scrivi il test che fallisce**

Create `app/desktop/src/renderer/src/lib/encounter-view.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toEncounterView, DOWNED_CONDITION_KEY } from './encounter-view';
import type { EncounterView, ActorView } from '../stores/read-model';

function actor(over: Partial<ActorView> & { id: string }): ActorView {
  return {
    id: over.id,
    name: over.name ?? over.id,
    kind: over.kind ?? 'npc',
    attributes: over.attributes ?? {},
    skills: over.skills ?? {},
    resources: over.resources ?? {},
    conditions: over.conditions ?? [],
    items: over.items ?? [],
    progression: over.progression ?? { xp: 0, level: 1 },
  };
}

function encounter(over: Partial<NonNullable<EncounterView>> = {}): NonNullable<EncounterView> {
  return {
    id: over.id ?? 'enc1',
    participants: over.participants ?? [],
    round: over.round ?? 1,
    turnIndex: over.turnIndex ?? 0,
  };
}

describe('toEncounterView', () => {
  it('preserva l ordine di iniziativa del motore e marca il turno corrente', () => {
    const enc = encounter({
      turnIndex: 1,
      participants: [
        { actorId: 'a', zone: 'centro', initiative: 20, actedThisRound: true },
        { actorId: 'b', zone: 'centro', initiative: 10, actedThisRound: false },
      ],
    });
    const view = toEncounterView(enc, [actor({ id: 'a', name: 'Alfa' }), actor({ id: 'b', name: 'Beta' })]);
    expect(view.order.map((r) => r.actorId)).toEqual(['a', 'b']);
    expect(view.order[0]!.isCurrent).toBe(false);
    expect(view.order[1]!.isCurrent).toBe(true);
    expect(view.current?.actorId).toBe('b');
  });

  it('riporta round e turnIndex dal read-model', () => {
    const view = toEncounterView(
      encounter({ round: 3, turnIndex: 0, participants: [{ actorId: 'a', zone: 'centro', initiative: 5, actedThisRound: false }] }),
      [actor({ id: 'a' })],
    );
    expect(view.round).toBe(3);
    expect(view.turnIndex).toBe(0);
  });

  it('arricchisce la riga con nome e risorse dell attore', () => {
    const enc = encounter({ participants: [{ actorId: 'hero', zone: 'centro', initiative: 12, actedThisRound: false }] });
    const view = toEncounterView(enc, [actor({ id: 'hero', name: 'Eroe', resources: { hp: { current: 7, max: 10 } } })]);
    expect(view.order[0]!.name).toBe('Eroe');
    expect(view.order[0]!.resources).toEqual([{ key: 'hp', current: 7, max: 10 }]);
  });

  it('per un attore sconosciuto usa l id come nome e risorse vuote', () => {
    const enc = encounter({ participants: [{ actorId: 'ghost', zone: 'centro', initiative: 1, actedThisRound: false }] });
    const view = toEncounterView(enc, []);
    expect(view.order[0]!.name).toBe('ghost');
    expect(view.order[0]!.resources).toEqual([]);
    expect(view.order[0]!.isDowned).toBe(false);
  });

  it('marca a terra chi ha la condizione morente', () => {
    const downed = actor({
      id: 'x',
      conditions: [{ key: DOWNED_CONDITION_KEY, source: 'combat', effects: [], duration: { kind: 'permanent' } }],
    });
    const enc = encounter({ participants: [{ actorId: 'x', zone: 'centro', initiative: 8, actedThisRound: false }] });
    expect(toEncounterView(enc, [downed]).order[0]!.isDowned).toBe(true);
  });

  it('raggruppa per zona in ordine di prima apparizione', () => {
    const enc = encounter({
      participants: [
        { actorId: 'a', zone: 'fronte', initiative: 20, actedThisRound: false },
        { actorId: 'b', zone: 'retro', initiative: 15, actedThisRound: false },
        { actorId: 'c', zone: 'fronte', initiative: 10, actedThisRound: false },
      ],
    });
    const view = toEncounterView(enc, [actor({ id: 'a' }), actor({ id: 'b' }), actor({ id: 'c' })]);
    expect(view.zones.map((z) => z.zone)).toEqual(['fronte', 'retro']);
    expect(view.zones[0]!.participants.map((r) => r.actorId)).toEqual(['a', 'c']);
    expect(view.zones[1]!.participants.map((r) => r.actorId)).toEqual(['b']);
  });

  it('con turnIndex oltre la fine del round current e null', () => {
    const enc = encounter({
      turnIndex: 2,
      participants: [
        { actorId: 'a', zone: 'centro', initiative: 5, actedThisRound: true },
        { actorId: 'b', zone: 'centro', initiative: 3, actedThisRound: true },
      ],
    });
    expect(toEncounterView(enc, [actor({ id: 'a' }), actor({ id: 'b' })]).current).toBeNull();
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run (dalla root): `pnpm exec vitest run app/desktop/src/renderer/src/lib/encounter-view.test.ts`
Atteso: FAIL con "toEncounterView is not a function" / modulo inesistente.

- [ ] **Step 3: Implementa il minimo**

Create `app/desktop/src/renderer/src/lib/encounter-view.ts`:

```ts
import type { EncounterView, ActorView } from '../stores/read-model';

/** Chiave della condizione che l engine aggiunge con ActorDowned (engine events.ts): un partecipante
 *  e "a terra" se la porta. Mirror del literal engine (il renderer non importa engine per il dominio). */
export const DOWNED_CONDITION_KEY = 'morente';

/** Lettura di una risorsa (hp, ...) per la riga partecipante. */
export interface ResourceReadout {
  key: string;
  current: number;
  max: number;
}

/** Una riga dell ordine di iniziativa, gia arricchita coi dati dell attore. */
export interface ParticipantRow {
  actorId: string;
  name: string;
  initiative: number;
  zone: string;
  actedThisRound: boolean;
  isCurrent: boolean;
  isDowned: boolean;
  resources: ResourceReadout[];
}

/** Raggruppamento DISPLAY-ONLY per zona (label, NON topologia: il movimento e deferito post-10). */
export interface ZoneGroup {
  zone: string;
  participants: ParticipantRow[];
}

/** Vista del cockpit di scontro derivata dal read-model. */
export interface CockpitView {
  round: number;
  turnIndex: number;
  /** Ordine di iniziativa: gia PRE-ORDINATO dal motore (createEncounter) — NON ri-ordinare. */
  order: ParticipantRow[];
  /** Partecipanti raggruppati per zona, ordine di prima apparizione (display-only). */
  zones: ZoneGroup[];
  /** Il partecipante di turno (order[turnIndex]) o null se il round e completo. */
  current: ParticipantRow | null;
}

/** Mappa l encounter del read-model nella vista del cockpit. Pura: nessun side effect, nessun RNG. */
export function toEncounterView(
  encounter: NonNullable<EncounterView>,
  actors: readonly ActorView[],
): CockpitView {
  const byId = new Map(actors.map((a) => [a.id, a]));
  const order: ParticipantRow[] = encounter.participants.map((p, i) => {
    const actor = byId.get(p.actorId);
    return {
      actorId: p.actorId,
      name: actor?.name ?? p.actorId,
      initiative: p.initiative,
      zone: p.zone,
      actedThisRound: p.actedThisRound,
      isCurrent: i === encounter.turnIndex,
      isDowned: actor?.conditions.some((c) => c.key === DOWNED_CONDITION_KEY) ?? false,
      resources: actor
        ? Object.entries(actor.resources).map(([key, pool]) => ({ key, current: pool.current, max: pool.max }))
        : [],
    };
  });

  // Raggruppa per zona in ordine di prima apparizione (stesso pattern di toDicePlan).
  const zoneOrder: string[] = [];
  const byZone = new Map<string, ParticipantRow[]>();
  for (const row of order) {
    if (!byZone.has(row.zone)) {
      byZone.set(row.zone, []);
      zoneOrder.push(row.zone);
    }
    byZone.get(row.zone)!.push(row);
  }
  const zones: ZoneGroup[] = zoneOrder.map((zone) => ({ zone, participants: byZone.get(zone)! }));

  return {
    round: encounter.round,
    turnIndex: encounter.turnIndex,
    order,
    zones,
    current: order[encounter.turnIndex] ?? null,
  };
}
```

- [ ] **Step 4: Esegui il test e verifica che passa**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/lib/encounter-view.test.ts`
Atteso: PASS (7 test). `pnpm -C app/desktop typecheck` pulito.

- [ ] **Step 5: Commit**

```bash
git add app/desktop/src/renderer/src/lib/encounter-view.ts app/desktop/src/renderer/src/lib/encounter-view.test.ts
git commit -m "feat(renderer): mappa pura encounter read-model -> vista cockpit (ordine turno + zone)"
```

---

## Task 2: `lib/combat-commands.ts` — builder PURI dei Command combat

**Files:**
- Create: `app/desktop/src/renderer/src/lib/combat-commands.ts`
- Test: `app/desktop/src/renderer/src/lib/combat-commands.test.ts`

Builder cast-free che ritornano Command PLAIN (mai proxy reactive: la clone IPC rifiuta i Proxy — lezione 10b). `buildAttack` omette gli opzionali assenti; `buildStartEncounter` filtra i soli attori inclusi e ritorna null se nessuno. I tre comandi di turno sono literal.

- [ ] **Step 1: Scrivi il test che fallisce**

Create `app/desktop/src/renderer/src/lib/combat-commands.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildAttack, buildStartEncounter, endTurn, nextRound, endEncounter } from './combat-commands';

describe('buildAttack', () => {
  it('costruisce un Attack minimale omettendo attribute e skill', () => {
    const cmd = buildAttack({ attackerId: 'a', targetId: 'b', defense: 'difesa', defenseBase: 12, damageResource: 'hp' });
    expect(cmd).toEqual({ type: 'Attack', attackerId: 'a', targetId: 'b', defense: 'difesa', defenseBase: 12, damageResource: 'hp' });
  });

  it('include attribute e skill quando presenti', () => {
    const cmd = buildAttack({ attackerId: 'a', targetId: 'b', defense: 'difesa', defenseBase: 12, damageResource: 'hp', attribute: 'forza', skill: 'lame' });
    expect(cmd).toMatchObject({ attribute: 'forza', skill: 'lame' });
  });

  it('omette attribute e skill se stringa vuota', () => {
    const cmd = buildAttack({ attackerId: 'a', targetId: 'b', defense: 'difesa', defenseBase: 12, damageResource: 'hp', attribute: '', skill: '' });
    expect('attribute' in cmd).toBe(false);
    expect('skill' in cmd).toBe(false);
  });
});

describe('comandi di turno', () => {
  it('endTurn nextRound endEncounter sono literal del Command', () => {
    expect(endTurn()).toEqual({ type: 'EndTurn' });
    expect(nextRound()).toEqual({ type: 'NextRound' });
    expect(endEncounter()).toEqual({ type: 'EndEncounter' });
  });
});

describe('buildStartEncounter', () => {
  it('costruisce StartEncounter dai soli attori inclusi', () => {
    const cmd = buildStartEncounter('scontro-1', [
      { actorId: 'a', include: true, initiative: 18, zone: 'centro' },
      { actorId: 'b', include: false, initiative: 10, zone: 'retro' },
      { actorId: 'c', include: true, initiative: 12, zone: 'fronte' },
    ]);
    expect(cmd).toEqual({
      type: 'StartEncounter',
      encounterId: 'scontro-1',
      participants: [
        { actorId: 'a', zone: 'centro', initiative: 18 },
        { actorId: 'c', zone: 'fronte', initiative: 12 },
      ],
    });
  });

  it('ritorna null se nessun attore e incluso', () => {
    expect(buildStartEncounter('scontro-1', [{ actorId: 'a', include: false, initiative: 10, zone: 'centro' }])).toBeNull();
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/lib/combat-commands.test.ts`
Atteso: FAIL (modulo inesistente).

- [ ] **Step 3: Implementa il minimo**

Create `app/desktop/src/renderer/src/lib/combat-commands.ts`:

```ts
import type { DispatchCommand } from '@loomn/shared';

// Tipi derivati dal CONTRATTO IPC (z.input di commandSchema): il renderer NON importa engine.
type AttackCmd = Extract<DispatchCommand, { type: 'Attack' }>;
type StartEncounterCmd = Extract<DispatchCommand, { type: 'StartEncounter' }>;
type ParticipantInput = StartEncounterCmd['participants'][number];

/** Parametri dell affordance Attacco del cockpit (attribute/skill opzionali; senza, l engine usa i
 *  dadi base — actorCheck). */
export interface AttackParams {
  attackerId: string;
  targetId: string;
  defense: string;
  defenseBase: number;
  damageResource: string;
  attribute?: string;
  skill?: string;
}

/** Costruisce un Command Attack PLAIN (mai un proxy reactive: la clone IPC rifiuta i Proxy, lezione
 *  10b), omettendo gli opzionali assenti o vuoti (cast-free sotto exactOptionalPropertyTypes). */
export function buildAttack(p: AttackParams): AttackCmd {
  return {
    type: 'Attack',
    attackerId: p.attackerId,
    targetId: p.targetId,
    defense: p.defense,
    defenseBase: p.defenseBase,
    damageResource: p.damageResource,
    ...(p.attribute !== undefined && p.attribute !== '' ? { attribute: p.attribute } : {}),
    ...(p.skill !== undefined && p.skill !== '' ? { skill: p.skill } : {}),
  };
}

/** Comandi di turno (literal, nessun argomento). */
export const endTurn = (): DispatchCommand => ({ type: 'EndTurn' });
export const nextRound = (): DispatchCommand => ({ type: 'NextRound' });
export const endEncounter = (): DispatchCommand => ({ type: 'EndEncounter' });

/** Riga del builder di scontro: un attore candidato con inclusione/iniziativa/zona. */
export interface ParticipantRowInput {
  actorId: string;
  include: boolean;
  initiative: number;
  zone: string;
}

/** Costruisce StartEncounter dai soli attori inclusi (oggetti PLAIN). Ritorna null se nessuno e
 *  incluso (uno scontro senza partecipanti non ha senso per il cockpit). */
export function buildStartEncounter(
  encounterId: string,
  rows: readonly ParticipantRowInput[],
): StartEncounterCmd | null {
  const participants: ParticipantInput[] = rows
    .filter((r) => r.include)
    .map((r) => ({ actorId: r.actorId, zone: r.zone, initiative: r.initiative }));
  if (participants.length === 0) return null;
  return { type: 'StartEncounter', encounterId, participants };
}
```

- [ ] **Step 4: Esegui il test e verifica che passa**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/lib/combat-commands.test.ts`
Atteso: PASS (6 test). `pnpm -C app/desktop typecheck` pulito (i builder ritornano literal assegnabili a `DispatchCommand`).

- [ ] **Step 5: Commit**

```bash
git add app/desktop/src/renderer/src/lib/combat-commands.ts app/desktop/src/renderer/src/lib/combat-commands.test.ts
git commit -m "feat(renderer): builder puri dei Command combat (Attack/StartEncounter/EndTurn/NextRound/EndEncounter)"
```

---

## Task 3: `components/EncounterPanel.vue` — il cockpit di scontro

**Files:**
- Create: `app/desktop/src/renderer/src/components/EncounterPanel.vue`
- Test: `app/desktop/src/renderer/src/components/EncounterPanel.test.ts`

Il cockpit: legge `useReadModelStore().encounter`/`actors`, mappa via `toEncounterView`, mostra round/turno corrente/ordine d iniziativa (evidenzia il turno con `var(--accent)` → clay in combat) + raggruppamento per zona (display-only) + risorse e stato "a terra". Controlli IN-combat via `use-dispatch` (così i `RollResult` dell attacco animano i dadi 3D di 10b): **Fine turno**, **Round successivo**, **Termina scontro**, e un affordance **Attacco** (attaccante = partecipante di turno; bersaglio/difesa/risorsa dal vocabolario di 10g). Stato vuoto se nessuno scontro. Usa `<LoomnPanel>` (NON `<form>`).

- [ ] **Step 1: Scrivi il test che fallisce**

Create `app/desktop/src/renderer/src/components/EncounterPanel.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import type { RulesetResult, ReadModelPush } from '@loomn/shared';
import EncounterPanel from './EncounterPanel.vue';
import { useReadModelStore } from '../stores/read-model';

const RULESET: Extract<RulesetResult, { ok: true }> = {
  ok: true,
  vocabulary: { attributes: ['forza'], skills: ['lame'], resources: ['hp'], defenses: ['difesa'], defaultResources: {} },
  difficulties: ['moderate'],
  softPhases: ['exploration'],
  questOutcomes: ['completed'],
  directions: ['restore', 'drain'],
  commandPhaseRules: { combatOnly: [], nonCombatOnly: [] },
};

// LoomnPanel/LoomnButton stub passthrough (gli attr come :disabled cadono sul root via fallthrough).
const stubs = {
  LoomnPanel: { template: '<div><slot /></div>' },
  LoomnButton: { template: '<button><slot /></button>' },
};

function combatPush(): ReadModelPush {
  return {
    version: 2,
    state: {
      version: 2,
      phase: 'combat',
      quests: {},
      actors: {
        a: { id: 'a', name: 'Alfa', kind: 'pc', attributes: {}, skills: {}, resources: { hp: { current: 8, max: 10 } }, conditions: [], items: [], progression: { xp: 0, level: 1 } },
        b: { id: 'b', name: 'Beta', kind: 'npc', attributes: {}, skills: {}, resources: { hp: { current: 4, max: 6 } }, conditions: [{ key: 'morente', source: 'combat', effects: [], duration: { kind: 'permanent' } }], items: [], progression: { xp: 0, level: 1 } },
      },
      encounter: {
        id: 'enc1', round: 2, turnIndex: 0,
        participants: [
          { actorId: 'a', zone: 'fronte', initiative: 18, actedThisRound: false },
          { actorId: 'b', zone: 'retro', initiative: 9, actedThisRound: true },
        ],
      },
    },
  };
}

describe('EncounterPanel', () => {
  let dispatch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    setActivePinia(createPinia());
    dispatch = vi.fn(() => Promise.resolve({ ok: true as const, version: 3, events: [] }));
    window.loomn = { getRuleset: () => Promise.resolve(RULESET), dispatch } as unknown as typeof window.loomn;
  });

  function mountPanel() {
    const pinia = createPinia();
    setActivePinia(pinia);
    useReadModelStore().applyPush(combatPush());
    return mount(EncounterPanel, { global: { plugins: [pinia], stubs } });
  }

  function clickByText(w: ReturnType<typeof mount>, text: string): Promise<void> {
    const btn = w.findAll('button').find((b) => b.text() === text);
    return btn!.trigger('click');
  }

  it('mostra round, turno corrente, ordine e stato a terra', async () => {
    const w = mountPanel();
    await flushPromises();
    expect(w.text()).toContain('round 2');
    expect(w.text()).toContain('Alfa');
    expect(w.text()).toContain('Beta');
    expect(w.text()).toContain('a terra');
  });

  it('raggruppa i partecipanti per zona', async () => {
    const w = mountPanel();
    await flushPromises();
    expect(w.text()).toContain('fronte');
    expect(w.text()).toContain('retro');
  });

  it('Fine turno dispaccia EndTurn', async () => {
    const w = mountPanel();
    await flushPromises();
    await clickByText(w, 'Fine turno');
    expect(dispatch).toHaveBeenCalledWith({ type: 'EndTurn' });
  });

  it('Round successivo dispaccia NextRound', async () => {
    const w = mountPanel();
    await flushPromises();
    await clickByText(w, 'Round successivo');
    expect(dispatch).toHaveBeenCalledWith({ type: 'NextRound' });
  });

  it('Termina scontro dispaccia EndEncounter', async () => {
    const w = mountPanel();
    await flushPromises();
    await clickByText(w, 'Termina scontro');
    expect(dispatch).toHaveBeenCalledWith({ type: 'EndEncounter' });
  });

  it('Attacca dispaccia Attack con l attaccante di turno', async () => {
    const w = mountPanel();
    await flushPromises();
    await w.find('select[aria-label="bersaglio"]').setValue('b');
    await w.find('select[aria-label="difesa"]').setValue('difesa');
    await w.find('select[aria-label="risorsa danno"]').setValue('hp');
    await clickByText(w, 'Attacca');
    expect(dispatch).toHaveBeenCalledWith({ type: 'Attack', attackerId: 'a', targetId: 'b', defense: 'difesa', defenseBase: 10, damageResource: 'hp' });
  });

  it('senza scontro mostra lo stato vuoto', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useReadModelStore().applyPush({ version: 1, state: { version: 1, phase: 'combat', quests: {}, actors: {}, encounter: null } });
    const w = mount(EncounterPanel, { global: { plugins: [pinia], stubs } });
    await flushPromises();
    expect(w.text()).toContain('Nessuno scontro attivo');
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/components/EncounterPanel.test.ts`
Atteso: FAIL (componente inesistente).

- [ ] **Step 3: Implementa il minimo**

Create `app/desktop/src/renderer/src/components/EncounterPanel.vue`:

```vue
<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import LoomnPanel from './LoomnPanel.vue';
import LoomnButton from './LoomnButton.vue';
import { useReadModelStore } from '../stores/read-model';
import { useRulesetStore } from '../stores/ruleset';
import { useDispatch } from '../composables/use-dispatch';
import { toEncounterView } from '../lib/encounter-view';
import { buildAttack, endTurn, nextRound, endEncounter } from '../lib/combat-commands';
import type { DispatchCommand } from '@loomn/shared';

const store = useReadModelStore();
const ruleset = useRulesetStore();
// use-dispatch: dispaccia il Command E accoda i RollResult degli events alla coda dadi (seam 10b).
const { dispatch } = useDispatch();

onMounted(() => void ruleset.load());

const view = computed(() => (store.encounter ? toEncounterView(store.encounter, store.actors) : null));
const vocab = computed(() => ruleset.vocabulary);
const feedback = ref<{ kind: 'ok' | 'error'; msg: string } | null>(null);

// Affordance Attacco: l attaccante e il partecipante di turno (view.current); il bersaglio e gli altri.
const atk = reactive({ targetId: '', defense: '', defenseBase: 10, damageResource: '' });
const targets = computed(() =>
  view.value ? view.value.order.filter((r) => r.actorId !== view.value?.current?.actorId) : [],
);
const canAttack = computed(
  () => Boolean(view.value?.current) && atk.targetId !== '' && atk.defense !== '' && atk.damageResource !== '',
);

async function send(command: DispatchCommand): Promise<void> {
  feedback.value = null;
  const res = await dispatch(command);
  feedback.value = res.ok ? { kind: 'ok', msg: 'Comando applicato.' } : { kind: 'error', msg: res.error };
}

function attack(): void {
  const attacker = view.value?.current;
  if (attacker === null || attacker === undefined) return;
  // buildAttack ritorna un literal PLAIN (mai il proxy reactive di atk): clone IPC sicura (lezione 10b).
  void send(
    buildAttack({
      attackerId: attacker.actorId,
      targetId: atk.targetId,
      defense: atk.defense,
      defenseBase: atk.defenseBase,
      damageResource: atk.damageResource,
    }),
  );
}
</script>

<template>
  <LoomnPanel title="Scontro" eyebrow="combattimento" :meta="view ? `round ${view.round}` : ''">
    <div v-if="view" class="cockpit">
      <p class="cockpit__turn">Turno di <strong>{{ view.current?.name ?? '-' }}</strong></p>

      <ol class="order">
        <li
          v-for="row in view.order"
          :key="row.actorId"
          class="order__row"
          :class="{ 'order__row--current': row.isCurrent, 'order__row--downed': row.isDowned }"
        >
          <span class="order__init">{{ row.initiative }}</span>
          <span class="order__name">{{ row.name }}</span>
          <span class="order__res">
            <template v-for="r in row.resources" :key="r.key">{{ r.key }} {{ r.current }}/{{ r.max }} </template>
          </span>
          <span v-if="row.actedThisRound" class="order__tag">agito</span>
          <span v-if="row.isDowned" class="order__tag order__tag--bad">a terra</span>
        </li>
      </ol>

      <div class="zones">
        <div v-for="z in view.zones" :key="z.zone" class="zones__group">
          <span class="zones__label">{{ z.zone }}</span>
          <span class="zones__members">{{ z.participants.map((p) => p.name).join(', ') }}</span>
        </div>
      </div>

      <div class="actions">
        <LoomnButton variant="solid" @click="send(endTurn())">Fine turno</LoomnButton>
        <LoomnButton variant="ghost" @click="send(nextRound())">Round successivo</LoomnButton>
        <LoomnButton variant="ghost" @click="send(endEncounter())">Termina scontro</LoomnButton>
      </div>

      <div class="attack">
        <h4 class="attack__title">Attacco</h4>
        <div class="attack__row">
          <select v-model="atk.targetId" class="inp" aria-label="bersaglio">
            <option value="">bersaglio</option>
            <option v-for="t in targets" :key="t.actorId" :value="t.actorId">{{ t.name }}</option>
          </select>
          <select v-model="atk.defense" class="inp" aria-label="difesa">
            <option value="">difesa</option>
            <option v-for="d in vocab?.defenses ?? []" :key="d" :value="d">{{ d }}</option>
          </select>
          <input v-model.number="atk.defenseBase" class="inp" type="number" aria-label="defenseBase" />
          <select v-model="atk.damageResource" class="inp" aria-label="risorsa danno">
            <option value="">risorsa</option>
            <option v-for="r in vocab?.resources ?? []" :key="r" :value="r">{{ r }}</option>
          </select>
          <LoomnButton variant="solid" :disabled="!canAttack" @click="attack">Attacca</LoomnButton>
        </div>
      </div>

      <p v-if="feedback" class="cockpit__feedback" :class="`cockpit__feedback--${feedback.kind}`">{{ feedback.msg }}</p>
    </div>
    <p v-else class="cockpit__empty">Nessuno scontro attivo.</p>
  </LoomnPanel>
</template>

<style scoped>
.cockpit { display: flex; flex-direction: column; gap: 12px; height: 100%; min-height: 0; }
.cockpit__turn { margin: 0; font-size: 13px; color: var(--text-2); }
.cockpit__turn strong { color: var(--text); font-family: var(--f-display); }
.order { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; overflow: auto; min-height: 0; }
.order__row { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--well); }
.order__row--current { border-color: var(--accent); background: var(--accent-dim); }
.order__row--downed { opacity: 0.55; }
.order__init { font-family: var(--f-mono); font-size: 13px; color: var(--accent); min-width: 26px; text-align: right; }
.order__name { color: var(--text); flex: 1; }
.order__res { font-family: var(--f-mono); font-size: 11px; color: var(--text-3); }
.order__tag { font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }
.order__tag--bad { color: var(--bad); }
.zones { display: flex; flex-wrap: wrap; gap: 8px; }
.zones__group { display: flex; flex-direction: column; gap: 2px; padding: 6px 10px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--panel); }
.zones__label { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-3); }
.zones__members { font-size: 12px; color: var(--text-2); }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.attack { border-top: 1px solid var(--line); padding-top: 10px; }
.attack__title { margin: 0 0 8px; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-2); }
.attack__row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.inp { font: inherit; font-family: var(--f-mono); font-size: 12px; color: var(--text); background: var(--panel); border: 1px solid var(--line-2); border-radius: 8px; padding: 6px 9px; }
.inp[type='number'] { width: 64px; }
.cockpit__feedback { font-size: 12px; margin: 0; }
.cockpit__feedback--ok { color: var(--accent); }
.cockpit__feedback--error { color: var(--bad); }
.cockpit__empty { color: var(--text-3); font-size: 13px; }
</style>
```

- [ ] **Step 4: Esegui il test e verifica che passa**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/components/EncounterPanel.test.ts`
Atteso: PASS (7 test). `pnpm -C app/desktop typecheck` pulito.

- [ ] **Step 5: Commit**

```bash
git add app/desktop/src/renderer/src/components/EncounterPanel.vue app/desktop/src/renderer/src/components/EncounterPanel.test.ts
git commit -m "feat(renderer): cockpit scontro (iniziativa/round/turni + zone display-only + controlli combat via use-dispatch)"
```

---

## Task 4: Regia += StartEncounter, −= EndEncounter (`gm-commands.ts` + `GmConsole.vue`)

**Files:**
- Modify: `app/desktop/src/renderer/src/lib/gm-commands.ts`
- Modify: `app/desktop/src/renderer/src/lib/gm-commands.test.ts`
- Modify: `app/desktop/src/renderer/src/components/GmConsole.vue`
- Modify: `app/desktop/src/renderer/src/components/GmConsole.test.ts`

La Regia perde `EndEncounter` (ora di proprieta del cockpit) e guadagna `StartEncounter` (entrata in combat, `nonCombatOnly`: il cockpit non e visibile fuori combat). Lo `StartEncounter` ha un builder di partecipanti (include/iniziativa/zona per ogni attore). `GmConsole` usa gia il composable `use-dispatch` (`send`) → nessun cambio al wiring dei dadi.

- [ ] **Step 1: Aggiorna `gm-commands.ts` (swap EndEncounter -> StartEncounter)**

In `app/desktop/src/renderer/src/lib/gm-commands.ts` sostituisci il blocco `GM_COMMANDS` + commento con:

```ts
/** I 6 Command GM/manuali della Regia: i 5 non-combat di 10f (RequestCheck/ApplyEffect/StartQuest/
 *  AdvanceQuest/EnterPhase) + StartEncounter (entrata in combat, nonCombatOnly: vive nella Regia perche
 *  il cockpit non e visibile fuori combat). I comandi IN-combat (Attack/EndTurn/NextRound/EndEncounter)
 *  vivono nel cockpit di 10c. */
export const GM_COMMANDS = [
  'RequestCheck',
  'ApplyEffect',
  'StartQuest',
  'AdvanceQuest',
  'EnterPhase',
  'StartEncounter',
] as const;
```

(`isGmCommandEnabled`, `CommandPhaseRules`, `GmCommandType` restano invariati.)

- [ ] **Step 2: Aggiorna `gm-commands.test.ts`**

Sostituisci il contenuto di `app/desktop/src/renderer/src/lib/gm-commands.test.ts` con:

```ts
import { describe, it, expect } from 'vitest';
import { GM_COMMANDS, isGmCommandEnabled } from './gm-commands';

const RULES = { combatOnly: ['Attack', 'EndEncounter'], nonCombatOnly: ['StartEncounter', 'EnterPhase'] };

describe('GM_COMMANDS', () => {
  it('elenca i 6 comandi GM della Regia (StartEncounter al posto di EndEncounter)', () => {
    expect(GM_COMMANDS).toEqual([
      'RequestCheck',
      'ApplyEffect',
      'StartQuest',
      'AdvanceQuest',
      'EnterPhase',
      'StartEncounter',
    ]);
  });
});

describe('isGmCommandEnabled (legalita per fase da commandPhaseRules)', () => {
  it('StartEncounter (nonCombatOnly) abilitato fuori combat, disabilitato in combat', () => {
    expect(isGmCommandEnabled('StartEncounter', 'exploration', RULES)).toBe(true);
    expect(isGmCommandEnabled('StartEncounter', 'combat', RULES)).toBe(false);
  });

  it('Attack (combatOnly) abilitato solo in combat', () => {
    expect(isGmCommandEnabled('Attack', 'combat', RULES)).toBe(true);
    expect(isGmCommandEnabled('Attack', 'exploration', RULES)).toBe(false);
  });

  it('RequestCheck (in nessuna lista) abilitato in ogni fase', () => {
    expect(isGmCommandEnabled('RequestCheck', 'combat', RULES)).toBe(true);
    expect(isGmCommandEnabled('RequestCheck', 'downtime', RULES)).toBe(true);
  });
});
```

- [ ] **Step 3: Esegui i test del lib e verifica RED -> GREEN sul lib**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/lib/gm-commands.test.ts`
Atteso: PASS (4 test) dopo Step 1+2. (Se lanciato prima di Step 1: FAIL sul `toEqual`.)

- [ ] **Step 4: Aggiorna `GmConsole.vue` (StartEncounter al posto di EndEncounter)**

In `app/desktop/src/renderer/src/components/GmConsole.vue`:

(a) Estendi gli import di vue con `watch` e importa il builder. Sostituisci la riga di import vue e aggiungi l import del builder:

```ts
import { ref, reactive, computed, onMounted, watch } from 'vue';
```

e dopo l import di `gm-commands` aggiungi:

```ts
import { buildStartEncounter } from '../lib/combat-commands';
```

(b) Nell oggetto `labels`, sostituisci la riga `EndEncounter: 'Termina scontro',` con:

```ts
  StartEncounter: 'Avvia scontro',
```

(c) Aggiungi lo stato + la logica del builder di partecipanti. Dopo la riga `const ep = reactive({ to: '' });` aggiungi:

```ts
interface SeRow {
  actorId: string;
  name: string;
  include: boolean;
  initiative: number;
  zone: string;
}
const seRows = ref<SeRow[]>([]);
// Ricostruisce le righe quando il roster cambia, preservando le scelte gia fatte per attore.
watch(
  () => store.actors,
  (actors) => {
    const prev = new Map(seRows.value.map((r) => [r.actorId, r]));
    seRows.value = actors.map((a) => {
      const p = prev.get(a.id);
      return {
        actorId: a.id,
        name: a.name,
        include: p?.include ?? false,
        initiative: p?.initiative ?? 10,
        zone: p?.zone ?? 'centro',
      };
    });
  },
  { immediate: true },
);

function submitStartEncounter(): void {
  // buildStartEncounter ritorna un literal PLAIN (mai i proxy reactive di seRows): clone IPC sicura.
  const cmd = buildStartEncounter(
    `scontro-${store.version}`,
    seRows.value.map((r) => ({ actorId: r.actorId, include: r.include, initiative: r.initiative, zone: r.zone })),
  );
  if (cmd === null) {
    feedback.value = { kind: 'error', msg: 'Seleziona almeno un partecipante.' };
    return;
  }
  void send(cmd);
}
```

(d) Rimuovi `submitEndEncounter` (la funzione) e sostituisci la sezione template `<template v-else-if="type === 'EndEncounter'">...</template>` con la sezione StartEncounter:

```html
            <template v-else-if="type === 'StartEncounter'">
              <p v-if="!seRows.length" class="cmd__hint">Nessun attore: crealo in Compagnia.</p>
              <div v-for="row in seRows" :key="row.actorId" class="se-row">
                <label class="se-row__inc"><input v-model="row.include" type="checkbox" /> {{ row.name }}</label>
                <input v-model.number="row.initiative" class="inp" type="number" aria-label="iniziativa" />
                <input v-model="row.zone" class="inp" aria-label="zona" />
              </div>
              <LoomnButton variant="solid" :disabled="!seRows.length" @click="submitStartEncounter">Avvia scontro</LoomnButton>
            </template>
```

(e) Aggiungi gli stili delle righe in fondo al blocco `<style scoped>`:

```css
.cmd__hint { font-size: 11px; color: var(--text-3); margin: 0; }
.se-row { display: flex; align-items: center; gap: 8px; width: 100%; }
.se-row__inc { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text); flex: 1; }
```

- [ ] **Step 5: Aggiorna `GmConsole.test.ts`**

Sostituisci il contenuto di `app/desktop/src/renderer/src/components/GmConsole.test.ts` con:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import type { RulesetResult, ReadModelPush } from '@loomn/shared';
import GmConsole from './GmConsole.vue';
import { useReadModelStore } from '../stores/read-model';

const RULESET: Extract<RulesetResult, { ok: true }> = {
  ok: true,
  vocabulary: { attributes: ['forza'], skills: ['atletica'], resources: ['hp'], defenses: ['difesa'], defaultResources: {} },
  difficulties: ['moderate'],
  softPhases: ['exploration', 'dialogue', 'downtime'],
  questOutcomes: ['completed', 'failed'],
  directions: ['restore', 'drain'],
  commandPhaseRules: { combatOnly: ['EndEncounter'], nonCombatOnly: ['EnterPhase', 'StartEncounter'] },
};

function actor(id: string, name: string) {
  return { id, name, kind: 'pc' as const, attributes: {}, skills: {}, resources: {}, conditions: [], items: [], progression: { xp: 0, level: 1 } };
}

function pushState(phase: ReadModelPush['state']['phase'], actors: ReadModelPush['state']['actors'] = {}): ReadModelPush {
  return { version: 1, state: { version: 1, actors, encounter: null, quests: {}, phase } };
}

describe('GmConsole', () => {
  let dispatch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    setActivePinia(createPinia());
    dispatch = vi.fn(() => Promise.resolve({ ok: true as const, version: 1, events: [] }));
    window.loomn = { getRuleset: () => Promise.resolve(RULESET), dispatch } as unknown as typeof window.loomn;
  });

  it('in exploration EnterPhase e StartEncounter sono abilitati', async () => {
    useReadModelStore().applyPush(pushState('exploration'));
    const w = mount(GmConsole);
    await flushPromises();
    await w.find('button').trigger('click');
    const fieldsets = w.findAll('.cmd');
    const enterPhase = fieldsets.find((f) => f.text().includes('Cambia fase'))!;
    const startEncounter = fieldsets.find((f) => f.text().includes('Avvia scontro'))!;
    expect(enterPhase.find('fieldset').attributes('disabled')).toBeUndefined();
    expect(startEncounter.find('fieldset').attributes('disabled')).toBeUndefined();
  });

  it('in combat EnterPhase e StartEncounter sono disabilitati', async () => {
    useReadModelStore().applyPush(pushState('combat'));
    const w = mount(GmConsole);
    await flushPromises();
    await w.find('button').trigger('click');
    const fieldsets = w.findAll('.cmd');
    const enterPhase = fieldsets.find((f) => f.text().includes('Cambia fase'))!;
    const startEncounter = fieldsets.find((f) => f.text().includes('Avvia scontro'))!;
    expect(enterPhase.find('fieldset').attributes('disabled')).toBeDefined();
    expect(startEncounter.find('fieldset').attributes('disabled')).toBeDefined();
  });

  it('Avvia scontro dispaccia StartEncounter coi soli partecipanti inclusi', async () => {
    useReadModelStore().applyPush(pushState('exploration', { a: actor('a', 'Alfa'), b: actor('b', 'Beta') }));
    const w = mount(GmConsole);
    await flushPromises();
    await w.find('button').trigger('click');
    // include il primo attore (Alfa) lasciando Beta escluso
    await w.find('input[type="checkbox"]').setValue(true);
    const avvia = w.findAll('button').find((b) => b.text() === 'Avvia scontro')!;
    await avvia.trigger('click');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'StartEncounter',
      encounterId: 'scontro-1',
      participants: [{ actorId: 'a', zone: 'centro', initiative: 10 }],
    });
  });
});
```

- [ ] **Step 6: Esegui i test e verifica che passano**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/lib/gm-commands.test.ts app/desktop/src/renderer/src/components/GmConsole.test.ts`
Atteso: PASS (4 + 3 test). `pnpm -C app/desktop typecheck` pulito.

- [ ] **Step 7: Commit**

```bash
git add app/desktop/src/renderer/src/lib/gm-commands.ts app/desktop/src/renderer/src/lib/gm-commands.test.ts app/desktop/src/renderer/src/components/GmConsole.vue app/desktop/src/renderer/src/components/GmConsole.test.ts
git commit -m "feat(renderer): Regia avvia lo scontro (StartEncounter con builder partecipanti); EndEncounter passa al cockpit"
```

---

## Task 5: Wiring del cockpit nel Gioco + estensione del gate

**Files:**
- Modify: `app/desktop/src/renderer/src/views/GameView.vue`
- Modify: `app/desktop/src/renderer/src/views/GameView.test.ts`
- Modify: `app/desktop/src/renderer/src/renderer.ts` (self-test)

Monta `EncounterPanel` nel pannello `encounter` (sostituendo il placeholder del preset combat) ed estende il self-test del gate con uno slice combat (StartEncounter -> EndTurn -> EndEncounter via IPC reale).

- [ ] **Step 1: Aggiorna `GameView.test.ts` (stub di EncounterPanel)**

In `app/desktop/src/renderer/src/views/GameView.test.ts`:

(a) Dopo la riga `const DicePanel = { template: '<div class="dice-stub">Dadi</div>' };` aggiungi:

```ts
const EncounterPanel = { template: '<div class="encounter-stub">Scontro</div>' };
```

(b) Nella funzione `mountGame`, aggiungi `EncounterPanel` agli stubs:

```ts
  return mount(GameView, { global: { plugins: [pinia], stubs: { GridLayout, GridItem, NarrativePanel, DicePanel, EncounterPanel } } });
```

(Le asserzioni restano: in combat il testo contiene `Scontro` — ora dallo stub — e non `Scheda`.)

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/views/GameView.test.ts`
Atteso: il test "passando a combat" PASSA ancora (lo stub fornisce "Scontro"), ma per il giusto motivo verifichiamo dopo lo Step 3 che il pannello reale e cablato. (Se GameView non monta ancora EncounterPanel, il testo "Scontro" viene dal vecchio placeholder `titles.encounter`; il cambio dello Step 3 sposta la fonte allo stub. Entrambi danno verde — il typecheck dello Step 3 e la prova del wiring.)

- [ ] **Step 3: Aggiorna `GameView.vue` (monta EncounterPanel)**

In `app/desktop/src/renderer/src/views/GameView.vue`:

(a) Dopo `import DicePanel from '../components/DicePanel.vue';` aggiungi:

```ts
import EncounterPanel from '../components/EncounterPanel.vue';
```

(b) Sostituisci la riga dei titoli con (rimuovi `encounter`, ora ha il suo componente):

```ts
// Titolo del pannello ancora placeholder (scheda 10d).
const titles: Record<string, string> = { sheet: 'Scheda' };
```

(c) Nel template, sostituisci il blocco `<GridItem ...>` con la riga per EncounterPanel aggiunta:

```html
      <GridItem v-for="item in layout" :key="item.i" :x="item.x" :y="item.y" :w="item.w" :h="item.h" :i="item.i">
        <NarrativePanel v-if="item.i === 'narrative'" />
        <DicePanel v-else-if="item.i === 'dice'" />
        <EncounterPanel v-else-if="item.i === 'encounter'" />
        <LoomnPanel v-else :title="titles[item.i] ?? item.i" eyebrow="pannello">
          <p class="game-view__placeholder">Contenuto nel Piano 10d.</p>
        </LoomnPanel>
      </GridItem>
```

- [ ] **Step 4: Esegui i test e verifica che passano**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/views/GameView.test.ts`
Atteso: PASS (2 test). `pnpm -C app/desktop typecheck` pulito.

- [ ] **Step 5: Estendi il self-test del gate (`renderer.ts`)**

In `app/desktop/src/renderer/src/renderer.ts`, **dentro il ramo `if (phase === '1')`**, INSERISCI lo slice combat **subito prima** della riga di commento `// Comando GM via IPC (EnterPhase, non-combat): ...` (cioe prima dell ultimo dispatch `EnterPhase` di fase 1):

```ts
      // 10c: slice combat via IPC reale. StartEncounter (nonCombatOnly, da exploration) entra in combat;
      // EndTurn avanza il turno; EndEncounter chiude e torna fuori combat. Prova il path combat end-to-end.
      const enc = await window.loomn.dispatch({
        type: 'StartEncounter',
        encounterId: 'scontro-selftest',
        participants: [{ actorId: 'goblin', zone: 'centro', initiative: 10 }],
      });
      check(enc.ok && enc.events.some((e) => e.type === 'EncounterStarted'), 'StartEncounter avvia lo scontro');
      check(
        enc.ok && enc.events.some((e) => e.type === 'PhaseChanged' && e.to === 'combat'),
        'StartEncounter entra in fase combat',
      );

      const et = await window.loomn.dispatch({ type: 'EndTurn' });
      check(et.ok && et.events.some((e) => e.type === 'TurnEnded'), 'EndTurn avanza il turno in combat');

      const ee = await window.loomn.dispatch({ type: 'EndEncounter' });
      check(ee.ok && ee.events.some((e) => e.type === 'EncounterEnded'), 'EndEncounter chiude lo scontro');
      check(
        ee.ok && ee.events.some((e) => e.type === 'PhaseChanged' && e.to === 'exploration'),
        'EndEncounter torna fuori combat',
      );
```

Poi, nel ramo `else` (fase 2), aggiorna l asserzione di versione persistita. Gli eventi di fase 1 sono ora: AddActor(1) + StartEncounter(2) + EndTurn(1) + EndEncounter(2) + EnterPhase(1) = **7**. Sostituisci la riga:

```ts
      check(s0.version === 2, 'versione 2 PERSISTITA dopo il riavvio (durabilita su disco)');
```

con:

```ts
      check(s0.version === 7, 'versione 7 PERSISTITA dopo il riavvio (durabilita: incluso lo slice combat 10c)');
```

- [ ] **Step 6: Verifica unit + typecheck dell intero renderer**

Run (dalla root): `pnpm exec vitest run app/desktop/` poi `pnpm -r typecheck`
Atteso: tutti i renderer test verdi (≈ 137 renderer), typecheck pulito (6 progetti). **Ri-esegui anche `App.test.ts`** (lezione 10b: un pannello montato in App puo introdurre unhandled rejection da stub mancanti). `App.test.ts` monta `GameView` alla rotta `/`; nel test "combat" monta il vero `EncounterPanel` → `onMounted` chiama `getRuleset`. `App.test.ts` **stubba gia `getRuleset`** (per GmConsole) → nessuna nuova rejection. Verificalo eseguendo: `pnpm exec vitest run app/desktop/src/renderer/src/App.test.ts` (atteso 4 verdi, 0 unhandled rejection).

- [ ] **Step 7: Commit**

```bash
git add app/desktop/src/renderer/src/views/GameView.vue app/desktop/src/renderer/src/views/GameView.test.ts app/desktop/src/renderer/src/renderer.ts
git commit -m "feat(renderer): monta il cockpit nel pannello scontro + estende il self-test con uno slice combat"
```

---

## Gate "esegui l app" (passo ORCHESTRATORE, dopo l ultimo task)

Non eseguibile da un subagent (richiede l ABI Electron e l avvio dell app). Dall orchestratore, dalla root:

- [ ] `pnpm rebuild:electron` (ricompila better-sqlite3 per l ABI Electron).
- [ ] Esegui il self-test 2 fasi (stile 9c-ii/10b): avvia l app con `LOOMN_SELFTEST`/`?selftest=1` poi `?selftest=2` (il main cattura il `VERDICT` e logga). **Atteso:** `VERDICT: PASS` in entrambe le fasi, coi nuovi check 10c (StartEncounter/EndTurn/EndEncounter via IPC + `version 7` persistita dopo il riavvio). Se un rebuild fallisce con EBUSY/EPERM su `better_sqlite3.node`: chiudi SOLO i processi Loomn (`tabl`/`loomn` nella command-line, NON tutti gli electron), poi rebuild (HANDOFF §9).
- [ ] **Prova visiva:** screenshot del cockpit in combat (ordine d iniziativa col turno evidenziato in clay, zone, controlli) — avvia `pnpm rebuild:electron` + `pnpm --filter @loomn/desktop dev`, in app: Compagnia → crea 2 PG → Regia → Avvia scontro (includi entrambi, iniziative diverse) → il layout passa al preset combat e mostra il cockpit; prova Fine turno / Attacca (i dadi 3D animano il tiro). Allega lo screenshot alla verifica.
- [ ] Torna all ABI Node per i test: `pnpm rebuild:node`.

---

## Self-review (rispetto allo spec §10 riga 10c + mandato)

**Copertura del mandato 10c:**
1. **Cockpit scontro (iniziativa/round/turni dal read-model):** Task 1 (`toEncounterView` — ordine PRE-ORDINATO non ri-calcolato, `turnIndex` diretto) + Task 3 (`EncounterPanel` display). ✅
2. **Controlli combat via `use-dispatch` (NON `window.loomn.dispatch` diretto):** Task 3 (cockpit usa `useDispatch().dispatch`) + Task 4 (GmConsole usa gia `send` = `use-dispatch`). I `RollResult` animano i dadi 3D di 10b (seam gia cablato). ✅
3. **Zone display-only (label/raggruppamento da `participants[].zone`):** Task 1 (`zones`, ordine di prima apparizione) + Task 3 (render `.zones`). NIENTE mappa/movimento. ✅
4. **Feedback tiri attacco/check/effetto:** via `use-dispatch` → `dice.enqueue(extractRolls(events))` (gia esistente da 10b/`6423011`); l affordance Attacco del cockpit produce `AttackResolved.check` → dadi animati. ✅
5. **Re-theme combat:** `[data-phase='combat']` → `--accent: --clay` (gia in 10a su App.vue); il cockpit usa `var(--accent)`/`var(--accent-dim)` per il turno corrente. ✅
6. **Entrata/uscita combat:** StartEncounter (Regia, Task 4) / EndEncounter (cockpit, Task 3). ✅

**Placeholder scan:** nessun TODO/TBD; ogni step ha codice completo. **Type consistency:** `toEncounterView`/`CockpitView`/`ParticipantRow` (Task 1) usati in Task 3; `buildAttack`/`endTurn`/`nextRound`/`endEncounter`/`buildStartEncounter` (Task 2) usati in Task 3/4; `DispatchCommand` da `@loomn/shared` ovunque. **Fuori ambito** esplicito (movimento/topologia deferiti, attribute/skill avanzati nel cockpit, streaming). **Scope discipline** in ogni task; nessun tocco a config/CSP/dipendenze.

**Conteggi test attesi (cumulativi, renderer; packages = 500 invariato):** baseline 116 → Task 1 +7 = 123 → Task 2 +6 = 129 → Task 3 +7 = 136 → Task 4 +1 netto (GmConsole 2→3; gm-commands resta 4) = 137 → Task 5 +0 (GameView resta 2; renderer.ts e gate-only) = **137 renderer**. **Totale atteso ≈ 637** (500 packages + 137 renderer). L orchestratore pinna il numero esatto rieseguendo `pnpm test` dalla root.

**House rules (§5):** RNG non toccato (engine intatto); builder PLAIN per la clone IPC (lezione 10b); token CSS reali; niente apostrofi nelle stringhe `it`/`describe`/`check` in apici singoli (verifica col grep `(it|describe)\('[^']*'[A-Za-zàèéìòù]` → no matches prima del commit del doc).

---

## Roadmap (Fase 1, UI)

`0 ✅ → 10a ✅ → 10g ✅ → 10f ✅ → 10b ✅ → **10c (questo piano)** → 10d (Scheda + inventario) → 10e (Diario + Compagnia)`. Deferiti post-Piano-10: **movimento/topologia di zona** (traccia engine stile SP1-4, co-progettata con l Inventario) e **motore Inventario & Equipaggiamento** (spec §11, HANDOFF §8).

---

## Execution Handoff

Flusso §4 dell HANDOFF: questo doc committato su `main` → branch `feat/piano10c-combattimento` → subagent-driven (implementer + spec-review + code-quality-review per task; final review opus sull intero branch) → gate Electron 2 fasi → `finishing-a-development-branch` (merge ff) → `git push origin main` → aggiorna HANDOFF (§0-unvicies) + memoria.
