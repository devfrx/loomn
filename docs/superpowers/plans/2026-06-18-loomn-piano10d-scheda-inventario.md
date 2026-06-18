# Piano 10d — Scheda + inventario (display-only, data-driven dal Ruleset) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Riempire il pannello `sheet` del Gioco (preset non-combat) e la route `/scheda` (`SheetView.vue`, oggi placeholder) con la Scheda del personaggio — identita/attributi/abilita/risorse (barre)/condizioni/progressione (xp/livello) dal read-model `GameState.actors[]`, con etichette e ordine **data-driven dal vocabolario** (`get-ruleset` di 10g), piu un inventario **DISPLAY-ONLY** sul modello piatto `Item{id,name,equipped,effects}`.

**Architecture:** Renderer-only sul backend gia pronto. Una funzione PURA (`lib/sheet-view.ts`) mappa un attore del read-model + il vocabolario in un view-model di scheda (attributi/abilita ordinati dal vocabolario, barre risorse con percentuale, condizioni e effetti-oggetto formattati in stringhe) e risolve quale attore mostrare (preferisci la selezione, altrimenti il primo PG). Un UNICO componente (`components/SheetPanel.vue`) rende la scheda + un selettore d attore; e riusato sia nel pannello `sheet` del Gioco sia nella route `/scheda` (`SheetView.vue` lo avvolge) — consistenza per riuso (spec §5). La scheda e **read-only** (nessun Command, nessun `use-dispatch`): l inventario e display-only (lista/flag equipaggiato/effetti renderizzati), perche slot tipizzati profondi, contenitori annidati ed equip/unequip-come-azione sono il **motore Inventario deferito** post-Piano-10 (spec §11). Nessun nuovo Command/Event/IPC/dipendenza/CSP/config.

**Tech Stack:** Vue 3 + TS strict, Pinia, Vue Test Utils (jsdom), Vitest. Nessuna nuova dipendenza, nessun passo orchestratore su `package.json`/CSP/`electron.vite.config`/`tokens.css`.

**Spec di riferimento:** `docs/superpowers/specs/2026-06-17-piano10-ui-design.md` (§2 decisione 5 = inventario nella Scheda / slot = vocabolario-di-modulo / render piatto per ora; §4 layout adattivo per fase; §5 read-side + wrapper riusabili; §7 audit binding = `GameState.actors[].items` 🟢 display, slot profondi/contenitori/equip-come-azione 🔴 feature; §10 riga 10d; §11 motore inventario + movimento deferiti). HANDOFF §0-unvicies (10c + lezioni), §4 (processo), §5 (house rules), §8 (roadmap: motore Inventario deferito post-10).

**Decisioni di design (gia fissate dallo spec autorita + decisioni di placement di questo piano):**
- **Un solo componente `SheetPanel.vue`** rende la scheda, usato in DUE posti: il pannello `sheet` del preset non-combat del Gioco (`GameView.vue`) e la route `/scheda` (`SheetView.vue` lo avvolge in `<main class="route-view">`). DRY: niente duplicazione fra pannello compatto e pagina piena (la griglia auto-fill rifluisce con la larghezza disponibile).
- **Selezione dell attore (nessuna decisione di prodotto bloccante):** il selettore elenca **tutti** gli attori del roster (`store.actors`, PG e PNG: la scheda vale per chiunque); il **default** e il **primo PG** (`kind === 'pc'`), con ripiego sul primo attore se non ci sono PG. La selezione e stato LOCALE del componente; se l attore selezionato sparisce dal read-model, la funzione pura ripiega in modo grazioso. Nessuno stato persistito (e una vista, non dominio).
- **Data-driven dal vocabolario (10g):** attributi/abilita/risorse sono ordinati secondo `vocabulary.attributes/skills/resources`; eventuali chiavi che l attore possiede ma non nel vocabolario sono **appese in coda** (ordinate) — niente dato dell attore viene nascosto, ma il vocabolario guida ordine e primato. Con vocabolario non ancora caricato (`null`) la scheda rende comunque tutte le chiavi dell attore (ordine alfabetico) — graceful.
- **Inventario DISPLAY-ONLY:** lista oggetti dal modello piatto `Item{id,name,equipped,effects}`; flag "equipaggiato"; ogni `ItemEffect` (contributeDice/checkModifier/defenseModifier) reso come stringa leggibile. NIENTE slot tipizzati profondi, NIENTE contenitori annidati, NIENTE azione equip/unequip (motore Inventario deferito; gli slot tipizzati non sono ancora nel `Ruleset`/IPC — spec §7/§11).
- **Re-theme per fase:** la scheda usa `var(--accent)`/`var(--accent-dim)` (gia applicati da 10a su `App.vue` per `[data-phase]`); nessun nuovo token.

---

## Fuori ambito (esplicito, deferito)

- **Motore Inventario & Equipaggiamento** (slot tipizzati profondi, contenitori annidati, equip/unequip/sposta/lascia/consuma come `Command`/`Event`, catalogo/economia): feature core DEFERITA post-Piano-10 (spec §11; HANDOFF §8). 10d rende l inventario **display-only** sul modello piatto attuale.
- **Movimento / topologia di zona**: traccia engine deferita post-Piano-10 (sorella dell Inventario; spec §11).
- **Modifica della scheda dalla UI** (editare attributi/risorse/condizioni in-place): non esiste un Command per mutare un attore esistente oltre `AddActor` (la creazione PG e in 10f/Compagnia). La scheda e **read-only**. (Le condizioni/risorse cambiano via il gioco — eventi engine — non via la scheda.)
- **Diario + Compagnia** (10e): roster relazionale, narrativa L2, canon.
- **Streaming** del turno (spec §11): gia deferito.
- Nessuna modifica a `@loomn/shared`/engine/host, nessun nuovo Command/Event/IPC/tabella/migrazione/dipendenza/CSP. Nessuna modifica a `tokens.css`/`vitest.config`/`electron.vite.config`/`package.json`.

---

## File Structure

**Nessun passo orchestratore preliminare** (come 10c: nessuna nuova dipendenza, nessun asset, nessuna modifica a `package.json`/CSP/`electron.vite.config`/`tokens.css`). L orchestratore: (a) committa questo doc su `main`, (b) crea il branch `feat/piano10d-scheda-inventario`, (c) a fine branch esegue il **gate Electron 2 fasi** (rebuild:electron + self-test fase 1/2 → `VERDICT: PASS` + `rebuild:node`), (d) merge ff + `git push origin main`.

**Subagent tasks (renderer-only, TDD):**
- `app/desktop/src/renderer/src/lib/sheet-view.ts` (+test) — **Task 1**: mappa PURA attore + vocabolario → vista scheda (ordinamento data-driven, barre risorse, formattazione condizioni/effetti-oggetto) + risoluzione dell attore selezionato. **Il cuore testabile.**
- `app/desktop/src/renderer/src/components/SheetPanel.vue` (+test) — **Task 2**: il componente Scheda (selettore attore + identita/attributi/abilita/risorse/condizioni/inventario display-only). Legge `useReadModelStore` + `useRulesetStore` + la lib di Task 1.
- `app/desktop/src/renderer/src/views/SheetView.vue` (sostituisce il placeholder) (+test) — **Task 3**: la route `/scheda` avvolge `SheetPanel`.
- `app/desktop/src/renderer/src/views/GameView.vue` (+ aggiorna `app/desktop/src/renderer/src/views/GameView.test.ts`) + `app/desktop/src/renderer/src/renderer.ts` (self-test) — **Task 4**: monta `SheetPanel` nel pannello `sheet` + estende il gate self-test con una navigazione alla Scheda.

**Disciplina di scope (CRITICO, in OGNI prompt di task):** il subagent modifica SOLO i file elencati nel suo task. MAI toccare `package.json`/`tsconfig*`/`vitest.config`/`vitest.workspace`/`electron.vite.config`/`index.html` (CSP)/`tokens.css`. `git status --short` prima di ogni commit. Niente apostrofi nelle stringhe `it('...')`/`describe('...')`/`check(...)` in apici singoli (usa "l ordine", "c e", "dell attore"; `è/é` vanno bene, sono lettere). **Lezioni 10b/10c:** ogni payload verso `dispatch`/IPC deve essere PLAIN (la scheda e read-only, quindi qui non si dispaccia nulla: nessun proxy da clonare); usa i TOKEN CSS REALI di `styles/tokens.css` (`--text`/`--text-2`/`--text-3`/`--accent`/`--accent-dim`/`--line`/`--line-2`/`--well`/`--panel`/`--f-read`/`--f-ui`/`--f-mono`/`--f-display`/`--bad`/`--ok`/`--clay`/`--r`/`--r-sm`/`--r-xs`) — NON inventare nomi; i componenti usano `<LoomnPanel>` (NON `<form>`). **Rieseguire i test TU** (non fidarsi del report): un nuovo pannello montato in `GameView`/`App` puo introdurre unhandled-rejection da stub `window.loomn` mancanti (vedi Task 4: `GameView.test.ts` deve stubbare `SheetPanel`).

**Forme dati di riferimento (dal contratto IPC, NON re-dichiararle):**
- `ActorView = GameStateView['actors'][string]` (da `stores/read-model.ts`): `{ id, name, kind: 'pc'|'npc', attributes: Record<string,number>, skills: Record<string,number>, resources: Record<string,{current,max}>, conditions: Condition[], items: Item[], progression: {xp,level} }`.
- `Condition = { key, source, effects: ConditionEffect[], duration }`; `ConditionEffect = {kind:'checkModifier',value,appliesTo?} | {kind:'resourcePerTurn',resource,delta}`; `duration = {kind:'turns',remaining} | {kind:'scenes',remaining} | {kind:'permanent'}`.
- `Item = { id, name, equipped, effects: ItemEffect[] }`; `ItemEffect = {kind:'contributeDice',dice:{count,sides,tag?}[],mode} | {kind:'checkModifier',value,appliesTo?} | {kind:'defenseModifier',defense,value}`.
- Vocabolario (da `useRulesetStore().vocabulary`, tipo `Extract<RulesetResult,{ok:true}>['vocabulary'] | null`): `{ attributes: string[], skills: string[], resources: string[], defenses: string[], defaultResources }`.

---

## Task 1: `lib/sheet-view.ts` — mappa PURA attore + vocabolario → vista scheda

**Files:**
- Create: `app/desktop/src/renderer/src/lib/sheet-view.ts`
- Test: `app/desktop/src/renderer/src/lib/sheet-view.test.ts`

La funzione cardine: deriva la vista della scheda da un `ActorView` e dal vocabolario. Tutta la logica testabile (ordinamento data-driven, percentuale barre, formattazione condizioni/effetti, selezione dell attore) vive qui, pura. I tipi sono derivati da `ActorView`/`RulesetResult` del contratto IPC — il renderer NON importa engine per il dominio.

- [ ] **Step 1: Scrivi il test che fallisce**

Create `app/desktop/src/renderer/src/lib/sheet-view.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  orderedEntries,
  resourceBars,
  resolveSelectedActor,
  toSheetView,
  type VocabularyView,
} from './sheet-view';
import type { ActorView } from '../stores/read-model';

function actor(over: Partial<ActorView> & { id: string }): ActorView {
  return {
    id: over.id,
    name: over.name ?? over.id,
    kind: over.kind ?? 'pc',
    attributes: over.attributes ?? {},
    skills: over.skills ?? {},
    resources: over.resources ?? {},
    conditions: over.conditions ?? [],
    items: over.items ?? [],
    progression: over.progression ?? { xp: 0, level: 1 },
  };
}

const vocab: VocabularyView = {
  attributes: ['forza', 'agilita'],
  skills: ['lame'],
  resources: ['hp', 'mana'],
  defenses: ['difesa'],
  defaultResources: {},
};

describe('orderedEntries', () => {
  it('rispetta l ordine del vocabolario', () => {
    const out = orderedEntries({ agilita: 2, forza: 3 }, ['forza', 'agilita']);
    expect(out).toEqual([
      { key: 'forza', value: 3 },
      { key: 'agilita', value: 2 },
    ]);
  });

  it('appende le chiavi extra in coda ordinate', () => {
    const out = orderedEntries({ forza: 1, zelo: 9, audacia: 5 }, ['forza']);
    expect(out.map((e) => e.key)).toEqual(['forza', 'audacia', 'zelo']);
  });

  it('salta le chiavi del vocabolario assenti nell attore', () => {
    const out = orderedEntries({ forza: 1 }, ['forza', 'agilita']);
    expect(out.map((e) => e.key)).toEqual(['forza']);
  });
});

describe('resourceBars', () => {
  it('calcola la percentuale e rispetta l ordine del vocabolario', () => {
    const out = resourceBars({ mana: { current: 1, max: 4 }, hp: { current: 5, max: 10 } }, ['hp', 'mana']);
    expect(out).toEqual([
      { key: 'hp', current: 5, max: 10, pct: 0.5 },
      { key: 'mana', current: 1, max: 4, pct: 0.25 },
    ]);
  });

  it('con max 0 la percentuale e 0 (niente divisione per zero)', () => {
    const out = resourceBars({ hp: { current: 0, max: 0 } }, ['hp']);
    expect(out[0]!.pct).toBe(0);
  });

  it('clampa la percentuale in [0,1] anche con current oltre max', () => {
    const out = resourceBars({ hp: { current: 15, max: 10 } }, ['hp']);
    expect(out[0]!.pct).toBe(1);
  });
});

describe('toSheetView', () => {
  it('riporta identita, livello e xp', () => {
    const view = toSheetView(actor({ id: 'eroe', name: 'Eroe', kind: 'pc', progression: { xp: 120, level: 3 } }), vocab);
    expect(view.name).toBe('Eroe');
    expect(view.kind).toBe('pc');
    expect(view.level).toBe(3);
    expect(view.xp).toBe(120);
  });

  it('ordina attributi e abilita dal vocabolario', () => {
    const view = toSheetView(actor({ id: 'a', attributes: { agilita: 1, forza: 2 }, skills: { lame: 4 } }), vocab);
    expect(view.attributes.map((e) => e.key)).toEqual(['forza', 'agilita']);
    expect(view.skills).toEqual([{ key: 'lame', value: 4 }]);
  });

  it('formatta le condizioni (checkModifier con e senza appliesTo)', () => {
    const view = toSheetView(
      actor({
        id: 'a',
        conditions: [
          {
            key: 'benedetto',
            source: 'rito',
            effects: [
              { kind: 'checkModifier', value: 2 },
              { kind: 'checkModifier', value: -1, appliesTo: 'lame' },
            ],
            duration: { kind: 'turns', remaining: 3 },
          },
        ],
      }),
      vocab,
    );
    expect(view.conditions[0]!.key).toBe('benedetto');
    expect(view.conditions[0]!.detail).toContain('+2');
    expect(view.conditions[0]!.detail).toContain('lame -1');
    expect(view.conditions[0]!.duration).toBe('3 turni');
  });

  it('formatta resourcePerTurn e le durate scene/permanente', () => {
    const view = toSheetView(
      actor({
        id: 'a',
        conditions: [
          { key: 'avvelenato', source: 'trappola', effects: [{ kind: 'resourcePerTurn', resource: 'hp', delta: -2 }], duration: { kind: 'scenes', remaining: 1 } },
          { key: 'maledetto', source: 'strega', effects: [], duration: { kind: 'permanent' } },
        ],
      }),
      vocab,
    );
    expect(view.conditions[0]!.detail).toContain('hp -2');
    expect(view.conditions[0]!.duration).toBe('1 scene');
    expect(view.conditions[1]!.duration).toBe('permanente');
  });

  it('formatta gli effetti degli oggetti e il flag equipaggiato', () => {
    const view = toSheetView(
      actor({
        id: 'a',
        items: [
          {
            id: 'spada',
            name: 'Spada lunga',
            equipped: true,
            effects: [
              { kind: 'contributeDice', dice: [{ count: 1, sides: 8 }], mode: 'effect' },
              { kind: 'checkModifier', value: 1, appliesTo: 'lame' },
              { kind: 'defenseModifier', defense: 'difesa', value: 2 },
            ],
          },
          { id: 'sasso', name: 'Sasso', equipped: false, effects: [] },
        ],
      }),
      vocab,
    );
    expect(view.items[0]!.name).toBe('Spada lunga');
    expect(view.items[0]!.equipped).toBe(true);
    expect(view.items[0]!.effects[0]).toContain('1d8');
    expect(view.items[0]!.effects[1]).toContain('lame +1');
    expect(view.items[0]!.effects[2]).toContain('difesa +2');
    expect(view.items[1]!.equipped).toBe(false);
    expect(view.items[1]!.effects).toEqual([]);
  });

  it('senza vocabolario rende comunque le chiavi dell attore', () => {
    const view = toSheetView(actor({ id: 'a', attributes: { mente: 3, forza: 1 } }), null);
    expect(view.attributes.map((e) => e.key)).toEqual(['forza', 'mente']);
  });
});

describe('resolveSelectedActor', () => {
  const roster = [actor({ id: 'png', kind: 'npc' }), actor({ id: 'pg1', kind: 'pc' }), actor({ id: 'pg2', kind: 'pc' })];

  it('preferisce l id selezionato se ancora presente', () => {
    expect(resolveSelectedActor(roster, 'pg2')?.id).toBe('pg2');
  });

  it('ripiega sul primo PG quando l id e stantio o nullo', () => {
    expect(resolveSelectedActor(roster, 'sparito')?.id).toBe('pg1');
    expect(resolveSelectedActor(roster, null)?.id).toBe('pg1');
  });

  it('senza PG usa il primo attore; roster vuoto -> null', () => {
    expect(resolveSelectedActor([actor({ id: 'png', kind: 'npc' })], null)?.id).toBe('png');
    expect(resolveSelectedActor([], null)).toBeNull();
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/lib/sheet-view.test.ts`
Expected: FAIL (Cannot find module `./sheet-view` / export mancanti).

- [ ] **Step 3: Scrivi l implementazione minima**

Create `app/desktop/src/renderer/src/lib/sheet-view.ts`:

```ts
import type { ActorView } from '../stores/read-model';
import type { RulesetResult } from '@loomn/shared';

// Tipi derivati dal contratto IPC (il renderer non importa engine per il dominio).
export type VocabularyView = Extract<RulesetResult, { ok: true }>['vocabulary'];
type ConditionView = ActorView['conditions'][number];
type ConditionEffectView = ConditionView['effects'][number];
type DurationView = ConditionView['duration'];
type ItemView = ActorView['items'][number];
type ItemEffectView = ItemView['effects'][number];

/** Una voce ordinata attributo/abilita (chiave del vocabolario + valore dell attore). */
export interface SheetEntry {
  key: string;
  value: number;
}

/** Una barra risorsa con percentuale gia clampata in [0,1] (max 0 -> 0). */
export interface ResourceBar {
  key: string;
  current: number;
  max: number;
  pct: number;
}

/** Una riga condizione: chiave + fonte + dettaglio effetti + durata, gia formattati. */
export interface ConditionLine {
  key: string;
  source: string;
  detail: string;
  duration: string;
}

/** Una riga oggetto (display-only): nome + flag equipaggiato + effetti renderizzati. */
export interface ItemLine {
  id: string;
  name: string;
  equipped: boolean;
  effects: string[];
}

/** Vista della scheda derivata dal read-model. */
export interface SheetView {
  id: string;
  name: string;
  kind: 'pc' | 'npc';
  level: number;
  xp: number;
  attributes: SheetEntry[];
  skills: SheetEntry[];
  resources: ResourceBar[];
  conditions: ConditionLine[];
  items: ItemLine[];
}

/** Ordina le chiavi presenti secondo `order` (vocabolario), poi appende le extra in ordine alfabetico.
 *  Niente chiave dell attore viene persa; il vocabolario guida ordine e primato. */
function orderKeys(present: readonly string[], order: readonly string[]): string[] {
  const inOrder = new Set(order);
  const presentSet = new Set(present);
  const out: string[] = [];
  for (const key of order) if (presentSet.has(key)) out.push(key);
  for (const key of [...present].sort()) if (!inOrder.has(key)) out.push(key);
  return out;
}

/** Coppie {chiave,valore} di un Record numerico, ordinate dal vocabolario (extra in coda, ordinate). */
export function orderedEntries(record: Record<string, number>, order: readonly string[]): SheetEntry[] {
  return orderKeys(Object.keys(record), order).map((key) => ({ key, value: record[key] ?? 0 }));
}

/** Barre risorsa ordinate dal vocabolario; pct = current/max clampata in [0,1] (max<=0 -> 0). */
export function resourceBars(
  resources: Record<string, { current: number; max: number }>,
  order: readonly string[],
): ResourceBar[] {
  return orderKeys(Object.keys(resources), order).map((key) => {
    const pool = resources[key] ?? { current: 0, max: 0 };
    const pct = pool.max > 0 ? Math.max(0, Math.min(1, pool.current / pool.max)) : 0;
    return { key, current: pool.current, max: pool.max, pct };
  });
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function formatDuration(duration: DurationView): string {
  switch (duration.kind) {
    case 'turns':
      return `${duration.remaining} turni`;
    case 'scenes':
      return `${duration.remaining} scene`;
    case 'permanent':
      return 'permanente';
    default: {
      const _exhaustive: never = duration;
      return _exhaustive;
    }
  }
}

function formatConditionEffect(effect: ConditionEffectView): string {
  switch (effect.kind) {
    case 'checkModifier':
      return effect.appliesTo !== undefined
        ? `${effect.appliesTo} ${signed(effect.value)}`
        : `prove ${signed(effect.value)}`;
    case 'resourcePerTurn':
      return `${effect.resource} ${signed(effect.delta)}/turno`;
    default: {
      const _exhaustive: never = effect;
      return _exhaustive;
    }
  }
}

function formatDice(dice: ReadonlyArray<{ count: number; sides: number }>): string {
  return dice.map((g) => `${g.count}d${g.sides}`).join(' + ');
}

function formatItemEffect(effect: ItemEffectView): string {
  switch (effect.kind) {
    case 'contributeDice':
      return `dadi ${formatDice(effect.dice)} (${effect.mode})`;
    case 'checkModifier':
      return effect.appliesTo !== undefined
        ? `${effect.appliesTo} ${signed(effect.value)}`
        : `prove ${signed(effect.value)}`;
    case 'defenseModifier':
      return `${effect.defense} ${signed(effect.value)}`;
    default: {
      const _exhaustive: never = effect;
      return _exhaustive;
    }
  }
}

/** Mappa un attore del read-model nella vista della scheda. Pura: nessun side effect, nessun RNG.
 *  Ordine/etichette data-driven dal vocabolario (null = solo dati dell attore, ordine alfabetico). */
export function toSheetView(actor: ActorView, vocab: VocabularyView | null): SheetView {
  return {
    id: actor.id,
    name: actor.name,
    kind: actor.kind,
    level: actor.progression.level,
    xp: actor.progression.xp,
    attributes: orderedEntries(actor.attributes, vocab?.attributes ?? []),
    skills: orderedEntries(actor.skills, vocab?.skills ?? []),
    resources: resourceBars(actor.resources, vocab?.resources ?? []),
    conditions: actor.conditions.map((c) => ({
      key: c.key,
      source: c.source,
      detail: c.effects.map(formatConditionEffect).join(', '),
      duration: formatDuration(c.duration),
    })),
    items: actor.items.map((it) => ({
      id: it.id,
      name: it.name,
      equipped: it.equipped,
      effects: it.effects.map(formatItemEffect),
    })),
  };
}

/** Risolve quale attore mostrare: preferisce `selectedId` se ancora nel roster, altrimenti il primo
 *  PG, altrimenti il primo attore, altrimenti null. Pura (display-only). */
export function resolveSelectedActor(actors: readonly ActorView[], selectedId: string | null): ActorView | null {
  if (selectedId !== null) {
    const found = actors.find((a) => a.id === selectedId);
    if (found) return found;
  }
  const pc = actors.find((a) => a.kind === 'pc');
  if (pc) return pc;
  return actors[0] ?? null;
}
```

- [ ] **Step 4: Esegui il test e verifica che passa**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/lib/sheet-view.test.ts`
Expected: PASS (13 test). Poi `pnpm -C app/desktop typecheck` → Done (nessun errore).

- [ ] **Step 5: Commit**

```bash
git add app/desktop/src/renderer/src/lib/sheet-view.ts app/desktop/src/renderer/src/lib/sheet-view.test.ts
git commit -m "feat(renderer): mappa pura attore+vocabolario -> vista scheda (10d)"
```

---

## Task 2: `components/SheetPanel.vue` — il componente Scheda (selettore + display)

**Files:**
- Create: `app/desktop/src/renderer/src/components/SheetPanel.vue`
- Test: `app/desktop/src/renderer/src/components/SheetPanel.test.ts`

Il componente legge `useReadModelStore` (attori) + `useRulesetStore` (vocabolario, `load()` onMounted come `EncounterPanel`/`CompanyView`) e usa la lib di Task 1. Selettore d attore (stato locale `selectedId`); identita/attributi/abilita/risorse-barre/condizioni; inventario display-only. Read-only: nessun `use-dispatch`, nessun Command.

- [ ] **Step 1: Scrivi il test che fallisce**

Create `app/desktop/src/renderer/src/components/SheetPanel.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import type { RulesetResult, ReadModelPush } from '@loomn/shared';
import SheetPanel from './SheetPanel.vue';
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

// LoomnPanel stub passthrough (rende title/meta + slot).
const stubs = {
  LoomnPanel: { props: ['title', 'eyebrow', 'meta'], template: '<div>{{ title }} {{ meta }}<slot /></div>' },
};

function push(): ReadModelPush {
  return {
    version: 1,
    state: {
      version: 1,
      phase: 'exploration',
      quests: {},
      encounter: null,
      actors: {
        png: { id: 'png', name: 'Goblin', kind: 'npc', attributes: { forza: 1 }, skills: {}, resources: { hp: { current: 3, max: 6 } }, conditions: [], items: [], progression: { xp: 0, level: 1 } },
        eroe: {
          id: 'eroe', name: 'Eroe', kind: 'pc',
          attributes: { forza: 4 }, skills: { lame: 2 },
          resources: { hp: { current: 7, max: 10 } },
          conditions: [{ key: 'benedetto', source: 'rito', effects: [{ kind: 'checkModifier', value: 1 }], duration: { kind: 'turns', remaining: 2 } }],
          items: [{ id: 'spada', name: 'Spada', equipped: true, effects: [{ kind: 'defenseModifier', defense: 'difesa', value: 1 }] }],
          progression: { xp: 50, level: 2 },
        },
      },
    },
  };
}

describe('SheetPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.loomn = { getRuleset: () => Promise.resolve(RULESET) } as unknown as typeof window.loomn;
  });

  function mountPanel() {
    const pinia = createPinia();
    setActivePinia(pinia);
    useReadModelStore().applyPush(push());
    return mount(SheetPanel, { global: { plugins: [pinia], stubs } });
  }

  it('di default mostra il primo PG', async () => {
    const w = mountPanel();
    await flushPromises();
    expect(w.text()).toContain('Eroe');
    expect(w.text()).toContain('liv. 2');
  });

  it('mostra attributi e abilita con i valori', async () => {
    const w = mountPanel();
    await flushPromises();
    expect(w.text()).toContain('forza');
    expect(w.text()).toContain('4');
    expect(w.text()).toContain('lame');
  });

  it('mostra le barre risorse con current/max', async () => {
    const w = mountPanel();
    await flushPromises();
    expect(w.text()).toContain('hp');
    expect(w.text()).toContain('7/10');
  });

  it('mostra le condizioni con la durata', async () => {
    const w = mountPanel();
    await flushPromises();
    expect(w.text()).toContain('benedetto');
    expect(w.text()).toContain('2 turni');
  });

  it('elenca gli oggetti col flag equipaggiato e gli effetti', async () => {
    const w = mountPanel();
    await flushPromises();
    expect(w.text()).toContain('Spada');
    expect(w.text().toLowerCase()).toContain('equipaggiato');
    expect(w.text()).toContain('difesa +1');
  });

  it('cambiando selezione mostra un altro attore', async () => {
    const w = mountPanel();
    await flushPromises();
    await w.find('select[aria-label="attore"]').setValue('png');
    expect(w.text()).toContain('Goblin');
    expect(w.text()).not.toContain('Eroe');
  });

  it('senza attori mostra lo stato vuoto', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useReadModelStore().applyPush({ version: 1, state: { version: 1, phase: 'exploration', quests: {}, actors: {}, encounter: null } });
    const w = mount(SheetPanel, { global: { plugins: [pinia], stubs } });
    await flushPromises();
    expect(w.text()).toContain('Nessun personaggio');
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/components/SheetPanel.test.ts`
Expected: FAIL (Cannot find module `./SheetPanel.vue`).

- [ ] **Step 3: Scrivi l implementazione minima**

Create `app/desktop/src/renderer/src/components/SheetPanel.vue`:

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import LoomnPanel from './LoomnPanel.vue';
import { useReadModelStore } from '../stores/read-model';
import { useRulesetStore } from '../stores/ruleset';
import { resolveSelectedActor, toSheetView } from '../lib/sheet-view';

const store = useReadModelStore();
const ruleset = useRulesetStore();

onMounted(() => void ruleset.load());

// Selezione locale (display-only, non dominio): null = lascia decidere a resolveSelectedActor
// (primo PG). Se l attore scelto sparisce dal read-model, la funzione pura ripiega in modo grazioso.
const selectedId = ref<string | null>(null);
const actor = computed(() => resolveSelectedActor(store.actors, selectedId.value));
const sheet = computed(() => (actor.value ? toSheetView(actor.value, ruleset.vocabulary) : null));

function selectActor(event: Event): void {
  selectedId.value = (event.target as HTMLSelectElement).value || null;
}

const kindLabel = computed(() => (sheet.value?.kind === 'pc' ? 'PG' : 'PNG'));
</script>

<template>
  <LoomnPanel eyebrow="scheda" :title="sheet?.name ?? 'Scheda'" :meta="sheet ? `liv. ${sheet.level}` : ''">
    <div v-if="sheet" class="sheet">
      <div class="sheet__head">
        <select v-if="store.actors.length > 1" :value="actor?.id ?? ''" class="sheet__select" aria-label="attore" @change="selectActor">
          <option v-for="a in store.actors" :key="a.id" :value="a.id">{{ a.name }} ({{ a.kind === 'pc' ? 'PG' : 'PNG' }})</option>
        </select>
        <span class="sheet__id">{{ kindLabel }} · xp {{ sheet.xp }}</span>
      </div>

      <section v-if="sheet.attributes.length" class="block">
        <h4 class="block__title">Attributi</h4>
        <div class="stats">
          <div v-for="a in sheet.attributes" :key="a.key" class="stat">
            <span class="stat__label">{{ a.key }}</span>
            <span class="stat__value">{{ a.value }}</span>
          </div>
        </div>
      </section>

      <section v-if="sheet.skills.length" class="block">
        <h4 class="block__title">Abilita</h4>
        <div class="stats">
          <div v-for="s in sheet.skills" :key="s.key" class="stat">
            <span class="stat__label">{{ s.key }}</span>
            <span class="stat__value">{{ s.value }}</span>
          </div>
        </div>
      </section>

      <section v-if="sheet.resources.length" class="block">
        <h4 class="block__title">Risorse</h4>
        <div class="bars">
          <div v-for="r in sheet.resources" :key="r.key" class="bar">
            <div class="bar__head">
              <span class="bar__label">{{ r.key }}</span>
              <span class="bar__num">{{ r.current }}/{{ r.max }}</span>
            </div>
            <div class="bar__track"><div class="bar__fill" :style="{ width: `${Math.round(r.pct * 100)}%` }" /></div>
          </div>
        </div>
      </section>

      <section v-if="sheet.conditions.length" class="block">
        <h4 class="block__title">Condizioni</h4>
        <ul class="conds">
          <li v-for="c in sheet.conditions" :key="c.key" class="cond">
            <span class="cond__key">{{ c.key }}</span>
            <span class="cond__detail">{{ c.detail }}</span>
            <span class="cond__dur">{{ c.duration }}</span>
          </li>
        </ul>
      </section>

      <section class="block">
        <h4 class="block__title">Inventario</h4>
        <ul v-if="sheet.items.length" class="items">
          <li v-for="it in sheet.items" :key="it.id" class="item">
            <div class="item__head">
              <span class="item__name">{{ it.name }}</span>
              <span v-if="it.equipped" class="item__badge">equipaggiato</span>
            </div>
            <span v-if="it.effects.length" class="item__effects">{{ it.effects.join(' · ') }}</span>
          </li>
        </ul>
        <p v-else class="empty">Zaino vuoto.</p>
      </section>
    </div>
    <p v-else class="empty">Nessun personaggio nel roster.</p>
  </LoomnPanel>
</template>

<style scoped>
.sheet { display: flex; flex-direction: column; gap: 16px; height: 100%; min-height: 0; }
.sheet__head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.sheet__select { font: inherit; font-family: var(--f-ui); font-size: 13px; color: var(--text); background: var(--well); border: 1px solid var(--line-2); border-radius: 10px; padding: 7px 10px; }
.sheet__select:focus { outline: none; border-color: var(--accent); }
.sheet__id { font-family: var(--f-mono); font-size: 11px; color: var(--text-3); }
.block { display: flex; flex-direction: column; gap: 8px; }
.block__title { margin: 0; font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-3); font-weight: 600; }
.stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
.stat { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--well); }
.stat__label { font-size: 11px; color: var(--text-3); text-transform: capitalize; }
.stat__value { font-family: var(--f-mono); font-size: 18px; color: var(--text); }
.bars { display: flex; flex-direction: column; gap: 9px; }
.bar { display: flex; flex-direction: column; gap: 4px; }
.bar__head { display: flex; justify-content: space-between; align-items: baseline; }
.bar__label { font-size: 12px; color: var(--text-2); text-transform: capitalize; }
.bar__num { font-family: var(--f-mono); font-size: 11px; color: var(--text-3); }
.bar__track { height: 7px; border-radius: 99px; background: var(--well); border: 1px solid var(--line); overflow: hidden; }
.bar__fill { height: 100%; background: var(--accent); border-radius: 99px; transition: width 0.3s ease; }
.conds { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.cond { display: flex; align-items: baseline; gap: 8px; padding: 7px 10px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--well); }
.cond__key { color: var(--text); text-transform: capitalize; }
.cond__detail { flex: 1; font-size: 12px; color: var(--text-2); }
.cond__dur { font-family: var(--f-mono); font-size: 10.5px; color: var(--text-3); }
.items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.item { display: flex; flex-direction: column; gap: 3px; padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--well); }
.item__head { display: flex; align-items: center; gap: 8px; }
.item__name { color: var(--text); }
.item__badge { font-size: 9.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); background: var(--accent-dim); border-radius: var(--r-xs); padding: 2px 7px; }
.item__effects { font-family: var(--f-mono); font-size: 11px; color: var(--text-3); }
.empty { color: var(--text-3); font-size: 13px; margin: 0; }
</style>
```

- [ ] **Step 4: Esegui il test e verifica che passa**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/components/SheetPanel.test.ts`
Expected: PASS (7 test). Poi `pnpm -C app/desktop typecheck` → Done.

- [ ] **Step 5: Commit**

```bash
git add app/desktop/src/renderer/src/components/SheetPanel.vue app/desktop/src/renderer/src/components/SheetPanel.test.ts
git commit -m "feat(renderer): componente SheetPanel (identita/attributi/risorse/condizioni/inventario display-only) (10d)"
```

---

## Task 3: `views/SheetView.vue` — la route `/scheda` avvolge SheetPanel

**Files:**
- Modify: `app/desktop/src/renderer/src/views/SheetView.vue` (oggi placeholder)
- Test: `app/desktop/src/renderer/src/views/SheetView.test.ts` (nuovo)

La route `/scheda` riusa lo STESSO `SheetPanel` del Gioco (DRY): la pagina gli da larghezza piena, la griglia auto-fill rifluisce.

- [ ] **Step 1: Scrivi il test che fallisce**

Create `app/desktop/src/renderer/src/views/SheetView.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import type { RulesetResult, ReadModelPush } from '@loomn/shared';
import SheetView from './SheetView.vue';
import { useReadModelStore } from '../stores/read-model';

const RULESET: Extract<RulesetResult, { ok: true }> = {
  ok: true,
  vocabulary: { attributes: ['forza'], skills: [], resources: ['hp'], defenses: [], defaultResources: {} },
  difficulties: [], softPhases: [], questOutcomes: [], directions: [], commandPhaseRules: { combatOnly: [], nonCombatOnly: [] },
};

function push(): ReadModelPush {
  return {
    version: 1,
    state: {
      version: 1, phase: 'exploration', quests: {}, encounter: null,
      actors: { eroe: { id: 'eroe', name: 'Eroe', kind: 'pc', attributes: { forza: 3 }, skills: {}, resources: { hp: { current: 5, max: 5 } }, conditions: [], items: [], progression: { xp: 0, level: 1 } } },
    },
  };
}

describe('SheetView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.loomn = { getRuleset: () => Promise.resolve(RULESET) } as unknown as typeof window.loomn;
  });

  it('monta la Scheda nella route con l attore dal read-model', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useReadModelStore().applyPush(push());
    const w = mount(SheetView, { global: { plugins: [pinia] } });
    await flushPromises();
    expect(w.find('.route-view').exists()).toBe(true);
    expect(w.text()).toContain('Eroe');
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/views/SheetView.test.ts`
Expected: FAIL (la vista placeholder rende il testo "Piano 10d", non "Eroe").

- [ ] **Step 3: Scrivi l implementazione minima**

Replace the entire content of `app/desktop/src/renderer/src/views/SheetView.vue` with:

```vue
<script setup lang="ts">
import SheetPanel from '../components/SheetPanel.vue';
</script>

<template>
  <main class="route-view">
    <SheetPanel />
  </main>
</template>

<style scoped>
.route-view {
  flex: 1;
  min-height: 0;
}
</style>
```

- [ ] **Step 4: Esegui il test e verifica che passa**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/views/SheetView.test.ts`
Expected: PASS (1 test). Poi `pnpm -C app/desktop typecheck` → Done.

- [ ] **Step 5: Commit**

```bash
git add app/desktop/src/renderer/src/views/SheetView.vue app/desktop/src/renderer/src/views/SheetView.test.ts
git commit -m "feat(renderer): route /scheda monta SheetPanel (10d)"
```

---

## Task 4: wiring del pannello `sheet` nel Gioco + estensione del gate self-test

**Files:**
- Modify: `app/desktop/src/renderer/src/views/GameView.vue` (monta `SheetPanel` nel pannello `sheet`)
- Modify: `app/desktop/src/renderer/src/views/GameView.test.ts` (stub di `SheetPanel`)
- Modify: `app/desktop/src/renderer/src/renderer.ts` (self-test: naviga alla Scheda)

Il pannello `sheet` del preset non-combat smette di essere placeholder: monta `SheetPanel`. Il self-test (gate "esegui l app") aggiunge una navigazione a `/scheda` che monta `SheetPanel` via la route reale dentro Electron — esercizio end-to-end. La scheda e read-only → **nessun nuovo evento, la versione resta 7** (la fase 2 del gate continua a verificare `version === 7`).

- [ ] **Step 1: Aggiorna il test di GameView (deve fallire con la vista attuale)**

In `app/desktop/src/renderer/src/views/GameView.test.ts`, aggiungi lo stub di `SheetPanel` accanto agli altri stub pesanti e registralo nei `stubs`. Modifica le due righe:

Da:
```ts
const EncounterPanel = { template: '<div class="encounter-stub">Scontro</div>' };
```
A:
```ts
const EncounterPanel = { template: '<div class="encounter-stub">Scontro</div>' };
const SheetPanel = { template: '<div class="sheet-stub">Scheda</div>' };
```

Da:
```ts
  return mount(GameView, { global: { plugins: [pinia], stubs: { GridLayout, GridItem, NarrativePanel, DicePanel, EncounterPanel } } });
```
A:
```ts
  return mount(GameView, { global: { plugins: [pinia], stubs: { GridLayout, GridItem, NarrativePanel, DicePanel, EncounterPanel, SheetPanel } } });
```

Run: `pnpm exec vitest run app/desktop/src/renderer/src/views/GameView.test.ts`
Expected: PASS comunque (lo stub `SheetPanel` non e ancora usato da `GameView.vue`, ma il test "in exploration ... Scheda" passa ancora via il placeholder `titles[sheet]='Scheda'`). Questo step prepara lo stub; il fallimento reale lo cattura lo step 3 dopo aver montato `SheetPanel` (senza lo stub il test esploderebbe con unhandled rejection da `getRuleset` mancante).

Nota: questo e l unico modo per dimostrare il rischio "stub mancante" senza rompere la suite — lo stub va aggiunto NELLO STESSO commit del wiring (step 3). Procedi.

- [ ] **Step 2: Monta SheetPanel in GameView**

In `app/desktop/src/renderer/src/views/GameView.vue`:

Aggiungi l import accanto agli altri pannelli:
```ts
import EncounterPanel from '../components/EncounterPanel.vue';
import SheetPanel from '../components/SheetPanel.vue';
```

Rimuovi la riga ora inutilizzata (tutti i pannelli sono cablati, il fallback resta solo difensivo):
```ts
// Titolo del pannello ancora placeholder (scheda 10d).
const titles: Record<string, string> = { sheet: 'Scheda' };
```

Nel template, sostituisci il ramo del pannello `sheet`. Da:
```vue
        <NarrativePanel v-if="item.i === 'narrative'" />
        <DicePanel v-else-if="item.i === 'dice'" />
        <EncounterPanel v-else-if="item.i === 'encounter'" />
        <LoomnPanel v-else :title="titles[item.i] ?? item.i" eyebrow="pannello">
          <p class="game-view__placeholder">Contenuto nel Piano 10d.</p>
        </LoomnPanel>
```
A:
```vue
        <NarrativePanel v-if="item.i === 'narrative'" />
        <DicePanel v-else-if="item.i === 'dice'" />
        <EncounterPanel v-else-if="item.i === 'encounter'" />
        <SheetPanel v-else-if="item.i === 'sheet'" />
        <LoomnPanel v-else :title="item.i" eyebrow="pannello">
          <p class="game-view__placeholder">Pannello non riconosciuto.</p>
        </LoomnPanel>
```

- [ ] **Step 3: Esegui i test di GameView e App e verifica che passano**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/views/GameView.test.ts app/desktop/src/renderer/src/App.test.ts`
Expected: PASS. `GameView.test`: "in exploration monta narrazione, scheda e dadi" → il pannello `sheet` ora rende lo stub `SheetPanel` (testo "Scheda"), 3 grid item; "passando a combat ... non Scheda" invariato. `App.test`: monta `App` → route `/` → `GameView` → `SheetPanel` REALE (in App.test NON e stubbato): usa lo stub `getRuleset` gia presente in `App.test` (vocabolario vuoto) e legge `store.actors` vuoto → stato vuoto "Nessun personaggio", nessun throw. **Se App.test fallisce con unhandled rejection**, verifica che `App.test` stubbi `getRuleset` (lo fa gia, riga ~30) — non aggiungere stub a `App.vue`.

- [ ] **Step 4: Estendi il self-test (gate esegui-app)**

In `app/desktop/src/renderer/src/renderer.ts`, nella fase 1 del self-test, dopo il blocco del comando GM `EnterPhase` (la riga `check(gm.ok && ... 'comando GM EnterPhase cambia fase')`) e PRIMA del calcolo di `passed`, inserisci la navigazione alla Scheda:

Da:
```ts
      // Comando GM via IPC (EnterPhase, non-combat): la fase passa da exploration a dialogue.
      const gm = await window.loomn.dispatch({ type: 'EnterPhase', to: 'dialogue' });
      check(gm.ok && gm.events.some((e) => e.type === 'PhaseChanged'), 'comando GM EnterPhase cambia fase');
    } else {
```
A:
```ts
      // Comando GM via IPC (EnterPhase, non-combat): la fase passa da exploration a dialogue.
      const gm = await window.loomn.dispatch({ type: 'EnterPhase', to: 'dialogue' });
      check(gm.ok && gm.events.some((e) => e.type === 'PhaseChanged'), 'comando GM EnterPhase cambia fase');

      // 10d: la Scheda monta via la route reale (SheetPanel) e legge l attore dal read-model.
      // Read-only -> nessun evento, la versione resta 7 (la fase 2 lo verifica).
      await appRouter.push('/scheda');
      check(appRouter.currentRoute.value.name === 'sheet', 'router naviga alla Scheda (SheetPanel montato)');
      check(readModel.actors.some((a) => a.id === 'goblin'), 'la Scheda vede l attore dal read-model');
      await appRouter.push('/');
      check(appRouter.currentRoute.value.name === 'game', 'router torna al Gioco dopo la Scheda');
    } else {
```

(La fase 2 — `s0.version === 7` — resta invariata: la scheda non muta lo stato.)

- [ ] **Step 5: Esegui l intera suite renderer e il typecheck**

Run: `pnpm exec vitest run app/desktop` (gira solo il progetto renderer dalla workspace; oppure `pnpm test` dalla root per i 2 progetti).
Expected: PASS, ~661 test totali (639 baseline + 22 nuovi: 13 Task 1 + 7 Task 2 + 2 Task 3; Task 4 aggiorna test esistenti senza aggiungerne).
Run: `pnpm -C app/desktop typecheck`
Expected: Done (nessun errore `vue-tsc`).

- [ ] **Step 6: Commit**

```bash
git add app/desktop/src/renderer/src/views/GameView.vue app/desktop/src/renderer/src/views/GameView.test.ts app/desktop/src/renderer/src/renderer.ts
git commit -m "feat(renderer): monta SheetPanel nel pannello sheet + estende il self-test con la Scheda (10d)"
```

---

## Gate finale (passo ORCHESTRATORE, non subagent)

Dopo il merge dei 4 task sul branch, l orchestratore esegue il **gate Electron 2 fasi** (riproducibile, HANDOFF §9 item 2). Da Bash, dalla root:

```bash
pnpm --filter @loomn/desktop build
pnpm rebuild:electron
GATE=$(mktemp -d); WIN_GATE=$(cygpath -m "$GATE")
LOOMN_SELFTEST=1 LOOMN_USERDATA="$WIN_GATE" pnpm --filter @loomn/desktop exec electron .   # atteso VERDICT: PASS, exit 0
LOOMN_SELFTEST=2 LOOMN_USERDATA="$WIN_GATE" pnpm --filter @loomn/desktop exec electron .   # atteso VERDICT: PASS (version 7 persistita)
pnpm rebuild:node
```

Atteso: entrambe le fasi `VERDICT: PASS`. Se un rebuild fallisce con EBUSY/EPERM su `better_sqlite3.node`, fermare SOLO i processi Loomn (`Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'tabl|loomn' -and $_.Name -match 'electron|node' }` → `Stop-Process -Id <pid> -Force`), poi rebuild. **Screenshot della Scheda** (route `/scheda` e pannello `sheet` del Gioco) allegato alla verifica.

---

## Self-review (eseguita dall autore del piano)

**1. Copertura dello spec (§10 riga 10d, §2 decisione 5, §7 audit):**
- identita/attributi/abilita/risorse/condizioni/progressione dal read-model → Task 1 (`toSheetView`) + Task 2 (rendering). ✅
- data-driven dal vocabolario (ordine/etichette via `get-ruleset` 10g) → Task 1 (`orderedEntries`/`resourceBars` ordinati dal vocabolario) + Task 2 (`ruleset.load()`). ✅
- inventario DISPLAY-ONLY sul modello piatto `Item{id,name,equipped,effects}` (lista/flag/effetti) → Task 1 (`ItemLine`/`formatItemEffect`) + Task 2 (sezione Inventario). ✅
- selezione dell attore (default PG, selezionabile) → Task 1 (`resolveSelectedActor`) + Task 2 (selettore). ✅
- riempie il pannello `sheet` (preset non-combat) + route `/scheda` → Task 4 (GameView) + Task 3 (SheetView). ✅
- niente slot profondi/contenitori/equip-come-azione/movimento (deferiti) → fuori ambito esplicito. ✅

**2. Scansione placeholder:** nessun "TBD"/"implementa dopo"; ogni step ha codice completo. ✅

**3. Coerenza dei tipi:** `VocabularyView`, `SheetView`/`SheetEntry`/`ResourceBar`/`ConditionLine`/`ItemLine`, `toSheetView`/`orderedEntries`/`resourceBars`/`resolveSelectedActor` usati con le stesse firme fra Task 1 (def) e Task 2/3 (uso). `ActorView` importato da `stores/read-model`. ✅

**4. Lezioni dure (§5):**
- scope discipline in ogni task; nessun tocco a config/`tokens.css`/CSP. ✅
- niente apostrofi nelle stringhe di test in apici singoli (verificato: "l ordine", "c e", "dell attore", "l attore", "l id"). Grep di verifica del piano: `(it|describe)\('[^']*'[A-Za-zàèéìòù]` → no match nei blocchi di test. ✅
- la scheda e read-only → nessun payload dispatch/IPC (niente rischio proxy reactive). ✅
- rischio stub mancante (`GameView.test`/`App.test`) gestito esplicitamente in Task 4 step 1/3. ✅
- TS strict: `noUncheckedIndexedAccess` gestito con `?? 0`/`?? {current:0,max:0}`/`?? null`; switch esaustivi con `default: { const _exhaustive: never = x; ... }`. ✅

---

## Roadmap aggiornata

- Piani 1-9 ✅ · backlog pre-Piano-10 ✅ · studio Piano 10 ✅ · Piano 0 ✅ · 10a ✅ · 10g ✅ · 10f ✅ · 10b ✅ · 10c ✅
- **10d (questo piano) — Scheda + inventario display-only** → in esecuzione
- **Prossimo: 10e — Diario + Compagnia** (narrativa L2 + canon + trigger `reflect`, roster PG/PNG)
- Deferiti post-Piano-10: **motore Inventario & Equipaggiamento** (slot profondi/contenitori/equip-come-azione/catalogo) e **movimento/topologia di zona** (entrambi design-first all apertura, spec §11 / HANDOFF §8).
- Ordine sotto-piani: `10a✅ → 10g✅ → 10f✅ → 10b✅ → 10c✅ → 10d → 10e`.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-18-loomn-piano10d-scheda-inventario.md`.**

Esecuzione (flusso §4): commit del doc su `main` → branch `feat/piano10d-scheda-inventario` → **subagent-driven** (per ogni task: implementer + spec-review + code-quality-review; final review opus a fine branch) → gate Electron 2 fasi → `finishing-a-development-branch` (merge ff) → `git push origin main` → aggiorna HANDOFF (§0-duovicies) + memoria (`loomn-project.md` + `MEMORY.md`).
