# Piano 10b — Gioco (chat/narrazione + dadi 3D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Riempire il pannello Narrazione e il pannello Dadi del Gioco: una storia persistente (cronologia narrazione + invio azione via `run-turn`, gated da `canRunTurn`) e dadi 3D che atterrano sulle facce esatte decise dal motore.

**Architecture:** Renderer-only sul backend gia pronto (IPC `run-turn`/`getNarrationHistory`, `events` coi `RollResult`, store `useProviderStatusStore`/`useReadModelStore`). Il motore decide gli esiti (RNG seedato); il 3D e cosmetico e **forza** le facce. Funzioni pure mappano `RollResult` -> notazione `@3d-dice/dice-box-threejs` (`NdS@v1,v2,...`) e readout; store Pinia tengono la storia e la coda dadi; un composable orchestra il turno; i componenti rendono. La libreria 3D e stata scelta DOPO uno spike empirico (vedi sotto): `@3d-dice/dice-box-threejs` forza le facce sotto la CSP di produzione **senza alcun rilassamento** (niente worker/wasm/eval), a differenza di `@3d-dice/dice-box` (Babylon) che non sa forzare e richiederebbe `worker-src blob:` + `wasm-unsafe-eval`.

**Tech Stack:** Vue 3 + TS strict, Pinia, Vue Test Utils (jsdom), Vitest, grid-layout-plus (gia in 10a), `@3d-dice/dice-box-threejs` (nuova dep, WebGL/Three.js).

**Spec di riferimento:** `docs/superpowers/specs/2026-06-17-piano10-ui-design.md` (§4 layout adattivo, §5 read-side, §6 dadi 3D, §9 verifica, §10 riga 10b, §11 streaming deferito). HANDOFF §0-novodecies (10f, lezioni), §4 (processo), §5 (house rules).

**Esito dello spike (vincolante, gia deciso con l utente):** usare `@3d-dice/dice-box-threejs`. Notazione facce forzate `1d20+2d6+1d8@18,3,5,7` (mappa diretta da `RollResult.dice`); determinismo verificato (stessa faccia su ripetizioni); sides non-standard (es. d7) -> la libreria lancia -> **token numerico di fallback** (gia richiesto da spec §6); CSP di produzione invariata; asset (texture) bundlati offline via `publicDir` del renderer (suoni disattivati).

---

## Fuori ambito (esplicito, deferito)

- **Streaming token-by-token** del turno (spec §11): la UI funziona su request/response; durante il turno mostra "il Master sta scrivendo...". Fast-follow additivo.
- **Cockpit combattimento / zone** (iniziativa/round/turni, label zone): **Piano 10c**. 10b lascia i pannelli `encounter`/`sheet` come placeholder.
- **Scheda + inventario** (10d), **Diario + Compagnia** (10e).
- **Tema dadi per-modulo** (colorset/materiale dai moduli, spec §3/§6): 10b usa un tema neutro fisso; il theming per-modulo arriva con i moduli (Piano 11).
- **run-turn deterministico nel self-test** (provider LLM stubbato nel main, spec §9): il gate prova boot + read-wiring + nessun crash coi nuovi pannelli; il flusso di turno e coperto dagli unit test (`use-run-turn` con `window.loomn.runTurn` stubbato). Uno stub LLM in-main e un concern separato (non fatto neppure in 10f).
- **Dadi 3D in unit test** (spec §9): il rendering WebGL e validato dallo spike + screenshot, non da Vitest/jsdom (jsdom non ha WebGL). Solo la **mappatura** (pura) e il **readout** sono unit-testati.
- Nessuna modifica a `@loomn/shared`/engine/host, nessun nuovo Command/Event/IPC/tabella/migrazione.

---

## File Structure

**Step 0 (orchestratore — NON un subagent; tocca `package.json` + vendora asset + shim di tipi):**
- Modify: `app/desktop/package.json` (aggiunge `@3d-dice/dice-box-threejs` alle dependencies).
- Create: `app/desktop/src/renderer/public/dice-box/textures/...` (texture vendorate da `node_modules/@3d-dice/dice-box-threejs/public/textures`, servite da Vite `publicDir` in dev e copiate in `out/renderer` in build).
- Create: `app/desktop/src/renderer/src/dice-box-threejs.d.ts` (shim `declare module` per la libreria senza tipi).

**Subagent tasks (renderer-only, TDD):**
- `app/desktop/src/renderer/src/lib/dice.ts` (+test) — Task 1: mappa pura `RollResult.dice -> { notation, tokens }`.
- `app/desktop/src/renderer/src/lib/turn-events.ts` (+test) — Task 2: estrae i tiri animabili dagli `events` di un turno/dispatch.
- `app/desktop/src/renderer/src/stores/narration.ts` (+test) — Task 3: store della storia (carica cronologia, pagina, append turno, pending/errore).
- `app/desktop/src/renderer/src/stores/dice.ts` (+test) — Task 4: coda dadi (i tiri dell ultimo turno + nonce di ri-trigger).
- `app/desktop/src/renderer/src/composables/use-run-turn.ts` (+test) — Task 5: orchestratore del turno (runTurn -> narration + dice store).
- `app/desktop/src/renderer/src/components/NarrativePanel.vue` (+test) — Task 6: log storia + input azione gated.
- `app/desktop/src/renderer/src/components/DiceCanvas.vue` (no unit test), `app/desktop/src/renderer/src/components/DicePanel.vue` (+test) — Task 7: 3D lazy + readout.
- Modify `app/desktop/src/renderer/src/views/GameView.vue` (+ aggiorna `GameView.test.ts`), `app/desktop/src/renderer/src/renderer.ts` (self-test) — Task 8: wiring + gate.

**Disciplina di scope (CRITICO, in OGNI prompt di task):** il subagent modifica SOLO i file elencati nel task. MAI toccare `package.json`/`tsconfig*`/`vitest.config`/`vitest.workspace`/`electron.vite.config`/`index.html` (CSP) — sono passi orchestratore gia eseguiti nello Step 0 o non necessari. `git status --short` prima di ogni commit. Niente apostrofi nelle stringhe `it('...')`/`describe('...')` in apici singoli (usa "l attore", "c e"; `è/é` vanno bene).

---

## Step 0 — Orchestratore: dipendenza dadi + asset + shim (NON un subagent)

Eseguito dall orchestratore prima di creare il branch dei task (oppure subito dopo, ma prima del Task 7). Comandi:

- [ ] **0.1 — Aggiungi la dipendenza** (dalla root):

```bash
pnpm --filter @loomn/desktop add @3d-dice/dice-box-threejs
```

Atteso: `@3d-dice/dice-box-threejs` compare in `app/desktop/package.json` dependencies. Se il postinstall e interattivo va in timeout-default (innocuo, come osservato nello spike).

- [ ] **0.2 — Vendora le texture offline** (servite da Vite `publicDir`; i suoni NON servono, `sounds:false`):

```bash
mkdir -p app/desktop/src/renderer/public/dice-box
cp -r node_modules/@3d-dice/dice-box-threejs/public/textures app/desktop/src/renderer/public/dice-box/textures
```

Atteso: `app/desktop/src/renderer/public/dice-box/textures/` popolata. (Vite usa `<root>/public` come `publicDir`; il root del renderer e `app/desktop/src/renderer`, dove sta `index.html` -> servito a `/dice-box/...` in dev e copiato in `out/renderer/dice-box/...` in build. Nessuna modifica a `electron.vite.config`.)

- [ ] **0.3 — Shim di tipi** per la libreria senza `.d.ts`:

Create `app/desktop/src/renderer/src/dice-box-threejs.d.ts`:

```ts
// @3d-dice/dice-box-threejs non spedisce tipi. Shim minimo della superficie usata da DiceCanvas.
declare module '@3d-dice/dice-box-threejs' {
  export interface DiceBoxConfig {
    assetPath?: string;
    scale?: number;
    sounds?: boolean;
    theme_colorset?: string;
    theme_material?: string;
    baseScale?: number;
    gravity_multiplier?: number;
    strength?: number;
    onRollComplete?: (results: unknown) => void;
  }
  export default class DiceBox {
    constructor(selector: string, config?: DiceBoxConfig);
    initialize(): Promise<void>;
    roll(notation: string): Promise<unknown>;
    clear(): void;
  }
}
```

- [ ] **0.4 — Verifica non-regressione**: `pnpm test` dalla root resta verde (**570**), `pnpm -r typecheck` pulito. (Se i test SQLite falliscono con `NODE_MODULE_VERSION` -> `pnpm rebuild:node`, vedi HANDOFF §6.) Poi crea il branch `feat/piano10b-gioco`.

---

## Task 1: `lib/dice.ts` — mappa pura RollResult -> notazione + token

**Files:**
- Create: `app/desktop/src/renderer/src/lib/dice.ts`
- Test: `app/desktop/src/renderer/src/lib/dice.test.ts`

La funzione cardine: il motore decide i valori, qui li traduco nella notazione `@` di dice-box-threejs. Dadi standard -> notazione 3D; sides non-standard -> token numerici (la libreria lancia su tipi sconosciuti, verificato nello spike con d7).

- [ ] **Step 1: Scrivi il test che fallisce**

Create `app/desktop/src/renderer/src/lib/dice.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toDicePlan, STANDARD_SIDES } from './dice';

describe('toDicePlan', () => {
  it('raggruppa un pool misto standard in una notazione con le facce forzate', () => {
    const plan = toDicePlan([
      { sides: 20, value: 18 },
      { sides: 6, value: 3 },
      { sides: 6, value: 5 },
      { sides: 8, value: 7 },
    ]);
    expect(plan.notation).toBe('1d20+2d6+1d8@18,3,5,7');
    expect(plan.tokens).toEqual([]);
  });

  it('separa i sides non-standard come token numerici escludendoli dalla notazione', () => {
    const plan = toDicePlan([
      { sides: 20, value: 12 },
      { sides: 7, value: 5 },
    ]);
    expect(plan.notation).toBe('1d20@12');
    expect(plan.tokens).toEqual([{ sides: 7, value: 5 }]);
  });

  it('con soli sides non-standard non produce notazione 3D', () => {
    const plan = toDicePlan([{ sides: 7, value: 3 }]);
    expect(plan.notation).toBeNull();
    expect(plan.tokens).toEqual([{ sides: 7, value: 3 }]);
  });

  it('su lista vuota non produce notazione ne token', () => {
    const plan = toDicePlan([]);
    expect(plan.notation).toBeNull();
    expect(plan.tokens).toEqual([]);
  });

  it('preserva l ordine di prima apparizione dei gruppi di sides', () => {
    const plan = toDicePlan([
      { sides: 6, value: 4 },
      { sides: 20, value: 11 },
      { sides: 6, value: 2 },
    ]);
    expect(plan.notation).toBe('1d6+1d20+1d6@4,2,11');
  });

  it('considera standard i poliedri usuali', () => {
    expect([...STANDARD_SIDES].sort((a, b) => a - b)).toEqual([4, 6, 8, 10, 12, 20, 100]);
  });
});
```

Nota sull ordine: dice-box-threejs accetta la lista `@` **piatta in ordine di gruppo**. Raggruppo per sides preservando l ordine di prima apparizione; i valori di ogni gruppo escono consecutivi. Per `[d6,d20,d6]` i gruppi sono `d6`(prima a x=0) poi `d20`, e i due d6 si fondono nello stesso gruppo -> `1d6+1d20+1d6`? No: stesso sides = stesso gruppo. La notazione e `1d20+...`? Vedi implementazione: fondo per sides ma l ordine del gruppo e quello della PRIMA apparizione del sides, e i valori del gruppo sono nell ordine originale. Per `[d6=4, d20=11, d6=2]`: gruppo `d6` (prima apparizione x=0) valori `[4,2]`, gruppo `d20` valori `[11]` -> notazione `2d6+1d20@4,2,11`. **Correggo il test sopra**: la riga attesa deve essere `2d6+1d20@4,2,11` con `tokens []`.

- [ ] **Step 1b: Correggi il test all atteso reale del raggruppamento**

Sostituisci il blocco "preserva l ordine" con:

```ts
  it('fonde i dadi dello stesso sides nello stesso gruppo, ordine di prima apparizione', () => {
    const plan = toDicePlan([
      { sides: 6, value: 4 },
      { sides: 20, value: 11 },
      { sides: 6, value: 2 },
    ]);
    expect(plan.notation).toBe('2d6+1d20@4,2,11');
    expect(plan.tokens).toEqual([]);
  });
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run (dalla root): `pnpm exec vitest run app/desktop/src/renderer/src/lib/dice.test.ts`
Atteso: FAIL con "toDicePlan is not a function" / modulo inesistente.

- [ ] **Step 3: Implementa il minimo**

Create `app/desktop/src/renderer/src/lib/dice.ts`:

```ts
import type { DispatchResult } from '@loomn/shared';

// Tipi di vista derivati dal CONTRATTO IPC (shared resta la fonte; il renderer NON importa engine).
type OkDispatch = Extract<DispatchResult, { ok: true }>;
export type DomainEventView = OkDispatch['events'][number];
type AttackEv = Extract<DomainEventView, { type: 'AttackResolved' }>;
/** Forma di un tiro-prova (dice + modificatore + total/mode + dc/margin/outcome). */
export type CheckView = AttackEv['check'];
/** Un singolo dado risolto dal motore. */
export type DieView = CheckView['dice'][number];
/** Grado di esito di una prova. */
export type Outcome = CheckView['outcome'];

/** Poliedri che dice-box-threejs sa renderizzare. Tutto il resto -> token numerico (spec §6). */
export const STANDARD_SIDES: ReadonlySet<number> = new Set([4, 6, 8, 10, 12, 20, 100]);

/** Piano di rendering di un tiro: notazione 3D coi valori FORZATI + token per i sides non-standard. */
export interface DicePlan {
  /** Notazione `NdS+MdT@v1,v2,...` per i dadi standard, o null se non ce ne sono. */
  notation: string | null;
  /** Dadi a sides non-standard, da mostrare come chip numerici (non renderizzabili in 3D). */
  tokens: DieView[];
}

/** Traduce i dadi risolti dal motore nel piano di rendering. Pura: nessun RNG, nessun side effect. */
export function toDicePlan(dice: readonly DieView[]): DicePlan {
  const tokens: DieView[] = [];
  // Gruppi per sides, in ordine di prima apparizione.
  const order: number[] = [];
  const byside = new Map<number, number[]>();
  for (const d of dice) {
    if (!STANDARD_SIDES.has(d.sides)) {
      tokens.push(d.tag === undefined ? { sides: d.sides, value: d.value } : { sides: d.sides, value: d.value, tag: d.tag });
      continue;
    }
    if (!byside.has(d.sides)) {
      byside.set(d.sides, []);
      order.push(d.sides);
    }
    byside.get(d.sides)!.push(d.value);
  }
  if (order.length === 0) return { notation: null, tokens };
  const groups = order.map((s) => `${byside.get(s)!.length}d${s}`);
  const values = order.flatMap((s) => byside.get(s)!);
  return { notation: `${groups.join('+')}@${values.join(',')}`, tokens };
}
```

- [ ] **Step 4: Esegui il test e verifica che passa**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/lib/dice.test.ts`
Atteso: PASS (6 test). `pnpm -C app/desktop typecheck` pulito.

- [ ] **Step 5: Commit**

```bash
git add app/desktop/src/renderer/src/lib/dice.ts app/desktop/src/renderer/src/lib/dice.test.ts
git commit -m "feat(renderer): mappa pura RollResult -> notazione dice-box-threejs + token non-standard"
```

---

## Task 2: `lib/turn-events.ts` — estrazione dei tiri animabili dagli events

**Files:**
- Create: `app/desktop/src/renderer/src/lib/turn-events.ts`
- Test: `app/desktop/src/renderer/src/lib/turn-events.test.ts`

Gli `events` di `dispatch`/`run-turn` (Piano 0) contengono i tiri: `AttackResolved.check`, `CheckResolved.result`, `ResourceEffectApplied.roll`. Estraggo da ognuno un `RolledDice` con piano 3D, fonte, etichetta e readout (modifier/total + dc/margin/outcome per le prove).

- [ ] **Step 1: Scrivi il test che fallisce**

Create `app/desktop/src/renderer/src/lib/turn-events.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractRolls } from './turn-events';
import type { DomainEventView } from './dice';

const attack: DomainEventView = {
  type: 'AttackResolved',
  attackerId: 'goblin',
  targetId: 'eroe',
  hit: true,
  check: {
    dice: [{ sides: 20, value: 18 }],
    modifierTotal: 2,
    total: 20,
    mode: 'check',
    dc: 12,
    margin: 8,
    outcome: 'success',
  },
};
const check: DomainEventView = {
  type: 'CheckResolved',
  actorId: 'eroe',
  difficulty: 'moderate',
  attribute: 'forza',
  result: {
    dice: [{ sides: 20, value: 4 }],
    modifierTotal: 1,
    total: 5,
    mode: 'check',
    dc: 15,
    margin: -10,
    outcome: 'disaster',
  },
};
const effect: DomainEventView = {
  type: 'ResourceEffectApplied',
  targetId: 'eroe',
  resource: 'hp',
  delta: 8,
  roll: { dice: [{ sides: 6, value: 3 }, { sides: 6, value: 5 }], modifierTotal: 0, total: 8, mode: 'effect' },
};

describe('extractRolls', () => {
  it('estrae un tiro da AttackResolved con readout della prova', () => {
    const rolls = extractRolls([attack]);
    expect(rolls).toHaveLength(1);
    const r = rolls[0]!;
    expect(r.source).toBe('attack');
    expect(r.notation).toBe('1d20@18');
    expect(r.modifierTotal).toBe(2);
    expect(r.total).toBe(20);
    expect(r.dc).toBe(12);
    expect(r.outcome).toBe('success');
  });

  it('estrae un tiro da CheckResolved', () => {
    const rolls = extractRolls([check]);
    expect(rolls[0]!.source).toBe('check');
    expect(rolls[0]!.outcome).toBe('disaster');
    expect(rolls[0]!.notation).toBe('1d20@4');
  });

  it('estrae un effetto senza dc/outcome (non e una prova)', () => {
    const rolls = extractRolls([effect]);
    expect(rolls[0]!.source).toBe('effect');
    expect(rolls[0]!.notation).toBe('2d6@3,5');
    expect(rolls[0]!.dc).toBeUndefined();
    expect(rolls[0]!.outcome).toBeUndefined();
  });

  it('ignora gli eventi senza tiri e preserva l ordine', () => {
    const narr: DomainEventView = { type: 'NarrationRecorded', playerAction: 'a', narration: 'b' };
    const rolls = extractRolls([narr, attack, narr, effect]);
    expect(rolls.map((r) => r.source)).toEqual(['attack', 'effect']);
  });

  it('su lista vuota ritorna lista vuota', () => {
    expect(extractRolls([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/lib/turn-events.test.ts`
Atteso: FAIL con "extractRolls is not a function".

- [ ] **Step 3: Implementa il minimo**

Create `app/desktop/src/renderer/src/lib/turn-events.ts`:

```ts
import { toDicePlan, type DomainEventView, type DieView, type Outcome } from './dice';

/** Un tiro pronto da animare + readout dei valori autorevoli del motore. */
export interface RolledDice {
  source: 'attack' | 'check' | 'effect';
  /** Etichetta umana della fonte del tiro. */
  tag: string;
  notation: string | null;
  tokens: DieView[];
  modifierTotal: number;
  total: number;
  dc?: number;
  margin?: number;
  outcome?: Outcome;
}

/** Estrae dagli events di un turno/dispatch i tiri animabili, in ordine, ignorando il resto. */
export function extractRolls(events: readonly DomainEventView[]): RolledDice[] {
  const rolls: RolledDice[] = [];
  for (const ev of events) {
    if (ev.type === 'AttackResolved') {
      const plan = toDicePlan(ev.check.dice);
      rolls.push({
        source: 'attack',
        tag: `Attacco -> ${ev.targetId}`,
        notation: plan.notation,
        tokens: plan.tokens,
        modifierTotal: ev.check.modifierTotal,
        total: ev.check.total,
        dc: ev.check.dc,
        margin: ev.check.margin,
        outcome: ev.check.outcome,
      });
    } else if (ev.type === 'CheckResolved') {
      const plan = toDicePlan(ev.result.dice);
      const label = ev.attribute ?? ev.skill ?? ev.difficulty;
      rolls.push({
        source: 'check',
        tag: `Prova (${label})`,
        notation: plan.notation,
        tokens: plan.tokens,
        modifierTotal: ev.result.modifierTotal,
        total: ev.result.total,
        dc: ev.result.dc,
        margin: ev.result.margin,
        outcome: ev.result.outcome,
      });
    } else if (ev.type === 'ResourceEffectApplied') {
      const plan = toDicePlan(ev.roll.dice);
      rolls.push({
        source: 'effect',
        tag: `${ev.resource} ${ev.delta >= 0 ? '+' : ''}${ev.delta}`,
        notation: plan.notation,
        tokens: plan.tokens,
        modifierTotal: ev.roll.modifierTotal,
        total: ev.roll.total,
      });
    }
  }
  return rolls;
}
```

- [ ] **Step 4: Esegui il test e verifica che passa**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/lib/turn-events.test.ts`
Atteso: PASS (5 test). `pnpm -C app/desktop typecheck` pulito (nota: i campi opzionali `dc`/`outcome` usano spread condizionale implicito tramite `?` nell interfaccia; sotto `exactOptionalPropertyTypes` l assegnazione diretta di un valore o l omissione e ok — qui assegno sempre per attack/check e ometto per effect, mai `: undefined`).

- [ ] **Step 5: Commit**

```bash
git add app/desktop/src/renderer/src/lib/turn-events.ts app/desktop/src/renderer/src/lib/turn-events.test.ts
git commit -m "feat(renderer): estrae i tiri animabili dagli events di turno/dispatch"
```

---

## Task 3: `stores/narration.ts` — store della storia di narrazione

**Files:**
- Create: `app/desktop/src/renderer/src/stores/narration.ts`
- Test: `app/desktop/src/renderer/src/stores/narration.test.ts`

Tiene il log della storia (oldest-first per la lettura), carica la cronologia via `getNarrationHistory` (cursor-by-seq, l API ritorna newest-first), pagina "carica piu vecchie", appende il turno appena narrato, espone `pending`/`error`.

- [ ] **Step 1: Scrivi il test che fallisce**

Create `app/desktop/src/renderer/src/stores/narration.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useNarrationStore } from './narration';

function stubHistory(impl: (req: { before?: number; limit?: number }) => unknown): void {
  window.loomn = { getNarrationHistory: vi.fn(impl) } as unknown as typeof window.loomn;
}

describe('useNarrationStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    stubHistory(() => ({ ok: true, entries: [], hasMore: false }));
  });

  it('parte vuoto e non in pending', () => {
    const s = useNarrationStore();
    expect(s.entries).toEqual([]);
    expect(s.pending).toBe(false);
    expect(s.error).toBeNull();
    expect(s.hasMore).toBe(false);
  });

  it('loadInitial popola la storia in ordine cronologico crescente', async () => {
    // l API ritorna newest-first: seq 3,2,1
    stubHistory(() => ({
      ok: true,
      hasMore: true,
      entries: [
        { seq: 3, playerAction: 'a3', narration: 'n3' },
        { seq: 2, playerAction: 'a2', narration: 'n2' },
        { seq: 1, playerAction: 'a1', narration: 'n1' },
      ],
    }));
    const s = useNarrationStore();
    await s.loadInitial();
    expect(s.entries.map((e) => e.narration)).toEqual(['n1', 'n2', 'n3']);
    expect(s.hasMore).toBe(true);
  });

  it('loadOlder pagina con before = seq minima e antepone', async () => {
    const calls: Array<{ before?: number }> = [];
    stubHistory((req) => {
      calls.push(req);
      if (req.before === undefined) {
        return { ok: true, hasMore: true, entries: [{ seq: 3, playerAction: 'a3', narration: 'n3' }] };
      }
      return { ok: true, hasMore: false, entries: [{ seq: 2, playerAction: 'a2', narration: 'n2' }] };
    });
    const s = useNarrationStore();
    await s.loadInitial();
    await s.loadOlder();
    expect(calls[1]?.before).toBe(3);
    expect(s.entries.map((e) => e.narration)).toEqual(['n2', 'n3']);
    expect(s.hasMore).toBe(false);
  });

  it('appendTurn aggiunge una voce in coda (la piu recente)', async () => {
    const s = useNarrationStore();
    await s.loadInitial();
    s.appendTurn('attacco il goblin', 'Il goblin para e ringhia.');
    expect(s.entries.at(-1)?.playerAction).toBe('attacco il goblin');
    expect(s.entries.at(-1)?.narration).toBe('Il goblin para e ringhia.');
  });

  it('loadInitial su esito di errore popola error e non lancia', async () => {
    stubHistory(() => ({ ok: false, error: 'boom' }));
    const s = useNarrationStore();
    await s.loadInitial();
    expect(s.error).toBe('boom');
    expect(s.entries).toEqual([]);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/stores/narration.test.ts`
Atteso: FAIL (modulo inesistente).

- [ ] **Step 3: Implementa il minimo**

Create `app/desktop/src/renderer/src/stores/narration.ts`:

```ts
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { NarrationEntryDto } from '@loomn/shared';

/** Voce del log: una entry della storia (con seq) o un turno appena giocato (senza seq finche
 *  non ricaricato dallo stream). `key` rende stabile il v-for. */
export interface NarrationLine {
  key: string;
  seq?: number;
  playerAction: string;
  narration: string;
}

let liveCounter = 0;

/** Store della storia di narrazione (read-side + append ottimistico del turno). */
export const useNarrationStore = defineStore('narration', () => {
  const entries = ref<NarrationLine[]>([]);
  const hasMore = ref(false);
  const pending = ref(false);
  const error = ref<string | null>(null);

  function toLine(e: NarrationEntryDto): NarrationLine {
    return { key: `seq-${e.seq}`, seq: e.seq, playerAction: e.playerAction, narration: e.narration };
  }

  /** Carica la finestra piu recente. L API e newest-first -> invertiamo per il log cronologico. */
  async function loadInitial(): Promise<void> {
    error.value = null;
    const res = await window.loomn.getNarrationHistory({});
    if (!res.ok) {
      error.value = res.error;
      return;
    }
    entries.value = res.entries.map(toLine).reverse();
    hasMore.value = res.hasMore;
  }

  /** Carica le voci piu vecchie (before = seq minima presente) e le antepone. */
  async function loadOlder(): Promise<void> {
    const oldest = entries.value.find((e) => e.seq !== undefined)?.seq;
    if (oldest === undefined) return;
    const res = await window.loomn.getNarrationHistory({ before: oldest });
    if (!res.ok) {
      error.value = res.error;
      return;
    }
    entries.value = [...res.entries.map(toLine).reverse(), ...entries.value];
    hasMore.value = res.hasMore;
  }

  /** Appende il turno appena narrato (la voce piu recente). */
  function appendTurn(playerAction: string, narration: string): void {
    liveCounter += 1;
    entries.value = [...entries.value, { key: `live-${liveCounter}`, playerAction, narration }];
  }

  function setPending(value: boolean): void {
    pending.value = value;
  }
  function setError(message: string | null): void {
    error.value = message;
  }

  return { entries, hasMore, pending, error, loadInitial, loadOlder, appendTurn, setPending, setError };
});
```

- [ ] **Step 4: Esegui il test e verifica che passa**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/stores/narration.test.ts`
Atteso: PASS (6 test). `pnpm -C app/desktop typecheck` pulito.

- [ ] **Step 5: Commit**

```bash
git add app/desktop/src/renderer/src/stores/narration.ts app/desktop/src/renderer/src/stores/narration.test.ts
git commit -m "feat(renderer): store della storia di narrazione (cronologia cursor-by-seq + append turno)"
```

---

## Task 4: `stores/dice.ts` — coda dei tiri da animare

**Files:**
- Create: `app/desktop/src/renderer/src/stores/dice.ts`
- Test: `app/desktop/src/renderer/src/stores/dice.test.ts`

Tiene i tiri dell ultimo turno (per il readout) + un `nonce` che ri-triggera l animazione anche se i tiri sono identici al turno precedente.

- [ ] **Step 1: Scrivi il test che fallisce**

Create `app/desktop/src/renderer/src/stores/dice.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useDiceStore } from './dice';
import type { RolledDice } from '../lib/turn-events';

const roll: RolledDice = {
  source: 'attack', tag: 'Attacco -> eroe', notation: '1d20@18', tokens: [],
  modifierTotal: 2, total: 20, dc: 12, margin: 8, outcome: 'success',
};

describe('useDiceStore', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('parte vuoto a nonce 0', () => {
    const s = useDiceStore();
    expect(s.rolls).toEqual([]);
    expect(s.nonce).toBe(0);
  });

  it('enqueue imposta i tiri e incrementa il nonce', () => {
    const s = useDiceStore();
    s.enqueue([roll]);
    expect(s.rolls).toEqual([roll]);
    expect(s.nonce).toBe(1);
    s.enqueue([roll]);
    expect(s.nonce).toBe(2);
  });

  it('enqueue di lista vuota non incrementa il nonce', () => {
    const s = useDiceStore();
    s.enqueue([]);
    expect(s.nonce).toBe(0);
  });

  it('clear svuota i tiri senza toccare il nonce', () => {
    const s = useDiceStore();
    s.enqueue([roll]);
    s.clear();
    expect(s.rolls).toEqual([]);
    expect(s.nonce).toBe(1);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/stores/dice.test.ts`
Atteso: FAIL (modulo inesistente).

- [ ] **Step 3: Implementa il minimo**

Create `app/desktop/src/renderer/src/stores/dice.ts`:

```ts
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { RolledDice } from '../lib/turn-events';

/** Store della coda dadi: i tiri dell ultimo turno + nonce per ri-triggerare l animazione. */
export const useDiceStore = defineStore('dice', () => {
  const rolls = ref<RolledDice[]>([]);
  const nonce = ref(0);

  /** Imposta i tiri dell ultimo turno. Lista vuota = nessun tiro -> non ri-triggera l animazione. */
  function enqueue(next: RolledDice[]): void {
    if (next.length === 0) return;
    rolls.value = next;
    nonce.value += 1;
  }

  /** Svuota i tiri (readout pulito) lasciando il nonce com e. */
  function clear(): void {
    rolls.value = [];
  }

  return { rolls, nonce, enqueue, clear };
});
```

- [ ] **Step 4: Esegui il test e verifica che passa**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/stores/dice.test.ts`
Atteso: PASS (4 test). `pnpm -C app/desktop typecheck` pulito.

- [ ] **Step 5: Commit**

```bash
git add app/desktop/src/renderer/src/stores/dice.ts app/desktop/src/renderer/src/stores/dice.test.ts
git commit -m "feat(renderer): store della coda dadi (tiri dell ultimo turno + nonce)"
```

---

## Task 5: `composables/use-run-turn.ts` — orchestratore del turno

**Files:**
- Create: `app/desktop/src/renderer/src/composables/use-run-turn.ts`
- Test: `app/desktop/src/renderer/src/composables/use-run-turn.test.ts`

Un solo seam che orchestra il turno: pending -> `window.loomn.runTurn` -> su ok appende la narrazione al log e accoda i tiri estratti dagli events; su errore popola `error`.

- [ ] **Step 1: Scrivi il test che fallisce**

Create `app/desktop/src/renderer/src/composables/use-run-turn.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useRunTurn } from './use-run-turn';
import { useNarrationStore } from '../stores/narration';
import { useDiceStore } from '../stores/dice';

describe('useRunTurn', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('su turno ok appende la narrazione e accoda i tiri dagli events', async () => {
    window.loomn = {
      runTurn: vi.fn(() =>
        Promise.resolve({
          ok: true,
          narration: 'Il colpo va a segno.',
          version: 5,
          events: [
            {
              type: 'AttackResolved', attackerId: 'eroe', targetId: 'goblin', hit: true,
              check: { dice: [{ sides: 20, value: 18 }], modifierTotal: 2, total: 20, mode: 'check', dc: 12, margin: 8, outcome: 'success' },
            },
          ],
        }),
      ),
    } as unknown as typeof window.loomn;
    const narration = useNarrationStore();
    const dice = useDiceStore();
    const { submit } = useRunTurn();

    await submit('attacco il goblin');

    expect((window.loomn.runTurn as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ playerAction: 'attacco il goblin' });
    expect(narration.entries.at(-1)?.narration).toBe('Il colpo va a segno.');
    expect(dice.rolls[0]?.notation).toBe('1d20@18');
    expect(dice.nonce).toBe(1);
    expect(narration.pending).toBe(false);
    expect(narration.error).toBeNull();
  });

  it('su turno in errore popola error e non appende', async () => {
    window.loomn = { runTurn: vi.fn(() => Promise.resolve({ ok: false, error: 'provider non configurato' })) } as unknown as typeof window.loomn;
    const narration = useNarrationStore();
    const { submit } = useRunTurn();
    await submit('faccio qualcosa');
    expect(narration.error).toBe('provider non configurato');
    expect(narration.entries).toEqual([]);
    expect(narration.pending).toBe(false);
  });

  it('ignora un azione vuota o di soli spazi', async () => {
    window.loomn = { runTurn: vi.fn() } as unknown as typeof window.loomn;
    const { submit } = useRunTurn();
    await submit('   ');
    expect(window.loomn.runTurn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/composables/use-run-turn.test.ts`
Atteso: FAIL (modulo inesistente).

- [ ] **Step 3: Implementa il minimo**

Create `app/desktop/src/renderer/src/composables/use-run-turn.ts`:

```ts
import { useNarrationStore } from '../stores/narration';
import { useDiceStore } from '../stores/dice';
import { extractRolls } from '../lib/turn-events';

/** Orchestratore del turno: invia l azione, instrada narrazione e tiri ai rispettivi store. */
export function useRunTurn(): { submit: (action: string) => Promise<void> } {
  const narration = useNarrationStore();
  const dice = useDiceStore();

  async function submit(action: string): Promise<void> {
    const trimmed = action.trim();
    if (trimmed === '') return;
    narration.setError(null);
    narration.setPending(true);
    try {
      const res = await window.loomn.runTurn({ playerAction: trimmed });
      if (!res.ok) {
        narration.setError(res.error);
        return;
      }
      narration.appendTurn(trimmed, res.narration);
      dice.enqueue(extractRolls(res.events));
    } catch (err) {
      narration.setError(err instanceof Error ? err.message : String(err));
    } finally {
      narration.setPending(false);
    }
  }

  return { submit };
}
```

- [ ] **Step 4: Esegui il test e verifica che passa**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/composables/use-run-turn.test.ts`
Atteso: PASS (3 test). `pnpm -C app/desktop typecheck` pulito.

- [ ] **Step 5: Commit**

```bash
git add app/desktop/src/renderer/src/composables/use-run-turn.ts app/desktop/src/renderer/src/composables/use-run-turn.test.ts
git commit -m "feat(renderer): orchestratore del turno (runTurn -> narrazione + coda dadi)"
```

---

## Task 6: `components/NarrativePanel.vue` — log storia + input azione gated

**Files:**
- Create: `app/desktop/src/renderer/src/components/NarrativePanel.vue`
- Test: `app/desktop/src/renderer/src/components/NarrativePanel.test.ts`

Il pannello narrativo: carica la storia al mount, la mostra (serif Newsreader via classe), bottone "carica piu vecchie" se `hasMore`, e l input azione (textarea + LoomnButton "Invia") **gated** da `canRunTurn` e `pending`. NON un `<form>` (LoomnButton renderizza `<button type=submit>` di default -> dentro un form darebbe doppio-fire; lezione 10f). Quando `!canRunTurn` mostra un hint a configurare il provider; quando `pending` mostra "il Master sta scrivendo...".

- [ ] **Step 1: Scrivi il test che fallisce**

Create `app/desktop/src/renderer/src/components/NarrativePanel.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import NarrativePanel from './NarrativePanel.vue';
import { useProviderStatusStore } from '../stores/provider-status';
import { useNarrationStore } from '../stores/narration';

function stubLoomn(over: Partial<typeof window.loomn> = {}): void {
  window.loomn = {
    getNarrationHistory: vi.fn(() => Promise.resolve({ ok: true, entries: [], hasMore: false })),
    getStatus: vi.fn(() => Promise.resolve({ version: 0, safeStorageAvailable: true, providerConfigured: true })),
    runTurn: vi.fn(() => Promise.resolve({ ok: true, narration: 'narrato', version: 1, events: [] })),
    ...over,
  } as unknown as typeof window.loomn;
}

const stubs = { LoomnPanel: { template: '<div><slot /></div>' }, LoomnButton: { template: '<button><slot /></button>' } };

describe('NarrativePanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    stubLoomn();
  });

  it('al mount carica la storia e la mostra', async () => {
    stubLoomn({
      getNarrationHistory: vi.fn(() => Promise.resolve({ ok: true, hasMore: false, entries: [{ seq: 1, playerAction: 'guardo', narration: 'La sala e buia.' }] })),
    });
    const w = mount(NarrativePanel, { global: { plugins: [createPinia()], stubs } });
    await flushPromises();
    expect(w.text()).toContain('La sala e buia.');
  });

  it('disabilita l invio quando il provider non e configurato', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const provider = useProviderStatusStore();
    // status con providerConfigured=false -> canRunTurn=false
    window.loomn = { ...window.loomn, getStatus: vi.fn(() => Promise.resolve({ version: 0, safeStorageAvailable: true, providerConfigured: false })) } as typeof window.loomn;
    await provider.refresh();
    const w = mount(NarrativePanel, { global: { plugins: [pinia], stubs } });
    await flushPromises();
    expect(w.find('textarea').attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('Configura un provider');
  });

  it('quando pending mostra che il Master sta scrivendo', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const narration = useNarrationStore();
    narration.setPending(true);
    const w = mount(NarrativePanel, { global: { plugins: [pinia], stubs } });
    await flushPromises();
    expect(w.text()).toContain('sta scrivendo');
  });

  it('invia l azione e la passa a runTurn', async () => {
    const runTurn = vi.fn(() => Promise.resolve({ ok: true, narration: 'esito', version: 1, events: [] }));
    const pinia = createPinia();
    setActivePinia(pinia);
    const provider = useProviderStatusStore();
    stubLoomn({ runTurn });
    await provider.refresh();
    const w = mount(NarrativePanel, { global: { plugins: [pinia], stubs } });
    await flushPromises();
    await w.find('textarea').setValue('apro la porta');
    await w.find('button').trigger('click');
    await flushPromises();
    expect(runTurn).toHaveBeenCalledWith({ playerAction: 'apro la porta' });
    expect(w.text()).toContain('esito');
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/components/NarrativePanel.test.ts`
Atteso: FAIL (componente inesistente).

- [ ] **Step 3: Implementa il minimo**

Create `app/desktop/src/renderer/src/components/NarrativePanel.vue`:

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import LoomnPanel from './LoomnPanel.vue';
import LoomnButton from './LoomnButton.vue';
import { useNarrationStore } from '../stores/narration';
import { useProviderStatusStore } from '../stores/provider-status';
import { useRunTurn } from '../composables/use-run-turn';

const narration = useNarrationStore();
const provider = useProviderStatusStore();
const { submit } = useRunTurn();

const draft = ref('');
const canSend = computed(() => provider.canRunTurn && !narration.pending && draft.value.trim() !== '');

onMounted(() => void narration.loadInitial());

async function onSend(): Promise<void> {
  if (!canSend.value) return;
  const action = draft.value;
  draft.value = '';
  await submit(action);
}
</script>

<template>
  <LoomnPanel title="Narrazione" eyebrow="storia">
    <div class="narr">
      <button v-if="narration.hasMore" class="narr__more" type="button" @click="narration.loadOlder()">
        Carica piu vecchie
      </button>
      <ol class="narr__log">
        <li v-for="line in narration.entries" :key="line.key" class="narr__entry">
          <p class="narr__action">{{ line.playerAction }}</p>
          <p class="narr__prose">{{ line.narration }}</p>
        </li>
      </ol>

      <p v-if="narration.pending" class="narr__pending">Il Master sta scrivendo...</p>
      <p v-if="narration.error" class="narr__error">{{ narration.error }}</p>

      <div class="narr__compose">
        <textarea
          v-model="draft"
          class="narr__input"
          rows="2"
          placeholder="Cosa fai?"
          :disabled="!provider.canRunTurn || narration.pending"
          @keydown.enter.exact.prevent="onSend"
        ></textarea>
        <LoomnButton :disabled="!canSend" @click="onSend">Invia</LoomnButton>
      </div>
      <p v-if="!provider.canRunTurn" class="narr__hint">
        Configura un provider in Impostazioni per giocare il turno.
      </p>
    </div>
  </LoomnPanel>
</template>

<style scoped>
.narr { display: flex; flex-direction: column; gap: 10px; height: 100%; min-height: 0; }
.narr__log { list-style: none; margin: 0; padding: 0; overflow: auto; flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 14px; }
.narr__entry { display: flex; flex-direction: column; gap: 4px; }
.narr__action { color: var(--text-3); font-size: 12px; font-style: italic; margin: 0; }
.narr__prose { font-family: var(--font-serif, Newsreader, serif); font-size: 15px; line-height: 1.55; margin: 0; color: var(--text-1); }
.narr__more { align-self: center; background: none; border: 1px solid var(--line); color: var(--text-3); padding: 4px 10px; cursor: pointer; border-radius: 6px; }
.narr__pending { color: var(--accent); font-size: 13px; margin: 0; }
.narr__error { color: var(--danger, #c2553d); font-size: 13px; margin: 0; }
.narr__compose { display: flex; gap: 8px; align-items: flex-end; }
.narr__input { flex: 1; resize: none; background: var(--well); color: var(--text-1); border: 1px solid var(--line); border-radius: 8px; padding: 8px; font: inherit; }
.narr__hint { color: var(--text-3); font-size: 12px; margin: 0; }
</style>
```

- [ ] **Step 4: Esegui il test e verifica che passa**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/components/NarrativePanel.test.ts`
Atteso: PASS (4 test). `pnpm -C app/desktop typecheck` pulito.
Nota: se un token CSS (`--font-serif`/`--well`/`--danger`) non esiste tra quelli di 10a, usa il fallback inline indicato (gia presente) — NON aggiungere token in `tokens.css` (fuori scope del task; eventuale allineamento e cosmetico nel Task 8/visual).

- [ ] **Step 5: Commit**

```bash
git add app/desktop/src/renderer/src/components/NarrativePanel.vue app/desktop/src/renderer/src/components/NarrativePanel.test.ts
git commit -m "feat(renderer): pannello Narrazione (storia + input azione gated da canRunTurn)"
```

---

## Task 7: `components/DiceCanvas.vue` (3D lazy) + `components/DicePanel.vue` (readout)

**Files:**
- Create: `app/desktop/src/renderer/src/components/DiceCanvas.vue` (NO unit test — WebGL/Three.js, validato dallo spike + visual)
- Create: `app/desktop/src/renderer/src/components/DicePanel.vue`
- Test: `app/desktop/src/renderer/src/components/DicePanel.test.ts`

`DiceCanvas` incapsula `@3d-dice/dice-box-threejs`: **init lazy** (al primo tiro, non onMounted -> nel gate a finestra nascosta non parte WebGL) e forza le facce con la notazione `@`. `DicePanel` compone DiceCanvas + il **readout** dei valori autorevoli del motore (chip modifier `+N`, total, outcome vs dc, token non-standard, etichetta della fonte) — il readout legge `useDiceStore`, NON il risultato di `box.roll` (il motore e l arbitro).

- [ ] **Step 1: Scrivi il test che fallisce (solo DicePanel readout)**

Create `app/desktop/src/renderer/src/components/DicePanel.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import DicePanel from './DicePanel.vue';
import { useDiceStore } from '../stores/dice';

// DiceCanvas usa WebGL (non disponibile in jsdom): stub passthrough.
const stubs = {
  LoomnPanel: { template: '<div><slot /></div>' },
  DiceCanvas: { template: '<div class="dice-canvas-stub" />' },
};

describe('DicePanel', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('senza tiri mostra uno stato vuoto', () => {
    const w = mount(DicePanel, { global: { plugins: [createPinia()], stubs } });
    expect(w.text()).toContain('Nessun tiro');
  });

  it('mostra il readout di una prova: modifier, total, esito e dc', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const dice = useDiceStore();
    dice.enqueue([{ source: 'attack', tag: 'Attacco -> goblin', notation: '1d20@18', tokens: [], modifierTotal: 2, total: 20, dc: 12, margin: 8, outcome: 'success' }]);
    const w = mount(DicePanel, { global: { plugins: [pinia], stubs } });
    const text = w.text();
    expect(text).toContain('+2');
    expect(text).toContain('20');
    expect(text).toContain('success');
    expect(text).toContain('12');
    expect(text).toContain('Attacco -> goblin');
  });

  it('mostra i token numerici per i sides non-standard', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const dice = useDiceStore();
    dice.enqueue([{ source: 'effect', tag: 'hp +3', notation: null, tokens: [{ sides: 7, value: 5 }], modifierTotal: 0, total: 5 }]);
    const w = mount(DicePanel, { global: { plugins: [pinia], stubs } });
    expect(w.text()).toContain('d7');
    expect(w.text()).toContain('5');
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/components/DicePanel.test.ts`
Atteso: FAIL (componenti inesistenti).

- [ ] **Step 3a: Implementa DiceCanvas (lazy, difensivo)**

Create `app/desktop/src/renderer/src/components/DiceCanvas.vue`:

```vue
<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';
import DiceBox from '@3d-dice/dice-box-threejs';
import { useDiceStore } from '../stores/dice';

const dice = useDiceStore();
const mount = ref<HTMLElement | null>(null);
let box: DiceBox | null = null;
let ready: Promise<void> | null = null;

// Init LAZY: la prima volta che c e un tiro da mostrare (mai a finestra nascosta nel gate).
function ensureBox(): Promise<void> {
  if (ready !== null) return ready;
  if (mount.value === null) return Promise.resolve();
  mount.value.id = mount.value.id || 'loomn-dice-box';
  box = new DiceBox(`#${mount.value.id}`, {
    assetPath: '/dice-box/',
    sounds: false,
    scale: 6,
    theme_colorset: 'white',
    theme_material: 'glass',
  });
  ready = box.initialize().catch((err: unknown) => {
    // Degrada in silenzio: il readout (valori del motore) resta autorevole anche senza 3D.
    console.warn('DiceCanvas init fallita, solo readout:', err);
    box = null;
  });
  return ready;
}

async function animate(notation: string): Promise<void> {
  await ensureBox();
  if (box === null) return;
  try {
    await box.roll(notation);
  } catch (err) {
    console.warn('DiceCanvas roll fallita:', err);
  }
}

// Ri-triggera al cambio di nonce; anima solo i tiri con notazione standard.
watch(
  () => dice.nonce,
  () => {
    for (const r of dice.rolls) {
      if (r.notation !== null) void animate(r.notation);
    }
  },
);

onBeforeUnmount(() => {
  box?.clear?.();
  box = null;
  ready = null;
});
</script>

<template>
  <div ref="mount" class="dice-canvas"></div>
</template>

<style scoped>
.dice-canvas { width: 100%; height: 100%; min-height: 140px; position: relative; }
</style>
```

- [ ] **Step 3b: Implementa DicePanel (readout)**

Create `app/desktop/src/renderer/src/components/DicePanel.vue`:

```vue
<script setup lang="ts">
import LoomnPanel from './LoomnPanel.vue';
import DiceCanvas from './DiceCanvas.vue';
import { useDiceStore } from '../stores/dice';

const dice = useDiceStore();
</script>

<template>
  <LoomnPanel title="Dadi" eyebrow="esito">
    <div class="dice">
      <DiceCanvas class="dice__canvas" />
      <div v-if="dice.rolls.length === 0" class="dice__empty">Nessun tiro ancora.</div>
      <ul v-else class="dice__readout">
        <li v-for="(r, idx) in dice.rolls" :key="idx" class="dice__row">
          <span class="dice__tag">{{ r.tag }}</span>
          <span v-if="r.modifierTotal !== 0" class="dice__chip">{{ r.modifierTotal >= 0 ? '+' : '' }}{{ r.modifierTotal }}</span>
          <span class="dice__total">{{ r.total }}</span>
          <span v-if="r.outcome !== undefined" class="dice__outcome">{{ r.outcome }}</span>
          <span v-if="r.dc !== undefined" class="dice__dc">vs CD {{ r.dc }}</span>
          <span v-for="(t, ti) in r.tokens" :key="`t-${ti}`" class="dice__token">d{{ t.sides }}: {{ t.value }}</span>
        </li>
      </ul>
    </div>
  </LoomnPanel>
</template>

<style scoped>
.dice { display: flex; flex-direction: column; gap: 8px; height: 100%; min-height: 0; }
.dice__canvas { flex: 1; min-height: 140px; }
.dice__empty { color: var(--text-3); font-size: 13px; }
.dice__readout { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.dice__row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-family: var(--font-mono, 'JetBrains Mono', monospace); font-size: 12px; }
.dice__tag { color: var(--text-3); }
.dice__chip { color: var(--accent); }
.dice__total { font-weight: 700; color: var(--text-1); }
.dice__outcome { color: var(--accent); text-transform: uppercase; letter-spacing: 0.04em; }
.dice__dc { color: var(--text-3); }
.dice__token { color: var(--text-2); border: 1px solid var(--line); border-radius: 5px; padding: 0 5px; }
</style>
```

- [ ] **Step 4: Esegui il test e verifica che passa**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/components/DicePanel.test.ts`
Atteso: PASS (3 test). `pnpm -C app/desktop typecheck` pulito (lo shim di Step 0.3 tipa `@3d-dice/dice-box-threejs`).

- [ ] **Step 5: Commit**

```bash
git add app/desktop/src/renderer/src/components/DiceCanvas.vue app/desktop/src/renderer/src/components/DicePanel.vue app/desktop/src/renderer/src/components/DicePanel.test.ts
git commit -m "feat(renderer): pannello Dadi (3D lazy a facce forzate + readout autorevole del motore)"
```

---

## Task 8: wiring in `GameView.vue` + self-test/gate

**Files:**
- Modify: `app/desktop/src/renderer/src/views/GameView.vue`
- Modify: `app/desktop/src/renderer/src/views/GameView.test.ts`
- Modify: `app/desktop/src/renderer/src/renderer.ts` (self-test, righe 48-140 della fase 1)

Aggancia i nuovi componenti ai pannelli `narrative`/`dice` del Gioco (gli altri restano placeholder fino a 10c/10d) ed estende il self-test del gate.

- [ ] **Step 1: Aggiorna il test di GameView all atteso reale**

In `app/desktop/src/renderer/src/views/GameView.test.ts`, sostituisci il corpo per: (a) stubbare `window.loomn` (i pannelli chiamano `getNarrationHistory`/`getStatus` al mount), (b) stubbare i componenti pesanti, (c) verificare che i pannelli reali siano montati. Sostituisci l intero file con:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { ReadModelPush } from '@loomn/shared';
import { useReadModelStore } from '../stores/read-model';
import GameView from './GameView.vue';

const GridLayout = { template: '<div class="grid-stub"><slot /></div>' };
const GridItem = { props: ['x', 'y', 'w', 'h', 'i'], template: '<div class="grid-item-stub"><slot /></div>' };
// Componenti pesanti: stub passthrough (NarrativePanel monta loomn, DiceCanvas usa WebGL).
const NarrativePanel = { template: '<div class="narrative-stub">Narrazione</div>' };
const DicePanel = { template: '<div class="dice-stub">Dadi</div>' };

function push(phase: ReadModelPush['state']['phase']): ReadModelPush {
  return { version: 1, state: { version: 1, actors: {}, encounter: null, quests: {}, phase } };
}

function mountGame() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(GameView, { global: { plugins: [pinia], stubs: { GridLayout, GridItem, NarrativePanel, DicePanel } } });
}

describe('GameView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.loomn = {
      getNarrationHistory: vi.fn(() => Promise.resolve({ ok: true, entries: [], hasMore: false })),
      getStatus: vi.fn(() => Promise.resolve({ version: 0, safeStorageAvailable: true, providerConfigured: false })),
    } as unknown as typeof window.loomn;
  });

  it('in exploration monta narrazione, scheda e dadi', async () => {
    const w = mountGame();
    await flushPromises();
    expect(w.findAll('.grid-item-stub')).toHaveLength(3);
    expect(w.text()).toContain('Narrazione');
    expect(w.text()).toContain('Scheda');
    expect(w.text()).toContain('Dadi');
  });

  it('passando a combat sostituisce la scheda con lo scontro', async () => {
    const w = mountGame();
    const store = useReadModelStore();
    store.applyPush(push('combat'));
    await flushPromises();
    expect(w.text()).toContain('Scontro');
    expect(w.text()).not.toContain('Scheda');
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/views/GameView.test.ts`
Atteso: FAIL (GameView non monta ancora NarrativePanel/DicePanel — gli stub non trovano i componenti referenziati).

- [ ] **Step 3: Implementa il wiring in GameView.vue**

Sostituisci `app/desktop/src/renderer/src/views/GameView.vue` con:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { GridLayout, GridItem } from 'grid-layout-plus';
import { useReadModelStore } from '../stores/read-model';
import type { PhaseView } from '../stores/read-model';
import { createLocalStoragePersistence } from '../layout/persistence';
import { useGameLayout } from '../composables/use-game-layout';
import LoomnPanel from '../components/LoomnPanel.vue';
import NarrativePanel from '../components/NarrativePanel.vue';
import DicePanel from '../components/DicePanel.vue';

const store = useReadModelStore();
const phase = computed<PhaseView>(() => store.phase);
const persistence = createLocalStoragePersistence();
const { layout, onLayoutUpdated } = useGameLayout(phase, persistence);

// Titoli dei pannelli ancora placeholder (scheda 10d, scontro 10c).
const titles: Record<string, string> = { sheet: 'Scheda', encounter: 'Scontro' };
</script>

<template>
  <main class="game-view">
    <GridLayout
      :layout="layout"
      :col-num="12"
      :row-height="30"
      :margin="[14, 14]"
      @layout-updated="onLayoutUpdated"
    >
      <GridItem v-for="item in layout" :key="item.i" :x="item.x" :y="item.y" :w="item.w" :h="item.h" :i="item.i">
        <NarrativePanel v-if="item.i === 'narrative'" />
        <DicePanel v-else-if="item.i === 'dice'" />
        <LoomnPanel v-else :title="titles[item.i] ?? item.i" eyebrow="pannello">
          <p class="game-view__placeholder">Contenuto nel Piano 10c / 10d.</p>
        </LoomnPanel>
      </GridItem>
    </GridLayout>
  </main>
</template>

<style scoped>
.game-view { flex: 1; min-height: 0; overflow: auto; }
.game-view__placeholder { color: var(--text-3); font-size: 13px; }
</style>
```

- [ ] **Step 4: Esegui i test di GameView e verifica che passano**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/views/GameView.test.ts`
Atteso: PASS (2 test).

- [ ] **Step 5: Estendi il self-test del gate**

In `app/desktop/src/renderer/src/renderer.ts`, nella fase `'1'` (dopo il blocco `getNarrationHistory` esistente a riga ~96), aggiungi un check che la storia letta dopo un eventuale turno e coerente e che il render del Gioco coi nuovi pannelli non lancia. Inserisci dopo `check(hist.ok && hist.entries.length === 0 && hist.hasMore === false, 'narration history vuota a inizio');`:

```ts
      // 10b: dopo un dispatch il read-model avanza ma la storia narrazione resta vuota
      // (NarrationRecorded entra nello stream solo via run-turn, qui non eseguito senza LLM reale).
      check(readModel.loaded === true, 'read-model caricato (Gioco montato coi pannelli 10b)');
      const hist2 = await window.loomn.getNarrationHistory({ limit: 5 });
      check(hist2.ok && hist2.entries.length === 0, 'narration history coerente dopo il dispatch');
```

(Non serve modificare la fase `'2'`. Il gate prova che l app Electron reale boota con NarrativePanel/DicePanel montati senza eccezioni — l init 3D e LAZY, non parte nel gate a finestra nascosta.)

- [ ] **Step 6: Suite completa + typecheck**

Run (dalla root): `pnpm test`
Atteso: TUTTI verdi (packages 497 invariati + renderer cresciuto coi nuovi test; target ~605 totali). `pnpm -r typecheck` pulito (6 progetti).
(Se SQLite fallisce con `NODE_MODULE_VERSION` -> `pnpm rebuild:node`.)

- [ ] **Step 7: Commit**

```bash
git add app/desktop/src/renderer/src/views/GameView.vue app/desktop/src/renderer/src/views/GameView.test.ts app/desktop/src/renderer/src/renderer.ts
git commit -m "feat(renderer): aggancia Narrazione e Dadi al Gioco + self-test esteso"
```

---

## Gate "esegui l app" (orchestratore, dopo il Task 8, prima del merge)

- [ ] **Rebuild ABI Electron + gate 2 fasi** (come 10f/10g):

```bash
pnpm rebuild:electron
# Fase 1 (DB fresco): crea/usa una userData temporanea, LOOMN_SELFTEST=1
# Fase 2 (riavvio sullo stesso DB): LOOMN_SELFTEST=2
```

Atteso: entrambe `VERDICT: PASS` (incluse le asserzioni 10b della fase 1). Poi `pnpm rebuild:node` per tornare ai test ABI Node.

- [ ] **Prova visiva**: avvia l app (`pnpm rebuild:electron && pnpm --filter @loomn/desktop dev`), configura un provider locale, gioca un turno; screenshot del Gioco con narrazione + dadi 3D che atterrano sulle facce del motore (allegato alla verifica). Poi `pnpm rebuild:node`.

---

## Self-Review (orchestratore, dopo aver scritto il piano)

**1. Copertura spec (§6/§10 riga 10b):**
- Chat/narrazione (storia + run-turn): Task 3 (store storia) + Task 5 (orchestratore) + Task 6 (pannello). ✓
- Input azione gated da `canRunTurn`: Task 6 (NarrativePanel legge `useProviderStatusStore`). ✓
- Streaming deferito -> "il Master sta scrivendo...": Task 6 (pending). ✓
- Dadi 3D a facce forzate dai `RollResult` negli events: Task 1 (notazione) + Task 2 (estrazione) + Task 4 (coda) + Task 7 (canvas+readout). ✓
- Pool misti in una gettata: Task 1 (notazione multi-gruppo). ✓
- `modifierTotal` come chip `+N`, total/outcome vs dc nel readout, tag per fonte: Task 7 (DicePanel). ✓
- sides non-standard -> token numerico: Task 1 (tokens) + Task 7 (render token). ✓
- Tutti i pannelli nel Gioco (grid-layout-plus): Task 8. ✓
- Verifica: TDD su store/selector/mapping + self-test esteso + screenshot; dadi 3D dallo spike: Task 1-8 + gate. ✓

**2. Scan placeholder:** nessun "TBD"/"come Task N"/codice mancante — ogni step ha codice completo. ✓

**3. Coerenza dei tipi:** `RolledDice` (Task 2) usato identico in Task 4/5/7; `DomainEventView`/`DieView`/`Outcome` (Task 1) riusati in Task 2; `toDicePlan` firma `(dice) -> {notation,tokens}` coerente; `extractRolls(events) -> RolledDice[]`; store: `useNarrationStore`/`useDiceStore` metodi (`loadInitial`/`loadOlder`/`appendTurn`/`setPending`/`setError`; `enqueue`/`clear`) coerenti tra definizione e consumo. ✓

**4. Disciplina di scope:** ogni task elenca i suoi file; `package.json`/asset/shim solo nello Step 0 (orchestratore); nessun task tocca config/CSP/shared/engine/host. ✓

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-18-loomn-piano10b-gioco.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — un subagent fresco per task, review tra i task (spec-review + code-quality-review), iterazione rapida; Step 0 e gate finale eseguiti dall orchestratore.

**2. Inline Execution** — esegui i task in questa sessione con executing-plans, batch con checkpoint.

**Quale approccio?**
