# Piano 10e — Diario + Compagnia (memoria narrativa L2 + canon + roster, display-only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Riempire la route `/diario` (`JournalView.vue`, oggi placeholder) con la memoria narrativa persistente — cronologia narrazione (`getNarrationHistory`) + riassunti L2 (`getSummaries`) + fatti canon (`getCanon`) + un trigger Reflection (`reflect`) — e arricchire la route `/compagnia` (`CompanyView.vue`, oggi solo creazione PG di 10f) con un roster PG/PNG dal read-model e le relazioni DISPLAY-ONLY come fatti canon. ULTIMO sotto-piano del Piano 10.

**Architecture:** Renderer-only sul backend gia pronto (i canali read del Piano 0 e `reflect` esistono gia sul bridge — verificato in `packages/shared/src/ipc.ts`). Due funzioni PURE sono i cuori testabili: `lib/journal-view.ts` (compone/formatta/ordina le tre fonti del Diario: righe canon, gruppi di riassunti per livello, messaggio di reflect) e `lib/company-view.ts` (carta compatta per-attore + filtro dei fatti canon che coinvolgono l attore). Uno store Pinia read-side condiviso (`stores/journal.ts`) possiede riassunti L2 + canon + il trigger `reflect`; e consumato sia dal Diario (vista piena) sia dalla Compagnia (canon filtrato per attore = relazioni). La cronologia del Diario RIUSA lo store `narration` di 10b (cursor-by-seq, gia testato). Nessun nuovo Command/Event/IPC/dipendenza/CSP/config; nessuna entita relazione strutturata (deferita, spec §11).

**Tech Stack:** Vue 3 + TS strict, Pinia, Vue Test Utils (jsdom), Vitest. Nessuna nuova dipendenza, nessun passo orchestratore su `package.json`/CSP/`electron.vite.config`/`tokens.css`.

**Spec di riferimento:** `docs/superpowers/specs/2026-06-17-piano10-ui-design.md` (§2 decisione 4 = IA con route Diario/Compagnia; §7 audit binding: storia narrazione 🟡→🟢 Piano 0, canon/L2 🟡→🟢 Piano 0, relazioni strutturate 🔴 feature/solo-canon; §8 lacune risolte dal Piano 0; §10 riga 10e; §11 relazioni strutturate deferite). HANDOFF §0-duovicies (10d + lezioni), §4 (processo), §5 (house rules), §8 (roadmap: dopo 10e restano le feature deferite). Riferimento di stile: `plans/2026-06-18-loomn-piano10d-scheda-inventario.md` (renderer TDD: mappa pura/selector + componenti + wiring + self-test esteso + gate).

**Decisioni di design (gia fissate dallo spec autorita + decisioni di composizione di questo piano):**
- **Diario = composizione di tre fonti read-only + un trigger:** (1) **cronologia** dalla narrazione persistente via lo store `narration` di 10b (`getNarrationHistory`, cursor-by-seq, paginato con "Carica piu vecchie"); (2) **riassunti L2** raggruppati per livello (campagna/arco/sessione/scena, dal piu ampio al piu fine) via `getSummaries`; (3) **fatti canonici** ordinati per salienza via `getCanon`; (4) affordance **Rifletti** che invoca `window.loomn.reflect({scope})` (lo `scope` etichetta i riassunti — vedi `campaign-service.ts:123`), e su successo ricarica riassunti+canon. La Reflection e LLM-backed: senza provider/LLM fallisce in modo grazioso (il messaggio d errore appare in linea, nessun crash).
- **Compagnia = roster dal read-model + relazioni come canon (display-only):** PG e PNG raggruppati (da `useReadModelStore().pcs`/`.npcs`) con una carta compatta per-attore (livello, risorse, conteggi) e, sotto, i **fatti canon che coinvolgono l attore** (match per nome/id su subject/object) come relazioni DISPLAY-ONLY. **NIENTE entita relazione strutturata** (deferita, spec §11) — sono solo proiezione dei fatti canon. La **creazione PG di 10f resta INTATTA** (creatore `AddActor`).
- **Store condiviso `journal`:** riassunti L2 + canon vivono in UN solo store read-side, riusato da Diario (tutto) e Compagnia (canon filtrato). NON e fetch-once: `reflect` aggiunge voci → `load()` rifa la fetch. La cronologia narrazione NON entra in questo store (riusa `narration`, gia condiviso con `NarrativePanel`).
- **Nessun pannello del Gioco:** Diario e Compagnia sono **solo route** (rail), non pannelli della griglia del Gioco (i pannelli del Gioco sono narrative/dice/encounter/sheet). → `GameView.vue`/`GameView.test.ts` **NON** vengono toccati in 10e.
- **Re-theme per fase:** le viste usano `var(--accent)`/`var(--accent-dim)` gia applicati da 10a su `[data-phase]`; nessun nuovo token.

---

## Fuori ambito (esplicito, deferito)

- **Relazioni strutturate** (entita relazione PG↔PNG↔luogo, link quest↔PNG, grafo): feature DEFERITA (spec §11 / audit §7 🔴). 10e mostra le relazioni **solo** come fatti canon (`getCanon`) filtrati per attore — display-only.
- **Editare/ritirare i fatti canon dalla UI**: non c e un Command per mutare il ledger dal renderer (il canon e prodotto dalla Reflection/eventi). Il Diario e **read-only** sul canon (il solo write e `reflect`, che lo rigenera).
- **Streaming** della Reflection (progress incrementale): la UI funziona su request/response (`reflect` ritorna `{factCount, summarized}`). Spec §11.
- **Multi-campagna / picker / delta read-model** (spec §11/§13): deferiti.
- **Motore Inventario & Equipaggiamento** e **movimento/topologia di zona**: feature core deferite post-Piano-10 (spec §11; HANDOFF §8) — non toccate qui.
- Nessuna modifica a `@loomn/shared`/engine/host, nessun nuovo Command/Event/IPC/tabella/migrazione/dipendenza/CSP. Nessuna modifica a `tokens.css`/`vitest.config`/`vitest.workspace`/`electron.vite.config`/`package.json`/`index.html`.

---

## File Structure

**Nessun passo orchestratore preliminare** (come 10c/10d: nessuna nuova dipendenza, nessun asset, nessuna modifica a `package.json`/CSP/`electron.vite.config`/`tokens.css`). L orchestratore: (a) committa questo doc su `main`, (b) crea il branch `feat/piano10e-diario-compagnia`, (c) a fine branch esegue il **gate Electron 2 fasi** (rebuild:electron + self-test fase 1/2 → `VERDICT: PASS` + `rebuild:node`), (d) merge ff + `git push origin main`.

**Subagent tasks (renderer-only, TDD):**
- `app/desktop/src/renderer/src/lib/journal-view.ts` (+test) — **Task 1**: funzioni PURE del Diario (righe canon ordinate per salienza, riassunti raggruppati per livello, etichette di livello, messaggio di reflect). **Cuore testabile #1.**
- `app/desktop/src/renderer/src/stores/journal.ts` (+test) — **Task 2**: store read-side condiviso (riassunti L2 + canon + `load()` + `runReflect(scope)`). **Cuore testabile #2.**
- `app/desktop/src/renderer/src/views/JournalView.vue` (sostituisce il placeholder) (+test) + `app/desktop/src/renderer/src/App.test.ts` (aggiorna gli stub) — **Task 3**: la route `/diario` compone narrazione + journal + lib.
- `app/desktop/src/renderer/src/lib/company-view.ts` (+test) — **Task 4**: funzioni PURE della Compagnia (carta compatta per-attore + `canonForActor`). **Cuore testabile #3.**
- `app/desktop/src/renderer/src/views/CompanyView.vue` (modifica, il creator di 10f resta) (+ aggiorna `app/desktop/src/renderer/src/views/CompanyView.test.ts`) + `app/desktop/src/renderer/src/renderer.ts` (self-test) — **Task 5**: roster cards + relazioni canon nella Compagnia + estensione del gate self-test con le due route.

**Disciplina di scope (CRITICO, in OGNI prompt di task):** il subagent modifica SOLO i file elencati nel suo task. MAI toccare `package.json`/`tsconfig*`/`vitest.config`/`vitest.workspace`/`electron.vite.config`/`index.html` (CSP)/`tokens.css`. `git status --short` prima di ogni commit. Niente apostrofi nelle stringhe `it('...')`/`describe('...')`/`check(...)` in apici singoli (usa "l ordine", "c e", "dell attore", "l attore", "l esito"; `è/é` vanno bene, sono lettere). **Lezioni 10b/10c/10d:** ogni payload verso `dispatch`/IPC deve essere PLAIN (qui il solo write e `reflect({scope})` con uno scope `string` — nessun proxy reactive da clonare); usa i TOKEN CSS REALI di `styles/tokens.css` (`--text`/`--text-2`/`--text-3`/`--accent`/`--accent-dim`/`--line`/`--line-2`/`--well`/`--panel`/`--f-display`/`--f-read`/`--f-ui`/`--f-mono`/`--bad`/`--ok`/`--clay`/`--r`/`--r-sm`/`--r-xs`) — NON inventare nomi; i componenti usano `<LoomnPanel>`/`<LoomnButton>` (NON `<form>`). **Rieseguire i test TU** (non fidarsi del report): una vista resa reale e montata via route in `App.test`/`CompanyView.test` introduce unhandled-rejection da stub `window.loomn` mancanti → **Task 3 aggiorna `App.test.ts`** (aggiunge `getSummaries`/`getCanon`) e **Task 5 aggiorna il `beforeEach` di `CompanyView.test.ts`** (idem) perche le viste reali ora chiamano `journal.load()` onMounted.

**Forme dati di riferimento (dal contratto IPC `@loomn/shared`, NON re-dichiararle):**
- `SummaryDto = { id, level: 'scene'|'session'|'arc'|'campaign', scope, text, importance, salience, createdAt, eventSeqFrom, eventSeqTo }` (numeri interi non negativi per seq/createdAt).
- `CanonFactDto = { id, subject, predicate, object, eventSeq, salience, status: 'active'|'retracted' }`.
- `ReflectResult = { ok: true, factCount, summarized } | { ok: false, error }`.
- `NarrationEntryDto = { seq, playerAction, narration }` (gia mappato in `NarrationLine` dallo store `narration`).
- `ActorView = GameStateView['actors'][string]` (da `stores/read-model.ts`): `{ id, name, kind, attributes, skills, resources: Record<string,{current,max}>, conditions, items, progression: {xp,level} }`.
- Selettori read-model gia esistenti (`stores/read-model.ts`): `actors`, `pcs` (kind='pc'), `npcs` (kind='npc').
- Canali bridge gia esposti (`LoomnBridge`): `getNarrationHistory`, `getSummaries`, `getCanon`, `reflect` (tutti verificati in `ipc.ts`).

---

## Task 1: `lib/journal-view.ts` — funzioni PURE del Diario

**Files:**
- Create: `app/desktop/src/renderer/src/lib/journal-view.ts`
- Test: `app/desktop/src/renderer/src/lib/journal-view.test.ts`

Le funzioni cardine del Diario: formattano un `CanonFactDto` in riga leggibile e ordinano per salienza; raggruppano i `SummaryDto` per livello (ordine dal piu ampio al piu fine) e per recency dentro il gruppo; etichettano i livelli; formattano il `ReflectResult` in un messaggio. Tutto puro, tipi derivati dal contratto IPC.

- [ ] **Step 1: Scrivi il test che fallisce**

Create `app/desktop/src/renderer/src/lib/journal-view.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  toCanonLine,
  sortCanonBySalience,
  groupSummaries,
  levelLabel,
  reflectMessage,
} from './journal-view';
import type { CanonFactDto, SummaryDto, ReflectResult } from '@loomn/shared';

function fact(over: Partial<CanonFactDto> & { id: string }): CanonFactDto {
  return {
    id: over.id,
    subject: over.subject ?? 'Eroe',
    predicate: over.predicate ?? 'possiede',
    object: over.object ?? 'spada',
    eventSeq: over.eventSeq ?? 1,
    salience: over.salience ?? 0.5,
    status: over.status ?? 'active',
  };
}

function summary(over: Partial<SummaryDto> & { id: string }): SummaryDto {
  return {
    id: over.id,
    level: over.level ?? 'scene',
    scope: over.scope ?? 'sess-1',
    text: over.text ?? 'testo',
    importance: over.importance ?? 5,
    salience: over.salience ?? 0.5,
    createdAt: over.createdAt ?? 1000,
    eventSeqFrom: over.eventSeqFrom ?? 1,
    eventSeqTo: over.eventSeqTo ?? 3,
  };
}

describe('toCanonLine', () => {
  it('compone soggetto predicato oggetto e il flag ritirato', () => {
    const line = toCanonLine(fact({ id: 'f1', subject: 'Eroe', predicate: 'odia', object: 'Goblin', status: 'retracted' }));
    expect(line.text).toBe('Eroe odia Goblin');
    expect(line.retracted).toBe(true);
  });
});

describe('sortCanonBySalience', () => {
  it('ordina per salienza decrescente', () => {
    const out = sortCanonBySalience([fact({ id: 'a', salience: 0.2 }), fact({ id: 'b', salience: 0.9 }), fact({ id: 'c', salience: 0.5 })]);
    expect(out.map((f) => f.id)).toEqual(['b', 'c', 'a']);
  });

  it('mette i fatti ritirati in coda a parita di rilevanza', () => {
    const out = sortCanonBySalience([fact({ id: 'r', salience: 0.9, status: 'retracted' }), fact({ id: 'a', salience: 0.1, status: 'active' })]);
    expect(out.map((f) => f.id)).toEqual(['a', 'r']);
  });
});

describe('groupSummaries', () => {
  it('raggruppa per livello nell ordine dal piu ampio al piu fine', () => {
    const out = groupSummaries([summary({ id: 's', level: 'scene' }), summary({ id: 'c', level: 'campaign' }), summary({ id: 'a', level: 'arc' })]);
    expect(out.map((g) => g.level)).toEqual(['campaign', 'arc', 'scene']);
  });

  it('ordina per recency dentro il gruppo (eventSeqTo decrescente)', () => {
    const out = groupSummaries([summary({ id: 'vecchio', level: 'scene', eventSeqTo: 3 }), summary({ id: 'nuovo', level: 'scene', eventSeqTo: 9 })]);
    expect(out[0]!.items.map((s) => s.id)).toEqual(['nuovo', 'vecchio']);
  });

  it('salta i livelli senza riassunti', () => {
    const out = groupSummaries([summary({ id: 's', level: 'scene' })]);
    expect(out.map((g) => g.level)).toEqual(['scene']);
  });
});

describe('levelLabel', () => {
  it('etichetta i livelli in italiano', () => {
    expect(levelLabel('campaign')).toBe('Campagna');
    expect(levelLabel('scene')).toBe('Scena');
  });
});

describe('reflectMessage', () => {
  it('formatta un successo con riassunto e plurale', () => {
    const msg = reflectMessage({ ok: true, factCount: 3, summarized: true } satisfies ReflectResult);
    expect(msg).toContain('3 fatti');
    expect(msg.toLowerCase()).toContain('riassunto');
  });

  it('usa il singolare con un solo fatto e senza riassunto', () => {
    const msg = reflectMessage({ ok: true, factCount: 1, summarized: false } satisfies ReflectResult);
    expect(msg).toContain('1 fatto');
    expect(msg.toLowerCase()).not.toContain('riassunto');
  });

  it('riporta l errore su esito non ok', () => {
    const msg = reflectMessage({ ok: false, error: 'nessun provider' } satisfies ReflectResult);
    expect(msg).toContain('nessun provider');
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/lib/journal-view.test.ts`
Expected: FAIL (Cannot find module `./journal-view` / export mancanti).

- [ ] **Step 3: Scrivi l implementazione minima**

Create `app/desktop/src/renderer/src/lib/journal-view.ts`:

```ts
import type { CanonFactDto, SummaryDto, ReflectResult } from '@loomn/shared';

/** Una riga canon formattata (display-only): soggetto-predicato-oggetto + salienza + flag ritirato. */
export interface CanonLine {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  text: string;
  salience: number;
  retracted: boolean;
}

/** Mappa un fatto canon nella riga di visualizzazione (testo "soggetto predicato oggetto"). */
export function toCanonLine(fact: CanonFactDto): CanonLine {
  return {
    id: fact.id,
    subject: fact.subject,
    predicate: fact.predicate,
    object: fact.object,
    text: `${fact.subject} ${fact.predicate} ${fact.object}`,
    salience: fact.salience,
    retracted: fact.status === 'retracted',
  };
}

/** Canon ordinato per salienza decrescente; i fatti ritirati vanno in coda a parita. Stabile
 *  (Array.prototype.sort e stabile su Node) → a parita preserva l ordine d ingresso. */
export function sortCanonBySalience(facts: readonly CanonFactDto[]): CanonLine[] {
  return [...facts].map(toCanonLine).sort((a, b) => {
    if (a.retracted !== b.retracted) return a.retracted ? 1 : -1;
    return b.salience - a.salience;
  });
}

/** Livelli L2 dal piu ampio al piu fine (ordine di visualizzazione del Diario). */
export const SUMMARY_LEVELS = ['campaign', 'arc', 'session', 'scene'] as const;
export type SummaryLevel = (typeof SUMMARY_LEVELS)[number];

/** Una riga riassunto formattata: testo + scope + intervallo di seq coperto. */
export interface SummaryLine {
  id: string;
  level: SummaryLevel;
  scope: string;
  text: string;
  salience: number;
  range: string;
}

/** Un gruppo di riassunti dello stesso livello. */
export interface SummaryGroup {
  level: SummaryLevel;
  items: SummaryLine[];
}

function toSummaryLine(s: SummaryDto): SummaryLine {
  return {
    id: s.id,
    level: s.level,
    scope: s.scope,
    text: s.text,
    salience: s.salience,
    range: `${s.eventSeqFrom}-${s.eventSeqTo}`,
  };
}

/** Raggruppa i riassunti per livello (ordine SUMMARY_LEVELS); dentro ogni gruppo ordina per recency
 *  (eventSeqTo decrescente). Salta i livelli senza voci. */
export function groupSummaries(summaries: readonly SummaryDto[]): SummaryGroup[] {
  const groups: SummaryGroup[] = [];
  for (const level of SUMMARY_LEVELS) {
    const items = summaries
      .filter((s) => s.level === level)
      .slice()
      .sort((a, b) => b.eventSeqTo - a.eventSeqTo)
      .map(toSummaryLine);
    if (items.length > 0) groups.push({ level, items });
  }
  return groups;
}

const LEVEL_LABELS: Record<SummaryLevel, string> = {
  campaign: 'Campagna',
  arc: 'Arco',
  session: 'Sessione',
  scene: 'Scena',
};

/** Etichetta italiana di un livello L2. */
export function levelLabel(level: SummaryLevel): string {
  return LEVEL_LABELS[level];
}

/** Messaggio leggibile dell esito di una Reflection. */
export function reflectMessage(res: ReflectResult): string {
  if (!res.ok) return `Riflessione fallita: ${res.error}`;
  const fatti = `${res.factCount} ${res.factCount === 1 ? 'fatto' : 'fatti'}`;
  return res.summarized
    ? `Riflessione completata: ${fatti}, riassunto aggiornato.`
    : `Riflessione completata: ${fatti}.`;
}
```

- [ ] **Step 4: Esegui il test e verifica che passa**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/lib/journal-view.test.ts`
Expected: PASS (10 test). Poi `pnpm -C app/desktop typecheck` → Done (nessun errore).

- [ ] **Step 5: Commit**

```bash
git add app/desktop/src/renderer/src/lib/journal-view.ts app/desktop/src/renderer/src/lib/journal-view.test.ts
git commit -m "feat(renderer): funzioni pure del Diario (canon/riassunti/reflect message) (10e)"
```

---

## Task 2: `stores/journal.ts` — store read-side condiviso (riassunti L2 + canon + reflect)

**Files:**
- Create: `app/desktop/src/renderer/src/stores/journal.ts`
- Test: `app/desktop/src/renderer/src/stores/journal.test.ts`

Store Pinia read-side: possiede i riassunti L2 e i fatti canon, li carica in parallelo, ed espone il trigger `reflect`. Riusato da Diario (vista piena) e Compagnia (canon filtrato). NON e fetch-once (la Reflection aggiunge voci → `load()` rifa la fetch). Usa `reflectMessage` di Task 1.

- [ ] **Step 1: Scrivi il test che fallisce**

Create `app/desktop/src/renderer/src/stores/journal.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { CanonResult, SummariesResult, ReflectResult } from '@loomn/shared';
import { useJournalStore } from './journal';

const SUMS: SummariesResult = {
  ok: true,
  summaries: [{ id: 's1', level: 'scene', scope: 'sess-1', text: 'scena', importance: 5, salience: 0.5, createdAt: 1000, eventSeqFrom: 1, eventSeqTo: 3 }],
};
const CANON: CanonResult = { ok: true, facts: [{ id: 'f1', subject: 'Eroe', predicate: 'possiede', object: 'spada', eventSeq: 2, salience: 0.8, status: 'active' }] };

function stub(over: Partial<Record<'getSummaries' | 'getCanon' | 'reflect', unknown>>): void {
  window.loomn = {
    getSummaries: vi.fn(() => Promise.resolve(SUMS)),
    getCanon: vi.fn(() => Promise.resolve(CANON)),
    reflect: vi.fn((): Promise<ReflectResult> => Promise.resolve({ ok: true, factCount: 2, summarized: true })),
    ...over,
  } as unknown as typeof window.loomn;
}

describe('useJournalStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    stub({});
  });

  it('load popola riassunti e canon su esito ok', async () => {
    const store = useJournalStore();
    await store.load();
    expect(store.summaries.map((s) => s.id)).toEqual(['s1']);
    expect(store.canon.map((f) => f.id)).toEqual(['f1']);
    expect(store.error).toBeNull();
  });

  it('load imposta error se un canale fallisce', async () => {
    stub({ getCanon: vi.fn(() => Promise.resolve({ ok: false, error: 'ledger ko' })) });
    const store = useJournalStore();
    await store.load();
    expect(store.summaries.map((s) => s.id)).toEqual(['s1']);
    expect(store.error).toBe('ledger ko');
  });

  it('runReflect ok pubblica il messaggio e ricarica', async () => {
    const reflect = vi.fn((): Promise<ReflectResult> => Promise.resolve({ ok: true, factCount: 2, summarized: true }));
    const getCanon = vi.fn(() => Promise.resolve(CANON));
    stub({ reflect, getCanon });
    const store = useJournalStore();
    await store.runReflect('sessione');
    expect(reflect).toHaveBeenCalledWith({ scope: 'sessione' });
    expect(store.reflectInfo).toContain('2 fatti');
    expect(getCanon).toHaveBeenCalledTimes(1); // refresh dopo reflect ok
  });

  it('runReflect non ok pubblica l errore e non ricarica', async () => {
    const getCanon = vi.fn(() => Promise.resolve(CANON));
    stub({ reflect: vi.fn((): Promise<ReflectResult> => Promise.resolve({ ok: false, error: 'nessun provider' })), getCanon });
    const store = useJournalStore();
    await store.runReflect('sessione');
    expect(store.reflectInfo).toContain('nessun provider');
    expect(getCanon).not.toHaveBeenCalled(); // niente refresh su esito non ok
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/stores/journal.test.ts`
Expected: FAIL (Cannot find module `./journal`).

- [ ] **Step 3: Scrivi l implementazione minima**

Create `app/desktop/src/renderer/src/stores/journal.ts`:

```ts
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { CanonFactDto, SummaryDto } from '@loomn/shared';
import { reflectMessage } from '../lib/journal-view';

/** Store read-side della memoria narrativa persistente: riassunti L2 (getSummaries) + canon L1.5
 *  (getCanon) + il trigger Reflection (reflect). Consumato dal Diario (vista piena) e dalla Compagnia
 *  (canon filtrato per attore = relazioni display-only). NON e fetch-once: reflect aggiunge voci →
 *  load() rifa la fetch. La cronologia narrazione vive nello store `narration` (riuso, non qui). */
export const useJournalStore = defineStore('journal', () => {
  const summaries = ref<SummaryDto[]>([]);
  const canon = ref<CanonFactDto[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const reflecting = ref(false);
  const reflectInfo = ref<string | null>(null);

  /** Carica riassunti L2 + canon in parallelo. Ogni canale ha il suo esito tipizzato; su un esito non
   *  ok imposta `error` e lascia invariato l elenco gia presente per quel canale. */
  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const [s, c] = await Promise.all([window.loomn.getSummaries({}), window.loomn.getCanon({})]);
      if (s.ok) summaries.value = s.summaries;
      else error.value = s.error;
      if (c.ok) canon.value = c.facts;
      else error.value = c.error;
    } finally {
      loading.value = false;
    }
  }

  /** Trigger della Reflection sullo scope dato (etichetta dei riassunti, vedi campaign-service.ts).
   *  Su successo ricarica riassunti+canon (la Reflection puo aggiungere voci) e pubblica un messaggio
   *  leggibile; su fallimento pubblica l errore e NON ricarica. */
  async function runReflect(scope: string): Promise<void> {
    reflecting.value = true;
    reflectInfo.value = null;
    try {
      const res = await window.loomn.reflect({ scope });
      reflectInfo.value = reflectMessage(res);
      if (res.ok) await load();
    } finally {
      reflecting.value = false;
    }
  }

  return { summaries, canon, loading, error, reflecting, reflectInfo, load, runReflect };
});
```

- [ ] **Step 4: Esegui il test e verifica che passa**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/stores/journal.test.ts`
Expected: PASS (4 test). Poi `pnpm -C app/desktop typecheck` → Done.

- [ ] **Step 5: Commit**

```bash
git add app/desktop/src/renderer/src/stores/journal.ts app/desktop/src/renderer/src/stores/journal.test.ts
git commit -m "feat(renderer): store journal (riassunti L2 + canon + trigger reflect) (10e)"
```

---

## Task 3: `views/JournalView.vue` — la route `/diario` compone le tre fonti + reflect

**Files:**
- Modify: `app/desktop/src/renderer/src/views/JournalView.vue` (oggi placeholder)
- Test: `app/desktop/src/renderer/src/views/JournalView.test.ts` (nuovo)
- Modify: `app/desktop/src/renderer/src/App.test.ts` (aggiunge gli stub `getSummaries`/`getCanon`)

Il Diario compone: cronologia (store `narration`, `loadInitial` onMounted + "Carica piu vecchie"), riassunti raggruppati (store `journal` + `groupSummaries`), fatti canon ordinati (`sortCanonBySalience`), affordance Rifletti (`journal.runReflect`). Read-only sul canon/L2; il solo write e `reflect`.

- [ ] **Step 1: Scrivi il test che fallisce**

Create `app/desktop/src/renderer/src/views/JournalView.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import type { ReflectResult } from '@loomn/shared';
import JournalView from './JournalView.vue';

function stubFull(): void {
  window.loomn = {
    getNarrationHistory: () => Promise.resolve({ ok: true, entries: [{ seq: 1, playerAction: 'Apro la porta', narration: 'La porta cigola' }], hasMore: false }),
    getSummaries: () => Promise.resolve({ ok: true, summaries: [{ id: 's1', level: 'scene', scope: 'sess-1', text: 'Riassunto della scena', importance: 5, salience: 0.5, createdAt: 1000, eventSeqFrom: 1, eventSeqTo: 3 }] }),
    getCanon: () => Promise.resolve({ ok: true, facts: [{ id: 'f1', subject: 'Eroe', predicate: 'possiede', object: 'spada', eventSeq: 2, salience: 0.8, status: 'active' }] }),
    reflect: vi.fn((): Promise<ReflectResult> => Promise.resolve({ ok: true, factCount: 2, summarized: true })),
  } as unknown as typeof window.loomn;
}

function stubEmpty(): void {
  window.loomn = {
    getNarrationHistory: () => Promise.resolve({ ok: true, entries: [], hasMore: false }),
    getSummaries: () => Promise.resolve({ ok: true, summaries: [] }),
    getCanon: () => Promise.resolve({ ok: true, facts: [] }),
    reflect: vi.fn((): Promise<ReflectResult> => Promise.resolve({ ok: true, factCount: 0, summarized: false })),
  } as unknown as typeof window.loomn;
}

describe('JournalView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    stubFull();
  });

  it('mostra la cronologia della narrazione', async () => {
    const w = mount(JournalView, { global: { plugins: [createPinia()] } });
    await flushPromises();
    expect(w.text()).toContain('Apro la porta');
    expect(w.text()).toContain('La porta cigola');
  });

  it('mostra i riassunti raggruppati per livello', async () => {
    const w = mount(JournalView, { global: { plugins: [createPinia()] } });
    await flushPromises();
    expect(w.text()).toContain('Scena');
    expect(w.text()).toContain('Riassunto della scena');
  });

  it('mostra i fatti canonici', async () => {
    const w = mount(JournalView, { global: { plugins: [createPinia()] } });
    await flushPromises();
    expect(w.text()).toContain('Eroe possiede spada');
  });

  it('Rifletti chiama il trigger col scope e mostra l esito', async () => {
    const reflect = vi.fn((): Promise<ReflectResult> => Promise.resolve({ ok: true, factCount: 2, summarized: true }));
    window.loomn = { ...window.loomn, reflect } as unknown as typeof window.loomn;
    const w = mount(JournalView, { global: { plugins: [createPinia()] } });
    await flushPromises();
    const btn = w.findAll('button').find((b) => b.text() === 'Rifletti');
    expect(btn).toBeDefined();
    await btn!.trigger('click');
    await flushPromises();
    expect(reflect).toHaveBeenCalledWith({ scope: 'sessione' });
    expect(w.text()).toContain('Riflessione completata');
  });

  it('mostra gli stati vuoti senza memoria', async () => {
    stubEmpty();
    const w = mount(JournalView, { global: { plugins: [createPinia()] } });
    await flushPromises();
    expect(w.text()).toContain('Nessuna scena');
    expect(w.text()).toContain('Nessun riassunto');
    expect(w.text()).toContain('Nessun fatto');
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/views/JournalView.test.ts`
Expected: FAIL (la vista placeholder rende "Narrativa L2 e canon arrivano nel Piano 10e", non "Apro la porta").

- [ ] **Step 3: Scrivi l implementazione minima**

Replace the entire content of `app/desktop/src/renderer/src/views/JournalView.vue` with:

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import LoomnPanel from '../components/LoomnPanel.vue';
import LoomnButton from '../components/LoomnButton.vue';
import { useNarrationStore } from '../stores/narration';
import { useJournalStore } from '../stores/journal';
import { groupSummaries, sortCanonBySalience, levelLabel } from '../lib/journal-view';

const narration = useNarrationStore();
const journal = useJournalStore();

// Scope = etichetta dei riassunti prodotti dalla Reflection (vedi campaign-service.ts). Stato locale.
const scope = ref('sessione');

onMounted(() => {
  void narration.loadInitial();
  void journal.load();
});

const summaryGroups = computed(() => groupSummaries(journal.summaries));
const canonLines = computed(() => sortCanonBySalience(journal.canon));

function reflectNow(): void {
  const s = scope.value.trim();
  if (s === '' || journal.reflecting) return;
  void journal.runReflect(s);
}
</script>

<template>
  <main class="route-view">
    <LoomnPanel eyebrow="diario" title="Diario" :meta="`${journal.canon.length} fatti`">
      <div class="journal">
        <section class="block">
          <div class="reflect">
            <input
              v-model="scope"
              class="reflect__scope"
              type="text"
              aria-label="ambito riflessione"
              placeholder="ambito (es. sessione)"
            />
            <LoomnButton variant="solid" :disabled="journal.reflecting || scope.trim() === ''" @click="reflectNow">
              {{ journal.reflecting ? 'Rifletto...' : 'Rifletti' }}
            </LoomnButton>
            <span v-if="journal.reflectInfo" class="reflect__info">{{ journal.reflectInfo }}</span>
          </div>
        </section>

        <section class="block">
          <h4 class="block__title">Cronologia</h4>
          <ul v-if="narration.entries.length" class="timeline">
            <li v-for="e in narration.entries" :key="e.key" class="entry">
              <p class="entry__action">{{ e.playerAction }}</p>
              <p class="entry__narr">{{ e.narration }}</p>
            </li>
          </ul>
          <p v-else class="empty">Nessuna scena ancora narrata.</p>
          <LoomnButton v-if="narration.hasMore" variant="ghost" @click="narration.loadOlder">Carica piu vecchie</LoomnButton>
        </section>

        <section class="block">
          <h4 class="block__title">Riassunti</h4>
          <div v-if="summaryGroups.length" class="summaries">
            <div v-for="g in summaryGroups" :key="g.level" class="sgroup">
              <span class="sgroup__level">{{ levelLabel(g.level) }}</span>
              <ul class="sgroup__list">
                <li v-for="s in g.items" :key="s.id" class="summary">
                  <p class="summary__text">{{ s.text }}</p>
                  <span class="summary__meta">{{ s.scope }} · {{ s.range }}</span>
                </li>
              </ul>
            </div>
          </div>
          <p v-else class="empty">Nessun riassunto. Usa Rifletti per generarli.</p>
        </section>

        <section class="block">
          <h4 class="block__title">Fatti canonici</h4>
          <ul v-if="canonLines.length" class="canon">
            <li v-for="f in canonLines" :key="f.id" class="fact" :class="{ 'fact--retracted': f.retracted }">
              <span class="fact__text">{{ f.text }}</span>
            </li>
          </ul>
          <p v-else class="empty">Nessun fatto canonico ancora.</p>
        </section>
      </div>
    </LoomnPanel>
  </main>
</template>

<style scoped>
.route-view { flex: 1; min-height: 0; }
.journal { display: flex; flex-direction: column; gap: 18px; }
.block { display: flex; flex-direction: column; gap: 8px; }
.block__title { margin: 0; font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-3); font-weight: 600; }
.reflect { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.reflect__scope { font: inherit; font-family: var(--f-mono); font-size: 13px; color: var(--text); background: var(--well); border: 1px solid var(--line-2); border-radius: 10px; padding: 8px 11px; }
.reflect__scope:focus { outline: none; border-color: var(--accent); }
.reflect__info { font-size: 12px; color: var(--text-2); }
.timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.entry { padding: 9px 12px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--well); }
.entry__action { margin: 0 0 4px; font-family: var(--f-ui); font-size: 12px; color: var(--text-3); }
.entry__narr { margin: 0; font-family: var(--f-read); font-size: 14px; color: var(--text); line-height: 1.5; }
.summaries { display: flex; flex-direction: column; gap: 12px; }
.sgroup { display: flex; flex-direction: column; gap: 6px; }
.sgroup__level { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); }
.sgroup__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.summary { padding: 8px 11px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--well); }
.summary__text { margin: 0 0 4px; font-family: var(--f-read); font-size: 13px; color: var(--text); line-height: 1.45; }
.summary__meta { font-family: var(--f-mono); font-size: 10.5px; color: var(--text-3); }
.canon { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.fact { padding: 7px 11px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--well); }
.fact__text { font-family: var(--f-ui); font-size: 13px; color: var(--text); }
.fact--retracted { opacity: 0.5; }
.fact--retracted .fact__text { text-decoration: line-through; }
.empty { color: var(--text-3); font-size: 13px; margin: 0; }
</style>
```

- [ ] **Step 4: Aggiorna `App.test.ts` (la route `/diario` ora monta il Diario REALE)**

In `app/desktop/src/renderer/src/App.test.ts`, nel `beforeEach`, il test "parte sul Gioco e naviga al Diario" naviga a `/diario` che ora monta `JournalView` reale → `onMounted` chiama `journal.load()` (`getSummaries`/`getCanon`). Senza stub esplode con unhandled-rejection. Aggiungi i due canali allo stub esistente.

Da:
```ts
      // App monta GameView (rotta /) -> NarrativePanel -> narration.loadInitial() chiama getNarrationHistory.
      getNarrationHistory: () => Promise.resolve({ ok: true, entries: [], hasMore: false }),
    } as unknown as typeof window.loomn;
```
A:
```ts
      // App monta GameView (rotta /) -> NarrativePanel -> narration.loadInitial() chiama getNarrationHistory.
      getNarrationHistory: () => Promise.resolve({ ok: true, entries: [], hasMore: false }),
      // 10e: navigando a /diario il JournalView reale chiama journal.load() (getSummaries/getCanon).
      getSummaries: () => Promise.resolve({ ok: true, summaries: [] }),
      getCanon: () => Promise.resolve({ ok: true, facts: [] }),
    } as unknown as typeof window.loomn;
```

(L assert `wrapper.text()).toContain('Diario')` resta valido: il titolo del pannello e ancora "Diario".)

- [ ] **Step 5: Esegui i test di JournalView e App e verifica che passano**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/views/JournalView.test.ts app/desktop/src/renderer/src/App.test.ts`
Expected: PASS. `JournalView.test`: 5 test. `App.test`: i 4 test esistenti restano verdi (ora `/diario` monta il Diario reale con gli stub aggiunti, nessun unhandled-rejection). Poi `pnpm -C app/desktop typecheck` → Done.

- [ ] **Step 6: Commit**

```bash
git add app/desktop/src/renderer/src/views/JournalView.vue app/desktop/src/renderer/src/views/JournalView.test.ts app/desktop/src/renderer/src/App.test.ts
git commit -m "feat(renderer): route /diario compone narrazione+L2+canon+reflect (10e)"
```

---

## Task 4: `lib/company-view.ts` — funzioni PURE della Compagnia

**Files:**
- Create: `app/desktop/src/renderer/src/lib/company-view.ts`
- Test: `app/desktop/src/renderer/src/lib/company-view.test.ts`

La carta compatta per-attore (identita/livello/risorse/conteggi) e il filtro dei fatti canon che coinvolgono un attore (relazioni display-only: match per nome case-insensitive o per id su subject/object). Pure, tipi dal contratto IPC.

- [ ] **Step 1: Scrivi il test che fallisce**

Create `app/desktop/src/renderer/src/lib/company-view.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toCompanyCard, canonForActor } from './company-view';
import type { ActorView } from '../stores/read-model';
import type { CanonFactDto } from '@loomn/shared';

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

function fact(over: Partial<CanonFactDto> & { id: string }): CanonFactDto {
  return {
    id: over.id,
    subject: over.subject ?? 'Eroe',
    predicate: over.predicate ?? 'conosce',
    object: over.object ?? 'Goblin',
    eventSeq: over.eventSeq ?? 1,
    salience: over.salience ?? 0.5,
    status: over.status ?? 'active',
  };
}

describe('toCompanyCard', () => {
  it('riporta identita, livello, risorse e conteggi', () => {
    const card = toCompanyCard(
      actor({
        id: 'eroe',
        name: 'Eroe',
        kind: 'pc',
        resources: { hp: { current: 7, max: 10 } },
        conditions: [{ key: 'benedetto', source: 'rito', effects: [], duration: { kind: 'permanent' } }],
        items: [{ id: 'spada', name: 'Spada', equipped: true, effects: [] }],
        progression: { xp: 50, level: 2 },
      }),
    );
    expect(card.name).toBe('Eroe');
    expect(card.kind).toBe('pc');
    expect(card.level).toBe(2);
    expect(card.resources).toEqual([{ key: 'hp', current: 7, max: 10 }]);
    expect(card.conditionCount).toBe(1);
    expect(card.itemCount).toBe(1);
  });
});

describe('canonForActor', () => {
  const facts = [
    fact({ id: 'f1', subject: 'Eroe', predicate: 'odia', object: 'Strega' }),
    fact({ id: 'f2', subject: 'Mercante', predicate: 'teme', object: 'eroe' }),
    fact({ id: 'f3', subject: 'Goblin', predicate: 'serve', object: 'Re' }),
  ];

  it('trova i fatti per nome senza badare al maiuscolo', () => {
    const out = canonForActor(facts, actor({ id: 'x', name: 'Eroe' }));
    expect(out.map((f) => f.id).sort()).toEqual(['f1', 'f2']);
  });

  it('trova i fatti per id quando il subject o l object e l id', () => {
    const out = canonForActor([fact({ id: 'r', subject: 'pg-eroe', predicate: 'guida', object: 'gruppo' })], actor({ id: 'pg-eroe', name: 'Altro Nome' }));
    expect(out.map((f) => f.id)).toEqual(['r']);
  });

  it('ritorna vuoto senza match', () => {
    expect(canonForActor(facts, actor({ id: 'z', name: 'Sconosciuto' }))).toEqual([]);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/lib/company-view.test.ts`
Expected: FAIL (Cannot find module `./company-view`).

- [ ] **Step 3: Scrivi l implementazione minima**

Create `app/desktop/src/renderer/src/lib/company-view.ts`:

```ts
import type { ActorView } from '../stores/read-model';
import type { CanonFactDto } from '@loomn/shared';

/** Una risorsa nella carta compatta (current/max, senza barra: la barra piena e nella Scheda 10d). */
export interface CompanyResource {
  key: string;
  current: number;
  max: number;
}

/** Carta compatta di un attore per la Compagnia. */
export interface CompanyCard {
  id: string;
  name: string;
  kind: 'pc' | 'npc';
  level: number;
  xp: number;
  resources: CompanyResource[];
  conditionCount: number;
  itemCount: number;
}

/** Mappa un attore del read-model nella carta compatta della Compagnia. Pura. */
export function toCompanyCard(actor: ActorView): CompanyCard {
  return {
    id: actor.id,
    name: actor.name,
    kind: actor.kind,
    level: actor.progression.level,
    xp: actor.progression.xp,
    resources: Object.entries(actor.resources).map(([key, pool]) => ({
      key,
      current: pool.current,
      max: pool.max,
    })),
    conditionCount: actor.conditions.length,
    itemCount: actor.items.length,
  };
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Fatti canon che coinvolgono l attore (relazioni DISPLAY-ONLY): match per nome (case-insensitive) o
 *  per id su subject/object. Le relazioni strutturate sono deferite (spec §11) → qui sono solo una
 *  proiezione dei fatti canon. Pura. */
export function canonForActor(facts: readonly CanonFactDto[], actor: ActorView): CanonFactDto[] {
  const name = norm(actor.name);
  const id = actor.id;
  return facts.filter(
    (f) => norm(f.subject) === name || norm(f.object) === name || f.subject === id || f.object === id,
  );
}
```

- [ ] **Step 4: Esegui il test e verifica che passa**

Run: `pnpm exec vitest run app/desktop/src/renderer/src/lib/company-view.test.ts`
Expected: PASS (5 test). Poi `pnpm -C app/desktop typecheck` → Done.

- [ ] **Step 5: Commit**

```bash
git add app/desktop/src/renderer/src/lib/company-view.ts app/desktop/src/renderer/src/lib/company-view.test.ts
git commit -m "feat(renderer): funzioni pure della Compagnia (carta attore + canon per attore) (10e)"
```

---

## Task 5: `views/CompanyView.vue` — roster cards + relazioni canon + estensione del gate self-test

**Files:**
- Modify: `app/desktop/src/renderer/src/views/CompanyView.vue` (il creator di 10f resta INTATTO)
- Modify: `app/desktop/src/renderer/src/views/CompanyView.test.ts` (aggiunge gli stub `getSummaries`/`getCanon` e i test del roster)
- Modify: `app/desktop/src/renderer/src/renderer.ts` (self-test: naviga a Diario + Compagnia)

La Compagnia smette di essere "roster piatto + creator": raggruppa PG/PNG con carte compatte e, sotto ognuna, i fatti canon che la coinvolgono (relazioni display-only). Il creator `AddActor` di 10f resta com e. Il self-test (gate "esegui l app") aggiunge una navigazione a `/diario` e `/compagnia` che montano le viste reali — esercizio end-to-end. Le viste sono read-only → **nessun nuovo evento, la versione resta 7** (la fase 2 del gate continua a verificare `version === 7`).

- [ ] **Step 1: Aggiorna il test di CompanyView (gli stub mancanti + i nuovi test del roster)**

In `app/desktop/src/renderer/src/views/CompanyView.test.ts`:

(a) `CompanyView` ora chiama `journal.load()` onMounted → senza `getSummaries`/`getCanon` esplode. Aggiungi i canali al `beforeEach` e importa il read-model store + `ReadModelPush`. Sostituisci l intera testa del file (import + RULESET + beforeEach) con:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import type { RulesetResult, ReadModelPush, CanonResult } from '@loomn/shared';
import CompanyView from './CompanyView.vue';
import { useReadModelStore } from '../stores/read-model';

const RULESET: Extract<RulesetResult, { ok: true }> = {
  ok: true,
  vocabulary: {
    attributes: ['forza'],
    skills: ['atletica'],
    resources: ['hp'],
    defenses: ['difesa'],
    defaultResources: { hp: { current: 10, max: 10 } },
  },
  difficulties: ['moderate'],
  softPhases: ['exploration'],
  questOutcomes: ['completed'],
  directions: ['restore'],
  commandPhaseRules: { combatOnly: [], nonCombatOnly: [] },
};

const CANON: CanonResult = {
  ok: true,
  facts: [{ id: 'f1', subject: 'Eroe', predicate: 'protegge', object: 'Villaggio', eventSeq: 1, salience: 0.7, status: 'active' }],
};

function rosterPush(): ReadModelPush {
  return {
    version: 1,
    state: {
      version: 1,
      phase: 'exploration',
      quests: {},
      encounter: null,
      actors: {
        eroe: { id: 'eroe', name: 'Eroe', kind: 'pc', attributes: {}, skills: {}, resources: { hp: { current: 7, max: 10 } }, conditions: [], items: [], progression: { xp: 0, level: 1 } },
        goblin: { id: 'goblin', name: 'Goblin', kind: 'npc', attributes: {}, skills: {}, resources: { hp: { current: 3, max: 6 } }, conditions: [], items: [], progression: { xp: 0, level: 1 } },
      },
    },
  };
}

describe('CompanyView', () => {
  let dispatch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    setActivePinia(createPinia());
    dispatch = vi.fn(() => Promise.resolve({ ok: true as const, version: 1, events: [] }));
    window.loomn = {
      getRuleset: () => Promise.resolve(RULESET),
      getSummaries: () => Promise.resolve({ ok: true, summaries: [] }),
      getCanon: () => Promise.resolve(CANON),
      dispatch,
    } as unknown as typeof window.loomn;
  });
```

(b) Il test esistente del creator resta com e (mostra `mount(CompanyView)` senza pinia esplicita → usa la pinia attiva del `beforeEach`). AGGIUNGI dopo di esso due test del roster (prima della chiusura `});` del `describe`):

```ts
  it('elenca i PG e i PNG con le carte', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useReadModelStore().applyPush(rosterPush());
    const w = mount(CompanyView, { global: { plugins: [pinia] } });
    await flushPromises();
    expect(w.text()).toContain('Eroe');
    expect(w.text()).toContain('Goblin');
    expect(w.text()).toContain('liv. 1');
    expect(w.text()).toContain('hp 7/10');
  });

  it('mostra le relazioni canon per attore', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useReadModelStore().applyPush(rosterPush());
    const w = mount(CompanyView, { global: { plugins: [pinia] } });
    await flushPromises();
    expect(w.text()).toContain('Eroe protegge Villaggio');
  });
```

Run: `pnpm exec vitest run app/desktop/src/renderer/src/views/CompanyView.test.ts`
Expected: FAIL sui due nuovi test (la vista attuale non rende "liv. 1"/"hp 7/10"/"Eroe protegge Villaggio"). Il test del creator resta verde.

- [ ] **Step 2: Aggiorna `CompanyView.vue` (carte + relazioni; creator INTATTO)**

In `app/desktop/src/renderer/src/views/CompanyView.vue`:

(a) Aggiungi gli import e lo store/lib nello `<script setup>`. Da:
```ts
import { useReadModelStore } from '../stores/read-model';
import { useRulesetStore } from '../stores/ruleset';
import { buildActor, type ActorFormState } from '../lib/actor-form';

const store = useReadModelStore();
const ruleset = useRulesetStore();
```
A:
```ts
import { useReadModelStore, type ActorView } from '../stores/read-model';
import { useRulesetStore } from '../stores/ruleset';
import { useJournalStore } from '../stores/journal';
import { buildActor, type ActorFormState } from '../lib/actor-form';
import { toCompanyCard, canonForActor } from '../lib/company-view';
import { toCanonLine } from '../lib/journal-view';

const store = useReadModelStore();
const ruleset = useRulesetStore();
const journal = useJournalStore();

// Carte per gruppo: identita/livello/risorse (toCompanyCard) + relazioni canon (canonForActor →
// toCanonLine, display-only). Le relazioni strutturate sono deferite (spec §11).
function cardsFor(actors: ActorView[]) {
  return actors.map((a) => ({ card: toCompanyCard(a), relations: canonForActor(journal.canon, a).map(toCanonLine) }));
}
const pcCards = computed(() => cardsFor(store.pcs));
const npcCards = computed(() => cardsFor(store.npcs));
```

(b) Carica il canon onMounted (oltre al ruleset per il creator). Da:
```ts
onMounted(async () => {
  await ruleset.load();
  resetForm();
});
```
A:
```ts
onMounted(async () => {
  void journal.load();
  await ruleset.load();
  resetForm();
});
```

(c) Sostituisci il roster piatto col roster a gruppi. Da:
```vue
      <ul v-if="store.actors.length" class="roster">
        <li v-for="a in store.actors" :key="a.id" class="roster__row">
          <span class="roster__name">{{ a.name }}</span>
          <span class="roster__kind">{{ a.kind }}</span>
        </li>
      </ul>
      <p v-else>Nessun attore ancora. Relazioni e dettagli arrivano nel Piano 10e.</p>
```
A:
```vue
      <div v-if="store.actors.length" class="roster">
        <section v-if="pcCards.length" class="group">
          <h3 class="group__title">Personaggi</h3>
          <ul class="cards">
            <li v-for="row in pcCards" :key="row.card.id" class="card">
              <div class="card__head">
                <span class="card__name">{{ row.card.name }}</span>
                <span class="card__lvl">liv. {{ row.card.level }}</span>
              </div>
              <div v-if="row.card.resources.length" class="card__res">
                <span v-for="r in row.card.resources" :key="r.key" class="res">{{ r.key }} {{ r.current }}/{{ r.max }}</span>
              </div>
              <span class="card__meta">xp {{ row.card.xp }} · {{ row.card.itemCount }} oggetti · {{ row.card.conditionCount }} condizioni</span>
              <ul v-if="row.relations.length" class="rel">
                <li v-for="f in row.relations" :key="f.id" class="rel__row">{{ f.text }}</li>
              </ul>
            </li>
          </ul>
        </section>
        <section v-if="npcCards.length" class="group">
          <h3 class="group__title">Personaggi non giocanti</h3>
          <ul class="cards">
            <li v-for="row in npcCards" :key="row.card.id" class="card">
              <div class="card__head">
                <span class="card__name">{{ row.card.name }}</span>
                <span class="card__lvl">liv. {{ row.card.level }}</span>
              </div>
              <div v-if="row.card.resources.length" class="card__res">
                <span v-for="r in row.card.resources" :key="r.key" class="res">{{ r.key }} {{ r.current }}/{{ r.max }}</span>
              </div>
              <span class="card__meta">xp {{ row.card.xp }} · {{ row.card.itemCount }} oggetti · {{ row.card.conditionCount }} condizioni</span>
              <ul v-if="row.relations.length" class="rel">
                <li v-for="f in row.relations" :key="f.id" class="rel__row">{{ f.text }}</li>
              </ul>
            </li>
          </ul>
        </section>
      </div>
      <p v-else>Nessun attore ancora. Crea un PG o PNG per iniziare.</p>
```

(d) Aggiungi gli stili delle carte/relazioni in coda al blocco `<style scoped>` (sostituisci le 4 vecchie regole `.roster*` con le nuove — usa i TOKEN REALI). Da:
```css
.roster { list-style: none; display: flex; flex-direction: column; gap: 8px; padding: 0; }
.roster__row { display: flex; justify-content: space-between; padding: 9px 12px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--well); }
.roster__name { color: var(--text); }
.roster__kind { font-family: var(--f-mono); font-size: 11px; color: var(--text-3); }
```
A:
```css
.roster { display: flex; flex-direction: column; gap: 18px; }
.group { display: flex; flex-direction: column; gap: 10px; }
.group__title { margin: 0; font-family: var(--f-display); font-size: 15px; color: var(--text-2); }
.cards { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.card { display: flex; flex-direction: column; gap: 7px; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--well); }
.card__head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.card__name { font-family: var(--f-display); font-size: 16px; color: var(--text); }
.card__lvl { font-family: var(--f-mono); font-size: 11px; color: var(--accent); }
.card__res { display: flex; flex-wrap: wrap; gap: 8px; }
.res { font-family: var(--f-mono); font-size: 11px; color: var(--text-2); border: 1px solid var(--line); border-radius: var(--r-xs); padding: 2px 7px; }
.card__meta { font-family: var(--f-mono); font-size: 10.5px; color: var(--text-3); }
.rel { list-style: none; margin: 4px 0 0; padding: 8px 0 0; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 4px; }
.rel__row { font-family: var(--f-ui); font-size: 12px; color: var(--text-2); }
```

(e) Aggiungi `computed` all import di `vue` se non gia presente. Verifica la riga in cima allo `<script setup>`: deve essere `import { ref, reactive, computed, onMounted, watch } from 'vue';` (lo era gia in 10f — `computed` e usato da `canSubmit`). Nessuna modifica necessaria se gia presente.

Run: `pnpm exec vitest run app/desktop/src/renderer/src/views/CompanyView.test.ts`
Expected: PASS (3 test: il creator + i 2 nuovi del roster). Poi `pnpm -C app/desktop typecheck` → Done.

- [ ] **Step 3: Estendi il self-test (gate esegui-app) con le due route**

In `app/desktop/src/renderer/src/renderer.ts`, nella fase 1, sostituisci il blocco di navigazione al Diario (oggi un semplice smoke test che montava il placeholder) con la navigazione a Diario + Compagnia che monta le viste reali. Da:
```ts
      await appRouter.push('/diario');
      check(appRouter.currentRoute.value.name === 'journal', 'router naviga al Diario');
      await appRouter.push('/');
      check(appRouter.currentRoute.value.name === 'game', 'router torna al Gioco');
```
A:
```ts
      // 10e: Diario (narrazione + L2 + canon, read-only) e Compagnia (roster dal read-model + relazioni
      // canon) montano via le route reali e leggono i canali read del Piano 0. Read-only → nessun
      // evento, la versione resta invariata (la fase 2 verifica 7).
      await appRouter.push('/diario');
      check(appRouter.currentRoute.value.name === 'journal', 'router naviga al Diario (JournalView montato)');
      await appRouter.push('/compagnia');
      check(appRouter.currentRoute.value.name === 'company', 'router naviga alla Compagnia (CompanyView montato)');
      check(readModel.actors.some((a) => a.id === 'goblin'), 'la Compagnia vede il roster dal read-model');
      await appRouter.push('/');
      check(appRouter.currentRoute.value.name === 'game', 'router torna al Gioco');
```

(La fase 2 — `s0.version === 7` — resta invariata: ne il Diario ne la Compagnia mutano lo stato; `reflect` NON viene invocato nel self-test perche e LLM-backed e nel gate non c e un LLM reale.)

- [ ] **Step 4: Esegui l intera suite renderer e il typecheck**

Run: `pnpm exec vitest run app/desktop` (gira solo il progetto renderer dalla workspace; oppure `pnpm test` dalla root per i 2 progetti).
Expected: PASS, ~690 test totali (664 baseline + 10 Task 1 + 4 Task 2 + 5 Task 3 + 5 Task 4 + 2 Task 5 = 690; Task 3/5 aggiornano test esistenti senza romperli).
Run: `pnpm -C app/desktop typecheck`
Expected: Done (nessun errore `vue-tsc`).

- [ ] **Step 5: Commit**

```bash
git add app/desktop/src/renderer/src/views/CompanyView.vue app/desktop/src/renderer/src/views/CompanyView.test.ts app/desktop/src/renderer/src/renderer.ts
git commit -m "feat(renderer): Compagnia con carte roster + relazioni canon + self-test Diario/Compagnia (10e)"
```

---

## Gate finale (passo ORCHESTRATORE, non subagent)

Dopo il merge dei 5 task sul branch, l orchestratore esegue il **gate Electron 2 fasi** (riproducibile, HANDOFF §9 item 2). Da Bash, dalla root:

```bash
pnpm --filter @loomn/desktop build
pnpm rebuild:electron
GATE=$(mktemp -d); WIN_GATE=$(cygpath -m "$GATE")
LOOMN_SELFTEST=1 LOOMN_USERDATA="$WIN_GATE" pnpm --filter @loomn/desktop exec electron .   # atteso VERDICT: PASS, exit 0
LOOMN_SELFTEST=2 LOOMN_USERDATA="$WIN_GATE" pnpm --filter @loomn/desktop exec electron .   # atteso VERDICT: PASS (version 7 persistita)
pnpm rebuild:node
```

Atteso: entrambe le fasi `VERDICT: PASS`. Se un rebuild fallisce con EBUSY/EPERM su `better_sqlite3.node`, fermare SOLO i processi Loomn (`Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'tabl|loomn' -and $_.Name -match 'electron|node' }` → `Stop-Process -Id <pid> -Force`), poi rebuild. **Screenshot del Diario** (route `/diario`: cronologia + riassunti + canon + Rifletti) e della **Compagnia** (route `/compagnia`: carte PG/PNG + relazioni) allegati alla verifica.

---

## Self-review (eseguita dall autore del piano)

**1. Copertura dello spec (§10 riga 10e, §7 audit, §11 deferiti):**
- narrativa L2 + canon (canali read del Piano 0 `getSummaries`/`getCanon`) → Task 1 (`groupSummaries`/`sortCanonBySalience`) + Task 2 (store `journal`) + Task 3 (rendering). ✅
- trigger `reflect` → Task 1 (`reflectMessage`) + Task 2 (`runReflect`) + Task 3 (affordance Rifletti). ✅
- cronologia narrazione (storia persistente paginata) → Task 3 riusa lo store `narration` di 10b (`getNarrationHistory` cursor-by-seq + "Carica piu vecchie"). ✅
- roster PG/PNG dal read-model con dettagli per-attore → Task 4 (`toCompanyCard`) + Task 5 (carte raggruppate pcs/npcs). ✅
- relazioni DISPLAY-ONLY come fatti canon, NIENTE entita strutturata (deferita) → Task 4 (`canonForActor`) + Task 5 (sezione relazioni); fuori ambito esplicito. ✅
- creazione PG di 10f preservata → Task 5 lascia il creator INTATTO. ✅
- riempie `/diario` (placeholder→reale) + arricchisce `/compagnia` → Task 3 + Task 5. ✅

**2. Scansione placeholder:** nessun "TBD"/"implementa dopo"; ogni step ha codice completo. ✅

**3. Coerenza dei tipi:** `CanonLine`/`SummaryLine`/`SummaryGroup`/`SummaryLevel`, `toCanonLine`/`sortCanonBySalience`/`groupSummaries`/`levelLabel`/`reflectMessage` (Task 1) usati con le stesse firme in Task 2 (`reflectMessage`) e Task 3 (`groupSummaries`/`sortCanonBySalience`/`levelLabel`). `CompanyCard`/`CompanyResource`, `toCompanyCard`/`canonForActor` (Task 4) usati in Task 5 con le stesse firme. `useJournalStore` (Task 2) consumato da Task 3 (`summaries`/`canon`/`reflecting`/`reflectInfo`/`load`/`runReflect`) e Task 5 (`canon`/`load`). Tipi IPC (`SummaryDto`/`CanonFactDto`/`ReflectResult`) da `@loomn/shared` (`export * from './ipc'` verificato). `ActorView` da `stores/read-model`. ✅

**4. Lezioni dure (§5):**
- scope discipline in ogni task; nessun tocco a config/`tokens.css`/CSP/`GameView`. ✅
- niente apostrofi nelle stringhe di test in apici singoli (verificato: "l ordine", "l errore", "l esito", "l attore", "l object", "dell autore"; `è/é` sono lettere, ok). Grep di verifica del piano: `(it|describe)\('[^']*'[A-Za-zàèéìòù]` → no match nei blocchi di test. ✅
- il solo write e `reflect({scope})` con scope `string` (nessun proxy reactive da clonare: payload PLAIN per costruzione). ✅
- rischio stub mancante gestito ESPLICITAMENTE: Task 3 aggiorna `App.test.ts` (route `/diario` reale → `getSummaries`/`getCanon`) e Task 5 aggiorna il `beforeEach` di `CompanyView.test.ts` (`journal.load()` onMounted). ✅
- TS strict: `Object.entries(actor.resources)` da valori concreti (no undefined); switch/`Record` esaustivi via `SUMMARY_LEVELS`/`LEVEL_LABELS` totali; nessun accesso indicizzato non guardato. ✅
- self-test: `reflect` NON invocato nel gate (LLM-backed); versione persistita 7 invariata (fase 2). ✅

---

## Roadmap aggiornata

- Piani 1-9 ✅ · backlog pre-Piano-10 ✅ · studio Piano 10 ✅ · Piano 0 ✅ · 10a ✅ · 10g ✅ · 10f ✅ · 10b ✅ · 10c ✅ · 10d ✅
- **10e (questo piano) — Diario + Compagnia (memoria narrativa L2 + canon + roster, display-only)** → in esecuzione. **ULTIMO sotto-piano del Piano 10.**
- **Dopo 10e:** restano le feature DEFERITE post-Piano-10 — **motore Inventario & Equipaggiamento** (slot profondi/contenitori/equip-come-azione/catalogo) e **movimento/topologia di zona** (entrambe design-first all apertura, spec §11 / HANDOFF §8), oppure **Piano 11 — moduli a tema**.
- Ordine sotto-piani: `10a✅ → 10g✅ → 10f✅ → 10b✅ → 10c✅ → 10d✅ → 10e`.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-19-loomn-piano10e-diario-compagnia.md`.**

Esecuzione (flusso §4): commit del doc su `main` → branch `feat/piano10e-diario-compagnia` → **subagent-driven** (per ogni task: implementer + spec-review + code-quality-review; final review opus a fine branch) → gate Electron 2 fasi → `finishing-a-development-branch` (merge ff) → `git push origin main` → aggiorna HANDOFF (§0-tervicies) + memoria (`loomn-project.md` + `MEMORY.md`).
