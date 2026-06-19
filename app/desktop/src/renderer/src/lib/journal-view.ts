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
 *  (Array.prototype.sort e stabile su Node) — a parita preserva l ordine d ingresso. */
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
