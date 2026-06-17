// L2/L1.5 read path — Context Assembler (spec 6.2). Questo modulo vive in `memory` (legge i
// propri store L1.5/L2 e il GameState/L1 da engine; NON importa `ai`). Allocatore con priorita
// e degrado controllato: L1 (priorita 2) + L1.5 (priorita 3) sempre inclusi, mai tagliati; L2
// (priorita 4) rankata per salienza x recency (decadimento a tempo di lettura sul createdAt via
// Clock) e inclusa dal punteggio piu alto finche c e budget (si taglia dal basso). La funzione
// restituita (state) => string e strutturalmente compatibile col punto di iniezione di `ai`.
import type { GameState } from '@loomn/engine';
import type { CanonFact, CanonLedger } from './canon-ledger';
import type { Summary, SummaryStore } from './summary-store';
import type { Clock } from './clock';

const MS_PER_HOUR = 3_600_000;

/** Euristica token di default: circa 4 caratteri per token (Math.ceil). */
export function defaultEstimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Peso di recency a tempo di lettura (stile Generative Agents): decay^(ore trascorse).
 *  Eta negativa (createdAt nel futuro, es. clock di test) trattata come 0 -> peso 1.
 *  Deterministico dato (now, createdAt, decayPerHour). */
export function recencyWeight(now: number, createdAt: number, decayPerHour: number): number {
  const ageHours = Math.max(0, now - createdAt) / MS_PER_HOUR;
  return Math.pow(decayPerHour, ageHours);
}

export interface ContextAssemblerDeps {
  ledger: CanonLedger;
  summaries: SummaryStore;
  clock: Clock;
}

export interface ContextAssemblerConfig {
  /** Budget di token per il blocco di contesto assemblato (L1 + L1.5 + L2). I messaggi fissi
   *  (ruolo/regole/fase e azione del giocatore, spec 6.2 priorita 1 e 6) vivono fuori, in `ai`:
   *  il chiamante dimensiona questo budget di conseguenza. Stima approssimata: intestazioni di
   *  blocco e separatori non sono conteggiati -> tieni un piccolo margine (~10 token). */
  tokenBudget: number;
  /** Stima dei token di un testo. Default: euristica char/4. Porta iniettabile: l app puo
   *  fornire un tokenizer reale senza che `memory` acquisisca dipendenze. */
  estimateTokens?: (text: string) => number;
  /** Fattore di decadimento della recency per ora trascorsa, in (0,1]. Default 0.995 (stile
   *  Generative Agents, tarabile, spec 13). */
  recencyDecayPerHour?: number;
}

/** Soggetti in scena = id e nome di ogni attore presente in L1. Filtra L1.5 ai fatti su
 *  scena/PNG presenti (non tutto il mondo, spec 6.2). */
function sceneSubjects(state: GameState): Set<string> {
  const subjects = new Set<string>();
  for (const actor of Object.values(state.actors)) {
    subjects.add(actor.id);
    subjects.add(actor.name);
  }
  return subjects;
}

function renderL1(state: GameState): string {
  const actors = Object.values(state.actors).map((a) => {
    const res = Object.entries(a.resources).map(([k, p]) => `${k} ${p.current}/${p.max}`).join(', ');
    const attrs = Object.entries(a.attributes).map(([k, v]) => `${k} ${v}`).join(', ');
    const sk = Object.entries(a.skills).map(([k, v]) => `${k} ${v}`).join(', ');
    const parts = [
      res.length > 0 ? `risorse: ${res}` : '',
      attrs.length > 0 ? `attr: ${attrs}` : '',
      sk.length > 0 ? `abil: ${sk}` : '',
    ].filter((p) => p.length > 0);
    return `- ${a.name} (${a.kind}, id=${a.id})${parts.length > 0 ? `: ${parts.join(' | ')}` : ''}`;
  });
  const list = actors.length > 0 ? actors.join('\n') : '- (nessun attore)';
  const enc =
    state.encounter === null
      ? 'Nessuno scontro attivo.'
      : `Scontro ${state.encounter.id}: round ${state.encounter.round}, turno ${state.encounter.turnIndex}.`;
  const stateBlock = `Stato attuale (L1):\n${list}\n${enc}`;

  // Quest ATTIVE in L1 (spec 6: le quest sono fatti meccanici autorevoli). Solo se presenti, cosi
  // lo stato senza quest rende identico a prima. Le terminate escono: la loro conclusione e narrata
  // -> finisce in L1.5/L2 (F4). Fa parte di L1 (priorita 2), quindi mai tagliato dal budget.
  const activeQuests = Object.values(state.quests)
    .filter((q) => q.status === 'active')
    .sort((a, b) => byId(a.id, b.id));
  const questBlock =
    activeQuests.length > 0
      ? `Quest attive (L1):\n${activeQuests
          .map((q) => `- ${q.title} (id=${q.id})${q.description !== undefined ? `: ${q.description}` : ''}`)
          .join('\n')}`
      : '';

  return [stateBlock, questBlock].filter((b) => b.length > 0).join('\n\n');
}

function renderFact(f: CanonFact): string {
  return `- ${f.subject} ${f.predicate} ${f.object}`;
}

function renderSummary(s: Summary): string {
  return `- [${s.level}] ${s.text}`;
}

/** Tie-break stabile per id (determinismo a parita di chiave di ordinamento). */
function byId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Crea un Context Assembler (spec 6.2). `deps` chiude su ledger L1.5 (8a), store L2 (8b) e
 *  Clock (8b); `config` fissa budget, stima token e decadimento. Ritorna una funzione
 *  DETERMINISTICA dati (stato, contenuto degli store al momento della chiamata, clock.now()):
 *  rilegge gli store a ogni invocazione, quindi NON e memoizzabile per solo `state`. */
export function createContextAssembler(
  deps: ContextAssemblerDeps,
  config: ContextAssemblerConfig,
): (state: GameState) => string {
  const estimate = config.estimateTokens ?? defaultEstimateTokens;
  const decay = config.recencyDecayPerHour ?? 0.995;

  return (state: GameState): string => {
    // Priorita 2 — L1 stato rilevante (sempre incluso, mai tagliato).
    const l1 = renderL1(state);

    // Priorita 3 — L1.5 canon rilevante: fatti ATTIVI sui soggetti in scena (sempre inclusi).
    const subjects = sceneSubjects(state);
    const facts = deps.ledger.active().filter((f) => subjects.has(f.subject));
    const l15 = facts.length > 0 ? `Fatti canonici (L1.5):\n${facts.map(renderFact).join('\n')}` : '';

    // Costo dei blocchi fissi (L1 + L1.5): erode il budget per L2; MAI tagliati.
    const fixedTokens = [l1, l15].filter((b) => b.length > 0).reduce((sum, b) => sum + estimate(b), 0);
    const remaining = Math.max(0, config.tokenBudget - fixedTokens);

    // Priorita 4 — L2 narrativa recente: rankata per salienza x recency (decadimento sul
    // createdAt a tempo di lettura, Clock iniettato). Inclusa dal punteggio piu alto finche
    // c e budget; al primo riassunto che non entra ci si ferma (si taglia dal basso).
    const now = deps.clock.now();
    const ranked = deps.summaries
      .list()
      .map((s) => ({ s, score: s.salience * recencyWeight(now, s.createdAt, decay) }))
      .sort((a, b) => b.score - a.score || b.s.createdAt - a.s.createdAt || byId(a.s.id, b.s.id));

    const chosen: Summary[] = [];
    let used = 0;
    for (const { s } of ranked) {
      const cost = estimate(renderSummary(s));
      if (used + cost > remaining) break;
      chosen.push(s);
      used += cost;
    }
    // Render in ordine cronologico per leggibilita (la selezione resta per punteggio).
    chosen.sort((a, b) => a.createdAt - b.createdAt || byId(a.id, b.id));
    const l2 = chosen.length > 0 ? `Memoria recente (L2):\n${chosen.map(renderSummary).join('\n')}` : '';

    return [l1, l15, l2].filter((b) => b.length > 0).join('\n\n');
  };
}
